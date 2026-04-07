import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { Item } from "@/models/Item";
import Fuse from "fuse.js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const items = await Item.find({}).sort({ name: 1 }).limit(5000).lean();
    if (!q) return jsonOk(items.slice(0, 30));

    const fuse = new Fuse(items, {
      keys: ["name"],
      threshold: 0.35,
      ignoreLocation: true,
    });
    const hits = fuse.search(q).slice(0, 25).map((h) => h.item);
    return jsonOk(hits);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
