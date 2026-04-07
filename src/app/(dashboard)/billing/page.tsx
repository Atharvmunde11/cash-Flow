"use client";

import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { AlertTriangle, QrCode, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { billCreateSchema, type BillCreateInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PartyCombobox } from "@/components/forms/party-combobox";
import { ItemCombobox } from "@/components/forms/item-combobox";
import { formatMoney } from "@/lib/format";
import { UpiQrFullscreen } from "@/components/payment/upi-qr-fullscreen";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Item = {
  _id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
};

type LineType = "item" | "sundry";

type ExtendedLine = {
  id: string;
  lineType: LineType;
  itemId?: string;
  quantity?: number;
  unitPrice?: number;
  sundryLabel?: string;
  sundryAmount?: number;
};

type BankAccount = {
  _id: string;
  accountName: string;
  bankName: string;
};

async function fetchBankAccounts() {
  const res = await fetch("/api/bank-accounts");
  if (!res.ok) throw new Error("Failed");
  const json = (await res.json()) as { data: BankAccount[] };
  return json.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => String(++_uid);

async function fetchBillDetail(id: string) {
  const res = await fetch(`/api/bills/${id}`);
  if (!res.ok) throw new Error("Failed to load bill");
  const json = await res.json();
  return json.data;
}

async function fetchPaymentAlert(partyId: string) {
  const res = await fetch(`/api/parties/${partyId}/payment-alert`);
  if (!res.ok) throw new Error("Failed");
  const json = (await res.json()) as {
    data: { alert: boolean; message?: string };
  };
  return json.data;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function BillingPageComponent() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [qrOpen, setQrOpen] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [extLines, setExtLines] = useState<ExtendedLine[]>([
    { id: uid(), lineType: "item", itemId: "", quantity: 1 },
  ]);

  const extLinesRef = useRef(extLines);
  extLinesRef.current = extLines;

  const selectedBill = useQuery({
    queryKey: ["bill", selectedBillId],
    queryFn: () => fetchBillDetail(selectedBillId!),
    enabled: Boolean(selectedBillId),
  });

  const items = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error("Failed");
      const json = (await res.json()) as { data: Item[] };
      return json.data;
    },
  });

  const bankAccounts = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: fetchBankAccounts,
  });

  const form = useForm<BillCreateInput>({
    resolver: zodResolver(billCreateSchema) as Resolver<BillCreateInput>,
    defaultValues: {
      billKind: "sale",
      billDate: new Date(),
      partyId: "",
      lines: [],
      displayName: "",
      paidAmount: 0,
      paymentMode: "cash",
      bankAccountId: "",
      notes: "",
      allowNegativeStock: false,
    },
  });

  const billKind = form.watch("billKind");
  const paymentMode = form.watch("paymentMode");
  const bankAccountId = form.watch("bankAccountId");
  const paidAmount = form.watch("paidAmount");
  const billDate = form.watch("billDate");
  const partyId = form.watch("partyId");
  const displayName = form.watch("displayName");
  const isEditing = Boolean(selectedBillId);

  const paymentAlert = useQuery({
    queryKey: ["payment-alert", partyId],
    queryFn: () => fetchPaymentAlert(partyId!),
    enabled: Boolean(partyId && partyId.length === 24 && billKind === "sale"),
  });

  useEffect(() => {
    const billId = searchParams.get("billId");
    if (billId && billId.length === 24) {
      setSelectedBillId(billId);
    } else {
      setSelectedBillId(null);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedBill.data) return;

    const party =
      typeof selectedBill.data.partyId === "object" &&
      selectedBill.data.partyId !== null
        ? selectedBill.data.partyId
        : null;

    form.reset({
      billKind: selectedBill.data.billKind ?? "sale",
      billDate: new Date(
        selectedBill.data.billDate ?? selectedBill.data.createdAt,
      ),
      partyId: party?._id ?? "",
      displayName: party?.name ?? selectedBill.data.displayName ?? "",
      lines: [],
      paidAmount: selectedBill.data.paidAmount,
      paymentMode: selectedBill.data
        .paymentMode as BillCreateInput["paymentMode"],
      bankAccountId:
        typeof selectedBill.data.bankAccountId === "object" &&
        selectedBill.data.bankAccountId !== null
          ? selectedBill.data.bankAccountId._id
          : "",
      notes: selectedBill.data.notes ?? "",
      allowNegativeStock: false,
    });

    setExtLines(
      selectedBill.data.lines.length > 0
        ? selectedBill.data.lines.map((line: any) => ({
            id: uid(),
            lineType: "item" as const,
            itemId: line.itemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          }))
        : [{ id: uid(), lineType: "item", itemId: "", quantity: 1 }],
    );
  }, [form, selectedBill.data]);

  // ── Line math ───────────────────────────────────────────────────────────────

  const itemsSubtotal = extLines
    .filter((l) => l.lineType === "item")
    .reduce((s, l) => s + (Number(l.quantity) || 0) * (l.unitPrice ?? 0), 0);

  const sundrySubtotal = extLines
    .filter((l) => l.lineType === "sundry")
    .reduce((s, l) => s + (Number(l.sundryAmount) || 0), 0);

  const computedTotal = itemsSubtotal + sundrySubtotal;
  const hasSundry = extLines.some((l) => l.lineType === "sundry");

  const showUpiQr =
    (paymentMode === "upi" || paymentMode === "mixed") && paidAmount > 0;
  const upiQrAmount = Math.min(paidAmount, computedTotal || paidAmount);

  // ── Line helpers ────────────────────────────────────────────────────────────

  const addItemLine = useCallback(() => {
    setExtLines((prev) => [
      ...prev,
      { id: uid(), lineType: "item", itemId: "", quantity: 1 },
    ]);
  }, []);

  const addSundryLine = useCallback(() => {
    setExtLines((prev) => [
      ...prev,
      { id: uid(), lineType: "sundry", sundryLabel: "", sundryAmount: 0 },
    ]);
  }, []);

  const removeLine = (id: string) =>
    setExtLines((prev) => prev.filter((l) => l.id !== id));

  const updateLine = (id: string, patch: Partial<ExtendedLine>) =>
    setExtLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        addSundryLine();
      }
    },
    [addSundryLine],
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
        const lines = extLinesRef.current;
        if (lines[lines.length - 1]?.id === lineId) {
          e.preventDefault();
          addItemLine();
        }
      }
    },
    [addItemLine],
  );

  useEffect(() => {
    if (isEditing) return;
    if (
      paymentMode === "cash" ||
      paymentMode === "upi" ||
      paymentMode === "bank"
    ) {
      form.setValue("paidAmount", computedTotal);
    }
    if (
      paymentMode !== "upi" &&
      paymentMode !== "bank" &&
      paymentMode !== "mixed"
    ) {
      form.setValue("bankAccountId", "");
    }
  }, [computedTotal, isEditing, paymentMode, form]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: (data) => {
      toast.success(`Bill ${data.data.billNumber} created`);
      qc.invalidateQueries({ queryKey: ["payment-alert"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      resetToCreateMode();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetToCreateMode = useCallback(() => {
    window.history.replaceState(null, "", "/billing");
    setSelectedBillId(null);
    setExtLines([{ id: uid(), lineType: "item", itemId: "", quantity: 1 }]);
    form.reset({
      billKind: "sale",
      billDate: new Date(),
      partyId: "",
      lines: [],
      displayName: "",
      paidAmount: 0,
      paymentMode: "cash",
      bankAccountId: "",
      notes: "",
      allowNegativeStock: false,
    });
  }, [form]);

  const update = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!selectedBillId) throw new Error("No bill selected");
      const res = await fetch(`/api/bills/${selectedBillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Bill updated");
      qc.invalidateQueries({ queryKey: ["bill", selectedBillId] });
      qc.invalidateQueries({ queryKey: ["payment-alert"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      resetToCreateMode();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeBill = useMutation({
    mutationFn: async () => {
      if (!selectedBillId) throw new Error("No bill selected");
      const res = await fetch(`/api/bills/${selectedBillId}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Bill deleted");
      qc.invalidateQueries({ queryKey: ["payment-alert"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      resetToCreateMode();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <UpiQrFullscreen
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        amount={upiQrAmount}
      />

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEditing ? "Edit bill" : "Billing"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Sales and purchase bills — stock and balances update together.
          </p>
        </div>
        <Button type="button" variant="outline">
          Print
        </Button>
      </div>

      {/* ── Form ── */}
      <form
        noValidate
        className="grid gap-6 lg:grid-cols-[340px_1fr] items-start"
        onSubmit={form.handleSubmit(
          (v) => {
            const itemLines = extLines
              .filter(
                (l): l is ExtendedLine & { itemId: string; quantity: number } =>
                  l.lineType === "item" &&
                  typeof l.itemId === "string" &&
                  l.itemId.length === 24 &&
                  typeof l.quantity === "number",
              )
              .map((l) => ({
                itemId: l.itemId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
              }));

            if (itemLines.length === 0) {
              toast.error("Add at least one valid item line");
              return;
            }

            const sundryCharges = extLines
              .filter((l) => l.lineType === "sundry")
              .map((l) => ({
                label: l.sundryLabel ?? "Sundry",
                amount: Number(l.sundryAmount) || 0,
              }));

            const payload: Record<string, unknown> = {
              billKind: v.billKind,
              billDate:
                v.billDate instanceof Date
                  ? v.billDate.toISOString()
                  : v.billDate,
              partyId: v.partyId || undefined,
              displayName: v.displayName ?? "",
              lines: itemLines,
              sundryCharges,
              paidAmount: v.paidAmount,
              paymentMode: v.paymentMode,
              bankAccountId: v.bankAccountId || undefined,
              notes: v.notes ?? "",
              allowNegativeStock: v.allowNegativeStock ?? false,
            };

            if (isEditing) {
              update.mutate(payload);
            } else {
              create.mutate(payload);
            }
          },
          () => {
            toast.error("Please check the form for errors");
          },
        )}
      >
        {/* ── LEFT: Bill meta ── */}
        <div className="space-y-4 rounded-xl border p-4 sticky top-4">
          {/* Bill kind */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={billKind === "sale" ? "default" : "outline"}
              onClick={() => {
                form.setValue("billKind", "sale");
                form.setValue("partyId", "");
              }}
            >
              Sale bill
            </Button>
            <Button
              type="button"
              size="sm"
              variant={billKind === "purchase" ? "default" : "outline"}
              onClick={() => {
                form.setValue("billKind", "purchase");
                form.setValue("partyId", "");
              }}
            >
              Purchase bill
            </Button>
          </div>

          {/* Bill date */}
          <div className="space-y-1.5">
            <Label htmlFor="billDate">Bill date</Label>
            <Input
              id="billDate"
              type="date"
              value={
                billDate instanceof Date && !Number.isNaN(billDate.getTime())
                  ? format(billDate, "yyyy-MM-dd")
                  : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val)
                  form.setValue("billDate", new Date(`${val}T12:00:00`), {
                    shouldValidate: true,
                  });
              }}
            />
          </div>

          {/* Party */}
          <div className="space-y-1.5">
            <Label>{billKind === "sale" ? "Customer" : "Supplier"}</Label>
            <PartyCombobox
              value={displayName}
              onChange={(val, meta) => {
                if (meta?.isExisting) {
                  form.setValue("partyId", meta.id!);
                  form.setValue("displayName", meta.name!);
                } else {
                  form.setValue("partyId", "");
                  form.setValue("displayName", val);
                }
              }}
              partyType={billKind === "sale" ? "customer" : "supplier"}
              placeholder="Type customer name or select party"
            />
            {(form.formState.errors.partyId ||
              form.formState.errors.displayName) && (
              <p className="text-sm text-destructive">
                {form.formState.errors.partyId?.message ||
                  form.formState.errors.displayName?.message}
              </p>
            )}
          </div>

          {/* Payment alert */}
          {paymentAlert.data?.alert && billKind === "sale" ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Payment reminder</AlertTitle>
              <AlertDescription>
                {paymentAlert.data.message ??
                  "This customer may need a payment before billing."}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Payment mode + paid amount */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Payment mode</Label>
              <Select
                value={paymentMode}
                onValueChange={(val) =>
                  form.setValue(
                    "paymentMode",
                    val as BillCreateInput["paymentMode"],
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paid">Paid amount</Label>
              <Input
                id="paid"
                type="number"
                step="0.01"
                {...form.register("paidAmount", { valueAsNumber: true })}
              />
            </div>
          </div>

          {(paymentMode === "upi" ||
            paymentMode === "bank" ||
            paymentMode === "mixed") && (
            <div className="space-y-1.5">
              <Label>Receiving bank account</Label>
              <Select
                value={bankAccountId}
                onValueChange={(val) =>
                  form.setValue("bankAccountId", val || undefined)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose bank account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {bankAccounts.data?.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.accountName} ({account.bankName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!bankAccountId && (
                <p className="text-xs text-muted-foreground">
                  Select a bank account for UPI/bank payment.
                </p>
              )}
            </div>
          )}

          {/* UPI QR */}
          {showUpiQr ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => setQrOpen(true)}
              >
                <QrCode className="size-4" />
                Show UPI QR
              </Button>
              <span className="text-xs text-muted-foreground">
                Configure{" "}
                <code className="rounded bg-muted px-1">
                  NEXT_PUBLIC_UPI_ID
                </code>{" "}
                in <code className="text-xs">.env</code>
              </span>
            </div>
          ) : null}

          {/* Negative stock */}
          {billKind === "sale" ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="neg"
                checked={form.watch("allowNegativeStock")}
                onCheckedChange={(c) =>
                  form.setValue("allowNegativeStock", Boolean(c))
                }
              />
              <Label htmlFor="neg" className="text-sm font-normal">
                Allow negative stock (override warnings)
              </Label>
            </div>
          ) : null}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...form.register("notes")} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
            >
              {isEditing
                ? update.isPending
                  ? "Saving changes..."
                  : "Update bill"
                : create.isPending
                  ? "Creating..."
                  : "Create bill"}
            </Button>
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => removeBill.mutate()}
                  disabled={removeBill.isPending}
                >
                  {removeBill.isPending ? "Deleting..." : "Delete bill"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetToCreateMode}
                >
                  New bill
                </Button>
              </>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Line totals use each item&apos;s catalog price unless you set an
            override. Computed subtotal (preview):{" "}
            <span className="font-medium text-foreground">
              {formatMoney(computedTotal)}
            </span>
          </p>
        </div>

        {/* ── RIGHT: Line items table ── */}
        <div
          className="rounded-xl border flex flex-col min-h-[480px]"
          onKeyDown={handleTableKeyDown}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <Label className="text-base">Line items</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={addSundryLine}
                title="Add sundry charge (Ctrl+Enter)"
              >
                <Plus className="size-3" />
                Sundry
                <kbd className="ml-1 hidden rounded border bg-muted px-1 py-0.5 font-mono text-[10px] sm:inline">
                  Ctrl+↵
                </kbd>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={addItemLine}
              >
                <Plus className="size-3" />
                Add line
              </Button>
            </div>
          </div>

          {/* Scrollable table */}
          <div className="w-full overflow-x-auto flex-1">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium w-7 text-center">#</th>
                  <th className="px-2 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium w-15">Unit</th>
                  <th className="px-2 py-2 font-medium w-22.5 text-right">
                    Qty
                  </th>
                  <th className="px-2 py-2 font-medium w-27.5 text-right">
                    Rate
                  </th>
                  <th className="px-2 py-2 font-medium w-25 text-right">
                    Amount
                  </th>
                  <th className="px-2 py-2 w-9" />
                </tr>
              </thead>

              <tbody>
                {extLines.map((line, idx) =>
                  line.lineType === "item" ? (
                    <tr
                      key={line.id}
                      className="border-b last:border-0 hover:bg-muted/10 transition-colors"
                      onKeyDown={(e) => handleRowKeyDown(e, line.id)}
                    >
                      <td className="px-2 py-1.5 text-center text-xs text-muted-foreground tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <ItemCombobox
                          value={line.itemId ?? ""}
                          onChange={(id, item) => {
                            updateLine(line.id, {
                              itemId: id,
                              unitPrice: item?.price ?? undefined,
                            });
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                        {(() => {
                          const selectedItem = items.data?.find(
                            (i) => i._id === line.itemId,
                          );
                          return selectedItem ? selectedItem.unit : "—";
                        })()}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          value={line.quantity ?? ""}
                          onChange={(e) =>
                            updateLine(line.id, {
                              quantity:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                          className="h-8 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="auto"
                          value={line.unitPrice ?? ""}
                          onChange={(e) =>
                            updateLine(line.id, {
                              unitPrice:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                          className="h-8 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                        {line.unitPrice !== undefined ? (
                          formatMoney(
                            (Number(line.quantity) || 0) * line.unitPrice,
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(line.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={line.id}
                      className="border-b last:border-0 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                      onKeyDown={(e) => handleRowKeyDown(e, line.id)}
                    >
                      <td className="px-2 py-1.5 text-center text-xs text-muted-foreground tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            Sundry
                          </span>
                          <Input
                            placeholder="e.g. Transport, Labour, Discount…"
                            value={line.sundryLabel ?? ""}
                            onChange={(e) =>
                              updateLine(line.id, {
                                sundryLabel: e.target.value,
                              })
                            }
                            className="h-8 flex-1"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground text-xs">
                        —
                      </td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground text-xs">
                        —
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={line.sundryAmount ?? ""}
                          onChange={(e) =>
                            updateLine(line.id, {
                              sundryAmount:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                          className="h-8 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                        {formatMoney(Number(line.sundryAmount) || 0)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(line.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ),
                )}

                {extLines.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      No lines yet.{" "}
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={addItemLine}
                      >
                        Add a line
                      </button>{" "}
                      or press{" "}
                      <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">
                        Ctrl+Enter
                      </kbd>{" "}
                      for a sundry charge.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* ── Totals footer ── */}
              <tfoot className="border-t bg-muted/20 text-sm">
                {hasSundry && (
                  <>
                    <tr className="text-xs text-muted-foreground">
                      <td colSpan={4} className="px-3 py-1 text-right">
                        Items subtotal
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        {formatMoney(itemsSubtotal)}
                      </td>
                      <td />
                    </tr>
                    <tr className="text-xs text-muted-foreground">
                      <td colSpan={4} className="px-3 py-1 text-right">
                        Sundry charges
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        {formatMoney(sundrySubtotal)}
                      </td>
                      <td />
                    </tr>
                  </>
                )}
                <tr className="font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(computedTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Keyboard hint bar */}
          <div className="border-t px-4 py-2 text-xs text-muted-foreground flex gap-4">
            <span>
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">
                ↵
              </kbd>
              on last row — new item line
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">
                Ctrl+↵
              </kbd>
              — add sundry
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BillingPageComponent />
    </Suspense>
  );
}
