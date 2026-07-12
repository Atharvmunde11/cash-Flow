import {
  classifyAccountGroup,
  isCashPartyAlias,
  partyTypeFromAccountKind,
} from "@/lib/import/account-classify";

export {
  classifyAccountGroup,
  guestDisplayName,
  isBankGroup,
  isCashGroup,
  isCashPartyAlias,
  isTenderOrSystemLedgerName,
  paymentModeFromAccountGroup,
  partyTypeFromAccountKind,
  resolveGuestDisplayName,
  type AccountKind,
} from "@/lib/import/account-classify";

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object" && value !== null && "#text" in value) {
    return String((value as { "#text": unknown })["#text"]).trim();
  }
  return "";
}

export function numOf(value: unknown): number {
  const raw = textOf(value).replace(/,/g, "");
  if (!raw) return 0;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function absAmount(value: unknown): number {
  return Math.abs(numOf(value));
}

export function walkNodes(
  node: unknown,
  tag: string,
  out: Record<string, unknown>[],
) {
  if (node == null || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const child of node) walkNodes(child, tag, out);
    return;
  }

  const record = node as Record<string, unknown>;
  if (record[tag]) {
    for (const item of asArray(record[tag])) {
      if (item && typeof item === "object") {
        out.push(item as Record<string, unknown>);
      }
    }
  }

  for (const value of Object.values(record)) {
    walkNodes(value, tag, out);
  }
}

export function parseTallyQuantity(raw: unknown): number {
  const match = textOf(raw).match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const n = Number.parseFloat(match[0]);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export function parseTallyRate(raw: unknown): number {
  return parseTallyQuantity(raw);
}

export function parseImportDate(raw: unknown): Date {
  const t = textOf(raw);
  if (/^\d{8}$/.test(t)) {
    const y = Number.parseInt(t.slice(0, 4), 10);
    const m = Number.parseInt(t.slice(4, 6), 10) - 1;
    const d = Number.parseInt(t.slice(6, 8), 10);
    return new Date(y, m, d, 12, 0, 0, 0);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(t)) {
    const [day, month, year] = t.split("-").map((part) => Number.parseInt(part, 10));
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function tallyPartyType(parent: string): "customer" | "supplier" | null {
  return partyTypeFromAccountKind(classifyAccountGroup(parent));
}

export function busyPartyType(group: string): "customer" | "supplier" | null {
  return partyTypeFromAccountKind(classifyAccountGroup(group));
}

/** Read stock/opening quantity from BUSY/Tally-like master rows. */
export function busyItemQuantity(row: Record<string, unknown>): number {
  return Math.abs(
    numOf(
      row.OpeningQty ??
        row.OPENINGQTY ??
        row.OpQty ??
        row.OPQTY ??
        row.BalQty ??
        row.BALQTY ??
        row.BalanceQty ??
        row.BALANCEQTY ??
        row.ClosingQty ??
        row.CLOSINGQTY ??
        row.ClosingStock ??
        row.CLOSINGSTOCK ??
        row.CurrentStock ??
        row.CURRENTSTOCK ??
        row.CurStock ??
        row.CURSTOCK ??
        row.Stock ??
        row.STOCK ??
        row.StockQty ??
        row.STOCKQTY ??
        row.QtyMainUnit ??
        row.QTYMAINUNIT ??
        row.MCBalQty ??
        row.MCBALQTY ??
        row.Qty ??
        row.QTY ??
        row.Quantity ??
        row.QUANTITY,
    ),
  );
}

/** Unit from BUSY item master or voucher line (MainUnit, BAG, etc.). */
export function busyItemUnit(row: Record<string, unknown>): string {
  const unit = textOf(
    row.MainUnit ??
      row.MAINUNIT ??
      row.UnitName ??
      row.UNITNAME ??
      row.PackingUnitName ??
      row.PACKINGUNITNAME ??
      row.Unit ??
      row.UNIT ??
      row.UOM ??
      row.AltUnit ??
      row.ALTUNIT,
  );
  return unit || "pieces";
}

/** Decode Busy/Tally export files (UTF-8, UTF-16, BOM). */
export function decodeImportBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  const asUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (asUtf8.includes("\u0000")) {
    try {
      return new TextDecoder("utf-16le").decode(bytes);
    } catch {
      return asUtf8.replace(/\u0000/g, "");
    }
  }
  return asUtf8;
}

export function normalizeImportText(raw: string): string {
  let text = raw.replace(/^\uFEFF/, "").trim();
  if (text.includes("\u0000")) {
    text = text.replace(/\u0000/g, "");
  }
  const xmlStart = text.search(/<\?xml[\s?]|<[A-Za-z][\w:.-]*[\s>/]/);
  if (xmlStart > 0) {
    text = text.slice(xmlStart);
  }
  return text.trim();
}

export function looksLikeXml(text: string): boolean {
  const normalized = normalizeImportText(text);
  return normalized.startsWith("<") && /<[A-Za-z]/.test(normalized);
}

/**
 * True for cash/bank/UPI tender ledgers (and Cash / CASH PAYMENT party aliases).
 * Do not use for income/expense/tax ledgers — see isTenderOrSystemLedgerName.
 */
export function isCashLedgerName(name: string): boolean {
  if (isCashPartyAlias(name)) return true;
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return (
    n === "cash" ||
    n.includes("cash") ||
    n.includes("bank") ||
    n.includes("upi") ||
    n.includes("petty")
  );
}

export function sanitizeBillNumber(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) return fallback;
  return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
}
