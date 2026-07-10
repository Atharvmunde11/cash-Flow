/**
 * usePrintInvoice.ts
 * Converts the billing page's runtime state into the InvoiceData shape
 * consumed by <InvoicePrint />.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  InvoiceData,
  InvoiceLineItem,
} from "../app/(dashboard)/billing/Invoiceprint";

// ── Shape matching what the billing page already has ──────────────────────────

type ExtendedLine = {
  id: string;
  lineType: "item" | "sundry";
  itemId?: string;
  quantity?: number;
  unitPrice?: number;
  sundryLabel?: string;
  sundryAmount?: number;
};

type Item = {
  _id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
};

type UsePrintInvoiceParams = {
  /** The billing form values (from react-hook-form watch) */
  formValues: {
    billKind: "sale" | "purchase";
    billDate: Date;
    displayName: string;
    paymentMode?: string;
    paidAmount?: number;
    notes?: string;
  };
  extLines: ExtendedLine[];
  items: Item[];
  /** Optional sequential bill number, e.g. "BILL-0042" */
  invoiceNumber?: string;
  itemsSubtotal: number;
  sundrySubtotal: number;
  computedTotal: number;
};

/** Minimal company info — swap with your own config / env vars / API */
const FALLBACK_COMPANY: InvoiceData["company"] = {
  name: "Business",
  addressLine1: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  email: "",
  gstin: "",
};

export function usePrintInvoice({
  formValues,
  extLines,
  items,
  invoiceNumber,
  itemsSubtotal,
  sundrySubtotal,
  computedTotal,
}: UsePrintInvoiceParams): InvoiceData {
  const business = useQuery({
    queryKey: ["business-profile"],
    queryFn: async () => {
      const res = await fetch("/api/settings/business");
      if (!res.ok) throw new Error("Failed");
      return (
        (await res.json()) as {
          data: { name: string; address: string; phone: string };
        }
      ).data;
    },
  });

  return useMemo<InvoiceData>(() => {
    // Map extended lines → InvoiceLineItem[]
    const invoiceLines: InvoiceLineItem[] = extLines.map((line) => {
      if (line.lineType === "sundry") {
        return {
          id: line.id,
          lineType: "sundry",
          sundryLabel: line.sundryLabel,
          sundryAmount: line.sundryAmount,
        };
      }
      const matchedItem = items.find((it) => it._id === line.itemId);
      return {
        id: line.id,
        lineType: "item",
        description: matchedItem?.name ?? line.itemId ?? "—",
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unit: matchedItem?.unit,
      };
    });

    const company: InvoiceData["company"] = {
      ...FALLBACK_COMPANY,
      name: business.data?.name?.trim() ? business.data.name.trim() : FALLBACK_COMPANY.name,
      addressLine1: business.data?.address?.trim() ? business.data.address.trim() : "",
      phone: business.data?.phone?.trim() ? business.data.phone.trim() : "",
    };

    return {
      title: formValues.billKind === "purchase" ? "PURCHASE BILL" : "INVOICE",
      invoiceNumber,
      invoiceDate: formValues.billDate,
      company,
      billTo: {
        name: formValues.displayName || "—",
      },
      lines: invoiceLines,
      itemsSubtotal,
      sundrySubtotal,
      total: computedTotal,
      billKind: formValues.billKind,
      paymentMode: formValues.paymentMode,
      paidAmount:
        formValues.paidAmount && formValues.paidAmount > 0
          ? formValues.paidAmount
          : undefined,
      notes: formValues.notes,
      terms:
        "Payment is due within 15 days. Please make checks payable to Your Company Name.",
    };
  }, [
    extLines,
    items,
    formValues,
    invoiceNumber,
    itemsSubtotal,
    sundrySubtotal,
    computedTotal,
    business.data?.address,
    business.data?.name,
    business.data?.phone,
  ]);
}
