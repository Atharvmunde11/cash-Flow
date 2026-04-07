import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import {
  getCategoryRevenuePie,
  getCreditAlerts,
  getDailyRevenueSeries,
  getDashboardMetrics,
  getHourlyTraffic,
  type PieRange,
} from "@/lib/services/dashboard-service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const weekOffset = Number(searchParams.get("weekOffset") ?? "0") || 0;
    const pieRange = (searchParams.get("pieRange") ?? "week") as PieRange;
    const safePie: PieRange =
      pieRange === "today" || pieRange === "month" ? pieRange : "week";

    const [
      metrics,
      revenueWeek,
      categoryPie,
      traffic,
      credit,
    ] = await Promise.all([
      getDashboardMetrics(),
      getDailyRevenueSeries(weekOffset),
      getCategoryRevenuePie(safePie),
      getHourlyTraffic(),
      getCreditAlerts(),
    ]);

    return jsonOk({
      metrics,
      revenueWeek,
      categoryPie,
      traffic,
      credit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
