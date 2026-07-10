import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId } from "@/lib/id-compat";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

function asInt(v: string | null, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
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

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!id.trim()) return jsonError("Invalid id", 400);

    const account = await db.bankAccount.findUnique({ where: { id } });
    if (!account) return jsonError("Not found", 404);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, asInt(searchParams.get("limit"), 15));
    const cursor = searchParams.get("cursor");

    let cursorFilter: Prisma.PaymentWhereInput | undefined;
    if (cursor) {
      const [dateMsRaw, idRaw] = cursor.split(":");
      const dateMs = Number(dateMsRaw);
      if (Number.isFinite(dateMs) && idRaw) {
        const cursorDate = new Date(dateMs);
        cursorFilter = {
          OR: [
            { date: { lt: cursorDate } },
            { date: cursorDate, id: { lt: idRaw } },
          ],
        };
      }
    }

    const rows = await db.payment.findMany({
      where: {
        bankAccountId: id,
        ...(cursorFilter ?? {}),
      },
      include: { party: true, bankAccount: true },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? `${new Date(last.date).getTime()}:${last.id}`
        : null;

    return jsonOk({ rows: pageRows.map(mapPaymentRow), nextCursor });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
