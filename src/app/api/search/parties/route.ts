import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { Party } from "@/models/Party";
import Fuse from "fuse.js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const type = searchParams.get("type");
    const filter: Record<string, unknown> = {};
    if (type === "customer" || type === "supplier") filter.partyType = type;

    const parties = await Party.find(filter).sort({ name: 1 }).limit(2000).lean();
    if (!q) return jsonOk(parties.slice(0, 30));

    const fuse = new Fuse(parties, {
      keys: ["name", "phone"],
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
