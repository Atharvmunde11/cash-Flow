"use client";

import { CustomSundrySettingsPanel } from "@/components/forms/sundry-combobox";

export default function SundriesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sundries</h1>
        <p className="text-sm text-muted-foreground">
          Manage custom sundry labels used on bills. Billing only allows presets
          and these custom labels — no free typing or walk-in labels.
        </p>
      </div>
      <CustomSundrySettingsPanel />
    </div>
  );
}
