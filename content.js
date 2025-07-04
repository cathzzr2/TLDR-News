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
  win.style.cssText = `
    position: fixed;
    top: 80px;
    right: 40px;
    width: 420px;
    height: 580px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    color: #1d1d1f;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    resize: both;
  `;
  win.innerHTML = `
    <div id="tldr-floating-header" style="
      cursor: move;
      padding: 16px 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border-radius: 16px 16px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 16px;
    ">
      <span>TL;DR News</span>
      <button id="tldr-close-btn" style="
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        transition: background-color 0.2s;
      ">&times;</button>
    </div>
    <div id="tldr-floating-content" style="
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 20px;
      background: rgba(255, 255, 255, 0.95);
      scrollbar-width: thin;
      scrollbar-color: rgba(0, 0, 0, 0.3) transparent;
    "></div>
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
      let newTop = e.clientY - offsetY;
      // Clamp top so it cannot go above 10px
      if (newTop < 10) newTop = 10;
      win.style.left = (e.clientX - offsetX) + 'px';
      win.style.top = newTop + 'px';
      win.style.right = '';
    }
  });
  document.addEventListener('mouseup', async () => {
    isDragging = false;
    document.body.style.userSelect = '';
    // Save position
    const win = document.getElementById('tldr-floating-window');
    if (win) {
      const rect = win.getBoundingClientRect();
      await setChromeStorage('tldr-window-bounds', {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }
  });
  // Close button
  win.querySelector('#tldr-close-btn').onclick = () => win.remove();

  // Resize logic
  win.addEventListener('mouseup', async () => {
    const rect = win.getBoundingClientRect();
    await setChromeStorage('tldr-window-bounds', {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    });
  });
}

// Listen for a message from the extension to open the floating window
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_TLDR_FLOATING_WINDOW') {
    injectFloatingWindow();
  }
});

async function renderFloatingUI() {
  const content = document.getElementById('tldr-floating-content');
  if (!content) return;
  
  // Load saved settings from Chrome storage
  const savedTrans = await getChromeStorage('tldr-translucency', 0.95);
  const savedColor = await getChromeStorage('tldr-color', 'blue');
  
  const opacityPercent = Math.round(savedTrans * 100);
  const translucencyPercent = 100 - opacityPercent;
  
  const colorOptions = [
    { value: 'blue', label: 'Blue' },
    { value: 'grey', label: 'Grey' },
    { value: 'green', label: 'Green' },
    { value: 'red', label: 'Red' },
    { value: 'purple', label: 'Purple' }
  ];
  const colorSelectOptions = colorOptions.map(opt => `<option value="${opt.value}"${savedColor === opt.value ? ' selected' : ''}>${opt.label}</option>`).join('');
  content.innerHTML = `
    <div id="tldr-theme-row" style="margin-bottom: 12px; width: 100%; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 24px;">
      <div id="tldr-translucency-control" style="display: flex; align-items: center; gap: 4px; min-width: 0; flex: 1 1 auto; margin-bottom: 4px;">
        <label for="tldr-translucency-slider" style="font-size: 12px; color: var(--tldr-strong-label); white-space: nowrap;">Translucency:</label>
        <input id="tldr-translucency-slider" type="range" min="60" max="100" value="${opacityPercent}" style="flex: 1 1 auto; min-width: 0; accent-color: var(--tldr-accent);">
        <span id="tldr-translucency-value" style="font-size: 12px; color: #86868b; min-width: 28px; text-align: right;">${translucencyPercent}%</span>
      </div>
      <div id="tldr-color-theme-group" style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 0 0 auto; margin-bottom: 4px;">
        <div id="tldr-color-control" style="display: flex; align-items: center; gap: 4px; min-width: 0;">
          <label for="tldr-color-select" style="font-size: 12px; color: #86868b;">Color:</label>
          <select id="tldr-color-select" style="padding: 4px 8px; border-radius: 6px; font-size: 12px; border: 1px solid #d2d2d7;">
            ${colorSelectOptions}
          </select>
        </div>
        <div id="tldr-theme-control" style="display: flex; align-items: center; gap: 4px; min-width: 0;">
          <label for="tldr-theme-select" style="font-size: 12px; color: #86868b; margin-right: 2px;">Theme:</label>
          <select id="tldr-theme-select" style="padding: 4px 8px; border-radius: 6px; font-size: 12px; border: 1px solid #d2d2d7;">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <button id="tldr-bookmarks-btn" style="margin-left: 8px; padding: 4px 12px; border-radius: 6px; font-size: 12px; border: 1px solid #d2d2d7; background: var(--tldr-btn-bg); color: var(--tldr-btn-color); cursor: pointer;">Bookmarks</button>
      </div>
    </div>
    <div id="tldr-initial-prompt" style="margin-bottom: 8px; color: var(--tldr-accent); font-style: italic; text-align: center; font-size: 12px; line-height: 1.2; width: 100%; box-sizing: border-box; word-break: break-word;">
      To summarize, please click the Refresh button to load the article content.
    </div>
    <div style="margin-bottom: 16px; width: 100%; box-sizing: border-box;">
      <button id="refresh-btn" style="
        background: #007AFF;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
        float: right;
      " title="Refresh article extraction">Refresh</button>
    </div>
    <div id="article-container" style="margin-bottom: 16px; width: 100%; box-sizing: border-box;">
      <p style="color: #86868b; font-style: italic;">Loading article...</p>
    </div>
    <div id="summary-options" style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center; width: 100%; box-sizing: border-box; flex-wrap: wrap;">
      <label for="summary-length" style="font-weight: 500; color: #1d1d1f;">Length:</label>
      <select id="summary-length" style="
        padding: 6px 12px;
        border: 1px solid #d2d2d7;
        border-radius: 6px;
        font-size: 14px;
        background: white;
        color: #1d1d1f;
        min-width: 0;
        flex: 1 1 80px;
        box-sizing: border-box;
      ">
        <option value="short">Short</option>
        <option value="medium" selected>Medium</option>
        <option value="detailed">Detailed</option>
      </select>
      <label for="summary-language" style="font-weight: 500; color: #1d1d1f;">Language:</label>
      <select id="summary-language" style="
        padding: 6px 12px;
        border: 1px solid #d2d2d7;
        border-radius: 6px;
        font-size: 14px;
        background: white;
        color: #1d1d1f;
        min-width: 0;
        flex: 1 1 80px;
        box-sizing: border-box;
      ">
        <option value="en" selected>English</option>
        <option value="cn">Chinese</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
      </select>
    </div>
    <div style="margin-bottom: 16px;">
      <button id="summarize-btn" style="
        background: #007AFF;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s;
        width: 100%;
      ">Summarize</button>
    </div>
    <div id="summary-container" style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: var(--tldr-text);">Summary</h3>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="tldr-model-btn" style="padding: 4px 12px; border-radius: 6px; font-size: 12px; border: 1px solid #d2d2d7; background: var(--tldr-btn-bg); color: var(--tldr-btn-color); cursor: pointer;" title="Choose AI Model">Model</button>
          <button id="tldr-save-btn" style="padding: 4px 12px; border-radius: 6px; font-size: 12px; border: 1px solid #d2d2d7; background: var(--tldr-btn-bg); color: var(--tldr-btn-color); cursor: pointer;">Save</button>
        </div>
      </div>
      <div id="summary-text"><p style="color: #86868b; font-style: italic;">Summary will appear here.</p></div>
    </div>
    <div id="summary-actions" style="display: flex; gap: 8px;">
      <button id="copy-summary-btn" style="
        background: #f5f5f7;
        color: #1d1d1f;
        border: 1px solid #d2d2d7;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        flex: 1;
      " title="Copy summary to clipboard">Copy</button>
      <button id="share-summary-btn" style="
        background: #f5f5f7;
        color: #1d1d1f;
        border: 1px solid #d2d2d7;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        flex: 1;
      " title="Share summary">Share</button>
    </div>
  `;
  content.innerHTML += `
    <div id="tldr-bookmarks-modal" style="display:none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 1000; justify-content: center; align-items: center; display: flex;">
      <div style="background: var(--tldr-bg); color: var(--tldr-text); border-radius: 12px; width: min(90%, 480px); max-width: 100%; height: auto; max-height: 80%; overflow-y: auto; box-shadow: 0 4px 24px rgba(0,0,0,0.18); padding: 2vw; position: relative; display: flex; flex-direction: column; word-break: break-word;">
        <button id="tldr-bookmarks-close" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 20px; color: var(--tldr-text); cursor: pointer;">&times;</button>
        <h2 style="margin-top: 0; font-size: 1.2em;">Bookmarks</h2>
        <div id="tldr-bookmarks-list" style="flex: 1 1 auto; min-width: 0; word-break: break-word;"></div>
      </div>
    </div>
    <div id="tldr-model-modal" style="display:none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 1000; justify-content: center; align-items: center; display: flex;">
      <div style="background: var(--tldr-bg); color: var(--tldr-text); border-radius: 12px; width: min(90%, 480px); max-width: 100%; height: auto; max-height: 80%; overflow-y: auto; box-shadow: 0 4px 24px rgba(0,0,0,0.18); padding: 2vw; position: relative; display: flex; flex-direction: column; word-break: break-word;">
        <button id="tldr-model-close" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 20px; color: var(--tldr-text); cursor: pointer;">&times;</button>
        <h2 style="margin-top: 0; font-size: 1.2em;">Choose AI Model</h2>
        <div style="margin-bottom: 16px; font-size: 14px; color: var(--tldr-placeholder-color);">
          Select a free Hugging Face model for summarization. Different models may produce different results.
        </div>
        <div id="tldr-model-list" style="flex: 1 1 auto; min-width: 0; word-break: break-word; max-height: 300px; overflow-y: auto;">
          <!-- Model options will be populated here -->
        </div>
      </div>
    </div>
  `;
}

function setupFloatingUIHandlers() {
  let extractedArticle = '';
  let hasLoadedArticle = false;
  let cachedEnglishSummary = '';
  let lastSummarizedArticle = '';
  let hasTriedRefresh = false;

  // Available free Hugging Face models for summarization
  const SUMMARIZATION_MODELS = [
    {
      id: 'sshleifer/distilbart-cnn-12-6',
      name: 'DistilBART CNN (Fast)',
      description: 'Fast, lightweight model good for quick summaries',
      category: 'Fast'
    },
    {
      id: 'facebook/bart-large-cnn',
      name: 'BART Large CNN (Balanced)',
      description: 'High quality summaries with good balance of speed and accuracy',
      category: 'Balanced'
    },
    {
      id: 'google/pegasus-xsum',
      name: 'PEGASUS XSum (Extractive)',
      description: 'Extractive summarization, good for factual content',
      category: 'Extractive'
    },
    {
      id: 'microsoft/DialoGPT-medium',
      name: 'DialoGPT Medium (Conversational)',
      description: 'Good for conversational or opinion pieces',
      category: 'Conversational'
    },
    {
      id: 't5-small',
      name: 'T5 Small (Versatile)',
      description: 'Versatile model for various types of content',
      category: 'Versatile'
    },
    {
      id: 'facebook/bart-base',
      name: 'BART Base (Reliable)',
      description: 'Reliable baseline model for general summarization',
      category: 'Reliable'
    },
    {
      id: 'sshleifer/distilbart-xsum-12-3',
      name: 'DistilBART XSum (Abstractive)',
      description: 'Abstractive summarization, good for news articles',
      category: 'Abstractive'
    },
    {
      id: 'google/pegasus-cnn_dailymail',
      name: 'PEGASUS CNN DailyMail (News)',
      description: 'Optimized for news articles and daily content',
      category: 'News'
    }
  ];

  let currentModelId = 'sshleifer/distilbart-cnn-12-6'; // Default model
  
  const TRANSLATE_MODEL_MAP = {
    'cn': 'Helsinki-NLP/opus-mt-en-zh',
    'es': 'Helsinki-NLP/opus-mt-en-es',
    'fr': 'Helsinki-NLP/opus-mt-en-fr',
  };

  function showArticle(text) {
    const container = document.getElementById('article-container');
    if (container) {
      container.innerHTML = `<h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #1d1d1f;">Extracted Article</h3><p style="margin: 0; line-height: 1.5; color: #1d1d1f;">${text}</p>`;
    }
  }
  function showSummary(summary) {
    const container = document.getElementById('summary-text');
    if (container) {
      container.innerHTML = `<p style="margin: 0; line-height: 1.5; color: var(--tldr-text);">${summary}</p>`;
    }
  }
  function showError(msg) {
    const articleContainer = document.getElementById('article-container');
    const summaryContainer = document.getElementById('summary-container');
    if (articleContainer) {
      articleContainer.innerHTML = `<p style="margin: 0; color: #ff3b30; font-style: italic;">${msg}</p>`;
    }
    if (summaryContainer) {
      summaryContainer.innerHTML = '';
    }
  }
  function cleanSummaryFormatting(text) {
    return text.replace(/\s+([.,!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function convertToChinesePunctuation(text) {
    return text
      .replace(/,/g, '，')
      .replace(/\./g, '。')
      .replace(/!/g, '！')
      .replace(/\?/g, '？')
      .replace(/;/g, '；')
      .replace(/:/g, '：')
      .replace(/\(/g, '（')
      .replace(/\)/g, '）')
      .replace(/"/g, '\u201C')
      .replace(/"/g, '\u201D')
      .replace(/'/g, '\u2018')
      .replace(/'/g, '\u2019');
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
      `https://api-inference.huggingface.co/models/${currentModelId}`,
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
  const bookmarksBtn = document.getElementById('tldr-bookmarks-btn');
  const saveBtn = document.getElementById('tldr-save-btn');
  const bookmarksModal = document.getElementById('tldr-bookmarks-modal');
  const bookmarksList = document.getElementById('tldr-bookmarks-list');
  const bookmarksClose = document.getElementById('tldr-bookmarks-close');
  
  // Model selection elements
  const modelBtn = document.getElementById('tldr-model-btn');
  const modelModal = document.getElementById('tldr-model-modal');
  const modelList = document.getElementById('tldr-model-list');
  const modelClose = document.getElementById('tldr-model-close');

  async function getBookmarks() {
    const bookmarks = await getChromeStorage('tldr-bookmarks', []);
    console.log('Retrieved bookmarks:', bookmarks);
    return bookmarks;
  }
  async function setBookmarks(arr) {
    console.log('Saving bookmarks:', arr);
    await setChromeStorage('tldr-bookmarks', arr);
    console.log('Bookmarks saved successfully');
  }
  
  // Model selection functions
  async function getCurrentModel() {
    return await getChromeStorage('tldr-current-model', 'sshleifer/distilbart-cnn-12-6');
  }
  
  async function setCurrentModel(modelId) {
    await setChromeStorage('tldr-current-model', modelId);
    currentModelId = modelId;
  }
  
  async function renderModelList() {
    const currentModel = await getCurrentModel();
    const groupedModels = {};
    
    // Group models by category
    SUMMARIZATION_MODELS.forEach(model => {
      if (!groupedModels[model.category]) {
        groupedModels[model.category] = [];
      }
      groupedModels[model.category].push(model);
    });
    
    modelList.innerHTML = '';
    
    Object.keys(groupedModels).forEach(category => {
      const categoryDiv = document.createElement('div');
      categoryDiv.style.marginBottom = '16px';
      categoryDiv.innerHTML = `<h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: var(--tldr-text);">${category}</h3>`;
      
      groupedModels[category].forEach(model => {
        const modelDiv = document.createElement('div');
        const isSelected = model.id === currentModel;
        modelDiv.style.cssText = `
          padding: 12px;
          border: 1px solid ${isSelected ? 'var(--tldr-accent)' : '#d2d2d7'};
          border-radius: 8px;
          margin-bottom: 8px;
          cursor: pointer;
          background: ${isSelected ? 'var(--tldr-accent)' : 'transparent'};
          color: ${isSelected ? '#fff' : 'var(--tldr-text)'};
          transition: all 0.2s;
        `;
        modelDiv.innerHTML = `
          <div style="font-weight: 600; margin-bottom: 4px;">${model.name}</div>
          <div style="font-size: 12px; opacity: 0.8;">${model.description}</div>
        `;
        
        modelDiv.onclick = async () => {
          await setCurrentModel(model.id);
          renderModelList();
          modelBtn.textContent = model.name.split(' ')[0]; // Show short name on button
          setTimeout(() => {
            modelModal.style.display = 'none';
          }, 500);
        };
        
        categoryDiv.appendChild(modelDiv);
      });
      
      modelList.appendChild(categoryDiv);
    });
  }
  async function renderBookmarks() {
    const arr = await getBookmarks();
    // Add a feedback message area at the top
    bookmarksList.innerHTML = '<div id="tldr-bookmarks-feedback" style="min-height: 18px; font-size: 13px; color: var(--tldr-accent); margin-bottom: 6px;"></div>';
    if (!arr.length) {
      bookmarksList.innerHTML += '<p style="color: #86868b;">No saved bookmarks yet.</p>';
      return;
    }
    bookmarksList.innerHTML += arr.map(item => `
      <div style="border-bottom: 1px solid #eee; padding: 8px 0;">
        <div style="font-size: 13px; font-weight: 600; margin-bottom: 2px;">${item.title || item.url}</div>
        <div style="font-size: 12px; color: #86868b; margin-bottom: 2px;">${item.language} &middot; ${new Date(item.timestamp).toLocaleString()}</div>
        <div style="font-size: 13px; margin-bottom: 4px;">${item.summary}</div>
        <a href="${item.url}" target="_blank" style="font-size: 12px; color: var(--tldr-accent); text-decoration: underline;">Open Article</a>
        <button data-idx="${item.id}" class="tldr-bookmarks-copy" style="margin-left: 8px; font-size: 12px; padding: 2px 8px; border-radius: 4px; border: 1px solid #d2d2d7; background: var(--tldr-btn-bg); color: var(--tldr-btn-color); cursor: pointer;">Copy</button>
        <button data-idx="${item.id}" class="tldr-bookmarks-delete" style="margin-left: 4px; font-size: 12px; padding: 2px 8px; border-radius: 4px; border: 1px solid #d2d2d7; background: #fff; color: #ff3b30; cursor: pointer;">Delete</button>
      </div>
    `).join('');
    // Add copy/delete handlers
    bookmarksList.querySelectorAll('.tldr-bookmarks-copy').forEach(btn => {
      btn.onclick = async () => {
        const idx = btn.getAttribute('data-idx');
        const arr = await getBookmarks();
        const item = arr.find(x => x.id == idx);
        if (item) navigator.clipboard.writeText(item.summary);
        // Show feedback
        const feedback = document.getElementById('tldr-bookmarks-feedback');
        if (feedback) {
          feedback.textContent = 'Copied!';
          setTimeout(() => { feedback.textContent = ''; }, 1200);
        }
      };
    });
    bookmarksList.querySelectorAll('.tldr-bookmarks-delete').forEach(btn => {
      btn.onclick = async () => {
        const idx = btn.getAttribute('data-idx');
        let arr = await getBookmarks();
        arr = arr.filter(x => x.id != idx);
        await setBookmarks(arr);
        renderBookmarks();
        // Show feedback
        const feedback = document.getElementById('tldr-bookmarks-feedback');
        if (feedback) {
          feedback.textContent = 'Removed!';
          setTimeout(() => { feedback.textContent = ''; }, 1200);
        }
      };
    });
  }
  if (bookmarksBtn && bookmarksModal && bookmarksClose) {
    bookmarksBtn.onclick = () => {
      renderBookmarks();
      // Set solid background for modal based on theme
      const win = document.getElementById('tldr-floating-window');
      const modalContent = bookmarksModal.querySelector('div');
      if (win && modalContent) {
        modalContent.style.background = win.classList.contains('tldr-theme-dark') ? '#232325' : '#fff';
      }
      bookmarksModal.style.display = 'flex';
    };
    bookmarksClose.onclick = () => {
      bookmarksModal.style.display = 'none';
    };
    bookmarksModal.onclick = (e) => {
      if (e.target === bookmarksModal) bookmarksModal.style.display = 'none';
    };
  }
  
  // Model selection handlers
  if (modelBtn && modelModal && modelClose) {
    modelBtn.onclick = async () => {
      await renderModelList();
      // Set solid background for modal based on theme
      const win = document.getElementById('tldr-floating-window');
      const modalContent = modelModal.querySelector('div');
      if (win && modalContent) {
        modalContent.style.background = win.classList.contains('tldr-theme-dark') ? '#232325' : '#fff';
      }
      modelModal.style.display = 'flex';
    };
    modelClose.onclick = () => {
      modelModal.style.display = 'none';
    };
    modelModal.onclick = (e) => {
      if (e.target === modelModal) modelModal.style.display = 'none';
    };
  }
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const arr = await getBookmarks();
      const url = window.location.href;
      const title = document.title;
      const summary = document.getElementById('summary-text').innerText.replace(/^Summary\s*/, '');
      const language = document.getElementById('summary-language')?.value || 'en';
      if (!summary || summary === 'Summary will appear here.') return;
      arr.push({
        id: Date.now(),
        url,
        title,
        summary,
        language,
        timestamp: Date.now()
      });
      await setBookmarks(arr);
      saveBtn.textContent = 'Bookmarked!';
      setTimeout(() => { saveBtn.textContent = 'Save'; }, 1200);
    };
  }

  // Initialize current model
  (async () => {
    currentModelId = await getCurrentModel();
    const currentModel = SUMMARIZATION_MODELS.find(m => m.id === currentModelId);
    if (currentModel && modelBtn) {
      modelBtn.textContent = currentModel.name.split(' ')[0]; // Show short name
    }
  })();
  
  refreshBtn.addEventListener('click', () => {
    // Hide the initial prompt when Refresh is clicked
    const prompt = document.getElementById('tldr-initial-prompt');
    if (prompt) prompt.style.display = 'none';
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
      showArticle(extractedArticle.substring(0, 200) + (extractedArticle.length > 200 ? '...' : ''));
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
        let finalText = cleanSummaryFormatting(translated);
        // Convert to Chinese punctuation if the language is Chinese
        if (language === 'cn') {
          finalText = convertToChinesePunctuation(finalText);
        }
        showSummary(finalText);
      } catch (e) {
        showSummary('Translation failed. Showing English summary.\n' + cachedEnglishSummary);
      }
    } else {
      showSummary(cachedEnglishSummary);
    }
  });

  copyBtn.addEventListener('click', () => {
    const summary = document.getElementById('summary-text').innerText.replace(/^Summary\s*/, '');
    if (summary) {
      navigator.clipboard.writeText(summary).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
      });
    }
  });

  shareBtn.addEventListener('click', () => {
    const summary = document.getElementById('summary-text').innerText.replace(/^Summary\s*/, '');
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
}

// THEME LOGIC
function applyTldrTheme(theme) {
  const win = document.getElementById('tldr-floating-window');
  if (!win) return;
  // Remove any previous theme class
  win.classList.remove('tldr-theme-light', 'tldr-theme-dark');
  let finalTheme = theme;
  if (theme === 'system') {
    finalTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  win.classList.add('tldr-theme-' + finalTheme);
}

async function setupThemeSelector() {
  const select = document.getElementById('tldr-theme-select');
  if (!select) return;
  
  // Load from Chrome storage or default to system
  const saved = await getChromeStorage('tldr-theme', 'system');
  select.value = saved;
  applyTldrTheme(saved);
  
  select.addEventListener('change', async () => {
    await setChromeStorage('tldr-theme', select.value);
    applyTldrTheme(select.value);
  });
  
  // Listen for system theme changes if system is selected
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
    const currentTheme = await getChromeStorage('tldr-theme', 'system');
    if (currentTheme === 'system') {
      applyTldrTheme('system');
    }
  });
}

// Add theme CSS to the floating window
function injectTldrThemeStyles() {
  if (document.getElementById('tldr-theme-style')) return;
  const style = document.createElement('style');
  style.id = 'tldr-theme-style';
  style.textContent = `
    #tldr-floating-window {
      --tldr-bg-opacity: 0.95;
      --tldr-bg: rgba(255,255,255,var(--tldr-bg-opacity));
      --tldr-header-bg: #18181a;
      --tldr-header-color: #fff;
      --tldr-text: #1d1d1f;
      --tldr-border: 1px solid #d2d2d7;
      --tldr-btn-bg: #4F8EF7;
      --tldr-btn-color: #fff;
      --tldr-btn-border: none;
      --tldr-select-bg: #fff;
      --tldr-select-color: #1d1d1f;
      --tldr-select-border: 1px solid #d2d2d7;
      --tldr-label-color: #1d1d1f;
      --tldr-placeholder-color: #86868b;
      --tldr-accent: #4F8EF7;
      --tldr-strong-label: #1d1d1f;
    }
    #tldr-floating-window.tldr-theme-dark {
      --tldr-bg: rgba(24,24,26,var(--tldr-bg-opacity));
      --tldr-header-bg: #18181a;
      --tldr-header-color: #fff;
      --tldr-text: #f5f5f7;
      --tldr-border: 1px solid #444;
      --tldr-btn-bg: #3A6FC1;
      --tldr-btn-color: #fff;
      --tldr-btn-border: none;
      --tldr-select-bg: #232325;
      --tldr-select-color: #f5f5f7;
      --tldr-select-border: 1px solid #444;
      --tldr-label-color: #f5f5f7;
      --tldr-placeholder-color: #b0b0b8;
      --tldr-accent: #3A6FC1;
      --tldr-strong-label: #fff;
    }
    /* Color themes */
    #tldr-floating-window.tldr-color-blue {
      --tldr-btn-bg: #4F8EF7;
      --tldr-btn-color: #fff;
      --tldr-accent: #4F8EF7;
      --tldr-header-bg: #4F8EF7;
    }
    #tldr-floating-window.tldr-theme-dark.tldr-color-blue {
      --tldr-btn-bg: #3A6FC1;
      --tldr-btn-color: #fff;
      --tldr-accent: #3A6FC1;
      --tldr-header-bg: #3A6FC1;
    }
    #tldr-floating-window.tldr-color-grey {
      --tldr-btn-bg: #A0A4AB;
      --tldr-btn-color: #fff;
      --tldr-accent: #A0A4AB;
      --tldr-header-bg: #A0A4AB;
    }
    #tldr-floating-window.tldr-theme-dark.tldr-color-grey {
      --tldr-btn-bg: #5A5E66;
      --tldr-btn-color: #fff;
      --tldr-accent: #5A5E66;
      --tldr-header-bg: #5A5E66;
    }
    #tldr-floating-window.tldr-color-green {
      --tldr-btn-bg: #5AC18E;
      --tldr-btn-color: #fff;
      --tldr-accent: #5AC18E;
      --tldr-header-bg: #5AC18E;
    }
    #tldr-floating-window.tldr-theme-dark.tldr-color-green {
      --tldr-btn-bg: #388E6C;
      --tldr-btn-color: #fff;
      --tldr-accent: #388E6C;
      --tldr-header-bg: #388E6C;
    }
    #tldr-floating-window.tldr-color-red {
      --tldr-btn-bg: #F76C6C;
      --tldr-btn-color: #fff;
      --tldr-accent: #F76C6C;
      --tldr-header-bg: #F76C6C;
    }
    #tldr-floating-window.tldr-theme-dark.tldr-color-red {
      --tldr-btn-bg: #C14B4B;
      --tldr-btn-color: #fff;
      --tldr-accent: #C14B4B;
      --tldr-header-bg: #C14B4B;
    }
    #tldr-floating-window.tldr-color-purple {
      --tldr-btn-bg: #A18FD1;
      --tldr-btn-color: #fff;
      --tldr-accent: #A18FD1;
      --tldr-header-bg: #A18FD1;
    }
    #tldr-floating-window.tldr-theme-dark.tldr-color-purple {
      --tldr-btn-bg: #6C5B7B;
      --tldr-btn-color: #fff;
      --tldr-accent: #6C5B7B;
      --tldr-header-bg: #6C5B7B;
    }
    #tldr-floating-window {
      background: var(--tldr-bg) !important;
      color: var(--tldr-text) !important;
      border: var(--tldr-border) !important;
    }
    #tldr-floating-content {
      background: var(--tldr-bg) !important;
      color: var(--tldr-text) !important;
    }
    #tldr-floating-header {
      background: var(--tldr-header-bg) !important;
      color: var(--tldr-header-color) !important;
    }
    #tldr-theme-row label[for='tldr-translucency-slider'] {
      color: var(--tldr-strong-label);
    }
    #tldr-translucency-slider::-webkit-slider-thumb {
      background: var(--tldr-accent) !important;
      border: 2px solid #fff !important;
    }
    #tldr-translucency-slider::-moz-range-thumb {
      background: var(--tldr-accent) !important;
      border: 2px solid #fff !important;
    }
    #tldr-translucency-slider::-ms-thumb {
      background: var(--tldr-accent) !important;
      border: 2px solid #fff !important;
    }
    #tldr-floating-content label,
    #tldr-floating-content select,
    #tldr-floating-content option,
    #tldr-floating-content h3 {
      color: var(--tldr-label-color) !important;
      background: transparent !important;
    }
    #tldr-floating-content select {
      background: var(--tldr-select-bg) !important;
      color: var(--tldr-select-color) !important;
      border: var(--tldr-select-border) !important;
    }
    #tldr-floating-content select:disabled {
      background: var(--tldr-select-bg) !important;
      color: var(--tldr-placeholder-color) !important;
      opacity: 1 !important;
    }
    #tldr-floating-content p,
    #tldr-floating-content h3 {
      color: var(--tldr-text) !important;
      background: transparent !important;
    }
    #tldr-floating-content p[style*='italic'],
    #tldr-floating-content p[style*='italic'] * {
      color: var(--tldr-placeholder-color) !important;
    }
    #tldr-floating-content button {
      background: var(--tldr-btn-bg) !important;
      color: var(--tldr-btn-color) !important;
      border: var(--tldr-btn-border) !important;
    }
    #tldr-floating-content #copy-summary-btn,
    #tldr-floating-content #share-summary-btn {
      background: #f5f5f7 !important;
      color: var(--tldr-text) !important;
      border: 1px solid #d2d2d7 !important;
    }
    #tldr-floating-window.tldr-theme-dark #tldr-floating-content #copy-summary-btn,
    #tldr-floating-window.tldr-theme-dark #tldr-floating-content #share-summary-btn {
      background: #232325 !important;
      color: #f5f5f7 !important;
      border: 1px solid #444 !important;
    }
    #tldr-initial-prompt {
      color: var(--tldr-accent) !important;
    }
    #tldr-floating-window.tldr-theme-dark #tldr-initial-prompt {
      color: var(--tldr-accent) !important;
    }
    #tldr-translucency-slider {
      accent-color: var(--tldr-accent) !important;
    }
  `;
  document.head.appendChild(style);
}

async function setupTranslucencyControl() {
  const win = document.getElementById('tldr-floating-window');
  const slider = document.getElementById('tldr-translucency-slider');
  const valueSpan = document.getElementById('tldr-translucency-value');
  if (!win || !slider || !valueSpan) return;
  
  async function setTranslucency(val) {
    const opacity = Math.round(val) / 100;
    win.style.setProperty('--tldr-bg-opacity', opacity);
    await setChromeStorage('tldr-translucency', opacity);
    valueSpan.textContent = `${100 - Math.round(opacity * 100)}%`;
  }
  
  // Load saved translucency from Chrome storage
  const savedTrans = await getChromeStorage('tldr-translucency', 0.95);
  const opacityPercent = Math.round(savedTrans * 100);
  slider.value = opacityPercent;
  setTranslucency(opacityPercent);
  slider.addEventListener('input', () => setTranslucency(slider.value));
}

function applyTldrColor(color) {
  const win = document.getElementById('tldr-floating-window');
  if (!win) return;
  win.classList.remove('tldr-color-blue', 'tldr-color-grey', 'tldr-color-green', 'tldr-color-red', 'tldr-color-purple');
  win.classList.add('tldr-color-' + color);
}

async function setupColorSelector() {
  const select = document.getElementById('tldr-color-select');
  if (!select) return;
  
  // Load from Chrome storage or default to blue
  const saved = await getChromeStorage('tldr-color', 'blue');
  select.value = saved;
  applyTldrColor(saved);
  
  select.addEventListener('change', async () => {
    await setChromeStorage('tldr-color', select.value);
    applyTldrColor(select.value);
  });
}

// Replace the injectFloatingWindow override with an async version that loads settings first
const originalInjectFloatingWindow = injectFloatingWindow;
injectFloatingWindow = async function() {
  originalInjectFloatingWindow();
  const win = document.getElementById('tldr-floating-window');
  if (win) await applySavedWindowBounds(win);
  // Load settings from chrome.storage.local
  const savedColor = await getChromeStorage('tldr-color', 'blue');
  const savedTheme = await getChromeStorage('tldr-theme', 'system');
  const savedTrans = parseFloat(await getChromeStorage('tldr-translucency', '0.95'));
  // Apply theme and color before rendering UI
  applyTldrTheme(savedTheme);
  applyTldrColor(savedColor);
  if (win) win.style.setProperty('--tldr-bg-opacity', savedTrans);
  injectTldrThemeStyles();
  await renderFloatingUI();
  setupFloatingUIHandlers();
  await setupThemeSelector();
  await setupTranslucencyControl();
  await setupColorSelector();
  // Always hide modals on load
  const bookmarksModal = document.getElementById('tldr-bookmarks-modal');
  const modelModal = document.getElementById('tldr-model-modal');
  if (bookmarksModal) bookmarksModal.style.display = 'none';
  if (modelModal) modelModal.style.display = 'none';
};

// Migrate old history to bookmarks if needed (Chrome storage version)
(async () => {
  const oldHistory = await getChromeStorage('tldr-history', null);
  const existingBookmarks = await getChromeStorage('tldr-bookmarks', []);
  if (oldHistory && existingBookmarks.length === 0) {
    await setChromeStorage('tldr-bookmarks', oldHistory);
    await setChromeStorage('tldr-history', null);
  }
})();

// Utility functions for Chrome storage
async function getChromeStorage(key, defaultValue) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}
async function setChromeStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

// Migrate old localStorage to chrome.storage.local if needed
(async () => {
  try {
    if (localStorage.getItem('tldr-bookmarks')) {
      const bookmarks = JSON.parse(localStorage.getItem('tldr-bookmarks'));
      await setChromeStorage('tldr-bookmarks', bookmarks);
      localStorage.removeItem('tldr-bookmarks');
    }
    if (localStorage.getItem('tldr-color')) {
      await setChromeStorage('tldr-color', localStorage.getItem('tldr-color'));
      localStorage.removeItem('tldr-color');
    }
    if (localStorage.getItem('tldr-theme')) {
      await setChromeStorage('tldr-theme', localStorage.getItem('tldr-theme'));
      localStorage.removeItem('tldr-theme');
    }
    if (localStorage.getItem('tldr-translucency')) {
      await setChromeStorage('tldr-translucency', localStorage.getItem('tldr-translucency'));
      localStorage.removeItem('tldr-translucency');
    }
  } catch (error) {
    console.error('Error migrating localStorage to Chrome storage:', error);
  }
})();

// When creating the floating window, restore size and position
async function applySavedWindowBounds(win) {
  const bounds = await getChromeStorage('tldr-window-bounds', null);
  if (bounds) {
    if (bounds.top !== undefined) win.style.top = bounds.top + 'px';
    if (bounds.left !== undefined) win.style.left = bounds.left + 'px';
    if (bounds.width !== undefined) win.style.width = bounds.width + 'px';
    if (bounds.height !== undefined) win.style.height = bounds.height + 'px';
    win.style.right = '';
  }
} 