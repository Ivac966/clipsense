"""
ClipSense - FastAPI Backend
Handles transcript fetching and AI summarization.
"""

import os
import re
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="ClipSense API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_client():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not found in environment variables")
    return Groq(api_key=api_key)


class SummarizeRequest(BaseModel):
    url: str
    style: str = "concise"
    model: str = "llama-3.3-70b-versatile"
    language: str = "en"


class SummarizeManualRequest(BaseModel):
    transcript: str
    style: str = "concise"
    model: str = "llama-3.3-70b-versatile"


class SummarizeResponse(BaseModel):
    success: bool
    summary: str = ""
    transcript: str = ""
    video_id: str = ""
    error: str = ""
    error_type: str = ""
    transcript_length: int = 0
    summary_length: int = 0
    compression: float = 0


def extract_video_id(url: str) -> str:
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"(?:youtu\.be\/)([0-9A-Za-z_-]{11})",
        r"(?:embed\/)([0-9A-Za-z_-]{11})",
        r"(?:shorts\/)([0-9A-Za-z_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return ""


def fetch_transcript(video_id: str, language: str = "en"):
    """Returns (text, error_message, error_type)."""
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=[language, "en"])
        text = " ".join([snippet.text for snippet in transcript])
        return text, None, None
    except TranscriptsDisabled:
        return None, "This video has captions turned off by its creator.", "disabled"
    except NoTranscriptFound:
        return None, f"No captions available in '{language}' or English.", "not_found"
    except VideoUnavailable:
        return None, "This video is private or unavailable.", "unavailable"
    except Exception as e:
        message = str(e).lower()
        if "blocking requests" in message or "ipblocked" in message or "requestblocked" in message:
            return None, "YouTube blocks automatic transcript downloads from cloud servers.", "ip_blocked"
        return None, "Could not retrieve the transcript for this video.", "generic"


def summarize_with_ai(text: str, style: str, model: str) -> str:
    client = get_client()

    max_chars = 60000
    if len(text) > max_chars:
        text = text[:max_chars] + "... [transcript truncated]"

    style_prompts = {
        "concise": "concise 3-4 sentence",
        "detailed": "detailed multi-paragraph",
        "bullets": "clear bullet-point (use - for each point)",
        "takeaways": "numbered list of 5-7 key takeaways",
    }

    style_prompt = style_prompts.get(style, "concise 3-4 sentence")

    prompt = f"""Summarize the following YouTube video transcript in a {style_prompt} way.
Focus on the main ideas, key points, and any actionable takeaways.
Ignore filler words, repetitions, and sponsor mentions.

Transcript:
{text}

Summary:"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are an expert at creating clear, structured summaries of YouTube videos."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.5,
        max_tokens=800,
    )

    return response.choices[0].message.content


@app.get("/")
async def serve_index():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/summarize", response_model=SummarizeResponse)
async def summarize(request: SummarizeRequest):
    video_id = extract_video_id(request.url)
    if not video_id:
        return SummarizeResponse(
            success=False,
            error="That doesn't look like a valid YouTube link.",
            error_type="invalid_url"
        )

    transcript, error, error_type = fetch_transcript(video_id, request.language)
    if error:
        return SummarizeResponse(
            success=False,
            video_id=video_id,
            error=error,
            error_type=error_type
        )

    try:
        summary = summarize_with_ai(transcript, request.style, request.model)
        compression = round((1 - len(summary) / len(transcript)) * 100, 1) if transcript else 0

        return SummarizeResponse(
            success=True,
            summary=summary,
            transcript=transcript,
            video_id=video_id,
            transcript_length=len(transcript),
            summary_length=len(summary),
            compression=compression
        )
    except Exception:
        return SummarizeResponse(
            success=False,
            video_id=video_id,
            error="The AI service is unavailable right now. Please try again.",
            error_type="ai_error"
        )


@app.post("/api/summarize-manual", response_model=SummarizeResponse)
async def summarize_manual(request: SummarizeManualRequest):
    if not request.transcript.strip():
        return SummarizeResponse(
            success=False,
            error="Please paste a transcript first.",
            error_type="empty"
        )

    try:
        summary = summarize_with_ai(request.transcript, request.style, request.model)
        compression = round((1 - len(summary) / len(request.transcript)) * 100, 1)

        return SummarizeResponse(
            success=True,
            summary=summary,
            transcript=request.transcript,
            transcript_length=len(request.transcript),
            summary_length=len(summary),
            compression=compression
        )
    except Exception:
        return SummarizeResponse(
            success=False,
            error="The AI service is unavailable right now. Please try again.",
            error_type="ai_error"
        )


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)