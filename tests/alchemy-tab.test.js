/**
 * Tests for Task 11: AlchemyTab.svelte
 * Verifies the component structure and child wiring without the Svelte compiler.
 * Uses source-code assertions for layout class presence and import checks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '../src/ui/svelte/apps/AlchemyTab.svelte');
const source = readFileSync(componentPath, 'utf8');

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

test('AlchemyTab: imports AlchemySystemSelector', () => {
  assert.ok(
    source.includes("import AlchemySystemSelector from './AlchemySystemSelector.svelte'"),
    'must import AlchemySystemSelector'
  );
});

test('AlchemyTab: imports ComponentPalette', () => {
  assert.ok(
    source.includes("import ComponentPalette from './ComponentPalette.svelte'"),
    'must import ComponentPalette'
  );
});

test('AlchemyTab: imports Workbench', () => {
  assert.ok(
    source.includes("import WorkbenchComponent from './Workbench.svelte'"),
    'must import Workbench'
  );
});

test('AlchemyTab: imports DiscoveredRecipesPanel', () => {
  assert.ok(
    source.includes("import DiscoveredRecipesPanel from './DiscoveredRecipesPanel.svelte'"),
    'must import DiscoveredRecipesPanel'
  );
});

test('AlchemyTab: imports RunSummary', () => {
  assert.ok(
    source.includes("import RunSummary from './RunSummary.svelte'"),
    'must import RunSummary'
  );
});

// ---------------------------------------------------------------------------
// Store subscriptions
// ---------------------------------------------------------------------------

test('AlchemyTab: subscribes to selectedAlchemySystem store', () => {
  assert.ok(source.includes('selectedAlchemySystem'), 'must reference selectedAlchemySystem');
  assert.ok(source.includes('store.selectedAlchemySystem'), 'must pull from store');
});

test('AlchemyTab: subscribes to alchemySystems store', () => {
  assert.ok(source.includes('store.alchemySystems'), 'must reference store.alchemySystems');
});

test('AlchemyTab: subscribes to palette store', () => {
  assert.ok(source.includes('store.palette'), 'must reference store.palette');
});

test('AlchemyTab: subscribes to workbench store', () => {
  assert.ok(source.includes('store.workbench'), 'must reference store.workbench');
});

test('AlchemyTab: subscribes to discoveredRecipes store', () => {
  assert.ok(source.includes('store.discoveredRecipes'), 'must reference store.discoveredRecipes');
});

test('AlchemyTab: subscribes to discoveredRecipeSearch store', () => {
  assert.ok(source.includes('store.discoveredRecipeSearch'), 'must reference store.discoveredRecipeSearch');
});

test('AlchemyTab: subscribes to discoveredCraftableOnly store', () => {
  assert.ok(source.includes('store.discoveredCraftableOnly'), 'must reference store.discoveredCraftableOnly');
});

test('AlchemyTab: subscribes to viewState store', () => {
  assert.ok(source.includes('store.viewState'), 'must reference store.viewState');
});

// ---------------------------------------------------------------------------
// Layout classes
// ---------------------------------------------------------------------------

test('AlchemyTab: has .alchemy-tab-panels wrapper', () => {
  assert.ok(source.includes('alchemy-tab-panels'), 'must have .alchemy-tab-panels class');
});

test('AlchemyTab: has .alchemy-tab-left panel', () => {
  assert.ok(source.includes('alchemy-tab-left'), 'must have .alchemy-tab-left class');
});

test('AlchemyTab: has .alchemy-tab-right panel', () => {
  assert.ok(source.includes('alchemy-tab-right'), 'must have .alchemy-tab-right class');
});

// ---------------------------------------------------------------------------
// Child component wiring
// ---------------------------------------------------------------------------

test('AlchemyTab: wires onSelectSystem to store.selectAlchemySystem', () => {
  assert.ok(
    source.includes('store.selectAlchemySystem'),
    'AlchemySystemSelector must be wired to store.selectAlchemySystem'
  );
});

test('AlchemyTab: wires onAddToWorkbench to store.addToWorkbench', () => {
  assert.ok(
    source.includes('store.addToWorkbench'),
    'ComponentPalette must be wired to store.addToWorkbench'
  );
});

test('AlchemyTab: wires onRemoveFromWorkbench to store.removeFromWorkbench', () => {
  assert.ok(
    source.includes('store.removeFromWorkbench'),
    'ComponentPalette and Workbench must be wired to store.removeFromWorkbench'
  );
});

test('AlchemyTab: wires onClearWorkbench to store.clearWorkbench', () => {
  assert.ok(
    source.includes('store.clearWorkbench'),
    'Workbench must be wired to store.clearWorkbench'
  );
});

test('AlchemyTab: wires onSubmitWorkbench to store.submitWorkbench', () => {
  assert.ok(
    source.includes('store.submitWorkbench'),
    'Workbench must be wired to store.submitWorkbench'
  );
});

test('AlchemyTab: wires onSearch to store.setDiscoveredRecipeSearch', () => {
  assert.ok(
    source.includes('store.setDiscoveredRecipeSearch'),
    'DiscoveredRecipesPanel must be wired to store.setDiscoveredRecipeSearch'
  );
});

test('AlchemyTab: wires onToggleCraftableOnly to store.toggleDiscoveredCraftableOnly', () => {
  assert.ok(
    source.includes('store.toggleDiscoveredCraftableOnly'),
    'DiscoveredRecipesPanel must be wired to store.toggleDiscoveredCraftableOnly'
  );
});

test('AlchemyTab: wires onAutoFill to store.autoFill', () => {
  assert.ok(
    source.includes('store.autoFill'),
    'DiscoveredRecipesPanel must be wired to store.autoFill'
  );
});

// ---------------------------------------------------------------------------
// CSS layout rules
// ---------------------------------------------------------------------------

test('AlchemyTab: CSS defines .alchemy-tab-panels with flex display', () => {
  assert.ok(source.includes('.alchemy-tab-panels'), 'CSS must include .alchemy-tab-panels rule');
  const idx = source.indexOf('.alchemy-tab-panels');
  const blockStart = source.indexOf('{', idx);
  const blockEnd = source.indexOf('}', blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.ok(block.includes('flex'), '.alchemy-tab-panels must use flex layout');
});

test('AlchemyTab: CSS defines .alchemy-tab-left with flex-direction column', () => {
  assert.ok(source.includes('.alchemy-tab-left'), 'CSS must include .alchemy-tab-left rule');
  const idx = source.indexOf('.alchemy-tab-left');
  const blockStart = source.indexOf('{', idx);
  const blockEnd = source.indexOf('}', blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.ok(block.includes('column'), '.alchemy-tab-left must use flex-direction: column');
});

test('AlchemyTab: CSS defines .alchemy-tab-right with border-left', () => {
  assert.ok(source.includes('.alchemy-tab-right'), 'CSS must include .alchemy-tab-right rule');
  const idx = source.indexOf('.alchemy-tab-right');
  const blockStart = source.indexOf('{', idx);
  const blockEnd = source.indexOf('}', blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.ok(block.includes('border-left'), '.alchemy-tab-right must have a border-left separator');
});
