"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { exportToExcel } from "@/lib/export-xlsx";

import { bdDateString } from "@/lib/bd-time";
import { EmptyRow } from "@/components/EmptyState";

type Expense = {
  id: string;
  category: string;
  amount: number;
  method: string;
  note: string | null;
  date: string;
  createdBy?: { name: string } | null;
};

function emptyForm() {
  return { category: "", amount: "", method: "cash", note: "", date: bdDateString() };
}
const COMMON_CATEGORIES = ["Rent", "Electricity", "Staff salary", "Transport", "Maintenance", "Other"];

export default function ExpensesPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    setExpenses(await api<Expense[]>(`/api/expenses?${qs.toString()}`));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api(`/api/expenses/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await api(`/api/expenses`, { method: "POST", body: JSON.stringify(form) });
      }
      setForm(emptyForm());
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function startEdit(e: Expense) {
    setEditingId(e.id);
    setForm({ category: e.category, amount: String(e.amount), method: e.method, note: e.note || "", date: bdDateString(new Date(e.date)) });
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this expense?"))) return;
    try {
      await api(`/api/expenses/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  function exportRows() {
    exportToExcel(
      "expenses.xlsx",
      expenses.map((e) => ({
        Date: new Date(e.date).toLocaleDateString(),
        Category: e.category,
        Amount: e.amount,
        Method: e.method,
        Note: e.note || "",
        By: e.createdBy?.name || "",
      }))
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Expenses</h1>
      <p className="text-sm text-ink/60 mb-6">Shop running costs — rent, electricity, salary, transport, etc.</p>

      <form onSubmit={onSubmit} className="card mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        {error && <div className="col-span-full text-sm text-clay">{error}</div>}
        <div>
          <label className="label">Category</label>
          <input className="input" list="expense-categories" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="expense-categories">
            {COMMON_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">Amount (৳)</label>
          <input className="input" type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label className="label">Method</label>
          <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="bkash">bKash</option>
            <option value="card">Card</option>
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div>
          <label className="label">Note</label>
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="col-span-full flex gap-2">
          <button className="btn-primary">{editingId ? "Save changes" : "Add expense"}</button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>
              Cancel
            </button>
          )}
        </div>
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
        <button className="btn-secondary" onClick={load}>
          Apply
        </button>
        <div className="ml-auto text-sm text-ink/70">
          Total: <span className="font-medium text-ink">৳{total.toLocaleString()}</span>
        </div>
        <button className="btn-secondary" onClick={exportRows}>
          Export Excel
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.date).toLocaleDateString()}</td>
                <td>{e.category}</td>
                <td>৳{e.amount.toLocaleString()}</td>
                <td>{e.method}</td>
                <td>{e.note || "-"}</td>
                <td className="whitespace-nowrap">
                  <button className="text-moss text-xs mr-3 hover:underline" onClick={() => startEdit(e)}>
                    Edit
                  </button>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDelete(e.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <EmptyRow colSpan={6} icon="🧾" title="No expenses recorded." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
