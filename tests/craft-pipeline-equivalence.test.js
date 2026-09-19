/** The effect-journal pin over `CraftingEngine.craft()` and `salvage()` (issue 1701): one flat,
 * ordered journal per scenario, committed here and byte-frozen through the pipeline split. */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  craftProbe,
  probeResolutionService,
  salvageProbe,
  versionedExecutionKey,
  PROBE_CURRENCY_UNITS,
} from './helpers/craftPipelineProbe.js';
import { stubRoll } from './helpers/routedCheckEngine.js';

const RELATIVE_TIERS = [
  { id: 't-fine', name: 'Fine', success: true, breakTools: false, dc: 0 },
  { id: 't-botch', name: 'Botch', success: false, breakTools: false, dc: -10 },
];

const ROUTED = {
  rollFormula: '1d20',
  dc: 15,
  thresholdMode: 'meet',
  dcMode: 'static',
  type: 'relative',
  relativeOutcomes: RELATIVE_TIERS,
  fixedOutcomes: [],
  tiers: [],
  checkBreakage: { triggers: [] },
};

const PASS_FAIL = { rollFormula: '1d20', dc: 15, thresholdMode: 'meet' };

const TIMED_STEPS = [
  {
    ingredients: [{ componentId: 'wood', quantity: 2 }],
    results: [{ componentId: 'plank', quantity: 1 }],
    timeRequirement: { hours: 1 },
  },
];

/** Award the step's reserved `role: 'failure'` group on a failed check, its others on success. */
const ROLE_ROUTED_GROUPS = ({ step, checkResult }) =>
  checkResult?.success
    ? {
        groups: step.resultGroups.filter((group) => group.role !== 'failure'),
        meta: { disposition: 'success' },
      }
    : {
        groups: step.resultGroups.filter((group) => group.role === 'failure'),
        meta: { disposition: 'failure' },
      };

const GM_COMPLICATION = {
  id: 'x1',
  name: 'Shrapnel',
  description: 'Splinters fly.',
  severity: 'major',
  visibility: 'gmOnly',
  activities: { crafting: true, salvage: false, gathering: false },
  match: 'any',
  when: { stageAwarded: true, stagePartial: false, stageMissed: false, checkTrigger: null },
  rollCondition: { enabled: false, expr: '', cmp: 'gte', value: '' },
  effectRoll: { enabled: false, expr: '', label: '' },
  macroUuid: 'Macro.secret',
};

/** Opening a craft: the run lifecycle every refusal past the input guards still records. */
const RUN_OPENED = [
  ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
  ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
  ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
];

/** The `finally` discard of a run this call created and never resolved. */
const PHANTOM_DISCARDED = [
  ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
  ['run.discardRun', 'Actor:Crafter', 'rid-1'],
];

/** A refusal journal: the run lifecycle, any gate it reached, the discard, and the message. */
const refused = (message, ...gates) => [
  ...RUN_OPENED,
  ...gates,
  ...PHANTOM_DISCARDED,
  ['returned', { success: false, results: null, message }],
];

/** Each refusal return inside the pipeline spans, with the world that reaches it. */
const REFUSALS = [
  {
    name: 'no crafting actor',
    async run() {
      const world = craftProbe({});
      await world.craftWith(null, [world.sourceActor]);
      return world.journal.entries;
    },
    journal: [
      ['returned', { success: false, results: null, message: 'No crafting actor selected' }],
    ],
  },
  {
    name: 'no component source actors',
    async run() {
      const world = craftProbe({});
      await world.craftWith(world.craftingActor, []);
      return world.journal.entries;
    },
    journal: [
      ['returned', { success: false, results: null, message: 'No component source actors selected' }],
    ],
  },
  {
    name: 'invalid recipe',
    async run() {
      const world = craftProbe({ recipeValid: false });
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['returned', { success: false, results: null, message: 'Invalid recipe: no result groups' }],
    ],
  },
  ...[
    ['missing-system', 'Crafting system not found'],
    ['system-invalid', 'Crafting system is invalid'],
    ['visibility', 'Recipe is not visible to this user'],
    ['knowledge', 'Missing recipe knowledge'],
    ['locked', 'Recipe is locked'],
    ['unmapped', 'Crafting is blocked by recipe access rules'],
  ].map(([reason, message]) => ({
    name: `recipe access guard: ${reason}`,
    async run() {
      const world = craftProbe({ visibilityGuard: { craftable: false, reason } });
      await world.craft();
      return world.journal.entries;
    },
    journal: refused(message),
  })),
  {
    name: 'no active crafting step',
    async run() {
      const world = craftProbe({ noActiveStep: true });
      await world.craft();
      return world.journal.entries;
    },
    journal: refused('No active crafting step available'),
  },
  {
    name: 'mode validation refuses the recipe',
    async run() {
      const world = craftProbe({
        resolutionService: probeResolutionService({
          validateRecipe: { valid: false, errors: ['no results'] },
        }),
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: refused('Mode validation failed: no results'),
  },
  {
    name: 'missing required items',
    async run() {
      const world = craftProbe({
        canCraft: false,
        missing: {
          ingredients: [
            {
              ingredient: {
                match: { type: 'component', componentId: 'wood' },
                getDescription: () => '2x component',
              },
              have: 0,
              need: 2,
            },
          ],
          essences: [],
          tools: [],
        },
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: refused('Missing required items:\n2x wood: have 0, need 2'),
  },
  {
    name: 'invalid ingredient set id',
    async run() {
      const world = craftProbe({});
      await world.craft('set-nope');
      return world.journal.entries;
    },
    journal: refused('Invalid ingredient set ID: set-nope'),
  },
  {
    name: 'tool validation failure',
    async run() {
      const world = craftProbe({
        tools: [{ id: 'tool-hammer', componentId: 'hammer', name: 'Hammer' }],
        toolItemsPresent: false,
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: refused('Missing required tool (Hammer)'),
  },
  {
    name: 'currency afford failure',
    async run() {
      const world = craftProbe({
        requirements: { currency: { enabled: true } },
        currencySpends: [{ unit: 'gp', amount: 9 }],
        currencyUnits: PROBE_CURRENCY_UNITS,
        actorCurrency: { gp: 1 },
        currencyAfford: false,
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: refused('Not enough coin.', ['currency.check', { unit: 'gp', amount: 9 }]),
  },
  {
    name: 'Item Piles afford failure',
    async run() {
      const world = craftProbe({
        recipeCurrencyCost: { currencies: [{ id: 'gold', amount: 3 }] },
        itemPiles: { afford: false },
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: refused('Insufficient currency (Item Piles). Cannot afford recipe cost.', [
      'itemPiles.canAfford',
      'Actor:Crafter',
      [{ id: 'gold', amount: 3 }],
    ]),
  },
];

/** The journal a plain craft with no check, no tools and no currency commits. */
const SIMPLE_SUCCESS_JOURNAL = [
  ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
  ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
  ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
  ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
  ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
  ['item.update', 'Item:wood', { 'system.quantity': 3 }],
  ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
  ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
  ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
  ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', data: {} }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }, {}],
  ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
  ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
  ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully crafted Probe Recipe' }],
];

/** The mode-validation settlement: consumption per policy, and a receipt with no `createdResults`. */
const MODE_VALIDATION_JOURNAL = [
  ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
  ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
  ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
  ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
  ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
  ['item.update', 'Item:wood', { 'system.quantity': 3 }],
  ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
  ['run.completeStepFailure', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, 'Crafting check result does not satisfy current resolution mode requirements', { selectedIngredientSetId: 'set-1', lastCheckResult: { success: false, reason: 'Crafting check result does not satisfy current resolution mode requirements', data: {} }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [] }, {}],
  ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftFailure FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.FailureReason: Crafting check result does not satisfy current resolution mode requirements FABRICATE.Chat.ConsumedOnFailure 2× wood' }],
  ['returned', { success: false, results: null, message: 'Crafting check result does not satisfy current resolution mode requirements' }],
];

const SCENARIOS = [
  {
    name: 'simple success',
    async run() {
      const world = craftProbe({});
      await world.craft();
      return world.journal.entries;
    },
    journal: SIMPLE_SUCCESS_JOURNAL,
  },
  {
    name: 'a per-group option override picks the stocked option at the craftability gate',
    async run() {
      const world = craftProbe({
        optionGroups: {
          'group-1': {
            defaultOptionId: 'option-a',
            options: { 'option-a': 'birch', 'option-b': 'wood' },
          },
        },
      });
      await world.craft(null, { ingredientOptionOverrides: { 'group-1': 'option-b' } });
      return world.journal.entries;
    },
    journal: SIMPLE_SUCCESS_JOURNAL,
  },
  {
    name: 'simple failure with consumeIngredientsOnFail off',
    async run() {
      const world = craftProbe({
        features: { craftingChecks: true },
        craftingCheck: {
          enabled: true,
          simple: PASS_FAIL,
          consumption: { consumeIngredientsOnFail: false },
        },
      });
      stubRoll(5, [{ number: 1, faces: 20, total: 5 }]);
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.completeStepFailure', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]', 0, 'Crafting check failed', { selectedIngredientSetId: 'set-1', lastCheckResult: { success: false, reason: 'Crafting check failed', outcome: 'fail', value: 5, data: { dc: 15, formula: '1d20', resolvedFormula: null, total: 5, comparison: 'meet', diceGroups: [{ groupId: 0, group: '1d20', sum: 5, results: [5] }] } }, consumedIngredients: [], usedTools: [], createdResults: [] }, {}],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftFailure FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 5 FABRICATE.Chat.FailureReason: Crafting check failed' }],
      ['returned', { success: false, results: null, message: 'Crafting check failed' }],
    ],
  },
  {
    name: 'simple failure with consumeIngredientsOnFail and breakToolsOnFail on',
    async run() {
      const world = craftProbe({
        features: { craftingChecks: true },
        craftingCheck: {
          enabled: true,
          simple: PASS_FAIL,
          consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: true },
        },
        tools: [{ id: 'tool-hammer', componentId: 'hammer', name: 'Hammer' }],
      });
      stubRoll(5, [{ number: 1, faces: 20, total: 5 }]);
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['item.setFlag', 'Item:tool-hammer', 'fabricate.fabricate.toolUsage', { timesUsed: 1 }],
      ['run.completeStepFailure', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, 'Crafting check failed', { selectedIngredientSetId: 'set-1', lastCheckResult: { success: false, reason: 'Crafting check failed', outcome: 'fail', value: 5, data: { dc: 15, formula: '1d20', resolvedFormula: null, total: 5, comparison: 'meet', diceGroups: [{ groupId: 0, group: '1d20', sum: 5, results: [5] }] } }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.tool-hammer', quantity: 1, componentId: 'hammer', toolId: 'tool-hammer', broken: false }], createdResults: [] }, {}],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftFailure FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 5 FABRICATE.Chat.FailureReason: Crafting check failed FABRICATE.Chat.ConsumedOnFailure 2× wood Hammer' }],
      ['returned', { success: false, results: null, message: 'Crafting check failed' }],
    ],
  },
  {
    name: 'routedByIngredients success',
    async run() {
      const world = craftProbe({
        resolutionMode: 'routedByIngredients',
        craftingCheck: { enabled: true, simple: { ...PASS_FAIL, dc: 10 }, consumption: {} },
        resolutionService: probeResolutionService({ mode: 'routedByIngredients' }),
      });
      stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', outcome: 'pass', value: 18, data: { dc: 10, formula: '1d20', resolvedFormula: null, total: 18, comparison: 'meet', diceGroups: [{ groupId: 0, group: '1d20', sum: 18, results: [18] }] } }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }, {}],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 18 FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully crafted Probe Recipe' }],
    ],
  },
  {
    name: 'routedByCheck success',
    async run() {
      const world = craftProbe({
        resolutionMode: 'routedByCheck',
        craftingCheck: { enabled: true, routed: ROUTED, consumption: {} },
        resolutionService: probeResolutionService({ mode: 'routedByCheck' }),
      });
      stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', outcome: 'Fine', value: 18, data: { dc: 15, formula: '1d20', resolvedFormula: null, total: 18, type: 'relative', comparison: 'meet', outcomeId: 't-fine', success: true, breakTools: false, diceGroups: [{ groupId: 0, group: '1d20', sum: 18, results: [18] }] } }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }, {}],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 18 FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully crafted Probe Recipe' }],
    ],
  },
  {
    name: 'routedByCheck failure awards the reserved failure group',
    async run() {
      const world = craftProbe({
        resolutionMode: 'routedByCheck',
        craftingCheck: {
          enabled: true,
          routed: ROUTED,
          consumption: { consumeIngredientsOnFail: true },
        },
        failureResults: [{ componentId: 'ash', quantity: 1 }],
        resolutionService: probeResolutionService({
          mode: 'routedByCheck',
          resolveResultGroups: ROLE_ROUTED_GROUPS,
        }),
      });
      stubRoll(6, [{ number: 1, faces: 20, total: 6 }]);
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'ash', quantity: 1 }]],
      ['run.completeStepFailure', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, 'Crafting check failed', { selectedIngredientSetId: 'set-1', lastCheckResult: { success: false, reason: 'Crafting check failed', outcome: 'Botch', value: 6, data: { dc: 15, formula: '1d20', resolvedFormula: null, total: 6, type: 'relative', comparison: 'meet', outcomeId: 't-botch', success: false, breakTools: false, diceGroups: [{ groupId: 0, group: '1d20', sum: 6, results: [6] }] } }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'ash', img: 'icons/src-ash.png', quantity: 1, componentId: 'ash', resultRowId: 'rg-failure:rf-1:0', sourceItemUuid: 'Item.src-ash' }] }, {}],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftFailure FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 6 FABRICATE.Chat.FailureReason: Crafting check failed FABRICATE.Chat.ProducedOnFailure ash FABRICATE.Chat.ConsumedOnFailure 2× wood' }],
      ['returned', { success: false, results: ['Item:made-1'], message: 'Crafting check failed', disposition: 'produced-on-failure' }],
    ],
  },
  {
    name: 'progressive success fires a component complication',
    async run() {
      const world = craftProbe({
        resolutionMode: 'progressive',
        craftingCheck: {
          enabled: true,
          progressive: { rollFormula: '1d20', checkBreakage: { triggers: [] } },
          consumption: {},
        },
        complicationDelivery: true,
        resolutionService: probeResolutionService({
          mode: 'progressive',
          resolveResultGroups: ({ step }) => ({
            groups: step.resultGroups,
            meta: {
              disposition: 'success',
              awardedResultIds: ['r-1-1'],
              remaining: 0,
              skippedResultIds: [],
            },
          }),
          stages: [
            {
              resultId: 'r-1-1',
              componentId: 'plank',
              component: { id: 'plank', name: 'plank', complications: [GM_COMPLICATION] },
            },
          ],
        }),
      });
      stubRoll(12, [{ number: 1, faces: 20, total: 12 }]);
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', value: 12, data: { formula: '1d20', resolvedFormula: null, total: 12, value: 12, diceGroups: [{ groupId: 0, group: '1d20', sum: 12, results: [12] }] } }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }, {}],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['complication.deliver', { complications: ['x1'] }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 12 FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully crafted Probe Recipe' }],
    ],
  },
  {
    name: 'alchemy simple-mode failure awards the reserved failure group',
    async run() {
      const world = craftProbe({
        resolutionMode: 'alchemy',
        alchemy: { checkMode: 'simple' },
        craftingCheck: {
          enabled: true,
          simple: PASS_FAIL,
          consumption: { consumeIngredientsOnFail: true },
        },
        failureResults: [{ componentId: 'ash', quantity: 1 }],
        resolutionService: probeResolutionService({
          mode: 'alchemy',
          resolveResultGroups: ROLE_ROUTED_GROUPS,
        }),
      });
      stubRoll(4, [{ number: 1, faces: 20, total: 4 }]);
      await world.craft(null, { isAlchemyAttempt: true });
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'ash', quantity: 1 }]],
      ['run.completeStepFailure', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, 'Crafting check failed', { selectedIngredientSetId: 'set-1', lastCheckResult: { success: false, reason: 'Crafting check failed', outcome: 'fail', value: 4, data: { dc: 15, formula: '1d20', resolvedFormula: null, total: 4, comparison: 'meet', diceGroups: [{ groupId: 0, group: '1d20', sum: 4, results: [4] }] } }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [] }, {}],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['visibility.learnRecipeOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftFailure FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 4 FABRICATE.Chat.FailureReason: Crafting check failed FABRICATE.Chat.ProducedOnFailure ash FABRICATE.Chat.ConsumedOnFailure 2× wood' }],
      ['returned', { success: false, results: ['Item:made-1'], message: 'Crafting check failed', disposition: 'produced-on-failure' }],
    ],
  },
  {
    name: 'alchemy tiered failure fizzles',
    async run() {
      const world = craftProbe({
        resolutionMode: 'alchemy',
        alchemy: { checkMode: 'tiered' },
        craftingCheck: {
          enabled: true,
          routed: ROUTED,
          consumption: { consumeIngredientsOnFail: false },
        },
        resolutionService: probeResolutionService({ mode: 'alchemy' }),
      });
      stubRoll(4, [{ number: 1, faces: 20, total: 4 }]);
      await world.craft(null, { isAlchemyAttempt: true });
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.completeStepFailure', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]', 0, 'Crafting check failed', { selectedIngredientSetId: 'set-1', lastCheckResult: { success: false, reason: 'Crafting check failed', outcome: 'Botch', value: 4, data: { dc: 15, formula: '1d20', resolvedFormula: null, total: 4, type: 'relative', comparison: 'meet', outcomeId: 't-botch', success: false, breakTools: false, diceGroups: [{ groupId: 0, group: '1d20', sum: 4, results: [4] }] } }, consumedIngredients: [], usedTools: [], createdResults: [] }, {}],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftFailure FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 4 FABRICATE.Chat.FailureReason: Crafting check failed' }],
      ['returned', { success: false, results: null, message: 'Crafting check failed' }],
    ],
  },
  {
    name: 'mode validation rejects a successful check result',
    async run() {
      const world = craftProbe({
        resolutionService: probeResolutionService({ validateCheckResult: false }),
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: MODE_VALIDATION_JOURNAL,
  },
  {
    name: 'mode validation settles before the pre-consumption result-group gate',
    async run() {
      const world = craftProbe({
        resolutionService: probeResolutionService({
          validateCheckResult: false,
          resolveResultGroups: () => ({
            groups: [],
            meta: {
              disposition: 'unrouted-tier',
              error: 'No result group is routed for this outcome',
            },
          }),
        }),
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: MODE_VALIDATION_JOURNAL,
  },
  {
    name: 'misconfigured check aborts with zero mutation',
    async run() {
      const world = craftProbe({
        checkResult: {
          success: false,
          misconfigured: true,
          outcome: null,
          value: null,
          data: {},
          message: 'simple mode requires a configured crafting check roll formula',
        },
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['run.discardRun', 'Actor:Crafter', 'rid-1'],
      ['returned', { success: false, results: null, message: 'simple mode requires a configured crafting check roll formula' }],
    ],
  },
  {
    name: 'pre-consumption result-group gate aborts with zero mutation',
    async run() {
      const world = craftProbe({
        resolutionService: probeResolutionService({
          resolveResultGroups: () => ({
            groups: [],
            meta: {
              disposition: 'unrouted-tier',
              error: 'No result group is routed for this outcome',
            },
          }),
        }),
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.completeStepFailure', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]', 0, 'No result group is routed for this outcome', { selectedIngredientSetId: 'set-1', lastCheckResult: { success: false, reason: 'No result group is routed for this outcome', data: {} }, consumedIngredients: [], usedTools: [] }, {}],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftFailure FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.FailureReason: No result group is routed for this outcome' }],
      ['returned', { success: false, results: null, message: 'No result group is routed for this outcome', disposition: 'unrouted-tier' }],
    ],
  },
  {
    name: 'interactive cancel discards the phantom run',
    async run() {
      const world = craftProbe({
        checkResult: { success: false, cancelled: true, outcome: null, value: null, data: {} },
      });
      await world.craft(null, { interactive: true });
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['run.discardRun', 'Actor:Crafter', 'rid-1'],
      ['returned', { success: false, cancelled: true, results: null, message: 'Crafting cancelled' }],
    ],
  },
  {
    name: 'essence allocation shortfall refuses the craft',
    async run() {
      const world = craftProbe({ shortAllocation: true });
      await world.craft(null, {
        ingredientEssenceAllocation: {
          stepId: 'step-1',
          ingredientSetId: 'set-1',
          allocation: { 'Item.wood': { fire: 1 } },
        },
      });
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['run.discardRun', 'Actor:Crafter', 'rid-1'],
      ['returned', { success: false, results: null, message: 'Missing required items:\n2x wood: have 0, need 2' }],
    ],
  },
  {
    name: 'time-gated step across START, WAIT and FINISH',
    async run() {
      const world = craftProbe({ steps: TIMED_STEPS, worldTime: 1000 });
      await world.craft();
      const { id: runId } = world.runManager.getActiveRuns(world.craftingActor)[0];
      await world.craft(null, { runId });
      world.advanceClock(3600);
      await world.craft(null, { runId });
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.durationToSeconds', { hours: 1 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['run.markStepPrepared', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, { selectedIngredientSetId: 'set-1', currencySpends: [], resolvedEssences: {}, essenceEnabled: {}, consumedSummary: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2, componentId: 'wood' }] }],
      ['run.markStepWaitingForTime', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r prep complete/notApplicable]', 0, { hours: 1 }],
      ['returned', { success: false, results: null, message: 'Step "Step 1" is still in progress (3600s remaining)', disposition: 'timed-start' }],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.durationToSeconds', { hours: 1 }],
      ['run.canProceedTimeGate', 'Run:rid-1 waitingTime@0 [waitingTime 1c/0t/0r gate prep complete/notApplicable]', 0, 1000],
      ['returned', { success: false, results: null, message: 'Step "Step 1" is still in progress (3600s remaining)' }],
      ['clock.advance', 3600],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.durationToSeconds', { hours: 1 }],
      ['run.canProceedTimeGate', 'Run:rid-1 waitingTime@0 [waitingTime 1c/0t/0r gate prep complete/notApplicable]', 0, 4600],
      ['run.markStepInProgress', 'Actor:Crafter', 'Run:rid-1 waitingTime@0 [waitingTime 1c/0t/0r gate prep complete/notApplicable]', 0],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r gate prep complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r gate prep complete/pending]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', data: {} }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', quantity: 2, name: 'wood', img: 'icons/wood.png', componentId: 'wood' }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully crafted Probe Recipe' }],
    ],
  },
  {
    // The clock ticks between the prologue and the gate evaluation, so the gate reads the later
    // world time: a clock read hoisted into the prologue would still be waiting here.
    name: 'time gate reads the world clock at the gate, not at the prologue',
    async run() {
      const world = craftProbe({ steps: TIMED_STEPS, worldTime: 1000 });
      await world.craft();
      const { id: runId } = world.runManager.getActiveRuns(world.craftingActor)[0];
      world.armClockTick('durationToSeconds', 3600);
      await world.craft(null, { runId });
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.durationToSeconds', { hours: 1 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['run.markStepPrepared', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, { selectedIngredientSetId: 'set-1', currencySpends: [], resolvedEssences: {}, essenceEnabled: {}, consumedSummary: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2, componentId: 'wood' }] }],
      ['run.markStepWaitingForTime', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r prep complete/notApplicable]', 0, { hours: 1 }],
      ['returned', { success: false, results: null, message: 'Step "Step 1" is still in progress (3600s remaining)', disposition: 'timed-start' }],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.durationToSeconds', { hours: 1 }],
      ['clock.advance', 3600],
      ['run.canProceedTimeGate', 'Run:rid-1 waitingTime@0 [waitingTime 1c/0t/0r gate prep complete/notApplicable]', 0, 4600],
      ['run.markStepInProgress', 'Actor:Crafter', 'Run:rid-1 waitingTime@0 [waitingTime 1c/0t/0r gate prep complete/notApplicable]', 0],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r gate prep complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r gate prep complete/pending]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', data: {} }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', quantity: 2, name: 'wood', img: 'icons/wood.png', componentId: 'wood' }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully crafted Probe Recipe' }],
    ],
  },
  {
    name: 'collapsed chain runs two steps in one call',
    async run() {
      const world = craftProbe({
        steps: [
          {
            ingredients: [{ componentId: 'wood', quantity: 2 }],
            results: [{ componentId: 'plank', quantity: 1 }],
          },
          {
            ingredients: [{ componentId: 'nail', quantity: 1 }],
            results: [{ componentId: 'chair', quantity: 1 }],
          },
        ],
        stock: { wood: 5, nail: 3 },
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending | pending 0c/0t/0r]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending | pending 0c/0t/0r]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending | pending 0c/0t/0r]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending | pending 0c/0t/0r]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending | pending 0c/0t/0r]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', data: {} }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }, {}],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['run.getActiveRun', 'Actor:Crafter', 'rid-1'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@1 [succeeded 1c/0t/1r complete/complete | inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@1 [succeeded 1c/0t/1r complete/complete | inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:nail', { 'system.quantity': 2 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@1 [succeeded 1c/0t/1r complete/complete | inProgress 1c/0t/0r complete/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@1 [succeeded 1c/0t/1r complete/complete | inProgress 1c/0t/0r complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'chair', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@1 [succeeded 1c/0t/1r complete/complete | inProgress 1c/0t/0r complete/pending]', 1, { selectedIngredientSetId: 'set-2', lastCheckResult: { success: true, reason: 'Success', data: {} }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.nail', name: 'nail', img: 'icons/nail.png', quantity: 1 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-2', name: 'chair', img: 'icons/src-chair.png', quantity: 1, componentId: 'chair', resultRowId: 'rg-2:r-2-1:0', sourceItemUuid: 'Item.src-chair' }] }, {}],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Results chair FABRICATE.Chat.Consumed nail' }],
      ['returned', { success: true, results: ['Item:made-2'], message: 'Successfully crafted Probe Recipe' }],
    ],
  },
  {
    // The versioned-execution key is identity-typed: a second declaration of it re-arms the per-step
    // time gate and re-rolls a check the executor already resolved.
    name: 'versioned execution skips the time gate and reuses its resolved check',
    async run() {
      const world = craftProbe({ steps: TIMED_STEPS, worldTime: 1000 });
      const key = await versionedExecutionKey(world.engine);
      assert.equal(typeof key, 'symbol', 'the versioned-execution key must be reachable');
      await world.craft(null, {
        [key]: { resolvedCheckResult: { success: true, outcome: null, value: 7, data: {} } },
      });
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', value: 7, data: {} }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }, {}],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Roll 7 FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully crafted Probe Recipe' }],
    ],
  },
  {
    name: 'currency and Item Piles spend after consumption and before the award',
    async run() {
      const world = craftProbe({
        requirements: { currency: { enabled: true } },
        currencySpends: [{ unit: 'gp', amount: 2 }],
        currencyUnits: PROBE_CURRENCY_UNITS,
        actorCurrency: { gp: 5 },
        recipeCurrencyCost: { currencies: [{ id: 'gold', amount: 3 }] },
        itemPiles: { afford: true },
      });
      await world.craft();
      return world.journal.entries;
    },
    journal: [
      ['run.findActiveRunForRecipe', 'Actor:Crafter', 'recipe-probe'],
      ['run.createRun', 'Actor:Crafter', 'Recipe:recipe-probe', ['Actor:Source'], 'user-probe'],
      ['visibility.guardCraftStart', { recipe: 'recipe-probe' }],
      ['currency.check', { unit: 'gp', amount: 2 }],
      ['itemPiles.canAfford', 'Actor:Crafter', [{ id: 'gold', amount: 3 }]],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r notApplicable/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 0c/0t/0r pending/pending]'],
      ['item.update', 'Item:wood', { 'system.quantity': 3 }],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['run.updateRun', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]'],
      ['currency.spend', { unit: 'gp', amount: 2 }],
      ['actor.update', 'Actor:Crafter', { 'system.currency.gp': 3 }],
      ['itemPiles.deductCurrency', 'Actor:Crafter', [{ id: 'gold', amount: 3 }]],
      ['actor.createEmbedded', 'Actor:Crafter', 'Item', [{ name: 'plank', quantity: 1 }]],
      ['run.completeStepSuccess', 'Actor:Crafter', 'Run:rid-1 inProgress@0 [inProgress 1c/0t/0r complete/pending]', 0, { selectedIngredientSetId: 'set-1', lastCheckResult: { success: true, reason: 'Success', data: {} }, consumedIngredients: [{ actorUuid: 'Actor.Source', itemUuid: 'Item.wood', name: 'wood', img: 'icons/wood.png', quantity: 2 }], usedTools: [], createdResults: [{ actorUuid: 'Actor.Crafter', itemUuid: 'Actor.Crafter.Item.made-1', name: 'plank', img: 'icons/src-plank.png', quantity: 1, componentId: 'plank', resultRowId: 'rg-1:r-1-1:0', sourceItemUuid: 'Item.src-plank' }] }, {}],
      ['visibility.applyRecipeItemUseOnCraft', { recipe: 'recipe-probe' }],
      ['chat.create', { alias: 'Crafter', rolls: 0, text: 'FABRICATE.Chat.CraftSuccess FABRICATE.Chat.Actor: Crafter · FABRICATE.Chat.Recipe: Probe Recipe FABRICATE.Chat.Results plank FABRICATE.Chat.Consumed 2× wood' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully crafted Probe Recipe' }],
    ],
  },
  ...REFUSALS.map((refusal) => ({ ...refusal, name: `refusal: ${refusal.name}` })),
  {
    name: 'salvage success',
    async run() {
      const world = salvageProbe({
        salvageCraftingCheck: { simple: { ...PASS_FAIL, dc: 10 } },
        resultGroups: [{ id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 2 }] }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ['item.update', 'Item:ore', { 'system.quantity': 2 }],
      ['actor.createEmbedded', 'Actor:Salvager', 'Item', [{ name: 'Shard', quantity: 2 }]],
      ['chat.create', { alias: 'Salvager', rolls: 0, text: 'FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 17 FABRICATE.Chat.SalvageRecovered 2× Shard FABRICATE.Chat.SalvageConsumed Iron Ore' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully salvaged Iron Ore', value: 17, salvageRun: null }],
    ],
  },
  {
    name: 'salvage failure consumes the source and awards nothing',
    async run() {
      const world = salvageProbe({
        salvageCraftingCheck: {
          simple: { ...PASS_FAIL, dc: 10 },
          consumption: { consumeComponentOnFail: true },
        },
        resultGroups: [{ id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 2 }] }],
      });
      stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ['item.update', 'Item:ore', { 'system.quantity': 2 }],
      ['chat.create', { alias: 'Salvager', rolls: 0, text: 'FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 3 FABRICATE.Chat.FailureReason: Salvage check failed FABRICATE.Chat.ConsumedOnFailure Iron Ore' }],
      ['returned', { success: false, results: null, message: 'Salvage check failed', salvageRun: null }],
    ],
  },
  {
    name: 'salvage progressive spends the rolled budget',
    async run() {
      const world = salvageProbe({
        salvageResolutionMode: 'progressive',
        salvageCraftingCheck: { progressive: { rollFormula: '1d20', checkBreakage: { triggers: [] } } },
        awardDifficulty: 5,
        resultGroups: [{ id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 1 }] }],
      });
      stubRoll(14, [{ number: 1, faces: 20, total: 14 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ['item.update', 'Item:ore', { 'system.quantity': 2 }],
      ['actor.createEmbedded', 'Actor:Salvager', 'Item', [{ name: 'Shard', quantity: 1 }]],
      ['chat.create', { alias: 'Salvager', rolls: 0, text: 'FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 14 FABRICATE.Chat.SalvageRecovered Shard FABRICATE.Chat.SalvageConsumed Iron Ore' }],
      ['returned', { success: true, results: ['Item:made-1'], message: 'Successfully salvaged Iron Ore', value: 14, salvageRun: null }],
    ],
  },
];

for (const scenario of SCENARIOS) {
  test(`craft pipeline effect journal: ${scenario.name}`, async () => {
    assert.deepEqual(await scenario.run(), scenario.journal);
  });
}
