(() => {
  const A = window.VostAdapter;
  const type = A.currentType();
  const data = type === 'title' ? A.title() : { latest: A.latest(), cards: A.cards(), pages: A.pages() };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
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
    const latest = data.latest; const items = data.cards;
    const isSearch = location.search.includes('do=search');
    const recent = latest.length ? `<aside class="sidebar"><details open><summary>Последние обновления <span>${latest.length}</span></summary><div class="latest">${latest.map((x, i) => `<a class="latest-item" title="${esc(x.name)}" href="${esc(x.url)}"><b>${String(i + 1).padStart(2, '0')}</b><span>${esc(x.name)}</span></a>`).join('')}</div></details></aside>` : '';
    shell(`<div class="layout">${recent}<section class="main-column"><div class="hero"><p class="eyebrow">ANIMEVOST / CLEAN CLIENT</p><h1>${isSearch ? 'Результаты поиска' : 'Аниме без лишнего шума'}</h1><p>${isSearch ? `По запросу «${esc(new URLSearchParams(location.search).get('story') || '')}»` : 'Каталог, последние обновления и быстрый доступ к сериям.'}</p></div>
      <div class="section-title"><h2>${isSearch ? 'Найденные тайтлы' : 'Каталог'}</h2><span>${items.length} на странице</span></div>${items.length ? cards(items) : '<div class="empty">Ничего не найдено. Проверьте запрос и попробуйте ещё раз.</div>'}<div class="pages">${data.pages.map(x => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join('')}</div></section></div>`, isSearch ? '' : 'latest');
  }
  function title() {
    const x = data;
    shell(`<article class="title"><div class="title-head">${x.poster ? `<img src="${esc(x.poster)}">` : ''}<div><p class="eyebrow">${esc(x.type)} · ${esc(x.year)}</p><h1>${esc(x.name)}</h1><p class="muted">${esc(x.genre)} · ${esc(x.count)}</p><p>${esc(x.description)}</p></div></div>
      <div id="player"></div><div class="section-title episode-heading"><h2>Серии</h2><button id="download-all" class="secondary">Скачать всё</button></div><div class="episodes">${x.episodes.map((e, i) => `<div class="episode"><span title="${esc(e.name)}">${esc(e.name)}</span><button data-episode="${i}" title="Скачать ${esc(e.name)}">↓</button><button class="watch" data-watch="${i}" title="Смотреть ${esc(e.name)}">▶</button></div>`).join('')}</div></article>`);
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
    root.querySelectorAll('[data-episode]').forEach(btn => btn.onclick = async () => { try { const item = await resolve(x.episodes[btn.dataset.episode]); await chrome.runtime.sendMessage({ type: 'download', item: { url: item.url, filename: `${safe(x.name)}/${safe(item.name)}.mp4` } }); btn.textContent = 'Отправлено'; } catch (e) { alert(e.message); } });
    root.querySelectorAll('[data-watch]').forEach(btn => btn.onclick = async () => { try { const item = await resolve(x.episodes[btn.dataset.watch]); const url = new URL(item.url); url.searchParams.delete('d'); root.querySelector('#player').innerHTML = `<video controls autoplay playsinline src="${esc(url.href)}"></video><p class="muted" id="player-error" hidden>Видео недоступно. Попробуйте другую сеть или штатный плеер сайта.</p>`; root.querySelector('video').addEventListener('error', () => { root.querySelector('#player-error').hidden = false; }); root.querySelector('#player').scrollIntoView({ behavior: 'smooth' }); } catch (e) { alert(e.message); } });
    root.querySelector('#download-all').onclick = async () => { if (!x.episodes.length || !confirm(`Скачать серий: ${x.episodes.length}?`)) return; try { const items = []; for (const e of x.episodes) { const item = await resolve(e); items.push({ url: item.url, filename: `${safe(x.name)}/${safe(item.name)}.mp4` }); } await chrome.runtime.sendMessage({ type: 'downloadMany', items }); root.querySelector('#download-all').textContent = 'Отправлено в загрузки'; } catch (e) { alert(e.message); } };
  }
  function safe(s) { return s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150); }
  type === 'title' ? title() : listing();
})();
