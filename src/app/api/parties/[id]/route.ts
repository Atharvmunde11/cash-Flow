import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { escapeRegex } from "@/lib/string";
import { Bill } from "@/models/Bill";
import { Payment } from "@/models/Payment";
import { LedgerTransaction } from "@/models/Transaction";
import { Party } from "@/models/Party";
import { partyUpdateSchema } from "@/lib/validations";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const party = await Party.findById(id).lean();
    if (!party) return jsonError("Not found", 404);
    return jsonOk(party);
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
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const body = await req.json();
    const parsed = partyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const party = await Party.findById(id);
    if (!party) return jsonError("Not found", 404);
    if (parsed.data.name !== undefined) {
      const dup = await Party.findOne({
        _id: { $ne: party._id },
        name: {
          $regex: new RegExp(`^${escapeRegex(parsed.data.name.trim())}$`, "i"),
        },
        partyType: party.partyType,
      }).lean();
      if (dup) {
        return jsonError("A party with this name already exists", 409);
      }
      party.name = parsed.data.name.trim();
    }
    if (parsed.data.phone !== undefined) party.phone = parsed.data.phone;
    if (parsed.data.address !== undefined) party.address = parsed.data.address;
    if (parsed.data.openingBalance !== undefined) {
      return jsonError(
        "Opening balance cannot be changed after creation (use adjustments)",
        400
      );
    }
    if (parsed.data.partyType !== undefined) {
      return jsonError("Party type cannot be changed", 400);
    }
    if (parsed.data.maxDaysWithoutPayment !== undefined) {
      if (party.partyType !== "customer") {
        party.maxDaysWithoutPayment = null;
      } else {
        const v = parsed.data.maxDaysWithoutPayment;
        party.maxDaysWithoutPayment =
          v === null || v === undefined ? null : v;
      }
    }
    await party.save();
    return jsonOk(party.toObject());
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
    if (!mongoose.Types.ObjectId.isValid(id)) return jsonError("Invalid id", 400);
    const [txCount, billCount, paymentCount] = await Promise.all([
      LedgerTransaction.countDocuments({ partyId: id }),
      Bill.countDocuments({ partyId: id }),
      Payment.countDocuments({ partyId: id }),
    ]);
    if (txCount > 0 || billCount > 0 || paymentCount > 0) {
      return jsonError(
        "Cannot delete party with existing activity",
        400
      );
    }
    const res = await Party.findByIdAndDelete(id);
    if (!res) return jsonError("Not found", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
