import { connectDb, db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getAppSetting, setAppSetting } from "@/lib/app-settings";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z
  .object({
    name: z.string().min(1).max(200),
    address: z.string().max(1000).optional().default(""),
    phone: z.string().max(50).optional().default(""),
  })
  .strict();

export async function GET() {
  try {
    await connectDb();
    const doc = await db.businessProfile.upsert({
      where: { key: "singleton" },
      update: {},
      create: { key: "singleton", name: "", address: "" },
    });
    const phone = (await getAppSetting<string>("business.phone")) ?? "";
    return jsonOk({
      name: doc.name ?? "",
      address: doc.address ?? "",
      phone,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

export async function PATCH(req: Request) {
  try {
    await connectDb();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonError(JSON.stringify(parsed.error.flatten()), 422);

    const doc = await db.businessProfile.upsert({
      where: { key: "singleton" },
      update: {
        name: parsed.data.name.trim(),
        address: parsed.data.address ?? "",
      },
      create: {
        key: "singleton",
        name: parsed.data.name.trim(),
        address: parsed.data.address ?? "",
      },
    });
    await setAppSetting("business.phone", parsed.data.phone ?? "");

    return jsonOk({
      name: doc.name ?? "",
      address: doc.address ?? "",
      phone: (await getAppSetting<string>("business.phone")) ?? "",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}

