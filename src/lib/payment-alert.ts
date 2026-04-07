import mongoose from "mongoose";
import { Party } from "@/models/Party";
import { LedgerTransaction } from "@/models/Transaction";

/**
 * Alert when a customer still owes money and has received no payment
 * in the last `maxDaysWithoutPayment` days (rolling window from now).
 */
export async function getCustomerPaymentStaleAlert(partyId: string): Promise<{
  alert: boolean;
  message?: string;
  days?: number;
  balance?: number;
}> {
  if (!mongoose.Types.ObjectId.isValid(partyId)) {
    return { alert: false };
  }
  const oid = new mongoose.Types.ObjectId(partyId);
  const party = await Party.findById(oid).lean();
  if (!party || party.partyType !== "customer") {
    return { alert: false };
  }
  const days = party.maxDaysWithoutPayment;
  if (days == null || days < 1) {
    return { alert: false };
  }
  if (party.balance <= 0) {
    return { alert: false };
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days);

  const agg = await LedgerTransaction.aggregate<{ total: number }>([
    {
      $match: {
        partyId: oid,
        partyType: "customer",
        entryType: "credit",
        date: { $gte: since },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  const paidInWindow = agg[0]?.total ?? 0;
  if (paidInWindow > 1e-9) {
    return { alert: false };
  }

  return {
    alert: true,
    days,
    balance: party.balance,
    message: `This customer owes ${party.balance.toFixed(2)} and has had no payment in the last ${days} days. At least a partial payment is expected.`,
  };
}
