import { XMLParser } from "fast-xml-parser";
import {
  asArray,
  busyItemUnit,
  busyPartyType,
  looksLikeXml,
  normalizeImportText,
  numOf,
  parseTallyQuantity,
  tallyPartyType,
  textOf,
  walkNodes,
} from "@/lib/import/parse-utils";
import {
  parseBusyVouchers,
  parseCsvVouchers,
  parseTallyVouchers,
} from "@/lib/import/parse-vouchers";

export type ImportPartyRow = {
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
  partyType: "customer" | "supplier";
};

export type ImportItemRow = {
  name: string;
  categoryName: string;
  price: number;
  purchasePrice: number;
  quantity: number;
  unit: string;
};

export type ImportBillLine = {
  itemName: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
};

export type ImportSundryCharge = {
  label: string;
  amount: number;
};

export type ImportBillRow = {
  externalNumber: string;
  billKind: "sale" | "purchase";
  billDate: Date;
  partyName: string;
  displayName: string;
  lines: ImportBillLine[];
  sundryCharges?: ImportSundryCharge[];
  total: number;
  paidAmount: number;
  paymentMode: "cash" | "upi" | "credit" | "mixed" | "bank";
  notes: string;
};

export type ImportPaymentRow = {
  partyName: string;
  direction: "received" | "paid";
  amount: number;
  date: Date;
  paymentMode: "cash" | "upi" | "bank";
  notes: string;
  externalRef: string;
};

const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  processEntities: false,
  ignoreDeclaration: true,
} as const;

export type ParsedImportData = {
  source: "tally" | "busy" | "csv";
  parties: ImportPartyRow[];
  items: ImportItemRow[];
  bills: ImportBillRow[];
  payments: ImportPaymentRow[];
};

export type ImportResult = {
  source: ParsedImportData["source"];
  filesProcessed: number;
  fileNames: string[];
  counts: {
    partiesCreated: number;
    partiesSkipped: number;
    itemsCreated: number;
    itemsSkipped: number;
    categoriesCreated: number;
    billsCreated: number;
    billsSkipped: number;
    paymentsCreated: number;
    paymentsSkipped: number;
  };
  warnings: string[];
};

export function mergeParsedImportData(
  chunks: ParsedImportData[],
): ParsedImportData {
  const parties: ImportPartyRow[] = [];
  const items: ImportItemRow[] = [];
  const bills: ImportBillRow[] = [];
  const payments: ImportPaymentRow[] = [];
  const seenParty = new Set<string>();
  const seenItem = new Set<string>();

  let source: ParsedImportData["source"] = "csv";
  for (const chunk of chunks) {
    if (chunk.source === "tally" || chunk.source === "busy") {
      source = chunk.source;
    }
    for (const party of chunk.parties) {
      const key = `${party.partyType}:${party.name.toLowerCase()}`;
      if (seenParty.has(key)) continue;
      seenParty.add(key);
      parties.push(party);
    }
    for (const item of chunk.items) {
      const key = item.name.toLowerCase();
      if (seenItem.has(key)) continue;
      seenItem.add(key);
      items.push(item);
    }
    bills.push(...chunk.bills);
    payments.push(...chunk.payments);
  }

  return { source, parties, items, bills, payments };
}

export function busyFileLooksMastersOnly(content: string): boolean {
  const text = normalizeImportText(content);
  if (!looksLikeXml(text) || !/busydata/i.test(text)) return false;
  const hasTranVouchers = /<Tran1[\s>/]/i.test(text);
  const hasDocVouchers =
    /<(?:Sale|Purchase|Receipt|Payment)[\s>/]/i.test(text);
  return !hasTranVouchers && !hasDocVouchers;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    const idx = normalized.indexOf(key);
    if (idx >= 0) return idx;
  }
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    const idx = normalized.findIndex((h) => h.includes(key));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCsvMasters(csv: string): Pick<
  ParsedImportData,
  "parties" | "items"
> {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { parties: [], items: [] };
  }

  const headers = splitCsvLine(lines[0]);
  const parties: ImportPartyRow[] = [];
  const items: ImportItemRow[] = [];

  const nameIdx = headerIndex(headers, ["name", "party", "account", "ledger"]);
  const groupIdx = headerIndex(headers, [
    "group",
    "type",
    "parent",
    "partygrouptype",
  ]);
  const phoneIdx = headerIndex(headers, ["phone", "mobile", "contact"]);
  const addressIdx = headerIndex(headers, ["address"]);
  const openingIdx = headerIndex(headers, [
    "openingbalance",
    "opening",
    "opbal",
    "balance",
  ]);
  const priceIdx = headerIndex(headers, ["price", "rate", "mrp", "saleprice"]);
  const purchaseIdx = headerIndex(headers, [
    "purchaseprice",
    "cost",
    "costprice",
    "purprice",
  ]);
  const qtyIdx = headerIndex(headers, ["quantity", "qty", "stock", "openingqty"]);
  const unitIdx = headerIndex(headers, ["unit", "uom"]);
  const categoryIdx = headerIndex(headers, ["category", "groupname"]);
  const typeIdx = headerIndex(headers, [
    "vouchertype",
    "vchtype",
    "transactiontype",
  ]);

  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const name = nameIdx >= 0 ? cols[nameIdx] ?? "" : "";
    if (!name) continue;

    const rowType = typeIdx >= 0 ? cols[typeIdx] ?? "" : "";
    if (rowType && /sale|purchase|receipt|payment/i.test(rowType)) {
      continue;
    }

    const group = groupIdx >= 0 ? cols[groupIdx] ?? "" : "";
    const partyType = busyPartyType(group);
    const opening = openingIdx >= 0 ? numOf(cols[openingIdx]) : 0;
    const price = priceIdx >= 0 ? numOf(cols[priceIdx]) : 0;
    const purchase = purchaseIdx >= 0 ? numOf(cols[purchaseIdx]) : 0;
    const qty = qtyIdx >= 0 ? numOf(cols[qtyIdx]) : 0;

    if (partyType) {
      parties.push({
        name,
        phone: phoneIdx >= 0 ? cols[phoneIdx] ?? "" : "",
        address: addressIdx >= 0 ? cols[addressIdx] ?? "" : "",
        openingBalance: -opening,
        partyType,
      });
      continue;
    }

    if (price > 0 || purchase > 0 || qty > 0) {
      items.push({
        name,
        categoryName:
          (categoryIdx >= 0 ? cols[categoryIdx] : "") || group || "Imported",
        price: price || purchase,
        purchasePrice: purchase || price,
        quantity: qty,
        unit: (unitIdx >= 0 ? cols[unitIdx] : "") || "pieces",
      });
    }
  }

  return { parties, items };
}

export function parseTallyXml(xml: string): ParsedImportData {
  const parser = new XMLParser(XML_PARSER_OPTIONS);

  const root = parser.parse(xml);
  const ledgers: Record<string, unknown>[] = [];
  const stockItems: Record<string, unknown>[] = [];
  walkNodes(root, "LEDGER", ledgers);
  walkNodes(root, "STOCKITEM", stockItems);

  const parties: ImportPartyRow[] = [];
  for (const ledger of ledgers) {
    const name = textOf(ledger.NAME ?? ledger["@_NAME"]);
    if (!name) continue;

    const parent = textOf(ledger.PARENT);
    const partyType = tallyPartyType(parent);
    if (!partyType) continue;

    const closing = numOf(ledger.CLOSINGBALANCE ?? ledger.OPENINGBALANCE);
    parties.push({
      name,
      phone: textOf(ledger.LEDGERPHONE ?? ledger.PHONE),
      address: textOf(ledger.ADDRESS ?? ledger.ADDRESS1),
      openingBalance: -closing,
      partyType,
    });
  }

  const items: ImportItemRow[] = [];
  for (const stock of stockItems) {
    const name = textOf(stock.NAME ?? stock["@_NAME"]);
    if (!name) continue;

    const openingQty = parseTallyQuantity(
      stock.OPENINGBALANCE ?? stock.CLOSINGBALANCE,
    );
    const rate = numOf(stock.OPENINGRATE ?? stock.STANDARDCOST ?? stock.RATE);

    items.push({
      name,
      categoryName: textOf(stock.PARENT) || "Imported",
      price: rate,
      purchasePrice: numOf(stock.STANDARDCOST) || rate,
      quantity: openingQty,
      unit: textOf(stock.BASEUNITS) || "pieces",
    });
  }

  const { bills, payments } = parseTallyVouchers(root);

  return { source: "tally", parties, items, bills, payments };
}

function hasImportData(data: ParsedImportData): boolean {
  return (
    data.parties.length > 0 ||
    data.items.length > 0 ||
    data.bills.length > 0 ||
    data.payments.length > 0
  );
}

function mergeParties(
  a: ImportPartyRow[],
  b: ImportPartyRow[],
): ImportPartyRow[] {
  const seen = new Set(a.map((p) => p.name.toLowerCase()));
  const merged = [...a];
  for (const party of b) {
    const key = party.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(party);
  }
  return merged;
}

function mergeItems(a: ImportItemRow[], b: ImportItemRow[]): ImportItemRow[] {
  const seen = new Set(a.map((i) => i.name.toLowerCase()));
  const merged = [...a];
  for (const item of b) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function busyRecordName(row: Record<string, unknown>): string {
  return textOf(
    row.Name ??
      row.NAME ??
      row.AccountName ??
      row.ACCOUNTNAME ??
      row.ItemName ??
      row.ITEMNAME ??
      row.LedgerName ??
      row["@_Name"] ??
      row["@_NAME"],
  );
}

function busyRecordGroup(row: Record<string, unknown>): string {
  return textOf(
    row.Group ??
      row.GROUP ??
      row.ParentGroup ??
      row.PARENTGROUP ??
      row.AccountGroup ??
      row.ItemGroup ??
      row.Category,
  );
}

function extractBusyMastersFromTree(root: unknown): {
  parties: ImportPartyRow[];
  items: ImportItemRow[];
} {
  const parties: ImportPartyRow[] = [];
  const items: ImportItemRow[] = [];
  const seenParty = new Set<string>();
  const seenItem = new Set<string>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }

    const row = node as Record<string, unknown>;
    const name = busyRecordName(row);
    const group = busyRecordGroup(row);

    if (name) {
      const partyType = busyPartyType(group);
      const opening = numOf(
        row.OpeningBalance ??
          row.OPENINGBALANCE ??
          row.OpBal ??
          row.OPBAL ??
          row.ClosingBalance,
      );
      const salePrice = numOf(
        row.SalePrice ?? row.SALEPRICE ?? row.MRP ?? row.Rate ?? row.RATE,
      );
      const purchasePrice = numOf(
        row.PurchasePrice ?? row.PURCHASEPRICE ?? row.CostPrice ?? row.COSTPRICE,
      );
      const qty = numOf(
        row.OpeningQty ?? row.OPENINGQTY ?? row.Stock ?? row.STOCK ?? row.Qty,
      );
      const unit = busyItemUnit(row);
      const isItemLike =
        salePrice > 0 ||
        purchasePrice > 0 ||
        qty !== 0 ||
        Boolean(unit) ||
        /item|stock|product|inventory|goods/i.test(group);

      if (partyType) {
        const key = name.toLowerCase();
        if (!seenParty.has(key)) {
          seenParty.add(key);
          parties.push({
            name,
            phone: textOf(row.Phone ?? row.MOBILE ?? row.Telephone),
            address: textOf(row.Address ?? row.ADDRESS),
            openingBalance: -opening,
            partyType,
          });
        }
      } else if (isItemLike) {
        const key = name.toLowerCase();
        if (!seenItem.has(key)) {
          seenItem.add(key);
          items.push({
            name,
            categoryName: group || "Imported",
            price: salePrice || purchasePrice,
            purchasePrice: purchasePrice || salePrice,
            quantity: qty,
            unit,
          });
        }
      }
    }

    for (const value of Object.values(row)) {
      if (value && typeof value === "object") visit(value);
    }
  };

  visit(root);
  return { parties, items };
}

export function parseBusyXml(xml: string): ParsedImportData {
  const parser = new XMLParser(XML_PARSER_OPTIONS);

  const root = parser.parse(xml);
  const accounts: Record<string, unknown>[] = [];
  const products: Record<string, unknown>[] = [];
  const accountTags = [
    "Account",
    "ACCOUNT",
    "AccountMaster",
    "ACCOUNTMASTER",
    "AccMaster",
    "Ledger",
    "LEDGER",
    "Party",
    "PARTY",
  ];
  const productTags = [
    "Item",
    "ITEM",
    "ItemMaster",
    "ITEMMASTER",
    "Product",
    "PRODUCT",
    "StockItem",
    "STOCKITEM",
    "InvItem",
    "INVENTORYITEM",
  ];

  for (const tag of accountTags) walkNodes(root, tag, accounts);
  for (const tag of productTags) walkNodes(root, tag, products);

  const parties: ImportPartyRow[] = [];
  for (const row of accounts) {
    const name = busyRecordName(row);
    if (!name) continue;

    const group = busyRecordGroup(row);
    const partyType = busyPartyType(group);
    if (!partyType) continue;

    const opening = numOf(
      row.OpeningBalance ?? row.OPENINGBALANCE ?? row.OpBal ?? row.OPBAL,
    );
    parties.push({
      name,
      phone: textOf(row.Phone ?? row.MOBILE ?? row.Telephone),
      address: textOf(row.Address ?? row.ADDRESS),
      openingBalance: -opening,
      partyType,
    });
  }

  const items: ImportItemRow[] = [];
  for (const row of products) {
    const name = busyRecordName(row);
    if (!name) continue;

    items.push({
      name,
      categoryName: busyRecordGroup(row) || "Imported",
      price: numOf(row.SalePrice ?? row.MRP ?? row.Rate ?? row.PRICE),
      purchasePrice: numOf(row.PurchasePrice ?? row.CostPrice ?? row.PURPRICE),
      quantity: numOf(row.OpeningQty ?? row.OPENINGQTY ?? row.Stock),
      unit: busyItemUnit(row),
    });
  }

  const generic = extractBusyMastersFromTree(root);
  const mergedParties = mergeParties(parties, generic.parties);
  const mergedItems = mergeItems(items, generic.items);
  const { bills, payments } = parseBusyVouchers(root);

  return {
    source: "busy",
    parties: mergedParties,
    items: mergedItems,
    bills,
    payments,
  };
}

export function parseCsvFile(csv: string): ParsedImportData {
  const masters = parseCsvMasters(csv);
  const vouchers = parseCsvVouchers(csv);
  return {
    source: "csv",
    parties: masters.parties,
    items: masters.items,
    bills: vouchers.bills,
    payments: vouchers.payments,
  };
}

export function detectAndParseImportFile(
  fileName: string,
  content: string,
  sourceHint?: "tally" | "busy" | "auto",
): ParsedImportData {
  const normalized = normalizeImportText(content);
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv") && !looksLikeXml(normalized)) {
    return parseCsvFile(normalized);
  }

  if (!looksLikeXml(normalized)) {
    if (normalized.includes(",") || normalized.includes("\t")) {
      const csvTry = parseCsvFile(normalized.replace(/\t/g, ","));
      if (hasImportData(csvTry)) return csvTry;
    }
    throw new Error(
      "Could not read this file as XML or CSV. In BUSY use Administration → Data Export/Import → Data Export/Import (XML), then upload that .dat file with source set to BUSY.",
    );
  }

  if (sourceHint === "busy" || lower.endsWith(".dat")) {
    const busy = parseBusyXml(normalized);
    if (hasImportData(busy)) return busy;
    if (sourceHint === "busy" || lower.endsWith(".dat")) {
      throw new Error(
        "BUSY file was read but no parties, items, or vouchers matched. Re-export with Accounts and Items (and Transactions if needed) checked in BUSY.",
      );
    }
  }

  if (
    sourceHint === "tally" ||
    /tallymessage|tallyrequest|stockitem/i.test(normalized)
  ) {
    const tally = parseTallyXml(normalized);
    if (hasImportData(tally)) return tally;
    if (sourceHint === "tally") {
      throw new Error(
        "Tally file was read but no parties, items, or vouchers matched.",
      );
    }
  }

  const busy = parseBusyXml(normalized);
  if (hasImportData(busy)) return busy;

  const tally = parseTallyXml(normalized);
  if (hasImportData(tally)) return tally;

  throw new Error(
    "File parsed as XML but no parties, items, or vouchers were found. In BUSY, export Masters and/or Transactions via Administration → Data Export/Import (XML), and select BUSY as the import source.",
  );
}
