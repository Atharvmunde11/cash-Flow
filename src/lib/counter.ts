import { db } from "@/lib/db";

export type BillNumberKind =
  | "sale"
  | "purchase"
  | "sale_return"
  | "purchase_return";

const BILL_NUMBER_CONFIG: Record<
  BillNumberKind,
  { keyPrefix: string; prefix: string }
> = {
  sale: { keyPrefix: "bill", prefix: "INV" },
  purchase: { keyPrefix: "purchase", prefix: "PUR" },
  sale_return: { keyPrefix: "sale-return", prefix: "SRN" },
  purchase_return: { keyPrefix: "purchase-return", prefix: "PRN" },
};

export async function getNextBillNumber(
  kind: BillNumberKind = "sale",
): Promise<string> {
  const year = new Date().getFullYear();
  const config = BILL_NUMBER_CONFIG[kind] ?? BILL_NUMBER_CONFIG.sale;
  const key = `${config.keyPrefix}-${year}`;
  const c = await db.counter.upsert({
    where: { id: key },
    update: { seq: { increment: 1 } },
    create: { id: key, seq: 1 },
  });
  const seq = c.seq ?? 1;
  return `${config.prefix}-${year}-${String(seq).padStart(6, "0")}`;
}
