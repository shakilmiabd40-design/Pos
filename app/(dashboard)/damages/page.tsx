"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyRow } from "@/components/EmptyState";

type Variant = { id: string; size: string; sku: string; stock: number };
type Product = { id: string; name: string; variants: Variant[] };
type Damage = {
  id: string;
  qty: number;
  reason: string | null;
  date: string;
  variant: { size: string; sku: string; product: { name: string } };
};

export default function DamagesPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [damages, setDamages] = useState<Damage[]>([]);
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
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
    const [p, d] = await Promise.all([
      api<Product[]>("/api/products"),
      api<Damage[]>(`/api/damages?${qs.toString()}`),
    ]);
    setProducts(p);
    setDamages(d);
  }

  useEffect(() => {
    loadAll();
    api<string[]>("/api/products/categories").then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProduct = products.find((p) => p.id === productId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!variantId) return setError("Choose a product and size");
    try {
      await api("/api/damages", { method: "POST", body: JSON.stringify({ variantId, qty, reason }) });
      setProductId("");
      setVariantId("");
      setQty("1");
      setReason("");
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this damage record? Stock will be restored."))) return;
    try {
      await api(`/api/damages/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Damage</h1>
      <p className="text-sm text-ink/60 mb-6">Write off stock that's damaged and can't be sold, by product and size.</p>

      <form onSubmit={onSubmit} className="card mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        {error && <div className="col-span-full text-sm text-clay">{error}</div>}
        <div>
          <label className="label">Product</label>
          <select
            className="input"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setVariantId("");
            }}
          >
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Size</label>
          <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!selectedProduct}>
            <option value="">Select size</option>
            {selectedProduct?.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.size} ({v.sku}) — stock {v.stock}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Qty damaged</label>
          <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <label className="label">Reason</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. torn during transport" />
        </div>
        <div className="md:col-span-4">
          <button className="btn-primary">Record damage</button>
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
              <th>Product</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {damages.map((d) => (
              <tr key={d.id}>
                <td>{new Date(d.date).toLocaleDateString()}</td>
                <td>
                  {d.variant.product.name} <span className="text-xs text-ink/50">({d.variant.sku})</span>
                </td>
                <td>{d.variant.size}</td>
                <td>{d.qty}</td>
                <td>{d.reason || "-"}</td>
                <td>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDelete(d.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {damages.length === 0 && (
              <EmptyRow colSpan={6} icon="💥" title="No damage recorded." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
