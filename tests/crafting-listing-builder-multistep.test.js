/**
 * Regression coverage for issue 765 — an explicit multi-step recipe surfaces no
 * required materials and the wrong product in the player crafting app.
 *
 * Unlike `crafting-listing-builder.test.js` (which drives the builder with plain
 * mock recipes), this suite wires a REAL `Recipe`, a REAL `RecipeManager` and a
 * REAL `ResolutionModeService` so the full step-aware projection chain is
 * exercised: `getExecutionSteps()` -> `_stepRecipeView` (tool union) ->
 * `evaluateCraftability` (bypassing the `ingredientSets.length === 0` early
 * return) -> first-step materials / per-step `steps[]` / terminal PRODUCES.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals required for module load + a real Recipe/RecipeManager
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((v, k) => (v == null ? undefined : v[k]), object);
}

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty,
  },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
// A default `game` so `new Recipe()` (which reads `game.user.name`) works before a
// test installs its own `game` via `makeBuilder`.
globalThis.game = { user: { isGM: true, name: 'GM' }, fabricate: {}, time: { worldTime: 0 } };

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { CraftingListingBuilder } = await import('../src/systems/CraftingListingBuilder.js');

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// A managed component matched by NAME (no registeredItemUuid): the item's name
// resolves to the component id via the system component library.
class FakeItem {
  constructor(name, quantity = 1) {
    this.id = `item-${name}`;
    this.uuid = `Item.${name}`;
    this.name = name;
    this.system = { quantity };
    this.flags = {};
  }
  getFlag() {
    return undefined;
  }
}

const TENT_COMPONENTS = [
  { id: 'c-leather', name: 'Rough Leather Scraps' },
  { id: 'c-cloth', name: 'Cloth Scrap' },
  { id: 'c-truesilver', name: 'Truesilver' },
  { id: 'c-lumber', name: 'Lumber' },
  { id: 'c-tent', name: 'Tent' },
];

function simpleSystem(overrides = {}) {
  return {
    id: 'sys-survival',
    name: 'Survival',
    resolutionMode: 'simple',
    features: { multiStepRecipes: true, ...(overrides.features || {}) },
    requirements: { time: { enabled: true }, ...(overrides.requirements || {}) },
    // The reported case: checks disabled with no authored simple formula.
    craftingCheck: {
      enabled: false,
      simple: { rollFormula: '', dc: 15 },
      routed: {},
      progressive: {},
      ...(overrides.craftingCheck || {}),
    },
    components: overrides.components ?? TENT_COMPONENTS,
    tools: overrides.tools ?? [],
  };
}

function ingredientSet(id, options) {
  return {
    id,
    ingredientGroups: options.map((opt, idx) => ({
      id: `${id}-g${idx}`,
      name: `Group ${idx + 1}`,
      options: [opt],
    })),
  };
}

// The Tent recipe from Gavin's export: two explicit steps, empty top-level arrays.
function tentRecipe({ stepDurations = [null, null], ...extra } = {}) {
  return new Recipe({
    id: 'recipe-tent',
    name: 'Tent',
    craftingSystemId: 'sys-survival',
    complex: false,
    ingredientSets: [],
    resultGroups: [],
    steps: [
      {
        id: 'step-1',
        name: 'Step 1',
        timeRequirement: stepDurations[0],
        ingredientSets: [
          ingredientSet('set-1', [
            { componentId: 'c-leather', quantity: 5 },
            { componentId: 'c-cloth', quantity: 15 },
          ]),
        ],
        resultGroups: [
          { id: 'rg-1', name: 'Truesilver', results: [{ componentId: 'c-truesilver', quantity: 1 }] },
        ],
      },
      {
        id: 'step-2',
        name: 'Step 2',
        timeRequirement: stepDurations[1],
        ingredientSets: [ingredientSet('set-2', [{ componentId: 'c-lumber', quantity: 1 }])],
        resultGroups: [
          { id: 'rg-2', name: 'Tent', results: [{ componentId: 'c-tent', quantity: 1 }] },
        ],
      },
    ],
    ...extra,
  });
}

function makeBuilder({ system = simpleSystem(), recipe, exhausted = false } = {}) {
  const craftingSystemManager = {
    getSystem: (id) => (id === system.id ? system : null),
    getRecipeItemDefinition: () => null,
  };
  // RecipeManager reads game.fabricate.getCraftingSystemManager for tool/feature reads.
  globalThis.game = {
    user: { isGM: true },
    fabricate: { getCraftingSystemManager: () => craftingSystemManager },
    time: { worldTime: 0 },
  };
  const resolutionModeService = new ResolutionModeService(craftingSystemManager);
  const recipeManager = new RecipeManager();
  const recipeVisibility = {
    getVisibleRecipes: () => [{ recipe, access: { reason: 'ok', visible: true } }],
    isKnowledgeItemExhausted: () => exhausted,
  };
  return new CraftingListingBuilder({
    recipeManager,
    recipeVisibility,
    resolutionModeService,
    craftingSystemManager,
    localize: (key) => key,
  });
}

function buildOne(opts) {
  const actor = { id: 'actor-1', items: opts.items ?? [] };
  const listing = makeBuilder(opts).buildListing({ craftingActor: actor, viewer: opts.viewer });
  return listing.recipes[0];
}

// An actor holding everything BOTH steps need (leather/cloth for step 1, lumber for
// step 2) so first-step craftability reads available.
function stockedActor() {
  return [
    new FakeItem('Rough Leather Scraps', 5),
    new FakeItem('Cloth Scrap', 15),
    new FakeItem('Lumber', 1),
  ];
}

// ---------------------------------------------------------------------------
// Sanity: the fixture actually carries per-step data
// ---------------------------------------------------------------------------

test('fixture sanity: the Tent recipe exposes real first-step ingredient sets', () => {
  const recipe = tentRecipe();
  const steps = recipe.getExecutionSteps();
  assert.equal(steps.length, 2, 'two explicit execution steps');
  assert.ok(steps[0].ingredientSets.length > 0, 'first step carries its ingredient sets');
  assert.equal(recipe.ingredientSets.length, 0, 'top-level ingredientSets is empty (stepped)');
});

// ---------------------------------------------------------------------------
// First-step materials + craftability (the primary defect)
// ---------------------------------------------------------------------------

test('projects the first step materials instead of an empty missingMaterials banner', () => {
  const recipe = buildOne({ recipe: tentRecipe(), items: stockedActor() });
  assert.equal(recipe.ingredientSets.length, 1, 'first step has one set (simple mode)');
  const states = recipe.ingredientSets[0].craftability.ingredientStates;
  const names = states.map((s) => s.name).sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, ['Cloth Scrap', 'Rough Leather Scraps']);
  assert.equal(recipe.defaultSetId, 'set-1', 'defaultSetId reflects step 1');
  assert.equal(recipe.browseStatus, 'available', 'step-1 materials present → available');
});

test('reads missingMaterials from step 1 when step-1 materials are absent', () => {
  // Only the step-2 material is held — step 1 is short, so the recipe is not craftable.
  const recipe = buildOne({ recipe: tentRecipe(), items: [new FakeItem('Lumber', 1)] });
  assert.equal(recipe.browseStatus, 'missingMaterials');
});

// ---------------------------------------------------------------------------
// steps[] projection
// ---------------------------------------------------------------------------

test('carries a steps[] projection with both steps requirements + per-step craftability', () => {
  const recipe = buildOne({ recipe: tentRecipe(), items: stockedActor() });
  assert.equal(recipe.steps.length, 2, 'both steps projected');

  const [one, two] = recipe.steps;
  assert.equal(one.label, 'Step 1');
  assert.equal(one.ingredientSets.length, 1, 'simple enforces one set per step');
  const stepOneNames = one.ingredientSets[0].craftability.ingredientStates
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(stepOneNames, ['Cloth Scrap', 'Rough Leather Scraps']);

  assert.equal(two.label, 'Step 2');
  const stepTwoNames = two.ingredientSets[0].craftability.ingredientStates.map((s) => s.name);
  assert.deepEqual(stepTwoNames, ['Lumber']);
});

test('projects each timed step duration and a field-wise multi-step aggregate', () => {
  const model = buildOne({
    recipe: tentRecipe({
      stepDurations: [
        { minutes: 30, hours: 0, days: 1, months: 0, years: 0 },
        { minutes: 0, hours: 1, days: 0, months: 2, years: 0 },
      ],
    }),
    items: stockedActor(),
  });

  assert.deepEqual(model.steps.map((step) => step.duration), [
    { minutes: 30, hours: 0, days: 1, months: 0, years: 0 },
    { minutes: 0, hours: 1, days: 0, months: 2, years: 0 },
  ]);
  assert.deepEqual(
    model.duration,
    { minutes: 30, hours: 1, days: 1, months: 2, years: 0 },
    'authored units are summed field-wise without calendar conversion'
  );
  assert.equal('time' in model.result, false, 'duration stays separate from terminal result');
});

test('omits instant step durations and aggregates only positive timed steps', () => {
  const model = buildOne({
    recipe: tentRecipe({
      stepDurations: [
        { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
        { minutes: 0, hours: 0, days: 0, months: 0, years: 0 },
      ],
    }),
    items: stockedActor(),
  });

  assert.deepEqual(model.duration, {
    minutes: 30,
    hours: 0,
    days: 0,
    months: 0,
    years: 0,
  });
  assert.deepEqual(model.steps.map((step) => step.duration), [
    { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
    null,
  ]);
});

test('labels an unnamed step by its 1-based position (never the id)', () => {
  const recipe = tentRecipe();
  recipe.steps[0].name = '';
  const model = buildOne({ recipe, items: stockedActor() });
  assert.equal(model.steps[0].label, 'FABRICATE.App.Crafting.Detail.StepFallback');
  assert.notEqual(model.steps[0].id, model.steps[0].label);
});

// ---------------------------------------------------------------------------
// PRODUCES = terminal step
// ---------------------------------------------------------------------------

test('PRODUCES resolves the TERMINAL step output (Tent), not step 1 (Truesilver)', () => {
  const recipe = buildOne({ recipe: tentRecipe(), items: stockedActor() });
  assert.deepEqual(
    recipe.result.items.map((i) => i.name),
    ['Tent'],
    'the final product, not the first step intermediate'
  );
});

// ---------------------------------------------------------------------------
// Disabled check card
// ---------------------------------------------------------------------------

test('suppresses the crafting-check card when checks are disabled with no formula', () => {
  const recipe = buildOne({ recipe: tentRecipe(), items: stockedActor() });
  assert.equal(recipe.check, null, 'no empty DC-only card for a disabled, formula-less check');
});

// ---------------------------------------------------------------------------
// Single-step parity
// ---------------------------------------------------------------------------

test('a single-step simple recipe is unchanged: steps[] is empty', () => {
  const single = new Recipe({
    id: 'recipe-single',
    name: 'Rope',
    craftingSystemId: 'sys-survival',
    complex: false,
    ingredientSets: [ingredientSet('set-rope', [{ componentId: 'c-cloth', quantity: 3 }])],
    resultGroups: [{ id: 'rg', name: 'Rope', results: [{ componentId: 'c-tent', quantity: 1 }] }],
  });
  const recipe = buildOne({ recipe: single, items: [new FakeItem('Cloth Scrap', 3)] });
  assert.deepEqual(recipe.steps, [], 'single-step recipe carries no steps[] projection');
  assert.equal(recipe.ingredientSets.length, 1);
  assert.equal(recipe.result.items[0].name, 'Tent');
});

test('projects an implicit recipe duration separately from its terminal result', () => {
  const single = new Recipe({
    id: 'recipe-single-timed',
    name: 'Rope',
    craftingSystemId: 'sys-survival',
    complex: false,
    timeRequirement: { minutes: 15, hours: 2, days: 0, months: 0, years: 0 },
    ingredientSets: [ingredientSet('set-rope', [{ componentId: 'c-cloth', quantity: 3 }])],
    resultGroups: [{ id: 'rg', name: 'Rope', results: [{ componentId: 'c-tent', quantity: 1 }] }],
  });
  const model = buildOne({ recipe: single, items: [new FakeItem('Cloth Scrap', 3)] });

  assert.deepEqual(model.duration, {
    minutes: 15,
    hours: 2,
    days: 0,
    months: 0,
    years: 0,
  });
  assert.equal('time' in model.result, false);
});

test('does not project stale recipe-level duration for an explicit one-step recipe', () => {
  const explicit = new Recipe({
    id: 'recipe-explicit-single-timed',
    name: 'Rope',
    craftingSystemId: 'sys-survival',
    complex: false,
    timeRequirement: { minutes: 0, hours: 9, days: 0, months: 0, years: 0 },
    ingredientSets: [],
    resultGroups: [],
    steps: [
      {
        id: 'step-rope',
        name: 'Twist rope',
        timeRequirement: { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
        ingredientSets: [
          ingredientSet('set-rope', [{ componentId: 'c-cloth', quantity: 3 }]),
        ],
        resultGroups: [
          { id: 'rg', name: 'Rope', results: [{ componentId: 'c-tent', quantity: 1 }] },
        ],
      },
    ],
  });
  const model = buildOne({
    recipe: explicit,
    items: [new FakeItem('Cloth Scrap', 3)],
  });

  assert.equal(explicit.getExecutionSteps()[0].timeRequirement.minutes, 30);
  assert.equal(model.duration, null, 'the stale recipe-level 9 hr duration is not advertised');
});

test('suppresses authored recipe and step durations when time requirements are disabled', () => {
  const source = tentRecipe({
    stepDurations: [
      { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
      { minutes: 0, hours: 1, days: 0, months: 0, years: 0 },
    ],
  });
  const model = buildOne({
    system: simpleSystem({ requirements: { time: { enabled: false } } }),
    recipe: source,
    items: stockedActor(),
  });

  assert.equal(model.duration, null);
  assert.deepEqual(model.steps.map((step) => step.duration), [null, null]);
  assert.equal(source.steps[0].timeRequirement.minutes, 30, 'projection does not mutate authoring');
});

// ---------------------------------------------------------------------------
// Teaser redaction keeps steps: []
// ---------------------------------------------------------------------------

test('teaser redaction: steps[] and detail are redacted for a non-GM teaser', () => {
  const recipe = tentRecipe();
  const system = simpleSystem();
  const craftingSystemManager = {
    getSystem: (id) => (id === system.id ? system : null),
    getRecipeItemDefinition: () => null,
  };
  globalThis.game = {
    user: { isGM: false },
    fabricate: { getCraftingSystemManager: () => craftingSystemManager },
    time: { worldTime: 0 },
  };
  const builder = new CraftingListingBuilder({
    recipeManager: new RecipeManager(),
    recipeVisibility: {
      getVisibleRecipes: () => [
        {
          recipe,
          access: {
            reason: 'teaser',
            visible: true,
            teaserState: { hiddenFields: ['ingredients', 'results', 'description'] },
          },
        },
      ],
      isKnowledgeItemExhausted: () => false,
    },
    resolutionModeService: new ResolutionModeService(craftingSystemManager),
    craftingSystemManager,
    localize: (key) => key,
  });
  const model = builder.buildListing({
    craftingActor: { id: 'actor-1', items: [] },
    viewer: { id: 'player-1', isGM: false },
  }).recipes[0];
  assert.deepEqual(model.steps, [], 'no step data leaks on a teaser');
  assert.equal(model.duration, null, 'no aggregate or recipe duration leaks on a teaser');
  assert.equal('time' in model.result, false, 'duration is not smuggled through terminal result');
  assert.equal(model.browseStatus, 'discovery');
});

// ---------------------------------------------------------------------------
// Tool union (D1) — mutation-killing pin
// ---------------------------------------------------------------------------

// A two-step simple recipe carrying a RECIPE-level tool AND a distinct STEP-level
// tool on step 1, so the first-step craftability must evaluate the UNION of both.
function toolUnionRecipe() {
  return new Recipe({
    id: 'recipe-tools',
    name: 'Warded Tent',
    craftingSystemId: 'sys-survival',
    complex: false,
    toolIds: ['tool-needle'],
    ingredientSets: [],
    resultGroups: [],
    steps: [
      {
        id: 'step-1',
        name: 'Stitch',
        toolIds: ['tool-awl'],
        ingredientSets: [ingredientSet('set-1', [{ componentId: 'c-cloth', quantity: 1 }])],
        resultGroups: [{ id: 'rg-1', name: 'Panel', results: [{ componentId: 'c-truesilver', quantity: 1 }] }],
      },
      {
        id: 'step-2',
        name: 'Raise',
        ingredientSets: [ingredientSet('set-2', [{ componentId: 'c-lumber', quantity: 1 }])],
        resultGroups: [{ id: 'rg-2', name: 'Tent', results: [{ componentId: 'c-tent', quantity: 1 }] }],
      },
    ],
  });
}

const TOOL_SYSTEM = simpleSystem({
  components: [
    ...TENT_COMPONENTS,
    { id: 'c-needle', name: 'Bone Needle' },
    { id: 'c-awl', name: 'Iron Awl' },
  ],
  tools: [
    { id: 'tool-needle', componentId: 'c-needle' },
    { id: 'tool-awl', componentId: 'c-awl' },
  ],
});

test('first-step craftability requires BOTH the recipe-level and step-level tools (union)', () => {
  const recipe = buildOne({
    system: TOOL_SYSTEM,
    recipe: toolUnionRecipe(),
    items: [
      new FakeItem('Cloth Scrap', 1),
      new FakeItem('Bone Needle', 1),
      new FakeItem('Iron Awl', 1),
    ],
  });
  const toolNames = recipe.ingredientSets[0].craftability.toolStates
    .map((t) => t.name)
    .sort((a, b) => a.localeCompare(b));
  // If _stepRecipeView dropped to recipe-only or step-only toolIds, one of these
  // would vanish and this assertion would fail.
  assert.deepEqual(toolNames, ['Bone Needle', 'Iron Awl'], 'both tools evaluated (union)');
  assert.equal(recipe.browseStatus, 'available', 'both tools present → craftable');
});

test('a missing union tool flips first-step craftability to not craftable', () => {
  const recipe = buildOne({
    system: TOOL_SYSTEM,
    recipe: toolUnionRecipe(),
    // Hold the step-level awl but NOT the recipe-level needle.
    items: [new FakeItem('Cloth Scrap', 1), new FakeItem('Iron Awl', 1)],
  });
  assert.equal(recipe.ingredientSets[0].craftability.canCraft, false, 'missing needle → not craftable');
  assert.equal(recipe.browseStatus, 'missingMaterials');
});

// ---------------------------------------------------------------------------
// Non-simple multi-step (Q3) — step-list body is simple-only, first step still evaluated
// ---------------------------------------------------------------------------

test('routedByCheck multi-step: first step evaluated, empty top-level result, steps: []', () => {
  const system = simpleSystem({
    features: { multiStepRecipes: true },
    craftingCheck: {
      enabled: true,
      simple: {},
      routed: { rollFormula: '1d20', dc: 15, type: 'relative', relativeOutcomes: [] },
      progressive: {},
    },
  });
  system.resolutionMode = 'routedByCheck';
  const recipe = buildOne({ system, recipe: tentRecipe(), items: stockedActor() });
  assert.notEqual(recipe.browseStatus, undefined);
  assert.equal(recipe.ingredientSets.length, 1, 'first step sets still projected');
  assert.deepEqual(recipe.result.items, [], 'routedByCheck top-level result stays empty');
  assert.deepEqual(recipe.steps, [], 'step-list body is simple-only');
});

test('progressive multi-step hides stale recipe duration and carries no simple step-list', () => {
  const system = simpleSystem({
    features: { multiStepRecipes: true },
    craftingCheck: {
      enabled: true,
      simple: {},
      routed: {},
      progressive: { rollFormula: '1d20', awardMode: 'equal' },
    },
  });
  system.resolutionMode = 'progressive';
  const recipe = buildOne({
    system,
    recipe: tentRecipe({
      timeRequirement: { minutes: 0, hours: 9, days: 0, months: 0, years: 0 },
      stepDurations: [
        { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
        { minutes: 0, hours: 1, days: 0, months: 0, years: 0 },
      ],
    }),
    items: stockedActor(),
  });

  assert.equal(recipe.duration, null, 'the stale recipe-level 9 hr duration is not advertised');
  assert.deepEqual(recipe.steps, [], 'progressive carries no simple step-list');
});
