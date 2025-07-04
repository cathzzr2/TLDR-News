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

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_MAIN_TEXT') {
    if (message.mainText && message.mainText.length > 50) {
      extractedArticle = message.mainText;
      showArticle(extractedArticle.substring(0, 1000) + (extractedArticle.length > 1000 ? '...' : ''));
      showSummary('Click "Summarize" to generate a summary.');
    } else {
      showError('No main article content found on this page.');
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
        showError('Could not load article content. Please refresh the page and try again.');
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

summarizeBtn.addEventListener('click', () => {
  if (!extractedArticle || extractedArticle.length < 50) {
    showSummary('No article content to summarize.');
    return;
  }
  // Get user options
  const length = lengthSelect.value;
  const language = languageSelect.value;
  // Determine number of sentences based on length
  let numSentences = 2;
  if (length === 'short') numSentences = 1;
  else if (length === 'medium') numSentences = 3;
  else if (length === 'detailed') numSentences = 6;
  // Simple placeholder: show first N sentences as the summary
  const sentences = extractedArticle.match(/[^.!?]+[.!?]+/g);
  let summary = '';
  if (sentences && sentences.length > 0) {
    summary = sentences.slice(0, numSentences).join(' ');
  } else {
    summary = extractedArticle.substring(0, 200) + (extractedArticle.length > 200 ? '...' : '');
  }
  // Simulate language selection (real translation API can be added later)
  let langLabel = '';
  switch (language) {
    case 'cn': langLabel = '[Chinese] '; break;
    case 'es': langLabel = '[Spanish] '; break;
    case 'fr': langLabel = '[French] '; break;
    case 'de': langLabel = '[German] '; break;
    case 'ja': langLabel = '[Japanese] '; break;
    default: langLabel = '';
  }
  showSummary(langLabel + summary);
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
  showArticle('Refreshing article...');
  showSummary('');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH_MAIN_TEXT' });
  });
}); 