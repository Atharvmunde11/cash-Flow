"use client";

import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney as formatCurrency, formatMoneyAbs } from "@/lib/format";

function fetchReport(endpoint: string, fy?: string) {
  const url = fy ? `/api/reports/${endpoint}?fy=${fy}` : `/api/reports/${endpoint}`;
  return fetch(url).then(res => res.json()).then(json => json.data);
}

function formatSignedMoney(value: number, negativeLabel = "Loss") {
  const n = Number(value) || 0;
  if (n < 0) return `${formatMoneyAbs(n)} (${negativeLabel})`;
  return formatCurrency(n);
}

export default function ReportsPage() {
  const fyQuery = useQuery({
    queryKey: ["financial-year"],
    queryFn: async () => {
      const res = await fetch("/api/financial-year");
      const json = await res.json();
      return json.data;
    }
  });

  const activeFyLabel = fyQuery.data?.activeFy?.label;

  const bsQuery = useQuery({
    queryKey: ["report", "balance-sheet", activeFyLabel],
    queryFn: () => fetchReport("balance-sheet", activeFyLabel),
    enabled: !!activeFyLabel
  });

  const isQuery = useQuery({
    queryKey: ["report", "income-statement", activeFyLabel],
    queryFn: () => fetchReport("income-statement", activeFyLabel),
    enabled: !!activeFyLabel
  });

  const cfQuery = useQuery({
    queryKey: ["report", "cashflow", activeFyLabel],
    queryFn: () => fetchReport("cashflow", activeFyLabel),
    enabled: !!activeFyLabel
  });

  const reQuery = useQuery({
    queryKey: ["report", "retained-earnings", activeFyLabel],
    queryFn: () => fetchReport("retained-earnings", activeFyLabel),
    enabled: !!activeFyLabel
  });

  const bsData = bsQuery.data;
  const isData = isQuery.data;
  const cfData = cfQuery.data;
  const reData = reQuery.data;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial Reports</h1>
        <p className="text-sm text-muted-foreground">
          View comprehensive financial statements. Currently viewing:{" "}
          <span className="font-medium text-foreground">
            {activeFyLabel || "Loading..."}
          </span>
          . Built from ledger vouchers (imports / accounting entries)—not the
          daybook cash drawer.
        </p>
      </div>

      <Tabs defaultValue="balance-sheet">
        <TabsList>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="income-statement">Profit & Loss (Income Statement)</TabsTrigger>
          <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
          <TabsTrigger value="retained-earnings">Retained Earnings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="balance-sheet" className="pt-4">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Balance Sheet</h2>
            {(bsQuery.isLoading || bsQuery.isIdle || !bsData) ? <p>Loading...</p> : bsQuery.isError ? <p className="text-destructive">Failed to load</p> : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium border-b pb-2 mb-2">Assets</h3>
                  <Table>
                    <TableBody>
                      {bsData.assets.map((a: any) => (
                        <TableRow key={a.ledgerId}>
                          <TableCell>{a.name}</TableCell>
                          <TableCell className="text-right">{formatMoneyAbs(a.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between mt-2 font-bold p-2 bg-muted/50 rounded">
                      <span>Total Assets</span>
                      <span>{formatMoneyAbs(bsData.totalAssets)}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium border-b pb-2 mb-2">Liabilities</h3>
                  <Table>
                    <TableBody>
                      {bsData.liabilities.map((a: any) => (
                        <TableRow key={a.ledgerId}>
                          <TableCell>{a.name}</TableCell>
                          <TableCell className="text-right">{formatMoneyAbs(a.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <h3 className="text-lg font-medium border-b pb-2 mb-2">Equity</h3>
                  <Table>
                    <TableBody>
                      {bsData.equity.map((a: any) => (
                        <TableRow key={a.ledgerId}>
                          <TableCell>{a.name}</TableCell>
                          <TableCell className="text-right">{formatMoneyAbs(a.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <div className="flex justify-between mt-2 font-bold p-2 bg-muted/50 rounded">
                      <span>Total Liabilities & Equity</span>
                      <span>{formatMoneyAbs(bsData.totalLiabilitiesAndEquity)}</span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="income-statement" className="pt-4">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Profit & Loss (Income Statement)</h2>
            {(isQuery.isLoading || isQuery.isIdle || !isData) ? <p>Loading...</p> : isQuery.isError ? <p className="text-destructive">Failed to load</p> : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium border-b pb-2 mb-2">Revenue</h3>
                  <Table>
                    <TableBody>
                      {isData.revenue.map((a: any) => (
                        <TableRow key={a.ledgerId}>
                          <TableCell>{a.name}</TableCell>
                          <TableCell className="text-right">{formatMoneyAbs(a.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between mt-2 font-bold p-2 bg-muted/50 rounded">
                      <span>Total Revenue</span>
                      <span>{formatMoneyAbs(isData.totalRevenue)}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium border-b pb-2 mb-2">Expenses</h3>
                  <Table>
                    <TableBody>
                      {isData.expenses.map((a: any) => (
                        <TableRow key={a.ledgerId}>
                          <TableCell>{a.name}</TableCell>
                          <TableCell className="text-right">{formatMoneyAbs(a.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between mt-2 font-bold p-2 bg-muted/50 rounded">
                      <span>Total Expenses</span>
                      <span>{formatMoneyAbs(isData.totalExpenses)}</span>
                  </div>
                </div>

                <div className="flex justify-between mt-4 font-bold text-lg p-2 bg-primary/10 rounded">
                      <span>Net Income</span>
                      <span>{formatSignedMoney(isData.netIncome)}</span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="cashflow" className="pt-4">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Cashflow Statement</h2>
            {(cfQuery.isLoading || cfQuery.isIdle || !cfData) ? <p>Loading...</p> : cfQuery.isError ? <p className="text-destructive">Failed to load</p> : (
              <div className="space-y-4">
                <div className="flex justify-between p-2 border-b">
                    <span>Beginning Cash Balance</span>
                    <span>{formatMoneyAbs(cfData.beginningCash)}</span>
                </div>
                <div className="flex justify-between p-2 border-b">
                    <span>Operating Cashflow</span>
                    <span>{formatSignedMoney(cfData.operatingCashflow, "outflow")}</span>
                </div>
                <div className="flex justify-between p-2 border-b">
                    <span>Net Cash Change</span>
                    <span>{formatSignedMoney(cfData.netCashChange, "decrease")}</span>
                </div>
                <div className="flex justify-between font-bold p-2 bg-muted/50 rounded">
                    <span>Ending Cash Balance</span>
                    <span>{formatMoneyAbs(cfData.endingCash)}</span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="retained-earnings" className="pt-4">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Statement of Retained Earnings</h2>
            {(reQuery.isLoading || reQuery.isIdle || !reData) ? <p>Loading...</p> : reQuery.isError ? <p className="text-destructive">Failed to load</p> : (
              <div className="space-y-4">
                <div className="flex justify-between p-2 border-b">
                    <span>Beginning Retained Earnings</span>
                    <span>{formatMoneyAbs(reData.beginningBalance)}</span>
                </div>
                <div className="flex justify-between p-2 border-b">
                    <span>Add: Net Income</span>
                    <span>{formatSignedMoney(reData.netIncome)}</span>
                </div>
                <div className="flex justify-between p-2 border-b">
                    <span>Less: Dividends</span>
                    <span>{formatMoneyAbs(reData.dividends)}</span>
                </div>
                <div className="flex justify-between font-bold p-2 bg-muted/50 rounded">
                    <span>Ending Retained Earnings</span>
                    <span>{formatMoneyAbs(reData.endingBalance)}</span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
