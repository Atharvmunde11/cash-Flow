import { connectDb, db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { renderPartyLedgerPdfBuffer } from "@/lib/pdf/party-ledger-pdf";

export const runtime = "nodejs";

function balanceMeta(partyType: string, balance: number) {
  const abs = Math.abs(balance || 0);
  if (partyType === "supplier") {
    return balance >= 0
      ? { label: "You owe", amount: abs }
      : { label: "They owe", amount: abs };
  }
  return balance >= 0
    ? { label: "They owe", amount: abs }
    : { label: "You owe", amount: abs };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    if (!id.trim()) return jsonError("Invalid id", 400);

    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") || "all") as
      | "all"
      | "bills"
      | "payments";

    const party = await db.party.findUnique({ where: { id } });
    if (!party) return jsonError("Not found", 404);

    const [transactions, bills] = await Promise.all([
      db.ledgerTransaction.findMany({
        where: { partyId: id },
        orderBy: { date: "desc" },
      }),
      db.bill.findMany({
        where: { partyId: id },
        orderBy: { billDate: "desc" },
        select: {
          billNumber: true,
          billKind: true,
          billDate: true,
          total: true,
          paidAmount: true,
          paymentMode: true,
          createdAt: true,
        },
      }),
    ]);

    const rows: Array<{
      date: string;
      type: string;
      description: string;
      mode: string;
      debit: number;
      credit: number;
      balanceAfter: number | null;
    }> = [];

    for (const t of transactions) {
      if (mode === "bills" || mode === "payments") continue;
      rows.push({
        date: new Date(t.date).toLocaleString(),
        type: "Transaction",
        description: t.notes || `${t.entryType} transaction`,
        mode: t.paymentMode,
        debit: t.entryType === "debit" ? Number(t.amount) || 0 : 0,
        credit: t.entryType === "credit" ? Number(t.amount) || 0 : 0,
        balanceAfter: t.balanceAfterParty ?? null,
      });
    }

    for (const b of bills) {
      if (mode === "payments") continue;
      const paid = Number(b.paidAmount) || 0;
      const due = Math.max(0, (Number(b.total) || 0) - paid);
      const supplier = party.partyType === "supplier";
      rows.push({
        date: new Date(b.billDate ?? b.createdAt).toLocaleString(),
        type: `${b.billKind ?? "sale"} bill`,
        description: `Bill ${b.billNumber}`,
        mode: b.paymentMode,
        debit: supplier ? paid : due,
        credit: supplier ? due : paid,
        balanceAfter: null,
      });
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const meta = balanceMeta(party.partyType, Number(party.balance) || 0);
    const business = await db.businessProfile.findUnique({
      where: { key: "singleton" },
    });
    const companyName = business?.name?.trim() || "CashFlow";
    const statementDate = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const pdf = await renderPartyLedgerPdfBuffer({
      companyName,
      partyName: party.name,
      partyType: party.partyType,
      partyAddress: party.address || "",
      partyPhone: party.phone || "",
      statementDate,
      subtitle:
        mode === "bills"
          ? "Bills only"
          : mode === "payments"
            ? "Payments only"
            : "Full activity",
      balanceLabel: meta.label,
      balanceAmount: meta.amount,
      rows,
    });

    return new Response(new Blob([Uint8Array.from(pdf)], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${party.name.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 40) || "party"}-statement.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
