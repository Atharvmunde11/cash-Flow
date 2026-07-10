"use client";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AgentChatSidebar } from "@/components/layout/agent-chat-sidebar";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const handleChatToggle = () => {
    setChatOpen((prev) => {
      const next = !prev;

      return next;
    });
  };

  const handleSidebarOpen = () => {
    setChatOpen(false);
  };

  const handleMobileOpen = () => {
    setChatOpen(false);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        handleChatToggle();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <div className="print:hidden">
        <AppSidebar
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onSidebarOpen={handleSidebarOpen}
          onMobileOpen={handleMobileOpen}
        />
      </div>

      {/* Spacer (VERY IMPORTANT) - matches the fixed sidebar width */}
      <div
        className={cn(
          "hidden md:block transition-all duration-300 shrink-0 print:hidden",
          collapsed ? "w-16" : "w-64",
        )}
      />

      {/* Content */}
      <main className="flex-1 p-4 md:p-8 overflow-auto pb-12 relative">
        {/* Chat Toggle Button */}
        {/* <Button
          onClick={handleChatToggle}
          variant="outline"
          size="icon"
          className={cn(
            "fixed right-4 top-4 z-40 h-12 w-12 rounded-2xl border border-border/70 bg-background/85 shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95",
            chatOpen && "bg-sidebar text-sidebar-foreground",
          )}
          title="Open Assistant"
        >
          <MessageCircle className="size-5" />
        </Button> */}

        {children}
      </main>

      {/* Agent Chat Sidebar */}
      <div className="print:hidden">
        <AgentChatSidebar isOpen={chatOpen} setIsOpen={setChatOpen} />
      </div>

      {/* Global keyboard shortcuts + calculator bottom bar */}
      <div className="print:hidden">
        <KeyboardShortcuts />
      </div>

      <OnboardingFlow />
    </div>
  );
}
