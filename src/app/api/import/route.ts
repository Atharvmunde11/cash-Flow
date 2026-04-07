import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { Party } from "@/models/Party";
import { Category } from "@/models/Category";
import { Item } from "@/models/Item";
import { LedgerTransaction } from "@/models/Transaction";
import { Bill } from "@/models/Bill";
import mongoose from "mongoose";
import { z } from "zod";

export const runtime = "nodejs";

const importSchema = z.object({
  parties: z.array(z.record(z.string(), z.unknown())).optional(),
  categories: z.array(z.record(z.string(), z.unknown())).optional(),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  transactions: z.array(z.record(z.string(), z.unknown())).optional(),
  bills: z.array(z.record(z.string(), z.unknown())).optional(),
  mode: z.enum(["merge", "replace"]).optional().default("merge"),
});

export async function POST(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    if (parsed.data.mode === "replace") {
      await Promise.all([
        Party.deleteMany({}),
        Category.deleteMany({}),
        Item.deleteMany({}),
        LedgerTransaction.deleteMany({}),
        Bill.deleteMany({}),
      ]);
    }

    const stripId = (row: Record<string, unknown>) => {
      const { _id, __v, ...rest } = row;
      return rest;
    };

    let counts = { parties: 0, categories: 0, items: 0, transactions: 0, bills: 0 };

    if (parsed.data.parties?.length) {
      for (const row of parsed.data.parties) {
        await Party.create(stripId(row));
        counts.parties++;
      }
    }
    if (parsed.data.categories?.length) {
      for (const row of parsed.data.categories) {
        await Category.create({
          ...stripId(row),
          parentId: row.parentId
            ? new mongoose.Types.ObjectId(String(row.parentId))
            : null,
          ancestorIds: Array.isArray(row.ancestorIds)
            ? (row.ancestorIds as string[]).map((id) => new mongoose.Types.ObjectId(id))
            : [],
        });
        counts.categories++;
      }
    }
    if (parsed.data.items?.length) {
      for (const row of parsed.data.items) {
        await Item.create({
          ...stripId(row),
          categoryId: new mongoose.Types.ObjectId(String(row.categoryId)),
        });
        counts.items++;
      }
    }
    if (parsed.data.transactions?.length) {
      for (const row of parsed.data.transactions) {
        await LedgerTransaction.create({
          ...stripId(row),
          partyId: new mongoose.Types.ObjectId(String(row.partyId)),
          billId: row.billId
            ? new mongoose.Types.ObjectId(String(row.billId))
            : null,
        });
        counts.transactions++;
      }
    }
    if (parsed.data.bills?.length) {
      for (const row of parsed.data.bills) {
        await Bill.create({
          ...stripId(row),
          partyId: new mongoose.Types.ObjectId(String(row.partyId)),
        });
        counts.bills++;
      }
    }

    return jsonOk({ counts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 400);
  }
}
