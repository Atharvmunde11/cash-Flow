import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));
    const skip = (page - 1) * limit;

    const [items, totalRows] = await Promise.all([
      db.$queryRaw<
        Array<{
          id: string;
          name: string;
          categoryId: string;
          price: number;
          purchasePrice: number;
          quantity: number;
          lowStockThreshold: number;
          unit: string;
          createdAt: string;
          updatedAt: string;
        }>
      >(Prisma.sql`
        SELECT *
        FROM Item
        WHERE quantity <= lowStockThreshold
        ORDER BY quantity ASC
        LIMIT ${limit} OFFSET ${skip}
      `),
      db.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT COUNT(*) as total
        FROM Item
        WHERE quantity <= lowStockThreshold
      `),
    ]);
    const total = Number(totalRows?.[0]?.total ?? 0);

    return jsonOk({
      items: withMongoIds(items),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
