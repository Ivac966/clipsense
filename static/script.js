/* ============================================
   YOUTUBE SUMMARIZER - FRONTEND LOGIC
   ============================================ */

// --- State ---
const state = {
    currentStyle: 'concise',
    isLoading: false,
};

// --- DOM Elements ---
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
    errorMessage: document.getElementById('errorMessage'),
    
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

// --- Helper Functions ---
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
    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'flex';
    } else {
        btnText.style.display = 'flex';
        btnLoader.style.display = 'none';
    }
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

// --- URL Input Handlers ---
elements.videoUrl.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    
    // Show/hide clear button
    elements.clearBtn.style.display = url ? 'flex' : 'none';
    
    // Show video preview if valid URL
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

// --- Style Selector ---
elements.styleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        elements.styleButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentStyle = btn.dataset.style;
    });
});

// --- Main Generate Function ---
async function generateSummary() {
    const url = elements.videoUrl.value.trim();
    
    if (!url) {
        showToast('Please paste a YouTube URL first', true);
        elements.videoUrl.focus();
        return;
    }
    
    const videoId = extractVideoId(url);
    if (!videoId) {
        showError('Invalid YouTube URL. Please check the link and try again.');
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
        } else {
            // Show manual fallback
            elements.errorMessage.textContent = data.error;
            elements.manualSection.style.display = 'block';
            elements.manualSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (error) {
        showError(`Connection error: ${error.message}. Make sure the backend is running.`);
    } finally {
        setLoading(elements.generateBtn, false);
    }
}

// --- Manual Summarize Function ---
async function summarizeManual() {
    const transcript = elements.manualTranscript.value.trim();
    
    if (!transcript) {
        showToast('Please paste a transcript first', true);
        elements.manualTranscript.focus();
        return;
    }
    
    if (transcript.length < 100) {
        showToast('Transcript is too short (min 100 chars)', true);
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
        showError(`Connection error: ${error.message}`);
    } finally {
        setLoading(elements.manualBtn, false);
    }
}

// --- Display Result ---
function displayResult(data) {
    elements.summaryOutput.textContent = data.summary;
    elements.transcriptLength.textContent = formatNumber(data.transcript_length);
    elements.summaryLength.textContent = formatNumber(data.summary_length);
    elements.compression.textContent = `${data.compression}%`;
    elements.fullTranscript.textContent = data.transcript;
    
    elements.resultSection.style.display = 'block';
    elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Copy to Clipboard ---
elements.copyBtn.addEventListener('click', async () => {
    const text = elements.summaryOutput.textContent;
    try {
        await navigator.clipboard.writeText(text);
        showToast('Summary copied to clipboard!');
    } catch (error) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Summary copied to clipboard!');
    }
});

// --- Event Listeners ---
elements.generateBtn.addEventListener('click', generateSummary);
elements.manualBtn.addEventListener('click', summarizeManual);

// Enter key on URL input triggers generate
elements.videoUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !state.isLoading) {
        e.preventDefault();
        generateSummary();
    }
});

// Ctrl/Cmd + K to focus URL input
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        elements.videoUrl.focus();
    }
});

// --- Console Easter Egg ---
console.log(
    '%c🎬 YouTube Summarizer',
    'font-size: 20px; font-weight: bold; color: #FF3B3B;'
);
console.log(
    '%cBuilt by Hasnain Ali · Powered by Groq AI',
    'font-size: 12px; color: #A1A1AA;'
);