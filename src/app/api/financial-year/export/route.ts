import { jsonError, jsonOk } from "@/lib/http";
import { db } from "@/lib/db";
import { getFinancialYearConfig, getFyRange } from "@/lib/financial-year";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fyLabel = searchParams.get("fy");
    
    if (!fyLabel) {
      return jsonError("Missing fy parameter", 400);
    }
    
    const config = await getFinancialYearConfig();
    
    // We need to find the start and end dates for the provided fyLabel
    // A bit hacky: we can parse the label (e.g. "2025-26") to get the start year
    const startYearStr = fyLabel.split("-")[0];
    const startYear = parseInt(startYearStr, 10);
    
    if (isNaN(startYear)) {
      return jsonError("Invalid fy format. Expected YYYY-YY", 400);
    }
    
    const start = new Date(startYear, config.startMonth - 1, config.startDay);
    const range = getFyRange(start, config);
    
    if (range.label !== fyLabel) {
      return jsonError(`Could not resolve FY range for ${fyLabel}`, 400);
    }
    
    // Fetch all relevant data within this date range
    const bills = await db.bill.findMany({
      where: { billDate: { gte: range.start, lte: range.end } },
      include: { lines: true, sundryCharges: true, stockWarnings: true }
    });
    
    const payments = await db.payment.findMany({
      where: { date: { gte: range.start, lte: range.end } }
    });
    
    const vouchers = await db.voucher.findMany({
      where: { voucherDate: { gte: range.start, lte: range.end } },
      include: { itemLines: true, accountLines: true }
    });
    
    const ledgerTransactions = await db.ledgerTransaction.findMany({
      where: { date: { gte: range.start, lte: range.end } }
    });
    
    const daybooks = await db.daybook.findMany({
      where: { date: { gte: range.start, lte: range.end } }
    });
    
    const expenses = await db.daybookExpense.findMany({
      where: { date: { gte: range.start, lte: range.end } }
    });

    const exportData = {
      financialYear: range.label,
      dateRange: { start: range.start, end: range.end },
      data: {
        bills,
        payments,
        vouchers,
        ledgerTransactions,
        daybooks,
        expenses
      }
    };
    
    // Return as downloadable JSON file
    return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="export-${range.label}.json"`
        }
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
