(() => {
  const modules = [];

  const registry = {
    register(module) {
      if (!module || typeof module.id !== 'string' || !module.id ||
          typeof module.name !== 'string' || typeof module.description !== 'string' ||
          typeof module.matches !== 'function' || modules.some(item => item.id === module.id)) {
        throw new Error('Invalid or duplicate module');
      }
      modules.push(module);
    },
    all() { return modules.slice(); },
    forUrl(url) {
      return modules.find(module => {
        try { return module.matches(url) === true; }
        catch { return false; }
      }) || null;
    }
  };

  globalThis.VostModuleRegistry = registry;
})();
