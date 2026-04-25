/**
 * Source contract tests for the Actor Crafting App header.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(__dirname, '../../src/ui/svelte/apps/ActorCraftingHeader.svelte');
const rootPath = resolve(__dirname, '../../src/ui/svelte/apps/CraftingAppRoot.svelte');
const source = readFileSync(componentPath, 'utf8');
const rootSource = readFileSync(rootPath, 'utf8');

test('ActorCraftingHeader: root app renders the header instead of old selector controls', () => {
  assert.ok(rootSource.includes("import ActorCraftingHeader from './ActorCraftingHeader.svelte'"));
  assert.ok(rootSource.includes('<ActorCraftingHeader'));
  assert.ok(!rootSource.includes("import ActorSelector from './ActorSelector.svelte'"));
  assert.ok(!rootSource.includes("import SourceActorPicker from './SourceActorPicker.svelte'"));
  assert.ok(!rootSource.includes('actor-selection-section'));
});

test('ActorCraftingHeader: selected crafting actor button shows image and name', () => {
  assert.ok(source.includes('class="selected-crafting-actor"'));
  assert.ok(source.includes('selectedCraftingActor?.name'));
  assert.ok(source.includes('src={imageFor(selectedCraftingActor)}'));
  assert.ok(source.includes("onclick={() => toggleMenu('actor')}"));
});

test('ActorCraftingHeader: crafting actor dropdown is searchable and scrollable', () => {
  assert.ok(source.includes('bind:value={actorSearch}'));
  assert.ok(source.includes('filteredCraftingActors'));
  assert.ok(source.includes('max-height: 240px'));
  assert.ok(source.includes('overflow-y: auto'));
});

test('ActorCraftingHeader: component source avatars hide names until hover and support right-click removal', () => {
  assert.ok(source.includes('selectedSourceActors'));
  assert.ok(source.includes('class="component-source-avatar"'));
  assert.ok(source.includes('oncontextmenu={(event) => removeSource(event, actor)}'));
  assert.ok(source.includes('.component-source-avatar__name'));
  assert.ok(source.includes('opacity: 0'));
  assert.ok(source.includes('.component-source-avatar:hover .component-source-avatar__name'));
});

test('ActorCraftingHeader: locked crafting actor source cannot be removed or toggled off', () => {
  assert.ok(source.includes('if (actor?.locked) return;'));
  assert.ok(source.includes('class:component-source-avatar--locked={actor.locked}'));
  assert.ok(source.includes('class:locked={actor.locked}'));
  assert.ok(source.includes('disabled={actor.locked}'));
});

test('ActorCraftingHeader: source editor dropdown toggles owned actors with images', () => {
  assert.ok(source.includes("onclick={() => toggleMenu('sources')}"));
  assert.ok(source.includes('bind:value={sourceSearch}'));
  assert.ok(source.includes('filteredSourceActors'));
  assert.ok(source.includes('role="menuitemcheckbox"'));
  assert.ok(source.includes('onclick={() => toggleSource(actor.id, !actor.selected)}'));
  assert.ok(source.includes('src={imageFor(actor)}'));
});
