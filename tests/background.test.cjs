const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness(fail = false) {
  let listener;
  const calls = [];
  const chrome = { runtime: { onMessage: { addListener(fn) { listener = fn; } } }, downloads: { download(item, callback) { calls.push(item); queueMicrotask(() => { if (fail) chrome.runtime.lastError = { message: 'Rejected' }; callback(fail ? undefined : calls.length); delete chrome.runtime.lastError; }); } } };
  vm.runInNewContext(fs.readFileSync('modules/vost-clean/background.js', 'utf8'), { chrome, URL, Promise, Number });
  return { calls, send: (message, url = 'https://v14.vost.pw/') => new Promise(resolve => listener(message, { url }, resolve)) };
}
const item = { url: 'https://vn5614.tigerlips.org/720/123.mp4', filename: 'Anime/01.mp4' };
test('acknowledges actual accepted downloads', async () => { const h = harness(); const result = await h.send({ type: 'download', item }); assert.equal(result.accepted, 1); assert.equal(result.ids.length, 1); });
test('reports browser rejection', async () => { const h = harness(true); const result = await h.send({ type: 'download', item }); assert.equal(result.accepted, 0); assert.equal(result.failures[0].error, 'Rejected'); });
test('rejects external senders and traversal', async () => { const h = harness(); assert.equal((await h.send({ type: 'download', item }, 'https://evil.test')).accepted, 0); assert.equal((await h.send({ type: 'download', item: { ...item, filename: '../bad.mp4' } })).accepted, 0); assert.equal(h.calls.length, 0); });
test('returns partial batch success', async () => { const h = harness(); const result = await h.send({ type: 'downloadMany', items: [item, { ...item, url: 'https://evil.test/a.mp4' }] }); assert.equal(result.accepted, 1); assert.equal(result.failures.length, 1); });
test('accepts the current media mirrors', async () => {
  const h = harness();
  for (const url of ['https://hd.miskuzi.link/720/1.mp4', 'https://std.miskuzi.link/1.mp4', 'https://miniru.trn.su/1.mp4', 'https://ram.roomfish.ru/1.mp4']) {
    const result = await h.send({ type: 'download', item: { ...item, url } });
    assert.equal(result.accepted, 1, url);
  }
  assert.equal((await h.send({ type: 'download', item: { ...item, url: 'https://miskuzi.link.evil.test/1.mp4' } })).accepted, 0);
});
