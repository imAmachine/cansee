(() => {
  const status = document.querySelector('#status');
  const container = document.querySelector('#modules');
  let tab;

  const card = (module, enabled) => {
    const section = document.createElement('section');
    section.className = 'module';
    section.innerHTML = `<div class="module-head"><div><h2></h2><p></p></div><label class="switch"><input type="checkbox"><span aria-hidden="true"></span><b class="visually-hidden">Включить оформление</b></label></div><p class="hint">Настройка сохраняется для всех вкладок этого сайта.</p>`;
    section.querySelector('h2').textContent = module.name;
    section.querySelector('.module-head p').textContent = module.description;
    const toggle = section.querySelector('input');
    toggle.checked = enabled;
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        await chrome.storage.local.set({ [ModuleState.key(module.id)]: toggle.checked });
        if (tab?.id && VostModuleRegistry.forUrl(tab.url || '')?.id === module.id) {
          await chrome.tabs.reload(tab.id);
          status.textContent = `${module.name}: настройка применена.`;
        } else status.textContent = `${module.name}: настройка сохранена.`;
      } catch {
        toggle.checked = !toggle.checked;
        status.textContent = `${module.name}: не удалось сохранить настройку.`;
      } finally { toggle.disabled = false; }
    });
    return section;
  };

  Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get()
  ]).then(([tabs, values]) => {
    tab = tabs[0];
    const modules = VostModuleRegistry.all();
    modules.forEach(module => {
      const value = values[ModuleState.key(module.id)];
      container.append(card(module, value === undefined || value === true));
    });
    status.textContent = tab && VostModuleRegistry.forUrl(tab.url || '') ? 'Модули для поддерживаемых сайтов.' : 'Настройки модулей доступны всегда.';
  }).catch(() => { status.textContent = 'Не удалось загрузить настройки модулей.'; });
})();
