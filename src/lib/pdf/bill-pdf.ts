import PDFDocument from "pdfkit";

type PartyLite = { name?: string; phone?: string } | null;
type CompanyLite = { name?: string; address?: string; phone?: string } | null;

type BillPdfLike = {
  billKind?: "sale" | "purchase" | string;
  billDate: Date | string;
  billNumber: string;
  displayName?: string;
  paymentMode?: string;
  lines: Array<{
    quantity: number;
    name: string;
    unitPrice: number;
    lineTotal: number;
  }>;
  sundryCharges?: Array<{ label: string; amount: number }>;
  total: number;
  paidAmount: number;
  creditAmount: number;
  notes?: string;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export async function renderBillPdfBuffer(opts: {
  bill: BillPdfLike;
  party: PartyLite;
  company?: CompanyLite;
}): Promise<Buffer> {
  const { bill, party, company } = opts;
  const companyName = company?.name?.trim() ? company.name.trim() : "CashFlow";
  const companyAddress = company?.address?.trim() ? company.address.trim() : "";
  const companyPhone = company?.phone?.trim() ? company.phone.trim() : "";

  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    info: { Title: bill.billNumber },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: any) =>
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
  );

  // Header
  doc.font("Helvetica-Bold").fontSize(18).text(companyName, { align: "left" });
  if (companyAddress) {
    doc.moveDown(0.15);
    doc.font("Helvetica").fontSize(9).fillColor("#444").text(companyAddress, {
      align: "left",
    });
    doc.fillColor("#000");
  }
  if (companyPhone) {
    doc.moveDown(0.1);
    doc.font("Helvetica").fontSize(9).fillColor("#444").text(`Ph: ${companyPhone}`, {
      align: "left",
    });
    doc.fillColor("#000");
  }
  doc.moveDown(0.2);
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(bill.billKind === "purchase" ? "PURCHASE BILL" : "INVOICE", {
      align: "right",
    });

  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(10);
  doc.text(`Bill No: ${bill.billNumber}`, { continued: true });
  doc.text(`   Date: ${formatDate(new Date(bill.billDate))}`);
  doc.text(`Payment: ${bill.paymentMode}`);

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").text("Bill To");
  doc.font("Helvetica").text(party?.name || bill.displayName || "—");
  if (party?.phone) doc.text(`Ph: ${party.phone}`);

  // Table
  doc.moveDown(0.8);
  const startX = doc.x;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const colQty = 50;
  const colUnit = 60;
  const colPrice = 90;
  const colAmount = 90;
  const colDesc = pageWidth - (colQty + colUnit + colPrice + colAmount);

  const rowH = 18;
  let y = doc.y;

  const drawRow = (cells: string[], bold = false) => {
    const [qty, desc, unit, price, amount] = cells;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);

    // borders
    doc.rect(startX, y, pageWidth, rowH).strokeColor("#D0D0D0").stroke();
    let x = startX;
    const widths = [colQty, colDesc, colUnit, colPrice, colAmount];
    for (const w of widths.slice(0, -1)) {
      x += w;
      doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor("#E0E0E0").stroke();
    }

    x = startX;
    doc.text(qty, x + 6, y + 5, { width: colQty - 12, align: "center" });
    x += colQty;
    doc.text(desc, x + 6, y + 5, { width: colDesc - 12, align: "left" });
    x += colDesc;
    doc.text(unit, x + 6, y + 5, { width: colUnit - 12, align: "right" });
    x += colUnit;
    doc.text(price, x + 6, y + 5, { width: colPrice - 12, align: "right" });
    x += colPrice;
    doc.text(amount, x + 6, y + 5, { width: colAmount - 12, align: "right" });

    y += rowH;
  };

  // Header row (no black background)
  drawRow(["QTY", "DESCRIPTION", "UNIT", "UNIT PRICE", "AMOUNT"], true);

  // Items
  for (const line of bill.lines) {
    drawRow(
      [
        String(line.quantity),
        line.name,
        "",
        formatMoney(line.unitPrice),
        formatMoney(line.lineTotal),
      ],
      false,
    );
  }

  // Sundry
  for (const s of bill.sundryCharges ?? []) {
    drawRow(["—", `Sundry: ${s.label}`, "—", "—", formatMoney(s.amount)], false);
  }

  // Totals
  doc.moveDown(1.0);
  const rightBoxW = 220;
  const rx = startX + pageWidth - rightBoxW;
  const labelW = 120;
  const valW = rightBoxW - labelW;

  const lineY = () => {
    const yy = doc.y;
    doc.moveTo(rx, yy).lineTo(rx + rightBoxW, yy).strokeColor("#E0E0E0").stroke();
  };

  doc.x = rx;
  doc.fontSize(10).font("Helvetica");
  lineY();
  doc.moveDown(0.4);
  doc.text("Total", rx, doc.y, { width: labelW, align: "left" });
  doc.text(`₹ ${formatMoney(bill.total)}`, rx + labelW, doc.y, {
    width: valW,
    align: "right",
  });
  doc.moveDown(0.3);
  doc.text("Paid", rx, doc.y, { width: labelW, align: "left" });
  doc.text(`₹ ${formatMoney(bill.paidAmount)}`, rx + labelW, doc.y, {
    width: valW,
    align: "right",
  });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold");
  doc.text(bill.billKind === "sale" ? "Due" : "Payable", rx, doc.y, {
    width: labelW,
    align: "left",
  });
  doc.text(`₹ ${formatMoney(bill.creditAmount)}`, rx + labelW, doc.y, {
    width: valW,
    align: "right",
  });

  if (bill.notes) {
    doc.moveDown(1.0);
    doc.font("Helvetica-Bold").text("Notes");
    doc.font("Helvetica").fontSize(9).text(bill.notes);
  }

  doc.end();

  await new Promise<void>((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}

