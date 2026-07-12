import { db } from "@/lib/db";
import type { AccountKind } from "@/lib/import/account-classify";

/** Ensure an AccountGroup exists by name (top-level). */
export async function ensureTopAccountGroup(name: string): Promise<string> {
  const existing = await db.accountGroup.findFirst({
    where: { name, parentId: null },
  });
  if (existing) return existing.id;
  const created = await db.accountGroup.create({
    data: { name, isPrimary: true },
  });
  return created.id;
}

/** Create or find a LedgerAccount and return its id. */
export async function ensureLedgerAccount(input: {
  name: string;
  accountKind: AccountKind;
  groupName: string;
  openingBalance?: number;
  phone?: string;
  address1?: string;
  sourceSystem?: string;
}): Promise<string> {
  const existing = await db.ledgerAccount.findFirst({
    where: { name: input.name, accountKind: input.accountKind },
  });
  if (existing) return existing.id;

  const groupId = await ensureTopAccountGroup(input.groupName);
  const created = await db.ledgerAccount.create({
    data: {
      name: input.name,
      printName: input.name,
      groupId,
      accountKind: input.accountKind,
      openingBalance: input.openingBalance ?? 0,
      balance: input.openingBalance ?? 0,
      phone: input.phone ?? "",
      address1: input.address1 ?? "",
      sourceSystem: input.sourceSystem ?? "app",
    },
  });
  return created.id;
}

export async function linkPartyToLedger(party: {
  id: string;
  name: string;
  partyType: string;
  openingBalance: number;
  phone: string;
  address: string;
  ledgerAccountId: string | null;
}): Promise<string | null> {
  if (party.ledgerAccountId) return party.ledgerAccountId;
  const kind: AccountKind =
    party.partyType === "supplier" ? "payable" : "receivable";
  const groupName =
    party.partyType === "supplier" ? "Sundry Creditors" : "Sundry Debtors";
  const ledgerId = await ensureLedgerAccount({
    name: party.name,
    accountKind: kind,
    groupName,
    openingBalance: party.openingBalance,
    phone: party.phone,
    address1: party.address,
    sourceSystem: "app",
  });
  await db.party.update({
    where: { id: party.id },
    data: { ledgerAccountId: ledgerId },
  });
  return ledgerId;
}

export async function linkBankToLedger(bank: {
  id: string;
  accountName: string;
  ledgerAccountId: string | null;
}): Promise<string | null> {
  if (bank.ledgerAccountId) return bank.ledgerAccountId;
  const ledgerId = await ensureLedgerAccount({
    name: bank.accountName,
    accountKind: "bank",
    groupName: "Bank Accounts",
    sourceSystem: "app",
  });
  await db.bankAccount.update({
    where: { id: bank.id },
    data: { ledgerAccountId: ledgerId },
  });
  return ledgerId;
}
