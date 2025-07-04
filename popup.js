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

// Request main text when popup opens
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_MAIN_TEXT' });
});

// Summarize button logic
const summarizeBtn = document.getElementById('summarize-btn');
summarizeBtn.addEventListener('click', () => {
  if (!extractedArticle || extractedArticle.length < 50) {
    showSummary('No article content to summarize.');
    return;
  }
  // Simple placeholder: show first 2 sentences as the summary
  const sentences = extractedArticle.match(/[^.!?]+[.!?]+/g);
  let summary = '';
  if (sentences && sentences.length > 1) {
    summary = sentences.slice(0, 2).join(' ');
  } else {
    summary = extractedArticle.substring(0, 200) + (extractedArticle.length > 200 ? '...' : '');
  }
  showSummary(summary);
}); 