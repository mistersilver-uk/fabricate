import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineStructureContract } from '../helpers/structureContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

function read(relPath) {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

// Prettier formats components as of issue 923.
const squish = (value) => value.replace(/\s+/g, ' ');

const systemEditSource = squish(read('src/ui/svelte/apps/manager/SystemEditView.svelte'));
const environmentsBrowserSource = read('src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte');
const managerRootSource = squish(read('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'));
const adminStoreSource = read('src/ui/svelte/stores/adminStore.js');
const systemProjectionSource = read('src/ui/svelte/stores/adminSystemInspectorProjection.js');
const lang = JSON.parse(read('lang/en.json'));

describe('Travel & Realms participation toggle', () => {
  // It moved off the Gathering Settings tab and onto System Settings beside Currency (issue
  // 1282), because what it now says is what Currency's toggle says: whether this crafting
  // system takes part in a WORLD-scope subsystem authored elsewhere.
  it('renders as a System Settings feature tile beside Currency', () => {
    assert.ok(
      systemEditSource.includes('<div class="manager-feature-tile" data-feature-key="gatheringRealms">'),
      'the toggle is a feature tile, structured exactly like the Currency tile'
    );
    assert.ok(systemEditSource.includes('data-gathering-realm-toggle'), 'toggle exposes a data hook');
    // `on=`, not `aria-pressed=` (issue 1040). The tile renders the shared `<StatusToggle>`,
    // which emits `aria-pressed` from that prop — asserting the attribute here would be
    // asserting on markup this file no longer writes, and would pass forever once the tile
    // stopped passing the flag at all.
    assert.ok(
      systemEditSource.includes('on={gatheringRealmsEnabled}'),
      'toggle reflects the participation flag through the shared switch'
    );
    assert.ok(
      systemEditSource.includes(
        'const gatheringRealmsEnabled = $derived(selectedSystem?.gatheringRealmSettings?.enabled === true);'
      ),
      'the tile reads participation off the selected crafting system'
    );
    assert.ok(
      systemEditSource.includes('onclick={handleToggleGatheringRealms}'),
      'the tile flips the flag through its own handler'
    );
    assert.ok(
      systemEditSource.includes('{#if gatheringFeatureEnabled}'),
      'the tile is gathering-gated, as it was on the tab it came from'
    );
  });

  it('the retired Gathering Settings toggle card is gone', () => {
    assert.equal(environmentsBrowserSource.includes('data-gathering-realm-toggle-panel'), false);
    assert.equal(environmentsBrowserSource.includes('data-gathering-realm-toggle'), false);
    assert.equal(environmentsBrowserSource.includes('onSetGatheringRealmsEnabled'), false);
  });

  it('the hint names World > Travel as where realms are authored and states what the toggle does', () => {
    const hint = lang.FABRICATE.Admin.Manager.SystemEdit.FeatureHint.GatheringRealms;
    assert.equal(typeof hint, 'string');
    assert.ok(hint.includes('World > Travel'), 'the hint sends the GM to the world route to author realms');
    assert.ok(
      hint.includes('where the party is'),
      'the hint states the location gate this toggle actually applies'
    );
    assert.ok(
      hint.includes('realm controls'),
      'the hint states that it also gives this system’s environments the realm controls'
    );
    // The old copy promised a per-system `Gathering → Travel` route, which no longer exists.
    assert.equal(hint.includes('Gathering →'), false);
    assert.equal(lang.FABRICATE.Admin.Manager.Environment.RealmToggle, undefined);
  });

  it('wires setGatheringRealmsEnabled to a CRAFTING SYSTEM write, not the world travel config', () => {
    assert.ok(
      adminStoreSource.includes('async function setGatheringRealmsEnabled(systemId, enabled)'),
      'store exposes setGatheringRealmsEnabled'
    );
    assert.ok(
      adminStoreSource.includes(
        "await systemManager.updateSystem(sysId, {\n      gatheringRealmSettings: { enabled: enabled === true },\n    });"
      ),
      'the action writes participation onto the system'
    );
    // Routing it through the realm store would leave the toggle permanently false.
    assert.equal(adminStoreSource.includes('updateRealmSettings(systemId'), false);
    assert.ok(
      managerRootSource.includes(
        'onToggleGatheringRealms={(next) => store.setGatheringRealmsEnabled?.(selectedSystemId, next)}'
      ),
      'root passes the action down to the System Settings page'
    );
    assert.ok(
      systemProjectionSource.includes('gatheringRealmSettings: {\n      enabled: selectedSystem.gatheringRealmSettings?.enabled === true,\n    },'),
      'the selected-system projection carries participation and nothing else'
    );
  });

  it('the travel view-model separates system participation from world realm behaviour', () => {
    assert.ok(adminStoreSource.includes('gatheringRealmSettings: {'), 'travel view-model carries gatheringRealmSettings');
    assert.ok(
      adminStoreSource.includes('enabled: isGatheringRealmsEnabled('),
      'enabled comes from the selected crafting system'
    );
    assert.ok(
      adminStoreSource.includes('? realmStore.getRealmSettings()'),
      'reveal mode and modifier visibility come from the world travel config'
    );
  });
});

describe('World and Travel navigation', () => {
  // The four rail-markup claims this used to make are retired rather than re-pointed at
  // `ManagerWorldNav.svelte` (issue 1717): `#manager-world-nav-travel`, its `data-world-nav-item`,
  // `#manager-world-nav-parties` and the absence of `#manager-nav-travel` are each recorded by the
  // rail census in `tests/components/manager-rail-mounted.js`, which pins the complete element
  // list, so an added or renamed entry is a moved row. What stays here is the half the shell still
  // owns: the route token, and that nothing about the selected system gates it.
  it('exposes World > Travel as an ungated world route', () => {
    assert.ok(
      managerRootSource.includes("const isWorldTravelRoute = $derived(currentView === 'world-travel')"),
      'the route is its own view token'
    );
    // Ungated: nothing about the selected system may decide whether the route exists.
    assert.equal(managerRootSource.includes('canShowSystemTravel'), false);
    assert.equal(managerRootSource.includes('manager-system-travel-group'), false);
  });

  it('gives World > Travel its own tab state so Parties cannot move it', () => {
    assert.ok(
      managerRootSource.includes("let worldTravelTab = $state('realms')"),
      'the World > Travel destination is its own state'
    );
    // The single shared variable is exactly why entering Parties used to have to set
    // `activeGatheringTab = 'travel'`. Untangled, Parties keeps `activeTravelTab` alone.
    assert.ok(
      managerRootSource.includes(
        "function openWorldParties() { return afterTruthyResult(confirmRouteExit('world'), () => { activeTravelTab = 'parties'; activeView = 'world'; }); }"
      ),
      'entering Parties no longer reaches into the gathering tab state'
    );
  });

  // Read off the whole entry, so a write through the gathering route model's setter is caught too.
  defineStructureContract(
    'entering Parties leaves the gathering tab alone',
    { file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte', fn: 'openWorldParties' },
    { namesNo: ['activeGatheringTab'] }
  );

  it('renders the World > Travel route from the root, keeping its inspector', () => {
    assert.ok(
      managerRootSource.includes('{:else if isWorldTravelRoute} <!--'),
      'the route renders its own manager-main straight from the root'
    );
    assert.ok(managerRootSource.includes('<GatheringRealmsTab realms={worldRealms}'), 'Realms destination');
    assert.ok(managerRootSource.includes('<GatheringMapLinksTab sceneRegions={mapCurrentSceneRegions}'), 'Map destination');
    // Unlike World > Currency it keeps the right-hand inspector. Its markup moved into
    // `world/TravelInspector.svelte` at issue 1707 phase 2 and the arm that selects it into
    // `environment/GatheringInspectorRail.svelte` at phase 3, so neither is root source text any
    // more: `manager-world-scope-mounted.js` asserts the realms route reaches
    // `.manager-travel-inspector` through the root, and the card is pinned by count in
    // `inspector-card-source-contract.test.js`.
    assert.equal(managerRootSource.includes('!isWorldTravelRoute && !isWorldDowntimeRoute'), false);
  });
});
