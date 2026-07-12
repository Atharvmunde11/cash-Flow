import { db } from "@/lib/db";
import { partyBalanceDelta, type EntryType, type PartyType } from "@/lib/ledger";

/** Rebuild party.balance from ledger rows (chronological). */
export async function recomputePartyBalanceFromLedger(partyId: string) {
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party) return null;

  const txs = await db.ledgerTransaction.findMany({
    where: { partyId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  let balance = 0;
  for (const tx of txs) {
    balance += partyBalanceDelta(
      party.partyType as PartyType,
      tx.entryType as EntryType,
      tx.amount,
    );
    if (tx.balanceAfterParty !== balance) {
      await db.ledgerTransaction.update({
        where: { id: tx.id },
        data: { balanceAfterParty: balance },
      });
    }
  }

  await db.party.update({
    where: { id: partyId },
    data: { balance },
  });

  return balance;
}

/**
 * Sale/purchase returns were often auto-marked fully paid (cash),
 * which zeroed the party balance while the UI still showed a credit.
 * Convert those to open credit notes and rebuild balances.
 */
export async function repairAutoPaidReturnBills(partyId?: string) {
  const bills = await db.bill.findMany({
    where: {
      billKind: { in: ["sale_return", "purchase_return"] },
      ...(partyId ? { partyId } : {}),
      paidAmount: { gt: 0 },
    },
  });

  const touchedParties = new Set<string>();

  for (const bill of bills) {
    // Only rewrite fully-settled cash-like returns (the auto-sync case).
    if (bill.paidAmount < bill.total) continue;
    if (bill.paymentMode === "credit") continue;

    await db.ledgerTransaction.deleteMany({
      where: {
        billId: bill.id,
        refType: {
          in: ["sale_return_payment", "purchase_return_payment"],
        },
      },
    });

    await db.bill.update({
      where: { id: bill.id },
      data: {
        paidAmount: 0,
        creditAmount: bill.total,
        paymentMode: "credit",
      },
    });

    if (bill.partyId) touchedParties.add(bill.partyId);
  }

  for (const id of touchedParties) {
    await recomputePartyBalanceFromLedger(id);
  }

  return touchedParties.size;
}
