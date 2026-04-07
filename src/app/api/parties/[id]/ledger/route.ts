import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { Bill } from "@/models/Bill";
import { Payment } from "@/models/Payment";
import { LedgerTransaction } from "@/models/Transaction";
import { Party } from "@/models/Party";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return jsonError("Invalid id", 400);
    const party = await Party.findById(id).lean();
    if (!party) return jsonError("Not found", 404);

    const [transactions, bills, payments] = await Promise.all([
      LedgerTransaction.find({ partyId: id }).sort({ date: -1 }).lean(),
      Bill.find({ partyId: id })
        .sort({ billDate: -1 })
        .select(
          "billNumber billKind billDate total paidAmount creditAmount paymentMode createdAt lines",
        )
        .lean(),
      Payment.find({ partyId: id })
        .sort({ date: -1 })
        .select(
          "amount paymentMode bankAccountId date notes direction createdAt updatedAt",
        )
        .lean(),
    ]);

    // Compute profit per bill
    const billsWithProfit = bills.map((b) => {
      const profit = b.lines.reduce(
        (
          sum: number,
          line: {
            purchasePrice?: number;
            unitPrice: number;
            quantity: number;
          },
        ) => {
          const pp = line.purchasePrice ?? 0;
        if (b.billKind === "sale") {
            return sum + (line.unitPrice - pp) * line.quantity;
          }
          return sum;
        },
        0,
      );
      return { ...b, profit };
    });

    return jsonOk({
      party,
      transactions,
      bills: billsWithProfit,
      payments,
      activitySummary: {
        ledgerEntries: transactions.length,
        bills: bills.length,
        payments: payments.length,
        canDelete:
          transactions.length === 0 && bills.length === 0 && payments.length === 0,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
