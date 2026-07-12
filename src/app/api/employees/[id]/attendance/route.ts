import { connectDb, db } from "@/lib/db";
import { calendarNoon } from "@/lib/employee-dates";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import { employeeAttendanceSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) return jsonError("Employee not found", 404);

    const { searchParams } = new URL(req.url);
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const from = fromRaw ? calendarNoon(new Date(fromRaw)) : undefined;
    const to = toRaw ? calendarNoon(new Date(toRaw)) : undefined;

    const rows = await db.employeeAttendance.findMany({
      where: {
        employeeId: id,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "desc" },
      take: 200,
    });
    return jsonOk(withMongoIds(rows));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

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
    const parsed = employeeAttendanceSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const date = calendarNoon(parsed.data.date);
    const row = await db.employeeAttendance.upsert({
      where: {
        employeeId_date: { employeeId: id, date },
      },
      create: {
        employeeId: id,
        date,
        status: parsed.data.status,
        notes: parsed.data.notes ?? "",
      },
      update: {
        status: parsed.data.status,
        notes: parsed.data.notes ?? "",
      },
    });
    return jsonOk(withMongoIds([row])[0]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save attendance";
    return jsonError(msg, 500);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const attendanceId = searchParams.get("attendanceId");
    if (!attendanceId) return jsonError("attendanceId required", 422);

    const existing = await db.employeeAttendance.findFirst({
      where: { id: attendanceId, employeeId: id },
    });
    if (!existing) return jsonError("Attendance not found", 404);
    await db.employeeAttendance.delete({ where: { id: attendanceId } });
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    return jsonError(msg, 500);
  }
}
