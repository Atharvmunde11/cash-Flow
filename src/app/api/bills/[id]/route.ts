import { connectDb } from "@/lib/db";
import { partyBalanceDelta } from "@/lib/ledger";
import { jsonError, jsonOk } from "@/lib/http";
import { Bill } from "@/models/Bill";
import { Item } from "@/models/Item";
import { Party } from "@/models/Party";
import { LedgerTransaction } from "@/models/Transaction";
import mongoose from "mongoose";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return jsonError("Invalid id", 400);
    const bill = await Bill.findById(id)
      .populate("partyId", "name phone partyType balance")
      .populate("bankAccountId", "accountName bankName")
      .lean();
    if (!bill) return jsonError("Not found", 404);
    return jsonOk(bill);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

const patchLineSchema = z.object({
  itemId: z.string().regex(/^[a-f\d]{24}$/i),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

const patchSchema = z.object({
  billKind: z.enum(["sale", "purchase"]).optional(),
  partyId: z
    .union([z.string().regex(/^[a-f\d]{24}$/i), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null ? undefined : v)),
  displayName: z.string().min(1).max(200).optional(),
  lines: z.array(patchLineSchema).min(1).optional(),
  sundryCharges: z
    .array(z.object({ label: z.string(), amount: z.number() }))
    .optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
  paymentMode: z.enum(["cash", "upi", "credit", "mixed", "bank"]).optional(),
  bankAccountId: z
    .union([z.string().regex(/^[a-f\d]{24}$/i), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null ? undefined : v)),
  billDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  allowNegativeStock: z.boolean().optional(),
});

async function recomputePartyBalance(
  partyId: mongoose.Types.ObjectId | string,
) {
  const party = await Party.findById(partyId);
  if (!party) return;

  const rows = await LedgerTransaction.find({ partyId: party._id }).sort({
    date: 1,
    createdAt: 1,
  });

  let balance = 0;
  let lastPaymentAt: Date | null = null;

  for (const row of rows) {
    balance += partyBalanceDelta(
      row.partyType as "customer" | "supplier",
      row.entryType as "credit" | "debit",
      row.amount,
    );
    row.balanceAfterParty = balance;
    await row.save();

    if (
      party.partyType === "customer" &&
      row.entryType === "credit" &&
      row.paymentMode !== "credit"
    ) {
      lastPaymentAt = row.date;
    }
  }

  party.balance = balance;
  if (party.partyType === "customer") {
    party.lastPaymentAt = lastPaymentAt;
  }
  await party.save();
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return jsonError("Invalid id", 400);
    const body = await req.json();
    const { sundryCharges: rawSundry, ...rest } = body;
    const parsed = patchSchema.safeParse(rest);
    if (!parsed.success)
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    const bill = await Bill.findById(id);
    if (!bill) return jsonError("Not found", 404);

    const originalPartyId = bill.partyId;
    const originalKind = bill.billKind ?? "sale";

    for (const line of bill.lines) {
      const item = await Item.findById(line.itemId);
      if (!item) continue;
      if (originalKind === "sale") {
        item.quantity += line.quantity;
      } else {
        item.quantity -= line.quantity;
      }
      await item.save();
    }

    await LedgerTransaction.deleteMany({ billId: bill._id });
    if (originalPartyId) {
      await recomputePartyBalance(originalPartyId);
    }

    const nextKind = parsed.data.billKind ?? originalKind;
    const nextPartyId =
      parsed.data.partyId !== undefined
        ? parsed.data.partyId
        : bill.partyId?.toString();
    const nextDisplayName = parsed.data.displayName ?? bill.displayName;

    const nextParty =
      nextPartyId && mongoose.Types.ObjectId.isValid(nextPartyId)
        ? await Party.findById(nextPartyId)
        : null;

    if (nextPartyId && !nextParty) {
      return jsonError("Party not found", 404);
    }
    if (
      nextKind === "sale" &&
      nextParty &&
      nextParty.partyType !== "customer"
    ) {
      return jsonError("Sale bills require a customer", 400);
    }
    if (
      nextKind === "purchase" &&
      nextParty &&
      nextParty.partyType !== "supplier"
    ) {
      return jsonError("Purchase bills require a supplier", 400);
    }

    const nextLinesInput =
      parsed.data.lines ??
      bill.lines.map((line) => ({
        itemId: line.itemId.toString(),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      }));

    const newLines = [];
    for (const line of nextLinesInput) {
      const item = await Item.findById(line.itemId);
      if (!item) return jsonError(`Item not found: ${line.itemId}`, 400);

      const nextQty =
        nextKind === "sale"
          ? item.quantity - line.quantity
          : item.quantity + line.quantity;

      if (
        nextKind === "sale" &&
        nextQty < 0 &&
        !parsed.data.allowNegativeStock
      ) {
        return jsonError(
          `Insufficient stock for "${item.name}". Available ${item.quantity}, requested ${line.quantity}.`,
          400,
        );
      }

      newLines.push({
        item,
        line: {
          itemId: item._id,
          name: item.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          purchasePrice: item.purchasePrice ?? 0,
          lineTotal: line.quantity * line.unitPrice,
        },
      });
    }

    for (const entry of newLines) {
      if (nextKind === "sale") {
        entry.item.quantity -= entry.line.quantity;
      } else {
        entry.item.quantity += entry.line.quantity;
      }
      await entry.item.save();
    }

    const sundryTotal = (rawSundry ?? []).reduce(
      (s: number, c: { amount: number }) => s + (Number(c.amount) || 0),
      0,
    );
    const itemsTotal = newLines.reduce(
      (s, entry) => s + entry.line.lineTotal,
      0,
    );
    const nextTotal = itemsTotal + sundryTotal;
    const nextPaidAmount = Math.min(
      parsed.data.paidAmount ?? bill.paidAmount,
      nextTotal,
    );
    const nextPaymentMode = parsed.data.paymentMode ?? bill.paymentMode;
    const nextBillDate = parsed.data.billDate ?? bill.billDate;

    bill.billKind = nextKind;
    bill.partyId = nextParty?._id;
    bill.displayName = nextDisplayName;
    bill.lines = newLines.map((entry) => entry.line) as typeof bill.lines;
    bill.sundryCharges = (rawSundry ?? []).map(
      (charge: { label: string; amount: number }) => ({
        label: charge.label,
        amount: Number(charge.amount) || 0,
      }),
    );
    bill.total = nextTotal;
    bill.paidAmount = nextPaidAmount;
    bill.creditAmount = nextTotal - nextPaidAmount;
    bill.paymentMode = nextPaymentMode;
    bill.billDate = nextBillDate;
    bill.hourOfDay = nextBillDate.getHours();
    if (parsed.data.notes !== undefined) bill.notes = parsed.data.notes;
    if (parsed.data.bankAccountId !== undefined) {
      bill.bankAccountId = parsed.data.bankAccountId
        ? new mongoose.Types.ObjectId(parsed.data.bankAccountId)
        : null;
    }
    await bill.save();

    if (nextParty) {
      let balance = nextParty.balance;

      if (nextKind === "sale") {
        balance += partyBalanceDelta("customer", "debit", nextTotal);
        await LedgerTransaction.create({
          partyId: nextParty._id,
          partyType: "customer",
          entryType: "debit",
          amount: nextTotal,
          paymentMode: "credit",
          date: nextBillDate,
          notes: `Bill ${bill.billNumber}`,
          refType: "bill_invoice",
          billId: bill._id,
          balanceAfterParty: balance,
        });

        if (nextPaidAmount > 0) {
          balance += partyBalanceDelta("customer", "credit", nextPaidAmount);
          await LedgerTransaction.create({
            partyId: nextParty._id,
            partyType: "customer",
            entryType: "credit",
            amount: nextPaidAmount,
            paymentMode:
              nextPaymentMode === "upi" || nextPaymentMode === "bank"
                ? "upi"
                : "cash",
            date: nextBillDate,
            notes: `Payment for ${bill.billNumber}`,
            refType: "bill_payment",
            billId: bill._id,
            balanceAfterParty: balance,
          });
        }
      } else {
        balance += partyBalanceDelta("supplier", "credit", nextTotal);
        await LedgerTransaction.create({
          partyId: nextParty._id,
          partyType: "supplier",
          entryType: "credit",
          amount: nextTotal,
          paymentMode: "credit",
          date: nextBillDate,
          notes: `Purchase ${bill.billNumber}`,
          refType: "purchase_invoice",
          billId: bill._id,
          balanceAfterParty: balance,
        });

        if (nextPaidAmount > 0) {
          balance += partyBalanceDelta("supplier", "debit", nextPaidAmount);
          await LedgerTransaction.create({
            partyId: nextParty._id,
            partyType: "supplier",
            entryType: "debit",
            amount: nextPaidAmount,
            paymentMode:
              nextPaymentMode === "upi" || nextPaymentMode === "bank"
                ? "upi"
                : "cash",
            date: nextBillDate,
            notes: `Payment for ${bill.billNumber}`,
            refType: "purchase_payment",
            billId: bill._id,
            balanceAfterParty: balance,
          });
        }
      }

      await recomputePartyBalance(nextParty._id);
    }

    return jsonOk(bill.toObject());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return jsonError("Invalid id", 400);

    const bill = await Bill.findById(id);
    if (!bill) return jsonError("Not found", 404);

    // Reverse stock changes
    for (const line of bill.lines) {
      const item = await Item.findById(line.itemId);
      if (item) {
        if (bill.billKind === "sale") {
          item.quantity += line.quantity;
        } else {
          item.quantity -= line.quantity;
        }
        await item.save();
      }
    }

    // Reverse party balance
    if (bill.partyId) {
      await LedgerTransaction.deleteMany({ billId: bill._id });
      await recomputePartyBalance(bill.partyId);
    }

    await Bill.findByIdAndDelete(id);
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
