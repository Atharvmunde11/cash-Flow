import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const localForm = new FormData();
    localForm.append("file", file);

    const res = await fetch("http://localhost:8000/transcribe", {
      method: "POST",
      body: localForm,
    });

    const text = await res.text(); // 👈 safer than res.json()

    if (!res.ok) {
      console.error("Whisper error:", text);
      return Response.json({ error: text }, { status: 500 });
    }

    const data = JSON.parse(text);

    return Response.json({
      text: data.text,
    });
  } catch (err: any) {
    console.error("API ERROR:", err);
    return Response.json(
      { error: err.message || "Internal error" },
      { status: 500 },
    );
  }
}
