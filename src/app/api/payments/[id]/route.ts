import { connectDb } from "@/lib/db";
import { partyBalanceDelta } from "@/lib/ledger";
import { jsonError, jsonOk } from "@/lib/http";
import { paymentCreateSchema } from "@/lib/validations";
import { Payment } from "@/models/Payment";
import { Party } from "@/models/Party";
import { LedgerTransaction } from "@/models/Transaction";
import mongoose from "mongoose";

export const runtime = "nodejs";

function getEntryType(direction: "received" | "paid") {
  return direction === "received" ? "credit" : "debit";
}

function getLedgerPaymentMode(paymentMode: "cash" | "upi" | "bank") {
  return paymentMode === "bank" ? "upi" : paymentMode;
}

async function findLedgerRowForPayment(payment: {
  _id: mongoose.Types.ObjectId;
  partyId: mongoose.Types.ObjectId;
  amount: number;
  date: Date;
  direction: "received" | "paid";
}) {
  return LedgerTransaction.findOne({
    $or: [
      { paymentId: payment._id },
      {
        partyId: payment.partyId,
        refType: "manual",
        entryType: getEntryType(payment.direction),
        amount: payment.amount,
        date: payment.date,
      },
    ],
  }).sort({ createdAt: -1 });
}

async function recomputePartyBalance(partyId: mongoose.Types.ObjectId | string) {
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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const row = await Payment.findById(id)
      .populate("partyId", "name partyType")
      .populate("bankAccountId", "accountName bankName")
      .lean();
    if (!row) return jsonError("Not found", 404);
    return jsonOk(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);

    const body = await req.json();
    const parsed = paymentCreateSchema.partial().safeParse(body);
    if (!parsed.success) return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    const row = await Payment.findById(id);
    if (!row) return jsonError("Not found", 404);

    const originalPartyId = row.partyId;
    const nextPartyId =
      parsed.data.partyId && mongoose.Types.ObjectId.isValid(parsed.data.partyId)
        ? new mongoose.Types.ObjectId(parsed.data.partyId)
        : row.partyId;
    const nextParty = await Party.findById(nextPartyId);
    if (!nextParty) return jsonError("Party not found", 404);

    const nextAmount = parsed.data.amount ?? row.amount;
    const nextDate = parsed.data.date ?? row.date;
    const nextDirection = parsed.data.direction ?? row.direction;
    const nextPaymentMode = parsed.data.paymentMode ?? row.paymentMode;
    const nextNotes = parsed.data.notes ?? row.notes ?? "";

    const ledgerRow = await findLedgerRowForPayment({
      _id: row._id,
      partyId: row.partyId as mongoose.Types.ObjectId,
      amount: row.amount,
      date: row.date,
      direction: row.direction,
    });

    row.partyId = nextParty._id;
    row.amount = nextAmount;
    row.paymentMode = nextPaymentMode;
    row.date = nextDate;
    row.notes = nextNotes;
    row.direction = nextDirection;

    if (Object.prototype.hasOwnProperty.call(body, "bankAccountId")) {
      row.bankAccountId =
        parsed.data.bankAccountId && mongoose.Types.ObjectId.isValid(parsed.data.bankAccountId)
          ? new mongoose.Types.ObjectId(parsed.data.bankAccountId)
          : null;
    }

    await row.save();

    if (ledgerRow) {
      ledgerRow.partyId = nextParty._id;
      ledgerRow.partyType = nextParty.partyType;
      ledgerRow.entryType = getEntryType(nextDirection);
      ledgerRow.amount = nextAmount;
      ledgerRow.paymentMode = getLedgerPaymentMode(nextPaymentMode);
      ledgerRow.date = nextDate;
      ledgerRow.notes = nextNotes || `Payment (${nextDirection})`;
      ledgerRow.refType = "manual";
      ledgerRow.paymentId = row._id;
      await ledgerRow.save();
    } else {
      await LedgerTransaction.create({
        partyId: nextParty._id,
        partyType: nextParty.partyType,
        entryType: getEntryType(nextDirection),
        amount: nextAmount,
        paymentMode: getLedgerPaymentMode(nextPaymentMode),
        date: nextDate,
        notes: nextNotes || `Payment (${nextDirection})`,
        refType: "manual",
        paymentId: row._id,
      });
    }

    await recomputePartyBalance(originalPartyId);
    if (!originalPartyId.equals(nextParty._id)) {
      await recomputePartyBalance(nextParty._id);
    }

    return jsonOk(row.toObject());
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
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);

    const row = await Payment.findById(id);
    if (!row) return jsonError("Not found", 404);

    const ledgerRow = await findLedgerRowForPayment({
      _id: row._id,
      partyId: row.partyId as mongoose.Types.ObjectId,
      amount: row.amount,
      date: row.date,
      direction: row.direction,
    });

    if (ledgerRow) {
      await LedgerTransaction.findByIdAndDelete(ledgerRow._id);
    }

    await Payment.findByIdAndDelete(id);
    await recomputePartyBalance(row.partyId as mongoose.Types.ObjectId);

    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
