"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { PaginationControls } from "@/components/shared/pagination-controls";

type Row = {
  _id: string;
  name: string;
  balance: number;
  lastPaymentAt?: string | null;
  daysSinceLastPayment?: number | null;
};

async function fetchCredit(sort: string) {
  const res = await fetch(`/api/credit?sort=${encodeURIComponent(sort)}`);
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: Row[] }).data;
}

export default function CreditPage() {
  const [search, setSearch] = useState("");
  const [duePage, setDuePage] = useState(1);
  const [overduePage, setOverduePage] = useState(1);
  const due = useQuery({
    queryKey: ["credit", "due"],
    queryFn: () => fetchCredit("due"),
  });
  const overdue = useQuery({
    queryKey: ["credit", "overdue"],
    queryFn: () => fetchCredit("overdue"),
  });

  const filteredDue = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return due.data ?? [];
    return (due.data ?? []).filter((row) => row.name.toLowerCase().includes(query));
  }, [due.data, search]);

  const filteredOverdue = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return overdue.data ?? [];
    return (overdue.data ?? []).filter((row) =>
      row.name.toLowerCase().includes(query),
    );
  }, [overdue.data, search]);

  const pageSize = 10;
  const duePageCount = Math.max(1, Math.ceil(filteredDue.length / pageSize));
  const overduePageCount = Math.max(
    1,
    Math.ceil(filteredOverdue.length / pageSize),
  );
  const paginatedDue = filteredDue.slice(
    (duePage - 1) * pageSize,
    duePage * pageSize,
  );
  const paginatedOverdue = filteredOverdue.slice(
    (overduePage - 1) * pageSize,
    overduePage * pageSize,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credit</h1>
        <p className="text-sm text-muted-foreground">
          Outstanding receivables with sorting by amount or quietest payers.
        </p>
      </div>

      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setDuePage(1);
          setOverduePage(1);
        }}
        placeholder="Search customers..."
        className="max-w-sm"
      />

      <Tabs defaultValue="due">
        <TabsList>
          <TabsTrigger value="due">Highest due</TabsTrigger>
          <TabsTrigger value="overdue">Longest overdue</TabsTrigger>
        </TabsList>
        <TabsContent value="due" className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Days since pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDue.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(r.balance)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {r.daysSinceLastPayment ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationControls
            page={duePage}
            pageCount={duePageCount}
            pageSize={pageSize}
            totalItems={filteredDue.length}
            itemLabel="customers"
            onPageChange={setDuePage}
          />
        </TabsContent>
        <TabsContent value="overdue" className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Last payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOverdue.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(r.balance)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {r.lastPaymentAt
                      ? new Date(r.lastPaymentAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationControls
            page={overduePage}
            pageCount={overduePageCount}
            pageSize={pageSize}
            totalItems={filteredOverdue.length}
            itemLabel="customers"
            onPageChange={setOverduePage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
