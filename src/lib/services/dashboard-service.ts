import mongoose from "mongoose";
import { Bill } from "@/models/Bill";
import { Item } from "@/models/Item";
import { Party } from "@/models/Party";
import { LedgerTransaction } from "@/models/Transaction";
import { Category } from "@/models/Category";
import { cashFlowFromTransaction } from "@/lib/ledger";
import { getRootCategoryIdFromMap } from "@/lib/services/category-service";

function startEndOfLocalDay(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Revenue charts: sales only (exclude purchase bills). */
function saleOnlyFilter(): Record<string, unknown> {
  return {
    $or: [{ billKind: { $exists: false } }, { billKind: "sale" }],
  };
}

export async function getDashboardMetrics() {
  const { start: todayStart, end: todayEnd } = startEndOfLocalDay(new Date());
  const { Payment } = await import("@/models/Payment");

  const [
    todaySaleBills,
    todayPurchaseBills,
    todayPaymentsReceived,
    todayPaymentsPaid,
    todayPendingBills,
    lowStockItems,
    todayAllBills,
  ] = await Promise.all([
    // Today's sale bill totals
    Bill.aggregate<{ _id: null; revenue: number }>([
      {
        $match: {
          billDate: { $gte: todayStart, $lt: todayEnd },
          ...saleOnlyFilter(),
        },
      },
      { $group: { _id: null, revenue: { $sum: "$total" } } },
    ]),
    // Today's purchase bill totals
    Bill.aggregate<{ _id: null; total: number }>([
      {
        $match: {
          billDate: { $gte: todayStart, $lt: todayEnd },
          billKind: "purchase",
        },
      },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    // Payments received today (from customers)
    Payment.aggregate<{ _id: null; total: number }>([
      {
        $match: {
          date: { $gte: todayStart, $lt: todayEnd },
          direction: "received",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    // Payments paid today (to suppliers)
    Payment.aggregate<{ _id: null; total: number }>([
      {
        $match: {
          date: { $gte: todayStart, $lt: todayEnd },
          direction: "paid",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    // Today's pending bills (credit amount from today's bills)
    Bill.aggregate<{ _id: null; pending: number }>([
      {
        $match: {
          billDate: { $gte: todayStart, $lt: todayEnd },
          creditAmount: { $gt: 0 },
        },
      },
      { $group: { _id: null, pending: { $sum: "$creditAmount" } } },
    ]),
    // Low stock items
    Item.find({
      $expr: { $lte: ["$quantity", "$lowStockThreshold"] },
    })
      .sort({ quantity: 1 })
      .limit(50)
      .lean(),
    // Today's total bill net amount (all bills)
    Bill.aggregate<{ _id: null; net: number }>([
      {
        $match: {
          billDate: { $gte: todayStart, $lt: todayEnd },
        },
      },
      { $group: { _id: null, net: { $sum: "$total" } } },
    ]),
  ]);

  // Today's Revenue = sale bills + payments received - purchase bills - payments paid
  const saleBillTotal = todaySaleBills[0]?.revenue ?? 0;
  const purchaseBillTotal = todayPurchaseBills[0]?.total ?? 0;
  const paymentsReceived = todayPaymentsReceived[0]?.total ?? 0;
  const paymentsPaid = todayPaymentsPaid[0]?.total ?? 0;
  const todayRevenue = saleBillTotal + paymentsReceived - purchaseBillTotal - paymentsPaid;

  // Pending payments = today's unpaid bill amounts
  const pendingPayments = todayPendingBills[0]?.pending ?? 0;

  // Cash & UPI position = total net of all bills created today
  const cashInHand = todayAllBills[0]?.net ?? 0;

  return {
    todayRevenue,
    pendingPayments,
    cashInHand,
    lowStockItems,
  };
}

export async function getDailyRevenueSeries(weekOffset: number) {
  const today = new Date();
  const startDate = addDays(today, weekOffset * 7 - 6);
  const days: { key: string; label: string; revenue: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(startDate, i);
    const { start, end } = startEndOfLocalDay(day);
    const agg = await Bill.aggregate<{ _id: null; revenue: number }>([
      {
        $match: {
          billDate: { $gte: start, $lt: end },
          ...saleOnlyFilter(),
        },
      },
      { $group: { _id: null, revenue: { $sum: "$total" } } },
    ]);
    days.push({
      key: start.toISOString().slice(0, 10),
      label: start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      revenue: agg[0]?.revenue ?? 0,
    });
  }
  return { weekOffset, days };
}

export type PieRange = "today" | "week" | "month";

export async function getCategoryRevenuePie(range: PieRange) {
  const now = new Date();
  let start: Date;
  if (range === "today") {
    start = startEndOfLocalDay(now).start;
  } else if (range === "week") {
    start = addDays(now, -7);
  } else {
    start = addDays(now, -30);
  }

  const bills = await Bill.find({
    createdAt: { $gte: start },
    ...saleOnlyFilter(),
  }).lean();
  const itemIds = [
    ...new Set(
      bills.flatMap((b) =>
        b.lines.map((l: { itemId: mongoose.Types.ObjectId }) =>
          l.itemId.toString(),
        ),
      ),
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const items = await Item.find({ _id: { $in: itemIds } }).lean();
  const itemMap = new Map(items.map((i) => [i._id.toString(), i]));
  const allCats = await Category.find({}).lean();
  const catById = new Map(
    allCats.map((c) => [
      c._id.toString(),
      {
        _id: c._id as mongoose.Types.ObjectId,
        parentId: c.parentId as mongoose.Types.ObjectId | null | undefined,
      },
    ]),
  );

  const map = new Map<
    string,
    { id: string; name: string; value: number; color?: string | null }
  >();

  for (const b of bills) {
    for (const line of b.lines) {
      const item = itemMap.get(
        (line.itemId as mongoose.Types.ObjectId).toString(),
      );
      if (!item) continue;
      const rootId = getRootCategoryIdFromMap(
        item.categoryId as mongoose.Types.ObjectId,
        catById,
      );
      const key = rootId.toString();
      const name =
        allCats.find((c) => c._id.toString() === rootId.toString())?.name ??
        "Uncategorized";
      const color =
        allCats.find((c) => c._id.toString() === rootId.toString())?.color ??
        null;
      const prev = map.get(key) ?? { id: key, name, value: 0, color };
      prev.value += line.lineTotal;
      prev.color = color;
      map.set(key, prev);
    }
  }

  const rows = [...map.values()].sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return { rows, total, range };
}

export async function getHourlyTraffic() {
  const agg = await Bill.aggregate<{ _id: number; count: number }>([
    { $match: saleOnlyFilter() },
    {
      $group: {
        _id: "$hourOfDay",
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: agg.find((x) => x._id === h)?.count ?? 0,
  }));
  const peak = hours.reduce(
    (best, cur) => (cur.count > best.count ? cur : best),
    hours[0] ?? { hour: 0, count: 0 },
  );
  return { hours, peak };
}

export async function getCreditAlerts() {
  const owing = await Party.find({
    partyType: "customer",
    balance: { $gt: 0 },
  })
    .sort({ balance: -1 })
    .limit(10)
    .lean();

  const overdue = await Party.find({
    partyType: "customer",
    balance: { $gt: 0 },
    lastPaymentAt: { $ne: null },
  })
    .sort({ lastPaymentAt: 1 })
    .limit(10)
    .lean();

  return { highestDues: owing, longestSincePayment: overdue };
}
