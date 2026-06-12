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
let GatheringRealmsTab;
let mounted;
let target;

const { writeCompiledSvelte, writeRawModule } = createSvelteCompiler(repoRoot, () => tempRoot);

function makeRealm(overrides = {}) {
  return { id: 'r1', name: 'Northreach', enabled: true, environmentCount: 0, partyCount: 0, ...overrides };
}

function makeRealms(count) {
  return Array.from({ length: count }, (_, i) => makeRealm({ id: `r${i + 1}`, name: `Realm ${i + 1}` }));
}

async function mountTab(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringRealmsTab, {
    target,
    props: { realms: [], selectedRealmId: '', onSelectRealm: () => {}, ...props }
  });
  flushSync();
  await tick();
  flushSync();
}

function remount() {
  if (mounted) { unmount(mounted); mounted = null; }
  target?.remove();
}

function rows() {
  return target.querySelectorAll('.manager-travel-realms-row');
}

describe('GatheringRealmsTab mounted behavior', () => {
  before(async () => {
    setupDOM();
    installComponentTestGlobals();

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-realms-tab-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeCompiledSvelte('src/ui/svelte/components/Pagination.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/RealmEnvironmentsEditor.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringRealmsTab.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/GatheringRealmsTab.svelte.js')).href);
    GatheringRealmsTab = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('renders an empty state when there are no realms', async () => {
    await mountTab({ realms: [] });
    assert.equal(rows().length, 0);
    assert.ok(target.querySelector('.manager-travel-realms-empty'));
    remount();
  });

  it('renders a row per realm with the realm icon, name, and env/party count chips', async () => {
    await mountTab({
      realms: [
        makeRealm({ id: 'r1', name: 'Northreach', environmentCount: 3, partyCount: 1 }),
        makeRealm({ id: 'r2', name: 'Ashen March', environmentCount: 1, partyCount: 0 })
      ]
    });
    assert.equal(rows().length, 2);
    const first = rows()[0];
    assert.ok(first.querySelector('.manager-travel-realms-icon .fa-map-location-dot'));
    assert.match(first.querySelector('.manager-travel-realms-name').textContent, /Northreach/);
    const chipText = Array.from(first.querySelectorAll('.manager-travel-realms-count-chip')).map(c => c.textContent);
    assert.ok(chipText.some(t => /3 environments/.test(t)));
    assert.ok(chipText.some(t => /1 party/.test(t))); // singular
    const secondChips = Array.from(rows()[1].querySelectorAll('.manager-travel-realms-count-chip')).map(c => c.textContent);
    assert.ok(secondChips.some(t => /1 environment/.test(t))); // singular
    assert.ok(secondChips.some(t => /0 parties/.test(t)));
    remount();
  });

  it('filters the list by search term', async () => {
    await mountTab({ realms: [makeRealm({ id: 'r1', name: 'Northreach' }), makeRealm({ id: 'r2', name: 'Ashen March' })] });
    const search = target.querySelector('input[type="search"]');
    search.value = 'ashen';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();
    assert.equal(rows().length, 1);
    assert.match(rows()[0].querySelector('.manager-travel-realms-name').textContent, /Ashen March/);
    remount();
  });

  it('paginates over a page size of 6', async () => {
    await mountTab({ realms: makeRealms(7) });
    assert.equal(rows().length, 6);
    remount();
  });

  it('pages to the selected realm when it is on a later page', async () => {
    // 8 realms (2 pages of 6); r8 is on page 2. Selecting it should reveal it.
    await mountTab({ realms: makeRealms(8), selectedRealmId: 'r8' });
    const names = Array.from(target.querySelectorAll('.manager-travel-realms-name')).map(n => n.textContent.trim());
    assert.ok(names.includes('Realm 8'), 'the selected realm on page 2 is visible');
    assert.ok(target.querySelector('.manager-travel-realms-row.is-selected'));
    remount();
  });

  it('selects a realm on header activation and reflects the selection as the expanded row', async () => {
    const selections = [];
    // Collapsed: clicking the header requests selection of the row's realm.
    await mountTab({
      realms: [makeRealm({ id: 'r1', name: 'Northreach' })],
      selectedRealmId: '',
      onSelectRealm: (id) => selections.push(id)
    });
    let header = target.querySelector('.manager-travel-realms-header');
    assert.equal(header.getAttribute('aria-expanded'), 'false');
    assert.equal(target.querySelector('[data-manager-realm-editor]'), null);
    header.click();
    flushSync();
    assert.deepEqual(selections, ['r1']);
    remount();

    // Selected: the matching row renders expanded (with the membership editor) and marked selected.
    await mountTab({ realms: [makeRealm({ id: 'r1', name: 'Northreach' })], selectedRealmId: 'r1' });
    header = target.querySelector('.manager-travel-realms-header');
    assert.equal(header.getAttribute('aria-expanded'), 'true');
    assert.ok(target.querySelector('.manager-travel-realms-row.is-selected'));
    assert.ok(target.querySelector('[data-manager-realm-editor]'));
    assert.ok(target.querySelector('[data-manager-realm-env-editor]'));
    remount();

    // Clicking the already-selected row toggles selection off.
    const toggles = [];
    await mountTab({
      realms: [makeRealm({ id: 'r1', name: 'Northreach' })],
      selectedRealmId: 'r1',
      onSelectRealm: (id) => toggles.push(id)
    });
    target.querySelector('.manager-travel-realms-header').click();
    flushSync();
    assert.deepEqual(toggles, ['']);
    remount();
  });
});
