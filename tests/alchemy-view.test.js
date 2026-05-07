/**
 * Tests for actor-app/AlchemyView.svelte (V2).
 * Replaces the legacy alchemy-tab tests after the AlchemyTab → AlchemyView
 * rewrite in the actor-crafting-app-v2 change. Source-code assertions only —
 * mounted behaviour is covered by store/component-level tests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '../src/ui/svelte/apps/actor-app/AlchemyView.svelte');
const source = readFileSync(componentPath, 'utf8');

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

test('AlchemyView: imports AlchemySystemSelector', () => {
  assert.ok(
    source.includes("import AlchemySystemSelector from '../AlchemySystemSelector.svelte'"),
    'must import AlchemySystemSelector from sibling apps folder'
  );
});

test('AlchemyView: imports ComponentPalette', () => {
  assert.ok(
    source.includes("import ComponentPalette from '../ComponentPalette.svelte'"),
    'must import ComponentPalette'
  );
});

test('AlchemyView: imports Workbench as WorkbenchComponent', () => {
  assert.ok(
    source.includes("import WorkbenchComponent from '../Workbench.svelte'"),
    'must import Workbench'
  );
});

test('AlchemyView: imports DiscoveredRecipesPanel', () => {
  assert.ok(
    source.includes("import DiscoveredRecipesPanel from '../DiscoveredRecipesPanel.svelte'"),
    'must import DiscoveredRecipesPanel'
  );
});

test('AlchemyView: imports RunBands from actor-app', () => {
  assert.ok(
    source.includes("import RunBands from './RunBands.svelte'"),
    'must import RunBands sibling component'
  );
});

test('AlchemyView: imports SelectedDiscoveredRecipeCard', () => {
  assert.ok(
    source.includes("import SelectedDiscoveredRecipeCard from './SelectedDiscoveredRecipeCard.svelte'"),
    'must import SelectedDiscoveredRecipeCard'
  );
});

test('AlchemyView: imports PaletteAvailabilityLegend', () => {
  assert.ok(
    source.includes("import PaletteAvailabilityLegend from './PaletteAvailabilityLegend.svelte'"),
    'must import PaletteAvailabilityLegend'
  );
});

// ---------------------------------------------------------------------------
// Store subscriptions
// ---------------------------------------------------------------------------

test('AlchemyView: subscribes to selectedAlchemySystem store', () => {
  assert.ok(source.includes('store.selectedAlchemySystem'), 'must reference store.selectedAlchemySystem');
});

test('AlchemyView: subscribes to alchemySystems store', () => {
  assert.ok(source.includes('store.alchemySystems'), 'must reference store.alchemySystems');
});

test('AlchemyView: subscribes to palette store', () => {
  assert.ok(source.includes('store.palette'), 'must reference store.palette');
});

test('AlchemyView: subscribes to workbench store', () => {
  assert.ok(source.includes('store.workbench'), 'must reference store.workbench');
});

test('AlchemyView: subscribes to discoveredRecipes store', () => {
  assert.ok(source.includes('store.discoveredRecipes'), 'must reference store.discoveredRecipes');
});

test('AlchemyView: subscribes to selectedDiscoveredRecipe store', () => {
  assert.ok(source.includes('store.selectedDiscoveredRecipe'), 'must reference store.selectedDiscoveredRecipe');
});

test('AlchemyView: subscribes to viewState store', () => {
  assert.ok(source.includes('store.viewState'), 'must reference store.viewState');
});

// ---------------------------------------------------------------------------
// Layout classes (V2 BEM)
// ---------------------------------------------------------------------------

test('AlchemyView: has .alchemy-view root', () => {
  assert.ok(source.includes('class="alchemy-view'), 'must have .alchemy-view root class');
});

test('AlchemyView: has .alchemy-view__grid for the three-column layout', () => {
  assert.ok(source.includes('alchemy-view__grid'), 'must declare grid layout class');
});

test('AlchemyView: has columns for components, workbench, and discovered', () => {
  assert.ok(source.includes('alchemy-view__column--components'));
  assert.ok(source.includes('alchemy-view__column--workbench'));
  assert.ok(source.includes('alchemy-view__column--discovered'));
});

test('AlchemyView: scoped CSS uses container queries, not viewport @media', () => {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(styleMatch, 'AlchemyView must have a scoped <style> block');
  const scoped = styleMatch[1];
  assert.ok(!scoped.match(/@media\s*\(/), 'scoped CSS must not use viewport @media');
  assert.ok(scoped.includes('@container actor-app'), 'scoped CSS must use @container actor-app queries');
});

// ---------------------------------------------------------------------------
// Child component wiring
// ---------------------------------------------------------------------------

test('AlchemyView: wires onSelectSystem to store.selectAlchemySystem', () => {
  assert.ok(source.includes('store.selectAlchemySystem'));
});

test('AlchemyView: wires onAddToWorkbench / onRemoveFromWorkbench / onClearWorkbench / onSubmitWorkbench', () => {
  assert.ok(source.includes('store.addToWorkbench'));
  assert.ok(source.includes('store.removeFromWorkbench'));
  assert.ok(source.includes('store.clearWorkbench'));
  assert.ok(source.includes('store.submitWorkbench'));
});

test('AlchemyView: wires onSearch / onToggleCraftableOnly / onAutoFill on the discovered panel', () => {
  assert.ok(source.includes('store.setDiscoveredRecipeSearch'));
  assert.ok(source.includes('store.toggleDiscoveredCraftableOnly'));
  assert.ok(source.includes('store.autoFill'));
});

test('AlchemyView: wires onSelectRecipe to store.selectDiscoveredRecipe', () => {
  assert.ok(source.includes('store.selectDiscoveredRecipe'), 'must wire row selection through the new store action');
});

// ---------------------------------------------------------------------------
// Mix counter
// ---------------------------------------------------------------------------

test('AlchemyView: renders the Current Mix counter chip', () => {
  assert.ok(
    source.includes('alchemy-view__mix-counter'),
    'must render the Current Mix chip in the workbench column header'
  );
  assert.ok(
    source.includes('FABRICATE.ActorApp.Alchemy.CurrentMix'),
    'must use the localized current-mix copy'
  );
});
