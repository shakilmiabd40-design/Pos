"use client";

import { useEffect, useRef, useState } from "react";

type CustomerMatch = {
  id: string;
  name: string;
  phone: string;
  visits: number;
  totalSpent: number;
  totalDue: number;
  isRisk: boolean;
};

// Two inputs (name + phone) that double as a live search against existing
// customers — type either one and matching past customers show up below,
// so staff can pick the existing record instead of accidentally creating a
// duplicate.
export default function CustomerLookup({
  name,
  phone,
  onChangeName,
  onChangePhone,
  onSelect,
}: {
  name: string;
  phone: string;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
  onSelect: (c: { name: string; phone: string }) => void;
}) {
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const query = (name || phone).trim();

  useEffect(() => {
    if (query.length < 2) {
      setMatches([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(query)}`);
        if (res.ok) setMatches((await res.json()).slice(0, 6));
      } catch {
        // Silently ignore — this is a convenience lookup, not a required step.
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div ref={boxRef} className="relative">
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input"
          placeholder="Customer name (optional)"
          value={name}
          onChange={(e) => {
            onChangeName(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <input
          className="input"
          placeholder="Customer phone (optional)"
          value={phone}
          onChange={(e) => {
            onChangePhone(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-line rounded-md shadow-lg max-h-64 overflow-y-auto overscroll-contain">
          <div className="px-3 pt-2 text-[11px] font-medium uppercase text-ink/40">Existing customers</div>
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full text-left px-3 py-2 text-sm hover:bg-paper"
              onClick={() => {
                onSelect({ name: c.name, phone: c.phone });
                setOpen(false);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink">
                  {c.name} — {c.phone}
                </span>
                {c.isRisk && (
                  <span className="text-[10px] text-clay border border-clay/40 rounded px-1 shrink-0">COD risk</span>
                )}
              </div>
              <div className="text-xs text-ink/50">
                {c.visits} visit{c.visits === 1 ? "" : "s"} · ৳{c.totalSpent.toLocaleString()} spent
                {c.totalDue > 0 ? ` · ৳${c.totalDue.toLocaleString()} due` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
