"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PrintPageSize = "A4" | "A5" | "Letter" | "Legal";
export type PrintColorMode = "color" | "bw";

export type PrintInvoiceOptions = {
  pageSize: PrintPageSize;
  colorMode: PrintColorMode;
};

const STYLE_ID = "cf-invoice-print-options";

export function applyPrintOptions(options: PrintInvoiceOptions) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const grayscale =
    options.colorMode === "bw"
      ? `
#invoice-print-root,
#invoice-print-root * {
  -webkit-filter: grayscale(100%) !important;
  filter: grayscale(100%) !important;
  -webkit-print-color-adjust: economy !important;
  print-color-adjust: economy !important;
}
`
      : `
#invoice-print-root {
  -webkit-filter: none !important;
  filter: none !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
`;

  style.textContent = `
@media print {
  @page {
    size: ${options.pageSize} portrait;
    margin: 12mm 12mm 14mm 12mm;
  }
  ${grayscale}
}
`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyId?: string | null;
  onPrintInvoice: (options: PrintInvoiceOptions) => void;
};

export function PrintInvoiceDialog({
  open,
  onOpenChange,
  partyId,
  onPrintInvoice,
}: Props) {
  const [pageSize, setPageSize] = useState<PrintPageSize>("A4");
  const [colorMode, setColorMode] = useState<PrintColorMode>("bw");

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem("cf_print_prefs");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PrintInvoiceOptions>;
      if (parsed.pageSize) setPageSize(parsed.pageSize);
      if (parsed.colorMode) setColorMode(parsed.colorMode);
    } catch {
      // ignore
    }
  }, [open]);

  const persistAndPrint = () => {
    const options = { pageSize, colorMode };
    try {
      localStorage.setItem("cf_print_prefs", JSON.stringify(options));
    } catch {
      // ignore
    }
    onPrintInvoice(options);
    onOpenChange(false);
  };

  const printStatement = () => {
    if (!partyId) return;
    window.open(`/parties/${partyId}?print=statement`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print settings</DialogTitle>
          <DialogDescription>
            Choose page size and color before printing the invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Page size</Label>
            <Select
              value={pageSize}
              onValueChange={(v) => setPageSize(v as PrintPageSize)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="A5">A5</SelectItem>
                <SelectItem value="Letter">Letter</SelectItem>
                <SelectItem value="Legal">Legal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Print color</Label>
            <Select
              value={colorMode}
              onValueChange={(v) => setColorMode(v as PrintColorMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bw">Black &amp; white</SelectItem>
                <SelectItem value="color">Color</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" className="w-full" onClick={persistAndPrint}>
            Print invoice
          </Button>
          {partyId ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={printStatement}
            >
              Print account statement
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
