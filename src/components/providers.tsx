"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 30 * 60_000,
            // Always reload list/dashboard data when navigating back to a page.
            refetchOnWindowFocus: true,
            refetchOnMount: "always",
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/app");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { theme?: string } };
        const saved = json?.data?.theme;
        if (!cancelled && saved && typeof saved === "string") {
          try {
            localStorage.setItem("theme", saved);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        themes={[
          "light",
          "dark",
          "finance-green",
          "minimal-gray",
          "minimal-gray-dark",
          "modern-purple",
          "warm-business",
        ]}
      >
        <TooltipProvider>
          {children}
          <Toaster richColors closeButton position="top-right" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
