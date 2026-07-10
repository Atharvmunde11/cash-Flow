import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getCustomerPaymentStaleAlert } from "@/lib/payment-alert";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const result = await getCustomerPaymentStaleAlert(id);
    return jsonOk(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
