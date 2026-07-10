"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportGuide } from "@/components/import/import-guide";

export type ImportResult = {
  source: string;
  filesProcessed?: number;
  counts: {
    partiesCreated: number;
    partiesSkipped: number;
    itemsCreated: number;
    itemsSkipped: number;
    categoriesCreated: number;
    billsCreated: number;
    billsSkipped: number;
    paymentsCreated: number;
    paymentsSkipped: number;
  };
  warnings: string[];
};

type ImportPanelProps = {
  onImported?: (result: ImportResult) => void;
  showGuide?: boolean;
};

export function ImportPanel({ onImported, showGuide = true }: ImportPanelProps) {
  const qc = useQueryClient();
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importSource, setImportSource] = useState<"auto" | "tally" | "busy">(
    "auto",
  );
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [includeVouchers, setIncludeVouchers] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

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

      <div className="space-y-1.5">
        <Label htmlFor="importFiles">Export files</Label>
        <Input
          id="importFiles"
          type="file"
          multiple
          accept=".xml,.dat,.csv,text/xml,text/csv"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            setImportFiles(list);
            setImportResult(null);
            if (list.some((f) => f.name.toLowerCase().endsWith(".dat"))) {
              setImportSource("busy");
            }
          }}
        />
        {importFiles.length > 0 ? (
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
            {importFiles.map((file) => (
              <li key={`${file.name}-${file.size}`}>{file.name}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Select one or more files. Accepted: <code>.xml</code>,{" "}
          <code>.dat</code> (XML), <code>.csv</code> — max 25 MB each, up to 20
          files.
        </p>
      </div>

      <Button
        onClick={() => runImport.mutate()}
        disabled={importFiles.length === 0 || runImport.isPending}
        className="gap-2"
      >
        <Upload className="size-4" />
        {runImport.isPending ? "Importing…" : "Import into SQLite"}
      </Button>

      {importResult ? (
        <Alert>
          <AlertTitle>Import result</AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            <p>Detected source: {importResult.source}</p>
            {importResult.filesProcessed && importResult.filesProcessed > 1 ? (
              <p>Files merged: {importResult.filesProcessed}</p>
            ) : null}
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
