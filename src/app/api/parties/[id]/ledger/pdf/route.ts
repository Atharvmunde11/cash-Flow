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

const PAYMENT_REFS = new Set([
  "bill_payment",
  "purchase_payment",
  "sale_return_payment",
  "purchase_return_payment",
]);

const INVOICE_REFS = new Set([
  "bill_invoice",
  "purchase_invoice",
  "sale_return",
  "purchase_return",
]);

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
          id: true,
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

    const billIds = new Set(bills.map((b) => b.id));
    const isSupplier = party.partyType === "supplier";

    // Standalone ledger rows (not tied to a bill)
    for (const t of transactions) {
      if (t.billId && billIds.has(t.billId)) continue;
      if (INVOICE_REFS.has(t.refType ?? "") || PAYMENT_REFS.has(t.refType ?? ""))
        continue;
      if (mode === "bills") continue;
      if (mode === "payments" && t.entryType !== "credit" && t.entryType !== "debit")
        continue;

      rows.push({
        date: new Date(t.date).toLocaleString(),
        type: t.paymentId ? "Payment" : "Transaction",
        description: t.notes || `${t.entryType} transaction`,
        mode: t.paymentMode,
        debit: t.entryType === "debit" ? Number(t.amount) || 0 : 0,
        credit: t.entryType === "credit" ? Number(t.amount) || 0 : 0,
        balanceAfter: t.balanceAfterParty ?? null,
      });
    }

    for (const b of bills) {
      const paid = Number(b.paidAmount) || 0;
      const total = Number(b.total) || 0;
      const related = transactions
        .filter((t) => t.billId === b.id)
        .sort(
          (a, c) => new Date(a.date).getTime() - new Date(c.date).getTime(),
        );
      const paymentRows = related.filter((t) =>
        PAYMENT_REFS.has(t.refType ?? ""),
      );
      const paidFromLedger = paymentRows.reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0,
      );
      const paidAmount = paidFromLedger > 0 ? paidFromLedger : paid;

      let debit = 0;
      let credit = 0;
      if (b.billKind === "sale_return") {
        credit = total;
        debit = paidAmount;
      } else if (b.billKind === "purchase_return") {
        debit = total;
        credit = paidAmount;
      } else if (b.billKind === "purchase" || isSupplier) {
        credit = total;
        debit = paidAmount;
      } else {
        debit = total;
        credit = paidAmount;
      }

      if (mode === "payments" && paidAmount <= 0) continue;

      rows.push({
        date: new Date(b.billDate ?? b.createdAt).toLocaleString(),
        type: `${b.billKind ?? "sale"} bill`,
        description: `Bill ${b.billNumber}`,
        mode: b.paymentMode,
        debit,
        credit,
        balanceAfter:
          related[related.length - 1]?.balanceAfterParty ?? null,
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
