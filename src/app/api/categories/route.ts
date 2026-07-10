import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import { categoryCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectDb();
    const rows = await db.category.findMany({ orderBy: { name: "asc" } });
    return jsonOk(withMongoIds(rows));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = categoryCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const parentId =
      parsed.data.parentId && parsed.data.parentId.trim() !== ""
        ? parsed.data.parentId.trim()
        : null;

    let ancestorIds: string[] = [];
    if (parentId) {
      const parent = await db.category.findUnique({ where: { id: parentId } });
      if (!parent) return jsonError("Parent category not found", 400);
      const fromParent = Array.isArray(parent.ancestorIds)
        ? (parent.ancestorIds as unknown as string[])
        : [];
      ancestorIds = [...fromParent, parentId];
    }

    const row = await db.category.create({
      data: {
        name: parsed.data.name.trim(),
        parentId,
        ancestorIds,
        color: parsed.data.color ?? null,
      },
    });
    return jsonOk(withMongoId(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
