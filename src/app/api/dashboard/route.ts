import { connectDb } from "@/lib/db";
import { formatRouteError, jsonError, jsonOk } from "@/lib/http";
import {
  getCategoryRevenuePie,
  getCreditAlerts,
  getDailyRevenueSeries,
  getDashboardMetrics,
  getHourlyTraffic,
  getLatestSaleBillDate,
  type PieRange,
} from "@/lib/services/dashboard-service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const weekOffset = Number(searchParams.get("weekOffset") ?? "0") || 0;
    const pieRange = (searchParams.get("pieRange") ?? "all") as PieRange;
    const safePie: PieRange =
      pieRange === "today" ||
      pieRange === "week" ||
      pieRange === "month" ||
      pieRange === "all"
        ? pieRange
        : "all";

    const [
      metrics,
      revenueWeek,
      categoryPie,
      traffic,
      credit,
      latestSaleBillDate,
    ] = await Promise.all([
      getDashboardMetrics(),
      getDailyRevenueSeries(weekOffset),
      getCategoryRevenuePie(safePie),
      getHourlyTraffic(),
      getCreditAlerts(),
      getLatestSaleBillDate(),
    ]);

    return jsonOk({
      metrics,
      revenueWeek,
      categoryPie,
      traffic,
      credit,
      latestSaleBillDate: latestSaleBillDate?.toISOString() ?? null,
    });
  } catch (e) {
    const msg = formatRouteError(e);
    console.error("[api/dashboard]", e);
    return jsonError(msg, 500);
  }
}
