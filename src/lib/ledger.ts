import type { PartyDocument } from "@/models/Party";

export type PartyType = "customer" | "supplier";
export type EntryType = "credit" | "debit";

/** Signed change to party.balance for one ledger row */
export function partyBalanceDelta(
  partyType: PartyType,
  entryType: EntryType,
  amount: number
): number {
  if (partyType === "customer") {
    if (entryType === "debit") return amount;
    return -amount;
  }
  if (partyType === "supplier") {
    if (entryType === "debit") return -amount;
    return amount;
  }
  return 0;
}

export function cashFlowFromTransaction(input: {
  partyType: PartyType;
  entryType: EntryType;
  amount: number;
  paymentMode: "cash" | "upi" | "credit";
}): number {
  if (input.paymentMode === "credit") return 0;
  if (input.partyType === "customer" && input.entryType === "credit") {
    return input.amount;
  }
  if (input.partyType === "supplier" && input.entryType === "debit") {
    return -input.amount;
  }
  if (input.partyType === "customer" && input.entryType === "debit") {
    return -input.amount;
  }
  if (input.partyType === "supplier" && input.entryType === "credit") {
    return input.amount;
  }
  return 0;
}

export function assertPartyForTransaction(
  party: PartyDocument,
  expected: PartyType
) {
  if (party.partyType !== expected) {
    throw new Error(`Party must be a ${expected} for this operation`);
  }
}
