"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { itemUpdateSchema } from "@/lib/validations";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { PaginationControls } from "@/components/shared/pagination-controls";

const editSchema = itemUpdateSchema.extend({
  name: z.string().min(1).optional(),
});

type EditForm = z.infer<typeof editSchema>;

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const qc = useQueryClient();
  const [billsPage, setBillsPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);

  // Remember last viewed inventory subpage so clicking "Inventory" returns here.
  useEffect(() => {
    try {
      sessionStorage.setItem("cf_last_inventory_path", `/inventory/${id}`);
    } catch {
      // ignore
    }
  }, [id]);

  const q = useQuery({
    queryKey: ["item", id],
    queryFn: async () => {
      const res = await fetch(`/api/items`);
      if (!res.ok) throw new Error("Failed");
      const json = (await res.json()) as {
        data: Array<{
          _id: string;
          name: string;
          categoryId: string;
          price: number;
          purchasePrice?: number;
          quantity: number;
          lowStockThreshold: number;
          unit: string;
        }>;
      };
      const it = json.data.find((x) => x._id === id);
      if (!it) throw new Error("Not found");
      return it;
    },
  });

  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Failed");
      return ((await res.json()) as { data: { _id: string; name: string }[] })
        .data;
    },
  });

  const usageBills = useQuery({
    queryKey: ["item-bills", id],
    queryFn: async () => {
      const res = await fetch(`/api/bills?itemId=${id}&pageSize=100`);
      if (!res.ok) throw new Error("Failed");
      const json = (await res.json()) as {
        data:
          | Array<{
              _id: string;
              billNumber: string;
              billKind?: "sale" | "purchase";
              displayName?: string;
              total: number;
              billDate?: string;
              createdAt: string;
              lines?: Array<{
                itemId: any;
                quantity: number;
              }>;
            }>
          | {
              items: Array<{
                _id: string;
                billNumber: string;
                billKind?: "sale" | "purchase";
                displayName?: string;
                total: number;
                billDate?: string;
                createdAt: string;
                lines?: Array<{
                  itemId: any;
                  quantity: number;
                }>;
              }>;
            };
      };
      return Array.isArray(json.data) ? json.data : json.data.items;
    },
  });

  const qtyDeltaForBill = useCallback(
    (
      b:
        | {
            billKind?: "sale" | "purchase";
            lines?: Array<{ itemId: any; quantity: number }>;
          }
        | undefined,
    ) => {
      const lines = Array.isArray(b?.lines) ? b!.lines : [];
      let qty = 0;
      for (const l of lines) {
        const itemId =
          typeof l?.itemId === "string"
            ? l.itemId
            : typeof l?.itemId?._id === "string"
              ? l.itemId._id
              : l?.itemId?.toString?.();
        if (itemId === id) qty += Number(l.quantity) || 0;
      }
      const kind = b?.billKind ?? "sale";
      return kind === "sale" ? -qty : qty;
    },
    [id],
  );

  const itemBillPnL = useCallback(
    (
      bill:
        | {
            billKind?: "sale" | "purchase";
            lines?: Array<{
              itemId: any;
              quantity: number;
              unitPrice?: number;
              purchasePrice?: number;
            }>;
          }
        | undefined,
    ) => {
      const lines = Array.isArray(bill?.lines) ? bill!.lines : [];
      let qty = 0;
      let revenue = 0;
      let cost = 0;
      for (const l of lines) {
        const itemId =
          typeof l?.itemId === "string"
            ? l.itemId
            : typeof l?.itemId?._id === "string"
              ? l.itemId._id
              : l?.itemId?.toString?.();
        if (itemId !== id) continue;
        const qn = Number(l.quantity) || 0;
        qty += qn;
        const unitPrice = Number(l.unitPrice) || 0;
        const catalogPp = Number(q.data?.purchasePrice) || 0;
        const linePpRaw =
          l.purchasePrice !== undefined && l.purchasePrice !== null
            ? Number(l.purchasePrice) || 0
            : NaN;
        // Backward-compat: older bills may have purchasePrice stored as 0.
        // If catalog purchase price is set, prefer it when line PP is missing/0.
        const pp =
          Number.isFinite(linePpRaw) && linePpRaw > 0 ? linePpRaw : catalogPp;
        revenue += unitPrice * qn;
        cost += pp * qn;
      }
      const kind = bill?.billKind ?? "sale";
      const profit = kind === "sale" ? revenue - cost : -cost;
      return { qty, revenue, cost, profit };
    },
    [id, q.data?.purchasePrice],
  );

  const itemStats = useMemo(() => {
    const bills = usageBills.data ?? [];
    let soldQty = 0;
    let purchasedQty = 0;
    for (const b of bills as any[]) {
      const delta = qtyDeltaForBill(b);
      const qty = Math.abs(delta);
      if ((b.billKind ?? "sale") === "sale") soldQty += qty;
      else purchasedQty += qty;
    }

    const onHand = Number(q.data?.quantity) || 0;
    const startingQty = onHand + soldQty - purchasedQty;
    return { soldQty, purchasedQty, startingQty, onHand };
  }, [id, q.data?.quantity, usageBills.data, qtyDeltaForBill]);

  const billPageSize = 8;
  const billPageCount = Math.max(
    1,
    Math.ceil((usageBills.data?.length ?? 0) / billPageSize),
  );
  const paginatedBills = (usageBills.data ?? []).slice(
    (billsPage - 1) * billPageSize,
    billsPage * billPageSize,
  );

  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema) as Resolver<EditForm>,
    defaultValues: {},
  });

  useEffect(() => {
    if (!q.data) return;
    form.reset({
      name: q.data.name,
      categoryId: q.data.categoryId,
      price: q.data.price,
      purchasePrice: (q.data as any).purchasePrice ?? 0,
      quantity: q.data.quantity,
      lowStockThreshold: q.data.lowStockThreshold,
      unit: q.data.unit,
    });
  }, [q.data, form]);

  const save = useMutation({
    mutationFn: async (values: EditForm) => {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Item updated");
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["item", id] });
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.isError || !q.data) {
    return <p className="text-sm text-destructive">Item not found</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{q.data.name}</h1>
          <p className="text-sm text-muted-foreground">
            Unit:{" "}
            <span className="font-medium text-foreground">{q.data.unit}</span> •
            Price:{" "}
            <span className="font-medium text-foreground">
              {formatMoney(q.data.price)}
            </span>{" "}
            • Purchase:{" "}
            <span className="font-medium text-foreground">
              {formatMoney(Number((q.data as any).purchasePrice) || 0)}
            </span>{" "}
            • On hand:{" "}
            <span className="font-medium text-foreground">
              {q.data.quantity}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/inventory")}
          >
            Back
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Starting qty", value: itemStats.startingQty },
          { label: "Sold qty", value: itemStats.soldQty },
          { label: "Purchased qty", value: itemStats.purchasedQty },
          { label: "On hand", value: itemStats.onHand },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground">{x.label}</p>
            <p className="text-lg font-semibold tabular-nums">
              {Number.isFinite(x.value) ? x.value : "—"}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                {q.data.unit}
              </span>
            </p>
          </div>
        ))}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={form.handleSubmit((v) => save.mutate(v))}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register("name")} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.watch("categoryId")}
                onValueChange={(v) =>
                  form.setValue("categoryId", v ?? undefined)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {cats.data?.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                {...form.register("unit")}
                placeholder="e.g., kg, pieces, liters"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("price", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase price</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("purchasePrice", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Qty</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("quantity", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Low stock threshold</Label>
              <Input
                type="number"
                {...form.register("lowStockThreshold", { valueAsNumber: true })}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-lg font-semibold">Used in bills</h2>
          <p className="text-sm text-muted-foreground">
            Bills where this inventory item appears, with profit/loss for this item.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty Δ</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">P/L (this item)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedBills.map((bill) => (
              <TableRow key={bill._id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/billing?billId=${bill._id}`}
                    className="text-gray-600 hover:underline"
                  >
                    {bill.billNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  {new Date(
                    bill.billDate ?? bill.createdAt,
                  ).toLocaleDateString()}
                </TableCell>
                <TableCell>{bill.displayName || "Walk-in"}</TableCell>
                <TableCell className="capitalize">
                  {bill.billKind ?? "sale"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(() => {
                    const delta = qtyDeltaForBill(bill as any);
                    const sign = delta > 0 ? "+" : "";
                    const cls =
                      delta < 0
                        ? "text-destructive font-medium"
                        : "text-green-600 font-medium";
                    return (
                      <span className={cls}>
                        {sign}
                        {delta}
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(bill.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(() => {
                    const pnl = itemBillPnL(bill as any);
                    const cls =
                      pnl.profit >= 0 ? "text-green-700 font-medium" : "text-destructive font-medium";
                    const sign = pnl.profit > 0 ? "+" : "";
                    return <span className={cls}>{sign}{formatMoney(pnl.profit)}</span>;
                  })()}
                </TableCell>
              </TableRow>
            ))}
            {paginatedBills.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  No bill usage found for this item.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <PaginationControls
          page={billsPage}
          pageCount={billPageCount}
          pageSize={billPageSize}
          totalItems={usageBills.data?.length ?? 0}
          itemLabel="bills"
          onPageChange={setBillsPage}
        />
      </div>
    </div>
  );
}
