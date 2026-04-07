import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { transactionCreateSchema } from "@/lib/validations";
import { createManualTransaction } from "@/lib/services/transaction-service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { LedgerTransaction } = await import("@/models/Transaction");
    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");
    const filter: Record<string, unknown> = {};
    if (partyId) {
      const { default: mongoose } = await import("mongoose");
      if (!mongoose.Types.ObjectId.isValid(partyId)) {
        return jsonError("Invalid party id", 400);
      }
      filter.partyId = partyId;
    }
    const rows = await LedgerTransaction.find(filter)
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
    const parsed = transactionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const { id } = await createManualTransaction(parsed.data);
    return jsonOk({ id: id.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 400);
  }
}
