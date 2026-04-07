"use client";

import { formatMoney } from "@/lib/format";
import type { InvoiceComponentData } from "@/agent/dummyResponses";

export function InvoiceComponent({
  component,
}: {
  component: InvoiceComponentData;
}) {
  return (
    <div className="agent-scrollbar max-h-80 overflow-auto rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
      <div className="min-w-[22rem]">
        <div className="flex items-start justify-between gap-4 border-b border-dashed border-border/60 pb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              CashFlow
            </div>
            <div className="mt-1 break-words text-lg font-semibold">
              {component.billNumber}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {component.date}
            </div>
          </div>
          <div className="min-w-0 text-right text-sm">
            <div className="break-words font-semibold">{component.party}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Payment: {component.paymentMode}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {component.items.map((item) => (
            <div
              key={`${item.name}-${item.qty}`}
              className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-border/60 bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <div className="break-words text-sm font-medium">
                  {item.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.qty} {item.unit} x {formatMoney(item.rate)}
                </div>
              </div>
              <div className="text-sm font-semibold">
                {formatMoney(item.total)}
              </div>
            </div>
          ))}
        </div>

        {component.sundry.length ? (
          <div className="mt-4 border-t border-dashed border-border/60 pt-3">
            <div className="space-y-2 text-sm">
              {component.sundry.map((charge) => (
                <div
                  key={charge.name}
                  className="flex items-center justify-between text-muted-foreground"
                >
                  <span>{charge.name}</span>
                  <span>{formatMoney(charge.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 border-t border-dashed border-border/60 pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold">
              {formatMoney(component.total)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground">Paid</span>
            <span>{formatMoney(component.paid)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-base font-semibold">
            <span>Due</span>
            <span>{formatMoney(component.due)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
