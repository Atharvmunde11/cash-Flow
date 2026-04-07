import { jsonError, jsonOk } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(1).max(8000),
});

const OLLAMA_URL =
  process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(JSON.stringify(parsed.error.flatten()), 422);
    }

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a concise assistant for a small-business accounting and inventory app. Give practical, short answers about bookkeeping, stock, and billing.",
          },
          { role: "user", content: parsed.data.message },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return jsonError(`Ollama error: ${res.status} ${t}`, 502);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
    };
    const text = data.message?.content ?? "";
    return jsonOk({ reply: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI request failed";
    return jsonError(
      `${msg}. Ensure Ollama is running locally (default ${OLLAMA_URL}).`,
      502
    );
  }
}
