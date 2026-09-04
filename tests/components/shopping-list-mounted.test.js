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
import { installLangBackedI18n } from '../helpers/langBackedI18n.js';
import { aggregateShoppingList } from '../../src/ui/svelte/util/shoppingListAggregator.js';

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

// ---------------------------------------------------------------------------
// Issue 1493 — a currency row states its VERDICT, never a ratio, and never a verdict
// nobody established.
//
// A currency ingredient entry carries `have: 0` as a documented placeholder against a
// `totalNeed` that is a PRICE, so the shared chip rendered "0 / 100 owned" in the danger
// tone: a coin balance nobody measured, beside a price the row's NAME already spells out.
// Asserted against the mounted DOM, because these are render defects — the projection can
// be entirely correct while the markup keeps reading the wrong two fields.
//
// `game.i18n` is backed by the real `lang/en.json` for this block, so every assertion below
// is on the SHIPPED copy. A renamed key renders as its dotted self and a reworded one
// renders the new words, and both fail here — which is why the components carry no inline
// English fallbacks to drift from.
// ---------------------------------------------------------------------------

const CURRENCY_ENTRY = Object.freeze({
  key: 'cur:100 gp',
  componentId: null,
  itemUuid: null,
  name: '100 gp',
  img: 'icons/commodities/currency/coin-embossed-cobalt.webp',
  description: '100 gp',
  isEssence: false,
  isCurrency: true,
  affordable: false,
  affordabilityChecked: true,
  costRepeats: 1,
  issue: '',
  totalNeed: 100,
  have: 0,
  missing: 0,
  satisfied: false
});

const CURRENCY_REASON =
  'Currency configuration is invalid: Currency unit "Gold" is missing an actor data path.';

function chipIn(target) {
  return target.querySelector('.crafting-shopping-acquire-row .crafting-shopping-chip');
}

describe('ShoppingList currency rows (issue 1493)', () => {
  let restoreI18n = () => {};

  before(async () => {
    await harness.setup();
    restoreI18n = installLangBackedI18n(repoRoot);
  });
  after(() => {
    restoreI18n();
    harness.teardown();
  });
  afterEach(harness.remount);

  it('states the verdict on a currency row and reports neither balance nor price', async () => {
    const target = await harness.mount({
      aggregate: aggregate({ ingredients: [CURRENCY_ENTRY] }),
      entries: [ENTRY]
    });

    const row = target.querySelector('.crafting-shopping-acquire-row');
    assert.ok(Boolean(row), 'an unaffordable cost still belongs on the acquire list');
    assert.match(row.textContent, /100 gp/, 'the row NAME is the whole statement of the cost');

    // Asserted on the CHIP ITSELF before any marker attribute, so the guard bites on the
    // rendered words rather than on a data attribute a fix could add without changing
    // what the player reads.
    const chip = chipIn(target);
    assert.ok(Boolean(chip), 'the row still carries a chip');
    assert.equal(chip.textContent.trim(), "Can't afford", 'the shipped copy, read by key');
    assert.ok(
      !/Shopping\.Owned/.test(chip.textContent),
      'the chip must not go through the have/need owned key'
    );
    assert.ok(
      !/\bhave\b|\bneed\b|\b0\b|\b100\b/.test(chip.textContent),
      `the chip must name neither the placeholder balance nor the price: "${chip.textContent}"`
    );
    assert.equal(chip.getAttribute('data-shopping-chip'), 'currency');
    assert.ok(chip.classList.contains('tone-danger'), 'a real shortfall is a danger chip');
    assert.ok(!row.querySelector('[data-shopping-chip="ratio"]'), 'and never the ratio chip');
  });

  it('drops an affordable cost from the acquire list entirely', async () => {
    const target = await harness.mount({
      aggregate: aggregate({
        ingredients: [{ ...CURRENCY_ENTRY, affordable: true, satisfied: true }],
        allSatisfied: true
      }),
      entries: [ENTRY]
    });
    assert.ok(
      !target.querySelector('[data-shopping-acquire-components]'),
      'a cost the player can pay is not something to go shopping for'
    );
    assert.equal(summaryCount(target, 'components'), '0');
  });

  it('still renders the have/need ratio chip for an ordinary component', async () => {
    // The control: the currency branch must not swallow the ordinary chip.
    const target = await harness.mount({ aggregate: aggregate(), entries: [ENTRY] });
    const chip = chipIn(target);
    assert.equal(chip.textContent.trim(), '2 / 4 owned', 'a component row keeps its ratio');
    assert.equal(chip.getAttribute('data-shopping-chip'), 'ratio');
    assert.ok(chip.classList.contains('tone-danger'));
  });

  // -------------------------------------------------------------------------
  // A cost refused for a CONFIGURATION reason (revision 3).
  //
  // `RecipeManager` populates `issue` and the rail consumes it, but the aggregate entry
  // dropped it — so a player carrying 1000 gp against a cleared `gp` actorPath read
  // "100 gp — Can't afford" in red. That is the original defect in a new voice, and it
  // violates the MUST this change itself added to the ui-integration spec.
  // -------------------------------------------------------------------------

  it('names a configuration refusal as setup, in the warning tone, not as a shortfall', async () => {
    const target = await harness.mount({
      aggregate: aggregate({
        ingredients: [{ ...CURRENCY_ENTRY, issue: CURRENCY_REASON }]
      }),
      entries: [ENTRY]
    });

    const chip = chipIn(target);
    assert.equal(chip.textContent.trim(), 'Setup needed');
    assert.ok(
      !/afford/i.test(chip.textContent),
      `a solvent player must not be told they cannot pay: "${chip.textContent}"`
    );
    assert.ok(
      chip.classList.contains('tone-warning'),
      'the world is misconfigured — that is not the player\'s fault, so it is not danger'
    );
    assert.ok(!chip.classList.contains('tone-danger'));
    assert.equal(chip.getAttribute('data-shopping-chip'), 'currency-unavailable');
    assert.equal(chip.getAttribute('title'), CURRENCY_REASON, 'hovering names the reason');
  });

  it('keeps a configuration refusal out of the red missing-components count', async () => {
    const target = await harness.mount({
      aggregate: aggregate({
        ingredients: [{ ...CURRENCY_ENTRY, issue: CURRENCY_REASON }]
      }),
      entries: [ENTRY]
    });

    assert.ok(
      target.querySelector('[data-shopping-acquire-components]'),
      'the requirement stays VISIBLE — it is unresolved and the player must learn that'
    );
    assert.equal(
      summaryCount(target, 'components'),
      '0',
      'but nothing the player can buy clears a GM setup problem, so it is not their debt'
    );
    assert.ok(
      !target.querySelector('[data-summary="components"]').classList.contains('is-alert'),
      'and it must not redden the card that means "go and acquire these"'
    );
  });

  // -------------------------------------------------------------------------
  // A verdict that does not reach the aggregate (revision 3).
  //
  // `totalNeed` is multiplied by the queued quantity; `affordable` is a SINGLE craft's
  // verdict. Reporting one against the other told a player with 150 gp that a queue of
  // five 100 gp crafts was covered.
  // -------------------------------------------------------------------------

  it('states how many times an unchecked cost recurs, with no verdict and no danger tone', async () => {
    const target = await harness.mount({
      aggregate: aggregate({
        ingredients: [
          {
            ...CURRENCY_ENTRY,
            affordable: true,
            affordabilityChecked: false,
            costRepeats: 5,
            totalNeed: 500
          }
        ]
      }),
      entries: [ENTRY]
    });

    const chip = chipIn(target);
    assert.equal(chip.textContent.trim(), '×5', 'the row states the repeat, not a verdict');
    assert.ok(
      !/afford/i.test(chip.textContent),
      `neither verdict was established, so neither may be shown: "${chip.textContent}"`
    );
    assert.ok(chip.classList.contains('tone-neutral'));
    assert.ok(!chip.classList.contains('tone-danger'));
    assert.ok(!chip.classList.contains('tone-warning'));
    assert.equal(chip.getAttribute('data-shopping-chip'), 'currency-unchecked');
    assert.equal(
      chip.getAttribute('title'),
      'Fabricate checked whether you can afford one craft. This plan spends that cost 5 times.',
      'and the hover says exactly what was and was not checked'
    );
    assert.equal(
      summaryCount(target, 'components'),
      '0',
      'an unanswered question is not a measured shortfall'
    );
  });

  it('counts a CHECKED currency shortfall toward the missing-components card', async () => {
    // The control for the two exclusions above: a real, measured shortfall still counts.
    const target = await harness.mount({
      aggregate: aggregate({ ingredients: [CURRENCY_ENTRY] }),
      entries: [ENTRY]
    });
    assert.equal(summaryCount(target, 'components'), '1');
    assert.ok(target.querySelector('[data-summary="components"]').classList.contains('is-alert'));
  });

  // -------------------------------------------------------------------------
  // The `{#each}` key (revision 3).
  //
  // This list re-derived the aggregator's dedup rule with a coarser one that was not
  // kind-qualified, so the two entries the aggregator deliberately SPLIT collapsed back
  // onto one key. Svelte throws `each_key_duplicate` in the production branch as well as
  // the dev one, and nothing under `src/` is wrapped in a `<svelte:boundary>` — so this
  // took down the crafting app's render, not the row.
  //
  // Built by the REAL aggregator: a fixture with the keys typed in by hand would prove
  // only that this component can render two objects.
  // -------------------------------------------------------------------------

  it('renders two same-description entries of different kinds without a duplicate key', async () => {
    const nameless = { description: 'Unknown ingredient', need: 4, have: 0, satisfied: false };
    const coin = {
      description: 'Unknown ingredient',
      name: 'Unknown ingredient',
      need: 100,
      have: 0,
      isCurrency: true,
      affordable: false,
      satisfied: false,
      issue: ''
    };
    const built = aggregateShoppingList(
      [{ recipeId: 'r-1', quantity: 1 }],
      {
        getRecipe: (id) => ({ id, name: 'Ambiguous Recipe' }),
        evaluateCraftability: () => ({
          ingredientStates: [coin, nameless],
          essenceStates: [],
          toolStates: []
        })
      },
      [{ id: 'a', items: [] }]
    );

    assert.equal(built.ingredients.length, 2, 'the aggregation split them; check the fixture');

    const target = await harness.mount({ aggregate: built, entries: [ENTRY] });
    const rows = target.querySelectorAll('.crafting-shopping-acquire-row');
    assert.equal(rows.length, 2, 'both rows render, and mounting did not throw');
    assert.deepEqual(
      [...rows].map((row) => row.querySelector('[data-shopping-chip]').getAttribute('data-shopping-chip')),
      ['currency', 'ratio'],
      'each row keeps its own kind of chip'
    );
  });

  it('still renders a hand-built aggregate that carries no keys at all', async () => {
    // The positional fallback. It is not a second identity rule — it only guarantees the
    // folded list cannot repeat a key, so an aggregate assembled anywhere but the
    // aggregator degrades to lost DOM identity rather than to a crash.
    const target = await harness.mount({
      aggregate: {
        ingredients: [
          { name: 'Iron', description: 'Iron', totalNeed: 2, have: 0, missing: 2, satisfied: false },
          { name: 'Iron', description: 'Iron', totalNeed: 3, have: 0, missing: 3, satisfied: false }
        ],
        essences: [
          { type: 'Iron', name: 'Iron', totalNeed: 1, have: 0, missing: 1, satisfied: false }
        ],
        tools: [],
        allSatisfied: false,
        totalRecipes: 1,
        totalQuantity: 1
      },
      entries: [ENTRY]
    });
    assert.equal(target.querySelectorAll('.crafting-shopping-acquire-row').length, 3);
  });
});
