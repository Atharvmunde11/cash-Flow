import mongoose from "mongoose";
import { Category } from "@/models/Category";

export async function resolveAncestorIds(
  parentId: mongoose.Types.ObjectId | null
): Promise<mongoose.Types.ObjectId[]> {
  if (!parentId) return [];
  const ancestors: mongoose.Types.ObjectId[] = [];
  let current: mongoose.Types.ObjectId | null = parentId;
  for (let i = 0; i < 64; i++) {
    const doc = await Category.findById(current).lean();
    if (!doc) break;
    ancestors.unshift(doc._id as mongoose.Types.ObjectId);
    current = doc.parentId as mongoose.Types.ObjectId | null;
    if (!current) break;
  }
  return ancestors;
}

type LeanCat = {
  _id: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId | null;
};

export function getRootCategoryIdFromMap(
  categoryId: mongoose.Types.ObjectId,
  byId: Map<string, LeanCat>
): mongoose.Types.ObjectId {
  let cur = categoryId;
  for (let i = 0; i < 64; i++) {
    const doc = byId.get(cur.toString());
    if (!doc) return categoryId;
    const p = doc.parentId;
    if (!p) return doc._id;
    cur = p;
  }
  return categoryId;
}

export async function getRootCategoryId(
  categoryId: mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId> {
  const doc = await Category.findById(categoryId).lean();
  if (!doc) throw new Error("Category not found");
  const ancestors = doc.ancestorIds as mongoose.Types.ObjectId[];
  if (ancestors.length > 0) return ancestors[0] as mongoose.Types.ObjectId;
  return doc._id as mongoose.Types.ObjectId;
}
