import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness, SEARCHABLE_POPOVER_RAW_MODULES } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const SCENE_REGIONS = [
  { sceneRegionUuid: 'Scene.s1.Region.a', name: 'Northwood', color: '#1a9c4f', linkedRegionId: 'r1' },
  { sceneRegionUuid: 'Scene.s1.Region.b', name: 'Southmoor', color: '#883322', linkedRegionId: '' }
];

const REGIONS = [
  { id: 'r1', name: 'Verdant', enabled: true },
  { id: 'r2', name: 'Ashen', enabled: false }
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-map-links-tab-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/MapRegionLinkPicker.svelte',
    'src/ui/svelte/apps/manager/GatheringMapLinksTab.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/GatheringMapLinksTab.svelte'
});

const mountTab = (props) =>
  harness.mount({
    sceneRegions: [], sceneUuid: '', selectedRegionUuid: '', regions: REGIONS,
    saving: false, onSelect: () => {}, onSetLink: () => {}, ...props
  });

const rows = () => harness.target.querySelectorAll('.manager-map-link-row');

describe('GatheringMapLinksTab mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);

  it('shows the no-scene empty state when no scene is active', async () => {
    await mountTab({ sceneUuid: '', sceneRegions: [] });
    assert.equal(rows().length, 0);
    const empty = harness.target.querySelector('.manager-travel-map-links-empty');
    assert.ok(empty);
    assert.match(empty.textContent, /Activate a scene/);
    harness.remount();
  });

  it('shows the no-regions empty state when the active scene has no regions', async () => {
    await mountTab({ sceneUuid: 'Scene.s1', sceneRegions: [] });
    assert.equal(rows().length, 0);
    const empty = harness.target.querySelector('.manager-travel-map-links-empty');
    assert.ok(empty);
    assert.match(empty.textContent, /no regions/i);
    harness.remount();
  });

  it('renders one selectable row per scene region with its colour swatch, name and a link picker', async () => {
    await mountTab({ sceneUuid: 'Scene.s1', sceneRegions: SCENE_REGIONS, selectedRegionUuid: 'Scene.s1.Region.a' });
    assert.equal(rows().length, 2);
    const first = rows()[0];
    assert.match(first.querySelector('.manager-map-link-name').textContent, /Northwood/);
    assert.match(first.querySelector('.manager-map-link-swatch').getAttribute('style'), /#1a9c4f/);
    assert.equal(first.dataset.managerMapRegionUuid, 'Scene.s1.Region.a');
    // Each row carries its own link picker; the linked row shows the region name,
    // the unlinked row reads "Not linked".
    assert.match(first.querySelector('.manager-map-link-picker-cell .manager-map-link-trigger').textContent, /Verdant/);
    assert.match(rows()[1].querySelector('.manager-map-link-picker-cell .manager-map-link-trigger').textContent, /Not linked/);
    harness.remount();
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
    harness.remount();
  });

  it('reflects the selected region via is-selected and aria-pressed', async () => {
    await mountTab({ sceneUuid: 'Scene.s1', sceneRegions: SCENE_REGIONS, selectedRegionUuid: 'Scene.s1.Region.b' });
    assert.equal(rows()[0].classList.contains('is-selected'), false);
    assert.equal(rows()[1].classList.contains('is-selected'), true);
    assert.equal(rows()[1].querySelector('.manager-map-link-header').getAttribute('aria-pressed'), 'true');
    harness.remount();
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
    header0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    assert.deepEqual(calls, ['Scene.s1.Region.b', 'Scene.s1.Region.a']);
    harness.remount();
  });
});
