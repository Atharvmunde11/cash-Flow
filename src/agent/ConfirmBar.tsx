"use client";

import { Button } from "@/components/ui/button";

export function ConfirmBar({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onConfirm}
        className="flex-1 bg-foreground text-background hover:bg-foreground/90"
      >
        Confirm
      </Button>
      <Button
        onClick={onCancel}
        variant="outline"
        className="flex-1 border-border/80 bg-card hover:bg-muted/60"
      >
        Cancel
      </Button>
    </div>
  );
}
