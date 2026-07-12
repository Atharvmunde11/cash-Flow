import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";

export const runtime = "nodejs";

/** List on-demand advances across employees (optional status filter). */
export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const employeeId = searchParams.get("employeeId")?.trim();

    const rows = await db.employeeAdvance.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: {
        employee: { select: { id: true, name: true, role: true } },
      },
      orderBy: { date: "desc" },
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
    const msg = e instanceof Error ? e.message : "Failed to load advances";
    return jsonError(msg, 500);
  }
}
