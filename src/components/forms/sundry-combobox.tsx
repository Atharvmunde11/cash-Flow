"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  SUNDRY_PRESETS,
  isForbiddenSundryName,
  isPresetSundry,
} from "@/lib/sundry-types";

export { SUNDRY_PRESETS } from "@/lib/sundry-types";

type CustomSundry = { _id: string; name: string };

async function fetchCustomSundries(): Promise<CustomSundry[]> {
  const res = await fetch("/api/sundry-types");
  if (!res.ok) throw new Error("Failed to load sundries");
  const json = (await res.json()) as { data: CustomSundry[] };
  return json.data ?? [];
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

export function SundryCombobox(props: {
  value: string;
  onChange: (label: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hideChevron?: boolean;
  triggerProps?: React.ComponentPropsWithoutRef<"button"> &
    Partial<Record<`data-${string}`, string>>;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  const custom = useQuery({
    queryKey: ["sundry-types"],
    queryFn: fetchCustomSundries,
    staleTime: 30_000,
  });

  const options = React.useMemo(() => {
    const customNames = (custom.data ?? []).map((s) => s.name);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const label of [...SUNDRY_PRESETS, ...customNames]) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    return out;
  }, [custom.data]);

  const filtered = options.filter(
    (label) => !q || label.toLowerCase().includes(q.toLowerCase()),
  );

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
        <span className="truncate text-left">
          {props.value || props.placeholder || "Select sundry…"}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search sundries…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>
              No matching sundry. Add custom labels under Stock → Sundries.
            </CommandEmpty>
            <CommandGroup heading="Presets">
              {filtered
                .filter((label) =>
                  (SUNDRY_PRESETS as readonly string[]).includes(label),
                )
                .map((label) => (
                  <CommandItem
                    key={label}
                    value={label}
                    onSelect={() => {
                      if (isForbiddenSundryName(label)) return;
                      props.onChange(label);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        props.value === label ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {label}
                  </CommandItem>
                ))}
            </CommandGroup>
            {filtered.some(
              (label) =>
                !(SUNDRY_PRESETS as readonly string[]).includes(label),
            ) ? (
              <CommandGroup heading="Custom">
                {filtered
                  .filter(
                    (label) =>
                      !(SUNDRY_PRESETS as readonly string[]).includes(label),
                  )
                  .map((label) => (
                    <CommandItem
                      key={label}
                      value={label}
                      onSelect={() => {
                        if (isForbiddenSundryName(label)) return;
                        props.onChange(label);
                        setOpen(false);
                        setQ("");
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          props.value === label ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {label}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CustomSundrySettingsPanel() {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const list = useQuery({
    queryKey: ["sundry-types"],
    queryFn: fetchCustomSundries,
  });

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (isForbiddenSundryName(trimmed)) {
        throw new Error(
          "That name is not allowed. Use a specific label (not walk-in / type-in).",
        );
      }
      if (isPresetSundry(trimmed)) {
        throw new Error("That label is already a built-in preset.");
      }
      const res = await fetch("/api/sundry-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add");
      return body;
    },
    onSuccess: () => {
      toast.success("Custom sundry added");
      setName("");
      qc.invalidateQueries({ queryKey: ["sundry-types"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/sundry-types?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete");
      return body;
    },
    onSuccess: () => {
      toast.success("Custom sundry removed");
      qc.invalidateQueries({ queryKey: ["sundry-types"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canAdd = name.trim().length > 0 && !create.isPending;

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div>
        <h2 className="text-lg font-medium">Custom sundries</h2>
        <p className="text-sm text-muted-foreground">
          Add labels here, then pick them on bills. Free typing and walk-in /
          type-in labels are not allowed.
        </p>
      </div>

      <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Built-in presets: {SUNDRY_PRESETS.join(", ")}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) create.mutate();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Packaging, Loading"
          className="sm:flex-1"
        />
        <Button type="submit" disabled={!canAdd}>
          {create.isPending ? "Adding…" : "Add custom sundry"}
        </Button>
      </form>

      {(list.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No custom sundries yet. Add one above to use it on invoices.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(list.data ?? []).map((row) => (
            <li
              key={row._id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="font-medium">{row.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(row._id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
