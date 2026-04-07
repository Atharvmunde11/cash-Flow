import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { escapeRegex } from "@/lib/string";
import { Item } from "@/models/Item";
import { itemCreateSchema } from "@/lib/validations";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const q = searchParams.get("q");
    const filter: Record<string, unknown> = {};
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      filter.categoryId = categoryId;
    }
    if (q && q.trim()) {
      filter.name = { $regex: new RegExp(escapeRegex(q.trim()), "i") };
    }
    const items = await Item.find(filter).sort({ name: 1 }).lean();
    return jsonOk(items);
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
    const dup = await Item.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(parsed.data.name.trim())}$`, "i") },
    }).lean();
    if (dup) {
      return jsonError("An item with this name already exists", 409);
    }
    const item = await Item.create(parsed.data);
    return jsonOk(item.toObject());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
