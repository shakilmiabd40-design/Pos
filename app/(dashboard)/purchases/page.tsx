"use client";

import { useEffect, useState, Fragment } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { importFromExcel } from "@/lib/import-xlsx";
import { EmptyRow } from "@/components/EmptyState";

type Variant = { id: string; size: string; sku: string; stock: number };
type Product = { id: string; name: string; costPrice: number; variants: Variant[] };
type Supplier = { id: string; name: string };
type Line = { productId: string; variantId: string; qty: string; unitCost: string };

type Purchase = {
  id: string;
  invoiceNo: string | null;
  date: string;
  totalAmount: number;
  amountPaid: number;
  due: number;
  supplier: { name: string };
  items: { qty: number; unitCost: number; variant: { size: string; product: { name: string } } }[];
};

const emptyLine: Line = { productId: "", variantId: "", qty: "1", unitCost: "" };

export default function PurchasesPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [note, setNote] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [quickProductId, setQuickProductId] = useState("");
  const [quickChecked, setQuickChecked] = useState<Record<string, boolean>>({});
  const [quickQty, setQuickQty] = useState("");
  const [quickUnitCost, setQuickUnitCost] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkAdded, setBulkAdded] = useState(0);

  async function loadAll() {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (category) qs.set("category", category);
    const [p, s, pur] = await Promise.all([
      api<Product[]>("/api/products"),
      api<Supplier[]>("/api/suppliers"),
      api<Purchase[]>(`/api/purchases?${qs.toString()}`),
    ]);
    setProducts(p);
    setSuppliers(s);
    setPurchases(pur);
  }

  useEffect(() => {
    loadAll();
    api<string[]>("/api/products/categories").then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function onProductChange(i: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(i, { productId, variantId: "", unitCost: product ? String(product.costPrice) : "" });
  }

  const quickProduct = products.find((p) => p.id === quickProductId);
  const quickAllChecked =
    !!quickProduct && quickProduct.variants.length > 0 && quickProduct.variants.every((v) => quickChecked[v.id]);

  function onQuickProductChange(productId: string) {
    setQuickProductId(productId);
    const product = products.find((p) => p.id === productId);
    // Default to every size selected — uncheck the ones you don't want.
    const nextChecked: Record<string, boolean> = {};
    product?.variants.forEach((v) => {
      nextChecked[v.id] = true;
    });
    setQuickChecked(nextChecked);
    setQuickUnitCost(product ? String(product.costPrice) : "");
    setQuickQty("");
  }

  function toggleQuickSize(variantId: string) {
    setQuickChecked((prev) => ({ ...prev, [variantId]: !prev[variantId] }));
  }

  function toggleAllQuickSizes() {
    if (!quickProduct) return;
    const next = !quickAllChecked;
    const nextChecked: Record<string, boolean> = {};
    quickProduct.variants.forEach((v) => {
      nextChecked[v.id] = next;
    });
    setQuickChecked(nextChecked);
  }

  function addQuickSizesToLines() {
    if (!quickProduct) return;
    const selected = quickProduct.variants.filter((v) => quickChecked[v.id]);
    if (selected.length === 0) return setError("Tick at least one size to add");
    if (!quickQty || Number(quickQty) <= 0) return setError("Enter a quantity to apply to the selected sizes");
    setError("");
    const newLines: Line[] = selected.map((v) => ({
      productId: quickProduct.id,
      variantId: v.id,
      qty: quickQty,
      unitCost: quickUnitCost || String(quickProduct.costPrice),
    }));
    setLines((prev) => {
      const existing = prev.filter((l) => l.variantId); // drop the blank starter row
      return [...existing, ...newLines];
    });
    showToast(`Added ${newLines.length} size(s) of ${quickProduct.name}`, "success");
    setQuickProductId("");
    setQuickChecked({});
    setQuickQty("");
    setQuickUnitCost("");
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Flat lookup: SKU -> product+variant, across every product/size, for
  // matching bulk-entered rows.
  function findBySku(sku: string) {
    const clean = sku.trim();
    for (const p of products) {
      const v = p.variants.find((v) => v.sku.toLowerCase() === clean.toLowerCase());
      if (v) return { product: p, variant: v };
    }
    return null;
  }

  // Turns parsed {sku, qty, unitCost} rows into purchase lines, matching
  // each SKU against the loaded product catalog. Unmatched SKUs are
  // reported instead of silently dropped.
  function applyBulkRows(rows: { sku: string; qty: string; unitCost?: string }[]) {
    const errors: string[] = [];
    const newLines: Line[] = [];

    for (const row of rows) {
      if (!row.sku) continue;
      const match = findBySku(row.sku);
      if (!match) {
        errors.push(`${row.sku} — no matching product/size found`);
        continue;
      }
      const qty = Number(row.qty) || 0;
      if (qty <= 0) {
        errors.push(`${row.sku} — quantity must be greater than 0`);
        continue;
      }
      newLines.push({
        productId: match.product.id,
        variantId: match.variant.id,
        qty: String(qty),
        unitCost: row.unitCost && Number(row.unitCost) >= 0 ? String(row.unitCost) : String(match.product.costPrice),
      });
    }

    setBulkErrors(errors);
    setBulkAdded(newLines.length);
    if (newLines.length > 0) {
      setLines((prev) => {
        const existing = prev.filter((l) => l.variantId); // drop the blank starter row
        return [...existing, ...newLines];
      });
    }
  }

  function addBulkFromText() {
    const rows = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\t|,/).map((p) => p.trim());
        return { sku: parts[0] || "", qty: parts[1] || "0", unitCost: parts[2] };
      });
    applyBulkRows(rows);
  }

  async function onBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    try {
      const parsed = await importFromExcel(file);
      const rows = parsed.map((r) => {
        const get = (keys: string[]) => {
          for (const k of Object.keys(r)) {
            if (keys.includes(k.trim().toLowerCase())) return r[k];
          }
          return "";
        };
        return {
          sku: String(get(["sku"])),
          qty: String(get(["qty", "quantity"])),
          unitCost: String(get(["unitcost", "unit cost", "cost"])),
        };
      });
      applyBulkRows(rows);
    } catch (err: any) {
      setBulkErrors([`Could not read that file: ${err.message || "unknown error"}`]);
    }
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!supplierId) return setError("Choose a supplier");
    const items = lines
      .filter((l) => l.variantId && Number(l.qty) > 0)
      .map((l) => ({ variantId: l.variantId, qty: l.qty, unitCost: l.unitCost }));
    if (items.length === 0) return setError("Add at least one product + size line");

    setLoading(true);
    try {
      await api("/api/purchases", {
        method: "POST",
        body: JSON.stringify({ supplierId, invoiceNo, note, items, paidAmount: paidTouched ? paidAmount : total }),
      });
      setSupplierId("");
      setInvoiceNo("");
      setNote("");
      setPaidAmount("");
      setPaidTouched(false);
      setLines([{ ...emptyLine }]);
      setQuickProductId("");
      setQuickChecked({});
      setQuickQty("");
      setQuickUnitCost("");
      setBulkOpen(false);
      setBulkText("");
      setBulkErrors([]);
      setBulkAdded(0);
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this purchase? Stock added by it will be reversed."))) return;
    try {
      await api(`/api/purchases/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function submitPayment(id: string) {
    setError("");
    try {
      await api(`/api/purchases/${id}/payments`, { method: "POST", body: JSON.stringify({ amount: payAmount, method: payMethod }) });
      setPayingId(null);
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Purchases</h1>
      <p className="text-sm text-ink/60 mb-6">Stock in — buying from your suppliers, by product and size.</p>

      <form onSubmit={onSubmit} className="card mb-6 space-y-4">
        {error && <div className="text-sm text-clay">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Supplier</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Invoice / bill no.</label>
            <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="border border-line rounded-md p-3 bg-paper space-y-2">
          <div className="text-sm font-medium text-ink">Quick add: whole product, multiple sizes at once</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select className="input" value={quickProductId} onChange={(e) => onQuickProductChange(e.target.value)}>
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="number"
              min="0"
              placeholder="Quantity (each selected size)"
              value={quickQty}
              onChange={(e) => setQuickQty(e.target.value)}
              disabled={!quickProduct}
            />
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="Unit cost"
              value={quickUnitCost}
              onChange={(e) => setQuickUnitCost(e.target.value)}
              disabled={!quickProduct}
            />
          </div>

          {quickProduct && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-ink/70">
                <input type="checkbox" checked={quickAllChecked} onChange={toggleAllQuickSizes} />
                Select all sizes
              </label>
              <div className="flex flex-wrap gap-2">
                {quickProduct.variants.map((v) => (
                  <label
                    key={v.id}
                    className="flex items-center gap-1 text-sm border border-line rounded-md px-2 py-1 bg-surface"
                  >
                    <input type="checkbox" checked={!!quickChecked[v.id]} onChange={() => toggleQuickSize(v.id)} />
                    {v.size}
                  </label>
                ))}
              </div>
              <button type="button" className="btn-secondary" onClick={addQuickSizesToLines}>
                Add selected sizes to this purchase
              </button>
            </>
          )}
        </div>

        <div className="space-y-2">
          {lines.map((line, i) => {
            const product = products.find((p) => p.id === line.productId);
            return (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end border border-line rounded-md p-2 sm:border-0 sm:p-0">
                <div className="col-span-2 sm:col-span-4">
                  <label className="label">Product</label>
                  <select className="input" value={line.productId} onChange={(e) => onProductChange(i, e.target.value)}>
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className="label">Size</label>
                  <select className="input" value={line.variantId} onChange={(e) => updateLine(i, { variantId: e.target.value })} disabled={!product}>
                    <option value="">Select size</option>
                    {product?.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.size} ({v.sku})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Qty</label>
                  <input className="input" type="number" value={line.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Unit cost</label>
                  <input className="input" type="number" step="0.01" value={line.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} />
                </div>
                <div className="sm:col-span-1">
                  <button type="button" className="text-clay text-xs" onClick={() => removeLine(i)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={addLine}>
              + Add line
            </button>
            <button type="button" className="btn-secondary" onClick={() => setBulkOpen((v) => !v)}>
              {bulkOpen ? "Hide bulk add" : "Bulk add"}
            </button>
          </div>
          <div className="text-sm text-ink/70">
            Total: <span className="font-medium text-ink">৳{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="max-w-xs">
          <label className="label">Amount paid to supplier now (rest becomes due)</label>
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
          <button type="button" className="text-moss text-xs hover:underline mt-1" onClick={() => setPaidTouched(false)}>
            Full payment now
          </button>
        </div>

        {bulkOpen && (
          <div className="border border-line rounded-md p-3 space-y-3 bg-paper">
            <div className="text-sm font-medium text-ink">Bulk add by SKU</div>
            <p className="text-xs text-ink/60">
              Paste rows as <code>SKU, Qty, UnitCost</code> (unit cost optional — one per line, comma or tab
              separated), or upload an Excel/CSV file with columns <code>SKU</code>, <code>Qty</code>, and
              optionally <code>UnitCost</code>. Matched rows are added to the lines above — review before saving.
            </p>
            <textarea
              className="input font-mono text-xs"
              rows={5}
              placeholder={"SHOE-001-41, 10, 800\nSHOE-001-42, 5, 800\nSHOE-002-40, 20"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" onClick={addBulkFromText}>
                Add from text
              </button>
              <label className="btn-secondary cursor-pointer">
                Upload Excel/CSV
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onBulkFile} />
              </label>
            </div>
            {bulkAdded > 0 && bulkErrors.length === 0 && (
              <div className="text-sm text-moss">Added {bulkAdded} line(s) below — check quantities/costs, then Record purchase.</div>
            )}
            {bulkErrors.length > 0 && (
              <div className="text-sm text-clay space-y-1">
                <div>{bulkAdded > 0 ? `Added ${bulkAdded} line(s), but some rows had issues:` : "Couldn't add any rows:"}</div>
                {bulkErrors.map((e, i) => (
                  <div key={i}>• {e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <button className="btn-primary" disabled={loading}>
          {loading ? "Saving..." : "Record purchase"}
        </button>
      </form>

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary" onClick={loadAll}>
          Apply
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Invoice</th>
              <th>Items</th>
              <th>Total</th>
              <th>Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>{new Date(p.date).toLocaleDateString()}</td>
                  <td>{p.supplier.name}</td>
                  <td>{p.invoiceNo || "-"}</td>
                  <td>{p.items.map((it) => `${it.variant.product.name} (${it.variant.size}) x${it.qty}`).join(", ")}</td>
                  <td>৳{p.totalAmount.toLocaleString()}</td>
                  <td>{p.due > 0 ? <span className="text-clay">৳{p.due.toLocaleString()}</span> : "-"}</td>
                  <td className="whitespace-nowrap">
                    {p.due > 0 && (
                      <button
                        className="text-moss text-xs mr-3 hover:underline"
                        onClick={() => {
                          setPayingId(p.id);
                          setPayAmount(String(p.due));
                          setPayMethod("cash");
                        }}
                      >
                        Pay due
                      </button>
                    )}
                    <button className="text-clay text-xs hover:underline" onClick={() => onDelete(p.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
                {payingId === p.id && (
                  <tr>
                    <td colSpan={7} className="bg-paper">
                      <div className="flex flex-wrap items-end gap-2 py-2">
                        <div>
                          <label className="label">Amount</label>
                          <input className="input w-32" type="number" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                        </div>
                        <div>
                          <label className="label">Method</label>
                          <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                            <option value="bkash">bKash</option>
                            <option value="nagad">Nagad</option>
                          </select>
                        </div>
                        <button type="button" className="btn-primary" onClick={() => submitPayment(p.id)}>
                          Save payment
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setPayingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {purchases.length === 0 && (
              <EmptyRow colSpan={7} icon="📦" title="No purchases yet." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
