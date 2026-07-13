import { connectDb, db } from "@/lib/db";
import { withMongoId } from "@/lib/id-compat";
import { jsonError, jsonOk } from "@/lib/http";
import { partyBalanceDelta } from "@/lib/ledger";
import { paymentCreateSchema } from "@/lib/validations";
import type { Prisma } from "@prisma/client";
import { assertDateWritable } from "@/lib/financial-year";

export const runtime = "nodejs";

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

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId")?.trim();
    const today = searchParams.get("today");
    const direction = searchParams.get("direction")?.trim();

    const partyTypeParam = searchParams.get("partyType")?.trim();
    const where: Prisma.PaymentWhereInput = {};
    if (partyId) where.partyId = partyId;
    if (direction === "received" || direction === "paid") {
      where.direction = direction;
    }

    // Keep receipts/payments pages clean: customers only on received, suppliers only on paid.
    const partyType =
      partyTypeParam === "customer" || partyTypeParam === "supplier"
        ? partyTypeParam
        : direction === "received"
          ? "customer"
          : direction === "paid"
            ? "supplier"
            : undefined;
    if (partyType) {
      where.party = { partyType };
    }

    // Hide BUSY expense dumps that were imported as "paid" to fake suppliers
    // (Commission, Tea, etc.) — keep real supplier payments and manual ones.
    if (direction === "paid" || partyType === "supplier") {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { NOT: { notes: { contains: "Imported BUSY paid" } } },
            {
              party: {
                bills: {
                  some: {
                    billKind: { in: ["purchase", "purchase_return"] },
                  },
                },
              },
            },
          ],
        },
      ];
    }

    if (today === "1") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.date = { gte: start, lt: end };
    }

    const rows = await db.payment.findMany({
      where,
      include: { party: true, bankAccount: true },
      orderBy: { date: "desc" },
      take: 500,
    });

    return jsonOk(rows.map(mapPaymentRow));
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
    if (!parsed.success)
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    await assertDateWritable(parsed.data.date);

    const party = await db.party.findUnique({
      where: { id: parsed.data.partyId },
    });
    if (!party) return jsonError("Party not found", 404);

    if (
      parsed.data.direction === "received" &&
      party.partyType !== "customer"
    ) {
      return jsonError("Receipts can only be recorded for customers", 400);
    }
    if (parsed.data.direction === "paid" && party.partyType !== "supplier") {
      return jsonError("Payments can only be recorded for suppliers", 400);
    }

    const entryType =
      parsed.data.direction === "received" ? "credit" : "debit";
    const payMode =
      parsed.data.paymentMode === "bank" ? "upi" : parsed.data.paymentMode;

    let balance = party.balance;
    balance += partyBalanceDelta(
      party.partyType as "customer" | "supplier",
      entryType,
      parsed.data.amount,
    );

    const payment = await db.payment.create({
      data: {
        partyId: party.id,
        amount: parsed.data.amount,
        paymentMode: parsed.data.paymentMode,
        bankAccountId: parsed.data.bankAccountId ?? null,
        date: parsed.data.date,
        notes: parsed.data.notes ?? "",
        direction: parsed.data.direction,
      },
      include: { party: true, bankAccount: true },
    });

    await db.ledgerTransaction.create({
      data: {
        partyId: party.id,
        partyType: party.partyType,
        entryType,
        amount: parsed.data.amount,
        paymentMode: payMode,
        date: parsed.data.date,
        notes: parsed.data.notes || `Payment (${parsed.data.direction})`,
        refType: "manual",
        paymentId: payment.id,
        balanceAfterParty: balance,
      },
    });

    await db.party.update({
      where: { id: party.id },
      data: {
        balance,
        ...(party.partyType === "customer" && entryType === "credit"
          ? { lastPaymentAt: parsed.data.date }
          : {}),
      },
    });

    return jsonOk(mapPaymentRow(payment));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
