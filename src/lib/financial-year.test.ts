import test from "node:test";
import assert from "node:assert";
import { getFyRange, isDateLocked, DEFAULT_FY_CONFIG, type FinancialYearConfig } from "./financial-year";

test("financial year date ranges (Indian April-March)", () => {
    // Before April 1
    const t1 = new Date(2025, 1, 15, 12, 0, 0); // Feb 15, 2025
    const r1 = getFyRange(t1);
    assert.strictEqual(r1.label, "2024-25");
    assert.strictEqual(r1.start.getFullYear(), 2024);
    assert.strictEqual(r1.start.getMonth(), 3); // April
    assert.strictEqual(r1.start.getDate(), 1);
    assert.strictEqual(r1.end.getFullYear(), 2025);
    assert.strictEqual(r1.end.getMonth(), 2); // March
    assert.strictEqual(r1.end.getDate(), 31);
    
    // After April 1
    const t2 = new Date(2025, 4, 10, 12, 0, 0); // May 10, 2025
    const r2 = getFyRange(t2);
    assert.strictEqual(r2.label, "2025-26");
    assert.strictEqual(r2.start.getFullYear(), 2025);
    assert.strictEqual(r2.end.getFullYear(), 2026);
    
    // Exactly April 1
    const t3 = new Date(2026, 3, 1, 0, 0, 0); // Apr 1, 2026
    const r3 = getFyRange(t3);
    assert.strictEqual(r3.label, "2026-27");
    
    // Exactly March 31
    const t4 = new Date(2026, 2, 31, 23, 59, 59); // Mar 31, 2026
    const r4 = getFyRange(t4);
    assert.strictEqual(r4.label, "2025-26");
});

test("isDateLocked logic", async () => {
    // Current FY is definitely open by default
    const today = new Date();
    const config: FinancialYearConfig = { ...DEFAULT_FY_CONFIG, earlyClosedEnds: [] };
    
    const todayLocked = await isDateLocked(today, config);
    assert.strictEqual(todayLocked, false);
    
    // A date 2 years ago should be auto-locked
    const past = new Date(today.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
    const pastLocked = await isDateLocked(past, config);
    assert.strictEqual(pastLocked, true);
    
    // Early close logic
    const fyRange = getFyRange(today);
    // Let's pretend the current FY is closed early
    const endDateStr = fyRange.end.toISOString().split("T")[0]; // YYYY-MM-DD
    const earlyCloseConfig: FinancialYearConfig = { ...DEFAULT_FY_CONFIG, earlyClosedEnds: [endDateStr] };
    
    const nowLocked = await isDateLocked(today, earlyCloseConfig);
    assert.strictEqual(nowLocked, true);
});
