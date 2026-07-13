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

/**
 * Running ledger balance as Debit/Credit (never a minus sign).
 * Customer: + = Dr (receivable), − = Cr (advance)
 * Supplier: + = Cr (payable), − = Dr (advance)
 */
export function formatPartyRunningBalance(
  partyType: "customer" | "supplier" | string,
  balance: number | null | undefined,
  formatMoneyFn: (n: number) => string,
): string {
  if (balance == null) return "-";
  const n = Number(balance) || 0;
  if (n === 0) return formatMoneyFn(0);

  const abs = Math.abs(n);
  const money = formatMoneyFn(abs);

  if (partyType === "supplier") {
    return n > 0 ? `${money} Cr` : `${money} Dr`;
  }
  return n > 0 ? `${money} Dr` : `${money} Cr`;
}

