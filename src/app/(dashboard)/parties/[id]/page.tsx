"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, Printer, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { getPartyBalanceMeta } from "@/lib/party-balance";
import { PaginationControls } from "@/components/shared/pagination-controls";
import "./party-ledger-print.css";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LedgerResponse = {
  data: {
    party: {
      _id: string;
      name: string;
      phone?: string;
      address?: string;
      balance: number;
      partyType: string;
    };
    transactions: Array<{
      _id: string;
      date: string;
      entryType: string;
      amount: number;
      paymentMode: string;
      notes?: string;
      refType?: string;
      billId?: string | null;
      paymentId?: string | null;
      balanceAfterParty?: number | null;
    }>;
    bills: Array<{
      _id: string;
      billNumber: string;
      billKind: "sale" | "purchase" | "sale_return" | "purchase_return";
      billDate: string;
      total: number;
      paidAmount: number;
      creditAmount: number;
      paymentMode: string;
      createdAt: string;
    }>;
    payments: Array<{
      _id: string;
      amount: number;
      paymentMode: string;
      date: string;
      notes?: string;
      direction: "received" | "paid";
      createdAt: string;
      updatedAt: string;
    }>;
    activitySummary: {
      ledgerEntries: number;
      bills: number;
      payments: number;
      canDelete: boolean;
    };
  };
};

type ActivityItem = {
  id: string;
  type: "transaction" | "bill" | "payment";
  date: Date;
  description: string;
  paymentMode: string;
  balanceAfter?: number | null;
  billNumber?: string;
  billKind?: "sale" | "purchase" | "sale_return" | "purchase_return";
  debit?: number;
  credit?: number;
};

function normalizeDateKey(value: string) {
  return new Date(value).toISOString();
}

async function fetchLedger(id: string) {
  const res = await fetch(`/api/parties/${id}/ledger`);
  if (!res.ok) throw new Error("Failed");
  return (await res.json()) as LedgerResponse;
}

async function fetchBusinessName() {
  const res = await fetch("/api/settings/business");
  if (!res.ok) return "CashFlow";
  const json = (await res.json()) as { data?: { name?: string } };
  return json.data?.name?.trim() || "CashFlow";
}

export default function PartyLedgerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <PartyLedgerPageInner />
    </Suspense>
  );
}

function PartyLedgerPageInner() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id);
  const [activityFilter, setActivityFilter] = useState<
    "all" | "payments" | "bills"
  >("all");
  const [printMode, setPrintMode] = useState<"all" | "payments" | "bills">(
    "all",
  );
  const [page, setPage] = useState(1);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const q = useQuery({
    queryKey: ["ledger", id],
    queryFn: () => fetchLedger(id),
  });

  useEffect(() => {
    if (searchParams.get("print") !== "statement") return;
    if (!q.isSuccess) return;
    setPrintMode("all");
    const t = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(t);
  }, [searchParams, q.isSuccess]);

  const businessQ = useQuery({
    queryKey: ["business-profile"],
    queryFn: fetchBusinessName,
  });

  const deleteParty = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/parties/${id}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to delete party");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ledger", id] });
      await qc.invalidateQueries({ queryKey: ["parties"] });
      router.push("/parties");
    },
  });

  const ledgerData = q.data?.data;
  const party = ledgerData?.party ?? null;
  const transactions = ledgerData?.transactions ?? [];
  const bills = ledgerData?.bills ?? [];
  const payments = ledgerData?.payments ?? [];
  const activitySummary = ledgerData?.activitySummary;

  const statementDate = useMemo(
    () => new Date().toLocaleDateString(),
    [],
  );

  const balanceMeta = party
    ? getPartyBalanceMeta(party.partyType, party.balance)
    : { label: "", amount: 0 };
  const isSupplier = party?.partyType === "supplier";

  const activityItems = useMemo<ActivityItem[]>(() => {
    if (!party) return [];

    const out: ActivityItem[] = [];
    const billNumbers = new Set(bills.map((bill) => bill.billNumber));
    const paymentSignatures = new Set(
      payments.map((payment) =>
        [
          normalizeDateKey(payment.date),
          payment.amount,
          (payment.notes ?? `Payment (${payment.direction})`)
            .trim()
            .toLowerCase(),
        ].join("|"),
      ),
    );

    transactions
      .filter((transaction) => {
        const normalizedNote = (
          transaction.notes || `${transaction.entryType} transaction`
        )
          .trim()
          .toLowerCase();
        const matchesBillNote = Array.from(billNumbers).some((billNumber) =>
          normalizedNote.includes(billNumber.toLowerCase()),
        );
        const matchesPayment = paymentSignatures.has(
          [
            normalizeDateKey(transaction.date),
            transaction.amount,
            normalizedNote,
          ].join("|"),
        );

        return (
          !transaction.billId &&
          !transaction.paymentId &&
          transaction.refType !== "bill_invoice" &&
          transaction.refType !== "bill_payment" &&
          transaction.refType !== "purchase_invoice" &&
          transaction.refType !== "purchase_payment" &&
          transaction.refType !== "sale_return" &&
          transaction.refType !== "sale_return_payment" &&
          transaction.refType !== "purchase_return" &&
          transaction.refType !== "purchase_return_payment" &&
          !matchesBillNote &&
          !matchesPayment
        );
      })
      .forEach((transaction) => {
        out.push({
          id: transaction._id,
          type: "transaction",
          date: new Date(transaction.date),
          description: sanitizeHtml(
            transaction.notes || `${transaction.entryType} transaction`,
          ),
          paymentMode: transaction.paymentMode,
          balanceAfter: transaction.balanceAfterParty,
          debit: transaction.entryType === "debit" ? transaction.amount : 0,
          credit: transaction.entryType === "credit" ? transaction.amount : 0,
        });
      });

    payments.forEach((payment) => {
      const ledgerRow = transactions.find(
        (transaction) => transaction.paymentId === payment._id,
      );

      out.push({
        id: payment._id,
        type: "payment",
        date: new Date(payment.date),
        description: sanitizeHtml(
          payment.notes || `Payment (${payment.direction})`,
        ),
        paymentMode: payment.paymentMode,
        balanceAfter: ledgerRow?.balanceAfterParty ?? null,
        debit: ledgerRow?.entryType === "debit" ? ledgerRow.amount : 0,
        credit: ledgerRow?.entryType === "credit" ? ledgerRow.amount : 0,
      });
    });

    bills.forEach((bill) => {
      const paid = bill.paidAmount ?? 0;
      const total = bill.total ?? 0;
      const due = Math.max(0, total - paid);
      const billId = bill._id;

      let debit = 0;
      let credit = 0;
      if (bill.billKind === "sale_return") {
        // Credit note to customer: show return as credit, refund as debit.
        credit = total;
        debit = paid;
      } else if (bill.billKind === "purchase_return") {
        debit = total;
        credit = paid;
      } else if (isSupplier) {
        debit = paid;
        credit = due;
      } else {
        debit = due;
        credit = paid;
      }

      const related = transactions
        .filter((transaction) => transaction.billId === billId)
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
      const balanceAfter =
        related.length > 0
          ? (related[related.length - 1]?.balanceAfterParty ?? null)
          : null;

      out.push({
        id: bill._id,
        type: "bill",
        date: new Date(bill.billDate ?? bill.createdAt),
        description: `Bill ${bill.billNumber}`,
        paymentMode: bill.paymentMode,
        billNumber: bill.billNumber,
        billKind: bill.billKind,
        balanceAfter,
        debit,
        credit,
      });
    });

    out.sort((left, right) => right.date.getTime() - left.date.getTime());
    return out;
  }, [bills, isSupplier, party, payments, transactions]);

  const filteredActivity =
    activityFilter === "payments"
      ? activityItems.filter((item) => item.type === "payment")
      : activityFilter === "bills"
        ? activityItems.filter((item) => item.type === "bill")
        : activityItems;

  const printableActivity = useMemo(() => {
    return printMode === "payments"
      ? activityItems.filter((i) => i.type === "payment")
      : printMode === "bills"
        ? activityItems.filter((i) => i.type === "bill")
        : activityItems;
  }, [activityItems, printMode]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredActivity.length / pageSize));
  const paginatedActivity = filteredActivity.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (q.isError || !q.data || !party || !activitySummary) {
    return (
      <p className="text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "Not found"}
      </p>
    );
  }

  return (
    <>
      {/* Print-only content (hidden on screen) */}
      <div id="party-ledger-print-root" className="party-ledger-print">
        <div className="pl-header">
          <div>
            <p className="pl-title">
              {businessQ.data ?? "CashFlow"}
            </p>
            <p className="pl-sub">
              {party.name} • {party.partyType} • Statement ({printMode})
            </p>
            <p className="pl-sub">
              Date: <span className="pl-muted">{statementDate}</span>
            </p>
            {(party.address || party.phone) && (
              <p className="pl-sub pl-muted">
                {[party.address, party.phone].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>
          <div className="pl-meta">
            <div>
              Balance: <b>{formatMoney(balanceMeta.amount)}</b>
            </div>
            <div className="pl-muted">{balanceMeta.label}</div>
          </div>
        </div>

        <table className="pl-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Mode</th>
              <th className="pl-right">Debit</th>
              <th className="pl-right">Credit</th>
              <th className="pl-right">Balance After</th>
            </tr>
          </thead>
          <tbody>
            {printableActivity.map((item) => (
              <tr key={`${item.type}-${item.id}`}>
                <td>{item.date.toLocaleString()}</td>
                <td>
                  {item.type === "bill"
                    ? `${item.billKind} bill`
                    : item.type === "payment"
                      ? "Payment"
                      : "Transaction"}
                </td>
                <td>{item.type === "bill" ? item.description : item.description}</td>
                <td>{item.paymentMode}</td>
                <td className="pl-right">
                  {item.debit != null && item.debit > 0
                    ? formatMoney(item.debit)
                    : "-"}
                </td>
                <td className="pl-right">
                  {item.credit != null && item.credit > 0
                    ? formatMoney(item.credit)
                    : "-"}
                </td>
                <td className="pl-right pl-muted">
                  {item.balanceAfter != null ? formatMoney(item.balanceAfter) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {party.name}
            </h1>
            <p className="text-sm text-muted-foreground capitalize">
              {party.partyType} · Current balance{" "}
              <span className="font-medium text-foreground">
                {formatMoney(balanceMeta.amount)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{balanceMeta.label}</p>
          </div>
          <div className="space-y-2 text-right">
            <div className="flex flex-wrap justify-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button type="button" variant="outline" className="gap-2" />
                  }
                >
                  <Printer className="size-4" />
                  Print
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setPrintMode("all");
                      setTimeout(() => window.print(), 0);
                    }}
                  >
                    Print full statement
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setPrintMode("bills");
                      setTimeout(() => window.print(), 0);
                    }}
                  >
                    Print bills only
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setPrintMode("payments");
                      setTimeout(() => window.print(), 0);
                    }}
                  >
                    Print payments only
                  </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const url = `/api/parties/${id}/ledger/pdf?mode=${printMode}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <Download className="mr-2 size-4" />
                  Download PDF
                </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={!activitySummary.canDelete || deleteParty.isPending}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Delete party
              </Button>
            </div>
            {!activitySummary.canDelete ? (
              <p className="text-xs text-muted-foreground">
                Delete is available only when this party has zero activity.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Activity</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={activityFilter === "all" ? "default" : "outline"}
              onClick={() => {
                setActivityFilter("all");
                setPage(1);
              }}
            >
              All
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activityFilter === "payments" ? "default" : "outline"}
              onClick={() => {
                setActivityFilter("payments");
                setPage(1);
              }}
            >
              Payments
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activityFilter === "bills" ? "default" : "outline"}
              onClick={() => {
                setActivityFilter("bills");
                setPage(1);
              }}
            >
              Bills
            </Button>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedActivity.map((item) => (
                <TableRow
                  key={`${item.type}-${item.id}`}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {item.date.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {item.type === "bill"
                        ? `${item.billKind} bill`
                        : item.type === "payment"
                          ? "Payment"
                          : "Transaction"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-50 truncate font-medium">
                    {item.type === "bill" && item.billNumber ? (
                      <Link
                        href={`/billing?billId=${item.id}`}
                        className="font-mono text-xs text-foreground hover:underline underline-offset-4"
                      >
                        {item.billNumber}
                      </Link>
                    ) : (
                      item.description
                    )}
                  </TableCell>
                  <TableCell className="capitalize text-sm">
                    {item.paymentMode}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.debit != null && item.debit > 0 ? (
                      <span
                        className={
                          isSupplier ? "text-green-600" : "text-red-600"
                        }
                      >
                        {formatMoney(item.debit)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.credit != null && item.credit > 0 ? (
                      <span
                        className={
                          isSupplier ? "text-red-600" : "text-green-600"
                        }
                      >
                        {formatMoney(item.credit)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {item.balanceAfter != null
                      ? formatMoney(item.balanceAfter)
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
              {paginatedActivity.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No{" "}
                    {activityFilter === "all" ? "activity" : activityFilter}{" "}
                    found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <PaginationControls
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            totalItems={filteredActivity.length}
            itemLabel="entries"
            onPageChange={setPage}
          />
        </div>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete party?</AlertDialogTitle>
            <AlertDialogDescription>
              This is only allowed when the party has zero activity. If there
              are any bills, payments, or ledger entries, deletion will be
              blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteParty.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteParty.mutate(undefined, {
                  onSuccess: () => setConfirmDeleteOpen(false),
                });
              }}
            >
              {deleteParty.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
