import type { PartyDocument } from "@/models/Party";
import { LedgerTransaction } from "@/models/Transaction";

export async function recordOpeningBalanceIfNeeded(
  party: PartyDocument,
  session?: import("mongoose").ClientSession,
) {
  const opening = party.openingBalance;
  if (opening === 0) return;

  const isCustomer = party.partyType === "customer";
  let entryType: "credit" | "debit";
  let amount: number;

  amount = Math.abs(opening);

  // Treat opening balance as advance deposit by default:
  // - positive opening value means party has paid in advance (we owe them)
  // - negative opening value means they owe us (existing debt)
  if (opening > 0) {
    entryType = isCustomer ? "credit" : "debit";
  } else {
    entryType = isCustomer ? "debit" : "credit";
  }

  await LedgerTransaction.create(
    [
      {
        partyId: party._id,
        partyType: party.partyType,
        entryType,
        amount,
        paymentMode: "credit",
        date: new Date(),
        notes: "Opening balance",
        refType: "adjustment",
        balanceAfterParty: party.balance,
      },
    ],
    session ? { session } : {},
  );
}
