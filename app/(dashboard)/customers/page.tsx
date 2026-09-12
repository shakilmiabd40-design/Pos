"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { exportToExcel } from "@/lib/export-xlsx";
import { EmptyRow } from "@/components/EmptyState";

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
  visits: number;
  totalSpent: number;
  totalDue: number;
  codReturnCount: number;
  isRisk: boolean;
  lastVisit: string | null;
};

type CustomerDetail = Customer & {
  sales: {
    id: string;
    invoiceNo: string;
    date: string;
    totalAmount: number;
    due: number;
    items: { qty: number; variant: { size: string; product: { name: string } } }[];
  }[];
};

const emptyForm = { name: "", phone: "", address: "", notes: "" };

export default function CustomersPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  async function load(query = "") {
    setCustomers(await api<Customer[]>(`/api/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`));
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api(`/api/customers/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await api(`/api/customers`, { method: "POST", body: JSON.stringify(form) });
      }
      setForm(emptyForm);
      setEditingId(null);
      await load(q);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm({ name: c.name, phone: c.phone, address: c.address || "", notes: c.notes || "" });
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this customer profile?"))) return;
    try {
      await api(`/api/customers/${id}`, { method: "DELETE" });
      await load(q);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function viewHistory(id: string) {
    setDetail(await api<CustomerDetail>(`/api/customers/${id}`));
  }

  function exportRows() {
    exportToExcel(
      "customers.xlsx",
      customers.map((c) => ({
        Name: c.name,
        Phone: c.phone,
        Address: c.address || "",
        Visits: c.visits,
        "Total spent": c.totalSpent,
        "Current due": c.totalDue,
        "COD returns": c.codReturnCount,
        Risk: c.isRisk ? "Yes" : "",
        "Last visit": c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : "",
      }))
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Customers</h1>
      <p className="text-sm text-ink/60 mb-6">
        Built automatically from sales (by phone number) — add or edit profiles here too.
      </p>

      <form onSubmit={onSubmit} className="card mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        {error && <div className="col-span-full text-sm text-clay">{error}</div>}
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" required disabled={!!editingId} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="col-span-full flex gap-2">
          <button className="btn-primary">{editingId ? "Save changes" : "Add customer"}</button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name or phone..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
        />
        <button className="btn-secondary" onClick={() => load(q)}>
          Search
        </button>
        <button className="btn-secondary ml-auto" onClick={exportRows}>
          Export Excel
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Visits</th>
              <th>Total spent</th>
              <th>Due</th>
              <th>COD returns</th>
              <th>Last visit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {c.isRisk && (
                    <span className="ml-2 text-xs text-clay border border-clay/40 rounded px-1.5 py-0.5" title="Frequently returns/refuses COD orders">
                      ⚠ Risk
                    </span>
                  )}
                </td>
                <td>{c.phone}</td>
                <td>{c.visits}</td>
                <td>৳{c.totalSpent.toLocaleString()}</td>
                <td className={c.totalDue > 0 ? "text-clay font-medium" : ""}>৳{c.totalDue.toLocaleString()}</td>
                <td className={c.codReturnCount > 0 ? "text-clay" : ""}>{c.codReturnCount}</td>
                <td>{c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : "-"}</td>
                <td className="whitespace-nowrap">
                  <button className="text-moss text-xs mr-3 hover:underline" onClick={() => viewHistory(c.id)}>
                    History
                  </button>
                  <button className="text-moss text-xs mr-3 hover:underline" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDelete(c.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <EmptyRow colSpan={8} icon="🧑‍🤝‍🧑" title="No customers yet." />
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setDetail(null)}>
          <div className="bg-surface rounded-md max-w-lg w-full max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-serif text-ink">{detail.name}</div>
              <button className="text-ink/50 text-sm" onClick={() => setDetail(null)}>
                ✕
              </button>
            </div>
            <div className="text-xs text-ink/50 mb-4">{detail.phone} {detail.address ? `· ${detail.address}` : ""}</div>
            <div className="space-y-3">
              {detail.sales.map((s) => (
                <div key={s.id} className="border border-line rounded-md p-2 text-sm">
                  <div className="flex justify-between">
                    <span>{s.invoiceNo}</span>
                    <span>৳{s.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-ink/50">{new Date(s.date).toLocaleString()}</div>
                  <div className="text-xs text-ink/60">
                    {s.items.map((it) => `${it.variant.product.name} (${it.variant.size}) x${it.qty}`).join(", ")}
                  </div>
                  {s.due > 0 && <div className="text-xs text-clay">due ৳{s.due.toLocaleString()}</div>}
                </div>
              ))}
              {detail.sales.length === 0 && <div className="text-sm text-ink/40">No purchases yet.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
