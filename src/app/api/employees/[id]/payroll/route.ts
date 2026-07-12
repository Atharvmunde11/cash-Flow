import { connectDb, db } from "@/lib/db";
import { calendarNoon } from "@/lib/employee-dates";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import { employeePayrollSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) return jsonError("Employee not found", 404);

    const rows = await db.employeePayroll.findMany({
      where: { employeeId: id },
      orderBy: { paidAt: "desc" },
      take: 100,
      include: {
        advances: {
          select: { id: true, amount: true, date: true, notes: true },
        },
      },
    });
    return jsonOk(withMongoIds(rows));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

/**
 * Pay salary for a period. Open on-demand advances are deducted from gross
 * and marked deducted against this payroll.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) return jsonError("Employee not found", 404);

    const body = await req.json();
    const parsed = employeePayrollSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const periodStart = calendarNoon(parsed.data.periodStart);
    const periodEnd = calendarNoon(parsed.data.periodEnd);
    if (periodEnd < periodStart) {
      return jsonError("periodEnd must be on or after periodStart", 422);
    }

    const gross =
      parsed.data.grossSalary !== undefined
        ? parsed.data.grossSalary
        : employee.monthlySalary;

    const openAdvances = await db.employeeAdvance.findMany({
      where: { employeeId: id, status: "open" },
      orderBy: { date: "asc" },
    });
    const advancesDeducted = openAdvances.reduce((s, a) => s + a.amount, 0);
    const netPaid = Math.max(0, gross - advancesDeducted);
    const paidAt = calendarNoon(parsed.data.paidAt ?? new Date());

    const payroll = await db.$transaction(async (tx) => {
      const created = await tx.employeePayroll.create({
        data: {
          employeeId: id,
          periodStart,
          periodEnd,
          grossSalary: gross,
          advancesDeducted,
          netPaid,
          paidAt,
          paymentMode: parsed.data.paymentMode ?? "cash",
          notes: parsed.data.notes ?? "",
        },
      });

      if (openAdvances.length > 0) {
        await tx.employeeAdvance.updateMany({
          where: { id: { in: openAdvances.map((a) => a.id) } },
          data: {
            status: "deducted",
            deductedInPayrollId: created.id,
          },
        });
      }

      return created;
    });

    // Cash salary outflow on daybook
    if (netPaid > 0) {
      try {
        await db.daybookExpense.create({
          data: {
            date: paidAt,
            reason: `Salary — ${employee.name} (${periodStart.toLocaleDateString()}–${periodEnd.toLocaleDateString()})`,
            amount: netPaid,
          },
        });
      } catch {
        // optional
      }
    }

    const withAdvances = await db.employeePayroll.findUnique({
      where: { id: payroll.id },
      include: {
        advances: {
          select: { id: true, amount: true, date: true, notes: true },
        },
      },
    });

    return jsonOk(withMongoIds([withAdvances!])[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record salary";
    return jsonError(msg, 500);
  }
}
