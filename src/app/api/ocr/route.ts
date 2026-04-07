import { jsonError, jsonOk } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  imageBase64: z.string().min(10),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const { createWorker } = await import("tesseract.js");
    const buf = Buffer.from(parsed.data.imageBase64, "base64");
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(buf);
      return jsonOk({ text: text.trim() });
    } finally {
      await worker.terminate();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OCR failed";
    return jsonError(msg, 500);
  }
}
