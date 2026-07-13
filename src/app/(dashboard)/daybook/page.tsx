"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import {
  Banknote,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Plus,
  Receipt,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

type DaybookBillRow = {
  _id: string;
  billNumber: string;
  displayName: string;
  paymentMode: string;
  total: number;
  paidAmount: number;
  creditAmount: number;
  cash: number;
  online: number;
  sundry: number;
};

type DaybookSundryRow = {
  billId: string;
  billNumber: string;
  displayName: string;
  label: string;
  amount: number;
};

type DaybookExpenseRow = {
  _id: string;
  reason: string;
  amount: number;
};

type DaybookReturnRow = {
  _id: string;
  billNumber: string;
  displayName: string;
  billKind: "sale_return" | "purchase_return";
  paymentMode: string;
  total: number;
  cash: number;
  online: number;
};

type DaybookResponse = {
  date: string;
  morningCash: number;
  notes: string;
  saved: boolean;
  bills: DaybookBillRow[];
  sundries: DaybookSundryRow[];
  expenses: DaybookExpenseRow[];
  returns: DaybookReturnRow[];
  totals: {
    cash: number;
    online: number;
    sundry: number;
    expenses: number;
    billCount: number;
    returnCount: number;
    purchaseCash: number;
    receiptCash: number;
    paymentCash: number;
    saleReturnCash: number;
    purchaseReturnCash: number;
    closingCash: number;
  };
};

async function fetchDaybook(date: string): Promise<DaybookResponse> {
  const res = await fetch(`/api/daybook?date=${encodeURIComponent(date)}`);
  if (!res.ok) throw new Error("Failed to load daybook");
  const json = (await res.json()) as { data: DaybookResponse };
  return json.data;
}

function friendlyDateLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE");
}

function modeBadgeVariant(mode: string) {
  if (mode === "cash") return "secondary" as const;
  if (mode === "credit") return "destructive" as const;
  if (mode === "mixed") return "outline" as const;
  return "default" as const;
}

function DaybookSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-56 rounded-lg" />
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Banknote;
  accent?: "cash" | "online" | "sundry" | "closing";
  onClick?: () => void;
}) {
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md bg-background/60",
          accent === "cash" && "text-emerald-500",
          accent === "online" && "text-sky-500",
          accent === "sundry" && "text-amber-500",
          accent === "closing" && "text-foreground",
          !accent && "text-muted-foreground",
        )}
      >
        {onClick ? (
          <ChevronRight className="size-4 text-muted-foreground" />
        ) : (
          <Icon className="size-4" />
        )}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-lg bg-muted/30 p-3 text-left transition-colors hover:bg-muted/50"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg bg-muted/30 p-3 text-left">{content}</div>
  );
}

export default function DaybookPage() {
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const [sundryOpen, setSundryOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseReason, setExpenseReason] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  const daybook = useQuery({
    queryKey: ["daybook", dateStr],
    queryFn: () => fetchDaybook(dateStr),
  });

  const [morningCash, setMorningCash] = useState(0);
  const [notes, setNotes] = useState("");
  const [expenses, setExpenses] = useState<
    Array<{ key: string; reason: string; amount: number }>
  >([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!daybook.data) return;
    setMorningCash(daybook.data.morningCash ?? 0);
    setNotes(daybook.data.notes ?? "");
    setExpenses(
      (daybook.data.expenses ?? []).map((e) => ({
        key: e._id,
        reason: e.reason,
        amount: e.amount,
      })),
    );
    setExpenseReason("");
    setExpenseAmount("");
    setDirty(false);
  }, [daybook.data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/daybook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: `${dateStr}T12:00:00`,
          morningCash,
          notes,
          expenses: expenses.map((e) => ({
            reason: e.reason,
            amount: e.amount,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      return body;
    },
    onSuccess: () => {
      toast.success("Daybook saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["daybook", dateStr] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addExpenseLocal = () => {
    const reason = expenseReason.trim();
    const amount = Number(expenseAmount);
    if (!reason || !(amount > 0)) return;
    setExpenses((prev) => [
      ...prev,
      { key: `local-${Date.now()}-${prev.length}`, reason, amount },
    ]);
    setExpenseReason("");
    setExpenseAmount("");
    setDirty(true);
  };

  const removeExpenseLocal = (key: string) => {
    setExpenses((prev) => prev.filter((e) => e.key !== key));
    setDirty(true);
  };

  const changeDay = (offset: number) => {
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + offset);
      return next;
    });
  };

  const expenseTotal = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses],
  );
  const returns = daybook.data?.returns ?? [];
  const totals = daybook.data?.totals;
  const saleReturnCash = totals?.saleReturnCash ?? 0;
  const purchaseReturnCash = totals?.purchaseReturnCash ?? 0;
  const purchaseCash = totals?.purchaseCash ?? 0;
  const receiptCash = totals?.receiptCash ?? 0;
  const paymentCash = totals?.paymentCash ?? 0;
  const closingCash = useMemo(() => {
    const billCash = totals?.cash ?? 0;
    return (
      (Number(morningCash) || 0) +
      billCash +
      receiptCash +
      purchaseReturnCash -
      expenseTotal -
      saleReturnCash -
      paymentCash -
      purchaseCash
    );
  }, [
    totals?.cash,
    expenseTotal,
    morningCash,
    purchaseReturnCash,
    saleReturnCash,
    receiptCash,
    paymentCash,
    purchaseCash,
  ]);

  const billCount = daybook.data?.totals.billCount ?? 0;
  const sundries = daybook.data?.sundries ?? [];
  const sundryTotal = daybook.data?.totals.sundry ?? 0;
  const sundrySections = useMemo(() => {
    const map = new Map<
      string,
      { label: string; total: number; rows: DaybookSundryRow[] }
    >();
    for (const row of sundries) {
      const label = row.label.trim() || "Sundry";
      const existing = map.get(label.toLowerCase());
      if (existing) {
        existing.rows.push(row);
        existing.total += row.amount;
      } else {
        map.set(label.toLowerCase(), {
          label,
          total: row.amount,
          rows: [row],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [sundries]);
  const canSave = dirty || !daybook.data?.saved;
  const saveDisabled = save.isPending || (!dirty && daybook.data?.saved);
  const canAddExpense =
    expenseReason.trim().length > 0 && Number(expenseAmount) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Daybook</h1>
            {daybook.data ? (
              <Badge
                variant={daybook.data.saved && !dirty ? "secondary" : "outline"}
              >
                {dirty
                  ? "Unsaved"
                  : daybook.data.saved
                    ? "Saved"
                    : "Not saved"}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {friendlyDateLabel(selectedDate)} ·{" "}
            {format(selectedDate, "dd MMM yyyy")}
            {billCount > 0
              ? ` · ${billCount} bill${billCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => changeDay(-1)}
              title="Previous day"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="date"
              value={dateStr}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(new Date(`${e.target.value}T12:00:00`));
                }
              }}
              className="w-40"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => changeDay(1)}
              title="Next day"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {!isToday(selectedDate) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </Button>
          ) : null}
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => save.mutate()}
            disabled={saveDisabled || daybook.isLoading || daybook.isError}
          >
            <Save className="size-3.5" />
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {daybook.isLoading ? (
        <DaybookSkeleton />
      ) : daybook.isError ? (
        <EmptyState
          icon={BookOpen}
          title="Could not load daybook"
          description="Check your connection and try again."
          action={{ label: "Retry", onClick: () => daybook.refetch() }}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Cash collected"
              value={formatMoney(daybook.data?.totals.cash ?? 0)}
              hint="From today's sale bills"
              icon={Banknote}
              accent="cash"
            />
            <StatTile
              label="Online collected"
              value={formatMoney(daybook.data?.totals.online ?? 0)}
              hint="UPI / bank transfers"
              icon={Landmark}
              accent="online"
            />
            <StatTile
              label="Sundry total"
              value={formatMoney(sundryTotal)}
              hint={
                sundries.length > 0
                  ? `${sundrySections.length} type${sundrySections.length === 1 ? "" : "s"} · tap for details`
                  : "No sundry today"
              }
              icon={Receipt}
              accent="sundry"
              onClick={
                sundries.length > 0 ? () => setSundryOpen(true) : undefined
              }
            />
            <StatTile
              label="Closing cash"
              value={
                closingCash < 0
                  ? `${formatMoney(Math.abs(closingCash))} short`
                  : formatMoney(closingCash)
              }
              hint="Morning + sales + receipts + purchase returns − expenses − sale returns − payments − purchases"
              icon={BookOpen}
              accent="closing"
            />
          </div>

          <div className="grid gap-2 rounded-lg border p-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex justify-between gap-2">
              <span>Morning</span>
              <span className="tabular-nums text-foreground">
                {formatMoney(Number(morningCash) || 0)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>+ Sale cash</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatMoney(totals?.cash ?? 0)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>+ Receipts (cash)</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatMoney(receiptCash)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>+ Purchase returns</span>
              <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatMoney(purchaseReturnCash)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>− Expenses</span>
              <span className="tabular-nums text-red-600 dark:text-red-400">
                {formatMoney(expenseTotal)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>− Sale returns</span>
              <span className="tabular-nums text-red-600 dark:text-red-400">
                {formatMoney(saleReturnCash)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>− Payments (cash)</span>
              <span className="tabular-nums text-red-600 dark:text-red-400">
                {formatMoney(paymentCash)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>− Purchase cash</span>
              <span className="tabular-nums text-red-600 dark:text-red-400">
                {formatMoney(purchaseCash)}
              </span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="morningCash">Morning cash</Label>
              <Input
                id="morningCash"
                type="number"
                step="0.01"
                min="0"
                value={morningCash}
                onChange={(e) => {
                  setMorningCash(Number(e.target.value) || 0);
                  setDirty(true);
                }}
                className="h-10 text-sm font-semibold tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dayNotes">Day notes</Label>
              <Textarea
                id="dayNotes"
                rows={2}
                className="min-h-10 resize-none text-sm"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
                placeholder="Optional notes for this day…"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-sm font-medium">Bills</h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                {billCount} total
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="border-r border-border px-2 py-1.5 text-left font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="border-r border-border px-2 py-1.5 text-right font-medium text-muted-foreground">
                      Cash
                    </th>
                    <th className="border-r border-border px-2 py-1.5 text-right font-medium text-muted-foreground">
                      Online
                    </th>
                    <th className="border-r border-border px-2 py-1.5 text-left font-medium text-muted-foreground">
                      Mode
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                      Bill total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(daybook.data?.bills ?? []).length === 0 ? (
                    <tr className="border-b border-border">
                      <td
                        colSpan={5}
                        className="px-2 py-6 text-center text-muted-foreground"
                      >
                        No sale bills on {format(selectedDate, "dd MMM yyyy")}.
                      </td>
                    </tr>
                  ) : (
                    daybook.data?.bills.map((bill) => (
                      <tr key={bill._id} className="border-b border-border">
                        <td className="border-r border-border px-2 py-1.5">
                          <Link
                            href={`/billing?billId=${bill._id}`}
                            className="font-medium hover:underline underline-offset-2"
                          >
                            {bill.displayName || "Walk-in"}
                          </Link>
                        </td>
                        <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                          {bill.cash > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {formatMoney(bill.cash)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                          {bill.online > 0 ? (
                            <span className="text-sky-600 dark:text-sky-400">
                              {formatMoney(bill.online)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-r border-border px-2 py-1.5 capitalize text-muted-foreground">
                          {bill.paymentMode}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {formatMoney(bill.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Expenses</h2>
                <p className="text-[11px] text-muted-foreground">
                  Saved with daybook · returns are loaded from bills
                </p>
              </div>
              <button
                type="button"
                className="text-xs tabular-nums text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                onClick={() => setExpenseOpen(true)}
                disabled={expenses.length === 0 && returns.length === 0}
              >
                {formatMoney(expenseTotal)}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="border-r border-border px-2 py-1.5 text-left font-medium text-muted-foreground">
                      Reason
                    </th>
                    <th className="border-r border-border px-2 py-1.5 text-right font-medium text-muted-foreground">
                      Amount
                    </th>
                    <th className="w-8 px-1 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.key} className="border-b border-border">
                      <td className="border-r border-border px-2 py-1.5">
                        {expense.reason}
                      </td>
                      <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                        {formatMoney(expense.amount)}
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeExpenseLocal(expense.key)}
                          title="Remove expense"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {returns.map((ret) => (
                    <tr key={ret._id} className="border-b border-border">
                      <td className="border-r border-border px-2 py-1.5">
                        <Link
                          href={`/billing?billId=${ret._id}`}
                          className="inline-flex items-center gap-1.5 hover:underline underline-offset-2"
                        >
                          <span className="font-medium">
                            {ret.displayName || "Walk-in"}
                          </span>
                          <span className="rounded px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/50">
                            {ret.billKind === "sale_return"
                              ? "Sale return"
                              : "Purchase return"}
                          </span>
                        </Link>
                      </td>
                      <td className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                        {ret.cash > 0 ? (
                          <span
                            className={
                              ret.billKind === "sale_return"
                                ? "text-red-600 dark:text-red-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            }
                          >
                            {ret.billKind === "sale_return" ? "−" : "+"}
                            {formatMoney(ret.cash)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {formatMoney(ret.total)}
                            <span className="ml-1 text-[10px]">(non-cash)</span>
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-0.5 text-center text-muted-foreground">
                        —
                      </td>
                    </tr>
                  ))}

                  {expenses.length === 0 && returns.length === 0 ? (
                    <tr className="border-b border-border">
                      <td
                        colSpan={3}
                        className="px-2 py-3 text-center text-muted-foreground"
                      >
                        No expenses or returns yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (canAddExpense) addExpenseLocal();
              }}
            >
              <Input
                value={expenseReason}
                onChange={(e) => setExpenseReason(e.target.value)}
                placeholder="Reason (e.g. tea, travel)"
                className="h-9 flex-1 text-sm"
                aria-label="Expense reason"
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="Amount"
                className="h-9 w-full text-sm tabular-nums sm:w-32"
                aria-label="Expense amount"
              />
              <Button
                type="submit"
                size="sm"
                className="h-9 gap-1.5 shrink-0"
                disabled={!canAddExpense}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </form>
          </div>

          {canSave ? (
            <div className="sticky bottom-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8 supports-[backdrop-filter]:bg-background/80">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {dirty
                    ? "Unsaved morning cash, notes, or expenses."
                    : "Not saved yet — Save stores morning cash and expenses."}
                </p>
                <Button
                  type="button"
                  className="gap-1.5"
                  onClick={() => save.mutate()}
                  disabled={saveDisabled}
                >
                  <Save className="size-3.5" />
                  {save.isPending ? "Saving…" : "Save daybook"}
                </Button>
              </div>
            </div>
          ) : null}

          <Dialog open={sundryOpen} onOpenChange={setSundryOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Sundry details</DialogTitle>
                <DialogDescription>
                  {format(selectedDate, "dd MMM yyyy")} · total{" "}
                  {formatMoney(sundryTotal)}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
                {sundrySections.map((section) => (
                  <div key={section.label} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-medium">{section.label}</h3>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatMoney(section.total)}
                      </p>
                    </div>
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="border-r border-border px-2 py-1.5 text-left font-medium text-muted-foreground">
                            Name
                          </th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, i) => (
                          <tr
                            key={`${row.billId}-${i}`}
                            className="border-b border-border"
                          >
                            <td className="border-r border-border px-2 py-1.5">
                              <Link
                                href={`/billing?billId=${row.billId}`}
                                className="font-medium hover:underline underline-offset-2"
                                onClick={() => setSundryOpen(false)}
                              >
                                {row.displayName || "Walk-in"}
                              </Link>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatMoney(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Expenses & returns</DialogTitle>
                <DialogDescription>
                  {format(selectedDate, "dd MMM yyyy")} · expenses{" "}
                  {formatMoney(expenseTotal)}
                  {returns.length > 0
                    ? ` · ${returns.length} return${returns.length === 1 ? "" : "s"}`
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {expenses.map((expense) => (
                  <li
                    key={expense.key}
                    className="flex items-start justify-between gap-4 rounded-lg px-2 py-2.5 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{expense.reason}</p>
                      <p className="text-xs text-muted-foreground">Expense</p>
                    </div>
                    <p className="shrink-0 text-sm font-medium tabular-nums">
                      {formatMoney(expense.amount)}
                    </p>
                  </li>
                ))}
                {returns.map((ret) => (
                  <li
                    key={ret._id}
                    className="flex items-start justify-between gap-4 rounded-lg px-2 py-2.5 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {ret.displayName || "Walk-in"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ret.billKind === "sale_return"
                          ? "Sale return"
                          : "Purchase return"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium tabular-nums">
                      {formatMoney(ret.total)}
                    </p>
                  </li>
                ))}
              </ul>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
