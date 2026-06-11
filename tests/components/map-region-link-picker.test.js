import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness, SEARCHABLE_POPOVER_RAW_MODULES } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const REGIONS = [
  { id: 'r1', name: 'Verdant', enabled: true },
  { id: 'r2', name: 'Ashen', enabled: false }
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-map-link-picker-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/MapRegionLinkPicker.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/MapRegionLinkPicker.svelte'
});

const mountPicker = (props) =>
  harness.mount({ value: '', regions: REGIONS, disabled: false, onChoose: () => {}, ...props });

function openOptions() {
  harness.target.querySelector('.manager-map-link-trigger').click();
  flushSync();
  return Array.from(harness.target.querySelectorAll('.manager-travel-option'));
}

describe('MapRegionLinkPicker mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);

  it('shows the linked region name on the trigger, or "Not linked" when unset', async () => {
    await mountPicker({ value: 'r1' });
    assert.match(harness.target.querySelector('.manager-map-link-trigger').textContent, /Verdant/);
    harness.remount();

    await mountPicker({ value: '' });
    assert.match(harness.target.querySelector('.manager-map-link-trigger').textContent, /Not linked/);
    harness.remount();
  });

  it('lists a leading "Not linked" option followed by the system regions', async () => {
    await mountPicker({ value: '' });
    const labels = openOptions().map(option => option.textContent.replace(/\s+/g, ' ').trim());
    assert.match(labels[0], /Not linked/);
    assert.ok(labels.some(label => /Verdant/.test(label)));
    assert.ok(labels.some(label => /Ashen/.test(label)));
    harness.remount();
  });

  it('invokes onChoose with the chosen region id, and null for "Not linked"', async () => {
    const calls = [];
    await mountPicker({ value: '', onChoose: (id) => calls.push(id) });
    let options = openOptions();
    options.find(option => /Verdant/.test(option.textContent)).click();
    flushSync();
    assert.deepEqual(calls, ['r1']);

    options = openOptions();
    options.find(option => /Not linked/.test(option.textContent)).click();
    flushSync();
    assert.deepEqual(calls, ['r1', null]);
    harness.remount();
  });
});
