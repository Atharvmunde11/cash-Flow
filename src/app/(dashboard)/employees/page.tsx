"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type EmployeeRow = {
  _id: string;
  name: string;
  phone: string;
  role: string;
  address: string;
  joinDate: string;
  monthlySalary: number;
  payDay: number;
  isActive: boolean;
  notes: string;
  openAdvances: number;
  netPayableHint: number;
};

const emptyForm = {
  name: "",
  phone: "",
  role: "",
  monthlySalary: "",
  isActive: true,
};

async function fetchEmployees() {
  const res = await fetch("/api/employees");
  if (!res.ok) throw new Error("Failed to load employees");
  return ((await res.json()) as { data: EmployeeRow[] }).data;
}

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const employees = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...(employees.data ?? [])].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (!q) return list;
    return list.filter((e) =>
      [e.name, e.phone, e.role].join(" ").toLowerCase().includes(q),
    );
  }, [employees.data, search]);

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(e: EmployeeRow) {
    setEditTarget(e);
    setForm({
      name: e.name,
      phone: e.phone,
      role: e.role,
      monthlySalary: String(e.monthlySalary || ""),
      isActive: e.isActive,
    });
    setDialogOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        role: form.role.trim(),
        address: editTarget?.address ?? "",
        monthlySalary: Number(form.monthlySalary) || 0,
        payDay: editTarget?.payDay ?? 1,
        isActive: form.isActive,
        notes: editTarget?.notes ?? "",
      };
      const url = editTarget
        ? `/api/employees/${editTarget._id}`
        : "/api/employees";
      const method = editTarget ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success(editTarget ? "Updated" : "Employee added");
      qc.invalidateQueries({ queryKey: ["employees"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["employees"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} staff
            {(employees.data ?? []).some((e) => !e.isActive)
              ? ` · ${(employees.data ?? []).filter((e) => e.isActive).length} active`
              : ""}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <Input
        className="max-w-sm"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="divide-y rounded-md border">
        {filtered.map((e) => (
          <div
            key={e._id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
              !e.isActive && "opacity-50",
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => openEdit(e)}
            >
              <div className="font-medium">{e.name}</div>
              <div className="text-xs text-muted-foreground">
                {[e.role, e.phone].filter(Boolean).join(" · ") || "No role"}
              </div>
            </button>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="tabular-nums font-medium">
                  {formatMoney(e.monthlySalary)}
                </div>
                {e.openAdvances > 0 ? (
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    Advance {formatMoney(e.openAdvances)}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {e.isActive ? "Active" : "Inactive"}
                  </div>
                )}
              </div>
              <div className="flex gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => openEdit(e)}
                  aria-label="Edit"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleteTarget(e)}
                  aria-label="Delete"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {employees.isLoading
              ? "Loading…"
              : "No employees yet. Tap Add to register someone."}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Day-to-day:{" "}
        <Link href="/attendance" className="underline underline-offset-2">
          Attendance
        </Link>
        {" · "}
        <Link href="/payrolls" className="underline underline-offset-2">
          Payrolls
        </Link>
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit employee" : "Add employee"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Input
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="Helper…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Monthly salary</Label>
              <Input
                type="number"
                min={0}
                value={form.monthlySalary}
                onChange={(e) =>
                  setForm({ ...form, monthlySalary: e.target.value })
                }
                placeholder="0"
              />
            </div>
            {editTarget ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="emp-active">Active</Label>
                <Switch
                  id="emp-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                />
              </div>
            ) : null}
            <Button
              className="w-full"
              disabled={!form.name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : editTarget ? "Save" : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes their attendance, advances, and salary history too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && remove.mutate(deleteTarget._id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
