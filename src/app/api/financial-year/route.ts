import { jsonError, jsonOk } from "@/lib/http";
import {
  getFinancialYearConfig,
  setFinancialYearConfig,
  getActiveFyRange,
  getFyRange,
} from "@/lib/financial-year";
import { db } from "@/lib/db";
import { format } from "date-fns";
import { getRetainedEarnings } from "@/lib/services/financial-reports";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = await getFinancialYearConfig();
    const activeRange = await getActiveFyRange(config);

    return jsonOk({
      activeFy: activeRange,
      config,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function POST() {
  try {
    const config = await getFinancialYearConfig();
    const activeRange = await getActiveFyRange(config);
    
    // We want to close the current active FY early (or process the closure)
    const endDateStr = format(activeRange.end, "yyyy-MM-dd");
    
    if (config.earlyClosedEnds.includes(endDateStr)) {
        return jsonError("This financial year is already closed.", 400);
    }
    
    // Carry forward Retained Earnings
    // First, let's see what the net income is for this FY.
    const reReport = await getRetainedEarnings(activeRange.start, activeRange.end);
    
    // Create/update the "Retained Earnings" ledger account
    let reLedger = await db.ledgerAccount.findFirst({
        where: { name: "Retained Earnings", accountKind: "equity" }
    });
    
    if (!reLedger) {
        reLedger = await db.ledgerAccount.create({
            data: {
                name: "Retained Earnings",
                accountKind: "equity",
                openingBalance: 0,
                balance: 0,
                sourceSystem: "system"
            }
        });
    }

    // Carry forward party balances as opening balances for the next FY.
    // Instead of duplicating records, we rely on live `party.balance`.
    // Wait, the spec says:
    // "On first use of a new FY (or on Close Year), write a system opening ledger row per party with non-zero balance: notes: "Opening balance FY YYYY-YY", date = FY start, refType: "opening""
    
    // We will stamp this on the start of the next FY.
    const nextFyStart = new Date(activeRange.end.getTime() + 2 * 24 * 60 * 60 * 1000); 
    const nextRange = getFyRange(nextFyStart, config);
    
    await db.$transaction(async (tx) => {
        // Stamp Retained Earnings
        const currentBalance = reLedger!.balance;
        const newBalance = currentBalance + reReport.netIncome; // Equity is normal credit, so positive is credit. Net Income (positive) increases equity.
        
        await tx.ledgerAccount.update({
            where: { id: reLedger!.id },
            data: { balance: newBalance }
        });
        
        // Add a ledger transaction for Retained earnings update
        // We need a dummy voucher or just directly in LedgerAccount because we don't have a ledgerTransaction for non-party ledgers in the same way, we have VoucherAccountLine
        
        await tx.voucher.create({
            data: {
                voucherType: "journal",
                voucherNumber: `FYC-${nextRange.label}`,
                voucherDate: activeRange.end,
                narration: "Financial Year Close - Transfer to Retained Earnings",
                accountLines: {
                    create: [
                        {
                            ledgerId: reLedger!.id,
                            ledgerName: reLedger!.name,
                            entryType: reReport.netIncome > 0 ? "credit" : "debit",
                            amount: Math.abs(reReport.netIncome),
                        }
                    ]
                }
            }
        });

        // Stamp opening balances for parties
        const parties = await tx.party.findMany({
            where: { balance: { not: 0 } }
        });
        
        for (const party of parties) {
            // Check if already stamped
            const existing = await tx.ledgerTransaction.findFirst({
                where: {
                    partyId: party.id,
                    refType: "opening",
                    date: nextRange.start,
                    notes: `Opening balance FY ${nextRange.label}`
                }
            });
            
            if (!existing) {
                const amount = Math.abs(party.balance);
                let entryType = party.balance > 0 ? "credit" : "debit";
                if (party.partyType === "customer") {
                    entryType = party.balance > 0 ? "debit" : "credit"; // Wait, positive balance for customer means they owe us (Asset/Debit)
                } else {
                    entryType = party.balance > 0 ? "credit" : "debit"; // Positive for supplier means we owe them (Liability/Credit)
                }

                await tx.ledgerTransaction.create({
                    data: {
                        partyId: party.id,
                        partyType: party.partyType,
                        entryType,
                        amount,
                        paymentMode: "credit", // non-cash
                        date: nextRange.start,
                        notes: `Opening balance FY ${nextRange.label}`,
                        refType: "opening",
                        balanceAfterParty: party.balance // unchanged actual live balance
                    }
                });
            }
        }
    });

    config.earlyClosedEnds.push(endDateStr);
    await setFinancialYearConfig(config);

    return jsonOk({ success: true, closedFyLabel: activeRange.label, nextFyLabel: nextRange.label });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
