import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import { billCreateSchema } from "@/lib/validations";
import { createBillWithSideEffects } from "@/lib/services/bill-service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");
    const itemId = searchParams.get("itemId");
    const today = searchParams.get("today");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const where: any = {};

    if (partyId && partyId.trim()) where.partyId = partyId.trim();
    if (itemId && itemId.trim()) where.lines = { some: { itemId: itemId.trim() } };

    const kind = searchParams.get("billKind");
    if (kind === "sale" || kind === "purchase") {
      where.billKind = kind;
    }

    if (today === "1") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.billDate = { gte: start, lt: end };
    }

    if (from && to) {
      const f = new Date(from);
      const t = new Date(to);
      where.billDate = { gte: f, lte: t };
    }

    const date = searchParams.get("date");
    if (date && !today && !from) {
      const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const y = Number(match[1]);
        const m = Number(match[2]) - 1;
        const d = Number(match[3]);
        const start = new Date(y, m, d, 0, 0, 0, 0);
        const end = new Date(y, m, d + 1, 0, 0, 0, 0);
        where.billDate = { gte: start, lt: end };
      }
    }

    const rows = await db.bill.findMany({
      where,
      orderBy: { billDate: "desc" },
      take: 500,
      include: {
        lines: true,
        sundryCharges: true,
        stockWarnings: true,
      },
    });

    // Compute profit per bill (best-effort; older bills may not have purchasePrice stored)
    const rowsWithProfit = withMongoIds(rows).map((b) => {
      const profit = b.lines.reduce((s: number, l: any) => {
        const pp = (l.purchasePrice ?? 0) > 0 ? (l.purchasePrice ?? 0) : 0;
        if (b.billKind === "sale") return s + (l.unitPrice - pp) * l.quantity;
        return s;
      }, 0);
      return { ...b, profit };
    });

    return jsonOk(rowsWithProfit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();

    // Strip sundryCharges before zod parse — schema is .strict() and doesn't know this key
    const { sundryCharges: rawSundryCharges, ...bodyForZod } = body;
    const sundryCharges = (rawSundryCharges ?? []) as {
      label: string;
      amount: number;
    }[];

    const parsed = billCreateSchema.safeParse(bodyForZod);

    if (!parsed.success) {
      console.error(
        "❌ zod errors:",
        JSON.stringify(parsed.error.flatten(), null, 2),
      );
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    // Validate at least one line manually
    if (!parsed.data.lines || parsed.data.lines.length === 0) {
      return jsonError("Add at least one item line", 400);
    }

    let partyDoc = null;
    let isWalkIn = false;

    // partyId is undefined for walk-in customers after zod transform
    if (parsed.data.partyId) {
      partyDoc = await db.party.findUnique({ where: { id: parsed.data.partyId } });
      if (!partyDoc) return jsonError("Party not found", 400);
    } else {
      isWalkIn = true;
    }

    // Only validate party type when a real party is linked
    if (partyDoc) {
      if (
        parsed.data.billKind === "sale" &&
        partyDoc.partyType !== "customer"
      ) {
        return jsonError("Sale bills require a customer", 400);
      }
      if (
        parsed.data.billKind === "purchase" &&
        partyDoc.partyType !== "supplier"
      ) {
        return jsonError("Purchase bills require a supplier", 400);
      }
    }

    // Compute items total
    let total = 0;
    for (const line of parsed.data.lines) {
      const item = await db.item.findUnique({ where: { id: line.itemId } });
      if (!item) return jsonError(`Item not found: ${line.itemId}`, 400);
      const unitPrice =
        line.unitPrice !== undefined ? line.unitPrice : item.price;
      total += unitPrice * line.quantity;
    }

    // Add sundry to total for paid amount check
    const sundryTotal = sundryCharges.reduce(
      (s, c) => s + (Number(c.amount) || 0),
      0,
    );

    if (parsed.data.paidAmount - (total + sundryTotal) > 1e-6) {
      return jsonError("Paid amount cannot exceed bill total", 400);
    }

    if (
      (parsed.data.paymentMode === "upi" ||
        parsed.data.paymentMode === "bank") &&
      !parsed.data.bankAccountId
    ) {
      return jsonError(
        "Bank account is required for UPI or bank transfer payments",
        400,
      );
    }

    const result = await createBillWithSideEffects({
      ...parsed.data,
      sundryCharges,
      partyId: isWalkIn ? undefined : parsed.data.partyId,
      displayName: parsed.data.displayName ?? "",
    });

    return jsonOk(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("POST /api/bills error:", e);
    return jsonError(msg, 400);
  }
}
