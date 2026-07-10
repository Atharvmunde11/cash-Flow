import { db } from "@/lib/db";

export async function getNextBillNumber(
  kind: "sale" | "purchase" = "sale",
): Promise<string> {
  const year = new Date().getFullYear();
  const key = kind === "sale" ? `bill-${year}` : `purchase-${year}`;
  const prefix = kind === "sale" ? "INV" : "PUR";
  const c = await db.counter.upsert({
    where: { id: key },
    update: { seq: { increment: 1 } },
    create: { id: key, seq: 1 },
  });
  const seq = c.seq ?? 1;
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}
