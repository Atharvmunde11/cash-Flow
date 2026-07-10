import { connectDb, db } from "@/lib/db";
import { getAppSetting, setAppSetting } from "@/lib/app-settings";
import { jsonError, jsonOk } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";

type OnboardingStatus = "pending" | "business_done" | "complete";

function resolveStep(status: OnboardingStatus | undefined | null) {
  if (status === "pending") return "business" as const;
  if (status === "business_done") return "import" as const;
  return null;
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip_business") }),
  z.object({ action: z.literal("skip_import") }),
  z.object({
    action: z.literal("complete_business"),
    business: z.object({
      name: z.string().min(1).max(200),
      address: z.string().max(1000).optional().default(""),
      phone: z.string().max(50).optional().default(""),
    }),
  }),
  z.object({ action: z.literal("complete_import") }),
]);

async function readBusinessProfile() {
  const profile = await db.businessProfile.upsert({
    where: { key: "singleton" },
    update: {},
    create: { key: "singleton", name: "", address: "" },
  });
  const phone = (await getAppSetting<string>("business.phone")) ?? "";
  return {
    name: profile.name ?? "",
    address: profile.address ?? "",
    phone,
  };
}

export async function GET() {
  try {
    await connectDb();
    const status =
      (await getAppSetting<OnboardingStatus>("onboarding.status")) ?? "pending";

    return jsonOk({
      step: resolveStep(status),
      business: await readBusinessProfile(),
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
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const action = parsed.data.action;

    if (action === "skip_business" || action === "complete_business") {
      if (action === "complete_business") {
        await db.businessProfile.upsert({
          where: { key: "singleton" },
          update: {
            name: parsed.data.business.name.trim(),
            address: parsed.data.business.address ?? "",
          },
          create: {
            key: "singleton",
            name: parsed.data.business.name.trim(),
            address: parsed.data.business.address ?? "",
          },
        });
        await setAppSetting("business.phone", parsed.data.business.phone ?? "");
      }
      await setAppSetting("onboarding.status", "business_done");
      return jsonOk({ step: resolveStep("business_done") });
    }

    await setAppSetting("onboarding.status", "complete");
    return jsonOk({ step: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return jsonError(msg, 500);
  }
}
