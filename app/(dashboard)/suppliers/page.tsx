"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyRow } from "@/components/EmptyState";

type Supplier = { id: string; name: string; phone: string | null; address: string | null; notes: string | null; due: number };

const empty = { name: "", phone: "", address: "", notes: "" };

export default function SuppliersPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setSuppliers(await api<Supplier[]>("/api/suppliers"));
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api(`/api/suppliers/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await api(`/api/suppliers`, { method: "POST", body: JSON.stringify(form) });
      }
      setForm(empty);
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this supplier?"))) return;
    try {
      await api(`/api/suppliers/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Suppliers</h1>
      <p className="text-sm text-ink/60 mb-6">Vendors you buy shoes from.</p>
      <p className="text-xs text-ink/50 -mt-4 mb-6">Outstanding dues are paid off per-purchase from the Purchases page.</p>

      <form onSubmit={onSubmit} className="card mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {error && <div className="col-span-full text-sm text-clay">{error}</div>}
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
          <button className="btn-primary">{editingId ? "Save changes" : "Add supplier"}</button>
          {editingId && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditingId(null);
                setForm(empty);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Notes</th>
              <th>Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.phone || "-"}</td>
                <td>{s.address || "-"}</td>
                <td>{s.notes || "-"}</td>
                <td>{s.due > 0 ? <span className="text-clay">৳{s.due.toLocaleString()}</span> : "-"}</td>
                <td className="whitespace-nowrap">
                  <button
                    className="text-moss text-xs mr-3 hover:underline"
                    onClick={() => {
                      setEditingId(s.id);
                      setForm({ name: s.name, phone: s.phone || "", address: s.address || "", notes: s.notes || "" });
                    }}
                  >
                    Edit
                  </button>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDelete(s.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <EmptyRow colSpan={6} icon="🚚" title="No suppliers yet." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
