import { db } from "@/lib/db";
import { withMongoIds } from "@/lib/id-compat";

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
function saleOnlyWhere() {
  return { billKind: "sale" as const };
}

export async function getDashboardMetrics() {
  const { start: todayStart, end: todayEnd } = startEndOfLocalDay(new Date());

  const todayActivity = await db.bill.count({
    where: {
      billDate: { gte: todayStart, lt: todayEnd },
      ...saleOnlyWhere(),
    },
  });

  let metricsStart = todayStart;
  let metricsEnd = todayEnd;
  let metricsDayLabel = "Today";

  if (todayActivity === 0) {
    const latestBill = await db.bill.findFirst({
      where: saleOnlyWhere(),
      orderBy: { billDate: "desc" },
      select: { billDate: true },
    });
    if (latestBill?.billDate) {
      const latest = startEndOfLocalDay(latestBill.billDate);
      metricsStart = latest.start;
      metricsEnd = latest.end;
      metricsDayLabel = latest.start.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }

  const [
    daySaleBills,
    dayPurchaseBills,
    dayPaymentsReceived,
    dayPaymentsPaid,
    dayPendingBills,
    lowStockItems,
    dayCashBills,
    dayCashPayments,
  ] = await Promise.all([
    db.bill.aggregate({
      where: { billDate: { gte: metricsStart, lt: metricsEnd }, ...saleOnlyWhere() },
      _sum: { total: true },
    }),
    db.bill.aggregate({
      where: {
        billDate: { gte: metricsStart, lt: metricsEnd },
        billKind: "purchase",
      },
      _sum: { total: true },
    }),
    db.payment.aggregate({
      where: {
        date: { gte: metricsStart, lt: metricsEnd },
        direction: "received",
      },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: {
        date: { gte: metricsStart, lt: metricsEnd },
        direction: "paid",
      },
      _sum: { amount: true },
    }),
    db.bill.aggregate({
      where: {
        billDate: { gte: metricsStart, lt: metricsEnd },
        creditAmount: { gt: 0 },
      },
      _sum: { creditAmount: true },
    }),
    db.item.findMany({
      orderBy: { quantity: "asc" },
      take: 200,
    }),
    db.bill.aggregate({
      where: {
        billDate: { gte: metricsStart, lt: metricsEnd },
        ...saleOnlyWhere(),
        paymentMode: "cash",
      },
      _sum: { paidAmount: true },
    }),
    db.payment.aggregate({
      where: {
        date: { gte: metricsStart, lt: metricsEnd },
        direction: "received",
        paymentMode: "cash",
      },
      _sum: { amount: true },
    }),
  ]);

  const saleBillTotal = daySaleBills._sum.total ?? 0;
  const purchaseBillTotal = dayPurchaseBills._sum.total ?? 0;
  const paymentsReceived = dayPaymentsReceived._sum.amount ?? 0;
  const paymentsPaid = dayPaymentsPaid._sum.amount ?? 0;
  const todayRevenue =
    saleBillTotal + paymentsReceived - purchaseBillTotal - paymentsPaid;

  const pendingPayments = dayPendingBills._sum.creditAmount ?? 0;

  const cashCollection =
    (dayCashBills._sum.paidAmount ?? 0) + (dayCashPayments._sum.amount ?? 0);

  const lowStockFiltered = lowStockItems.filter(
    (item) => item.quantity <= item.lowStockThreshold,
  );

  return {
    todayRevenue,
    pendingPayments,
    cashCollection,
    metricsDayLabel,
    lowStockItems: withMongoIds(lowStockFiltered.slice(0, 50)),
  };
}

export async function getLatestSaleBillDate(): Promise<Date | null> {
  const latest = await db.bill.findFirst({
    where: saleOnlyWhere(),
    orderBy: { billDate: "desc" },
    select: { billDate: true },
  });
  return latest?.billDate ?? null;
}

export async function getDailyRevenueSeries(weekOffset: number) {
  const today = new Date();
  const startDate = addDays(today, weekOffset * 7 - 6);
  const days: { key: string; label: string; revenue: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(startDate, i);
    const { start, end } = startEndOfLocalDay(day);
    const agg = await db.bill.aggregate({
      where: { billDate: { gte: start, lt: end }, ...saleOnlyWhere() },
      _sum: { total: true },
    });
    days.push({
      key: start.toISOString().slice(0, 10),
      label: start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      revenue: agg._sum.total ?? 0,
    });
  }
  return { weekOffset, days };
}

export type PieRange = "today" | "week" | "month" | "all";

export async function getCategoryRevenuePie(range: PieRange) {
  const now = new Date();
  let billDateFilter: { gte: Date; lt: Date } | undefined;

  if (range === "today") {
    const { start, end } = startEndOfLocalDay(now);
    billDateFilter = { gte: start, lt: end };
  } else if (range === "week") {
    const { start: todayStart, end } = startEndOfLocalDay(now);
    billDateFilter = { gte: addDays(todayStart, -6), lt: end };
  } else if (range === "month") {
    const { start: todayStart, end } = startEndOfLocalDay(now);
    billDateFilter = { gte: addDays(todayStart, -29), lt: end };
  }

  const [lines, allCats] = await Promise.all([
    db.billLine.findMany({
      where: {
        bill: {
          ...(billDateFilter ? { billDate: billDateFilter } : {}),
          ...saleOnlyWhere(),
        },
      },
      select: {
        lineTotal: true,
        item: {
          select: {
            categoryId: true,
          },
        },
      },
      take: 20000,
    }),
    db.category.findMany({}),
  ]);

  const catMap = new Map(allCats.map((c) => [c.id, c]));

  const map = new Map<
    string,
    { id: string; name: string; value: number; color?: string | null }
  >();

  for (const l of lines) {
    const leafCategoryId = l.item.categoryId;
    const leaf = catMap.get(leafCategoryId);
    const ancestors = (leaf?.ancestorIds as unknown as string[]) ?? [];
    const rootId = ancestors.length > 0 ? ancestors[0] : leafCategoryId;
    const root = catMap.get(rootId);
    const key = rootId;
    const name = root?.name ?? "Uncategorized";
    const color = root?.color ?? null;
    const prev = map.get(key) ?? { id: key, name, value: 0, color };
    prev.value += l.lineTotal;
    prev.color = color;
    map.set(key, prev);
  }

  const rows = [...map.values()].sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return { rows, total, range };
}

export async function getHourlyTraffic() {
  const [billAgg, paymentRows] = await Promise.all([
    db.bill.groupBy({
      by: ["hourOfDay"],
      where: saleOnlyWhere(),
      _count: { _all: true },
      orderBy: { hourOfDay: "asc" },
    }),
    db.payment.findMany({
      where: { direction: "received" },
      select: { date: true },
      take: 5000,
    }),
  ]);

  const hourCounts = new Map<number, number>();

  for (const row of billAgg) {
    hourCounts.set(
      row.hourOfDay,
      (hourCounts.get(row.hourOfDay) ?? 0) + row._count._all,
    );
  }

  for (const payment of paymentRows) {
    const hour = payment.date.getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourCounts.get(h) ?? 0,
  }));

  const activeHours = hours.filter((h) => h.count > 0);
  const peak = activeHours.reduce(
    (best, cur) => (cur.count > best.count ? cur : best),
    activeHours[0] ?? { hour: 12, count: 0 },
  );

  return { hours, peak, activeHours };
}

export async function getCreditAlerts() {
  const [owing, overdue] = await Promise.all([
    db.party.findMany({
      where: { partyType: "customer", balance: { gt: 0 } },
      orderBy: { balance: "desc" },
      take: 10,
    }),
    db.party.findMany({
      where: { partyType: "customer", balance: { gt: 0 }, lastPaymentAt: { not: null } },
      orderBy: { lastPaymentAt: "asc" },
      take: 10,
    }),
  ]);

  return {
    highestDues: withMongoIds(owing),
    longestSincePayment: withMongoIds(overdue),
  };
}
