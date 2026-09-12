"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // red confirm button for destructive actions (delete, clear, etc.)
};

type ConfirmState = ConfirmOptions & { message: string };

const ConfirmContext = createContext<((message: string, opts?: ConfirmOptions) => Promise<boolean>) | null>(null);

// Wraps the dashboard so any page can `await confirm("Delete this?")`
// instead of the browser's blocking window.confirm() — same yes/no
// behaviour, but styled to match the app and non-blocking.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, opts?: ConfirmOptions) => {
    setState({ message, ...opts });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" onClick={() => settle(false)}>
          <div className="bg-surface border border-line rounded-md p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            {state.title && <div className="text-sm font-medium text-ink mb-1">{state.title}</div>}
            <div className="text-sm text-ink/80">{state.message}</div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="btn-secondary" onClick={() => settle(false)}>
                {state.cancelLabel || "Cancel"}
              </button>
              <button type="button" className={state.danger ? "btn-danger" : "btn-primary"} onClick={() => settle(true)} autoFocus>
                {state.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Falls back to the native confirm() if used outside the provider, so
// nothing silently breaks if this ever renders somewhere unwrapped.
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return ctx ?? ((message: string) => Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : true));
}
