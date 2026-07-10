import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import { itemCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const q = searchParams.get("q");
    const where: {
      categoryId?: string;
      name?: { contains: string };
    } = {};

    if (categoryId && categoryId.trim()) where.categoryId = categoryId.trim();
    if (q && q.trim()) where.name = { contains: q.trim() };

    const items = await db.item.findMany({ where, orderBy: { name: "asc" } });
    return jsonOk(withMongoIds(items));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = itemCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const name = parsed.data.name.trim();
    const dup = await db.item.findFirst({ where: { name } });
    if (dup) {
      return jsonError("An item with this name already exists", 409);
    }
    const item = await db.item.create({
      data: {
        ...parsed.data,
        name,
      },
    });
    return jsonOk(withMongoId(item));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
