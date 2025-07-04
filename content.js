// content.js
// This script extracts the main article content from news pages using Readability.js and sends it to the popup on request.

let extractedMainText = '';

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
    // Re-extract in case of dynamic content
    extractedMainText = getMainText();
    chrome.runtime.sendMessage({
      type: 'PAGE_MAIN_TEXT',
      mainText: extractedMainText
    });
  }
}); 