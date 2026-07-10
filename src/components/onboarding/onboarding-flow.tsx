"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImportPanel } from "@/components/import/import-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type OnboardingStep = "business" | "import" | null;

type OnboardingResponse = {
  step: OnboardingStep;
  business: { name: string; address: string; phone: string };
};

async function fetchOnboarding(): Promise<OnboardingResponse> {
  const res = await fetch("/api/onboarding", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load onboarding");
  return ((await res.json()) as { data: OnboardingResponse }).data;
}

async function patchOnboarding(body: Record<string, unknown>) {
  const res = await fetch("/api/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed");
  return json.data as { step: OnboardingStep };
}

export function OnboardingFlow() {
  const qc = useQueryClient();

  const onboarding = useQuery({
    queryKey: ["onboarding"],
    queryFn: fetchOnboarding,
  });

  const [businessOpen, setBusinessOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (!onboarding.data) return;
    setName(onboarding.data.business.name ?? "");
    setPhone(onboarding.data.business.phone ?? "");
    setAddress(onboarding.data.business.address ?? "");
  }, [onboarding.data]);

  useEffect(() => {
    if (onboarding.isLoading || !onboarding.data) return;
    if (onboarding.data.step === "business") {
      setBusinessOpen(true);
      setImportOpen(false);
      return;
    }
    if (onboarding.data.step === "import") {
      setBusinessOpen(false);
      setImportOpen(true);
      return;
    }
    setBusinessOpen(false);
    setImportOpen(false);
  }, [onboarding.isLoading, onboarding.data]);

  const advance = useMutation({
    mutationFn: patchOnboarding,
    onSuccess: (data) => {
      qc.setQueryData(["onboarding"], (prev: OnboardingResponse | undefined) =>
        prev ? { ...prev, step: data.step } : prev,
      );
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      qc.invalidateQueries({ queryKey: ["business-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function finishBusiness(next: "skip" | "save") {
    if (next === "skip") {
      advance.mutate(
        { action: "skip_business" },
        {
          onSuccess: () => {
            setBusinessOpen(false);
            setImportOpen(true);
          },
        },
      );
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter your shop name");
      return;
    }

    advance.mutate(
      {
        action: "complete_business",
        business: { name: trimmed, phone, address },
      },
      {
        onSuccess: () => {
          toast.success("Shop details saved");
          setBusinessOpen(false);
          setImportOpen(true);
        },
      },
    );
  }

  function finishImport(next: "skip" | "done") {
    advance.mutate(
      { action: next === "skip" ? "skip_import" : "complete_import" },
      {
        onSuccess: () => {
          setImportOpen(false);
          if (next === "done") toast.success("Welcome to CashFlow");
        },
      },
    );
  }

  if (onboarding.data?.step == null) return null;

  return (
    <>
      <Dialog open={businessOpen} onOpenChange={setBusinessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set up your shop</DialogTitle>
            <DialogDescription>
              Add your shop details for invoices and reports. You can change
              these later in Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="onboardName">Shop name</Label>
              <Input
                id="onboardName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Atharv Traders"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboardPhone">Shop phone number</Label>
              <Input
                id="onboardPhone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onboardAddress">Address</Label>
              <Textarea
                id="onboardAddress"
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, Area, City, State, PIN"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => finishBusiness("skip")}
              disabled={advance.isPending}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              onClick={() => finishBusiness("save")}
              disabled={advance.isPending}
            >
              {advance.isPending ? "Saving…" : "Save & continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Import your data</DialogTitle>
            <DialogDescription>
              Bring customers, stock, invoices, and payments from Tally or BUSY.
              You can also do this later in Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <ImportPanel
              onImported={() => {
                finishImport("done");
              }}
            />
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:gap-0 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => finishImport("skip")}
              disabled={advance.isPending}
            >
              Skip for now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
