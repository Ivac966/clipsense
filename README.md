# ClipSense

AI-powered YouTube video summarizer. Paste a link, get a clean structured summary in seconds.

Built with FastAPI, Groq AI, and vanilla JavaScript — no frontend frameworks.

**Live demo:** [clipsense-five.vercel.app](https://clipsense-five.vercel.app)

---

## Features

- Automatic transcript fetching from YouTube
- Manual transcript paste fallback when auto-fetch is unavailable
- Four summary styles: Concise, Detailed, Bullet Points, Key Takeaways
- Model selection: GPT-OSS 120B (accurate) or GPT-OSS 20B (fast)
- Multi-language transcript support
- Markdown-rendered output with compression stats and full transcript viewer
- Health check endpoint for diagnosing deployment issues
- Fully responsive dark UI

---

## Tech Stack

- **Backend:** FastAPI, Uvicorn
- **AI:** Groq API (OpenAI GPT-OSS models)
- **Transcripts:** youtube-transcript-api
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Deployment:** Vercel

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

```
GROQ_API_KEY=your_key_here
```

Get a free key at [console.groq.com](https://console.groq.com).

### 5. Run locally

```bash
uvicorn main:app --reload
```

Open `http://127.0.0.1:8000` in your browser.

---

## Deploying to Vercel

1. Push the repository to GitHub
2. Import the project at [vercel.com](https://vercel.com)
3. Under **Settings → Environment Variables**, add `GROQ_API_KEY` and enable it for Production, Preview, and Development
4. Deploy

**Important:** `.env` is gitignored and never reaches Vercel. The key must be set in the Vercel dashboard separately. Environment variables only apply to new deployments — after adding or changing a key, trigger a redeploy from the Deployments tab.

---

## API Reference

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/` | — | Serves the frontend |
| `GET` | `/api/health` | — | Reports key presence, key length, and active model config |
| `POST` | `/api/summarize` | `{url, style, model, language}` | Fetches transcript and summarizes |
| `POST` | `/api/summarize-manual` | `{transcript, style, model}` | Summarizes a pasted transcript |

Both summarize endpoints return:

```json
{
  "success": true,
  "summary": "...",
  "transcript": "...",
  "video_id": "...",
  "error": "",
  "error_type": "",
  "transcript_length": 2089,
  "summary_length": 385,
  "compression": 81.6
}
```

### Error types

| `error_type` | Meaning |
|--------------|---------|
| `invalid_url` | URL is not a recognizable YouTube link |
| `invalid_input` | Pasted transcript is under 50 characters |
| `transcript_error` | No transcript available — frontend opens the manual paste box |
| `ai_error` | Groq API call failed |
| `server_error` | Unexpected exception |

---

## Model Configuration

Models are mapped in `main.py` via `MODEL_MAP`. The frontend sends a model ID and the backend resolves it, so models can be swapped without touching the frontend.

Groq deprecated `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` with a shutdown date of **16 August 2026**. This project has migrated to `openai/gpt-oss-120b` and `openai/gpt-oss-20b`.

These are reasoning models — they spend tokens on internal reasoning before writing the answer. The backend sets `reasoning_effort="low"` and a generous `max_tokens` budget. Lowering `max_tokens` too far will cause the reasoning phase to consume the entire budget and return empty content.

---

## Troubleshooting

**Works locally but fails when deployed**

Check `/api/health` on the live URL. If `key_length` does not match your local key's length, the wrong key is set in the Vercel dashboard. If `key_length` and `key_stripped_length` differ, the value has stray whitespace.

**"Transcript unavailable" on some videos**

Either the video has captions disabled, or YouTube is blocking transcript requests from cloud server IPs. Use the manual paste box: open the video on YouTube, click the "..." menu, choose "Show transcript", and paste it in.

**Frontend changes not appearing**

Browsers cache JavaScript. Hard refresh with `Ctrl + Shift + R`.

---

## Project Structure

```
clipsense/
├── main.py              # FastAPI backend
├── static/
│   ├── index.html       # Frontend markup
│   ├── style.css        # Styling
│   └── script.js        # Frontend logic
├── requirements.txt
├── vercel.json
├── .env                 # Not committed
└── README.md
```

---

## License

MIT

---

Built by [Hasnain Ali](https://github.com/Ivac966)