"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Party = {
  _id: string;
  name: string;
  partyType: "customer" | "supplier";
  balance?: number;
};

async function searchParties(q: string, type?: "customer" | "supplier") {
  const params = new URLSearchParams({ q });
  if (type) params.set("type", type);
  const res = await fetch(`/api/search/parties?${params.toString()}`);
  if (!res.ok) throw new Error("Search failed");
  const json = (await res.json()) as { data: Party[] };
  return json.data;
}

export function PartyCombobox(props: {
  value: string;
  onChange: (
    value: string,
    meta?: {
      isExisting: boolean;
      id?: string;
      name?: string;
    },
  ) => void;
  partyType?: "customer" | "supplier";
  placeholder?: string;
  disabled?: boolean;
  hideChevron?: boolean;
  triggerProps?: React.ComponentPropsWithoutRef<"button"> &
    Partial<Record<`data-${string}`, string>>;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  const query = useQuery({
    queryKey: ["search-parties", q, props.partyType],
    queryFn: () => searchParties(q, props.partyType),
    enabled: open,
  });

  // 🔹 find selected party
  const selected = query.data?.find((p) => p._id === props.value);

  // 🔹 display logic (supports free text)
  const display = selected?.name || props.value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={props.disabled}
        aria-expanded={open}
        onKeyDown={(e) => {
          props.triggerProps?.onKeyDown?.(e);
          if (e.key === "Shift") {
            e.preventDefault();
            if (!props.disabled) setOpen((v) => !v);
          }
        }}
        {...props.triggerProps}
        className={cn(
          buttonVariants({ variant: props.hideChevron ? "ghost" : "outline" }),
          "w-full font-normal",
          props.hideChevron ? "justify-start" : "justify-between",
          props.triggerProps?.className,
        )}
      >
        <span className="truncate">
          {display || props.placeholder || "Select party…"}
        </span>
        {!props.hideChevron ? (
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        ) : null}
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type name…"
            value={q}
            onValueChange={setQ}
          />

          <CommandList>
            <CommandEmpty>
              {query.isLoading ? "Loading…" : "No party found."}
            </CommandEmpty>

            {/* 🔹 Free text option */}
            {q && (
              <CommandItem
                value={q}
                onSelect={() => {
                  props.onChange(q, {
                    isExisting: false,
                    name: q,
                  });
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 size-4")} opacity={0} />
                walk-in : {q}
              </CommandItem>
            )}

            {/* 🔹 Existing parties */}
            <CommandGroup>
              {query.data?.map((p) => (
                <CommandItem
                  key={p._id}
                  value={p._id}
                  onSelect={() => {
                    props.onChange(p._id, {
                      isExisting: true,
                      id: p._id,
                      name: p.name,
                    });
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      props.value === p._id ? "opacity-100" : "opacity-0",
                    )}
                  />

                  <div className="flex w-full items-center justify-between gap-2">
                    {/* Name */}
                    <span className="truncate">{p.name}</span>

                    {/* Balance */}
                    <span
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        p.balance && p.balance < 0
                          ? "text-green-600" // they owe you → good
                          : p.balance && p.balance > 0
                            ? "text-red-600" // you owe → bad
                            : "text-muted-foreground",
                      )}
                    >
                      {p.balance
                        ? p.balance < 0
                          ? `₹${Math.abs(p.balance)} Cr`
                          : `₹${p.balance} Dr`
                        : "₹0"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
