// content.js
// This script extracts the main article content from news pages using Readability.js and sends it to the popup.

// Wait for DOM to be fully loaded
window.addEventListener('DOMContentLoaded', () => {
  // Use Readability to parse the document
  const article = new Readability(document.cloneNode(true)).parse();
  const mainText = article && article.textContent ? article.textContent : '';
  // Send the main text to the popup
  chrome.runtime.sendMessage({
    type: 'PAGE_MAIN_TEXT',
    mainText: mainText
  });
}); 