"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";

type Settings = { shopName: string; address: string | null; phone: string | null; email: string | null };

export default function SettingsPage() {
  const [form, setForm] = useState<Settings>({ shopName: "", address: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Settings>("/api/settings").then((s) =>
      setForm({ shopName: s.shopName, address: s.address || "", phone: s.phone || "", email: s.email || "" })
    );
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Shop settings</h1>
      <p className="text-sm text-ink/60 mb-6">
        Your shop's name, address and contact — shown on printed receipts/invoices.
      </p>

      <form onSubmit={onSubmit} className="card max-w-lg space-y-4">
        {error && <div className="text-sm text-clay">{error}</div>}
        {saved && <div className="text-sm text-moss">Saved.</div>}
        <div>
          <label className="label">Shop name</label>
          <input className="input" required value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <button className="btn-primary" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
