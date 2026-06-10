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

test('Fabricate exposes the new gathering location getters and mutators', () => {
  assert.ok(mainSource.includes('getGatheringPartyStore()'), 'getGatheringPartyStore method');
  assert.ok(mainSource.includes('getGatheringRegionStore()'), 'getGatheringRegionStore method');
  assert.ok(mainSource.includes('getGatheringLocationService()'), 'getGatheringLocationService method');
  assert.ok(mainSource.includes('getGatheringLocationForActor('), 'getGatheringLocationForActor method');
  assert.ok(mainSource.includes('setGatheringPartyRegionOverride('), 'setGatheringPartyRegionOverride method');
  assert.ok(mainSource.includes('clearGatheringPartyRegionOverride('), 'clearGatheringPartyRegionOverride method');
  assert.ok(mainSource.includes('revealGatheringRegionForActor('), 'revealGatheringRegionForActor method');
  assert.ok(mainSource.includes('hideGatheringRegionForActor('), 'hideGatheringRegionForActor method');
});

test('Fabricate registers a GM-only discipline on region mutators', () => {
  // The reveal mutator validates region membership via the owning system snapshot.
  assert.ok(mainSource.includes('validateRegionInSystem: system'), 'reveal validates region belongs to system');
});

test('game.fabricate.api exposes the new gathering location classes', () => {
  assert.ok(mainSource.includes('GatheringRegionStore,'), 'GatheringRegionStore in api');
  assert.ok(mainSource.includes('GatheringPartyStore,'), 'GatheringPartyStore in api');
  assert.ok(mainSource.includes('GatheringLocationService,'), 'GatheringLocationService in api');
});

test('game.fabricate.gathering exposes the new location helpers', () => {
  assert.ok(mainSource.includes('getPartyStore: () => fabricate.getGatheringPartyStore()'), 'getPartyStore helper');
  assert.ok(mainSource.includes('getLocationForActor: (options) => fabricate.getGatheringLocationForActor(options)'), 'getLocationForActor helper');
  assert.ok(mainSource.includes('setPartyRegionOverride: (options) => fabricate.setGatheringPartyRegionOverride(options)'), 'setPartyRegionOverride helper');
  assert.ok(mainSource.includes('revealRegionForActor: (options) => fabricate.revealGatheringRegionForActor(options)'), 'revealRegionForActor helper');
});
