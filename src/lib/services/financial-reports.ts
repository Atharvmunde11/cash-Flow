import { db } from "@/lib/db";
import { getFyRange, type FinancialYearConfig, getFinancialYearConfig } from "@/lib/financial-year";

export interface AccountBalance {
  ledgerId: string;
  name: string;
  accountKind: string;
  balance: number; // Positive means debit balance for Assets/Expenses, credit balance for Liabilities/Equity/Revenue
}

export interface BalanceSheet {
  asOfDate: Date;
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
}

export interface IncomeStatement {
  start: Date;
  end: Date;
  revenue: AccountBalance[];
  expenses: AccountBalance[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export interface CashflowStatement {
  start: Date;
  end: Date;
  operatingCashflow: number;
  investingCashflow: number; // Simplified for now
  financingCashflow: number; // Simplified for now
  netCashChange: number;
  beginningCash: number;
  endingCash: number;
}

export interface RetainedEarningsStatement {
  start: Date;
  end: Date;
  beginningBalance: number;
  netIncome: number;
  dividends: number;
  endingBalance: number;
}

async function getLedgerBalancesAsOf(date: Date): Promise<AccountBalance[]> {
  // SQLite doesn't natively have easy date boundaries for balances in Prisma, 
  // so we'll recalculate the balance for all accounts from opening balance + transactions up to date.
  const ledgers = await db.ledgerAccount.findMany({
    include: {
      voucherLines: {
        where: {
          voucher: { voucherDate: { lte: date } },
        },
        include: { voucher: true }
      }
    }
  });

  const balances: AccountBalance[] = [];
  
  for (const ledger of ledgers) {
    let balance = ledger.openingBalance;
    for (const line of ledger.voucherLines) {
      if (line.entryType === "debit") {
        balance += line.amount;
      } else {
        balance -= line.amount;
      }
    }
    
    // For Liability, Equity, and Income, a credit is a positive balance.
    // For Asset and Expense, a debit is a positive balance.
    const isCreditNormal = ["liability", "equity", "income", "payable"].includes(ledger.accountKind);
    
    if (isCreditNormal) {
      balance = -balance;
    }

    balances.push({
      ledgerId: ledger.id,
      name: ledger.name,
      accountKind: ledger.accountKind,
      balance
    });
  }
  
  return balances;
}

export async function getBalanceSheet(asOfDate: Date): Promise<BalanceSheet> {
  const allBalances = await getLedgerBalancesAsOf(asOfDate);
  
  const assets = allBalances.filter(b => ["asset", "cash", "bank", "receivable", "stock"].includes(b.accountKind) && b.balance !== 0);
  const liabilities = allBalances.filter(b => ["liability", "payable", "tax"].includes(b.accountKind) && b.balance !== 0);
  const equity = allBalances.filter(b => ["equity"].includes(b.accountKind) && b.balance !== 0);

  // We need to add the Net Income for the current year to Equity (Retained Earnings) if not already closed.
  const config = await getFinancialYearConfig();
  const fy = getFyRange(asOfDate, config);
  const incomeStatement = await getIncomeStatement(fy.start, asOfDate);
  
  // Create a synthetic entry for Current Year Earnings if there is any net income.
  if (incomeStatement.netIncome !== 0) {
      const existingRetained = equity.find(e => e.name === "Current Year Earnings");
      if (existingRetained) {
          existingRetained.balance += incomeStatement.netIncome;
      } else {
        equity.push({
            ledgerId: "current-year-earnings",
            name: "Current Year Earnings",
            accountKind: "equity",
            balance: incomeStatement.netIncome
        });
      }
  }
  
  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
  const totalEquity = equity.reduce((s, e) => s + e.balance, 0);
  
  return {
    asOfDate,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilitiesAndEquity: totalLiabilities + totalEquity
  };
}

export async function getIncomeStatement(start: Date, end: Date): Promise<IncomeStatement> {
  const ledgers = await db.ledgerAccount.findMany({
    where: { accountKind: { in: ["income", "expense"] } },
    include: {
      voucherLines: {
        where: {
          voucher: { voucherDate: { gte: start, lte: end } }
        }
      }
    }
  });

  const revenue: AccountBalance[] = [];
  const expenses: AccountBalance[] = [];
  
  for (const ledger of ledgers) {
    let balance = 0; // Only for this period, so we don't include opening balance
    for (const line of ledger.voucherLines) {
      if (line.entryType === "credit") {
        balance += line.amount;
      } else {
        balance -= line.amount;
      }
    }
    
    if (balance === 0) continue;
    
    if (ledger.accountKind === "income") {
      revenue.push({
        ledgerId: ledger.id,
        name: ledger.name,
        accountKind: ledger.accountKind,
        balance: balance // Credit is positive for revenue
      });
    } else if (ledger.accountKind === "expense") {
      expenses.push({
        ledgerId: ledger.id,
        name: ledger.name,
        accountKind: ledger.accountKind,
        balance: -balance // Debit is positive for expenses
      });
    }
  }
  
  const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.balance, 0);
  
  return {
    start,
    end,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses
  };
}

export async function getCashflow(start: Date, end: Date): Promise<CashflowStatement> {
  // Simplistic indirect approach for now based on changes in cash and bank.
  const startBalances = await getLedgerBalancesAsOf(new Date(start.getTime() - 1));
  const endBalances = await getLedgerBalancesAsOf(end);
  
  const getCashTotal = (balances: AccountBalance[]) => {
      return balances.filter(b => b.accountKind === "cash" || b.accountKind === "bank").reduce((s, b) => s + b.balance, 0);
  };
  
  const beginningCash = getCashTotal(startBalances);
  const endingCash = getCashTotal(endBalances);
  const netCashChange = endingCash - beginningCash;
  
  // Very simplified approximation: just dump it in operating. 
  // In a real system you'd classify each voucher by its opposing accounts.
  return {
      start,
      end,
      beginningCash,
      endingCash,
      netCashChange,
      operatingCashflow: netCashChange,
      investingCashflow: 0,
      financingCashflow: 0
  };
}

export async function getRetainedEarnings(start: Date, end: Date): Promise<RetainedEarningsStatement> {
  const startBalances = await getLedgerBalancesAsOf(new Date(start.getTime() - 1));
  
  let beginningBalance = 0;
  const retainedLedger = startBalances.find(b => b.name === "Retained Earnings");
  if (retainedLedger) {
      beginningBalance = retainedLedger.balance;
  }
  
  const incomeStatement = await getIncomeStatement(start, end);
  
  // Assume no dividends tracked yet
  const dividends = 0;
  
  return {
      start,
      end,
      beginningBalance,
      netIncome: incomeStatement.netIncome,
      dividends,
      endingBalance: beginningBalance + incomeStatement.netIncome - dividends
  };
}
