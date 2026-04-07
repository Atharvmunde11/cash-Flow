import mongoose from "mongoose";
import { Bill } from "@/models/Bill";
import { Item } from "@/models/Item";
import { Party } from "@/models/Party";
import { LedgerTransaction } from "@/models/Transaction";
import { getNextBillNumber } from "@/models/Counter";
import { assertPartyForTransaction, partyBalanceDelta } from "@/lib/ledger";
import type { BillCreateInput } from "@/lib/validations";

type SundryChargeInput = {
  label: string;
  amount: number;
};

export type StockWarning = {
  itemId: mongoose.Types.ObjectId;
  itemName: string;
  requested: number;
  available: number;
  appliedNegative: boolean;
};

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

/** Runs without multi-document transactions (standalone mongod has no replica set). */
export async function createBillWithSideEffects(
  input: BillCreateInput & { sundryCharges?: SundryChargeInput[] },
): Promise<{
  billId: mongoose.Types.ObjectId;
  billNumber: string;
  stockWarnings: StockWarning[];
}> {
  if (input.billKind === "purchase") {
    return createPurchaseBillWithSideEffects(input);
  }
  return createSaleBillWithSideEffects(input);
}

async function createSaleBillWithSideEffects(
  input: BillCreateInput & { sundryCharges?: SundryChargeInput[] },
): Promise<{
  billId: mongoose.Types.ObjectId;
  billNumber: string;
  stockWarnings: StockWarning[];
}> {
  const party =
    input.partyId && mongoose.Types.ObjectId.isValid(input.partyId)
      ? await Party.findById(input.partyId)
      : null;

  if (input.partyId && !party) throw new Error("Party not found");
  if (party) assertPartyForTransaction(party, "customer");

  const lines: Array<{
    itemId: mongoose.Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
    purchasePrice: number;
    lineTotal: number;
  }> = [];

  const stockWarnings: StockWarning[] = [];
  const sundryCharges = (input.sundryCharges ?? [])
    .map((charge) => ({
      label: charge.label.trim(),
      amount: Number(charge.amount) || 0,
    }))
    .filter((charge) => charge.label.length > 0 || charge.amount > 0);

  for (const line of input.lines) {
    const item = await Item.findById(line.itemId);
    if (!item) throw new Error(`Item not found: ${line.itemId}`);
    const unitPrice =
      line.unitPrice !== undefined ? line.unitPrice : item.price;
    const lineTotal = unitPrice * line.quantity;
    const nextQty = item.quantity - line.quantity;
    if (nextQty < 0) {
      stockWarnings.push({
        itemId: item._id,
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
    lines.push({
      itemId: item._id,
      name: item.name,
      quantity: line.quantity,
      unitPrice,
      purchasePrice: (item as { purchasePrice?: number }).purchasePrice ?? 0,
      lineTotal,
    });
  }

  const total =
    lines.reduce((s, l) => s + l.lineTotal, 0) +
    sundryCharges.reduce((s, charge) => s + charge.amount, 0);
  if (total <= 0) throw new Error("Bill total must be positive");

  const paid = Math.min(input.paidAmount, total);
  const creditAmount = total - paid;

  if (input.paymentMode === "credit" && paid > 0) {
    throw new Error("Credit bills cannot include paid amount");
  }

  for (let i = 0; i < lines.length; i++) {
    const built = lines[i];
    const item = await Item.findById(built.itemId);
    if (!item) throw new Error("Item missing");
    const nextQty = item.quantity - built.quantity;
    item.quantity = nextQty;
    await item.save();
    if (nextQty < 0) {
      const w = stockWarnings.find((x) => x.itemId.equals(item._id));
      if (w) w.appliedNegative = true;
    }
  }

  const docPaymentMode = resolveDocPaymentMode(
    input.paymentMode,
    paid,
    creditAmount,
  );

  const billNumber = await getNextBillNumber("sale");
  const billDate = input.billDate;
  const hourOfDay = billDate.getHours();

  const [bill] = await Bill.create([
    {
      billKind: "sale" as const,
      billDate,
      billNumber,
      partyId: party ? party._id : undefined,
      displayName: input.displayName ?? "",
      lines,
      sundryCharges,
      total,
      paidAmount: paid,
      creditAmount,
      paymentMode: docPaymentMode,
      bankAccountId: input.bankAccountId,
      hourOfDay,
      notes: input.notes ?? "",
      stockWarnings: stockWarnings.map((w) => ({
        itemId: w.itemId,
        itemName: w.itemName,
        requested: w.requested,
        available: w.available,
        appliedNegative: w.appliedNegative,
      })),
    },
  ]);

  if (party) {
    let balance = party.balance;
    balance += partyBalanceDelta("customer", "debit", total);

    await LedgerTransaction.create([
      {
        partyId: party._id,
        partyType: "customer",
        entryType: "debit",
        amount: total,
        paymentMode: "credit",
        date: billDate,
        notes: `Bill ${billNumber}`,
        refType: "bill_invoice",
        billId: bill._id,
        balanceAfterParty: balance,
      },
    ]);

    if (paid > 0) {
      const payMode = paymentLedgerMode(input.paymentMode);
      balance += partyBalanceDelta("customer", "credit", paid);
      party.lastPaymentAt = billDate;
      await LedgerTransaction.create([
        {
          partyId: party._id,
          partyType: "customer",
          entryType: "credit",
          amount: paid,
          paymentMode: payMode,
          date: billDate,
          notes: `Payment for ${billNumber}`,
          refType: "bill_payment",
          billId: bill._id,
          balanceAfterParty: balance,
        },
      ]);
    }

    party.balance = balance;
    await party.save();
  }

  return {
    billId: bill._id as mongoose.Types.ObjectId,
    billNumber,
    stockWarnings,
  };
}

async function createPurchaseBillWithSideEffects(
  input: BillCreateInput & { sundryCharges?: SundryChargeInput[] },
): Promise<{
  billId: mongoose.Types.ObjectId;
  billNumber: string;
  stockWarnings: StockWarning[];
}> {
  const party = await Party.findById(input.partyId);
  if (!party) throw new Error("Party not found");
  assertPartyForTransaction(party, "supplier");

  const lines: Array<{
    itemId: mongoose.Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
    purchasePrice: number;
    lineTotal: number;
  }> = [];
  const sundryCharges = (input.sundryCharges ?? [])
    .map((charge) => ({
      label: charge.label.trim(),
      amount: Number(charge.amount) || 0,
    }))
    .filter((charge) => charge.label.length > 0 || charge.amount > 0);

  for (const line of input.lines) {
    const item = await Item.findById(line.itemId);
    if (!item) throw new Error(`Item not found: ${line.itemId}`);
    const unitPrice =
      line.unitPrice !== undefined ? line.unitPrice : item.price;
    const lineTotal = unitPrice * line.quantity;
    lines.push({
      itemId: item._id,
      name: item.name,
      quantity: line.quantity,
      unitPrice,
      purchasePrice: (item as { purchasePrice?: number }).purchasePrice ?? 0,
      lineTotal,
    });
  }

  const total =
    lines.reduce((s, l) => s + l.lineTotal, 0) +
    sundryCharges.reduce((s, charge) => s + charge.amount, 0);
  if (total <= 0) throw new Error("Purchase total must be positive");

  const paid = Math.min(input.paidAmount, total);
  const creditAmount = total - paid;

  if (input.paymentMode === "credit" && paid > 0) {
    throw new Error("Credit purchase cannot include paid amount");
  }

  for (const built of lines) {
    const item = await Item.findById(built.itemId);
    if (!item) throw new Error("Item missing");
    item.quantity += built.quantity;
    await item.save();
  }

  const docPaymentMode = resolveDocPaymentMode(
    input.paymentMode,
    paid,
    creditAmount,
  );

  const billNumber = await getNextBillNumber("purchase");
  const billDate = input.billDate;
  const hourOfDay = billDate.getHours();

  const [bill] = await Bill.create([
    {
      billKind: "purchase" as const,
      billDate,
      billNumber,
      partyId: party._id,
      displayName: input.displayName ?? "",
      lines,
      sundryCharges,
      total,
      paidAmount: paid,
      creditAmount,
      paymentMode: docPaymentMode,
      bankAccountId: input.bankAccountId,
      hourOfDay,
      notes: input.notes ?? "",
      stockWarnings: [],
    },
  ]);

  let balance = party.balance;
  balance += partyBalanceDelta("supplier", "credit", total);

  await LedgerTransaction.create([
    {
      partyId: party._id,
      partyType: "supplier",
      entryType: "credit",
      amount: total,
      paymentMode: "credit",
      date: billDate,
      notes: `Purchase ${billNumber}`,
      refType: "purchase_invoice",
      billId: bill._id,
      balanceAfterParty: balance,
    },
  ]);

  if (paid > 0) {
    const payMode = paymentLedgerMode(input.paymentMode);
    balance += partyBalanceDelta("supplier", "debit", paid);
    party.lastPaymentAt = billDate;
    await LedgerTransaction.create([
      {
        partyId: party._id,
        partyType: "supplier",
        entryType: "debit",
        amount: paid,
        paymentMode: payMode,
        date: billDate,
        notes: `Payment for ${billNumber}`,
        refType: "purchase_payment",
        billId: bill._id,
        balanceAfterParty: balance,
      },
    ]);
  }

  party.balance = balance;
  await party.save();

  return {
    billId: bill._id as mongoose.Types.ObjectId,
    billNumber,
    stockWarnings: [],
  };
}
