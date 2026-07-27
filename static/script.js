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

function extractVideoId(url) {
    const patterns = [
        /(?:v=|\/)([0-9A-Za-z_-]{11}).*/,
        /(?:youtu\.be\/)([0-9A-Za-z_-]{11})/,
        /(?:embed\/)([0-9A-Za-z_-]{11})/,
        /(?:shorts\/)([0-9A-Za-z_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function showToast(message, isError = false) {
    elements.toastMessage.textContent = message;
    elements.toast.style.borderColor = isError ? 'var(--error)' : 'var(--success)';
    elements.toast.style.color = isError ? 'var(--error)' : 'var(--success)';
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 3000);
}

function formatNumber(num) {
    return num.toLocaleString();
}

function setLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    button.disabled = isLoading;
    btnText.style.display = isLoading ? 'none' : 'flex';
    btnLoader.style.display = isLoading ? 'flex' : 'none';
}

function hideAllResults() {
    elements.resultSection.style.display = 'none';
    elements.manualSection.style.display = 'none';
    elements.errorSection.style.display = 'none';
}

function showError(message) {
    hideAllResults();
    elements.errorText.textContent = message;
    elements.errorSection.style.display = 'flex';
    elements.errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showManualFallback(errorType) {
    hideAllResults();

    const messages = {
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

    const content = messages[errorType] || messages.generic;

    elements.manualTitle.textContent = content.title;
    elements.manualHint.textContent = content.hint;
    elements.manualSection.style.display = 'block';
    elements.manualSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

elements.videoUrl.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    elements.clearBtn.style.display = url ? 'flex' : 'none';

    const videoId = extractVideoId(url);
    if (videoId) {
        elements.videoIframe.src = `https://www.youtube.com/embed/${videoId}`;
        elements.videoPreview.style.display = 'block';
    } else {
        elements.videoPreview.style.display = 'none';
        elements.videoIframe.src = '';
    }
});

elements.clearBtn.addEventListener('click', () => {
    elements.videoUrl.value = '';
    elements.videoPreview.style.display = 'none';
    elements.videoIframe.src = '';
    elements.clearBtn.style.display = 'none';
    hideAllResults();
});

elements.styleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        elements.styleButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentStyle = btn.dataset.style;
    });
});

async function generateSummary() {
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

    try {
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                style: state.currentStyle,
                model: elements.modelSelect.value,
                language: elements.languageInput.value.trim() || 'en',
            }),
        });

        const data = await response.json();

        if (data.success) {
            displayResult(data);
        } else if (data.error_type === 'invalid_url' || data.error_type === 'ai_error' || data.error_type === 'unavailable') {
            showError(data.error);
        } else {
            showManualFallback(data.error_type);
        }
    } catch (error) {
        showError('Could not reach the server. Please try again.');
    } finally {
        setLoading(elements.generateBtn, false);
    }
}

async function summarizeManual() {
    const transcript = elements.manualTranscript.value.trim();

    if (!transcript) {
        showToast('Paste a transcript first', true);
        elements.manualTranscript.focus();
        return;
    }

    if (transcript.length < 100) {
        showToast('Transcript is too short', true);
        return;
    }

    setLoading(elements.manualBtn, true);

    try {
        const response = await fetch('/api/summarize-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transcript: transcript,
                style: state.currentStyle,
                model: elements.modelSelect.value,
            }),
        });

        const data = await response.json();

        if (data.success) {
            elements.manualSection.style.display = 'none';
            displayResult(data);
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Could not reach the server. Please try again.');
    } finally {
        setLoading(elements.manualBtn, false);
    }
}

function displayResult(data) {
    elements.summaryOutput.textContent = data.summary;
    elements.transcriptLength.textContent = formatNumber(data.transcript_length);
    elements.summaryLength.textContent = formatNumber(data.summary_length);
    elements.compression.textContent = `${data.compression}%`;
    elements.fullTranscript.textContent = data.transcript;

    elements.resultSection.style.display = 'block';
    elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

elements.copyBtn.addEventListener('click', async () => {
    const text = elements.summaryOutput.textContent;
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

elements.generateBtn.addEventListener('click', generateSummary);
elements.manualBtn.addEventListener('click', summarizeManual);

elements.videoUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        generateSummary();
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        elements.videoUrl.focus();
    }
});