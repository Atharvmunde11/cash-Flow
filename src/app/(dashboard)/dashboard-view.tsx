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

async function fetchDashboard(weekOffset: number, pieRange: string) {
  const res = await fetch(
    `/api/dashboard?weekOffset=${weekOffset}&pieRange=${encodeURIComponent(pieRange)}`,
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to load dashboard");
  }
  return (await res.json()) as DashboardResponse;
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
  const [pieRange, setPieRange] = useState<"today" | "week" | "month">("week");
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
    // Filter to show only business hours (6AM–11PM) for clarity
    return payload.traffic.hours
      .filter((h) => h.hour >= 6 && h.hour <= 23)
      .map((h) => ({
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
            : "Check MongoDB connection and MONGODB_URI."}
        </AlertDescription>
      </Alert>
    );
  }

  if (!payload) return null;

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
            <span>Bills + receipts − expenses</span>
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
            <span>Today&apos;s unpaid bills</span>
            <ChevronRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>

        {/* Cash & UPI Position */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardDescription>Cash &amp; UPI position</CardDescription>
              <CardTitle className="text-2xl">
                {formatMoney(payload.metrics.cashInHand)}
              </CardTitle>
            </div>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <IndianRupee className="size-5" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Total bills net amount today
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
              <Badge variant="secondary">Offset {weekOffset}</Badge>
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
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
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

        <Card>
          <CardHeader>
            <CardTitle>Category mix</CardTitle>
            <CardDescription>Top-level category revenue share</CardDescription>
            <Tabs
              value={pieRange}
              onValueChange={(v) =>
                setPieRange(v as "today" | "week" | "month")
              }
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell
                      key={entry.id}
                      fill={entry.color || COLORS[i % COLORS.length]}
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
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {pieData.slice(0, 6).map((r) => (
                <div key={r.name} className="flex justify-between gap-2">
                  <span className="truncate">{r.name}</span>
                  <span>{r.pct}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Customer Traffic ────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Billing activity by hour</CardTitle>
            <CardDescription>
              Number of bills generated at each hour of the day (all-time
              average). The highlighted bar is your busiest hour.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trafficData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "Bills",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "var(--muted-foreground)" },
                  }}
                />
                <Tooltip
                  formatter={(v) => [`${Number(v)} bills`, "Count"]}
                  labelFormatter={(label) => `Time: ${label}`}
                  contentStyle={{ borderRadius: 8 }}
                  itemStyle={{
                    color: "black",
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Bills">
                  {trafficData.map((entry, index) => (
                    <Cell
                      key={`c-${index}`}
                      fill={
                        entry.isPeak
                          ? "var(--primary)"
                          : "color-mix(in oklch, var(--muted-foreground) 35%, transparent)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Peak hour summary</CardTitle>
            <CardDescription>
              Your busiest time based on total bills created
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3">
                <TrendingUp className="size-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatHour(payload.traffic.peak.hour)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {payload.traffic.peak.count} bills recorded at this hour
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                💡 Tip
              </p>
              <p className="text-sm text-muted-foreground">
                Consider having maximum staff &amp; counter availability around{" "}
                <span className="font-medium text-foreground">
                  {formatHour(payload.traffic.peak.hour)}
                </span>{" "}
                to handle the rush efficiently.
              </p>
            </div>
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
