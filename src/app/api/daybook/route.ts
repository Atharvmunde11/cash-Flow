import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import { daybookSaveSchema } from "@/lib/validations";

export const runtime = "nodejs";

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const noon = new Date(start);
  noon.setHours(12, 0, 0, 0);
  return { start, end, noon };
}

function tenderBreakdown(bill: {
  paymentMode: string;
  paidAmount: number;
  paymentSplits?: Array<{ method: string; amount: number }>;
}) {
  const splits = bill.paymentSplits ?? [];
  if (splits.length > 0) {
    let cash = 0;
    let online = 0;
    for (const split of splits) {
      if (split.method === "cash") cash += split.amount;
      else online += split.amount;
    }
    return { cash, online };
  }

  const paid = Number(bill.paidAmount) || 0;
  if (bill.paymentMode === "cash") return { cash: paid, online: 0 };
  if (bill.paymentMode === "upi" || bill.paymentMode === "bank") {
    return { cash: 0, online: paid };
  }
  if (bill.paymentMode === "mixed") {
    return { cash: paid, online: 0 };
  }
  return { cash: 0, online: 0 };
}

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const base =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? new Date(`${dateParam}T12:00:00`)
        : new Date();
    const { start, end, noon } = dayBounds(base);
    const dateKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

    const [daybook, bills, returnBills, expenseRows] = await Promise.all([
      db.daybook.findFirst({
        where: {
          date: {
            gte: start,
            lt: end,
          },
        },
      }),
      db.bill.findMany({
        where: {
          billKind: "sale",
          billDate: { gte: start, lt: end },
        },
        orderBy: [{ billDate: "asc" }, { createdAt: "asc" }],
        include: {
          sundryCharges: true,
          paymentSplits: true,
        },
      }),
      db.bill.findMany({
        where: {
          billKind: { in: ["sale_return", "purchase_return"] },
          billDate: { gte: start, lt: end },
        },
        orderBy: [{ billDate: "asc" }, { createdAt: "asc" }],
        include: {
          paymentSplits: true,
        },
      }),
      db.daybookExpense.findMany({
        where: { date: { gte: start, lt: end } },
        orderBy: [{ createdAt: "asc" }],
      }),
    ]);

    const rows = bills.map((bill) => {
      const tender = tenderBreakdown(bill);
      const sundry = (bill.sundryCharges ?? []).reduce(
        (s, c) => s + (Number(c.amount) || 0),
        0,
      );
      return {
        id: bill.id,
        billNumber: bill.billNumber,
        displayName: bill.displayName,
        paymentMode: bill.paymentMode,
        total: bill.total,
        paidAmount: bill.paidAmount,
        creditAmount: bill.creditAmount,
        cash: tender.cash,
        online: tender.online,
        sundry,
      };
    });

    const returns = returnBills.map((bill) => {
      const tender = tenderBreakdown(bill);
      return {
        id: bill.id,
        billNumber: bill.billNumber,
        displayName: bill.displayName,
        billKind: bill.billKind as "sale_return" | "purchase_return",
        paymentMode: bill.paymentMode,
        total: bill.total,
        cash: tender.cash,
        online: tender.online,
      };
    });

    const sundryEntries = bills.flatMap((bill) =>
      (bill.sundryCharges ?? [])
        .filter((c) => (Number(c.amount) || 0) !== 0)
        .map((c) => ({
          billId: bill.id,
          billNumber: bill.billNumber,
          displayName: bill.displayName,
          label: c.label || "Sundry",
          amount: Number(c.amount) || 0,
        })),
    );

    const expenses = withMongoIds(
      expenseRows.map((e) => ({
        id: e.id,
        reason: e.reason,
        amount: e.amount,
        createdAt: e.createdAt,
      })),
    );

    const cashTotal = rows.reduce((s, r) => s + r.cash, 0);
    const onlineTotal = rows.reduce((s, r) => s + r.online, 0);
    const sundryTotal = sundryEntries.reduce((s, r) => s + r.amount, 0);
    const expenseTotal = expenseRows.reduce(
      (s, e) => s + (Number(e.amount) || 0),
      0,
    );
    const saleReturnCash = returns
      .filter((r) => r.billKind === "sale_return")
      .reduce((s, r) => s + r.cash, 0);
    const purchaseReturnCash = returns
      .filter((r) => r.billKind === "purchase_return")
      .reduce((s, r) => s + r.cash, 0);
    const morning = daybook?.morningCash ?? 0;

    return jsonOk({
      date: dateKey,
      morningCash: morning,
      notes: daybook?.notes ?? "",
      saved: Boolean(daybook),
      daybook: daybook ? withMongoId(daybook) : null,
      bills: withMongoIds(rows),
      returns: withMongoIds(returns),
      sundries: sundryEntries,
      expenses,
      totals: {
        cash: cashTotal,
        online: onlineTotal,
        sundry: sundryTotal,
        expenses: expenseTotal,
        billCount: rows.length,
        returnCount: returns.length,
        closingCash:
          morning + cashTotal - expenseTotal - saleReturnCash + purchaseReturnCash,
      },
      _meta: { noon: noon.toISOString() },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load daybook";
    return jsonError(msg, 500);
  }
}

export async function PUT(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = daybookSaveSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const { start, end, noon } = dayBounds(parsed.data.date);
    const expenseRows = (parsed.data.expenses ?? [])
      .map((e) => ({
        reason: e.reason.trim(),
        amount: Number(e.amount) || 0,
      }))
      .filter((e) => e.reason.length > 0 && e.amount > 0);

    const saved = await db.$transaction(async (tx) => {
      const existing = await tx.daybook.findFirst({
        where: { date: { gte: start, lt: end } },
      });

      const daybook = existing
        ? await tx.daybook.update({
            where: { id: existing.id },
            data: {
              morningCash: parsed.data.morningCash,
              notes: parsed.data.notes ?? "",
            },
          })
        : await tx.daybook.create({
            data: {
              date: noon,
              morningCash: parsed.data.morningCash,
              notes: parsed.data.notes ?? "",
            },
          });

      // Replace day's expenses atomically with the saved list.
      await tx.daybookExpense.deleteMany({
        where: { date: { gte: start, lt: end } },
      });
      if (expenseRows.length > 0) {
        await tx.daybookExpense.createMany({
          data: expenseRows.map((e) => ({
            date: noon,
            reason: e.reason,
            amount: e.amount,
          })),
        });
      }

      const expenses = await tx.daybookExpense.findMany({
        where: { date: { gte: start, lt: end } },
        orderBy: [{ createdAt: "asc" }],
      });

      return { daybook, expenses };
    });

    return jsonOk({
      ...withMongoId(saved.daybook),
      expenses: withMongoIds(saved.expenses),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save daybook";
    return jsonError(msg, 500);
  }
}
