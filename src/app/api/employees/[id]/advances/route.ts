import { connectDb, db } from "@/lib/db";
import { calendarNoon } from "@/lib/employee-dates";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import { employeeAdvanceSchema } from "@/lib/validations";

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

    const rows = await db.employeeAdvance.findMany({
      where: { employeeId: id },
      orderBy: { date: "desc" },
      take: 200,
    });
    return jsonOk(withMongoIds(rows));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

/** Record on-demand / advance pay (deducted from next salary). */
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
    const parsed = employeeAdvanceSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const date = calendarNoon(parsed.data.date);
    const row = await db.employeeAdvance.create({
      data: {
        employeeId: id,
        amount: parsed.data.amount,
        date,
        notes: parsed.data.notes ?? "",
        status: "open",
      },
    });

    // Track cash leave as daybook expense for the day
    try {
      await db.daybookExpense.create({
        data: {
          date,
          reason: `Employee advance — ${employee.name}${
            parsed.data.notes ? `: ${parsed.data.notes}` : ""
          }`,
          amount: parsed.data.amount,
        },
      });
    } catch {
      // daybook optional
    }

    return jsonOk(withMongoIds([row])[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record advance";
    return jsonError(msg, 500);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const advanceId = typeof body.id === "string" ? body.id : "";
    if (!advanceId) return jsonError("Advance id required", 422);

    const existing = await db.employeeAdvance.findFirst({
      where: { id: advanceId, employeeId: id },
    });
    if (!existing) return jsonError("Advance not found", 404);
    if (existing.status !== "open") {
      return jsonError("Only open advances can be voided", 422);
    }

    const row = await db.employeeAdvance.update({
      where: { id: advanceId },
      data: { status: "void" },
    });
    return jsonOk(withMongoIds([row])[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
