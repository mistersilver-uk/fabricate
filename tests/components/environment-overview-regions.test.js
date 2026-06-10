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
let EnvironmentOverviewTab;
let mounted;
let target;

const { writeCompiledSvelte, writeRawModule } = createSvelteCompiler(repoRoot, () => tempRoot);

function baseProps(overrides = {}) {
  return {
    environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRegionIds: [] },
    composition: { counts: {}, conditions: {} },
    regionRecords: [],
    regionsEnabled: false,
    biomeOptions: [],
    dangerOptions: [],
    linkedSceneImage: '',
    onPickImagePath: null,
    onUpdate: () => {},
    onSetCompositionMode: () => {},
    ...overrides
  };
}

async function mountTab(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(EnvironmentOverviewTab, { target, props });
  flushSync();
  await tick();
  flushSync();
}

function remount() {
  if (mounted) { unmount(mounted); mounted = null; }
  target?.remove();
}

describe('EnvironmentOverviewTab multi-region selector', () => {
  before(async () => {
    setupDOM();
    installComponentTestGlobals();

    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-env-overview-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    writeRawModule('src/ui/svelte/util/foundryBridge.js');
    writeCompiledSvelte('src/ui/svelte/apps/manager/environment/CompositionModeControl.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte');
    const mod = await import(pathToFileURL(join(tempRoot, 'src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte.js')).href);
    EnvironmentOverviewTab = mod.default;
  });

  after(() => {
    if (mounted) unmount(mounted);
    target?.remove();
    teardownDOM();
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('hides the region field entirely when the Travel & Regions toggle is off', async () => {
    await mountTab(baseProps({ regionsEnabled: false, regionRecords: [{ id: 'r1', name: 'Verdant' }] }));
    assert.equal(target.querySelector('[data-environment-field="includedRegionIds"]'), null, 'region field is hidden when disabled');
    // The legacy single-region <select> must not appear either.
    assert.equal(target.querySelector('[data-environment-field="region"]'), null, 'legacy single-region select is removed');
    remount();
  });

  it('shows an empty-state hint pointing to the Travel tab when enabled but no regions exist', async () => {
    await mountTab(baseProps({ regionsEnabled: true, regionRecords: [] }));
    const field = target.querySelector('[data-environment-field="includedRegionIds"]');
    assert.ok(field, 'region field renders when enabled');
    assert.ok(target.querySelector('[data-environment-region-empty]'), 'empty-state hint renders');
    assert.equal(field.querySelector('select'), null, 'no add-select when there are no regions');
    remount();
  });

  it('adds and removes region chips bound to includedRegionIds', async () => {
    const updates = [];
    await mountTab(baseProps({
      regionsEnabled: true,
      regionRecords: [
        { id: 'r1', name: 'Verdant' },
        { id: 'r2', name: 'Dunes' }
      ],
      environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [], includedRegionIds: ['r1'] },
      onUpdate: (patch) => updates.push(patch)
    }));

    const field = target.querySelector('[data-environment-field="includedRegionIds"]');
    assert.ok(field, 'region field renders');
    // r1 already selected → its chip shows; only r2 remains in the add-select.
    const options = Array.from(field.querySelectorAll('select option')).map(o => o.value).filter(Boolean);
    assert.deepEqual(options, ['r2']);

    const select = field.querySelector('select');
    select.value = 'r2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), { includedRegionIds: ['r1', 'r2'] });

    field.querySelector('.manager-availability-pill.is-region .manager-availability-remove').click();
    await tick();
    flushSync();
    assert.deepEqual(updates.at(-1), { includedRegionIds: [] });
    remount();
  });
});
