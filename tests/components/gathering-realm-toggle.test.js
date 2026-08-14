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

// Prettier formats components as of issue 923, so a source-contract assertion must not depend
// on where the formatter chose to break a line. Match against a whitespace-collapsed copy and
// write needles in the formatter's own idiom — `arrowParens: 'always'` means `(tab) =>`.
const squish = (value) => value.replace(/\s+/g, ' ');

const environmentsBrowserSource = read('src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const managerRootSource = squish(read('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'));
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

  it('toggle hint names the World destinations revealed by the setting', () => {
    const hint = lang.FABRICATE.Admin.Manager.Environment.RealmToggle.Hint;
    assert.equal(typeof hint, 'string');
    assert.ok(hint.includes('World → Parties'), 'hint copy names the global Parties path');
    assert.ok(hint.includes('World → Travel'), 'hint copy names the selected-system Travel path');
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

describe('World navigation gating', () => {
  it('gates the World section on Gathering plus Travel & Realms without restoring Gathering Travel', () => {
    assert.ok(managerRootSource.includes('const gatheringRealmsEnabled = $derived($viewState.gatheringRealmSettings?.enabled === true)'), 'root derives the gate flag');
    assert.ok(
      managerRootSource.includes('const canShowWorldTravel = $derived(canShowEnvironments && gatheringRealmsEnabled)'),
      'World requires both the selected-system Gathering gate and Travel & Realms'
    );
    assert.ok(managerRootSource.includes('{#if canShowWorldTravel} <section class="manager-world-nav"'), 'the derived gate controls the World section');
    assert.ok(managerRootSource.includes('id="manager-world-nav-parties"'), 'World exposes Parties');
    assert.ok(managerRootSource.includes('id="manager-world-nav-travel"'), 'World exposes Travel');
    assert.equal(
      managerRootSource.includes("id: 'travel', icon: 'fas fa-route'"),
      false,
      'Gathering no longer declares a Travel nav item'
    );
  });

  it('falls back to Gathering Environments when the World gate closes', () => {
    assert.ok(
      managerRootSource.includes("activeGatheringTab === 'travel' && !canShowWorldTravel ? 'environments' : activeGatheringTab"),
      'a hidden World route projects to Gathering Environments immediately'
    );
    assert.ok(
      managerRootSource.includes("if (!visibleGatheringNavItems.some((tab) => tab.id === activeGatheringTab)) { activeGatheringTab = 'environments'; }"),
      'route normalization clears the stale internal travel route'
    );
  });
});
