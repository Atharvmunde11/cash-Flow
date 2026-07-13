"use client";

import { useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Routes that appear in the sidebar — no Back button. */
const SIDEBAR_ROUTES = new Set([
  "/",
  "/daybook",
  "/billing",
  "/transactions",
  "/sale-returns",
  "/credit",
  "/purchases",
  "/purchase-returns",
  "/parties",
  "/receipts",
  "/payments",
  "/inventory",
  "/categories",
  "/sundries",
  "/employees",
  "/attendance",
  "/payrolls",
  "/reports",
  "/bank-accounts",
  "/settings",
]);

/** Logical parent for nested screens (not browser history). */
function getParentPath(pathname: string): string | null {
  if (SIDEBAR_ROUTES.has(pathname)) return null;

  if (/^\/parties\/[^/]+$/.test(pathname)) return "/parties";
  if (/^\/employees\/[^/]+$/.test(pathname)) return "/employees";
  if (/^\/inventory\/[^/]+$/.test(pathname)) return "/inventory";
  if (/^\/billing\/[^/]+$/.test(pathname)) return "/transactions";

  // Fallback: strip last segment for unknown nested detail paths
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return `/${parts.slice(0, -1).join("/")}`;
  }
  return null;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function hasOpenOverlay() {
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-open], [data-state="open"][role="dialog"], [data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-radix-popper-content-wrapper]',
    ),
  );
}

/** Back to the parent section — only on nested detail screens. Esc does the same. */
export function PageBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const parentPath = useMemo(() => getParentPath(pathname), [pathname]);

  const goBack = useCallback(() => {
    if (!parentPath) return;
    router.push(parentPath);
  }, [parentPath, router]);

  useEffect(() => {
    if (!parentPath) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      if (hasOpenOverlay()) return;

      e.preventDefault();
      goBack();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goBack, parentPath]);

  if (!parentPath) return null;

  return (
    <div className="print:hidden mb-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={goBack}
        title="Back (Esc)"
      >
        <ArrowLeft className="size-3.5" />
        Back
        <kbd className="ml-1 rounded border bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
          Esc
        </kbd>
      </Button>
    </div>
  );
}
