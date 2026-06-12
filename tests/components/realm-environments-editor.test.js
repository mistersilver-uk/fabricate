import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import { createSvelteCompiler, installComponentTestGlobals } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let RealmEnvironmentsEditor;
let mounted;
let target;

const { writeCompiledSvelte, writeRawModule } = createSvelteCompiler(repoRoot, () => tempRoot);

function env(id, name, includedRealmIds = [], extra = {}) {
  return { id, name, img: '', enabled: true, includedRealmIds, ...extra };
}

async function mountEditor(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(RealmEnvironmentsEditor, {
    target,
    props: {
      realm: { id: 'r1', name: 'Northreach' },
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
  return target.querySelector(`[data-realm-env-column="${which}"]`);
}
function rowNames(which) {
  return Array.from(column(which).querySelectorAll('.manager-realm-env-name')).map(n => n.textContent.trim());
}

describe('RealmEnvironmentsEditor mounted behavior', () => {
  before(async () => {
    setupDOM();
    installComponentTestGlobals();

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-realm-env-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeCompiledSvelte('src/ui/svelte/components/Pagination.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/RealmEnvironmentsEditor.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/RealmEnvironmentsEditor.svelte.js')).href);
    RealmEnvironmentsEditor = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('splits environments into available (not in realm) and included (in realm)', async () => {
    await mountEditor({
      environments: [
        env('e1', 'Grove', ['r1']),
        env('e2', 'Glade', []),
        env('e3', 'Marsh', ['r2'])
      ]
    });
    assert.deepEqual(rowNames('included'), ['Grove']);
    assert.deepEqual(rowNames('available').sort((a, b) => a.localeCompare(b)), ['Glade', 'Marsh']);
    remount();
  });

  it('Add on an available row calls onAdd(envId, realmId)', async () => {
    const added = [];
    await mountEditor({
      environments: [env('e2', 'Glade', [])],
      onAdd: (envId, realmId) => added.push([envId, realmId])
    });
    column('available').querySelector('.manager-realm-env-add').click();
    flushSync();
    assert.deepEqual(added, [['e2', 'r1']]);
    remount();
  });

  it('Remove on an included row calls onRemove(envId, realmId)', async () => {
    const removed = [];
    await mountEditor({
      environments: [env('e1', 'Grove', ['r1'])],
      onRemove: (envId, realmId) => removed.push([envId, realmId])
    });
    column('included').querySelector('.manager-realm-env-remove').click();
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
    assert.equal(column('available').querySelectorAll('.manager-realm-env-row').length, 6);
    remount();
  });
});
