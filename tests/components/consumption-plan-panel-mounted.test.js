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
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/crafting/detail/EssenceContribution.svelte',
    // The shared eyebrow (issue 1505). The panel's title is a `<Kicker>` inside the
    // panel's own flex row, so omitting it HANGS this suite (# cancelled), never fails it.
    'src/ui/svelte/components/Kicker.svelte',
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
    const chips = [...rows[0].querySelectorAll('.essence-contribution')];
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

// ---------------------------------------------------------------------------
// Issue 1493 — a currency row states its cost in its NAME and reports nothing else.
//
// A render defect, so it is asserted against the mounted DOM: `planRowFor` can carry a
// perfectly correct `isCurrency` while the markup keeps rendering both spans. Before this
// branch a 100 gp cost rendered as "100 gp … ConsumptionPlan.Owned:{count:0} … x100" —
// the evaluation's placeholder presented as a coin balance, and the price restated in
// coin units beside a name that already spells it out.
// ---------------------------------------------------------------------------

function currencyPlanCraftability(overrides = {}) {
  return {
    ingredientStates: [
      { groupId: 'g-iron', name: 'Iron', img: null, need: 2, have: 5, satisfied: true },
      {
        groupId: 'g-toll',
        name: '100 gp',
        description: '100 gp',
        img: 'icons/coin.webp',
        need: 100,
        have: 0,
        satisfied: true,
        isCurrency: true,
        affordable: true,
        issue: '',
        ...overrides,
      },
    ],
  };
}

describe('ConsumptionPlanPanel currency rows (issue 1493)', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the cost as the whole row, with no owned count and no multiplier', async () => {
    const target = await harness.mount({
      plan: buildConsumptionPlan(currencyPlanCraftability()),
    });
    const rows = [...target.querySelectorAll('[data-consumption-row]')];
    assert.equal(rows.length, 2, 'the currency cost keeps its place in the plan');

    const coin = rows[1];
    assert.equal(coin.querySelector('.consumption-plan-name').textContent.trim(), '100 gp');
    assert.ok(
      !coin.querySelector('.consumption-plan-owned'),
      'the placeholder owned count must not be presented as a coin balance'
    );
    assert.ok(
      !coin.querySelector('.consumption-plan-qty'),
      'and the price must not be restated in coin units as a multiplier'
    );
    assert.equal(
      coin.textContent.trim(),
      '100 gp',
      `a currency row says exactly its cost and nothing else: "${coin.textContent.trim()}"`
    );
  });

  it('suppresses both spans for an unaffordable cost too', async () => {
    const target = await harness.mount({
      plan: buildConsumptionPlan(
        currencyPlanCraftability({ satisfied: false, affordable: false })
      ),
    });
    const coin = [...target.querySelectorAll('[data-consumption-row]')][1];
    assert.equal(coin.textContent.trim(), '100 gp');
    assert.ok(!coin.querySelector('.consumption-plan-qty'));
  });

  it('still renders owned and quantity for an ordinary item row', async () => {
    // The control: the currency branch must not strip the spans from every row.
    const target = await harness.mount({
      plan: buildConsumptionPlan(currencyPlanCraftability()),
    });
    const iron = [...target.querySelectorAll('[data-consumption-row]')][0];
    assert.match(iron.querySelector('.consumption-plan-owned').textContent, /"count":5/);
    assert.equal(iron.querySelector('.consumption-plan-qty').textContent.trim(), '×2');
  });
});
