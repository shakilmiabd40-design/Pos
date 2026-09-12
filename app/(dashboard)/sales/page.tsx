"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { exportToExcel } from "@/lib/export-xlsx";

type SaleListRow = {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string;
  discount: number;
  totalAmount: number;
  amountPaid: number;
  deliveryCharge: number;
  codStatus: "PENDING" | "SHIPPED" | "DELIVERED" | "RETURNED" | "REFUSED";
  source: "POS" | "WEBSITE";
  items: { qty: number; unitPrice: number; subtotal: number; variant: { size: string; product: { name: string } } }[];
};

type SaleDetail = Omit<SaleListRow, "items"> & {
  items: (SaleListRow["items"][number] & { warranty?: { endDate: string } })[];
};

type Settings = { shopName: string; address: string | null; phone: string | null; email: string | null };

const editEmpty = { customerName: "", customerPhone: "", paymentMethod: "cash", discount: "0", deliveryCharge: "0" };

const codStatusColor: Record<string, string> = {
  PENDING: "text-ink/60",
  SHIPPED: "text-ink",
  DELIVERED: "text-moss",
  RETURNED: "text-clay",
  REFUSED: "text-clay",
};

// Display label only — the underlying codStatus value in the database
// stays "RETURNED" (so nothing else needs to change), this just renames
// how it reads on screen.
const codStatusLabel: Record<string, string> = {
  PENDING: "Pending",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  RETURNED: "Partial Delivered",
  REFUSED: "Refused",
};

// Cancelled COD orders (returned/refused) never really completed, so they
// shouldn't show a lingering "due" balance.
function dueOf(sale: { totalAmount: number; amountPaid: number; codStatus: string }) {
  if (["RETURNED", "REFUSED"].includes(sale.codStatus)) return 0;
  return Math.max(0, sale.totalAmount - sale.amountPaid);
}

export default function SalesPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [sales, setSales] = useState<SaleListRow[]>([]);
  const [q, setQ] = useState("");
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [showPendingCodOnly, setShowPendingCodOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(editEmpty);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [error, setError] = useState("");
  const [printData, setPrintData] = useState<{ sale: SaleDetail; settings: Settings } | null>(null);

  async function load() {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (category) qs.set("category", category);
    setSales(await api<SaleListRow[]>(`/api/sales?${qs.toString()}`));
  }

  useEffect(() => {
    load();
    api<string[]>("/api/products/categories").then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = sales
    .filter((s) => (showDueOnly ? dueOf(s) > 0.01 : true))
    .filter((s) => (showPendingCodOnly ? ["PENDING", "SHIPPED"].includes(s.codStatus) : true))
    .filter((s) => {
      if (!q) return true;
      const term = q.toLowerCase();
      return s.invoiceNo.toLowerCase().includes(term) || (s.customerName || "").toLowerCase().includes(term) || (s.customerPhone || "").includes(term);
    });

  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnCost, setReturnCost] = useState("");

  function startReturnPrompt(s: SaleListRow) {
    setReturningId(s.id);
    setReturnCost(String(s.deliveryCharge || 0));
  }

  async function confirmReturn() {
    if (!returningId) return;
    try {
      await api(`/api/sales/${returningId}/cod-status`, {
        method: "PUT",
        body: JSON.stringify({ status: "RETURNED", actualReturnCost: returnCost }),
      });
      setReturningId(null);
      setReturnCost("");
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  // Refused = the customer never accepted it at the doorstep, so no money
  // ever changed hands — there's nothing to enter an amount for, just
  // confirm and the full delivery charge is booked as a loss.
  async function markRefused(s: SaleListRow) {
    if (!(await askConfirm("Mark this order as refused? Nothing was collected, so stock will be restored and the delivery charge will be booked as a loss."))) {
      return;
    }
    try {
      await api(`/api/sales/${s.id}/cod-status`, { method: "PUT", body: JSON.stringify({ status: "REFUSED" }) });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [courierCharge, setCourierCharge] = useState("");

  // If this order actually has a delivery charge on it, ask what the
  // courier deducted for making the delivery (defaults to the full charge
  // — edit it down if the courier's cut was actually less). If there's no
  // delivery charge at all, there's nothing to ask, so just confirm and go.
  async function startDeliverPrompt(s: SaleListRow) {
    if (s.deliveryCharge > 0) {
      setDeliveringId(s.id);
      setCourierCharge(String(s.deliveryCharge));
      return;
    }
    if (!(await askConfirm("Mark this order as delivered? This will record it as fully paid."))) return;
    try {
      await api(`/api/sales/${s.id}/cod-status`, { method: "PUT", body: JSON.stringify({ status: "DELIVERED" }) });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function confirmDeliver() {
    if (!deliveringId) return;
    try {
      await api(`/api/sales/${deliveringId}/cod-status`, {
        method: "PUT",
        body: JSON.stringify({ status: "DELIVERED", courierCharge }),
      });
      setDeliveringId(null);
      setCourierCharge("");
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function markShipped(s: SaleListRow) {
    if (!(await askConfirm("Mark this order as shipped (handed to courier)?"))) return;
    try {
      await api(`/api/sales/${s.id}/cod-status`, { method: "PUT", body: JSON.stringify({ status: "SHIPPED" }) });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  const totalDue = sales.reduce((sum, s) => sum + dueOf(s), 0);

  function startEdit(s: SaleListRow) {
    setEditingId(s.id);
    setPayingId(null);
    setEditForm({
      customerName: s.customerName || "",
      customerPhone: s.customerPhone || "",
      paymentMethod: s.paymentMethod,
      discount: String(s.discount),
      deliveryCharge: String(s.deliveryCharge),
    });
  }

  async function saveEdit(id: string) {
    setError("");
    try {
      await api(`/api/sales/${id}`, { method: "PUT", body: JSON.stringify(editForm) });
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this sale? Stock will be restored. This is blocked if the sale already has returns recorded."))) return;
    try {
      await api(`/api/sales/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function onPrint(id: string) {
    const [sale, settings] = await Promise.all([
      api<SaleDetail>(`/api/sales/${id}`),
      api<Settings>("/api/settings"),
    ]);
    setPrintData({ sale, settings });
    setTimeout(() => window.print(), 150);
  }

  function startPayment(s: SaleListRow) {
    setPayingId(s.id);
    setEditingId(null);
    setPayAmount(String(dueOf(s)));
    setPayMethod("cash");
  }

  async function submitPayment(id: string) {
    setError("");
    try {
      await api(`/api/sales/${id}/payments`, { method: "POST", body: JSON.stringify({ amount: payAmount, method: payMethod }) });
      setPayingId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function exportRows() {
    exportToExcel(
      "sales.xlsx",
      filtered.map((s) => ({
        Invoice: s.invoiceNo,
        Date: new Date(s.date).toLocaleString(),
        Customer: s.customerName || "walk-in",
        Phone: s.customerPhone || "",
        Items: s.items.map((it) => `${it.variant.product.name} (${it.variant.size}) x${it.qty}`).join(", "),
        Total: s.totalAmount,
        Paid: s.amountPaid,
        Due: dueOf(s),
        Payment: s.paymentMethod,
        Source: s.source,
        "COD status": s.codStatus !== "DELIVERED" || s.deliveryCharge > 0 ? codStatusLabel[s.codStatus] || s.codStatus : "",
        "Delivery charge": s.deliveryCharge,
      }))
    );
  }

  return (
    <div>
      <div className="print:hidden">
        <h1 className="text-2xl font-serif text-ink mb-1">Sales</h1>
        <p className="text-sm text-ink/60 mb-6">All past sales — edit customer/payment details, record due payments, delete, or print a receipt.</p>

        {error && <div className="text-sm text-clay mb-3">{error}</div>}

        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="label">Search</label>
            <input
              className="input max-w-xs"
              placeholder="Invoice, customer name or phone..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
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
          <button className="btn-secondary" onClick={load}>
            Apply
          </button>
          <label className="flex items-center gap-1.5 text-sm text-ink/70 border border-line rounded-md px-2 py-1.5">
            <input type="checkbox" checked={showDueOnly} onChange={(e) => setShowDueOnly(e.target.checked)} />
            Show only sales with due
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink/70 border border-line rounded-md px-2 py-1.5">
            <input type="checkbox" checked={showPendingCodOnly} onChange={(e) => setShowPendingCodOnly(e.target.checked)} />
            Show only outstanding COD orders (pending/shipped)
          </label>
          {totalDue > 0 && (
            <span className="text-sm text-clay">Total outstanding due: ৳{totalDue.toLocaleString()}</span>
          )}
          <button className="btn-secondary ml-auto" onClick={exportRows}>
            Export Excel
          </button>
        </div>

        <div className="space-y-3">
          {filtered.map((s) => {
            const due = dueOf(s);
            return (
              <div key={s.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {s.invoiceNo} <span className="text-xs text-ink/50">· {s.source}</span>
                    </div>
                    <div className="text-xs text-ink/50">
                      {new Date(s.date).toLocaleString()} · {s.customerName || "walk-in"} {s.customerPhone ? `(${s.customerPhone})` : ""}
                    </div>
                    <div className="text-xs text-ink/60 mt-1">
                      {s.items.map((it) => `${it.variant.product.name} (${it.variant.size}) x${it.qty}`).join(", ")}
                    </div>
                    {(s.codStatus !== "DELIVERED" || s.deliveryCharge > 0) && (
                      <div className="text-xs mt-1">
                        <span className={codStatusColor[s.codStatus]}>{codStatusLabel[s.codStatus] || s.codStatus}</span>
                        {s.deliveryCharge > 0 && <span className="text-ink/40"> · delivery ৳{s.deliveryCharge}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right">
                      <div className="text-base font-medium text-ink">৳{s.totalAmount.toLocaleString()}</div>
                      {due > 0 && <div className="text-xs text-clay">due ৳{due.toLocaleString()}</div>}
                    </div>
                    {s.codStatus === "PENDING" && (
                      <button className="text-ink text-xs hover:underline" onClick={() => markShipped(s)}>
                        Mark shipped
                      </button>
                    )}
                    {["PENDING", "SHIPPED"].includes(s.codStatus) && (
                      <>
                        <button className="text-moss text-xs hover:underline" onClick={() => startDeliverPrompt(s)}>
                          Mark delivered
                        </button>
                        <button className="text-clay text-xs hover:underline" onClick={() => startReturnPrompt(s)}>
                          Partial Delivered
                        </button>
                        <button className="text-clay text-xs hover:underline" onClick={() => markRefused(s)}>
                          Refused
                        </button>
                      </>
                    )}
                    {due > 0 && (
                      <button className="text-moss text-xs hover:underline" onClick={() => startPayment(s)}>
                        Record payment
                      </button>
                    )}
                    <button className="text-moss text-xs hover:underline" onClick={() => onPrint(s.id)}>
                      Print
                    </button>
                    <button className="text-moss text-xs hover:underline" onClick={() => startEdit(s)}>
                      Edit
                    </button>
                    <button className="text-clay text-xs hover:underline" onClick={() => onDelete(s.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                {payingId === s.id && (
                  <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-end gap-3">
                    <div>
                      <label className="label">Amount received</label>
                      <input className="input w-32" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
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
                    <button className="btn-primary" onClick={() => submitPayment(s.id)}>
                      Save payment
                    </button>
                    <button className="btn-secondary" onClick={() => setPayingId(null)}>
                      Cancel
                    </button>
                  </div>
                )}

                {deliveringId === s.id && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <div className="text-sm text-ink/70 mb-2">
                      Customer was charged ৳{s.deliveryCharge.toLocaleString()} for delivery. How much did the courier actually
                      charge/deduct for delivering it?
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="label">Courier's actual charge</label>
                        <input className="input w-32" type="number" min="0" value={courierCharge} onChange={(e) => setCourierCharge(e.target.value)} />
                      </div>
                      <button className="btn-primary" onClick={confirmDeliver}>
                        Confirm delivered
                      </button>
                      <button className="btn-secondary" onClick={() => setDeliveringId(null)}>
                        Cancel
                      </button>
                    </div>
                    <div className="text-xs text-ink/50 mt-2">
                      {Number(courierCharge) > 0
                        ? `This will be booked as a ৳${Number(courierCharge).toLocaleString()} courier charge (expense), on top of the item cost already counted.`
                        : "No courier charge will be booked — you can still add it later from Expenses if needed."}
                    </div>
                  </div>
                )}

                {returningId === s.id && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <div className="text-sm text-ink/70 mb-2">
                      Delivery charge for this order was ৳{s.deliveryCharge.toLocaleString()}. How much did the return actually
                      cost (what the courier charged, or what came back)?
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="label">Actual return cost</label>
                        <input className="input w-32" type="number" min="0" value={returnCost} onChange={(e) => setReturnCost(e.target.value)} />
                      </div>
                      <button className="btn-primary" onClick={confirmReturn}>
                        Confirm partial delivered
                      </button>
                      <button className="btn-secondary" onClick={() => setReturningId(null)}>
                        Cancel
                      </button>
                    </div>
                    <div className="text-xs text-ink/50 mt-2">
                      {Number(returnCost) < s.deliveryCharge
                        ? `This will be booked as a ৳${(s.deliveryCharge - Number(returnCost || 0)).toLocaleString()} loss.`
                        : Number(returnCost) > s.deliveryCharge
                        ? `This will be booked as a ৳${(Number(returnCost) - s.deliveryCharge).toLocaleString()} gain.`
                        : "No loss or gain — this matches the delivery charge exactly."}
                    </div>
                  </div>
                )}

                {editingId === s.id && (
                  <div className="mt-3 pt-3 border-t border-line grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="label">Customer name</label>
                      <input className="input" value={editForm.customerName} onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Customer phone</label>
                      <input className="input" value={editForm.customerPhone} onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Payment method</label>
                      <select className="input" value={editForm.paymentMethod} onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="bkash">bKash</option>
                        <option value="nagad">Nagad</option>
                        <option value="online">Online</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Discount (৳)</label>
                      <input className="input" type="number" value={editForm.discount} onChange={(e) => setEditForm({ ...editForm, discount: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Delivery charge (৳)</label>
                      <input className="input" type="number" min="0" value={editForm.deliveryCharge} onChange={(e) => setEditForm({ ...editForm, deliveryCharge: e.target.value })} />
                    </div>
                    <div className="col-span-full flex gap-2">
                      <button className="btn-primary" onClick={() => saveEdit(s.id)}>
                        Save
                      </button>
                      <button className="btn-secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="card">
              <EmptyState icon="🧾" title="No sales found" hint="Try widening your date range or clearing the search/filter." />
            </div>
          )}
        </div>
      </div>

      {/* Print-only receipt — hidden on screen, shown only when printing. */}
      <div className="hidden print:block p-6 text-black">
        {printData && <Receipt sale={printData.sale} settings={printData.settings} />}
      </div>
    </div>
  );
}

function Receipt({ sale, settings }: { sale: SaleDetail; settings: Settings }) {
  const due = dueOf(sale);
  return (
    <div className="max-w-md mx-auto text-sm">
      <div className="text-center mb-4">
        <div className="text-lg font-bold">{settings.shopName}</div>
        {settings.address && <div>{settings.address}</div>}
        {settings.phone && <div>Phone: {settings.phone}</div>}
        {settings.email && <div>{settings.email}</div>}
      </div>
      <hr className="my-2" />
      <div className="flex justify-between">
        <span>Invoice:</span>
        <span>{sale.invoiceNo}</span>
      </div>
      <div className="flex justify-between">
        <span>Date:</span>
        <span>{new Date(sale.date).toLocaleString()}</span>
      </div>
      {sale.customerName && (
        <div className="flex justify-between">
          <span>Customer:</span>
          <span>{sale.customerName}</span>
        </div>
      )}
      {sale.customerPhone && (
        <div className="flex justify-between">
          <span>Phone:</span>
          <span>{sale.customerPhone}</span>
        </div>
      )}
      <hr className="my-2" />
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th>Item</th>
            <th>Size</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i}>
              <td>{it.variant.product.name}</td>
              <td>{it.variant.size}</td>
              <td>{it.qty}</td>
              <td>৳{it.unitPrice}</td>
              <td>৳{it.subtotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2" />
      <div className="flex justify-between">
        <span>Discount:</span>
        <span>৳{sale.discount}</span>
      </div>
      {sale.deliveryCharge > 0 && (
        <div className="flex justify-between">
          <span>Delivery charge:</span>
          <span>৳{sale.deliveryCharge}</span>
        </div>
      )}
      <div className="flex justify-between font-bold">
        <span>Total:</span>
        <span>৳{sale.totalAmount}</span>
      </div>
      <div className="flex justify-between">
        <span>Paid:</span>
        <span>৳{sale.amountPaid}</span>
      </div>
      {due > 0 && (
        <div className="flex justify-between font-bold">
          <span>Due:</span>
          <span>৳{due}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>Payment:</span>
        <span>{sale.paymentMethod}</span>
      </div>
      <hr className="my-2" />
      <div className="text-xs">
        <div className="font-medium mb-1">Warranty (1 year from sale date):</div>
        {sale.items.map((it, i) => (
          <div key={i}>
            {it.variant.product.name} ({it.variant.size}): valid till{" "}
            {it.warranty ? new Date(it.warranty.endDate).toLocaleDateString() : "-"}
          </div>
        ))}
      </div>
      <div className="text-center text-xs mt-4">Thank you for your purchase!</div>
    </div>
  );
}
