const queue = [];
let active = 0;
const MAX_ACTIVE = 2;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'download') {
    queue.push(message.item);
    processQueue();
    sendResponse({ queued: true, size: queue.length });
    return true;
  }
  if (message.type === 'downloadMany') {
    queue.push(...message.items);
    processQueue();
    sendResponse({ queued: true, size: queue.length });
    return true;
  }
});

async function processQueue() {
  while (active < MAX_ACTIVE && queue.length) {
    const item = queue.shift();
    active++;
    chrome.downloads.download({
      url: item.url,
      filename: item.filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, () => {
      // Download errors are surfaced by the browser's downloads UI.
      active--;
      processQueue();
    });
  }
}
