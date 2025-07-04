chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'OPEN_TLDR_FLOATING_WINDOW' });
}); 