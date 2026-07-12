"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Employee = {
  _id: string;
  name: string;
  phone: string;
  role: string;
  address: string;
  monthlySalary: number;
  payDay: number;
  isActive: boolean;
  notes: string;
  openAdvances: number;
  netPayableHint: number;
  joinDate: string;
};

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");

  const employee = useQuery({
    queryKey: ["employee", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/employees/${id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body.data as Employee;
    },
  });

  const emp = employee.data;

  if (employee.isError) {
    return (
      <div className="space-y-4">
        <Link href="/employees" className="text-sm text-muted-foreground">
          ← Back to employees
        </Link>
        <p className="text-destructive">
          {(employee.error as Error).message || "Employee not found"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/employees"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Employees
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {emp?.name ?? "Loading…"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[emp?.role, emp?.phone].filter(Boolean).join(" · ") ||
              "Staff profile"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/attendance"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <CalendarDays className="size-4" />
            Attendance
          </Link>
          <Link
            href="/payrolls"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <Wallet className="size-4" />
            Payrolls
          </Link>
        </div>
      </div>

      {emp ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Monthly salary</div>
            <div className="text-lg font-medium">
              {formatMoney(emp.monthlySalary)}
            </div>
            <div className="text-xs text-muted-foreground">
              Pay day: {emp.payDay} of month
            </div>
          </div>
          <div className="rounded-md border p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Open advances</div>
            <div className="text-lg font-medium text-amber-700 dark:text-amber-400">
              {formatMoney(emp.openAdvances)}
            </div>
            <div className="text-xs text-muted-foreground">
              Deducted on next salary
            </div>
          </div>
          <div className="rounded-md border p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Est. next net</div>
            <div className="text-lg font-medium">
              {formatMoney(emp.netPayableHint)}
            </div>
            <Badge variant={emp.isActive ? "default" : "secondary"}>
              {emp.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="rounded-md border p-4 space-y-1 sm:col-span-2">
            <div className="text-xs text-muted-foreground">Address</div>
            <div>{emp.address || "—"}</div>
          </div>
          <div className="rounded-md border p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Joined</div>
            <div>{new Date(emp.joinDate).toLocaleDateString()}</div>
          </div>
          {emp.notes ? (
            <div className="rounded-md border p-4 space-y-1 sm:col-span-2 lg:col-span-3">
              <div className="text-xs text-muted-foreground">Notes</div>
              <div>{emp.notes}</div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
