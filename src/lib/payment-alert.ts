import { db } from "@/lib/db";

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
  const id = partyId.trim();
  if (!id) return { alert: false };

  const party = await db.party.findUnique({ where: { id } });
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

  const agg = await db.ledgerTransaction.aggregate({
    where: {
      partyId: id,
      partyType: "customer",
      entryType: "credit",
      date: { gte: since },
    },
    _sum: { amount: true },
  });

  const paidInWindow = agg._sum.amount ?? 0;
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
