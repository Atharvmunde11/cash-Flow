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
import { getPartyBalanceMeta } from "@/lib/party-balance";
import { PartyCombobox } from "@/components/forms/party-combobox";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { cn } from "@/lib/utils";

type BankAccount = { _id: string; accountName: string; bankName: string };
type Party = { _id: string; name: string; partyType: string; balance?: number };

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

type VoucherMode = "receipt" | "payment";
type Purpose = "outstanding" | "advance";

const PURPOSE_TAG: Record<Purpose, string> = {
  outstanding: "[Outstanding]",
  advance: "[Advance]",
};

function parsePurposeNotes(raw: string): { purpose: Purpose; notes: string } {
  const trimmed = (raw ?? "").trim();
  if (trimmed.startsWith(PURPOSE_TAG.advance)) {
    return {
      purpose: "advance",
      notes: trimmed.slice(PURPOSE_TAG.advance.length).trim(),
    };
  }
  if (trimmed.startsWith(PURPOSE_TAG.outstanding)) {
    return {
      purpose: "outstanding",
      notes: trimmed.slice(PURPOSE_TAG.outstanding.length).trim(),
    };
  }
  return { purpose: "outstanding", notes: trimmed };
}

function composeNotes(purpose: Purpose, notes: string) {
  const rest = notes.trim();
  return rest ? `${PURPOSE_TAG[purpose]} ${rest}` : PURPOSE_TAG[purpose];
}

function modeConfig(mode: VoucherMode) {
  if (mode === "receipt") {
    return {
      title: "Receipts",
      description:
        "Money received from customers (against dues or as advance).",
      addLabel: "Add receipt",
      dialogCreate: "New receipt",
      dialogEdit: "Edit receipt",
      empty: "No receipts found.",
      itemLabel: "receipts",
      successCreate: "Receipt recorded",
      successUpdate: "Receipt updated",
      successDelete: "Receipt deleted",
      deleteTitle: "Delete receipt?",
      deleteBody: "This removes the receipt and its ledger effect.",
      partyType: "customer" as const,
      direction: "received" as const,
      partyPlaceholder: "Select customer",
      amountTone: "text-green-700",
      amountPrefix: "+",
    };
  }
  return {
    title: "Payments",
    description: "Money paid to suppliers (against dues or as advance).",
    addLabel: "Add payment",
    dialogCreate: "New payment",
    dialogEdit: "Edit payment",
    empty: "No payments found.",
    itemLabel: "payments",
    successCreate: "Payment recorded",
    successUpdate: "Payment updated",
    successDelete: "Payment deleted",
    deleteTitle: "Delete payment?",
    deleteBody: "This removes the payment and its ledger effect.",
    partyType: "supplier" as const,
    direction: "paid" as const,
    partyPlaceholder: "Select supplier",
    amountTone: "text-red-600",
    amountPrefix: "-",
  };
}

async function fetchPayments(
  direction: "received" | "paid",
  partyType: "customer" | "supplier",
  today: boolean,
) {
  const params = new URLSearchParams({ direction, partyType });
  if (today) params.set("today", "1");
  const res = await fetch(`/api/payments?${params.toString()}`);
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: Payment[] }).data;
}

async function fetchBankAccounts() {
  const res = await fetch("/api/bank-accounts");
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: BankAccount[] }).data;
}

async function fetchParty(id: string): Promise<Party | null> {
  const res = await fetch(`/api/parties/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return ((await res.json()) as { data: Party }).data;
}

export function PartyVoucherPage(props: { mode: VoucherMode }) {
  const cfg = modeConfig(props.mode);
  const qc = useQueryClient();
  const [todayOnly, setTodayOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Payment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [search, setSearch] = useState("");

  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [payMode, setPayMode] = useState<"cash" | "upi" | "bank">("cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [purpose, setPurpose] = useState<Purpose>("outstanding");
  const [notes, setNotes] = useState("");

  const payments = useQuery({
    queryKey: ["payments", cfg.direction, cfg.partyType, todayOnly],
    queryFn: () => fetchPayments(cfg.direction, cfg.partyType, todayOnly),
  });

  const bankAccounts = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: fetchBankAccounts,
  });

  const selectedParty = useQuery({
    queryKey: ["party", partyId],
    queryFn: () => fetchParty(partyId),
    enabled: !!partyId,
  });

  const balanceMeta = selectedParty.data
    ? getPartyBalanceMeta(
        selectedParty.data.partyType,
        Number(selectedParty.data.balance) || 0,
      )
    : null;

  const filtered = useMemo(() => {
    if (!payments.data) return [];
    const byType = payments.data.filter((p) => {
      const party = typeof p.partyId === "object" ? p.partyId : null;
      // Drop mismatched historical rows (e.g. customer under Payments).
      return !party?.partyType || party.partyType === cfg.partyType;
    });
    if (!search.trim()) return byType;
    const q = search.toLowerCase();
    return byType.filter((p) => {
      const name = typeof p.partyId === "object" ? p.partyId.name : "";
      return (
        name.toLowerCase().includes(q) ||
        (p.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [payments.data, search, cfg.partyType]);

  const pageSize = 12;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalAmount = filtered.reduce((s, p) => s + p.amount, 0);

  function resetForm() {
    setPartyId("");
    setPartyName("");
    setAmount("");
    setPayMode("cash");
    setBankAccountId("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setPurpose("outstanding");
    setNotes("");
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
    setPayMode(p.paymentMode);
    setBankAccountId(
      p.bankAccountId && typeof p.bankAccountId === "object"
        ? p.bankAccountId._id
        : "",
    );
    setDate(format(new Date(p.date), "yyyy-MM-dd"));
    const parsed = parsePurposeNotes(p.notes ?? "");
    setPurpose(parsed.purpose);
    setNotes(parsed.notes);
    setDialogOpen(true);
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!partyId) throw new Error(`Select a ${cfg.partyType}`);
      if (!amount || Number(amount) <= 0)
        throw new Error("Enter a valid amount");
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          amount: Number(amount),
          paymentMode: payMode,
          bankAccountId: bankAccountId || undefined,
          date: new Date(`${date}T12:00:00`).toISOString(),
          notes: composeNotes(purpose, notes),
          direction: cfg.direction,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success(cfg.successCreate);
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["party"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error("No target");
      if (!partyId) throw new Error(`Select a ${cfg.partyType}`);
      const res = await fetch(`/api/payments/${editTarget._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          amount: Number(amount),
          paymentMode: payMode,
          direction: cfg.direction,
          notes: composeNotes(purpose, notes),
          date: new Date(`${date}T12:00:00`).toISOString(),
          bankAccountId: bankAccountId || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success(cfg.successUpdate);
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["party"] });
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
      toast.success(cfg.successDelete);
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground">{cfg.description}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-1" /> {cfg.addLabel}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={`Search by ${cfg.partyType} or notes…`}
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
            id={`${props.mode}-todayOnly`}
            checked={todayOnly}
            onChange={(e) => {
              setTodayOnly(e.target.checked);
              setPage(1);
            }}
            className="rounded"
          />
          <Label
            htmlFor={`${props.mode}-todayOnly`}
            className="text-sm font-normal cursor-pointer"
          >
            Today only
          </Label>
        </div>
      </div>

      <div className="text-sm">
        <span className={cn("font-medium", cfg.amountTone)}>
          Total: {cfg.amountPrefix}
          {formatMoney(totalAmount)}
        </span>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Date</TableHead>
              <TableHead>
                {cfg.partyType === "customer" ? "Customer" : "Supplier"}
              </TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Bank Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((p) => {
              const party = typeof p.partyId === "object" ? p.partyId : null;
              const bank =
                p.bankAccountId && typeof p.bankAccountId === "object"
                  ? p.bankAccountId
                  : null;
              const parsed = parsePurposeNotes(p.notes ?? "");
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
                        parsed.purpose === "advance" ? "secondary" : "outline"
                      }
                      className="text-[10px] capitalize"
                    >
                      {parsed.purpose === "advance"
                        ? "Advance"
                        : "Outstanding"}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize text-xs">
                    {p.paymentMode}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {bank ? `${bank.accountName} (${bank.bankName})` : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-medium",
                      cfg.amountTone,
                    )}
                  >
                    {cfg.amountPrefix}
                    {formatMoney(p.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-40 truncate">
                    {parsed.notes || "—"}
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
            {paginated.length === 0 && !payments.isFetching && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-12 text-center text-muted-foreground"
                >
                  {cfg.empty}
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
          itemLabel={cfg.itemLabel}
          onPageChange={setPage}
        />
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? cfg.dialogEdit : cfg.dialogCreate}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                {cfg.partyType === "customer" ? "Customer" : "Supplier"}
              </Label>
              <PartyCombobox
                value={partyName}
                partyType={cfg.partyType}
                onChange={(val, meta) => {
                  if (meta?.isExisting) {
                    setPartyId(meta.id!);
                    setPartyName(meta.name!);
                  } else {
                    setPartyId("");
                    setPartyName(val);
                  }
                }}
                placeholder={cfg.partyPlaceholder}
              />
              {balanceMeta ? (
                <p
                  className={cn(
                    "text-xs",
                    balanceMeta.tone === "positive" && "text-green-700",
                    balanceMeta.tone === "negative" && "text-red-600",
                    balanceMeta.tone === "neutral" && "text-muted-foreground",
                  )}
                >
                  {balanceMeta.label}: {formatMoney(balanceMeta.amount)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Select
                value={purpose}
                onValueChange={(v) => setPurpose(v as Purpose)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outstanding">
                    Against outstanding
                  </SelectItem>
                  <SelectItem value="advance">Advance</SelectItem>
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
                value={payMode}
                onValueChange={(v) => setPayMode(v as "cash" | "upi" | "bank")}
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
            {payMode === "bank" && (
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cfg.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{cfg.deleteBody}</AlertDialogDescription>
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
