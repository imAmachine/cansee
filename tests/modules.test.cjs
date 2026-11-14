const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('registry matches only supported HTTPS hosts', () => {
  const context = { URL };
  vm.runInNewContext(fs.readFileSync('core/registry.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync('modules/vost-clean/module.js', 'utf8'), context);
  const registry = context.VostModuleRegistry;
  for (const url of ['https://animevost.org/', 'https://vost.pw/', 'https://v14.vost.pw/path']) {
    assert.equal(registry.forUrl(url)?.id, 'vost-clean');
  }
  for (const url of ['http://animevost.org/', 'https://animevost.org.evil.test/', 'https://evilvost.pw/', 'chrome://extensions/', 'not a url']) {
    assert.equal(registry.forUrl(url), null);
  }
});

async function readState(get) {
  const context = { chrome: { storage: { local: { get } } }, setTimeout: () => 0, Promise };
  vm.runInNewContext(fs.readFileSync('core/module-state.js', 'utf8'), context);
  return context.ModuleState.readEnabled('vost-clean');
}

test('module is enabled by default and respects saved state', async () => {
  assert.equal(await readState(() => Promise.resolve({})), true);
  assert.equal(await readState(() => Promise.resolve({ 'module.vost-clean.enabled': true })), true);
  assert.equal(await readState(() => Promise.resolve({ 'module.vost-clean.enabled': false })), false);
  assert.equal(await readState(() => Promise.resolve({ 'module.vost-clean.enabled': 'true' })), false);
});

test('storage errors leave the original site available', async () => {
  assert.equal(await readState(() => Promise.reject(new Error('unavailable'))), false);
  assert.equal(await readState(() => { throw new Error('unavailable'); }), false);
});

test('registry rejects duplicate and incomplete modules', () => {
  const context = { URL };
  vm.runInNewContext(fs.readFileSync('core/registry.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync('modules/vost-clean/module.js', 'utf8'), context);
  assert.throws(() => vm.runInNewContext(fs.readFileSync('modules/vost-clean/module.js', 'utf8'), context), /duplicate/);
  assert.throws(() => context.VostModuleRegistry.register({ id: 'incomplete' }), /Invalid/);
});

test('manifest references existing files and supported module addresses', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const files = [manifest.background.service_worker, manifest.action.default_popup];
  for (const script of manifest.content_scripts) files.push(...(script.js || []), ...(script.css || []));
  for (const resources of manifest.web_accessible_resources) files.push(...resources.resources);
  for (const file of files) assert.ok(fs.existsSync(file), `Missing ${file}`);
  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, ['https://animevost.org/*', 'https://*.vost.pw/*']);
  }
});

test('registry ignores a module whose matcher throws', () => {
  const context = { URL };
  vm.runInNewContext(fs.readFileSync('core/registry.js', 'utf8'), context);
  context.VostModuleRegistry.register({ id: 'broken', name: 'Broken', description: '', matches() { throw new Error('broken'); } });
  assert.equal(context.VostModuleRegistry.forUrl('https://animevost.org/'), null);
});
