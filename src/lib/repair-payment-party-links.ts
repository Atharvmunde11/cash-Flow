import { db } from "@/lib/db";
import { partyBalanceDelta } from "@/lib/ledger";

/**
 * BUSY Payment vouchers used to create duplicate supplier parties for people
 * who already exist as customers. Move those paid rows onto the customer and
 * treat them as receipts (money against customer dues).
 */
export async function repairBusyPaymentCustomerLinks(): Promise<void> {
  const paidOnSuppliers = await db.payment.findMany({
    where: {
      direction: "paid",
      party: { partyType: "supplier" },
    },
    include: { party: true },
  });
  if (paidOnSuppliers.length === 0) return;

  const customers = await db.party.findMany({
    where: { partyType: "customer" },
    select: { id: true, name: true },
  });
  const customerByName = new Map(
    customers.map((c) => [c.name.trim().toLowerCase(), c.id]),
  );

  const touchedPartyIds = new Set<string>();

  for (const payment of paidOnSuppliers) {
    const customerId = customerByName.get(payment.party.name.trim().toLowerCase());
    if (!customerId) continue;

    touchedPartyIds.add(payment.partyId);
    touchedPartyIds.add(customerId);

    await db.payment.update({
      where: { id: payment.id },
      data: {
        partyId: customerId,
        direction: "received",
      },
    });

    const ledger = await db.ledgerTransaction.findFirst({
      where: {
        OR: [
          { paymentId: payment.id },
          {
            partyId: payment.partyId,
            refType: "manual",
            amount: payment.amount,
            date: payment.date,
            entryType: "debit",
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (ledger) {
      await db.ledgerTransaction.update({
        where: { id: ledger.id },
        data: {
          partyId: customerId,
          partyType: "customer",
          entryType: "credit",
          paymentId: payment.id,
          notes: ledger.notes?.includes("Imported")
            ? ledger.notes.replace(/\bpaid\b/i, "received")
            : ledger.notes || `Receipt (${payment.party.name})`,
        },
      });
    }
  }

  for (const partyId of touchedPartyIds) {
    await recomputePartyBalance(partyId);
  }
}

async function recomputePartyBalance(partyId: string) {
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party) return;

  const rows = await db.ledgerTransaction.findMany({
    where: { partyId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  let balance = 0;
  let lastPaymentAt: Date | null = null;

  for (const row of rows) {
    balance += partyBalanceDelta(
      row.partyType as "customer" | "supplier",
      row.entryType as "credit" | "debit",
      row.amount,
    );
    await db.ledgerTransaction.update({
      where: { id: row.id },
      data: { balanceAfterParty: balance },
    });

    if (
      party.partyType === "customer" &&
      row.entryType === "credit" &&
      row.paymentMode !== "credit"
    ) {
      lastPaymentAt = row.date;
    }
  }

  await db.party.update({
    where: { id: partyId },
    data: {
      balance,
      lastPaymentAt: party.partyType === "customer" ? lastPaymentAt : null,
    },
  });
}
