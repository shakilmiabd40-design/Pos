"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyRow } from "@/components/EmptyState";

type ApiKey = {
  id: string;
  name: string;
  apiKey: string;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy?: { name: string } | null;
};

export default function ApiKeysPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [justCreated, setJustCreated] = useState<{ apiKey: string; apiSecret: string; name: string } | null>(null);

  async function load() {
    setKeys(await api<ApiKey[]>("/api/api-keys"));
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give this key a name");
    setLoading(true);
    try {
      const created = await api<{ apiKey: string; apiSecret: string; name: string }>("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setJustCreated(created);
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(k: ApiKey) {
    try {
      await api(`/api/api-keys/${k.id}`, { method: "PUT", body: JSON.stringify({ active: !k.active }) });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this API key? Any client using it will stop working immediately."))) return;
    try {
      await api(`/api/api-keys/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">API keys</h1>
      <p className="text-sm text-ink/60 mb-6">
        Generate a key + secret pair for your website (or any other client) to call the public order/product/warranty
        API. Admin only.
      </p>

      {justCreated && (
        <div className="card mb-6 border-moss/40 bg-moss/5">
          <div className="text-sm font-medium text-ink mb-2">
            "{justCreated.name}" created — copy the secret now, it won't be shown again.
          </div>
          <div className="space-y-2">
            <div>
              <label className="label">X-API-Key</label>
              <div className="flex gap-2">
                <input className="input font-mono text-xs" readOnly value={justCreated.apiKey} />
                <button className="btn-secondary" onClick={() => copy(justCreated.apiKey)}>
                  Copy
                </button>
              </div>
            </div>
            <div>
              <label className="label">X-API-Secret</label>
              <div className="flex gap-2">
                <input className="input font-mono text-xs" readOnly value={justCreated.apiSecret} />
                <button className="btn-secondary" onClick={() => copy(justCreated.apiSecret)}>
                  Copy
                </button>
              </div>
            </div>
          </div>
          <button className="text-xs text-ink/50 hover:underline mt-3" onClick={() => setJustCreated(null)}>
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={onCreate} className="card mb-6 flex flex-wrap items-end gap-3">
        {error && <div className="w-full text-sm text-clay">{error}</div>}
        <div className="flex-1 min-w-[200px]">
          <label className="label">Key name</label>
          <input className="input" placeholder="e.g. Main website" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={loading}>
          {loading ? "Generating..." : "Generate new key"}
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>API Key</th>
              <th>Status</th>
              <th>Last used</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="font-mono text-xs">{k.apiKey}</td>
                <td>{k.active ? "Active" : "Disabled"}</td>
                <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</td>
                <td>{new Date(k.createdAt).toLocaleDateString()}</td>
                <td className="whitespace-nowrap">
                  <button className="text-moss text-xs mr-3 hover:underline" onClick={() => toggleActive(k)}>
                    {k.active ? "Disable" : "Enable"}
                  </button>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDelete(k.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <EmptyRow colSpan={6} icon="🔑" title="No API keys yet — generate one above." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
