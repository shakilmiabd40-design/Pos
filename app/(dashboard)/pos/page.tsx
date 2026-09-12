"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import BarcodeScannerButton from "@/components/BarcodeScanner";
import CustomerLookup from "@/components/CustomerLookup";
import { bdDateString } from "@/lib/bd-time";

type Variant = { id: string; size: string; sku: string; barcode: string | null; stock: number };
type Product = { id: string; name: string; sellPrice: number; variants: Variant[] };

// Flattened row used for search/cart — one per size.
type FlatVariant = { variantId: string; productName: string; size: string; sku: string; barcode: string | null; sellPrice: number; stock: number };

type CartLine = { variantId: string; qty: number; unitPrice: number; discount: number };

type SplitPayment = { method: string; amount: string };

type Sale = {
  id: string;
  invoiceNo: string;
  date: string;
  totalAmount: number;
  amountPaid: number;
  codStatus: string;
  customerName: string | null;
  items: { qty: number; unitPrice: number; variant: { size: string; product: { name: string } } }[];
};

export default function PosPage() {
  const showToast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [saleDate, setSaleDate] = useState(() => bdDateString());
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([{ method: "cash", amount: "" }]);
  const [isCod, setIsCod] = useState(false);
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);

  async function loadProducts() {
    setProducts(await api<Product[]>("/api/products"));
  }
  async function loadRecent() {
    const all = await api<Sale[]>("/api/sales");
    setRecentSales(all.slice(0, 8));
  }

  useEffect(() => {
    loadProducts();
    loadRecent();
  }, []);

  // Flatten product+sizes into one list of sellable variants.
  const flatVariants = useMemo<FlatVariant[]>(() => {
    return products.flatMap((p) =>
      p.variants
        .filter((v) => v.stock > 0)
        .map((v) => ({
          variantId: v.id,
          productName: p.name,
          size: v.size,
          sku: v.sku,
          barcode: v.barcode,
          sellPrice: p.sellPrice,
          stock: v.stock,
        }))
    );
  }, [products]);

  const filtered = useMemo(() => {
    if (!q) return flatVariants.slice(0, 9);
    const term = q.toLowerCase();
    return flatVariants.filter((v) => v.productName.toLowerCase().includes(term) || v.sku.toLowerCase().includes(term) || v.size.includes(term));
  }, [flatVariants, q]);

  function addToCart(v: FlatVariant) {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === v.variantId);
      if (existing) {
        return prev.map((l) => (l.variantId === v.variantId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { variantId: v.variantId, qty: 1, unitPrice: v.sellPrice, discount: 0 }];
    });
  }

  function handleScan(text: string) {
    const match = flatVariants.find((v) => v.barcode === text || v.sku === text);
    if (!match) {
      setError(`No item in stock matches scanned code "${text}"`);
      return;
    }
    addToCart(match);
    showToast(`Added ${match.productName} (size ${match.size})`, "success");
  }

  function updateQty(variantId: string, qty: number) {
    setCart((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, qty } : l)));
  }

  function updatePrice(variantId: string, unitPrice: number) {
    setCart((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, unitPrice } : l)));
  }

  function updateItemDiscount(variantId: string, discount: number) {
    setCart((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, discount } : l)));
  }

  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  function addSplitRow() {
    setSplitPayments((prev) => [...prev, { method: "cash", amount: "" }]);
  }
  function updateSplitRow(i: number, patch: Partial<SplitPayment>) {
    setSplitPayments((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removeSplitRow(i: number) {
    setSplitPayments((prev) => prev.filter((_, idx) => idx !== i));
  }

  const itemsSubtotal = cart.reduce((sum, l) => sum + Math.max(0, l.qty * l.unitPrice - (l.discount || 0)), 0);
  const subtotal = itemsSubtotal;
  const total = Math.max(0, subtotal - (Number(discount) || 0)) + (isCod ? Math.max(0, Number(deliveryCharge) || 0) : 0);
  const splitTotal = splitPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const effectivePaid = splitMode
    ? Math.min(splitTotal, total)
    : paidTouched
    ? Math.min(Math.max(Number(paidAmount) || 0, 0), total)
    : total;
  const due = Math.max(0, total - effectivePaid);

  function cartLabel(variantId: string) {
    const v = flatVariants.find((f) => f.variantId === variantId);
    return v ? `${v.productName} · size ${v.size}` : "";
  }

  async function checkout() {
    setError("");
    if (cart.length === 0) return setError("Cart is empty");
    if (isCod && !customerPhone) return setError("Customer phone is required for a COD order (needed for delivery/follow-up)");
    if (splitMode && !isCod && splitTotal <= 0) return setError("Add at least one payment amount, or turn off split payment");
    setLoading(true);
    try {
      const sale = await api<{ invoiceNo: string }>("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerPhone,
          paymentMethod,
          discount,
          items: cart,
          paidAmount: effectivePaid,
          payments: splitMode && !isCod ? splitPayments.filter((p) => Number(p.amount) > 0) : undefined,
          isCod,
          deliveryCharge,
          saleDate,
        }),
      });
      setLastInvoice(sale.invoiceNo);
      showToast(`Sale completed — invoice ${sale.invoiceNo}`, "success");
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount("0");
      setPaidAmount("");
      setPaidTouched(false);
      setSplitMode(false);
      setSplitPayments([{ method: "cash", amount: "" }]);
      setIsCod(false);
      setDeliveryCharge("0");
      setSaleDate(bdDateString());
      await loadProducts();
      await loadRecent();
    } catch (e: any) {
      setError(e.message);
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">POS — New sale</h1>
      <p className="text-sm text-ink/60 mb-6">Every sold pair automatically gets a 1-year warranty.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card mb-4">
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="Search product by name, size or SKU..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <BarcodeScannerButton onScan={handleScan} label="📷 Scan" />
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
              {filtered.map((v) => (
                <button
                  key={v.variantId}
                  onClick={() => addToCart(v)}
                  className="text-left border border-line rounded-md px-3 py-2 hover:border-moss hover:bg-paper"
                >
                  <div className="text-sm font-medium text-ink">{v.productName}</div>
                  <div className="text-xs text-ink/50">
                    size {v.size} · {v.sku}
                  </div>
                  <div className="text-xs text-ink/70 mt-1">
                    ৳{v.sellPrice} · stock {v.stock}
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="col-span-full text-sm text-ink/40 py-4">No matching sizes in stock.</div>}
            </div>
          </div>

          <div className="card">
            <div className="text-sm font-medium text-ink mb-3">Recent sales</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.invoiceNo}</td>
                    <td>{new Date(s.date).toLocaleString()}</td>
                    <td>{s.customerName || "-"}</td>
                    <td>
                      {s.items.map((it) => `${it.variant.product.name} (${it.variant.size})`).join(", ")} ·{" "}
                      {s.items.reduce((a, it) => a + it.qty, 0)} pair(s)
                    </td>
                    <td>
                      ৳{s.totalAmount.toLocaleString()}
                      {!["RETURNED", "REFUSED"].includes(s.codStatus) && s.totalAmount - s.amountPaid > 0 && (
                        <div className="text-xs text-clay">due ৳{(s.totalAmount - s.amountPaid).toLocaleString()}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card sticky top-6">
            <div className="text-sm font-medium text-ink mb-3">Cart</div>
            {error && <div className="text-sm text-clay mb-2">{error}</div>}
            {lastInvoice && (
              <div className="text-sm text-moss bg-moss/10 border border-moss/30 rounded-md px-3 py-2 mb-3">
                Sale completed — invoice {lastInvoice}
              </div>
            )}
            <div className="space-y-3 mb-4">
              {cart.map((l) => (
                <div key={l.variantId} className="border border-line rounded-md p-2">
                  <div className="text-sm text-ink">{cartLabel(l.variantId)}</div>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="number"
                      className="input w-16"
                      value={l.qty}
                      min={1}
                      onChange={(e) => updateQty(l.variantId, Number(e.target.value))}
                    />
                    <input
                      type="number"
                      className="input flex-1"
                      value={l.unitPrice}
                      onChange={(e) => updatePrice(l.variantId, Number(e.target.value))}
                    />
                    <button className="text-clay text-xs" onClick={() => removeLine(l.variantId)}>
                      ✕
                    </button>
                  </div>
                  <div className="mt-1">
                    <input
                      type="number"
                      className="input"
                      placeholder="Item discount (৳)"
                      min={0}
                      value={l.discount || ""}
                      onChange={(e) => updateItemDiscount(l.variantId, Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              ))}
              {cart.length === 0 && <div className="text-sm text-ink/40">Cart is empty. Click a size to add it.</div>}
            </div>

            <div className="space-y-2 mb-3">
              <div>
                <label className="label">Sale date</label>
                <input
                  className="input max-w-[160px]"
                  type="date"
                  value={saleDate}
                  max={bdDateString()}
                  onChange={(e) => setSaleDate(e.target.value)}
                />
                {saleDate !== bdDateString() && (
                  <div className="text-xs text-clay mt-1">Backdating this sale to {saleDate}.</div>
                )}
              </div>
              <CustomerLookup
                name={customerName}
                phone={customerPhone}
                onChangeName={setCustomerName}
                onChangePhone={setCustomerPhone}
                onSelect={(c) => {
                  setCustomerName(c.name);
                  setCustomerPhone(c.phone);
                }}
              />
              <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
              </select>
              <div>
                <label className="label">Discount (৳)</label>
                <input className="input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-ink/70 border border-line rounded-md px-2 py-1.5">
                <input type="checkbox" checked={isCod} onChange={(e) => setIsCod(e.target.checked)} />
                Cash on delivery (order pending, collect on delivery)
              </label>
              {isCod && (
                <div>
                  <label className="label">Delivery charge (৳)</label>
                  <input className="input" type="number" min="0" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} />
                  <p className="text-xs text-ink/50 mt-1">
                    Manage this order from the Sales page — mark it Delivered, Partial Delivered, or Refused once you know the outcome.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-between text-sm text-ink/70 mb-1">
              <span>Subtotal</span>
              <span>৳{subtotal.toLocaleString()}</span>
            </div>
            {isCod && Number(deliveryCharge) > 0 && (
              <div className="flex justify-between text-sm text-ink/70 mb-1">
                <span>Delivery charge</span>
                <span>৳{Number(deliveryCharge).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-medium text-ink mb-3">
              <span>Total</span>
              <span>৳{total.toLocaleString()}</span>
            </div>

            {!isCod && (
              <div className="mb-3">
                <label className="flex items-center gap-1.5 text-sm text-ink/70 border border-line rounded-md px-2 py-1.5 mb-2">
                  <input
                    type="checkbox"
                    checked={splitMode}
                    onChange={(e) => setSplitMode(e.target.checked)}
                  />
                  Split payment across multiple methods
                </label>

                {splitMode ? (
                  <div className="space-y-2">
                    {splitPayments.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <select className="input" value={p.method} onChange={(e) => updateSplitRow(i, { method: e.target.value })}>
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="bkash">bKash</option>
                          <option value="nagad">Nagad</option>
                        </select>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          placeholder="Amount"
                          value={p.amount}
                          onChange={(e) => updateSplitRow(i, { amount: e.target.value })}
                        />
                        {splitPayments.length > 1 && (
                          <button type="button" className="text-clay text-xs" onClick={() => removeSplitRow(i)}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="text-moss text-xs hover:underline" onClick={addSplitRow}>
                      + Add another method
                    </button>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-ink/60">Captured: ৳{Math.min(splitTotal, total).toLocaleString()}</span>
                      {due > 0 && <span className="text-clay">Due: ৳{due.toLocaleString()}</span>}
                    </div>
                  </div>
                ) : (
                  <>
                    <label className="label">Amount received now</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={paidTouched ? paidAmount : total}
                      onChange={(e) => {
                        setPaidTouched(true);
                        setPaidAmount(e.target.value);
                      }}
                    />
                    <div className="flex justify-between text-xs mt-1">
                      <button type="button" className="text-moss hover:underline" onClick={() => setPaidTouched(false)}>
                        Full payment
                      </button>
                      {due > 0 && <span className="text-clay">Due: ৳{due.toLocaleString()}</span>}
                    </div>
                  </>
                )}
              </div>
            )}

            <button className="btn-primary w-full" onClick={checkout} disabled={loading}>
              {loading
                ? "Processing..."
                : isCod
                ? "Record COD order (pending)"
                : due > 0
                ? `Complete sale (৳${due.toLocaleString()} due)`
                : "Complete sale"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
