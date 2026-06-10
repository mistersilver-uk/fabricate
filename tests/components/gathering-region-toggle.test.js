import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

function read(relPath) {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

const environmentsBrowserSource = read('src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const managerRootSource = read('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
const adminStoreSource = read('src/ui/svelte/stores/adminStore.js');
const lang = JSON.parse(read('lang/en.json'));

describe('Travel & Regions settings toggle', () => {
  it('renders an aria-pressed toggle card bound to gatheringRegionSettings.enabled', () => {
    assert.ok(environmentsBrowserSource.includes('data-gathering-region-toggle-panel'), 'settings tab renders the toggle card');
    assert.ok(environmentsBrowserSource.includes('data-gathering-region-toggle'), 'toggle button exposes a data hook');
    assert.ok(environmentsBrowserSource.includes('aria-pressed={regionsEnabled}'), 'toggle reflects the enabled flag via aria-pressed');
    assert.ok(environmentsBrowserSource.includes("gatheringRegionSettings?.enabled === true"), 'regionsEnabled derives from the per-system flag');
    assert.ok(environmentsBrowserSource.includes('onSetGatheringRegionsEnabled?.(selectedSystemId, !regionsEnabled)'), 'toggle flips the flag through the store action');
  });

  it('toggle hint names the Travel tab so the GM can connect the toggle to the outcome', () => {
    const hint = lang.FABRICATE.Admin.Manager.Environment.RegionToggle.Hint;
    assert.equal(typeof hint, 'string');
    assert.ok(hint.includes('Travel'), 'hint copy names where Travel lives');
  });

  it('wires the setGatheringRegionsEnabled store action to GatheringRegionStore.updateRegionSettings', () => {
    assert.ok(adminStoreSource.includes('async setGatheringRegionsEnabled('), 'store exposes setGatheringRegionsEnabled');
    assert.ok(adminStoreSource.includes("updateRegionSettings(systemId, { enabled: enabled === true })"), 'action writes the enabled flag via the region store');
    assert.ok(adminStoreSource.includes('setGatheringRegionsEnabled: travel.setGatheringRegionsEnabled'), 'action is published on the store surface');
    assert.ok(managerRootSource.includes('onSetGatheringRegionsEnabled={(sys, enabled) => store.setGatheringRegionsEnabled?.(sys, enabled)}'), 'root passes the action down');
    assert.ok(managerRootSource.includes("gatheringRegionSettings={$viewState.gatheringRegionSettings"), 'root threads the settings view-model down');
  });

  it('the admin store view-model surfaces gatheringRegionSettings from the region store', () => {
    assert.ok(adminStoreSource.includes('gatheringRegionSettings:'), 'travel view-model carries gatheringRegionSettings');
    assert.ok(adminStoreSource.includes('regionStore.getRegionSettings(systemId)'), 'view-model reads region settings from the store');
  });
});

describe('Travel nav gating', () => {
  it('hides the Travel nav item when the flag is off and validates tab resolution against the visible list', () => {
    assert.ok(managerRootSource.includes('const gatheringRegionsEnabled = $derived($viewState.gatheringRegionSettings?.enabled === true)'), 'root derives the gate flag');
    assert.ok(
      managerRootSource.includes("gatheringRegionsEnabled ? gatheringNavItems : gatheringNavItems.filter(tab => tab.id !== 'travel')"),
      'visible nav items drop Travel when disabled'
    );
    assert.ok(managerRootSource.includes('{#each visibleGatheringNavItems as gatheringItem'), 'nav render uses the filtered list');
    // Tab-resolution guards validate against the filtered list, not the static one.
    assert.ok(managerRootSource.includes('activeGatheringTab = visibleGatheringNavItems.some(tab => tab.id === tabId) ? tabId : \'environments\''), 'selectGatheringTab validates against the visible list');
    assert.ok(managerRootSource.includes("const nextTab = visibleGatheringNavItems.some(tab => tab.id === tabId) ? tabId : 'environments'"), 'openGatheringSection validates against the visible list');
  });

  it('falls back to environments when the active tab is no longer visible (stale travel tab)', () => {
    assert.ok(
      managerRootSource.includes("if (!visibleGatheringNavItems.some(tab => tab.id === activeGatheringTab)) {") &&
      /activeGatheringTab\s*=\s*'environments'/.test(managerRootSource),
      'a stale active tab falls back to environments'
    );
  });
});
