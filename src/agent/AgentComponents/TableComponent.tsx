"use client";

import type { TableComponentData } from "@/agent/dummyResponses";

export function TableComponent({
  component,
}: {
  component: TableComponentData;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
      <div className="agent-scrollbar max-h-80 max-w-full overflow-auto">
        <div className="min-w-[34rem]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-background">
                {component.headers.map((header) => (
                  <th
                    key={header}
                    className="h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {component.rows.map((row, index) => (
                <tr
                  key={`${row.join("-")}-${index}`}
                  className={index % 2 === 0 ? "bg-background" : "bg-background/80"}
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${cell}-${cellIndex}`}
                      className="border-b border-border/40 px-4 py-3 whitespace-nowrap"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {component.footer?.length ? (
            <div className="border-t border-border/60 bg-background px-4 py-3">
              <div className="grid gap-2 sm:grid-cols-3">
                {component.footer.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-border/60 bg-background px-4 py-3"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </div>
                    <div className="mt-1 text-sm font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
