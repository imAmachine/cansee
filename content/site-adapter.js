(() => {
  const clean = (value = '') => value.replace(/\s+/g, ' ').trim();
  const absolute = (value) => value ? new URL(value, location.href).href : '';

  window.VostAdapter = {
    clean,
    currentType() {
      if (document.querySelector('#dle-content .shortstoryHead h1, .fullstory')) return 'title';
      if (location.pathname.includes('search') || location.search.includes('do=search')) return 'search';
      return 'listing';
    },
    title() {
      const root = document.querySelector('.fullstory, #dle-content');
      const heading = root?.querySelector('h1, .shortstoryHead h2');
      const image = root?.querySelector('img.imgRadius, img');
      const meta = [...(root?.querySelectorAll('p') || [])].map(p => clean(p.textContent));
      const get = (label) => meta.find(x => x.startsWith(label))?.replace(label, '').trim() || '';
      const episodes = [];
      for (const script of document.scripts) {
        const match = script.textContent.match(/var data\s*=\s*\{([\s\S]*?)\};/);
        if (!match) continue;
        for (const item of match[1].matchAll(/"([^"\n]+)"\s*:\s*"?(\d+)"?/g)) episodes.push({ name: item[1], id: item[2] });
      }
      return {
        name: clean(heading?.textContent || document.title).replace(/\s*\[[^\]]+\]\s*$/, ''),
        poster: absolute(image?.getAttribute('src')),
        year: get('Год выхода:'), genre: get('Жанр:'), type: get('Тип:'), count: get('Количество серий:'),
        description: clean(root?.querySelector('[itemprop="description"], .shortstoryContent p:last-of-type')?.textContent),
        episodes
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
    pages() {
      return [...document.querySelectorAll('.block_4 a')].map(a => ({ name: clean(a.textContent), url: absolute(a.href) }));
    }
  };
})();
