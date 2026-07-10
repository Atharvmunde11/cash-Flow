import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { numOf, textOf } from "./parse-utils";

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
