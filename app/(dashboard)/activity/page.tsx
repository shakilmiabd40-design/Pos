"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyRow } from "@/components/EmptyState";

type LogEntry = {
  id: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
};

const actionColor: Record<string, string> = {
  CREATE: "text-moss",
  UPDATE: "text-ink/70",
  DELETE: "text-clay",
  DEACTIVATE: "text-clay",
  PAYMENT: "text-moss",
  CLOSE_DAY: "text-ink/70",
};

export default function ActivityPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setLogs(await api<LogEntry[]>("/api/activity"));
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = logs.filter((l) => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (
      l.userName.toLowerCase().includes(term) ||
      l.action.toLowerCase().includes(term) ||
      l.entityType.toLowerCase().includes(term) ||
      (l.details || "").toLowerCase().includes(term)
    );
  });

  async function onDelete(id: string) {
    if (!(await askConfirm("Delete this log entry?"))) return;
    try {
      await api(`/api/activity/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function onClearAll() {
    if (!(await askConfirm("Clear the ENTIRE activity log? This can't be undone."))) return;
    if (!(await askConfirm("Are you sure? This removes all audit history permanently."))) return;
    try {
      await api("/api/activity", { method: "DELETE" });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Activity log</h1>
      <p className="text-sm text-ink/60 mb-6">Who did what, and when. Admin only. Most recent 200 entries.</p>

      {error && <div className="text-sm text-clay mb-3">{error}</div>}

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search user, action, or details..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-secondary ml-auto" onClick={onClearAll}>
          Clear all
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Type</th>
              <th>Details</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                <td>{l.userName}</td>
                <td className={actionColor[l.action] || ""}>{l.action}</td>
                <td>{l.entityType}</td>
                <td className="text-ink/60">{l.details || "-"}</td>
                <td>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDelete(l.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <EmptyRow colSpan={6} icon="📜" title="No activity recorded." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
