import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let RegionEnvironmentsEditor;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, { filename: sourcePath, generate: 'client', dev: true, css: 'injected' });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function writeRawModule(modulePath) {
  const destination = join(tempRoot, modulePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(resolve(repoRoot, modulePath), 'utf8'));
}

function env(id, name, includedRegionIds = [], extra = {}) {
  return { id, name, img: '', enabled: true, includedRegionIds, ...extra };
}

async function mountEditor(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(RegionEnvironmentsEditor, {
    target,
    props: {
      region: { id: 'r1', name: 'Northreach' },
      environments: [],
      saving: false,
      onAdd: () => {},
      onRemove: () => {},
      ...props
    }
  });
  flushSync();
  await tick();
  flushSync();
}

function remount() {
  if (mounted) { unmount(mounted); mounted = null; }
  target?.remove();
}

function column(which) {
  return target.querySelector(`[data-region-env-column="${which}"]`);
}
function rowNames(which) {
  return Array.from(column(which).querySelectorAll('.manager-region-env-name')).map(n => n.textContent.trim());
}

describe('RegionEnvironmentsEditor mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = { i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` } };

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-region-env-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeCompiledSvelte('src/ui/svelte/components/Pagination.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/RegionEnvironmentsEditor.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/RegionEnvironmentsEditor.svelte.js')).href);
    RegionEnvironmentsEditor = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('splits environments into available (not in region) and included (in region)', async () => {
    await mountEditor({
      environments: [
        env('e1', 'Grove', ['r1']),
        env('e2', 'Glade', []),
        env('e3', 'Marsh', ['r2'])
      ]
    });
    assert.deepEqual(rowNames('included'), ['Grove']);
    assert.deepEqual(rowNames('available').sort(), ['Glade', 'Marsh']);
    remount();
  });

  it('Add on an available row calls onAdd(envId, regionId)', async () => {
    const added = [];
    await mountEditor({
      environments: [env('e2', 'Glade', [])],
      onAdd: (envId, regionId) => added.push([envId, regionId])
    });
    column('available').querySelector('.manager-region-env-add').click();
    flushSync();
    assert.deepEqual(added, [['e2', 'r1']]);
    remount();
  });

  it('Remove on an included row calls onRemove(envId, regionId)', async () => {
    const removed = [];
    await mountEditor({
      environments: [env('e1', 'Grove', ['r1'])],
      onRemove: (envId, regionId) => removed.push([envId, regionId])
    });
    column('included').querySelector('.manager-region-env-remove').click();
    flushSync();
    assert.deepEqual(removed, [['e1', 'r1']]);
    remount();
  });

  it('filters each column independently by search', async () => {
    await mountEditor({
      environments: [env('e1', 'Grove', ['r1']), env('e2', 'Glade', ['r1']), env('e3', 'Marsh', [])]
    });
    const includedSearch = column('included').querySelector('input[type="search"]');
    includedSearch.value = 'grove';
    includedSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();
    assert.deepEqual(rowNames('included'), ['Grove']);
    // The available column is unaffected by the included search.
    assert.deepEqual(rowNames('available'), ['Marsh']);
    remount();
  });

  it('paginates each column over a page size of 6', async () => {
    const many = Array.from({ length: 7 }, (_, i) => env(`a${i}`, `Avail ${i}`, []));
    await mountEditor({ environments: many });
    assert.equal(column('available').querySelectorAll('.manager-region-env-row').length, 6);
    remount();
  });
});
