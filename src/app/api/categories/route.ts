import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { categoryCreateSchema } from "@/lib/validations";
import { Category } from "@/models/Category";
import { resolveAncestorIds } from "@/lib/services/category-service";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectDb();
    const rows = await Category.find({}).sort({ name: 1 }).lean();
    return jsonOk(rows);
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
      parsed.data.parentId && parsed.data.parentId !== ""
        ? new mongoose.Types.ObjectId(parsed.data.parentId)
        : null;
    if (parentId) {
      const p = await Category.findById(parentId).lean();
      if (!p) return jsonError("Parent category not found", 400);
    }
    const ancestorIds = parentId ? await resolveAncestorIds(parentId) : [];
    const row = await Category.create({
      name: parsed.data.name.trim(),
      parentId,
      ancestorIds,
      color: parsed.data.color ?? null,
    });
    return jsonOk(row.toObject());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
