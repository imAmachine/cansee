(() => {
  const clean = (value = '') => value.replace(/\s+/g, ' ').trim();
  const absolute = (value) => value ? new URL(value, location.href).href : '';

  window.VostAdapter = {
    clean,
    currentType() {
      if (document.querySelector('#dle-content .shortstoryHead h1, .fullstory')) return 'title';
      if (location.pathname.includes('search') || location.search.includes('do=search')) return 'search';
      if (location.search && new URLSearchParams(location.search).has('do')) return 'unsupported';
      if (document.querySelector('#dle-content .shortstoryHead a')) return 'listing';
      return 'unsupported';
    },
    title() {
      const root = document.querySelector('.fullstory, #dle-content');
      const heading = root?.querySelector('h1, .shortstoryHead h2');
      const image = root?.querySelector('img.imgRadius, img');
      const meta = [...(root?.querySelectorAll('p') || [])].map(p => clean(p.textContent));
      const get = (label) => meta.find(x => x.startsWith(label))?.replace(label, '').trim() || '';
      const episodes = window.VostMedia.episodes([...document.scripts].map(script => script.textContent).join('\n'));
      const frameEpisodes = episodes.length <= 12 ? episodes : Array.from({ length: 12 }, (_, index) => episodes[Math.round(index * (episodes.length - 1) / 11)]);
      const screenshots = frameEpisodes.map(episode => ({
        src: `https://media.aniland.org/img/${encodeURIComponent(episode.id)}.jpg`,
        alt: `${clean(heading?.textContent || document.title)} — ${episode.name}`,
        label: episode.name
      }));
      return {
        name: clean(heading?.textContent || document.title).replace(/\s*\[[^\]]+\]\s*$/, ''),
        poster: absolute(image?.getAttribute('src')),
        year: get('Год выхода:'), genre: get('Жанр:'), type: get('Тип:'), count: get('Количество серий:'),
        description: clean(root?.querySelector('[itemprop="description"], .shortstoryContent p:last-of-type')?.textContent),
        episodes, screenshots
      };
    },
    cards() {
      return [...document.querySelectorAll('.shortstory')].map(card => {
        const link = card.querySelector('.shortstoryHead a, .shortstoryFuter a[href*=".html"]');
        const image = card.querySelector('img');
        const text = clean(link?.textContent);
        return link ? { name: text, url: absolute(link.href), poster: absolute(image?.src), date: clean(card.querySelector('.staticInfoLeftData')?.textContent), info: clean(card.querySelector('.shortstoryContent')?.textContent).slice(0, 220) } : null;
      }).filter(Boolean);
    },
    latest() {
      return [...document.querySelectorAll('.raspis_fixed a')].map(a => ({ name: clean(a.textContent), url: absolute(a.href) }));
    },
    schedule() {
      const days = [['Mon', 'Понедельник'], ['Tue', 'Вторник'], ['Wed', 'Среда'], ['Thu', 'Четверг'], ['Fri', 'Пятница'], ['Sat', 'Суббота'], ['Sun', 'Воскресенье']];
      return days.map(([id, name]) => ({
        name,
        items: [...document.querySelectorAll(`#raspis${id} a[href]`)].flatMap(link => {
          try {
            const url = new URL(link.getAttribute('href'), location.href);
            const text = clean(link.textContent);
            if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || !text) return [];
            const match = text.match(/^(.*?)\s*~\s*\(([^)]+)\)\s*$/);
            return [{ name: match ? match[1].trim() : text, time: match ? match[2].trim() : '', url: url.href }];
          } catch { return []; }
        })
      }));
    },
    pages() {
      return [...document.querySelectorAll('.block_4 a')].map(a => ({ name: clean(a.textContent), url: absolute(a.href) }));
    }
  };
})();
