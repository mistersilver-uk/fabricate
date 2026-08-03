import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainPath = resolve(__dirname, '../src/main.js');
const mainSource = readFileSync(mainPath, 'utf8');

test('Fabricate exposes deleteRecipe on the main Foundry API object', () => {
  assert.ok(
    mainSource.includes('async deleteRecipe(recipeId)'),
    'Fabricate should expose a deleteRecipe method on the main game.fabricate API object'
  );
  assert.ok(
    mainSource.includes('return await this.recipeManager.deleteRecipe(recipeId);'),
    'Fabricate.deleteRecipe should delegate to RecipeManager.deleteRecipe'
  );
});

test('Fabricate bridges replicated crafting-data setting changes into local refresh hooks', () => {
  assert.ok(
    mainSource.includes("import { handleFabricateSettingChange } from './config/settingChangeBridge.js'"),
    'main.js should import the setting-change bridge'
  );
  assert.ok(
    mainSource.includes('handleFabricateSettingChange(key, {'),
    'the updateSetting hook should invoke the bridge with the changed key'
  );
  assert.ok(
    mainSource.includes('craftingSystemManager: fabricate.craftingSystemManager') &&
      mainSource.includes('recipeManager: fabricate.recipeManager'),
    'the bridge should receive both live managers so cross-client reloads apply'
  );
});

test('Fabricate routes gathering node depletion to the active GM', () => {
  // A player cannot write the world setting the environment node pools live in, so
  // the decrement MUST be relayed. These pin the wiring: the pure routing module is
  // unit-tested elsewhere, but every one of those tests stays green if main.js never
  // injects the seam or never registers the inbound route.
  assert.ok(
    mainSource.includes('createGatheringNodeDepletionWriter') &&
      mainSource.includes('routeGatheringNodeDepleteMessage') &&
      mainSource.includes("from './systems/gatheringNodeSocket.js'"),
    'main.js should import the gathering node depletion writer and router'
  );
  assert.ok(
    mainSource.includes('allowSender: gatheringDepletionRateLimiter'),
    'the inbound route should be rate limited per sender'
  );
  assert.ok(
    mainSource.includes('depleteEnvironmentNode: (payload) => this.gatheringNodeDepletionWriter.deplete(payload)'),
    'the rich-state service should receive the GM-routed depletion seam'
  );
  assert.ok(
    mainSource.includes('routeGatheringNodeDepleteMessage(payload, {'),
    'the module socket handler should route inbound depletion messages'
  );
  assert.ok(
    mainSource.includes('gatheringEnvironmentStore: fabricate.gatheringEnvironmentStore'),
    'the setting-change bridge should receive the environment store so clients reload node counts'
  );
});

test('Fabricate gates matured timed gathering runs to the primary GM', () => {
  // `resumeTimedRuns` defaults to `() => true` so unit fixtures resume, which makes
  // this wiring load-bearing: without it EVERY connected client resolves the same
  // matured run and double-applies its items, tool wear and node depletion.
  assert.ok(
    mainSource.includes('resumeTimedRuns: isPrimaryGM'),
    'the gathering engine should receive the real primary-GM check for timed resumption'
  );
});

test('Fabricate wires RecipeManager to the live crafting-system manager', () => {
  assert.match(
    mainSource,
    /this\.recipeManager\s*=\s*new RecipeManager\(\{\s*getCraftingSystem:\s*\(systemId\)\s*=>\s*this\.craftingSystemManager\?\.getSystem\?\.\(systemId\)\s*\?\?\s*null,?\s*\}\)/s,
    'RecipeManager production initialization should receive the live crafting-system resolver'
  );
});

test('Fabricate macro helper exposes deleteRecipe', () => {
  assert.ok(
    mainSource.includes('deleteRecipe: async (recipeId) => {'),
    'the global fabricate helper should expose deleteRecipe'
  );
  assert.ok(
    mainSource.includes('return await game.fabricate.deleteRecipe(recipeId);'),
    'the global fabricate helper should delegate to game.fabricate.deleteRecipe'
  );
});

test('Fabricate exposes the canonical gathering location getters and mutators', () => {
  assert.ok(mainSource.includes('getGatheringPartyStore()'), 'getGatheringPartyStore method');
  assert.ok(mainSource.includes('getGatheringRealmStore()'), 'getGatheringRealmStore method');
  assert.ok(mainSource.includes('getGatheringLocationService()'), 'getGatheringLocationService method');
  assert.ok(mainSource.includes('getGatheringLocationForActor('), 'getGatheringLocationForActor method');
  assert.ok(mainSource.includes('setGatheringPartyRealmOverride('), 'setGatheringPartyRealmOverride method');
  assert.ok(mainSource.includes('clearGatheringPartyRealmOverride('), 'clearGatheringPartyRealmOverride method');
  assert.ok(mainSource.includes('revealGatheringRealmForActor('), 'revealGatheringRealmForActor method');
  assert.ok(mainSource.includes('hideGatheringRealmForActor('), 'hideGatheringRealmForActor method');
});

test('Fabricate retains the deprecated *Region* delegates that forward to the realm methods', () => {
  assert.ok(mainSource.includes('getGatheringRegionStore()'), 'getGatheringRegionStore delegate');
  assert.ok(mainSource.includes('setGatheringPartyRegionOverride('), 'setGatheringPartyRegionOverride delegate');
  assert.ok(mainSource.includes('clearGatheringPartyRegionOverride('), 'clearGatheringPartyRegionOverride delegate');
  assert.ok(mainSource.includes('revealGatheringRegionForActor('), 'revealGatheringRegionForActor delegate');
  assert.ok(mainSource.includes('hideGatheringRegionForActor('), 'hideGatheringRegionForActor delegate');
  // The delegates forward to the canonical realm method via the shared deprecate() helper.
  assert.ok(mainSource.includes("deprecate('getGatheringRegionStore', 'getGatheringRealmStore')"), 'getGatheringRegionStore warns + forwards');
  assert.ok(mainSource.includes('return this.getGatheringRealmStore();'), 'delegate forwards to canonical realm method');
});

test('the location API methods gate on isGatheringRealmsEnabled (no-op when disabled)', () => {
  // The five public location entry points must short-circuit when the
  // realm/travel subsystem is disabled for the target system, reading the
  // single shared predicate so the gate never drifts from the engine/resolver.
  assert.ok(
    mainSource.includes("import { isGatheringRealmsEnabled } from './systems/gatheringRealms.js';"),
    'main.js imports the shared isGatheringRealmsEnabled predicate'
  );
  // Each guard resolves the system via craftingSystemManager and bails before doing work.
  assert.ok(
    mainSource.includes('if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;'),
    'getGatheringLocationForActor / set / clear overrides no-op (null) when disabled'
  );
  assert.ok(
    mainSource.includes('if (!isGatheringRealmsEnabled(system)) return Promise.resolve(false);'),
    'revealGatheringRealmForActor no-ops (false) when disabled'
  );
  assert.ok(
    mainSource.includes('if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return Promise.resolve(false);'),
    'hideGatheringRealmForActor no-ops (false) when disabled'
  );
});

test('Fabricate registers a GM-only discipline on realm mutators', () => {
  // The reveal mutator validates realm membership via the owning system snapshot.
  assert.ok(mainSource.includes('validateRealmInSystem: system'), 'reveal validates realm belongs to system');
});

test('game.fabricate.api exposes the canonical realm class + deprecated alias', () => {
  assert.ok(mainSource.includes('GatheringRealmStore,'), 'GatheringRealmStore canonical in api');
  assert.ok(mainSource.includes('GatheringRegionStore: GatheringRealmStore,'), 'GatheringRegionStore alias in api');
  assert.ok(mainSource.includes('GatheringPartyStore,'), 'GatheringPartyStore in api');
  assert.ok(mainSource.includes('GatheringLocationService,'), 'GatheringLocationService in api');
});

test('game.fabricate.gathering exposes the canonical realm helpers', () => {
  assert.ok(mainSource.includes('getPartyStore: () => fabricate.getGatheringPartyStore()'), 'getPartyStore helper');
  assert.ok(mainSource.includes('getRealmStore: () => fabricate.getGatheringRealmStore()'), 'getRealmStore helper');
  assert.ok(mainSource.includes('getLocationForActor: (options) => fabricate.getGatheringLocationForActor(options)'), 'getLocationForActor helper');
  assert.ok(mainSource.includes('setPartyRealmOverride: (options) => fabricate.setGatheringPartyRealmOverride(options)'), 'setPartyRealmOverride helper');
  assert.ok(mainSource.includes('revealRealmForActor: (options) => fabricate.revealGatheringRealmForActor(options)'), 'revealRealmForActor helper');
});
