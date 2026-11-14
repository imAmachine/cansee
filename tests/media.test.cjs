const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const plain = value => JSON.parse(JSON.stringify(value));

function load() {
  const context = {};
  vm.runInNewContext(fs.readFileSync('modules/vost-clean/media.js', 'utf8'), context);
  return context.VostMedia;
}

test('episodes parse the inline data table and ignore unrelated data variables', () => {
  const media = load();
  const html = `
    <script>var data; data = JSON.parse(xhr.responseText);</script>
    <script>var data = {"1 серия":"2132626960","2 серия":1971260927,"7 серия":"5084480",};</script>`;
  assert.deepEqual(plain(media.episodes(html)), [
    { name: '1 серия', id: '2132626960' },
    { name: '2 серия', id: '1971260927' },
    { name: '7 серия', id: '5084480' }
  ]);
});

test('episodes support single quotes and skip duplicates', () => {
  const media = load();
  const html = `<script>data = {'1 серия':'111111','1 серия':'111111'};</script>`;
  assert.deepEqual(plain(media.episodes(html)), [{ name: '1 серия', id: '111111' }]);
});

test('download anchors are decoded and the 720p source comes first', () => {
  const media = load();
  const html = `
    <a download="invoice" target="_blank" href="https://std.miskuzi.link/123.mp4?md5=aaa&amp;time=1&amp;d=1">480p (SD)</a>
    <a class="butt" id="dl720" download="invoice" target="_blank" href="https://hd.miskuzi.link/720/123.mp4?md5=bbb&amp;time=1&amp;d=1">720p (HD)</a>`;
  const urls = plain(media.videoUrls(html));
  assert.equal(urls[0], 'https://hd.miskuzi.link/720/123.mp4?md5=bbb&time=1&d=1');
  assert.equal(urls[1], 'https://std.miskuzi.link/123.mp4?md5=aaa&time=1&d=1');
  assert.equal(urls.length, 2);
});

test('playerjs file config is expanded into ordered mirrors without ip binding first', () => {
  const media = load();
  const html = `<script>var player = new Playerjs({"file":"[SD (480p)]https://std.roomfish.ru/1.mp4?md5=x&time=2 or https://std.roomfish.ru/1.mp4?md5=x&time=2&ip=1.2.3.4,[HD (720р)]https://hd.miskuzi.link/720/1.mp4?md5=y&time=2"});</script>`;
  assert.deepEqual(plain(media.videoUrls(html)), [
    'https://hd.miskuzi.link/720/1.mp4?md5=y&time=2',
    'https://std.roomfish.ru/1.mp4?md5=x&time=2',
    'https://std.roomfish.ru/1.mp4?md5=x&time=2&ip=1.2.3.4'
  ]);
});

test('plain getlink responses and HLS-only responses are handled', () => {
  const media = load();
  assert.deepEqual(plain(media.videoUrls('https://std.roomfish.ru/1.mp4?md5=x&time=2 or https://ram.roomfish.ru/1.mp4?md5=x&time=2&ip=9.9.9.9')), [
    'https://std.roomfish.ru/1.mp4?md5=x&time=2',
    'https://ram.roomfish.ru/1.mp4?md5=x&time=2&ip=9.9.9.9'
  ]);
  assert.deepEqual(plain(media.videoUrls('{"file":"https://cdn.example.test/stream/index.m3u8"}')), []);
});
