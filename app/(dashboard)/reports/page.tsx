"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-fetch";
import { exportToExcel } from "@/lib/export-xlsx";

type Tab = "sales" | "damages" | "returns" | "stock" | "pnl";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    api<string[]>("/api/products/categories").then(setCategories).catch(() => {});
  }, []);

  function switchTab(t: Tab) {
    setData(null);
    setError("");
    setLoading(true);
    setTab(t);
  }

  async function load() {
    // Tag this fetch so that if a slower/older request from a previous tab
    // resolves after a newer one, its result is ignored instead of
    // overwriting the current tab's state with the wrong shape of data.
    const myRequestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (category) qs.set("category", category);
      const url = tab === "stock" ? `/api/reports/stock?${qs.toString()}` : `/api/reports/${tab}?${qs.toString()}`;
      const res = await api(url);
      if (myRequestId !== requestIdRef.current) return; // a newer request has since started
      setData(res);
    } catch (e: any) {
      if (myRequestId !== requestIdRef.current) return;
      setError(e.message || "Could not load this report");
      setData(null);
    } finally {
      if (myRequestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function exportCurrent() {
    if (!data) return;
    if (tab === "sales") {
      exportToExcel(
        "sales-report.xlsx",
        (data.sales || []).map((s: any) => ({
          Date: new Date(s.date).toLocaleString(),
          Invoice: s.invoiceNo,
          Customer: s.customerName || "walk-in",
          Items: s.items.map((it: any) => `${it.variant.product.name} (${it.variant.size}) x${it.qty}`).join(", "),
          Total: s.totalAmount,
        }))
      );
    } else if (tab === "damages") {
      exportToExcel(
        "damage-report.xlsx",
        (data.damages || []).map((d: any) => ({
          Date: new Date(d.date).toLocaleDateString(),
          Product: d.variant.product.name,
          Size: d.variant.size,
          Qty: d.qty,
          Reason: d.reason || "",
        }))
      );
    } else if (tab === "returns") {
      exportToExcel(
        "returns-report.xlsx",
        (data.returns || []).map((r: any) => ({
          Date: new Date(r.date).toLocaleDateString(),
          Invoice: r.sale.invoiceNo,
          Product: r.saleItem.variant.product.name,
          Size: r.saleItem.variant.size,
          Qty: r.qty,
          Refund: r.refundAmount,
        }))
      );
    } else if (tab === "stock") {
      exportToExcel(
        "stock-report.xlsx",
        (data.rows || []).map((r: any) => ({
          Product: r.name,
          SKU: r.sku,
          Size: r.size || "",
          Category: r.category || "",
          Stock: r.stock,
          "Cost value": r.costValue,
          "Sell value": r.sellValue,
        }))
      );
    } else if (tab === "pnl") {
      exportToExcel("profit-loss.xlsx", [
        { Line: "Revenue", Amount: data.revenue },
        { Line: "Discount given", Amount: data.discountGiven },
        { Line: "Returns refunded", Amount: data.returnsRefunded },
        { Line: "Net sales", Amount: data.netSales },
        { Line: "COGS (cost of goods sold)", Amount: data.cogs },
        { Line: "Gross profit", Amount: data.grossProfit },
        { Line: "Damage loss", Amount: data.damageLoss },
        { Line: "Expenses", Amount: data.totalExpenses },
        { Line: "— of which courier loss (COD returns)", Amount: data.courierLoss },
        { Line: "Net profit", Amount: data.netProfit },
      ]);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Reports</h1>
      <p className="text-sm text-ink/60 mb-6">Sales, damage, returns, closing stock, and real profit &amp; loss.</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["sales", "damages", "returns", "stock", "pnl"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`text-xs px-3 py-1.5 rounded-md border capitalize ${
              tab === t ? "border-moss bg-moss/10 text-moss" : "border-line text-ink/60"
            }`}
          >
            {t === "stock" ? "Closing stock" : t === "pnl" ? "Profit & Loss" : t}
          </button>
        ))}
      </div>

      {tab !== "pnl" && (
        <div className="card mb-4 flex flex-wrap items-end gap-3">
          {tab !== "stock" && (
            <>
              <div>
                <label className="label">From</label>
                <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
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
          <button className="btn-secondary" onClick={load}>
            Apply
          </button>
          <button className="btn-secondary ml-auto" onClick={exportCurrent} disabled={!data}>
            Export Excel
          </button>
        </div>
      )}
      {tab === "pnl" && (
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
          <button className="btn-secondary ml-auto" onClick={exportCurrent} disabled={!data}>
            Export Excel
          </button>
        </div>
      )}

      {loading && <div className="text-sm text-ink/50">Loading...</div>}
      {!loading && error && <div className="text-sm text-clay">{error}</div>}

      {!loading && tab === "sales" && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard label="Invoices" value={data.totals?.invoiceCount ?? 0} />
            <StatCard label="Revenue" value={`৳${(data.totals?.revenue ?? 0).toLocaleString()}`} />
            <StatCard label="Discount given" value={`৳${(data.totals?.discount ?? 0).toLocaleString()}`} />
            <StatCard label="Units sold" value={data.totals?.unitsSold ?? 0} />
          </div>
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(data.sales || []).map((s: any) => (
                  <tr key={s.id}>
                    <td>{new Date(s.date).toLocaleString()}</td>
                    <td>{s.invoiceNo}</td>
                    <td>{s.customerName || "-"}</td>
                    <td>{s.items.map((it: any) => `${it.variant.product.name} (${it.variant.size}) x${it.qty}`).join(", ")}</td>
                    <td>৳{s.totalAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === "damages" && data && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatCard label="Units damaged" value={data.totals?.totalQty ?? 0} />
            <StatCard label="Cost value lost" value={`৳${(data.totals?.totalCostValue ?? 0).toLocaleString()}`} />
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
                </tr>
              </thead>
              <tbody>
                {(data.damages || []).map((d: any) => (
                  <tr key={d.id}>
                    <td>{new Date(d.date).toLocaleDateString()}</td>
                    <td>{d.variant.product.name}</td>
                    <td>{d.variant.size}</td>
                    <td>{d.qty}</td>
                    <td>{d.reason || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === "returns" && data && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatCard label="Units returned" value={data.totals?.totalQty ?? 0} />
            <StatCard label="Refunded" value={`৳${(data.totals?.totalRefund ?? 0).toLocaleString()}`} />
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
                </tr>
              </thead>
              <tbody>
                {(data.returns || []).map((r: any) => (
                  <tr key={r.id}>
                    <td>{new Date(r.date).toLocaleDateString()}</td>
                    <td>{r.sale.invoiceNo}</td>
                    <td>{r.saleItem.variant.product.name}</td>
                    <td>{r.saleItem.variant.size}</td>
                    <td>{r.qty}</td>
                    <td>৳{r.refundAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === "stock" && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <StatCard label="Total units in hand" value={data.totals?.units ?? 0} />
            <StatCard label="Stock value (cost)" value={`৳${(data.totals?.costValue ?? 0).toLocaleString()}`} />
            <StatCard label="Stock value (sell)" value={`৳${(data.totals?.sellValue ?? 0).toLocaleString()}`} />
          </div>
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Size</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Cost value</th>
                  <th>Sell value</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map((r: any) => {
                  const rowClass = r.stock <= 2 ? "bg-clay/15" : r.stock <= 5 ? "bg-amber-100" : "";
                  return (
                    <tr key={r.id} className={rowClass}>
                      <td>{r.name}</td>
                      <td>{r.sku}</td>
                      <td>{r.size || "-"}</td>
                      <td>{r.category || "-"}</td>
                      <td className={r.stock <= 5 ? "font-medium text-ink" : ""}>{r.stock}</td>
                      <td>৳{r.costValue.toLocaleString()}</td>
                      <td>৳{r.sellValue.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === "pnl" && data && (
        <div className="card max-w-lg">
          <table className="w-full text-sm">
            <tbody>
              <PnlRow label="Revenue" value={data.revenue} />
              <PnlRow label="Discount given" value={-data.discountGiven} muted />
              <PnlRow label="Returns refunded" value={-data.returnsRefunded} muted />
              <PnlRow label="Net sales" value={data.netSales} bold border />
              <PnlRow label="COGS (cost of goods sold)" value={-data.cogs} muted />
              <PnlRow label="Gross profit" value={data.grossProfit} bold border />
              <PnlRow label="Damage loss" value={-data.damageLoss} muted />
              <PnlRow label="Expenses" value={-data.totalExpenses} muted />
              {(data.courierLoss ?? 0) > 0 && (
                <tr>
                  <td className="py-1 pl-4 text-xs text-ink/40">— of which courier loss (COD returns)</td>
                  <td className="py-1 text-right text-xs text-ink/40">৳{data.courierLoss.toLocaleString()}</td>
                </tr>
              )}
              <PnlRow label="Net profit" value={data.netProfit} bold border big />
            </tbody>
          </table>
          <div className="text-xs text-ink/40 mt-3">Based on {data.invoiceCount} invoice(s) in this period.</div>
        </div>
      )}
    </div>
  );
}

function PnlRow({ label, value, bold, border, muted, big }: { label: string; value: number; bold?: boolean; border?: boolean; muted?: boolean; big?: boolean }) {
  return (
    <tr className={border ? "border-t border-line" : ""}>
      <td className={`py-2 ${bold ? "font-medium text-ink" : muted ? "text-ink/60" : "text-ink/80"} ${big ? "text-base" : ""}`}>{label}</td>
      <td className={`py-2 text-right ${bold ? "font-medium" : muted ? "text-ink/60" : "text-ink/80"} ${value < 0 ? "text-clay" : "text-ink"} ${big ? "text-base" : ""}`}>
        {value < 0 ? "-" : ""}৳{Math.abs(value).toLocaleString()}
      </td>
    </tr>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-xs text-ink/50">{label}</div>
      <div className="text-xl font-serif text-ink mt-1">{value}</div>
    </div>
  );
}
