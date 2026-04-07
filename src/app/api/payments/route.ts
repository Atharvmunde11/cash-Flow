import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { paymentCreateSchema } from "@/lib/validations";
import { Payment } from "@/models/Payment";
import { Party } from "@/models/Party";
import { LedgerTransaction } from "@/models/Transaction";
import { partyBalanceDelta } from "@/lib/ledger";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");
    const today = searchParams.get("today");
    const filter: Record<string, unknown> = {};

    if (partyId && mongoose.Types.ObjectId.isValid(partyId)) {
      filter.partyId = partyId;
    }

    if (today === "1") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.date = { $gte: start, $lt: end };
    }

    const rows = await Payment.find(filter)
      .populate("partyId", "name partyType")
      .populate("bankAccountId", "accountName bankName")
      .sort({ date: -1 })
      .limit(500)
      .lean();

    return jsonOk(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = paymentCreateSchema.safeParse(body);
    if (!parsed.success) return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    const party = await Party.findById(parsed.data.partyId);
    if (!party) return jsonError("Party not found", 404);

    // direction: "received" = customer pays us (credit), "paid" = we pay supplier (debit)
    const entryType = parsed.data.direction === "received" ? "credit" : "debit";
    const payMode = parsed.data.paymentMode === "bank" ? "upi" : parsed.data.paymentMode as "cash" | "upi";

    let balance = party.balance;
    balance += partyBalanceDelta(
      party.partyType as "customer" | "supplier",
      entryType,
      parsed.data.amount,
    );

    const payment = await Payment.create({
      partyId: party._id,
      amount: parsed.data.amount,
      paymentMode: parsed.data.paymentMode,
      bankAccountId: parsed.data.bankAccountId ?? null,
      date: parsed.data.date,
      notes: parsed.data.notes ?? "",
      direction: parsed.data.direction,
    });

    await LedgerTransaction.create([{
      partyId: party._id,
      partyType: party.partyType,
      entryType,
      amount: parsed.data.amount,
      paymentMode: payMode,
      date: parsed.data.date,
      notes: parsed.data.notes || `Payment (${parsed.data.direction})`,
      refType: "manual",
      paymentId: payment._id,
      balanceAfterParty: balance,
    }]);

    party.balance = balance;
    if (party.partyType === "customer" && entryType === "credit") {
      party.lastPaymentAt = parsed.data.date;
    }
    await party.save();

    return jsonOk(payment.toObject());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
