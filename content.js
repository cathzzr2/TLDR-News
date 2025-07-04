// content.js
// This script extracts the main article content from news pages using Readability.js and sends it to the popup on request.

// Hardcoded Hugging Face API key for development (do not commit to public repos)
const HUGGINGFACE_API_KEY = '***REMOVED***'; // <-- Replace with your actual token

// Inject the API key from config.js into the page context if not already present
if (typeof window.HUGGINGFACE_API_KEY === 'undefined') {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('config.js');
    document.documentElement.appendChild(script);
    script.onload = () => script.remove();
  } catch (e) {
    console.error('Failed to inject config.js:', e);
  }
}

if (typeof extractedMainText === 'undefined') {
  var extractedMainText = '';
}

function extractWithReadability() {
  try {
    const article = new Readability(document.cloneNode(true)).parse();
    if (article && article.textContent && article.textContent.length > 100) {
      return article.textContent;
    }
  } catch (e) {
    // Ignore errors
  }
  return '';
}

function extractFromDOM() {
  // Try <article> tag first
  const articleEl = document.querySelector('article');
  if (articleEl && articleEl.innerText && articleEl.innerText.length > 100) {
    return articleEl.innerText;
  }
  // Fallback: find the largest <div> with lots of text
  let maxText = '';
  const divs = Array.from(document.querySelectorAll('div'));
  divs.forEach(div => {
    const text = div.innerText;
    if (text && text.length > maxText.length) {
      maxText = text;
    }
  });
  return maxText.length > 100 ? maxText : '';
}

function getMainText() {
  let text = extractWithReadability();
  if (text && text.length > 100) return text;
  text = extractFromDOM();
  return text;
}

// Wait for DOM to be fully loaded
window.addEventListener('DOMContentLoaded', () => {
  extractedMainText = getMainText();
});

// Listen for requests from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_MAIN_TEXT') {
    // Only re-extract if cache is empty
    if (!extractedMainText || extractedMainText.length < 50) {
      extractedMainText = getMainText();
    }
    chrome.runtime.sendMessage({
      type: 'PAGE_MAIN_TEXT',
      mainText: extractedMainText
    });
  }
  if (message.type === 'REFRESH_MAIN_TEXT') {
    // Force re-extraction
    extractedMainText = getMainText();
  chrome.runtime.sendMessage({
    type: 'PAGE_MAIN_TEXT',
      mainText: extractedMainText
    });
  }
});

async function summarizeWithHuggingFace(text) {
  const apiKey = HUGGINGFACE_API_KEY;
  const response = await fetch(
    'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: text })
    }
  );
  const data = await response.json();
  if (Array.isArray(data) && data[0]?.summary_text) {
    return data[0].summary_text;
  } else if (data.error) {
    throw new Error(data.error);
  } else {
    throw new Error('Unexpected response from Hugging Face API');
  }
}

// Inject a floating window into the page if not already present
function injectFloatingWindow() {
  if (document.getElementById('tldr-floating-window')) return;
  const win = document.createElement('div');
  win.id = 'tldr-floating-window';
  win.style.position = 'fixed';
  win.style.top = '80px';
  win.style.right = '40px';
  win.style.width = '400px';
  win.style.height = '600px';
  win.style.background = 'white';
  win.style.border = '2px solid #888';
  win.style.borderRadius = '10px';
  win.style.zIndex = '999999';
  win.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
  win.style.display = 'flex';
  win.style.flexDirection = 'column';
  win.style.resize = 'both';
  win.style.overflow = 'auto';
  win.innerHTML = `
    <div id="tldr-floating-header" style="cursor:move;padding:8px 12px;background:#222;color:#fff;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;">
      <span>TL;DR News</span>
      <button id="tldr-close-btn" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">&times;</button>
    </div>
    <div id="tldr-floating-content" style="flex:1;overflow:auto;padding:12px;"></div>
  `;
  document.body.appendChild(win);

  // Drag logic
  let isDragging = false, offsetX = 0, offsetY = 0;
  const header = win.querySelector('#tldr-floating-header');
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      win.style.left = (e.clientX - offsetX) + 'px';
      win.style.top = (e.clientY - offsetY) + 'px';
      win.style.right = '';
    }
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = '';
  });
  // Close button
  win.querySelector('#tldr-close-btn').onclick = () => win.remove();
}

// Listen for a message from the extension to open the floating window
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_TLDR_FLOATING_WINDOW') {
    injectFloatingWindow();
  }
});

function renderFloatingUI() {
  const content = document.getElementById('tldr-floating-content');
  if (!content) return;
  content.innerHTML = `
    <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
      <button id="refresh-btn" title="Refresh article extraction">Refresh</button>
    </div>
    <div id="article-container"><p>Loading article...</p></div>
    <div id="summary-options" style="margin-bottom: 10px;">
      <label for="summary-length" style="margin-right: 6px;">Length:</label>
      <select id="summary-length">
        <option value="short">Short</option>
        <option value="medium" selected>Medium</option>
        <option value="detailed">Detailed</option>
      </select>
      <label for="summary-language" style="margin-left: 12px; margin-right: 6px;">Language:</label>
      <select id="summary-language">
        <option value="en" selected>English</option>
        <option value="cn">Chinese</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="ja">Japanese</option>
      </select>
    </div>
    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
      <button id="summarize-btn">Summarize</button>
    </div>
    <div id="summary-container"><p>Summary will appear here.</p></div>
    <div id="summary-actions" style="display: flex; gap: 8px; margin-top: 8px;">
      <button id="copy-summary-btn" title="Copy summary to clipboard">Copy</button>
      <button id="share-summary-btn" title="Share summary">Share</button>
    </div>
  `;
}

function setupFloatingUIHandlers() {
  let extractedArticle = '';
  let hasLoadedArticle = false;
  let cachedEnglishSummary = '';
  let lastSummarizedArticle = '';
  let hasTriedRefresh = false;

  const MODEL_ID = 'sshleifer/distilbart-cnn-12-6';
  const TRANSLATE_MODEL_MAP = {
    'cn': 'Helsinki-NLP/opus-mt-en-zh',
    'es': 'Helsinki-NLP/opus-mt-en-es',
    'fr': 'Helsinki-NLP/opus-mt-en-fr',
    'de': 'Helsinki-NLP/opus-mt-en-de',
    'ja': 'Helsinki-NLP/opus-mt-en-ja',
  };

  function showArticle(text) {
    const container = document.getElementById('article-container');
    container.innerHTML = `<h3>Extracted Article</h3><p>${text}</p>`;
  }
  function showSummary(summary) {
    const container = document.getElementById('summary-container');
    container.innerHTML = `<h3>Summary</h3><p>${summary}</p>`;
  }
  function showError(msg) {
    const articleContainer = document.getElementById('article-container');
    articleContainer.innerHTML = `<p>${msg}</p>`;
    const summaryContainer = document.getElementById('summary-container');
    summaryContainer.innerHTML = '';
  }
  function cleanSummaryFormatting(text) {
    return text.replace(/\s+([.,!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function splitIntoSentenceChunks(text, sentencesPerChunk = 10) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
      chunks.push(sentences.slice(i, i + sentencesPerChunk).join(' '));
    }
    return chunks;
  }
  async function summarizeWithHuggingFace(text) {
    const apiKey = HUGGINGFACE_API_KEY;
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${MODEL_ID}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: text })
      }
    );
    const data = await response.json();
    if (Array.isArray(data) && data[0]?.summary_text) {
      return data[0].summary_text;
    } else if (data.error) {
      throw new Error(data.error);
    } else {
      throw new Error('Unexpected response from Hugging Face API');
    }
  }
  async function summarizeLongTextWithHuggingFace(text) {
    const sentenceChunks = splitIntoSentenceChunks(text, 10);
    let summaries = [];
    for (let idx = 0; idx < sentenceChunks.length; idx++) {
      const chunk = sentenceChunks[idx];
      showSummary(`Summarizing chunk ${idx + 1} of ${sentenceChunks.length}...`);
      try {
        const summary = await summarizeWithHuggingFace(chunk);
        summaries.push(summary);
      } catch (e) {
        summaries.push('[Error summarizing chunk]');
      }
    }
    const combinedSummary = summaries.join(' ');
    if (sentenceChunks.length > 1) {
      showSummary('Summarizing combined summary...');
      try {
        return await summarizeWithHuggingFace(combinedSummary);
      } catch (e) {
        return combinedSummary;
      }
    } else {
      return combinedSummary;
    }
  }
  async function translateWithHuggingFace(text, targetLang) {
    const apiKey = HUGGINGFACE_API_KEY;
    const model = TRANSLATE_MODEL_MAP[targetLang];
    if (!model) return text;
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: text })
      }
    );
    const data = await response.json();
    if (Array.isArray(data) && data[0]?.translation_text) {
      return data[0].translation_text;
    } else if (data.error) {
      throw new Error(data.error);
    } else {
      throw new Error('Unexpected response from Hugging Face translation API');
    }
  }
  // UI Handlers
  const refreshBtn = document.getElementById('refresh-btn');
  const summarizeBtn = document.getElementById('summarize-btn');
  const copyBtn = document.getElementById('copy-summary-btn');
  const shareBtn = document.getElementById('share-summary-btn');
  const lengthSelect = document.getElementById('summary-length');
  const languageSelect = document.getElementById('summary-language');

  refreshBtn.addEventListener('click', () => {
    hasTriedRefresh = true;
    showArticle('Refreshing article...');
    showSummary('');
    // Request extraction from content script logic
    extractedArticle = '';
    hasLoadedArticle = false;
    cachedEnglishSummary = '';
    lastSummarizedArticle = '';
    // Re-extract main text
    extractedArticle = getMainText();
    if (extractedArticle && extractedArticle.length > 50) {
      hasLoadedArticle = true;
      showArticle(extractedArticle.substring(0, 1000) + (extractedArticle.length > 1000 ? '...' : ''));
      showSummary('Click "Summarize" to generate a summary.');
    } else {
      showError('To summarize, please click the Refresh button to load the article content.');
    }
  });

  summarizeBtn.addEventListener('click', async () => {
    if (!hasLoadedArticle || !extractedArticle || extractedArticle.length < 50) {
      showSummary('Please refresh to load article content before summarizing.');
      return;
    }
    const language = languageSelect.value;
    if (extractedArticle !== lastSummarizedArticle) {
      showSummary('Summarizing with AI...');
      try {
        const summary = await summarizeLongTextWithHuggingFace(extractedArticle);
        cachedEnglishSummary = cleanSummaryFormatting(summary);
        lastSummarizedArticle = extractedArticle;
      } catch (e) {
        showSummary('AI summarization failed: ' + e.message);
        return;
      }
    }
    if (language !== 'en') {
      showSummary('Translating summary...');
      try {
        const translated = await translateWithHuggingFace(cachedEnglishSummary, language);
        showSummary(cleanSummaryFormatting(translated));
      } catch (e) {
        showSummary('Translation failed. Showing English summary.\n' + cachedEnglishSummary);
      }
    } else {
      showSummary(cachedEnglishSummary);
    }
  });

  copyBtn.addEventListener('click', () => {
    const summary = document.getElementById('summary-container').innerText.replace(/^Summary\s*/, '');
    if (summary) {
      navigator.clipboard.writeText(summary).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
      });
    }
  });

  shareBtn.addEventListener('click', () => {
    const summary = document.getElementById('summary-container').innerText.replace(/^Summary\s*/, '');
    if (summary) {
      if (navigator.share) {
        navigator.share({ text: summary, title: 'TL;DR News Summary' });
      } else {
        navigator.clipboard.writeText(summary).then(() => {
          alert('Summary copied to clipboard! You can now paste it anywhere.');
        });
      }
    }
  });

  // Initial prompt
  showError('To summarize, please click the Refresh button to load the article content.');
}

// After injectFloatingWindow(), call:
// renderFloatingUI();
// setupFloatingUIHandlers();

// Update injectFloatingWindow to call these after injecting
const originalInjectFloatingWindow = injectFloatingWindow;
injectFloatingWindow = function() {
  originalInjectFloatingWindow();
  renderFloatingUI();
  setupFloatingUIHandlers();
}; 