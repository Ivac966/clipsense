# ClipSense

AI-powered YouTube video summarizer. Paste a link, get a clean structured summary in seconds.

Built with FastAPI, Groq AI, and vanilla JavaScript — no frontend frameworks.

---

## Features

- Automatic transcript fetching from YouTube
- Four summary styles: Concise, Detailed, Bullet Points, Key Takeaways
- Model selection: Llama 3.3 70B (accurate) or Llama 3.1 8B (fast)
- Multi-language transcript support
- Manual transcript fallback when auto-fetch is unavailable
- Compression stats and full transcript viewer
- Fully responsive dark UI

---

## Tech Stack

- **Backend:** FastAPI, Uvicorn
- **AI:** Groq API (Llama 3.3 / 3.1)
- **Transcripts:** youtube-transcript-api
- **Frontend:** Vanilla HTML, CSS, JavaScript

---

## Setup

### 1. Clone and enter the project

```bash
git clone https://github.com/Ivac966/clipsense.git
cd clipsense
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/Scripts/activate    # Windows (Git Bash)
source venv/bin/activate        # Mac/Linux
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Add your Groq API key

Create a `.env` file in the project root:

GROQ_API_KEY=