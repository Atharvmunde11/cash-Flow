import { connectDb, db } from "@/lib/db";
import { calendarNoon } from "@/lib/employee-dates";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import { employeePayrollSchema, idString } from "@/lib/validations";

export const runtime = "nodejs";

/** List salary settlements across employees. */
export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId")?.trim();

    const rows = await db.employeePayroll.findMany({
      where: employeeId ? { employeeId } : undefined,
      include: {
        employee: { select: { id: true, name: true, role: true } },
        advances: {
          select: { id: true, amount: true, date: true, notes: true },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 300,
    });

    return jsonOk(
      withMongoIds(
        rows.map((r) => ({
          ...r,
          employeeName: r.employee.name,
          employeeRole: r.employee.role,
        })),
      ),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load payrolls";
    return jsonError(msg, 500);
  }
}

const paySchema = employeePayrollSchema.extend({
  employeeId: idString,
});

/** Pay salary for one employee (deducts open on-demand advances). */
export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = paySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const employee = await db.employee.findUnique({
      where: { id: parsed.data.employeeId },
    });
    if (!employee) return jsonError("Employee not found", 404);

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
      where: { employeeId: employee.id, status: "open" },
      orderBy: { date: "asc" },
    });
    const advancesDeducted = openAdvances.reduce((s, a) => s + a.amount, 0);
    const netPaid = Math.max(0, gross - advancesDeducted);
    const paidAt = calendarNoon(parsed.data.paidAt ?? new Date());

    const payroll = await db.$transaction(async (tx) => {
      const created = await tx.employeePayroll.create({
        data: {
          employeeId: employee.id,
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

    const full = await db.employeePayroll.findUnique({
      where: { id: payroll.id },
      include: {
        employee: { select: { id: true, name: true, role: true } },
        advances: {
          select: { id: true, amount: true, date: true, notes: true },
        },
      },
    });

    return jsonOk(
      withMongoIds([
        {
          ...full!,
          employeeName: full!.employee.name,
          employeeRole: full!.employee.role,
        },
      ])[0],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record salary";
    return jsonError(msg, 500);
  }
}
