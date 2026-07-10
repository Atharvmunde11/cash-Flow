"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Clock,
  Package,
  ExternalLink,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/format";
import type { DashboardResponse } from "@/types/dashboard";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function isGradient(value: string | null | undefined) {
  return Boolean(value && value.includes("gradient("));
}

function parseLinearGradient(value: string) {
  const fallback = { angle: 135, start: "#2563eb", end: "#06b6d4" };
  const match = value.match(
    /linear-gradient\((\d+)deg,\s*(#[0-9a-fA-F]{3,8}),\s*(#[0-9a-fA-F]{3,8})\)/,
  );
  if (!match) return fallback;
  return { angle: Number(match[1]), start: match[2], end: match[3] };
}

function gradientId(rawId: string) {
  // SVG ids must be safe; keep it deterministic.
  return `cat-grad-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

async function fetchDashboard(weekOffset: number, pieRange: string) {
  const res = await fetch(
    `/api/dashboard?weekOffset=${weekOffset}&pieRange=${encodeURIComponent(pieRange)}`,
    { cache: "no-store" },
  );
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j?.error === "string") {
        throw new Error(j.error);
      }
    } catch (e) {
      if (e instanceof Error && !(e instanceof SyntaxError) && e.message !== text) {
        throw e;
      }
    }
    throw new Error(text.slice(0, 500) || "Failed to load dashboard");
  }
  return JSON.parse(text) as DashboardResponse;
}

async function fetchLowStockPage({ pageParam = 1 }: { pageParam?: number }) {
  const res = await fetch(`/api/items/low-stock?page=${pageParam}&limit=15`);
  if (!res.ok) throw new Error("Failed to load low stock items");
  return (await res.json()) as {
    data: {
      items: Array<{
        _id: string;
        name: string;
        quantity: number;
        lowStockThreshold: number;
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function DashboardView() {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekOffsetInitialized, setWeekOffsetInitialized] = useState(false);
  const [pieRange, setPieRange] = useState<"today" | "week" | "month" | "all">(
    "all",
  );
  const [lowStockOpen, setLowStockOpen] = useState(false);

  const query = useQuery({
    queryKey: ["dashboard", weekOffset, pieRange],
    queryFn: () => fetchDashboard(weekOffset, pieRange),
  });

  const lowStockQuery = useInfiniteQuery({
    queryKey: ["low-stock-items"],
    queryFn: fetchLowStockPage,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const d = lastPage.data;
      return d.page < d.totalPages ? d.page + 1 : undefined;
    },
    enabled: lowStockOpen,
  });

  const payload = query.data?.data;

  useEffect(() => {
    if (!payload || weekOffsetInitialized) return;

    const allZero = payload.revenueWeek.days.every((d) => d.revenue === 0);
    const latest = payload.latestSaleBillDate;
    if (allZero && latest) {
      const latestDay = new Date(latest);
      latestDay.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (today.getTime() - latestDay.getTime()) / 86_400_000,
      );
      if (diffDays > 6) {
        setWeekOffset(-Math.ceil(diffDays / 7));
      }
    }

    setWeekOffsetInitialized(true);
  }, [payload, weekOffsetInitialized]);

  const revenueRangeLabel = useMemo(() => {
    if (!payload?.revenueWeek.days.length) return "";
    const first = payload.revenueWeek.days[0]?.label;
    const last = payload.revenueWeek.days.at(-1)?.label;
    return first && last ? `${first} – ${last}` : "";
  }, [payload]);

  const pieData = useMemo(() => {
    if (!payload?.categoryPie.rows.length) return [];
    const t = payload.categoryPie.total || 1;
    return payload.categoryPie.rows.map((r) => ({
      id: r.id,
      name: r.name,
      value: r.value,
      color: r.color,
      pct: Math.round((r.value / t) * 1000) / 10,
    }));
  }, [payload]);

  const trafficData = useMemo(() => {
    if (!payload) return [];
    const peakHour = payload.traffic.peak.hour;
    const source =
      payload.traffic.activeHours?.length > 0
        ? payload.traffic.activeHours
        : payload.traffic.hours.filter((h) => h.count > 0);

    return source.map((h) => ({
      ...h,
      label: formatHour(h.hour),
      isPeak: h.hour === peakHour,
    }));
  }, [payload]);

  // Lazy loading sentinel
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver((entries) => {
        if (
          entries[0].isIntersecting &&
          lowStockQuery.hasNextPage &&
          !lowStockQuery.isFetchingNextPage
        ) {
          lowStockQuery.fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [lowStockQuery],
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Dashboard unavailable</AlertTitle>
        <AlertDescription>
          {query.error instanceof Error
            ? query.error.message
            : "Could not load dashboard data."}
        </AlertDescription>
      </Alert>
    );
  }

  if (!payload) return null;

  const metricsDay = payload.metrics.metricsDayLabel;
  const metricsDayHint =
    metricsDay === "Today"
      ? "today"
      : `on ${metricsDay}`;

  const allLowStockItems =
    lowStockQuery.data?.pages.flatMap((p) => p.data.items) ?? [];

  return (
    <div className="space-y-8 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Revenue, cash position, inventory risk, and customer exposure at a
          glance.
        </p>
      </div>

      {/* ── Metric Cards ─────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Today's Revenue → /transactions */}
        <Card
          className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30"
          onClick={() => router.push("/transactions")}
        >
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardDescription>Today&apos;s revenue</CardDescription>
              <CardTitle className="text-2xl">
                {formatMoney(payload.metrics.todayRevenue)}
              </CardTitle>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              {payload.metrics.todayRevenue >= 0 ? (
                <TrendingUp className="size-5" />
              ) : (
                <TrendingDown className="size-5" />
              )}
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Sales {metricsDayHint}</span>
            <ChevronRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>

        {/* Pending Payments → /credit */}
        <Card
          className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30"
          onClick={() => router.push("/credit")}
        >
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardDescription>Pending payments</CardDescription>
              <CardTitle className="text-2xl">
                {formatMoney(payload.metrics.pendingPayments)}
              </CardTitle>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <Clock className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Unpaid bills {metricsDayHint}</span>
            <ChevronRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>

        {/* Cash collection */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardDescription>Cash collection</CardDescription>
              <CardTitle className="text-2xl">
                {formatMoney(payload.metrics.cashCollection)}
              </CardTitle>
            </div>
            <div className="rounded-lg bg-blue-500/10 p-2 text-gray-600 dark:text-gray-400">
              <IndianRupee className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Cash received {metricsDayHint} (bills + receipts)
          </CardContent>
        </Card>

        {/* Low Stock SKUs → Modal */}
        <Card
          className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30"
          onClick={() => setLowStockOpen(true)}
        >
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardDescription>Low stock SKUs</CardDescription>
              <CardTitle className="text-2xl">
                {payload.metrics.lowStockItems.length}
              </CardTitle>
            </div>
            <div className="rounded-lg bg-red-500/10 p-2 text-red-600 dark:text-red-400">
              <Package className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Items below threshold</span>
            <ChevronRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row ──────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Daily revenue</CardTitle>
              <CardDescription>Last 7 days — navigate by week</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setWeekOffset((w) => w - 1)}
                aria-label="Previous week"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <Badge variant="secondary" className="max-w-40 truncate">
                {revenueRangeLabel || `Offset ${weekOffset}`}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setWeekOffset((w) => w + 1)}
                aria-label="Next week"
              >
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart data={payload.revenueWeek.days}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v) => formatMoney(Number(v))}
                  contentStyle={{ borderRadius: 8 }}
                  itemStyle={{
                    color: "black",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex max-h-[28rem] flex-col overflow-hidden">
          <CardHeader className="shrink-0 space-y-3">
            <CardTitle>Category mix</CardTitle>
            <CardDescription>Top-level category revenue share</CardDescription>
            <Tabs
              value={pieRange}
              onValueChange={(v) =>
                setPieRange(v as "today" | "week" | "month" | "all")
              }
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
            <div className="h-44 shrink-0 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  {/* SVG gradients for category colors */}
                  <defs>
                    {pieData
                      .filter((d) => isGradient(d.color))
                      .map((d) => {
                        const g = parseLinearGradient(d.color as string);
                        const id = gradientId(String(d.id));
                        return (
                          <linearGradient
                            key={id}
                            id={id}
                            gradientUnits="userSpaceOnUse"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <stop offset="0%" stopColor={g.start} />
                            <stop offset="100%" stopColor={g.end} />
                          </linearGradient>
                        );
                      })}
                  </defs>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell
                        key={entry.id}
                        fill={
                          entry.color
                            ? isGradient(entry.color)
                              ? `url(#${gradientId(String(entry.id))})`
                              : entry.color
                            : COLORS[i % COLORS.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatMoney(Number(v))}
                    contentStyle={{ borderRadius: 8 }}
                    itemStyle={{
                      color: "black",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {pieData.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No sales in this period. Try &quot;All&quot; for imported
                  history.
                </p>
              ) : (
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {pieData.map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            background: r.color
                              ? isGradient(r.color)
                                ? COLORS[i % COLORS.length]
                                : r.color
                              : COLORS[i % COLORS.length],
                          }}
                        />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{r.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Customer Traffic ────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Active time</CardTitle>
            <CardDescription>
              When bills and cash receipts happen during the day (all imported
              history).
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72 min-w-0">
            {trafficData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No billing activity recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Activity",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11, fill: "var(--muted-foreground)" },
                    }}
                  />
                  <Tooltip
                    formatter={(v) => [`${Number(v)} entries`, "Count"]}
                    labelFormatter={(label) => `Time: ${label}`}
                    contentStyle={{ borderRadius: 8 }}
                    itemStyle={{
                      color: "black",
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Activity">
                    {trafficData.map((entry, index) => (
                      <Cell
                        key={`c-${index}`}
                        fill={
                          entry.isPeak
                            ? "hsl(var(--primary))"
                            : "hsl(var(--muted-foreground) / 0.45)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Peak active time</CardTitle>
            <CardDescription>Busiest hour from bills and receipts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {payload.traffic.peak.count > 0 ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <Clock className="size-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {formatHour(payload.traffic.peak.hour)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {payload.traffic.peak.count} entries at this hour
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Tip
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Consider having maximum staff around{" "}
                    <span className="font-medium text-foreground">
                      {formatHour(payload.traffic.peak.hour)}
                    </span>{" "}
                    to handle the rush efficiently.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No activity data yet. Create bills or record payments to see
                your busiest hour.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Cards ────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Low stock</CardTitle>
            <CardDescription>Items needing reorder attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {payload.metrics.lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No low-stock alerts.
              </p>
            ) : (
              <>
                {payload.metrics.lowStockItems.slice(0, 5).map((it) => (
                  <div
                    key={it._id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <Link
                      href={`/inventory/${it._id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {it.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {it.quantity} / threshold {it.lowStockThreshold}
                    </span>
                  </div>
                ))}
                {payload.metrics.lowStockItems.length > 5 && (
                  <Button
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => setLowStockOpen(true)}
                  >
                    View all {payload.metrics.lowStockItems.length} items
                    <ExternalLink className="ml-1.5 size-3" />
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Credit alerts</CardTitle>
            <CardDescription>
              Highest dues &amp; longest quiet payers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Highest dues
              </div>
              <div className="space-y-2">
                {(
                  payload.credit.highestDues as Array<{
                    _id: string;
                    name: string;
                    balance: number;
                  }>
                )
                  .slice(0, 5)
                  .map((p) => (
                    <div
                      key={p._id}
                      className="flex items-center justify-between text-sm"
                    >
                      <Link
                        href={`/parties/${p._id}`}
                        className="truncate underline-offset-4 hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span>{formatMoney(p.balance)}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <AlertTriangle className="size-3" />
                Oldest last payment
              </div>
              <div className="space-y-2">
                {(
                  payload.credit.longestSincePayment as Array<{
                    _id: string;
                    name: string;
                    balance: number;
                    lastPaymentAt?: string | null;
                  }>
                )
                  .slice(0, 5)
                  .map((p) => (
                    <div
                      key={p._id}
                      className="flex items-center justify-between text-sm"
                    >
                      <Link
                        href={`/parties/${p._id}`}
                        className="truncate underline-offset-4 hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="text-muted-foreground">
                        {p.lastPaymentAt
                          ? new Date(p.lastPaymentAt).toLocaleDateString()
                          : "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Low Stock Modal ─────────────────────────── */}
      <Dialog open={lowStockOpen} onOpenChange={setLowStockOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Low stock items</DialogTitle>
            <DialogDescription>
              Items at or below their reorder threshold
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto min-h-0 -mx-4 px-4">
            {lowStockQuery.isLoading ? (
              <div className="space-y-2 py-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : allLowStockItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No low-stock items found.
              </p>
            ) : (
              <div className="space-y-1.5 py-2">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">
                  <span>Item</span>
                  <span className="text-right">Stock</span>
                  <span className="text-right">Threshold</span>
                </div>

                {allLowStockItems.map((item) => {
                  const stockPct =
                    item.lowStockThreshold > 0
                      ? Math.round(
                          (item.quantity / item.lowStockThreshold) * 100,
                        )
                      : 0;
                  const isOutOfStock = item.quantity <= 0;

                  return (
                    <Link
                      key={item._id}
                      href={`/inventory/${item._id}`}
                      onClick={() => setLowStockOpen(false)}
                      className="grid grid-cols-[1fr_80px_80px] gap-2 items-center rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-medium">
                          {item.name}
                        </span>
                        {isOutOfStock && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-1.5 py-0 shrink-0"
                          >
                            OUT
                          </Badge>
                        )}
                      </div>
                      <span
                        className={`text-right font-mono text-xs ${isOutOfStock ? "text-red-500 font-semibold" : "text-muted-foreground"}`}
                      >
                        {item.quantity}
                      </span>
                      <span className="text-right font-mono text-xs text-muted-foreground">
                        {item.lowStockThreshold}
                      </span>
                    </Link>
                  );
                })}

                {/* Lazy loading sentinel */}
                <div ref={sentinelRef} className="h-1" />

                {lowStockQuery.isFetchingNextPage && (
                  <div className="flex items-center justify-center py-3 gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading more…
                  </div>
                )}

                {!lowStockQuery.hasNextPage && allLowStockItems.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground py-2">
                    All {allLowStockItems.length} items loaded
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
