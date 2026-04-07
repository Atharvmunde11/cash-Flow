import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getCustomerPaymentStaleAlert } from "@/lib/payment-alert";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const result = await getCustomerPaymentStaleAlert(id);
    return jsonOk(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
