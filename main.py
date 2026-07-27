"""
YouTube Summarizer - FastAPI Backend
Handles transcript fetching and AI summarization.
"""

import os
import re
from fastapi import FastAPI, HTTPException
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

# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI(title="YouTube Summarizer API")

# CORS middleware (allows frontend to talk to backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq client
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in environment variables")

client = Groq(api_key=GROQ_API_KEY)


# --- Request/Response Models ---
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
    transcript_length: int = 0
    summary_length: int = 0
    compression: float = 0


# --- Helper Functions ---
def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from various URL formats."""
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
    """Fetch transcript for a YouTube video."""
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=[language, "en"])
        text = " ".join([snippet.text for snippet in transcript])
        return text, None
    except TranscriptsDisabled:
        return None, "Transcripts are disabled for this video."
    except NoTranscriptFound:
        return None, f"No transcript found in '{language}' or English."
    except VideoUnavailable:
        return None, "Video is unavailable or private."
    except Exception as e:
        return None, f"Could not fetch transcript: {str(e)}"


def summarize_with_ai(text: str, style: str, model: str) -> str:
    """Generate summary using Groq API."""
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


# --- API Endpoints ---
@app.get("/")
async def serve_index():
    """Serve the frontend."""
    return FileResponse("static/index.html")


@app.post("/api/summarize", response_model=SummarizeResponse)
async def summarize(request: SummarizeRequest):
    """Main endpoint: fetch transcript and summarize."""
    video_id = extract_video_id(request.url)
    if not video_id:
        return SummarizeResponse(
            success=False,
            error="Invalid YouTube URL. Please check the link."
        )

    # Fetch transcript
    transcript, error = fetch_transcript(video_id, request.language)
    if error:
        return SummarizeResponse(
            success=False,
            video_id=video_id,
            error=error
        )

    # Generate summary
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
    except Exception as e:
        return SummarizeResponse(
            success=False,
            video_id=video_id,
            error=f"AI generation failed: {str(e)}"
        )


@app.post("/api/summarize-manual", response_model=SummarizeResponse)
async def summarize_manual(request: SummarizeManualRequest):
    """Fallback endpoint: summarize manually pasted transcript."""
    if not request.transcript.strip():
        return SummarizeResponse(
            success=False,
            error="Transcript is empty."
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
    except Exception as e:
        return SummarizeResponse(
            success=False,
            error=f"AI generation failed: {str(e)}"
        )


# Mount static files (must be LAST — after routes)
app.mount("/static", StaticFiles(directory="static"), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)