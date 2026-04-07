"use client";

import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DataPage() {
  const [aiReply, setAiReply] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [ocrText, setOcrText] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import / Export &amp; tools
        </h1>
        <p className="text-sm text-muted-foreground">
          Local JSON/CSV export, structured import, receipt OCR, and Ollama
          assistant.
        </p>
      </div>

      <Tabs defaultValue="export">
        <TabsList>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="ocr">OCR</TabsTrigger>
          <TabsTrigger value="ai">Local AI</TabsTrigger>
        </TabsList>

        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle>Download data</CardTitle>
              <CardDescription>
                Full snapshot as JSON, or ledger transactions as CSV.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <a
                href="/api/export?format=json"
                download
                className={cn(buttonVariants({ variant: "secondary" }))}
              >
                JSON export
              </a>
              <a
                href="/api/export?format=csv"
                download
                className={cn(buttonVariants({ variant: "secondary" }))}
              >
                CSV (transactions)
              </a>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import">
          <Card>
            <CardHeader>
              <CardTitle>Import JSON</CardTitle>
              <CardDescription>
                Paste an export payload or merge partial collections. Use
                &quot;merge&quot; to append without wiping.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ImportJsonPanel />
              <p className="text-xs text-muted-foreground">
                Excel: upload a sheet with columns name, categoryId, price,
                quantity — parsed client-side then POST /api/items per row (batch
                endpoint can be added).
              </p>
              <ExcelImportPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ocr">
          <Card>
            <CardHeader>
              <CardTitle>Receipt OCR (Tesseract.js)</CardTitle>
              <CardDescription>
                Runs on the server — image is sent as base64.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const buf = await f.arrayBuffer();
                  const bytes = new Uint8Array(buf);
                  let binary = "";
                  for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                  }
                  const b64 = btoa(binary);
                  const res = await fetch("/api/ocr", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imageBase64: b64 }),
                  });
                  const body = await res.json();
                  if (!res.ok) {
                    toast.error(body.error ?? "OCR failed");
                    return;
                  }
                  setOcrText(body.data.text);
                  toast.success("OCR complete");
                }}
              />
              <Textarea
                readOnly
                rows={8}
                value={ocrText}
                placeholder="Extracted text…"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>Ollama</CardTitle>
              <CardDescription>
                Default: http://127.0.0.1:11434 — set OLLAMA_URL / OLLAMA_MODEL
                in .env.local
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AiPanel
                onReply={setAiReply}
                busy={aiBusy}
                setBusy={setAiBusy}
              />
              <Textarea readOnly rows={10} value={aiReply} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ImportJsonPanel() {
  const [raw, setRaw] = useState("");

  return (
    <div className="space-y-2">
      <Label>JSON payload</Label>
      <Textarea rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} />
      <Button
        type="button"
        onClick={async () => {
          try {
            const body = JSON.parse(raw);
            const res = await fetch("/api/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, mode: "merge" }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error ?? "Import failed");
            toast.success(`Imported: ${JSON.stringify(j.data.counts)}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Invalid JSON");
          }
        }}
      >
        Import merge
      </Button>
    </div>
  );
}

function ExcelImportPanel() {
  return (
    <div className="space-y-2">
      <Label>Excel / CSV → items (name, categoryId, price, quantity)</Label>
      <Input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const buf = await f.arrayBuffer();
          let rows: Record<string, unknown>[] = [];
          if (f.name.endsWith(".csv")) {
            const text = new TextDecoder().decode(buf);
            const parsed = Papa.parse(text, { header: true });
            rows = parsed.data as Record<string, unknown>[];
          } else {
            const wb = XLSX.read(buf, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
          }
          let ok = 0;
          for (const r of rows) {
            const name = String(r.name ?? r.Name ?? "").trim();
            const categoryId = String(r.categoryId ?? r.category ?? "").trim();
            if (!name || categoryId.length !== 24) continue;
            const res = await fetch("/api/items", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                categoryId,
                price: Number(r.price ?? 0),
                quantity: Number(r.quantity ?? 0),
              }),
            });
            if (res.ok) ok++;
          }
          toast.success(`Imported ${ok} items`);
        }}
      />
    </div>
  );
}

function AiPanel(props: {
  onReply: (s: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [msg, setMsg] = useState("");

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        placeholder="Ask about stock, dues, or billing…"
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
      />
      <Button
        type="button"
        disabled={props.busy || !msg.trim()}
        onClick={async () => {
          props.setBusy(true);
          try {
            const res = await fetch("/api/ai", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: msg }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? "AI error");
            props.onReply(body.data.reply);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          } finally {
            props.setBusy(false);
          }
        }}
      >
        Send
      </Button>
    </div>
  );
}
