/**
 * `RecipeRoutingCard` (issue 2513): set and tier re-points through the scope writers, the no-op
 * on an explicit target, the adders, gap, policy and below-minimum rows, the forced-failure hint,
 * the fallback note, the borrowed scope, and one overview per step.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { scopeWrites } from '../../src/ui/svelte/apps/manager/recipe/recipeRoutingEdits.js';
import { routedMinimum } from '../../src/ui/svelte/apps/manager/recipe/recipeRoutingModel.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  chooseSelectOption,
  closeSelectPanel,
  selectOptionLabels,
} from '../helpers/select-control.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const CARD = 'src/ui/svelte/apps/manager/recipe/RecipeRoutingCard.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-routing-card-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/draftId.js',
    'src/utils/scalars.js',
    'src/utils/routedOutcomeKeywords.js',
    'src/utils/failureResultPolicy.js',
    'src/ui/svelte/components/pickerRowKinds.js',
    'src/ui/svelte/components/resultRows.js',
    'src/models/Result.js',
    'src/utils/rollFormulaRollability.js',
    'src/ui/svelte/util/recipeCurrency.js',
    'src/ui/svelte/apps/manager/recipe/recipeRoutingModel.js',
    'src/ui/svelte/apps/manager/recipe/recipeRoutingEdits.js',
    'src/ui/svelte/apps/manager/recipe/routingOverviewRows.js',
    'src/ui/svelte/apps/manager/recipe/setDrafts.js',
    'src/utils/choiceGroupShape.js',
    'src/models/reconstructibleDefaults.js',
  ],
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/Callout.svelte',
    'src/ui/svelte/components/RoutingOverview.svelte',
    CARD,
  ],
  componentPath: CARD,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const tier = (id, name, success, start, end) => ({ id, name, success, start, end });
/** Masterwork 18–20, Fine 16–17, Standard 12–14, Rough 8–11, Ruined 1–7: a gap at 15. */
const TIERS = [
  tier('t-master', 'Masterwork', true, 18, 20),
  tier('t-fine', 'Fine', true, 16, 17),
  tier('t-std', 'Standard', true, 12, 14),
  tier('t-rough', 'Rough', true, 8, 11),
  tier('t-ruined', 'Ruined', false, 1, 7),
];
const SUCCESS = TIERS.filter((entry) => entry.success);
const CHECK_GROUPS = [
  { id: 'g-master', name: 'Masterwork Blade', checkOutcomeIds: ['t-master'], results: [] },
  { id: 'g-std', name: 'Standard Blade', checkOutcomeIds: ['t-fine', 't-std'], results: [] },
];
const option = (componentId, quantity) => ({ match: { type: 'component', componentId }, quantity });
const SETS = [
  {
    id: 's-gold',
    name: 'Gold',
    resultGroupId: 'g-ring',
    ingredientGroups: [{ options: [option('c-gold', 2)] }],
  },
  { id: 's-silver', name: 'Silver', ingredientGroups: [] },
];
const SET_GROUPS = [
  { id: 'g-ring', name: 'Ring', results: [] },
  { id: 'g-amulet', name: 'Amulet', results: [] },
];

/**
 * Mount the card over a controlled draft: every write goes through the real `scopeWrites` onto
 * the draft and back in as `recipe`. `log` records each recipe and step patch.
 */
async function mountCard({
  recipe,
  provider = 'check',
  tiers = SUCCESS,
  minimum = {},
  gaps = [],
  collapsed = false,
}) {
  const log = { recipe: [], step: [], openChecks: 0 };
  let draft = recipe;
  const routing = () => ({
    provider,
    tiers,
    rankedTiers: TIERS,
    minimum: { direction: 'over', ...minimum },
    gaps,
    componentOptions: [{ id: 'c-gold', name: 'Gold Ingot' }],
    writes: scopeWrites({
      ingredientSets: draft.ingredientSets ?? [],
      steps: draft.steps ?? [],
      finalStep: collapsed ? draft.steps.at(-1) : null,
      onUpdateRecipe: (patch) => {
        log.recipe.push(patch);
        draft = { ...draft, ...patch };
        harness.setProps({ recipe: draft, routing: routing() });
      },
      onUpdateStep: (stepId, patch) => {
        log.step.push({ stepId, patch });
        const steps = draft.steps.map((step) =>
          step.id === stepId ? { ...step, ...patch } : step
        );
        draft = { ...draft, steps };
        harness.setProps({ recipe: draft, routing: routing() });
      },
    }),
  });
  const root = await harness.mount({
    recipe: draft,
    collapsed,
    routing: routing(),
    onOpenChecks: () => {
      log.openChecks += 1;
    },
  });
  const row = (key, scope = root) => scope.querySelector(`[data-routing-overview-row="${key}"]`);
  const trigger = (key) => `[data-routing-overview-row="${key}"] .fabricate-select-trigger`;
  return { root, log, row, trigger };
}

const checkRecipe = (groups = CHECK_GROUPS) => ({
  id: 'r1',
  ingredientSets: [],
  resultGroups: groups,
});
const setRecipe = (sets = SETS) => ({ id: 'r2', ingredientSets: sets, resultGroups: SET_GROUPS });

describe('RecipeRoutingCard writes', () => {
  it('re-points a set through its resultGroupId and moves a tier to the chosen set', async () => {
    let view = await mountCard({ recipe: setRecipe(), provider: 'ingredientSet' });
    chooseSelectOption(view.root, view.trigger('set:s-gold'), 'g-amulet');
    assert.deepEqual(
      view.log.recipe.at(-1).ingredientSets.map((set) => set.resultGroupId ?? null),
      ['g-amulet', null]
    );
    harness.remount();

    view = await mountCard({ recipe: checkRecipe() });
    chooseSelectOption(view.root, view.trigger('tier:t-fine'), 'g-master');
    assert.deepEqual(
      view.log.recipe.at(-1).resultGroups.map((group) => group.checkOutcomeIds),
      [['t-master', 't-fine'], ['t-std']]
    );
  });

  it('writes nothing for an explicit target, and writes a default one', async () => {
    let view = await mountCard({ recipe: setRecipe(), provider: 'ingredientSet' });
    chooseSelectOption(view.root, view.trigger('set:s-gold'), 'g-ring');
    assert.equal(view.log.recipe.length, 0, 'the set already names the Ring');
    assert.ok(view.row('set:s-silver').textContent.includes('default'));
    chooseSelectOption(view.root, view.trigger('set:s-silver'), 'g-ring');
    assert.equal(view.log.recipe.at(-1).ingredientSets[1].resultGroupId, 'g-ring');
    harness.remount();

    view = await mountCard({ recipe: checkRecipe() });
    chooseSelectOption(view.root, view.trigger('tier:t-master'), 'g-master');
    assert.equal(view.log.recipe.length, 0, 'the Masterwork Blade already lists Masterwork');
  });

  it('offers a new result set on every row, and an added ingredient set draws a row', async () => {
    const view = await mountCard({ recipe: setRecipe(), provider: 'ingredientSet' });
    const before = selectOptionLabels(view.root, view.trigger('set:s-gold'));
    closeSelectPanel(view.root, view.trigger('set:s-gold'));
    view.root.querySelector('[data-recipe-routing-add="resultGroup"]').click();
    await harness.setProps({});
    for (const key of ['set:s-gold', 'set:s-silver']) {
      assert.equal(selectOptionLabels(view.root, view.trigger(key)).length, before.length + 1, key);
      closeSelectPanel(view.root, view.trigger(key));
    }
    view.root.querySelector('[data-recipe-routing-add="ingredientSet"]').click();
    await harness.setProps({});
    assert.equal(view.root.querySelectorAll('[data-routing-overview-kind="source"]').length, 3);
  });
});

describe('RecipeRoutingCard check rows', () => {
  const minimum = { minSuccessOutcomeId: 't-std' };
  const gaps = [{ from: 15, to: 15 }];

  it('draws the gap as a blocked row whose action, like the list’s, opens the checks', async () => {
    const view = await mountCard({ recipe: checkRecipe(), minimum, gaps });
    const gap = view.row('gap:15');
    assert.equal(gap.dataset.routingOverviewKind, 'gap');
    assert.ok(!gap.querySelector('.fabricate-select-trigger'), 'a gap row has no select');
    const action = gap.querySelector('[data-routing-gap-action]');
    assert.equal(action.getAttribute('aria-label'), 'Edit outcome tiers to close the gap at 15');
    action.click();
    view.root.querySelector('[data-recipe-routing-edit-tiers]').click();
    assert.equal(view.log.openChecks, 2);
    const order = [...view.root.querySelectorAll('[data-routing-overview-row]')].map(
      (li) => li.dataset.routingOverviewRow
    );
    assert.deepEqual(order, [
      'tier:t-master',
      'tier:t-fine',
      'gap:15',
      'tier:t-std',
      'tier:t-rough',
      'tier:t-ruined',
    ]);
  });

  it('blocks a forbidden failure tier by policy and a success tier below the minimum', async () => {
    const view = await mountCard({ recipe: checkRecipe(), minimum });
    const blocked = (key) => view.row(key).querySelector('.fabricate-routing-overview-blocked');
    assert.equal(view.row('tier:t-ruined').dataset.routingOverviewBlocked, 'policy');
    assert.equal(blocked('tier:t-ruined').textContent, 'routing not permitted by this system');
    assert.equal(view.row('tier:t-rough').dataset.routingOverviewBlocked, 'below-minimum');
    assert.equal(blocked('tier:t-rough').textContent, 'below this recipe’s minimum success tier');
    assert.equal(view.row('tier:t-std').dataset.routingOverviewKind, 'source');
  });

  it('marks a permitted failure tier "only on a forced failure" while a minimum is set', async () => {
    let view = await mountCard({ recipe: checkRecipe(), tiers: TIERS, minimum });
    const ruined = view.row('tier:t-ruined');
    assert.equal(ruined.dataset.routingOverviewKind, 'source');
    assert.ok(ruined.textContent.includes('only on a forced failure'));
    assert.ok(
      ruined.querySelector('.fabricate-select-trigger').textContent.includes('Awards nothing')
    );
    harness.remount();

    view = await mountCard({ recipe: checkRecipe(), tiers: TIERS });
    assert.ok(!view.row('tier:t-ruined').textContent.includes('only on a forced failure'));
  });

  it('strikes the higher-start tier under a roll-under minimum', async () => {
    const under = routedMinimum({
      resolutionMode: 'routedByCheck',
      minSuccessOutcomeId: 't-fine',
      evaluation: { product: 'sum', direction: 'under' },
    });
    const view = await mountCard({ recipe: checkRecipe(), minimum: under });
    assert.equal(view.row('tier:t-master').dataset.routingOverviewBlocked, 'below-minimum');
    assert.equal(view.row('tier:t-std').dataset.routingOverviewKind, 'source');
  });
});

describe('RecipeRoutingCard notes and scopes', () => {
  const unlisted = CHECK_GROUPS.map((group) => ({ ...group, checkOutcomeIds: [] }));
  const describedBy = (root, key) =>
    root
      .querySelector(`[data-routing-overview-row="${key}"] .fabricate-select-trigger`)
      .getAttribute('aria-describedby');

  it('warns while no set lists a tier and more than one success tier is offered', async () => {
    let view = await mountCard({ recipe: checkRecipe(unlisted) });
    const note = view.root.querySelector('[data-recipe-routing-fallback-note]');
    assert.ok(Boolean(note), 'the note shows');
    assert.equal(note.getAttribute('role'), 'note');
    assert.ok(note.textContent.includes('Routed by default'));
    for (const key of ['tier:t-master', 'tier:t-fine', 'tier:t-std']) {
      assert.ok(describedBy(view.root, key).split(' ').includes(note.id), key);
    }
    harness.remount();

    view = await mountCard({ recipe: checkRecipe() });
    assert.ok(
      !view.root.querySelector('[data-recipe-routing-fallback-note]'),
      'a set lists a tier'
    );
    harness.remount();

    view = await mountCard({ recipe: checkRecipe(unlisted), tiers: [SUCCESS[0], TIERS[4]] });
    assert.ok(!view.root.querySelector('[data-recipe-routing-fallback-note]'), 'one success tier');
  });

  it('shows a borrowed scope read-only, and its Result set adder writes the step’s own list', async () => {
    const recipe = {
      id: 'r3',
      ingredientSets: [],
      resultGroups: SET_GROUPS,
      steps: [{ id: 'st-1', name: 'Forge', ingredientSets: SETS, resultGroups: [] }],
    };
    const view = await mountCard({ recipe, provider: 'ingredientSet' });
    const note = view.root.querySelector('[data-recipe-routing-borrowed-note]');
    assert.ok(Boolean(note));
    const trigger = view.root.querySelector(view.trigger('set:s-gold'));
    assert.equal(trigger.getAttribute('aria-disabled'), 'true');
    assert.ok(trigger.getAttribute('aria-describedby').split(' ').includes(note.id));
    view.root.querySelector('[data-recipe-routing-add="resultGroup"]').click();
    assert.equal(view.log.step.at(-1).stepId, 'st-1');
    assert.equal(view.log.step.at(-1).patch.resultGroups.length, 1, 'the step’s own, empty list');
    assert.equal(view.log.recipe.length, 0);
  });

  it('draws one overview per step, headed only when there are several', async () => {
    const step = (id, name) => ({ id, name, ingredientSets: SETS, resultGroups: SET_GROUPS });
    let view = await mountCard({
      recipe: { id: 'r4', steps: [step('st-1', 'Smelt'), step('st-2', '')] },
      provider: 'ingredientSet',
    });
    const scopes = [...view.root.querySelectorAll('[data-recipe-routing-scope]')];
    assert.deepEqual(
      scopes.map((scope) => scope.dataset.recipeRoutingScope),
      ['st-1', 'st-2']
    );
    assert.deepEqual(
      scopes.map((scope) => scope.querySelector('h4')?.textContent),
      ['Smelt', 'Step 2']
    );
    assert.equal(
      scopes[1].querySelector('.fabricate-routing-overview-list').getAttribute('aria-label'),
      'Step 2'
    );
    harness.remount();

    view = await mountCard({ recipe: setRecipe(), provider: 'ingredientSet' });
    assert.ok(
      !view.root.querySelector('.manager-recipe-routing-step'),
      'a single scope has no heading'
    );
    assert.equal(
      view.root.querySelector('.fabricate-routing-overview-list').getAttribute('aria-label'),
      'Routing'
    );
  });

  it('draws nothing outside the routed modes', async () => {
    const view = await mountCard({ recipe: setRecipe(), provider: null });
    assert.ok(!view.root.querySelector('[data-recipe-section="routing"]'));
  });
});
