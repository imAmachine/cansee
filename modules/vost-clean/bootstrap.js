(() => {
  window.VostModuleState = { ready: ModuleState.readEnabled('vost-clean') };
  const html = document.documentElement;
  if (!html) return;
  window.VostModuleState.ready.then(enabled => {
    if (!enabled) return;
    html.classList.add('vost-loading');
    try { if (localStorage.getItem('vost-theme') === 'light') html.classList.add('vost-loading-light'); } catch {}
    let attempts = 0;
    const check = () => window.setTimeout(() => {
      if (html.classList.contains('vost-active')) {
        html.classList.remove('vost-loading', 'vost-loading-light');
        return;
      }
      if (window.vostStarting && attempts++ < 2) return check();
      html.classList.remove('vost-loading', 'vost-loading-light');
    }, 8000);
    check();
  });
})();
