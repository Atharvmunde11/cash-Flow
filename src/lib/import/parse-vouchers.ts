import {
  absAmount,
  asArray,
  busyItemUnit,
  isCashLedgerName,
  numOf,
  parseImportDate,
  parseTallyQuantity,
  parseTallyRate,
  sanitizeBillNumber,
  textOf,
  walkNodes,
} from "@/lib/import/parse-utils";
import type {
  ImportBillRow,
  ImportPaymentRow,
  ImportSundryCharge,
} from "@/lib/import/parse-import-file";

type BusyVoucherAction = "sale" | "purchase" | "receipt" | "payment";

function busyVchAction(vchTypeRaw: unknown): BusyVoucherAction | null {
  const raw = textOf(vchTypeRaw);
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower.includes("sale return") || lower.includes("purchase return")) {
    return null;
  }
  if (lower.includes("sales order") || lower.includes("purchase order")) {
    return null;
  }
  if (lower.includes("sale")) return "sale";
  if (lower.includes("purchase") || lower.includes("pur")) return "purchase";
  if (lower.includes("receipt")) return "receipt";
  if (lower.includes("payment") || lower.includes("pay")) return "payment";

  const code = Number.parseInt(raw, 10);
  if (!Number.isFinite(code)) return null;

  const byCode: Record<number, BusyVoucherAction> = {
    2: "purchase",
    4: "payment",
    5: "receipt",
    9: "sale",
    12: "payment",
    13: "receipt",
    14: "receipt",
    19: "payment",
  };
  return byCode[code] ?? null;
}

function collectBusyNodes(
  root: unknown,
  tags: string[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const tag of tags) walkNodes(root, tag, out);
  return out;
}

function buildBusyMasterMap(root: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const masters = collectBusyNodes(root, [
    "Master1",
    "MASTER1",
    "Account",
    "ACCOUNT",
    "AccountMaster",
    "ACCOUNTMASTER",
    "Item",
    "ITEM",
    "ItemMaster",
    "ITEMMASTER",
    "Product",
    "PRODUCT",
  ]);

  for (const master of masters) {
    const code = textOf(
      master.Code ??
        master.CODE ??
        master.MasterCode ??
        master.MASTERCODE ??
        master["@_Code"],
    );
    const name = textOf(
      master.Name ??
        master.NAME ??
        master.AccountName ??
        master.ItemName ??
        master.PrintName,
    );
    if (code && name) map.set(code, name);
    if (name) map.set(name.toLowerCase(), name);
  }
  return map;
}

function busyMasterName(
  map: Map<string, string>,
  codeOrName: unknown,
): string {
  const raw = textOf(codeOrName);
  if (!raw) return "";
  return map.get(raw) ?? map.get(raw.toLowerCase()) ?? raw;
}

function busyTranVchCode(row: Record<string, unknown>): string {
  return textOf(row.VchCode ?? row.VCHCODE ?? row.VoucherCode ?? row.VOUCHERCODE);
}

function groupBusyTran2(
  rows: Record<string, unknown>[],
): Map<string, Record<string, unknown>[]> {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const vchCode = busyTranVchCode(row);
    if (!vchCode) continue;
    const list = grouped.get(vchCode) ?? [];
    list.push(row);
    grouped.set(vchCode, list);
  }
  return grouped;
}

function resolveBusyPartyName(
  vchCode: string,
  header: Record<string, unknown>,
  billingByVch: Map<string, string>,
  masterMap: Map<string, string>,
  tran2Lines: Record<string, unknown>[],
): string {
  const billingParty = billingByVch.get(vchCode);
  if (billingParty) return billingParty;

  const headerParty = textOf(
    header.PartyName ??
      header.PARTYNAME ??
      header.AccountName ??
      header.ACCOUNTNAME,
  );
  if (headerParty) return headerParty;

  const partyCode = textOf(
    header.PartyCode ?? header.PARTYCODE ?? header.MasterCode1 ?? header.MASTERCODE1,
  );
  const fromCode = busyMasterName(masterMap, partyCode);
  if (fromCode && !isCashLedgerName(fromCode)) return fromCode;

  for (const line of tran2Lines) {
    const code = textOf(
      line.MasterCode1 ??
        line.MASTERCODE1 ??
        line.AccountCode ??
        line.ACCOUNTCODE ??
        line.ItemCode,
    );
    const name = busyMasterName(masterMap, code);
    if (name && !isCashLedgerName(name)) return name;
  }

  return "";
}

function collectBusyBillLines(
  tran2Lines: Record<string, unknown>[],
  masterMap: Map<string, string>,
): ImportBillRow["lines"] {
  const lines: ImportBillRow["lines"] = [];

  for (const line of tran2Lines) {
    const recType = textOf(line.RecType ?? line.RECTYPE);
    if (recType && recType !== "1") continue;

    const itemCode = textOf(
      line.MasterCode1 ?? line.MASTERCODE1 ?? line.ItemCode ?? line.ITEMCODE,
    );
    const itemName =
      textOf(line.ItemName ?? line.ITEMNAME ?? line.Name ?? line.NAME) ||
      busyMasterName(masterMap, itemCode);
    if (!itemName) continue;

    const quantity = parseTallyQuantity(
      line.D1 ?? line.Qty ?? line.Quantity ?? line.QTY ?? line.ActualQty,
    );
    const unitPrice = parseTallyRate(
      line.D2 ?? line.Rate ?? line.Price ?? line.MRP ?? line.PRICE,
    );
    const lineAmount = absAmount(
      line.D3 ?? line.CashFlow ?? line.CASHFLOW ?? line.Amount ?? line.NettAmount,
    );
    const price =
      unitPrice > 0
        ? unitPrice
        : quantity > 0
          ? lineAmount / quantity
          : lineAmount;

    if (quantity <= 0 && lineAmount <= 0 && price <= 0) continue;

    lines.push({
      itemName,
      quantity: quantity > 0 ? quantity : 1,
      unitPrice: price > 0 ? price : lineAmount,
      unit: busyItemUnit(line),
    });
  }

  return lines;
}

function collectBusyTran2Sundries(
  tran2Lines: Record<string, unknown>[],
  masterMap: Map<string, string>,
): ImportSundryCharge[] {
  const sundries: ImportSundryCharge[] = [];

  for (const line of tran2Lines) {
    const recType = textOf(line.RecType ?? line.RECTYPE);
    if (recType && recType !== "2" && recType !== "4") continue;

    const label =
      textOf(line.ItemName ?? line.ITEMNAME ?? line.Name ?? line.NAME) ||
      busyMasterName(
        masterMap,
        textOf(line.MasterCode1 ?? line.MASTERCODE1 ?? line.ItemCode),
      );
    const amount = numOf(
      line.D3 ?? line.CashFlow ?? line.CASHFLOW ?? line.Amt ?? line.Amount,
    );
    if (!label || amount === 0) continue;
    sundries.push({ label, amount });
  }

  return sundries;
}

function collectBusyDocSundries(
  voucher: Record<string, unknown>,
): ImportSundryCharge[] {
  const sundries: ImportSundryCharge[] = [];
  const billSundries = voucher.BillSundries ?? voucher.BILLSUNDRIES;
  if (!billSundries || typeof billSundries !== "object") return sundries;

  const container = billSundries as Record<string, unknown>;
  for (const detail of asArray(container.BSDetail ?? container.BsDetail)) {
    if (!detail || typeof detail !== "object") continue;
    const row = detail as Record<string, unknown>;
    const label = textOf(row.BSName ?? row.BsName ?? row.Name ?? row.ITEMNAME);
    const amount = numOf(row.Amt ?? row.Amount ?? row.AMT);
    if (!label || amount === 0) continue;
    sundries.push({ label, amount });
  }

  return sundries;
}

function inferBusyCashPaid(
  tran2Lines: Record<string, unknown>[],
  masterMap: Map<string, string>,
): number {
  let paid = 0;
  for (const line of tran2Lines) {
    const code = textOf(line.MasterCode1 ?? line.MASTERCODE1 ?? line.AccountCode);
    const name = busyMasterName(masterMap, code);
    if (!name || !isCashLedgerName(name)) continue;
    paid += absAmount(line.CashFlow ?? line.CASHFLOW ?? line.D3 ?? line.Amount);
  }
  return paid;
}

function parseBusyTranTables(
  root: unknown,
): { bills: ImportBillRow[]; payments: ImportPaymentRow[] } {
  const masterMap = buildBusyMasterMap(root);
  const tran1Rows = collectBusyNodes(root, ["Tran1", "TRAN1"]);
  if (tran1Rows.length === 0) {
    return { bills: [], payments: [] };
  }

  const tran2Rows = collectBusyNodes(root, ["Tran2", "TRAN2"]);
  const tran2ByVch = groupBusyTran2(tran2Rows);

  const billingByVch = new Map<string, string>();
  for (const row of collectBusyNodes(root, ["BillingDet", "BILLINGDET"])) {
    const vchCode = busyTranVchCode(row);
    const partyName = textOf(row.PartyName ?? row.PARTYNAME);
    if (vchCode && partyName) billingByVch.set(vchCode, partyName);
  }

  const bills: ImportBillRow[] = [];
  const payments: ImportPaymentRow[] = [];

  tran1Rows.forEach((header, index) => {
    const vchCode = busyTranVchCode(header);
    if (!vchCode) return;

    const action = busyVchAction(header.VchType ?? header.VCHTYPE ?? header.Type);
    if (!action) return;

    const tran2Lines = tran2ByVch.get(vchCode) ?? [];
    const partyName = resolveBusyPartyName(
      vchCode,
      header,
      billingByVch,
      masterMap,
      tran2Lines,
    );
    if (!partyName) return;

    const date = parseImportDate(header.Date ?? header.VCHDATE ?? header.VoucherDate);
    const externalNumber = sanitizeBillNumber(
      textOf(header.VchNo ?? header.VCHNO ?? header.AutoVchNo ?? header.BillNo),
      `B${index + 1}`,
    );
    const notes = textOf(
      header.Narration ??
        header.NARRATION ??
        header.ShortNar ??
        header.Remarks ??
        header.Nar1,
    );

    if (action === "receipt" || action === "payment") {
      const amount =
        absAmount(header.Amount ?? header.Total ?? header.VchAmount) ||
        Math.max(
          ...tran2Lines.map((line) =>
            absAmount(line.CashFlow ?? line.CASHFLOW ?? line.D3 ?? line.Amount),
          ),
          0,
        );
      if (amount <= 0) return;

      payments.push({
        partyName,
        direction: action === "receipt" ? "received" : "paid",
        amount,
        date,
        paymentMode: inferBusyCashPaid(tran2Lines, masterMap) > 0 ? "cash" : "cash",
        notes: notes || `Imported BUSY ${action} ${externalNumber}`,
        externalRef: externalNumber,
      });
      return;
    }

    const lines = collectBusyBillLines(tran2Lines, masterMap);
    const inventoryTotal = lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0,
    );
    const footerTotal = tran2Lines.reduce(
      (sum, line) => sum + absAmount(line.CashFlow ?? line.CASHFLOW ?? line.D3),
      0,
    );
    const total =
      inventoryTotal > 0
        ? inventoryTotal
        : absAmount(header.Amount ?? header.Total ?? header.GrandTotal) ||
          footerTotal;
    if (total <= 0) return;

    const paidAmount = Math.min(
      total,
      absAmount(header.PaidAmount ?? header.CashAmount) ||
        inferBusyCashPaid(tran2Lines, masterMap),
    );

    bills.push({
      externalNumber,
      billKind: action,
      billDate: date,
      partyName,
      displayName: partyName,
      lines,
      sundryCharges: collectBusyTran2Sundries(tran2Lines, masterMap),
      total,
      paidAmount,
      paymentMode: resolvePaymentMode(total, paidAmount),
      notes: notes || `Imported from BUSY voucher ${externalNumber}`,
    });
  });

  return { bills, payments };
}

function busyBillingParty(voucher: Record<string, unknown>): string {
  const billing = voucher.BillingDetails ?? voucher.BillingDetail;
  if (billing && typeof billing === "object") {
    const party = textOf((billing as Record<string, unknown>).PartyName);
    if (party) return party;
  }
  return textOf(
    voucher.MasterName1 ??
      voucher.PartyName ??
      voucher.PARTYNAME ??
      voucher.AccountName,
  );
}

function collectBusyDocBillLines(
  voucher: Record<string, unknown>,
): ImportBillRow["lines"] {
  const lines: ImportBillRow["lines"] = [];
  const itemEntries = voucher.ItemEntries;
  if (!itemEntries || typeof itemEntries !== "object") return lines;

  const details: Record<string, unknown>[] = [];
  const entry = itemEntries as Record<string, unknown>;
  for (const row of asArray(entry.ItemDetail)) {
    if (row && typeof row === "object") details.push(row as Record<string, unknown>);
  }

  for (const detail of details) {
    const itemName = textOf(detail.ItemName ?? detail.ITEMNAME);
    if (!itemName) continue;
    const quantity = parseTallyQuantity(
      detail.Qty ?? detail.QtyMainUnit ?? detail.QTY,
    );
    const unitPrice = parseTallyRate(
      detail.Price ?? detail.tmpNettPrice ?? detail.ListPrice ?? detail.MRP,
    );
    const lineAmount = absAmount(detail.NettAmount ?? detail.Amt ?? detail.Amount);
    const price =
      unitPrice > 0
        ? unitPrice
        : quantity > 0
          ? lineAmount / quantity
          : lineAmount;
    if (quantity <= 0 && lineAmount <= 0 && price <= 0) continue;
    lines.push({
      itemName,
      quantity: quantity > 0 ? quantity : 1,
      unitPrice: price > 0 ? price : lineAmount,
      unit: busyItemUnit(detail),
    });
  }

  return lines;
}

function parseBusyAccVoucher(
  voucher: Record<string, unknown>,
  direction: "received" | "paid",
  index: number,
): ImportPaymentRow | null {
  const date = parseImportDate(voucher.Date ?? voucher.VCHDATE);
  const externalNumber = sanitizeBillNumber(
    textOf(voucher.VchNo ?? voucher.VCHNO ?? voucher.AutoVchNo),
    `P${index + 1}`,
  );
  const notes = textOf(voucher.Narration ?? voucher.ShortNar);

  const accEntries = voucher.AccEntries;
  if (!accEntries || typeof accEntries !== "object") return null;

  const details: Record<string, unknown>[] = [];
  for (const row of asArray(
    (accEntries as Record<string, unknown>).AccDetail,
  )) {
    if (row && typeof row === "object") details.push(row as Record<string, unknown>);
  }

  let partyName = "";
  let amount = 0;
  for (const detail of details) {
    const name = textOf(detail.AccountName ?? detail.ACCOUNTNAME);
    const group = textOf(detail.tmpGroupName ?? detail.Group).toLowerCase();
    const lineAmount = absAmount(
      detail.CashFlow ?? detail.AmtMainCur ?? detail.Amt ?? detail.Amount,
    );
    if (!name || lineAmount <= 0) continue;

    if (
      isCashLedgerName(name) ||
      group.includes("cash") ||
      group.includes("bank")
    ) {
      amount = Math.max(amount, lineAmount);
      continue;
    }

    if (
      group.includes("debtor") ||
      group.includes("creditor") ||
      group.includes("sundry")
    ) {
      partyName = name;
      amount = Math.max(amount, lineAmount);
    } else if (!partyName) {
      partyName = name;
      amount = Math.max(amount, lineAmount);
    }
  }

  if (!partyName || amount <= 0) return null;

  return {
    partyName,
    direction,
    amount,
    date,
    paymentMode: "cash",
    notes: notes || `Imported BUSY ${direction} ${externalNumber}`,
    externalRef: externalNumber,
  };
}

function parseBusyDocumentVouchers(
  root: unknown,
): { bills: ImportBillRow[]; payments: ImportPaymentRow[] } {
  const bills: ImportBillRow[] = [];
  const payments: ImportPaymentRow[] = [];

  const saleRows = collectBusyNodes(root, ["Sale", "SALE"]);
  const purchaseRows = collectBusyNodes(root, ["Purchase", "PURCHASE"]);
  const receiptRows = collectBusyNodes(root, ["Receipt", "RECEIPT"]);
  const paymentRows = collectBusyNodes(root, ["Payment", "PAYMENT"]);

  let billIndex = 0;
  for (const [rows, billKind] of [
    [saleRows, "sale"],
    [purchaseRows, "purchase"],
  ] as const) {
    rows.forEach((voucher, index) => {
      const partyName = busyBillingParty(voucher);
      if (!partyName) return;

      const date = parseImportDate(voucher.Date ?? voucher.VCHDATE);
      const externalNumber = sanitizeBillNumber(
        textOf(voucher.VchNo ?? voucher.VCHNO ?? voucher.AutoVchNo),
        `${billKind === "sale" ? "S" : "P"}${billIndex + index + 1}`,
      );
      const lines = collectBusyDocBillLines(voucher);
      const sundryCharges = collectBusyDocSundries(voucher);
      const inventoryTotal = lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice,
        0,
      );
      const sundryTotal = sundryCharges.reduce((sum, row) => sum + row.amount, 0);
      const total =
        absAmount(voucher.tmpTotalAmt ?? voucher.tmpSalePurcAmt) ||
        inventoryTotal + sundryTotal;
      if (total <= 0) return;

      bills.push({
        externalNumber,
        billKind,
        billDate: date,
        partyName,
        displayName: partyName,
        lines,
        sundryCharges,
        total,
        paidAmount: 0,
        paymentMode: "credit",
        notes: `Imported from BUSY ${billKind} ${externalNumber}`,
      });
    });
    billIndex += rows.length;
  }

  receiptRows.forEach((voucher, index) => {
    const payment = parseBusyAccVoucher(voucher, "received", index);
    if (payment) payments.push(payment);
  });

  paymentRows.forEach((voucher, index) => {
    const payment = parseBusyAccVoucher(voucher, "paid", index);
    if (payment) payments.push(payment);
  });

  return { bills, payments };
}

function tallyVoucherAction(
  voucher: Record<string, unknown>,
): "sale" | "purchase" | "receipt" | "payment" | null {
  const vchType = textOf(
    voucher["@_VCHTYPE"] ??
      voucher.VCHTYPE ??
      voucher.VOUCHERTYPENAME ??
      voucher.VoucherType,
  ).toLowerCase();

  if (!vchType) return null;
  if (vchType.includes("credit note") || vchType.includes("debit note")) {
    return null;
  }
  if (vchType.includes("sales")) return "sale";
  if (vchType.includes("purchase")) return "purchase";
  if (vchType.includes("receipt")) return "receipt";
  if (vchType.includes("payment")) return "payment";
  return null;
}

function collectLedgerEntries(
  voucher: Record<string, unknown>,
): Array<{ name: string; amount: number }> {
  const tags = [
    "ALLLEDGERENTRIES.LIST",
    "LEDGERENTRIES.LIST",
    "LEDGERENTRY",
    "LedgerEntry",
  ];
  const rows: Array<{ name: string; amount: number }> = [];
  for (const tag of tags) {
    if (!voucher[tag]) continue;
    for (const entry of asArray(voucher[tag] as Record<string, unknown>)) {
      const name = textOf(
        (entry as Record<string, unknown>).LEDGERNAME ??
          (entry as Record<string, unknown>).LedgerName ??
          (entry as Record<string, unknown>).NAME,
      );
      const amount = numOf(
        (entry as Record<string, unknown>).AMOUNT ??
          (entry as Record<string, unknown>).Amount,
      );
      if (name) rows.push({ name, amount });
    }
  }
  return rows;
}

function collectInventoryLines(
  voucher: Record<string, unknown>,
): ImportBillRow["lines"] {
  const tags = [
    "ALLINVENTORYENTRIES.LIST",
    "INVENTORYENTRIES.LIST",
    "INVENTORYENTRY",
    "InventoryEntry",
    "ItemEntry",
  ];
  const lines: ImportBillRow["lines"] = [];

  for (const tag of tags) {
    if (!voucher[tag]) continue;
    for (const entry of asArray(voucher[tag] as Record<string, unknown>)) {
      const e = entry as Record<string, unknown>;
      const itemName = textOf(
        e.STOCKITEMNAME ?? e.ItemName ?? e.ITEMNAME ?? e.NAME,
      );
      if (!itemName) continue;
      const quantity = parseTallyQuantity(
        e.ACTUALQTY ?? e.BILLEDQTY ?? e.QTY ?? e.Quantity,
      );
      const unitPrice = parseTallyRate(e.RATE ?? e.Rate ?? e.PRICE);
      const lineTotal = absAmount(e.AMOUNT ?? e.Amount);
      const price =
        unitPrice > 0
          ? unitPrice
          : quantity > 0
            ? lineTotal / quantity
            : lineTotal;
      if (quantity <= 0 && lineTotal <= 0) continue;
      lines.push({
        itemName,
        quantity: quantity > 0 ? quantity : 1,
        unitPrice: price,
      });
    }
  }

  return lines;
}

function inferPartyName(
  voucher: Record<string, unknown>,
  ledgers: Array<{ name: string; amount: number }>,
): string {
  const direct = textOf(
    voucher.PARTYLEDGERNAME ??
      voucher.PARTYNAME ??
      voucher.AccountName ??
      voucher.ACCOUNTNAME,
  );
  if (direct) return direct;

  for (const row of ledgers) {
    const n = row.name.toLowerCase();
    if (isCashLedgerName(n)) continue;
    if (
      n.includes("sales") ||
      n.includes("purchase") ||
      n.includes("gst") ||
      n.includes("round")
    ) {
      continue;
    }
    return row.name;
  }
  return "";
}

function inferCashPaid(ledgers: Array<{ name: string; amount: number }>): number {
  let paid = 0;
  for (const row of ledgers) {
    if (!isCashLedgerName(row.name)) continue;
    paid += Math.abs(row.amount);
  }
  return paid;
}

function resolvePaymentMode(
  total: number,
  paid: number,
): ImportBillRow["paymentMode"] {
  if (paid <= 0) return "credit";
  if (paid >= total) return "cash";
  return "mixed";
}

export function parseTallyVouchers(
  root: unknown,
): { bills: ImportBillRow[]; payments: ImportPaymentRow[] } {
  const vouchers: Record<string, unknown>[] = [];
  walkNodes(root, "VOUCHER", vouchers);

  const bills: ImportBillRow[] = [];
  const payments: ImportPaymentRow[] = [];

  vouchers.forEach((voucher, index) => {
    const action = tallyVoucherAction(voucher);
    if (!action) return;

    const cancelled =
      textOf(voucher.ISCANCELLED ?? voucher.ISDELETED).toLowerCase() === "yes";
    if (cancelled) return;

    const date = parseImportDate(
      voucher.DATE ?? voucher.VoucherDate ?? voucher.BILLDATE,
    );
    const ledgers = collectLedgerEntries(voucher);
    const partyName = inferPartyName(voucher, ledgers);
    if (!partyName) return;

    const externalNumber = sanitizeBillNumber(
      textOf(
        voucher.VOUCHERNUMBER ??
          voucher.REFERENCE ??
          voucher.VCHNO ??
          voucher.BILLNO,
      ),
      `T${index + 1}`,
    );
    const notes = textOf(voucher.NARRATION ?? voucher.Narration ?? voucher.NOTES);

    if (action === "receipt" || action === "payment") {
      const amount =
        absAmount(voucher.AMOUNT) ||
        Math.max(...ledgers.map((l) => Math.abs(l.amount)), 0);
      if (amount <= 0) return;

      payments.push({
        partyName,
        direction: action === "receipt" ? "received" : "paid",
        amount,
        date,
        paymentMode: inferCashPaid(ledgers) > 0 ? "cash" : "cash",
        notes: notes || `Imported ${action} voucher ${externalNumber}`,
        externalRef: externalNumber,
      });
      return;
    }

    const lines = collectInventoryLines(voucher);
    const inventoryTotal = lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0,
    );
    const ledgerTotal = Math.max(
      ...ledgers
        .filter((l) => !isCashLedgerName(l.name))
        .map((l) => Math.abs(l.amount)),
      0,
    );
    const total = inventoryTotal > 0 ? inventoryTotal : ledgerTotal;
    if (total <= 0) return;

    const paidAmount = Math.min(total, inferCashPaid(ledgers));

    bills.push({
      externalNumber,
      billKind: action,
      billDate: date,
      partyName,
      displayName: partyName,
      lines,
      total,
      paidAmount,
      paymentMode: resolvePaymentMode(total, paidAmount),
      notes: notes || `Imported from Tally voucher ${externalNumber}`,
    });
  });

  return { bills, payments };
}

export function parseBusyVouchers(
  root: unknown,
): { bills: ImportBillRow[]; payments: ImportPaymentRow[] } {
  const docParsed = parseBusyDocumentVouchers(root);
  const tranParsed = parseBusyTranTables(root);

  const bills: ImportBillRow[] = [...docParsed.bills, ...tranParsed.bills];
  const payments: ImportPaymentRow[] = [
    ...docParsed.payments,
    ...tranParsed.payments,
  ];
  const seenBills = new Set(
    bills.map((b) => `${b.externalNumber}|${b.partyName}|${b.billDate.toISOString()}`),
  );
  const seenPayments = new Set(
    payments.map((p) => `${p.externalRef}|${p.partyName}|${p.date.toISOString()}`),
  );

  const vouchers: Record<string, unknown>[] = [];
  const voucherTags = [
    "Voucher",
    "VOUCHER",
    "VCH",
    "Vch",
    "Transaction",
    "TRANSACTION",
    "Tran",
    "TRAN",
    "SalesVch",
    "PurchaseVch",
  ];
  for (const tag of voucherTags) walkNodes(root, tag, vouchers);

  vouchers.forEach((voucher, index) => {
    const vchType = textOf(
      voucher.VchType ??
        voucher.VCHTYPE ??
        voucher.Type ??
        voucher.VoucherType ??
        voucher.TranType ??
        voucher.TRANTYPE,
    ).toLowerCase();

    const action = busyVchAction(vchType);
    if (!action) return;

    const date = parseImportDate(
      voucher.Date ??
        voucher.VoucherDate ??
        voucher.VCHDATE ??
        voucher.TranDate ??
        voucher.TRANDATE,
    );
    const partyName = textOf(
      voucher.PartyName ??
        voucher.AccountName ??
        voucher.PARTYNAME ??
        voucher.Account ??
        voucher.ACCOUNT,
    );
    if (!partyName) return;

    const externalNumber = sanitizeBillNumber(
      textOf(voucher.VchNo ?? voucher.VoucherNo ?? voucher.BillNo),
      `B${index + 1}`,
    );
    const notes = textOf(voucher.Narration ?? voucher.Remarks);

    if (action === "receipt" || action === "payment") {
      const amount = absAmount(
        voucher.Amount ?? voucher.Total ?? voucher.VchAmount,
      );
      if (amount <= 0) return;
      const paymentKey = `${externalNumber}|${partyName}|${date.toISOString()}`;
      if (seenPayments.has(paymentKey)) return;
      seenPayments.add(paymentKey);
      payments.push({
        partyName,
        direction: action === "receipt" ? "received" : "paid",
        amount,
        date,
        paymentMode: "cash",
        notes: notes || `Imported BUSY ${action} ${externalNumber}`,
        externalRef: externalNumber,
      });
      return;
    }

    const lines: ImportBillRow["lines"] = [];
    const itemTags = [
      "Item",
      "ITEM",
      "ItemDetail",
      "InventoryItem",
      "ItemEntry",
      "ITEMENTRY",
      "TranItem",
      "TRANITEM",
    ];
    for (const tag of itemTags) {
      if (!voucher[tag]) continue;
      for (const entry of asArray(voucher[tag] as Record<string, unknown>)) {
        const e = entry as Record<string, unknown>;
        const itemName = textOf(e.ItemName ?? e.Name ?? e.ITEMNAME);
        if (!itemName) continue;
        const quantity = parseTallyQuantity(e.Qty ?? e.Quantity ?? e.QTY);
        const unitPrice = parseTallyRate(e.Rate ?? e.Price ?? e.MRP);
        if (quantity <= 0 && unitPrice <= 0) continue;
        lines.push({
          itemName,
          quantity: quantity > 0 ? quantity : 1,
          unitPrice: unitPrice > 0 ? unitPrice : absAmount(e.Amount),
        });
      }
    }

    const total = absAmount(
      voucher.Amount ?? voucher.Total ?? voucher.GrandTotal,
    ) || lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    if (total <= 0) return;

    const paidAmount = absAmount(voucher.PaidAmount ?? voucher.CashAmount);

    const billKey = `${externalNumber}|${partyName}|${date.toISOString()}`;
    if (seenBills.has(billKey)) return;
    seenBills.add(billKey);

    bills.push({
      externalNumber,
      billKind: action,
      billDate: date,
      partyName,
      displayName: partyName,
      lines,
      total,
      paidAmount: Math.min(total, paidAmount),
      paymentMode: resolvePaymentMode(total, paidAmount),
      notes: notes || `Imported from BUSY voucher ${externalNumber}`,
    });
  });

  return { bills, payments };
}

export function parseCsvVouchers(csv: string): {
  bills: ImportBillRow[];
  payments: ImportPaymentRow[];
} {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { bills: [], payments: [] };

  const splitCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  const headerIndex = (headers: string[], candidates: string[]) => {
    const normalized = headers.map((h) =>
      h.toLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    for (const candidate of candidates) {
      const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
      const idx = normalized.indexOf(key);
      if (idx >= 0) return idx;
      const fuzzy = normalized.findIndex((h) => h.includes(key));
      if (fuzzy >= 0) return fuzzy;
    }
    return -1;
  };

  const headers = splitCsvLine(lines[0]);
  const typeIdx = headerIndex(headers, [
    "vouchertype",
    "vchtype",
    "type",
    "transactiontype",
  ]);
  const dateIdx = headerIndex(headers, ["date", "voucherdate", "billdate"]);
  const partyIdx = headerIndex(headers, ["party", "customer", "account", "ledger"]);
  const itemIdx = headerIndex(headers, ["item", "product", "stockitem"]);
  const qtyIdx = headerIndex(headers, ["qty", "quantity"]);
  const rateIdx = headerIndex(headers, ["rate", "price", "mrp"]);
  const amountIdx = headerIndex(headers, ["amount", "total", "value"]);
  const paidIdx = headerIndex(headers, ["paid", "paidamount", "cash"]);
  const numberIdx = headerIndex(headers, [
    "voucherno",
    "billno",
    "invoiceno",
    "number",
  ]);
  const notesIdx = headerIndex(headers, ["narration", "notes", "remarks"]);

  const bills: ImportBillRow[] = [];
  const payments: ImportPaymentRow[] = [];

  for (const [i, line] of lines.slice(1).entries()) {
    const cols = splitCsvLine(line);
    const vchType = (typeIdx >= 0 ? cols[typeIdx] ?? "" : "").toLowerCase();
    const partyName = partyIdx >= 0 ? cols[partyIdx] ?? "" : "";
    if (!partyName) continue;

    const date =
      dateIdx >= 0 ? parseImportDate(cols[dateIdx]) : new Date();
    const externalNumber = sanitizeBillNumber(
      numberIdx >= 0 ? cols[numberIdx] ?? "" : "",
      `C${i + 1}`,
    );
    const notes = notesIdx >= 0 ? cols[notesIdx] ?? "" : "";

    if (vchType.includes("receipt")) {
      const amount = amountIdx >= 0 ? absAmount(cols[amountIdx]) : 0;
      if (amount <= 0) continue;
      payments.push({
        partyName,
        direction: "received",
        amount,
        date,
        paymentMode: "cash",
        notes,
        externalRef: externalNumber,
      });
      continue;
    }

    if (vchType.includes("payment")) {
      const amount = amountIdx >= 0 ? absAmount(cols[amountIdx]) : 0;
      if (amount <= 0) continue;
      payments.push({
        partyName,
        direction: "paid",
        amount,
        date,
        paymentMode: "cash",
        notes,
        externalRef: externalNumber,
      });
      continue;
    }

    const isSale = vchType.includes("sale");
    const isPurchase = vchType.includes("purchase");
    if (!isSale && !isPurchase) continue;

    const itemName = itemIdx >= 0 ? cols[itemIdx] ?? "" : "";
    const quantity = qtyIdx >= 0 ? parseTallyQuantity(cols[qtyIdx]) : 1;
    const unitPrice = rateIdx >= 0 ? parseTallyRate(cols[rateIdx]) : 0;
    const total = amountIdx >= 0 ? absAmount(cols[amountIdx]) : 0;
    const paidAmount = paidIdx >= 0 ? absAmount(cols[paidIdx]) : 0;

    const billLines: ImportBillRow["lines"] = itemName
      ? [
          {
            itemName,
            quantity: quantity > 0 ? quantity : 1,
            unitPrice:
              unitPrice > 0
                ? unitPrice
                : total > 0
                  ? total / Math.max(quantity, 1)
                  : 0,
          },
        ]
      : [];

    const computedTotal =
      total > 0
        ? total
        : billLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    if (computedTotal <= 0) continue;

    bills.push({
      externalNumber,
      billKind: isPurchase ? "purchase" : "sale",
      billDate: date,
      partyName,
      displayName: partyName,
      lines: billLines,
      total: computedTotal,
      paidAmount: Math.min(computedTotal, paidAmount),
      paymentMode: resolvePaymentMode(computedTotal, paidAmount),
      notes,
    });
  }

  return { bills, payments };
}
