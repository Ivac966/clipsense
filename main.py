import os
import re
import traceback

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = FastAPI(title="ClipSense API")

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Groq deprecates llama-3.3-70b-versatile and llama-3.1-8b-instant on 08/16/26.
# After that date, change the values on the right side to the replacements.
MODEL_MAP = {
    "llama-3.3-70b-versatile": "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant": "llama-3.1-8b-instant",
    "openai/gpt-oss-120b": "openai/gpt-oss-120b",
    "openai/gpt-oss-20b": "openai/gpt-oss-20b",
}

DEFAULT_MODEL = "llama-3.3-70b-versatile"

STYLE_PROMPTS = {
    "concise": "Write a short summary in 3 to 5 sentences. Capture only the main point.",
    "detailed": "Write a thorough summary covering all major sections and supporting details.",
    "bullets": "Summarize as 6 to 10 clear bullet points. Start each line with a dash.",
    "takeaways": "List the 5 most important actionable takeaways. Number them 1 to 5.",
}


class SummarizeRequest(BaseModel):
    url: str
    style: str = "concise"
    model: str = DEFAULT_MODEL
    language: str = "en"


class ManualRequest(BaseModel):
    transcript: str
    style: str = "concise"
    model: str = DEFAULT_MODEL


def build_response(
    success=False,
    summary="",
    transcript="",
    video_id="",
    error="",
    error_type="",
):
    t_len = len(transcript)
    s_len = len(summary)
    compression = 0.0
    if t_len > 0 and s_len > 0:
        compression = round((1 - (s_len / t_len)) * 100, 1)
    return {
        "success": success,
        "summary": summary,
        "transcript": transcript,
        "video_id": video_id,
        "error": error,
        "error_type": error_type,
        "transcript_length": t_len,
        "summary_length": s_len,
        "compression": compression,
    }


def extract_video_id(url):
    patterns = [
        r"(?:v=|/v/|youtu\.be/|/embed/|/shorts/|/live/)([0-9A-Za-z_-]{11})",
        r"^([0-9A-Za-z_-]{11})$",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def fetch_transcript(video_id, language="en"):
    """Returns (transcript_text, error_message). One of them is always empty."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except Exception as exc:
        print("TRANSCRIPT IMPORT FAILED:", repr(exc))
        traceback.print_exc()
        return "", "Transcript library is not available on the server."

    langs = [language, "en"] if language != "en" else ["en"]

    # youtube-transcript-api 1.x uses an instance with .fetch()
    try:
        api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id, languages=langs)
        parts = [snippet.text for snippet in fetched]
        text = " ".join(p.strip() for p in parts if p and p.strip())
        if text:
            return text, ""
    except AttributeError:
        pass
    except Exception as exc:
        print("TRANSCRIPT FETCH (v1 api) FAILED:", repr(exc))

    # youtube-transcript-api 0.6.x uses a classmethod
    try:
        raw = YouTubeTranscriptApi.get_transcript(video_id, languages=langs)
        parts = [item.get("text", "") for item in raw]
        text = " ".join(p.strip() for p in parts if p and p.strip())
        if text:
            return text, ""
    except Exception as exc:
        print("TRANSCRIPT FETCH (legacy api) FAILED:", repr(exc))
        traceback.print_exc()

    return "", "Transcript could not be retrieved for this video."


def get_groq_client():
    key = os.getenv("GROQ_API_KEY", "")
    key = key.strip().strip('"').strip("'")
    if not key:
        raise RuntimeError("GROQ_API_KEY is empty or not set in the environment.")
    return Groq(api_key=key)


def summarize_text(transcript, style, model):
    """Returns (summary, error_message). One of them is always empty."""
    style_key = style if style in STYLE_PROMPTS else "concise"
    instruction = STYLE_PROMPTS[style_key]
    resolved_model = MODEL_MAP.get(model, DEFAULT_MODEL)

    text = transcript.strip()
    if len(text) > 24000:
        text = text[:24000]

    try:
        client = get_groq_client()
        completion = client.chat.completions.create(
            model=resolved_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You summarize video transcripts clearly and accurately. "
                        "Never invent information that is not in the transcript."
                    ),
                },
                {
                    "role": "user",
                    "content": f"{instruction}\n\nTranscript:\n{text}",
                },
            ],
            temperature=0.3,
            max_tokens=1600,
        )

        if not completion.choices:
            print("GROQ RETURNED NO CHOICES:", completion)
            return "", "The AI service returned an empty response."

        summary = (completion.choices[0].message.content or "").strip()

        if not summary:
            print("GROQ RETURNED EMPTY CONTENT:", completion)
            return "", "The AI service returned an empty summary."

        return summary, ""

    except Exception as exc:
        print("GROQ CALL FAILED:", repr(exc))
        traceback.print_exc()
        return "", f"AI service error: {exc}"


@app.get("/")
def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return JSONResponse({"detail": "index.html not found"}, status_code=404)


@app.get("/api/health")
def health():
    key = os.getenv("GROQ_API_KEY", "")
    return {
        "ok": True,
        "key_present": bool(key.strip()),
        "key_length": len(key),
        "key_stripped_length": len(key.strip()),
        "key_prefix": key.strip()[:4],
        "default_model": DEFAULT_MODEL,
    }


@app.post("/api/summarize")
def summarize(req: SummarizeRequest):
    try:
        video_id = extract_video_id(req.url or "")
        if not video_id:
            return build_response(
                error="That does not look like a valid YouTube URL.",
                error_type="invalid_url",
            )

        transcript, t_error = fetch_transcript(video_id, req.language or "en")

        if t_error or not transcript:
            return build_response(
                video_id=video_id,
                error=t_error or "No transcript found for this video.",
                error_type="transcript_error",
            )

        summary, s_error = summarize_text(transcript, req.style, req.model)

        if s_error or not summary:
            return build_response(
                transcript=transcript,
                video_id=video_id,
                error=s_error or "Summary generation failed.",
                error_type="ai_error",
            )

        return build_response(
            success=True,
            summary=summary,
            transcript=transcript,
            video_id=video_id,
        )

    except Exception as exc:
        print("UNEXPECTED ERROR IN /api/summarize:", repr(exc))
        traceback.print_exc()
        return build_response(
            error=f"Unexpected server error: {exc}",
            error_type="server_error",
        )


@app.post("/api/summarize-manual")
def summarize_manual(req: ManualRequest):
    try:
        transcript = (req.transcript or "").strip()

        if len(transcript) < 50:
            return build_response(
                transcript=transcript,
                error="Transcript is too short. Please paste at least 50 characters.",
                error_type="invalid_input",
            )

        summary, s_error = summarize_text(transcript, req.style, req.model)

        if s_error or not summary:
            return build_response(
                transcript=transcript,
                error=s_error or "Summary generation failed.",
                error_type="ai_error",
            )

        return build_response(
            success=True,
            summary=summary,
            transcript=transcript,
        )

    except Exception as exc:
        print("UNEXPECTED ERROR IN /api/summarize-manual:", repr(exc))
        traceback.print_exc()
        return build_response(
            error=f"Unexpected server error: {exc}",
            error_type="server_error",
        )