import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { bankAccountCreateSchema } from "@/lib/validations";
import { BankAccount } from "@/models/BankAccount";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const row = await BankAccount.findById(id).lean();
    if (!row) return jsonError("Not found", 404);
    return jsonOk(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const body = await req.json();
    const parsed = bankAccountCreateSchema.partial().safeParse(body);
    if (!parsed.success) return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    const row = await BankAccount.findById(id);
    if (!row) return jsonError("Not found", 404);

    if (parsed.data.isPrimary) {
      await BankAccount.updateMany({ _id: { $ne: row._id } }, { $set: { isPrimary: false } });
    }

    Object.assign(row, parsed.data);
    await row.save();
    return jsonOk(row.toObject());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const res = await BankAccount.findByIdAndDelete(id);
    if (!res) return jsonError("Not found", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
