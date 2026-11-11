(() => {
  const A = window.VostAdapter;
  const type = A.currentType();
  const data = type === 'title' ? A.title() : { latest: A.latest(), cards: A.cards(), pages: A.pages() };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const COVER_CACHE_KEY = 'vost-cover-cache-v1';
  const COVER_TTL = 24 * 60 * 60 * 1000;
  let coverCache;
  function readCoverCache() { if (coverCache) return coverCache; try { coverCache = JSON.parse(localStorage.getItem(COVER_CACHE_KEY) || '{}'); } catch { coverCache = {}; } return coverCache; }
  function cachedCover(url) { const item = readCoverCache()[url]; return item && Date.now() - item.time < COVER_TTL ? item.src : ''; }
  function saveCover(url, src) { try { const cache = readCoverCache(); cache[url] = { src, time: Date.now() }; const fresh = Object.fromEntries(Object.entries(cache).filter(([, item]) => Date.now() - item.time < COVER_TTL)); coverCache = fresh; localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(fresh)); } catch {} }
  const PAGE_CACHE_KEY = 'vost-page-cache-v1';
  const PAGE_TTL = 15 * 60 * 1000;
  let pageCache;
  function readPageCache() { if (pageCache) return pageCache; try { pageCache = JSON.parse(localStorage.getItem(PAGE_CACHE_KEY) || '{}'); } catch { pageCache = {}; } return pageCache; }
  async function getPage(url) {
    const cache = readPageCache();
    if (cache[url] && Date.now() - cache[url].time < PAGE_TTL) return cache[url].html;
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}vost_page=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Не удалось загрузить страницу каталога');
    const html = await response.text();
    try { cache[url] = { html, time: Date.now() }; pageCache = Object.fromEntries(Object.entries(cache).filter(([, item]) => Date.now() - item.time < PAGE_TTL)); localStorage.setItem(PAGE_CACHE_KEY, JSON.stringify(pageCache)); } catch {}
    return html;
  }
  const icon = name => ({
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>',
    sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>',
    grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    list:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14"/></svg>',
    download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16"/></svg>'
  }[name] || '');
  function cardsFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('.shortstory')].map(card => {
      const link = card.querySelector('.shortstoryHead a, .shortstoryFuter a[href*=".html"]');
      const image = card.querySelector('img');
      return link ? { name: A.clean(link.textContent), url: new URL(link.href, location.href).href, poster: image?.src ? new URL(image.src, location.href).href : '', info: A.clean(card.querySelector('.shortstoryContent')?.textContent).slice(0, 220) } : null;
    }).filter(Boolean);
  }
  const host = document.createElement('div');
  host.id = 'vost-clean-host';
  const root = host.attachShadow({ mode: 'open' });
  const app = document.createElement('main');
  app.id = 'vost-app';
  root.append(app);
  document.body.replaceChildren(host);
  fetch(chrome.runtime.getURL('content/content.css')).then(r => r.text()).then(css => {
    const style = document.createElement('style'); style.textContent = css; root.prepend(style);
  });

  function shell(content, active = '', options = {}) {
    const viewToggle = options.view ? `<button id="view-toggle" class="view-toggle" title="Переключить вид" aria-label="Переключить вид"><span aria-hidden="true">${icon('list')}</span></button>` : '';
    app.innerHTML = `<header><a class="brand" href="${location.origin}/">VOST<span>CLEAN</span></a><nav>
      <a class="${active === 'latest' ? 'active' : ''}" href="${location.origin}/">Последние</a>
      <a class="${active === 'catalog' ? 'active' : ''}" href="${location.origin}/page/2/">Каталог</a>
    </nav><form id="search"><input name="story" placeholder="Найти тайтл…" autocomplete="off"><button aria-label="Поиск">${icon('search')}</button></form>${viewToggle}<button id="theme" class="theme" title="Сменить тему" aria-label="Сменить тему"><span aria-hidden="true">${icon('sun')}</span></button></header><section class="content">${content}</section>`;
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
    theme.querySelector('span').textContent = current === 'dark' ? icon('sun') : icon('moon');
    theme.onclick = () => { const next = app.dataset.theme === 'dark' ? 'light' : 'dark'; app.dataset.theme = next; localStorage.setItem('vost-theme', next); theme.querySelector('span').textContent = next === 'dark' ? icon('sun') : icon('moon'); };
    if (options.view) {
      const toggle = root.querySelector('#view-toggle');
      const view = localStorage.getItem('vost-view') || 'grid';
      app.dataset.view = view;
      toggle.querySelector('span').textContent = view === 'grid' ? icon('list') : icon('grid');
      toggle.title = view === 'grid' ? 'Показать списком' : 'Показать сеткой';
      toggle.onclick = () => { const next = app.dataset.view === 'grid' ? 'list' : 'grid'; app.dataset.view = next; root.querySelector('.main-column').dataset.view = next; localStorage.setItem('vost-view', next); toggle.querySelector('span').textContent = next === 'grid' ? icon('list') : icon('grid'); toggle.title = next === 'grid' ? 'Показать списком' : 'Показать сеткой'; };
    }
  }
  function cards(items) {
    return items.map(x => `<a class="card" title="${esc(x.name)}" href="${esc(x.url)}">${x.poster ? `<img loading="lazy" src="${esc(x.poster)}" alt="${esc(x.name)}">` : '<div class="poster"></div>'}<div><strong title="${esc(x.name)}">${esc(x.name)}</strong><small title="${esc(x.info || '')}">${esc(x.info || '')}</small><button class="card-download-all" data-download-all="${esc(x.url)}" title="Скачать все доступные серии">${icon('download')}<span>Все серии</span></button></div></a>`).join('');
  }
  async function episodeLinks(titleUrl) {
    const html = await getPage(titleUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = A.clean(doc.querySelector('#dle-content .shortstoryHead h1, h1')?.textContent || document.title).replace(/\s*\[[^\]]+\]\s*$/, '');
    const episodes = [];
    for (const script of doc.scripts) {
      const match = script.textContent.match(/var data\s*=\s*\{([\s\S]*?)\};/);
      if (!match) continue;
      for (const item of match[1].matchAll(/"([^"\n]+)"\s*:\s*"?(\d+)"?/g)) episodes.push({ name:item[1], id:item[2] });
    }
    const links = [];
    for (const episode of episodes) {
      const frame = await fetch(`${location.origin}/frame5.php?play=${episode.id}&old=1`, { credentials:'include', cache:'no-store' });
      const frameDoc = new DOMParser().parseFromString(await frame.text(), 'text/html');
      const url = [...frameDoc.querySelectorAll('a[download][href*=".mp4"]')].map(a => a.href).find(url => /720\//.test(url)) || [...frameDoc.querySelectorAll('a[download][href*=".mp4"]')].map(a => a.href)[0];
      if (url) links.push({ url, filename: `${safe(heading)}/${safe(`${heading} - ${episode.name.replace(/[^\d]+/, '').padStart(2, '0')}`)}.mp4` });
    }
    return links;
  }
  function listing() {
    const isSearch = location.search.includes('do=search');
    const isCatalog = !isSearch && location.pathname !== '/' && !location.pathname.endsWith('/index.php');
    const activeSection = isSearch ? '' : (isCatalog ? 'catalog' : 'latest');
    const latestMode = !isSearch && !isCatalog;
    const items = latestMode ? data.latest.map(item => ({ ...item, poster: data.cards.find(card => card.url === item.url)?.poster || cachedCover(item.url), info: '' })) : data.cards;
    shell(`<section class="main-column listing-page"><div class="hero"><h1>${isSearch ? 'Результаты поиска' : (isCatalog ? 'Каталог' : 'Последние')}</h1>${isSearch ? `<p>По запросу «${esc(new URLSearchParams(location.search).get('story') || '')}»</p>` : ''}</div>
      <div class="section-title"><h2>${isSearch ? 'Найденные тайтлы' : (isCatalog ? 'Каталог' : 'Последние обновления')}</h2><span id="items-count">${items.length} тайтлов</span></div><div id="catalog-grid" class="grid">${items.map(item => cards([item])).join('')}</div><div id="catalog-status" class="catalog-status" role="status"></div></section>`, activeSection, { view: true });
    const view = localStorage.getItem('vost-view') || 'grid';
    root.querySelector('.main-column').dataset.view = view;
    root.querySelectorAll('[data-download-all]').forEach(button => button.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation();
      const original = button.textContent; button.disabled = true; button.textContent = 'Загрузка…';
      try {
        const links = await episodeLinks(button.dataset.downloadAll);
        if (!links.length) throw new Error('Серии не найдены');
        await chrome.runtime.sendMessage({ type:'downloadMany', items:links });
        button.textContent = `✓ ${links.length}`;
      } catch (error) { button.textContent = 'Ошибка'; button.title = error.message; }
      finally { setTimeout(() => { button.disabled = false; if (button.textContent === 'Ошибка') button.textContent = original; }, 2500); }
    }));
    const grid = root.querySelector('#catalog-grid');
    let currentPage = Number(location.pathname.match(/\/page\/(\d+)\//)?.[1] || 1);
    let nextPage = data.pages.find(page => Number(page.name) === currentPage + 1)?.url || null;
    let loading = false;
    const sentinel = document.createElement('div'); sentinel.className = 'catalog-sentinel'; grid.after(sentinel);
    const loadPage = async () => {
      if (loading || !nextPage) return;
      loading = true; root.querySelector('#catalog-status').textContent = 'Загружаем ещё…';
      try {
        const html = await getPage(nextPage);
        const newItems = cardsFromHtml(html);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        currentPage++;
        const next = [...doc.querySelectorAll('.block_4 a')].find(a => Number(a.textContent.trim()) === currentPage + 1 && a.getAttribute('href') !== '#');
        nextPage = next ? new URL(next.getAttribute('href'), location.href).href : null;
        const known = new Set([...grid.querySelectorAll('.card')].map(card => card.href));
        newItems.filter(item => !known.has(item.url)).forEach(item => grid.insertAdjacentHTML('beforeend', cards([item])));
        root.querySelector('#items-count').textContent = `${grid.querySelectorAll('.card').length} тайтлов`;
        root.querySelector('#catalog-status').textContent = nextPage ? '' : 'Больше тайтлов нет';
      } catch (error) { root.querySelector('#catalog-status').textContent = `${error.message}. Обновите страницу, чтобы повторить.`; } finally { loading = false; }
      if (nextPage && sentinel.getBoundingClientRect().top < innerHeight + 500 && !root.querySelector('#catalog-status').textContent) loadPage();
    };
    if (!latestMode && !isSearch) {
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
  function title() {
    const x = data;
    shell(`<article class="title"><div class="title-head">${x.poster ? `<img src="${esc(x.poster)}">` : ''}<div><p class="eyebrow">${esc(x.type)} · ${esc(x.year)}</p><h1>${esc(x.name)}</h1><p class="muted">${esc(x.genre)} · ${esc(x.count)}</p><p>${esc(x.description)}</p></div></div>
      <div class="watch-layout"><section class="player-column"><div id="player"></div></section><aside class="episode-panel"><div class="episode-panel-head"><h2>Серии</h2><div class="episode-controls"><button id="cinema" class="secondary">Кинотеатр</button><button id="toggle-episodes" class="secondary" title="Скрыть список серий">Скрыть</button></div></div><div class="episodes">${x.episodes.map((e, i) => `<div class="episode" data-watch="${i}" role="button" tabindex="0" aria-label="Смотреть ${esc(e.name)}" aria-pressed="false"><span title="${esc(e.name)}">${esc(e.name)}</span><button class="download-episode" data-episode="${i}" title="Скачать ${esc(e.name)}">↓</button></div>`).join('')}</div><button id="download-all" class="secondary download-all">Скачать всё</button></aside></div></article>`);
    const resolve = async (episode) => {
      // getlink.php отдаёт устаревший roomfish URL. Штатный frame5 выбирает актуальный сервер.
      const response = await fetch(`${location.origin}/frame5.php?play=${episode.id}&old=1`, { credentials: 'include' });
      if (!response.ok) throw new Error('Сайт не предоставил плеер серии');
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const links = [...doc.querySelectorAll('a[download][href*=".mp4"]')].map(a => a.href);
      const url = links.find(x => /720\//.test(x)) || links.find(x => /\.mp4/.test(x));
      if (!url) throw new Error('Рабочая ссылка на видео не найдена');
      return { url, name: `${x.name} - ${episode.name.replace(/[^\d]+/, '').padStart(2, '0')}` };
    };
    root.querySelectorAll('[data-episode]').forEach(btn => btn.onclick = async event => { event.stopPropagation(); try { const item = await resolve(x.episodes[btn.dataset.episode]); await chrome.runtime.sendMessage({ type: 'download', item: { url: item.url, filename: `${safe(x.name)}/${safe(item.name)}.mp4` } }); btn.textContent = '✓'; btn.title = 'Отправлено в загрузки'; } catch (e) { alert(e.message); } });
    let playerRequest = 0;
    const player = root.querySelector('#player');
    async function showEpisode(index) {
      const request = ++playerRequest;
      root.querySelectorAll('[data-watch]').forEach(button => {
        const selected = Number(button.dataset.watch) === index;
        button.closest('.episode').classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      player.innerHTML = '<div class="player-placeholder" role="status">Загружаем плеер…</div>';
      try {
        const item = await resolve(x.episodes[index]);
        if (request !== playerRequest) return;
        const url = new URL(item.url);
        url.searchParams.delete('d');
        player.innerHTML = `<video controls playsinline preload="metadata" src="${esc(url.href)}"></video><p class="muted" id="player-error" hidden>Видео недоступно. Попробуйте другую сеть или штатный плеер сайта.</p>`;
        player.querySelector('video').addEventListener('error', () => { player.querySelector('#player-error').hidden = false; });
      } catch (error) {
        if (request === playerRequest) player.innerHTML = `<div class="player-placeholder" role="alert">Не удалось загрузить серию: ${esc(error.message)}</div>`;
      }
    }
    root.querySelectorAll('.episode[data-watch]').forEach(card => {
      card.onclick = () => showEpisode(Number(card.dataset.watch));
      card.onkeydown = event => { if (event.target === card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showEpisode(Number(card.dataset.watch)); } };
    });
    if (x.episodes.length) showEpisode(0);
    else player.innerHTML = '<div class="player-placeholder">Список серий недоступен.</div>';
    root.querySelector('#download-all').onclick = async () => { if (!x.episodes.length || !confirm(`Скачать серий: ${x.episodes.length}?`)) return; try { const items = []; for (const e of x.episodes) { const item = await resolve(e); items.push({ url: item.url, filename: `${safe(x.name)}/${safe(item.name)}.mp4` }); } await chrome.runtime.sendMessage({ type: 'downloadMany', items }); root.querySelector('#download-all').textContent = 'Отправлено в загрузки'; } catch (e) { alert(e.message); } };
    root.querySelector('#toggle-episodes').onclick = () => { const panel = root.querySelector('.episode-panel'); const hidden = panel.classList.toggle('collapsed'); root.querySelector('#toggle-episodes').textContent = hidden ? 'Показать серии' : 'Скрыть'; root.querySelector('#toggle-episodes').title = hidden ? 'Показать список серий' : 'Скрыть список серий'; };
    const episodeRail = root.querySelector('.episode-panel .episodes');
    episodeRail.addEventListener('wheel', event => {
      if (!app.classList.contains('cinema-mode') || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
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
    root.querySelector('#cinema').onclick = () => {
      const active = app.classList.toggle('cinema-mode');
      root.querySelector('#cinema').textContent = active ? 'Выйти' : 'Кинотеатр';
      document.documentElement.classList.toggle('vost-cinema-open', active);
      if (active) revealCinemaControls();
      else { clearTimeout(hideTimer); app.classList.remove('cinema-idle'); }
    };
  }
  function safe(s) { return s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150); }
  type === 'title' ? title() : listing();
})();
