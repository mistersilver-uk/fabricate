/**
 * ConsumptionPlanPanel (issue 917) — "what this craft will spend, before it is
 * spent".
 *
 * The panel renders `buildConsumptionPlan`'s projection verbatim, so the claims
 * here are about presentation: one row per planned item (a dual-essence carrier
 * appears ONCE however many requirements it funds), and a "still to choose" line
 * joined by a locale-aware list formatter rather than an authored separator.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { buildConsumptionPlan } from '../../src/ui/svelte/util/requirementSlots.js';
import { sharedEssenceCraftability } from '../helpers/crafting-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-consumption-plan-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/crafting/detail/ConsumptionPlanPanel.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/crafting/detail/ConsumptionPlanPanel.svelte',
});

function mixedCraftability() {
  const shared = sharedEssenceCraftability();
  return {
    ...shared,
    ingredientStates: [
      {
        groupId: 'g-iron',
        name: 'Iron',
        img: 'icons/iron.webp',
        need: 2,
        have: 5,
        satisfied: true,
      },
      {
        groupId: 'g-herb',
        name: 'Red Herb',
        img: 'icons/herb.webp',
        need: 1,
        have: 0,
        satisfied: false,
        hasChoice: true,
        choiceCount: 2,
      },
      ...shared.ingredientStates,
    ],
  };
}

describe('ConsumptionPlanPanel mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('states the empty case rather than an empty list', async () => {
    const target = await harness.mount({ plan: buildConsumptionPlan(null) });
    assert.match(
      target.querySelector('.consumption-plan-empty').textContent,
      /ConsumptionPlan\.Empty/
    );
    assert.ok(!target.querySelector('[data-consumption-pending]'));
  });

  it('lists one row per planned item, with the quantity that item contributes', async () => {
    const target = await harness.mount({ plan: buildConsumptionPlan(mixedCraftability()) });
    const rows = [...target.querySelectorAll('[data-consumption-row]')];
    assert.deepEqual(
      rows.map((row) => [
        row.querySelector('.consumption-plan-name').textContent.trim(),
        row.querySelector('.consumption-plan-qty').textContent.trim(),
      ]),
      [
        ['Iron', '×2'],
        ['Duskcrystal', '×1'],
      ]
    );
  });

  // The essence block contributes at most ONE plan entry per item key: two rows for
  // one shared unit is the shape that double-spends it at consumption time.
  it('emits a single row for a dual-essence carrier funding two requirements', async () => {
    const target = await harness.mount({ plan: buildConsumptionPlan(sharedEssenceCraftability()) });
    const rows = [...target.querySelectorAll('[data-consumption-row]')];
    assert.equal(rows.length, 1);
    assert.match(rows[0].querySelector('.consumption-plan-name').textContent, /Duskcrystal/);
    const chips = [...rows[0].querySelectorAll('.consumption-plan-contribution')];
    assert.equal(chips.length, 2, 'one contribution chip per essence the unit carries');
  });

  it('names the untouched choice and the short essence on the pending line', async () => {
    const target = await harness.mount({
      plan: buildConsumptionPlan(mixedCraftability()),
      formatList: (names) => names.join(' | '),
    });
    const pending = target.querySelector('[data-consumption-pending]').textContent;
    assert.match(pending, /ConsumptionPlan\.StillToChoose/);
    assert.match(pending, /Red Herb/);
    assert.match(pending, /ConsumptionPlan\.EssenceRequirement/, 'an essence gets its own sentence');
    assert.match(pending, /Shadow/, 'and it is the SHORT requirement that is listed');
    assert.ok(!/Radiant/.test(pending), 'the met requirement is not still to choose');
  });

  // A comma-and-"and" join is locale-specific, so the join is delegated. Proving the
  // seam is called matters: an authored separator key is the failure this replaces.
  it('joins the pending names through the injected list formatter', async () => {
    const seen = [];
    const target = await harness.mount({
      plan: buildConsumptionPlan(mixedCraftability()),
      formatList: (names) => {
        seen.push(names);
        return 'JOINED';
      },
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].length, 2);
    assert.match(target.querySelector('[data-consumption-pending]').textContent, /JOINED/);
  });

  // The DEFAULT join is the load-bearing one: `formatList` is an injectable prop, so
  // a panel that quietly joined with a bare `Intl.ListFormat` bound to the SERVER's
  // locale rendered identically to one bound to the world's language, and every
  // spy-injecting test above still passed. Stubbing Foundry's own list-formatter read
  // is what distinguishes them.
  it('joins through the active language list formatter when no prop is injected', async () => {
    const asked = [];
    globalThis.game.i18n.getListFormatter = (options) => {
      asked.push(options);
      return { format: (names) => names.join(' ~AND~ ') };
    };
    try {
      const target = await harness.mount({ plan: buildConsumptionPlan(mixedCraftability()) });
      const pending = target.querySelector('[data-consumption-pending]').textContent;
      assert.match(pending, / ~AND~ /, 'the default join must be the language formatter');
      assert.deepEqual(asked, [{ style: 'long', type: 'conjunction' }]);
      assert.match(pending, /Red Herb/);
      assert.match(pending, /Shadow/);
    } finally {
      delete globalThis.game.i18n.getListFormatter;
    }
  });

  // Node tests (and any client whose i18n predates the helper) have no list formatter
  // to ask, so the join degrades to the platform default rather than throwing.
  it('falls back to the platform list formatter when Foundry exposes none', async () => {
    assert.ok(!globalThis.game.i18n.getListFormatter, 'no formatter installed for this case');
    const target = await harness.mount({ plan: buildConsumptionPlan(mixedCraftability()) });
    const pending = target.querySelector('[data-consumption-pending]').textContent;
    // Two entries, so a conjunction join must appear between them in any locale.
    assert.match(pending, /Red Herb/);
    assert.match(pending, /Shadow/);
  });

  it('flags a row whose quantity exceeds what is held', async () => {
    const target = await harness.mount({
      plan: buildConsumptionPlan({
        ingredientStates: [
          { groupId: 'g-iron', name: 'Iron', need: 4, have: 1, satisfied: false },
        ],
      }),
    });
    const qty = target.querySelector('.consumption-plan-qty');
    assert.equal(qty.textContent.trim(), '×4');
    assert.ok(qty.classList.contains('is-short'));
  });
});
