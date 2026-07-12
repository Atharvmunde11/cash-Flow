import { connectDb, db } from "@/lib/db";
import { calendarNoon } from "@/lib/employee-dates";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId } from "@/lib/id-compat";
import { employeeUpdateSchema } from "@/lib/validations";

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

    const openAdvances = await db.employeeAdvance.aggregate({
      where: { employeeId: id, status: "open" },
      _sum: { amount: true },
    });
    const openSum = openAdvances._sum.amount ?? 0;

    return jsonOk(
      withMongoId({
        ...employee,
        openAdvances: openSum,
        netPayableHint: Math.max(0, employee.monthlySalary - openSum),
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
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
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) return jsonError("Employee not found", 404);

    const body = await req.json();
    const parsed = employeeUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const data = parsed.data;
    const row = await db.employee.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.joinDate !== undefined
          ? { joinDate: calendarNoon(data.joinDate) }
          : {}),
        ...(data.monthlySalary !== undefined
          ? { monthlySalary: data.monthlySalary }
          : {}),
        ...(data.payDay !== undefined ? { payDay: data.payDay } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
    return jsonOk(withMongoId(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    return jsonError(msg, 500);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) return jsonError("Employee not found", 404);
    await db.employee.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    return jsonError(msg, 500);
  }
}
