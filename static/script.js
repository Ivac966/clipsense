/* ============================================
   CLIPSENSE - FRONTEND LOGIC
   ============================================ */

const state = {
    currentStyle: 'concise',
};

const elements = {
    videoUrl: document.getElementById('videoUrl'),
    clearBtn: document.getElementById('clearBtn'),
    videoPreview: document.getElementById('videoPreview'),
    videoIframe: document.getElementById('videoIframe'),
    modelSelect: document.getElementById('modelSelect'),
    languageInput: document.getElementById('languageInput'),
    generateBtn: document.getElementById('generateBtn'),
    styleButtons: document.querySelectorAll('.style-btn'),

    manualSection: document.getElementById('manualSection'),
    manualTranscript: document.getElementById('manualTranscript'),
    manualBtn: document.getElementById('manualBtn'),
    manualTitle: document.getElementById('manualTitle'),
    manualHint: document.getElementById('manualHint'),

    resultSection: document.getElementById('resultSection'),
    summaryOutput: document.getElementById('summaryOutput'),
    transcriptLength: document.getElementById('transcriptLength'),
    summaryLength: document.getElementById('summaryLength'),
    compression: document.getElementById('compression'),
    fullTranscript: document.getElementById('fullTranscript'),
    copyBtn: document.getElementById('copyBtn'),

    errorSection: document.getElementById('errorSection'),
    errorText: document.getElementById('errorText'),

    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
};

// Log any IDs that are declared above but missing from index.html.
// A missing element used to crash the app and get reported as a network error.
(function reportMissingElements() {
    const missing = Object.keys(elements).filter((key) => {
        const el = elements[key];
        if (el === null || el === undefined) return true;
        if (el instanceof NodeList && el.length === 0) return true;
        return false;
    });
    if (missing.length > 0) {
        console.warn('ClipSense: missing from index.html ->', missing.join(', '));
    }
})();

// Minimum transcript length. Must stay in sync with main.py.
const MIN_TRANSCRIPT_LENGTH = 50;

// Error types that mean "no transcript" and should open the manual paste box
// instead of showing a red error banner.
const TRANSCRIPT_ERROR_TYPES = [
    'transcript_error',
    'ip_blocked',
    'disabled',
    'not_found',
];

const MANUAL_MESSAGES = {
    transcript_error: {
        title: 'Transcript unavailable',
        hint: 'Open the video on YouTube, click the "..." menu below it, choose "Show transcript", then copy and paste it here.',
    },
    ip_blocked: {
        title: 'Automatic fetch unavailable',
        hint: 'YouTube blocks transcript downloads from cloud servers. Open the video on YouTube, click the "..." menu below it, choose "Show transcript", then copy and paste it here.',
    },
    disabled: {
        title: 'Captions are turned off',
        hint: 'This video has captions disabled by its creator. If you have the transcript from another source, paste it below.',
    },
    not_found: {
        title: 'No captions in that language',
        hint: 'Try a different language code in the settings, or paste the transcript manually below.',
    },
    generic: {
        title: 'Could not fetch the transcript',
        hint: 'Open the video on YouTube, click the "..." menu below it, choose "Show transcript", then copy and paste it here.',
    },
};

/* --------------------------------------------
   Null-safe DOM helpers
   -------------------------------------------- */

function setText(el, text) {
    if (el) el.textContent = text;
}

function setDisplay(el, value) {
    if (el) el.style.display = value;
}

function scrollTo(el, block) {
    if (el) el.scrollIntoView({ behavior: 'smooth', block: block });
}

function on(el, event, handler) {
    if (el) el.addEventListener(event, handler);
}

/* --------------------------------------------
   Markdown rendering
   -------------------------------------------- */

// The AI returns markdown. Escape everything first so no raw HTML from the
// model can ever reach the page, then convert the safe subset we support.
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderInline(text) {
    return text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|\s)\*([^*]+)\*/g, '$1<em>$2</em>')
        .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 5px;border-radius:4px;">$1</code>');
}

function renderMarkdown(text) {
    const lines = escapeHtml(text || '').split('\n');
    const out = [];
    let inList = false;

    const closeList = () => {
        if (inList) {
            out.push('</ul>');
            inList = false;
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            closeList();
            continue;
        }

        const bullet = line.match(/^[-*\u2022]\s+(.*)$/);
        const numbered = line.match(/^\d+[.)]\s+(.*)$/);
        const heading = line.match(/^#{1,6}\s+(.*)$/);

        if (heading) {
            closeList();
            out.push('<p style="margin:1.2em 0 0.5em 0;font-weight:700;">' + renderInline(heading[1]) + '</p>');
        } else if (bullet || numbered) {
            if (!inList) {
                out.push('<ul style="margin:0 0 1em 0;padding-left:1.3em;">');
                inList = true;
            }
            const body = bullet ? bullet[1] : numbered[1];
            out.push('<li style="margin-bottom:0.55em;">' + renderInline(body) + '</li>');
        } else {
            closeList();
            out.push('<p style="margin:0 0 1em 0;">' + renderInline(line) + '</p>');
        }
    }

    closeList();
    return out.join('');
}

/* --------------------------------------------
   Utilities
   -------------------------------------------- */

function extractVideoId(url) {
    const patterns = [
        /(?:youtu\.be\/)([0-9A-Za-z_-]{11})/,
        /(?:embed\/)([0-9A-Za-z_-]{11})/,
        /(?:shorts\/)([0-9A-Za-z_-]{11})/,
        /(?:live\/)([0-9A-Za-z_-]{11})/,
        /(?:v=)([0-9A-Za-z_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function showToast(message, isError = false) {
    if (!elements.toast) return;
    setText(elements.toastMessage, message);
    elements.toast.style.borderColor = isError ? 'var(--error)' : 'var(--success)';
    elements.toast.style.color = isError ? 'var(--error)' : 'var(--success)';
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 3000);
}

function formatNumber(num) {
    const value = Number(num);
    return Number.isFinite(value) ? value.toLocaleString() : '0';
}

function setLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    if (btnText) btnText.style.display = isLoading ? 'none' : 'flex';
    if (btnLoader) btnLoader.style.display = isLoading ? 'flex' : 'none';
}

function hideAllResults() {
    setDisplay(elements.resultSection, 'none');
    setDisplay(elements.manualSection, 'none');
    setDisplay(elements.errorSection, 'none');
}

function showError(message) {
    hideAllResults();
    setText(elements.errorText, message || 'Something went wrong.');
    setDisplay(elements.errorSection, 'flex');
    scrollTo(elements.errorSection, 'nearest');
}

function showManualFallback(errorType, serverMessage) {
    hideAllResults();

    const content = MANUAL_MESSAGES[errorType] || MANUAL_MESSAGES.generic;

    setText(elements.manualTitle, content.title);
    setText(elements.manualHint, content.hint);
    setDisplay(elements.manualSection, 'block');
    scrollTo(elements.manualSection, 'start');

    if (!elements.manualTitle && !elements.manualHint) {
        showToast(serverMessage || content.title, true);
    }
}

/* --------------------------------------------
   Networking
   -------------------------------------------- */

async function postJson(endpoint, payload) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const raw = await response.text();

    try {
        return JSON.parse(raw);
    } catch (parseError) {
        if (response.status === 504) {
            throw new Error('The video took too long to process. Try a shorter video, or paste the transcript manually.');
        }
        throw new Error(`The server returned an unexpected response (HTTP ${response.status}).`);
    }
}

/* --------------------------------------------
   Main actions
   -------------------------------------------- */

async function generateSummary() {
    if (!elements.videoUrl) return;

    const url = elements.videoUrl.value.trim();

    if (!url) {
        showToast('Paste a YouTube link first', true);
        elements.videoUrl.focus();
        return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        showError("That doesn't look like a valid YouTube link.");
        return;
    }

    hideAllResults();
    setLoading(elements.generateBtn, true);

    let data = null;
    let requestError = '';

    try {
        data = await postJson('/api/summarize', {
            url: url,
            style: state.currentStyle,
            model: elements.modelSelect ? elements.modelSelect.value : '',
            language: (elements.languageInput ? elements.languageInput.value.trim() : '') || 'en',
        });
    } catch (error) {
        requestError = error.message || 'Could not reach the server. Please try again.';
    } finally {
        setLoading(elements.generateBtn, false);
    }

    if (requestError) {
        showError(requestError);
        return;
    }

    // Rendering runs outside the try block on purpose. A bug in the display
    // code must not be reported to the user as a network failure.
    if (data.success) {
        displayResult(data);
    } else if (TRANSCRIPT_ERROR_TYPES.indexOf(data.error_type) !== -1) {
        showManualFallback(data.error_type, data.error);
    } else {
        showError(data.error || 'Something went wrong.');
    }
}

async function summarizeManual() {
    if (!elements.manualTranscript) return;

    const transcript = elements.manualTranscript.value.trim();

    if (!transcript) {
        showToast('Paste a transcript first', true);
        elements.manualTranscript.focus();
        return;
    }

    if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
        showToast(`Transcript is too short (needs ${MIN_TRANSCRIPT_LENGTH}+ characters)`, true);
        return;
    }

    setLoading(elements.manualBtn, true);

    let data = null;
    let requestError = '';

    try {
        data = await postJson('/api/summarize-manual', {
            transcript: transcript,
            style: state.currentStyle,
            model: elements.modelSelect ? elements.modelSelect.value : '',
        });
    } catch (error) {
        requestError = error.message || 'Could not reach the server. Please try again.';
    } finally {
        setLoading(elements.manualBtn, false);
    }

    if (requestError) {
        showError(requestError);
        return;
    }

    if (data.success) {
        setDisplay(elements.manualSection, 'none');
        displayResult(data);
    } else {
        showError(data.error || 'Something went wrong.');
    }
}

function displayResult(data) {
    if (elements.summaryOutput) {
        elements.summaryOutput.innerHTML = renderMarkdown(data.summary || '');
    }
    setText(elements.transcriptLength, formatNumber(data.transcript_length));
    setText(elements.summaryLength, formatNumber(data.summary_length));
    setText(elements.compression, `${data.compression || 0}%`);
    setText(elements.fullTranscript, data.transcript || '');

    setDisplay(elements.resultSection, 'block');
    scrollTo(elements.resultSection, 'start');
}

/* --------------------------------------------
   Event wiring
   -------------------------------------------- */

on(elements.videoUrl, 'input', (e) => {
    const url = e.target.value.trim();
    setDisplay(elements.clearBtn, url ? 'flex' : 'none');

    const videoId = extractVideoId(url);
    if (videoId && elements.videoIframe) {
        elements.videoIframe.src = `https://www.youtube.com/embed/${videoId}`;
        setDisplay(elements.videoPreview, 'block');
    } else {
        setDisplay(elements.videoPreview, 'none');
        if (elements.videoIframe) elements.videoIframe.src = '';
    }
});

on(elements.clearBtn, 'click', () => {
    if (elements.videoUrl) elements.videoUrl.value = '';
    setDisplay(elements.videoPreview, 'none');
    if (elements.videoIframe) elements.videoIframe.src = '';
    setDisplay(elements.clearBtn, 'none');
    hideAllResults();
});

elements.styleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        elements.styleButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentStyle = btn.dataset.style;
    });
});

// Copy the rendered text, not the raw markdown, so pasted output stays clean.
on(elements.copyBtn, 'click', async () => {
    if (!elements.summaryOutput) return;
    const text = elements.summaryOutput.innerText;
    try {
        await navigator.clipboard.writeText(text);
        showToast('Summary copied to clipboard');
    } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Summary copied to clipboard');
    }
});

on(elements.generateBtn, 'click', generateSummary);
on(elements.manualBtn, 'click', summarizeManual);

on(elements.videoUrl, 'keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        generateSummary();
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (elements.videoUrl) elements.videoUrl.focus();
    }
});