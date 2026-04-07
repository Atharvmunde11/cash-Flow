"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Calculator } from "@/components/layout/calculator";
import { Calculator as CalcIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SHORTCUTS: {
  key: string;
  label: string;
  displayKey: string;
  href?: string;
  action?: string;
}[] = [
  { key: "d", displayKey: "Ctrl+D", label: "Dashboard", href: "/" },
  { key: "p", displayKey: "Ctrl+P", label: "Parties", href: "/parties" },
  { key: "t", displayKey: "Ctrl+T", label: "Bills", href: "/transactions" },
  { key: "m", displayKey: "Ctrl+M", label: "Payments", href: "/payments" },
  { key: "b", displayKey: "Ctrl+B", label: "Billing", href: "/billing" },
  { key: "e", displayKey: "Ctrl+E", label: "Credit", href: "/credit" },
  { key: "i", displayKey: "Ctrl+I", label: "Inventory", href: "/inventory" },
  { key: "k", displayKey: "Ctrl+K", label: "Categories", href: "/categories" },
  { key: "l", displayKey: "Ctrl+L", label: "Bank Accounts", href: "/bank-accounts" },
  { key: "x", displayKey: "Ctrl+X", label: "Data", href: "/data" },
  { key: ".", displayKey: "Ctrl+.", label: "Calculator", action: "calculator" },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const [calcOpen, setCalcOpen] = useState(false);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey || e.altKey) return;

      const key = e.key.toLowerCase();

      const match = SHORTCUTS.find((s) => s.key === key);
      if (!match) return;

      e.preventDefault();

      if (match.action === "calculator") {
        setCalcOpen((o) => !o);
        return;
      }

      if (match.href) {
        router.push(match.href);
      }
    },
    [router],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <>
      <Calculator open={calcOpen} onClose={() => setCalcOpen(false)} />
      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t bg-background/95 backdrop-blur px-4 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
          <span className="shrink-0 font-medium text-foreground/70">
            Shortcuts:
          </span>
          {SHORTCUTS.filter((s) => s.href)
            .slice(0, 6)
            .map((s) => (
              <span key={s.label} className="shrink-0 flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">
                  {s.displayKey}
                </kbd>
                {s.label}
              </span>
            ))}
          <span className="shrink-0 flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px]">
              Ctrl+Shift+A
            </kbd>
            Agent
          </span>
        </div>
        <button
          onClick={() => setCalcOpen((o) => !o)}
          className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
            calcOpen ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
          title="Calculator (Ctrl+.)"
        >
          <CalcIcon className="size-3.5" />
          <span>Calc</span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
            Ctrl+.
          </kbd>
        </button>
      </div>
    </>
  );
}
