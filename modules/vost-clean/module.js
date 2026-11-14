VostModuleRegistry.register({
  id: 'vost-clean',
  name: 'Vost Clean',
  description: 'Минималистичный интерфейс Vost Clean для поддерживаемых сайтов.',
  matches(url) {
    try {
      const value = new URL(url);
      return value.protocol === 'https:' &&
        (value.hostname === 'animevost.org' || value.hostname === 'vost.pw' || value.hostname.endsWith('.vost.pw'));
    } catch {
      return false;
    }
  }
});
