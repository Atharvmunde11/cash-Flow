import { connectDb, db } from "@/lib/db";
import { partyBalanceDelta } from "@/lib/ledger";
import { jsonError, jsonOk } from "@/lib/http";
import { withMongoId } from "@/lib/id-compat";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const bill = await db.bill.findUnique({
      where: { id },
      include: {
        party: true,
        bankAccount: true,
        lines: { include: { item: true } },
        sundryCharges: true,
        stockWarnings: true,
      },
    });
    if (!bill) return jsonError("Not found", 404);

    const party =
      bill.party
        ? {
            _id: bill.party.id,
            name: bill.party.name,
            phone: bill.party.phone ?? "",
            partyType: bill.party.partyType,
            balance: bill.party.balance,
          }
        : null;
    const bankAccount =
      bill.bankAccount
        ? {
            _id: bill.bankAccount.id,
            accountName: bill.bankAccount.accountName,
            bankName: bill.bankAccount.bankName,
          }
        : null;

    return jsonOk({
      ...withMongoId(bill),
      partyId: party,
      bankAccountId: bankAccount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

const patchLineSchema = z.object({
  itemId: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

const patchSchema = z.object({
  billKind: z.enum(["sale", "purchase"]).optional(),
  partyId: z
    .union([z.string().trim().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null ? undefined : v)),
  displayName: z.string().min(1).max(200).optional(),
  lines: z.array(patchLineSchema).min(1).optional(),
  sundryCharges: z
    .array(z.object({ label: z.string(), amount: z.number() }))
    .optional(),
  paidAmount: z.coerce.number().nonnegative().optional(),
  paymentMode: z.enum(["cash", "upi", "credit", "mixed", "bank"]).optional(),
  bankAccountId: z
    .union([z.string().trim().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null ? undefined : v)),
  billDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  allowNegativeStock: z.boolean().optional(),
});

async function recomputePartyBalance(partyId: string) {
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party) return;

  const rows = await db.ledgerTransaction.findMany({
    where: { partyId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  let balance = 0;
  let lastPaymentAt: Date | null = null;

  for (const row of rows) {
    balance += partyBalanceDelta(
      row.partyType as "customer" | "supplier",
      row.entryType as "credit" | "debit",
      row.amount,
    );
    await db.ledgerTransaction.update({
      where: { id: row.id },
      data: { balanceAfterParty: balance },
    });

    if (
      party.partyType === "customer" &&
      row.entryType === "credit" &&
      row.paymentMode !== "credit"
    ) {
      lastPaymentAt = row.date;
    }
  }

  await db.party.update({
    where: { id: partyId },
    data: {
      balance,
      lastPaymentAt: party.partyType === "customer" ? lastPaymentAt : null,
    },
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const { sundryCharges: rawSundry, ...rest } = body;
    const parsed = patchSchema.safeParse(rest);
    if (!parsed.success)
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    const bill = await db.bill.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!bill) return jsonError("Not found", 404);

    const result = await db.$transaction(async (tx) => {
      const originalKind = bill.billKind ?? "sale";

      // Reverse stock effects from existing lines
      for (const line of bill.lines) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (!item) continue;
        const nextQty =
          originalKind === "sale"
            ? item.quantity + line.quantity
            : item.quantity - line.quantity;
        await tx.item.update({ where: { id: item.id }, data: { quantity: nextQty } });
      }

      // Remove ledger rows linked to this bill
      await tx.ledgerTransaction.deleteMany({ where: { billId: bill.id } });

      // If party existed, recompute after removing bill ledger
      if (bill.partyId) {
        await recomputePartyBalance(bill.partyId);
      }

      const nextKind = parsed.data.billKind ?? originalKind;
      const nextPartyId =
        parsed.data.partyId !== undefined ? parsed.data.partyId : bill.partyId ?? undefined;
      const nextDisplayName = parsed.data.displayName ?? bill.displayName;

      const nextParty = nextPartyId
        ? await tx.party.findUnique({ where: { id: nextPartyId } })
        : null;

      if (nextPartyId && !nextParty) return jsonError("Party not found", 404);
      if (nextParty) {
        if (nextKind === "sale" && nextParty.partyType !== "customer") {
          return jsonError("Sale bills require a customer", 400);
        }
        if (nextKind === "purchase" && nextParty.partyType !== "supplier") {
          return jsonError("Purchase bills require a supplier", 400);
        }
      }

      const nextLinesInput =
        parsed.data.lines ??
        bill.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        }));

      const newLines: Array<{
        itemId: string;
        name: string;
        quantity: number;
        unitPrice: number;
        purchasePrice: number;
        lineTotal: number;
      }> = [];

      for (const line of nextLinesInput) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (!item) return jsonError(`Item not found: ${line.itemId}`, 400);

        const nextQty =
          nextKind === "sale"
            ? item.quantity - line.quantity
            : item.quantity + line.quantity;

        if (nextKind === "sale" && nextQty < 0 && !parsed.data.allowNegativeStock) {
          return jsonError(
            `Insufficient stock for "${item.name}". Available ${item.quantity}, requested ${line.quantity}.`,
            400,
          );
        }

        newLines.push({
          itemId: item.id,
          name: item.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          purchasePrice: item.purchasePrice ?? 0,
          lineTotal: line.quantity * line.unitPrice,
        });
      }

      // Apply stock changes for new lines
      for (const l of newLines) {
        const item = await tx.item.findUnique({ where: { id: l.itemId } });
        if (!item) continue;
        const nextQty =
          nextKind === "sale"
            ? item.quantity - l.quantity
            : item.quantity + l.quantity;
        await tx.item.update({ where: { id: item.id }, data: { quantity: nextQty } });
      }

      const sundryTotal = (rawSundry ?? []).reduce(
        (s: number, c: { amount: number }) => s + (Number(c.amount) || 0),
        0,
      );
      const itemsTotal = newLines.reduce((s, l) => s + l.lineTotal, 0);
      const nextTotal = itemsTotal + sundryTotal;
      const nextPaidAmount = Math.min(parsed.data.paidAmount ?? bill.paidAmount, nextTotal);
      const nextPaymentMode = parsed.data.paymentMode ?? bill.paymentMode;
      const nextBillDate = parsed.data.billDate ?? bill.billDate;

      const nextDocPaymentMode =
        nextPaidAmount > 0 && nextTotal - nextPaidAmount > 0
          ? "mixed"
          : nextTotal - nextPaidAmount > 0
            ? "credit"
            : nextPaymentMode;

      if (parsed.data.bankAccountId !== undefined) {
        // keep it; will be applied below
      }

      // Replace bill lines & sundry charges
      await tx.billLine.deleteMany({ where: { billId: bill.id } });
      await tx.billSundryCharge.deleteMany({ where: { billId: bill.id } });
      await tx.billStockWarning.deleteMany({ where: { billId: bill.id } });

      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          billKind: nextKind,
          partyId: nextParty ? nextParty.id : null,
          displayName: nextDisplayName,
          total: nextTotal,
          paidAmount: nextPaidAmount,
          creditAmount: nextTotal - nextPaidAmount,
          paymentMode: nextDocPaymentMode,
          billDate: nextBillDate,
          hourOfDay: nextBillDate.getHours(),
          notes: parsed.data.notes !== undefined ? parsed.data.notes : bill.notes,
          bankAccountId:
            parsed.data.bankAccountId !== undefined
              ? parsed.data.bankAccountId ?? null
              : bill.bankAccountId,
          lines: { create: newLines },
          sundryCharges: {
            create: (rawSundry ?? []).map((charge: { label: string; amount: number }) => ({
              label: charge.label,
              amount: Number(charge.amount) || 0,
            })),
          },
        },
        include: { lines: true, sundryCharges: true, stockWarnings: true, party: true, bankAccount: true },
      });

      // Recreate ledger transactions linked to bill (if party exists)
      if (nextParty) {
        const billDate = nextBillDate;
        let balance = nextParty.balance;

        if (nextKind === "sale") {
          balance += partyBalanceDelta("customer", "debit", nextTotal);
          await tx.ledgerTransaction.create({
            data: {
              partyId: nextParty.id,
              partyType: "customer",
              entryType: "debit",
              amount: nextTotal,
              paymentMode: "credit",
              date: billDate,
              notes: `Bill ${updatedBill.billNumber}`,
              refType: "bill_invoice",
              billId: updatedBill.id,
              balanceAfterParty: balance,
            },
          });

          if (nextPaidAmount > 0) {
            balance += partyBalanceDelta("customer", "credit", nextPaidAmount);
            await tx.ledgerTransaction.create({
              data: {
                partyId: nextParty.id,
                partyType: "customer",
                entryType: "credit",
                amount: nextPaidAmount,
                paymentMode: nextPaymentMode === "upi" || nextPaymentMode === "bank" ? "upi" : "cash",
                date: billDate,
                notes: `Payment for ${updatedBill.billNumber}`,
                refType: "bill_payment",
                billId: updatedBill.id,
                balanceAfterParty: balance,
              },
            });
          }
        } else {
          balance += partyBalanceDelta("supplier", "credit", nextTotal);
          await tx.ledgerTransaction.create({
            data: {
              partyId: nextParty.id,
              partyType: "supplier",
              entryType: "credit",
              amount: nextTotal,
              paymentMode: "credit",
              date: billDate,
              notes: `Purchase ${updatedBill.billNumber}`,
              refType: "purchase_invoice",
              billId: updatedBill.id,
              balanceAfterParty: balance,
            },
          });

          if (nextPaidAmount > 0) {
            balance += partyBalanceDelta("supplier", "debit", nextPaidAmount);
            await tx.ledgerTransaction.create({
              data: {
                partyId: nextParty.id,
                partyType: "supplier",
                entryType: "debit",
                amount: nextPaidAmount,
                paymentMode: nextPaymentMode === "upi" || nextPaymentMode === "bank" ? "upi" : "cash",
                date: billDate,
                notes: `Payment for ${updatedBill.billNumber}`,
                refType: "purchase_payment",
                billId: updatedBill.id,
                balanceAfterParty: balance,
              },
            });
          }
        }

        await recomputePartyBalance(nextParty.id);
      }

      return updatedBill;
    });

    // If the transaction returned a Response via jsonError, handle it.
    if (result instanceof Response) return result;

    const party =
      result.party
        ? {
            _id: result.party.id,
            name: result.party.name,
            phone: result.party.phone ?? "",
            partyType: result.party.partyType,
            balance: result.party.balance,
          }
        : null;
    const bankAccount =
      result.bankAccount
        ? {
            _id: result.bankAccount.id,
            accountName: result.bankAccount.accountName,
            bankName: result.bankAccount.bankName,
          }
        : null;

    return jsonOk({
      ...withMongoId(result),
      partyId: party,
      bankAccountId: bankAccount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await connectDb();
    const { id } = await ctx.params;
    const bill = await db.bill.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!bill) return jsonError("Not found", 404);

    await db.$transaction(async (tx) => {
      // Reverse stock changes
      for (const line of bill.lines) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (!item) continue;
        const nextQty =
          bill.billKind === "sale"
            ? item.quantity + line.quantity
            : item.quantity - line.quantity;
        await tx.item.update({ where: { id: item.id }, data: { quantity: nextQty } });
      }

      // Reverse party balance (remove bill-linked ledger rows then recompute)
      if (bill.partyId) {
        await tx.ledgerTransaction.deleteMany({ where: { billId: bill.id } });
        await recomputePartyBalance(bill.partyId);
      }

      await tx.billStockWarning.deleteMany({ where: { billId: bill.id } });
      await tx.billSundryCharge.deleteMany({ where: { billId: bill.id } });
      await tx.billLine.deleteMany({ where: { billId: bill.id } });
      await tx.bill.delete({ where: { id: bill.id } });
    });

    return jsonOk({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
