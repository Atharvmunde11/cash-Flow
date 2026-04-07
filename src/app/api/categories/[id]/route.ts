import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { Category } from "@/models/Category";
import { Item } from "@/models/Item";
import mongoose from "mongoose";
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
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const row = await Category.findById(id);
    if (!row) return jsonError("Not found", 404);
    if (parsed.data.name !== undefined) row.name = parsed.data.name.trim();
    if ("color" in parsed.data) (row as unknown as { color: string | null }).color = parsed.data.color ?? null;
    await row.save();
    return jsonOk(row.toObject());
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
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const [children, items] = await Promise.all([
      Category.countDocuments({ parentId: id }),
      Item.countDocuments({ categoryId: id }),
    ]);
    if (children > 0) return jsonError("Remove child categories first", 400);
    if (items > 0) return jsonError("Reassign or delete items in this category", 400);
    const res = await Category.findByIdAndDelete(id);
    if (!res) return jsonError("Not found", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
