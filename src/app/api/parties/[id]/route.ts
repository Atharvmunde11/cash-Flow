import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId } from "@/lib/id-compat";
import { partyUpdateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const party = await db.party.findUnique({ where: { id } });
    if (!party) return jsonError("Not found", 404);
    return jsonOk(withMongoId(party));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = partyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const party = await db.party.findUnique({ where: { id } });
    if (!party) return jsonError("Not found", 404);
    if (parsed.data.name !== undefined) {
      const trimmedName = parsed.data.name.trim();
      const dup = await db.party.findFirst({
        where: { id: { not: id }, name: trimmedName, partyType: party.partyType as any },
      });
      if (dup) {
        return jsonError("A party with this name already exists", 409);
      }
      const updated = await db.party.update({
        where: { id },
        data: { name: trimmedName },
      });
      return jsonOk(withMongoId(updated));
    }
    if (parsed.data.openingBalance !== undefined) {
      return jsonError(
        "Opening balance cannot be changed after creation (use adjustments)",
        400
      );
    }
    if (parsed.data.partyType !== undefined) {
      return jsonError("Party type cannot be changed", 400);
    }

    const data: any = {};
    if (parsed.data.phone !== undefined) data.phone = parsed.data.phone ?? "";
    if (parsed.data.address !== undefined) data.address = parsed.data.address ?? "";
    if (parsed.data.maxDaysWithoutPayment !== undefined) {
      if (party.partyType !== "customer") {
        data.maxDaysWithoutPayment = null;
      } else {
        const v = parsed.data.maxDaysWithoutPayment;
        data.maxDaysWithoutPayment = v === null || v === undefined ? null : v;
      }
    }

    const updated = await db.party.update({ where: { id }, data });
    return jsonOk(withMongoId(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const [txCount, billCount, paymentCount] = await Promise.all([
      db.ledgerTransaction.count({ where: { partyId: id } }),
      db.bill.count({ where: { partyId: id } }),
      db.payment.count({ where: { partyId: id } }),
    ]);
    if (txCount > 0 || billCount > 0 || paymentCount > 0) {
      return jsonError(
        "Cannot delete party with existing activity",
        400
      );
    }
    const existing = await db.party.findUnique({ where: { id } });
    if (!existing) return jsonError("Not found", 404);
    await db.party.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
