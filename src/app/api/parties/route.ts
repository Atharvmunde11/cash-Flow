import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import { recordOpeningBalanceIfNeeded } from "@/lib/opening-ledger";
import { partyCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const q = searchParams.get("q");
    const where: { partyType?: "customer" | "supplier"; name?: { contains: string } } = {};
    if (type === "customer" || type === "supplier") where.partyType = type;
    if (q && q.trim()) where.name = { contains: q.trim() };

    const parties = await db.party.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return jsonOk(withMongoIds(parties));
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
    const trimmedName = name.trim();
    const dup = await db.party.findFirst({
      where: { name: trimmedName, partyType },
    });
    if (dup) {
      return jsonError(
        "A party with this name already exists for this type",
        409,
      );
    }
    const p = await db.party.create({
      data: {
        name: trimmedName,
        phone: phone ?? "",
        address: address ?? "",
        openingBalance,
        // Opening balance is entered as advance (positive means party pre-paid)
        balance: -openingBalance,
        partyType,
        maxDaysWithoutPayment:
          partyType === "customer" && typeof maxDaysWithoutPayment === "number"
            ? maxDaysWithoutPayment
            : null,
      },
    });
    await recordOpeningBalanceIfNeeded({
      id: p.id,
      openingBalance: p.openingBalance,
      partyType: p.partyType as "customer" | "supplier",
      balance: p.balance,
    });
    return jsonOk(withMongoId(p));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create party";
    return jsonError(msg, 500);
  }
}
