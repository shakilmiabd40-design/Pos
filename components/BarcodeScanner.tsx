"use client";

import { useEffect, useRef, useState } from "react";

// Opens a small modal that turns on the device camera and decodes a
// barcode/QR code using html5-qrcode, then calls onScan with the decoded
// text and closes itself. If no camera is available or permission is
// denied, it just shows an error — the field it's attached to stays
// manually typeable either way.
export default function BarcodeScannerButton({
  onScan,
  label = "Scan",
}: {
  onScan: (text: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef<any>(null);
  const elementId = useRef(`scanner-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode(elementId.current);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          (decodedText: string) => {
            if (cancelled) return;
            onScan(decodedText);
            setOpen(false);
          },
          () => {
            // per-frame "nothing decoded yet" callback — not an error
          }
        );
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Could not access the camera. You can still type it in by hand.");
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-surface rounded-md p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-medium text-ink mb-2">Scan barcode / QR</div>
            {error ? (
              <div className="text-sm text-clay mb-2">{error}</div>
            ) : (
              <div id={elementId.current} className="w-full" />
            )}
            <button type="button" className="btn-secondary w-full mt-3" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
