"use client";

import { Button } from "@/components/ui/button";

type PaginationControlsProps = {
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  page,
  pageCount,
  pageSize,
  totalItems,
  itemLabel,
  onPageChange,
}: PaginationControlsProps) {
  if (pageCount <= 1) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground">
        <span>
          {totalItems} {itemLabel}
        </span>
      </div>
    );
  }

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">
        Showing {start}-{end} of {totalItems} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="min-w-20 text-center text-muted-foreground">
          Page {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
