import { db } from "@/lib/db";
import { getNextBillNumber, type BillNumberKind } from "@/lib/counter";
import { assertPartyForTransaction, partyBalanceDelta } from "@/lib/ledger";
import type { BillCreateInput } from "@/lib/validations";
import { assertDateWritable } from "@/lib/financial-year";

type SundryChargeInput = {
  label: string;
  amount: number;
};

export type StockWarning = {
  itemId: string;
  itemName: string;
  requested: number;
  available: number;
  appliedNegative: boolean;
};

type BillKind = BillCreateInput["billKind"];

function resolveDocPaymentMode(
  inputMode: BillCreateInput["paymentMode"],
  paid: number,
  creditAmount: number,
): "cash" | "upi" | "bank" | "credit" | "mixed" {
  if (paid > 0 && creditAmount > 0) return "mixed";
  if (creditAmount > 0) return "credit";
  if (paid > 0) {
    if (inputMode === "upi" || inputMode === "bank") return inputMode;
    return "cash";
  }
  return inputMode;
}

function paymentLedgerMode(
  inputMode: BillCreateInput["paymentMode"],
): "cash" | "upi" {
  return inputMode === "upi" || inputMode === "bank" ? "upi" : "cash";
}

function stockDeltaForKind(kind: BillKind): "increase" | "decrease" {
  if (kind === "sale" || kind === "purchase_return") return "decrease";
  return "increase";
}

function partyTypeForKind(kind: BillKind): "customer" | "supplier" {
  if (kind === "sale" || kind === "sale_return") return "customer";
  return "supplier";
}

function invoiceEntryType(kind: BillKind): "debit" | "credit" {
  // Sale: customer owes us (debit). Sale return: we owe/credit them back.
  // Purchase: we owe supplier (credit). Purchase return: supplier owes us (debit).
  if (kind === "sale" || kind === "purchase_return") return "debit";
  return "credit";
}

function paymentEntryType(kind: BillKind): "debit" | "credit" {
  // Opposite of invoice entry for cash movement.
  return invoiceEntryType(kind) === "debit" ? "credit" : "debit";
}

function refTypeForKind(kind: BillKind): {
  invoice: string;
  payment: string;
  label: string;
} {
  switch (kind) {
    case "purchase":
      return {
        invoice: "purchase_invoice",
        payment: "purchase_payment",
        label: "Purchase",
      };
    case "sale_return":
      return {
        invoice: "sale_return",
        payment: "sale_return_payment",
        label: "Sale return",
      };
    case "purchase_return":
      return {
        invoice: "purchase_return",
        payment: "purchase_return_payment",
        label: "Purchase return",
      };
    default:
      return {
        invoice: "bill_invoice",
        payment: "bill_payment",
        label: "Bill",
      };
  }
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function ensureWalkInParty(
  tx: TxClient,
  name: string,
  partyType: "customer" | "supplier",
) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = await tx.party.findFirst({
    where: { name: trimmed, partyType },
  });
  if (existing) return existing;

  return tx.party.create({
    data: {
      name: trimmed,
      phone: "",
      address: "",
      openingBalance: 0,
      balance: 0,
      partyType,
    },
  });
}

/** Runs bill creation and side effects in a single SQLite transaction. */
export async function createBillWithSideEffects(
  input: BillCreateInput & {
    sundryCharges?: SundryChargeInput[];
    billNumberOverride?: string;
  },
): Promise<{
  billId: string;
  billNumber: string;
  stockWarnings: StockWarning[];
}> {
  const kind = input.billKind;
  const partyType = partyTypeForKind(kind);
  const stockDir = stockDeltaForKind(kind);
  const refs = refTypeForKind(kind);

  const rawSplits = (input.paymentSplits ?? [])
    .map((s) => ({
      method: s.method,
      amount: Number(s.amount) || 0,
      bankAccountId: s.bankAccountId,
    }))
    .filter((s) => s.amount > 0);

  await assertDateWritable(input.billDate);

  return db.$transaction(async (tx) => {
    let party = input.partyId
      ? await tx.party.findUnique({ where: { id: input.partyId } })
      : null;

    if (input.partyId && !party) throw new Error("Party not found");

    // Auto-save walk-in customers/suppliers from display name.
    if (!party && input.displayName?.trim()) {
      party = await ensureWalkInParty(tx, input.displayName, partyType);
    }

    if (party) {
      assertPartyForTransaction(
        party as { partyType: "customer" | "supplier" },
        partyType,
      );
    } else if (kind === "purchase" || kind === "purchase_return") {
      throw new Error("Supplier is required");
    }

    const stockWarnings: StockWarning[] = [];
    const sundryCharges = (input.sundryCharges ?? [])
      .map((charge) => ({
        label: charge.label.trim(),
        amount: Number(charge.amount) || 0,
      }))
      .filter((charge) => charge.label.length > 0 || charge.amount > 0);

    const builtLines: Array<{
      itemId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      purchasePrice: number;
      lineTotal: number;
    }> = [];

    for (const line of input.lines) {
      const item = await tx.item.findUnique({ where: { id: line.itemId } });
      if (!item) throw new Error(`Item not found: ${line.itemId}`);
      const unitPrice =
        line.unitPrice !== undefined
          ? line.unitPrice
          : kind === "purchase" || kind === "purchase_return"
            ? (item.purchasePrice ?? item.price)
            : item.price;
      const lineTotal = unitPrice * line.quantity;

      if (stockDir === "decrease") {
        const nextQty = item.quantity - line.quantity;
        if (nextQty < 0) {
          stockWarnings.push({
            itemId: item.id,
            itemName: item.name,
            requested: line.quantity,
            available: item.quantity,
            appliedNegative: false,
          });
          if (!input.allowNegativeStock) {
            throw new Error(
              `Insufficient stock for "${item.name}". Available ${item.quantity}, requested ${line.quantity}.`,
            );
          }
        }
      }

      builtLines.push({
        itemId: item.id,
        name: item.name,
        quantity: line.quantity,
        unitPrice,
        purchasePrice: item.purchasePrice ?? 0,
        lineTotal,
      });
    }

    const total =
      builtLines.reduce((s, l) => s + l.lineTotal, 0) +
      sundryCharges.reduce((s, charge) => s + charge.amount, 0);
    if (total <= 0) throw new Error("Bill total must be positive");

    const splitsPaid = rawSplits.reduce((s, row) => s + row.amount, 0);
    const paid = Math.min(
      rawSplits.length > 0 ? splitsPaid : input.paidAmount,
      total,
    );
    const creditAmount = total - paid;

    if (input.paymentMode === "credit" && paid > 0) {
      throw new Error("Credit bills cannot include paid amount");
    }

    if (rawSplits.length > 0 && Math.abs(splitsPaid - paid) > 1e-6) {
      throw new Error("Payment splits must equal paid amount");
    }

    for (const built of builtLines) {
      const item = await tx.item.findUnique({ where: { id: built.itemId } });
      if (!item) throw new Error("Item missing");
      const nextQty =
        stockDir === "decrease"
          ? item.quantity - built.quantity
          : item.quantity + built.quantity;
      await tx.item.update({
        where: { id: item.id },
        data: { quantity: nextQty },
      });
      if (stockDir === "decrease" && nextQty < 0) {
        const w = stockWarnings.find((x) => x.itemId === item.id);
        if (w) w.appliedNegative = true;
      }
    }

    const docPaymentMode =
      rawSplits.length > 1
        ? "mixed"
        : resolveDocPaymentMode(input.paymentMode, paid, creditAmount);

    const primaryBankId =
      input.bankAccountId ??
      rawSplits.find((s) => s.method !== "cash" && s.bankAccountId)
        ?.bankAccountId ??
      null;

    let billNumber = input.billNumberOverride?.trim();
    if (billNumber) {
      const exists = await tx.bill.findUnique({ where: { billNumber } });
      if (exists) throw new Error(`Bill number already exists: ${billNumber}`);
    } else {
      billNumber = await getNextBillNumber(kind as BillNumberKind);
    }
    const billDate = input.billDate;
    const hourOfDay = billDate.getHours();

    const bill = await tx.bill.create({
      data: {
        billKind: kind,
        billDate,
        billNumber,
        partyId: party ? party.id : null,
        displayName: input.displayName ?? party?.name ?? "",
        total,
        paidAmount: paid,
        creditAmount,
        paymentMode: docPaymentMode,
        bankAccountId: primaryBankId,
        hourOfDay,
        notes: input.notes ?? "",
        lines: { create: builtLines },
        sundryCharges: { create: sundryCharges },
        paymentSplits:
          rawSplits.length > 0
            ? {
                create: rawSplits.map((s) => ({
                  method: s.method,
                  amount: s.amount,
                  bankAccountId: s.bankAccountId ?? null,
                })),
              }
            : undefined,
        stockWarnings: {
          create: stockWarnings.map((w) => ({
            itemId: w.itemId,
            itemName: w.itemName,
            requested: w.requested,
            available: w.available,
            appliedNegative: w.appliedNegative,
          })),
        },
      },
    });

    if (party) {
      let balance = party.balance;
      const invEntry = invoiceEntryType(kind);
      balance += partyBalanceDelta(partyType, invEntry, total);

      await tx.ledgerTransaction.create({
        data: {
          partyId: party.id,
          partyType,
          entryType: invEntry,
          amount: total,
          paymentMode: "credit",
          date: billDate,
          notes: `${refs.label} ${billNumber}`,
          refType: refs.invoice,
          billId: bill.id,
          balanceAfterParty: balance,
        },
      });

      if (paid > 0) {
        const payEntry = paymentEntryType(kind);
        if (rawSplits.length > 0) {
          for (const split of rawSplits) {
            const payMode = split.method === "cash" ? "cash" : "upi";
            balance += partyBalanceDelta(partyType, payEntry, split.amount);
            await tx.ledgerTransaction.create({
              data: {
                partyId: party.id,
                partyType,
                entryType: payEntry,
                amount: split.amount,
                paymentMode: payMode,
                date: billDate,
                notes: `Payment (${split.method}) for ${billNumber}`,
                refType: refs.payment,
                billId: bill.id,
                balanceAfterParty: balance,
              },
            });
          }
        } else {
          const payMode = paymentLedgerMode(input.paymentMode);
          balance += partyBalanceDelta(partyType, payEntry, paid);
          await tx.ledgerTransaction.create({
            data: {
              partyId: party.id,
              partyType,
              entryType: payEntry,
              amount: paid,
              paymentMode: payMode,
              date: billDate,
              notes: `Payment for ${billNumber}`,
              refType: refs.payment,
              billId: bill.id,
              balanceAfterParty: balance,
            },
          });
        }
        await tx.party.update({
          where: { id: party.id },
          data: { lastPaymentAt: billDate },
        });
      }

      await tx.party.update({
        where: { id: party.id },
        data: { balance },
      });
    }

    return { billId: bill.id, billNumber, stockWarnings };
  });
}
