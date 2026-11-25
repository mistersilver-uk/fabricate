/**
 * The iterative library's lab world (issue 3009): Ironworks, the one `iterative` system, added to
 * the lab only when a frame asks for it through `query.iterative`, so no existing frame changes.
 * Each state names how the seeded library differs from the populated one.
 */
import { ICON_BASE, LAB_SYSTEM_IDS, recipe } from './labContent.js';

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
      effects: [gain('shape', 'temper', '1')],
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
  // An action costing a counter the library does not hold: one blocking issue.
  invalid: (library) => ({
    ...library,
    actions: [
      ...library.actions,
      baseAction('smelt', 'Smelt ore', {
        icon: 'fas fa-industry',
        check: 'roll',
        costs: [costOf('ore', 'ore', '2')],
      }),
    ],
  }),
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
      routed: {
        type: 'fixed',
        rollFormula: '1d20',
        fixedOutcomes: [{ id: 'hit', name: 'Hit', success: true, start: 10 }],
      },
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
  content.recipes.push(...structuredClone(IRONWORKS_RECIPES));
}
