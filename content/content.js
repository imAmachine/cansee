(() => {
  const A = window.VostAdapter;
  const type = A.currentType();
  const data = type === 'title' ? A.title() : { latest: A.latest(), cards: A.cards(), pages: A.pages() };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const app = document.createElement('main');
  app.id = 'vost-app';
  document.body.replaceChildren(app);

  function shell(content, active = '') {
    app.innerHTML = `<header><a class="brand" href="${location.origin}/">VOST<span>CLEAN</span></a><nav>
      <a class="${active === 'latest' ? 'active' : ''}" href="${location.origin}/">Последние</a>
      <a class="${active === 'catalog' ? 'active' : ''}" href="${location.origin}/page/2/">Каталог</a>
    </nav><form id="search"><input name="story" placeholder="Найти тайтл…" autocomplete="off"><button>Поиск</button></form></header><section class="content">${content}</section>`;
    app.querySelector('#search').addEventListener('submit', e => {
      e.preventDefault(); const value = new FormData(e.currentTarget).get('story');
      if (value) location.href = `${location.origin}/index.php?do=search&subaction=search&story=${encodeURIComponent(value)}`;
    });
  }
  function cards(items) {
    return `<div class="grid">${items.map(x => `<a class="card" href="${esc(x.url)}">${x.poster ? `<img loading="lazy" src="${esc(x.poster)}">` : '<div class="poster"></div>'}<div><strong>${esc(x.name)}</strong><small>${esc(x.info || '')}</small></div></a>`).join('')}</div>`;
  }
  function listing() {
    const latest = data.latest; const items = data.cards;
    shell(`<div class="hero"><p class="eyebrow">ANIMEVOST / CLEAN CLIENT</p><h1>Аниме без лишнего шума</h1><p>Каталог, последние обновления и быстрый доступ к сериям.</p></div>
      <div class="section-title"><h2>Последние обновления</h2><span>${latest.length} тайтлов</span></div><div class="latest">${latest.map(x => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join('')}</div>
      <div class="section-title"><h2>Каталог</h2></div>${cards(items)}<div class="pages">${data.pages.map(x => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join('')}</div>`, 'latest');
  }
  function title() {
    const x = data;
    shell(`<article class="title"><div class="title-head">${x.poster ? `<img src="${esc(x.poster)}">` : ''}<div><p class="eyebrow">${esc(x.type)} · ${esc(x.year)}</p><h1>${esc(x.name)}</h1><p class="muted">${esc(x.genre)} · ${esc(x.count)}</p><p>${esc(x.description)}</p></div></div>
      <div class="section-title"><h2>Серии</h2><button id="download-all" class="secondary">Скачать всё</button></div><div class="episodes">${x.episodes.map((e, i) => `<div class="episode"><span>${esc(e.name)}</span><button data-episode="${i}">Скачать</button><button class="watch" data-watch="${i}">Смотреть</button></div>`).join('')}</div><div id="player"></div></article>`);
    const resolve = async (episode) => {
      const response = await fetch(`${location.origin}/getlink.php?id=${episode.id}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Сайт не предоставил ссылку на серию');
      const url = (await response.text()).split(/\s+or\s+/i)[0].trim();
      if (!/^https:\/\/[\w.-]+\.roomfish\.ru\/[^\s]+\.mp4(?:\?[^\s]*)?$/i.test(url)) throw new Error('Ссылка на MP4 недоступна');
      return { url, name: `${x.name} - ${episode.name.replace(/[^\d]+/, '').padStart(2, '0')}` };
    };
    app.querySelectorAll('[data-episode]').forEach(btn => btn.onclick = async () => { try { const item = await resolve(x.episodes[btn.dataset.episode]); await chrome.runtime.sendMessage({ type: 'download', item: { url: item.url, filename: `${safe(x.name)}/${safe(item.name)}.mp4` } }); btn.textContent = 'Отправлено'; } catch (e) { alert(e.message); } });
    app.querySelectorAll('[data-watch]').forEach(btn => btn.onclick = async () => { try { const item = await resolve(x.episodes[btn.dataset.watch]); app.querySelector('#player').innerHTML = `<video controls autoplay src="${esc(item.url)}"></video>`; app.querySelector('#player').scrollIntoView({ behavior: 'smooth' }); } catch (e) { alert(e.message); } });
    app.querySelector('#download-all').onclick = async () => { if (!x.episodes.length || !confirm(`Скачать серий: ${x.episodes.length}?`)) return; try { const items = []; for (const e of x.episodes) { const item = await resolve(e); items.push({ url: item.url, filename: `${safe(x.name)}/${safe(item.name)}.mp4` }); } await chrome.runtime.sendMessage({ type: 'downloadMany', items }); app.querySelector('#download-all').textContent = 'Отправлено в загрузки'; } catch (e) { alert(e.message); } };
  }
  function safe(s) { return s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150); }
  type === 'title' ? title() : listing();
})();
