/**
 * The iterative library's lab world (issue 3009): Ironworks, the one `iterative` system, added to
 * the lab only when a frame asks for it through `query.iterative`, so no existing frame changes.
 * Each state names how the seeded library differs from the populated one.
 */
import { component, ICON_BASE, LAB_SYSTEM_IDS, recipe, simpleSet } from './labContent.js';
import { installLabRunStates } from './labRunStates.js';

const counter = (id, label, extra = {}) => ({ id, label, limit: 'none', ...extra });
const costOf = (id, counterId, amount) => ({ id, counterId, amount, needsEnough: true });

const IRONWORKS_COUNTERS = Object.freeze([
  counter('heat', 'Heat', {
    description: 'How hot the iron is.',
    limit: 'perRecipe',
    min: 0,
    max: 10,
  }),
  counter('temper', 'Temper', { limit: 'global', min: 0, max: 5 }),
  counter('slag', 'Slag'),
]);

const baseAction = (id, label, extra) => ({
  id,
  label,
  categories: [],
  usesSession: true,
  availability: { combine: 'all', rules: [] },
  costs: [],
  check: 'none',
  effects: [],
  ...extra,
});

function ironworksActions() {
  const base = baseAction;
  const gain = (id, counterId, amount) => ({
    id,
    when: { combine: 'all' },
    target: { kind: 'counter', counterId },
    op: 'add',
    amount,
  });
  return [
    base('stoke', 'Stoke the forge', {
      icon: 'fas fa-fire',
      categories: ['Fire'],
      description: 'Feed the fire.',
      effects: [gain('warm', 'heat', '2')],
    }),
    base('strike', 'Strike', {
      icon: 'fas fa-hammer',
      categories: ['Forging'],
      check: 'roll',
      costs: [costOf('spend', 'heat', '1')],
      effects: [
        {
          ...gain('shape', 'temper', '1'),
          name: 'Shape the iron',
          when: {
            combine: 'all',
            rules: [{ source: 'counter', counterId: 'heat', op: '>=', value: 1 }],
          },
        },
      ],
    }),
    base('quench', 'Quench', { icon: 'fas fa-droplet', categories: ['Fire'], usesSession: false }),
  ];
}

/** Each state's library, from the populated one; later states edit it rather than restate it. */
export const LAB_ITERATIVE_STATES = Object.freeze({
  populated: (library) => library,
  // No counters, so no action can be authored either.
  empty: (library) => ({ ...library, counters: [], actions: [] }),
  // Two counters whose names collide once case and space are ignored, as an import can carry.
  duplicate: (library) => ({
    ...library,
    counters: [
      ...library.counters,
      counter('heatAgain', 'heat ', { description: 'Working heat.' }),
    ],
  }),
  // Temper's minimum above its maximum: persisted, and blocking in Validation.
  inverted: (library) => ({
    ...library,
    counters: library.counters.map((entry) =>
      entry.id === 'temper' ? { ...entry, min: 7, max: 5 } : entry
    ),
  }),
  // Written by a newer build, so the screens read it and refuse every write.
  newer: (library) => ({ ...library, version: 2 }),
  // Counters to spend, and no action using them yet.
  noActions: (library) => ({ ...library, actions: [] }),
  // Nothing to fix, and no recipe to fault (see `RECIPELESS_STATES`): Validation reads ready.
  ready: (library) => library,
  // Actions costing counters the library does not hold or amounts it cannot read, and a counter
  // whose minimum is above its maximum, so Validation lists both library groups.
  invalid: (library) => ({
    ...LAB_ITERATIVE_STATES.inverted(library),
    actions: [
      ...library.actions,
      baseAction('smelt', 'Smelt ore', {
        icon: 'fas fa-industry',
        check: 'roll',
        costs: [costOf('ore', 'ore', '2')],
      }),
      // A cost amount that does not parse, and an effect on a counter the library lacks.
      baseAction('refine', 'Refine ore', {
        icon: 'fas fa-filter',
        costs: [costOf('spend', 'heat', '2 +')],
        effects: [
          {
            id: 'burn',
            when: { combine: 'all' },
            target: { kind: 'counter', counterId: 'ore' },
            op: 'add',
            amount: '1',
          },
        ],
      }),
    ],
  }),
  // The routed crafting check has no roll formula (see `ROUTED_CHECKS`), so a rolling action warns.
  noCheck: (library) => ({
    ...library,
    actions: library.actions.map((action) =>
      action.id === 'stoke'
        ? {
            ...action,
            effects: action.effects.map((effect) => ({
              ...effect,
              when: { combine: 'all', success: true },
            })),
          }
        : action
    ),
  }),
  // The routed crafting check counts successes and wins under its target (see `ROUTED_CHECKS`).
  countUnder: (library) => library,
  // Enough actions that the ten-row page breaks, so page two and the page size are reachable.
  paged: (library) => ({
    ...library,
    actions: [
      ...library.actions,
      ...Array.from({ length: 10 }, (_, index) =>
        baseAction(`drill${index + 1}`, `Drill ${index + 1}`, { icon: 'fas fa-gears' })
      ),
    ],
  }),
});

/** The states whose world carries no recipe, whose own readiness the frame is not about. */
const RECIPELESS_STATES = new Set(['ready']);

const ROUTED_HIT = Object.freeze({
  type: 'fixed',
  rollFormula: '1d20',
  fixedOutcomes: [{ id: 'hit', name: 'Hit', success: true, start: 10 }],
});

/** The states whose routed crafting check is not the default one. */
const ROUTED_CHECKS = Object.freeze({
  noCheck: { ...ROUTED_HIT, rollFormula: '' },
  countUnder: {
    ...ROUTED_HIT,
    rollFormula: '4d10',
    evaluation: {
      product: 'count',
      direction: 'under',
      pool: { die: 10, base: '4', threshold: '3', required: 1 },
    },
  },
});

const IRONWORKS_RECIPES = [
  recipe('iw-r-blade', 'Tempered Blade', LAB_SYSTEM_IDS.IRONWORKS, 'tools/smithing/anvil.webp', {
    categories: ['Forging'],
    iterative: {
      counters: [{ counterId: 'heat', start: 0 }],
      step: {
        actions: { mode: 'only', actionIds: ['strike'] },
        success: [{ source: 'counter', counterId: 'heat', op: '>=', value: 8 }],
      },
    },
  }),
];

/** Adds Ironworks to `content` for the named state; any other state leaves `content` untouched. */
export function seedIterativeState(content, stateId) {
  if (!Object.hasOwn(LAB_ITERATIVE_STATES, stateId)) return;
  const library = LAB_ITERATIVE_STATES[stateId]({
    version: 1,
    counters: structuredClone(IRONWORKS_COUNTERS),
    actions: ironworksActions(),
  });
  content.systems.push({
    id: LAB_SYSTEM_IDS.IRONWORKS,
    name: 'Ironworks',
    description: 'Forge work in sessions: stoke the fire, strike the iron, quench the blade.',
    img: `${ICON_BASE}/tools/smithing/anvil.webp`,
    enabled: true,
    visibilityMode: 'global',
    resolutionMode: 'iterative',
    // The one routed check every rolling action reads, so a rolling action is ready as authored.
    craftingCheck: {
      enabled: true,
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
      failureResultPolicy: 'perRecord',
      routed: structuredClone(ROUTED_CHECKS[stateId] ?? ROUTED_HIT),
    },
    features: { recipeCategories: true, itemTags: true, gathering: false },
    essenceDefinitions: [],
    categories: ['Forging'],
    itemTags: [],
    components: [],
    componentCategories: [],
    recipeItemDefinitions: [],
    tools: [],
    gatheringRealmSettings: { enabled: false },
    iterative: library,
  });
  if (!RECIPELESS_STATES.has(stateId)) content.recipes.push(...structuredClone(IRONWORKS_RECIPES));
}

const heatAtLeast = (value) => ({ source: 'counter', counterId: 'heat', op: '>=', value });
const onlyActions = (...actionIds) => ({ mode: 'only', actionIds });
const successLine = { end: 'success' };
const barOf = (quantity) => ({ componentId: 'iw-iron-bar', quantity });
const bladeOf = () => ({ componentId: 'iw-steel-blade', quantity: 1 });
const IRONWORKS_ICON = 'commodities/metal/ingot-worn-iron.webp';

/** The authoring recipes; the oracle table in `iterative-recipe-issues.test.js` pins what each raises. */
function authoringRecipes() {
  const forge = (id, name, config) =>
    recipe(id, name, LAB_SYSTEM_IDS.IRONWORKS, IRONWORKS_ICON, {
      categories: ['Forging'],
      ...config,
    });
  const bladeGroup = (extra = {}) => ({ id: 'rg', results: [bladeOf()], ...extra });
  return [
    forge('iw-r-blade', 'Tempered Blade', {
      ingredientSets: [simpleSet('s1', { 'iw-iron-bar': 2 })],
      resultGroups: [bladeGroup({ producedWhen: [successLine] })],
      iterative: {
        counters: [{ counterId: 'heat', start: 0 }],
        step: { actions: onlyActions('strike'), success: [heatAtLeast(8)] },
      },
    }),
    forge('iw-r-ingot', 'Rough Ingot', {
      ingredientSets: [simpleSet('s1', { 'iw-iron-bar': 3 })],
      resultGroups: [{ id: 'rg', results: [barOf(1)] }],
    }),
    forge('iw-r-nail', 'Bent Nail', {
      ingredientSets: [simpleSet('s1', { 'iw-iron-bar': 1 })],
      resultGroups: [bladeGroup({ producedWhen: [successLine] })],
      iterative: {
        counters: [
          { counterId: 'heat', start: 0 },
          { counterId: 'rust', start: 0 },
        ],
        step: { actions: onlyActions('anneal'), success: [heatAtLeast(6)] },
      },
    }),
    forge('iw-r-hinge', 'Heavy Hinge', {
      resultGroups: [{ id: 'rg', results: [barOf(2)] }],
      iterative: {
        counters: [
          { counterId: 'heat', start: 0 },
          { counterId: 'temper', start: 0 },
          { counterId: 'slag', start: 0, startFormula: '2 + 1d4' },
        ],
        step: {
          actions: onlyActions('stoke', 'strike'),
          lockedCounterIds: ['temper'],
          success: [heatAtLeast(7)],
        },
      },
    }),
    forge('iw-r-rivet', 'Cracked Rivet', {
      ingredientSets: [simpleSet('s1', { 'iw-iron-bar': 1 })],
      resultGroups: [bladeGroup({ producedWhen: [successLine] })],
      iterative: {
        counters: [
          { counterId: 'heat', start: 3, min: 8, max: 4 },
          { counterId: 'temper', start: 9 },
          { counterId: 'slag', start: null },
        ],
        step: { actions: onlyActions('stoke'), success: [heatAtLeast(8)] },
      },
    }),
    forge('iw-r-sword', 'Etched Sword', {
      iterative: {
        counters: [
          { counterId: 'heat', start: 0 },
          { counterId: 'temper', start: 0 },
          { counterId: 'slag', start: 0, visible: false },
        ],
      },
      steps: [
        {
          id: 'iw-sword-heat',
          name: 'Heat the blank',
          ingredientSets: [simpleSet('s1', { 'iw-iron-bar': 2 })],
          resultGroups: [
            { id: 'g1', results: [barOf(1)], producedWhen: [successLine] },
            { id: 'g1-fail', role: 'failure', results: [barOf(1)], producedWhen: [successLine] },
          ],
          iterative: {
            actions: { mode: 'all', actionIds: [] },
            hiddenCounterIds: ['slag'],
            lockedCounterIds: ['temper'],
            success: [heatAtLeast(6)],
            failure: [{ source: 'counter', counterId: 'slag', op: '>=', value: 5 }],
          },
        },
        {
          id: 'iw-sword-etch',
          name: 'Etch the fuller',
          ingredientSets: [simpleSet('s1', { 'iw-iron-bar': 1 })],
          resultGroups: [{ id: 'g2', results: [bladeOf()], producedWhen: [successLine] }],
          iterative: { actions: { mode: 'all', actionIds: [] }, success: [], failure: [] },
        },
      ],
    }),
  ];
}

const ironworksComponents = () => [
  component('iw-iron-bar', 'Iron Bar', IRONWORKS_ICON, { categories: ['Stock'] }),
  component('iw-steel-blade', 'Steel Blade', 'weapons/swords/sword-guard-worn.webp', {
    categories: ['Stock'],
  }),
];

const ironworksOf = (content) =>
  content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.IRONWORKS);

/** Replaces the system's recipes by id, so the seeded Blade becomes its authoring twin with no duplicate. */
function authoring(content) {
  const system = ironworksOf(content);
  if (!system) return null;
  const components = ironworksComponents();
  system.components = components;
  system.componentCategories = ['Stock'];
  system.features = { ...system.features, multiStepRecipes: true };
  content.components.push(...structuredClone(components));
  const recipes = authoringRecipes();
  const ids = new Set(recipes.map((entry) => entry.id));
  content.recipes = [...content.recipes.filter((entry) => !ids.has(entry.id)), ...recipes];
  return system;
}

/** Two Blade workpieces in progress, kept on the last lab actor so the Journal's own actor is untouched. */
function installMidRunWorkpieces(content, actors) {
  const actor = actors.at(-1);
  const system = ironworksOf(content);
  const blade = content.recipes.find((entry) => entry.id === 'iw-r-blade');
  const strike = system.iterative.actions.find((entry) => entry.id === 'strike');
  const run = (id) => ({
    id,
    actorUuid: actor.uuid,
    userId: 'user-lab-player',
    craftingSystemId: system.id,
    recipeId: blade.id,
    status: 'inProgress',
    startedAt: 1_209_600 - 7200,
    updatedAt: 1_209_600 - 3600,
    currentStepIndex: 0,
    steps: [{ index: 0, status: 'inProgress', consumedIngredients: [], usedTools: [] }],
    componentSourceActorUuids: [actor.uuid],
    termsSnapshot: {
      recipe: structuredClone(blade),
      craftingCheck: structuredClone(system.craftingCheck),
      iterative: {
        version: 1,
        counters: structuredClone(system.iterative.counters),
        actions: structuredClone([strike]),
      },
    },
  });
  const active = Object.fromEntries(['iw-run-1', 'iw-run-2'].map((id) => [id, run(id)]));
  installLabRunStates(actor, { craftingRuns: { active, history: [] } });
}

/** Each recipe state edits the seeded Ironworks; `authoring` is the base the others build on. */
export const LAB_ITERATIVE_RECIPE_STATES = Object.freeze({
  authoring: (content) => {
    authoring(content);
  },
  multiStepOff: (content) => {
    const system = authoring(content);
    if (system) system.features = { ...system.features, multiStepRecipes: false };
  },
  midRun: (content, actors) => {
    if (authoring(content)) installMidRunWorkpieces(content, actors);
  },
  // No counters in the library, so a recipe has none to add.
  noLibrary: (content) => {
    const system = authoring(content);
    if (system) system.iterative = { ...system.iterative, counters: [], actions: [] };
  },
});

/** Authors the Ironworks recipes for the named state; any other state, or no Ironworks, changes nothing. */
export function seedIterativeRecipes(content, actors, state) {
  if (!Object.hasOwn(LAB_ITERATIVE_RECIPE_STATES, state)) return;
  LAB_ITERATIVE_RECIPE_STATES[state](content, actors);
}
