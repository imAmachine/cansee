(() => {
  const html = document.documentElement;
  if (!html) return;
  html.classList.add('vost-loading');
  try { if (localStorage.getItem('vost-theme') === 'light') html.classList.add('vost-loading-light'); } catch {}
  window.setTimeout(() => html.classList.remove('vost-loading', 'vost-loading-light'), 10000);
})();
