import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import { transactionCreateSchema } from "@/lib/validations";
import { createManualTransaction } from "@/lib/services/transaction-service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId")?.trim();

    const rows = await db.ledgerTransaction.findMany({
      where: partyId ? { partyId } : undefined,
      orderBy: { date: "desc" },
      take: 500,
    });

    return jsonOk(withMongoIds(rows));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = transactionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const { id } = await createManualTransaction(parsed.data);
    return jsonOk({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 400);
  }
}
