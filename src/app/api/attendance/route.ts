import { connectDb, db } from "@/lib/db";
import { calendarNoon } from "@/lib/employee-dates";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import { employeeAttendanceSchema, idString } from "@/lib/validations";
import { z } from "zod";

export const runtime = "nodejs";

const bulkSchema = employeeAttendanceSchema.extend({
  employeeId: idString,
});

/** List attendance across employees (optional date / from–to filters). */
export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const dateRaw = searchParams.get("date");
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");

    let dateFilter: { gte?: Date; lte?: Date; equals?: Date } | undefined;
    if (dateRaw) {
      dateFilter = { equals: calendarNoon(new Date(dateRaw)) };
    } else if (fromRaw || toRaw) {
      dateFilter = {
        ...(fromRaw ? { gte: calendarNoon(new Date(fromRaw)) } : {}),
        ...(toRaw ? { lte: calendarNoon(new Date(toRaw)) } : {}),
      };
    }

    const rows = await db.employeeAttendance.findMany({
      where: dateFilter ? { date: dateFilter } : undefined,
      include: {
        employee: { select: { id: true, name: true, role: true, isActive: true } },
      },
      orderBy: [{ date: "desc" }, { employee: { name: "asc" } }],
      take: 500,
    });

    return jsonOk(
      withMongoIds(
        rows.map((r) => ({
          ...r,
          employeeId: r.employeeId,
          employeeName: r.employee.name,
          employeeRole: r.employee.role,
        })),
      ),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load attendance";
    return jsonError(msg, 500);
  }
}

/** Upsert one attendance row (employeeId in body). */
export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const employee = await db.employee.findUnique({
      where: { id: parsed.data.employeeId },
    });
    if (!employee) return jsonError("Employee not found", 404);

    const date = calendarNoon(parsed.data.date);
    const row = await db.employeeAttendance.upsert({
      where: {
        employeeId_date: {
          employeeId: parsed.data.employeeId,
          date,
        },
      },
      create: {
        employeeId: parsed.data.employeeId,
        date,
        status: parsed.data.status,
        notes: parsed.data.notes ?? "",
      },
      update: {
        status: parsed.data.status,
        notes: parsed.data.notes ?? "",
      },
      include: {
        employee: { select: { id: true, name: true, role: true } },
      },
    });

    return jsonOk(
      withMongoIds([
        {
          ...row,
          employeeName: row.employee.name,
          employeeRole: row.employee.role,
        },
      ])[0],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save attendance";
    return jsonError(msg, 500);
  }
}

const bulkMarkSchema = z.object({
  date: z.coerce.date(),
  status: z.enum(["present", "absent", "half_day", "leave"]),
  employeeIds: z.array(idString).min(1),
  notes: z.string().max(500).optional().default(""),
});

/** Mark many employees for one day. */
export async function PUT(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = bulkMarkSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const date = calendarNoon(parsed.data.date);
    let saved = 0;
    for (const employeeId of parsed.data.employeeIds) {
      await db.employeeAttendance.upsert({
        where: { employeeId_date: { employeeId, date } },
        create: {
          employeeId,
          date,
          status: parsed.data.status,
          notes: parsed.data.notes ?? "",
        },
        update: {
          status: parsed.data.status,
          notes: parsed.data.notes ?? "",
        },
      });
      saved++;
    }
    return jsonOk({ saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to bulk mark";
    return jsonError(msg, 500);
  }
}
