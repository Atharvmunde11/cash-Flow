"use client";

import "./invoice-print.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceLineItem = {
  id: string;
  lineType: "item" | "sundry";
  /** For item lines */
  description?: string;
  quantity?: number;
  unitPrice?: number;
  unit?: string;
  /** For sundry lines */
  sundryLabel?: string;
  sundryAmount?: number;
};

export type InvoiceParty = {
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;
  phone?: string;
};

export type InvoiceCompany = {
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;
  phone?: string;
  gstin?: string;
};

export type InvoiceData = {
  /** "INVOICE" | "ESTIMATE" | "RECEIPT" etc. */
  title?: string;
  invoiceNumber?: string;
  invoiceDate?: Date | string;
  dueDate?: Date | string;
  poNumber?: string;

  company: InvoiceCompany;
  billTo: InvoiceParty;
  shipTo?: InvoiceParty;

  lines: InvoiceLineItem[];

  /** Pass pre-calculated values; component will NOT re-derive them */
  itemsSubtotal: number;
  sundrySubtotal?: number;
  /** Optional named tax line, e.g. { label: "GST 18%", amount: 26.10 } */
  taxLine?: { label: string; amount: number };
  total: number;

  /** "sale" | "purchase" | returns */
  billKind?: "sale" | "purchase" | "sale_return" | "purchase_return";
  paymentMode?: string;
  paidAmount?: number;

  notes?: string;
  terms?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: Date | string | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function billTitle(kind: InvoiceData["billKind"]) {
  switch (kind) {
    case "purchase":
      return "Purchase Bill";
    case "sale_return":
      return "Sale Return";
    case "purchase_return":
      return "Purchase Return";
    default:
      return "Estimate";
  }
}

function billNumberLabel(kind: InvoiceData["billKind"]) {
  switch (kind) {
    case "purchase":
      return "Bill #";
    case "sale_return":
      return "SRN #";
    case "purchase_return":
      return "PRN #";
    default:
      return "INVOICE #";
  }
}

function PartyBlock({ label, party }: { label: string; party: InvoiceParty }) {
  return (
    <div className="inv-party-block">
      <p className="inv-party-label">{label}</p>
      <p className="inv-party-name">{party.name}</p>
      {party.addressLine1 && (
        <p className="inv-party-line">{party.addressLine1}</p>
      )}
      {party.addressLine2 && (
        <p className="inv-party-line">{party.addressLine2}</p>
      )}
      {(party.city || party.state || party.zip) && (
        <p className="inv-party-line">
          {[party.city, party.state, party.zip].filter(Boolean).join(", ")}
        </p>
      )}
      {party.phone && <p className="inv-party-line">Ph: {party.phone}</p>}
      {party.email && <p className="inv-party-line">{party.email}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InvoicePrint({ data }: { data: InvoiceData }) {
  const {
    invoiceNumber,
    invoiceDate,
    dueDate,
    poNumber,
    company,
    billTo,
    shipTo,
    lines,
    sundrySubtotal = 0,
    taxLine,
    itemsSubtotal,
    billKind = "sale",
    paymentMode,
    notes,
    terms,
  } = data;

  const itemLines = lines.filter((l) => l.lineType === "item");
  const sundryLines = lines.filter((l) => l.lineType === "sundry");
  const grandTotal = itemsSubtotal + sundrySubtotal + (taxLine?.amount || 0);
  const partyLabel =
    billKind === "purchase" || billKind === "purchase_return"
      ? "Supplier"
      : "Bill To";

  return (
    <div id="invoice-print-root" className="invoice-print-wrapper" aria-hidden>
      <div className="inv-sheet">
        <div className="inv-sheet-top">
          {/* ── Header ── */}
          <header className="inv-header">
            <div className="inv-header-brand">
              <h1 className="inv-company-name">{company.name}</h1>
              {company.gstin && (
                <p className="inv-company-gstin">GSTIN: {company.gstin}</p>
              )}
              {company.addressLine1 && (
                <p className="inv-company-addr">{company.addressLine1}</p>
              )}
              {company.addressLine2 && (
                <p className="inv-company-addr">{company.addressLine2}</p>
              )}
              {(company.city || company.state || company.zip) && (
                <p className="inv-company-addr">
                  {[company.city, company.state, company.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {(company.phone || company.email) && (
                <p className="inv-company-addr">
                  {[
                    company.phone ? `Ph: ${company.phone}` : null,
                    company.email || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div className="inv-header-meta">
              <h2 className="inv-title">{billTitle(billKind)}</h2>
              <table className="inv-meta-table">
                <tbody>
                  {invoiceNumber && (
                    <tr>
                      <td className="inv-meta-key">
                        {billNumberLabel(billKind)}
                      </td>
                      <td className="inv-meta-val">{invoiceNumber}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="inv-meta-key">Date</td>
                    <td className="inv-meta-val">{fmtDate(invoiceDate)}</td>
                  </tr>
                  {dueDate && (
                    <tr>
                      <td className="inv-meta-key">Due Date</td>
                      <td className="inv-meta-val">{fmtDate(dueDate)}</td>
                    </tr>
                  )}
                  {poNumber && (
                    <tr>
                      <td className="inv-meta-key">P.O. #</td>
                      <td className="inv-meta-val">{poNumber}</td>
                    </tr>
                  )}
                  {paymentMode && (
                    <tr>
                      <td className="inv-meta-key">Payment</td>
                      <td className="inv-meta-val inv-meta-capitalize">
                        {paymentMode}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </header>

          <hr className="inv-divider" />

          {/* ── Party row ── */}
          <div className="inv-parties">
            <PartyBlock label={partyLabel} party={billTo} />
            {shipTo && <PartyBlock label="Ship To" party={shipTo} />}
          </div>

          {/* ── Line items table ── */}
          <table className="inv-table">
            <thead>
              <tr>
                <th className="inv-th inv-th-center inv-col-qty">QTY</th>
                <th className="inv-th inv-th-left inv-col-desc">DESCRIPTION</th>
                <th className="inv-th inv-th-right inv-col-unit">UNIT</th>
                <th className="inv-th inv-th-right inv-col-price">UNIT PRICE</th>
                <th className="inv-th inv-th-right inv-col-amount">AMOUNT</th>
              </tr>
            </thead>

            <tbody>
              {itemLines.map((line) => {
                const amount =
                  (Number(line.quantity) || 0) * (line.unitPrice ?? 0);
                return (
                  <tr key={line.id} className="inv-tr">
                    <td className="inv-td inv-td-center">
                      {line.quantity ?? "—"}
                    </td>
                    <td className="inv-td">{line.description || "—"}</td>
                    <td className="inv-td inv-td-right inv-td-muted">
                      {line.unit || "—"}
                    </td>
                    <td className="inv-td inv-td-right inv-tabular">
                      {line.unitPrice !== undefined ? fmt(line.unitPrice) : "—"}
                    </td>
                    <td className="inv-td inv-td-right inv-tabular">
                      {line.unitPrice !== undefined ? fmt(amount) : "—"}
                    </td>
                  </tr>
                );
              })}

              {/* Spacer pushes sundry + total toward page bottom */}
              <tr className="inv-tr-spacer" aria-hidden>
                <td colSpan={5} />
              </tr>

              {sundryLines.map((line) => (
                <tr key={line.id} className="inv-tr inv-tr-sundry">
                  <td className="inv-td inv-td-center inv-td-muted">—</td>
                  <td className="inv-td">
                    <span className="inv-sundry-badge">Sundry</span>
                    {line.sundryLabel || "Additional charge"}
                  </td>
                  <td className="inv-td inv-td-right inv-td-muted">—</td>
                  <td className="inv-td inv-td-right inv-td-muted">—</td>
                  <td className="inv-td inv-td-right inv-tabular">
                    {fmt(Number(line.sundryAmount) || 0)}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              {taxLine && (
                <tr className="inv-tfoot-row inv-tfoot-sub">
                  <td colSpan={3} />
                  <td className="inv-tfoot-label">{taxLine.label}</td>
                  <td className="inv-tfoot-val inv-tabular">
                    {fmt(taxLine.amount)}
                  </td>
                </tr>
              )}

              <tr className="inv-tfoot-row inv-tfoot-total">
                <td colSpan={3} />
                <td className="inv-tfoot-total-label">TOTAL</td>
                <td className="inv-tfoot-total-val inv-tabular">
                  ₹&nbsp;{fmt(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Footer ── */}
        <div className="inv-sheet-bottom">
          {(notes || terms) && (
            <footer className="inv-footer">
              {terms && (
                <div className="inv-footer-section">
                  <p className="inv-footer-heading">Terms &amp; Conditions</p>
                  <p className="inv-footer-body">{terms}</p>
                </div>
              )}
              {notes && (
                <div className="inv-footer-section">
                  <p className="inv-footer-heading">Notes</p>
                  <p className="inv-footer-body">{notes}</p>
                </div>
              )}
            </footer>
          )}

          <div className="inv-thank-you">Thank you for your business.</div>
        </div>
      </div>
    </div>
  );
}
