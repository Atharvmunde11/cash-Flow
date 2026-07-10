import { db } from "@/lib/db";
import { partyBalanceDelta } from "@/lib/ledger";
import type { TransactionCreateInput } from "@/lib/validations";

export async function createManualTransaction(
  input: TransactionCreateInput,
): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const party = await tx.party.findUnique({ where: { id: input.partyId } });
    if (!party) throw new Error("Party not found");

    const balance =
      party.balance +
      partyBalanceDelta(
        party.partyType as "customer" | "supplier",
        input.entryType,
        input.amount,
      );

    const row = await tx.ledgerTransaction.create({
      data: {
        partyId: party.id,
        partyType: party.partyType,
        entryType: input.entryType,
        amount: input.amount,
        paymentMode: input.paymentMode,
        date: input.date,
        notes: input.notes ?? "",
        refType: "manual",
        balanceAfterParty: balance,
      },
    });

    await tx.party.update({
      where: { id: party.id },
      data: {
        balance,
        ...(party.partyType === "customer" &&
        input.entryType === "credit" &&
        input.amount > 0
          ? { lastPaymentAt: input.date }
          : {}),
      },
    });

    return { id: row.id };
  });
}
