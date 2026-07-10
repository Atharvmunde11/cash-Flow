import { db } from "@/lib/db";
import { getNextBillNumber } from "@/lib/counter";
import { assertPartyForTransaction, partyBalanceDelta } from "@/lib/ledger";
import type { BillCreateInput } from "@/lib/validations";

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
  if (input.billKind === "purchase") {
    return createPurchaseBillWithSideEffects(input);
  }
  return createSaleBillWithSideEffects(input);
}

async function createSaleBillWithSideEffects(
  input: BillCreateInput & {
    sundryCharges?: SundryChargeInput[];
    billNumberOverride?: string;
  },
): Promise<{
  billId: string;
  billNumber: string;
  stockWarnings: StockWarning[];
}> {
  return db.$transaction(async (tx) => {
    const party = input.partyId
      ? await tx.party.findUnique({ where: { id: input.partyId } })
      : null;

    if (input.partyId && !party) throw new Error("Party not found");
    if (party) assertPartyForTransaction(party as { partyType: "customer" | "supplier" }, "customer");

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
      const unitPrice = line.unitPrice !== undefined ? line.unitPrice : item.price;
      const lineTotal = unitPrice * line.quantity;
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

    const paid = Math.min(input.paidAmount, total);
    const creditAmount = total - paid;

    if (input.paymentMode === "credit" && paid > 0) {
      throw new Error("Credit bills cannot include paid amount");
    }

    // Apply stock updates
    for (const built of builtLines) {
      const item = await tx.item.findUnique({ where: { id: built.itemId } });
      if (!item) throw new Error("Item missing");
      const nextQty = item.quantity - built.quantity;
      await tx.item.update({
        where: { id: item.id },
        data: { quantity: nextQty },
      });
      if (nextQty < 0) {
        const w = stockWarnings.find((x) => x.itemId === item.id);
        if (w) w.appliedNegative = true;
      }
    }

    const docPaymentMode = resolveDocPaymentMode(input.paymentMode, paid, creditAmount);

    let billNumber = input.billNumberOverride?.trim();
    if (billNumber) {
      const exists = await tx.bill.findUnique({ where: { billNumber } });
      if (exists) throw new Error(`Bill number already exists: ${billNumber}`);
    } else {
      billNumber = await getNextBillNumber("sale");
    }
    const billDate = input.billDate;
    const hourOfDay = billDate.getHours();

    const bill = await tx.bill.create({
      data: {
        billKind: "sale",
        billDate,
        billNumber,
        partyId: party ? party.id : null,
        displayName: input.displayName ?? "",
        total,
        paidAmount: paid,
        creditAmount,
        paymentMode: docPaymentMode,
        bankAccountId: input.bankAccountId ?? null,
        hourOfDay,
        notes: input.notes ?? "",
        lines: { create: builtLines },
        sundryCharges: { create: sundryCharges },
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
      balance += partyBalanceDelta("customer", "debit", total);

      await tx.ledgerTransaction.create({
        data: {
          partyId: party.id,
          partyType: "customer",
          entryType: "debit",
          amount: total,
          paymentMode: "credit",
          date: billDate,
          notes: `Bill ${billNumber}`,
          refType: "bill_invoice",
          billId: bill.id,
          balanceAfterParty: balance,
        },
      });

      if (paid > 0) {
        const payMode = paymentLedgerMode(input.paymentMode);
        balance += partyBalanceDelta("customer", "credit", paid);
        await tx.ledgerTransaction.create({
          data: {
            partyId: party.id,
            partyType: "customer",
            entryType: "credit",
            amount: paid,
            paymentMode: payMode,
            date: billDate,
            notes: `Payment for ${billNumber}`,
            refType: "bill_payment",
            billId: bill.id,
            balanceAfterParty: balance,
          },
        });
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

async function createPurchaseBillWithSideEffects(
  input: BillCreateInput & {
    sundryCharges?: SundryChargeInput[];
    billNumberOverride?: string;
  },
): Promise<{
  billId: string;
  billNumber: string;
  stockWarnings: StockWarning[];
}> {
  return db.$transaction(async (tx) => {
    const party = await tx.party.findUnique({ where: { id: input.partyId } });
    if (!party) throw new Error("Party not found");
    assertPartyForTransaction(party as { partyType: "customer" | "supplier" }, "supplier");

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
      const unitPrice = line.unitPrice !== undefined ? line.unitPrice : item.price;
      const lineTotal = unitPrice * line.quantity;
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
    if (total <= 0) throw new Error("Purchase total must be positive");

    const paid = Math.min(input.paidAmount, total);
    const creditAmount = total - paid;

    if (input.paymentMode === "credit" && paid > 0) {
      throw new Error("Credit purchase cannot include paid amount");
    }

    for (const built of builtLines) {
      const item = await tx.item.findUnique({ where: { id: built.itemId } });
      if (!item) throw new Error("Item missing");
      await tx.item.update({
        where: { id: item.id },
        data: { quantity: item.quantity + built.quantity },
      });
    }

    const docPaymentMode = resolveDocPaymentMode(input.paymentMode, paid, creditAmount);

    let billNumber = input.billNumberOverride?.trim();
    if (billNumber) {
      const exists = await tx.bill.findUnique({ where: { billNumber } });
      if (exists) throw new Error(`Bill number already exists: ${billNumber}`);
    } else {
      billNumber = await getNextBillNumber("purchase");
    }
    const billDate = input.billDate;
    const hourOfDay = billDate.getHours();

    const bill = await tx.bill.create({
      data: {
        billKind: "purchase",
        billDate,
        billNumber,
        partyId: party.id,
        displayName: input.displayName ?? "",
        total,
        paidAmount: paid,
        creditAmount,
        paymentMode: docPaymentMode,
        bankAccountId: input.bankAccountId ?? null,
        hourOfDay,
        notes: input.notes ?? "",
        lines: { create: builtLines },
        sundryCharges: { create: sundryCharges },
      },
    });

    let balance = party.balance;
    balance += partyBalanceDelta("supplier", "credit", total);

    await tx.ledgerTransaction.create({
      data: {
        partyId: party.id,
        partyType: "supplier",
        entryType: "credit",
        amount: total,
        paymentMode: "credit",
        date: billDate,
        notes: `Purchase ${billNumber}`,
        refType: "purchase_invoice",
        billId: bill.id,
        balanceAfterParty: balance,
      },
    });

    if (paid > 0) {
      const payMode = paymentLedgerMode(input.paymentMode);
      balance += partyBalanceDelta("supplier", "debit", paid);
      await tx.ledgerTransaction.create({
        data: {
          partyId: party.id,
          partyType: "supplier",
          entryType: "debit",
          amount: paid,
          paymentMode: payMode,
          date: billDate,
          notes: `Payment for ${billNumber}`,
          refType: "purchase_payment",
          billId: bill.id,
          balanceAfterParty: balance,
        },
      });
      await tx.party.update({
        where: { id: party.id },
        data: { lastPaymentAt: billDate },
      });
    }

    await tx.party.update({ where: { id: party.id }, data: { balance } });

    return { billId: bill.id, billNumber, stockWarnings: [] };
  });
}
