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

describe('Travel & Realms settings toggle', () => {
  it('renders an aria-pressed toggle card bound to gatheringRealmSettings.enabled', () => {
    assert.ok(environmentsBrowserSource.includes('data-gathering-realm-toggle-panel'), 'settings tab renders the toggle card');
    assert.ok(environmentsBrowserSource.includes('data-gathering-realm-toggle'), 'toggle button exposes a data hook');
    assert.ok(environmentsBrowserSource.includes('aria-pressed={realmsEnabled}'), 'toggle reflects the enabled flag via aria-pressed');
    assert.ok(environmentsBrowserSource.includes("gatheringRealmSettings?.enabled === true"), 'realmsEnabled derives from the per-system flag');
    assert.ok(environmentsBrowserSource.includes('onSetGatheringRealmsEnabled?.(selectedSystemId, !realmsEnabled)'), 'toggle flips the flag through the store action');
  });

  it('toggle hint names the Travel tab so the GM can connect the toggle to the outcome', () => {
    const hint = lang.FABRICATE.Admin.Manager.Environment.RealmToggle.Hint;
    assert.equal(typeof hint, 'string');
    assert.ok(hint.includes('Travel'), 'hint copy names where Travel lives');
  });

  it('wires the setGatheringRealmsEnabled store action to GatheringRealmStore.updateRealmSettings', () => {
    assert.ok(adminStoreSource.includes('async setGatheringRealmsEnabled('), 'store exposes setGatheringRealmsEnabled');
    assert.ok(adminStoreSource.includes("updateRealmSettings(systemId, { enabled: enabled === true })"), 'action writes the enabled flag via the realm store');
    assert.ok(adminStoreSource.includes('setGatheringRealmsEnabled: travel.setGatheringRealmsEnabled'), 'action is published on the store surface');
    assert.ok(managerRootSource.includes('onSetGatheringRealmsEnabled={(sys, enabled) => store.setGatheringRealmsEnabled?.(sys, enabled)}'), 'root passes the action down');
    assert.ok(managerRootSource.includes("gatheringRealmSettings={$viewState.gatheringRealmSettings"), 'root threads the settings view-model down');
  });

  it('the admin store view-model surfaces gatheringRealmSettings from the realm store', () => {
    assert.ok(adminStoreSource.includes('gatheringRealmSettings:'), 'travel view-model carries gatheringRealmSettings');
    assert.ok(adminStoreSource.includes('realmStore.getRealmSettings(systemId)'), 'view-model reads realm settings from the store');
  });
});

describe('Travel nav gating', () => {
  it('hides the Travel nav item when the flag is off and validates tab resolution against the visible list', () => {
    assert.ok(managerRootSource.includes('const gatheringRealmsEnabled = $derived($viewState.gatheringRealmSettings?.enabled === true)'), 'root derives the gate flag');
    assert.ok(
      managerRootSource.includes("gatheringRealmsEnabled ? gatheringNavItems : gatheringNavItems.filter(tab => tab.id !== 'travel')"),
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
