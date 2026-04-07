"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { itemCreateSchema, type ItemCreateInput } from "@/lib/validations";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { PaginationControls } from "@/components/shared/pagination-controls";

type Item = {
  _id: string;
  name: string;
  categoryId: string;
  price: number;
  quantity: number;
  lowStockThreshold: number;
  unit: string;
};

type Cat = { _id: string; name: string };

async function fetchItems() {
  const res = await fetch("/api/items");
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: Item[] }).data;
}

async function fetchCats() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: Cat[] }).data;
}

export default function InventoryPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ["items"], queryFn: fetchItems });
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCats });

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items.data ?? [];
    return (items.data ?? []).filter((item) => {
      const category = cats.data?.find((cat) => cat._id === item.categoryId)?.name ?? "";
      return [item.name, item.unit, category].join(" ").toLowerCase().includes(query);
    });
  }, [cats.data, items.data, search]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = filteredItems.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const form = useForm<ItemCreateInput>({
    resolver: zodResolver(itemCreateSchema) as Resolver<ItemCreateInput>,
    defaultValues: {
      name: "",
      categoryId: "",
      price: 0,
      quantity: 0,
      lowStockThreshold: 5,
      unit: "",
    },
  });

  const create = useMutation({
    mutationFn: async (values: ItemCreateInput) => {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Item saved");
      qc.invalidateQueries({ queryKey: ["items"] });
      form.reset({
        name: "",
        categoryId: "",
        price: 0,
        quantity: 0,
        lowStockThreshold: 5,
        unit: "",
      });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast.success("Item deleted");
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const catName = (id: string) =>
    cats.data?.find((c) => c._id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            SKUs, pricing, and on-hand quantities (bills decrement stock).
          </p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>
          Add item
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New item</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={form.handleSubmit((v) => create.mutate(v))}
            >
              <div className="space-y-1.5">
                <Label htmlFor="iname">Name</Label>
                <Input id="iname" {...form.register("name")} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Controller
                  name="categoryId"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iunit">Unit</Label>
                <Input
                  id="iunit"
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
                  {...form.register("lowStockThreshold", {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <Button type="submit" disabled={create.isPending}>
                Save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search inventory by item, category, or unit..."
        className="max-w-sm"
      />

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.map((it) => {
              const low = it.quantity <= it.lowStockThreshold;
              return (
                <TableRow key={it._id}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell>{catName(it.categoryId)}</TableCell>
                  <TableCell>{it.unit}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(it.price)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-2">
                      {it.quantity}
                      {low && (
                        <Badge variant="destructive" className="text-[10px]">
                          Low
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2">
                      <Link
                        href={`/inventory/${it._id}`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                        )}
                      >
                        Edit
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive"
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete item</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &quot;{it.name}&quot;? This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteItem.mutate(it._id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  No inventory items found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <PaginationControls
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={filteredItems.length}
          itemLabel="items"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
