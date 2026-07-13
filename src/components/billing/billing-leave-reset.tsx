"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * When the user leaves /billing for another route, mark the form for a fresh
 * start on the next visit. Uses pathname changes (not unmount) so React Strict
 * Mode remounts do not wipe in-progress invoices.
 */
export function BillingLeaveReset() {
  const pathname = usePathname();
  const prevPath = useRef(pathname);

  useEffect(() => {
    const prev = prevPath.current;
    const wasBilling = prev === "/billing" || prev.startsWith("/billing/");
    const isBilling =
      pathname === "/billing" || pathname.startsWith("/billing/");

    if (wasBilling && !isBilling) {
      try {
        sessionStorage.removeItem("cf_billing_draft");
        sessionStorage.setItem("cf_billing_needs_reset", "1");
        sessionStorage.setItem("cf_last_billing_path", "/billing");
      } catch {
        // ignore
      }
    }

    prevPath.current = pathname;
  }, [pathname]);

  return null;
}
