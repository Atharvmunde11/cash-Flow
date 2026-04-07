import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { Party } from "@/models/Party";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get("sort") ?? "due";
    const rows =
      sort === "overdue"
        ? await Party.find({
            partyType: "customer",
            balance: { $gt: 0 },
            lastPaymentAt: { $ne: null },
          })
            .sort({ lastPaymentAt: 1 })
            .limit(100)
            .lean()
        : await Party.find({ partyType: "customer", balance: { $gt: 0 } })
            .sort({ balance: -1 })
            .limit(100)
            .lean();

    const withDays = rows.map((p) => {
      const last = p.lastPaymentAt ? new Date(p.lastPaymentAt) : null;
      const daysSince = last
        ? Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return { ...p, daysSinceLastPayment: daysSince };
    });

    return jsonOk(withDays);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
