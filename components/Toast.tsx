"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind) => void } | null>(null);

// Wraps the dashboard so any page can call useToast() to pop a small
// notification in the corner instead of (or alongside) inline banners.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setItems((cur) => [...cur, { id, kind, message }]);
    setTimeout(() => {
      setItems((cur) => cur.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 print:hidden max-w-xs">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`rounded-md px-4 py-2.5 text-sm shadow-lg border ${
              t.kind === "success"
                ? "bg-moss text-white border-moss"
                : t.kind === "error"
                ? "bg-clay text-white border-clay"
                : "bg-surface text-ink border-line"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Falls back to a no-op if used outside the provider (shouldn't happen in
// the dashboard, but keeps callers from crashing if this ever renders
// somewhere unwrapped).
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx?.show ?? (() => {});
}
