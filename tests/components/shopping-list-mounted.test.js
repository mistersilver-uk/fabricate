import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

  it('folds a missing essence into the components list with its authored icon', async () => {
    const target = await harness.mount({
      aggregate: aggregate({
        ingredients: [],
        essences: [{ type: 'fire', name: 'Fire', icon: 'fa-solid fa-fire', totalNeed: 2, have: 0, missing: 2, satisfied: false }]
      }),
      entries: [ENTRY]
    });
    const card = target.querySelector('[data-shopping-acquire-components]');
    assert.ok(card, 'components card rendered for the essence');
    assert.match(card.textContent, /Fire/);
    const thumb = card.querySelector('.crafting-essence-thumb');
    assert.ok(thumb, 'essence icon tile rendered');
    assert.match(thumb.getAttribute('style'), /28px/, 'shopping glyph keeps 28px geometry');
    assert.ok(thumb.querySelector('i').classList.contains('fa-fire'));
    assert.match(card.textContent, /"have":0,"need":2/, 'have/need remains visible');
    assert.equal(summaryCount(target, 'components'), '1');
  });

  it('renders first-class essence shortages as glyphs and ordinary shortages as images', async () => {
    const target = await harness.mount({
      aggregate: aggregate({
        ingredients: [
          {
            componentId: null,
            name: 'Aether essence',
            description: 'Aether essence',
            icon: '',
            isEssence: true,
            totalNeed: 3,
            have: 1,
            missing: 2,
            satisfied: false,
          },
          {
            componentId: 'iron',
            name: 'Iron',
            description: 'Iron',
            img: 'icons/iron.webp',
            totalNeed: 1,
            have: 0,
            missing: 1,
            satisfied: false,
          },
        ],
      }),
      entries: [ENTRY],
    });
    const rows = target.querySelectorAll('.crafting-shopping-acquire-row');
    assert.ok(rows[0].querySelector('i').classList.contains('fa-mortar-pestle'));
    assert.equal(rows[0].querySelector('img'), null);
    assert.equal(rows[1].querySelector('img').getAttribute('src'), 'icons/iron.webp');
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
    assert.deepEqual(
      inc,
      [],
      'the × is a SIBLING of the activation button, not a descendant, so its click was never' +
        ' on a path to the increment handler'
    );
  });

  // Issue 924. The row is a `listitem` that NESTS a real `<button>`; it is not itself one,
  // because `<button>`'s content model forbids the remove `<button>` as a descendant — and
  // Svelte builds the DOM with `createElement`, never through the HTML parser, so that
  // invalid nesting would ship rather than being implicitly closed.
  it('nests a real activation button in the queue row rather than making the row one', async () => {
    const target = await harness.mount({ aggregate: aggregate(), entries: [ENTRY] });

    const row = target.querySelector('.crafting-shopping-entry');
    assert.equal(row.tagName, 'LI', 'the queue row stays a listitem');
    assert.equal(row.getAttribute('role'), null, 'and carries no interactive role of its own');
    assert.equal(row.getAttribute('tabindex'), null, 'nor a hand-rolled tabindex');
    assert.equal(row.closest('button'), null, 'the row is not inside a button');

    const entry = target.querySelector('[data-shopping-entry="recipe-1"]');
    assert.equal(entry.tagName, 'BUTTON', 'the actionable element is a real button');
    assert.equal(entry.getAttribute('type'), 'button', 'and never submits a form');
    assert.equal(entry.parentElement, row, 'it is a direct child of the row');
    assert.equal(
      entry.querySelector('button'),
      null,
      'the × must stay a SIBLING of the activation button — nesting it would be invalid HTML'
    );
    assert.equal(
      row.querySelectorAll(':scope > button').length,
      2,
      'the row holds exactly two sibling buttons: activate and remove'
    );
  });

  // The keyboard contract is now the PLATFORM's, which is the point of the change: a native
  // `<button>` fires `click` on Enter and Space and swallows the space-scroll itself, so the
  // hand-rolled `onEntryKey` is gone.
  //
  // happy-dom does not implement the UA's synthetic-click activation steps, so a dispatched
  // `keydown` cannot be expected to activate anything here. That makes this test two halves,
  // and together they are the contract: the row runs NO key handler of its own (so nothing
  // hand-rolled survives to be relied upon), and the event the UA would deliver instead — a
  // `click` on a focused, natively focusable button — does increment.
  it('leaves Enter/Space activation to the platform, with no hand-rolled key handler', async () => {
    const inc = [];
    const target = await harness.mount({
      aggregate: aggregate(),
      entries: [ENTRY],
      onIncrement: (id) => inc.push(id)
    });

    const entry = target.querySelector('[data-shopping-entry="recipe-1"]');
    entry.focus();
    assert.equal(
      target.ownerDocument.activeElement,
      entry,
      'the button is focusable with no tabindex of its own'
    );

    for (const key of ['Enter', ' ']) {
      entry.dispatchEvent(
        new globalThis.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      );
      flushSync();
    }
    assert.deepEqual(
      inc,
      [],
      'no listener of ours answers a keydown — activation is the UA\'s job now, and it' +
        ' delivers it as the click asserted next'
    );

    entry.click();
    flushSync();
    assert.deepEqual(inc, ['recipe-1'], 'the activation click the UA synthesises increments');
  });

  // The reset that keeps the nested button from drawing Foundry's own button chrome inside
  // the row, plus the ring suppression that stops it painting a SECOND concentric focus ring
  // over the row's border. No smoke frame reaches `:focus-visible`, so nothing photographic
  // can catch the latter regressing.
  it('resets Foundry button chrome on the entry button and suppresses its own focus ring', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/ShoppingList.svelte'),
      'utf8'
    );
    const block = source.match(/\.crafting-shopping-entry-main\s*{([^}]*)}/)?.[1];
    assert.ok(block, 'the entry button must declare its own reset block');
    for (const declaration of [
      'background: transparent',
      'border: 0',
      'text-align: left',
      'font-size: inherit',
      'height: auto',
      'min-height:',
      'flex: 1 1 auto',
      'min-width: 0'
    ]) {
      assert.ok(
        block.includes(declaration),
        `the entry button must reset "${declaration}" against Foundry's global button rule`
      );
    }

    assert.match(
      source,
      /\.crafting-shopping-entry-main:focus-visible\s*{\s*outline:\s*none;\s*}/,
      'the button must suppress its own ring — the ROW draws it, via the :has() rule'
    );
    assert.match(
      source,
      /\.crafting-shopping-entry:has\(\.crafting-shopping-entry-main:focus-visible\)/,
      'the row draws the focus ring for the button it contains'
    );
  });
});
