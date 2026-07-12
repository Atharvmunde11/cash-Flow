import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId, withMongoIds } from "@/lib/id-compat";
import {
  isCashPartyAlias,
  resolveGuestDisplayName,
} from "@/lib/import/account-classify";
import { linkPartyToLedger } from "@/lib/ledger-accounts";
import { recordOpeningBalanceIfNeeded } from "@/lib/opening-ledger";
import { repairAutoPaidReturnBills } from "@/lib/party-balance-repair";
import { partyCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

/** Link orphan walk-in bill display names to Party records so they appear in Customers. */
async function backfillWalkInParties() {
  const orphanBills = await db.bill.findMany({
    where: {
      partyId: null,
      displayName: { not: "" },
    },
    select: {
      id: true,
      displayName: true,
      billKind: true,
    },
    take: 500,
  });

  for (const bill of orphanBills) {
    const raw = bill.displayName.trim();
    if (!raw) continue;

    const guest = resolveGuestDisplayName(raw);
    const name = guest.displayName;
    // Never create a party named Cash / CASH PAYMENT
    if (isCashPartyAlias(raw) && name === "Guest") {
      // use Guest party
    }

    const partyType =
      bill.billKind === "purchase" || bill.billKind === "purchase_return"
        ? "supplier"
        : "customer";

    let party = await db.party.findFirst({
      where: { name, partyType },
    });
    if (!party) {
      party = await db.party.create({
        data: {
          name,
          phone: "",
          address: "",
          openingBalance: 0,
          balance: 0,
          partyType,
        },
      });
      await linkPartyToLedger(party);
    }

    await db.bill.update({
      where: { id: bill.id },
      data: {
        partyId: party.id,
        displayName: guest.isGuest ? "Guest" : bill.displayName,
      },
    });
  }
}

export async function GET(req: Request) {
  try {
    await connectDb();
    // Persist historical walk-ins as customers/suppliers.
    await backfillWalkInParties();
    // Fix return bills that wrongly settled party balances.
    await repairAutoPaidReturnBills();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const q = searchParams.get("q");
    const where: {
      partyType?: "customer" | "supplier";
      name?: { contains: string };
    } = {};
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
    await linkPartyToLedger(p);
    await recordOpeningBalanceIfNeeded({
      id: p.id,
      openingBalance: p.openingBalance,
      partyType: p.partyType as "customer" | "supplier",
      balance: p.balance,
    });
    const withLedger = await db.party.findUnique({ where: { id: p.id } });
    return jsonOk(withMongoId(withLedger ?? p));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create party";
    return jsonError(msg, 500);
  }
}
