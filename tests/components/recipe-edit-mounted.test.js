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
  // The Overview tab resolves the recipe image (bag → blueprint) through this
  // standalone (dependency-free) resolver; a missing raw module HANGS the suite.
  'src/ui/svelte/util/craftingImageDefaults.js',
  // Shared duration formatter consumed by the step accordion + duration editor.
  'src/ui/svelte/util/recipeDuration.js',
  // Shared currency label/icon helpers consumed by the ingredient option editor.
  'src/ui/svelte/util/recipeCurrency.js',
  'src/models/Recipe.js',
  'src/models/Ingredient.js',
  'src/models/IngredientSet.js',
  'src/models/IngredientGroup.js',
  'src/models/Result.js',
  'src/systems/toolCheckBonus.js',
  'src/utils/recipeCategories.js',
  'src/utils/routedOutcomeKeywords.js',
  'src/config/flags.js',
  // Ingredient + recipeReadiness dispatch through the match-type registry.
  'src/models/match/matchTypes.js',
  // The validation tab consumes the pure readiness evaluator.
  'src/ui/svelte/apps/manager/recipe/recipeReadiness.js',
  // The validation tab localizes a signature-collision blocker row via this pure
  // leaf (issue 549).
  'src/utils/recipeActivationMessages.js',
  // The resolution-mode banner reuses the CANONICAL option list (value/icon/label/
   // desc) rather than re-authoring a MODE_INFO table. It was not in this allowlist
  // before, and a missing raw module HANGS the suite (`# cancelled`) instead of
  // failing it.
  'src/ui/svelte/apps/manager/resolutionModeOptions.js',
  // The Overview tab resolves the recipe's category label for its Category select.
  // RecipeToolsSection embeds SearchablePopover for the Tools picker; the harness
  // must copy its supporting raw modules (portal/dismiss/layout helpers).
  ...SEARCHABLE_POPOVER_RAW_MODULES,
];

// The new tab + section components the editor shell composes.
const RECIPE_COMPILED = [
  'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  // The Results tab's progressive reorder-permission card (issue 651). A component the
  // mounted tree renders but the harness does not list HANGS the suite (# cancelled)
  // rather than failing it.
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
  // The resolution-mode banner heads every editor tab (issue 643 §5).
  'src/ui/svelte/apps/manager/recipe/RecipeModeBanner.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientSetCard.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultGroupCard.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeRoutingAssignment.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultItemRow.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeToolsSection.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeEditorTabs.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeOverviewTab.svelte',
  // The Overview tab's eligible-modifier override renders the shared pill multi-select
  // (issue 770). A `.svelte` the tree renders but the harness omits HANGS the suite.
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeIngredientsTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeResultsTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeToolsTab.svelte',
  // The two mode-conditional tabs (issue 676), rehomed from the deleted context rail.
  'src/ui/svelte/apps/manager/recipe/RecipeAccessTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeBooksScrollsTab.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeDurationEditor.svelte',
  'src/ui/svelte/apps/manager/recipe/RecipeDurationSteppers.svelte',
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


const stepsHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-steps-',
  rawModules: RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeDurationEditor.svelte',
    'src/ui/svelte/apps/manager/recipe/RecipeDurationSteppers.svelte',
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

// The rail's default effect is the `knowledge` row of the craftingVisibility matrix
// (showBooksScrolls), which is also the manager's default visibility mode.
// Props for the Access / Books & Scrolls / Step-mode surfaces, which issue 676 rehomed
// out of the deleted RecipeContextRail into real tabs. These drive the whole editor
// (RecipeEditView), NOT the tab components directly: a tab prop that is not ALSO
// declared and forwarded by the wrapper silently drops to its default and the control
// never renders, which is invisible to a test that feeds the tab straight.
function contextProps(overrides = {}) {
  return {
    recipe: RECIPE,
    visibilityEffect: { showAccess: false, showBooksScrolls: true },
    accessPlayers: [],
    accessCharacters: [],
    recipeItemDefinitions: [],
    onOpenItem: () => {},
    ...overrides,
  };
}

// Click through to a tab. The gated tabs only exist under the matching visibility mode,
// so a missing button is a real failure rather than a selector typo.
async function openTab(target, tabId) {
  const button = target.querySelector(`[data-recipe-tab-button="${tabId}"]`);
  assert.ok(button, `the ${tabId} tab button renders`);
  button.click();
  await flushRender();
  return button;
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
// a single-option essence requirement GROUP (issue 649 — essence is a first-class
// ingredient match type). Requirements have no name field; a requirement is
// identified by its component image + name (or its tag chips).
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
    Object.freeze({
      id: 'grp-3',
      options: [
        Object.freeze({ quantity: 1, match: { type: 'essence', essenceId: 'ess-life', amount: 3 } }),
      ],
    }),
  ],
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

// Open a BARE row's single "or..." popover (bare rows keep the compact popover;
// multi-alternative boxes use explicit dashed buttons instead — see pickOrOption).
async function openOrMenu(target, groupId) {
  target.querySelector(`[data-recipe-group-id="${groupId}"] .manager-recipe-or-trigger`).click();
  await flushRender();
}

// Choose the add-affordance carrying the given data-recipe-add token, handling both
// shapes the requirement now takes (issue 643): a BARE single-alternative row keeps
// the compact "or..." popover (portaled out of the group, so its option resolves at
// document level, as pickPopoverOption does); a multi-alternative BOX renders the
// four explicit dashed add-buttons inline in its `.manager-recipe-requirement-adds`
// footer, clicked directly.
async function pickOrOption(target, groupId, addToken) {
  const group = target.querySelector(`[data-recipe-group-id="${groupId}"]`);
  const trigger = group.querySelector('.manager-recipe-or-trigger');
  if (trigger) {
    trigger.click();
    await flushRender();
    document.querySelector(`[data-recipe-add="${addToken}"]`).click();
  } else {
    group.querySelector(`.manager-recipe-requirement-adds [data-recipe-add="${addToken}"]`).click();
  }
  await flushRender();
}

describe('RecipeEditView (mounted)', () => {
  before(async () => {
    await editHarness.setup();
  });

  after(() => {
    editHarness.teardown();
  });

  // The strip is MODE-CONDITIONAL since issue 676: Access and Books & Scrolls appear
  // only under the visibility mode that gives them meaning, so the tab list is asserted
  // per mode rather than as one fixed five.
  it('renders the always-present editor tabs with Overview active by default', async () => {
    const target = await editHarness.mount(
      identityProps({ visibilityEffect: { showAccess: false, showBooksScrolls: false } })
    );
    const tabs = [...target.querySelectorAll('[data-recipe-tab-button]')].map(
      (btn) => btn.dataset.recipeTabButton
    );
    assert.deepEqual(
      tabs,
      ['overview', 'ingredients', 'results', 'tools', 'validation'],
      'a globally-visible system renders only the five unconditional tabs, in order'
    );
    assert.equal(
      target.querySelector('[role="tabpanel"]').getAttribute('id'),
      'recipe-panel-overview',
      'overview panel is shown first'
    );
    assert.ok(target.querySelector('[data-recipe-tab="overview"]'), 'overview tab content renders');
    editHarness.remount();
  });

  it('inserts the gated Access / Books & Scrolls tabs before Validation, per visibility mode', async () => {
    const knowledge = await editHarness.mount(
      identityProps({ visibilityEffect: { showAccess: false, showBooksScrolls: true } })
    );
    assert.deepEqual(
      [...knowledge.querySelectorAll('[data-recipe-tab-button]')].map((b) => b.dataset.recipeTabButton),
      ['overview', 'ingredients', 'results', 'tools', 'books-scrolls', 'validation'],
      'an item/knowledge system teaches through books, so Books & Scrolls joins the strip'
    );
    editHarness.remount();

    const restricted = await editHarness.mount(
      identityProps({ visibilityEffect: { showAccess: true, showBooksScrolls: false } })
    );
    assert.deepEqual(
      [...restricted.querySelectorAll('[data-recipe-tab-button]')].map((b) => b.dataset.recipeTabButton),
      ['overview', 'ingredients', 'results', 'tools', 'access', 'validation'],
      'a restricted system grants per recipe, so Access joins the strip'
    );
    editHarness.remount();
  });

  it('offers the recipe "Check tier" (DC-tier) dropdown to a routedByIngredients recipe (simple tiers)', async () => {
    // A routedByIngredients system now uses the shared simple pass/fail check, so the
    // root's `_craftingCheckMode` maps it to 'simple' and `resolveRecipeCheckTierOptions`
    // sources these tier options from `craftingCheck.simple.tiers`. The Overview tab
    // renders the "Check tier" dropdown whenever it receives those options.
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        onUpdateRecipe: (patch) => patches.push(patch),
        checkTierOptions: [
          { id: 'tier-easy', name: 'Easy', dc: 8 },
          { id: 'tier-hard', name: 'Hard', dc: 20 },
        ],
      })
    );
    const tierField = target.querySelector('[data-recipe-check-tier]');
    assert.ok(tierField, 'the Check tier dropdown renders for a RI recipe with simple tiers');
    const select = tierField.querySelector('[data-recipe-field="checkTierId"]');
    // Default option + the two simple tiers.
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    assert.deepEqual(values, ['', 'tier-easy', 'tier-hard']);
    // It is the DC-tier control, NOT the routedByCheck-only "Minimum success tier"
    // (minSuccessOutcomeId) control.
    assert.equal(
      target.querySelector('[data-recipe-field="minSuccessOutcomeId"]'),
      null,
      'routedByIngredients gets no minimum-success-tier control'
    );
    select.value = 'tier-hard';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushRender();
    assert.deepEqual(patches.at(-1), { checkTierId: 'tier-hard' }, 'selecting a tier stages checkTierId');
    editHarness.remount();
  });

  it('threads the "Minimum success tier" dropdown through RecipeEditView to the Overview tab', async () => {
    // Regression: the root derives minSuccessTierOptions for a routedByCheck+fixed
    // system, but RecipeEditView must FORWARD them to RecipeOverviewTab. When the
    // wrapper silently dropped the prop, the control never rendered even with the
    // check saved — this mounts through the wrapper so a missing forward fails here.
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        onUpdateRecipe: (patch) => patches.push(patch),
        minSuccessTierOptions: [
          { id: 'tier-b', name: 'b', start: 2 },
          { id: 'tier-c', name: 'c', start: 3 },
        ],
      })
    );
    const field = target.querySelector('[data-recipe-min-success-tier]');
    assert.ok(field, 'the Minimum success tier dropdown renders when the wrapper forwards the options');
    const select = field.querySelector('[data-recipe-field="minSuccessOutcomeId"]');
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    assert.deepEqual(values, ['', 'tier-b', 'tier-c'], 'default option + the two success tiers');
    select.value = 'tier-c';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushRender();
    assert.deepEqual(
      patches.at(-1),
      { minSuccessOutcomeId: 'tier-c' },
      'selecting a tier stages minSuccessOutcomeId'
    );
    editHarness.remount();
  });

  it('threads the per-recipe crafting-modifier override through RecipeEditView to the Overview tab (issue 770)', async () => {
    // The catalogue options + default policy are RecipeEditView wrapper props; a tab
    // prop the wrapper fails to forward silently drops to its default and never renders.
    // Mount THROUGH the wrapper so a missing forward fails here.
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, craftingModifier: { policy: 'byRecipe', modifierIds: ['med'] } },
        onUpdateRecipe: (patch) => patches.push(patch),
        craftingModifierOptions: [
          { id: 'med', label: 'Medicine' },
          { id: 'alch', label: 'Alchemy' },
        ],
        craftingModifierPolicyDefault: 'highest',
      })
    );
    const field = target.querySelector('[data-recipe-crafting-modifier]');
    assert.ok(field, 'the crafting-modifier override control renders when the wrapper forwards options');
    const select = field.querySelector('[data-recipe-field="craftingModifierPolicy"]');
    assert.equal(select.value, 'byRecipe', 'reflects the recipe override policy');
    assert.deepEqual(
      [...select.querySelectorAll('option')].map((o) => o.value),
      ['', 'addAll', 'highest', 'byRecipe']
    );
    // The per-modifier picker shows the catalogue as cancellable pills, with the
    // recipe's set already selected and the rest offered in the dropdown.
    const picker = target.querySelector('[data-recipe-crafting-modifier-picker]');
    assert.ok(picker, 'the eligible-modifier picker shows for an active override');
    assert.ok(picker.querySelector('[data-modifier-pill="med"]'), 'the selected modifier renders as a pill');
    assert.equal(picker.querySelector('[data-modifier-pill="alch"]'), null, 'an unselected modifier is not a pill');
    // Opening the menu and picking alch stages the combined set.
    picker.querySelector('[data-modifier-pill-menu-button]').click();
    await flushRender();
    picker.querySelector('[data-modifier-pill-option="alch"]').click();
    await flushRender();
    assert.deepEqual(patches.at(-1), {
      craftingModifier: { policy: 'byRecipe', modifierIds: ['med', 'alch'] },
    });
    // Removing the (only pre-selected) pill leaves a policy-only override. The control
    // is controlled, so each toggle acts on the original `['med']` prop.
    picker.querySelector('[data-modifier-pill-remove="med"]').click();
    await flushRender();
    assert.deepEqual(patches.at(-1), { craftingModifier: { policy: 'byRecipe' } });
    // Switching the policy select back to "inherit" clears the whole override.
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushRender();
    assert.deepEqual(patches.at(-1), { craftingModifier: null });
    editHarness.remount();
  });

  it('hides the crafting-modifier override when the system has no catalogue (issue 770)', async () => {
    const target = await editHarness.mount(identityProps({ craftingModifierOptions: [] }));
    assert.equal(
      target.querySelector('[data-recipe-crafting-modifier]'),
      null,
      'no catalogue → no override control'
    );
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

  it('disables the enable toggle when an OFF alchemy recipe carries an enable blocker (issue 549)', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          id: 'r-alch',
          name: 'Mana Potion',
          enabled: false,
          recipeItemId: '',
          ingredientSets: [{ id: 's1' }],
          resultGroups: [{ id: 'r1' }, { id: 'r2' }],
        },
        alchemy: { checkMode: 'simple' },
      })
    );
    const toggle = target.querySelector('[data-recipe-field="enabled"]');
    assert.ok(toggle, 'enable toggle renders');
    assert.equal(toggle.disabled, true, 'enable is disabled while a blocker is present, not throwing on click');
    editHarness.remount();
  });

  it('keeps the toggle usable for an already-ENABLED alchemy recipe with a blocker so it can be turned OFF (issue 549)', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          id: 'r-alch',
          name: 'Mana Potion',
          enabled: true,
          recipeItemId: '',
          ingredientSets: [{ id: 's1' }],
          resultGroups: [{ id: 'r1' }, { id: 'r2' }],
        },
        alchemy: { checkMode: 'simple' },
      })
    );
    const toggle = target.querySelector('[data-recipe-field="enabled"]');
    assert.equal(toggle.disabled, false, 'disabling stays free even while a blocker is present');
    editHarness.remount();
  });

  it('re-enables the toggle once the alchemy blockers clear (issue 549)', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          id: 'r-alch',
          name: 'Mana Potion',
          enabled: false,
          recipeItemId: '',
          ingredientSets: [{ id: 's1' }],
          resultGroups: [{ id: 'r1' }],
        },
        alchemy: { checkMode: 'simple' },
        signatureConflicts: [],
      })
    );
    const toggle = target.querySelector('[data-recipe-field="enabled"]');
    assert.equal(toggle.disabled, false, 'a ready alchemy recipe can be enabled');
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

  // Regression: a set first authored in Simple mode used to be materialized
  // without an id, so its routing-picker option carried id `undefined` and the
  // assign guard silently dropped it — the first ingredient set was unselectable
  // in the Results tab. The Simple-set write-back now mints a stable id.
  it('ingredient mode: the first set authored in Simple mode gets a stable id (routable)', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, ingredientSets: [] },
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();

    // Author the (id-less placeholder) first set with any requirement.
    target.querySelector('[data-recipe-add="tag-requirement"]').click();
    await flushRender();

    const patch = patches.at(-1);
    assert.ok(patch.ingredientSets, 'the first edit materializes the ingredient sets');
    const id = patch.ingredientSets[0]?.id;
    assert.equal(typeof id, 'string', 'the materialized first set carries an id');
    assert.ok(id.length > 0, 'the id is non-empty so routing can bind it');
    editHarness.remount();
  });

  // Regression twin: a result group first authored in Simple mode used to be
  // materialized id-less, which would block ALL ingredient-set routing to it via
  // the `(assigned && !groupId)` guard. The Simple-group write-back now mints an id.
  it('a result group authored in Simple mode gets a stable id (routable target)', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        componentOptions: COMPONENT_OPTIONS,
        recipe: { ...RECIPE, resultGroups: [] },
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'results');
    await flushRender();

    // Author the (id-less placeholder) first group by adding a result item.
    await pickPopoverOption(target, '[data-recipe-add="result-item"]', /Mountain Herb/);

    const patch = patches.at(-1);
    assert.ok(patch.resultGroups, 'the first edit materializes the result groups');
    const id = patch.resultGroups[0]?.id;
    assert.equal(typeof id, 'string', 'the materialized first group carries an id');
    assert.ok(id.length > 0, 'the id is non-empty so routing can target it');
    editHarness.remount();
  });

  it('alchemy Simple: two labeled result sets, reserved failure set undeletable, no Add result set (issue 554)', async () => {
    const target = await editHarness.mount(
      identityProps({
        alchemySimple: true,
        complex: false,
        componentOptions: COMPONENT_OPTIONS,
        recipe: {
          ...RECIPE,
          resultGroups: [
            { id: 'rg-ok', name: 'On success', results: [{ componentId: 'cmp-herb', quantity: 1 }] },
          ],
        },
        onUpdateRecipe: () => {},
      })
    );
    clickTab(target, 'results');
    await flushRender();

    const view = target.querySelector('[data-recipe-result-alchemy-simple]');
    assert.ok(view, 'the alchemy Simple two-slot view renders');

    // Exactly two result-set cards, each with a STATIC label (no free-text name input).
    const cards = view.querySelectorAll('[data-recipe-set]');
    assert.equal(cards.length, 2, 'exactly two result sets (success + reserved failure)');
    const labels = [...view.querySelectorAll('[data-recipe-result-set-static-label]')].map((node) =>
      node.textContent.trim()
    );
    assert.ok(
      labels.some((label) => label.includes('On success')),
      'the success set shows a static "On success" label'
    );
    assert.ok(
      labels.some((label) => label.includes('On a failed check')),
      'the reserved failure set shows a static "On a failed check" label'
    );
    assert.equal(
      view.querySelector('[data-recipe-result-set-field="name"]'),
      null,
      'no free-text result-set name input in the alchemy Simple view'
    );

    // Neither set is removable, and there is no "Add result set" affordance.
    assert.equal(
      view.querySelector('[data-recipe-remove="result-set"]'),
      null,
      'the reserved failure set (and the success set) cannot be removed'
    );
    assert.equal(
      target.querySelector('[data-recipe-add="result-set"]'),
      null,
      'the "Add result set" button is suppressed in the alchemy Simple view'
    );
    editHarness.remount();
  });

  it('simple-with-check: the same two-slot result editor renders (success + reserved failure)', async () => {
    const target = await editHarness.mount(
      identityProps({
        simpleFailureSlot: true,
        complex: false,
        componentOptions: COMPONENT_OPTIONS,
        recipe: {
          ...RECIPE,
          resultGroups: [{ id: 'rg-ok', results: [{ componentId: 'cmp-herb', quantity: 1 }] }],
        },
        onUpdateRecipe: () => {},
      })
    );
    clickTab(target, 'results');
    await flushRender();

    const view = target.querySelector('[data-recipe-result-alchemy-simple]');
    assert.ok(view, 'a simple system with a check gets the two-slot success/failure editor');
    assert.equal(
      view.querySelectorAll('[data-recipe-set]').length,
      2,
      'exactly two result sets (success + reserved failure)'
    );
    assert.equal(
      target.querySelector('[data-recipe-add="result-set"]'),
      null,
      'no "Add result set" in the two-slot view'
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

  it('check mode: empty routing hint distinguishes no tiers from no success tiers', async () => {
    const groups = [{ id: 'grp-a', name: 'Group A', checkOutcomeIds: [], results: [] }];

    // No tiers authored at all → "define tiers first".
    const noTiers = await mountResultGroups(groups, {
      props: { routingProvider: 'check', routedOutcomeTierOptions: [], routedOutcomeTiersDefined: false },
    });
    assert.match(
      noTiers.target.querySelector('[data-recipe-routing-assignment] .manager-recipe-routing-assignment-empty').textContent,
      /Define outcome tiers/,
      'with no tiers defined, the hint asks to define tiers'
    );
    editHarness.remount();

    // Tiers exist but none is a Success → success-filtered options empty, distinct hint.
    const noSuccess = await mountResultGroups(groups, {
      props: { routingProvider: 'check', routedOutcomeTierOptions: [], routedOutcomeTiersDefined: true },
    });
    assert.match(
      noSuccess.target.querySelector('[data-recipe-routing-assignment] .manager-recipe-routing-assignment-empty').textContent,
      /marked as a Success/,
      'with failure-only tiers, the hint points to marking a tier as Success'
    );
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
      'no editable ingredient-set name input in check mode'
    );
    // The set still shows a read-only DEFAULT name (not the stored 'Alpha').
    const readonlyName = checkTarget.querySelector('[data-recipe-set-default-name]');
    assert.ok(readonlyName, 'check mode shows the read-only default name');
    assert.equal(readonlyName.textContent.trim(), 'Set 1');
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
    const nameInput = ingredientTarget.querySelector('[data-recipe-set-field="name"]');
    assert.ok(nameInput, 'ingredient-set name shown in ingredient mode');
    assert.equal(nameInput.value, 'Alpha', 'shows the explicit name');
    editHarness.remount();
  });

  it('shows the default set name in the editable field when a set is unnamed', async () => {
    const target = await editHarness.mount(
      identityProps({
        complex: true,
        componentOptions: COMPONENT_OPTIONS,
        routingProvider: 'ingredientSet',
        recipe: {
          ...RECIPE,
          complex: true,
          ingredientSets: [
            { id: 'iset-1', name: '', ingredientGroups: [] },
            { id: 'iset-2', name: '', ingredientGroups: [] },
          ],
        },
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    const names = [...target.querySelectorAll('[data-recipe-set-field="name"]')].map(
      (i) => i.value
    );
    assert.deepEqual(
      names,
      ['Set 1', 'Set 2'],
      'unnamed sets show their default name, not a blank field'
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

  it('renders always-visible inline Duration steppers on the Overview tab whose edits emit onUpdateRecipe({ timeRequirement })', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    const durationSection = target.querySelector('[data-recipe-section="duration"]');
    assert.ok(durationSection, 'the single-step Overview shows the Duration section');
    // The steppers are ALWAYS visible now (no popover trigger) — the tab is no longer
    // the sole path behind a click (issue 643 §10).
    assert.ok(durationSection.querySelector('[data-recipe-duration-steppers]'), 'inline duration steppers render');
    assert.equal(
      durationSection.querySelector('[data-recipe-duration-trigger]'),
      null,
      'the single-step Duration card no longer routes through a popover trigger'
    );
    // Each unit is the shared Stepper: the PRIMARY control is a real, typeable number
    // input; the chevron buttons are adjuncts. A click-only stepper would be a keyboard
    // regression.
    const daysInput = durationSection.querySelector(
      '[data-recipe-duration-unit="days"] [data-stepper-input]'
    );
    assert.ok(daysInput, 'the duration editor exposes a typeable days input');
    assert.equal(daysInput.getAttribute('type'), 'number', 'it is a real number input');
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

  it('re-seeds the Overview Duration steppers from the recipe on tab switch away and back (issue 845)', async () => {
    // The staging-editor re-seed contract: leaving the Overview tab UNMOUNTS it, and
    // returning REMOUNTS it. The Duration steppers must seed from the recipe's
    // timeRequirement on EVERY mount rather than falling back to their default ("Instant"),
    // so a GM who authored a duration and navigated away still sees it on return. (The
    // upstream cause was the store dropping timeRequirement from the projected recipe; this
    // pins the tab-wiring half — the value must thread through RecipeEditView and be read on
    // mount, not captured once.)
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          ...RECIPE,
          timeRequirement: { minutes: 0, hours: 2, days: 3, months: 0, years: 0 },
        },
      })
    );

    const readUnit = (unit) =>
      target.querySelector(
        `[data-recipe-section="duration"] [data-recipe-duration-unit="${unit}"] [data-stepper-input]`
      )?.value;

    assert.equal(readUnit('days'), '3', 'the days stepper seeds from the authored duration');
    assert.equal(readUnit('hours'), '2', 'the hours stepper seeds from the authored duration');

    // Leave Overview (unmount the tab) and come back (remount it).
    clickTab(target, 'ingredients');
    await flushRender();
    assert.equal(
      target.querySelector('[data-recipe-section="duration"]'),
      null,
      'the Duration section is gone while another tab is active (the tab genuinely unmounts)'
    );

    clickTab(target, 'overview');
    await flushRender();

    assert.equal(
      readUnit('days'),
      '3',
      'the days stepper still shows the authored value after returning — not reset to Instant/zero'
    );
    assert.equal(
      readUnit('hours'),
      '2',
      'the hours stepper still shows the authored value after returning'
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
    const hoursInput = target.querySelector(
      '[data-recipe-section="duration"] [data-recipe-duration-unit="hours"] [data-stepper-input]'
    );
    assert.equal(hoursInput.value, '5', 'the hours stepper reflects the set duration');
    // The Stepper ignores a partially-typed empty field mid-keystroke, so a zeroing
    // edit is typed as '0' and commits on input.
    hoursInput.value = '0';
    hoursInput.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    assert.equal(patches.length, 1, 'zeroing the only unit emits a patch');
    assert.deepEqual(patches[0], { timeRequirement: null }, 'an all-zero duration clears to null');
    editHarness.remount();
  });

  it('hides the single-step Duration card when time requirements are disabled (issue 714)', async () => {
    const target = await editHarness.mount(
      identityProps({ timeRequirementsEnabled: false })
    );
    assert.equal(
      target.querySelector('[data-recipe-section="duration"]'),
      null,
      'the single-step Duration card is gated off when the system time toggle is off'
    );
    editHarness.remount();
  });

  it('shows the single-step Duration card when time requirements are enabled (issue 714)', async () => {
    const target = await editHarness.mount(
      identityProps({ timeRequirementsEnabled: true })
    );
    assert.ok(
      target.querySelector('[data-recipe-section="duration"]'),
      'the single-step Duration card renders when the system time toggle is on'
    );
    editHarness.remount();
  });

  it('hides the per-step duration editor through RecipeEditView when time requirements are disabled (issue 714)', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, steps: STEPS },
        multiStepEnabled: true,
        timeRequirementsEnabled: false,
      })
    );
    assert.ok(
      target.querySelector('[data-recipe-section="steps"]'),
      'the multi-step Steps card renders'
    );
    assert.equal(
      target.querySelector('[data-recipe-duration-trigger]'),
      null,
      'the inline per-step duration editor is gated off'
    );
    assert.ok(
      target.querySelector('[data-recipe-step-time]'),
      'the read-only step duration chip still surfaces the authored value'
    );
    editHarness.remount();
  });

  it('shows the per-step duration editor through RecipeEditView when time requirements are enabled (issue 714)', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, steps: STEPS },
        multiStepEnabled: true,
        timeRequirementsEnabled: true,
      })
    );
    assert.ok(
      target.querySelector('[data-recipe-duration-trigger]'),
      'the inline per-step duration editor renders when time requirements are on'
    );
    editHarness.remount();
  });

  it('increments a duration unit via the up stepper chevron', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({ onUpdateRecipe: (patch) => patches.push(patch) })
    );
    const upDays = target.querySelector(
      '[data-recipe-section="duration"] [data-recipe-duration-unit="days"] [data-stepper-increment]'
    );
    assert.ok(upDays, 'each unit exposes an increment adjunct');
    upDays.click();
    assert.deepEqual(
      patches.at(-1),
      { timeRequirement: { minutes: 0, hours: 0, days: 1, months: 0, years: 0 } },
      'the up stepper increments the unit by one'
    );
    editHarness.remount();
  });

  it('clamps a duration unit at zero and never commits a negative', async () => {
    // The decrement adjunct is disabled at the Stepper's `min`, so the hand-rolled
    // "clamp at 0" arithmetic the old editor carried is now the primitive's job — and
    // this is the test that keeps it honest.
    const patches = [];
    const target = await editHarness.mount(
      identityProps({ onUpdateRecipe: (patch) => patches.push(patch) })
    );
    const downHours = target.querySelector(
      '[data-recipe-section="duration"] [data-recipe-duration-unit="hours"] [data-stepper-decrement]'
    );
    assert.equal(downHours.disabled, true, 'the decrement adjunct is disabled at zero');
    downHours.click();
    assert.equal(patches.length, 0, 'a zero unit cannot be decremented below zero');
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

  it('keeps the image editable and independent of the recipe item even when recipeItemId is set', async () => {
    // A recipe can belong to many books & scrolls, so its image no longer mirrors or
    // locks to a linked recipe item (issue 643): the editable picker always renders and
    // shows the recipe's OWN img, never a linked item image.
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, recipeItemId: 'ri1', img: 'icons/consumables/potions/potion-tube-corked-red.webp' },
        onPickImagePath: async () => 'icons/should-not-be-used.webp',
      })
    );
    assert.equal(
      target.querySelector('[data-recipe-item-locked-image]'),
      null,
      'no locked-image span when a recipe item is linked'
    );
    const button = target.querySelector('button[data-recipe-field="img"]');
    assert.ok(button, 'the editable picker button renders even when linked');
    assert.ok(button.querySelector('.fa-pen'), 'shows the edit (pen) affordance, not a lock');
    assert.ok(
      button.querySelector('img').getAttribute('src').includes('potion-tube-corked-red'),
      "shows the recipe's own image, not a linked recipe item image"
    );
    editHarness.remount();
  });

  it('resolves the generic item-bag icon to the alchemical blueprint default', async () => {
    // A recipe that never got a real icon carries Foundry's generic item-bag; the picker
    // resolves that to the blueprint default rather than showing the bag (issue 643).
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, img: 'icons/svg/item-bag.svg' },
        onPickImagePath: async () => '',
      })
    );
    const src = target.querySelector('button[data-recipe-field="img"] img').getAttribute('src');
    assert.ok(src.includes('blueprint-recipe-alchemical'), 'the bag resolves to the alchemical blueprint');
    assert.equal(src.includes('item-bag'), false, 'the generic bag is not shown');
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
    // An empty recipe in a multi-set-capable mode: complexity is emergent, so the
    // single (empty) ingredient set renders chromeless with the "Add ingredient set"
    // promotion affordance below it, and the single result group renders chromeless.
    const target = await editHarness.mount(
      identityProps({ canAddSet: true, toolsLibrary: TOOLS_LIBRARY })
    );

    clickTab(target, 'ingredients');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-section="ingredients"]'),
      'ingredients section renders'
    );
    assert.ok(
      target.querySelector('.manager-recipe-ingredient-set.is-chromeless'),
      'the single set renders chromeless (no Set 1 box)'
    );
    assert.ok(
      target.querySelector('[data-recipe-add="ingredient-set"]'),
      'the Add ingredient set promotion button shows where the mode allows it'
    );

    clickTab(target, 'results');
    await flushRender();
    assert.ok(target.querySelector('[data-recipe-section="results"]'), 'results section renders');
    assert.ok(
      target.querySelector('[data-recipe-result-simple]'),
      'the single result group renders chromeless'
    );

    clickTab(target, 'tools');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-section="tools"]'),
      'tools section renders on the Tools tab'
    );
    assert.match(target.textContent, /No tools required/, 'tools empty panel shown');
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

  it('shows full multi-set scaffolding once a recipe holds more than one set/group', async () => {
    // Emergent complexity: chrome + add-affordances appear because the recipe already
    // holds multiple sets/groups, not because of any stored Complex flag.
    const target = await editHarness.mount(
      identityProps({
        canAddSet: true,
        recipe: {
          ...RECIPE,
          ingredientSets: [
            { id: 'set-1', name: 'Alpha', ingredientGroups: [] },
            { id: 'set-2', name: 'Beta', ingredientGroups: [] },
          ],
          resultGroups: [
            { id: 'grp-1', name: 'Primary', results: [] },
            { id: 'grp-2', name: 'Bonus', results: [] },
          ],
        },
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    const setOr = target.querySelector('.manager-recipe-ingredient-set-or');
    assert.ok(setOr, 'multiple sets get the OR chrome');
    // The between-set OR now wraps its label in a pill span, like the within-requirement
    // OR, so both read as "[ — OR — ]" flanked breaks (issue 643).
    assert.equal(
      setOr.querySelector('span')?.textContent.trim(),
      'OR',
      'the set OR label sits in a pill span'
    );
    assert.ok(
      target.querySelector('[data-recipe-add="ingredient-set"]'),
      'Add ingredient set button shown for a multi-set recipe'
    );

    clickTab(target, 'results');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-add="result-set"]'),
      'Add result set button shown for a multi-group recipe'
    );
    editHarness.remount();
  });

  it('appends an ingredient set via onUpdateRecipe when + Add ingredient set is clicked', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        canAddSet: true,
        recipe: { ...RECIPE, ingredientSets: [{ id: 'set-1' }] },
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    target.querySelector('[data-recipe-add="ingredient-set"]').click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    assert.equal(patches[0].ingredientSets.length, 2, 'the ingredient set array grew by one');
    assert.ok(
      patches[0].ingredientSets[1].id,
      'the appended set carries an eager id (assigned at add time)'
    );
    editHarness.remount();
  });

  it('duplicates an ingredient set (new ids, routing stripped, inserted after the original) via onUpdateRecipe', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        complex: true,
        recipe: {
          ...RECIPE,
          complex: true,
          // A routed-by-ingredient set already assigned to a result group, with a
          // nested group whose id must NOT be carried onto the copy.
          ingredientSets: [
            {
              id: 'set-1',
              name: 'Primary',
              resultGroupId: 'grp-out',
              resultMapping: [{ from: 'a', to: 'b' }],
              ingredientGroups: [
                { id: 'grp-1', options: [{ quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } }] },
              ],
            },
            { id: 'set-2', name: 'Secondary', ingredientGroups: [] },
          ],
        },
        componentOptions: COMPONENT_OPTIONS,
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'ingredients');
    await flushRender();
    // Duplicate the FIRST set (its card carries data-recipe-set-id="set-1").
    target
      .querySelector('[data-recipe-set-id="set-1"] [data-recipe-duplicate="ingredient-set"]')
      .click();
    assert.equal(patches.length, 1, 'onUpdateRecipe invoked once');
    const nextSets = patches[0].ingredientSets;
    assert.equal(nextSets.length, 3, 'the ingredient set array grew by one');
    // The copy is inserted right after its original, before the other set.
    assert.deepEqual(
      nextSets.map((s) => s.id !== undefined),
      [true, true, true],
      'every set carries an id'
    );
    assert.equal(nextSets[0].id, 'set-1', 'the original set is untouched at its position');
    assert.equal(nextSets[2].id, 'set-2', 'the unrelated set stays last');
    const copy = nextSets[1];
    assert.ok(copy.id && copy.id !== 'set-1', 'the copy gets a fresh set id');
    assert.equal(copy.name, 'Primary (Copy)', 'the copy name is suffixed for clarity');
    assert.equal(copy.resultGroupId, null, 'the copy drops the result-group routing assignment');
    assert.deepEqual(copy.resultMapping, [], 'the copy drops the result mapping');
    assert.ok(copy.ingredientGroups[0].id && copy.ingredientGroups[0].id !== 'grp-1', 'nested group ids are re-minted');
    assert.deepEqual(
      copy.ingredientGroups[0].options,
      [{ quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } }],
      'the requirement content is carried verbatim'
    );
    // The deep clone shares no references with the original group.
    assert.notEqual(copy.ingredientGroups[0], nextSets[0].ingredientGroups[0], 'the copy is a deep clone, not a shared reference');
    editHarness.remount();
  });

  it('appends a result set via onUpdateRecipe({ resultGroups }) when + Add result set is clicked', async () => {
    const patches = [];
    // A routed system keeps chrome (and its Add result set button) even for a single
    // group, because routed result groups carry a per-group routing head.
    const target = await editHarness.mount(
      identityProps({
        routingProvider: 'ingredientSet',
        recipe: {
          ...RECIPE,
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
    assert.ok(
      patches[0].resultGroups[1].id,
      'the appended group carries an eager id (so it is immediately routable)'
    );
    editHarness.remount();
  });

  // Progressive systems award a recipe's results in order, so the Results tab grows
  // a drag handle on each result row. A progressive recipe holds a single result
  // group (multi-set is forbidden), rendered chromeless. `progressive` is threaded
  // from the system resolution mode through the editor shell to the group card.
  function mountProgressiveResults(results, { progressive = true, props = {} } = {}) {
    const patches = [];
    return editHarness
      .mount(
        identityProps({
          complex: false,
          progressive,
          componentOptions: COMPONENT_OPTIONS,
          recipe: {
            ...RECIPE,
            complex: false,
            resultGroups: [{ id: 'grp-1', name: '', results }],
          },
          onUpdateRecipe: (patch) => patches.push(patch),
          ...props,
        })
      )
      .then(async (target) => {
        clickTab(target, 'results');
        await flushRender();
        return { target, patches };
      });
  }

  // Fire a native drag lifecycle event (the handlers read no dataTransfer, so a
  // plain bubbling Event suffices).
  function fireDrag(node, type) {
    node.dispatchEvent(
      new globalThis.window.Event(type, { bubbles: true, cancelable: true })
    );
  }

  // Issue 676: grip and order are SIBLINGS, matching the progressive salvage stage row.
  // The order used to be stacked INSIDE the grip handle, which read as a decorated grip
  // rather than as the stage number the award loop spends down.
  it('progressive: result rows render a grip and a separate order badge', async () => {
    const { target } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
      { id: 'res-2', componentId: 'cmp-water', quantity: 1 },
    ]);
    const rows = target.querySelectorAll('[data-recipe-result-row]');
    assert.equal(rows.length, 2, 'both result rows render reorderable wrappers');
    rows.forEach((row, index) => {
      const grip = row.querySelector('.manager-recipe-stage-grip');
      assert.ok(grip, `row ${index} renders the grip`);
      assert.equal(row.getAttribute('draggable'), 'true', `row ${index} card is the drag source`);
      assert.ok(grip.querySelector('.fa-grip-vertical'), `row ${index} renders the grip icon`);
      const ordinal = row.querySelector('.manager-recipe-stage-ordinal');
      assert.ok(ordinal, `row ${index} renders a separate order badge`);
      assert.equal(
        ordinal.getAttribute('data-recipe-result-ordinal'),
        String(index + 1),
        `row ${index} renders its 1-based order`
      );
      assert.equal(
        grip.querySelector('.manager-recipe-stage-ordinal'),
        null,
        `row ${index} does not nest the order inside the grip`
      );
    });
    editHarness.remount();
  });

  it('progressive: dragging a result onto another reorders the group via onUpdateRecipe', async () => {
    const { target, patches } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
      { id: 'res-2', componentId: 'cmp-water', quantity: 1 },
    ]);
    const rows = target.querySelectorAll('[data-recipe-result-row]');
    // Drag row 0 (the whole card is the source) and drop it onto row 1.
    fireDrag(rows[0], 'dragstart');
    fireDrag(rows[1], 'drop');
    await flushRender();
    assert.equal(patches.length, 1, 'the reorder emits exactly one recipe patch');
    assert.deepEqual(
      patches.at(-1).resultGroups[0].results.map((r) => r.componentId),
      ['cmp-water', 'cmp-herb'],
      'the dragged result moves after its drop target'
    );
    assert.equal(
      patches.at(-1).resultGroups[0].id,
      'grp-1',
      'the group id survives the reorder'
    );
    editHarness.remount();
  });

  it('non-progressive: result rows render no drag handle', async () => {
    const { target } = await mountProgressiveResults(
      [
        { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
        { id: 'res-2', componentId: 'cmp-water', quantity: 1 },
      ],
      { progressive: false }
    );
    assert.equal(
      target.querySelector('[data-recipe-result-row]'),
      null,
      'no reorderable wrapper outside progressive mode'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="results"] .manager-recipe-stage-grip'),
      null,
      'no drag handle on result rows outside progressive mode'
    );
    // The result rows themselves still render, just without the handle chrome.
    assert.equal(
      target.querySelectorAll('[data-recipe-result-item]').length,
      2,
      'both result item rows still render'
    );
    editHarness.remount();
  });

  it('progressive: re-adding a component appends a duplicate quantity-less entry (no merge)', async () => {
    const { target, patches } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
    ]);
    // Re-pick the component the group already holds.
    await pickPopoverOption(
      target,
      '[data-recipe-result-set-id="grp-1"] .manager-recipe-add-component-trigger',
      /Mountain Herb/
    );
    assert.equal(patches.length, 1, 'adding the duplicate patches the recipe once');
    const results = patches.at(-1).resultGroups[0].results;
    assert.equal(results.length, 2, 'the duplicate is appended as a second entry, not merged');
    assert.deepEqual(
      results.map((r) => r.componentId),
      ['cmp-herb', 'cmp-herb'],
      'both ordered entries reference the same component'
    );
    assert.equal(
      results[0].quantity,
      1,
      'the existing entry is untouched (no quantity bump)'
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(results[1], 'quantity'),
      false,
      'the appended progressive entry carries no quantity'
    );
    assert.ok(results[1].id, 'the appended entry carries an eager id');
    editHarness.remount();
  });

  it('progressive: result rows render no quantity input', async () => {
    const { target } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
      { id: 'res-2', componentId: 'cmp-water', quantity: 1 },
    ]);
    assert.equal(
      target.querySelector('[data-recipe-section="results"] [data-recipe-option-quantity]'),
      null,
      'progressive result rows hide the quantity field'
    );
    // Sanity: the same rows DO expose a quantity field outside progressive mode.
    const nonProgressive = await mountProgressiveResults(
      [{ id: 'res-1', componentId: 'cmp-herb', quantity: 1 }],
      { progressive: false }
    );
    assert.ok(
      nonProgressive.target.querySelector(
        '[data-recipe-section="results"] [data-recipe-option-quantity]'
      ),
      'non-progressive result rows still render the quantity field'
    );
    editHarness.remount();
  });

  // Reorder was DRAG-ONLY: an aria-hidden grip on a draggable div, with an
  // a11y_no_static_element_interactions suppression and NO keyboard path at all. Order
  // is load-bearing in progressive mode (the award loop spends the check budget down the
  // list), so that was a live accessibility hole. These are real buttons (issue 643 §6).
  it('progressive: result rows expose keyboard move buttons, disabled at the ends', async () => {
    const { target } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
      { id: 'res-2', componentId: 'cmp-water', quantity: 1 },
    ]);
    const rows = target.querySelectorAll('[data-recipe-result-row]');
    const firstUp = rows[0].querySelector('[data-recipe-result-move-up]');
    const firstDown = rows[0].querySelector('[data-recipe-result-move-down]');
    const lastUp = rows[1].querySelector('[data-recipe-result-move-up]');
    const lastDown = rows[1].querySelector('[data-recipe-result-move-down]');

    assert.ok(firstUp && firstDown && lastUp && lastDown, 'both rows expose move buttons');
    assert.equal(firstUp.disabled, true, 'the first row cannot move up');
    assert.equal(firstDown.disabled, false, 'the first row can move down');
    assert.equal(lastUp.disabled, false, 'the last row can move up');
    assert.equal(lastDown.disabled, true, 'the last row cannot move down');

    // The accessible name NAMES the row, so a screen-reader user knows what moves.
    assert.match(
      firstDown.getAttribute('aria-label'),
      /Move down .* Mountain Herb/,
      'the move button names the result it moves'
    );

    // Layout (issue 643): the reorder controls sit to the RIGHT of the component's DC —
    // inside the row's controls cluster, after the difficulty badge and before the remove
    // control — not as a separate column on the left.
    const row = rows[0];
    const dc = row.querySelector('[data-recipe-result-difficulty]');
    const move = row.querySelector('[data-recipe-result-move]');
    const remove = row.querySelector('[data-recipe-remove="result-item"]');
    assert.ok(move.closest('.manager-recipe-option-controls'), 'reorder lives in the row controls, right of the component');
    assert.ok(
      dc.compareDocumentPosition(move) & Node.DOCUMENT_POSITION_FOLLOWING,
      'reorder follows the difficulty badge'
    );
    assert.ok(
      move.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the remove control follows the reorder controls'
    );
    editHarness.remount();
  });

  it('progressive: a keyboard move reorders the group and announces the new position', async () => {
    const { target, patches } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
      { id: 'res-2', componentId: 'cmp-water', quantity: 1 },
    ]);
    const rows = target.querySelectorAll('[data-recipe-result-row]');
    rows[1].querySelector('[data-recipe-result-move-up]').click();
    await flushRender();

    assert.deepEqual(
      patches.at(-1).resultGroups[0].results.map((result) => result.id),
      ['res-2', 'res-1'],
      'moving the second row up reorders the group'
    );
    const status = target.querySelector('[data-recipe-result-order-status]');
    assert.equal(status.getAttribute('aria-live'), 'polite', 'the change is announced politely');
    assert.match(status.textContent, /Pure Water moved to position 1 of 2/, 'and it names the move');
    editHarness.remount();
  });

  it('non-progressive: result rows expose no move buttons', async () => {
    const { target } = await mountProgressiveResults(
      [
        { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
        { id: 'res-2', componentId: 'cmp-water', quantity: 1 },
      ],
      { progressive: false }
    );
    assert.equal(
      target.querySelector('[data-recipe-result-move]'),
      null,
      'only progressive results are ordered, so only they get move controls'
    );
    editHarness.remount();
  });

  // ── Reorder-permission toggle card (issue 651) ────────────────────────────
  //
  // These mount RecipeEditView (the WRAPPER), not RecipeResultsTab. A prop that is
  // declared on the tab but never forwarded by the wrapper silently drops to its
  // default and the control never renders — a test that mounts the tab directly
  // bypasses the wrapper and cannot see that.

  const reorderCard = (target) =>
    target.querySelector('[data-recipe-section="allow-player-result-reorder"]');

  it('progressive: the Results tab renders the reorder-permission card, on by default', async () => {
    const { target } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
    ]);
    const card = reorderCard(target);
    assert.ok(card, 'the card renders through the wrapper');
    assert.ok(card.classList.contains('is-info'), 'it wears the info variant');
    assert.ok(card.classList.contains('is-on'), 'an unset recipe reads default-true');
    assert.equal(
      card.querySelector('[data-recipe-field="allowPlayerResultReorder"]').getAttribute('aria-pressed'),
      'true'
    );
    editHarness.remount();
  });

  it('progressive: the reorder card is placed ABOVE the result sets, under the info strip', async () => {
    // Issue 676: matching the progressive SALVAGE editor, which fixed this first. Both
    // the strip and the card describe what the ORDER MEANS, and the order is the thing
    // authored below — at the bottom the GM read the policy governing the list only
    // after they had finished writing it. Reading order: strip ("how this list is
    // spent") → card ("who may reorder it") → list.
    const { target } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
    ]);
    const strip = target.querySelector('[data-recipe-info-strip]');
    const results = target.querySelector('[data-recipe-section="results"]');
    const card = reorderCard(target);
    assert.ok(strip && results && card);
    assert.ok(
      strip.compareDocumentPosition(card) & globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'the reorder card follows the info strip'
    );
    assert.ok(
      card.compareDocumentPosition(results) & globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'the result sets follow the card — the policy is stated before the list it governs'
    );
    editHarness.remount();
  });

  it('progressive: an authored FALSE renders the card off', async () => {
    // A `false` fixture is the only one that can fail: a `true` fixture reads green
    // through a dropped projection/prop, because the default re-supplies true.
    const { target } = await mountProgressiveResults(
      [{ id: 'res-1', componentId: 'cmp-herb', quantity: 1 }],
      { props: { recipe: { ...RECIPE, complex: false, allowPlayerResultReorder: false, resultGroups: [{ id: 'grp-1', name: '', results: [{ id: 'res-1', componentId: 'cmp-herb', quantity: 1 }] }] } } }
    );
    const card = reorderCard(target);
    assert.ok(card.classList.contains('is-off'), 'an authored false renders off');
    assert.equal(
      card.querySelector('[data-recipe-field="allowPlayerResultReorder"]').getAttribute('aria-pressed'),
      'false'
    );
    editHarness.remount();
  });

  it('progressive: toggling the card stages allowPlayerResultReorder through onUpdateRecipe', async () => {
    // Mutation this catches: remove `onToggleAllowPlayerResultReorder` from the
    // wrapper's forward in its `activeTab === 'results'` block.
    const { target, patches } = await mountProgressiveResults([
      { id: 'res-1', componentId: 'cmp-herb', quantity: 1 },
    ]);
    reorderCard(target).querySelector('[data-recipe-field="allowPlayerResultReorder"]').click();
    await flushRender();
    assert.deepEqual(
      patches.at(-1),
      { allowPlayerResultReorder: false },
      'the wrapper stages the toggle through the draft'
    );
    editHarness.remount();
  });

  it('non-progressive: no reorder-permission card renders', async () => {
    const { target } = await mountProgressiveResults(
      [{ id: 'res-1', componentId: 'cmp-herb', quantity: 1 }],
      { progressive: false }
    );
    assert.equal(reorderCard(target), null, 'only progressive recipes spend a roll down a list');
    editHarness.remount();
  });

  // `component.difficulty` is consumed by progressive recipes, progressive salvage,
  // progressive gathering AND the system-validation blocker. An inline stepper here
  // would either write cross-aggregate immediately (bypassing both dirty guards) or make
  // "Save recipe" silently persist a *Component* change — so it is a READ-ONLY badge
  // with a deep-link to the component editor's Difficulty card.
  // Issue 676: `DC n` as a read-only FACT, plus a SEPARATE "Edit ↗" link — the shape the
  // progressive salvage stage row already had. It was a "DIFFICULTY" micro-label over one
  // combined `Difficulty 12 ↗` chip, which made the fact look like the control.
  it('progressive: renders a READ-ONLY DC and a separate Edit link to the component editor', async () => {
    const opened = [];
    const { target } = await mountProgressiveResults(
      [{ id: 'res-1', componentId: 'cmp-herb', quantity: 1 }],
      {
        props: {
          componentOptions: [
            { id: 'cmp-herb', name: 'Mountain Herb', img: 'icons/herb.webp', difficulty: 12 },
          ],
          onOpenComponent: (id) => opened.push(id),
        },
      }
    );
    const dc = target.querySelector('[data-recipe-result-difficulty]');
    assert.ok(dc, 'the DC renders');
    assert.equal(dc.getAttribute('data-recipe-result-difficulty'), '12', 'it shows the value');
    assert.match(dc.textContent, /DC 12/, 'and reads it out as a DC, like the salvage stage row');
    // The DC is a read-only FACT: not a control at all, and carrying no editor.
    assert.equal(dc.tagName, 'SPAN', 'the DC is not a button');
    assert.equal(dc.querySelector('input'), null, 'the DC carries no editable control');
    // The micro-label is gone: the DC says what it is.
    assert.equal(
      target.querySelector('.manager-recipe-difficulty-label'),
      null,
      'no DIFFICULTY micro-label — the salvage row has none'
    );
    // Editing is a SEPARATE link, and it is the only route to the value.
    const edit = target.querySelector('[data-recipe-result-edit]');
    assert.ok(edit, 'a separate Edit link renders beside the DC');
    assert.equal(edit.getAttribute('data-recipe-result-edit'), 'cmp-herb');
    assert.match(edit.textContent, /Edit/, 'it reads as Edit');
    edit.click();
    assert.deepEqual(opened, ['cmp-herb'], 'it routes to the component that owns the difficulty');
    editHarness.remount();
  });

  it('progressive: a component with no authored difficulty reads as unset, not as zero', async () => {
    const { target } = await mountProgressiveResults(
      [{ id: 'res-1', componentId: 'cmp-water', quantity: 1 }],
      {
        props: {
          componentOptions: [{ id: 'cmp-water', name: 'Pure Water', img: 'icons/water.webp' }],
        },
      }
    );
    const dc = target.querySelector('[data-recipe-result-difficulty]');
    assert.equal(dc.getAttribute('data-recipe-result-difficulty'), '', 'no fabricated value');
    assert.match(dc.textContent, /No difficulty/, 'it says so rather than showing a 0');
    editHarness.remount();
  });

  it('non-progressive: result rows show no difficulty badge', async () => {
    const { target } = await mountProgressiveResults(
      [{ id: 'res-1', componentId: 'cmp-herb', quantity: 1 }],
      {
        progressive: false,
        props: {
          componentOptions: [
            { id: 'cmp-herb', name: 'Mountain Herb', img: 'icons/herb.webp', difficulty: 12 },
          ],
        },
      }
    );
    assert.equal(
      target.querySelector('[data-recipe-result-difficulty]'),
      null,
      'difficulty only participates in progressive resolution'
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

  it('falls back to the component name (never a raw id) for an unlabelled tool row', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, toolIds: ['tool-blank', 'tool-orphan'] },
        // tool-blank has no label but a resolved componentName; tool-orphan has
        // neither (its backing component is gone).
        toolsLibrary: [
          { id: 'tool-blank', label: '', componentId: 'cmp-tongs', componentName: 'Iron Tongs' },
          { id: 'tool-orphan', label: '', componentId: 'cmp-missing', componentName: '' },
        ],
      })
    );
    clickTab(target, 'tools');
    await flushRender();

    const blankRow = target.querySelector('[data-recipe-tool-id="tool-blank"]');
    assert.ok(blankRow, 'a row renders for the unlabelled tool');
    assert.match(blankRow.textContent, /Iron Tongs/, 'unlabelled tool falls back to the component name');
    assert.equal(
      blankRow.textContent.includes('tool-blank') || blankRow.textContent.includes('cmp-tongs'),
      false,
      'an unlabelled tool never shows its tool id or component id'
    );

    const orphanRow = target.querySelector('[data-recipe-tool-id="tool-orphan"]');
    assert.match(orphanRow.textContent, /Unnamed tool/, 'a tool with no label or component name shows a placeholder');
    assert.equal(
      orphanRow.textContent.includes('tool-orphan') || orphanRow.textContent.includes('cmp-missing'),
      false,
      'an orphaned tool never shows a raw id'
    );
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
        multiStepEnabled: true,
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
        canAddSet: true,
        recipe: {
          ...RECIPE,
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
    // Two sets, so this set renders with chrome (a Set-N box + editable name). A single
    // set would render chromeless (issue 643); the requirement rendering under test is
    // identical either way, so a multi-set recipe keeps the name-field coverage too.
    const target = await editHarness.mount(
      identityProps({
        canAddSet: true,
        recipe: {
          ...RECIPE,
          ingredientSets: [POPULATED_SET, { id: 'set-2', name: '', ingredientGroups: [] }],
        },
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

    // §B7: the invented "AND" hairline dividers between requirements are gone — the
    // prototype has none; the AND relationship lives in the tab intro copy.
    assert.equal(
      set.querySelectorAll('.manager-recipe-ingredient-and-separator').length,
      0,
      'no AND divider is rendered between AND’d requirements'
    );

    // The essence requirement renders as a first-class essence OPTION row (issue 649),
    // its amount edited by the SAME end-of-row Stepper every other row type uses (676).
    const essenceReq = set.querySelector('[data-recipe-group-id="grp-3"]');
    assert.ok(essenceReq, 'the essence requirement renders as an ingredient group');
    const essenceAmount = essenceReq.querySelector('[data-recipe-essence-amount]');
    assert.equal(essenceAmount.value, '3', 'essence amount shown on the option');
    // The amount is a Stepper, in the trailing control cluster — not the bare number
    // input that used to open the row (issue 676).
    assert.ok(
      essenceAmount.closest('.fab-stepper'),
      'the essence amount is the shared Stepper, not a bare input'
    );
    assert.ok(
      essenceAmount.closest('.manager-recipe-option-controls'),
      'the essence stepper sits in the row’s trailing control cluster'
    );
    // Still no `data-recipe-option-quantity`: an essence row's count lives on the MATCH
    // (`match.amount`), not on `option.quantity`, so the marker stays per-kind even
    // though the control is now shared.
    assert.equal(
      essenceReq.querySelector('[data-recipe-option-quantity]'),
      null,
      'an essence option edits match.amount, not option.quantity'
    );
    // §676: the ESSENCE pill and the "met by any components carrying this essence"
    // sub-line are gone — the flask lead chip already says what the row is.
    assert.equal(
      essenceReq.querySelector('[data-recipe-req-tag="essence"]'),
      null,
      'the redundant ESSENCE pill is gone'
    );
    assert.equal(
      essenceReq.querySelector('[data-recipe-essence-subline]'),
      null,
      'the over-explaining met-by sub-line is gone'
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
    assert.ok(groups[0].id, 'the appended requirement carries an eager id');
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
    assert.ok(groups[0].id, 'the appended requirement carries an eager id');
    assert.deepEqual(
      groups[0].options[0].match,
      { type: 'tags', tags: [], tagMatch: 'any' },
      'the tag requirement starts with an empty tags match'
    );
    editHarness.remount();
  });

  it('appends a component alternative via the "or..." Accept-instead popover', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    await pickOrOption(target, 'grp-1', 'alternative-component');
    assert.equal(patches.length, 1, 'choosing an alternative kind patches the recipe');
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 2, 'the alternative list grew by one');
    assert.deepEqual(
      options[1].match,
      { type: 'component', componentId: null },
      'the new alternative is an EMPTY component match for the row picker to fill'
    );
    assert.equal(options[1].quantity, 1, 'it defaults to quantity 1');
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

  it('leaves an existing alternative untouched when a new one is appended', async () => {
    // The old row-end add was itself a component PICKER, so it could dedupe-and-bump an
    // alternative that already named the chosen component. The "or..." popover picks a
    // KIND, not a component, so there is nothing to dedupe against at add time: the new
    // alternative is born empty and the row's own picker fills it. A GM who then picks a
    // component the requirement already lists gets the Validation tab's
    // `duplicateAlternative` issue, which is the honest place for that check.
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS } }
    );
    await pickOrOption(target, 'grp-1', 'alternative-component');
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 2, 'the existing alternative is kept and a new one appended');
    assert.deepEqual(
      options[0],
      { quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } },
      'the existing alternative is untouched'
    );
    editHarness.remount();
  });

  it('appends a tag alternative via the "or..." Accept-instead popover', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    await pickOrOption(target, 'grp-1', 'alternative-tag');
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
    // Starting from a one-component requirement, add a tag alternative from "or...".
    await pickOrOption(target, 'grp-1', 'alternative-tag');
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
    const separator = req.querySelector('.manager-recipe-ingredient-or-separator');
    assert.ok(separator, 'the "— or —" separator renders between alternatives');
    // The label is wrapped in its own span so the CSS can render it as a pill flanked
    // by rules ("[ — OR — ]", issue 643), rather than as bare centred text.
    const pill = separator.querySelector('span');
    assert.ok(pill, 'the OR label is wrapped in a pill span');
    assert.equal(pill.textContent.trim(), 'OR', 'the pill reads OR');
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
    // §676: the name is INSIDE the clickable trigger — the whole image+name is one hit
    // target that both says what the component is and opens the picker. It used to be
    // loose text beside an image-only button, which made the obvious target inert.
    const name = trigger.querySelector('.manager-recipe-component-name');
    assert.ok(name, 'the component name renders inside the trigger button');
    assert.equal(
      name.textContent.trim(),
      'Mountain Herb',
      'the trigger name resolves the component name'
    );
    assert.equal(
      row.querySelector('.manager-recipe-option-component > .manager-recipe-component-name'),
      null,
      'no loose name is rendered beside the trigger'
    );
    // The image trigger carries the component name as a tooltip.
    assert.equal(
      trigger.getAttribute('title'),
      'Mountain Herb',
      'the image trigger has a name tooltip'
    );
    editHarness.remount();
  });

  it('renders ONE "or..." control per requirement, and no per-row add cluster', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    const req = target.querySelector('[data-recipe-group-id="grp-1"]');
    const triggers = req.querySelectorAll('.manager-recipe-or-trigger');
    assert.equal(triggers.length, 1, 'exactly one "or..." trigger per requirement');
    assert.equal(
      triggers[0].getAttribute('aria-haspopup'),
      'dialog',
      'it reuses SearchablePopover (aria-haspopup, Escape-dismiss, focus-on-open)'
    );
    for (const row of req.querySelectorAll('[data-recipe-option]')) {
      assert.equal(
        row.querySelector('[data-recipe-add]'),
        null,
        'option rows carry no add controls of their own'
      );
    }
    editHarness.remount();
  });

  it('renders the multi-alternative box footer as four explicit dashed add-buttons', async () => {
    // A box (2+ alternatives) drops the compact "or..." popover the bare rows keep and
    // renders four explicit dashed add-buttons instead (issue 643), each preserving its
    // data-recipe-add marker. Cost shows only with configured currency, essence only
    // while the set can still take one.
    const { target } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } },
      ],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          itemTags: ITEM_TAGS,
          currencyUnits: CURRENCY_UNITS,
          essenceOptions: ESSENCE_OPTIONS,
        },
      }
    );
    const adds = target.querySelector(
      '[data-recipe-group-id="grp-1"] .manager-recipe-requirement-adds'
    );
    assert.ok(adds, 'the box carries an add-button footer');
    assert.equal(
      adds.querySelector('.manager-recipe-or-trigger'),
      null,
      'the box has no compact "or..." popover'
    );
    const buttons = [...adds.querySelectorAll('button[data-recipe-add]')];
    assert.deepEqual(
      buttons.map((button) => button.getAttribute('data-recipe-add')),
      ['alternative-component', 'alternative-tag', 'alternative-cost', 'alternative-essence'],
      'four dashed add-buttons in order, each keeping its marker'
    );
    for (const button of buttons) {
      assert.ok(button.classList.contains('is-dashed'), 'each add-button is dashed');
    }
    editHarness.remount();
  });

  it('drops the cost and essence box buttons when the system configures neither', async () => {
    const { target } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    const adds = target.querySelector(
      '[data-recipe-group-id="grp-1"] .manager-recipe-requirement-adds'
    );
    assert.deepEqual(
      [...adds.querySelectorAll('button[data-recipe-add]')].map((button) =>
        button.getAttribute('data-recipe-add')
      ),
      ['alternative-component', 'alternative-tag'],
      'only component and tag buttons without currency units or system essences'
    );
    editHarness.remount();
  });

  it('offers FOUR kinds in the "or..." menu, each keeping its data-recipe-add token', async () => {
    // The token family is PRESERVED on the popover's type choices rather than renamed:
    // this file drives ~25 call sites through it. Currency and Essence appear only when
    // the system configures them, so the menu never offers what it cannot honour.
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          itemTags: ITEM_TAGS,
          currencyUnits: CURRENCY_UNITS,
          essenceOptions: ESSENCE_OPTIONS,
        },
      }
    );
    await openOrMenu(target, 'grp-1');
    for (const token of [
      'alternative-component',
      'alternative-tag',
      'alternative-currency',
      'alternative-essence',
    ]) {
      assert.ok(
        document.querySelector(`[data-recipe-add="${token}"]`),
        `the "or..." menu offers ${token}`
      );
    }
    editHarness.remount();
  });

  it('renders the "or..." menu as a single flat "Accept instead" list (essence is a real OR alternative)', async () => {
    // Essence is now a first-class ingredient match type (issue 649), so Component /
    // Tag / Currency / Essence are ALL real OR alternatives appended to THIS
    // requirement. The old two-heading Accept-instead / Require-as-well split is gone:
    // the menu is one flat ungrouped list (optionGroups: []), so no lone role="group"
    // heading renders.
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          itemTags: ITEM_TAGS,
          currencyUnits: CURRENCY_UNITS,
          essenceOptions: ESSENCE_OPTIONS,
        },
      }
    );
    await openOrMenu(target, 'grp-1');

    assert.equal(
      document.querySelector('[data-popover-group]'),
      null,
      'no ARIA option-group headings — the menu is a single flat list'
    );
    const listbox = document.querySelector('.manager-recipe-or-popover [role="listbox"]');
    assert.deepEqual(
      [...listbox.querySelectorAll('[data-recipe-add]')].map((option) =>
        option.getAttribute('data-recipe-add')
      ),
      [
        'alternative-component',
        'alternative-tag',
        'alternative-currency',
        'alternative-essence',
      ],
      'all four kinds are flat OR alternatives, in order'
    );
    editHarness.remount();
  });

  it('gives the "or..." trigger, dialog and search a NEUTRAL accessible name', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          itemTags: ITEM_TAGS,
          essenceOptions: ESSENCE_OPTIONS,
        },
      }
    );
    const NEUTRAL = 'Accept instead';

    const trigger = target.querySelector('[data-recipe-group-id="grp-1"] .manager-recipe-or-trigger');
    assert.equal(trigger.getAttribute('aria-label'), NEUTRAL, 'the trigger is named for the flat Accept instead list');

    await openOrMenu(target, 'grp-1');
    const dialog = document.querySelector('.manager-travel-popover[role="dialog"]');
    assert.equal(dialog.getAttribute('aria-label'), NEUTRAL);
    assert.equal(dialog.querySelector('[role="listbox"]').getAttribute('aria-label'), NEUTRAL);
    // The row-level "or..." popover drops the search box entirely (issue 643): only a
    // handful of fixed choices, and the search was squeezing the option wording. So
    // there is no search field to name — the trigger + dialog carry the neutral name.
    assert.equal(
      dialog.querySelector('input[type="text"]'),
      null,
      'the search-less row popover renders no search input'
    );
    editHarness.remount();
  });

  it('offers no essence alternative in the flat "or..." menu when the system has no essences', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    await openOrMenu(target, 'grp-1');

    // No option-group headings (flat list) and no essence choice at all.
    assert.equal(document.querySelector('[data-popover-group]'), null, 'the menu is a flat list');
    assert.equal(
      document.querySelector('[data-recipe-add="alternative-essence"]'),
      null,
      'no essence alternative without system essences'
    );
    editHarness.remount();
  });

  it('omits currency and essence from the "or..." menu when the system configures neither', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    await openOrMenu(target, 'grp-1');
    assert.ok(document.querySelector('[data-recipe-add="alternative-component"]'));
    assert.ok(document.querySelector('[data-recipe-add="alternative-tag"]'));
    assert.equal(
      document.querySelector('[data-recipe-add="alternative-currency"]'),
      null,
      'no currency choice without configured currency units'
    );
    assert.equal(
      document.querySelector('[data-recipe-add="alternative-essence"]'),
      null,
      'no essence choice without system essences'
    );
    editHarness.remount();
  });

  it('appends an ESSENCE OR alternative to the requirement (issue 649)', async () => {
    // Essence is now a first-class ingredient match type, so choosing Essence from the
    // flat "Accept instead" menu appends a real OR alternative to THIS requirement (seeded
    // from the first system essence at amount 1) — it does NOT bubble to a per-set map.
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          itemTags: ITEM_TAGS,
          essenceOptions: ESSENCE_OPTIONS,
        },
      }
    );
    await pickOrOption(target, 'grp-1', 'alternative-essence');
    assert.equal(patches.length, 1, 'choosing Essence patches the recipe');
    const set = patches[0].ingredientSets[0];
    assert.equal(set.essences, undefined, 'no per-set essences map is written');
    assert.equal(
      set.ingredientGroups[0].options.length,
      2,
      'the requirement gains a new essence alternative'
    );
    assert.deepEqual(
      set.ingredientGroups[0].options[1].match,
      { type: 'essence', essenceId: 'ess-life', amount: 1 },
      'the essence alternative is seeded from the first system essence at amount 1'
    );
    editHarness.remount();
  });

  it('keeps offering the essence alternative even when the group already requires an essence (OR may repeat)', async () => {
    // The essence choice is gated only on the system HAVING essences, not on
    // system-minus-already-required: an OR essence may legitimately repeat across groups
    // (issue 649), so the choice never disappears while the system has essences.
    const { target, patches } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'essence', essenceId: 'ess-life', amount: 2 } },
      ],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          itemTags: ITEM_TAGS,
          essenceOptions: ESSENCE_OPTIONS,
        },
      }
    );
    // A 2-option group renders the box footer of dashed add-buttons.
    assert.ok(
      target.querySelector('[data-recipe-group-id="grp-1"] [data-recipe-add="alternative-essence"]'),
      'the essence alternative stays available even with an essence already present'
    );
    assert.equal(patches.length, 0, 'rendering authors nothing');
    editHarness.remount();
  });

  it('appends a third alternative to an already-mixed OR group from the "or..." menu', async () => {
    const { target, patches } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'tags', tags: ['liquid'], tagMatch: 'any' } },
      ],
      { props: { componentOptions: COMPONENT_OPTIONS, itemTags: ITEM_TAGS } }
    );
    await pickOrOption(target, 'grp-1', 'alternative-component');
    assert.equal(patches.length, 1, 'choosing from the "or..." menu patches the recipe');
    const options = patches[0].ingredientSets[0].ingredientGroups[0].options;
    assert.equal(options.length, 3, 'the alternative list grew by one');
    assert.deepEqual(
      options[2].match,
      { type: 'component', componentId: null },
      'the appended alternative is an empty component match'
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
    // §B1: the quantity is now the shared Stepper, whose typeable input commits on
    // blur (re-asserting the clamped value), not on a `change` event.
    qty.value = '5';
    qty.dispatchEvent(new globalThis.window.Event('blur', { bubbles: true }));
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
    assert.ok(groups[0].id, 'the appended requirement carries an eager id');
    assert.deepEqual(
      groups[0].options[0].match,
      { type: 'currency', unit: 'gp', amount: 1 },
      'the currency requirement starts with the first unit and amount 1'
    );
    editHarness.remount();
  });

  it('appends a currency alternative via the "or..." Accept-instead popover', async () => {
    const { target, patches } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      { props: { componentOptions: COMPONENT_OPTIONS, currencyUnits: CURRENCY_UNITS } }
    );
    await pickOrOption(target, 'grp-1', 'alternative-currency');
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
    // The currency option's editor is now just its unit picker; the amount moved out to
    // the shared end-of-row Stepper (issue 676).
    const currency = target.querySelector('[data-recipe-option-currency]');
    assert.ok(currency, 'the currency option renders its editor');
    assert.equal(
      currency.querySelector('[data-recipe-currency-amount]'),
      null,
      'the bare amount input no longer opens the currency row'
    );
    // Still no `data-recipe-option-quantity`: a currency row's count lives on the MATCH
    // (`match.amount`), not on `option.quantity`.
    assert.equal(
      target.querySelector('[data-recipe-option] [data-recipe-option-quantity]'),
      null,
      'currency rows edit match.amount, not option.quantity'
    );

    const amount = target.querySelector(
      '.manager-recipe-option-controls [data-recipe-currency-amount]'
    );
    assert.ok(amount, 'the currency amount is a Stepper in the trailing control cluster');
    assert.ok(amount.closest('.fab-stepper'), 'the currency amount is the shared Stepper');

    // Controlled component: each edit derives from the unchanged prop, so the
    // amount edit keeps the chosen unit and the unit edit keeps the prop amount.
    // The Stepper commits on `input` (it stays typeable mid-keystroke), not `change`.
    amount.value = '250';
    amount.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
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

  // The normalizer seeds preset units even when currency is DISABLED, so a "units exist"
  // gate alone leaks the Add cost affordances into a currency-off system. These drive
  // RecipeEditView (the wrapper), so they also prove currencyEnabled is declared AND
  // forwarded through every layer down to the set/group cards — a tab-only prop that
  // skips a wrapper silently drops to its default and never gates.
  it('hides every Add cost control when currency is disabled despite seeded units', async () => {
    const { target } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } },
      ],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          currencyUnits: CURRENCY_UNITS,
          currencyEnabled: false,
        },
      }
    );
    assert.equal(
      target.querySelector('[data-recipe-add="cost"]'),
      null,
      'no set-level Add cost button'
    );
    assert.equal(
      target.querySelector('[data-recipe-add="alternative-cost"]'),
      null,
      'no requirement-level Add cost button'
    );
    editHarness.remount();
  });

  it('omits the Currency choice from the "or..." menu when currency is disabled', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          currencyUnits: CURRENCY_UNITS,
          currencyEnabled: false,
        },
      }
    );
    await openOrMenu(target, 'grp-1');
    assert.equal(
      document.querySelector('[data-recipe-add="alternative-currency"]'),
      null,
      'the "or..." Accept-instead menu offers no Currency choice'
    );
    editHarness.remount();
  });

  it('shows the Add cost controls when currency is enabled with units', async () => {
    const { target } = await mountSingleGroup(
      [
        { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
        { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } },
      ],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          currencyUnits: CURRENCY_UNITS,
          currencyEnabled: true,
        },
      }
    );
    assert.ok(
      target.querySelector('[data-recipe-add="cost"]'),
      'the set-level Add cost button renders'
    );
    assert.ok(
      target.querySelector('[data-recipe-add="alternative-cost"]'),
      'the requirement-level Add cost button renders'
    );
    editHarness.remount();
  });

  it('keeps an existing currency requirement visible but read-only when currency is disabled', async () => {
    const { target } = await mountSingleGroup(
      [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } }],
      {
        props: {
          componentOptions: COMPONENT_OPTIONS,
          currencyUnits: CURRENCY_UNITS,
          currencyEnabled: false,
        },
      }
    );
    const currency = target.querySelector('[data-recipe-option-currency]');
    assert.ok(currency, 'the persisted currency requirement is still rendered (not hidden)');
    // The unit is a static read-only label, not the interactive picker.
    assert.equal(
      currency.querySelector('.manager-recipe-currency-trigger'),
      null,
      'the interactive unit picker is gone'
    );
    assert.ok(
      currency.querySelector('[data-recipe-currency-readonly]'),
      'the unit renders read-only'
    );
    assert.ok(
      target.querySelector('[data-recipe-currency-disabled]'),
      'a flag marks the cost inactive while currency is off'
    );
    // The amount is static text, not the editable Stepper.
    const amount = target.querySelector('[data-recipe-currency-amount]');
    assert.ok(amount, 'the persisted amount is still shown');
    assert.equal(amount.closest('.fab-stepper'), null, 'the amount is static, not a Stepper');
    assert.match(amount.textContent, /100/, 'the persisted amount value is displayed');
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

  it('adds a set-level essence requirement as a single-option essence GROUP (issue 649)', async () => {
    // The retained set-level "Add essence requirement" control now appends a
    // single-option essence GROUP (an AND-required requirement preserving the old
    // per-set semantics), NOT a per-set essences map entry.
    const { target, patches } = await mountIngredientGroups([], {
      props: { essenceOptions: ESSENCE_OPTIONS },
    });
    await pickPopoverOption(
      target,
      '[data-recipe-set-id="set-1"] .manager-recipe-essence-trigger',
      /Life/
    );
    assert.equal(patches.length, 1, 'choosing an essence patches the recipe');
    const set = patches[0].ingredientSets[0];
    assert.equal(set.essences, undefined, 'no per-set essences map is written');
    assert.equal(set.ingredientGroups.length, 1, 'a single essence group is appended');
    assert.ok(set.ingredientGroups[0].id, 'the appended essence group carries an eager id');
    assert.equal(set.ingredientGroups[0].options.length, 1, 'the group has one essence option');
    assert.deepEqual(
      set.ingredientGroups[0].options[0].match,
      { type: 'essence', essenceId: 'ess-life', amount: 1 },
      'the chosen essence is seeded at amount 1'
    );
    editHarness.remount();
  });

  it('omits the set-level "Add essence requirement" control when the system has no essences', async () => {
    const { target } = await mountIngredientGroups([], { props: { essenceOptions: [] } });
    assert.ok(target.querySelector('[data-recipe-set-id="set-1"]'), 'the set still renders');
    assert.equal(
      target.querySelector('[data-recipe-set-id="set-1"] [data-recipe-add="essence-requirement"]'),
      null,
      'no set-level essence add without essences'
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
        multiStepEnabled: true,
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
    // Recipe-level (global) tools section (idPrefix '') shows the recipe-wide tool.
    assert.ok(
      target.querySelector('[data-recipe-section="tools"] [data-recipe-tool-id="tool-anvil"]'),
      'recipe-level tools section lists the recipe-wide tool'
    );
    // Per-step tool sections render ALWAYS-OPEN on the Tools tab (issue 643 §C1) — the
    // old single-expand accordion showed nothing until a step was clicked.
    const stepTools = target.querySelector('[data-recipe-section="step-sa-tools"]');
    assert.ok(stepTools, 'the per-step tools section renders without expanding');
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

  it('authors the recipe-level Tool bonus map with absent meaning Always', async () => {
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
    const mode = target.querySelector('[data-recipe-section="tools"] [data-recipe-tool-bonus-mode="tool-hammer"]');
    assert.equal(mode.value, 'always', 'an absent map entry reads as Always');
    assert.deepEqual(Array.from(mode.options).map((option) => option.value), ['always', 'highestOnly', 'never']);
    mode.value = 'highestOnly';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(patches.at(-1).toolBonusModes, { 'tool-hammer': 'highestOnly' });
    editHarness.remount();
  });

  it('round-trips Highest only and Never, while choosing Always removes the map entry', async () => {
    for (const authored of ['highestOnly', 'never']) {
      const patches = [];
      const target = await editHarness.mount(
        identityProps({
          recipe: { ...RECIPE, toolIds: ['tool-hammer'], toolBonusModes: { 'tool-hammer': authored } },
          toolsLibrary: TOOLS_LIBRARY,
          onUpdateRecipe: (patch) => patches.push(patch),
        })
      );
      clickTab(target, 'tools');
      await flushRender();
      const mode = target.querySelector('[data-recipe-tool-bonus-mode="tool-hammer"]');
      assert.equal(mode.value, authored, `${authored} reads back from the recipe map`);
      mode.value = 'always';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      assert.deepEqual(patches.at(-1).toolBonusModes, {}, 'Always is represented by an absent entry');
      editHarness.remount();
    }
  });

  it('uses one recipe-level bonus map across global, step, and ingredient-set Tool scopes', async () => {
    const patches = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: {
          ...RECIPE,
          toolIds: ['tool-hammer'],
          toolBonusModes: { 'tool-hammer': 'never' },
          steps: [{
            id: 'sa',
            name: 'Forge',
            toolIds: ['tool-hammer'],
            ingredientSets: [{ id: 'set-a', name: 'Hot forge', toolIds: ['tool-hammer'], ingredientGroups: [] }],
          }],
        },
        multiStepEnabled: true,
        toolsLibrary: TOOLS_LIBRARY,
        onUpdateRecipe: (patch) => patches.push(patch),
      })
    );
    clickTab(target, 'tools');
    await flushRender();

    const selectors = target.querySelectorAll('[data-recipe-tool-bonus-mode="tool-hammer"]');
    assert.equal(selectors.length, 3, 'global, step, and ingredient-set rows each expose the policy');
    assert.ok(Array.from(selectors).every((select) => select.value === 'never'));
    const ingredientSetMode = target.querySelector('[data-recipe-section="step-sa-set-set-a-tools"] [data-recipe-tool-bonus-mode="tool-hammer"]');
    ingredientSetMode.value = 'highestOnly';
    ingredientSetMode.dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(patches.at(-1).toolBonusModes, { 'tool-hammer': 'highestOnly' });
    editHarness.remount();
  });

  it('routes a per-step result add through onUpdateStep({ resultGroups }) for a multi-step recipe', async () => {
    const updates = [];
    // A routed system keeps chrome + the Add result set affordance even for an empty
    // step scope, so the GM can author the first routed result group.
    const target = await editHarness.mount(
      identityProps({
        routingProvider: 'check',
        recipe: { ...RECIPE, steps: [{ id: 'sa', name: 'Forge' }] },
        onUpdateStep: (id, patch) => updates.push([id, patch]),
      })
    );
    clickTab(target, 'results');
    await flushRender();
    // Per-step result sections render always-open on the Results tab (issue 643 §C1).
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
    assert.ok(
      updates[0][1].resultGroups[0].id,
      'the appended group carries an eager id (assigned at add time)'
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
    // Two groups, so the group renders with chrome (the free-text name field). A single
    // non-routed group renders chromeless (issue 643), which has no name field.
    const { target, patches } = await mountResultGroups([
      { id: 'grp-1', name: 'Primary', results: [] },
      { id: 'grp-2', name: 'Bonus', results: [] },
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

  it('adds a result item to a group via the Add item popover (with an eager id)', async () => {
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
    assert.ok(items[0].id, 'the item carries an eager id');
    assert.equal(items[0].componentId, 'cmp-herb');
    assert.equal(items[0].quantity, 1, 'the item defaults to quantity 1');
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
    // The result quantity is the shared Stepper (as in Ingredients); its typeable
    // input commits on blur, not on a `change` event.
    input.value = '999999';
    input.dispatchEvent(new globalThis.window.Event('blur', { bubbles: true }));
    assert.equal(
      patches.at(-1).resultGroups[0].results[0].quantity,
      9999,
      'over-cap input is capped to 9999'
    );
    input.value = '0';
    input.dispatchEvent(new globalThis.window.Event('blur', { bubbles: true }));
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
    input.dispatchEvent(new globalThis.window.Event('blur', { bubbles: true }));
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
    const addedItem = patches[0].resultGroups[0].results[0];
    assert.equal(addedItem.componentId, 'cmp-herb', 'the group holds the added item');
    assert.equal(addedItem.quantity, 1);
    assert.ok(addedItem.id, 'the added item carries an eager id');
    editHarness.remount();
  });

  it('shows the Add result set button for a routed system (empty scope)', async () => {
    // Routed modes need multiple result groups (one per outcome / ingredient set), so
    // they keep the Add result set affordance even when no group exists yet.
    const { target } = await mountResultGroups([], {
      props: { routingProvider: 'check', routedOutcomeTierOptions: TIER_OPTIONS, routedOutcomeTiersDefined: true },
    });
    assert.ok(
      target.querySelector('[data-recipe-add="result-set"]'),
      'Add result set button shown for a routed result scope'
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
    // name (check-routed resultSelection, case-insensitive), so the first edit
    // must not drop either.
    const { target, patches } = await mountResultGroups(
      [{ id: 'grp-1', name: 'Primary', results: [{ componentId: 'cmp-herb', quantity: 1 }] }],
      {
        recipe: {
          outcomeRouting: { success: 'grp-1' },
          resultSelection: { provider: 'check' },
        },
      }
    );
    // Edit the group's only item (a quantity change) — the lightest-touch edit path.
    // The shared Stepper commits on blur, not on a `change` event.
    const input = target.querySelector('[data-recipe-result-item] [data-recipe-option-quantity]');
    input.value = '5';
    input.dispatchEvent(new globalThis.window.Event('blur', { bubbles: true }));
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

  // Collapsed chain editor presentation (issue 710). With the system's multi-step
  // feature OFF, a multi-step recipe presents as single-step: Overview shows the
  // preserved steps read-only (no revert control), and the Results tab edits the
  // chain's effective FINAL-step results, writing through to that step.
  it('collapses the editor to single-step when the multi-step feature is off (issue 710)', async () => {
    const recipe = {
      ...RECIPE,
      steps: [
        {
          id: 'step-1',
          name: 'Prep',
          ingredientSets: [],
          resultGroups: [{ id: 'rg-1', results: [] }],
        },
        {
          id: 'step-2',
          name: 'Finish',
          ingredientSets: [],
          resultGroups: [{ id: 'rg-2', results: [] }],
        },
      ],
    };
    const target = await editHarness.mount(
      identityProps({ recipe, multiStepEnabled: false, onUpdateStep: () => {} })
    );
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-collapsed-note]'),
      'the collapsed steps note renders on Overview'
    );
    assert.ok(
      target.querySelector('[data-recipe-section="collapsed-steps"]'),
      'the read-only collapsed steps card renders'
    );
    assert.equal(
      target.querySelector('[data-recipe-section="recipe-step-mode"]'),
      null,
      'the step-mode revert control is hidden while collapsed'
    );
    assert.equal(
      target.querySelectorAll('.manager-recipe-collapsed-step').length,
      2,
      'both preserved steps are listed read-only'
    );
    editHarness.remount();
  });

  it('writes results-tab edits through to the FINAL step while collapsed (issue 710)', async () => {
    const stepPatches = [];
    const recipe = {
      ...RECIPE,
      steps: [
        {
          id: 'step-1',
          name: 'Prep',
          ingredientSets: [],
          resultGroups: [{ id: 'rg-1', name: 'A', results: [] }],
        },
        // The final step carries TWO result groups so the results section renders its
        // complex branch (with the "add result set" affordance); those are the results
        // the collapsed editor surfaces as the chain's effective output.
        {
          id: 'step-2',
          name: 'Finish',
          ingredientSets: [],
          resultGroups: [
            { id: 'rg-2a', name: 'X', results: [] },
            { id: 'rg-2b', name: 'Y', results: [] },
          ],
        },
      ],
    };
    const target = await editHarness.mount(
      identityProps({
        recipe,
        multiStepEnabled: false,
        onUpdateStep: (stepId, patch) => stepPatches.push({ stepId, patch }),
      })
    );
    clickTab(target, 'results');
    await flushRender();
    assert.ok(
      target.querySelector('[data-recipe-collapsed-results-note]'),
      'the collapsed results note renders'
    );
    const addSet = target.querySelector('[data-recipe-add="result-set"]');
    assert.ok(
      addSet,
      'the results surface renders over the final step (its two groups → complex add-set control)'
    );
    addSet.click();
    await flushRender();
    const last = stepPatches.at(-1);
    assert.ok(last, 'editing the collapsed results emits a STEP patch, not a recipe patch');
    assert.equal(last.stepId, 'step-2', 'the write goes THROUGH to the FINAL step');
    assert.equal(last.patch.resultGroups.length, 3, 'the final step gains the new result group');
    editHarness.remount();
  });
});

// The two mode-conditional tabs (issue 676), rehomed from the deleted RecipeContextRail.
// Driven THROUGH RecipeEditView, not by mounting the tabs directly: the wrapper must
// declare AND forward each prop, and a tab prop it drops silently falls back to its
// default with the control simply absent — which a test that feeds the tab straight
// cannot see.
describe('RecipeEditView — surfaces rehomed from the deleted context rail (mounted)', () => {
  before(async () => {
    await editHarness.setup();
    // The harness installs game.i18n but not fromUuid; provide a default stub.
    globalThis.foundry = {};
    globalThis.fromUuid = async () => null;
  });

  after(() => {
    delete globalThis.fromUuid;
    delete globalThis.foundry;
    editHarness.teardown();
  });

  beforeEach(() => {
    globalThis.fromUuid = async () => null;
  });

  it('renders the "Appears in" tab with no drop zone and no "link another" affordance', async () => {
    const target = await editHarness.mount(contextProps());
    await openTab(target, 'books-scrolls');
    assert.ok(
      target.querySelector('[data-recipe-section="recipe-item"]'),
      'the books & scrolls tab renders under the knowledge/item effect'
    );
    // Adding a recipe to a book is authored on Books & Scrolls. The recipe-side drop
    // zone was a SECOND authoring path for the same many-to-many and is removed.
    assert.equal(
      target.querySelector('[data-recipe-item-dropzone]'),
      null,
      'no drop zone: adding a recipe to a book happens on Books & Scrolls'
    );
    assert.ok(target.querySelector('[data-recipe-item-empty]'), 'shows the empty summary copy');
    editHarness.remount();
  });

  it('deep-links to Books & Scrolls', async () => {
    const opened = [];
    const target = await editHarness.mount(
      contextProps({ onOpenBooksScrolls: () => opened.push(true) })
    );
    await openTab(target, 'books-scrolls');
    target.querySelector('[data-recipe-open-books]').click();
    assert.deepEqual(opened, [true], 'the Open Books & Scrolls button routes to the owning screen');
    editHarness.remount();
  });

  // The GATE is the tab BUTTON, not just the panel: a tab that opens an empty panel is
  // worse than no tab, so the strip and RecipeEditView's TAB_IDS read the same effect.
  it('omits both gated tabs entirely under the global visibility mode', async () => {
    const target = await editHarness.mount(
      contextProps({ visibilityEffect: { showAccess: false, showBooksScrolls: false } })
    );
    assert.equal(
      target.querySelector('[data-recipe-tab-button="books-scrolls"]'),
      null,
      'a globally-visible system uses no books, so the tab button is absent'
    );
    assert.equal(
      target.querySelector('[data-recipe-tab-button="access"]'),
      null,
      'a globally-visible system grants no per-recipe access, so the tab button is absent'
    );
    editHarness.remount();
  });

  it('enumerates every linked book (many-to-many) and unlinks one via onRemoveRecipeItem', async () => {
    globalThis.fromUuid = async () => null; // resolve to def name/img (missing → def fallback shown)
    const removed = [];
    const DEFS = [
      { id: 'ri-a', name: 'Alpha Tome', img: 'icons/a.webp', originItemUuid: 'Item.a' },
      { id: 'ri-b', name: 'Beta Scroll', img: 'icons/b.webp', originItemUuid: 'Item.b' },
    ];
    const target = await editHarness.mount(
      contextProps({
        recipe: { ...RECIPE, recipeItemId: 'ri-a', recipeItemIds: ['ri-a', 'ri-b'] },
        recipeItemDefinitions: DEFS,
        onRemoveRecipeItem: (id) => removed.push(id),
      })
    );
    await openTab(target, 'books-scrolls');
    await new Promise((r) => setTimeout(r, 10));
    const rows = target.querySelectorAll('[data-recipe-item-link]');
    assert.equal(rows.length, 2, 'both linked books are listed');
    assert.ok(target.querySelector('[data-recipe-item-link="ri-a"]'), 'lists the first book');
    assert.ok(target.querySelector('[data-recipe-item-link="ri-b"]'), 'lists the second book');

    // The per-row unlink removes only that book.
    target.querySelector('[data-recipe-item-link="ri-b"] .manager-icon-button.is-danger').click();
    assert.deepEqual(removed, ['ri-b'], 'unlink calls onRemoveRecipeItem with the book id');
    editHarness.remount();
  });

  it('resolves each linked book image/name from its source document', async () => {
    const DOCS = { 'Item.blue': { name: 'Blue Potion', img: 'icons/blue-potion.webp' } };
    globalThis.fromUuid = async (uuid) => DOCS[uuid] || null;
    const target = await editHarness.mount(
      contextProps({
        recipe: { ...RECIPE, recipeItemId: 'ri-blue', recipeItemIds: ['ri-blue'] },
        recipeItemDefinitions: [
          {
            id: 'ri-blue',
            name: 'Blue Def',
            img: 'icons/blue-def.webp',
            originItemUuid: 'Item.blue',
          },
        ],
      })
    );
    await openTab(target, 'books-scrolls');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(
      target
        .querySelector('[data-recipe-item-linked] img.manager-recipe-book-thumb')
        .getAttribute('src')
        .includes('blue-potion'),
      'shows the resolved source image'
    );
    assert.ok(
      target
        .querySelector('[data-recipe-item-linked] .manager-recipe-book-name')
        .textContent.includes('Blue Potion'),
      'shows the resolved source name'
    );
    editHarness.remount();
  });

  it('renders the missing state when fromUuid resolves to null', async () => {
    globalThis.fromUuid = async () => null;
    const target = await editHarness.mount(
      contextProps({
        recipe: { ...RECIPE, recipeItemId: 'ri1', recipeItemIds: ['ri1'] },
        recipeItemDefinitions: [
          {
            id: 'ri1',
            name: 'Old Item',
            img: 'icons/svg/item-bag.svg',
            originItemUuid: 'Item.gone',
          },
        ],
      })
    );
    await openTab(target, 'books-scrolls');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(
      target.querySelector('[data-recipe-item-missing]'),
      'missing state renders when the source item no longer resolves'
    );
    assert.ok(
      target.querySelector('[data-recipe-item-linked]'),
      'the link is retained in the missing state'
    );
    editHarness.remount();
  });

  // --- the RESTRICTED branch ----------------------------------------------------
  const RESTRICTED = { showAccess: true, showBooksScrolls: false };

  it('lists players and characters with access under the restricted mode, and no books tab', async () => {
    const target = await editHarness.mount(
      contextProps({
        visibilityEffect: RESTRICTED,
        accessPlayers: [{ id: 'u1', name: 'Ada', avatar: 'icons/ada.webp' }],
        accessCharacters: [
          {
            id: 'a1',
            name: 'Thorin',
            img: 'icons/thorin.webp',
            controlledBy: [{ id: 'u1', name: 'Ada', avatar: '', assigned: true }],
            sharedWithAllPlayers: false,
          },
        ],
      })
    );
    await openTab(target, 'access');
    assert.ok(target.querySelector('[data-recipe-section="access"]'), 'access panel renders');
    // The tab leads with the shared tab intro (an h2 + muted sub), like every other
    // recipe tab — not the rail's uppercase micro-label, which was rail chrome.
    assert.ok(
      target.querySelector(
        '[data-recipe-tab="access"] > .manager-recipe-tab-intro > h2.manager-recipe-tab-title'
      ),
      'the access tab is headed by the shared tab title, like Results/Tools/Validation'
    );
    assert.equal(
      target.querySelector('[data-recipe-tab-button="books-scrolls"]'),
      null,
      'restricted systems use no books'
    );
    assert.ok(target.querySelector('[data-recipe-access-player="u1"]'), 'lists the granted player');
    assert.ok(
      target.querySelector('[data-recipe-access-character="a1"]'),
      'lists the granted character'
    );
    assert.equal(
      target
        .querySelector('[data-recipe-access-character="a1"] [data-recipe-access-subline]')
        .textContent.trim(),
      'Played by Ada',
      'a single controller reads "Played by <name>"'
    );
    editHarness.remount();
  });

  it('says "Shared with all players" rather than naming one player when ownership.default is OWNER', async () => {
    // THE bug this field exists to prevent: `getUserLevel` falls through to
    // ownership.default, so an "All Players = Owner" actor is controlled by EVERY
    // player. Naming one of them would tell the GM the opposite of the truth.
    const target = await editHarness.mount(
      contextProps({
        visibilityEffect: RESTRICTED,
        accessCharacters: [
          {
            id: 'a1',
            name: 'The Party Wagon',
            img: '',
            controlledBy: [
              { id: 'u1', name: 'Ada', avatar: '', assigned: false },
              { id: 'u2', name: 'Brin', avatar: '', assigned: false },
            ],
            sharedWithAllPlayers: true,
          },
        ],
      })
    );
    await openTab(target, 'access');
    assert.equal(
      target.querySelector('[data-recipe-access-subline]').textContent.trim(),
      'Shared with all players',
      'the whole-table grant is stated as such, never as "Played by <one name>"'
    );
    editHarness.remount();
  });

  it('renders no sub-line at all when nobody controls the granted character', async () => {
    const target = await editHarness.mount(
      contextProps({
        visibilityEffect: RESTRICTED,
        accessCharacters: [
          { id: 'a1', name: 'Orphan NPC', img: '', controlledBy: [], sharedWithAllPlayers: false },
        ],
      })
    );
    await openTab(target, 'access');
    assert.equal(
      target.querySelector('[data-recipe-access-subline]'),
      null,
      'an empty control set invents no attribution'
    );
    editHarness.remount();
  });

  it('collapses three or more controllers to "+N" and keeps the full list in the title', async () => {
    const target = await editHarness.mount(
      contextProps({
        visibilityEffect: RESTRICTED,
        accessCharacters: [
          {
            id: 'a1',
            name: 'Shared Hireling',
            img: '',
            controlledBy: [
              { id: 'u1', name: 'Ada', avatar: '', assigned: true },
              { id: 'u2', name: 'Brin', avatar: '', assigned: false },
              { id: 'u3', name: 'Cade', avatar: '', assigned: false },
            ],
            sharedWithAllPlayers: false,
          },
        ],
      })
    );
    await openTab(target, 'access');
    const subline = target.querySelector('[data-recipe-access-subline]');
    assert.equal(subline.textContent.trim(), 'Played by Ada +2', 'collapses to +N');
    assert.equal(
      subline.getAttribute('title'),
      'Ada, Brin, Cade',
      'the "+N" collapse never hides a name — the full list is in the title'
    );
    editHarness.remount();
  });

  it('shows an empty-grant message and still deep-links to Manage access', async () => {
    const opened = [];
    const target = await editHarness.mount(
      contextProps({ visibilityEffect: RESTRICTED, onOpenAccess: () => opened.push(true) })
    );
    await openTab(target, 'access');
    assert.ok(target.querySelector('[data-recipe-access-empty]'), 'states that nothing is granted');
    target.querySelector('[data-recipe-open-access]').click();
    assert.deepEqual(opened, [true], 'Manage access routes to the Access screen');
    editHarness.remount();
  });

  // --- category (moved to Overview, threaded through RecipeEditView) ------------
  it('disables the category selector and shows only General when no categories exist', async () => {
    const target = await editHarness.mount(identityProps({ categories: [] }));
    const select = target.querySelector('[data-recipe-category-select]');
    assert.ok(select, 'category selector renders on Overview');
    assert.equal(select.disabled, true, 'selector is disabled with no custom categories');
    const options = [...select.querySelectorAll('option')];
    assert.equal(options.length, 1, 'only one option present');
    assert.equal(options[0].value, 'general', 'the sole option is the General fallback');
    editHarness.remount();
  });

  it('enables the selector with custom categories and reports the current category', async () => {
    const target = await editHarness.mount(
      identityProps({
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
    editHarness.remount();
  });

  it('threads onSetCategory through RecipeEditView when a different category is chosen', async () => {
    const chosen = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, category: 'general' },
        categories: ['Potions'],
        onSetCategory: (category) => chosen.push(category),
      })
    );
    const select = target.querySelector('[data-recipe-category-select]');
    select.value = 'Potions';
    select.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await flushRender();
    assert.deepEqual(chosen, ['Potions'], 'onSetCategory receives the selected category');
    editHarness.remount();
  });

  // --- step mode (issue 676: rehomed from the deleted rail onto Overview) ---------
  // It lives beside the surface it governs — the steps themselves are authored on this
  // tab (RecipeStepsCard), and this control decides whether that card exists at all.
  // These drive RecipeEditView, so they also prove the wrapper declares AND forwards
  // `multiStepEnabled` / `onEnterMultiStep` / `onRevertToSingleStep`; a prop the wrapper
  // drops falls back to its default and the control silently never renders.
  it('hides the step-mode control when multi-step is not enabled and the recipe is single-step', async () => {
    const target = await editHarness.mount(
      identityProps({ recipe: { ...RECIPE, steps: [] }, multiStepEnabled: false })
    );
    assert.equal(
      target.querySelector('[data-recipe-section="recipe-step-mode"]'),
      null,
      'step-mode card is hidden'
    );
    editHarness.remount();
  });

  it('shows the step-mode control for a single-step recipe when multi-step is enabled', async () => {
    const target = await editHarness.mount(
      identityProps({ recipe: { ...RECIPE, steps: [] }, multiStepEnabled: true })
    );
    assert.ok(
      target.querySelector('[data-recipe-section="recipe-step-mode"]'),
      'step-mode card renders when enabled'
    );
    editHarness.remount();
  });

  it('still shows the step-mode control for a multi-step recipe even when the feature is off (to allow revert)', async () => {
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] },
        multiStepEnabled: false,
      })
    );
    assert.ok(
      target.querySelector('[data-recipe-section="recipe-step-mode"]'),
      'step-mode card stays visible so multi-step can be reverted'
    );
    editHarness.remount();
  });

  it('shows single-step selected and fires onEnterMultiStep when switching to multi', async () => {
    const entered = [];
    const reverted = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, steps: [] },
        multiStepEnabled: true,
        onEnterMultiStep: () => entered.push(true),
        onRevertToSingleStep: () => reverted.push(true),
      })
    );
    const single = target.querySelector('[data-recipe-step-mode-option="single"]');
    const multi = target.querySelector('[data-recipe-step-mode-option="multi"]');
    assert.ok(single.classList.contains('is-active'), 'single is active when there are no steps');
    assert.equal(multi.classList.contains('is-active'), false, 'multi is not active');

    // The SegmentedControl's real control is the (visually hidden) radio — the label
    // is only the styled surface, so the keyboard/AT path is what the test drives.
    multi.querySelector('input[type="radio"]').click();
    await flushRender();
    assert.deepEqual(entered, [true], 'choosing multi fires onEnterMultiStep');
    assert.equal(reverted.length, 0, 'revert not called when entering multi');
    editHarness.remount();
  });

  it('shows multi-step selected and fires onRevertToSingleStep when switching to single', async () => {
    const entered = [];
    const reverted = [];
    const target = await editHarness.mount(
      identityProps({
        recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] },
        onEnterMultiStep: () => entered.push(true),
        onRevertToSingleStep: () => reverted.push(true),
      })
    );
    const multi = target.querySelector('[data-recipe-step-mode-option="multi"]');
    assert.ok(multi.classList.contains('is-active'), 'multi is active when steps exist');

    target.querySelector('[data-recipe-step-mode-option="single"] input[type="radio"]').click();
    await flushRender();
    assert.deepEqual(reverted, [true], 'choosing single fires onRevertToSingleStep');
    assert.equal(entered.length, 0, 'enter not called when reverting');
    editHarness.remount();
  });

  // The Simple/Complex toggle was removed (issue 643): recipe complexity is emergent
  // from the ingredient-set count, authored via the Ingredients tab's "Add ingredient
  // set" affordance, so the editor renders no recipe-mode control in any configuration.
  it('renders NO recipe-mode control (complexity is emergent from structure)', async () => {
    const single = await editHarness.mount(identityProps({ recipe: { ...RECIPE, steps: [] } }));
    assert.equal(
      single.querySelector('[data-recipe-section="recipe-mode"]'),
      null,
      'no recipe-mode section for a single-set recipe'
    );
    assert.equal(
      single.querySelector('[data-recipe-mode-option]'),
      null,
      'no Simple/Complex segmented control'
    );
    editHarness.remount();

    // Even a multi-set / multi-step recipe gets no toggle — there is nothing to toggle.
    const multi = await editHarness.mount(
      identityProps({ recipe: { ...RECIPE, steps: [{ id: 's1', name: 'Step 1', description: '' }] } })
    );
    assert.equal(
      multi.querySelector('[data-recipe-section="recipe-mode"]'),
      null,
      'no recipe-mode section for a multi-step recipe either'
    );
    editHarness.remount();
  });

  // The per-recipe Check/Ingredient routing sub-selector was removed when the
  // routing basis became a property of the system MODE (routedByIngredients /
  // routedByCheck). The editor renders no routing toggle.
  it('does not render a per-recipe routing toggle (routing basis is the system mode)', async () => {
    const target = await editHarness.mount(identityProps());
    assert.equal(
      target.querySelector('[data-recipe-section="recipe-routing"]'),
      null,
      'the routing sub-selector is gone'
    );
    editHarness.remount();
  });

  // --- the Validation tab's aggregate summary (issue 676) -------------------------
  // Rehomed from the deleted rail, which only ever showed it while this tab was open.
  // The rail took `readiness` as a PROP, so its tests could inject any state; the tab
  // derives readiness from the recipe itself, so these drive real recipes through the
  // real evaluator — the path the GM is on.
  async function openValidation(recipe) {
    const target = await editHarness.mount(identityProps({ recipe }));
    await openTab(target, 'validation');
    return target;
  }

  function summaryStatus(target) {
    return target
      .querySelector('[data-recipe-validation-summary]')
      .getAttribute('data-recipe-validation-summary');
  }

  function counts(target) {
    const n = (sel) => Number(target.querySelector(sel).textContent.trim());
    return {
      passing: n('[data-recipe-count-passing]'),
      warnings: n('[data-recipe-count-warnings]'),
      blocking: n('[data-recipe-count-blocking]'),
    };
  }

  const COMPLETE_RECIPE = {
    ...RECIPE,
    ingredientSets: [
      { id: 'set-1', name: 'Set 1', ingredientGroups: [{ id: 'g1', options: [{ id: 'o1', match: { type: 'component', componentId: 'cmp-herb' }, quantity: 1 }] }] },
    ],
    resultGroups: [{ id: 'grp-1', name: '', results: [{ id: 'res-1', componentId: 'cmp-water', quantity: 1 }] }],
  };

  it('renders the aggregate summary + count table as a header on the Validation tab', async () => {
    const target = await openValidation(COMPLETE_RECIPE);
    assert.ok(
      target.querySelector('[data-recipe-section="validation-summary"]'),
      'the summary section renders'
    );
    assert.ok(target.querySelector('[data-recipe-validation-summary]'), 'the summary card renders');
    assert.ok(target.querySelector('[data-recipe-validation-counts]'), 'the count table renders');
    // It is a HEADER over the grouped checks, not a replacement for them.
    const summary = target.querySelector('[data-recipe-section="validation-summary"]');
    const firstGroup = target.querySelector('[data-validation-group]');
    assert.ok(firstGroup, 'the grouped checks still render below it');
    assert.ok(
      summary.compareDocumentPosition(firstGroup) & globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'the checks follow the summary'
    );
    editHarness.remount();
  });

  it('shows the aggregate ONLY on the Validation tab', async () => {
    const target = await editHarness.mount(identityProps({ recipe: COMPLETE_RECIPE }));
    assert.equal(
      target.querySelector('[data-recipe-validation-summary]'),
      null,
      'no summary while another tab is active'
    );
    await openTab(target, 'validation');
    assert.ok(target.querySelector('[data-recipe-validation-summary]'), 'it appears on the Validation tab');
    editHarness.remount();
  });

  it('reads clear, with every satisfied check counted, when the recipe is complete', async () => {
    const target = await openValidation(COMPLETE_RECIPE);
    assert.equal(summaryStatus(target), 'clear', 'no issues reads as clear');
    const c = counts(target);
    assert.ok(c.passing > 0, 'the satisfied structural checks are counted');
    assert.equal(c.warnings, 0);
    assert.equal(c.blocking, 0);
    editHarness.remount();
  });

  it('reads blocked when a critical issue is present', async () => {
    // No name and no result group: both are critical, enable-blocking issues.
    const target = await openValidation({ ...COMPLETE_RECIPE, name: '', resultGroups: [] });
    assert.equal(summaryStatus(target), 'blocked', 'a critical issue reads as blocked');
    assert.ok(counts(target).blocking > 0, 'the blockers are counted');
    editHarness.remount();
  });

  // THE INVARIANT the rail's "same evaluator, can never disagree" comment protected, now
  // enforced structurally: the tab derives `readiness` ONCE and builds both the aggregate
  // and the rows from that one object. Pinning the counts against the ROWS (rather than
  // against hardcoded numbers) is what actually proves it — a second evaluator, or a
  // stale copy, breaks this and cannot break a number literal.
  it('never disagrees with the check rows it heads', async () => {
    for (const recipe of [
      COMPLETE_RECIPE,
      { ...COMPLETE_RECIPE, name: '', resultGroups: [] },
      { ...COMPLETE_RECIPE, resultGroups: [] },
    ]) {
      const target = await openValidation(recipe);
      const c = counts(target);
      const rows = [...target.querySelectorAll('.manager-recipe-val-row')];
      assert.equal(
        c.passing,
        rows.filter((r) => r.classList.contains('is-pass')).length,
        'Passing equals the number of passing rows'
      );
      assert.equal(
        c.blocking,
        rows.filter((r) => r.classList.contains('is-block')).length,
        'Blocking equals the number of blocking rows'
      );
      assert.equal(
        c.warnings,
        rows.filter((r) => r.classList.contains('is-warn')).length,
        'Warnings equals the number of warning rows'
      );
      // And the headline status is the one the rows imply.
      const expected = c.blocking > 0 ? 'blocked' : c.warnings > 0 ? 'warning' : 'clear';
      assert.equal(summaryStatus(target), expected, 'the status matches the rows below it');
      editHarness.remount();
    }
  });

  // The mini-list is NOT coming back: the grouped rows below ARE the list, and the rail
  // rendering both was the duplication.
  it('does not reintroduce the rail check mini-list', async () => {
    const target = await openValidation(COMPLETE_RECIPE);
    assert.equal(target.querySelector('[data-recipe-rail-check]'), null, 'no rail check list');
    assert.equal(target.querySelector('[data-recipe-validation-issues]'), null, 'no rail issue list');
    assert.equal(target.querySelector('[data-recipe-validation-clear]'), null, 'no rail All-clear pill');
    editHarness.remount();
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
    const hoursInput = document.querySelector(
      '[data-recipe-duration-unit="hours"] [data-stepper-input]'
    );
    assert.ok(hoursInput, 'the duration editor exposes a typeable hours input');
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
    const daysInput = document.querySelector(
      '[data-recipe-duration-unit="days"] [data-stepper-input]'
    );
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
