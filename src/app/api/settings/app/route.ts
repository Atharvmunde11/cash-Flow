import { jsonError, jsonOk } from "@/lib/http";
import { getAppSetting, setAppSetting } from "@/lib/app-settings";
import { z } from "zod";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    theme: z.string().min(1).max(50).optional(),
  })
  .strict();

export async function GET() {
  try {
    const theme = await getAppSetting<string>("theme");
    return jsonOk({ theme: theme ?? "" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    if (parsed.data.theme) {
      await setAppSetting("theme", parsed.data.theme);
    }

    const theme = await getAppSetting<string>("theme");
    return jsonOk({ theme: theme ?? "" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

