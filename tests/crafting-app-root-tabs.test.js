/**
 * Tests for Task 13: CraftingAppRoot tab navigation restructure
 * Verifies the tab bar markup, tab switching logic, and AlchemyTab integration.
 * Uses source-code assertions (no Svelte compiler needed).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '../src/ui/svelte/apps/CraftingAppRoot.svelte');
const source = readFileSync(componentPath, 'utf8');

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

test('CraftingAppRoot: imports AlchemyView from actor-app', () => {
  assert.ok(
    source.includes("import AlchemyView from './actor-app/AlchemyView.svelte'"),
    'must import AlchemyView from actor-app folder'
  );
});

test('CraftingAppRoot: imports CraftingView from actor-app', () => {
  assert.ok(
    source.includes("import CraftingView from './actor-app/CraftingView.svelte'"),
    'must import CraftingView from actor-app folder'
  );
});

// ---------------------------------------------------------------------------
// Store subscriptions
// ---------------------------------------------------------------------------

test('CraftingAppRoot: subscribes to showTabBar store', () => {
  assert.ok(source.includes('store.showTabBar'), 'must reference store.showTabBar');
});

test('CraftingAppRoot: subscribes to activeTab store', () => {
  assert.ok(source.includes('store.activeTab'), 'must reference store.activeTab');
});

test('CraftingAppRoot: subscribes to hasAlchemyTab store', () => {
  assert.ok(source.includes('store.hasAlchemyTab'), 'must reference store.hasAlchemyTab');
});

test('CraftingAppRoot: subscribes to hasCraftingTab store', () => {
  assert.ok(source.includes('store.hasCraftingTab'), 'must reference store.hasCraftingTab');
});

// ---------------------------------------------------------------------------
// Tab bar markup
// ---------------------------------------------------------------------------

test('CraftingAppRoot: has conditional tab bar using showTabBar', () => {
  assert.ok(source.includes('$showTabBar'), 'tab bar must be conditional on $showTabBar');
  assert.ok(source.includes('fabricate-tab-bar'), 'must have .fabricate-tab-bar element');
});

test('CraftingAppRoot: tab bar has role="tablist"', () => {
  assert.ok(source.includes('role="tablist"'), 'tab bar nav must have role="tablist"');
});

test('CraftingAppRoot: alchemy tab button has role="tab"', () => {
  // Check that the alchemy tab button is present with role="tab"
  assert.ok(source.includes('role="tab"'), 'tab buttons must have role="tab"');
});

test('CraftingAppRoot: alchemy tab active class bound to activeTab', () => {
  assert.ok(
    source.includes("$activeTab === 'alchemy'"),
    "alchemy tab active state must check $activeTab === 'alchemy'"
  );
});

test('CraftingAppRoot: crafting tab active class bound to activeTab', () => {
  assert.ok(
    source.includes("$activeTab === 'crafting'"),
    "crafting tab active state must check $activeTab === 'crafting'"
  );
});

test('CraftingAppRoot: alchemy tab onclick calls store.setActiveTab', () => {
  assert.ok(
    source.includes('store.setActiveTab'),
    'tab buttons must call store.setActiveTab'
  );
});

// ---------------------------------------------------------------------------
// Tab content switching
// ---------------------------------------------------------------------------

test('CraftingAppRoot: renders AlchemyView when alchemy is active', () => {
  assert.ok(source.includes('<AlchemyView'), 'must render AlchemyView component');
});

test('CraftingAppRoot: renders CraftingView when crafting is active', () => {
  assert.ok(source.includes('<CraftingView'), 'must render CraftingView component');
});

test('CraftingAppRoot: passes store to AlchemyView', () => {
  assert.ok(
    source.includes('<AlchemyView {store}'),
    'AlchemyView must receive {store} prop'
  );
});

test('CraftingAppRoot: hasAlchemyTab controls AlchemyView rendering', () => {
  assert.ok(
    source.includes('$hasAlchemyTab'),
    'AlchemyView rendering must check $hasAlchemyTab'
  );
});

// ---------------------------------------------------------------------------
// Tab bar CSS
// ---------------------------------------------------------------------------

test('CraftingAppRoot: CSS defines .fabricate-tab-bar', () => {
  assert.ok(source.includes('.fabricate-tab-bar'), 'CSS must include .fabricate-tab-bar rule');
});

test('CraftingAppRoot: CSS defines .fabricate-tab', () => {
  assert.ok(source.includes('.fabricate-tab'), 'CSS must include .fabricate-tab rule');
});

test('CraftingAppRoot: CSS defines .fabricate-tab.active', () => {
  assert.ok(source.includes('.fabricate-tab.active'), 'CSS must include .fabricate-tab.active rule');
});

// ---------------------------------------------------------------------------
// Localization keys
// ---------------------------------------------------------------------------

test('CraftingAppRoot: localizes alchemy tab label', () => {
  assert.ok(
    source.includes("'FABRICATE.Tabs.Alchemy'"),
    "must localize 'FABRICATE.Tabs.Alchemy'"
  );
});

test('CraftingAppRoot: localizes crafting tab label', () => {
  assert.ok(
    source.includes("'FABRICATE.Tabs.Crafting'"),
    "must localize 'FABRICATE.Tabs.Crafting'"
  );
});

// ---------------------------------------------------------------------------
// No old inline AlchemySubmitPanel
// ---------------------------------------------------------------------------

test('CraftingAppRoot: does not directly import AlchemySubmitPanel', () => {
  assert.ok(
    !source.includes("import AlchemySubmitPanel"),
    'AlchemySubmitPanel should not be directly imported in CraftingAppRoot (it lives in CraftingTab)'
  );
});
