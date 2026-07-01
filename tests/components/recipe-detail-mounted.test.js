import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { recipe, craftability } from '../helpers/crafting-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-detail-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/RecipeDetail.svelte',
});

const CHECK = {
  dc: 15,
  rollFormula: '1d20',
  skill: null,
  optional: false,
  mandatory: true,
  usable: true,
};

// One table row per resolution mode: the fixture recipe + the data-recipe-section
// markers its mode body must render. Parameterized (not copy-pasted blocks) so a
// new mode is one row.
const MODE_CASES = [
  {
    mode: 'simple',
    fixture: recipe({ modeToken: 'simple', modeLabel: 'Simple' }),
    expectedSections: ['io'],
  },
  {
    mode: 'routedByIngredients',
    fixture: recipe({
      modeToken: 'routedByIngredients',
      modeLabel: 'Routed by ingredients',
      ingredientSets: [
        { id: 'set-a', label: 'Option A', craftability: craftability() },
        { id: 'set-b', label: 'Option B', craftability: craftability({ canCraft: false }) },
      ],
    }),
    expectedSections: ['routing-hint', 'ingredient-sets', 'io'],
  },
  {
    mode: 'routedByCheck',
    fixture: recipe({
      modeToken: 'routedByCheck',
      modeLabel: 'Routed by check',
      check: CHECK,
      result: { items: [], time: null, timeLabel: null, xp: null },
      outcomeTiers: [
        {
          id: 't-success',
          name: 'Success',
          success: true,
          awardedResults: [{ name: 'Elixir', img: null, qty: 1 }],
        },
        { id: 't-fail', name: 'Failure', success: false, awardedResults: [] },
      ],
    }),
    expectedSections: ['check', 'io', 'outcome-tiers'],
  },
  {
    mode: 'progressive',
    fixture: recipe({
      modeToken: 'progressive',
      modeLabel: 'Progressive',
      check: { ...CHECK, dc: 12 },
    }),
    expectedSections: ['progressive-hint', 'check', 'io'],
  },
];

describe('RecipeDetail mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  for (const testCase of MODE_CASES) {
    it(`renders the ${testCase.mode} body with its sections + a craft button`, async () => {
      const target = await harness.mount({
        recipe: testCase.fixture,
        selectedSetId: testCase.fixture.defaultSetId,
        craftability: testCase.fixture.ingredientSets[0].craftability,
        rollResult: null,
        busy: false,
      });

      // The header renders for every mode; the body is keyed to the mode token.
      assert.ok(target.querySelector('[data-recipe-header]'), 'shared header rendered');
      assert.ok(
        target.querySelector('.crafting-detail-mode-chip'),
        'a non-redacted recipe still shows its mode chip'
      );
      assert.ok(
        target.querySelector(`[data-recipe-detail-mode="${testCase.mode}"]`),
        `detail wrapper carries the ${testCase.mode} mode`
      );
      assert.ok(
        target.querySelector(`[data-recipe-mode="${testCase.mode}"]`),
        `${testCase.mode} body rendered`
      );
      for (const section of testCase.expectedSections) {
        assert.ok(
          target.querySelector(`[data-recipe-section="${section}"]`),
          `${testCase.mode} body renders the ${section} section`
        );
      }
      assert.ok(target.querySelector('[data-crafting-craft]'), 'craft button present');
    });
  }

  it('renders only the teaser header for a redaction-redacted recipe — no ingredient/result detail', async () => {
    const teaser = recipe({
      redaction: { redacted: true, hiddenFields: ['ingredients', 'results', 'description'] },
      browseStatus: 'discovery',
      flavor: '',
      ingredientSets: [],
      defaultSetId: null,
      check: null,
      outcomeTiers: null,
      result: { items: [], time: null, timeLabel: null, xp: null },
    });
    const target = await harness.mount({
      recipe: teaser,
      selectedSetId: null,
      craftability: null,
      rollResult: null,
    });

    assert.ok(target.querySelector('[data-recipe-teaser]'), 'teaser hint rendered');
    // The mode chip reveals the crafting mechanism, so it must NOT render for a
    // redacted teaser (which still carries a modeLabel in the model).
    assert.equal(
      target.querySelector('.crafting-detail-mode-chip'),
      null,
      'no mode chip leaks the crafting mechanism on a discovery teaser'
    );
    // None of the body detail (sections, IO, outcome tiers, craft button) leaks.
    assert.equal(
      target.querySelector('[data-recipe-section]'),
      null,
      'no detail sections rendered'
    );
    assert.equal(target.querySelector('[data-io-group]'), null, 'no IO rows rendered');
    assert.equal(
      target.querySelector('[data-recipe-section="outcome-tiers"]'),
      null,
      'no outcome tiers rendered'
    );
    assert.equal(
      target.querySelector('[data-crafting-craft]'),
      null,
      'no craft button on a teaser'
    );
  });

  it('shows a select-a-recipe hint when no recipe is provided', async () => {
    const target = await harness.mount({ recipe: null });
    assert.ok(target.querySelector('[data-crafting-detail-state="empty"]'), 'empty hint rendered');
  });

  it('renders the blocking-reasons callout and learn affordance when applicable', async () => {
    const blocked = recipe({
      browseStatus: 'missingMaterials',
      blockingReasons: ['You are missing some required materials.'],
      learn: { canLearn: true, consumeOnLearn: true },
    });
    const target = await harness.mount({
      recipe: blocked,
      selectedSetId: blocked.defaultSetId,
      craftability: craftability({ canCraft: false }),
    });

    assert.ok(target.querySelector('[data-recipe-blocking]'), 'blocking callout rendered');
    assert.ok(target.querySelector('[data-recipe-learn]'), 'learn affordance rendered');
    assert.ok(
      target.querySelector('[data-recipe-learn-warning]'),
      'consume-on-learn warning rendered'
    );
    // A non-craftable recipe still renders a (disabled) craft button.
    const craftButton = target.querySelector('[data-crafting-craft]');
    assert.ok(craftButton, 'craft button present');
    assert.equal(
      craftButton.getAttribute('data-crafting-craft-disabled'),
      'true',
      'craft button disabled when materials missing'
    );
  });

  it('moves the status onto a thumbnail pip and drops the header badge when uncraftable', async () => {
    const blocked = recipe({
      browseStatus: 'missingMaterials',
      blockingReasons: ['You are missing some required materials.'],
    });
    const target = await harness.mount({
      recipe: blocked,
      selectedSetId: blocked.defaultSetId,
      craftability: craftability({ canCraft: false }),
    });

    const header = target.querySelector('[data-recipe-header]');
    assert.ok(
      header.querySelector('.crafting-detail-thumb.is-uncraftable .crafting-detail-pip'),
      'error pip overlays the faded thumbnail'
    );
    assert.equal(
      header.querySelector('.crafting-detail-header-meta [data-crafting-status]'),
      null,
      'the labelled status badge is dropped in favour of the pip'
    );
    assert.ok(
      header.querySelector('[data-recipe-blocking].is-uncraftable'),
      'the blocking callout uses the error palette when uncraftable'
    );
  });

  it('keeps the labelled status badge (no pip) for a craftable recipe', async () => {
    const target = await harness.mount({
      recipe: recipe({ browseStatus: 'available' }),
      selectedSetId: recipe().defaultSetId,
    });

    const header = target.querySelector('[data-recipe-header]');
    assert.ok(
      header.querySelector('.crafting-detail-header-meta [data-crafting-status]'),
      'craftable recipe keeps the labelled status badge'
    );
    assert.equal(
      header.querySelector('.crafting-detail-pip'),
      null,
      'no thumbnail pip when craftable'
    );
  });
});
