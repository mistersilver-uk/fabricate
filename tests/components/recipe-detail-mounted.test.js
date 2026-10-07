import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { versionedTransitionResult } from '../../src/systems/versionedCommandResults.js';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { chipGroundAlpha, themeTokens } from '../helpers/chipPaint.js';
import { chipToneOf } from '../helpers/chipTone.js';
import {
  craftability,
  essenceCraftability,
  multiStepRecipe,
  recipe,
  steppedEssenceRecipe,
} from '../helpers/crafting-fixtures.js';
import { assertIdentityHeader, primaryButtons } from '../helpers/playerDetailHeaderAssertions.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const THEMES = themeTokens(readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8'));

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

// One table row per resolution mode.
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
          names: ['Success'],
          success: true,
          awardedResults: [{ name: 'Elixir', img: null, qty: 1 }],
        },
        { id: 't-fail', names: ['Failure'], success: false, awardedResults: [] },
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
      // The Craft primary lives in the identity header, outside the scrolling detail region.
      assert.ok(
        target.querySelector('[data-recipe-header]').querySelector('[data-crafting-craft]'),
        'the craft primary is in the header'
      );
      const scroll = target.querySelector('[data-crafting-detail-scroll]');
      assert.ok(scroll, 'the detail content has a dedicated scroll region');
      assert.ok(
        !scroll.querySelector('[data-crafting-craft]'),
        'the craft primary is not inside the scroll region'
      );
    });
  }

  for (const testCase of MODE_CASES) {
    it(`draws one primary for a craftable ${testCase.mode} recipe, in the identity header`, async () => {
      const crafted = [];
      const target = await harness.mount({
        recipe: testCase.fixture,
        selectedSetId: testCase.fixture.defaultSetId,
        craftability: craftability(),
        onCraft: () => {
          crafted.push(testCase.mode);
        },
      });

      const pane = target.querySelector('[data-crafting-detail-state="selected"]');
      const row = assertIdentityHeader(pane, { primaries: 1, name: testCase.fixture.name });
      const [primary] = primaryButtons(row);
      assert.ok(primary.hasAttribute('data-crafting-craft'), 'and it is the Craft verb');
      assert.equal(primary.getAttribute('data-crafting-craft-disabled'), 'false');
      primary.click();
      assert.deepEqual(crafted, [testCase.mode]);
    });
  }

  it('names the primary Craft before a roll and Craft another after one', async () => {
    const label = (target) => primaryButtons(target)[0].textContent.trim();
    const fresh = await harness.mount({ recipe: recipe(), craftability: craftability() });
    assert.equal(label(fresh), 'FABRICATE.App.Crafting.Button.Craft');
    harness.remount();
    const again = await harness.mount({
      recipe: recipe(),
      craftability: craftability(),
      rollResult: { success: true, items: [] },
    });
    assert.equal(label(again), 'FABRICATE.App.Crafting.Button.CraftAnother');
  });

  // Availability is a cache the boot and journal hooks refresh, so a stale refusal must not
  // remove the pane's only way forward: the primary stays live beside the stated refusal.
  it('keeps the primary live under an authority refusal', async () => {
    const target = await harness.mount({
      recipe: recipe(),
      craftability: craftability(),
      authorityRefusal: 'No GM is connected.',
    });
    const [primary] = primaryButtons(assertIdentityHeader(target, { primaries: 1 }));
    assert.equal(primary.disabled, false);
    assert.ok(
      target.querySelector('[data-recipe-blocking]').hasAttribute('data-recipe-authority-blocked')
    );
  });

  it('keeps the one primary, disabled and renamed, while a craft is in flight', async () => {
    const target = await harness.mount({
      recipe: recipe(),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability({ canCraft: false }),
      busy: true,
    });

    const [primary] = primaryButtons(assertIdentityHeader(target, { primaries: 1 }));
    assert.equal(primary.disabled, true);
    assert.equal(primary.getAttribute('data-crafting-craft-disabled'), 'true');
    assert.match(primary.textContent, /Button\.Crafting/u);
    assert.ok(Boolean(primary.querySelector('i.fa-spinner')));
    // The inputs a craft in flight has spent are not a shortfall.
    assert.ok(!target.querySelector('.crafting-detail-pip'), 'no missing-materials pip');
    assert.ok(!target.querySelector('[data-recipe-blocking]'), 'and no missing-materials notice');
  });

  it('renders ingredients as rail slot tiles with state-coloured borders and pips', async () => {
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

    const tiles = target.querySelectorAll('[data-recipe-section="requirement-rail"] [data-requirement-slot]');
    assert.equal(tiles.length, 2, 'one rail slot per ingredient');

    const [sufficient, short] = tiles;
    assert.equal(sufficient.getAttribute('data-slot-state'), 'met');
    assert.equal(short.getAttribute('data-slot-state'), 'short');
    // A fixed requirement is not selectable.
    assert.notEqual(sufficient.tagName, 'BUTTON', 'a fixed slot is not a button');
    assert.ok(
      sufficient.querySelector('[role="img"]').getAttribute('aria-label').includes('Iron'),
      'and its tile carries a name'
    );

    assert.ok(sufficient.querySelector('[data-medallion="image"] img'), 'tile renders the image');
    assert.equal(
      sufficient.querySelector('.fab-slot-pip').textContent.trim(),
      '2/2',
      'pip shows have/need'
    );
    assert.equal(short.querySelector('.fab-slot-pip').textContent.trim(), '1/3');
    assert.ok(
      short.querySelector('.fab-slot-tile').classList.contains('is-short'),
      'the short tile paints from the danger state'
    );
  });

  it('renders authored essence glyphs with fallback while preserving ordinary images', async () => {
    const target = await harness.mount({
      recipe: recipe({ modeToken: 'simple', modeLabel: 'Simple' }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability({
        canCraft: false,
        ingredientStates: [
          {
            componentId: null,
            name: 'Restorative essence',
            img: null,
            icon: 'fa-solid fa-heart',
            isEssence: true,
            description: '2x Restorative essence',
            need: 2,
            delivered: 1,
            owned: 3,
            satisfied: false,
          },
          {
            componentId: 'c1',
            name: 'Iron',
            img: 'icons/iron.webp',
            description: '1x Iron',
            need: 1,
            have: 1,
            satisfied: true,
          },
        ],
        essenceStates: [
          { type: 'aether', name: 'Aether', icon: 'fa-regular fa-star', need: 1, have: 1, satisfied: true },
          { type: 'void', name: 'Void', icon: 'not-a-font-awesome-icon', need: 1, have: 0, satisfied: false },
        ],
      }),
    });

    const tiles = target.querySelectorAll('[data-recipe-section="requirement-rail"] [data-requirement-slot]');
    const essenceGlyph = tiles[0].querySelector('[data-medallion="glyph"] i');
    assert.ok(essenceGlyph, 'first-class essence renders an authored glyph, not an image');
    assert.ok(essenceGlyph.classList.contains('fa-heart'));
    assert.ok(!tiles[0].querySelector('img'), 'essence does not render an image');
    // `delivered`, never `have`: the essence branch upstream stopped answering the
    // have question, so a `have` read would print 0/2 on a partly funded tile.
    assert.equal(tiles[0].querySelector('.fab-slot-pip').textContent.trim(), '1/2');
    assert.equal(
      tiles[1].querySelector('[data-medallion="image"] img').getAttribute('src'),
      'icons/iron.webp'
    );

    const legacyIcons = target.querySelectorAll(
      '[data-io-group="essences"] .crafting-io-essence-icon'
    );
    assert.ok(legacyIcons[0].classList.contains('far'), 'legacy icon prefix is normalized');
    assert.ok(legacyIcons[0].classList.contains('fa-star'), 'authored legacy glyph renders');
    assert.ok(legacyIcons[1].classList.contains('fa-mortar-pestle'), 'unusable legacy icon falls back');
    assert.match(target.querySelector('[data-io-group="essences"]').textContent, /Aether/);
    assert.match(target.querySelector('[data-io-group="essences"]').textContent, /Void/);
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
      '[data-io-group="tools"] tr[data-io-satisfied] .crafting-io-tool-label'
    );
    assert.ok(label, 'tool label wrapper rendered');
    const thumb = label.querySelector('[data-medallion="image"] img');
    const name = label.querySelector('.crafting-io-name');
    assert.ok(thumb, 'tool image rendered');
    assert.equal(name.textContent.trim(), 'Mortar & Pestle');
    assert.ok(
      thumb.compareDocumentPosition(name) & window.Node.DOCUMENT_POSITION_FOLLOWING,
      'the image comes before the name in document order'
    );
  });

  it('compares routed ingredient options as radio cards under the check, with status + products', async () => {
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
    // One radio group, so the arrow keys move between routes; no route is a button.
    const radios = [...section.querySelectorAll(':scope fieldset input[type="radio"]')];
    assert.equal(radios.length, 2, 'one route radio per option');
    assert.ok(radios[0].name, 'the routes share a group name');
    assert.ok(radios.every((radio) => radio.name === radios[0].name), 'one group, not two');
    assert.equal(section.querySelectorAll(':scope button').length, 0, 'no route is a button');

    const cardA = section.querySelector('[data-set-id="set-a"]');
    const cardB = section.querySelector('[data-set-id="set-b"]');
    assert.deepEqual(
      [cardA.tagName, cardA.querySelector('input').checked, cardB.querySelector('input').checked],
      ['LABEL', true, false],
      'each route is a radio card, and the chosen one is checked'
    );
    assert.match(cardA.textContent, /SelectedRoute/, 'the chosen route says so');
    assert.doesNotMatch(cardB.textContent, /SelectedRoute/, 'and only the chosen one');

    const statusA = cardA.querySelector('[data-option-status]');
    const statusB = cardB.querySelector('[data-option-status]');
    assert.deepEqual(
      [statusA.dataset.optionStatus, statusA.dataset.optionStatusTone, chipToneOf(statusA)],
      ['craftable', 'success', 'positive'],
      'craftable status is the green chip'
    );
    assert.deepEqual(
      [statusB.dataset.optionStatus, chipToneOf(statusB)],
      ['blocked', 'danger'],
      'missing tool → the blocked, red chip'
    );

    // Each route's products are dense list rows with a 22px mark, chosen or not.
    for (const [card, quantity] of [
      [cardA, '×1'],
      [cardB, '×2'],
    ]) {
      const rows = card.querySelectorAll(':scope .fabricate-list-row');
      assert.equal(rows.length, 1, 'one row per product');
      const [row] = rows;
      assert.equal(row.dataset.listRow, 'dense');
      assert.equal(row.querySelector('.fabricate-list-row-name').textContent, 'Warding Shield Boss');
      assert.equal(row.querySelector('.fabricate-list-row-quantity').textContent, quantity);
      const mark = row.querySelector('[data-medallion="image"]');
      assert.match(mark.getAttribute('style'), /width: ?22px; ?height: ?22px/, 'the dense row’s mark');
      assert.ok(mark.querySelector('img'), 'product image');
    }

    // The options render AFTER the crafting check in document order.
    const check = target.querySelector('[data-recipe-section="check"]');
    assert.ok(
      check.compareDocumentPosition(section) & window.Node.DOCUMENT_POSITION_FOLLOWING,
      'ingredient options come after the crafting check'
    );

    // An arrow key moves a native radio group's selection and fires `change` (measured in
    // Chromium by `crafting-rows-rendered`); the change is what chooses the route.
    radios[1].checked = true;
    radios[1].dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(onChoose, ['set-b'], 'choosing a route radio selects that route');
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

  it('reads the terminal-step product for a MULTI-step routed recipe (issue 1907)', async () => {
    // Every projected set resolves against the first step, whose group may legally be empty on a
    // multi-step recipe, so the headline follows `result.items` instead of the selected route.
    const routed = (stepCount) =>
      recipe({
        modeToken: 'routedByIngredients',
        modeLabel: 'Routed by ingredients',
        defaultSetId: 'set-a',
        stepCount,
        result: { items: [{ name: 'Folded Blade', img: null, qty: 1 }], time: null, timeLabel: null, xp: null },
        ingredientSets: [
          { id: 'set-a', label: 'Fold', craftability: craftability(), products: [] },
        ],
      });

    const outputNames = (target) =>
      [...target.querySelectorAll('[data-io-group="outputs"] .crafting-io-output-name')].map(
        (node) => node.textContent.trim()
      );

    const hint = (target) =>
      target.querySelector('[data-recipe-section="routing-hint"]')?.textContent.trim();

    const multi = await harness.mount({ recipe: routed(2), selectedSetId: 'set-a' });
    assert.deepEqual(outputNames(multi), ['Folded Blade'], 'the terminal product is shown');
    // The hint has to agree with the row above it: on a multi-step recipe the chosen option no
    // longer decides the product, so the absolute copy would contradict the screen.
    assert.equal(hint(multi), 'FABRICATE.App.Crafting.Detail.IngredientRoutingHintMultiStep');

    const single = await harness.mount({ recipe: routed(1), selectedSetId: 'set-a' });
    assert.deepEqual(outputNames(single), [], 'a single-step recipe still follows its selected set');
    assert.equal(hint(single), 'FABRICATE.App.Crafting.Detail.IngredientRoutingHint');
  });

  // Issue 1644: the tiers are the shared `OutcomeLadder`, its rows `data-tier-success`-hooked.
  const routedRecipe = (outcomeTiers) =>
    recipe({
      modeToken: 'routedByCheck',
      modeLabel: 'Routed by check',
      check: CHECK,
      result: { items: [], time: null, timeLabel: null, xp: null },
      outcomeTiers,
    });
  const mountTiers = (outcomeTiers, rollResult = null) =>
    harness.mount({
      recipe: routedRecipe(outcomeTiers),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability(),
      rollResult,
    });
  const tierSection = (target) => target.querySelector('[data-recipe-section="outcome-tiers"]');
  const rolledTiers = (target) =>
    [...tierSection(target).querySelectorAll('[data-outcome-rolled]')].map((node) =>
      node.getAttribute('data-outcome-tier')
    );
  const COLLAPSED = [
    {
      id: 't-flawed',
      ids: ['t-flawed', 't-standard', 't-fine'],
      names: ['Flawed', 'Standard', 'Fine'],
      success: true,
      awardedResults: [{ name: 'Bronze Ingot', img: null, qty: 2 }],
    },
    {
      id: 't-master',
      ids: ['t-master'],
      names: ['Masterwork'],
      success: true,
      awardedResults: [{ name: 'Steel Ingot', img: null, qty: 1 }],
    },
    { id: 't-ruined', ids: ['t-ruined'], names: ['Ruined'], success: false, awardedResults: [] },
  ];
  const rolled = (outcomeId, success = true) => ({
    success,
    checkResult: { success, data: { outcomeId } },
  });

  it('tones tiered outcomes by success and failure, with no band chip and no control', async () => {
    const target = await mountTiers([
      {
        id: 't-success',
        names: ['Success'],
        success: true,
        awardedResults: [{ name: 'Elixir', img: null, qty: 1 }],
      },
      { id: 't-fail', names: ['Failure'], success: false, awardedResults: [] },
    ]);
    const section = tierSection(target);
    const successRow = section.querySelector('[data-tier-success="true"]');
    const failureRow = section.querySelector('[data-tier-success="false"]');
    assert.ok(successRow.matches('.fab-outcome-tier:not(.is-failure)'), 'success tier is not failed');
    assert.ok(failureRow.matches('.fab-outcome-tier.is-failure'), 'failure tier reads as failed');
    assert.ok(successRow.querySelector('.fa-circle-check'), 'success tier states a check glyph');
    assert.ok(failureRow.querySelector('.fa-circle-xmark'), 'failure tier states a cross glyph');
    const status = (row) => row.querySelector('.visually-hidden[data-outcome-status]')?.textContent;
    assert.equal(status(successRow), 'FABRICATE.Check.Evidence.Success', 'the glyph is named');
    assert.equal(status(failureRow), 'FABRICATE.Check.Evidence.Failure');
    assert.equal(
      failureRow.querySelector('[data-outcome-empty]').textContent.trim(),
      'FABRICATE.App.Crafting.Detail.TierNoAward',
      'an empty tier says it awards nothing'
    );
    assert.equal(section.querySelectorAll('.fab-outcome-tier').length, 2, 'the rows are drawn');
    assert.equal(
      section.querySelectorAll(':scope .fab-outcome-tier-heading .manager-chip').length,
      0,
      'crafting tiers carry no band, so no chip'
    );
    assert.equal(section.querySelectorAll('button, input, select').length, 0, 'no control');
  });

  it('renders a collapsed tier group as one row listing every tier name', async () => {
    const target = await mountTiers(COLLAPSED);
    const rows = tierSection(target).querySelectorAll('.fab-outcome-tier');
    assert.equal(rows.length, 3, 'one collapsed success row, one more success, one failure');
    assert.equal(
      rows[0].querySelector('.fab-outcome-tier-name').textContent.trim(),
      'Flawed, Standard, Fine',
      'the collapsed row lists every contributing tier name'
    );
    assert.equal(rows[0].querySelectorAll('[data-list-row]').length, 1, 'the shared result once');
  });

  it('marks "Your roll" on the row a success outcome id was merged into', async () => {
    const target = await mountTiers(COLLAPSED, rolled('t-standard'));
    assert.deepEqual(rolledTiers(target), ['t-flawed'], 'exactly the row Standard merged into');
    const pill = tierSection(target).querySelector(':scope [data-outcome-rolled] [data-outcome-reached]');
    assert.equal(pill.textContent.trim(), 'FABRICATE.App.Crafting.Detail.YourRoll');
    harness.remount();
    const own = await mountTiers(COLLAPSED, rolled('t-master'));
    assert.deepEqual(rolledTiers(own), ['t-master'], "a row's own id marks it");
  });

  it('marks the row a live craft result names, and none for a failed one', async () => {
    // The engine's own result shape: a successful stage records its routed tier (issue 1644).
    const run = { id: 'run-1', status: 'completed', runRevision: 2, currentStepIndex: null };
    const live = (success) =>
      versionedTransitionResult(run, {
        success,
        disposition: success ? 'succeeded' : 'failed',
        ...(success && { outcomeId: 't-fine' }),
      });
    const target = await mountTiers(COLLAPSED, live(true));
    assert.deepEqual(rolledTiers(target), ['t-flawed'], 'exactly the row Fine merged into');
    harness.remount();
    const failed = await mountTiers(COLLAPSED, live(false));
    assert.deepEqual(rolledTiers(failed), [], 'a failed craft marks no row');
  });

  it('marks no row before a roll, after a failed roll, or for an unknown outcome', async () => {
    const before = await mountTiers(COLLAPSED);
    assert.deepEqual(rolledTiers(before), [], 'nothing is marked before a roll');
    harness.remount();
    const failed = await mountTiers(COLLAPSED, rolled('t-ruined', false));
    assert.deepEqual(rolledTiers(failed), [], 'a failing outcome marks nothing');
    harness.remount();
    const unknown = await mountTiers(COLLAPSED, rolled('t-elsewhere'));
    assert.deepEqual(rolledTiers(unknown), [], 'an outcome no row names marks nothing');
    assert.equal(tierSection(unknown).querySelectorAll('.fab-outcome-tier').length, 3);
  });

  it('draws each result kind on the shared row with its kind hook', async () => {
    const target = await mountTiers([
      {
        id: 't-pass',
        ids: ['t-pass'],
        names: ['Pass'],
        success: true,
        awardedResults: [
          { name: 'Iron Sword', img: 'icons/sword.webp', qty: 2 },
          {
            kind: 'currency',
            name: 'Gold',
            img: null,
            glyph: 'fa-solid fa-coins',
            qty: 5,
            amountText: '5 gp',
          },
          {
            kind: 'knowledge',
            name: 'Runeblade',
            img: null,
            glyph: 'fa-solid fa-book-open',
            qty: 1,
            amountText: 'Recipe knowledge',
          },
          {
            kind: 'group',
            name: 'Choose one',
            img: null,
            glyph: 'fa-solid fa-layer-group',
            qty: 1,
            amountText: 'Ruby · Opal',
            members: [
              { name: 'Ruby', img: null, qty: 1 },
              { name: 'Opal', img: null, qty: 1 },
            ],
          },
        ],
      },
    ]);
    const row = (kind) =>
      tierSection(target).querySelector(`[data-list-row][data-award-kind="${kind}"]`);
    const text = (node, part) =>
      node.querySelector(`.fabricate-list-row-${part}`)?.textContent.trim() ?? null;
    const item = row('component');
    assert.equal(text(item, 'name'), 'Iron Sword');
    assert.equal(text(item, 'quantity'), '×2', 'an item states its count');
    assert.equal(item.querySelector('img').getAttribute('src'), 'icons/sword.webp');
    const currency = row('currency');
    assert.equal(text(currency, 'quantity'), '5 gp', 'a credit states its amount');
    assert.ok(currency.querySelector('.fa-coins'), 'a credit draws its glyph');
    const knowledge = row('knowledge');
    assert.equal(text(knowledge, 'quantity'), 'Recipe knowledge');
    assert.ok(knowledge.querySelector('.fa-book-open'), 'a recipe draws its glyph');
    const group = row('group');
    assert.equal(text(group, 'name'), 'Choose one');
    assert.equal(text(group, 'detail'), 'Ruby · Opal', 'a choice group lists its members');
    assert.equal(text(group, 'quantity'), null, 'and states no count of its own');
    assert.ok(group.querySelector('.fa-layer-group'));
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
    const value = formula.querySelector('.fabricate-info-strip-value');
    assert.equal(value.textContent.trim(), '1d20 + 2', 'shows resolved numbers, not @placeholders');
    assert.equal(formula.getAttribute('title'), '1d20 + @prof', 'raw formula kept as the tooltip');
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
      formula.querySelector('.fabricate-info-strip-value').textContent.trim(),
      '1d20 + @prof',
      'the raw formula stays visible in the error state'
    );
    // Issue 1521: the error is a danger notice after the strip, inside the check section, and the
    // strip itself is never tinted.
    const error = target.querySelector(
      ':scope [data-recipe-section="check"] > .fabricate-info-strip + .fab-notice.is-danger[data-check-formula-error]'
    );
    assert.ok(Boolean(error), 'the danger notice follows the strip inside the check section');
    assert.equal(
      error.textContent.trim(),
      'FABRICATE.App.Crafting.Check.FormulaUnresolved',
      'it carries only its reason'
    );
    assert.ok(!target.querySelector('.is-formula-error'), 'no card tint marks the error');
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
    // The mode chip reveals the crafting mechanism.
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

  it('renders an explicit multi-step simple recipe as per-step blocks + one terminal produces', async () => {
    const fixture = multiStepRecipe();
    const target = await harness.mount({
      recipe: fixture,
      selectedSetId: fixture.defaultSetId,
      craftability: fixture.ingredientSets[0].craftability,
      steps: fixture.steps
    });

    // The multi-step hint strip renders at the top of the step list.
    assert.ok(
      target.querySelector('[data-recipe-section="steps-hint"]'),
      'multi-step hint strip rendered'
    );

    // One ordered list item per step, each carrying its own materials (INPUTS only).
    const steps = target.querySelectorAll('[data-recipe-section="steps"] ol > [data-recipe-step]');
    assert.equal(steps.length, 2, 'both step blocks rendered as list items');
    assert.equal(
      steps[0].querySelector('[data-recipe-step-label]').textContent.replace(/\s+/g, ' ').trim(),
      '1 Cut 30 min',
      'first step shows its ordinal, label, and duration'
    );
    assert.equal(
      steps[1].querySelector('[data-recipe-step-duration]').textContent.replace(/\s+/g, ' ').trim(),
      '1 hr',
      'second step shows its distinct authored duration'
    );
    assert.equal(
      target.querySelector('[data-recipe-duration]').textContent.replace(/\s+/g, ' ').trim(),
      'Total duration: 1 hr 30 min',
      'the header visibly identifies the aggregate duration once'
    );

    // Step 1 lists BOTH of its required materials.
    const stepOneTiles = steps[0].querySelectorAll('[data-requirement-slot]');
    assert.equal(stepOneTiles.length, 2, 'step 1 shows both required materials');
    // Step 2 lists its single material.
    const stepTwoTiles = steps[1].querySelectorAll('[data-requirement-slot]');
    assert.equal(stepTwoTiles.length, 1, 'step 2 shows its material');

    // No per-step Output group leaks into a step block (inputs only).
    assert.equal(
      steps[0].querySelector('[data-io-group="outputs"]'),
      null,
      'step blocks render no per-step output'
    );

    // Exactly ONE emphasized terminal PRODUCES row — the final product (Tent).
    const outputs = target.querySelectorAll('[data-io-group="outputs"] [data-io-output]');
    assert.equal(outputs.length, 1, 'a single terminal produces row');
    assert.equal(
      outputs[0].querySelector('.crafting-io-output-name').textContent.trim(),
      'Tent',
      'produces the final product, not a step intermediate'
    );

    // A disabled, formula-less check surfaces no check card.
    assert.equal(
      target.querySelector('[data-recipe-section="check"]'),
      null,
      'no crafting-check card when the check is off'
    );
  });

  // Only the step the engine would execute next may be interactive.
  it('makes ONLY the active step rail interactive in a multi-step recipe', async () => {
    const fixture = steppedEssenceRecipe();
    const target = await harness.mount({
      recipe: fixture,
      selectedSetId: fixture.defaultSetId,
      craftability: fixture.ingredientSets[0].craftability,
      steps: fixture.steps,
      activeStepId: fixture.activeStepId,
      rail: { openSlotId: 'essence-pool', chosenGroupIds: [] }
    });

    const steps = target.querySelectorAll('[data-recipe-section="steps"] ol > [data-recipe-step]');
    assert.equal(steps.length, 2);
    assert.ok(
      steps[0].querySelector('[data-recipe-section="essence-pool"]'),
      'the active step opens its pool'
    );
    assert.ok(
      !steps[0].querySelector('[data-requirement-rail-readonly]'),
      'and its rail is interactive'
    );
    assert.ok(
      steps[1].querySelector('[data-requirement-rail-readonly]'),
      'the later step is read-only preview'
    );
    assert.ok(
      !steps[1].querySelector('[data-recipe-section="essence-pool"]'),
      'and opens no chooser at all'
    );
    // Every rail in the list gets its OWN DOM id namespace.
    assert.equal(
      steps[0]
        .querySelector('[data-recipe-section="essence-pool"]')
        .closest('[role="region"]')
        .getAttribute('id'),
      'fabricate-req-step-step-ess-1-panel'
    );
  });

  // With no run in flight the active step IS the displayed step.
  it('feeds the displayed step rail the re-evaluated craftability, not the baked step projection', async () => {
    const fixture = steppedEssenceRecipe();
    const recomputed = essenceCraftability();
    const target = await harness.mount({
      recipe: fixture,
      selectedSetId: fixture.defaultSetId,
      craftability: recomputed,
      steps: fixture.steps,
      activeStepId: fixture.activeStepId,
      displayedStepId: fixture.displayedStepId,
      rail: {}
    });
    const steps = target.querySelectorAll('[data-recipe-section="steps"] ol > [data-recipe-step]');
    // The step projection authors TWO essence requirements.
    assert.equal(steps[0].querySelectorAll('[data-requirement-slot]').length, 1);
    assert.equal(steps[1].querySelectorAll('[data-requirement-slot]').length, 1);
  });

  // The re-evaluated craftability the store hands down is projected from the recipe's
  // FIRST step, which stops being the active step the moment a run is parked past it.
  it('renders each step from its own projection while a run is parked on a later step', async () => {
    const fixture = steppedEssenceRecipe({ activeStepIndex: 1, activeStepId: 'step-ess-2' });
    // `displayedStepId` stays 'step-ess-1' — the step the top-level projection describes.
    const target = await harness.mount({
      recipe: fixture,
      selectedSetId: fixture.defaultSetId,
      craftability: fixture.ingredientSets[0].craftability,
      steps: fixture.steps,
      activeStepId: fixture.activeStepId,
      displayedStepId: fixture.displayedStepId,
      rail: { readOnly: true }
    });

    const steps = target.querySelectorAll('[data-recipe-section="steps"] ol > [data-recipe-step]');
    assert.equal(steps.length, 2, 'both step blocks rendered');

    // Requirements: step 1 authors two essence requirements, step 2 exactly one.
    assert.equal(
      steps[0].querySelectorAll('[data-requirement-slot]').length,
      2,
      'the displayed step shows its own two requirements'
    );
    assert.equal(
      steps[1].querySelectorAll('[data-requirement-slot]').length,
      1,
      "the parked-on step shows its own single requirement, not the displayed step's two"
    );

    // Consumption plan: each block spends its own step's allocated carrier.
    const consumptionKeys = (step) =>
      [...step.querySelectorAll('[data-consumption-row]')].map((row) =>
        row.getAttribute('data-consumption-row')
      );
    const displayedSpend = consumptionKeys(steps[0]);
    const activeSpend = consumptionKeys(steps[1]);
    assert.ok(displayedSpend.length > 0, 'the displayed step states what it will spend');
    assert.ok(activeSpend.length > 0, 'the parked-on step states what it will spend');
    assert.ok(
      activeSpend.every((key) => !displayedSpend.includes(key)),
      'the two consumption plans name disjoint carriers'
    );

    // Tools follow the same craftability, so a shared projection repeats one step's tools.
    const toolNames = (step) =>
      [...step.querySelectorAll('[data-io-group="tools"] .crafting-io-name')].map((name) =>
        name.textContent.trim()
      );
    assert.deepEqual(toolNames(steps[0]), ["Alchemist's Supplies"]);
    assert.deepEqual(toolNames(steps[1]), ["Jeweler's Tools"]);
  });

  it('falls back to a single IoTable when steps is empty (single-step parity)', async () => {
    // The multi-step body is gated on steps.length > 1. With an empty steps prop the
    // model renders unchanged: one IoTable, no ordered step list. This documents the
    // single-step parity path the multi-step branch must not regress.
    const fixture = multiStepRecipe({ steps: [] });
    const target = await harness.mount({
      recipe: fixture,
      selectedSetId: fixture.defaultSetId,
      craftability: fixture.ingredientSets[0].craftability,
      steps: []
    });
    assert.equal(
      target.querySelector('[data-recipe-section="steps"]'),
      null,
      'no ordered step list when steps is empty'
    );
    assert.ok(target.querySelector('[data-recipe-section="io"]'), 'the single IoTable renders');
  });

  it('shows the authored craft duration chip before crafting for a timed recipe', async () => {
    // Issue 846: a player choosing a timed recipe must see how long it takes BEFORE
    // starting the craft, not only as a countdown once it is underway. The chip reads
    // the recipe's dedicated authored duration and formats it with the shared
    // compact formatter the manager uses.
    const timed = recipe({
      duration: { minutes: 30, hours: 2, days: 0, months: 0, years: 0 },
    });
    const target = await harness.mount({
      recipe: timed,
      selectedSetId: timed.defaultSetId,
      craftability: timed.ingredientSets[0].craftability,
    });

    const chip = target.querySelector(
      '.player-detail-header-meta [data-recipe-duration]'
    );
    assert.ok(chip, 'the pre-craft duration chip renders for a timed recipe');
    // Largest-unit-first compact formatting (mirrors the manager Overview).
    assert.equal(chip.textContent.replace(/\s+/g, ' ').trim(), 'Duration: 2 hr 30 min');
  });

  it('shows no duration chip for an instant (zero-duration) recipe', async () => {
    // The default fixture has result.time === null (instant). An instant craft must not
    // show a misleading "0 min" — the chip is omitted entirely.
    const instant = recipe();
    const target = await harness.mount({
      recipe: instant,
      selectedSetId: instant.defaultSetId,
      craftability: instant.ingredientSets[0].craftability,
    });

    assert.equal(
      target.querySelector('[data-recipe-duration]'),
      null,
      'no duration chip on an instant recipe'
    );
  });

  it('does not leak the craft duration on a redacted (discovery) teaser', async () => {
    // A timed recipe that is still undiscovered must not reveal its timing.
    const teaser = recipe({
      redaction: { redacted: true, hiddenFields: ['ingredients', 'results', 'description'] },
      browseStatus: 'discovery',
      duration: { minutes: 0, hours: 4, days: 0, months: 0, years: 0 },
    });
    const target = await harness.mount({
      recipe: teaser,
      selectedSetId: null,
      craftability: null,
    });

    assert.ok(target.querySelector('[data-recipe-teaser]'), 'teaser hint rendered');
    assert.equal(
      target.querySelector('[data-recipe-duration]'),
      null,
      'no duration chip leaks on a discovery teaser'
    );
  });

  it('omits a zero-duration step chip from a mixed timed and instant sequence', async () => {
    const fixture = multiStepRecipe();
    fixture.steps[1].duration = null;
    fixture.duration = { minutes: 30, hours: 0, days: 0, months: 0, years: 0 };
    const target = await harness.mount({
      recipe: fixture,
      selectedSetId: fixture.defaultSetId,
      craftability: fixture.ingredientSets[0].craftability,
      steps: fixture.steps,
    });

    const stepChips = target.querySelectorAll('[data-recipe-step-duration]');
    assert.equal(stepChips.length, 1, 'only the timed step renders a duration chip');
    assert.equal(stepChips[0].textContent.replace(/\s+/g, ' ').trim(), '30 min');
    assert.equal(
      target.querySelector('[data-recipe-duration]').textContent.replace(/\s+/g, ' ').trim(),
      'Total duration: 30 min'
    );
  });

  it('shows a select-a-recipe hint when no recipe is provided', async () => {
    const target = await harness.mount({ recipe: null });
    const empty = target.querySelector('[data-crafting-detail-state="empty"]');
    assert.ok(Boolean(empty), 'empty hint rendered');
    // A PANE, NOT A VIEW ROOT, AND THE FRAME MOVE IS PUBLISHED HERE (issue 1514).
    assert.ok(
      Boolean(empty.querySelector('.manager-empty')),
      'the pane draws the shared no-state panel rather than a bare glyph over a paragraph'
    );
    assert.ok(
      !empty.classList.contains('fab-view-state') && !empty.querySelector('.fab-view-state'),
      'and it does NOT route through the view-state composition, which carries the opaque ' +
        'view-ROOT fill and would paint over the centre column`s own soft tint'
    );
    assert.equal(
      empty.getAttribute('aria-busy'),
      null,
      'and it carries NO `aria-busy`: this is a PANE state with no loading branch at all, so ' +
        'it must not claim to be busy'
    );
  });

  it('renders the blocking-reasons callout when applicable', async () => {
    const blocked = recipe({
      browseStatus: 'missingMaterials',
      blockingReasons: ['You are missing some required materials.'],
    });
    const target = await harness.mount({
      recipe: blocked,
      selectedSetId: blocked.defaultSetId,
      craftability: craftability({ canCraft: false }),
    });

    const blocking = target.querySelector('[data-recipe-blocking]');
    assert.ok(Boolean(blocking), 'blocking notice rendered');
    // THE WELL IS A NON-BLOCKING `Notice` (issue 1514).
    assert.equal(blocking.getAttribute('role'), 'status', 'the status role survives the conversion');
    assert.equal(
      blocking.getAttribute('aria-live'),
      'polite',
      'and non-blocking KEEPS the polite live region the `role="status"` already implied — ' +
        'the role carries the announcement, and the explicit attribute restates it'
    );
    assert.equal(
      blocking.getAttribute('data-recipe-blocking'),
      '',
      'the hook was written bare on the deleted element, so it is passed `=""` rather ' +
        'than being coerced to `="true"` the way a bare attribute on a component tag would be'
    );
    assert.ok(
      !blocking.querySelector('li'),
      'the `<ul>` goes: `Notice` takes `title` and `detail` as STRINGS and has no children slot, ' +
        'and `CraftingListingBuilder._blockingReasons` returns `key ? [localize(key)] : []` — at ' +
        'most ONE reason for every browse status there is, so the bulleted list was always a ' +
        'one-item list. A second reason would land in `detail` rather than being dropped'
    );
    // An unavailable commit verb leaves the header with no primary, and nothing takes its place.
    assert.ok(
      !target.querySelector('[data-crafting-craft]'),
      'no craft primary while the materials are missing'
    );
    assert.equal(primaryButtons(target).length, 0, 'and no second-choice primary in its place');
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
      header.querySelector('.player-detail-header-tile.is-dimmed .crafting-detail-pip'),
      'error pip overlays the faded thumbnail'
    );
    // The pip is the shared icon-only chip at its published default square, not a local disc.
    const pip = header.querySelector(':scope .crafting-detail-pip > .manager-chip');
    assert.deepEqual(
      ['is-icon-only', 'is-solid', 'is-danger'].filter((name) => !pip.classList.contains(name)),
      []
    );
    assert.ok(!pip.classList.contains('is-list') && !pip.classList.contains('is-row'));
    assert.equal(pip.getAttribute('role'), 'img');
    assert.match(pip.getAttribute('aria-label'), /Status\.MissingMaterials/);
    assert.equal(pip.getAttribute('data-crafting-status'), 'missingMaterials');
    assert.equal(chipGroundAlpha(pip, THEMES), 1, 'opaque over the artwork it covers');
    assert.equal(
      header.querySelector('.player-detail-header-meta [data-crafting-status]'),
      null,
      'the labelled status badge is dropped in favour of the pip'
    );
    // The well is a non-blocking `Notice` since issue 1514.
    assert.equal(
      header.querySelector('[data-recipe-blocking]').getAttribute('data-notice-tone'),
      'danger',
      'the blocking notice uses the error palette when uncraftable'
    );
  });

  // The listing bakes `available`; an override to a short alternative, a short set or a pool
  // stepped below its need re-evaluates craftability without reloading the listing.
  it('reads a listed-available recipe the live evaluation refuses as missing materials', async () => {
    const target = await harness.mount({
      recipe: recipe({ browseStatus: 'available', blockingReasons: [] }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability({ canCraft: false }),
    });

    const header = target.querySelector('[data-recipe-header]');
    assert.equal(primaryButtons(target).length, 0, 'the commit verb is unavailable');
    assert.ok(
      !header.querySelector(':scope .player-detail-header-meta [data-crafting-status]'),
      'so no chip may still say the recipe is ready'
    );
    const tile = header.querySelector('.player-detail-header-tile.is-dimmed');
    assert.ok(Boolean(tile.querySelector('.crafting-detail-pip')), 'the status moves to the pip');
    assert.equal(
      tile.querySelector('[data-crafting-status]').getAttribute('data-crafting-status'),
      'missingMaterials',
      'which states the live status, not the listed one'
    );
    const notice = header.querySelector('[data-recipe-blocking]');
    assert.equal(notice.getAttribute('data-notice-tone'), 'danger');
    assert.ok(
      notice.textContent.includes('FABRICATE.App.Crafting.Blocking.MissingMaterials'),
      'and the absent primary is explained in words'
    );
  });

  it('leads the callout with the live shortfall when the authority also refuses', async () => {
    const target = await harness.mount({
      recipe: recipe({ browseStatus: 'available', blockingReasons: [] }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability({ canCraft: false }),
      authorityRefusal: 'No GM is connected.',
    });
    const text = target.querySelector('[data-recipe-blocking]').textContent;
    const shortfall = text.indexOf('Blocking.MissingMaterials');
    assert.ok(
      shortfall !== -1 && shortfall < text.indexOf('No GM is connected.'),
      'the blocker the player can act on comes first'
    );
  });

  // No craftability is no evaluation, as on the no-actor view: no readiness claim, no shortfall
  // claim, and no commit verb.
  it('claims neither readiness nor a shortfall when nothing evaluated the recipe', async () => {
    const target = await harness.mount({
      recipe: recipe({ browseStatus: 'available', blockingReasons: [] }),
      selectedSetId: recipe().defaultSetId,
      craftability: null,
    });

    const header = target.querySelector('[data-recipe-header]');
    assert.equal(primaryButtons(target).length, 0, 'no commit verb without a craftable reading');
    assert.ok(!header.querySelector('[data-crafting-status]'), 'no ready chip and no status pip');
    assert.ok(!header.querySelector('.crafting-detail-pip'));
    assert.ok(!header.querySelector('[data-recipe-blocking]'), 'and no invented shortfall');
    assert.ok(Boolean(header.querySelector('.crafting-detail-mode-chip')), 'the facts remain');
  });

  it('keeps the labelled status badge (no pip) for a craftable recipe', async () => {
    const target = await harness.mount({
      recipe: recipe({ browseStatus: 'available' }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability(),
    });

    const header = target.querySelector('[data-recipe-header]');
    assert.ok(
      header.querySelector('.player-detail-header-meta [data-crafting-status]'),
      'craftable recipe keeps the labelled status badge'
    );
    assert.equal(
      header.querySelector('.crafting-detail-pip'),
      null,
      'no thumbnail pip when craftable'
    );
  });

  it('draws that badge as the shared chip, in the tone the map routes it to', async () => {
    // Issue 1506: `AVAILABLE` returns `tone: 'success'`.
    const target = await harness.mount({
      recipe: recipe({ browseStatus: 'available' }),
      selectedSetId: recipe().defaultSetId,
      craftability: craftability(),
    });

    const chip = target.querySelector('.player-detail-header-meta [data-crafting-status]');
    assert.ok(chip.classList.contains('manager-chip'), 'the badge IS the shared chip now');
    assert.equal(chipToneOf(chip), 'positive', 'and an available recipe still reads as green');
    assert.ok(chip.classList.contains('is-list'), 'at the browser row scale');
    assert.ok(chip.textContent.trim().length > 0, 'the detail header keeps its label');
  });
});
