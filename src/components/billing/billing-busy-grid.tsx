"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemCombobox } from "@/components/forms/item-combobox";
import { SundryCombobox } from "@/components/forms/sundry-combobox";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = {
  _id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
};

export type BusyItemLine = {
  id: string;
  lineType: "item";
  itemId?: string;
  quantity?: number;
  unitPrice?: number;
};

export type BusySundryLine = {
  id: string;
  lineType: "sundry";
  sundryLabel?: string;
  sundryAmount?: number;
};

type Props = {
  itemLines: BusyItemLine[];
  sundryLines: BusySundryLine[];
  items: Item[];
  itemsSubtotal: number;
  sundrySubtotal: number;
  computedTotal: number;
  onUpdateItem: (id: string, patch: Partial<BusyItemLine>) => void;
  onUpdateSundry: (id: string, patch: Partial<BusySundryLine>) => void;
  onRemoveItem: (id: string) => void;
  onRemoveSundry: (id: string) => void;
  onAddSundryWithLabel: (label: string) => void;
  onItemRowKeyDown: (e: React.KeyboardEvent, lineId: string) => void;
  onSundryRowKeyDown: (e: React.KeyboardEvent, lineId: string) => void;
};

const ROW_HEIGHT = 29;
const TABLE_HEAD_HEIGHT = 28;
const MIN_VISIBLE_ROWS = 3;
const MAX_VISIBLE_ROWS = 14;
const SUNDRY_RESERVE_PX = 160;

const cellInput =
  "h-7 w-full min-w-0 rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent";

const thCell =
  "border border-border bg-muted/50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const tdCell =
  "h-7 border border-border bg-background p-0 align-middle";
const totalLabelCell =
  "border border-border bg-background px-2 py-1 text-right text-xs font-medium text-muted-foreground";
const totalValueCell =
  "border border-border bg-background px-2 py-1 text-right text-sm font-semibold tabular-nums";

function useVisibleItemRowCount(
  anchorRef: React.RefObject<HTMLDivElement | null>,
) {
  const [count, setCount] = useState(5);

  useEffect(() => {
    const measure = () => {
      const el = anchorRef.current;
      if (!el) return;

      const top = el.getBoundingClientRect().top;
      const available =
        window.innerHeight -
        top -
        SUNDRY_RESERVE_PX -
        TABLE_HEAD_HEIGHT -
        28 -
        16;

      const rows = Math.max(
        MIN_VISIBLE_ROWS,
        Math.min(MAX_VISIBLE_ROWS, Math.floor(available / ROW_HEIGHT)),
      );
      setCount(rows);
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (anchorRef.current) ro.observe(anchorRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef]);

  return count;
}

function focusCellField(cell: HTMLElement) {
  const field = cell.querySelector<HTMLElement>("[data-bill-nav]");
  field?.focus();
}

function GridCell({
  className,
  children,
  editable = true,
}: {
  className?: string;
  children?: React.ReactNode;
  editable?: boolean;
}) {
  return (
    <td
      className={cn(
        tdCell,
        editable &&
          "cursor-cell focus-within:relative focus-within:z-10 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ring",
        className,
      )}
      onClick={
        editable
          ? (e) => {
              focusCellField(e.currentTarget);
            }
          : undefined
      }
    >
      {children}
    </td>
  );
}

function GridTable({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <table className={cn("w-full border-collapse text-sm", className)}>
      {children}
    </table>
  );
}

function ItemRow({
  line,
  serial,
  items,
  onUpdateItem,
  onRemoveItem,
  onItemRowKeyDown,
}: {
  line: BusyItemLine;
  serial: number;
  items: Item[];
  onUpdateItem: Props["onUpdateItem"];
  onRemoveItem: Props["onRemoveItem"];
  onItemRowKeyDown: Props["onItemRowKeyDown"];
}) {
  const selectedItem = items.find((it) => it._id === line.itemId);
  const qty = Number(line.quantity) || 0;
  const rate =
    line.unitPrice !== undefined ? line.unitPrice : selectedItem?.price;
  const amount = rate !== undefined ? qty * rate : undefined;

  return (
    <tr
      data-item-row={line.id}
      className="group"
      onKeyDown={(e) => onItemRowKeyDown(e, line.id)}
    >
      <GridCell editable={false} className="w-10 px-1 text-center text-xs tabular-nums">
        {serial}
      </GridCell>
      <GridCell className="min-w-[180px]">
        <ItemCombobox
          value={line.itemId ?? ""}
          catalog={items}
          hideChevron
          onChange={(id, item) => {
            onUpdateItem(line.id, {
              itemId: id,
              unitPrice:
                item?.price !== undefined ? item.price : line.unitPrice,
            });
          }}
          placeholder="Type or select item"
          triggerProps={{
            "data-bill-nav": "item",
            className:
              "h-7 w-full min-w-0 rounded-none border-0 bg-transparent px-2 text-left text-sm shadow-none hover:bg-transparent focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent",
          }}
        />
      </GridCell>
      <GridCell className="w-[4.5rem]">
        <Input
          data-bill-nav="qty"
          type="number"
          step="0.01"
          min="0"
          value={line.quantity ?? ""}
          onChange={(e) =>
            onUpdateItem(line.id, {
              quantity:
                e.target.value === ""
                  ? undefined
                  : Number(e.target.value),
            })
          }
          className={cn(cellInput, "text-right tabular-nums")}
        />
      </GridCell>
      <GridCell
        editable={false}
        className="w-14 px-1 text-center text-xs text-muted-foreground"
      >
        {selectedItem?.unit ?? ""}
      </GridCell>
      <GridCell className="w-24">
        <Input
          data-bill-nav="rate"
          type="number"
          step="0.01"
          min="0"
          placeholder={selectedItem ? String(selectedItem.price) : ""}
          value={line.unitPrice ?? ""}
          onChange={(e) =>
            onUpdateItem(line.id, {
              unitPrice:
                e.target.value === ""
                  ? undefined
                  : Number(e.target.value),
            })
          }
          className={cn(cellInput, "text-right tabular-nums")}
        />
      </GridCell>
      <GridCell
        editable={false}
        className="w-28 px-2 text-right text-sm tabular-nums"
      >
        {amount !== undefined ? formatMoney(amount) : ""}
      </GridCell>
      <GridCell editable={false} className="w-8 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 text-muted-foreground group-hover:opacity-100 hover:text-destructive"
          onClick={() => onRemoveItem(line.id)}
          tabIndex={-1}
        >
          <Trash2 className="size-3" />
        </Button>
      </GridCell>
    </tr>
  );
}

function EmptyItemRow({ serial }: { serial: number }) {
  return (
    <tr>
      <GridCell editable={false} className="w-10 px-1 text-center text-xs tabular-nums">
        {serial}
      </GridCell>
      <GridCell editable={false} className="min-w-[180px]" />
      <GridCell editable={false} className="w-[4.5rem]" />
      <GridCell editable={false} className="w-14" />
      <GridCell editable={false} className="w-24" />
      <GridCell editable={false} className="w-28" />
      <GridCell editable={false} className="w-8" />
    </tr>
  );
}

function SundryRow({
  line,
  serial,
  onUpdateSundry,
  onRemoveSundry,
  onSundryRowKeyDown,
}: {
  line: BusySundryLine;
  serial: number;
  onUpdateSundry: Props["onUpdateSundry"];
  onRemoveSundry: Props["onRemoveSundry"];
  onSundryRowKeyDown: Props["onSundryRowKeyDown"];
}) {
  return (
    <tr
      data-sundry-row={line.id}
      className="group"
      onKeyDown={(e) => onSundryRowKeyDown(e, line.id)}
    >
      <GridCell editable={false} className="w-10 px-1 text-center text-xs tabular-nums">
        {serial}
      </GridCell>
      <GridCell className="min-w-[180px]">
        <SundryCombobox
          value={line.sundryLabel ?? ""}
          hideChevron
          onChange={(label) =>
            onUpdateSundry(line.id, { sundryLabel: label })
          }
          placeholder="Select sundry"
          triggerProps={{
            "data-bill-nav": "sundryLabel",
            className:
              "h-7 w-full min-w-0 rounded-none border-0 bg-transparent px-2 text-left text-sm shadow-none hover:bg-transparent focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent",
          }}
        />
      </GridCell>
      <GridCell className="w-28">
        <Input
          data-bill-nav="sundryAmount"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={line.sundryAmount ?? ""}
          onChange={(e) =>
            onUpdateSundry(line.id, {
              sundryAmount:
                e.target.value === ""
                  ? undefined
                  : Number(e.target.value),
            })
          }
          className={cn(cellInput, "text-right tabular-nums")}
        />
      </GridCell>
      <GridCell editable={false} className="w-8 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 text-muted-foreground group-hover:opacity-100 hover:text-destructive"
          onClick={() => onRemoveSundry(line.id)}
          tabIndex={-1}
        >
          <Trash2 className="size-3" />
        </Button>
      </GridCell>
    </tr>
  );
}

function SundryPickerRow({
  serial,
  onSelectLabel,
}: {
  serial: number;
  onSelectLabel: (label: string) => void;
}) {
  return (
    <tr>
      <GridCell editable={false} className="w-10 px-1 text-center text-xs tabular-nums">
        {serial}
      </GridCell>
      <GridCell className="min-w-[180px]">
        <SundryCombobox
          value=""
          hideChevron
          onChange={onSelectLabel}
          placeholder="Select sundry"
          triggerProps={{
            "data-bill-nav": "sundryLabel",
            className:
              "h-7 w-full min-w-0 rounded-none border-0 bg-transparent px-2 text-left text-sm text-muted-foreground shadow-none hover:bg-transparent focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent",
          }}
        />
      </GridCell>
      <GridCell editable={false} className="w-28" />
      <GridCell editable={false} className="w-8" />
    </tr>
  );
}

export function BillingBusyGrid({
  itemLines,
  sundryLines,
  items,
  itemsSubtotal,
  sundrySubtotal,
  computedTotal,
  onUpdateItem,
  onUpdateSundry,
  onRemoveItem,
  onRemoveSundry,
  onAddSundryWithLabel,
  onItemRowKeyDown,
  onSundryRowKeyDown,
}: Props) {
  const itemsSectionRef = useRef<HTMLDivElement>(null);
  const visibleRowCount = useVisibleItemRowCount(itemsSectionRef);

  const paddedItemRows = useMemo(() => {
    const targetRows = Math.max(itemLines.length, visibleRowCount);
    const emptyCount = Math.max(0, targetRows - itemLines.length);
    return [
      ...itemLines.map((line, idx) => ({
        kind: "item" as const,
        line,
        serial: idx + 1,
      })),
      ...Array.from({ length: emptyCount }, (_, i) => ({
        kind: "empty" as const,
        serial: itemLines.length + i + 1,
      })),
    ];
  }, [itemLines, visibleRowCount]);

  const itemsBodyScroll =
    itemLines.length > visibleRowCount
      ? visibleRowCount * ROW_HEIGHT
      : undefined;

  return (
    <div
      ref={itemsSectionRef}
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div
        className={cn(itemsBodyScroll !== undefined && "overflow-y-auto")}
        style={
          itemsBodyScroll !== undefined
            ? { maxHeight: itemsBodyScroll + TABLE_HEAD_HEIGHT }
            : undefined
        }
      >
        <GridTable>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={cn(thCell, "w-10 text-center")}>S.N.</th>
              <th className={cn(thCell, "min-w-[180px] text-left")}>Item</th>
              <th className={cn(thCell, "w-[4.5rem] text-right")}>Qty.</th>
              <th className={cn(thCell, "w-14 text-center")}>Unit</th>
              <th className={cn(thCell, "w-24 text-right")}>Price (Rs.)</th>
              <th className={cn(thCell, "w-28 text-right")}>Amount (Rs.)</th>
              <th className={cn(thCell, "w-8")} />
            </tr>
          </thead>
          <tbody>
            {paddedItemRows.map((row) =>
              row.kind === "item" ? (
                <ItemRow
                  key={row.line.id}
                  line={row.line}
                  serial={row.serial}
                  items={items}
                  onUpdateItem={onUpdateItem}
                  onRemoveItem={onRemoveItem}
                  onItemRowKeyDown={onItemRowKeyDown}
                />
              ) : (
                <EmptyItemRow key={`empty-item-${row.serial}`} serial={row.serial} />
              ),
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className={totalLabelCell}>
                Items total
              </td>
              <td className={totalValueCell}>{formatMoney(itemsSubtotal)}</td>
              <td className={cn(tdCell, "w-8")} />
            </tr>
          </tfoot>
        </GridTable>
      </div>

      <GridTable>
        <thead>
          <tr>
            <th className={cn(thCell, "w-10 text-center")}>S.N.</th>
            <th className={cn(thCell, "min-w-[180px] text-left")}>Description</th>
            <th className={cn(thCell, "w-28 text-right")}>Amount (Rs.)</th>
            <th className={cn(thCell, "w-8")} />
          </tr>
        </thead>
        <tbody>
          {sundryLines.map((line, idx) => (
            <SundryRow
              key={line.id}
              line={line}
              serial={idx + 1}
              onUpdateSundry={onUpdateSundry}
              onRemoveSundry={onRemoveSundry}
              onSundryRowKeyDown={onSundryRowKeyDown}
            />
          ))}
          <SundryPickerRow
            serial={sundryLines.length + 1}
            onSelectLabel={onAddSundryWithLabel}
          />
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className={totalLabelCell}>
              Sundry total
            </td>
            <td className={totalValueCell}>{formatMoney(sundrySubtotal)}</td>
            <td className={cn(tdCell, "w-8")} />
          </tr>
        </tfoot>
      </GridTable>

      <div className="flex items-center justify-end gap-3 border-t border-border px-3 py-2">
        <span className="text-sm font-semibold">Grand total</span>
        <span className="min-w-[7rem] text-right text-base font-bold tabular-nums">
          {formatMoney(computedTotal)}
        </span>
      </div>
    </div>
  );
}
