"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyRow } from "@/components/EmptyState";

type Sale = {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string | null;
  items: {
    id: string;
    qty: number;
    unitPrice: number;
    variant: { size: string; product: { name: string } };
    returns?: { qty: number }[];
  }[];
};

type ReturnRow = {
  id: string;
  qty: number;
  reason: string | null;
  refundAmount: number;
  restocked: boolean;
  date: string;
  sale: { invoiceNo: string };
  saleItem: { variant: { size: string; product: { name: string } } };
};

export default function ReturnsPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [saleItemId, setSaleItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("0");
  const [restock, setRestock] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  async function loadAll() {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (category) qs.set("category", category);
    const [s, r] = await Promise.all([api<Sale[]>("/api/sales"), api<ReturnRow[]>(`/api/returns?${qs.toString()}`)]);
    setSales(s);
    setReturns(r);
  }

  useEffect(() => {
    loadAll();
    api<string[]>("/api/products/categories").then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matchingSales = useMemo(() => {
    if (!invoiceQuery) return [];
    const term = invoiceQuery.toLowerCase();
    return sales.filter((s) => s.invoiceNo.toLowerCase().includes(term) || (s.customerName || "").toLowerCase().includes(term)).slice(0, 5);
  }, [sales, invoiceQuery]);

  async function submitReturn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!saleItemId) return setError("Pick a sale item to return");
    try {
      await api("/api/returns", {
        method: "POST",
        body: JSON.stringify({ saleItemId, qty, reason, refundAmount, restock }),
      });
      setSaleItemId("");
      setQty("1");
      setReason("");
      setRefundAmount("0");
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this return record?"))) return;
    try {
      await api(`/api/returns/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Returns</h1>
      <p className="text-sm text-ink/60 mb-6">Customer returns against a past sale.</p>

      <form onSubmit={submitReturn} className="card mb-6 space-y-3">
        {error && <div className="text-sm text-clay">{error}</div>}
        <div>
          <label className="label">Find sale by invoice no. or customer name</label>
          <input className="input" value={invoiceQuery} onChange={(e) => setInvoiceQuery(e.target.value)} placeholder="INV-..." />
        </div>

        {matchingSales.length > 0 && (
          <div className="border border-line rounded-md divide-y divide-line">
            {matchingSales.map((s) => (
              <div key={s.id} className="p-2">
                <div className="text-xs text-ink/50 mb-1">
                  {s.invoiceNo} · {new Date(s.date).toLocaleDateString()} · {s.customerName || "walk-in"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.items.map((it) => {
                    const returned = (it.returns || []).reduce((a, r) => a + r.qty, 0);
                    const remaining = it.qty - returned;
                    return (
                      <button
                        type="button"
                        key={it.id}
                        disabled={remaining <= 0}
                        onClick={() => setSaleItemId(it.id)}
                        className={`text-xs border rounded-md px-2 py-1 ${
                          saleItemId === it.id ? "border-moss bg-moss/10" : "border-line"
                        } ${remaining <= 0 ? "opacity-40" : ""}`}
                      >
                        {it.variant.product.name} (size {it.variant.size}) · qty {it.qty} · returnable {remaining}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Return qty</label>
            <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label className="label">Refund amount (৳)</label>
            <input className="input" type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          Add returned item back to stock (uncheck if it's damaged)
        </label>

        <button className="btn-primary">Record return</button>
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
              <th>Invoice</th>
              <th>Product</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Refund</th>
              <th>Restocked</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.date).toLocaleDateString()}</td>
                <td>{r.sale.invoiceNo}</td>
                <td>{r.saleItem.variant.product.name}</td>
                <td>{r.saleItem.variant.size}</td>
                <td>{r.qty}</td>
                <td>৳{r.refundAmount}</td>
                <td>{r.restocked ? "Yes" : "No"}</td>
                <td>{r.reason || "-"}</td>
                <td>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDelete(r.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {returns.length === 0 && (
              <EmptyRow colSpan={9} icon="↩️" title="No returns yet." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
