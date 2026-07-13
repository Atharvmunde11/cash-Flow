import { jsonError, jsonOk } from "@/lib/http";
import { getBalanceSheet } from "@/lib/services/financial-reports";
import { getFinancialYearConfig, getFyRange } from "@/lib/financial-year";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("asOfDate");
    const fyLabel = searchParams.get("fy");

    const config = await getFinancialYearConfig();
    let asOfDate = new Date();

    if (dateStr) {
      asOfDate = new Date(dateStr);
      if (isNaN(asOfDate.getTime())) {
        return jsonError("Invalid asOfDate format. Expected YYYY-MM-DD", 400);
      }
    } else if (fyLabel) {
      // UI passes fy=YYYY-YY — use end of that financial year as as-of date
      const startYear = parseInt(fyLabel.split("-")[0], 10);
      if (isNaN(startYear)) {
        return jsonError("Invalid fy format. Expected YYYY-YY", 400);
      }
      const start = new Date(startYear, config.startMonth - 1, config.startDay);
      const range = getFyRange(start, config);
      if (range.label !== fyLabel) {
        return jsonError(`Could not resolve FY range for ${fyLabel}`, 400);
      }
      const today = new Date();
      // If FY is current, as-of today; otherwise as-of FY end
      asOfDate = today >= range.start && today <= range.end ? today : range.end;
    }

    const report = await getBalanceSheet(asOfDate);
    return jsonOk(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
