"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PaginationControls } from "@/components/shared/pagination-controls";

type BankAccount = {
  _id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode?: string;
  upiId?: string;
  isPrimary: boolean;
  notes?: string;
};

async function fetchAccounts() {
  const res = await fetch("/api/bank-accounts");
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: BankAccount[] }).data;
}

const emptyForm = {
  accountName: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  upiId: "",
  isPrimary: false,
  notes: "",
};

export default function BankAccountsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BankAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyForm);

  const accounts = useQuery({ queryKey: ["bank-accounts"], queryFn: fetchAccounts });

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts.data ?? [];
    return (accounts.data ?? []).filter((account) =>
      [
        account.accountName,
        account.bankName,
        account.accountNumber,
        account.ifscCode ?? "",
        account.upiId ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [accounts.data, search]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const paginatedAccounts = filteredAccounts.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(a: BankAccount) {
    setEditTarget(a);
    setForm({
      accountName: a.accountName,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      ifscCode: a.ifscCode ?? "",
      upiId: a.upiId ?? "",
      isPrimary: a.isPrimary,
      notes: a.notes ?? "",
    });
    setDialogOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const url = editTarget ? `/api/bank-accounts/${editTarget._id}` : "/api/bank-accounts";
      const method = editTarget ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success(editTarget ? "Account updated" : "Account created");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bank-accounts/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Account deleted");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bank Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Manage bank accounts for UPI and bank transfer payments.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-1" /> Add account
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search accounts, bank, IFSC, or UPI..."
        className="max-w-sm"
      />

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Account name</TableHead>
              <TableHead>Bank</TableHead>
              <TableHead>Account #</TableHead>
              <TableHead>IFSC</TableHead>
              <TableHead>UPI ID</TableHead>
              <TableHead>Primary</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedAccounts.map((a) => (
              <TableRow key={a._id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(a)}>
                <TableCell className="font-medium">{a.accountName}</TableCell>
                <TableCell>{a.bankName}</TableCell>
                <TableCell className="font-mono text-xs">{a.accountNumber}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.ifscCode || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.upiId || "—"}</TableCell>
                <TableCell>
                  {a.isPrimary && (
                    <Badge variant="default" className="text-[10px] gap-1">
                      <Star className="size-2.5" /> Primary
                    </Badge>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(a)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {paginatedAccounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  No bank accounts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <PaginationControls
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={filteredAccounts.length}
          itemLabel="accounts"
          onPageChange={setPage}
        />
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit account" : "New bank account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Account name</Label>
                <Input
                  value={form.accountName}
                  onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                  placeholder="e.g. Business Account"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bank name</Label>
                <Input
                  value={form.bankName}
                  onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                  placeholder="e.g. SBI, HDFC"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Account number</Label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>IFSC code</Label>
                <Input
                  value={form.ifscCode}
                  onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>UPI ID</Label>
                <Input
                  value={form.upiId}
                  onChange={(e) => setForm((f) => ({ ...f, upiId: e.target.value }))}
                  placeholder="name@upi"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isPrimary}
                onCheckedChange={(c) => setForm((f) => ({ ...f, isPrimary: c }))}
                id="isPrimary"
              />
              <Label htmlFor="isPrimary" className="text-sm font-normal cursor-pointer">
                Set as primary account
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the bank account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
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
