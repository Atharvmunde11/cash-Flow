import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId } from "@/lib/id-compat";
import { itemUpdateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = itemUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const item = await db.item.findUnique({ where: { id } });
    if (!item) return jsonError("Not found", 404);
    if (parsed.data.name !== undefined) {
      const name = parsed.data.name.trim();
      const dup = await db.item.findFirst({
        where: {
          id: { not: id },
          name,
        },
      });
      if (dup) return jsonError("An item with this name already exists", 409);
      const updated = await db.item.update({
        where: { id },
        data: { name },
      });
      return jsonOk(withMongoId(updated));
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.categoryId !== undefined) data.categoryId = parsed.data.categoryId;
    if (parsed.data.price !== undefined) data.price = parsed.data.price;
    if ("purchasePrice" in parsed.data && parsed.data.purchasePrice !== undefined) {
      data.purchasePrice = parsed.data.purchasePrice;
    }
    if (parsed.data.quantity !== undefined) data.quantity = parsed.data.quantity;
    if (parsed.data.lowStockThreshold !== undefined) {
      data.lowStockThreshold = parsed.data.lowStockThreshold;
    }
    if (parsed.data.unit !== undefined) data.unit = parsed.data.unit;

    const updated = await db.item.update({
      where: { id },
      data,
    });
    return jsonOk(withMongoId(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
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
    const existing = await db.item.findUnique({ where: { id } });
    if (!existing) return jsonError("Not found", 404);
    await db.item.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
