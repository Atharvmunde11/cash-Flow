"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { endOfMonth, startOfMonth } from "@/lib/employee-dates";
import { cn } from "@/lib/utils";
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

type Employee = {
  _id: string;
  name: string;
  role: string;
  monthlySalary: number;
  openAdvances: number;
  netPayableHint: number;
  isActive: boolean;
};

type PayrollRow = {
  _id: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  grossSalary: number;
  advancesDeducted: number;
  netPaid: number;
  paidAt: string;
  paymentMode: string;
  notes: string;
};

type AdvanceRow = {
  _id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  date: string;
  notes: string;
  status: "open" | "deducted" | "void";
};

type PayMode = "cash" | "upi" | "bank";

function toInputDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toMonthValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthBounds(monthValue: string) {
  const [y, m] = monthValue.split("-").map(Number);
  const start = startOfMonth(new Date(y, m - 1, 1));
  const end = endOfMonth(start);
  return { start: toInputDate(start), end: toInputDate(end), startDate: start };
}

function shiftMonth(monthValue: string, delta: number) {
  const [y, m] = monthValue.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toMonthValue(d);
}

function monthLabel(monthValue: string) {
  const [y, m] = monthValue.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function periodsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

export default function PayrollsPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(toMonthValue());
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [advanceDraft, setAdvanceDraft] = useState<Record<string, string>>({});
  const [payingId, setPayingId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [voidAdvance, setVoidAdvance] = useState<AdvanceRow | null>(null);

  const { start: periodStart, end: periodEnd } = useMemo(
    () => monthBounds(month),
    [month],
  );

  const employees = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      return ((await res.json()) as { data: Employee[] }).data;
    },
  });

  const payrolls = useQuery({
    queryKey: ["payrolls"],
    queryFn: async () => {
      const res = await fetch("/api/payrolls");
      if (!res.ok) throw new Error("Failed");
      return ((await res.json()) as { data: PayrollRow[] }).data;
    },
  });

  const advances = useQuery({
    queryKey: ["advances"],
    queryFn: async () => {
      const res = await fetch("/api/advances?status=open");
      if (!res.ok) throw new Error("Failed");
      return ((await res.json()) as { data: AdvanceRow[] }).data;
    },
  });

  const activeEmployees = useMemo(
    () =>
      (employees.data ?? [])
        .filter((e) => e.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees.data],
  );

  const paidByEmployee = useMemo(() => {
    const map = new Map<string, PayrollRow>();
    for (const row of payrolls.data ?? []) {
      if (
        periodsOverlap(row.periodStart, row.periodEnd, periodStart, periodEnd)
      ) {
        map.set(row.employeeId, row);
      }
    }
    return map;
  }, [payrolls.data, periodStart, periodEnd]);

  const dueEmployees = activeEmployees.filter((e) => !paidByEmployee.has(e._id));
  const totalDue = dueEmployees.reduce(
    (s, e) => s + Math.max(0, e.monthlySalary - e.openAdvances),
    0,
  );

  const payOne = useMutation({
    mutationFn: async (emp: Employee) => {
      setPayingId(emp._id);
      const res = await fetch("/api/payrolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: emp._id,
          periodStart,
          periodEnd,
          paidAt: toInputDate(),
          paymentMode: payMode,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body.data as PayrollRow;
    },
    onSuccess: (row) => {
      toast.success(`Paid ${row.employeeName} ${formatMoney(row.netPaid)}`);
      qc.invalidateQueries({ queryKey: ["payrolls"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["advances"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPayingId(null),
  });

  const payAll = useMutation({
    mutationFn: async () => {
      let paid = 0;
      for (const emp of dueEmployees) {
        const res = await fetch("/api/payrolls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: emp._id,
            periodStart,
            periodEnd,
            paidAt: toInputDate(),
            paymentMode: payMode,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Failed for ${emp.name}`);
        paid += 1;
      }
      return paid;
    },
    onSuccess: (n) => {
      toast.success(`Paid ${n} employee(s)`);
      qc.invalidateQueries({ queryKey: ["payrolls"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["advances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const giveAdvance = useMutation({
    mutationFn: async (emp: Employee) => {
      const amount = Number(advanceDraft[emp._id] ?? 0);
      if (!(amount > 0)) throw new Error("Enter an amount");
      setAdvancingId(emp._id);
      const res = await fetch(`/api/employees/${emp._id}/advances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          date: toInputDate(),
          notes: "",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return { emp, amount };
    },
    onSuccess: ({ emp, amount }) => {
      toast.success(`Gave ${formatMoney(amount)} to ${emp.name}`);
      setAdvanceDraft((prev) => ({ ...prev, [emp._id]: "" }));
      qc.invalidateQueries({ queryKey: ["advances"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setAdvancingId(null),
  });

  const deleteAdvance = useMutation({
    mutationFn: async (row: AdvanceRow) => {
      const res = await fetch(`/api/employees/${row.employeeId}/advances`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row._id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete advance");
      return row;
    },
    onSuccess: (row) => {
      toast.success(`Removed advance for ${row.employeeName}`);
      setVoidAdvance(null);
      qc.invalidateQueries({ queryKey: ["advances"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recentPayrolls = (payrolls.data ?? []).slice(0, 12);
  const openAdvances = advances.data ?? [];
  const busy = payOne.isPending || payAll.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payrolls</h1>
          <p className="text-sm text-muted-foreground">
            One tap to pay. Advances come off the next salary.
          </p>
        </div>
        <Button
          disabled={dueEmployees.length === 0 || busy}
          onClick={() => payAll.mutate()}
        >
          {payAll.isPending
            ? "Paying…"
            : dueEmployees.length === 0
              ? "All paid"
              : `Pay all · ${formatMoney(totalDue)}`}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="pl-1 text-sm text-muted-foreground">
            {monthLabel(month)}
          </span>
        </div>

        <div
          className="inline-flex rounded-md border p-0.5"
          role="group"
          aria-label="Payment mode"
        >
          {(["cash", "upi", "bank"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPayMode(mode)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                "first:rounded-l-[5px] last:rounded-r-[5px]",
                payMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">
          {dueEmployees.length} due · {activeEmployees.length - dueEmployees.length}{" "}
          paid
        </span>
      </div>

      <div className="divide-y rounded-md border">
        {activeEmployees.map((emp) => {
          const paid = paidByEmployee.get(emp._id);
          const net = Math.max(0, emp.monthlySalary - emp.openAdvances);
          const draft = advanceDraft[emp._id] ?? "";
          return (
            <div
              key={emp._id}
              className={cn(
                "flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                paid && "bg-muted/20",
              )}
            >
              <div className="min-w-0">
                <Link
                  href={`/employees/${emp._id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {emp.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {emp.role ? `${emp.role} · ` : ""}
                  Salary {formatMoney(emp.monthlySalary)}
                  {emp.openAdvances > 0
                    ? ` − advance ${formatMoney(emp.openAdvances)}`
                    : ""}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {paid ? (
                  <span className="rounded-md border border-emerald-600/40 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                    Paid {formatMoney(paid.netPaid)}
                  </span>
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Advance"
                        className="h-8 w-24"
                        value={draft}
                        onChange={(e) =>
                          setAdvanceDraft((prev) => ({
                            ...prev,
                            [emp._id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && Number(draft) > 0) {
                            giveAdvance.mutate(emp);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          !(Number(draft) > 0) || advancingId === emp._id || busy
                        }
                        onClick={() => giveAdvance.mutate(emp)}
                      >
                        {advancingId === emp._id ? "…" : "Give"}
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy || payingId === emp._id}
                      onClick={() => payOne.mutate(emp)}
                    >
                      {payingId === emp._id
                        ? "Paying…"
                        : `Pay ${formatMoney(net)}`}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {activeEmployees.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {employees.isLoading
              ? "Loading…"
              : "No active employees. Add staff first."}
          </div>
        ) : null}
      </div>

      {openAdvances.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Open advances
          </h2>
          <div className="divide-y rounded-md border">
            {openAdvances.slice(0, 8).map((row) => (
              <div
                key={row._id}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              >
                <span>
                  {row.employeeName}
                  <span className="text-muted-foreground">
                    {" · "}
                    {new Date(row.date).toLocaleDateString()}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-amber-600 dark:text-amber-400">
                    {formatMoney(row.amount)}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete advance for ${row.employeeName}`}
                    disabled={deleteAdvance.isPending}
                    onClick={() => setVoidAdvance(row)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recent payments
        </h2>
        <div className="divide-y rounded-md border">
          {recentPayrolls.map((row) => (
            <div
              key={row._id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
            >
              <div>
                <span className="font-medium">{row.employeeName}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {new Date(row.periodStart).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="tabular-nums">
                {formatMoney(row.netPaid)}
                {row.advancesDeducted > 0 ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (−{formatMoney(row.advancesDeducted)} adv)
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {recentPayrolls.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No salary payments yet.
            </div>
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={Boolean(voidAdvance)}
        onOpenChange={(open) => {
          if (!open) setVoidAdvance(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete advance?</AlertDialogTitle>
            <AlertDialogDescription>
              {voidAdvance
                ? `Remove the ${formatMoney(voidAdvance.amount)} advance for ${voidAdvance.employeeName}? This cannot be undone.`
                : "Remove this advance entry?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteAdvance.isPending || !voidAdvance}
              onClick={(event) => {
                event.preventDefault();
                if (voidAdvance) deleteAdvance.mutate(voidAdvance);
              }}
            >
              {deleteAdvance.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
