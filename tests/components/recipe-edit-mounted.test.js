import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';
import { Recipe } from '../../src/models/Recipe.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const RAW_MODULES = [
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/dropUtils.js',
  'src/ui/svelte/actions/dragDrop.js',
  // recipeImageIcons re-exports DEFAULT_RECIPE_IMAGE from the Recipe model
  // (the single low-layer source of truth), so the harness must copy that
  // module and its transitive model dependencies.
  'src/ui/svelte/util/recipeImageIcons.js',
  // Shared duration formatter consumed by the step accordion + duration editor.
  'src/ui/svelte/util/recipeDuration.js',
  // Shared currency label/icon helpers consumed by the ingredient option editor.
  'src/ui/svelte/util/recipeCurrency.js',
  'src/models/Recipe.js',
  'src/models/Ingredient.js',
  'src/models/IngredientSet.js',
  'src/models/IngredientGroup.js',
  'src/models/Result.js',
  'src/utils/recipeCategories.js',
  'src/utils/routedOutcomeKeywords.js',
  'src/config/flags.js',
  // Ingredient + recipeReadiness dispatch through the match-type registry.
  'src/models/match/matchTypes.js',
  // The validation tab consumes the pure readiness evaluator.
  'src/ui/svelte/apps/manager/recipe/recipeReadiness.js',
  // RecipeToolsSection embeds SearchablePopover for the Tools picker; the harness
  // must copy its supporting raw modules (portal/dismiss/layout helpers).
  ...SEARCHABLE_POPOVER_RAW_MODULES,
];

// The new tab + section components the editor shell composes.
const RECIPE_COMPILED = [
  'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientSetCard.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeEssenceRequirements.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultGroupCard.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultItemRow.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeToolsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeEditorTabs.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientsTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultsTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeToolsTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeDurationEditor.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeStepAccordion.svelte',
  'src/ui/svelte/apps/manager/RecipeStepsCard.svelte',
  'src/ui/svelte/apps/manager/RecipeEditView.svelte',
];

const editHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-edit-',
  rawModules: RAW_MODULES,
  compiledModules: RECIPE_COMPILED,
  componentPath: 'src/ui/svelte/apps/manager/RecipeEditView.svelte',
});

const inspectorHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-inspector-',
  rawModules: RAW_MODULES,
  compiledModules: ['src/ui/svelte/apps/manager/RecipeItemInspector.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/RecipeItemInspector.svelte',
});

const stepsHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-steps-',
  rawModules: RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/recipe/RecipeDurationEditor.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeStepAccordion.svelte',
    'src/ui/svelte/apps/manager/RecipeStepsCard.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/RecipeStepsCard.svelte',
});

const RECIPE = Object.freeze({
  id: 'r1',
  name: 'Healing Draught',
  description: 'A restorative brew.',
  img: 'icons/consumables/potions/potion-tube-corked-red.webp',
  enabled: true,
  recipeItemId: '',
});

function identityProps(overrides = {}) {
  return {
    recipe: RECIPE,
    saving: false,
    onPickImagePath: null,
    onUpdateRecipe: () => {},
    onToggleEnabled: () => {},
    ...overrides,
  };
}

function inspectorProps(overrides = {}) {
  return {
    recipe: RECIPE,
    recipeItemDefinitions: [],
    onAddRecipeItem: () => false,
    onSetRecipeItem: () => {},
    onOpenItem: () => {},
    onCopyItemUuid: () => {},
    ...overrides,
  };
}

const TOOLS_LIBRARY = Object.freeze([
  Object.freeze({ id: 'tool-hammer', label: 'Hammer', componentId: 'cmp-hammer' }),
  Object.freeze({ id: 'tool-anvil', label: 'Anvil', componentId: 'cmp-anvil' }),
]);

const COMPONENT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'cmp-herb', name: 'Mountain Herb', img: 'icons/herb.webp' }),
  Object.freeze({ id: 'cmp-water', name: 'Pure Water', img: 'icons/water.webp' }),
]);

const ESSENCE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'ess-life', name: 'Life', icon: 'fas fa-heart' }),
  Object.freeze({ id: 'ess-water', name: 'Water', icon: 'fas fa-droplet' }),
]);

const ITEM_TAGS = Object.freeze(['herbal', 'liquid', 'rare']);

const CURRENCY_UNITS = Object.freeze([
  Object.freeze({ id: 'gp', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins' }),
  Object.freeze({ id: 'sp', label: 'Silver', abbreviation: 'sp', icon: 'fa-solid fa-coins' }),
]);

// A fully populated single-set recipe: a component requirement with two
// component alternatives (linked by "— or —"), a separate tag requirement, plus
// a per-set essence requirement. Requirements have no name field; a requirement
// is identified by its component image + name (or its tag chips).
const POPULATED_SET = Object.freeze({
  id: 'set-1',
  name: 'Primary',
  ingredientGroups: [
    Object.freeze({
      id: 'grp-1',
      options: [
        Object.freeze({ quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } }),
        Object.freeze({ quantity: 1, match: { type: 'component', componentId: 'cmp-water' } }),
      ],
    }),
    Object.freeze({
      id: 'grp-2',
      options: [
        Object.freeze({ quantity: 1, match: { type: 'tags', tags: ['liquid'], tagMatch: 'any' } }),
      ],
    }),
  ],
  essences: { 'ess-life': 3 },
});

const STEPS = Object.freeze([
  Object.freeze({
    id: 'step-1',
    name: 'Gather reagents',
    description: 'Collect the base herbs.',
    timeRequirement: { minutes: 30, hours: 2, days: 0, months: 0, years: 0 },
  }),
  Object.freeze({ id: 'step-2', name: 'Distil', description: '', timeRequirement: null }),
]);

// Let Svelte's scheduler flush DOM updates triggered by an event handler.
function flushRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function stepsProps(overrides = {}) {
  return {
    steps: STEPS,
    onAddStep: () => {},
    onReorderSteps: () => {},
    onUpdateStep: () => {},
    onDeleteStep: () => {},
    ...overrides,
  };
}

function clickTab(target, tab) {
  target.querySelector(`[data-recipe-tab-button="${tab}"]`).click();
}

// Mount the editor on a single-set recipe whose only set holds the given
// ingredient groups, wired to a fresh patch collector, then switch to the
// Ingredients tab and flush the first render. `props` merges extra editor props
// (e.g. componentOptions, itemTags, currencyUnits) and `set` merges extra fields
// onto the single 'set-1' set (e.g. name). Returns the mounted target plus the
// collector so callers assert on emitted onUpdateRecipe patches.
async function mountIngredientGroups(groups, { props = {}, set = {} } = {}) {
  const patches = [];
  const target = await editHarness.mount(
    identityProps({
      recipe: { ...RECIPE, ingredientSets: [{ id: 'set-1', ...set, ingredientGroups: groups }] },
      onUpdateRecipe: (patch) => patches.push(patch),
      ...props,
    })
  );
  clickTab(target, 'ingredients');
  await flushRender();
  return { target, patches };
}

// Convenience for the common single-group case: one requirement ('grp-1')
// holding the given option alternatives.
function mountSingleGroup(options, opts = {}) {
  return mountIngredientGroups([{ id: 'grp-1', options }], opts);
}

// Mount the editor on a recipe carrying the given result groups, wired to a fresh
// patch collector, then switch to the Results tab and flush the first render.
// `props` merges extra editor props (e.g. componentOptions); `recipe` merges extra
// fields onto the base RECIPE. Returns the mounted target plus the collector.
async function mountResultGroups(resultGroups, { props = {}, recipe = {} } = {}) {
  const patches = [];
  const target = await editHarness.mount(
    identityProps({
      complex: true,
      componentOptions: COMPONENT_OPTIONS,
      recipe: { ...RECIPE, complex: true, resultGroups, ...recipe },
      onUpdateRecipe: (patch) => patches.push(patch),
      ...props,
    })
  );
  clickTab(target, 'results');
  await flushRender();
  return { target, patches };
}

// Open the searchable popover under `trigger` (a node or a selector resolved on
// `target`) and click the rendered option whose text matches `optionPattern`,
// flushing render after each step.
async function pickPopoverOption(target, trigger, optionPattern) {
  const triggerNode = typeof trigger === 'string' ? target.querySelector(trigger) : trigger;
  triggerNode.click();
  await flushRender();
  [...document.querySelectorAll('.manager-travel-option')]
    .find((option) => optionPattern.test(option.textContent))
    .click();
  await flushRender();
}

// Drive a drop through the dragDrop action using a plain Event + a dataTransfer
// stub (text/plain JSON), not a synthetic native DragEvent.
function dispatchDrop(node, payload) {
  const event = new globalThis.window.Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = {
    getData: (type) => (type === 'text/plain' ? JSON.stringify(payload) : ''),
  };
  node.dispatchEvent(event);
}

describe('RecipeEditView (mounted)', () => {
  before(async () => {
    await editHarness.setup();
  });

  after(() => {
    editHarness.teardown();
  });

  it('renders the five editor tabs with Overview active by default', async () => {
    const target = await editHarness.mount(identityProps());
    const tabs = [...target.querySelectorAll('[data-recipe-tab-button]')].map(
      (btn) => btn.dataset.recipeTabButton
    );
    assert.deepEqual(
      tabs,
      ['overview', 'ingredients', 'results', 'tools', 'validation'],
      'five tabs render in order'
    );
    assert.equal(
      target.querySelector('[role="tabpanel"]').getAttribute('id'),
      'recipe-panel-overview',
      'overview panel is shown first'
    );
    assert.ok(target.querySelector('[data-recipe-tab="overview"]'), 'overview tab content renders');
    editHarness.remount();
  });

  it('renders the identity inputs in Overview and no recipe-item card', async () => {
    const target = await editHarness.mount(identityProps());
    assert.ok(target.querySelector('[data-recipe-field="name"]'), 'name input renders');
    assert.ok(
      target.querySelector('[data-recipe-field="description"]'),
      'description textarea renders'
    );
    assert.ok(target.querySelector('[data-recipe-field="enabled"]'), 'enabled toggle renders');
    assert.equal(
      target.querySelector('[data-recipe-section="recipe-item"]'),
      null,
      'no recipe-item card in the view'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="steps"]'),
      null,
      'no steps card for a single-step recipe'
    );
    editHarness.remount();
  });

  it('swaps the visible tabpanel when a tab is clicked', async () => {
    const target = await editHarness.mount(identityProps({ toolsLibrary: TOOLS_LIBRARY }));
    // Overview hosts identity only (single-step); each requirement type has its own tab.
    assert.ok(
      target.querySelector('[data-recipe-section="identity"]'),
      'identity lives in Overview'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="ingredients"]'),
      null,
      'ingredients not in Overview'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="tools"]'),
      null,
      'tools not in Overview'
    );

    clickTab(target, 'ingredients');
    await flushRender();
    assert.equal(
      target.querySelector('[role="tabpanel"]').getAttribute('id'),
      'recipe-panel-ingredients',
      'panel switched to ingredients'
    );
    assert.ok(
      target.querySelector('[data-recipe-section="ingredients"]'),
      'ingredients section renders on its tab'
    );

    clickTab(target, 'results');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-section="results"]'),
      'results section renders on its tab'
    );

    clickTab(target, 'tools');
    await flushRender();
    assert.equal(
      target.querySelector('[role="tabpanel"]').getAttribute('id'),
      'recipe-panel-tools',
      'panel switched to tools'
    );
    assert.ok(
      target.querySelector('[data-recipe-section="tools"]'),
      'tools section renders on its tab'
    );

    clickTab(target, 'validation');
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-tab="validation"]'), 'validation tab renders');
    editHarness.remount();
  });

  // ── Result routing (routed systems) ──────────────────────────────────────

  const ROUTED_RESULT_GROUPS = [
    {
      id: 'grp-a',
      name: 'Group A',
      checkOutcomeIds: [],
      results: [{ componentId: 'cmp-herb', quantity: 1 }],
    },
    {
      id: 'grp-b',
      name: 'Group B',
      checkOutcomeIds: [],
      results: [{ componentId: 'cmp-water', quantity: 1 }],
    },
  ];
  const TIER_OPTIONS = [
    { id: 'tier-myth', name: 'Mythic' },
    { id: 'tier-std', name: 'Standard' },
  ];

  function resultCardTrigger(target, cardIndex) {
    return target
      .querySelectorAll('[data-recipe-result-set-id]')
      [cardIndex].querySelector('[data-recipe-add="routing-option"]');
  }

  async function openRoutingPopover(target, cardIndex) {
    resultCardTrigger(target, cardIndex).click();
    await flushRender();
    return [...document.querySelectorAll('.manager-travel-option')];
  }

  it('ingredient mode: result sets assign ingredient sets instead of a name', async () => {
    const { target, patches } = await mountResultGroups(ROUTED_RESULT_GROUPS, {
      props: { routingProvider: 'ingredientSet' },
      recipe: {
        ingredientSets: [
          { id: 'iset-1', name: 'Alpha', ingredientGroups: [] },
          { id: 'iset-2', name: 'Beta', ingredientGroups: [] },
        ],
      },
    });

    assert.equal(
      target.querySelector('[data-recipe-result-set-field="name"]'),
      null,
      'no free-text result-set name in ingredient mode'
    );
    assert.ok(
      target.querySelector('[data-recipe-routing-assignment]'),
      'the routing assignment control renders'
    );

    const options = await openRoutingPopover(target, 0);
    options.find((option) => /Alpha/.test(option.textContent)).click();
    await flushRender();

    const patch = patches.at(-1);
    assert.ok(patch.ingredientSets, 'assigning writes the ingredient sets');
    assert.equal(
      patch.ingredientSets.find((set) => set.id === 'iset-1').resultGroupId,
      'grp-a',
      'the chosen set is routed to this result group'
    );
    editHarness.remount();
  });

  it('check mode: result sets assign outcome tiers, disabling tiers used elsewhere', async () => {
    const groups = [
      {
        id: 'grp-a',
        name: 'Group A',
        checkOutcomeIds: [],
        results: [{ componentId: 'cmp-herb', quantity: 1 }],
      },
      {
        id: 'grp-b',
        name: 'Group B',
        checkOutcomeIds: ['tier-myth'],
        results: [{ componentId: 'cmp-water', quantity: 1 }],
      },
    ];
    const { target, patches } = await mountResultGroups(groups, {
      props: { routingProvider: 'check', routedOutcomeTierOptions: TIER_OPTIONS },
    });

    assert.equal(
      target.querySelector('[data-recipe-result-set-field="name"]'),
      null,
      'no free-text result-set name in check mode'
    );
    // Group B already shows the assigned tier as a chip.
    const groupBCard = target.querySelectorAll('[data-recipe-result-set-id]')[1];
    assert.equal(
      groupBCard.querySelector('[data-routing-chip]').getAttribute('data-routing-chip'),
      'tier-myth'
    );

    // Group A's picker excludes the tier assigned to B, offers the free one.
    const options = await openRoutingPopover(target, 0);
    const texts = options.map((option) => option.textContent.trim());
    assert.ok(
      !texts.some((text) => /Mythic/.test(text)),
      'Mythic is assigned to B, so unavailable for A'
    );
    assert.ok(
      texts.some((text) => /Standard/.test(text)),
      'Standard is available'
    );

    options.find((option) => /Standard/.test(option.textContent)).click();
    await flushRender();
    assert.deepEqual(
      patches.at(-1).resultGroups[0].checkOutcomeIds,
      ['tier-std'],
      'the chosen tier is assigned to this result group'
    );

    // Removing group B's chip clears its assignment.
    groupBCard.querySelector('[data-routing-chip-remove]').click();
    await flushRender();
    assert.deepEqual(patches.at(-1).resultGroups[1].checkOutcomeIds, []);
    editHarness.remount();
  });

  it('hides the ingredient-set name in check mode but shows it in ingredient mode', async () => {
    const ingredientSets = [
      { id: 'iset-1', name: 'Alpha', ingredientGroups: [] },
      { id: 'iset-2', name: 'Beta', ingredientGroups: [] },
    ];

    const checkTarget = await editHarness.mount(
      identityProps({
        complex: true,
        componentOptions: COMPONENT_OPTIONS,
        routingProvider: 'check',
        recipe: { ...RECIPE, complex: true, ingredientSets },
      })
    );
    clickTab(checkTarget, 'ingredients');
    await flushRender();
    assert.equal(
      checkTarget.querySelector('[data-recipe-set-field="name"]'),
      null,
      'ingredient-set name hidden in check mode'
    );
    assert.ok(checkTarget.querySelector('.manager-recipe-ingredient-set-name-spacer'));
    editHarness.remount();

    const ingredientTarget = await editHarness.mount(
      identityProps({
        complex: true,
        componentOptions: COMPONENT_OPTIONS,
        routingProvider: 'ingredientSet',
        recipe: { ...RECIPE, complex: true, ingredientSets },
      })
    );
    clickTab(ingredientTarget, 'ingredients');
    await flushRender();
    assert.ok(
      ingredientTarget.querySelector('[data-recipe-set-field="name"]'),
      'ingredient-set name shown in ingredient mode'
    );
    editHarness.remount();
  });

  it('shows the steps card in Overview only when the recipe is multi-step', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] },
      })
    );
    const stepsCard = target.querySelector('[data-recipe-section="steps"]');
    assert.ok(stepsCard, 'steps card present for a multi-step recipe');
    assert.ok(
      target.querySelector('[data-recipe-tab="overview"]').contains(stepsCard),
      'steps card lives in the Overview tab'
    );
    editHarness.remount();
  });

  it('emits onUpdateRecipe with the edited name when the name changes (controlled)', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    const nameInput = target.querySelector('[data-recipe-field="name"]');
    nameInput.value = 'Greater Healing Draught';
    nameInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await Promise.resolve();

    assert.equal(patches.length, 1, 'editing the name emits exactly one patch');
    assert.deepEqual(
      patches[0],
      { name: 'Greater Healing Draught' },
      'the patch carries the edited name only'
    );
    editHarness.remount();
  });

  it('emits onUpdateRecipe with the edited description when the description changes (controlled)', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    const descriptionInput = target.querySelector('[data-recipe-field="description"]');
    descriptionInput.value = 'A stronger brew.';
    descriptionInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await Promise.resolve();

    assert.equal(patches.length, 1, 'editing the description emits exactly one patch');
    assert.deepEqual(
      patches[0],
      { description: 'A stronger brew.' },
      'the patch carries the edited description only'
    );
    editHarness.remount();
  });

  it('renders a single-step Duration control on the Overview tab whose edits emit onUpdateRecipe({ timeRequirement })', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    const durationSection = target.querySelector('[data-recipe-section="duration"]');
    assert.ok(durationSection, 'the single-step Overview shows the Duration section');
    const trigger = durationSection.querySelector('[data-recipe-duration-trigger]');
    assert.match(trigger.textContent, /Add duration/, 'an unset duration reads Add duration');
    trigger.click();
    await flushRender();
    const daysInput = document.querySelector('[data-recipe-duration-unit="days"]');
    assert.ok(daysInput, 'the duration editor exposes a days input');
    daysInput.value = '3';
    daysInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    assert.equal(patches.length, 1, 'editing the duration emits exactly one patch');
    assert.deepEqual(
      patches[0],
      { timeRequirement: { minutes: 0, hours: 0, days: 3, months: 0, years: 0 } },
      'the patch carries the rebuilt recipe-level timeRequirement'
    );
    editHarness.remount();
  });

  it('clears the single-step recipe duration to null when the only unit is zeroed', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          ...RECIPE,
          timeRequirement: { minutes: 0, hours: 5, days: 0, months: 0, years: 0 },
        },
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    const trigger = target.querySelector(
      '[data-recipe-section="duration"] [data-recipe-duration-trigger]'
    );
    assert.match(trigger.textContent, /5 hours/, 'a set duration reads its formatted value');
    trigger.click();
    await flushRender();
    const hoursInput = document.querySelector('[data-recipe-duration-unit="hours"]');
    hoursInput.value = '0';
    hoursInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    assert.equal(patches.length, 1, 'zeroing the only unit emits a patch');
    assert.deepEqual(patches[0], { timeRequirement: null }, 'an all-zero duration clears to null');
    editHarness.remount();
  });

  it('increments a duration unit via the up stepper button', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({ onUpdateRecipe: (patch) => patches.push(patch) })
    );
    target.querySelector('[data-recipe-section="duration"] [data-recipe-duration-trigger]').click();
    await flushRender();
    const upDays = document.querySelector(
      '[data-recipe-duration-stepper="days"] [data-recipe-duration-step="up"]'
    );
    assert.ok(upDays, 'each unit exposes an up stepper');
    upDays.click();
    assert.deepEqual(
      patches.at(-1),
      { timeRequirement: { minutes: 0, hours: 0, days: 1, months: 0, years: 0 } },
      'the up stepper increments the unit by one'
    );
    editHarness.remount();
  });

  it('increments a duration unit via the ArrowUp key on the input', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({ onUpdateRecipe: (patch) => patches.push(patch) })
    );
    target.querySelector('[data-recipe-section="duration"] [data-recipe-duration-trigger]').click();
    await flushRender();
    const hoursInput = document.querySelector('[data-recipe-duration-unit="hours"]');
    hoursInput.dispatchEvent(
      new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    );
    assert.deepEqual(
      patches.at(-1),
      { timeRequirement: { minutes: 0, hours: 1, days: 0, months: 0, years: 0 } },
      'ArrowUp increments the focused unit'
    );
    editHarness.remount();
  });

  it('clears the single-step recipe duration when the trigger is right-clicked', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          ...RECIPE,
          timeRequirement: { minutes: 0, hours: 5, days: 0, months: 0, years: 0 },
        },
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    const trigger = target.querySelector(
      '[data-recipe-section="duration"] [data-recipe-duration-trigger]'
    );
    trigger.dispatchEvent(
      new globalThis.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    );
    assert.deepEqual(
      patches.at(-1),
      { timeRequirement: null },
      'right-clicking a set duration clears it'
    );
    editHarness.remount();
  });

  it('shows the multi-step Steps card (not the single-step Duration section) on the Overview tab', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, steps: [{ id: 'sa', name: 'Forge' }] },
      })
    );
    assert.ok(
      target.querySelector('[data-recipe-section="steps"]'),
      'multi-step Overview shows the Steps card'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="duration"]'),
      null,
      'the single-step Duration section is hidden for a multi-step recipe'
    );
    editHarness.remount();
  });

  it('renders an editable image picker button when no recipe item is linked', async () => {
    const target = await editHarness.mount(identityProps({ onPickImagePath: async () => '' }));
    assert.ok(
      target.querySelector('button[data-recipe-field="img"]'),
      'editable image picker button renders'
    );
    assert.equal(
      target.querySelector('[data-recipe-item-locked-image]'),
      null,
      'no locked-image span when unlinked'
    );
    editHarness.remount();
  });

  it('locks the image picker to the linked recipe item image when recipeItemId is set', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, recipeItemId: 'ri1' },
        linkedItemImage: 'icons/consumables/potions/potion-tube-corked-blue.webp',
        onPickImagePath: async () => 'icons/should-not-be-used.webp',
      })
    );
    const locked = target.querySelector('[data-recipe-item-locked-image]');
    assert.ok(locked, 'locked-image span renders when linked');
    assert.ok(
      locked.classList.contains('is-recipe-item-linked'),
      'uses the recipe-specific locked class'
    );
    assert.ok(locked.querySelector('.fa-lock'), 'shows a lock icon');
    assert.equal(
      target.querySelector('button[data-recipe-field="img"]'),
      null,
      'no editable picker button when locked'
    );
    const img = locked.querySelector('img');
    assert.ok(
      img.getAttribute('src').includes('potion-tube-corked-blue'),
      'shows the linked item image'
    );

    // Regression: the locked image is fully controlled by the (staged) linkedItemImage
    // prop, so staging a different recipe-item link updates the preview without a save.
    editHarness.remount();
    const restaged = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, recipeItemId: 'ri2' },
        linkedItemImage: 'icons/consumables/potions/potion-tube-corked-green.webp',
        onPickImagePath: async () => 'icons/should-not-be-used.webp',
      })
    );
    const restagedImg = restaged.querySelector('[data-recipe-item-locked-image] img');
    assert.ok(
      restagedImg.getAttribute('src').includes('potion-tube-corked-green'),
      'a staged link change swaps the locked preview image without a save'
    );
    editHarness.remount();
  });

  it('has no in-view save form (the header Save button owns committing)', async () => {
    const target = await editHarness.mount(identityProps());
    // The editor is fully controlled: there is no <form> to submit; the root's
    // header Save button commits the staged draft via a plain onclick.
    assert.equal(
      target.querySelector('#manager-recipe-edit-form'),
      null,
      'no recipe-edit form wrapper in the view'
    );
    assert.equal(target.querySelector('form'), null, 'the editor renders no form element');
    editHarness.remount();
  });

  it('emits onToggleEnabled (not onUpdateRecipe) when the enabled toggle is clicked', async () => {
    const patches = [];
    const toggles = [];
    const target = await editHarness.mount(
      identityProps({
        onUpdateRecipe: (patch) => patches.push(patch),
        onToggleEnabled: () => toggles.push(true),
      })
    );
    target.querySelector('[data-recipe-field="enabled"]').click();
    await Promise.resolve();
    assert.deepEqual(toggles, [true], 'the enabled toggle emits onToggleEnabled');
    assert.equal(patches.length, 0, 'the enabled toggle does not stage an onUpdateRecipe patch');
    editHarness.remount();
  });

  it('emits onUpdateRecipe with the chosen image when the image picker resolves a path', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        onUpdateRecipe: (patch) => patches.push(patch),
        onPickImagePath: async () => 'icons/consumables/potions/potion-tube-corked-green.webp',
      })
    );
    target.querySelector('button[data-recipe-field="img"]').click();
    await flushRender();
    assert.equal(patches.length, 1, 'choosing an image emits a single patch');
    assert.deepEqual(
      patches[0],
      { img: 'icons/consumables/potions/potion-tube-corked-green.webp' },
      'the patch carries the chosen image path'
    );
    editHarness.remount();
  });

  it('renders the single-step ingredient/results/tools sections on their tabs', async () => {
    const target = await editHarness.mount(
      identityProps({ complex: true, toolsLibrary: TOOLS_LIBRARY })
    );

    clickTab(target, 'ingredients');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-section="ingredients"]'),
      'ingredients section renders'
    );
    assert.match(target.textContent, /No ingredients yet/, 'ingredients empty text shown');
    assert.ok(
      target.querySelector('[data-recipe-add="ingredient-set"]'),
      'add ingredient set button shown'
    );

    clickTab(target, 'results');
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-section="results"]'), 'results section renders');
    assert.match(target.textContent, /No results yet/, 'results empty text shown');
    assert.ok(
      target.querySelector('[data-recipe-add="result-set"]'),
      'add result set button shown'
    );

    clickTab(target, 'tools');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-section="tools"]'),
      'tools section renders on the Tools tab'
    );
    assert.match(target.textContent, /No tools yet/, 'tools empty text shown');
    editHarness.remount();
  });

  it('collapses the ingredients tab to a single chromeless set in Simple mode', async () => {
    const target = await editHarness.mount(identityProps({ complex: false }));
    clickTab(target, 'ingredients');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-section="ingredients"]'),
      'ingredients section still renders'
    );
    assert.equal(
      target.querySelector('[data-recipe-add="ingredient-set"]'),
      null,
      'no Add set button in Simple mode'
    );
    assert.equal(
      target.querySelector('[data-recipe-set-field="name"]'),
      null,
      'no set-name input in Simple mode'
    );
    assert.equal(
      target.querySelector('.manager-recipe-ingredient-set-or'),
      null,
      'no OR separator in Simple mode'
    );
    assert.ok(
      target.querySelector('.manager-recipe-ingredient-set.is-chromeless'),
      'the single set renders chromeless'
    );
    editHarness.remount();
  });

  it('collapses the results tab to a single result set in Simple mode', async () => {
    const target = await editHarness.mount(identityProps({ complex: false }));
    clickTab(target, 'results');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-section="results"]'),
      'results section still renders'
    );
    assert.equal(
      target.querySelector('[data-recipe-add="result-set"]'),
      null,
      'no Add result set button in Simple mode'
    );
    assert.equal(
      target.querySelector('[data-recipe-remove="result-set"]'),
      null,
      'no remove control in Simple mode'
    );
    assert.ok(
      target.querySelector('[data-recipe-result-simple]'),
      'the simple result set placeholder renders'
    );
    editHarness.remount();
  });

  it('shows full ingredient/result set scaffolding in Complex mode', async () => {
    const target = await editHarness.mount(identityProps({ complex: true }));
    clickTab(target, 'ingredients');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-add="ingredient-set"]'),
      'Add set button shown in Complex mode'
    );

    clickTab(target, 'results');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-add="result-set"]'),
      'Add result set button shown in Complex mode'
    );
    editHarness.remount();
  });

  it('appends an ingredient set via onUpdateRecipe when + Add set is clicked', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        complex: true,
        recipe: { ...RECIPE, complex: true, ingredientSets: [{ id: 'set-1' }] },
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    target.querySelector('[data-recipe-add="ingredient-set"]').click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    assert.equal(patches[0].ingredientSets.length, 2, 'the ingredient set array grew by one');
    assert.equal(
      'id' in patches[0].ingredientSets[1],
      false,
      'the appended set carries no id (store assigns one)'
    );
    editHarness.remount();
  });

  it('appends a result set via onUpdateRecipe({ resultGroups }) when + Add result set is clicked', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        complex: true,
        recipe: {
          ...RECIPE,
          complex: true,
          resultGroups: [{ id: 'grp-1', name: 'Primary', results: [] }],
        },
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'results');
    await flushRender();
    target.querySelector('[data-recipe-add="result-set"]').click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    // The whole replacement groups array flows through onChange → onUpdateResultGroups.
    assert.equal(patches[0].resultGroups.length, 2, 'the result group array grew by one');
    assert.equal(patches[0].resultGroups[0].id, 'grp-1', 'the existing group survives with its id');
    assert.equal(
      patches[0].resultGroups[0].name,
      'Primary',
      'the existing group survives with its name'
    );
    assert.equal(
      'id' in patches[0].resultGroups[1],
      false,
      'the appended group carries no id (store assigns one)'
    );
    editHarness.remount();
  });

  it('opens the recipe-level tools popover on the Tools tab, lists the library, and adds a chosen tool', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        toolsLibrary: TOOLS_LIBRARY,
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'tools');
    await flushRender();
    const trigger = target.querySelector(
      '[data-recipe-section="tools"] .manager-recipe-tools-trigger'
    );
    assert.ok(trigger, 'tools picker trigger renders on the Tools tab');
    trigger.click();
    await flushRender();
    const options = [...document.querySelectorAll('.manager-travel-option')];
    assert.equal(options.length, 2, 'the popover lists both library tools');
    options.find((option) => /Hammer/.test(option.textContent)).click();
    await flushRender();
    assert.equal(patches.length, 1, 'choosing a tool patches the recipe');
    assert.deepEqual(
      patches[0].toolIds,
      ['tool-hammer'],
      'the chosen tool id is appended to toolIds'
    );
    editHarness.remount();
  });

  it('renders a selected recipe-level tool as a removable row that calls onUpdateRecipe', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, toolIds: ['tool-hammer'] },
        toolsLibrary: TOOLS_LIBRARY,
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'tools');
    await flushRender();
    const row = target.querySelector('[data-recipe-tool-id="tool-hammer"]');
    assert.ok(row, 'a row renders for the selected tool');
    assert.match(row.textContent, /Hammer/, 'the row shows the resolved tool label');
    row.querySelector('[data-recipe-remove="tool"]').click();
    assert.equal(patches.length, 1, 'removing fires onUpdateRecipe');
    assert.deepEqual(patches[0].toolIds, [], 'the removed tool id is filtered out');
    editHarness.remount();
  });

  it('renders per-step ingredient groupings in a collapsible step accordion for a multi-step recipe', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          ...RECIPE,
          steps: [
            { id: 'sa', name: 'Forge' },
            { id: 'sb', name: 'Quench' },
          ],
        },
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    // One accordion row per step, collapsed by default (no section until expanded).
    assert.ok(
      target.querySelector('[data-recipe-step-id="sa"]'),
      'an accordion row renders per step'
    );
    assert.ok(
      target.querySelector('[data-recipe-step-id="sb"]'),
      'second step accordion row renders'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="step-sa-ingredients"]'),
      null,
      'collapsed step has no ingredients section'
    );
    target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-main').click();
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-section="step-sa-ingredients"]'),
      'expanding a step reveals its ingredients section (prefixed by step id)'
    );
    editHarness.remount();
  });

  it('routes a per-step ingredient add through onUpdateStep for a multi-step recipe', async () => {
    const updates = [];
    const target = await editHarness.mount(
      identityProps({
        complex: true,
        recipe: {
          ...RECIPE,
          complex: true,
          steps: [{ id: 'sa', name: 'Forge', ingredientSets: [{ id: 'pre' }] }],
        },
        onUpdateStep: (id, patch) => updates.push([id, patch]),
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-main').click();
    await flushRender();
    target
      .querySelector(
        '[data-recipe-section="step-sa-ingredients"] [data-recipe-add="ingredient-set"]'
      )
      .click();
    assert.equal(updates.length, 1, 'onUpdateStep invoked once');
    assert.equal(updates[0][0], 'sa', 'patches the right step');
    assert.equal(
      updates[0][1].ingredientSets.length,
      2,
      'the step ingredient set array grew by one'
    );
    editHarness.remount();
  });

  it('renders a populated set as component + tag requirements, with images, an OR separator, and no group-name/match toggle', async () => {
    const target = await editHarness.mount(
      identityProps({
        complex: true,
        recipe: { ...RECIPE, complex: true, ingredientSets: [POPULATED_SET] },
        componentOptions: COMPONENT_OPTIONS,
        essenceOptions: ESSENCE_OPTIONS,
        itemTags: ITEM_TAGS,
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    const set = target.querySelector('[data-recipe-set-id="set-1"]');
    assert.ok(set, 'the set card renders');
    assert.equal(
      set.querySelector('[data-recipe-set-field="name"]').value,
      'Primary',
      'set name is editable and populated'
    );
    // The group-name field and the per-row match toggle are both gone.
    assert.equal(
      set.querySelector('[data-recipe-group-field="name"]'),
      null,
      'no group-name field on a requirement'
    );
    assert.equal(
      set.querySelector('[data-recipe-option-match]'),
      null,
      'no Component|Tags match toggle on an option'
    );

    // First requirement: a component requirement with two alternatives.
    const componentReq = set.querySelector('[data-recipe-group-id="grp-1"]');
    assert.ok(componentReq, 'the component requirement renders');
    const options = componentReq.querySelectorAll('[data-recipe-option]');
    assert.equal(options.length, 2, 'both component alternatives render');
    assert.ok(
      componentReq.querySelector('.manager-recipe-ingredient-or-separator'),
      'an OR separator links the alternatives'
    );
    assert.match(
      options[0].textContent,
      /Mountain Herb/,
      'first alternative resolves the component name on the trigger'
    );
    // The component image renders in the row (the popover trigger portrait).
    const herbImg = options[0].querySelector('.manager-travel-portrait img');
    assert.ok(herbImg, 'the component alternative shows an image');
    assert.equal(
      herbImg.getAttribute('src'),
      'icons/herb.webp',
      'the image src is the resolved component img'
    );
    assert.equal(
      options[0].querySelector('[data-recipe-option-quantity]').value,
      '2',
      'component alternative quantity shown'
    );
    assert.match(
      options[1].textContent,
      /Pure Water/,
      'second alternative resolves its component name'
    );

    // Second requirement: a tag requirement with a chip and any/all toggle.
    const tagReq = set.querySelector('[data-recipe-group-id="grp-2"]');
    assert.ok(tagReq, 'the tag requirement renders');
    assert.ok(tagReq.querySelector('[data-recipe-tag="liquid"]'), 'the tag chip renders');
    assert.equal(
      tagReq.querySelector('[data-recipe-tag-match="any"]').getAttribute('aria-pressed'),
      'true',
      'tag match defaults to Any'
    );

    // The two AND'd requirements are separated by a labelled "AND" divider that
    // mirrors the within-group "OR" divider (same casing/markup, different label).
    const andSeparators = set.querySelectorAll('.manager-recipe-ingredient-and-separator');
    assert.equal(
      andSeparators.length,
      1,
      'one AND divider sits between the two AND’d requirements'
    );
    assert.equal(
      andSeparators[0].querySelector('span').textContent.trim(),
      'AND',
      'the AND divider reads "AND"'
    );

    // The per-set essence row renders.
    assert.ok(
      set.querySelector('[data-recipe-essence-id="ess-life"]'),
      'the per-set essence row renders'
    );
    assert.equal(
      set.querySelector('[data-recipe-essence-id="ess-life"] [data-recipe-essence-quantity]').value,
      '3',
      'essence quantity shown'
    );
    editHarness.remount();
  });

  it('appends a component requirement (born populated, id-less) via the Add component popover', async () => {
    const { target, patches } = await mountIngredientGroups([], {
      set: { name: 'Primary' },
      props: { componentOptions: COMPONENT_OPTIONS },
    });
    await pickPopoverOption(
      target,
      '[data-recipe-set-id="set-1"] [data-recipe-add="component"]',
      /Mountain Herb/
    );
    assert.equal(patches.length, 1, 'choosing a component patches the recipe');
    const groups = patches[0].ingredientSets[0].ingredientGroups;
    assert.equal(groups.length, 1, 'a requirement is appended to the set');
    assert.equal('id' in groups[0], false, 'the appended requirement carries no id');
    assert.deepEqual(
      groups[0].options[0].match,
      { type: 'component', componentId: 'cmp-herb' },
      'the requirement is born populated with the chosen component'
    );
    assert.equal(groups[0].options[0].quantity, 1, 'the alternative defaults to quantity 1');
    editHarness.remount();
  });

  it('appends a tag requirement (empty tags option, id-less) via Add tag requirement', async () => {
    const { target, patches } = await mountIngredientGroups([], {
      set: { name: 'Primary' },
      props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS },
    });
    target
      .querySelector('[data-recipe-set-id="set-1"] [data-recipe-add="tag-requirement"]')
      .click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    const groups = patches[0].ingredientSets[0].ingredientGroups;
    assert.equal(groups.length, 1, 'a tag requirement is appended');
    assert.equal('id' in groups[0], false, 'the appended requirement carries no id');
    assert.deepEqual(
      groups[0].options[0].match,
      { type: 'tags', tags: [], tagMatch: 'any' },
      'the tag requirement starts with an empty tags match'
    );
    editHarness.remount();
  });

  it('appends a component alternative via the row-end Add component popover', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    await pickPopoverOption(
      target,
      '[data-recipe-group-id="grp-1"] [data-recipe-add="alternative-component"]',
      /Pure Water/
    );
    assert.equal(patches.length, 1, 'choosing an alternative patches the recipe');
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 2, 'the alternative list grew by one');
    assert.deepEqual(
      options[1].match,
      { type: 'component', componentId: 'cmp-water' },
      'the new alternative is a component match'
    );
    editHarness.remount();
  });

  it('increments an existing single-component requirement instead of duplicating it', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } }],
      { set: { name: 'Primary' }, props: { componentOptions: COMPONENT_OPTIONS } }
    );
    await pickPopoverOption(
      target,
      '[data-recipe-set-id="set-1"] [data-recipe-add="component"]',
      /Mountain Herb/
    );
    assert.equal(patches.length, 1, 'choosing the already-required component patches the recipe');
    const groups = patches[0].ingredientSets[0].ingredientGroups;
    assert.equal(groups.length, 1, 'no duplicate requirement is appended');
    assert.equal(groups[0].options.length, 1, 'the requirement keeps a single option');
    assert.equal(
      groups[0].options[0].quantity,
      3,
      'the existing requirement quantity is incremented by one'
    );
    editHarness.remount();
  });

  it('increments an existing component alternative instead of duplicating it', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    await pickPopoverOption(
      target,
      '[data-recipe-group-id="grp-1"] [data-recipe-add="alternative-component"]',
      /Mountain Herb/
    );
    assert.equal(
      patches.length,
      1,
      'choosing the existing alternative component patches the recipe'
    );
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 1, 'no duplicate alternative is appended');
    assert.equal(options[0].quantity, 2, 'the existing alternative quantity is incremented by one');
    assert.deepEqual(
      options[0].match,
      { type: 'component', componentId: 'cmp-herb' },
      'the match is unchanged'
    );
    editHarness.remount();
  });

  it('appends a tag alternative via the row-end Add tag requirement button', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    target
      .querySelector('[data-recipe-group-id="grp-1"] [data-recipe-add="alternative-tag"]')
      .click();
    assert.equal(patches.length, 1, 'adding a tag alternative patches the recipe');
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 2, 'the alternative list grew by one');
    assert.deepEqual(
      options[1].match,
      { type: 'tags', tags: [], tagMatch: 'any' },
      'the new alternative is an empty tags match'
    );
    editHarness.remount();
  });

  it('mixes component and tag alternatives in one requirement, rendering the box + OR separator', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    // Starting from a one-component requirement, add a tag alternative from the row.
    target
      .querySelector('[data-recipe-group-id="grp-1"] [data-recipe-add="alternative-tag"]')
      .click();
    await flushRender();
    const options = patches.at(-1).ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 2, 'the requirement now holds two alternatives');
    const matchTypes = options.map((option) => option.match.type).sort();
    assert.deepEqual(
      matchTypes,
      ['component', 'tags'],
      'the requirement mixes a component and a tags match'
    );

    // The in-component state re-renders to two alternatives once we feed the
    // patch back in (the parent owns recipe state in production); render a
    // pre-mixed requirement directly to assert the box + separator.
    const { target: mixed } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    const req = mixed.querySelector('[data-recipe-group-id="grp-1"]');
    assert.ok(
      req.classList.contains('has-alternatives'),
      'a 2-alternative requirement renders the box'
    );
    assert.ok(
      req.querySelector('.manager-recipe-ingredient-or-separator'),
      'the "— or —" separator renders'
    );
    const optionRows = req.querySelectorAll('[data-recipe-option]');
    assert.ok(
      optionRows[0].querySelector('.manager-recipe-component-trigger'),
      'the first alternative is a component editor'
    );
    assert.ok(
      optionRows[1].querySelector('[data-recipe-tag-match="any"]'),
      'the second alternative is a tag editor'
    );
    editHarness.remount();
  });

  it('renders a single-alternative requirement as a bare row and a multi-alternative one as a box', async () => {
    const { target } = await mountIngredientGroups(
      [
        {
          id: 'grp-bare',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
        },
        {
          id: 'grp-box',
          options: [
            { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
            { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } },
          ],
        },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    const bare = target.querySelector('[data-recipe-group-id="grp-bare"]');
    assert.ok(bare, 'the single-alternative requirement still renders as a group');
    assert.equal(
      bare.classList.contains('has-alternatives'),
      false,
      'a single-alternative requirement has no alternatives box'
    );
    const box = target.querySelector('[data-recipe-group-id="grp-box"]');
    assert.ok(
      box.classList.contains('has-alternatives'),
      'a multi-alternative requirement renders the alternatives box'
    );
    editHarness.remount();
  });

  it('renders an OR separator once a component requirement has two alternatives', async () => {
    const { target } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    const req = target.querySelector('[data-recipe-group-id="grp-1"]');
    assert.equal(
      req.querySelectorAll('[data-recipe-option]').length,
      2,
      'both alternatives render'
    );
    assert.ok(
      req.querySelector('.manager-recipe-ingredient-or-separator'),
      'the "— or —" separator renders between alternatives'
    );
    editHarness.remount();
  });

  it('renders the component option image trigger with the name as separate static text (not inside the button)', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    const row = target.querySelector('[data-recipe-group-id="grp-1"] [data-recipe-option]');
    const trigger = row.querySelector('.manager-recipe-component-trigger');
    assert.ok(trigger, 'the component picker trigger renders');
    assert.ok(
      trigger.querySelector('.manager-travel-portrait img'),
      'the trigger shows the component image'
    );
    // The name must NOT be inside the clickable trigger button.
    assert.equal(
      /Mountain Herb/.test(trigger.textContent),
      false,
      'the component name is not inside the trigger button'
    );
    // The name renders as separate static text beside the trigger.
    const name = row.querySelector('.manager-recipe-component-name');
    assert.ok(name, 'the component name renders as static text beside the trigger');
    assert.equal(
      name.textContent.trim(),
      'Mountain Herb',
      'the static name resolves the component name'
    );
    // The image trigger carries the component name as a tooltip.
    assert.equal(
      trigger.getAttribute('title'),
      'Mountain Herb',
      'the image trigger has a name tooltip'
    );
    editHarness.remount();
  });

  it('renders the per-row add cluster (with tooltips) for a single-alternative requirement', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    const req = target.querySelector('[data-recipe-group-id="grp-1"]');
    const row = req.querySelector('[data-recipe-option]');
    // The add cluster lives inside the option row for a single-alternative requirement.
    const rowAddComponent = row.querySelector('[data-recipe-add="alternative-component"]');
    const rowAddTag = row.querySelector('[data-recipe-add="alternative-tag"]');
    assert.ok(rowAddComponent, 'the per-row add-component control renders in the option row');
    assert.ok(rowAddTag, 'the per-row add-tag control renders in the option row');
    // No footer add cluster for a single-alternative requirement.
    assert.equal(
      req.querySelector('.manager-recipe-requirement-adds'),
      null,
      'no footer add cluster for a bare requirement'
    );
    // Both inline add controls carry title tooltips.
    assert.equal(
      rowAddComponent.getAttribute('title'),
      'Add alternative component',
      'the add-component trigger has a tooltip'
    );
    assert.equal(
      rowAddTag.getAttribute('title'),
      'Add alternative tag requirement',
      'the add-tag button has a tooltip'
    );
    editHarness.remount();
  });

  it('renders exactly one footer add cluster (and no per-row adds) for a multi-alternative OR group', async () => {
    const { target } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    const req = target.querySelector('[data-recipe-group-id="grp-1"]');
    // Exactly one add-component and one add-tag control in the whole requirement.
    assert.equal(
      req.querySelectorAll('[data-recipe-add="alternative-component"]').length,
      1,
      'one add-component control per OR group'
    );
    assert.equal(
      req.querySelectorAll('[data-recipe-add="alternative-tag"]').length,
      1,
      'one add-tag control per OR group'
    );
    // The single add cluster lives in the requirement footer, not in any option row.
    const footer = req.querySelector('.manager-recipe-requirement-adds');
    assert.ok(footer, 'the footer add cluster renders for an OR group');
    assert.ok(
      footer.querySelector('[data-recipe-add="alternative-component"]'),
      'the add-component control is in the footer'
    );
    for (const optionRow of req.querySelectorAll('[data-recipe-option]')) {
      assert.equal(
        optionRow.querySelector('.manager-recipe-option-alternative-adds'),
        null,
        'option rows have no per-row add cluster'
      );
      assert.equal(
        optionRow.querySelector('[data-recipe-add="alternative-component"]'),
        null,
        'option rows have no add-component control'
      );
    }
    // The footer add controls keep their tooltips.
    assert.equal(
      footer.querySelector('[data-recipe-add="alternative-component"]').getAttribute('title'),
      'Add alternative component',
      'footer add-component tooltip'
    );
    assert.equal(
      footer.querySelector('[data-recipe-add="alternative-tag"]').getAttribute('title'),
      'Add alternative tag requirement',
      'footer add-tag tooltip'
    );
    editHarness.remount();
  });

  it('appends an alternative from the OR-group footer add-component control', async () => {
    const { target, patches } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'tags', tags: ['liquid'], tagMatch: 'any' } },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    const footer = target.querySelector(
      '[data-recipe-group-id="grp-1"] .manager-recipe-requirement-adds'
    );
    await pickPopoverOption(
      target,
      footer.querySelector('[data-recipe-add="alternative-component"]'),
      /Pure Water/
    );
    assert.equal(patches.length, 1, 'choosing from the footer patches the recipe');
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 3, 'the alternative list grew by one');
    assert.deepEqual(
      options[2].match,
      { type: 'component', componentId: 'cmp-water' },
      'the appended alternative is the chosen component'
    );
    editHarness.remount();
  });

  it('changes a component alternative via its picker trigger', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    target.querySelector('[data-recipe-option] .manager-recipe-component-trigger').click();
    await flushRender();
    const options = [...document.querySelectorAll('.manager-travel-option')];
    assert.equal(options.length, 2, 'the popover lists both components');
    options.find((option) => /Pure Water/.test(option.textContent)).click();
    await flushRender();
    assert.equal(patches.length, 1, 'choosing a component patches the recipe');
    assert.deepEqual(
      patches[0].ingredientSets[0].ingredientGroups[0].options[0].match,
      { type: 'component', componentId: 'cmp-water' },
      'the alternative records the newly chosen component id'
    );
    editHarness.remount();
  });

  it('patches the option quantity when the quantity input changes', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    const qty = target.querySelector('[data-recipe-option-quantity]');
    // The visible "Quantity" label is gone; the input keeps an aria-label.
    assert.equal(
      qty.closest('.manager-recipe-option-quantity-field'),
      null,
      'no labelled quantity field wrapper'
    );
    assert.equal(
      qty.getAttribute('aria-label'),
      'Quantity',
      'the quantity input carries an aria-label'
    );
    const row = qty.closest('[data-recipe-option]');
    assert.equal(
      [...row.querySelectorAll('span')].some((node) => node.textContent.trim() === 'Quantity'),
      false,
      'no visible Quantity text label in the row'
    );
    qty.value = '5';
    qty.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.equal(patches.length, 1, 'editing the quantity patches the recipe');
    assert.equal(
      patches[0].ingredientSets[0].ingredientGroups[0].options[0].quantity,
      5,
      'the new quantity is recorded'
    );
    editHarness.remount();
  });

  it('adds a tag to a tag requirement and toggles any/all', async () => {
    const { target: tagTarget, patches: next } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } }],
      { props: { itemTags: ITEM_TAGS } }
    );
    await pickPopoverOption(
      tagTarget,
      '[data-recipe-option] .manager-recipe-tag-trigger',
      /herbal/
    );
    assert.deepEqual(
      next.at(-1).ingredientSets[0].ingredientGroups[0].options[0].match,
      { type: 'tags', tags: ['herbal'], tagMatch: 'any' },
      'adding a tag records it on the tags match'
    );
    // The any/all toggle writes tagMatch.
    tagTarget.querySelector('[data-recipe-option] [data-recipe-tag-match="all"]').click();
    await flushRender();
    assert.equal(
      next.at(-1).ingredientSets[0].ingredientGroups[0].options[0].match.tagMatch,
      'all',
      'toggling to All records tagMatch:all'
    );
    editHarness.remount();
  });

  it('lays out the tag match with Any/All first and the tags in a bordered area (No tags set when empty)', async () => {
    const { target: tagTarget } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } }],
      { props: { itemTags: ITEM_TAGS } }
    );
    const option = tagTarget.querySelector('[data-recipe-option]');
    // The controls row leads with the Any/All toggle, then the Add tag control.
    const controls = option.querySelector('.manager-recipe-option-tags-controls').innerHTML;
    const toggleAt = controls.indexOf('manager-recipe-tag-match-toggle');
    const triggerAt = controls.indexOf('manager-recipe-tag-trigger');
    assert.ok(
      toggleAt !== -1 && triggerAt !== -1 && toggleAt < triggerAt,
      'the Any/All toggle precedes the Add tag control'
    );
    // The tags live in their own bordered area below; empty shows "No tags set".
    const list = option.querySelector('[data-recipe-tags-list]');
    assert.ok(list, 'the tags render in their own bordered area');
    assert.equal(
      list.querySelector('.manager-recipe-tag-chips'),
      null,
      'no chip list renders when empty'
    );
    const empty = list.querySelector('[data-recipe-tags-empty]');
    assert.ok(empty, 'an empty tag requirement shows the empty-state marker');
    assert.equal(empty.textContent.trim(), 'No tags set', 'the empty state reads "No tags set"');
    editHarness.remount();
  });

  it('renders chosen tags as chips inside the bordered area with no empty state', async () => {
    const { target: tagTarget } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'tags', tags: ['herbal'], tagMatch: 'any' } }],
      { props: { itemTags: ITEM_TAGS } }
    );
    const list = tagTarget.querySelector('[data-recipe-option] [data-recipe-tags-list]');
    assert.ok(
      list.querySelector('[data-recipe-tag="herbal"]'),
      'the chosen tag renders as a chip inside the bordered area'
    );
    assert.equal(
      list.querySelector('[data-recipe-tags-empty]'),
      null,
      'no empty state when tags are set'
    );
    editHarness.remount();
  });

  it('appends a currency requirement (one currency option, id-less) via set-level Add cost', async () => {
    const { target, patches } = await mountIngredientGroups([], {
      set: { name: 'Primary' },
      props: { componentOptions: COMPONENT_OPTIONS, currencyUnits: CURRENCY_UNITS },
    });
    target.querySelector('[data-recipe-set-id="set-1"] [data-recipe-add="cost"]').click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    const groups = patches[0].ingredientSets[0].ingredientGroups;
    assert.equal(groups.length, 1, 'a currency requirement is appended');
    assert.equal('id' in groups[0], false, 'the appended requirement carries no id');
    assert.deepEqual(
      groups[0].options[0].match,
      { type: 'currency', unit: 'gp', amount: 1 },
      'the currency requirement starts with the first unit and amount 1'
    );
    editHarness.remount();
  });

  it('appends a currency alternative via the row-end Add cost button', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, currencyUnits: CURRENCY_UNITS } }
    );
    target
      .querySelector('[data-recipe-group-id="grp-1"] [data-recipe-add="alternative-cost"]')
      .click();
    assert.equal(patches.length, 1, 'adding a cost alternative patches the recipe');
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 2, 'the alternative list grew by one');
    assert.deepEqual(
      options[1].match,
      { type: 'currency', unit: 'gp', amount: 1 },
      'the new alternative is a currency match'
    );
    editHarness.remount();
  });

  it('edits a currency alternative unit and amount, emitting the right match', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } }],
      { props: { componentOptions: COMPONENT_OPTIONS, currencyUnits: CURRENCY_UNITS } }
    );
    // The currency option renders an amount input + a unit picker (no quantity input).
    const currency = target.querySelector('[data-recipe-option-currency]');
    assert.ok(currency, 'the currency option renders its editor');
    assert.equal(
      target.querySelector('[data-recipe-option] [data-recipe-option-quantity]'),
      null,
      'currency rows have no separate quantity input'
    );

    // Controlled component: each edit derives from the unchanged prop, so the
    // amount edit keeps the chosen unit and the unit edit keeps the prop amount.
    const amount = currency.querySelector('[data-recipe-currency-amount]');
    amount.value = '250';
    amount.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.deepEqual(
      patches.at(-1).ingredientSets[0].ingredientGroups[0].options[0].match,
      { type: 'currency', unit: 'gp', amount: 250 },
      'editing the amount records it on the currency match (keeping the unit)'
    );

    // Open the unit picker and choose Silver.
    await pickPopoverOption(
      target,
      '[data-recipe-currency-unit] .manager-recipe-currency-trigger',
      /Silver/
    );
    assert.deepEqual(
      patches.at(-1).ingredientSets[0].ingredientGroups[0].options[0].match,
      { type: 'currency', unit: 'sp', amount: 100 },
      'choosing a unit records it (keeping the prop amount)'
    );
    editHarness.remount();
  });

  it('hides every Add cost control when the system defines no currency units', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, currencyUnits: [] } }
    );
    assert.equal(
      target.querySelector('[data-recipe-add="cost"]'),
      null,
      'no set-level Add cost button'
    );
    assert.equal(
      target.querySelector('[data-recipe-add="alternative-cost"]'),
      null,
      'no row-level Add cost button'
    );
    editHarness.remount();
  });

  it('removing the last alternative drops the whole requirement from the set', async () => {
    const { target, patches } = await mountIngredientGroups(
      [
        {
          id: 'grp-1',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
        },
        {
          id: 'grp-2',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-water' } }],
        },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    // grp-1 has a single alternative; removing it removes the requirement.
    target
      .querySelector('[data-recipe-group-id="grp-1"] [data-recipe-remove="alternative"]')
      .click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    const groups = patches[0].ingredientSets[0].ingredientGroups;
    assert.equal(groups.length, 1, 'the requirement was dropped from the set');
    assert.equal(groups[0].id, 'grp-2', 'the other requirement remains');
    editHarness.remount();
  });

  it('removing one of several alternatives keeps the requirement and drops just that alternative', async () => {
    const { target, patches } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    target
      .querySelectorAll('[data-recipe-group-id="grp-1"] [data-recipe-remove="alternative"]')[0]
      .click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 1, 'only one alternative remains');
    assert.equal(
      options[0].match.componentId,
      'cmp-water',
      'the surviving alternative is the one not removed'
    );
    editHarness.remount();
  });

  it('adds a per-set essence via the essence popover, writing the essences map', async () => {
    const { target, patches } = await mountIngredientGroups([], {
      set: { essences: {} },
      props: { essenceOptions: ESSENCE_OPTIONS },
    });
    await pickPopoverOption(
      target,
      '[data-recipe-set-id="set-1"] .manager-recipe-essence-trigger',
      /Life/
    );
    assert.equal(patches.length, 1, 'choosing an essence patches the recipe');
    assert.deepEqual(
      patches[0].ingredientSets[0].essences,
      { 'ess-life': 1 },
      'the essences map records the chosen essence at quantity 1'
    );
    editHarness.remount();
  });

  it('omits the per-set essence editor when the system has no essences', async () => {
    const { target } = await mountIngredientGroups([], { props: { essenceOptions: [] } });
    assert.ok(target.querySelector('[data-recipe-set-id="set-1"]'), 'the set still renders');
    assert.equal(
      target.querySelector('[data-recipe-section-essences]'),
      null,
      'no essence editor without essences'
    );
    editHarness.remount();
  });

  it('routes a per-step requirement add through onUpdateStep for a multi-step recipe', async () => {
    const updates = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          ...RECIPE,
          steps: [
            {
              id: 'sa',
              name: 'Forge',
              ingredientSets: [{ id: 'set-1', name: 'Primary', ingredientGroups: [] }],
            },
          ],
        },
        componentOptions: COMPONENT_OPTIONS,
        itemTags: ITEM_TAGS,
        onUpdateStep: (id, patch) => updates.push([id, patch]),
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-main').click();
    await flushRender();
    target
      .querySelector(
        '[data-recipe-section="step-sa-ingredients"] [data-recipe-set-id="set-1"] [data-recipe-add="tag-requirement"]'
      )
      .click();
    assert.equal(updates.length, 1, 'onUpdateStep invoked once');
    assert.equal(updates[0][0], 'sa', 'patches the right step');
    assert.equal(
      updates[0][1].ingredientSets[0].ingredientGroups.length,
      1,
      'the step set gains a requirement'
    );
    assert.equal(
      updates[0][1].ingredientSets[0].ingredientGroups[0].options[0].match.type,
      'tags',
      'the appended requirement is a tag requirement'
    );
    editHarness.remount();
  });

  it('does not allow step reordering on the Ingredients/Results/Tools tabs (Overview only)', async () => {
    const moves = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          ...RECIPE,
          steps: [
            { id: 'sa', name: 'Forge' },
            { id: 'sb', name: 'Quench' },
          ],
        },
        toolsLibrary: TOOLS_LIBRARY,
        onReorderSteps: (from, to) => moves.push([from, to]),
      })
    );
    for (const tab of ['ingredients', 'results', 'tools']) {
      clickTab(target, tab);
      await flushRender();
      const head = target.querySelector(
        '[data-recipe-step-id="sa"] .manager-recipe-steps-row-head'
      );
      assert.ok(head, `${tab} tab shows step rows`);
      assert.notEqual(
        head.getAttribute('draggable'),
        'true',
        `${tab} tab step header is not a drag handle`
      );
      // A drag attempt is inert on these tabs.
      head.dispatchEvent(new globalThis.window.Event('dragstart', { bubbles: true }));
      target
        .querySelector('[data-recipe-step-id="sb"]')
        .dispatchEvent(new globalThis.window.Event('drop', { bubbles: true, cancelable: true }));
    }
    assert.deepEqual(moves, [], 'no reorder fires from the requirement tabs');
    editHarness.remount();
  });

  it('shows the time chip and a delete control in every requirement tab header', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          ...RECIPE,
          steps: [{ id: 'sa', name: 'Forge', timeRequirement: { hours: 1 } }],
        },
        toolsLibrary: TOOLS_LIBRARY,
      })
    );
    for (const tab of ['ingredients', 'results', 'tools']) {
      clickTab(target, tab);
      await flushRender();
      assert.ok(
        target.querySelector('[data-recipe-step-time="sa"]'),
        `${tab} header shows the time chip`
      );
      assert.ok(
        target.querySelector('[data-recipe-step-delete="sa"]'),
        `${tab} header shows the delete control`
      );
    }
    editHarness.remount();
  });

  it('routes a step delete to onDeleteStep tagged with the originating tab context', async () => {
    const deletes = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, steps: [{ id: 'sa', name: 'Forge' }] },
        toolsLibrary: TOOLS_LIBRARY,
        onDeleteStep: (id, context) => deletes.push([id, context]),
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    target.querySelector('[data-recipe-step-delete="sa"]').click();
    assert.deepEqual(
      deletes.at(-1),
      ['sa', 'ingredients'],
      'delete from Ingredients tags the ingredients context'
    );

    clickTab(target, 'results');
    await flushRender();
    target.querySelector('[data-recipe-step-delete="sa"]').click();
    assert.deepEqual(
      deletes.at(-1),
      ['sa', 'results'],
      'delete from Results tags the results context'
    );

    clickTab(target, 'tools');
    await flushRender();
    target.querySelector('[data-recipe-step-delete="sa"]').click();
    assert.deepEqual(deletes.at(-1), ['sa', 'tools'], 'delete from Tools tags the tools context');
    editHarness.remount();
  });

  it('shows the recipe-level tools section plus per-step tool sections on the Tools tab', async () => {
    const updates = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, toolIds: ['tool-anvil'], steps: [{ id: 'sa', name: 'Forge' }] },
        toolsLibrary: TOOLS_LIBRARY,
        onUpdateStep: (id, patch) => updates.push([id, patch]),
      })
    );
    clickTab(target, 'tools');
    await flushRender();
    // Recipe-level tools section (idPrefix '') shows the recipe-wide tool.
    assert.ok(
      target.querySelector('[data-recipe-section="tools"] [data-recipe-tool-id="tool-anvil"]'),
      'recipe-level tools section lists the recipe-wide tool'
    );
    // Per-step tool section is collapsed until the step is expanded.
    assert.equal(
      target.querySelector('[data-recipe-section="step-sa-tools"]'),
      null,
      'per-step tools section is collapsed'
    );
    target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-main').click();
    await flushRender();
    const stepTools = target.querySelector('[data-recipe-section="step-sa-tools"]');
    assert.ok(stepTools, 'expanding the step reveals its tools section');
    stepTools.querySelector('.manager-recipe-tools-trigger').click();
    await flushRender();
    document.querySelectorAll('.manager-travel-option').forEach((option) => {
      if (/Hammer/.test(option.textContent)) option.click();
    });
    await flushRender();
    assert.equal(updates.at(-1)[0], 'sa', 'adding a per-step tool patches the step');
    assert.deepEqual(
      updates.at(-1)[1].toolIds,
      ['tool-hammer'],
      'the chosen tool id is appended to the step toolIds'
    );
    editHarness.remount();
  });

  it('routes a per-step result add through onUpdateStep({ resultGroups }) for a multi-step recipe', async () => {
    const updates = [];
    const target = await editHarness.mount(
      identityProps({
        complex: true,
        recipe: { ...RECIPE, complex: true, steps: [{ id: 'sa', name: 'Forge' }] },
        onUpdateStep: (id, patch) => updates.push([id, patch]),
      })
    );
    clickTab(target, 'results');
    await flushRender();
    target.querySelector('[data-recipe-step-id="sa"] .manager-recipe-steps-row-main').click();
    await flushRender();
    target
      .querySelector('[data-recipe-section="step-sa-results"] [data-recipe-add="result-set"]')
      .click();
    assert.equal(updates.length, 1, 'onUpdateStep invoked once');
    assert.equal(updates[0][0], 'sa', 'patches the right step');
    // The section emits the whole replacement groups array via onChange → onUpdateResultGroups.
    assert.equal(
      updates[0][1].resultGroups.length,
      1,
      'a single group is appended to the empty step scope'
    );
    assert.equal(
      'id' in updates[0][1].resultGroups[0],
      false,
      'the appended group carries no id (store assigns one)'
    );
    editHarness.remount();
  });

  it('removes a result group (the array shrinks; surviving groups keep id/name)', async () => {
    const { target, patches } = await mountResultGroups([
      { id: 'grp-1', name: 'Primary', results: [] },
      { id: 'grp-2', name: 'Bonus', results: [] },
    ]);
    const second = target.querySelector('[data-recipe-result-set-id="grp-2"]');
    second.querySelector('[data-recipe-remove="result-set"]').click();
    assert.equal(patches.length, 1, 'removing a group patches the recipe once');
    assert.equal(patches[0].resultGroups.length, 1, 'the result group array shrank by one');
    assert.equal(patches[0].resultGroups[0].id, 'grp-1', 'the survivor keeps its id');
    assert.equal(patches[0].resultGroups[0].name, 'Primary', 'the survivor keeps its name');
    editHarness.remount();
  });

  it('edits a result group name, preserving its id', async () => {
    const { target, patches } = await mountResultGroups([
      { id: 'grp-1', name: 'Primary', results: [] },
    ]);
    const nameInput = target.querySelector('[data-recipe-result-set-field="name"]');
    assert.equal(nameInput.value, 'Primary', 'the group name is editable and populated');
    nameInput.value = 'Renamed';
    nameInput.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.equal(patches.length, 1, 'editing the name patches the recipe');
    assert.equal(patches[0].resultGroups[0].id, 'grp-1', 'the edited group keeps its id');
    assert.equal(patches[0].resultGroups[0].name, 'Renamed', 'the new name is written');
    editHarness.remount();
  });

  it('adds a result item id-less to a group via the Add item popover', async () => {
    const { target, patches } = await mountResultGroups([
      { id: 'grp-1', name: 'Primary', results: [] },
    ]);
    await pickPopoverOption(
      target,
      '[data-recipe-result-set-id="grp-1"] .manager-recipe-add-component-trigger',
      /Mountain Herb/
    );
    assert.equal(patches.length, 1, 'adding an item patches the recipe');
    const items = patches[0].resultGroups[0].results;
    assert.equal(items.length, 1, 'the group has one result item');
    assert.deepEqual(
      items[0],
      { componentId: 'cmp-herb', quantity: 1 },
      'the item is id-less with quantity 1'
    );
    editHarness.remount();
  });

  it('removes a result item (the group empties)', async () => {
    const { target, patches } = await mountResultGroups([
      { id: 'grp-1', name: 'Primary', results: [{ componentId: 'cmp-herb', quantity: 1 }] },
    ]);
    const item = target.querySelector('[data-recipe-result-item]');
    assert.ok(item, 'the result item row renders');
    item.querySelector('[data-recipe-remove="result-item"]').click();
    assert.equal(patches.length, 1, 'removing an item patches the recipe');
    assert.deepEqual(patches[0].resultGroups[0].results, [], 'the group is now empty');
    editHarness.remount();
  });

  it('bumps quantity (capped) instead of duplicating when the same component is re-added', async () => {
    const { target, patches } = await mountResultGroups([
      {
        id: 'grp-1',
        name: 'Primary',
        results: [{ id: 'res-1', componentId: 'cmp-herb', quantity: 1 }],
      },
    ]);
    await pickPopoverOption(
      target,
      '[data-recipe-result-set-id="grp-1"] .manager-recipe-add-component-trigger',
      /Mountain Herb/
    );
    assert.equal(patches.length, 1, 're-adding the same component patches the recipe');
    const items = patches[0].resultGroups[0].results;
    assert.equal(items.length, 1, 'no duplicate item appended');
    assert.equal(items[0].quantity, 2, 'the existing item quantity is bumped to 2');
    assert.equal(items[0].id, 'res-1', 'the bumped item keeps its normalized id');
    assert.equal(items[0].componentId, 'cmp-herb', 'the bumped item keeps its component');
    editHarness.remount();
  });

  it('picks/swaps the component of a result item (name span + trigger image reflect the choice)', async () => {
    const { target, patches } = await mountResultGroups([
      { id: 'grp-1', name: 'Primary', results: [{ componentId: 'cmp-herb', quantity: 1 }] },
    ]);
    const item = target.querySelector('[data-recipe-result-item]');
    assert.match(
      item.textContent,
      /Mountain Herb/,
      'the item resolves the component name in a span'
    );
    const img = item.querySelector('.manager-travel-portrait img');
    assert.equal(
      img.getAttribute('src'),
      'icons/herb.webp',
      'the trigger image is the resolved component img'
    );
    // Swap to the other component via the image-only picker trigger.
    await pickPopoverOption(
      target,
      item.querySelector('.manager-recipe-component-trigger'),
      /Pure Water/
    );
    assert.equal(patches.length, 1, 'swapping the component patches the recipe');
    assert.equal(
      patches[0].resultGroups[0].results[0].componentId,
      'cmp-water',
      'the new component id is written'
    );
    assert.equal(
      patches[0].resultGroups[0].results[0].quantity,
      1,
      'the quantity is preserved across the swap'
    );
    editHarness.remount();
  });

  it('caps result item quantity at 9999 and floors invalid input to 1', async () => {
    const { target, patches } = await mountResultGroups([
      { id: 'grp-1', name: 'Primary', results: [{ componentId: 'cmp-herb', quantity: 2 }] },
    ]);
    const input = target.querySelector('[data-recipe-result-item] [data-recipe-option-quantity]');
    assert.equal(input.value, '2', 'the quantity input reflects the item quantity');
    input.value = '999999';
    input.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.equal(
      patches.at(-1).resultGroups[0].results[0].quantity,
      9999,
      'over-cap input is capped to 9999'
    );
    input.value = '0';
    input.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.equal(
      patches.at(-1).resultGroups[0].results[0].quantity,
      1,
      'non-positive input floors to 1'
    );
    editHarness.remount();
  });

  it('shows a single chromeless authorable group with picker + quantity and no add/remove-set in Simple mode', async () => {
    const { target, patches } = await mountResultGroups(
      [{ id: 'grp-1', name: 'Primary', results: [{ componentId: 'cmp-herb', quantity: 3 }] }],
      { props: { complex: false }, recipe: { complex: false } }
    );
    assert.ok(
      target.querySelector('[data-recipe-result-simple]'),
      'the simple result wrapper renders'
    );
    assert.ok(
      target.querySelector('.manager-recipe-ingredient-set.is-chromeless'),
      'the single group renders chromeless'
    );
    assert.equal(
      target.querySelector('[data-recipe-add="result-set"]'),
      null,
      'no Add result set button in Simple mode'
    );
    assert.equal(
      target.querySelector('[data-recipe-remove="result-set"]'),
      null,
      'no remove-set control in Simple mode'
    );
    assert.equal(
      target.querySelector('[data-recipe-result-set-field="name"]'),
      null,
      'no group-name field in Simple mode'
    );
    // The single group is still fully authorable (picker + quantity).
    assert.ok(
      target.querySelector('[data-recipe-result-item] .manager-recipe-component-trigger'),
      'the component picker renders'
    );
    assert.equal(
      target.querySelector('[data-recipe-result-item] [data-recipe-option-quantity]').value,
      '3',
      'the quantity renders'
    );
    // A simple-mode edit preserves the existing group id/name.
    const input = target.querySelector('[data-recipe-result-item] [data-recipe-option-quantity]');
    input.value = '4';
    input.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.equal(
      patches.at(-1).resultGroups[0].id,
      'grp-1',
      'a simple-mode edit preserves the group id'
    );
    assert.equal(
      patches.at(-1).resultGroups[0].name,
      'Primary',
      'a simple-mode edit preserves the group name'
    );
    editHarness.remount();
  });

  it('materializes a real group on the first Simple-mode edit when none exists yet', async () => {
    const { target, patches } = await mountResultGroups([], {
      props: { complex: false },
      recipe: { complex: false },
    });
    assert.ok(
      target.querySelector('[data-recipe-result-simple]'),
      'the simple result wrapper renders an empty placeholder'
    );
    await pickPopoverOption(target, '.manager-recipe-add-component-trigger', /Mountain Herb/);
    assert.equal(patches.length, 1, 'the first edit writes the single-element groups array');
    assert.equal(patches[0].resultGroups.length, 1, 'a single group materializes');
    assert.deepEqual(
      patches[0].resultGroups[0].results,
      [{ componentId: 'cmp-herb', quantity: 1 }],
      'the group holds the added item'
    );
    editHarness.remount();
  });

  it('shows the Add result set button in Complex mode', async () => {
    const { target } = await mountResultGroups([]);
    assert.ok(
      target.querySelector('[data-recipe-add="result-set"]'),
      'Add result set button shown in Complex mode'
    );
    editHarness.remount();
  });

  it('round-trips authored resultGroups through Recipe.fromJSON().toJSON(), keeping componentId/quantity', async () => {
    const { target, patches } = await mountResultGroups([
      { id: 'grp-1', name: 'Primary', results: [] },
    ]);
    await pickPopoverOption(
      target,
      '[data-recipe-result-set-id="grp-1"] .manager-recipe-add-component-trigger',
      /Pure Water/
    );
    const authored = patches.at(-1).resultGroups;
    // The Recipe model assigns ids via global foundry.utils.randomID(); the mounted
    // harness installs game.i18n but not foundry, so stub it for the round-trip.
    const hadFoundry = 'foundry' in globalThis;
    const priorFoundry = globalThis.foundry;
    let counter = 0;
    globalThis.foundry = { utils: { randomID: () => `id-${++counter}` } };
    const roundTripped = Recipe.fromJSON({
      id: 'r1',
      name: 'Healing Draught',
      resultGroups: authored,
    }).toJSON();
    if (hadFoundry) globalThis.foundry = priorFoundry;
    else delete globalThis.foundry;
    const item = roundTripped.resultGroups[0].results[0];
    assert.equal(item.componentId, 'cmp-water', 'componentId survives the round-trip');
    assert.equal(item.quantity, 1, 'quantity survives the round-trip');
    assert.equal(
      roundTripped.resultGroups[0].name,
      'Primary',
      'group name survives the round-trip'
    );
    editHarness.remount();
  });

  it('preserves a group id AND name when editing a recipe that carries outcomeRouting/resultSelection', async () => {
    // Routing references the group by id (outcomeRouting/resultMapping) and by
    // name (roll-table resultSelection, case-insensitive), so the first edit must
    // not drop either.
    const { target, patches } = await mountResultGroups(
      [{ id: 'grp-1', name: 'Primary', results: [{ componentId: 'cmp-herb', quantity: 1 }] }],
      {
        recipe: {
          outcomeRouting: { success: 'grp-1' },
          resultSelection: { mode: 'rollTable', rollTableOutcome: { Primary: 'grp-1' } },
        },
      }
    );
    // Edit the group's only item (a quantity change) — the lightest-touch edit path.
    const input = target.querySelector('[data-recipe-result-item] [data-recipe-option-quantity]');
    input.value = '5';
    input.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.equal(
      patches.at(-1).resultGroups[0].id,
      'grp-1',
      'the edited group keeps its routing id'
    );
    assert.equal(
      patches.at(-1).resultGroups[0].name,
      'Primary',
      'the edited group keeps its routing name'
    );
    editHarness.remount();
  });
});

describe('RecipeItemInspector (mounted)', () => {
  before(async () => {
    await inspectorHarness.setup();
    // The harness installs game.i18n but not fromUuid; provide a default stub.
    globalThis.foundry = {};
    globalThis.fromUuid = async () => null;
  });

  after(() => {
    delete globalThis.fromUuid;
    delete globalThis.foundry;
    inspectorHarness.teardown();
  });

  beforeEach(() => {
    globalThis.fromUuid = async () => null;
  });

  it('renders the recipe-item card with an empty dropzone', async () => {
    const target = await inspectorHarness.mount(inspectorProps());
    assert.ok(
      target.querySelector('[data-recipe-section="recipe-item"]'),
      'recipe-item card renders'
    );
    assert.ok(target.querySelector('[data-recipe-item-dropzone]'), 'empty dropzone present');
    inspectorHarness.remount();
  });

  it('links an item on a valid Item drop and ignores a non-Item drop', async () => {
    const added = [];
    const set = [];
    const target = await inspectorHarness.mount(
      inspectorProps({
        onAddRecipeItem: (uuid) => {
          added.push(uuid);
          return { item: { id: 'ri1' }, action: 'added' };
        },
        onSetRecipeItem: (id) => set.push(id),
      })
    );
    const dropzone = target.querySelector('[data-recipe-item-dropzone]');
    assert.ok(dropzone, 'empty dropzone present');

    // Non-Item drop is a no-op.
    dispatchDrop(dropzone, { type: 'Scene', uuid: 'Scene.s1' });
    await Promise.resolve();
    assert.equal(added.length, 0, 'non-Item drop ignored');

    // Valid Item drop links it.
    dispatchDrop(dropzone, { type: 'Item', uuid: 'Item.it1' });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(added, ['Item.it1'], 'onAddRecipeItem called with the item uuid');
    assert.deepEqual(set, ['ri1'], 'onSetRecipeItem called with the new definition id');
    inspectorHarness.remount();
  });

  it('still links a deduped (skipped) drop', async () => {
    const set = [];
    const target = await inspectorHarness.mount(
      inspectorProps({
        onAddRecipeItem: () => ({ item: { id: 'ri-existing' }, action: 'skipped' }),
        onSetRecipeItem: (id) => set.push(id),
      })
    );
    dispatchDrop(target.querySelector('[data-recipe-item-dropzone]'), {
      type: 'Item',
      uuid: 'Item.dupe',
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(set, ['ri-existing'], 'skipped action still sets the recipeItemId');
    inspectorHarness.remount();
  });

  it('derives the linked image/name from the STAGED recipeItemId against the definitions', async () => {
    // Two definitions; fromUuid resolves a doc per uuid so the thumb/name come from
    // the resolved source. The displayed pair must track the recipe draft's
    // recipeItemId — the staged source — not any persisted projection.
    const DOCS = {
      'Item.blue': { name: 'Blue Potion', img: 'icons/blue-potion.webp' },
      'Item.green': { name: 'Green Potion', img: 'icons/green-potion.webp' },
    };
    globalThis.fromUuid = async (uuid) => DOCS[uuid] || null;
    const DEFS = [
      { id: 'ri-blue', name: 'Blue Def', img: 'icons/blue-def.webp', sourceItemUuid: 'Item.blue' },
      {
        id: 'ri-green',
        name: 'Green Def',
        img: 'icons/green-def.webp',
        sourceItemUuid: 'Item.green',
      },
    ];
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, recipeItemId: 'ri-blue' },
        recipeItemDefinitions: DEFS,
      })
    );
    await new Promise((r) => setTimeout(r, 10));
    const imgEl = target.querySelector(
      '[data-recipe-item-linked] img.manager-environment-scene-thumb'
    );
    const nameEl = target.querySelector(
      '[data-recipe-item-linked] .manager-environment-scene-name'
    );
    assert.ok(
      imgEl.getAttribute('src').includes('blue-potion'),
      'shows the blue source image for the staged ri-blue link'
    );
    assert.ok(
      nameEl.textContent.includes('Blue Potion'),
      'shows the blue source name for the staged ri-blue link'
    );

    // Regression: staging a different recipeItemId updates the preview WITHOUT a
    // save — the inspector resolves from the (staged) draft, not a persisted record.
    inspectorHarness.remount();
    const restaged = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, recipeItemId: 'ri-green' },
        recipeItemDefinitions: DEFS,
      })
    );
    await new Promise((r) => setTimeout(r, 10));
    const imgAfter = restaged.querySelector(
      '[data-recipe-item-linked] img.manager-environment-scene-thumb'
    );
    const nameAfter = restaged.querySelector(
      '[data-recipe-item-linked] .manager-environment-scene-name'
    );
    assert.ok(
      imgAfter.getAttribute('src').includes('green-potion'),
      'staged ri-green link swaps the displayed image without a save'
    );
    assert.ok(
      nameAfter.textContent.includes('Green Potion'),
      'staged ri-green link swaps the displayed name without a save'
    );
    inspectorHarness.remount();
  });

  it('renders the missing state when fromUuid resolves to null', async () => {
    globalThis.fromUuid = async () => null;
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, recipeItemId: 'ri1' },
        recipeItemDefinitions: [
          {
            id: 'ri1',
            name: 'Old Item',
            img: 'icons/svg/item-bag.svg',
            sourceItemUuid: 'Item.gone',
          },
        ],
      })
    );
    // Let the async resolution $effect settle before asserting.
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(
      target.querySelector('[data-recipe-item-missing]'),
      'missing state renders when the source item no longer resolves'
    );
    // The link is retained (the linked container, not the empty dropzone).
    assert.ok(
      target.querySelector('[data-recipe-item-linked]'),
      'the link is retained in the missing state'
    );
    inspectorHarness.remount();
  });

  it('disables the category selector and shows only General when no categories exist', async () => {
    const target = await inspectorHarness.mount(inspectorProps({ categories: [] }));
    const select = target.querySelector('[data-recipe-category-select]');
    assert.ok(select, 'category selector renders');
    assert.equal(select.disabled, true, 'selector is disabled with no custom categories');
    const options = [...select.querySelectorAll('option')];
    assert.equal(options.length, 1, 'only one option present');
    assert.equal(options[0].value, 'general', 'the sole option is the General fallback');
    inspectorHarness.remount();
  });

  it('enables the selector with custom categories and reports the current category', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, category: 'Potions' },
        categories: ['Potions', 'Weapons'],
      })
    );
    const select = target.querySelector('[data-recipe-category-select]');
    assert.equal(select.disabled, false, 'selector is interactive with custom categories');
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    assert.deepEqual(
      values,
      ['general', 'Potions', 'Weapons'],
      'General precedes the custom categories'
    );
    assert.equal(select.value, 'Potions', 'reflects the recipe category');
    inspectorHarness.remount();
  });

  it('calls onSetCategory when a different category is chosen', async () => {
    const chosen = [];
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, category: 'general' },
        categories: ['Potions'],
        onSetCategory: (category) => chosen.push(category),
      })
    );
    const select = target.querySelector('[data-recipe-category-select]');
    select.value = 'Potions';
    select.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await Promise.resolve();
    assert.deepEqual(chosen, ['Potions'], 'onSetCategory receives the selected category');
    inspectorHarness.remount();
  });

  it('hides the step-mode toggle when multi-step is not enabled and the recipe is single-step', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, steps: [] },
        multiStepEnabled: false,
      })
    );
    assert.equal(
      target.querySelector('[data-recipe-section="recipe-step-mode"]'),
      null,
      'step-mode card is hidden'
    );
    inspectorHarness.remount();
  });

  it('shows the step-mode toggle for a single-step recipe when multi-step is enabled', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, steps: [] },
        multiStepEnabled: true,
      })
    );
    assert.ok(
      target.querySelector('[data-recipe-section="recipe-step-mode"]'),
      'step-mode card renders when enabled'
    );
    inspectorHarness.remount();
  });

  it('still shows the step-mode toggle for a multi-step recipe even when the feature is off (to allow revert)', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] },
        multiStepEnabled: false,
      })
    );
    assert.ok(
      target.querySelector('[data-recipe-section="recipe-step-mode"]'),
      'step-mode card stays visible so multi-step can be reverted'
    );
    inspectorHarness.remount();
  });

  it('shows single-step selected and fires onEnterMultiStep when switching to multi', async () => {
    const entered = [];
    const reverted = [];
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, steps: [] },
        multiStepEnabled: true,
        onEnterMultiStep: () => entered.push(true),
        onRevertToSingleStep: () => reverted.push(true),
      })
    );
    const single = target.querySelector('[data-recipe-step-mode-option="single"]');
    const multi = target.querySelector('[data-recipe-step-mode-option="multi"]');
    assert.ok(
      single.classList.contains('is-selected'),
      'single is selected when there are no steps'
    );
    assert.equal(multi.classList.contains('is-selected'), false, 'multi is not selected');

    single.click();
    assert.equal(entered.length, 0, 'clicking the already-active single mode is a no-op');

    multi.click();
    assert.deepEqual(entered, [true], 'clicking multi fires onEnterMultiStep');
    assert.equal(reverted.length, 0, 'revert not called when entering multi');
    inspectorHarness.remount();
  });

  it('shows multi-step selected and fires onRevertToSingleStep when switching to single', async () => {
    const entered = [];
    const reverted = [];
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] },
        onEnterMultiStep: () => entered.push(true),
        onRevertToSingleStep: () => reverted.push(true),
      })
    );
    const single = target.querySelector('[data-recipe-step-mode-option="single"]');
    const multi = target.querySelector('[data-recipe-step-mode-option="multi"]');
    assert.ok(multi.classList.contains('is-selected'), 'multi is selected when steps exist');

    multi.click();
    assert.equal(reverted.length, 0, 'clicking the already-active multi mode is a no-op');

    single.click();
    assert.deepEqual(reverted, [true], 'clicking single fires onRevertToSingleStep');
    assert.equal(entered.length, 0, 'enter not called when reverting');
    inspectorHarness.remount();
  });

  it('renders the recipe-mode toggle with Simple selected when the system allows complex', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        recipe: { ...RECIPE, steps: [] },
        multiStepEnabled: false,
        multiSetAllowed: true,
      })
    );
    const card = target.querySelector('[data-recipe-section="recipe-mode"]');
    assert.ok(card, 'recipe-mode card renders when complex is an available choice');
    const simple = card.querySelector('[data-recipe-mode-option="simple"]');
    assert.ok(simple.classList.contains('is-selected'), 'Simple is selected when complex is false');
    inspectorHarness.remount();
  });

  it('hides the recipe-mode section when the system forbids multiple sets and the recipe is not already complex', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        complex: false,
        multiSetAllowed: false,
      })
    );
    assert.equal(
      target.querySelector('[data-recipe-section="recipe-mode"]'),
      null,
      'a simple-resolution system does not show the recipe-mode toggle at all'
    );
    inspectorHarness.remount();
  });

  it('still shows the recipe-mode section for an already-complex recipe even when the system forbids multiple sets', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        complex: true,
        multiSetAllowed: false,
      })
    );
    const card = target.querySelector('[data-recipe-section="recipe-mode"]');
    assert.ok(card, 'an already-complex recipe keeps the recipe-mode toggle so it can be reverted');
    const complex = card.querySelector('[data-recipe-mode-option="complex"]');
    assert.ok(
      complex.classList.contains('is-selected'),
      'Complex is selected for an already-complex recipe'
    );
    inspectorHarness.remount();
  });

  it('enables the Complex option when multiSetAllowed is true', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        complex: false,
        multiSetAllowed: true,
      })
    );
    const complex = target.querySelector('[data-recipe-mode-option="complex"]');
    assert.equal(
      complex.disabled,
      false,
      'Complex is enabled when the system allows multiple sets'
    );
    assert.equal(
      target.querySelector('[data-recipe-mode-hint="locked"]'),
      null,
      'no locked hint when allowed'
    );
    inspectorHarness.remount();
  });

  it('fires onSetComplexity(true) on Complex and onSetComplexity(false) on Simple', async () => {
    const calls = [];
    const target = await inspectorHarness.mount(
      inspectorProps({
        complex: false,
        multiSetAllowed: true,
        onSetComplexity: (next) => calls.push(next),
      })
    );
    target.querySelector('[data-recipe-mode-option="complex"]').click();
    assert.deepEqual(calls, [true], 'clicking Complex requests complex mode');

    inspectorHarness.remount();
    const target2 = await inspectorHarness.mount(
      inspectorProps({
        complex: true,
        multiSetAllowed: true,
        onSetComplexity: (next) => calls.push(next),
      })
    );
    target2.querySelector('[data-recipe-mode-option="simple"]').click();
    assert.deepEqual(calls, [true, false], 'clicking Simple requests simple mode');
    inspectorHarness.remount();
  });

  it('shows the Check/Ingredient routing toggle only for routed systems', async () => {
    const routedTarget = await inspectorHarness.mount(
      inspectorProps({
        routed: true,
        routingProvider: 'ingredientSet',
      })
    );
    const card = routedTarget.querySelector('[data-recipe-section="recipe-routing"]');
    assert.ok(card, 'routed systems show the result-routing toggle');
    assert.ok(card.querySelector('[data-recipe-routing-option="check"]'), 'a Check option renders');
    assert.ok(
      card
        .querySelector('[data-recipe-routing-option="ingredient"]')
        .classList.contains('is-selected'),
      'the ingredientSet provider selects the Ingredient option'
    );
    inspectorHarness.remount();

    const simpleTarget = await inspectorHarness.mount(inspectorProps({ routed: false }));
    assert.equal(
      simpleTarget.querySelector('[data-recipe-section="recipe-routing"]'),
      null,
      'non-routed systems do not show the routing toggle'
    );
    inspectorHarness.remount();
  });

  it('selects Check for an outcome-driven provider and writes the provider on toggle', async () => {
    const calls = [];
    const target = await inspectorHarness.mount(
      inspectorProps({
        routed: true,
        routingProvider: 'check',
        onSetRoutingProvider: (provider) => calls.push(provider),
      })
    );
    assert.ok(
      target
        .querySelector('[data-recipe-routing-option="check"]')
        .classList.contains('is-selected'),
      'the check provider selects the Check option'
    );
    target.querySelector('[data-recipe-routing-option="ingredient"]').click();
    assert.deepEqual(
      calls,
      ['ingredientSet'],
      'clicking Ingredient requests the ingredientSet provider'
    );

    inspectorHarness.remount();
    const target2 = await inspectorHarness.mount(
      inspectorProps({
        routed: true,
        routingProvider: 'ingredientSet',
        onSetRoutingProvider: (provider) => calls.push(provider),
      })
    );
    target2.querySelector('[data-recipe-routing-option="check"]').click();
    assert.deepEqual(
      calls,
      ['ingredientSet', 'check'],
      'clicking Check requests the check provider'
    );
    inspectorHarness.remount();
  });

  it('reads a legacy macroOutcome provider back as Check routing', async () => {
    const target = await inspectorHarness.mount(
      inspectorProps({
        routed: true,
        routingProvider: 'macroOutcome',
      })
    );
    assert.ok(
      target
        .querySelector('[data-recipe-routing-option="check"]')
        .classList.contains('is-selected'),
      'the legacy macroOutcome provider still reads as Check'
    );
    inspectorHarness.remount();
  });
});

describe('RecipeStepsCard (mounted)', () => {
  before(async () => {
    await stepsHarness.setup();
  });

  after(() => {
    stepsHarness.teardown();
  });

  it('renders a row per step with name and description, plus an add button', async () => {
    const target = await stepsHarness.mount(stepsProps());
    const rows = target.querySelectorAll('[data-recipe-step-id]');
    assert.equal(rows.length, 2, 'one row per step');
    assert.match(target.textContent, /Gather reagents/, 'first step name shown');
    assert.match(target.textContent, /Collect the base herbs\./, 'first step description shown');
    assert.ok(target.querySelector('[data-recipe-step-add]'), 'add-a-step button present');
    stepsHarness.remount();
  });

  it('shows a duration trigger with the formatted time, and an Add duration trigger when none is set', async () => {
    const target = await stepsHarness.mount(stepsProps());
    const triggers = target.querySelectorAll('[data-recipe-duration-trigger]');
    assert.equal(triggers.length, 2, 'one duration trigger per step');
    assert.match(
      triggers[0].textContent,
      /2 hours, 30 minutes/,
      'time formatted from non-zero units'
    );
    assert.equal(
      triggers[0].classList.contains('is-empty'),
      false,
      'a populated trigger is not muted'
    );

    assert.match(
      triggers[1].textContent,
      /Add duration/,
      'no time requirement shows the Add duration affordance'
    );
    assert.ok(triggers[1].classList.contains('is-empty'), 'an unset duration trigger is muted');
    stepsHarness.remount();
  });

  it('emits onUpdateStep with the edited timeRequirement when a duration unit changes', async () => {
    const updates = [];
    const target = await stepsHarness.mount(
      stepsProps({ onUpdateStep: (id, patch) => updates.push([id, patch]) })
    );
    // Open step-2's (empty) duration editor and set hours to 4.
    const triggers = target.querySelectorAll('[data-recipe-duration-trigger]');
    triggers[1].click();
    await flushRender();
    const hoursInput = document.querySelector('[data-recipe-duration-unit="hours"]');
    assert.ok(hoursInput, 'the duration editor exposes an hours input');
    hoursInput.value = '4';
    hoursInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    assert.equal(updates.length, 1, 'editing a unit emits exactly one patch');
    assert.equal(updates[0][0], 'step-2', 'the patch targets the edited step');
    assert.deepEqual(
      updates[0][1].timeRequirement,
      { minutes: 0, hours: 4, days: 0, months: 0, years: 0 },
      'the patch carries the rebuilt timeRequirement'
    );
    stepsHarness.remount();
  });

  it('clears the duration to null when the only non-zero unit is zeroed', async () => {
    const updates = [];
    // A single-unit step so zeroing that unit collapses the whole requirement to
    // null (the controlled prop does not update between synthetic events, so a
    // multi-unit step could not reach all-zero through sequential edits).
    const target = await stepsHarness.mount(
      stepsProps({
        steps: [{ id: 'solo', name: 'Cure', description: '', timeRequirement: { days: 2 } }],
        onUpdateStep: (id, patch) => updates.push([id, patch]),
      })
    );
    target.querySelector('[data-recipe-duration-trigger]').click();
    await flushRender();
    const daysInput = document.querySelector('[data-recipe-duration-unit="days"]');
    daysInput.value = '0';
    daysInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    assert.equal(updates.at(-1)[0], 'solo', 'the patch targets the edited step');
    assert.equal(updates.at(-1)[1].timeRequirement, null, 'zeroing the only unit clears to null');
    stepsHarness.remount();
  });

  it('expands a row on click and edits name via onchange', async () => {
    const updates = [];
    const target = await stepsHarness.mount(
      stepsProps({ onUpdateStep: (id, patch) => updates.push([id, patch]) })
    );
    assert.equal(
      target.querySelector('[data-recipe-step-field="name"]'),
      null,
      'collapsed by default'
    );
    const main = target.querySelector(
      '[data-recipe-step-id="step-1"] .manager-recipe-steps-row-main'
    );
    main.click();
    await flushRender();
    const nameInput = target.querySelector('[data-recipe-step-field="name"]');
    assert.ok(nameInput, 'name input visible when expanded');
    nameInput.value = 'Forage';
    nameInput.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    assert.deepEqual(
      updates,
      [['step-1', { name: 'Forage' }]],
      'onUpdateStep called with the new name'
    );
    stepsHarness.remount();
  });

  it('fires onAddStep and onDeleteStep', async () => {
    const added = [];
    const deleted = [];
    const target = await stepsHarness.mount(
      stepsProps({
        onAddStep: () => added.push(true),
        onDeleteStep: (id) => deleted.push(id),
      })
    );
    target.querySelector('[data-recipe-step-add]').click();
    assert.deepEqual(added, [true], 'add button fires onAddStep');
    target.querySelector('[data-recipe-step-delete="step-2"]').click();
    assert.deepEqual(deleted, ['step-2'], 'delete button fires onDeleteStep with the step id');
    stepsHarness.remount();
  });

  it('reorders via dragging a step header onto another row', async () => {
    const moves = [];
    const target = await stepsHarness.mount(
      stepsProps({ onReorderSteps: (from, to) => moves.push([from, to]) })
    );
    // Only the header is draggable; the row is the drop target.
    const firstHeader = target.querySelector(
      '[data-recipe-step-id="step-1"] .manager-recipe-steps-row-head'
    );
    assert.equal(firstHeader.getAttribute('draggable'), 'true', 'the header is the drag source');
    assert.equal(
      target.querySelector('[data-recipe-step-move]'),
      null,
      'the up/down arrows are gone'
    );
    firstHeader.dispatchEvent(new globalThis.window.Event('dragstart', { bubbles: true }));
    target
      .querySelector('[data-recipe-step-id="step-2"]')
      .dispatchEvent(new globalThis.window.Event('drop', { bubbles: true, cancelable: true }));
    assert.deepEqual(moves, [[0, 1]], 'dropping step 1 onto step 2 reorders from index 0 to 1');
    stepsHarness.remount();
  });

  it('edits only name and description inside an expanded step (no tools/ingredients/results)', async () => {
    const target = await stepsHarness.mount(stepsProps());
    target.querySelector('[data-recipe-step-id="step-1"] .manager-recipe-steps-row-main').click();
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-step-field="name"]'),
      'name input renders when expanded'
    );
    assert.ok(
      target.querySelector('[data-recipe-step-field="description"]'),
      'description input renders when expanded'
    );
    // Requirement sections live on their own tabs, never inside the Overview step card.
    assert.equal(
      target.querySelector('[data-recipe-section="step-step-1-tools"]'),
      null,
      'no tools section inside the Overview step'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="step-step-1-ingredients"]'),
      null,
      'no ingredients section inside the Overview step'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="step-step-1-results"]'),
      null,
      'no results section inside the Overview step'
    );
    stepsHarness.remount();
  });
});
