"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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

type Item = {
  _id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
};

async function searchItems(q: string) {
  const res = await fetch(`/api/search/items?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Search failed");
  const json = (await res.json()) as { data: Item[] };
  return json.data;
}

function isTypeToSearchKey(e: React.KeyboardEvent) {
  return (
    e.key.length === 1 &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    e.key !== " "
  );
}

export function ItemCombobox(props: {
  value: string;
  onChange: (id: string, item?: Item) => void;
  placeholder?: string;
  disabled?: boolean;
  hideChevron?: boolean;
  /** Preloaded catalog (e.g. billing page) so selected item shows when editing. */
  catalog?: Item[];
  triggerProps?: React.ComponentPropsWithoutRef<"button"> &
    Partial<Record<`data-${string}`, string>>;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  const query = useQuery({
    queryKey: ["search-items", q],
    queryFn: () => searchItems(q),
    enabled: open,
  });

  const selected =
    query.data?.find((i) => i._id === props.value) ??
    props.catalog?.find((i) => i._id === props.value);

  React.useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      document
        .querySelector<HTMLInputElement>('[data-slot="command-input"]')
        ?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={props.disabled}
        aria-expanded={open}
        {...props.triggerProps}
        onKeyDown={(e) => {
          props.triggerProps?.onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === "Shift") {
            e.preventDefault();
            if (!props.disabled) setOpen((v) => !v);
            return;
          }
          if (!open && !props.disabled && isTypeToSearchKey(e)) {
            e.preventDefault();
            setQ(e.key);
            setOpen(true);
          }
        }}
        className={cn(
          buttonVariants({ variant: props.hideChevron ? "ghost" : "outline" }),
          "w-full font-normal",
          props.hideChevron ? "justify-start" : "justify-between",
          props.triggerProps?.className,
        )}
      >
        <span className="truncate">
          {selected
            ? `${selected.name} (${selected.unit})`
            : (props.placeholder ?? "Select item…")}
        </span>
        {!props.hideChevron ? (
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search items…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>
              {query.isLoading ? "Loading…" : "No item found."}
            </CommandEmpty>
            <CommandGroup>
              {query.data?.map((it) => (
                <CommandItem
                  key={it._id}
                  value={it._id}
                  onSelect={() => {
                    props.onChange(it._id, it);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      props.value === it._id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">
                    {it.name} ({it.unit}){" "}
                    <span className="text-muted-foreground">
                      (₹{it.price} · stock {it.quantity})
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
