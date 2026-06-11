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
let GatheringMapLinksTab;
let mounted;
let target;

const { writeCompiledSvelte, writeRawModule } = createSvelteCompiler(repoRoot, () => tempRoot);

const SCENE_REGIONS = [
  { sceneRegionUuid: 'Scene.s1.Region.a', name: 'Northwood', color: '#1a9c4f', linkedRegionId: 'r1' },
  { sceneRegionUuid: 'Scene.s1.Region.b', name: 'Southmoor', color: '#883322', linkedRegionId: '' }
];

const REGIONS = [
  { id: 'r1', name: 'Verdant', enabled: true },
  { id: 'r2', name: 'Ashen', enabled: false }
];

async function mountTab(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringMapLinksTab, {
    target,
    props: {
      sceneRegions: [], sceneUuid: '', selectedRegionUuid: '', regions: REGIONS,
      saving: false, onSelect: () => {}, onSetLink: () => {}, ...props
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

function rows() {
  return target.querySelectorAll('.manager-map-link-row');
}

describe('GatheringMapLinksTab mounted behavior', () => {
  before(async () => {
    setupDOM();
    installComponentTestGlobals();

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-map-links-tab-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeRawModule('src/ui/svelte/util/iconPickerPopover.js');
    writeRawModule('src/ui/svelte/actions/dismissOnOutsideClick.js');
    writeRawModule('src/ui/svelte/actions/portal.js');
    writeCompiledSvelte('src/ui/svelte/apps/manager/SearchablePopover.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/MapRegionLinkPicker.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/GatheringMapLinksTab.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/GatheringMapLinksTab.svelte.js')).href);
    GatheringMapLinksTab = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('shows the no-scene empty state when no scene is active', async () => {
    await mountTab({ sceneUuid: '', sceneRegions: [] });
    assert.equal(rows().length, 0);
    const empty = target.querySelector('.manager-travel-map-links-empty');
    assert.ok(empty);
    assert.match(empty.textContent, /Activate a scene/);
    remount();
  });

  it('shows the no-regions empty state when the active scene has no regions', async () => {
    await mountTab({ sceneUuid: 'Scene.s1', sceneRegions: [] });
    assert.equal(rows().length, 0);
    const empty = target.querySelector('.manager-travel-map-links-empty');
    assert.ok(empty);
    assert.match(empty.textContent, /no regions/i);
    remount();
  });

  it('renders one selectable row per scene region with its colour swatch, name and a link picker', async () => {
    await mountTab({ sceneUuid: 'Scene.s1', sceneRegions: SCENE_REGIONS, selectedRegionUuid: 'Scene.s1.Region.a' });
    assert.equal(rows().length, 2);
    const first = rows()[0];
    assert.match(first.querySelector('.manager-map-link-name').textContent, /Northwood/);
    assert.match(first.querySelector('.manager-map-link-swatch').getAttribute('style'), /#1a9c4f/);
    assert.equal(first.getAttribute('data-manager-map-region-uuid'), 'Scene.s1.Region.a');
    // Each row carries its own link picker; the linked row shows the region name,
    // the unlinked row reads "Not linked".
    assert.match(first.querySelector('.manager-map-link-picker-cell .manager-map-link-trigger').textContent, /Verdant/);
    assert.match(rows()[1].querySelector('.manager-map-link-picker-cell .manager-map-link-trigger').textContent, /Not linked/);
    remount();
  });

  it('invokes onSetLink with the row’s scene-region uuid and the chosen region id', async () => {
    const calls = [];
    await mountTab({
      sceneUuid: 'Scene.s1',
      sceneRegions: SCENE_REGIONS,
      selectedRegionUuid: 'Scene.s1.Region.a',
      onSetLink: (sceneRegionUuid, regionId) => calls.push([sceneRegionUuid, regionId])
    });
    // Open the second (unlinked) row's picker and choose "Verdant".
    rows()[1].querySelector('.manager-map-link-trigger').click();
    flushSync();
    await tick();
    flushSync();
    const option = Array.from(rows()[1].querySelectorAll('.manager-travel-option'))
      .find(node => /Verdant/.test(node.textContent));
    assert.ok(option, 'the Verdant option should be present');
    option.click();
    flushSync();
    assert.deepEqual(calls, [['Scene.s1.Region.b', 'r1']]);
    remount();
  });

  it('reflects the selected region via is-selected and aria-pressed', async () => {
    await mountTab({ sceneUuid: 'Scene.s1', sceneRegions: SCENE_REGIONS, selectedRegionUuid: 'Scene.s1.Region.b' });
    assert.equal(rows()[0].classList.contains('is-selected'), false);
    assert.equal(rows()[1].classList.contains('is-selected'), true);
    assert.equal(rows()[1].querySelector('.manager-map-link-header').getAttribute('aria-pressed'), 'true');
    remount();
  });

  it('invokes onSelect with the scene-region uuid on click and Enter', async () => {
    const calls = [];
    await mountTab({
      sceneUuid: 'Scene.s1',
      sceneRegions: SCENE_REGIONS,
      selectedRegionUuid: 'Scene.s1.Region.a',
      onSelect: (uuid) => calls.push(uuid)
    });
    rows()[1].querySelector('.manager-map-link-header').click();
    flushSync();
    const header0 = rows()[0].querySelector('.manager-map-link-header');
    header0.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    assert.deepEqual(calls, ['Scene.s1.Region.b', 'Scene.s1.Region.a']);
    remount();
  });
});
