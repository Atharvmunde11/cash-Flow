/**
 * Universal account classification for Busy / Tally / Zoho Books (and CSV).
 * Maps group/parent names into a stable accountKind used by LedgerAccount.
 */

export type AccountKind =
  | "receivable"
  | "payable"
  | "bank"
  | "cash"
  | "income"
  | "expense"
  | "tax"
  | "equity"
  | "asset"
  | "liability"
  | "stock"
  | "other";

const GUEST_DISPLAY_NAME = "Guest";

export function guestDisplayName(): string {
  return GUEST_DISPLAY_NAME;
}

/** Normalize for comparisons (collapse spaces, lowercase). */
export function normalizeLedgerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * True when the party/master name is a cash tender alias (Cash, CASH PAYMENT),
 * not a named walk-in customer. These become displayName "Guest".
 */
export function isCashPartyAlias(name: string): boolean {
  const n = normalizeLedgerKey(name);
  if (!n) return false;
  if (n === "cash" || n === "cash payment" || n === "cash-payment") return true;
  if (n === "cash in hand" || n === "cash-in-hand") return true;
  // Busy often uses "CASH  PAYMENT" with extra spaces (already collapsed)
  if (/^cash\s*payment$/.test(n)) return true;
  return false;
}

/** Group name indicates bank accounts (Busy/Tally/Zoho). */
export function isBankGroup(name: string): boolean {
  const g = normalizeLedgerKey(name);
  return (
    g.includes("bank account") ||
    g === "bank" ||
    g.includes("bank od") ||
    g.includes("bank occ") ||
    g.includes("undeposited funds")
  );
}

/** Group name indicates cash-in-hand. */
export function isCashGroup(name: string): boolean {
  const g = normalizeLedgerKey(name);
  return (
    g.includes("cash-in-hand") ||
    g.includes("cash in hand") ||
    g === "cash" ||
    g.includes("petty cash")
  );
}

/**
 * Classify a Busy/Tally/Zoho account group (or parent) into accountKind.
 */
export function classifyAccountGroup(groupOrParent: string): AccountKind {
  const g = normalizeLedgerKey(groupOrParent);
  if (!g) return "other";

  if (
    g.includes("sundry debtor") ||
    g.includes("debtor") ||
    g.includes("accounts receivable") ||
    g.includes("account receivable") ||
    g === "customers" ||
    g === "customer" ||
    g.includes("receivable")
  ) {
    return "receivable";
  }

  if (
    g.includes("sundry creditor") ||
    g.includes("creditor") ||
    g.includes("accounts payable") ||
    g.includes("account payable") ||
    g === "vendors" ||
    g === "vendor" ||
    g === "suppliers" ||
    g.includes("payable")
  ) {
    return "payable";
  }

  if (isBankGroup(g)) return "bank";
  if (isCashGroup(g)) return "cash";

  if (
    g.includes("duties") ||
    g.includes("tax") ||
    g.includes("gst") ||
    g.includes("vat") ||
    g.includes("tds") ||
    g.includes("tcs")
  ) {
    return "tax";
  }

  if (
    g.includes("stock-in-hand") ||
    g.includes("stock in hand") ||
    g === "stock" ||
    g.includes("inventory")
  ) {
    return "stock";
  }

  if (
    g.includes("sales account") ||
    g === "sale" ||
    g === "sales" ||
    g.includes("direct income") ||
    g.includes("indirect income") ||
    g.includes("income (") ||
    g === "income"
  ) {
    return "income";
  }

  if (
    g.includes("purchase account") ||
    g === "purchase" ||
    g === "purchases" ||
    g.includes("direct expense") ||
    g.includes("indirect expense") ||
    g.includes("expense") ||
    g.includes("expenses")
  ) {
    return "expense";
  }

  if (
    g.includes("capital") ||
    g.includes("reserve") ||
    g.includes("profit & loss") ||
    g.includes("profit and loss") ||
    g.includes("equity")
  ) {
    return "equity";
  }

  if (
    g.includes("fixed asset") ||
    g.includes("current asset") ||
    g.includes("loan") ||
    g.includes("deposit") ||
    g.includes("investment")
  ) {
    if (g.includes("liabilit") || g.includes("loan (liability)") || g.includes("loan&")) {
      return "liability";
    }
    if (
      g.includes("fixed asset") ||
      g.includes("current asset") ||
      g.includes("deposit") ||
      g.includes("investment") ||
      g.includes("securities")
    ) {
      return "asset";
    }
  }

  if (
    g.includes("current liabilit") ||
    g.includes("liabilit") ||
    g.includes("provision") ||
    g.includes("suspense")
  ) {
    return "liability";
  }

  return "other";
}

/** Map accountKind → Party.partyType when applicable. */
export function partyTypeFromAccountKind(
  kind: AccountKind,
): "customer" | "supplier" | null {
  if (kind === "receivable") return "customer";
  if (kind === "payable") return "supplier";
  return null;
}

/**
 * Resolve display name for a voucher party.
 * Cash/CASH PAYMENT → "Guest"; otherwise keep the real name.
 */
export function resolveGuestDisplayName(partyName: string): {
  displayName: string;
  isGuest: boolean;
  createParty: boolean;
} {
  const trimmed = partyName.trim();
  if (!trimmed || isCashPartyAlias(trimmed)) {
    return {
      displayName: GUEST_DISPLAY_NAME,
      isGuest: true,
      createParty: false,
    };
  }
  return {
    displayName: trimmed,
    isGuest: false,
    createParty: true,
  };
}

/**
 * Ledger names that should never become Party rows (cash/bank/tender aliases).
 * Broader than isCashPartyAlias — used when filtering AccEntries for party inference.
 */
export function isTenderOrSystemLedgerName(name: string): boolean {
  const n = normalizeLedgerKey(name);
  if (!n) return true;
  if (isCashPartyAlias(n)) return true;
  if (
    n === "cash" ||
    n.includes("cash") ||
    n.includes("bank") ||
    n.includes("upi") ||
    n.includes("petty") ||
    n.includes("sales") ||
    n === "sale" ||
    n.includes("purchase") ||
    n.includes("gst") ||
    n.includes("cgst") ||
    n.includes("sgst") ||
    n.includes("igst") ||
    n.includes("round off")
  ) {
    return true;
  }
  return false;
}

/** Infer payment mode from account group on an AccEntry / ledger line. */
export function paymentModeFromAccountGroup(
  groupName: string,
): "cash" | "bank" | "upi" | null {
  if (isBankGroup(groupName)) return "bank";
  if (isCashGroup(groupName)) return "cash";
  const g = normalizeLedgerKey(groupName);
  if (g.includes("upi")) return "upi";
  return null;
}
