"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { bdDateString } from "@/lib/bd-time";
import { EmptyRow } from "@/components/EmptyState";

type Closing = {
  id: string;
  date: string;
  openingCash: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  notes: string | null;
  closedBy?: { name: string } | null;
};

type Preview = {
  cashIn: number;
  cashOut: number;
  suggestedOpening: number;
  existingClosing: Closing | null;
};

function todayStr() {
  return bdDateString();
}

export default function ClosingPage() {
  const [date, setDate] = useState(todayStr());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [opening, setOpening] = useState("0");
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<Closing[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function loadPreview(d: string) {
    const res = await api<Preview>(`/api/closing/preview?date=${d}`);
    setPreview(res);
    if (res.existingClosing) {
      setOpening(String(res.existingClosing.openingCash));
      setActual(String(res.existingClosing.actualCash));
      setNotes(res.existingClosing.notes || "");
    } else {
      setOpening(String(res.suggestedOpening));
      setActual("");
      setNotes("");
    }
  }

  async function loadHistory() {
    setHistory(await api<Closing[]>("/api/closing"));
  }

  useEffect(() => {
    loadPreview(date);
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const expected = (Number(opening) || 0) + (preview?.cashIn || 0) - (preview?.cashOut || 0);
  const difference = (Number(actual) || 0) - expected;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    try {
      await api("/api/closing", { method: "POST", body: JSON.stringify({ date, openingCash: opening, actualCash: actual, notes }) });
      setSaved(true);
      await loadHistory();
      await loadPreview(date);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Cash / day closing</h1>
      <p className="text-sm text-ink/60 mb-6">
        Count the drawer at day's end and compare it to what the system expects from that day's cash activity.
      </p>

      <form onSubmit={onSubmit} className="card mb-6 space-y-4 max-w-lg">
        {error && <div className="text-sm text-clay">{error}</div>}
        {saved && <div className="text-sm text-moss">Closing saved.</div>}

        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {preview && (
          <div className="text-sm text-ink/70 space-y-1 bg-paper rounded-md p-3">
            <div className="flex justify-between">
              <span>Cash in (payments received)</span>
              <span>৳{preview.cashIn.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Cash out (refunds + cash expenses)</span>
              <span>৳{preview.cashOut.toLocaleString()}</span>
            </div>
          </div>
        )}

        <div>
          <label className="label">Opening cash (from previous day)</label>
          <input className="input" type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>

        <div className="flex justify-between text-sm font-medium text-ink">
          <span>Expected cash in drawer</span>
          <span>৳{expected.toLocaleString()}</span>
        </div>

        <div>
          <label className="label">Actual cash counted</label>
          <input className="input" type="number" required value={actual} onChange={(e) => setActual(e.target.value)} />
        </div>

        {actual !== "" && (
          <div className={`text-sm font-medium ${difference === 0 ? "text-moss" : "text-clay"}`}>
            Difference: ৳{difference.toLocaleString()} {difference === 0 ? "(matched)" : difference > 0 ? "(surplus)" : "(shortage)"}
          </div>
        )}

        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
        </div>

        <button className="btn-primary">Save closing</button>
      </form>

      <div className="card overflow-x-auto">
        <div className="text-sm font-medium text-ink mb-3">History</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Opening</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Difference</th>
              <th>Closed by</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.date).toLocaleDateString()}</td>
                <td>৳{h.openingCash.toLocaleString()}</td>
                <td>৳{h.expectedCash.toLocaleString()}</td>
                <td>৳{h.actualCash.toLocaleString()}</td>
                <td className={h.difference === 0 ? "text-moss" : "text-clay"}>৳{h.difference.toLocaleString()}</td>
                <td>{h.closedBy?.name || "-"}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <EmptyRow colSpan={6} icon="🗓️" title="No closings recorded yet." />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
