import { connectDb, db } from "@/lib/db";
import { withMongoId } from "@/lib/id-compat";
import { partyBalanceDelta } from "@/lib/ledger";
import { jsonError, jsonOk } from "@/lib/http";
import { paymentCreateSchema } from "@/lib/validations";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

function getEntryType(direction: "received" | "paid") {
  return direction === "received" ? "credit" : "debit";
}

function getLedgerPaymentMode(paymentMode: "cash" | "upi" | "bank") {
  return paymentMode === "bank" ? "upi" : paymentMode;
}

function mapPaymentRow(
  row: Prisma.PaymentGetPayload<{
    include: { party: true; bankAccount: true };
  }>,
) {
  return {
    ...withMongoId(row),
    partyId: row.party
      ? {
          _id: row.party.id,
          name: row.party.name,
          partyType: row.party.partyType,
        }
      : row.partyId,
    bankAccountId: row.bankAccount
      ? {
          _id: row.bankAccount.id,
          accountName: row.bankAccount.accountName,
          bankName: row.bankAccount.bankName,
        }
      : null,
  };
}

async function recomputePartyBalance(partyId: string) {
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party) return;

  const rows = await db.ledgerTransaction.findMany({
    where: { partyId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  let balance = 0;
  let lastPaymentAt: Date | null = null;

  for (const row of rows) {
    balance += partyBalanceDelta(
      row.partyType as "customer" | "supplier",
      row.entryType as "credit" | "debit",
      row.amount,
    );
    await db.ledgerTransaction.update({
      where: { id: row.id },
      data: { balanceAfterParty: balance },
    });

    if (
      party.partyType === "customer" &&
      row.entryType === "credit" &&
      row.paymentMode !== "credit"
    ) {
      lastPaymentAt = row.date;
    }
  }

  await db.party.update({
    where: { id: partyId },
    data: {
      balance,
      lastPaymentAt: party.partyType === "customer" ? lastPaymentAt : null,
    },
  });
}

async function findLedgerRowForPayment(payment: {
  id: string;
  partyId: string;
  amount: number;
  date: Date;
  direction: "received" | "paid";
}) {
  return db.ledgerTransaction.findFirst({
    where: {
      OR: [
        { paymentId: payment.id },
        {
          partyId: payment.partyId,
          refType: "manual",
          entryType: getEntryType(payment.direction),
          amount: payment.amount,
          date: payment.date,
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const row = await db.payment.findUnique({
      where: { id },
      include: { party: true, bankAccount: true },
    });
    if (!row) return jsonError("Not found", 404);
    return jsonOk(mapPaymentRow(row));
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

    const body = await req.json();
    const parsed = paymentCreateSchema.partial().safeParse(body);
    if (!parsed.success)
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    const row = await db.payment.findUnique({ where: { id } });
    if (!row) return jsonError("Not found", 404);

    const originalPartyId = row.partyId;
    const nextPartyId = parsed.data.partyId ?? row.partyId;
    const nextParty = await db.party.findUnique({ where: { id: nextPartyId } });
    if (!nextParty) return jsonError("Party not found", 404);

    const nextAmount = parsed.data.amount ?? row.amount;
    const nextDate = parsed.data.date ?? row.date;
    const nextDirection = (parsed.data.direction ?? row.direction) as
      | "received"
      | "paid";
    if (nextDirection === "received" && nextParty.partyType !== "customer") {
      return jsonError("Receipts can only be recorded for customers", 400);
    }
    if (nextDirection === "paid" && nextParty.partyType !== "supplier") {
      return jsonError("Payments can only be recorded for suppliers", 400);
    }
    const nextPaymentMode = parsed.data.paymentMode ?? row.paymentMode;
    const nextNotes = parsed.data.notes ?? row.notes ?? "";

    const ledgerRow = await findLedgerRowForPayment({
      id: row.id,
      partyId: row.partyId,
      amount: row.amount,
      date: row.date,
      direction: row.direction as "received" | "paid",
    });

    const updated = await db.payment.update({
      where: { id },
      data: {
        partyId: nextParty.id,
        amount: nextAmount,
        paymentMode: nextPaymentMode,
        date: nextDate,
        notes: nextNotes,
        direction: nextDirection,
        ...(Object.prototype.hasOwnProperty.call(body, "bankAccountId")
          ? { bankAccountId: parsed.data.bankAccountId ?? null }
          : {}),
      },
      include: { party: true, bankAccount: true },
    });

    if (ledgerRow) {
      await db.ledgerTransaction.update({
        where: { id: ledgerRow.id },
        data: {
          partyId: nextParty.id,
          partyType: nextParty.partyType,
          entryType: getEntryType(nextDirection),
          amount: nextAmount,
          paymentMode: getLedgerPaymentMode(
            nextPaymentMode as "cash" | "upi" | "bank",
          ),
          date: nextDate,
          notes: nextNotes || `Payment (${nextDirection})`,
          refType: "manual",
          paymentId: row.id,
        },
      });
    } else {
      await db.ledgerTransaction.create({
        data: {
          partyId: nextParty.id,
          partyType: nextParty.partyType,
          entryType: getEntryType(nextDirection),
          amount: nextAmount,
          paymentMode: getLedgerPaymentMode(
            nextPaymentMode as "cash" | "upi" | "bank",
          ),
          date: nextDate,
          notes: nextNotes || `Payment (${nextDirection})`,
          refType: "manual",
          paymentId: row.id,
        },
      });
    }

    await recomputePartyBalance(originalPartyId);
    if (originalPartyId !== nextParty.id) {
      await recomputePartyBalance(nextParty.id);
    }

    return jsonOk(mapPaymentRow(updated));
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

    const row = await db.payment.findUnique({ where: { id } });
    if (!row) return jsonError("Not found", 404);

    const ledgerRow = await findLedgerRowForPayment({
      id: row.id,
      partyId: row.partyId,
      amount: row.amount,
      date: row.date,
      direction: row.direction as "received" | "paid",
    });

    if (ledgerRow) {
      await db.ledgerTransaction.delete({ where: { id: ledgerRow.id } });
    }

    await db.payment.delete({ where: { id } });
    await recomputePartyBalance(row.partyId);

    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
