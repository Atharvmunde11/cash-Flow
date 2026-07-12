import { db, getPrisma, resetPrismaClient } from "@/lib/db";
import { partyBalanceDelta } from "@/lib/ledger";
import { recordOpeningBalanceIfNeeded } from "@/lib/opening-ledger";
import { partyTypeFromAccountKind } from "@/lib/import/account-classify";
import type {
  ImportAccountLine,
  ImportBillRow,
  ImportLedgerRow,
  ImportPaymentRow,
  ImportResult,
  ParsedImportData,
} from "@/lib/import/parse-import-file";
import { createBillWithSideEffects } from "@/lib/services/bill-service";
import { ensureSqliteSchema } from "@/lib/ensure-sqlite-schema";

const MISC_ITEM_NAME = "Imported line item";

async function ensureCoaModelsReady() {
  ensureSqliteSchema();
  let client = getPrisma();
  const required = [
    "accountGroup",
    "ledgerAccount",
    "voucher",
    "voucherAccountLine",
    "bill",
    "party",
    "daybookExpense",
  ] as const;

  const missing = (c: typeof client) =>
    required.filter((name) => {
      const d = (c as unknown as Record<string, { count?: unknown }>)[name];
      return !d || typeof d.count !== "function";
    });

  let bad = missing(client);
  if (bad.length > 0) {
    await resetPrismaClient();
    client = getPrisma();
    bad = missing(client);
  }
  if (bad.length > 0) {
    throw new Error(
      `Database client is missing: ${bad.join(", ")}. Run \`npx prisma generate\` and fully restart the Next.js dev server, then retry.`,
    );
  }
}

async function clearAllBusinessData() {
  const client = getPrisma();
  // Sequential deletes — safer than $transaction([...]) when any delegate is stale.
  const steps: Array<() => Promise<unknown>> = [
    () => client.voucherAccountLine.deleteMany(),
    () => client.voucherItemLine.deleteMany(),
    () => client.voucher.deleteMany(),
    () => client.ledgerTransaction.deleteMany(),
    () => client.billPaymentSplit.deleteMany(),
    () => client.billStockWarning.deleteMany(),
    () => client.billSundryCharge.deleteMany(),
    () => client.billLine.deleteMany(),
    () => client.bill.deleteMany(),
    () => client.payment.deleteMany(),
    () => client.daybookExpense.deleteMany(),
    () => client.daybook.deleteMany(),
    () => client.item.deleteMany(),
    () => client.party.deleteMany(),
    () => client.bankAccount.deleteMany(),
    () => client.ledgerAccount.deleteMany(),
    () => client.accountGroup.deleteMany(),
    () => client.category.deleteMany({ where: { name: { not: "Imported" } } }),
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      console.warn(
        "[import replace] delete step failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
}

type ImportCaches = {
  categoryByName: Map<string, string>;
  partyByKey: Map<string, string>;
  itemByName: Map<string, string>;
  groupByKey: Map<string, string>;
  ledgerByKey: Map<string, string>;
  bankByLedgerName: Map<string, string>;
};

async function ensureCategory(name: string, cache: Map<string, string>) {
  const trimmed = name.trim() || "Imported";
  const cached = cache.get(trimmed.toLowerCase());
  if (cached) return cached;

  const existing = await db.category.findFirst({
    where: { name: trimmed },
  });
  if (existing) {
    cache.set(trimmed.toLowerCase(), existing.id);
    return existing.id;
  }

  const created = await db.category.create({
    data: {
      name: trimmed,
      ancestorIds: [],
    },
  });
  cache.set(trimmed.toLowerCase(), created.id);
  return created.id;
}

async function ensureAccountGroup(
  name: string,
  parentName: string | undefined,
  cache: Map<string, string>,
  externalCode?: string,
  isPrimary?: boolean,
): Promise<string> {
  const trimmed = name.trim();
  const key = `${parentName ?? ""}:${trimmed}`.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let parentId: string | undefined;
  if (parentName?.trim()) {
    parentId = await ensureAccountGroup(parentName.trim(), undefined, cache);
  }

  const existing = await db.accountGroup.findFirst({
    where: {
      name: trimmed,
      parentId: parentId ?? null,
    },
  });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const created = await db.accountGroup.create({
    data: {
      name: trimmed,
      parentId: parentId ?? null,
      externalCode: externalCode ?? null,
      isPrimary: Boolean(isPrimary || !parentName),
    },
  });
  cache.set(key, created.id);
  return created.id;
}

async function ensureLedger(
  row: ImportLedgerRow,
  caches: ImportCaches,
): Promise<string> {
  const key = `${row.accountKind}:${row.name}`.toLowerCase();
  const cached = caches.ledgerByKey.get(key);
  if (cached) return cached;

  const groupId = row.groupName
    ? await ensureAccountGroup(
        row.groupName,
        undefined,
        caches.groupByKey,
      )
    : undefined;

  const existing = await db.ledgerAccount.findFirst({
    where: { name: row.name, accountKind: row.accountKind },
  });
  if (existing) {
    caches.ledgerByKey.set(key, existing.id);
    return existing.id;
  }

  const created = await db.ledgerAccount.create({
    data: {
      name: row.name,
      printName: row.printName || row.name,
      groupId: groupId ?? null,
      accountKind: row.accountKind,
      openingBalance: row.openingBalance,
      balance: row.openingBalance,
      phone: row.phone ?? "",
      mobile: row.mobile ?? "",
      email: row.email ?? "",
      address1: row.address1 ?? "",
      address2: row.address2 ?? "",
      address3: row.address3 ?? "",
      gstin: row.gstin ?? "",
      pan: row.pan ?? "",
      state: row.state ?? "",
      city: row.city ?? "",
      creditDays: row.creditDays ?? null,
      externalCode: row.externalCode ?? null,
      sourceSystem: row.sourceSystem ?? "",
    },
  });
  caches.ledgerByKey.set(key, created.id);
  return created.id;
}

async function ensureBankFromLedger(
  ledgerId: string,
  ledgerName: string,
  caches: ImportCaches,
): Promise<string> {
  const cached = caches.bankByLedgerName.get(ledgerName.toLowerCase());
  if (cached) return cached;

  const existing = await db.bankAccount.findFirst({
    where: {
      OR: [{ ledgerAccountId: ledgerId }, { accountName: ledgerName }],
    },
  });
  if (existing) {
    if (!existing.ledgerAccountId) {
      await db.bankAccount.update({
        where: { id: existing.id },
        data: { ledgerAccountId: ledgerId },
      });
    }
    caches.bankByLedgerName.set(ledgerName.toLowerCase(), existing.id);
    return existing.id;
  }

  const created = await db.bankAccount.create({
    data: {
      accountName: ledgerName,
      bankName: ledgerName,
      accountNumber: "",
      ledgerAccountId: ledgerId,
      notes: "Imported from accounting ledger",
    },
  });
  caches.bankByLedgerName.set(ledgerName.toLowerCase(), created.id);
  return created.id;
}

async function ensureParty(
  name: string,
  partyType: "customer" | "supplier",
  cache: Map<string, string>,
  extras?: {
    phone?: string;
    address?: string;
    openingBalance?: number;
    ledgerAccountId?: string;
  },
): Promise<string> {
  const trimmed = name.trim();
  const key = `${partyType}:${trimmed.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const existingExact = await db.party.findFirst({
    where: { name: trimmed, partyType },
  });
  if (existingExact) {
    if (extras?.ledgerAccountId && !existingExact.ledgerAccountId) {
      await db.party.update({
        where: { id: existingExact.id },
        data: { ledgerAccountId: extras.ledgerAccountId },
      });
    }
    cache.set(key, existingExact.id);
    return existingExact.id;
  }

  const openingBalance = extras?.openingBalance ?? 0;
  const created = await db.party.create({
    data: {
      name: trimmed,
      phone: extras?.phone ?? "",
      address: extras?.address ?? "",
      openingBalance,
      balance: -openingBalance,
      partyType,
      ledgerAccountId: extras?.ledgerAccountId ?? null,
    },
  });
  cache.set(key, created.id);
  return created.id;
}

/** Prefer an existing party by name (either type) so Payment vouchers don't spawn supplier clones of customers. */
async function resolvePartyForPayment(
  name: string,
  preferredType: "customer" | "supplier",
  cache: Map<string, string>,
): Promise<{ id: string; partyType: "customer" | "supplier" }> {
  const trimmed = name.trim();
  const existing = await db.party.findFirst({
    where: { name: trimmed },
    orderBy: { partyType: "asc" },
  });
  if (existing) {
    const key = `${existing.partyType}:${trimmed.toLowerCase()}`;
    cache.set(key, existing.id);
    return {
      id: existing.id,
      partyType: existing.partyType as "customer" | "supplier",
    };
  }
  const id = await ensureParty(trimmed, preferredType, cache);
  return { id, partyType: preferredType };
}

async function ensureItem(
  name: string,
  caches: ImportCaches,
  unitPrice: number,
  unit = "pieces",
  extras?: { altUnit?: string; mrp?: number; hsnCode?: string; externalCode?: string },
): Promise<string> {
  const trimmed = name.trim() || MISC_ITEM_NAME;
  const cached = caches.itemByName.get(trimmed.toLowerCase());
  if (cached) return cached;

  const existing = await db.item.findFirst({ where: { name: trimmed } });
  if (existing) {
    if (unit && unit !== "pieces" && existing.unit === "pieces") {
      await db.item.update({
        where: { id: existing.id },
        data: { unit },
      });
    }
    caches.itemByName.set(trimmed.toLowerCase(), existing.id);
    return existing.id;
  }

  const categoryId = await ensureCategory("Imported", caches.categoryByName);
  const created = await db.item.create({
    data: {
      name: trimmed,
      categoryId,
      price: unitPrice > 0 ? unitPrice : 0,
      purchasePrice: unitPrice > 0 ? unitPrice : 0,
      quantity: 0,
      unit: unit || "pieces",
      altUnit: extras?.altUnit ?? "",
      mrp: extras?.mrp ?? 0,
      hsnCode: extras?.hsnCode ?? "",
      externalCode: extras?.externalCode ?? null,
      lowStockThreshold: 5,
    },
  });
  caches.itemByName.set(trimmed.toLowerCase(), created.id);
  return created.id;
}

function importBillNumber(row: ImportBillRow): string {
  const prefix = row.billKind === "purchase" ? "IMP-PUR" : "IMP-INV";
  const clean = row.externalNumber.replace(/[^a-zA-Z0-9/_-]+/g, "-");
  return `${prefix}-${clean}`.slice(0, 48);
}

async function createVoucherForBill(
  row: ImportBillRow,
  billId: string,
  partyLedgerId: string | undefined,
  accountLines: ImportAccountLine[],
  caches: ImportCaches,
): Promise<void> {
  const voucherType = row.billKind;
  const existing = await db.voucher.findFirst({
    where: { voucherNumber: row.externalNumber, voucherType },
  });
  if (existing) return;

  const resolvedLines = [];
  for (const line of accountLines) {
    let ledgerId: string | undefined;
    const found = await db.ledgerAccount.findFirst({
      where: { name: line.ledgerName },
    });
    if (found) {
      ledgerId = found.id;
      caches.ledgerByKey.set(
        `${found.accountKind}:${found.name}`.toLowerCase(),
        found.id,
      );
    }
    resolvedLines.push({
      ledgerId: ledgerId ?? null,
      ledgerName: line.ledgerName,
      entryType: line.entryType,
      amount: line.amount,
      groupNameSnapshot: line.groupName ?? "",
      srNo: line.srNo ?? 0,
    });
  }

  await db.voucher.create({
    data: {
      voucherType,
      voucherNumber: row.externalNumber,
      voucherDate: row.billDate,
      seriesName: row.seriesName ?? "",
      externalId: row.externalId ?? null,
      partyLedgerId: partyLedgerId ?? null,
      displayName: row.displayName,
      narration: row.notes,
      total: row.total,
      paidAmount: row.paidAmount,
      paymentMode: row.paymentMode,
      billId,
      accountLines: resolvedLines.length
        ? { create: resolvedLines }
        : undefined,
      itemLines: {
        create: row.lines.map((l) => ({
          name: l.itemName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.quantity * l.unitPrice,
          unit: l.unit ?? "",
        })),
      },
    },
  });
}

async function importBillRow(
  row: ImportBillRow,
  caches: ImportCaches,
): Promise<"created" | "skipped" | "failed"> {
  const billNumber = importBillNumber(row);
  const exists = await db.bill.findUnique({ where: { billNumber } });
  if (exists) return "skipped";

  const partyType = row.billKind === "sale" ? "customer" : "supplier";
  let partyId: string | undefined;
  let partyLedgerId: string | undefined;

  if (!row.isGuest) {
    partyId = await ensureParty(row.partyName, partyType, caches.partyByKey);
    const party = await db.party.findUnique({ where: { id: partyId } });
    partyLedgerId = party?.ledgerAccountId ?? undefined;
  } else {
    // Guest cash sale — optional shared Guest customer for history
    partyId = await ensureParty("Guest", "customer", caches.partyByKey);
  }

  let bankAccountId: string | undefined;
  if (row.bankLedgerName) {
    const bankLedger = await db.ledgerAccount.findFirst({
      where: { name: row.bankLedgerName, accountKind: "bank" },
    });
    if (bankLedger) {
      bankAccountId = await ensureBankFromLedger(
        bankLedger.id,
        bankLedger.name,
        caches,
      );
    } else {
      const ledgerId = await ensureLedger(
        {
          name: row.bankLedgerName,
          groupName: "Bank Accounts",
          accountKind: "bank",
          openingBalance: 0,
          sourceSystem: "import",
        },
        caches,
      );
      bankAccountId = await ensureBankFromLedger(
        ledgerId,
        row.bankLedgerName,
        caches,
      );
    }
  }

  const lines: Array<{ itemId: string; quantity: number; unitPrice: number }> =
    [];

  for (const line of row.lines) {
    const itemId = await ensureItem(
      line.itemName,
      caches,
      line.unitPrice,
      line.unit,
    );
    lines.push({
      itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    });
  }

  if (lines.length === 0 && row.total > 0) {
    const itemId = await ensureItem(MISC_ITEM_NAME, caches, row.total);
    lines.push({ itemId, quantity: 1, unitPrice: row.total });
  }

  if (lines.length === 0) return "failed";

  try {
    const bill = await createBillWithSideEffects({
      billKind: row.billKind,
      billDate: row.billDate,
      partyId,
      displayName: row.displayName || row.partyName,
      lines,
      paidAmount: row.paidAmount,
      paymentMode: row.paymentMode,
      bankAccountId,
      paymentSplits: [],
      notes: row.notes,
      allowNegativeStock: true,
      billNumberOverride: billNumber,
      sundryCharges: row.sundryCharges,
    });

    await createVoucherForBill(
      row,
      bill.billId,
      partyLedgerId,
      row.accountLines ?? [],
      caches,
    );
    return "created";
  } catch {
    return "failed";
  }
}

async function importPaymentRow(
  row: ImportPaymentRow,
  caches: ImportCaches,
): Promise<"created" | "skipped"> {
  const marker = `[import:${row.externalRef}]`;
  const existing = await db.payment.findFirst({
    where: { notes: { contains: marker } },
  });
  if (existing) return "skipped";

  // Expense-only / skip-party vouchers: store as daybook expense when paid
  if (row.skipParty) {
    if (row.direction === "paid") {
      const day = new Date(row.date);
      day.setHours(12, 0, 0, 0);
      await db.daybookExpense.create({
        data: {
          date: day,
          reason: row.notes || row.partyName || "Imported expense",
          amount: row.amount,
        },
      });
    }
    // Still create voucher trail without payment party
    const existingV = await db.voucher.findFirst({
      where: {
        voucherNumber: row.externalRef,
        voucherType: row.direction === "received" ? "receipt" : "payment",
      },
    });
    if (!existingV) {
      await db.voucher.create({
        data: {
          voucherType: row.direction === "received" ? "receipt" : "payment",
          voucherNumber: row.externalRef,
          voucherDate: row.date,
          displayName: row.partyName,
          narration: `${row.notes} ${marker}`.trim(),
          total: row.amount,
          paidAmount: row.amount,
          paymentMode: row.paymentMode,
          externalId: row.externalId ?? null,
          accountLines: row.accountLines?.length
            ? {
                create: row.accountLines.map((l) => ({
                  ledgerName: l.ledgerName,
                  entryType: l.entryType,
                  amount: l.amount,
                  groupNameSnapshot: l.groupName ?? "",
                  srNo: l.srNo ?? 0,
                })),
              }
            : undefined,
        },
      });
    }
    return "created";
  }

  const preferredType = row.direction === "received" ? "customer" : "supplier";
  const resolved = await resolvePartyForPayment(
    row.partyName,
    preferredType,
    caches.partyByKey,
  );
  const direction =
    resolved.partyType === "customer" && row.direction === "paid"
      ? "received"
      : resolved.partyType === "supplier" && row.direction === "received"
        ? "paid"
        : row.direction;

  const party = await db.party.findUnique({ where: { id: resolved.id } });
  if (!party) return "skipped";

  const entryType = direction === "received" ? "credit" : "debit";
  const payMode = row.paymentMode === "bank" ? "upi" : row.paymentMode;

  let bankAccountId: string | undefined;
  if (row.bankLedgerName) {
    const bankLedger = await db.ledgerAccount.findFirst({
      where: { name: row.bankLedgerName },
    });
    if (bankLedger) {
      bankAccountId = await ensureBankFromLedger(
        bankLedger.id,
        bankLedger.name,
        caches,
      );
    }
  }

  let balance = party.balance;
  balance += partyBalanceDelta(
    party.partyType as "customer" | "supplier",
    entryType,
    row.amount,
  );

  const payment = await db.payment.create({
    data: {
      partyId: party.id,
      amount: row.amount,
      paymentMode: row.paymentMode,
      bankAccountId: bankAccountId ?? null,
      date: row.date,
      notes: `${row.notes} ${marker}`.trim(),
      direction,
    },
  });

  await db.ledgerTransaction.create({
    data: {
      partyId: party.id,
      partyType: party.partyType,
      entryType,
      amount: row.amount,
      paymentMode: payMode,
      date: row.date,
      notes: row.notes || `Imported payment ${row.externalRef}`,
      refType: "manual",
      paymentId: payment.id,
      balanceAfterParty: balance,
    },
  });

  await db.party.update({
    where: { id: party.id },
    data: {
      balance,
      ...(party.partyType === "customer" && entryType === "credit"
        ? { lastPaymentAt: row.date }
        : {}),
    },
  });

  const voucherType = direction === "received" ? "receipt" : "payment";
  const existingV = await db.voucher.findFirst({
    where: { voucherNumber: row.externalRef, voucherType },
  });
  if (!existingV) {
    await db.voucher.create({
      data: {
        voucherType,
        voucherNumber: row.externalRef,
        voucherDate: row.date,
        partyLedgerId: party.ledgerAccountId ?? null,
        displayName: party.name,
        narration: `${row.notes} ${marker}`.trim(),
        total: row.amount,
        paidAmount: row.amount,
        paymentMode: row.paymentMode,
        paymentId: payment.id,
        externalId: row.externalId ?? null,
        accountLines: row.accountLines?.length
          ? {
              create: row.accountLines.map((l) => ({
                ledgerName: l.ledgerName,
                entryType: l.entryType,
                amount: l.amount,
                groupNameSnapshot: l.groupName ?? "",
                srNo: l.srNo ?? 0,
              })),
            }
          : undefined,
      },
    });
  }

  return "created";
}

export async function importParsedData(
  data: ParsedImportData,
  mode: "merge" | "replace",
  options?: { includeVouchers?: boolean },
): Promise<ImportResult> {
  await ensureCoaModelsReady();

  const includeVouchers = options?.includeVouchers ?? true;
  const warnings: string[] = [];
  const counts = {
    accountGroupsCreated: 0,
    ledgersCreated: 0,
    bankAccountsCreated: 0,
    partiesCreated: 0,
    partiesSkipped: 0,
    itemsCreated: 0,
    itemsSkipped: 0,
    categoriesCreated: 0,
    billsCreated: 0,
    billsSkipped: 0,
    paymentsCreated: 0,
    paymentsSkipped: 0,
    vouchersCreated: 0,
  };

  if (mode === "replace") {
    await clearAllBusinessData();
    warnings.push(
      "Replace mode cleared existing parties, items, bills, payments, and ledgers before import.",
    );
  }

  const caches: ImportCaches = {
    categoryByName: new Map(),
    partyByKey: new Map(),
    itemByName: new Map(),
    groupByKey: new Map(),
    ledgerByKey: new Map(),
    bankByLedgerName: new Map(),
  };

  const importedCategory = await db.category.findFirst({
    where: { name: "Imported" },
  });
  if (importedCategory) {
    caches.categoryByName.set("imported", importedCategory.id);
  }

  // 1. Account groups
  for (const group of data.accountGroups ?? []) {
    const before = caches.groupByKey.size;
    await ensureAccountGroup(
      group.name,
      group.parentName,
      caches.groupByKey,
      group.externalCode,
      group.isPrimary,
    );
    if (caches.groupByKey.size > before) counts.accountGroupsCreated++;
  }

  // 2. Ledgers (+ parties for AR/AP, banks for bank kind)
  for (const ledger of data.ledgers ?? []) {
    const beforeLedgers = caches.ledgerByKey.size;
    const ledgerId = await ensureLedger(ledger, caches);
    if (caches.ledgerByKey.size > beforeLedgers) counts.ledgersCreated++;

    const partyType = partyTypeFromAccountKind(ledger.accountKind);
    if (partyType) {
      const address = [ledger.address1, ledger.address2, ledger.address3]
        .filter(Boolean)
        .join(", ");
      const key = `${partyType}:${ledger.name.toLowerCase()}`;
      const dup = await db.party.findFirst({
        where: { name: ledger.name, partyType },
      });
      if (dup) {
        if (!dup.ledgerAccountId) {
          await db.party.update({
            where: { id: dup.id },
            data: { ledgerAccountId: ledgerId },
          });
        }
        caches.partyByKey.set(key, dup.id);
        counts.partiesSkipped++;
      } else {
        await ensureParty(ledger.name, partyType, caches.partyByKey, {
          phone: ledger.phone || ledger.mobile,
          address,
          openingBalance: ledger.openingBalance,
          ledgerAccountId: ledgerId,
        });
        const created = await db.party.findFirst({
          where: { name: ledger.name, partyType },
        });
        if (created) {
          await recordOpeningBalanceIfNeeded({
            id: created.id,
            openingBalance: created.openingBalance,
            partyType: created.partyType as "customer" | "supplier",
            balance: created.balance,
          });
        }
        counts.partiesCreated++;
      }
    }

    if (ledger.accountKind === "bank") {
      const beforeBanks = caches.bankByLedgerName.size;
      await ensureBankFromLedger(ledgerId, ledger.name, caches);
      if (caches.bankByLedgerName.size > beforeBanks) {
        counts.bankAccountsCreated++;
      }
    }
  }

  // 3. Parties from legacy party rows (if not already from ledgers)
  for (const party of data.parties) {
    const trimmedName = party.name.trim();
    if (!trimmedName) continue;

    const key = `${party.partyType}:${trimmedName.toLowerCase()}`;
    if (caches.partyByKey.has(key)) {
      counts.partiesSkipped++;
      continue;
    }

    const dup = await db.party.findFirst({
      where: { name: trimmedName, partyType: party.partyType },
    });
    if (dup) {
      caches.partyByKey.set(key, dup.id);
      counts.partiesSkipped++;
      continue;
    }

    const kind =
      party.partyType === "customer" ? "receivable" : "payable";
    const ledgerId = await ensureLedger(
      {
        name: trimmedName,
        groupName:
          party.partyType === "customer"
            ? "Sundry Debtors"
            : "Sundry Creditors",
        accountKind: kind,
        openingBalance: party.openingBalance,
        phone: party.phone,
        address1: party.address,
        gstin: party.gstin,
        pan: party.pan,
        state: party.state,
        city: party.city,
        email: party.email,
        mobile: party.mobile,
        externalCode: party.externalCode,
        sourceSystem: data.source,
      },
      caches,
    );

    const created = await db.party.create({
      data: {
        name: trimmedName,
        phone: party.phone ?? "",
        address: party.address ?? "",
        openingBalance: party.openingBalance,
        balance: -party.openingBalance,
        partyType: party.partyType,
        ledgerAccountId: ledgerId,
      },
    });

    await recordOpeningBalanceIfNeeded({
      id: created.id,
      openingBalance: created.openingBalance,
      partyType: created.partyType as "customer" | "supplier",
      balance: created.balance,
    });
    caches.partyByKey.set(key, created.id);
    counts.partiesCreated++;
  }

  for (const item of data.items) {
    const trimmedName = item.name.trim();
    if (!trimmedName) continue;

    const dup = await db.item.findFirst({ where: { name: trimmedName } });
    if (dup) {
      const patch: {
        unit?: string;
        quantity?: number;
        price?: number;
        purchasePrice?: number;
        altUnit?: string;
        mrp?: number;
        hsnCode?: string;
        externalCode?: string | null;
      } = {};
      if (item.unit && item.unit !== "pieces" && dup.unit === "pieces") {
        patch.unit = item.unit;
      }
      if (
        typeof item.quantity === "number" &&
        item.quantity > 0 &&
        (!dup.quantity || dup.quantity === 0)
      ) {
        patch.quantity = item.quantity;
      }
      if (item.price > 0 && (!dup.price || dup.price === 0)) {
        patch.price = item.price;
      }
      if (
        item.purchasePrice > 0 &&
        (!dup.purchasePrice || dup.purchasePrice === 0)
      ) {
        patch.purchasePrice = item.purchasePrice;
      }
      if (item.altUnit && !dup.altUnit) patch.altUnit = item.altUnit;
      if (item.mrp && !dup.mrp) patch.mrp = item.mrp;
      if (item.hsnCode && !dup.hsnCode) patch.hsnCode = item.hsnCode;
      if (item.externalCode && !dup.externalCode) {
        patch.externalCode = item.externalCode;
      }
      if (Object.keys(patch).length > 0) {
        await db.item.update({ where: { id: dup.id }, data: patch });
      }
      caches.itemByName.set(trimmedName.toLowerCase(), dup.id);
      counts.itemsSkipped++;
      continue;
    }

    const beforeSize = caches.categoryByName.size;
    const categoryId = await ensureCategory(
      item.categoryName,
      caches.categoryByName,
    );
    if (caches.categoryByName.size > beforeSize) counts.categoriesCreated++;

    const created = await db.item.create({
      data: {
        name: trimmedName,
        categoryId,
        price: item.price,
        purchasePrice: item.purchasePrice,
        quantity: item.quantity,
        unit: item.unit || "pieces",
        altUnit: item.altUnit ?? "",
        mrp: item.mrp ?? 0,
        hsnCode: item.hsnCode ?? "",
        externalCode: item.externalCode ?? null,
        lowStockThreshold: 5,
      },
    });
    caches.itemByName.set(trimmedName.toLowerCase(), created.id);
    counts.itemsCreated++;
  }

  if (includeVouchers) {
    const vouchersBefore = await getPrisma().voucher.count();
    const sortedBills = [...data.bills].sort(
      (a, b) => a.billDate.getTime() - b.billDate.getTime(),
    );
    const sortedPayments = [...data.payments].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    for (const bill of sortedBills) {
      const result = await importBillRow(bill, caches);
      if (result === "created") counts.billsCreated++;
      else if (result === "skipped") counts.billsSkipped++;
      else warnings.push(`Could not import bill ${bill.externalNumber}`);
    }

    for (const payment of sortedPayments) {
      const result = await importPaymentRow(payment, caches);
      if (result === "created") counts.paymentsCreated++;
      else counts.paymentsSkipped++;
    }

    counts.vouchersCreated = Math.max(
      0,
      (await getPrisma().voucher.count()) - vouchersBefore,
    );

    if (data.bills.length === 0 && data.payments.length === 0) {
      warnings.push(
        data.source === "busy"
          ? "No invoices found. In BUSY, export Transactions (Sale, Purchase, Receipt, Payment) via Administration → Data Export/Import (XML) — a Masters-only export does not include invoices. You can export transactions in the same file or as a separate .dat file."
          : "No invoices or payment vouchers found. Export vouchers/transactions from Tally, BUSY, or Zoho and upload that file.",
      );
    }
  }

  if (
    data.parties.length === 0 &&
    data.items.length === 0 &&
    (data.ledgers?.length ?? 0) === 0 &&
    !includeVouchers
  ) {
    warnings.push(
      "No customers, suppliers, ledgers, or items were found. Check that you exported masters.",
    );
  }

  if (includeVouchers && (data.bills.length > 0 || data.payments.length > 0)) {
    warnings.push(
      "Imported vouchers replay stock and balance changes. If you also imported opening balances, totals may be doubled — prefer importing either opening masters OR full vouchers.",
    );
  }

  return {
    source: data.source,
    filesProcessed: 1,
    fileNames: [],
    counts,
    warnings,
  };
}
