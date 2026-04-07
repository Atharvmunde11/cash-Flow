"use client";

import Link from "next/link";
import { format } from "date-fns";
import { formatMoney } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BillDetailParty = {
  _id: string;
  name: string;
  phone?: string;
  partyType: string;
  balance?: number;
};

export type BillDetailData = {
  _id: string;
  billKind?: "sale" | "purchase";
  billNumber: string;
  billDate?: string;
  displayName?: string;
  partyId: BillDetailParty | string;
  bankAccountId?:
    | { _id: string; accountName: string; bankName: string }
    | string;
  lines: Array<{
    itemId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  sundryCharges?: Array<{
    label: string;
    amount: number;
  }>;
  total: number;
  paidAmount: number;
  creditAmount: number;
  paymentMode: string;
  notes?: string;
  createdAt: string;
};

type BillDetailContentProps = {
  bill: BillDetailData;
  onBack?: () => void;
  showPrintButton?: boolean;
};

export function BillDetailContent({
  bill,
  onBack,
  showPrintButton = false,
}: BillDetailContentProps) {
  const party =
    typeof bill.partyId === "object" && bill.partyId !== null
      ? bill.partyId
      : null;
  const billDate = bill.billDate
    ? new Date(bill.billDate)
    : new Date(bill.createdAt);
  const kind = bill.billKind ?? "sale";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {onBack ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              Back
            </Button>
          ) : null}
          <div>
            <h1 className="text-xl font-semibold">{bill.billNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {format(billDate, "PPP")}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              kind === "sale"
                ? "bg-green-500/10 text-green-600"
                : "bg-blue-500/10 text-blue-600",
            )}
          >
            {kind}
          </span>
        </div>

        {showPrintButton ? (
          <Button type="button" variant="outline">
            Print
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Party",
            value: party?.name ?? "Walk-in",
            sub: party?.phone,
          },
          {
            label: "Payment",
            value: bill.paymentMode,
          },
          ...(bill.bankAccountId
            ? [
                {
                  label: "Bank Account",
                  value:
                    typeof bill.bankAccountId === "object"
                      ? `${bill.bankAccountId.accountName} (${bill.bankAccountId.bankName})`
                      : String(bill.bankAccountId),
                },
              ]
            : []),
          {
            label: "Bill Date",
            value: format(billDate, "PPP"),
          },
          {
            label: "Recorded",
            value: format(new Date(bill.createdAt), "PPp"),
          },
        ].map((item) => (
          <div
            key={`${bill._id}-${item.label}`}
            className="rounded-xl border bg-muted/30 p-4"
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="font-medium">{item.value}</p>
            {"sub" in item && item.sub ? (
              <p className="text-xs text-muted-foreground">{item.sub}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bill.lines.map((line, index) => (
              <TableRow key={`${bill._id}-${index}`}>
                <TableCell className="font-medium">{line.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(line.unitPrice)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(line.lineTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <div className="w-full max-w-sm space-y-3 rounded-xl border bg-muted/20 p-5">
          <div className="flex justify-between text-sm">
            <span>Total</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(bill.total)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Paid</span>
            <span className="tabular-nums">{formatMoney(bill.paidAmount)}</span>
          </div>
          <div className="flex justify-between border-t pt-3 text-base font-semibold">
            <span>{kind === "sale" ? "Due" : "Payable"}</span>
            <span className="text-primary tabular-nums">
              {formatMoney(bill.creditAmount)}
            </span>
          </div>
        </div>
      </div>

      {bill.notes ? (
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="mb-1 text-xs text-muted-foreground">Notes</p>
          <p className="whitespace-pre-wrap text-sm">{bill.notes}</p>
        </div>
      ) : null}

      {party ? (
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/parties/${party._id}`}
            className="underline underline-offset-4"
          >
            Open party ledger
          </Link>
        </p>
      ) : null}
    </div>
  );
}
