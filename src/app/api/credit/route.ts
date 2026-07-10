import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get("sort") ?? "due";
    const rows =
      sort === "overdue"
        ? await db.party.findMany({
            where: {
              partyType: "customer",
              balance: { gt: 0 },
              lastPaymentAt: { not: null },
            },
            orderBy: { lastPaymentAt: "asc" },
            take: 100,
          })
        : await db.party.findMany({
            where: { partyType: "customer", balance: { gt: 0 } },
            orderBy: { balance: "desc" },
            take: 100,
          });

    const withDays = withMongoIds(rows).map((p) => {
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
