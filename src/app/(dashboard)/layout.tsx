"use client";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { UpdateAvailableToast } from "@/components/layout/update-available-toast";
import { BillingLeaveReset } from "@/components/billing/billing-leave-reset";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { PageBackButton } from "@/components/shared/page-back-button";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <div className="print:hidden">
        <AppSidebar
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
      </div>

      <div
        className={cn(
          "hidden md:block transition-all duration-300 shrink-0 print:hidden",
          collapsed ? "w-16" : "w-64",
        )}
      />

      <main className="flex-1 p-4 md:p-8 overflow-auto pb-12 relative">
        <PageBackButton />
        {children}
      </main>

      <div className="print:hidden">
        <KeyboardShortcuts />
        <UpdateAvailableToast />
        <BillingLeaveReset />
      </div>

      <OnboardingFlow />
    </div>
  );
}
