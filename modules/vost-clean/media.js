(() => {
  const decode = (value = '') => String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  const clean = (value = '') => decode(value).replace(/\s+/g, ' ').trim();

  function episodes(html = '') {
    const text = String(html || '');
    const found = [];
    const seen = new Set();
    for (const block of text.matchAll(/(?:var|let|const)?\s*\bdata\s*=\s*\{([\s\S]*?)\}\s*;?/g)) {
      for (const item of block[1].matchAll(/["']([^"'\n]{1,120})["']\s*:\s*["']?(\d{2,})["']?/g)) {
        const name = clean(item[1]);
        if (seen.has(name)) continue;
        seen.add(name);
        found.push({ name, id: item[2] });
      }
    }
    return found;
  }

  function score(url, label = '') {
    const text = String(label).toLowerCase();
    if (/\b720p?\b/.test(text) || /\bhd\b/.test(text)) return 0;
    if (/\b1080p?\b/.test(text) || /\bfhd\b/.test(text)) return 1;
    if (/\b480p?\b/.test(text) || /\bsd\b/.test(text)) return 3;
    const path = String(url).toLowerCase();
    if (/\/720\//.test(path)) return 0;
    if (/\/1080\//.test(path)) return 1;
    if (/\/480\//.test(path)) return 3;
    return 2;
  }

  function videoUrls(html = '') {
    const text = decode(String(html || ''));
    const found = [];
    const seen = new Set();

    const add = (raw, label = '') => {
      let value = clean(raw).replace(/^["']|["']$/g, '');
      if (!/^https?:\/\//i.test(value)) return;
      const path = value.split(/[?#]/, 1)[0];
      if (!/\.mp4$/i.test(path)) return;
      if (seen.has(value)) return;
      seen.add(value);
      found.push({ url: value, score: score(value, label) });
    };

    for (const config of text.matchAll(/\bfile\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      const value = config[1].replace(/\\\//g, '/');
      for (const group of value.split(',')) {
        const label = group.match(/^\s*\[([^\]]*)\]/)?.[1] || '';
        for (const url of group.split(/\s+or\s+/i)) add(url.replace(/^\s*\[[^\]]*\]/, ''), label);
      }
    }

    for (const config of text.matchAll(/\bfile\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
      const value = config[1].replace(/\\\//g, '/');
      for (const group of value.split(',')) {
        const label = group.match(/^\s*\[([^\]]*)\]/)?.[1] || '';
        for (const url of group.split(/\s+or\s+/i)) add(url.replace(/^\s*\[[^\]]*\]/, ''), label);
      }
    }

    for (const anchor of text.matchAll(/<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/gi)) {
      const attributes = anchor[1];
      if (!/\bdownload\b/i.test(attributes)) continue;
      const href = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (!href) continue;
      const label = `${attributes.match(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean) || ''} ${anchor[2].replace(/<[^>]*>/g, ' ')}`;
      add(href[1] ?? href[2] ?? href[3], label);
    }

    for (const match of text.matchAll(/https?:\/\/[^\s"'<>\\,[\]]+/gi)) add(match[0]);

    return found
      .map((item, index) => ({ ...item, index, fallback: /[?&]ip=/.test(item.url) ? 1 : 0 }))
      .sort((a, b) => a.score - b.score || a.fallback - b.fallback || a.index - b.index)
      .map(item => item.url);
  }

  globalThis.VostMedia = { clean, episodes, videoUrls };
})();
