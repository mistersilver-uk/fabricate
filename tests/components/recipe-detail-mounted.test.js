import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

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
      // The craft button is a fixed footer OUTSIDE the scrolling detail region, so it
      // stays visible without overlapping the recipe details.
      const scroll = target.querySelector('[data-crafting-detail-scroll]');
      assert.ok(scroll, 'the detail content has a dedicated scroll region');
      assert.equal(
        scroll.querySelector('[data-crafting-craft]'),
        null,
        'the craft button is not inside the scroll region'
      );
    });
  }

  it('renders ingredients as an image grid with sufficiency-coloured tiles and pips', async () => {
    const target = await harness.mount({
      recipe: recipe({ modeToken: 'simple', modeLabel: 'Simple' }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability({
        canCraft: false,
        ingredientStates: [
          {
            componentId: 'c1',
            name: 'Iron',
            img: 'icons/iron.webp',
            description: '2x Iron',
            need: 2,
            have: 2,
            satisfied: true,
          },
          {
            componentId: 'c2',
            name: 'Oak',
            img: 'icons/oak.webp',
            description: '3x Oak',
            need: 3,
            have: 1,
            satisfied: false,
          },
        ],
      }),
    });

    const tiles = target.querySelectorAll('[data-io-group="ingredients"] [data-io-ingredient]');
    assert.equal(tiles.length, 2, 'one image tile per ingredient');

    const [sufficient, short] = tiles;
    assert.ok(sufficient.classList.contains('is-sufficient'), 'satisfied ingredient tile is green');
    assert.ok(short.classList.contains('is-insufficient'), 'short ingredient tile is red');

    assert.ok(sufficient.querySelector('.crafting-thumb img'), 'tile renders the component image');
    assert.equal(
      sufficient.querySelector('.crafting-io-pip').textContent.trim(),
      '2/2',
      'pip shows have/need'
    );
    const shortPip = short.querySelector('.crafting-io-pip');
    assert.equal(shortPip.textContent.trim(), '1/3', 'short pip shows have/need');
    assert.ok(shortPip.classList.contains('is-insufficient'), 'short pip is red');
  });

  it('shows the tool image to the left of the tool name', async () => {
    const target = await harness.mount({
      recipe: recipe({ modeToken: 'simple', modeLabel: 'Simple' }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability({
        toolStates: [{ name: 'Mortar & Pestle', img: 'icons/mortar.webp', available: true }],
      }),
    });

    const label = target.querySelector(
      '[data-io-group="tools"] .crafting-io-row .crafting-io-tool-label'
    );
    assert.ok(label, 'tool label wrapper rendered');
    const thumb = label.querySelector('.crafting-thumb img');
    const name = label.querySelector('.crafting-io-name');
    assert.ok(thumb, 'tool image rendered');
    assert.equal(name.textContent.trim(), 'Mortar & Pestle');
    assert.ok(
      thumb.compareDocumentPosition(name) & window.Node.DOCUMENT_POSITION_FOLLOWING,
      'the image comes before the name in document order'
    );
  });

  it('renders routed ingredient options as cards under the check with status + products', async () => {
    const onChoose = [];
    const target = await harness.mount({
      recipe: recipe({
        modeToken: 'routedByIngredients',
        modeLabel: 'Routed by ingredients',
        defaultSetId: 'set-a',
        check: {
          dc: 12,
          rollFormula: '1d20',
          skill: null,
          optional: true,
          mandatory: false,
          usable: true,
          resolvedFormula: '1d20',
          formulaResolved: true,
        },
        ingredientSets: [
          {
            id: 'set-a',
            label: 'Verdant Warding',
            craftability: craftability({ canCraft: true }),
            products: [{ name: 'Warding Shield Boss', img: 'icons/shield.webp', qty: 1 }],
          },
          {
            id: 'set-b',
            label: 'Graveward Binding',
            craftability: craftability({
              canCraft: false,
              toolStates: [{ name: 'Anvil', available: false }],
            }),
            products: [{ name: 'Warding Shield Boss', img: 'icons/shield.webp', qty: 2 }],
          },
        ],
      }),
      selectedSetId: 'set-a',
      craftability: craftability({ canCraft: true }),
      onChoose: (id) => onChoose.push(id),
    });

    const section = target.querySelector('[data-recipe-section="ingredient-sets"]');
    assert.ok(section, 'ingredient options section rendered');
    const cards = section.querySelectorAll('.crafting-option-card');
    assert.equal(cards.length, 2, 'one card per option');

    const cardA = section.querySelector('[data-set-id="set-a"]');
    const cardB = section.querySelector('[data-set-id="set-b"]');
    assert.equal(cardA.getAttribute('aria-pressed'), 'true', 'selected option marked');
    assert.equal(cardA.getAttribute('data-option-status'), 'craftable');
    assert.equal(cardB.getAttribute('data-option-status'), 'blocked', 'missing tool → blocked');
    assert.ok(
      cardA.querySelector('.crafting-option-status.tone-success'),
      'craftable status is green'
    );
    assert.ok(cardB.querySelector('.crafting-option-status.tone-danger'), 'blocked status is red');

    // Product tile with a quantity pip.
    assert.ok(cardA.querySelector('.crafting-option-product .crafting-thumb img'), 'product image');
    assert.equal(
      cardA.querySelector('.crafting-option-product-pip').textContent.trim(),
      '×1',
      'quantity pip'
    );

    // The options render AFTER the crafting check in document order.
    const check = target.querySelector('[data-recipe-section="check"]');
    assert.ok(
      check.compareDocumentPosition(section) & window.Node.DOCUMENT_POSITION_FOLLOWING,
      'ingredient options come after the crafting check'
    );

    cardB.click();
    flushSync();
    assert.deepEqual(onChoose, ['set-b'], 'clicking a card selects that route');
  });

  it('routes the Produces output to the selected ingredient set', async () => {
    const routed = () =>
      recipe({
        modeToken: 'routedByIngredients',
        modeLabel: 'Routed by ingredients',
        defaultSetId: 'set-a',
        result: { items: [{ name: 'STALE default', img: null, qty: 9 }], time: null, timeLabel: null, xp: null },
        ingredientSets: [
          {
            id: 'set-a',
            label: 'Iron route',
            craftability: craftability(),
            products: [{ name: 'Iron Boss', img: 'icons/iron.webp', qty: 1 }],
          },
          {
            id: 'set-b',
            label: 'Steel route',
            craftability: craftability(),
            products: [{ name: 'Steel Boss', img: 'icons/steel.webp', qty: 2 }],
          },
        ],
      });

    const outputName = (target) =>
      target.querySelector('[data-io-group="outputs"] .crafting-io-output-name')?.textContent.trim();

    const targetA = await harness.mount({ recipe: routed(), selectedSetId: 'set-a' });
    assert.equal(outputName(targetA), 'Iron Boss', 'Produces follows the selected route (set-a)');

    const targetB = await harness.mount({ recipe: routed(), selectedSetId: 'set-b' });
    assert.equal(outputName(targetB), 'Steel Boss', 'Produces follows the selected route (set-b)');
  });

  it('colours tiered outcomes green for success and red for failure', async () => {
    const target = await harness.mount({
      recipe: recipe({
        modeToken: 'routedByCheck',
        modeLabel: 'Routed by check',
        check: {
          dc: 15,
          rollFormula: '1d20',
          skill: null,
          optional: false,
          mandatory: true,
          usable: true,
        },
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
      selectedSetId: recipe().defaultSetId,
      craftability: craftability(),
    });

    const section = target.querySelector('[data-recipe-section="outcome-tiers"]');
    const successRow = section.querySelector('[data-tier-success="true"]');
    const failureRow = section.querySelector('[data-tier-success="false"]');
    assert.ok(successRow.classList.contains('is-success'), 'success tier reads green');
    assert.ok(failureRow.classList.contains('is-failure'), 'failure tier reads red');
    assert.ok(
      successRow.querySelector('.crafting-tier-flag.tone-success'),
      'success flag uses the success tone'
    );
    assert.ok(
      failureRow.querySelector('.crafting-tier-flag.tone-danger'),
      'failure flag uses the danger tone'
    );
  });

  it('shows the check formula resolved against the selected actor', async () => {
    const target = await harness.mount({
      recipe: recipe({
        check: {
          dc: 15,
          rollFormula: '1d20 + @prof',
          skill: null,
          optional: true,
          mandatory: false,
          usable: true,
          resolvedFormula: '1d20 + 2',
          formulaResolved: true,
        },
      }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability(),
    });

    const formula = target.querySelector('[data-check-formula]');
    assert.ok(formula, 'check formula rendered');
    assert.equal(formula.getAttribute('data-check-formula-resolved'), 'true');
    const code = formula.querySelector('code');
    assert.equal(code.textContent.trim(), '1d20 + 2', 'shows resolved numbers, not @placeholders');
    assert.equal(code.getAttribute('title'), '1d20 + @prof', 'raw formula kept as the tooltip');
    assert.equal(
      target.querySelector('[data-check-formula-error]'),
      null,
      'no error note when resolved'
    );
  });

  it('shows an error state when the check formula does not resolve for the actor', async () => {
    const target = await harness.mount({
      recipe: recipe({
        check: {
          dc: 15,
          rollFormula: '1d20 + @prof',
          skill: null,
          optional: true,
          mandatory: false,
          usable: true,
          resolvedFormula: '1d20 + NaN',
          formulaResolved: false,
        },
      }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability(),
    });

    const formula = target.querySelector('[data-check-formula]');
    assert.equal(formula.getAttribute('data-check-formula-resolved'), 'false');
    assert.equal(
      formula.querySelector('code').textContent.trim(),
      '1d20 + @prof',
      'the raw formula stays visible in the error state'
    );
    assert.ok(target.querySelector('[data-check-formula-error]'), 'error note rendered');
    assert.ok(
      target.querySelector('.crafting-check-card.is-formula-error'),
      'the check card is marked as an error'
    );
  });

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
