import type { NextRequest } from "next/server";

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

/**
 * CashFlow is local-first. By default, API routes reject non-loopback Host headers
 * so a dev server bound to 0.0.0.0 is not writable from the LAN.
 *
 * Set ALLOW_REMOTE_ACCESS=1 to disable (e.g. intentional LAN/Docker access).
 */
export function isLocalAccess(request: NextRequest | Request): boolean {
  if (process.env.ALLOW_REMOTE_ACCESS === "1") return true;

  const hostHeader =
    request.headers.get("host")?.split(":")[0]?.trim().toLowerCase() ?? "";
  if (hostHeader && LOOPBACK_HOSTS.has(hostHeader)) return true;

  // Some local clients omit Host; treat as local in non-production only.
  if (!hostHeader && process.env.NODE_ENV !== "production") return true;

  return false;
}

/** Prisma cuid() ids used for bills and other resources */
export function isValidResourceId(id: string): boolean {
  return /^[a-z0-9]{20,32}$/i.test(id);
}
