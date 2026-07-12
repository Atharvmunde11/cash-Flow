import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import {
  isForbiddenSundryName,
  isPresetSundry,
} from "@/lib/sundry-types";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function GET() {
  try {
    await connectDb();
    const rows = await db.sundryType.findMany({
      orderBy: [{ name: "asc" }],
    });
    return jsonOk(withMongoIds(rows));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load sundries";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const name = parsed.data.name.trim();
    if (isForbiddenSundryName(name)) {
      return jsonError(
        "That name is not allowed. Use a specific label (not walk-in / type-in).",
        400,
      );
    }
    if (isPresetSundry(name)) {
      return jsonError("That label is already a built-in preset", 409);
    }

    const existing = await db.sundryType.findFirst({
      where: { name: { equals: name } },
    });
    if (existing) return jsonError("That sundry already exists", 409);

    const created = await db.sundryType.create({ data: { name } });
    return jsonOk(withMongoId(created), 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create sundry";
    return jsonError(msg, 500);
  }
}

export async function DELETE(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return jsonError("id is required", 400);

    await db.sundryType.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete sundry";
    return jsonError(msg, 500);
  }
}
