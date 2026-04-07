"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sanitizeHtml } from "@/lib/sanitize";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type LedgerResponse = {
  data: {
    party: {
      _id: string;
      name: string;
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
      billKind: "sale" | "purchase";
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
  billKind?: "sale" | "purchase";
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

export default function PartyLedgerPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const [activityFilter, setActivityFilter] = useState<
    "all" | "payments" | "bills"
  >("all");
  const [page, setPage] = useState(1);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const q = useQuery({
    queryKey: ["ledger", id],
    queryFn: () => fetchLedger(id),
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

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (q.isError || !q.data) {
    return (
      <p className="text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "Not found"}
      </p>
    );
  }

  const { party, transactions, bills, payments, activitySummary } = q.data.data;
  const balanceMeta = getPartyBalanceMeta(party.partyType, party.balance);
  const isSupplier = party.partyType === "supplier";

  const activityItems: ActivityItem[] = [];
  const billNumbers = new Set(bills.map((bill) => bill.billNumber));
  const paymentSignatures = new Set(
    payments.map((payment) =>
      [
        normalizeDateKey(payment.date),
        payment.amount,
        (payment.notes ?? `Payment (${payment.direction})`).trim().toLowerCase(),
      ].join("|"),
    ),
  );

  transactions
    .filter(
      (transaction) => {
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
          !matchesBillNote &&
          !matchesPayment
        );
      },
    )
    .forEach((transaction) => {
      activityItems.push({
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

    activityItems.push({
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
    const due = Math.max(0, (bill.total ?? 0) - paid);

    activityItems.push({
      id: bill._id,
      type: "bill",
      date: new Date(bill.billDate ?? bill.createdAt),
      description: `Bill ${bill.billNumber}`,
      paymentMode: bill.paymentMode,
      billNumber: bill.billNumber,
      billKind: bill.billKind,
      debit: isSupplier ? paid : due,
      credit: isSupplier ? due : paid,
    });
  });

  activityItems.sort((left, right) => right.date.getTime() - left.date.getTime());

  const filteredActivity =
    activityFilter === "payments"
      ? activityItems.filter((item) => item.type === "payment")
      : activityFilter === "bills"
        ? activityItems.filter((item) => item.type === "bill")
        : activityItems;

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredActivity.length / pageSize));
  const paginatedActivity = filteredActivity.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{party.name}</h1>
            <p className="text-sm text-muted-foreground capitalize">
              {party.partyType} · Current balance{" "}
              <span className="font-medium text-foreground">
                {formatMoney(balanceMeta.amount)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{balanceMeta.label}</p>
          </div>
          <div className="space-y-2 text-right">
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
            {!activitySummary.canDelete ? (
              <p className="text-xs text-muted-foreground">
                Delete is available only when this party has zero activity.
              </p>
            ) : null}
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Activity</CardTitle>
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
          </CardHeader>
          <CardContent className="rounded-xl border p-0">
            <Table>
              <TableHeader>
                <TableRow>
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
                  <TableRow key={`${item.type}-${item.id}`}>
                    <TableCell>{item.date.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.type === "bill"
                          ? `${item.billKind} bill`
                          : item.type === "payment"
                            ? "Payment"
                            : "Transaction"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-50 truncate">
                      {item.type === "bill" && item.billNumber ? (
                        <Link
                          href={`/billing?billId=${item.id}`}
                          className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {item.billNumber}
                        </Link>
                      ) : (
                        item.description
                      )}
                    </TableCell>
                    <TableCell>{item.paymentMode}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.debit != null && item.debit > 0 ? (
                        <span className={isSupplier ? "text-green-600" : "text-red-600"}>
                          {formatMoney(item.debit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.credit != null && item.credit > 0 ? (
                        <span className={isSupplier ? "text-red-600" : "text-green-600"}>
                          {formatMoney(item.credit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
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
                      {activityFilter === "all" ? "activity" : activityFilter} found.
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
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete party?</AlertDialogTitle>
            <AlertDialogDescription>
              This is only allowed when the party has zero activity. If there are
              any bills, payments, or ledger entries, deletion will be blocked.
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
