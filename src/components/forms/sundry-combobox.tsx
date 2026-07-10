"use client";

import * as React from "react";
import { Check } from "lucide-react";
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

export const SUNDRY_PRESETS = [
  "Transport",
  "Labour",
  "Due",
  "Round off",
  "Discount",
  "Others",
] as const;

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

  const filtered = SUNDRY_PRESETS.filter(
    (label) => !q || label.toLowerCase().includes(q.toLowerCase()),
  );

  const customLabel = q.trim();
  const showCustom =
    customLabel.length > 0 &&
    !SUNDRY_PRESETS.some(
      (label) => label.toLowerCase() === customLabel.toLowerCase(),
    );

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
        <span className="truncate text-left">
          {props.value || props.placeholder || "Select sundry…"}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            {showCustom ? (
              <CommandItem
                value={customLabel}
                onSelect={() => {
                  props.onChange(customLabel);
                  setOpen(false);
                  setQ("");
                }}
              >
                <Check className="mr-2 size-4 opacity-0" />
                Use &ldquo;{customLabel}&rdquo;
              </CommandItem>
            ) : null}
            <CommandGroup>
              {filtered.map((label) => (
                <CommandItem
                  key={label}
                  value={label}
                  onSelect={() => {
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
