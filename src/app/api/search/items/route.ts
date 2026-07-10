import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoIds } from "@/lib/id-compat";
import Fuse from "fuse.js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const items = await db.item.findMany({ orderBy: { name: "asc" }, take: 5000 });
    const docs = withMongoIds(items);
    if (!q) return jsonOk(docs.slice(0, 30));

    const fuse = new Fuse(docs, {
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
