import mongoose from "mongoose";
import { Party } from "@/models/Party";
import { LedgerTransaction } from "@/models/Transaction";
import { partyBalanceDelta } from "@/lib/ledger";
import type { TransactionCreateInput } from "@/lib/validations";

/** Runs without multi-document transactions (standalone mongod has no replica set). */
export async function createManualTransaction(
  input: TransactionCreateInput
): Promise<{ id: mongoose.Types.ObjectId }> {
  const party = await Party.findById(input.partyId);
  if (!party) throw new Error("Party not found");

  let balance = party.balance;
  balance += partyBalanceDelta(
    party.partyType as "customer" | "supplier",
    input.entryType,
    input.amount
  );

  const [row] = await LedgerTransaction.create([
    {
      partyId: party._id,
      partyType: party.partyType,
      entryType: input.entryType,
      amount: input.amount,
      paymentMode: input.paymentMode,
      date: input.date,
      notes: input.notes ?? "",
      refType: "manual",
      balanceAfterParty: balance,
    },
  ]);

  party.balance = balance;
  if (
    party.partyType === "customer" &&
    input.entryType === "credit" &&
    input.amount > 0
  ) {
    party.lastPaymentAt = input.date;
  }
  await party.save();

  return { id: row._id as mongoose.Types.ObjectId };
}
