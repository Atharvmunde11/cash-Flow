"use client";

import { InvoiceComponent } from "@/agent/AgentComponents/InvoiceComponent";
import { ListComponent } from "@/agent/AgentComponents/ListComponent";
import { SummaryCardComponent } from "@/agent/AgentComponents/SummaryCardComponent";
import { TableComponent } from "@/agent/AgentComponents/TableComponent";
import { ConfirmBar } from "@/agent/ConfirmBar";
import type { AgentResponse } from "@/agent/dummyResponses";

export function UserMessageBubble({ message }: { message: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md border border-border/70 bg-border px-3 py-4 text-sm text-foreground shadow-sm ">
        {message}
      </div>
    </div>
  );
}

export function AgentMessageBubble({
  response,
  onConfirm,
  onCancel,
}: {
  response: AgentResponse;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-start">
        <div className="w-full max-w-full bg-background px-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-6 text-foreground">
              {response.message}
            </p>
          </div>
        </div>
      </div>

      {response.component?.type === "table" ? (
        <div className="pl-2">
          <TableComponent component={response.component} />
        </div>
      ) : null}

      {response.component?.type === "summary_card" ? (
        <div className="pl-2">
          <SummaryCardComponent component={response.component} />
        </div>
      ) : null}

      {response.component?.type === "list" ? (
        <div className="pl-2">
          <ListComponent component={response.component} />
        </div>
      ) : null}

      {response.component?.type === "invoice" ? (
        <div className="pl-2">
          <InvoiceComponent component={response.component} />
        </div>
      ) : null}

      {response.requiresConfirm ? (
        <div className="pl-2">
          <ConfirmBar
            onConfirm={() => onConfirm(response.id)}
            onCancel={() => onCancel(response.id)}
          />
        </div>
      ) : null}
    </div>
  );
}
