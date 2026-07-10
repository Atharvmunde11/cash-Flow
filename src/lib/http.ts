import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Use in route catch blocks — logs full detail server-side; client gets a safe message. */
export function formatRouteError(e: unknown, clientMessage = "Internal server error"): string {
  if (process.env.NODE_ENV !== "production") {
    if (e instanceof Error) {
      const code =
        "code" in e && typeof (e as { code?: unknown }).code === "string"
          ? `[${(e as { code: string }).code}] `
          : "";
      const msg = e.message?.trim() || e.name || "Error";
      return `${code}${msg}`;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return clientMessage;
}
