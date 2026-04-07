"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

function buildUpiUri(pa: string, pn: string, amount: number) {
  const params = new URLSearchParams({
    pa: pa.trim(),
    pn: pn.trim() || "Payee",
    am: amount.toFixed(2),
    cu: "INR",
  });
  return `upi://pay?${params.toString()}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  amount: number;
};

export function UpiQrFullscreen({ open, onClose, amount }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pa = process.env.NEXT_PUBLIC_UPI_ID ?? "";
  const pn = process.env.NEXT_PUBLIC_UPI_PAYEE_NAME ?? "Merchant";
  const uri = pa ? buildUpiUri(pa, pn, Math.max(0, amount)) : "";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background p-6"
      role="dialog"
      aria-modal="true"
      aria-label="UPI QR code"
    >
      <div className="absolute right-4 top-4">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-5" />
        </Button>
      </div>
      {!pa ? (
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Add{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_UPI_ID
          </code>{" "}
          (and optionally{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_UPI_PAYEE_NAME
          </code>
          ) to your <code className="text-xs">.env</code> file, then restart the
          dev server.
        </p>
      ) : (
        <>
          <div className="rounded-2xl border bg-card p-6 shadow-lg">
            <QRCodeSVG value={uri} size={280} />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Scan to pay via UPI</p>
            <p className="text-lg font-semibold tabular-nums">
              {amount.toLocaleString(undefined, {
                style: "currency",
                currency: "INR",
              })}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{pa}</p>
          </div>
        </>
      )}
    </div>
  );
}
