// popup.js
// This script handles fetching and displaying the summary in the popup for news pages.

function showArticle(articleText) {
  const container = document.getElementById('article-container');
  container.innerHTML = `<h3>Extracted Article</h3><p>${articleText}</p>`;
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

let extractedArticle = '';
let hasLoadedArticle = false;
let cachedEnglishSummary = '';
let lastSummarizedArticle = '';
let hasTriedRefresh = false;

function promptRefresh() {
  showArticle('Please click the Refresh button above to load the article content.');
  showSummary('');
}

// On popup open, prompt user to refresh
promptRefresh();

// Listen for article extraction result
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_MAIN_TEXT') {
    if (message.mainText && message.mainText.length > 50) {
      extractedArticle = message.mainText;
      hasLoadedArticle = true;
      showArticle(extractedArticle.substring(0, 1000) + (extractedArticle.length > 1000 ? '...' : ''));
      showSummary('Click "Summarize" to generate a summary.');
    } else {
      showError('To summarize, please click the Refresh button to load the article content.');
      hasLoadedArticle = false;
      cachedEnglishSummary = '';
      lastSummarizedArticle = '';
    }
  }
});

function requestMainTextOrInject(retry = false) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_MAIN_TEXT' }, (response) => {
      if (chrome.runtime.lastError && !retry) {
        // Content script not found, inject it then retry
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['readability.js', 'content.js']
        }, () => {
          // Retry after injection
          requestMainTextOrInject(true);
        });
      } else if (chrome.runtime.lastError && retry) {
        // Still failed after injection
        showError('To summarize, please click the Refresh button to load the article content.');
      }
      // If no error, content script will send PAGE_MAIN_TEXT as usual
    });
  });
}

// Replace initial request with new function
requestMainTextOrInject();

// Summarize button logic
const summarizeBtn = document.getElementById('summarize-btn');
const lengthSelect = document.getElementById('summary-length');
const languageSelect = document.getElementById('summary-language');

const MODEL_ID = 'sshleifer/distilbart-cnn-12-6'; // model choice

const TRANSLATE_MODEL_MAP = {
  'cn': 'Helsinki-NLP/opus-mt-en-zh',
  'es': 'Helsinki-NLP/opus-mt-en-es',
  'fr': 'Helsinki-NLP/opus-mt-en-fr',
  'de': 'Helsinki-NLP/opus-mt-en-de',
  'ja': 'Helsinki-NLP/opus-mt-en-ja',
};

function splitIntoSentenceChunks(text, sentencesPerChunk = 10) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
    chunks.push(sentences.slice(i, i + sentencesPerChunk).join(' '));
  }
  return chunks;
}

async function translateWithHuggingFace(text, targetLang) {
  const apiKey = HUGGINGFACE_API_KEY;
  const model = TRANSLATE_MODEL_MAP[targetLang];
  if (!model) return text; // fallback: return original if no model
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
  const sentenceChunks = splitIntoSentenceChunks(text, 10); // 10 sentences per chunk
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
  // Optionally, summarize the combined summary if it's still long
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

function cleanSummaryFormatting(text) {
  return text
    .replace(/\s+([.,!?;:])/g, '$1') // Remove space before punctuation
    .replace(/\s+/g, ' ')            // Collapse multiple spaces
    .trim();
}

// Summarize button logic (AI-powered, chunked by sentences, with translation and caching)
summarizeBtn.addEventListener('click', async () => {
  if (!hasLoadedArticle || !extractedArticle || extractedArticle.length < 50) {
    showSummary('Please refresh to load article content before summarizing.');
    return;
  }
  const language = languageSelect.value;
  // Only re-summarize if the article has changed
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

// Copy & Share button logic
const copyBtn = document.getElementById('copy-summary-btn');
const shareBtn = document.getElementById('share-summary-btn');

function getCurrentSummary() {
  const container = document.getElementById('summary-container');
  // Get only the text content, not the heading
  return container ? container.innerText.replace(/^Summary\s*/, '') : '';
}

copyBtn.addEventListener('click', () => {
  const summary = getCurrentSummary();
  if (summary) {
    navigator.clipboard.writeText(summary).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
    });
  }
});

shareBtn.addEventListener('click', () => {
  const summary = getCurrentSummary();
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

const refreshBtn = document.getElementById('refresh-btn');

refreshBtn.addEventListener('click', () => {
  hasTriedRefresh = true;
  showArticle('Refreshing article...');
  showSummary('');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH_MAIN_TEXT' });
  });
}); 