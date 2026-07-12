import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import { linkBankToLedger } from "@/lib/ledger-accounts";
import { bankAccountCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectDb();
    const rows = await db.bankAccount.findMany({
      orderBy: [{ isPrimary: "desc" }, { accountName: "asc" }],
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
    const parsed = bankAccountCreateSchema.safeParse(body);
    if (!parsed.success) return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    // If setting as primary, unset others
    if (parsed.data.isPrimary) {
      await db.bankAccount.updateMany({ data: { isPrimary: false } });
    }

    const row = await db.bankAccount.create({ data: parsed.data });
    await linkBankToLedger(row);
    const withLedger = await db.bankAccount.findUnique({ where: { id: row.id } });
    return jsonOk(withMongoId(withLedger ?? row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
