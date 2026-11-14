const queue = [];
let active = 0;
const MAX_ACTIVE = 2;
const MEDIA_HOSTS = ['tigerlips.org', 'trn.su', 'roomfish.ru', 'miskuzi.link'];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !['download', 'downloadMany'].includes(message.type)) return false;

  if (!isSupportedSender(sender)) {
    sendResponse({ accepted: 0, failures: [{ error: 'Unsupported sender URL' }], ids: [] });
    return false;
  }

  if (message.type === 'downloadMany' && !Array.isArray(message.items)) {
    sendResponse({ accepted: 0, failures: [{ error: 'Download items must be an array' }], ids: [] });
    return false;
  }

  const items = message.type === 'download' ? [message.item] : message.items;
  const results = items.map(item => {
    try {
      const validated = validateItem(item);
      return new Promise(resolve => queue.push({ item: validated, resolve }));
    } catch (error) {
      return Promise.resolve({ error: error.message });
    }
  });

  Promise.all(results).then(results => {
    const ids = results.filter(result => result.id !== undefined).map(result => result.id);
    const failures = results.filter(result => result.error !== undefined);
    sendResponse({ accepted: ids.length, failures, ids });
  });
  processQueue();
  return true;
});

function isSupportedSender(sender) {
  try {
    const url = new URL(sender.url);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === 'animevost.org' || url.hostname === 'vost.pw' || url.hostname.endsWith('.vost.pw'));
  } catch {
    return false;
  }
}

function validateItem(item) {
  if (!item || typeof item !== 'object' || typeof item.url !== 'string') {
    throw new Error('Download item must contain a media URL');
  }

  let url;
  try {
    url = new URL(item.url);
  } catch {
    throw new Error('Invalid media URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !MEDIA_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error('Media URL must use HTTPS on an approved host');
  }

  const filename = item.filename;
  if (typeof filename !== 'string' || !filename.trim() ||
      /[\\\x00-\x1f\x7f:<>"|?*]/.test(filename) ||
      filename.split('/').some(part => !part.trim() || /[. ]$/.test(part))) {
    throw new Error('Filename must be a relative path without traversal');
  }

  return { url: url.href, filename };
}

function startDownload(item) {
  return new Promise(resolve => {
    try {
      chrome.downloads.download({
        url: item.url,
        filename: item.filename,
        saveAs: false,
        conflictAction: 'uniquify'
      }, id => {
        const error = chrome.runtime.lastError;
        if (error) {
          resolve({ error: error.message || 'Download was rejected' });
        } else if (!Number.isInteger(id) || id < 0) {
          resolve({ error: 'Browser did not return a valid download ID' });
        } else {
          resolve({ id });
        }
      });
    } catch (error) {
      resolve({ error: error?.message || 'Could not start download' });
    }
  });
}

function processQueue() {
  while (active < MAX_ACTIVE && queue.length) {
    const { item, resolve } = queue.shift();
    active++;
    startDownload(item).then(result => {
      active--;
      resolve(result);
      processQueue();
    });
  }
}
