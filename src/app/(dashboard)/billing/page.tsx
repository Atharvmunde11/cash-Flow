"use client";

import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  AlertTriangle,
  Plus,
  QrCode,
  Printer,
  Trash2,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { billCreateSchema, type BillCreateInput } from "@/lib/validations";
import {
  SUNDRY_PRESETS,
  isForbiddenSundryName,
} from "@/lib/sundry-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatMoney } from "@/lib/format";
import { UpiQrFullscreen } from "@/components/payment/upi-qr-fullscreen";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InvoicePrint } from "./Invoiceprint";
import { usePrintInvoice } from "../../../hooks/Useprintinvoice";
import { BillingBusyGrid, type BusyItemLine, type BusySundryLine } from "@/components/billing/billing-busy-grid";
import {
  applyPrintOptions,
  PrintInvoiceDialog,
} from "@/components/billing/print-invoice-dialog";

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

type PaymentSplitRow = {
  id: string;
  method: "cash" | "upi" | "bank";
  amount: number;
  bankAccountId?: string;
};

type BankAccount = {
  _id: string;
  accountName: string;
  bankName: string;
  upiId?: string;
  isPrimary?: boolean;
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

function createDefaultExtLines(): ExtendedLine[] {
  return [{ id: uid(), lineType: "item", itemId: "" }];
}

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [postCreateOpen, setPostCreateOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const postCreateAllowCloseRef = useRef(false);
  const [createdBill, setCreatedBill] = useState<{
    id: string;
    billNumber: string;
  } | null>(null);
  const [extLines, setExtLines] = useState<ExtendedLine[]>(createDefaultExtLines);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitRow[]>(() => [
    { id: uid(), method: "cash", amount: 0 },
  ]);

  const extLinesRef = useRef(extLines);
  extLinesRef.current = extLines;
  const formElRef = useRef<HTMLFormElement | null>(null);

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

  const sundryTypes = useQuery({
    queryKey: ["sundry-types"],
    queryFn: async () => {
      const res = await fetch("/api/sundry-types");
      if (!res.ok) throw new Error("Failed");
      const json = (await res.json()) as { data: Array<{ name: string }> };
      return json.data ?? [];
    },
    staleTime: 30_000,
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
      paymentSplits: [],
      notes: "",
      allowNegativeStock: false,
    },
  });

  // Remember last billing subpage (kind) — do not persist form draft.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "cf_last_billing_path",
        window.location.pathname + window.location.search,
      );
    } catch {
      // ignore
    }
  }, [searchParams]);

  // Reset billing form when leaving the page.
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem("cf_billing_draft");
      } catch {
        // ignore
      }
    };
  }, []);

  // Billing resets on leave; no draft restore.

  const billKind = form.watch("billKind");
  const paymentMode = form.watch("paymentMode");
  const bankAccountId = form.watch("bankAccountId");
  const paidAmount = form.watch("paidAmount");
  const billDate = form.watch("billDate");
  const partyId = form.watch("partyId");
  const displayName = form.watch("displayName");
  const notes = form.watch("notes");
  const isEditing = Boolean(selectedBillId);

  const paymentAlert = useQuery({
    queryKey: ["payment-alert", partyId],
    queryFn: () => fetchPaymentAlert(partyId!),
    enabled: Boolean(
      partyId &&
        partyId.trim().length > 0 &&
        (billKind === "sale" || billKind === "sale_return"),
    ),
  });

  useEffect(() => {
    const billId = searchParams.get("billId");
    if (billId && billId.trim().length > 0) {
      setSelectedBillId(billId);
      return;
    }
    setSelectedBillId(null);

    const kind = searchParams.get("kind");
    if (
      kind === "purchase" ||
      kind === "sale_return" ||
      kind === "purchase_return"
    ) {
      form.setValue("billKind", kind);
      if (kind === "sale_return" || kind === "purchase_return") {
        form.setValue("paymentMode", "credit");
        form.setValue("paidAmount", 0);
      }
    } else if (kind === "sale" || !kind) {
      form.setValue("billKind", "sale");
    }
  }, [searchParams, form]);

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

    const itemLines: ExtendedLine[] =
      Array.isArray(selectedBill.data.lines) && selectedBill.data.lines.length > 0
        ? selectedBill.data.lines.map((line: any) => ({
            id: uid(),
            lineType: "item" as const,
            itemId:
              typeof line?.itemId === "string"
                ? line.itemId
                : line?.itemId?._id ??
                  line?.item?.id ??
                  line?.item?._id ??
                  "",
            quantity: Number(line.quantity) > 0 ? Number(line.quantity) : 1,
            unitPrice: line.unitPrice,
          }))
        : [{ id: uid(), lineType: "item", itemId: "" }];

    const sundryLines: ExtendedLine[] = Array.isArray(
      (selectedBill.data as any).sundryCharges,
    )
      ? ((selectedBill.data as any).sundryCharges as any[])
          .filter((c) => c && (String(c.label ?? "").trim() || Number(c.amount) !== 0))
          .map((c) => ({
            id: uid(),
            lineType: "sundry" as const,
            sundryLabel: String(c.label ?? "Sundry"),
            sundryAmount: Number(c.amount) || 0,
          }))
      : [];

    setExtLines([...itemLines, ...sundryLines]);
  }, [form, selectedBill.data]);

  // ── Line math ───────────────────────────────────────────────────────────────

  const itemsSubtotal = extLines
    .filter((l) => l.lineType === "item")
    .reduce((s, l) => {
      const qty = Number(l.quantity) || 0;
      const catalog = items.data?.find((it) => it._id === l.itemId);
      const rate =
        l.unitPrice !== undefined ? l.unitPrice : (catalog?.price ?? 0);
      return s + qty * rate;
    }, 0);

  const sundrySubtotal = extLines
    .filter((l) => l.lineType === "sundry")
    .reduce((s, l) => s + (Number(l.sundryAmount) || 0), 0);

  const computedTotal = itemsSubtotal + sundrySubtotal;

  const itemLines = useMemo(
    () =>
      extLines.filter(
        (l): l is ExtendedLine & BusyItemLine => l.lineType === "item",
      ),
    [extLines],
  );
  const sundryLines = useMemo(
    () =>
      extLines.filter(
        (l): l is ExtendedLine & BusySundryLine => l.lineType === "sundry",
      ),
    [extLines],
  );

  const showUpiQr =
    (paymentMode === "upi" || paymentMode === "mixed") && paidAmount > 0;
  const upiQrAmount = Math.min(paidAmount, computedTotal || paidAmount);
  const upiBankAccount =
    bankAccounts.data?.find((account) => account._id === bankAccountId) ??
    bankAccounts.data?.find((account) => account.isPrimary) ??
    bankAccounts.data?.[0];
  const upiId = upiBankAccount?.upiId?.trim() ?? "";
  const upiPayeeName = upiBankAccount?.accountName?.trim() || "CashFlow";

  // ── Line helpers ────────────────────────────────────────────────────────────

  const addItemLineWithId = useCallback(() => {
    const newId = uid();
    setExtLines((prev) => [
      ...prev,
      { id: newId, lineType: "item", itemId: "" },
    ]);
    return newId;
  }, []);

  const getBillNavFields = useCallback(() => {
    const form = formElRef.current;
    if (!form) return [];
    return Array.from(
      form.querySelectorAll<HTMLElement>("[data-bill-nav]"),
    ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
  }, []);

  const focusFirstItemField = useCallback((lineId: string) => {
    setTimeout(() => {
      const row = document.querySelector(
        `tr[data-item-row="${CSS.escape(lineId)}"]`,
      ) as HTMLElement | null;
      const first = row?.querySelector(
        "[data-bill-nav]",
      ) as HTMLElement | null;
      first?.focus?.();
    }, 0);
  }, []);

  const focusSundryLabelField = useCallback((lineId: string) => {
    setTimeout(() => {
      const row = document.querySelector(
        `tr[data-sundry-row="${CSS.escape(lineId)}"]`,
      ) as HTMLElement | null;
      const label = row?.querySelector(
        '[data-bill-nav="sundryLabel"]',
      ) as HTMLElement | null;
      label?.focus?.();
    }, 0);
  }, []);

  const focusSundryAmountField = useCallback((lineId: string) => {
    setTimeout(() => {
      const row = document.querySelector(
        `tr[data-sundry-row="${CSS.escape(lineId)}"]`,
      ) as HTMLElement | null;
      const amount = row?.querySelector(
        '[data-bill-nav="sundryAmount"]',
      ) as HTMLElement | null;
      amount?.focus?.();
    }, 0);
  }, []);

  const focusFieldAtIndex = useCallback(
    (rowSelector: string, lineId: string, fieldIndex: number) => {
      setTimeout(() => {
        const row = document.querySelector(
          `${rowSelector}="${CSS.escape(lineId)}"]`,
        ) as HTMLElement | null;
        if (!row) return;
        const fields = Array.from(
          row.querySelectorAll<HTMLElement>("[data-bill-nav]"),
        ).filter((el) => !el.hasAttribute("disabled"));
        const el =
          fields[
            Math.min(Math.max(0, fieldIndex), Math.max(0, fields.length - 1))
          ] ?? fields[0];
        el?.focus?.();
      }, 0);
    },
    [],
  );

  const handleBillingNavCapture = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest("[cmdk-root]") ||
        target.closest("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }

      const current = target.closest("[data-bill-nav]") as HTMLElement | null;
      if (!current) return;

      const isTextarea = target.tagName === "TEXTAREA";
      const isNotesField = current.getAttribute("data-bill-nav") === "notes";
      // Notes is a compact single-line field — arrows always move between fields.
      const caretAtEnd =
        isNotesField ||
        (isTextarea &&
          target instanceof HTMLTextAreaElement &&
          target.selectionStart === target.value.length &&
          target.selectionEnd === target.value.length);
      const caretAtStart =
        isNotesField ||
        (isTextarea &&
          target instanceof HTMLTextAreaElement &&
          target.selectionStart === 0 &&
          target.selectionEnd === 0);

      // From notes: → goes to the item list. Elsewhere: → / Enter move forward.
      const isForward =
        (e.key === "ArrowRight" && (!isTextarea || caretAtEnd)) ||
        (e.key === "Enter" && !isTextarea && !e.shiftKey);
      const isBack = e.key === "ArrowLeft" && (!isTextarea || caretAtStart);

      if (!isForward && !isBack) return;

      const fields = getBillNavFields();
      const idx = fields.indexOf(current);
      if (idx === -1) return;

      e.preventDefault();

      if (isBack) {
        if (idx > 0) fields[idx - 1].focus();
        return;
      }

      const itemRow = current.closest("tr[data-item-row]");
      if (itemRow && e.key === "Enter") {
        const rowFields = Array.from(
          itemRow.querySelectorAll<HTMLElement>("[data-bill-nav]"),
        );
        const isLastInRow = rowFields[rowFields.length - 1] === current;
        const lineId = itemRow.getAttribute("data-item-row");
        const items = extLinesRef.current.filter((l) => l.lineType === "item");
        const isLastRow =
          items.length > 0 && items[items.length - 1].id === lineId;
        if (isLastInRow && isLastRow) {
          const newId = addItemLineWithId();
          focusFirstItemField(newId);
          return;
        }
      }

      if (idx < fields.length - 1) fields[idx + 1].focus();
    },
    [addItemLineWithId, focusFirstItemField, getBillNavFields],
  );

  const addItemLine = useCallback(() => {
    const newId = addItemLineWithId();
    focusFirstItemField(newId);
  }, [addItemLineWithId, focusFirstItemField]);

  const focusBillDate = useCallback(() => {
    const el = document.getElementById("billDate") as HTMLInputElement | null;
    el?.focus?.();
  }, []);

  const focusParty = useCallback(() => {
    const el = document.getElementById("partyTrigger") as HTMLButtonElement | null;
    el?.focus?.();
  }, []);

  const focusLineItems = useCallback(() => {
    const first = extLinesRef.current.find((l) => l.lineType === "item");
    if (!first) return;
    focusFirstItemField(first.id);
  }, [focusFirstItemField]);

  useEffect(() => {
    if (isEditing) return;
    const timer = setTimeout(() => focusParty(), 150);
    return () => clearTimeout(timer);
  }, [isEditing, focusParty]);

  const removeLine = (id: string) =>
    setExtLines((prev) => prev.filter((l) => l.id !== id));

  const updateLine = (id: string, patch: Partial<ExtendedLine>) =>
    setExtLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );

  const handleItemRowNav = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      const isDelete =
        e.key === "Delete" && !e.ctrlKey && !e.shiftKey && !e.altKey;
      const isUp = e.key === "ArrowUp" && !e.ctrlKey && !e.shiftKey && !e.altKey;
      const isDown =
        e.key === "ArrowDown" && !e.ctrlKey && !e.shiftKey && !e.altKey;
      if (!isDelete && !isUp && !isDown) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const row = target.closest("tr[data-item-row]") as HTMLElement | null;
      if (!row) return;

      const fields = Array.from(
        row.querySelectorAll<HTMLElement>("[data-bill-nav]"),
      ).filter((el) => !el.hasAttribute("disabled"));
      const current = (target.closest("[data-bill-nav]") ?? target) as HTMLElement;
      const idx = fields.indexOf(current);
      if (idx === -1) return;

      if (isUp || isDown) {
        e.preventDefault();
        const lines = extLinesRef.current.filter((l) => l.lineType === "item");
        const currentIndex = lines.findIndex((l) => l.id === lineId);
        const sibling = isDown
          ? lines[currentIndex + 1]
          : lines[currentIndex - 1];
        if (sibling) {
          focusFieldAtIndex("tr[data-item-row", sibling.id, idx);
        }
        return;
      }

      if (isDelete) {
        const lines = extLinesRef.current.filter((l) => l.lineType === "item");
        if (lines.length <= 1) {
          e.preventDefault();
          updateLine(lineId, {
            itemId: "",
            quantity: undefined,
            unitPrice: undefined,
          });
          focusFirstItemField(lineId);
          return;
        }
        e.preventDefault();
        const currentIndex = lines.findIndex((l) => l.id === lineId);
        const nextLine = lines[currentIndex + 1];
        const prevLine = lines[currentIndex - 1];
        removeLine(lineId);
        if (nextLine) focusFieldAtIndex("tr[data-item-row", nextLine.id, idx);
        else if (prevLine) focusFieldAtIndex("tr[data-item-row", prevLine.id, idx);
      }
    },
    [focusFieldAtIndex, focusFirstItemField, updateLine],
  );

  const handleSundryRowNav = useCallback(
    (e: React.KeyboardEvent, lineId: string) => {
      const isDelete =
        e.key === "Delete" && !e.ctrlKey && !e.shiftKey && !e.altKey;
      if (!isDelete) return;

      const lines = extLinesRef.current.filter((l) => l.lineType === "sundry");
      if (lines.length === 0) return;
      e.preventDefault();
      removeLine(lineId);
    },
    [],
  );

  const addSundryLine = useCallback(() => {
    // Focus the picker row — do not create a blank/walk-in sundry line.
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(
          'tr:not([data-sundry-row]) [data-bill-nav="sundryLabel"]',
        )
        ?.focus();
    }, 0);
  }, []);

  const addSundryWithLabel = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed || isForbiddenSundryName(trimmed)) {
        toast.error("Pick a sundry from the list");
        return;
      }
      const newId = uid();
      setExtLines((prev) => [
        ...prev,
        {
          id: newId,
          lineType: "sundry",
          sundryLabel: trimmed,
          sundryAmount: undefined,
        },
      ]);
      focusSundryAmountField(newId);
    },
    [focusSundryAmountField],
  );

  // Global keyboard shortcuts (avoid when typing in text inputs/textarea, except Ctrl/Alt combos)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName ?? "").toLowerCase();
      const isTypingField =
        tag === "input" || tag === "textarea" || (t as any)?.isContentEditable;

      // ?: open shortcuts (works even while typing, but doesn't insert a "?")
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Ctrl+S: submit bill
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formElRef.current?.requestSubmit?.();
        return;
      }

      // Alt+D: focus bill date
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        focusBillDate();
        return;
      }
      // Alt+P: focus party
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        focusParty();
        return;
      }
      // Alt+L: focus line items table
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        focusLineItems();
        return;
      }

      // Don't steal plain keys from typing fields
      if (isTypingField) return;

      // Ctrl+I: add item line
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        addItemLine();
        return;
      }
      // Ctrl+E: add sundry line
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        addSundryLine();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    addItemLine,
    addSundryLine,
    focusBillDate,
    focusLineItems,
    focusParty,
  ]);

  useEffect(() => {
    if (isEditing) return;
    const isReturn =
      billKind === "sale_return" || billKind === "purchase_return";
    // Returns are credit notes by default — do not auto-mark as paid.
    if (isReturn) return;
    if (paymentMode === "mixed") return;
    if (
      paymentMode === "cash" ||
      paymentMode === "upi" ||
      paymentMode === "bank"
    ) {
      form.setValue("paidAmount", computedTotal);
    }
    if (paymentMode !== "upi" && paymentMode !== "bank") {
      form.setValue("bankAccountId", "");
    }
  }, [computedTotal, isEditing, paymentMode, billKind, form]);

  // Mixed tender rows: keep paidAmount = sum of splits.
  useEffect(() => {
    if (paymentMode !== "mixed") return;
    const sum = paymentSplits.reduce((s, row) => s + (Number(row.amount) || 0), 0);
    form.setValue("paidAmount", sum);
    const online = paymentSplits.find(
      (row) => row.method !== "cash" && row.bankAccountId,
    );
    if (online?.bankAccountId) {
      form.setValue("bankAccountId", online.bankAccountId);
    }
  }, [paymentMode, paymentSplits, form]);

  useEffect(() => {
    if (paymentMode !== "mixed") return;
    setPaymentSplits((prev) => {
      if (prev.length > 0) return prev;
      return [{ id: uid(), method: "cash", amount: 0 }];
    });
  }, [paymentMode]);

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
      const billId =
        typeof data?.data?._id === "string" ? (data.data._id as string) : "";
      const billNumber =
        typeof data?.data?.billNumber === "string"
          ? (data.data.billNumber as string)
          : "—";

      toast.success(`Bill ${billNumber} created`);
      qc.invalidateQueries({ queryKey: ["payment-alert"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["items"] });

      // Open post-create modal so the user can WhatsApp + Print (in any order).
      postCreateAllowCloseRef.current = false;
      setCreatedBill(billId ? { id: billId, billNumber } : null);
      setPostCreateOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetToCreateMode = useCallback(() => {
    window.history.replaceState(null, "", "/billing");
    setSelectedBillId(null);
    setExtLines(createDefaultExtLines());
    setPaymentSplits([{ id: uid(), method: "cash", amount: 0 }]);
    form.reset({
      billKind: "sale",
      billDate: new Date(),
      partyId: "",
      lines: [],
      displayName: "",
      paidAmount: 0,
      paymentMode: "cash",
      bankAccountId: "",
      paymentSplits: [],
      notes: "",
      allowNegativeStock: false,
    });
  }, [form]);

  const openPrintDialog = useCallback(() => {
    setPrintDialogOpen(true);
  }, []);

  const handlePrintWithOptions = useCallback(
    (options: Parameters<typeof applyPrintOptions>[0]) => {
      applyPrintOptions(options);
      window.setTimeout(() => window.print(), 50);
    },
    [],
  );

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
    onSuccess: (data) => {
      const billId = selectedBillId ?? "";
      const billNumber =
        typeof data?.data?.billNumber === "string"
          ? (data.data.billNumber as string)
          : (selectedBill.data?.billNumber ?? "—");

      toast.success(`Bill ${billNumber} updated`);
      qc.invalidateQueries({ queryKey: ["bill", selectedBillId] });
      qc.invalidateQueries({ queryKey: ["payment-alert"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["items"] });

      // Open the same modal on update so user can WhatsApp + Print final bill.
      postCreateAllowCloseRef.current = false;
      setCreatedBill(billId ? { id: billId, billNumber } : null);
      setPostCreateOpen(true);
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

  // ── Print invoice data ──────────────────────────────────────────────────────
  // usePrintInvoice maps billing-page state → the InvoiceData shape.
  // The hook is memoized, so it only recalculates when its inputs change.

  const invoiceData = usePrintInvoice({
    formValues: {
      billKind,
      billDate: billDate instanceof Date ? billDate : new Date(),
      displayName,
      paymentMode,
      paidAmount,
      notes,
    },
    extLines,
    items: items.data ?? [],
    invoiceNumber: selectedBillId
      ? selectedBill.data?.billNumber
      : createdBill?.billNumber,
    itemsSubtotal,
    sundrySubtotal,
    computedTotal,
  });

  const handlePostCreateClose = useCallback(() => {
    postCreateAllowCloseRef.current = true;
    setPostCreateOpen(false);
    setCreatedBill(null);
    resetToCreateMode();
  }, [resetToCreateMode]);

  const [waSending, setWaSending] = useState(false);

  const downloadBillPdfToDocuments = useCallback(async () => {
    if (!createdBill?.id) {
      toast.error("Missing bill id");
      return;
    }

    setWaSending(true);
    try {
      // In Electron we can write to Documents directly.
      if (window.cashflow?.saveBillPdf) {
        await window.cashflow.saveBillPdf({
          billId: createdBill.id,
          billNumber: createdBill.billNumber,
        });
        toast.success("Bill is stored in Documents/cashFlow/");
        return;
      }

      // Browser fallback: download via HTTP.
      const res = await fetch(`/api/bills/${createdBill.id}/pdf`);
      if (!res.ok) {
        const json = await res.json().catch(() => null as any);
        throw new Error(json?.error ?? "Failed to download");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${createdBill.billNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    } finally {
      setWaSending(false);
    }
  }, [createdBill?.billNumber, createdBill?.id]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/*
       * InvoicePrint is always in the DOM (display:none on screen).
       * window.print() reveals it via @media print rules.
       * Place it OUTSIDE the <form> so it is never nested inside it.
       */}
      <InvoicePrint data={invoiceData} />

      <PrintInvoiceDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        partyId={partyId || null}
        onPrintInvoice={handlePrintWithOptions}
      />

      <UpiQrFullscreen
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        amount={upiQrAmount}
        upiId={upiId}
        payeeName={upiPayeeName}
      />

      <Dialog
        open={postCreateOpen}
        onOpenChange={(next) => {
          // Prevent closing via outside click / escape. Only Done / X closes.
          if (next) {
            setPostCreateOpen(true);
            return;
          }
          if (postCreateAllowCloseRef.current) {
            setPostCreateOpen(false);
          } else {
            setPostCreateOpen(true);
          }
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <div className="flex items-start justify-between gap-3">
            <DialogHeader className="gap-1">
              <DialogTitle>Bill created</DialogTitle>
              <DialogDescription>
                Download and/or print the final bill. Close only when you&apos;re
                done.
              </DialogDescription>
            </DialogHeader>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handlePostCreateClose}
              title="Close"
            >
              <XIcon className="size-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={downloadBillPdfToDocuments}
              disabled={waSending}
            >
              {waSending ? "Downloading..." : "Download PDF"}
            </Button>
            <Button type="button" variant="outline" onClick={openPrintDialog}>
              Print bill
            </Button>
            {createdBill?.id ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.open(`/billing/${createdBill.id}`, "_blank")}
              >
                Open bill
              </Button>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handlePostCreateClose}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEditing
              ? "Edit bill"
              : billKind === "purchase"
                ? "New Purchase"
                : billKind === "sale_return"
                  ? "Sale Return"
                  : billKind === "purchase_return"
                    ? "Purchase Return"
                    : "New Invoice"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Create sales, purchases, and returns — stock and balances update
            together.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
          >
            Shortcuts
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={openPrintDialog}
            title="Print invoice"
          >
            <Printer className="size-4" />
            Print invoice
          </Button>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              try {
                sessionStorage.removeItem("cf_billing_draft");
              } catch {
                // ignore
              }
              resetToCreateMode();
            }}
            title="Reset form (manual)"
          >
            Reset
          </Button>
        </div>
      </div>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Navigate Billing faster without the mouse.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2">
              <div className="text-muted-foreground">Save bill</div>
              <div>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Ctrl</kbd>{" "}
                +{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">S</kbd>
              </div>

              <div className="text-muted-foreground">Focus date</div>
              <div>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Alt</kbd>{" "}
                +{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">D</kbd>
              </div>

              <div className="text-muted-foreground">Focus party</div>
              <div>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Alt</kbd>{" "}
                +{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">P</kbd>
              </div>

              <div className="text-muted-foreground">Focus line items</div>
              <div>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Alt</kbd>{" "}
                +{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">L</kbd>
              </div>

              <div className="text-muted-foreground">Add item line</div>
              <div>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Ctrl</kbd>{" "}
                +{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">I</kbd>
              </div>

              <div className="text-muted-foreground">Add sundry line</div>
              <div>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Ctrl</kbd>{" "}
                +{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">E</kbd>
              </div>

              <div className="text-muted-foreground">Field navigation</div>
              <div className="space-y-1">
                <div>
                  <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Enter</kbd>{" "}
                  /{" "}
                  <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">→</kbd>{" "}
                  next field
                </div>
                <div>
                  <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">←</kbd>{" "}
                  previous field
                </div>
                <div>
                  <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">↑</kbd>{" "}
                  /{" "}
                  <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">↓</kbd>{" "}
                  moves between item rows
                </div>
                <div>
                  <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Del</kbd>{" "}
                  /{" "}
                  <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Backspace</kbd>{" "}
                  clears or deletes a row
                </div>
              </div>

              <div className="text-muted-foreground">Help</div>
              <div>
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">?</kbd>{" "}
                opens this dialog
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShortcutsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Form ── */}
      <form
        noValidate
        className="grid gap-4 lg:grid-cols-[minmax(260px,300px)_1fr] items-start"
        ref={formElRef}
        onKeyDownCapture={handleBillingNavCapture}
        onSubmit={form.handleSubmit(
          (v) => {
            const selectedItemLines = extLines.filter(
              (l) =>
                l.lineType === "item" &&
                typeof l.itemId === "string" &&
                l.itemId.trim().length > 0,
            );

            if (selectedItemLines.length === 0) {
              toast.error("Add at least one valid item line");
              return;
            }

            const missingQty = selectedItemLines.some(
              (l) =>
                typeof l.quantity !== "number" ||
                !Number.isFinite(l.quantity) ||
                l.quantity <= 0,
            );
            if (missingQty) {
              toast.error("Enter quantity for each selected item");
              return;
            }

            const itemLines = selectedItemLines.map((l) => {
              const catalog = items.data?.find((it) => it._id === l.itemId);
              return {
                itemId: l.itemId!.trim(),
                quantity: l.quantity as number,
                unitPrice:
                  l.unitPrice !== undefined
                    ? l.unitPrice
                    : catalog?.price,
              };
            });

            const allowedSundryLabels = new Set(
              [
                ...SUNDRY_PRESETS,
                ...(sundryTypes.data ?? []).map((s) => s.name),
              ]
                .map((n) => n.trim().toLowerCase())
                .filter(Boolean),
            );

            const sundryCharges = extLines
              .filter((l) => l.lineType === "sundry")
              .map((l) => ({
                label: (l.sundryLabel ?? "").trim(),
                amount: Number(l.sundryAmount) || 0,
              }))
              .filter((c) => {
                if (!c.label || c.amount === 0) return false;
                if (isForbiddenSundryName(c.label)) return false;
                return allowedSundryLabels.has(c.label.toLowerCase());
              });

            const rejectedSundry = extLines.some(
              (l) =>
                l.lineType === "sundry" &&
                (Number(l.sundryAmount) || 0) !== 0 &&
                (!l.sundryLabel?.trim() ||
                  isForbiddenSundryName(l.sundryLabel) ||
                  !allowedSundryLabels.has(
                    (l.sundryLabel ?? "").trim().toLowerCase(),
                  )),
            );
            if (rejectedSundry) {
              toast.error(
                "Choose a sundry from the list (presets or custom). Walk-in / typed labels are not allowed.",
              );
              return;
            }

            const splits =
              v.paymentMode === "mixed"
                ? paymentSplits
                    .filter((row) => (Number(row.amount) || 0) > 0)
                    .map((row) => ({
                      method: row.method,
                      amount: Number(row.amount) || 0,
                      bankAccountId: row.bankAccountId,
                    }))
                : [];

            if (v.paymentMode === "mixed" && splits.length === 0) {
              toast.error("Add at least one payment split amount");
              return;
            }

            const paidFromSplits = splits.reduce((s, row) => s + row.amount, 0);

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
              paidAmount:
                v.paymentMode === "mixed" ? paidFromSplits : v.paidAmount,
              paymentMode: v.paymentMode,
              bankAccountId: v.bankAccountId || undefined,
              paymentSplits: splits,
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
        <div className="space-y-3 rounded-xl border p-3 lg:sticky lg:top-4">
          {!isEditing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={billKind === "sale" ? "default" : "outline"}
                onClick={() => {
                  form.setValue("billKind", "sale");
                  form.setValue("partyId", "");
                  form.setValue("displayName", "");
                  window.history.replaceState(null, "", "/billing");
                }}
              >
                Sale
              </Button>
              <Button
                type="button"
                size="sm"
                variant={billKind === "purchase" ? "default" : "outline"}
                onClick={() => {
                  form.setValue("billKind", "purchase");
                  form.setValue("partyId", "");
                  form.setValue("displayName", "");
                  window.history.replaceState(
                    null,
                    "",
                    "/billing?kind=purchase",
                  );
                }}
              >
                Purchase
              </Button>
              <Button
                type="button"
                size="sm"
                variant={billKind === "sale_return" ? "default" : "outline"}
                onClick={() => {
                  form.setValue("billKind", "sale_return");
                  form.setValue("partyId", "");
                  form.setValue("displayName", "");
                  form.setValue("paymentMode", "credit");
                  form.setValue("paidAmount", 0);
                  window.history.replaceState(
                    null,
                    "",
                    "/billing?kind=sale_return",
                  );
                }}
              >
                Sale return
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  billKind === "purchase_return" ? "default" : "outline"
                }
                onClick={() => {
                  form.setValue("billKind", "purchase_return");
                  form.setValue("partyId", "");
                  form.setValue("displayName", "");
                  form.setValue("paymentMode", "credit");
                  form.setValue("paidAmount", 0);
                  window.history.replaceState(
                    null,
                    "",
                    "/billing?kind=purchase_return",
                  );
                }}
              >
                Purchase return
              </Button>
            </div>
          ) : null}

          {/* Bill date */}
          <div className="space-y-1.5">
            <Label htmlFor="billDate">Bill date</Label>
            <Input
              id="billDate"
              data-bill-nav="billDate"
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
            <Label>
              {billKind === "purchase" || billKind === "purchase_return"
                ? "Supplier"
                : "Customer"}
            </Label>
            <PartyCombobox
              hideChevron
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
              partyType={
                billKind === "sale" || billKind === "sale_return"
                  ? "customer"
                  : "supplier"
              }
              placeholder={
                billKind === "purchase" || billKind === "purchase_return"
                  ? "Type supplier name or select party"
                  : "Type customer name or select party"
              }
              triggerProps={{
                id: "partyTrigger",
                "data-bill-nav": "party",
              }}
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
          {paymentAlert.data?.alert &&
          (billKind === "sale" || billKind === "sale_return") ? (
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
                onValueChange={(val) => {
                  const mode = val as BillCreateInput["paymentMode"];
                  form.setValue("paymentMode", mode);
                  if (mode === "mixed") {
                    setPaymentSplits([
                      { id: uid(), method: "cash", amount: 0 },
                    ]);
                    form.setValue("paidAmount", 0);
                  }
                }}
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
            {paymentMode !== "mixed" ? (
              <div className="space-y-1.5">
                <Label htmlFor="paid">Paid amount</Label>
                <Input
                  id="paid"
                  data-bill-nav="paid"
                  type="number"
                  step="0.01"
                  {...form.register("paidAmount", { valueAsNumber: true })}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Paid total</Label>
                <div className="flex h-9 items-center rounded-md border px-3 text-sm tabular-nums">
                  {formatMoney(
                    paymentSplits.reduce(
                      (s, row) => s + (Number(row.amount) || 0),
                      0,
                    ),
                  )}
                </div>
              </div>
            )}
          </div>

          {paymentMode === "mixed" ? (
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs text-muted-foreground">
                Split payment
              </Label>
              <div className="space-y-2">
                {paymentSplits.map((row, index) => {
                  const isCashRow = index === 0;
                  return (
                    <div key={row.id} className="space-y-2">
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                        {isCashRow ? (
                          <div className="flex h-8 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                            Cash
                          </div>
                        ) : (
                          <Select
                            value={row.method}
                            onValueChange={(val) =>
                              setPaymentSplits((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? {
                                        ...r,
                                        method: val as PaymentSplitRow["method"],
                                      }
                                    : r,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="upi">UPI</SelectItem>
                              <SelectItem value="bank">Bank</SelectItem>
                              <SelectItem value="cash">Cash</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-8"
                          placeholder="Amount"
                          value={row.amount || ""}
                          onChange={(e) => {
                            const amount =
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value) || 0;
                            setPaymentSplits((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, amount } : r,
                              ),
                            );
                          }}
                        />
                        {isCashRow ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            title="Add UPI / bank row"
                            onClick={() =>
                              setPaymentSplits((prev) => [
                                ...prev,
                                { id: uid(), method: "upi", amount: 0 },
                              ])
                            }
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            title="Remove"
                            onClick={() =>
                              setPaymentSplits((prev) =>
                                prev.filter((r) => r.id !== row.id),
                              )
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                      {!isCashRow && row.method !== "cash" ? (
                        <Select
                          value={row.bankAccountId ?? "__none__"}
                          onValueChange={(val) =>
                            setPaymentSplits((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? {
                                      ...r,
                                      bankAccountId:
                                        !val || val === "__none__"
                                          ? undefined
                                          : String(val),
                                    }
                                  : r,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Bank account (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {bankAccounts.data?.map((account) => (
                              <SelectItem key={account._id} value={account._id}>
                                {account.accountName} ({account.bankName})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter cash, then press + to add UPI/bank rows. Unpaid remainder
                stays as credit.
              </p>
            </div>
          ) : null}

          {(paymentMode === "upi" || paymentMode === "bank") && (
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
                {upiId
                  ? `UPI: ${upiId}`
                  : "Add a UPI ID under Bank Accounts to generate a QR code."}
              </span>
            </div>
          ) : null}

          {/* Negative stock */}
          {billKind === "sale" || billKind === "purchase_return" ? (
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
            <Textarea
              id="notes"
              data-bill-nav="notes"
              rows={1}
              className="min-h-8 resize-none"
              {...form.register("notes")}
            />
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

        {/* ── RIGHT: Busy-style item + sundry tables ── */}
        <BillingBusyGrid
          itemLines={itemLines}
          sundryLines={sundryLines}
          items={items.data ?? []}
          itemsSubtotal={itemsSubtotal}
          sundrySubtotal={sundrySubtotal}
          computedTotal={computedTotal}
          onUpdateItem={(id, patch) => updateLine(id, patch)}
          onUpdateSundry={(id, patch) => updateLine(id, patch)}
          onRemoveItem={(id) => {
            const lines = extLinesRef.current.filter((l) => l.lineType === "item");
            if (lines.length <= 1) {
              updateLine(id, {
                itemId: "",
                quantity: undefined,
                unitPrice: undefined,
              });
              focusFirstItemField(id);
              return;
            }
            removeLine(id);
          }}
          onRemoveSundry={removeLine}
          onAddSundryWithLabel={addSundryWithLabel}
          onItemRowKeyDown={handleItemRowNav}
          onSundryRowKeyDown={handleSundryRowNav}
        />
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
