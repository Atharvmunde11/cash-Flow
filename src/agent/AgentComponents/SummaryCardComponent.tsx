"use client";

import { cn } from "@/lib/utils";
import type { SummaryCardComponentData } from "@/agent/dummyResponses";

const highlightClassMap = {
  green: "border-border/60 bg-background text-foreground",
  red: "border-border/60 bg-background text-foreground",
  neutral: "border-border/60 bg-background text-foreground",
};

export function SummaryCardComponent({
  component,
}: {
  component: SummaryCardComponentData;
}) {
  return (
    <div className="agent-scrollbar max-h-72 overflow-auto rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
      <div className="grid min-w-[20rem] grid-cols-2 gap-3">
        {component.items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "rounded-xl border px-3 py-3",
              highlightClassMap[item.highlight ?? "neutral"],
            )}
          >
            <div className="text-[11px] uppercase tracking-wide opacity-75">
              {item.label}
            </div>
            <div className="mt-2 break-words text-sm font-semibold leading-snug">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
