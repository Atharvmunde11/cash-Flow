import { connectDb } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { Party } from "@/models/Party";
import { Category } from "@/models/Category";
import { Item } from "@/models/Item";
import { LedgerTransaction } from "@/models/Transaction";
import { Bill } from "@/models/Bill";
import { NextResponse } from "next/server";
import Papa from "papaparse";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") ?? "json";

    const [parties, categories, items, transactions, bills] = await Promise.all([
      Party.find({}).lean(),
      Category.find({}).lean(),
      Item.find({}).lean(),
      LedgerTransaction.find({}).lean(),
      Bill.find({}).lean(),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      parties,
      categories,
      items,
      transactions,
      bills,
    };

    if (format === "csv") {
      const txRows = transactions.map((t) => ({
        date: t.date,
        partyId: String(t.partyId),
        partyType: t.partyType,
        entryType: t.entryType,
        amount: t.amount,
        paymentMode: t.paymentMode,
        notes: t.notes,
        refType: t.refType,
      }));
      const csv = Papa.unparse(txRows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ledger-transactions.csv"`,
        },
      });
    }

    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="ledger-export.json"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
