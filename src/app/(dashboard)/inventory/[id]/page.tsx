"use client";

import { useEffect, useState } from "react";
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

export default function EditItemPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const qc = useQueryClient();
  const [billsPage, setBillsPage] = useState(1);

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
      const res = await fetch(`/api/bills?itemId=${id}`);
      if (!res.ok) throw new Error("Failed");
      const json = (await res.json()) as {
        data: Array<{
          _id: string;
          billNumber: string;
          billKind?: "sale" | "purchase";
          displayName?: string;
          total: number;
          billDate?: string;
          createdAt: string;
        }>;
      };
      return json.data;
    },
  });

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
      router.push("/inventory");
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
      <h1 className="text-2xl font-semibold">Edit item</h1>
      <form
        className="max-w-md space-y-3 rounded-xl border p-4"
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
            onValueChange={(v) => form.setValue("categoryId", v ?? undefined)}
          >
            <SelectTrigger>
              <SelectValue />
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
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>

      <div className="rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-lg font-semibold">Used in bills</h2>
          <p className="text-sm text-muted-foreground">
            Bills where this inventory item appears.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedBills.map((bill) => (
              <TableRow key={bill._id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/billing?billId=${bill._id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {bill.billNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  {new Date(bill.billDate ?? bill.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>{bill.displayName || "Walk-in"}</TableCell>
                <TableCell className="capitalize">
                  {bill.billKind ?? "sale"}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(bill.total)}
                </TableCell>
              </TableRow>
            ))}
            {paginatedBills.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
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
