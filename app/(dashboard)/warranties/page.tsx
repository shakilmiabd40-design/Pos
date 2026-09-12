"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyRow } from "@/components/EmptyState";

type Warranty = {
  id: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "EXPIRED" | "CLAIMED" | "VOID";
  variant: { size: string; sku: string; product: { name: string } };
  saleItem: { sale: { invoiceNo: string; customerName: string | null; customerPhone: string | null } };
};

const statusColor: Record<string, string> = {
  ACTIVE: "text-moss",
  EXPIRED: "text-ink/40",
  CLAIMED: "text-clay",
  VOID: "text-ink/30",
};

export default function WarrantiesPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [filter, setFilter] = useState<string>("ALL");

  async function load() {
    setWarranties(await api<Warranty[]>("/api/warranties"));
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: string) {
    try {
      await api(`/api/warranties/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  const rows = filter === "ALL" ? warranties : warranties.filter((w) => w.status === filter);

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Warranty</h1>
      <p className="text-sm text-ink/60 mb-6">Every sale automatically gets a 1-year warranty from the sale date.</p>

      <div className="mb-3 flex gap-2">
        {["ALL", "ACTIVE", "EXPIRED", "CLAIMED", "VOID"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-md border ${filter === f ? "border-moss bg-moss/10 text-moss" : "border-line text-ink/60"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Product</th>
              <th>Customer</th>
              <th>Start</th>
              <th>Expires</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id}>
                <td>{w.saleItem.sale.invoiceNo}</td>
                <td>
                  {w.variant.product.name} <span className="text-xs text-ink/50">(size {w.variant.size} · {w.variant.sku})</span>
                </td>
                <td>{w.saleItem.sale.customerName || w.saleItem.sale.customerPhone || "-"}</td>
                <td>{new Date(w.startDate).toLocaleDateString()}</td>
                <td>{new Date(w.endDate).toLocaleDateString()}</td>
                <td className={statusColor[w.status]}>{w.status}</td>
                <td className="whitespace-nowrap">
                  {w.status !== "CLAIMED" && (
                    <button className="text-clay text-xs mr-2 hover:underline" onClick={() => setStatus(w.id, "CLAIMED")}>
                      Mark claimed
                    </button>
                  )}
                  {w.status !== "VOID" && (
                    <button className="text-ink/50 text-xs hover:underline" onClick={() => setStatus(w.id, "VOID")}>
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <EmptyRow colSpan={7} icon="🛡️" title="No warranties in this filter." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
