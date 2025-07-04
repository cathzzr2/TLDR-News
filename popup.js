// popup.js
// This script handles fetching and displaying the summary in the popup for news pages.

function showSummary(summary) {
  const container = document.getElementById('summary-container');
  container.innerHTML = `<h3>Summary</h3><p>${summary}</p>`;
}

function showError(msg) {
  const container = document.getElementById('summary-container');
  container.innerHTML = `<p>${msg}</p>`;
}

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_MAIN_TEXT') {
    if (message.mainText && message.mainText.length > 50) {
      // Placeholder: show the extracted text (will replace with summary)
      showSummary(message.mainText.substring(0, 500) + '...');
    } else {
      showError('No main article content found on this page.');
    }
  }
});

// Request main text when popup opens
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_MAIN_TEXT' });
}); 