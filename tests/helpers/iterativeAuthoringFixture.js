/**
 * The full authoring fixture switched to `iterative` mode, with every persisted iterative key
 * authored in the shape its normalizer emits, so a round trip can compare each field verbatim.
 * Built on a fresh `buildFullAuthoringFixture()` result, which it never edits.
 */
import { buildFullAuthoringFixture, FIXTURE_SYSTEM_ID } from './fullAuthoringFixture.js';

export const ITERATIVE_SINGLE_RECIPE_ID = 'recipe-tempered-blade';
export const ITERATIVE_MULTI_RECIPE_ID = 'recipe-forged-shield';

const atLeast = (counterId, value) => ({ source: 'counter', counterId, op: '>=', value });

function iterativeLibrary() {
  return {
    version: 1,
    counters: [
      {
        id: 'heat',
        label: 'Heat',
        description: 'How hot the work is.',
        limit: 'perRecipe',
        min: 0,
        max: 20,
      },
      { id: 'ember', label: 'Embers', limit: 'global', min: 0, max: 5 },
    ],
    actions: [
      {
        id: 'inspect',
        label: 'Inspect',
        categories: [],
        usesSession: false,
        availability: { combine: 'all', rules: [] },
        costs: [],
        check: 'none',
        effects: [],
      },
      {
        id: 'hammer',
        label: 'Hammer',
        description: 'Strike while the iron is hot.',
        icon: 'fas fa-hammer',
        categories: ['shaping'],
        usesSession: true,
        availability: {
          combine: 'any',
          rules: [
            { source: 'previousAction', actionIds: ['inspect'] },
            { source: 'sessionCount', op: '<', value: 4 },
          ],
        },
        costs: [{ id: 'stoke', counterId: 'ember', amount: '1', needsEnough: true }],
        check: 'roll',
        effects: [
          {
            id: 'shape',
            name: 'Shape',
            description: 'A clean strike.',
            when: {
              combine: 'all',
              checkOutcomeIds: ['tier-hit'],
              success: true,
              value: { op: '>=', value: 12 },
              rules: [atLeast('heat', 5)],
            },
            target: { kind: 'counter', counterId: 'heat' },
            op: 'add',
            amount: '1d4 + @counter.ember',
          },
        ],
      },
    ],
  };
}

const stepConfig = (actionIds) => ({
  actions: { mode: 'only', actionIds },
  hiddenCounterIds: ['ember'],
  lockedCounterIds: [],
  success: [atLeast('heat', 10)],
  failure: [{ source: 'sessionCount', op: '>', value: 6 }],
});

function resultGroups(prefix) {
  return [
    {
      id: `${prefix}-made`,
      name: 'Made',
      producedWhen: [
        { end: 'success', rules: [atLeast('heat', 15)] },
        { end: 'success', rules: [] },
      ],
      results: [{ id: `${prefix}-ore`, componentId: 'comp-ore', quantity: 1 }],
    },
    {
      id: `${prefix}-slag`,
      name: 'Slag',
      role: 'failure',
      producedWhen: [{ end: 'failure', rules: [] }],
      results: [{ id: `${prefix}-ember`, componentId: 'ember', quantity: 1 }],
    },
  ];
}

const ingredientSets = (id) => [
  { id, ingredientOptions: [{ id: `${id}-opt`, ingredients: { 'comp-ore': 1 } }] },
];

function singleStepRecipe() {
  return {
    id: ITERATIVE_SINGLE_RECIPE_ID,
    name: 'Tempered Blade',
    craftingSystemId: FIXTURE_SYSTEM_ID,
    enabled: true,
    iterative: {
      counters: [
        {
          counterId: 'heat',
          start: 2,
          startFormula: '1d4',
          min: 1,
          max: 18,
          target: 12,
          visible: true,
        },
        { counterId: 'ember', start: 3, visible: false },
      ],
      step: stepConfig(['inspect', 'hammer']),
    },
    ingredientSets: ingredientSets('blade-set'),
    resultGroups: resultGroups('blade'),
  };
}

function multiStepRecipe() {
  const step = (id, name, actionIds) => ({
    id,
    name,
    description: '',
    ingredientSets: ingredientSets(`${id}-set`),
    resultGroups: resultGroups(id),
    toolIds: [],
    timeRequirement: null,
    outcomeRouting: null,
    resultSelection: null,
    iterative: stepConfig(actionIds),
  });
  return {
    id: ITERATIVE_MULTI_RECIPE_ID,
    name: 'Forged Shield',
    craftingSystemId: FIXTURE_SYSTEM_ID,
    enabled: true,
    iterative: { counters: [{ counterId: 'heat', start: 0, visible: true }] },
    steps: [
      step('shield-rough', 'Rough out', ['hammer']),
      step('shield-finish', 'Finish', ['inspect']),
    ],
  };
}

/** An iterative system with multi-step recipes on, its library, and one single- and one multi-step recipe. */
export function buildIterativeAuthoringFixture() {
  const fixture = buildFullAuthoringFixture();
  const { system } = fixture;
  system.resolutionMode = 'iterative';
  system.features = { ...system.features, multiStepRecipes: true };
  system.craftingCheck.routed = {
    type: 'fixed',
    rollFormula: '1d20',
    fixedOutcomes: [{ id: 'tier-hit', name: 'Hit', success: true, start: 10 }],
  };
  system.components.push({
    id: 'ember',
    name: 'Ember',
    originItemUuid: 'Compendium.world.items.Item.ember',
    categories: ['Reagents'],
    tags: [],
    essences: {},
    aliasItemUuids: [],
  });
  system.iterative = iterativeLibrary();
  fixture.recipes.push(singleStepRecipe(), multiStepRecipe());
  return fixture;
}
