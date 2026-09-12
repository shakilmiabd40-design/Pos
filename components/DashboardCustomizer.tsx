"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-fetch";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard-widgets";

export default function DashboardCustomizer({ initialWidgets }: { initialWidgets: string[] | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(initialWidgets ?? DASHBOARD_WIDGETS.map((w) => w.key));
  const [showAll, setShowAll] = useState(initialWidgets === null);
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/dashboard-settings", {
        method: "PUT",
        body: JSON.stringify({ widgets: showAll ? null : selected }),
      });
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4">
      <button className="btn-secondary" onClick={() => setOpen((v) => !v)}>
        {open ? "Close" : "Customize dashboard"}
      </button>

      {open && (
        <div className="card mt-3 max-w-lg">
          <label className="flex items-center gap-2 text-sm text-ink mb-3 pb-3 border-b border-line">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show everything (default)
          </label>

          {!showAll && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {DASHBOARD_WIDGETS.map((w) => (
                <label key={w.key} className="flex items-center gap-2 text-sm text-ink/80">
                  <input type="checkbox" checked={selected.includes(w.key)} onChange={() => toggle(w.key)} />
                  {w.label}
                </label>
              ))}
            </div>
          )}

          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
