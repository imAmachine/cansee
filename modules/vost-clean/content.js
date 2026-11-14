(async () => {
  window.vostStarting = true;
  try {
  if (!await window.VostModuleState.ready) return;
  const A = window.VostAdapter;
  const type = A.currentType();
  if (type === 'unsupported') { window.vostStarting = false; document.documentElement.classList.remove('vost-loading', 'vost-loading-light'); return; }
  const requestText = async (url, options = {}) => {
    let lastError;
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { credentials: 'same-origin', ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`Ошибка HTTP ${response.status}`);
        return await response.text();
      } catch (error) {
        lastError = error;
        const status = Number(String(error?.message || '').match(/HTTP (\d{3})/)?.[1] || 0);
        if ((status && status < 500) || attempt >= 1 || options.signal) break;
        await new Promise(resolve => setTimeout(resolve, 400));
      } finally { clearTimeout(timer); }
    }
    throw lastError;
  };
  const episodeNumber = episode => (String(episode.name).match(/\d+/) || [String(episode.name)])[0];
  const episodeFile = (heading, episode) => `${safe(heading)}/${safe(`${heading} - ${episodeNumber(episode).padStart(2, '0')}`)}.mp4`;
  async function episodeSources(episode) {
    const play = encodeURIComponent(episode.id);
    for (const path of [`frame5.php?play=${play}`, `frame5.php?play=${play}&old=1`, `getlink.php?id=${play}`]) {
      try {
        const urls = window.VostMedia.videoUrls(await requestText(`${location.origin}/${path}`));
        if (urls.length) return urls;
      } catch { /* Try the next player endpoint. */ }
    }
    throw new Error('Рабочая ссылка на видео не найдена');
  }
  const withoutDownloadFlag = url => {
    try { const value = new URL(url); value.searchParams.delete('d'); return value.href; }
    catch { return ''; }
  };
  const hostHealth = new Map();
  const hostOf = url => { try { return new URL(url).host; } catch { return ''; } };
  const probePlayable = url => new Promise(resolve => {
    const video = document.createElement('video');
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      try { video.load(); } catch {}
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 3000);
    video.muted = true;
    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', () => finish(true), { once: true });
    video.addEventListener('error', () => finish(false), { once: true });
    video.src = url;
  });
  const reachable = async url => {
    const host = hostOf(url);
    const known = hostHealth.get(host);
    if (known && Date.now() - known.time < 300000) return known;
    const started = Date.now();
    const ok = await probePlayable(url);
    const entry = { ok, ms: ok ? Date.now() - started : Number.POSITIVE_INFINITY, time: Date.now() };
    hostHealth.set(host, entry);
    return entry;
  };
  const qualityOf = url => {
    const path = String(url).toLowerCase();
    if (/\/720\//.test(path)) return 0;
    if (/\/1080\//.test(path)) return 1;
    if (/\/480\//.test(path)) return 3;
    return 2;
  };
  async function pickSource(urls) {
    if (urls.length < 2) return urls[0];
    const checks = await Promise.all(urls.slice(0, 4).map(async (url, index) => {
      const result = await reachable(withoutDownloadFlag(url) || url);
      return { url, index, quality: qualityOf(url), ok: result.ok, ms: result.ms };
    }));
    const working = checks.filter(item => item.ok);
    if (!working.length) return checks[0].url;
    working.sort((a, b) => a.quality - b.quality || a.ms - b.ms || a.index - b.index);
    return working[0].url;
  }
  const readObject = key => { try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } };
  const data = type === 'title' ? A.title() : { latest: A.latest(), cards: A.cards(), pages: A.pages(), schedule: A.schedule() };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const COVER_CACHE_KEY = 'vost-cover-cache-v1';
  const COVER_TTL = 24 * 60 * 60 * 1000;
  let coverCache;
  function readCoverCache() { return coverCache ||= readObject(COVER_CACHE_KEY); }
  function cachedCover(url) { const item = readCoverCache()[url]; return item && Date.now() - item.time < COVER_TTL ? item.src : ''; }
  function saveCover(url, src) { try { const cache = readCoverCache(); cache[url] = { src, time: Date.now() }; const fresh = Object.fromEntries(Object.entries(cache).filter(([, item]) => item && typeof item.src === 'string' && Date.now() - item.time < COVER_TTL)); coverCache = fresh; localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(fresh)); } catch {} }
  const PAGE_CACHE_KEY = 'vost-page-cache-v1';
  const PAGE_TTL = 15 * 60 * 1000;
  const META_CACHE_KEY = 'vost-latest-meta-v1';
  const META_TTL = 15 * 60 * 1000;
  let metaCache;
  function readMetaCache() {
    if (metaCache) return metaCache;
    try { const value = JSON.parse(localStorage.getItem(META_CACHE_KEY) || '{}'); metaCache = value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { metaCache = {}; }
    return metaCache;
  }
  function cachedMeta(item) {
    const entry = readMetaCache()[item.url];
    return entry && entry.name === item.name && Number.isFinite(entry.time) && Date.now() - entry.time >= 0 && Date.now() - entry.time < META_TTL ? entry : null;
  }
  function saveMeta(item, date, poster) {
    const cache = readMetaCache();
    cache[item.url] = { name: item.name, date, poster, time: Date.now() };
    const entries = Object.entries(cache).filter(([, value]) => value && Number.isFinite(value.time) && Date.now() - value.time < META_TTL).sort((a, b) => b[1].time - a[1].time).slice(0, 200);
    metaCache = Object.fromEntries(entries);
    try { localStorage.setItem(META_CACHE_KEY, JSON.stringify(metaCache)); } catch { /* Storage may be unavailable or full. */ }
  }
  let pageCache;
  function readPageCache() { return pageCache ||= readObject(PAGE_CACHE_KEY); }
  async function getPage(url) {
    const cache = readPageCache();
    if (cache[url] && Date.now() - cache[url].time < PAGE_TTL) return cache[url].html;
    const html = await requestText(url);
    cache[url] = { html, time: Date.now() };
    let bytes = 0;
    pageCache = Object.fromEntries(Object.entries(cache).filter(([, item]) => item && typeof item.html === 'string' && Date.now() - item.time < PAGE_TTL).sort((a, b) => b[1].time - a[1].time).slice(0, 12).filter(([, item]) => (bytes += item.html.length * 2) < 2000000));
    try { localStorage.setItem(PAGE_CACHE_KEY, JSON.stringify(pageCache)); } catch {}
    return html;
  }
  const iconPath = name => ({
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>',
    sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>',
    grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    list:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14"/></svg>',
    download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16"/></svg>',
    cinema:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3"/></svg>'
  }[name] || '');
  function makeIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = iconPath(name).replace(/^<svg\b[^>]*>|<\/svg>$/g, '');
    return svg;
  }
  function cardsFromHtml(html, base = location.href) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('.shortstory')].map(card => {
      const link = card.querySelector('.shortstoryHead a, .shortstoryFuter a[href*=".html"]');
      const image = card.querySelector('img');
      return link ? { name: A.clean(link.textContent), url: new URL(link.getAttribute('href'), base).href, poster: image?.getAttribute('src') ? new URL(image.getAttribute('src'), base).href : '', info: A.clean(card.querySelector('.shortstoryContent')?.textContent).slice(0, 220) } : null;
    }).filter(Boolean);
  }
  const host = document.createElement('div');
  host.id = 'vost-host';
  const root = host.attachShadow({ mode: 'open' });
  const app = document.createElement('main');
  app.id = 'vost-app';
  root.append(app);
  const style = document.createElement('style');
  style.textContent = await requestText(chrome.runtime.getURL('modules/vost-clean/content.css'), { credentials: 'omit' });
  root.prepend(style);

  function shell(content, active = '', options = {}) {
    const viewToggle = options.view ? '<button id="view-toggle" class="view-toggle" title="Переключить вид" aria-label="Переключить вид"></button>' : '';
    app.innerHTML = `<header><a class="brand" href="${location.origin}/">Vost Clean</a><nav aria-label="Основная навигация">
      <a class="${active === 'latest' ? 'active' : ''}" href="${location.origin}/">Последние</a>
      <a class="${active === 'schedule' ? 'active' : ''}" href="${location.origin}/?vost_view=schedule">Расписание</a>
      <a class="${active === 'catalog' ? 'active' : ''}" href="${location.origin}/?vost_view=catalog">Каталог</a>
    </nav><form id="search" role="search"><input name="story" aria-label="Найти тайтл" placeholder="Найти тайтл…" autocomplete="off"><button aria-label="Поиск"></button></form>${viewToggle}<button id="theme" class="theme" title="Сменить тему" aria-label="Сменить тему"></button></header><section class="content">${content}</section>`;
    root.querySelector('#search button').append(makeIcon('search'));
    root.querySelector('#search').addEventListener('submit', e => {
      e.preventDefault(); const value = String(new FormData(e.currentTarget).get('story') || '').trim();
      if (value) {
        const url = new URL('/index.php', location.origin);
        url.search = new URLSearchParams({ do: 'search', subaction: 'search', story: value });
        location.assign(url.href);
      }
    });
    const theme = root.querySelector('#theme');
    const current = localStorage.getItem('vost-theme') || 'dark';
    app.dataset.theme = current;
    theme.append(makeIcon(current === 'dark' ? 'sun' : 'moon'));
    theme.onclick = () => { const next = app.dataset.theme === 'dark' ? 'light' : 'dark'; app.dataset.theme = next; localStorage.setItem('vost-theme', next); theme.replaceChildren(makeIcon(next === 'dark' ? 'sun' : 'moon')); };
    if (options.view) {
      const toggle = root.querySelector('#view-toggle');
      const view = localStorage.getItem('vost-view') || 'grid';
      app.dataset.view = view;
      toggle.append(makeIcon(view === 'grid' ? 'list' : 'grid'));
      toggle.title = view === 'grid' ? 'Показать списком' : 'Показать сеткой';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.onclick = () => { const next = app.dataset.view === 'grid' ? 'list' : 'grid'; app.dataset.view = next; root.querySelector('.main-column').dataset.view = next; localStorage.setItem('vost-view', next); toggle.replaceChildren(makeIcon(next === 'grid' ? 'list' : 'grid')); toggle.title = next === 'grid' ? 'Показать списком' : 'Показать сеткой'; toggle.setAttribute('aria-label', toggle.title); };
    }
  }
  function titleCount(count) {
    const lastTwo = count % 100;
    const last = count % 10;
    const word = lastTwo >= 11 && lastTwo <= 14 ? 'тайтлов' : last === 1 ? 'тайтл' : last >= 2 && last <= 4 ? 'тайтла' : 'тайтлов';
    return `${count} ${word}`;
  }
  function cards(items) {
    return items.map(x => `<article class="card"><a class="card-link" title="${esc(x.name)}" href="${esc(x.url)}">${x.poster ? `<img loading="lazy" src="${esc(x.poster)}" alt="">` : '<div class="poster"></div>'}<div class="card-info"><strong title="${esc(x.name)}">${esc(x.name)}</strong><small title="${esc(x.info || '')}">${esc(x.info || '')}</small></div></a><div class="card-actions"><button type="button" class="card-download-all" data-download-latest="${esc(x.url)}" aria-label="Скачать последнюю серию: ${esc(x.name)}" title="Скачать последнюю серию"><span class="download-icon" aria-hidden="true"></span><span class="download-label">Последняя</span></button><button type="button" class="card-download-all" data-download-all="${esc(x.url)}" aria-label="Скачать все доступные серии: ${esc(x.name)}" title="Скачать все доступные серии"><span class="download-icon" aria-hidden="true"></span><span class="download-label">Все серии</span></button></div></article>`).join('');
  }
  async function episodeLinks(titleUrl, onlyLast = false) {
    const html = await getPage(titleUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = A.clean(doc.querySelector('#dle-content .shortstoryHead h1, h1')?.textContent || document.title).replace(/\s*\[[^\]]+\]\s*$/, '');
    const episodes = window.VostMedia.episodes(html);
    const links = [];
    const failures = [];
    for (const episode of onlyLast ? episodes.slice(-1) : episodes) {
      try {
        const urls = await episodeSources(episode);
        links.push({ url: await pickSource(urls), filename: episodeFile(heading, episode) });
      } catch { failures.push(episode.name); }
    }
    links.failures = failures;
    return links;
  }
  function listing() {
    const isSearch = location.search.includes('do=search');
    if (!isSearch && new URLSearchParams(location.search).get('vost_view') === 'schedule') {
      schedule();
      return;
    }
    const isCatalog = !isSearch && (new URLSearchParams(location.search).get('vost_view') === 'catalog' || (location.pathname !== '/' && !location.pathname.endsWith('/index.php')));
    const activeSection = isSearch ? '' : (isCatalog ? 'catalog' : 'latest');
    const latestMode = !isSearch && !isCatalog;
    const items = latestMode ? data.latest.map(item => { const card = data.cards.find(entry => entry.url === item.url); const meta = cachedMeta(item); return { ...item, poster: card?.poster || meta?.poster || cachedCover(item.url), date: card?.date || meta?.date || '', info: '' }; }) : data.cards;
    shell(`<section class="main-column listing-page"><div class="hero"><h1>${isSearch ? 'Результаты поиска' : (isCatalog ? 'Каталог' : 'Последние обновления')}</h1>${isSearch ? `<p>По запросу «${esc(new URLSearchParams(location.search).get('story') || '')}»</p>` : ''}</div>
      <div class="section-title"><span id="items-count">${titleCount(items.length)}</span>${latestMode ? '<div id="latest-actions"></div>' : ''}</div><div id="catalog-grid" class="grid">${items.map(item => cards([item])).join('')}</div><div id="catalog-status" class="catalog-status" role="status"></div></section>`, activeSection, { view: true });
    const view = localStorage.getItem('vost-view') || 'grid';
    root.querySelector('.main-column').dataset.view = view;
    root.querySelectorAll('.download-icon').forEach(element => element.replaceWith(makeIcon('download')));
    root.querySelector('.listing-page').addEventListener('click', async event => {
      const button = event.target.closest('[data-download-all], [data-download-latest]');
      if (!button) return;
      event.preventDefault(); event.stopPropagation();
      const label = button.querySelector('.download-label');
      const latest = button.hasAttribute('data-download-latest');
      button.disabled = true; label.textContent = 'Подготовка…';
      try {
        const links = await episodeLinks(button.dataset.downloadAll || button.dataset.downloadLatest, latest);
        if (!links.length) throw new Error('Серии не найдены');
        const result = latest
          ? await chrome.runtime.sendMessage({ type:'download', item:links[0] })
          : await chrome.runtime.sendMessage({ type:'downloadMany', items:links });
        if (!result?.accepted) throw new Error(result?.failures?.[0]?.error || 'Загрузка не создана');
        label.textContent = latest ? 'Принято' : `Принято: ${result.accepted}`;
        button.title = latest ? 'Последняя серия отправлена в загрузки' : `Принято: ${result.accepted}. Ошибок: ${(links.failures?.length || 0) + result.failures.length}`;
      } catch (error) { label.textContent = 'Ошибка'; button.title = error.message; }
      finally { setTimeout(() => { button.disabled = false; label.textContent = latest ? 'Последняя' : 'Все серии'; button.title = latest ? 'Скачать последнюю серию' : 'Скачать все доступные серии'; }, 2500); }
    });
    const grid = root.querySelector('#catalog-grid');
    if (latestMode) {
      const elements = [...grid.children];
      const groups = document.createElement('div');
      groups.className = 'date-groups';
      grid.replaceWith(groups);
      const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
      function dateKey(text) {
        const match = text.toLowerCase().match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/u);
        if (!match) return '';
        const month = months.findIndex(name => name.slice(0, 3) === match[2].slice(0, 3));
        if (month < 0) return '';
        const date = new Date(Number(match[3]), month, Number(match[1]));
        return date.getFullYear() === Number(match[3]) && date.getMonth() === month && date.getDate() === Number(match[1]) ? `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
      }
      items.forEach(item => { const card = data.cards.find(entry => entry.url === item.url); if (card && dateKey(card.date || '')) saveMeta(item, card.date, item.poster || ''); });
      function label(key) {
        if (!key) return 'Дата неизвестна';
        const [year, month, day] = key.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        if (date.getTime() === today.getTime()) return 'Сегодня';
        if (date.getTime() === yesterday.getTime()) return 'Вчера';
        return `${day} ${months[month - 1]} ${year}`;
      }
      function renderGroups() {
        const buckets = new Map();
        items.forEach((item, index) => { const key = dateKey(item.date || ''); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(elements[index]); });
        const fragment = document.createDocumentFragment();
        [...buckets.keys()].sort((a, b) => !a ? 1 : !b ? -1 : b.localeCompare(a)).forEach(key => {
          const section = document.createElement('section'); section.className = 'date-group';
          const heading = document.createElement('h2'); heading.textContent = label(key);
          const container = document.createElement('div'); container.className = 'grid';
          container.append(...buckets.get(key)); section.append(heading, container); fragment.append(section);
        });
        groups.replaceChildren(fragment);
      }
      const status = root.querySelector('#catalog-status');
      status.textContent = 'Загружаем даты обновлений…';
      let cursor = 0;
      let finished = false;
      let remainingDates = items.filter(item => !dateKey(item.date || '')).length;
      let resolveDates;
      const datesReady = new Promise(resolve => { resolveDates = resolve; });
      if (!remainingDates) resolveDates();
      async function loadDetails() {
        while (cursor < items.length) {
          const index = cursor++; const item = items[index];
          if (dateKey(item.date || '') && item.poster) continue;
          try {
            const url = new URL(item.url);
            if (url.origin !== location.origin) continue;
            const doc = new DOMParser().parseFromString(await requestText(url.href), 'text/html');
            const date = A.clean(doc.querySelector('#dle-content .staticInfoLeftData')?.textContent);
            const src = doc.querySelector('#dle-content .shortstoryContent img.imgRadius')?.getAttribute('src');
            const poster = src ? new URL(src, url.href).href : item.poster;
            if (dateKey(date)) saveMeta(item, date, poster || '');
            if (src && !item.poster) {
              item.poster = poster; saveCover(url.href, item.poster);
              const placeholder = elements[index].querySelector('.poster');
              if (placeholder) { const image = document.createElement('img'); image.src = item.poster; image.alt = ''; image.loading = 'lazy'; placeholder.replaceWith(image); }
            }
            if (dateKey(date) && !dateKey(item.date || '')) {
              if (!finished) item.date = date;
              if (--remainingDates === 0) resolveDates();
            }
          } catch { /* Keep the title in the undated group. */ }
        }
      }
      let timer;
      const timeout = new Promise(resolve => { timer = setTimeout(resolve, 5000); });
      const workers = Promise.all([loadDetails(), loadDetails()]);
      Promise.race([datesReady, workers, timeout]).then(() => {
        finished = true;
        clearTimeout(timer);
        renderGroups();
        status.textContent = '';
        if (remainingDates) {
          const refresh = document.createElement('button'); refresh.className = 'secondary';
          refresh.textContent = 'Обновить'; refresh.title = 'Обновить даты'; refresh.onclick = () => location.reload(); root.querySelector('#latest-actions').append(refresh);
        }
      });
      return;
    }
    const searchParams = new URLSearchParams(location.search);
    let currentPage = isSearch ? Math.max(1, Number(searchParams.get('search_start')) || 1) : Number(location.pathname.match(/\/page\/(\d+)\//)?.[1] || 1);
    const searchUrl = page => { const params = new URLSearchParams(searchParams); params.set('search_start', page); params.set('result_from', (page - 1) * 10 + 1); return `${location.origin}/index.php?${params}`; };
    let nextPage = data.pages.some(page => Number(page.name) === currentPage + 1) ? (isSearch ? searchUrl(currentPage + 1) : data.pages.find(page => Number(page.name) === currentPage + 1).url) : null;
    let loading = false;
    const sentinel = document.createElement('div'); sentinel.className = 'catalog-sentinel'; grid.after(sentinel);
    const loadPage = async () => {
      if (loading || !nextPage) return;
      loading = true; root.querySelector('#catalog-status').textContent = 'Загружаем ещё…';
      try {
        const pageUrl = nextPage;
        const html = await getPage(pageUrl);
        const newItems = cardsFromHtml(html, pageUrl);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        currentPage++;
        const next = [...doc.querySelectorAll('.block_4 a')].find(a => Number(a.textContent.trim()) === currentPage + 1 && (isSearch || a.getAttribute('href') !== '#'));
        nextPage = next ? (isSearch ? searchUrl(currentPage + 1) : new URL(next.getAttribute('href'), pageUrl).href) : null;
        const known = new Set([...grid.querySelectorAll('.card-link')].map(link => link.href));
        newItems.filter(item => !known.has(item.url)).forEach(item => grid.insertAdjacentHTML('beforeend', cards([item])));
        grid.querySelectorAll('.download-icon').forEach(element => element.replaceWith(makeIcon('download')));
        root.querySelector('#items-count').textContent = titleCount(grid.querySelectorAll('.card').length);
        root.querySelector('#catalog-status').textContent = nextPage ? '' : 'Больше тайтлов нет';
      } catch (error) { root.querySelector('#catalog-status').textContent = `${error.message}. Обновите страницу, чтобы повторить.`; } finally { loading = false; }
      if (nextPage && sentinel.getBoundingClientRect().top < innerHeight + 500 && !root.querySelector('#catalog-status').textContent) loadPage();
    };
    if (!latestMode) {
      const pageObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadPage(); }, { rootMargin: '500px' });
      pageObserver.observe(sentinel);
    } else {
      sentinel.remove();
    }
    const sidebar = root.querySelector('.listing-page');
    if (latestMode && sidebar) {
      const pending = [];
      let active = 0;
      const loadNext = () => {
        while (active < 2 && pending.length) {
          const placeholder = pending.shift();
          if (!placeholder.isConnected) continue;
          const url = new URL(placeholder.closest('a').href);
          if (url.origin !== location.origin) continue;
          active++;
          fetch(`${url.href}${url.search ? '&' : '?'}vost_cover=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }).then(response => {
            if (!response.ok) throw new Error('Poster unavailable');
            return response.text();
          }).then(html => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const src = doc.querySelector('#dle-content .shortstoryContent img.imgRadius')?.getAttribute('src');
            if (!src || !placeholder.isConnected) return;
            const image = document.createElement('img');
            image.alt = ''; image.loading = 'lazy';
            image.src = new URL(src, url.href).href;
            saveCover(url.href, image.src);
            placeholder.replaceWith(image);
          }).catch(() => {}).finally(() => { active--; loadNext(); });
        }
      };
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          pending.push(entry.target);
        }
        loadNext();
      }, { rootMargin: '200px' });
      sidebar.querySelectorAll('.poster').forEach(element => observer.observe(element));
    }
  }
  function schedule() {
    const days = data.schedule;
    const hasEntries = days.some(day => day.items.length);
    const today = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Moscow' }).format(new Date());
    const todayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(today);
    shell(`<section class="main-column schedule-page"><div class="hero"><h1>Расписание</h1><p>Примерное время выхода серий в озвучке AnimeVost, московское время.</p></div>${hasEntries ? days.map((day, index) => `<section class="date-group schedule-day${index === todayIndex ? ' schedule-today' : ''}"><h2>${esc(day.name)}${index === todayIndex ? ' <span class="today-badge">Сегодня</span>' : ''}</h2>${day.items.length ? `<div class="schedule-list">${day.items.map(item => `<a class="schedule-item" href="${esc(item.url)}"><span>${esc(item.name)}</span>${item.time ? `<span class="schedule-time">${esc(item.time)}</span>` : ''}</a>`).join('')}</div>` : '<p class="schedule-empty">Нет данных</p>'}</section>`).join('') : '<p class="empty">Расписание недоступно. Попробуйте обновить страницу позже.</p>'}</section>`, 'schedule');
  }
  function title() {
    const x = data;
    const headingMeta = [x.type, x.year].filter(Boolean).map(esc).join(' · ');
    const titleMeta = [x.genre, x.count].filter(Boolean).map(esc).join(' · ');
    shell(`<article class="title"><div class="title-head">${x.poster ? `<img src="${esc(x.poster)}" alt="${esc(x.name)}">` : ''}<div>${headingMeta ? `<p class="eyebrow">${headingMeta}</p>` : ''}<h1 title="${esc(x.name)}">${esc(x.name)}</h1>${titleMeta ? `<p class="title-meta">${titleMeta}</p>` : ''}<p>${esc(x.description)}</p></div></div>
      <div class="watch-layout"><section class="player-column"><div id="player"></div></section><aside class="episode-panel"><div class="episode-panel-head"><h2>Серии</h2><div class="episode-controls"><button id="cinema" class="secondary" title="Режим кинотеатра"><span>Кинотеатр</span></button><button id="toggle-episodes" class="secondary" title="Скрыть список серий"><span>Скрыть</span></button></div></div><div class="episodes">${x.episodes.map((e, i) => `<div class="episode" data-watch="${i}" role="button" tabindex="0" aria-label="Смотреть ${esc(e.name)}" aria-pressed="false"><span title="${esc(e.name)}">${esc(e.name)}</span><button class="download-episode" data-episode="${i}" title="Скачать ${esc(e.name)}"><span class="download-icon" aria-hidden="true"></span></button></div>`).join('')}</div><button id="download-all" class="secondary download-all"><span>Скачать всё</span></button></aside></div>
      <section class="screenshots" aria-labelledby="screenshots-title" hidden><div class="screenshots-head"><h2 id="screenshots-title">Кадры из аниме</h2><span>Листайте галерею</span></div><div class="screenshots-track">${x.screenshots.map(image => `<a class="screenshot" href="${esc(image.src)}" target="_blank" rel="noopener" aria-label="Открыть кадр: ${esc(image.label)}"><img src="${esc(image.src)}" alt="${esc(image.alt)}"><span>${esc(image.label)}</span></a>`).join('')}</div></section></article>`);
    root.querySelector('#cinema').prepend(makeIcon('cinema'));
    root.querySelector('#toggle-episodes').prepend(makeIcon('list'));
    root.querySelector('#download-all').prepend(makeIcon('download'));
    root.querySelectorAll('.download-icon').forEach(element => element.replaceWith(makeIcon('download')));
    const screenshots = root.querySelector('.screenshots');
    screenshots.querySelectorAll('img').forEach(image => {
      const update = () => {
        if (image.naturalWidth) screenshots.hidden = false;
        else image.closest('.screenshot')?.remove();
      };
      image.addEventListener('load', update, { once: true });
      image.addEventListener('error', update, { once: true });
      if (image.complete) update();
    });
    const screenshotsTrack = screenshots.querySelector('.screenshots-track');
    screenshotsTrack.addEventListener('wheel', event => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const maxScroll = screenshotsTrack.scrollWidth - screenshotsTrack.clientWidth;
      if (maxScroll <= 0) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * screenshotsTrack.clientWidth : event.deltaY;
      const next = Math.max(0, Math.min(maxScroll, screenshotsTrack.scrollLeft + delta));
      screenshotsTrack.scrollLeft = next;
    }, { passive: false });
    const resolve = async (episode) => ({
      urls: await episodeSources(episode),
      name: `${x.name} - ${episodeNumber(episode).padStart(2, '0')}`
    });
    root.querySelectorAll('[data-episode]').forEach(btn => btn.onclick = async event => { event.stopPropagation(); try { const item = await resolve(x.episodes[Number(btn.dataset.episode)]); const result = await chrome.runtime.sendMessage({ type: 'download', item: { url: await pickSource(item.urls), filename: `${safe(x.name)}/${safe(item.name)}.mp4` } }); if (!result?.accepted) throw new Error(result?.failures?.[0]?.error || 'Загрузка не создана'); btn.textContent = '✓'; btn.title = 'Отправлено в загрузки'; } catch (e) { alert(e.message); } });
    let playerRequest = 0;
    const titleId = location.pathname.match(/\/(\d+)-[^/]+\.html$/)?.[1] || location.pathname;
    const progressKey = `vost-progress:${titleId}`;
    const player = root.querySelector('#player');
    async function showEpisode(index) {
      const episode = x.episodes[index];
      if (!episode) return;
      const request = ++playerRequest;
      chrome.storage.local.set({ [progressKey]: { episodeId: episode.id, updatedAt: Date.now() } }).catch(error => console.warn('Vost Clean: не удалось сохранить серию', error));
      root.querySelectorAll('[data-watch]').forEach(button => {
        const selected = Number(button.dataset.watch) === index;
        button.closest('.episode').classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      player.innerHTML = '<div class="player-placeholder" role="status">Загружаем плеер…</div>';
      try {
        const item = await resolve(episode);
        if (request !== playerRequest) return;
        const candidates = [...new Set(item.urls.map(withoutDownloadFlag).filter(Boolean))];
        if (!candidates.length) throw new Error('Рабочая ссылка на видео не найдена');
        const first = await pickSource(candidates);
        if (request !== playerRequest) return;
        const ordered = [first, ...candidates.filter(url => url !== first)];
        player.innerHTML = `<video controls playsinline preload="metadata" src="${esc(ordered[0])}"></video>`;
        const video = player.querySelector('video');
        let attempt = 0;
        let watchdog = setTimeout(advance, 15000);
        function advance() {
          clearTimeout(watchdog);
          if (request !== playerRequest) return;
          if (++attempt < ordered.length) {
            video.src = ordered[attempt];
            video.load();
            watchdog = setTimeout(advance, 15000);
            return;
          }
          player.innerHTML = `<div class="player-placeholder" role="alert">Видео недоступно. Попробуйте повторить, другую сеть или штатный плеер сайта. <button type="button" id="player-retry" class="secondary">Повторить</button></div>`;
          player.querySelector('#player-retry').onclick = () => showEpisode(index);
        }
        video.addEventListener('error', advance);
        video.addEventListener('loadeddata', () => clearTimeout(watchdog), { once: true });
      } catch (error) {
        if (request === playerRequest) {
          player.innerHTML = `<div class="player-placeholder" role="alert">Не удалось загрузить серию: ${esc(error.message)} <button type="button" id="player-retry" class="secondary">Повторить</button></div>`;
          player.querySelector('#player-retry').onclick = () => showEpisode(index);
        }
      }
    }
    root.querySelectorAll('.episode[data-watch]').forEach(card => {
      card.onclick = () => showEpisode(Number(card.dataset.watch));
      card.onkeydown = event => { if (event.target === card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showEpisode(Number(card.dataset.watch)); } };
    });
    if (x.episodes.length) {
      player.innerHTML = '<div class="player-placeholder" role="status">Восстанавливаем последнюю серию…</div>';
      chrome.storage.local.get(progressKey).then(saved => {
        if (playerRequest) return;
        const index = x.episodes.findIndex(episode => episode.id === saved[progressKey]?.episodeId);
        showEpisode(index >= 0 ? index : 0);
        requestAnimationFrame(() => {
          const list = root.querySelector('.episodes');
          const selected = list.querySelector('.selected');
          if (selected) list.scrollTop = selected.offsetTop - list.offsetTop;
        });
      }).catch(() => { if (!playerRequest) showEpisode(0); });
    } else player.innerHTML = '<div class="player-placeholder">Список серий недоступен.</div>';
    root.querySelector('#download-all').onclick = async () => {
      if (!x.episodes.length || !confirm(`Скачать серий: ${x.episodes.length}?`)) return;
      const button = root.querySelector('#download-all'); button.disabled = true;
      const items = []; const failures = [];
      try {
        for (const episode of x.episodes) {
          button.textContent = `Подготовка ${items.length + failures.length + 1}/${x.episodes.length}`;
          try { const item = await resolve(episode); items.push({ url: await pickSource(item.urls), filename: `${safe(x.name)}/${safe(item.name)}.mp4` }); }
          catch { failures.push(episode.name); }
        }
        const result = await chrome.runtime.sendMessage({ type: 'downloadMany', items });
        button.textContent = `Принято: ${result.accepted}`;
        button.title = `Ошибок: ${failures.length + result.failures.length}`;
      } catch (error) { button.textContent = 'Повторить загрузку'; button.title = error.message; }
      finally { button.disabled = false; }
    };
    root.querySelector('#toggle-episodes').onclick = () => { const panel = root.querySelector('.episode-panel'); const hidden = panel.classList.toggle('collapsed'); root.querySelector('#toggle-episodes span').textContent = hidden ? 'Показать серии' : 'Скрыть'; root.querySelector('#toggle-episodes').title = hidden ? 'Показать список серий' : 'Скрыть список серий'; };
    const episodeRail = root.querySelector('.episode-panel .episodes');
    episodeRail.addEventListener('wheel', event => {
      if (!app.classList.contains('cinema-mode') || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const maxScroll = episodeRail.scrollWidth - episodeRail.clientWidth;
      if (maxScroll <= 0) return;
      const next = Math.max(0, Math.min(maxScroll, episodeRail.scrollLeft + event.deltaY));
      if (next === episodeRail.scrollLeft) return;
      event.preventDefault();
      episodeRail.scrollLeft = next;
    }, { passive: false });
    let hideTimer;
    const panel = root.querySelector('.episode-panel');
    function revealCinemaControls() {
      if (!app.classList.contains('cinema-mode')) return;
      app.classList.remove('cinema-idle');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!panel.matches(':hover') && !panel.contains(root.activeElement)) app.classList.add('cinema-idle');
      }, 2500);
    }
    document.addEventListener('pointermove', revealCinemaControls);
    document.addEventListener('pointerdown', revealCinemaControls);
    root.addEventListener('focusin', revealCinemaControls);
    panel.addEventListener('pointerleave', revealCinemaControls);
    panel.addEventListener('focusout', revealCinemaControls);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && app.classList.contains('cinema-mode')) root.querySelector('#cinema').click();
    });
    root.querySelector('#cinema').onclick = () => {
      const active = app.classList.toggle('cinema-mode');
      root.querySelector('#cinema').querySelector('span:last-child').textContent = active ? 'Выйти' : 'Кинотеатр';
      document.documentElement.classList.toggle('vost-cinema-open', active);
      if (active) revealCinemaControls();
      else { clearTimeout(hideTimer); app.classList.remove('cinema-idle'); }
    };
  }
  function safe(s) { return s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150); }
  type === 'title' ? title() : listing();
  document.body.replaceChildren(host);
  document.documentElement.classList.add('vost-active');
  document.documentElement.classList.remove('vost-loading', 'vost-loading-light');
  window.vostStarting = false;
  } catch (error) {
    document.documentElement.classList.remove('vost-loading', 'vost-loading-light');
    window.vostStarting = false;
    console.error('Vost Clean: не удалось загрузить интерфейс', error?.stack || error?.message || error);
  }
})();
