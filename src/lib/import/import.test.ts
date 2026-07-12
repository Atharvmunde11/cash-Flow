import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { XMLParser } from "fast-xml-parser";
import {
  classifyAccountGroup,
  isCashPartyAlias,
  partyTypeFromAccountKind,
  resolveGuestDisplayName,
} from "./account-classify";
import { detectAndParseImportFile } from "./parse-import-file";
import { numOf, textOf } from "./parse-utils";
import { parseBusyVouchers } from "./parse-vouchers";

describe("import parse-utils", () => {
  it("textOf reads plain strings and numbers", () => {
    assert.equal(textOf("  hello "), "hello");
    assert.equal(textOf(42), "42");
    assert.equal(textOf(null), "");
  });

  it("textOf reads XML #text nodes", () => {
    assert.equal(textOf({ "#text": "  item " }), "item");
  });

  it("numOf parses amounts with commas", () => {
    assert.equal(numOf("1,234.50"), 1234.5);
    assert.equal(numOf(""), 0);
    assert.equal(numOf("n/a"), 0);
  });
});

describe("universal account classification", () => {
  it("maps sundry debtors/creditors to receivable/payable", () => {
    assert.equal(classifyAccountGroup("Sundry Debtors"), "receivable");
    assert.equal(classifyAccountGroup("Sundry Creditors"), "payable");
    assert.equal(partyTypeFromAccountKind("receivable"), "customer");
    assert.equal(partyTypeFromAccountKind("payable"), "supplier");
  });

  it("maps bank and cash groups", () => {
    assert.equal(classifyAccountGroup("Bank Accounts"), "bank");
    assert.equal(classifyAccountGroup("Cash-in-hand"), "cash");
  });

  it("maps tax and expense groups", () => {
    assert.equal(classifyAccountGroup("Duties & Taxes"), "tax");
    assert.equal(classifyAccountGroup("Expenses (Indirect/Admn.)"), "expense");
  });
});

describe("Guest / cash party aliases", () => {
  it("detects Cash and CASH PAYMENT aliases", () => {
    assert.equal(isCashPartyAlias("Cash"), true);
    assert.equal(isCashPartyAlias("CASH  PAYMENT"), true);
    assert.equal(isCashPartyAlias("cash payment"), true);
    assert.equal(isCashPartyAlias("LALIT RATHOD"), false);
  });

  it("resolves Guest only for cash aliases", () => {
    const guest = resolveGuestDisplayName("CASH  PAYMENT");
    assert.equal(guest.isGuest, true);
    assert.equal(guest.displayName, "Guest");
    assert.equal(guest.createParty, false);

    const named = resolveGuestDisplayName("LALIT RATHOD");
    assert.equal(named.isGuest, false);
    assert.equal(named.displayName, "LALIT RATHOD");
    assert.equal(named.createParty, true);
  });
});

describe("Busy voucher Guest + bank tender", () => {
  it("maps CASH PAYMENT sale to Guest with cash mode", () => {
    const xml = `<?xml version="1.0"?><BusyData>
      <Sales><Sale>
        <VchSeriesName>Main</VchSeriesName>
        <Date>01-04-2026</Date>
        <VchType>9</VchType>
        <VchNo>G1</VchNo>
        <MasterName1>CASH  PAYMENT</MasterName1>
        <OriginalID>Main;01-04-2026;G1;Sale</OriginalID>
        <BillingDetails><PartyName>CASH  PAYMENT</PartyName></BillingDetails>
        <ItemEntries><ItemDetail>
          <ItemName>CEMENT</ItemName><Qty>1</Qty><Price>100</Price>
          <Amt>100</Amt><NettAmount>100</NettAmount>
        </ItemDetail></ItemEntries>
        <AccEntries>
          <AccDetail><AccountName>Cash</AccountName><AmountType>1</AmountType>
            <AmtMainCur>-100</AmtMainCur><tmpGroupName>Cash-in-hand</tmpGroupName></AccDetail>
          <AccDetail><AccountName>Sales</AccountName><AmountType>2</AmountType>
            <AmtMainCur>100</AmtMainCur><tmpGroupName>Sale</tmpGroupName></AccDetail>
        </AccEntries>
        <tmpTotalAmt>100</tmpTotalAmt>
      </Sale></Sales>
    </BusyData>`;

    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
    });
    const root = parser.parse(xml);
    const { bills } = parseBusyVouchers(root);
    assert.equal(bills.length, 1);
    assert.equal(bills[0].displayName, "Guest");
    assert.equal(bills[0].isGuest, true);
    assert.equal(bills[0].paymentMode, "cash");
    assert.ok((bills[0].accountLines?.length ?? 0) >= 2);
  });

  it("keeps named walk-in on cash sale", () => {
    const xml = `<?xml version="1.0"?><BusyData>
      <Sales><Sale>
        <Date>01-04-2026</Date><VchType>9</VchType><VchNo>N1</VchNo>
        <MasterName1>Cash</MasterName1>
        <BillingDetails><PartyName>LALIT RATHOD</PartyName></BillingDetails>
        <ItemEntries><ItemDetail>
          <ItemName>TILE</ItemName><Qty>1</Qty><Price>9000</Price>
          <Amt>9000</Amt><NettAmount>9000</NettAmount>
        </ItemDetail></ItemEntries>
        <AccEntries>
          <AccDetail><AccountName>Cash</AccountName><AmountType>1</AmountType>
            <AmtMainCur>-9000</AmtMainCur><tmpGroupName>Cash-in-hand</tmpGroupName></AccDetail>
        </AccEntries>
        <tmpTotalAmt>9000</tmpTotalAmt>
      </Sale></Sales>
    </BusyData>`;
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
    });
    const { bills } = parseBusyVouchers(parser.parse(xml));
    assert.equal(bills[0].displayName, "LALIT RATHOD");
    assert.equal(bills[0].isGuest, false);
    assert.equal(bills[0].paymentMode, "cash");
  });

  it("detects bank receipt tender", () => {
    const xml = `<?xml version="1.0"?><BusyData>
      <Rcpts><Receipt>
        <Date>01-04-2026</Date><VchType>14</VchType><VchNo>R1</VchNo>
        <AccEntries>
          <AccDetail><AccountName>PAWAN KOLHE</AccountName><AmountType>2</AmountType>
            <AmtMainCur>99000</AmtMainCur><tmpGroupName>Sundry Debtors</tmpGroupName></AccDetail>
          <AccDetail><AccountName>ICICI BANK</AccountName><AmountType>1</AmountType>
            <AmtMainCur>99000</AmtMainCur><tmpGroupName>Bank Accounts</tmpGroupName></AccDetail>
        </AccEntries>
      </Receipt></Rcpts>
    </BusyData>`;
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
    });
    const { payments } = parseBusyVouchers(parser.parse(xml));
    assert.equal(payments.length, 1);
    assert.equal(payments[0].partyName, "PAWAN KOLHE");
    assert.equal(payments[0].paymentMode, "bank");
    assert.equal(payments[0].bankLedgerName, "ICICI BANK");
  });
});

describe("Busy masters ledgers", () => {
  it("parses AccountGroups and bank/cash/debtor ledgers without making Cash a party", () => {
    const xml = `<?xml version="1.0"?><BusyData FinYear="01-04-2026">
      <AccountGroups>
        <AccountGroup><Name>Current Assets</Name><PrimaryGroup>True</PrimaryGroup><tmpCode>102</tmpCode></AccountGroup>
        <AccountGroup><Name>Sundry Debtors</Name><ParentGroupName>Current Assets</ParentGroupName><tmpCode>116</tmpCode></AccountGroup>
        <AccountGroup><Name>Bank Accounts</Name><ParentGroupName>Current Assets</ParentGroupName><tmpCode>112</tmpCode></AccountGroup>
        <AccountGroup><Name>Cash-in-hand</Name><ParentGroupName>Current Assets</ParentGroupName><tmpCode>111</tmpCode></AccountGroup>
      </AccountGroups>
      <Accounts>
        <Account><Name>Vivek Jagrut</Name><ParentGroup>Sundry Debtors</ParentGroup><tmpCode>1464</tmpCode></Account>
        <Account><Name>ICICI BANK</Name><ParentGroup>Bank Accounts</ParentGroup><tmpCode>1481</tmpCode></Account>
        <Account><Name>Cash</Name><ParentGroup>Cash-in-hand</ParentGroup><OPBal>-100</OPBal><tmpCode>1</tmpCode></Account>
        <Account><Name>ULTRATECH</Name><ParentGroup>Sundry Creditors</ParentGroup><tmpCode>33</tmpCode></Account>
      </Accounts>
    </BusyData>`;

    const data = detectAndParseImportFile("masters.dat", xml, "busy");
    assert.ok(data.accountGroups.length >= 3);
    assert.ok(data.ledgers.some((l) => l.accountKind === "receivable"));
    assert.ok(data.ledgers.some((l) => l.accountKind === "bank"));
    assert.ok(data.ledgers.some((l) => l.accountKind === "cash"));
    assert.ok(data.parties.some((p) => p.name === "Vivek Jagrut" && p.partyType === "customer"));
    assert.ok(data.parties.some((p) => p.name === "ULTRATECH" && p.partyType === "supplier"));
    assert.ok(!data.parties.some((p) => p.name.toLowerCase() === "cash"));
  });
});

function computeBillTotal(
  lines: Array<{ quantity: number; unitPrice: number }>,
  sundries: number[],
) {
  const linesTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const sundryTotal = sundries.reduce((s, n) => s + n, 0);
  return linesTotal + sundryTotal;
}

describe("bill totals", () => {
  it("sums line items and sundry charges", () => {
    const total = computeBillTotal(
      [
        { quantity: 2, unitPrice: 100 },
        { quantity: 1, unitPrice: 50 },
      ],
      [18, 18],
    );
    assert.equal(total, 286);
  });
});
