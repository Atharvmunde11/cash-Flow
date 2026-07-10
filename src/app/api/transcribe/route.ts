import { NextRequest } from "next/server";
import { assertLocalHttpUrl, MAX_TRANSCRIBE_BYTES } from "@/lib/request-security";

function getTranscribeUrl(): string {
  return assertLocalHttpUrl(
    process.env.TRANSCRIBE_URL ?? "http://127.0.0.1:8000/transcribe",
  );
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "No audio file uploaded" }, { status: 400 });
    }

    if (file.size > MAX_TRANSCRIBE_BYTES) {
      return Response.json({ error: "Audio file too large (max 10 MB)" }, { status: 413 });
    }

    const allowed = new Set([
      "audio/webm",
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
    ]);
    if (file.type && !allowed.has(file.type)) {
      return Response.json({ error: "Unsupported audio type" }, { status: 415 });
    }

    const localForm = new FormData();
    localForm.append("file", file);

    const res = await fetch(getTranscribeUrl(), {
      method: "POST",
      body: localForm,
      signal: AbortSignal.timeout(120_000),
    });

    const text = await res.text();

    if (!res.ok) {
      console.error("Transcribe upstream error:", text.slice(0, 500));
      return Response.json({ error: "Transcription service unavailable" }, { status: 502 });
    }

    let data: { text?: string };
    try {
      data = JSON.parse(text) as { text?: string };
    } catch {
      return Response.json({ error: "Invalid transcription response" }, { status: 502 });
    }

    return Response.json({
      text: typeof data.text === "string" ? data.text.slice(0, 20_000) : "",
    });
  } catch (err) {
    console.error("Transcribe API error:", err);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
