import { connectDb } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";

/** Liveness check. Does not expose paths, env, or stack traces. */
export async function GET() {
  try {
    await connectDb();
    return jsonOk({ ok: true });
  } catch {
    return jsonError("Service unavailable", 503);
  }
}
