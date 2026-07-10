import { connectDb, db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getAppSetting } from "@/lib/app-settings";
import { renderBillPdfBuffer } from "@/lib/pdf/bill-pdf";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id || !id.trim()) {
      return jsonError("Invalid bill id", 400);
    }

    await connectDb();
    const bill = await db.bill.findUnique({
      where: { id },
      include: { party: true, lines: true, sundryCharges: true },
    });
    if (!bill) return jsonError("Bill not found", 404);

    const business = await db.businessProfile
      .findUnique({ where: { key: "singleton" } })
      .catch(() => null);
    const businessPhone = (await getAppSetting<string>("business.phone")) ?? "";

    const pdf = await renderBillPdfBuffer({
      bill: {
        billKind: (bill.billKind as any) ?? "sale",
        billDate: bill.billDate,
        billNumber: bill.billNumber,
        displayName: bill.displayName,
        paymentMode: bill.paymentMode,
        lines: bill.lines.map((l) => ({
          quantity: Number(l.quantity) || 0,
          name: l.name,
          unitPrice: Number(l.unitPrice) || 0,
          lineTotal: Number(l.lineTotal) || 0,
        })),
        sundryCharges: bill.sundryCharges.map((s) => ({
          label: s.label,
          amount: Number(s.amount) || 0,
        })),
        total: Number(bill.total) || 0,
        paidAmount: Number(bill.paidAmount) || 0,
        creditAmount: Number(bill.creditAmount) || 0,
        notes: bill.notes ?? "",
      },
      party: bill.party
        ? { name: bill.party.name, phone: bill.party.phone || undefined }
        : null,
      company: {
        name: business?.name?.trim() || "CashFlow",
        address: business?.address ?? "",
        phone: businessPhone,
      },
    });

    const fileName = `${String(bill.billNumber ?? "bill")}.pdf`;
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

