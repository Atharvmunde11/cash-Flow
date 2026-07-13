"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FilePlus2, Trash2, Upload, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportGuide } from "@/components/import/import-guide";
import { cn } from "@/lib/utils";

export type ImportResult = {
  source: string;
  filesProcessed?: number;
  counts: {
    accountGroupsCreated?: number;
    ledgersCreated?: number;
    bankAccountsCreated?: number;
    partiesCreated: number;
    partiesSkipped: number;
    itemsCreated: number;
    itemsSkipped: number;
    categoriesCreated: number;
    billsCreated: number;
    billsSkipped: number;
    paymentsCreated: number;
    paymentsSkipped: number;
    vouchersCreated?: number;
  };
  warnings: string[];
};

type ImportPanelProps = {
  onImported?: (result: ImportResult) => void;
  showGuide?: boolean;
};

const isDev = process.env.NODE_ENV === "development";
const IMPORT_ACCEPT = ".xml,.dat,.csv,text/xml,text/csv";

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function mergeUniqueFiles(existing: File[], incoming: File[]) {
  const seen = new Set(existing.map(fileKey));
  const next = [...existing];
  for (const file of incoming) {
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

export function ImportPanel({ onImported, showGuide = true }: ImportPanelProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importSource, setImportSource] = useState<"auto" | "tally" | "busy">(
    "auto",
  );
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [includeVouchers, setIncludeVouchers] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const applySelectedFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setImportFiles((prev) => mergeUniqueFiles(prev, incoming));
    setImportResult(null);
    if (incoming.some((f) => f.name.toLowerCase().endsWith(".dat"))) {
      setImportSource("busy");
    }
  };

  const runImport = useMutation({
    mutationFn: async () => {
      if (importFiles.length === 0) throw new Error("Choose at least one file");
      const form = new FormData();
      for (const file of importFiles) {
        form.append("files", file);
      }
      form.append("mode", importMode);
      form.append("source", importSource);
      form.append("includeVouchers", includeVouchers ? "true" : "false");
      const res = await fetch("/api/import", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      return body.data as ImportResult;
    },
    onSuccess: (data) => {
      setImportResult(data);
      toast.success("Import finished");
      qc.invalidateQueries();
      onImported?.(data);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wipeDb = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/dev/reset-db", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete SQLite data");
      return body.data as { message: string };
    },
    onSuccess: (data) => {
      setImportResult(null);
      toast.success(data.message ?? "SQLite data deleted");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      {showGuide ? <ImportGuide /> : null}

      <div className="flex items-start gap-3 rounded-lg border p-3">
        <Checkbox
          id="includeVouchers"
          checked={includeVouchers}
          onCheckedChange={(v) => setIncludeVouchers(v === true)}
        />
        <div className="space-y-1">
          <Label htmlFor="includeVouchers" className="font-medium">
            Import invoices &amp; payment vouchers
          </Label>
          <p className="text-xs text-muted-foreground">
            Sales, purchase bills, receipts, and payments from the file. Turn off
            if you only want customers and stock lists.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Source software</Label>
          <Select
            value={importSource}
            onValueChange={(v) => setImportSource(v as "auto" | "tally" | "busy")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect</SelectItem>
              <SelectItem value="tally">Tally (XML)</SelectItem>
              <SelectItem value="busy">BUSY (XML / CSV)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Import mode</Label>
          <Select
            value={importMode}
            onValueChange={(v) => setImportMode(v as "merge" | "replace")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merge">
                Merge — skip names that already exist
              </SelectItem>
              <SelectItem value="replace">
                Replace — clear existing data first (careful)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="importFiles">Export files</Label>
          {importFiles.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {importFiles.length} file{importFiles.length === 1 ? "" : "s"}{" "}
              selected
            </span>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          id="importFiles"
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            applySelectedFiles(Array.from(e.target.files ?? []));
            // Allow picking the same file again after remove / re-add
            e.target.value = "";
          }}
        />

        <div
          className={cn(
            "rounded-lg border border-dashed p-4 transition-colors",
            importFiles.length > 0
              ? "border-border bg-muted/20"
              : "border-muted-foreground/30 bg-muted/10",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={runImport.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <FilePlus2 className="size-4" />
              {importFiles.length === 0
                ? "Select multiple files"
                : "Add more files"}
            </Button>
            {importFiles.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={runImport.isPending}
                onClick={() => {
                  setImportFiles([]);
                  setImportResult(null);
                }}
              >
                Clear all
              </Button>
            ) : null}
          </div>

          {importFiles.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {importFiles.map((file) => (
                <li
                  key={fileKey(file)}
                  className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate" title={file.name}>
                    {file.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    disabled={runImport.isPending}
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setImportFiles((prev) =>
                        prev.filter((f) => fileKey(f) !== fileKey(file)),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Hold <kbd className="rounded border px-1">Ctrl</kbd> (or{" "}
              <kbd className="rounded border px-1">⌘</kbd>) to pick several
              files in the dialog — e.g. BUSY masters + transactions.
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Accepted: <code>.xml</code>, <code>.dat</code> (XML),{" "}
          <code>.csv</code>. Multiple files are merged in one import.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => runImport.mutate()}
          disabled={importFiles.length === 0 || runImport.isPending}
          className="gap-2"
        >
          <Upload className="size-4" />
          {runImport.isPending ? "Importing…" : "Import into SQLite"}
        </Button>

        {isDev ? (
          <Button
            type="button"
            variant="destructive"
            className="gap-2"
            disabled={wipeDb.isPending || runImport.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete ALL local SQLite data? This cannot be undone. (Development only)",
                )
              ) {
                return;
              }
              wipeDb.mutate();
            }}
          >
            <Trash2 className="size-4" />
            {wipeDb.isPending ? "Deleting…" : "Delete all SQLite data"}
          </Button>
        ) : null}
      </div>

      {importResult ? (
        <Alert>
          <AlertTitle>Import result</AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            <p>Detected source: {importResult.source}</p>
            {importResult.filesProcessed && importResult.filesProcessed > 1 ? (
              <p>Files merged: {importResult.filesProcessed}</p>
            ) : null}
            <p>
              Ledgers: {importResult.counts.ledgersCreated ?? 0} · Banks:{" "}
              {importResult.counts.bankAccountsCreated ?? 0} · Groups:{" "}
              {importResult.counts.accountGroupsCreated ?? 0}
            </p>
            <p>
              Parties: {importResult.counts.partiesCreated} created,{" "}
              {importResult.counts.partiesSkipped} skipped
            </p>
            <p>
              Items: {importResult.counts.itemsCreated} created,{" "}
              {importResult.counts.itemsSkipped} skipped
            </p>
            <p>
              Invoices: {importResult.counts.billsCreated} created,{" "}
              {importResult.counts.billsSkipped} skipped
            </p>
            <p>
              Payments: {importResult.counts.paymentsCreated} created,{" "}
              {importResult.counts.paymentsSkipped} skipped
            </p>
            {(importResult.counts.vouchersCreated ?? 0) > 0 ? (
              <p>
                Vouchers (accounting trail): {importResult.counts.vouchersCreated}
              </p>
            ) : null}
            {importResult.warnings.map((w) => (
              <p key={w} className="text-amber-700 dark:text-amber-400">
                {w}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
