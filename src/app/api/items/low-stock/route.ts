import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { Item } from "@/models/Item";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));
    const skip = (page - 1) * limit;

    const filter = { $expr: { $lte: ["$quantity", "$lowStockThreshold"] } };

    const [items, total] = await Promise.all([
      Item.find(filter)
        .sort({ quantity: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Item.countDocuments(filter),
    ]);

    return jsonOk({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
