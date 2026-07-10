import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partyBalanceDelta } from "./ledger";

describe("partyBalanceDelta", () => {
  it("increases customer balance on debit", () => {
    assert.equal(partyBalanceDelta("customer", "debit", 100), 100);
  });

  it("decreases customer balance on credit", () => {
    assert.equal(partyBalanceDelta("customer", "credit", 50), -50);
  });

  it("decreases supplier balance on debit (payment to supplier)", () => {
    assert.equal(partyBalanceDelta("supplier", "debit", 200), -200);
  });

  it("increases supplier balance on credit (purchase on credit)", () => {
    assert.equal(partyBalanceDelta("supplier", "credit", 75), 75);
  });
});
