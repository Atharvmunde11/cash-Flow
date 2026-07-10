import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId } from "@/lib/id-compat";
import { z } from "zod";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: z.string().max(200).optional().nullable(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const row = await db.category.findUnique({ where: { id } });
    if (!row) return jsonError("Not found", 404);

    const data: { name?: string; color?: string | null } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if ("color" in parsed.data) data.color = parsed.data.color ?? null;

    const updated = await db.category.update({ where: { id }, data });
    return jsonOk(withMongoId(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const [children, items] = await Promise.all([
      db.category.count({ where: { parentId: id } }),
      db.item.count({ where: { categoryId: id } }),
    ]);
    if (children > 0) return jsonError("Remove child categories first", 400);
    if (items > 0) return jsonError("Reassign or delete items in this category", 400);
    const existing = await db.category.findUnique({ where: { id } });
    if (!existing) return jsonError("Not found", 404);
    await db.category.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
