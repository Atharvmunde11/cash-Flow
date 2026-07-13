"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UpdatePayload = {
  status: string;
  version?: string;
  message?: string;
  percent?: number;
};

function playNotifySound() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const beep = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };

    beep(880, 0, 0.12);
    beep(1175, 0.14, 0.16);
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    // Audio may be blocked; ignore.
  }
}

/** Bottom-left floating update notice shown when a new desktop release exists. */
export function UpdateAvailableToast() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string | undefined>();
  const [downloading, setDownloading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [ready, setReady] = useState(false);
  const soundedRef = useRef(false);

  useEffect(() => {
    const api = window.cashflow;
    if (!api) return;

    const unsub = api.onUpdateStatus((payload: UpdatePayload) => {
      if (payload.status === "available") {
        setVersion(payload.version);
        setOpen(true);
        setReady(false);
        if (!soundedRef.current) {
          soundedRef.current = true;
          playNotifySound();
        }
      } else if (payload.status === "downloading") {
        setDownloading(true);
        setPercent(payload.percent ?? 0);
        setOpen(true);
      } else if (payload.status === "downloaded") {
        setDownloading(false);
        setReady(true);
        setVersion((prev) => payload.version ?? prev);
        setOpen(true);
        if (!soundedRef.current) {
          soundedRef.current = true;
          playNotifySound();
        }
      }
    });

    // Startup check — Electron also checks ~15s after launch; this covers
    // cases where the renderer mounts after that event was already sent.
    void api
      .checkForUpdates()
      .then((result) => {
        if (result.status === "available") {
          setVersion(result.version);
          setOpen(true);
          if (!soundedRef.current) {
            soundedRef.current = true;
            playNotifySound();
          }
        }
      })
      .catch(() => {
        // Dev / offline — ignore
      });

    return unsub;
  }, []);

  if (!open) return null;

  return (
    <div
      className={cn(
        "print:hidden fixed bottom-14 left-4 z-50 w-[min(22rem,calc(100vw-2rem))]",
        "rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur",
        "animate-in slide-in-from-bottom-4 fade-in duration-300",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {ready
              ? "Update ready to install"
              : downloading
                ? "Downloading update…"
                : "Update available"}
          </p>
          <p className="text-xs text-muted-foreground">
            {ready
              ? `Version ${version ?? "new"} is downloaded. Restart to install.`
              : downloading
                ? `${Math.round(percent)}% complete`
                : `Version ${version ?? "new"} is available for CashFlow.`}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
          onClick={() => setOpen(false)}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {ready ? (
          <Button size="sm" onClick={() => window.cashflow?.quitAndInstall()}>
            Restart &amp; install
          </Button>
        ) : downloading ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => {
              setDownloading(true);
              void window.cashflow?.downloadUpdate();
            }}
          >
            <Download className="mr-1.5 size-3.5" />
            Download
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Later
        </Button>
      </div>
    </div>
  );
}
