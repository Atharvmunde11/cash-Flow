import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId } from "@/lib/id-compat";
import { bankAccountCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const row = await db.bankAccount.findUnique({ where: { id } });
    if (!row) return jsonError("Not found", 404);
    return jsonOk(withMongoId(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = bankAccountCreateSchema.partial().safeParse(body);
    if (!parsed.success) return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    const row = await db.bankAccount.findUnique({ where: { id } });
    if (!row) return jsonError("Not found", 404);

    if (parsed.data.isPrimary) {
      await db.bankAccount.updateMany({
        where: { id: { not: id } },
        data: { isPrimary: false },
      });
    }

    const updated = await db.bankAccount.update({
      where: { id },
      data: parsed.data,
    });
    return jsonOk(withMongoId(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const existing = await db.bankAccount.findUnique({ where: { id } });
    if (!existing) return jsonError("Not found", 404);
    await db.bankAccount.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
