import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { escapeRegex } from "@/lib/string";
import { Item } from "@/models/Item";
import { itemUpdateSchema } from "@/lib/validations";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return jsonError("Invalid id", 400);
    const body = await req.json();
    const parsed = itemUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const item = await Item.findById(id);
    if (!item) return jsonError("Not found", 404);
    if (parsed.data.name !== undefined) {
      const dup = await Item.findOne({
        _id: { $ne: item._id },
        name: {
          $regex: new RegExp(`^${escapeRegex(parsed.data.name.trim())}$`, "i"),
        },
      }).lean();
      if (dup) return jsonError("An item with this name already exists", 409);
      item.name = parsed.data.name.trim();
    }
    if (parsed.data.categoryId !== undefined)
      item.categoryId = parsed.data.categoryId;
    if (parsed.data.price !== undefined) item.price = parsed.data.price;
    if ("purchasePrice" in parsed.data && parsed.data.purchasePrice !== undefined) {
      (item as unknown as { purchasePrice: number }).purchasePrice = parsed.data.purchasePrice;
    }
    if (parsed.data.quantity !== undefined)
      item.quantity = parsed.data.quantity;
    if (parsed.data.lowStockThreshold !== undefined) {
      item.lowStockThreshold = parsed.data.lowStockThreshold;
    }
    if (parsed.data.unit !== undefined) item.unit = parsed.data.unit;
    await item.save();
    return jsonOk(item.toObject());
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
    if (!mongoose.Types.ObjectId.isValid(id))
      return jsonError("Invalid id", 400);
    const res = await Item.findByIdAndDelete(id);
    if (!res) return jsonError("Not found", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
