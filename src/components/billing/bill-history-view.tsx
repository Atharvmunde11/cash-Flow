"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Receipt,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { ItemCombobox } from "@/components/forms/item-combobox";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";
import { BillHistorySkeleton } from "@/components/billing/bill-history-skeleton";
import { PaginationControls } from "@/components/shared/pagination-controls";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BillLine = {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  purchasePrice?: number;
  lineTotal: number;
};

type Bill = {
  _id: string;
  billNumber: string;
  billKind: "sale" | "purchase" | "sale_return" | "purchase_return";
  displayName?: string;
  partyId?: string;
  total: number;
  paidAmount: number;
  creditAmount: number;
  paymentMode: "cash" | "upi" | "credit" | "mixed" | "bank";
  billDate: string;
  createdAt: string;
  notes?: string;
  lines: BillLine[];
  profit?: number;
};

type BillKind = Bill["billKind"];

type BillsPage = {
  items: Bill[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type EditLine = {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

type SundryLine = {
  id: string;
  label: string;
  amount: number;
};

// ─── API helpers ───────────────────────────────────────────────────────────────

async function fetchBillsPage(params: {
  billKind: BillKind;
  page: number;
  pageSize: number;
  q?: string;
  date?: string | null;
}): Promise<BillsPage> {
  const sp = new URLSearchParams({
    billKind: params.billKind,
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.q?.trim()) sp.set("q", params.q.trim());
  if (params.date) sp.set("date", params.date);

  const res = await fetch(`/api/bills?${sp.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch bills");
  const json = (await res.json()) as { data: BillsPage };
  return json.data;
}

async function updateBill(id: string, patch: Record<string, unknown>) {
  const res = await fetch(`/api/bills/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed to update");
  return body;
}

async function deleteBill(id: string) {
  const res = await fetch(`/api/bills/${id}`, { method: "DELETE" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed to delete");
  return body;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => String(++_uid);

function billToEditLines(lines: BillLine[]): EditLine[] {
  return lines.map((l) => ({
    id: uid(),
    itemId: l.itemId,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
}

function modeBadgeVariant(mode: string) {
  if (mode === "credit") return "destructive" as const;
  if (mode === "upi") return "secondary" as const;
  if (mode === "mixed") return "outline" as const;
  return "default" as const;
}

function computeBillProfit(b: Bill): number {
  if (typeof b.profit === "number" && Number.isFinite(b.profit))
    return b.profit;
  if (b.billKind !== "sale") return 0;
  return (b.lines ?? []).reduce((s, l) => {
    const pp = Number(l.purchasePrice) || 0;
    const up = Number(l.unitPrice) || 0;
    const qty = Number(l.quantity) || 0;
    return s + (up - pp) * qty;
  }, 0);
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const HISTORY_COPY = {
  sale: {
    title: "Invoice History",
    description: "All sales invoices, newest first. Filter by date or customer.",
    filterPlaceholder: "Filter by customer name…",
    emptyTitle: "No invoices yet",
    emptyDescription: () =>
      "No sales invoices found. Create one from New Invoice.",
    emptyAction: { label: "New invoice", href: "/billing" },
    partyFallback: "Walk-in customer",
    showProfit: true,
    icon: FileSpreadsheet,
    itemLabel: "invoices",
  },
  purchase: {
    title: "Purchase History",
    description: "All purchase bills, newest first. Filter by date or supplier.",
    filterPlaceholder: "Filter by supplier name…",
    emptyTitle: "No purchase bills yet",
    emptyDescription: () =>
      "No purchase bills found. Record a purchase to get started.",
    emptyAction: { label: "New purchase", href: "/billing?kind=purchase" },
    partyFallback: "No supplier",
    showProfit: false,
    icon: Receipt,
    itemLabel: "purchases",
  },
  sale_return: {
    title: "Sale Return History",
    description: "All sale returns, newest first. Filter by date or customer.",
    filterPlaceholder: "Filter by customer name…",
    emptyTitle: "No sale returns yet",
    emptyDescription: () =>
      "No sale returns found. Create one to get started.",
    emptyAction: {
      label: "New sale return",
      href: "/billing?kind=sale_return",
    },
    partyFallback: "Walk-in customer",
    showProfit: false,
    icon: FileSpreadsheet,
    itemLabel: "sale returns",
  },
  purchase_return: {
    title: "Purchase Return History",
    description:
      "All purchase returns, newest first. Filter by date or supplier.",
    filterPlaceholder: "Filter by supplier name…",
    emptyTitle: "No purchase returns yet",
    emptyDescription: () =>
      "No purchase returns found. Create one to get started.",
    emptyAction: {
      label: "New purchase return",
      href: "/billing?kind=purchase_return",
    },
    partyFallback: "No supplier",
    showProfit: false,
    icon: Receipt,
    itemLabel: "purchase returns",
  },
} as const;

export function BillHistoryView({
  billKind,
}: {
  billKind: BillKind;
}) {
  const copy = HISTORY_COPY[billKind];
  const qc = useQueryClient();
  const router = useRouter();

  // ── Filters
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // ── Modals
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);

  // ── Edit form state
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [editSundryLines, setEditSundryLines] = useState<SundryLine[]>([]);
  const [editPaid, setEditPaid] = useState(0);
  const [editMode, setEditMode] = useState<Bill["paymentMode"]>("cash");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const bills = useQuery({
    queryKey: ["bills", billKind, page, pageSize, nameFilter, dateFilter],
    queryFn: () =>
      fetchBillsPage({
        billKind,
        page,
        pageSize,
        q: nameFilter,
        date: dateFilter,
      }),
  });

  const rows = bills.data?.items ?? [];
  const totalItems = bills.data?.total ?? 0;
  const pageCount = bills.data?.pageCount ?? 1;

  const changeDay = (offset: number) => {
    setPage(1);
    setDateFilter((prev) => {
      const base = prev
        ? new Date(`${prev}T12:00:00`)
        : new Date();
      const next = new Date(base.getTime() + offset * 86_400_000);
      return format(next, "yyyy-MM-dd");
    });
  };

  // ── Footer totals (current page)
  const totalSum = rows.reduce((s, b) => s + b.total, 0);
  const paidSum = rows.reduce((s, b) => s + b.paidAmount, 0);
  const creditSum = rows.reduce((s, b) => s + b.creditAmount, 0);
  const profitSum = copy.showProfit
    ? rows
        .filter((b) => b.billKind === "sale")
        .reduce((s, b) => s + computeBillProfit(b), 0)
    : 0;

  // ── Open edit modal
  function openEdit(bill: Bill) {
    setEditBill(bill);
    setEditLines(billToEditLines(bill.lines));
    setEditSundryLines(
      (
        (
          bill as unknown as {
            sundryCharges?: { label: string; amount: number }[];
          }
        ).sundryCharges ?? []
      ).map((s) => ({ id: uid(), label: s.label, amount: s.amount })),
    );
    setEditPaid(bill.paidAmount);
    setEditMode(bill.paymentMode);
    setEditDate(format(new Date(bill.billDate), "yyyy-MM-dd"));
    setEditNotes(bill.notes ?? "");
  }

  // ── Edit line helpers
  const addEditLine = () =>
    setEditLines((prev) => [
      ...prev,
      { id: uid(), itemId: "", name: "", quantity: 1, unitPrice: 0 },
    ]);

  const removeEditLine = (id: string) =>
    setEditLines((prev) => prev.filter((l) => l.id !== id));

  const updateEditLine = (id: string, patch: Partial<EditLine>) =>
    setEditLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );

  // ── Sundry line helpers
  const addSundryLine = () =>
    setEditSundryLines((prev) => [
      ...prev,
      { id: uid(), label: "", amount: 0 },
    ]);

  const removeSundryLine = (id: string) =>
    setEditSundryLines((prev) => prev.filter((l) => l.id !== id));

  const updateSundryLine = (id: string, patch: Partial<SundryLine>) =>
    setEditSundryLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );

  const editItemsTotal = editLines.reduce(
    (s, l) => s + l.quantity * l.unitPrice,
    0,
  );
  const editSundryTotal = editSundryLines.reduce(
    (s, l) => s + (Number(l.amount) || 0),
    0,
  );
  const editTotal = editItemsTotal + editSundryTotal;
  const hasSundry = editSundryLines.length > 0;

  // ── Mutations
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!editBill) throw new Error("No bill");
      const lines = editLines
        .filter((l) => l.itemId.trim().length > 0 && l.quantity > 0)
        .map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        }));
      if (lines.length === 0) throw new Error("Add at least one valid item");
      const sundryCharges = editSundryLines.map((s) => ({
        label: s.label || "Sundry",
        amount: Number(s.amount) || 0,
      }));
      return updateBill(editBill._id, {
        lines,
        sundryCharges,
        paidAmount: editPaid,
        paymentMode: editMode,
        billDate: new Date(`${editDate}T12:00:00`).toISOString(),
        notes: editNotes,
      });
    },
    onSuccess: () => {
      toast.success("Bill updated");
      qc.invalidateQueries({ queryKey: ["bills"] });
      setEditBill(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No bill");
      return deleteBill(deleteTarget._id);
    },
    onSuccess: () => {
      toast.success("Bill deleted");
      qc.invalidateQueries({ queryKey: ["bills"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => changeDay(-1)}
            title="Previous day"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            value={dateFilter ?? ""}
            onChange={(e) => {
              setPage(1);
              setDateFilter(e.target.value || null);
            }}
            className="w-40"
            title="Filter by date (leave empty for all history)"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => changeDay(1)}
            title="Next day"
          >
            <ChevronRight className="size-4" />
          </Button>
          {dateFilter ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPage(1);
                setDateFilter(null);
              }}
            >
              All dates
            </Button>
          ) : null}
        </div>

        <Input
          placeholder={copy.filterPlaceholder}
          value={nameFilter}
          onChange={(e) => {
            setPage(1);
            setNameFilter(e.target.value);
          }}
          className="w-65"
        />

        <Button
          type="button"
          className="ml-auto"
          onClick={() => router.push(copy.emptyAction.href)}
        >
          <Plus className="mr-1 size-4" />
          {copy.emptyAction.label}
        </Button>
      </div>

      {bills.isLoading ? (
        <BillHistorySkeleton showProfit={copy.showProfit} />
      ) : bills.isError ? (
        <EmptyState
          icon={copy.icon}
          title="Could not load bills"
          description="Check your connection and try again."
          action={{
            label: "Retry",
            onClick: () => bills.refetch(),
          }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={copy.icon}
          title={
            nameFilter || dateFilter
              ? "No matching bills"
              : copy.emptyTitle
          }
          description={
            nameFilter || dateFilter
              ? "Try another date, clear filters, or create a new bill."
              : copy.emptyDescription()
          }
          action={nameFilter || dateFilter ? undefined : copy.emptyAction}
        />
      ) : (
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Name</TableHead>
              <TableHead className="w-30">Date</TableHead>
              <TableHead className="w-22.5">Mode</TableHead>
              <TableHead className="text-right w-25">Total</TableHead>
              <TableHead className="text-right w-25">Paid</TableHead>
              <TableHead className="text-right w-25">Credit</TableHead>
              {copy.showProfit ? (
                <TableHead className="text-right w-25">P/L</TableHead>
              ) : null}
              <TableHead className="w-45">Notes</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((b) => (
              <TableRow
                key={b._id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => router.push(`/billing?billId=${b._id}`)}
              >
                <TableCell className="font-medium">
                  {b.displayName || (
                    <span className="text-muted-foreground italic text-sm">
                      {copy.partyFallback}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-xs text-muted-foreground tabular-nums">
                  {format(new Date(b.billDate), "dd MMM yyyy")}
                </TableCell>

                <TableCell>
                  <Badge
                    variant={modeBadgeVariant(b.paymentMode)}
                    className="text-[10px] capitalize"
                  >
                    {b.paymentMode}
                  </Badge>
                </TableCell>

                <TableCell className="text-right tabular-nums font-medium">
                  {formatMoney(b.total)}
                </TableCell>

                <TableCell className="text-right tabular-nums text-green-700 dark:text-green-400">
                  {formatMoney(b.paidAmount)}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {b.creditAmount > 0 ? (
                    <span className="text-destructive">
                      {formatMoney(b.creditAmount)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {copy.showProfit ? (
                <TableCell className="text-right tabular-nums">
                  {b.billKind !== "sale" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    (() => {
                      const p = computeBillProfit(b);
                      const cls =
                        p >= 0
                          ? "text-green-700 dark:text-green-400 font-medium"
                          : "text-destructive font-medium";
                      const sign = p > 0 ? "+" : "";
                      return (
                        <span className={`${cls} whitespace-nowrap`}>
                          {sign}
                          {formatMoney(p)}
                        </span>
                      );
                    })()
                  )}
                </TableCell>
                ) : null}

                <TableCell className="text-xs text-muted-foreground max-w-45 truncate">
                  {b.notes ? b.notes : <span className="italic">—</span>}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(b);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

          </TableBody>

          {rows.length > 0 && (
            <tfoot className="border-t bg-muted/20 text-sm font-semibold">
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-2 text-right text-xs text-muted-foreground font-normal"
                >
                  Page total · {rows.length} bill{rows.length !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatMoney(totalSum)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-green-700 dark:text-green-400">
                  {formatMoney(paidSum)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-destructive">
                  {creditSum > 0 ? formatMoney(creditSum) : "—"}
                </td>
                {copy.showProfit ? (
                <td className="px-4 py-2 text-right tabular-nums">
                  <span
                    className={
                      profitSum >= 0
                        ? "text-green-700 dark:text-green-400 whitespace-nowrap"
                        : "text-destructive whitespace-nowrap"
                    }
                  >
                    {profitSum > 0 ? "+" : ""}
                    {formatMoney(profitSum)}
                  </span>
                </td>
                ) : null}
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </Table>
        <PaginationControls
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={totalItems}
          itemLabel={copy.itemLabel}
          onPageChange={setPage}
        />
      </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── Edit Modal ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}

      <Dialog
        open={!!editBill}
        onOpenChange={(o) => {
          if (!o) setEditBill(null);
        }}
      >
        {/* Full-height, wide dialog — fixed header + footer, scrollable body */}
        <DialogContent
          className="
          fixed inset-0 z-50
              rounded-4xl
 w-[80vw] h-[90vh]
 max-w-none
 left-1/2 top-1/2
 -translate-x-1/2 -translate-y-1/2
 flex flex-col p-0 gap-0

"
        >
          {/* ── Fixed header ── */}
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Edit Bill
              <span className="font-mono text-sm text-muted-foreground">
                {editBill?.billNumber}
              </span>
              {editBill?.displayName && (
                <span className="text-sm font-normal text-muted-foreground">
                  — {editBill.displayName}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Meta row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Bill date</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment mode</Label>
                <Select
                  value={editMode}
                  onValueChange={(v) => setEditMode(v as Bill["paymentMode"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Paid amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editPaid}
                  onChange={(e) => setEditPaid(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Line items + sundry */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Line items</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={addSundryLine}
                  >
                    <Plus className="size-3" />
                    Sundry
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={addEditLine}
                  >
                    <Plus className="size-3" />
                    Add item
                  </Button>
                </div>
              </div>

              <div className="rounded border overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-150">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground text-left">
                      <th className="px-3 py-2 w-8 text-center">#</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 w-25 text-right">Qty</th>
                      <th className="px-3 py-2 w-30 text-right">Rate</th>
                      <th className="px-3 py-2 w-27.5 text-right">Amount</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>

                  <tbody>
                    {/* Item rows */}
                    {editLines.map((line, idx) => (
                      <tr
                        key={line.id}
                        className="border-b last:border-0 hover:bg-muted/10 transition-colors"
                      >
                        <td className="px-2 py-2 text-center text-xs text-muted-foreground tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-2">
                          <ItemCombobox
                            value={line.itemId}
                            onChange={(id, item) =>
                              updateEditLine(line.id, {
                                itemId: id,
                                name: item?.name ?? "",
                                unitPrice: item?.price ?? line.unitPrice,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) =>
                              updateEditLine(line.id, {
                                quantity: Number(e.target.value),
                              })
                            }
                            className="h-8 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateEditLine(line.id, {
                                unitPrice: Number(e.target.value),
                              })
                            }
                            className="h-8 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-medium">
                          {formatMoney(line.quantity * line.unitPrice)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeEditLine(line.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {/* Sundry rows */}
                    {editSundryLines.map((line, idx) => (
                      <tr
                        key={line.id}
                        className="border-b last:border-0 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                      >
                        <td className="px-2 py-2 text-center text-xs text-muted-foreground tabular-nums">
                          {editLines.length + idx + 1}
                        </td>
                        <td className="px-2 py-2" colSpan={1}>
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              Sundry
                            </span>
                            <Input
                              placeholder="e.g. Transport, Discount…"
                              value={line.label}
                              onChange={(e) =>
                                updateSundryLine(line.id, {
                                  label: e.target.value,
                                })
                              }
                              className="h-8 flex-1"
                            />
                          </div>
                        </td>
                        <td
                          className="px-2 py-2 text-center text-muted-foreground text-xs"
                          colSpan={2}
                        >
                          —
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={line.amount || ""}
                            onChange={(e) =>
                              updateSundryLine(line.id, {
                                amount: Number(e.target.value),
                              })
                            }
                            className="h-8 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeSundryLine(line.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {editLines.length === 0 && editSundryLines.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          No lines yet. Use the buttons above to add items or
                          sundry charges.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Totals footer */}
                  <tfoot className="border-t bg-muted/20 text-sm">
                    {hasSundry && (
                      <>
                        <tr className="text-xs text-muted-foreground">
                          <td colSpan={4} className="px-3 py-1 text-right">
                            Items subtotal
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">
                            {formatMoney(editItemsTotal)}
                          </td>
                          <td />
                        </tr>
                        <tr className="text-xs text-muted-foreground">
                          <td colSpan={4} className="px-3 py-1 text-right">
                            Sundry charges
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">
                            {formatMoney(editSundryTotal)}
                          </td>
                          <td />
                        </tr>
                      </>
                    )}
                    <tr className="font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-right">
                        New total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(editTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Optional notes…"
              />
            </div>
          </div>

          {/* ── Fixed footer ── */}
          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2 ">
            <Button variant="outline" onClick={() => setEditBill(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── Delete confirmation ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete bill{" "}
              <span className="font-mono font-semibold">
                {deleteTarget?.billNumber}
              </span>{" "}
              for{" "}
              <span className="font-medium">
                {deleteTarget?.displayName || "Walk-in"}
              </span>{" "}
              ({formatMoney(deleteTarget?.total ?? 0)}). Stock and ledger
              entries will <strong>not</strong> be automatically reversed —
              adjust those manually if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
