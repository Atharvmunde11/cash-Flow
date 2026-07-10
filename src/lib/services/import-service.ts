import { db } from "@/lib/db";
import { partyBalanceDelta } from "@/lib/ledger";
import { recordOpeningBalanceIfNeeded } from "@/lib/opening-ledger";
import type {
  ImportBillRow,
  ImportPaymentRow,
  ImportResult,
  ParsedImportData,
} from "@/lib/import/parse-import-file";
import { createBillWithSideEffects } from "@/lib/services/bill-service";

const MISC_ITEM_NAME = "Imported line item";

type ImportCaches = {
  categoryByName: Map<string, string>;
  partyByKey: Map<string, string>;
  itemByName: Map<string, string>;
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

async function ensureParty(
  name: string,
  partyType: "customer" | "supplier",
  cache: Map<string, string>,
): Promise<string> {
  const key = `${partyType}:${name.trim().toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await db.party.findFirst({
    where: { name: name.trim(), partyType },
  });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const created = await db.party.create({
    data: {
      name: name.trim(),
      phone: "",
      address: "",
      openingBalance: 0,
      balance: 0,
      partyType,
    },
  });
  cache.set(key, created.id);
  return created.id;
}

async function ensureItem(
  name: string,
  caches: ImportCaches,
  unitPrice: number,
  unit = "pieces",
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
      lowStockThreshold: 5,
    },
  });
  caches.itemByName.set(trimmed.toLowerCase(), created.id);
  return created.id;
}

function importBillNumber(row: ImportBillRow): string {
  const prefix = row.billKind === "sale" ? "IMP-INV" : "IMP-PUR";
  const clean = row.externalNumber.replace(/[^a-zA-Z0-9/_-]+/g, "-");
  return `${prefix}-${clean}`.slice(0, 48);
}

async function importBillRow(
  row: ImportBillRow,
  caches: ImportCaches,
): Promise<"created" | "skipped" | "failed"> {
  const billNumber = importBillNumber(row);
  const exists = await db.bill.findUnique({ where: { billNumber } });
  if (exists) return "skipped";

  const partyType = row.billKind === "sale" ? "customer" : "supplier";
  const partyId = await ensureParty(row.partyName, partyType, caches.partyByKey);

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
    await createBillWithSideEffects({
      billKind: row.billKind,
      billDate: row.billDate,
      partyId,
      displayName: row.displayName || row.partyName,
      lines,
      paidAmount: row.paidAmount,
      paymentMode: row.paymentMode,
      bankAccountId: undefined,
      notes: row.notes,
      allowNegativeStock: true,
      billNumberOverride: billNumber,
      sundryCharges: row.sundryCharges,
    });
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

  const partyType = row.direction === "received" ? "customer" : "supplier";
  const partyId = await ensureParty(row.partyName, partyType, caches.partyByKey);
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party) return "skipped";

  const entryType = row.direction === "received" ? "credit" : "debit";
  const payMode = row.paymentMode === "bank" ? "upi" : row.paymentMode;

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
      date: row.date,
      notes: `${row.notes} ${marker}`.trim(),
      direction: row.direction,
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

  return "created";
}

export async function importParsedData(
  data: ParsedImportData,
  mode: "merge" | "replace",
  options?: { includeVouchers?: boolean },
): Promise<ImportResult> {
  const includeVouchers = options?.includeVouchers ?? true;
  const warnings: string[] = [];
  const counts = {
    partiesCreated: 0,
    partiesSkipped: 0,
    itemsCreated: 0,
    itemsSkipped: 0,
    categoriesCreated: 0,
    billsCreated: 0,
    billsSkipped: 0,
    paymentsCreated: 0,
    paymentsSkipped: 0,
  };

  if (mode === "replace") {
    await db.$transaction([
      db.ledgerTransaction.deleteMany(),
      db.payment.deleteMany(),
      db.billLine.deleteMany(),
      db.billSundryCharge.deleteMany(),
      db.billStockWarning.deleteMany(),
      db.bill.deleteMany(),
      db.item.deleteMany(),
      db.party.deleteMany(),
      db.category.deleteMany({ where: { name: { not: "Imported" } } }),
    ]);
    warnings.push(
      "Replace mode cleared existing parties, items, bills, and payments before import.",
    );
  }

  const caches: ImportCaches = {
    categoryByName: new Map(),
    partyByKey: new Map(),
    itemByName: new Map(),
  };

  const importedCategory = await db.category.findFirst({
    where: { name: "Imported" },
  });
  if (importedCategory) {
    caches.categoryByName.set("imported", importedCategory.id);
  }

  for (const party of data.parties) {
    const trimmedName = party.name.trim();
    if (!trimmedName) continue;

    const key = `${party.partyType}:${trimmedName.toLowerCase()}`;
    const dup = await db.party.findFirst({
      where: { name: trimmedName, partyType: party.partyType },
    });
    if (dup) {
      caches.partyByKey.set(key, dup.id);
      counts.partiesSkipped++;
      continue;
    }

    const created = await db.party.create({
      data: {
        name: trimmedName,
        phone: party.phone ?? "",
        address: party.address ?? "",
        openingBalance: party.openingBalance,
        balance: -party.openingBalance,
        partyType: party.partyType,
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
      if (item.unit && item.unit !== "pieces" && dup.unit === "pieces") {
        await db.item.update({
          where: { id: dup.id },
          data: { unit: item.unit },
        });
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
        lowStockThreshold: 5,
      },
    });
    caches.itemByName.set(trimmedName.toLowerCase(), created.id);
    counts.itemsCreated++;
  }

  if (includeVouchers) {
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

    if (data.bills.length === 0 && data.payments.length === 0) {
      warnings.push(
        data.source === "busy"
          ? "No invoices found. In BUSY, export Transactions (Sale, Purchase, Receipt, Payment) via Administration → Data Export/Import (XML) — a Masters-only export does not include invoices. You can export transactions in the same file or as a separate .dat file."
          : "No invoices or payment vouchers found. Export vouchers/transactions from Tally or BUSY and upload that file.",
      );
    }
  }

  if (
    data.parties.length === 0 &&
    data.items.length === 0 &&
    !includeVouchers
  ) {
    warnings.push(
      "No customers, suppliers, or items were found. Check that you exported masters.",
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
