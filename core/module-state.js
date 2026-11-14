(() => {
  function readEnabled(id) {
    const key = `module.${id}.enabled`;
    try {
      return chrome.storage.local.get(key).then(values =>
        values[key] === undefined || values[key] === true
      ).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  globalThis.ModuleState = {
    key(id) { return `module.${id}.enabled`; },
    readEnabled(id) {
      return Promise.race([
        readEnabled(id),
        new Promise(resolve => setTimeout(() => resolve(false), 3000))
      ]);
    }
  };
})();
