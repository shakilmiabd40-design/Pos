"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Results = {
  products: { id: string; name: string; brand: string | null }[];
  customers: { id: string; name: string; phone: string }[];
  sales: { id: string; invoiceNo: string; totalAmount: number }[];
};

// One search box in the top bar that looks across products, customers and
// invoices at once, so staff don't have to know which page a thing lives on.
export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  const hasResults = !!results && (results.products.length + results.customers.length + results.sales.length > 0);

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <input
        className="input"
        placeholder="Search product, customer, invoice…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-line rounded-md shadow-lg max-h-96 overflow-y-auto overscroll-contain">
          {loading && <div className="px-3 py-2 text-sm text-ink/50">Searching…</div>}
          {!loading && !hasResults && <div className="px-3 py-2 text-sm text-ink/50">No results</div>}

          {!!results?.products.length && (
            <div>
              <div className="px-3 pt-2 text-[11px] font-medium uppercase text-ink/40">Products</div>
              {results.products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-paper"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/products`);
                  }}
                >
                  {p.name}
                  {p.brand ? ` — ${p.brand}` : ""}
                </button>
              ))}
            </div>
          )}

          {!!results?.customers.length && (
            <div>
              <div className="px-3 pt-2 text-[11px] font-medium uppercase text-ink/40">Customers</div>
              {results.customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-paper"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/customers`);
                  }}
                >
                  {c.name} — {c.phone}
                </button>
              ))}
            </div>
          )}

          {!!results?.sales.length && (
            <div>
              <div className="px-3 pt-2 text-[11px] font-medium uppercase text-ink/40">Sales</div>
              {results.sales.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-paper"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/sales`);
                  }}
                >
                  {s.invoiceNo} — ৳{s.totalAmount.toFixed(2)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
