import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { bankAccountCreateSchema } from "@/lib/validations";
import { BankAccount } from "@/models/BankAccount";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectDb();
    const rows = await BankAccount.find({}).sort({ isPrimary: -1, accountName: 1 }).lean();
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
    const parsed = bankAccountCreateSchema.safeParse(body);
    if (!parsed.success) return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    // If setting as primary, unset others
    if (parsed.data.isPrimary) {
      await BankAccount.updateMany({}, { $set: { isPrimary: false } });
    }

    const row = await BankAccount.create(parsed.data);
    return jsonOk(row.toObject());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
