import os
import tempfile

from fastapi import APIRouter, Depends, File, Form, UploadFile

from src.middleware.auth import verify_token
from src.schemas.responses import TranscriptionResponse

router = APIRouter(tags=["transcription"])


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    activity_id: str = Form(..., alias="activityId"),
    language: str = Form(default="en"),
    _token: str = Depends(verify_token),
):
    try:
        import whisper  # type: ignore

        suffix = os.path.splitext(file.filename or ".mp3")[1] or ".mp3"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name
        try:
            model = whisper.load_model("base")
            result = model.transcribe(tmp_path, language=language)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return TranscriptionResponse(
            activityId=activity_id,
            transcript=result["text"].strip(),
            duration=float(result.get("duration", 0.0) or 0.0),
            language=language,
        )
    except ImportError:
        return TranscriptionResponse(
            activityId=activity_id,
            transcript="[Whisper not installed — install openai-whisper to enable transcription]",
            duration=0.0,
            language=language,
        )
