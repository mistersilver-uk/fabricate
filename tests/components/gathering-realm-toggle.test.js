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
    assert.ok(
      systemEditSource.includes('aria-pressed={gatheringRealmsEnabled}'),
      'toggle reflects the participation flag via aria-pressed'
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
    // Routing it through the realm store would leave the toggle permanently false: the world
    // travel config carries no `enabled` at all.
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
  it('exposes World > Travel as an ungated world route', () => {
    assert.ok(managerRootSource.includes('id="manager-world-nav-travel"'), 'World exposes Travel');
    assert.ok(managerRootSource.includes('data-world-nav-item="travel"'), 'the Travel entry is a World nav item');
    assert.ok(managerRootSource.includes('id="manager-world-nav-parties"'), 'World still exposes Parties');
    assert.ok(
      managerRootSource.includes("const isWorldTravelRoute = $derived(currentView === 'world-travel')"),
      'the route is its own view token'
    );
    // Ungated: nothing about the selected system may decide whether the route exists.
    assert.equal(managerRootSource.includes('canShowSystemTravel'), false);
    assert.equal(managerRootSource.includes('id="manager-nav-travel"'), false);
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
    assert.equal(managerRootSource.includes("activeGatheringTab = 'travel'; activeView"), false);
  });

  it('renders the World > Travel route from the root, keeping its inspector', () => {
    assert.ok(
      managerRootSource.includes('{:else if isWorldTravelRoute} <!--'),
      'the route renders its own manager-main straight from the root'
    );
    assert.ok(managerRootSource.includes('<GatheringRealmsTab realms={worldRealms}'), 'Realms destination');
    assert.ok(managerRootSource.includes('<GatheringMapLinksTab sceneRegions={mapCurrentSceneRegions}'), 'Map destination');
    // Unlike World > Currency it KEEPS the right-hand inspector: the realm detail pane is the
    // authoring surface, whereas currency's unit editors expand in place.
    assert.ok(
      managerRootSource.includes('{:else if isWorldTravelRoute} <section class="manager-inspector-card manager-travel-inspector"'),
      'the realm/map inspector lives under the new route'
    );
    assert.equal(managerRootSource.includes('!isWorldTravelRoute && !isWorldDowntimeRoute'), false);
  });
});
