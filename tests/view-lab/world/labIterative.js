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

function ironworksActions() {
  const base = (id, label, extra) => ({
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
      description: 'Feed the fire.',
      effects: [gain('warm', 'heat', '2')],
    }),
    base('strike', 'Strike', {
      icon: 'fas fa-hammer',
      costs: [costOf('spend', 'heat', '1')],
      effects: [gain('shape', 'temper', '1')],
    }),
    base('quench', 'Quench', { icon: 'fas fa-droplet', usesSession: false }),
  ];
}

/** Each state's library, from the populated one; later states edit it rather than restate it. */
export const LAB_ITERATIVE_STATES = Object.freeze({
  populated: (library) => library,
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
