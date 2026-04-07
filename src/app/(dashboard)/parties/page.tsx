"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { partyCreateSchema, type PartyCreateInput } from "@/lib/validations";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { formatMoney } from "@/lib/format";
import { getPartyBalanceMeta } from "@/lib/party-balance";
import { PaginationControls } from "@/components/shared/pagination-controls";

type Party = {
  _id: string;
  name: string;
  phone?: string;
  partyType: "customer" | "supplier";
  balance: number;
  maxDaysWithoutPayment?: number | null;
};

async function fetchParties() {
  const res = await fetch("/api/parties");
  if (!res.ok) throw new Error("Failed to load");
  const json = (await res.json()) as { data: Party[] };
  return json.data;
}

export default function PartiesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["parties"], queryFn: fetchParties });

  const filteredParties = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return list.data ?? [];
    return (list.data ?? []).filter((party) => {
      return [party.name, party.phone ?? "", party.partyType]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [list.data, search]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredParties.length / pageSize));
  const paginatedParties = filteredParties.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PartyCreateInput>({
    resolver: zodResolver(partyCreateSchema) as Resolver<PartyCreateInput>,
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      openingBalance: 0,
      partyType: "customer",
      maxDaysWithoutPayment: undefined,
    },
  });

  const partyType = watch("partyType");

  const create = useMutation({
    mutationFn: async (values: PartyCreateInput) => {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Party saved");
      qc.invalidateQueries({ queryKey: ["parties"] });
      reset();
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Parties</h1>
          <p className="text-sm text-muted-foreground">
            Customers and suppliers with balances and ledger links.
          </p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>
          Add party
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New party</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={handleSubmit((v) => create.mutate(v))}
            >
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...register("name")} />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={partyType}
                  onValueChange={(v) =>
                    setValue("partyType", v as PartyCreateInput["partyType"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" {...register("address")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="openingBalance">Opening balance</Label>
                <Input
                  id="openingBalance"
                  type="number"
                  step="0.01"
                  {...register("openingBalance", { valueAsNumber: true })}
                />
              </div>
              {partyType === "customer" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="maxDays">
                    Max days without payment (optional)
                  </Label>
                  <Input
                    id="maxDays"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g. 30 — alert if no payment while owing"
                    {...register("maxDaysWithoutPayment", {
                      setValueAs: (v) =>
                        v === "" || v === undefined || Number.isNaN(Number(v))
                          ? undefined
                          : Number(v),
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    If they still owe money and have not paid anything in this
                    many days, you&apos;ll see a warning when creating a sale
                    bill.
                  </p>
                </div>
              ) : null}
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
        placeholder="Search parties by name, phone, or type..."
        className="max-w-sm"
      />

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedParties.map((p) => {
              const balanceMeta = getPartyBalanceMeta(p.partyType, p.balance);
              return (
              <TableRow
                key={p._id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => router.push(`/parties/${p._id}`)}
              >
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="capitalize">{p.partyType}</TableCell>
                <TableCell className="text-right">
                  <div className="space-y-1">
                    <div className="tabular-nums">{formatMoney(balanceMeta.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {balanceMeta.label}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/parties/${p._id}`}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(buttonVariants({ variant: "link" }))}
                  >
                    Ledger
                  </Link>
                </TableCell>
              </TableRow>
            )})}
            {paginatedParties.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-muted-foreground"
                >
                  No parties found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <PaginationControls
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={filteredParties.length}
          itemLabel="parties"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
