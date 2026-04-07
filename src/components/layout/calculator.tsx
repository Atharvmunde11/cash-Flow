"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalculatorProps {
  open: boolean;
  onClose: () => void;
}

export function Calculator({ open, onClose }: CalculatorProps) {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [justEvaluated, setJustEvaluated] = useState(false);

  const handleKey = useCallback(
    (key: string) => {
      if (key === "Escape") { onClose(); return; }
      if (key === "Enter" || key === "=") {
        try {
          // eslint-disable-next-line no-eval
          const result = Function(`"use strict"; return (${expression || display})`)();
          const str = String(Math.round(result * 1e10) / 1e10);
          setDisplay(str);
          setExpression(str);
          setJustEvaluated(true);
        } catch { setDisplay("Error"); }
        return;
      }
      if (key === "Backspace") {
        setDisplay((d) => (d.length > 1 ? d.slice(0, -1) : "0"));
        setExpression((e) => (e.length > 1 ? e.slice(0, -1) : ""));
        return;
      }
      if (key === "c" || key === "C") {
        setDisplay("0"); setExpression(""); setJustEvaluated(false);
        return;
      }
      const allowed = /^[0-9+\-*/.%]$/;
      if (!allowed.test(key)) return;

      if (justEvaluated && /[0-9.]/.test(key)) {
        setDisplay(key); setExpression(key); setJustEvaluated(false);
        return;
      }
      setJustEvaluated(false);
      setDisplay((d) => (d === "0" && /[0-9.]/.test(key) ? key : d + key));
      setExpression((e) => e + key);
    },
    [display, expression, justEvaluated, onClose],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      handleKey(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleKey]);

  if (!open) return null;

  const btn = (label: string, key: string, className?: string) => (
    <button
      key={label}
      onClick={() => handleKey(key)}
      className={cn(
        "flex items-center justify-center rounded-lg text-sm font-medium h-10 transition-colors",
        "bg-muted hover:bg-muted/80 active:scale-95",
        className,
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed bottom-14 right-4 z-50 w-64 rounded-2xl border bg-background shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calculator</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Display */}
      <div className="px-3 py-3 text-right">
        <div className="text-xs text-muted-foreground min-h-4 truncate">{expression || " "}</div>
        <div className="text-2xl font-mono font-semibold truncate">{display}</div>
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-4 gap-1 px-2 pb-3">
        {btn("C", "c", "bg-red-100 dark:bg-red-950/40 text-red-600 hover:bg-red-200 dark:hover:bg-red-950/60")}
        {btn("%", "%")}
        {btn("÷", "/")}
        <button
          onClick={() => handleKey("Backspace")}
          className="flex items-center justify-center rounded-lg text-sm font-medium h-10 bg-muted hover:bg-muted/80 active:scale-95"
        >
          <Delete className="size-4" />
        </button>

        {btn("7", "7")} {btn("8", "8")} {btn("9", "9")}
        {btn("×", "*", "bg-primary/10 text-primary hover:bg-primary/20")}

        {btn("4", "4")} {btn("5", "5")} {btn("6", "6")}
        {btn("−", "-", "bg-primary/10 text-primary hover:bg-primary/20")}

        {btn("1", "1")} {btn("2", "2")} {btn("3", "3")}
        {btn("+", "+", "bg-primary/10 text-primary hover:bg-primary/20")}

        {btn(".", ".")}
        {btn("0", "0")}
        <button
          onClick={() => handleKey("Enter")}
          className="col-span-2 flex items-center justify-center rounded-lg text-sm font-semibold h-10 bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
        >
          =
        </button>
      </div>
    </div>
  );
}
