import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-shopping-list-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/ShoppingList.svelte'
});

function aggregate(overrides = {}) {
  return {
    ingredients: [
      {
        componentId: 'c1',
        name: 'Spring Water',
        img: 'icons/water.webp',
        description: '4x Spring Water',
        totalNeed: 4,
        have: 2,
        missing: 2,
        satisfied: false
      },
      {
        componentId: 'c2',
        name: 'Red Herb',
        img: 'icons/herb.webp',
        description: '2x Red Herb',
        totalNeed: 2,
        have: 2,
        missing: 0,
        satisfied: true
      }
    ],
    essences: [],
    tools: [],
    allSatisfied: false,
    totalRecipes: 1,
    totalQuantity: 2,
    ...overrides
  };
}

const ENTRY = { recipeId: 'recipe-1', quantity: 2, name: 'Healing Potion', img: null };

function summaryCount(target, kind) {
  return target
    .querySelector(`[data-summary="${kind}"] .crafting-shopping-summary-count`)
    .textContent.trim();
}

describe('ShoppingList mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('always renders the three summary cards; empty state with no queued recipes', async () => {
    const target = await harness.mount({ aggregate: null, entries: [] });
    assert.equal(
      target.querySelectorAll('.crafting-shopping-summary-card').length,
      3,
      'three summary cards always shown'
    );
    assert.ok(target.querySelector('[data-crafting-shopping-empty]'), 'empty state shown');
    assert.equal(target.querySelector('[data-shopping-entry]'), null, 'no queue entries');
    assert.equal(summaryCount(target, 'recipes'), '0');
  });

  it('summarises the plan and lists only the missing components (owned drop out)', async () => {
    const target = await harness.mount({ aggregate: aggregate(), entries: [ENTRY] });

    assert.equal(summaryCount(target, 'recipes'), '1', 'planned recipes');
    assert.equal(summaryCount(target, 'components'), '1', 'one missing component (fully-owned dropped)');
    assert.equal(summaryCount(target, 'tools'), '0');

    assert.ok(target.querySelector('[data-shopping-entry="recipe-1"]'), 'queued recipe rendered');

    const card = target.querySelector('[data-shopping-acquire-components]');
    assert.ok(card, 'acquire-components card rendered');
    const rows = card.querySelectorAll('.crafting-shopping-acquire-row');
    assert.equal(rows.length, 1, 'only the unsatisfied component appears');
    assert.match(rows[0].textContent, /Spring Water/);
    const chip = rows[0].querySelector('.crafting-shopping-chip.tone-danger');
    assert.ok(chip, 'red owned chip');
    assert.match(chip.textContent, /Owned/, 'chip uses the owned localization key');
  });

  it('hides the acquire-components card when nothing is missing', async () => {
    const satisfied = aggregate({
      ingredients: [
        {
          componentId: 'c1',
          name: 'Spring Water',
          img: null,
          description: '2x Spring Water',
          totalNeed: 2,
          have: 2,
          missing: 0,
          satisfied: true
        }
      ],
      allSatisfied: true
    });
    const target = await harness.mount({ aggregate: satisfied, entries: [ENTRY] });
    assert.equal(target.querySelector('[data-shopping-acquire-components]'), null, 'no components card');
    assert.equal(summaryCount(target, 'components'), '0');
  });

  it('folds a missing essence into the components list with an essence icon', async () => {
    const target = await harness.mount({
      aggregate: aggregate({
        ingredients: [],
        essences: [{ type: 'fire', name: 'Fire', totalNeed: 2, have: 0, missing: 2, satisfied: false }]
      }),
      entries: [ENTRY]
    });
    const card = target.querySelector('[data-shopping-acquire-components]');
    assert.ok(card, 'components card rendered for the essence');
    assert.match(card.textContent, /Fire/);
    assert.ok(card.querySelector('.crafting-shopping-acquire-essence'), 'essence icon tile rendered');
    assert.equal(summaryCount(target, 'components'), '1');
  });

  it('lists tools to acquire vs repair and hides available ones', async () => {
    const target = await harness.mount({
      aggregate: aggregate({
        tools: [
          { componentId: 't1', name: 'Hammer', img: 'icons/hammer.webp', available: false, needsRepair: false },
          { componentId: 't2', name: 'Anvil', img: 'icons/anvil.webp', available: false, needsRepair: true },
          { componentId: 't3', name: 'Saw', img: null, available: true, needsRepair: false }
        ]
      }),
      entries: [ENTRY]
    });
    const card = target.querySelector('[data-shopping-acquire-tools]');
    assert.ok(card, 'acquire-tools card rendered');
    assert.equal(
      card.querySelectorAll('.crafting-shopping-acquire-row').length,
      2,
      'the available tool is omitted'
    );
    assert.ok(card.querySelector('[data-shopping-tool-mode="acquire"]'), 'missing tool → Acquire');
    assert.ok(card.querySelector('[data-shopping-tool-mode="repair"]'), 'broken tool → Repair');
    assert.equal(summaryCount(target, 'tools'), '2');
  });

  it('increments on left-click and decrements on right-click of a queue row', async () => {
    const inc = [];
    const dec = [];
    const target = await harness.mount({
      aggregate: aggregate(),
      entries: [{ recipeId: 'recipe-1', quantity: 3, name: 'Healing Potion', img: null }],
      onIncrement: (id) => inc.push(id),
      onDecrement: (id) => dec.push(id)
    });

    const row = target.querySelector('[data-shopping-entry="recipe-1"]');
    row.click();
    flushSync();
    assert.deepEqual(inc, ['recipe-1'], 'left-click increments');

    row.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    assert.deepEqual(dec, ['recipe-1'], 'right-click decrements');
  });

  it('invokes onRemove (not onIncrement) when a queue entry × is clicked', async () => {
    const removed = [];
    const inc = [];
    const target = await harness.mount({
      aggregate: aggregate(),
      entries: [ENTRY],
      onRemove: (id) => removed.push(id),
      onIncrement: (id) => inc.push(id)
    });

    target.querySelector('.crafting-shopping-remove').click();
    flushSync();
    assert.deepEqual(removed, ['recipe-1'], 'onRemove called with the recipe id');
    assert.deepEqual(inc, [], 'the × does not also increment (stops propagation)');
  });
});
