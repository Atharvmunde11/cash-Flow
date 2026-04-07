import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { escapeRegex } from "@/lib/string";
import { recordOpeningBalanceIfNeeded } from "@/lib/opening-ledger";
import { Party } from "@/models/Party";
import { partyCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const q = searchParams.get("q");
    const filter: Record<string, unknown> = {};
    if (type === "customer" || type === "supplier") filter.partyType = type;
    if (q && q.trim()) {
      filter.name = { $regex: new RegExp(escapeRegex(q.trim()), "i") };
    }
    const parties = await Party.find(filter).sort({ name: 1 }).lean();
    return jsonOk(parties);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load parties";
    return jsonError(msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = partyCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }
    const {
      name,
      phone,
      address,
      openingBalance,
      partyType,
      maxDaysWithoutPayment,
    } = parsed.data;
    const dup = await Party.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(name.trim())}$`, "i") },
      partyType,
    }).lean();
    if (dup) {
      return jsonError(
        "A party with this name already exists for this type",
        409,
      );
    }
    const p = await Party.create({
      name: name.trim(),
      phone: phone ?? "",
      address: address ?? "",
      openingBalance,
      // Opening balance is entered as advance (positive means party pre-paid)
      balance:
        partyType === "customer" || partyType === "supplier"
          ? -openingBalance
          : openingBalance,
      partyType,
      maxDaysWithoutPayment:
        partyType === "customer" && typeof maxDaysWithoutPayment === "number"
          ? maxDaysWithoutPayment
          : null,
    });
    await recordOpeningBalanceIfNeeded(p);
    return jsonOk(p.toObject());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create party";
    return jsonError(msg, 500);
  }
}
