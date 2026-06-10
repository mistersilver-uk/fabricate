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
let GatheringPartiesTab;
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

function makeParty(overrides = {}) {
  return {
    id: 'p1',
    name: 'Vanguard',
    enabled: false,
    travelActor: null,
    overrideMode: 'none',
    overrideRegionIds: [],
    currentRegionEvidence: { source: 'unresolved', resolved: false, regions: [], staleRegionIds: [] },
    ...overrides
  };
}

function makeParties(count) {
  return Array.from({ length: count }, (_, i) => makeParty({ id: `p${i + 1}`, name: `Party ${i + 1}` }));
}

async function mountTab(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringPartiesTab, {
    target,
    props: { parties: [], systemId: 'sys-1', systemRegions: [], onSetRegionOverride: () => {}, onClearRegionOverride: () => {}, ...props }
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
  return target.querySelectorAll('.manager-travel-parties-row');
}

describe('GatheringPartiesTab mounted behavior', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = { i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` } };

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-parties-tab-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeRawModule('src/ui/svelte/util/iconPickerPopover.js');
    writeRawModule('src/ui/svelte/util/dropUtils.js');
    writeRawModule('src/ui/svelte/actions/dismissOnOutsideClick.js');
    writeRawModule('src/ui/svelte/actions/portal.js');
    writeRawModule('src/ui/svelte/actions/dragDrop.js');
    writeCompiledSvelte('src/ui/svelte/components/Pagination.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/SearchablePopover.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/RegionOverridePicker.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/PartyNameField.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/PartyExpandedBody.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringPartiesTab.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/GatheringPartiesTab.svelte.js')).href);
    GatheringPartiesTab = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('renders an empty state when there are no parties', async () => {
    await mountTab({ parties: [] });
    assert.equal(rows().length, 0);
    assert.ok(target.querySelector('.manager-travel-parties-empty'));
    remount();
  });

  it('renders a row per party with status and member-count chips, and a fallback icon when no travel actor', async () => {
    await mountTab({
      parties: [
        makeParty({ id: 'p1', name: 'Wardens', enabled: true, memberCount: 3 }),
        makeParty({ id: 'p2', name: 'Scouts', enabled: false, memberCount: 1 })
      ]
    });
    assert.equal(rows().length, 2);
    const first = rows()[0];
    assert.match(first.querySelector('.manager-travel-parties-name').textContent, /Wardens/);
    // No travel actor image => fallback icon span
    assert.ok(first.querySelector('.manager-travel-parties-thumb-fallback'));
    // Enabled chip + member-count chip (the mode chip was replaced)
    assert.ok(first.querySelector('.manager-chip.is-active'));
    assert.equal(first.querySelector('.manager-travel-parties-mode-chip'), null);
    assert.match(first.querySelector('.manager-travel-parties-members-chip').textContent, /3/);
    assert.match(first.querySelector('.manager-travel-parties-members-chip').getAttribute('aria-label'), /3 members/);
    // Disabled + singular member label on second
    const second = rows()[1];
    assert.ok(second.querySelector('.manager-chip.is-disabled'));
    assert.match(second.querySelector('.manager-travel-parties-members-chip').getAttribute('aria-label'), /1 member/);
    remount();
  });

  it('shows the travel actor image when set', async () => {
    await mountTab({
      parties: [makeParty({ travelActor: { uuid: 'Actor.a', name: 'Alara', img: 'icons/alara.webp' } })]
    });
    const img = target.querySelector('img.manager-travel-parties-thumb');
    assert.ok(img);
    assert.equal(img.getAttribute('src'), 'icons/alara.webp');
    remount();
  });

  it('does not duplicate the current region in the row header (it lives in the inspector)', async () => {
    await mountTab({
      parties: [makeParty({ id: 'p1', name: 'A', currentRegionEvidence: { source: 'manualOverride', resolved: true, regions: [{ id: 'r1', name: 'Northreach', enabled: true }], staleRegionIds: [] } })]
    });
    assert.equal(target.querySelector('.manager-travel-parties-current-region'), null);
    remount();
  });

  it('paginates over a page size of 6', async () => {
    await mountTab({ parties: makeParties(7) });
    assert.equal(rows().length, 6);
    remount();
  });

  it('filters the list by search term', async () => {
    await mountTab({ parties: [makeParty({ id: 'p1', name: 'Wardens' }), makeParty({ id: 'p2', name: 'Scouts' })] });
    const search = target.querySelector('input[type="search"]');
    search.value = 'scout';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();
    assert.equal(rows().length, 1);
    assert.match(rows()[0].querySelector('.manager-travel-parties-name').textContent, /Scouts/);
    remount();
  });

  it('selects a party on header activation and reflects the selection as the expanded row', async () => {
    const selections = [];
    // Collapsed: clicking the header requests selection of the row's party.
    await mountTab({
      parties: [makeParty({ id: 'p1', name: 'Wardens' })],
      selectedPartyId: '',
      onSelectParty: (id) => selections.push(id)
    });
    let header = target.querySelector('.manager-travel-parties-header');
    assert.equal(header.getAttribute('aria-expanded'), 'false');
    assert.equal(target.querySelector('[data-manager-travel-party-editor]'), null);
    header.click();
    flushSync();
    assert.deepEqual(selections, ['p1']);
    remount();

    // Selected: the matching row renders expanded with its (empty) editor body.
    await mountTab({ parties: [makeParty({ id: 'p1', name: 'Wardens' })], selectedPartyId: 'p1' });
    header = target.querySelector('.manager-travel-parties-header');
    assert.equal(header.getAttribute('aria-expanded'), 'true');
    assert.ok(target.querySelector('.manager-travel-parties-row.is-selected'));
    assert.ok(target.querySelector('[data-manager-travel-party-editor]'));
    remount();

    // Clicking the already-selected row toggles selection off.
    const toggles = [];
    await mountTab({
      parties: [makeParty({ id: 'p1', name: 'Wardens' })],
      selectedPartyId: 'p1',
      onSelectParty: (id) => toggles.push(id)
    });
    target.querySelector('.manager-travel-parties-header').click();
    flushSync();
    assert.deepEqual(toggles, ['']);
    remount();
  });

  it('sets and clears the region override from a searchable popover without selecting the row', async () => {
    const calls = [];
    const selections = [];
    await mountTab({
      parties: [makeParty({ id: 'p1', name: 'Wardens', overrideMode: 'manual', overrideRegionIds: ['r1'] })],
      selectedPartyId: '',
      systemRegions: [{ id: 'r1', name: 'Northreach', enabled: true }, { id: 'r2', name: 'Ashen March', enabled: true }],
      onSelectParty: (id) => selections.push(id),
      onSetRegionOverride: (partyId, systemId, ids) => calls.push(['set', partyId, systemId, ids]),
      onClearRegionOverride: (partyId, systemId) => calls.push(['clear', partyId, systemId])
    });

    // No native select; the override is a popover trigger.
    assert.equal(target.querySelector('select.manager-travel-parties-override'), null);
    const trigger = target.querySelector('.manager-travel-parties-override-trigger');
    assert.match(trigger.textContent, /Northreach/);

    // Opening the popover does not select the row.
    trigger.click();
    flushSync();
    await tick();
    flushSync();
    assert.ok(target.querySelector('.manager-travel-popover'));
    assert.deepEqual(selections, []);

    // The popover offers a search field plus an Auto option and one option per region.
    assert.ok(target.querySelector('.manager-travel-popover-search input'));
    const optionFor = (label) => Array.from(target.querySelectorAll('.manager-travel-option'))
      .find(button => button.textContent.includes(label));

    optionFor('Ashen March').click();
    flushSync();
    assert.deepEqual(calls.at(-1), ['set', 'p1', 'sys-1', ['r2']]);
    assert.equal(target.querySelector('.manager-travel-popover'), null); // closed after choosing

    // Reopen and choose Auto to clear the override.
    target.querySelector('.manager-travel-parties-override-trigger').click();
    flushSync();
    await tick();
    flushSync();
    optionFor('Auto').click();
    flushSync();
    assert.deepEqual(calls.at(-1), ['clear', 'p1', 'sys-1']);
    assert.deepEqual(selections, []); // never selected the row through the popover
    remount();
  });

  it('filters the override options by region search', async () => {
    await mountTab({
      parties: [makeParty({ id: 'p1', name: 'Wardens' })],
      systemRegions: [{ id: 'r1', name: 'Northreach', enabled: true }, { id: 'r2', name: 'Ashen March', enabled: true }]
    });
    target.querySelector('.manager-travel-parties-override-trigger').click();
    flushSync();
    await tick();
    flushSync();
    const regionSearch = target.querySelector('.manager-travel-popover-search input');
    regionSearch.value = 'ashen';
    regionSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    await tick();
    flushSync();
    const optionNames = Array.from(target.querySelectorAll('.manager-travel-option-name')).map(node => node.textContent.trim());
    assert.ok(optionNames.includes('Ashen March'));
    assert.ok(!optionNames.includes('Northreach'));
    remount();
  });
});
