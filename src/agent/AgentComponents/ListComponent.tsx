"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ListComponentData } from "@/agent/dummyResponses";

const borderClassMap = {
  red: "border-l-border",
  green: "border-l-border",
  yellow: "border-l-border",
};

const badgeClassMap = {
  red: "bg-muted text-foreground/80",
  green: "bg-muted text-foreground/80",
  yellow: "bg-muted text-foreground/80",
};

export function ListComponent({ component }: { component: ListComponentData }) {
  return (
    <div className="agent-scrollbar max-h-72 overflow-auto rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
      <div className="min-w-[20rem] space-y-3">
        {component.items.map((item) => {
          const tone = item.badgeColor ?? "yellow";

          return (
            <div
              key={`${item.title}-${item.subtitle ?? ""}`}
              className={cn(
                "min-w-0 rounded-xl border border-border/60 border-l-4 bg-background px-3 py-3",
                borderClassMap[tone],
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {item.title}
                  </div>
                  {item.subtitle ? (
                    <div className="mt-1 break-words text-xs text-muted-foreground">
                      {item.subtitle}
                    </div>
                  ) : null}
                </div>

                {item.badge ? (
                  <Badge
                    className={cn("border-0 text-[11px]", badgeClassMap[tone])}
                  >
                    {item.badge}
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
