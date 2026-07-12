import { connectDb, db } from "@/lib/db";
import { calendarNoon } from "@/lib/employee-dates";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import { employeeCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const activeOnly = searchParams.get("active") === "1";

    const employees = await db.employee.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { phone: { contains: q } },
                { role: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    const openAdvances = await db.employeeAdvance.groupBy({
      by: ["employeeId"],
      where: { status: "open" },
      _sum: { amount: true },
    });
    const advanceByEmployee = new Map(
      openAdvances.map((row) => [row.employeeId, row._sum.amount ?? 0]),
    );

    const rows = employees.map((e) => ({
      ...e,
      openAdvances: advanceByEmployee.get(e.id) ?? 0,
      netPayableHint: Math.max(
        0,
        e.monthlySalary - (advanceByEmployee.get(e.id) ?? 0),
      ),
    }));

    return jsonOk(withMongoIds(rows));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load employees";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = employeeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const data = parsed.data;
    const name = data.name.trim();
    const dup = await db.employee.findFirst({
      where: { name, phone: data.phone ?? "" },
    });
    if (dup) {
      return jsonError("An employee with this name and phone already exists", 409);
    }

    const row = await db.employee.create({
      data: {
        name,
        phone: data.phone ?? "",
        role: data.role ?? "",
        address: data.address ?? "",
        joinDate: data.joinDate ? calendarNoon(data.joinDate) : calendarNoon(new Date()),
        monthlySalary: data.monthlySalary ?? 0,
        payDay: data.payDay ?? 1,
        isActive: data.isActive ?? true,
        notes: data.notes ?? "",
      },
    });
    return jsonOk(withMongoId({ ...row, openAdvances: 0, netPayableHint: row.monthlySalary }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create employee";
    return jsonError(msg, 500);
  }
}
