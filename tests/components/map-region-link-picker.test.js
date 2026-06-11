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
let MapRegionLinkPicker;
let mounted;
let target;

const { writeCompiledSvelte, writeRawModule } = createSvelteCompiler(repoRoot, () => tempRoot);

const REGIONS = [
  { id: 'r1', name: 'Verdant', enabled: true },
  { id: 'r2', name: 'Ashen', enabled: false }
];

async function mountPicker(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(MapRegionLinkPicker, {
    target,
    props: { value: '', regions: REGIONS, disabled: false, onChoose: () => {}, ...props }
  });
  flushSync();
  await tick();
  flushSync();
}

function remount() {
  if (mounted) { unmount(mounted); mounted = null; }
  target?.remove();
}

function openOptions() {
  target.querySelector('.manager-map-link-trigger').click();
  flushSync();
  return Array.from(target.querySelectorAll('.manager-travel-option'));
}

describe('MapRegionLinkPicker mounted behavior', () => {
  before(async () => {
    setupDOM();
    installComponentTestGlobals();

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-map-link-picker-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeRawModule('src/ui/svelte/util/iconPickerPopover.js');
    writeRawModule('src/ui/svelte/actions/dismissOnOutsideClick.js');
    writeRawModule('src/ui/svelte/actions/portal.js');
    writeCompiledSvelte('src/ui/svelte/apps/manager/SearchablePopover.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/MapRegionLinkPicker.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/MapRegionLinkPicker.svelte.js')).href);
    MapRegionLinkPicker = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('shows the linked region name on the trigger, or "Not linked" when unset', async () => {
    await mountPicker({ value: 'r1' });
    assert.match(target.querySelector('.manager-map-link-trigger').textContent, /Verdant/);
    remount();

    await mountPicker({ value: '' });
    assert.match(target.querySelector('.manager-map-link-trigger').textContent, /Not linked/);
    remount();
  });

  it('lists a leading "Not linked" option followed by the system regions', async () => {
    await mountPicker({ value: '' });
    const labels = openOptions().map(option => option.textContent.replace(/\s+/g, ' ').trim());
    assert.match(labels[0], /Not linked/);
    assert.ok(labels.some(label => /Verdant/.test(label)));
    assert.ok(labels.some(label => /Ashen/.test(label)));
    remount();
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
    remount();
  });
});
