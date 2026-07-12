"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Status = "present" | "absent" | "half_day" | "leave";

type Employee = {
  _id: string;
  name: string;
  role: string;
  isActive: boolean;
};

type AttendanceRow = {
  _id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  date: string;
  status: Status;
  notes: string;
};

const STATUSES: {
  value: Status;
  label: string;
  short: string;
  active: string;
}[] = [
  {
    value: "present",
    label: "Present",
    short: "P",
    active:
      "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600 hover:text-white",
  },
  {
    value: "absent",
    label: "Absent",
    short: "A",
    active:
      "bg-red-600 text-white border-red-600 hover:bg-red-600 hover:text-white",
  },
  {
    value: "half_day",
    label: "Half",
    short: "H",
    active:
      "bg-amber-500 text-white border-amber-500 hover:bg-amber-500 hover:text-white",
  },
  {
    value: "leave",
    label: "Leave",
    short: "L",
    active:
      "bg-sky-600 text-white border-sky-600 hover:bg-sky-600 hover:text-white",
  },
];

function toInputDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toInputDate(d);
}

function formatDayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const today = toInputDate();
  const yesterday = shiftDate(today, -1);
  if (iso === today) return "Today";
  if (iso === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(toInputDate());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const today = toInputDate();

  const employees = useQuery({
    queryKey: ["employees", "active"],
    queryFn: async () => {
      const res = await fetch("/api/employees?active=1");
      if (!res.ok) throw new Error("Failed to load employees");
      return ((await res.json()) as { data: Employee[] }).data;
    },
  });

  const dayAttendance = useQuery({
    queryKey: ["attendance", date],
    queryFn: async () => {
      const res = await fetch(`/api/attendance?date=${encodeURIComponent(date)}`);
      if (!res.ok) throw new Error("Failed to load attendance");
      return ((await res.json()) as { data: AttendanceRow[] }).data;
    },
  });

  const byEmployee = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of dayAttendance.data ?? []) {
      map.set(row.employeeId, row);
    }
    return map;
  }, [dayAttendance.data]);

  const activeEmployees = useMemo(
    () =>
      (employees.data ?? [])
        .filter((e) => e.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees.data],
  );

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, half_day: 0, leave: 0, unmarked: 0 };
    for (const emp of activeEmployees) {
      const s = byEmployee.get(emp._id)?.status;
      if (!s) c.unmarked += 1;
      else c[s] += 1;
    }
    return c;
  }, [activeEmployees, byEmployee]);

  function patchCache(employeeId: string, status: Status, emp: Employee) {
    qc.setQueryData<AttendanceRow[]>(["attendance", date], (old = []) => {
      const existing = old.find((r) => r.employeeId === employeeId);
      if (existing) {
        return old.map((r) =>
          r.employeeId === employeeId ? { ...r, status } : r,
        );
      }
      return [
        ...old,
        {
          _id: `temp-${employeeId}`,
          employeeId,
          employeeName: emp.name,
          employeeRole: emp.role,
          date,
          status,
          notes: "",
        },
      ];
    });
  }

  const saveOne = useMutation({
    mutationFn: async (args: {
      employeeId: string;
      status: Status;
      employee: Employee;
    }) => {
      setPendingIds((prev) => new Set(prev).add(args.employeeId));
      patchCache(args.employeeId, args.status, args.employee);
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: args.employeeId,
          date,
          status: args.status,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSettled: (_data, _err, vars) => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(vars.employeeId);
        return next;
      });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["attendance", date] });
    },
  });

  const markAll = useMutation({
    mutationFn: async (status: Status) => {
      const ids = activeEmployees.map((e) => e._id);
      if (ids.length === 0) throw new Error("No active employees");
      for (const emp of activeEmployees) {
        patchCache(emp._id, status, emp);
      }
      const res = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, status, employeeIds: ids }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body.data as { saved: number };
    },
    onSuccess: (data, status) => {
      toast.success(
        `Marked ${data.saved} as ${STATUSES.find((s) => s.value === status)?.label}`,
      );
      qc.invalidateQueries({ queryKey: ["attendance", date] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["attendance", date] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Tap a status to save — no extra clicks. Staff under{" "}
            <Link href="/employees" className="underline underline-offset-2">
              Employees
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={markAll.isPending || activeEmployees.length === 0}
            onClick={() => markAll.mutate("present")}
          >
            All present
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={markAll.isPending || activeEmployees.length === 0}
            onClick={() => markAll.mutate("absent")}
          >
            All absent
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous day"
          onClick={() => setDate((d) => shiftDate(d, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next day"
          onClick={() => setDate((d) => shiftDate(d, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
        {date !== today ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDate(today)}
          >
            Today
          </Button>
        ) : null}
        <span className="text-sm font-medium text-muted-foreground pl-1">
          {formatDayLabel(date)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ["present", counts.present, "Present"],
            ["absent", counts.absent, "Absent"],
            ["half_day", counts.half_day, "Half"],
            ["leave", counts.leave, "Leave"],
            ["unmarked", counts.unmarked, "Unmarked"],
          ] as const
        ).map(([key, n, label]) => (
          <span
            key={key}
            className={cn(
              "rounded-md border px-2.5 py-1 tabular-nums",
              key === "present" && n > 0 && "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
              key === "absent" && n > 0 && "border-red-600/40 text-red-700 dark:text-red-400",
              key === "half_day" && n > 0 && "border-amber-500/40 text-amber-700 dark:text-amber-400",
              key === "leave" && n > 0 && "border-sky-600/40 text-sky-700 dark:text-sky-400",
              key === "unmarked" && n > 0 && "border-muted-foreground/30 text-muted-foreground",
            )}
          >
            {label} {n}
          </span>
        ))}
      </div>

      <div className="divide-y rounded-md border">
        {activeEmployees.map((emp) => {
          const current = byEmployee.get(emp._id)?.status;
          const saving = pendingIds.has(emp._id);
          return (
            <div
              key={emp._id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
                !current && "bg-muted/30",
                saving && "opacity-70",
              )}
            >
              <div className="min-w-0">
                <Link
                  href={`/employees/${emp._id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {emp.name}
                </Link>
                {emp.role ? (
                  <div className="text-xs text-muted-foreground">{emp.role}</div>
                ) : null}
              </div>

              <div
                className="inline-flex rounded-md border p-0.5"
                role="group"
                aria-label={`Attendance for ${emp.name}`}
              >
                {STATUSES.map((s) => {
                  const active = current === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      disabled={saving || markAll.isPending}
                      title={s.label}
                      aria-pressed={active}
                      onClick={() => {
                        if (active) return;
                        saveOne.mutate({
                          employeeId: emp._id,
                          status: s.value,
                          employee: emp,
                        });
                      }}
                      className={cn(
                        "min-w-11 px-2.5 py-1.5 text-xs font-medium transition-colors",
                        "first:rounded-l-[5px] last:rounded-r-[5px]",
                        "border border-transparent",
                        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:pointer-events-none",
                        active
                          ? s.active
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="sm:hidden">{s.short}</span>
                      <span className="hidden sm:inline">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {activeEmployees.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {employees.isLoading
              ? "Loading…"
              : "No active employees. Register staff first."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
