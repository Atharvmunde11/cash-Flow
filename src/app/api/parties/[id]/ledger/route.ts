import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import { repairAutoPaidReturnBills } from "@/lib/party-balance-repair";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;

    // Fix return bills that were auto-marked paid and zeroed the balance.
    await repairAutoPaidReturnBills(id);

    const party = await db.party.findUnique({ where: { id } });
    if (!party) return jsonError("Not found", 404);

    const [transactions, bills, payments] = await Promise.all([
      db.ledgerTransaction.findMany({
        where: { partyId: id },
        orderBy: { date: "desc" },
      }),
      db.bill.findMany({
        where: { partyId: id },
        orderBy: { billDate: "desc" },
        include: { lines: true },
      }),
      db.payment.findMany({
        where: { partyId: id },
        orderBy: { date: "desc" },
      }),
    ]);

    const billsWithProfit = bills.map((b) => {
      const profit = (b.lines ?? []).reduce((sum: number, line: any) => {
        const pp = line.purchasePrice ?? 0;
        if (b.billKind === "sale")
          return sum + (line.unitPrice - pp) * line.quantity;
        return sum;
      }, 0);
      return { ...b, profit } as any;
    });

    return jsonOk({
      party: withMongoId(party),
      transactions: withMongoIds(transactions),
      bills: withMongoIds(billsWithProfit as any),
      payments: withMongoIds(payments),
      activitySummary: {
        ledgerEntries: transactions.length,
        bills: bills.length,
        payments: payments.length,
        canDelete:
          transactions.length === 0 &&
          bills.length === 0 &&
          payments.length === 0,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
