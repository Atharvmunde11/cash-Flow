"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { ImportPanel } from "@/components/import/import-panel";
import { AppUpdatePanel } from "@/components/settings/app-update-panel";
import { CustomSundrySettingsPanel } from "@/components/forms/sundry-combobox";
import { FinancialYearPanel } from "@/components/settings/financial-year-panel";

type BusinessProfile = { name: string; address: string; phone: string };

async function fetchBusinessProfile(): Promise<BusinessProfile> {
  const res = await fetch("/api/settings/business");
  if (!res.ok) throw new Error("Failed");
  return ((await res.json()) as { data: BusinessProfile }).data;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["business-profile"], queryFn: fetchBusinessProfile });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!q.data) return;
    setName(q.data.name ?? "");
    setAddress(q.data.address ?? "");
    setPhone(q.data.phone ?? "");
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, phone }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["business-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Business details and data import from Tally or BUSY.
        </p>
      </div>

      <div className="rounded-xl border p-4 space-y-4">
        <div>
          <h2 className="text-lg font-medium">Business profile</h2>
          <p className="text-sm text-muted-foreground">
            Used on invoices, PDFs, and reports.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bizName">Business name</Label>
          <Input
            id="bizName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Atharv Traders"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bizPhone">Business phone</Label>
          <Input
            id="bizPhone"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 9876543210"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bizAddress">Business address</Label>
          <Textarea
            id="bizAddress"
            rows={4}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, Area, City, State, PIN"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending || q.isLoading}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setName(q.data?.name ?? "");
              setAddress(q.data?.address ?? "");
              setPhone(q.data?.phone ?? "");
            }}
            disabled={q.isLoading}
          >
            Reset
          </Button>
        </div>

        {q.isError ? (
          <p className="text-sm text-destructive">Failed to load settings.</p>
        ) : null}
      </div>

      <FinancialYearPanel />

      <AppUpdatePanel />

      <CustomSundrySettingsPanel />

      <p className="text-sm text-muted-foreground">
        Tip: you can also manage these under{" "}
        <a href="/sundries" className="underline underline-offset-2">
          Stock → Sundries
        </a>
        .
      </p>

      <div className="rounded-xl border p-4 space-y-5">
        <div>
          <h2 className="text-lg font-medium">Import from Tally or BUSY</h2>
          <p className="text-sm text-muted-foreground">
            Bring customers, stock, old invoices, and payment vouchers from Tally
            or BUSY into local SQLite.
          </p>
        </div>

        <ImportPanel />
      </div>
    </div>
  );
}
