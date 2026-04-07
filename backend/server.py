from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
import shutil

app = FastAPI()

model = WhisperModel("base")  # change to small/medium if needed

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    file_path = f"temp_{file.filename}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    segments, _ = model.transcribe(file_path)

    text = " ".join([seg.text for seg in segments])

    return {"text": text}