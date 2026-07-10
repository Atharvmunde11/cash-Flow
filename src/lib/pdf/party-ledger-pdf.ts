import PDFDocument from "pdfkit";

export type PartyLedgerPdfRow = {
  date: string;
  type: string;
  description: string;
  mode: string;
  debit: number;
  credit: number;
  balanceAfter?: number | null;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export async function renderPartyLedgerPdfBuffer(opts: {
  companyName: string;
  partyName: string;
  partyType: string;
  partyAddress?: string;
  partyPhone?: string;
  statementDate: string;
  balanceLabel: string;
  balanceAmount: number;
  subtitle: string;
  rows: PartyLedgerPdfRow[];
}): Promise<Buffer> {
  const {
    companyName,
    partyName,
    partyType,
    partyAddress,
    partyPhone,
    statementDate,
    balanceLabel,
    balanceAmount,
    subtitle,
    rows,
  } = opts;

  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    info: { Title: `${partyName} statement` },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: any) =>
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
  );

  // Header
  doc.font("Helvetica-Bold").fontSize(18).text(companyName, { align: "left" });
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Party statement", { align: "right" });
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(12).text(partyName);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#444")
    .text(`${partyType} • ${subtitle}`);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#444")
    .text(`Date: ${statementDate}`);
  const addrLine = [partyAddress, partyPhone].filter(Boolean).join(" • ");
  if (addrLine) {
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(addrLine);
  }
  doc.moveDown(0.2);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#111")
    .text(`Balance: ₹ ${formatMoney(balanceAmount)} (${balanceLabel})`);

  doc.moveDown(0.8);

  // Table
  const startX = doc.x;
  const pageW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rowH = 18;
  let y = doc.y;

  const colDate = 92;
  const colType = 78;
  const colMode = 60;
  const colDebit = 80;
  const colCredit = 80;
  const colBal = 92;
  const colDesc = pageW - (colDate + colType + colMode + colDebit + colCredit + colBal);

  const widths = [colDate, colType, colDesc, colMode, colDebit, colCredit, colBal];

  const drawRow = (cells: string[], header = false) => {
    doc
      .rect(startX, y, pageW, rowH)
      .strokeColor("#D0D0D0")
      .stroke();

    let x = startX;
    for (const w of widths.slice(0, -1)) {
      x += w;
      doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor("#E6E6E6").stroke();
    }

    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    x = startX;
    doc.text(cells[0], x + 5, y + 5, { width: colDate - 10 });
    x += colDate;
    doc.text(cells[1], x + 5, y + 5, { width: colType - 10 });
    x += colType;
    doc.text(cells[2], x + 5, y + 5, { width: colDesc - 10 });
    x += colDesc;
    doc.text(cells[3], x + 5, y + 5, { width: colMode - 10 });
    x += colMode;
    doc.text(cells[4], x + 5, y + 5, { width: colDebit - 10, align: "right" });
    x += colDebit;
    doc.text(cells[5], x + 5, y + 5, { width: colCredit - 10, align: "right" });
    x += colCredit;
    doc.text(cells[6], x + 5, y + 5, { width: colBal - 10, align: "right" });

    y += rowH;
  };

  drawRow(
    ["Date", "Type", "Description", "Mode", "Debit", "Credit", "Balance"],
    true,
  );

  for (const r of rows) {
    // simple pagination
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
      drawRow(
        ["Date", "Type", "Description", "Mode", "Debit", "Credit", "Balance"],
        true,
      );
    }
    drawRow(
      [
        r.date,
        r.type,
        r.description,
        r.mode,
        r.debit > 0 ? formatMoney(r.debit) : "-",
        r.credit > 0 ? formatMoney(r.credit) : "-",
        r.balanceAfter != null ? formatMoney(r.balanceAfter) : "-",
      ],
      false,
    );
  }

  doc.end();
  await new Promise<void>((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}

