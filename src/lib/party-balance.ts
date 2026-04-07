export type PartyBalanceMeta = {
  amount: number;
  label: string;
  tone: "positive" | "negative" | "neutral";
};

export function getPartyBalanceMeta(
  partyType: "customer" | "supplier" | string,
  balance: number,
): PartyBalanceMeta {
  if (!balance) {
    return { amount: 0, label: "Settled", tone: "neutral" };
  }

  if (partyType === "supplier") {
    return balance > 0
      ? { amount: balance, label: "Payable", tone: "negative" }
      : { amount: Math.abs(balance), label: "Advance", tone: "positive" };
  }

  return balance > 0
    ? { amount: balance, label: "Receivable", tone: "positive" }
    : { amount: Math.abs(balance), label: "Advance", tone: "negative" };
}
