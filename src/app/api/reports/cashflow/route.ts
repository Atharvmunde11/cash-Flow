import { jsonError, jsonOk } from "@/lib/http";
import { getCashflow } from "@/lib/services/financial-reports";
import { getFinancialYearConfig, getFyRange } from "@/lib/financial-year";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fyLabel = searchParams.get("fy");
    
    const config = await getFinancialYearConfig();
    let start, end;
    
    if (fyLabel) {
      const startYear = parseInt(fyLabel.split("-")[0], 10);
      if (isNaN(startYear)) {
        return jsonError("Invalid fy format. Expected YYYY-YY", 400);
      }
      start = new Date(startYear, config.startMonth - 1, config.startDay);
      const range = getFyRange(start, config);
      if (range.label !== fyLabel) {
        return jsonError(`Could not resolve FY range for ${fyLabel}`, 400);
      }
      end = range.end;
    } else {
      const range = getFyRange(new Date(), config);
      start = range.start;
      end = range.end;
    }
    
    const report = await getCashflow(start, end);
    return jsonOk(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
