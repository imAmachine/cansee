(() => {
  const A = window.VostAdapter;
  const type = A.currentType();
  const data = type === 'title' ? A.title() : { latest: A.latest(), cards: A.cards(), pages: A.pages() };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const COVER_CACHE_KEY = 'vost-cover-cache-v1';
  const COVER_TTL = 24 * 60 * 60 * 1000;
  function readCoverCache() { try { return JSON.parse(localStorage.getItem(COVER_CACHE_KEY) || '{}'); } catch { return {}; } }
  function cachedCover(url) { const item = readCoverCache()[url]; return item && Date.now() - item.time < COVER_TTL ? item.src : ''; }
  function saveCover(url, src) { try { const cache = readCoverCache(); cache[url] = { src, time: Date.now() }; localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(cache)); } catch {} }
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

  function shell(content, active = '') {
    app.innerHTML = `<header><a class="brand" href="${location.origin}/">VOST<span>CLEAN</span></a><nav>
      <a class="${active === 'latest' ? 'active' : ''}" href="${location.origin}/">Последние</a>
      <a class="${active === 'catalog' ? 'active' : ''}" href="${location.origin}/page/2/">Каталог</a>
    </nav><form id="search"><input name="story" placeholder="Найти тайтл…" autocomplete="off"><button>Поиск</button></form><button id="theme" class="theme" title="Сменить тему">☀</button></header><section class="content">${content}</section>`;
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
    theme.textContent = current === 'dark' ? '☀' : '☾';
    theme.onclick = () => { const next = app.dataset.theme === 'dark' ? 'light' : 'dark'; app.dataset.theme = next; localStorage.setItem('vost-theme', next); theme.textContent = next === 'dark' ? '☀' : '☾'; };
  }
  function cards(items) {
    return `<div class="grid">${items.map(x => `<a class="card" title="${esc(x.name)}" href="${esc(x.url)}">${x.poster ? `<img loading="lazy" src="${esc(x.poster)}" alt="${esc(x.name)}">` : '<div class="poster"></div>'}<div><strong title="${esc(x.name)}">${esc(x.name)}</strong><small title="${esc(x.info || '')}">${esc(x.info || '')}</small></div></a>`).join('')}</div>`;
  }
  function listing() {
    const latest = data.latest.map(item => ({ ...item, poster: data.cards.find(card => card.url === item.url)?.poster || cachedCover(item.url) })); const items = data.cards;
    const isSearch = location.search.includes('do=search');
    const recent = latest.length ? `<aside class="sidebar"><details open><summary>Последние обновления <span>${latest.length}</span></summary><div class="latest">${latest.map((x, i) => `<a class="latest-item" title="${esc(x.name)}" href="${esc(x.url)}">${x.poster ? `<img class="latest-backdrop" src="${esc(x.poster)}" alt="" aria-hidden="true"><img class="latest-poster" src="${esc(x.poster)}" alt="" loading="lazy">` : '<span class="latest-poster placeholder" aria-hidden="true"></span>'}<span class="latest-index">${String(i + 1).padStart(2, '0')}</span><span class="latest-name">${esc(x.name)}</span></a>`).join('')}</div></details></aside>` : '';
    shell(`<div class="layout">${recent}<section class="main-column"><div class="hero"><p class="eyebrow">ANIMEVOST / CLEAN CLIENT</p><h1>${isSearch ? 'Результаты поиска' : 'Аниме без лишнего шума'}</h1><p>${isSearch ? `По запросу «${esc(new URLSearchParams(location.search).get('story') || '')}»` : 'Каталог, последние обновления и быстрый доступ к сериям.'}</p></div>
      <div class="section-title"><h2>${isSearch ? 'Найденные тайтлы' : 'Каталог'}</h2><span>${items.length} на странице</span></div>${items.length ? cards(items) : '<div class="empty">Ничего не найдено. Проверьте запрос и попробуйте ещё раз.</div>'}<div class="pages">${data.pages.map(x => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join('')}</div></section></div>`, isSearch ? '' : 'latest');
    const sidebar = root.querySelector('.sidebar .latest');
    if (sidebar) {
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
            image.className = 'latest-poster'; image.alt = ''; image.loading = 'lazy';
            image.src = new URL(src, url.href).href;
            saveCover(url.href, image.src);
            const link = placeholder.closest('a');
            const backdrop = document.createElement('img'); backdrop.className = 'latest-backdrop'; backdrop.alt = ''; backdrop.setAttribute('aria-hidden', 'true'); backdrop.src = image.src;
            link.insertBefore(backdrop, link.firstChild);
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
      }, { root: sidebar, rootMargin: '0px' });
      sidebar.querySelectorAll('.latest-poster.placeholder').forEach(element => observer.observe(element));
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
