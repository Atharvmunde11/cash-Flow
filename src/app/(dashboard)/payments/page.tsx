"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Trash2, Pencil, Plus } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { PartyCombobox } from "@/components/forms/party-combobox";
import { PaginationControls } from "@/components/shared/pagination-controls";

type BankAccount = { _id: string; accountName: string; bankName: string };
type Party = { _id: string; name: string; partyType: string };

type Payment = {
  _id: string;
  partyId: Party | string;
  amount: number;
  paymentMode: "cash" | "upi" | "bank";
  bankAccountId?: BankAccount | null;
  date: string;
  notes?: string;
  direction: "received" | "paid";
  createdAt: string;
};

async function fetchPayments(today: boolean) {
  const url = today ? "/api/payments?today=1" : "/api/payments";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: Payment[] }).data;
}

async function fetchBankAccounts() {
  const res = await fetch("/api/bank-accounts");
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: BankAccount[] }).data;
}

export default function PaymentsPage() {
  const qc = useQueryClient();
  const [todayOnly, setTodayOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Payment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [search, setSearch] = useState("");

  // Form state
  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "upi" | "bank">("cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [direction, setDirection] = useState<"received" | "paid">("received");

  const payments = useQuery({
    queryKey: ["payments", todayOnly],
    queryFn: () => fetchPayments(todayOnly),
  });

  const bankAccounts = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: fetchBankAccounts,
  });

  const filtered = useMemo(() => {
    if (!payments.data) return [];
    if (!search.trim()) return payments.data;
    const q = search.toLowerCase();
    return payments.data.filter((p) => {
      const name = typeof p.partyId === "object" ? p.partyId.name : "";
      return (
        name.toLowerCase().includes(q) ||
        (p.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [payments.data, search]);

  const pageSize = 12;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedPayments = filtered.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  function resetForm() {
    setPartyId("");
    setPartyName("");
    setAmount("");
    setMode("cash");
    setBankAccountId("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
    setDirection("received");
  }

  function openCreate() {
    setEditTarget(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(p: Payment) {
    setEditTarget(p);
    const party = typeof p.partyId === "object" ? p.partyId : null;
    setPartyId(party?._id ?? "");
    setPartyName(party?.name ?? "");
    setAmount(String(p.amount));
    setMode(p.paymentMode);
    setBankAccountId(
      p.bankAccountId && typeof p.bankAccountId === "object"
        ? p.bankAccountId._id
        : "",
    );
    setDate(format(new Date(p.date), "yyyy-MM-dd"));
    setNotes(p.notes ?? "");
    setDirection(p.direction);
    setDialogOpen(true);
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!partyId) throw new Error("Select a party");
      if (!amount || Number(amount) <= 0)
        throw new Error("Enter a valid amount");
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          amount: Number(amount),
          paymentMode: mode,
          bankAccountId: bankAccountId || undefined,
          date: new Date(`${date}T12:00:00`).toISOString(),
          notes,
          direction,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error("No target");
      const res = await fetch(`/api/payments/${editTarget._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          amount: Number(amount),
          paymentMode: mode,
          direction,
          notes,
          date: new Date(`${date}T12:00:00`).toISOString(),
          bankAccountId: bankAccountId || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Payment updated");
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Payment deleted");
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalIn = filtered
    .filter((p) => p.direction === "received")
    .reduce((s, p) => s + p.amount, 0);
  const totalOut = filtered
    .filter((p) => p.direction === "paid")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Additional credits and debits for parties outside of bills.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-1" /> Add payment
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by party or notes…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-64"
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="todayOnly"
            checked={todayOnly}
            onChange={(e) => {
              setTodayOnly(e.target.checked);
              setPage(1);
            }}
            className="rounded"
          />
          <Label
            htmlFor="todayOnly"
            className="text-sm font-normal cursor-pointer"
          >
            Today only
          </Label>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-green-600">In: {formatMoney(totalIn)}</span>
        <span className="text-red-600">Out: {formatMoney(totalOut)}</span>
        <span className="text-muted-foreground">
          Net: {formatMoney(totalIn - totalOut)}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Bank Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedPayments.map((p) => {
              const party = typeof p.partyId === "object" ? p.partyId : null;
              const bank =
                p.bankAccountId && typeof p.bankAccountId === "object"
                  ? p.bankAccountId
                  : null;
              return (
                <TableRow
                  key={p._id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => openEdit(p)}
                >
                  <TableCell className="text-xs tabular-nums">
                    {format(new Date(p.date), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {party?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.direction === "received" ? "default" : "secondary"
                      }
                      className="text-[10px] capitalize"
                    >
                      {p.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize text-xs">
                    {p.paymentMode}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {bank ? `${bank.accountName} (${bank.bankName})` : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-medium ${
                      p.direction === "received"
                        ? "text-green-700"
                        : "text-red-600"
                    }`}
                  >
                    {p.direction === "received" ? "+" : "-"}
                    {formatMoney(p.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-40 truncate">
                    {p.notes || "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {paginatedPayments.length === 0 && !payments.isFetching && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-12 text-center text-muted-foreground"
                >
                  No payments found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <PaginationControls
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={filtered.length}
          itemLabel="payments"
          onPageChange={setPage}
        />
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit payment" : "New payment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Party</Label>
              <PartyCombobox
                value={partyName}
                onChange={(val, meta) => {
                  if (meta?.isExisting) {
                    setPartyId(meta.id!);
                    setPartyName(meta.name!);
                  } else {
                    setPartyId("");
                    setPartyName(val);
                  }
                }}
                placeholder="Select party"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as "received" | "paid")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">
                    Received (customer pays us)
                  </SelectItem>
                  <SelectItem value="paid">Paid (we pay supplier)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment mode</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "cash" | "upi" | "bank")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "bank" && (
              <div className="space-y-1.5">
                <Label>Bank account</Label>
                <Select
                  value={bankAccountId}
                  onValueChange={(val) => setBankAccountId(val || "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {bankAccounts.data?.map((b) => (
                      <SelectItem key={b._id} value={b._id}>
                        {b.accountName} — {b.bankName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => (editTarget ? update.mutate() : create.mutate())}
                disabled={create.isPending || update.isPending}
              >
                {create.isPending || update.isPending ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the payment and its ledger effect.
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
