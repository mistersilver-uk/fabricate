/** The effect-journal pin over `CraftingEngine.salvage()` and the salvage-run lifecycle behind it
 * (issue 1714): one flat, ordered journal per scenario, committed against the unchanged engine and
 * byte-frozen through the pipeline split. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { stubRoll } from './helpers/routedCheckEngine.js';
import { failRollEngine, salvageRunProbe } from './helpers/salvagePipelineProbe.js';

const INACTIVE_EVALUATION = { product: 'count', direction: 'under', pool: { required: 3 } };
const PASS_FAIL = { rollFormula: '1d20', dc: 10, thresholdMode: 'meet', evaluation: INACTIVE_EVALUATION };

const RELATIVE_TIERS = [
  { id: 't-fine', name: 'Fine', success: true, breakTools: false, dc: 0 },
  { id: 't-botch', name: 'Botch', success: false, breakTools: false, dc: -10 },
];

const ROUTED = {
  evaluation: INACTIVE_EVALUATION,
  rollFormula: '1d20',
  dc: 10,
  thresholdMode: 'meet',
  type: 'relative',
  relativeOutcomes: RELATIVE_TIERS,
  fixedOutcomes: [],
  checkBreakage: { triggers: [] },
};

const PROGRESSIVE = { rollFormula: '1d20', evaluation: INACTIVE_EVALUATION, checkBreakage: { triggers: [] } };

const SHARD_GROUP = [{ id: 'sg-1', results: [{ id: 'sr-1', componentId: 'shard', quantity: 2 }] }];

const FAILURE_GROUP = {
  id: 'sg-fail',
  role: 'failure',
  results: [{ id: 'sf-1', componentId: 'slag', quantity: 1 }],
};

const HAMMER = { id: 't-hammer', componentId: 'hammer', name: 'Hammer', breakage: { mode: 'limitedUses', maxUses: 1 } };

const COMPLICATION = (id, visibility) => ({
  id,
  name: `Complication ${id}`,
  description: 'It goes wrong.',
  severity: 'minor',
  visibility,
  activities: { crafting: false, salvage: true, gathering: false },
  match: 'any',
  when: { stageAwarded: true, stagePartial: false, stageMissed: false, checkTrigger: null },
  rollCondition: { enabled: false, expr: '', cmp: 'gte', value: '' },
  effectRoll: { enabled: false, expr: '', label: '' },
  macroUuid: 'Macro.secret',
});

const PROGRESSIVE_TARGET = {
  id: 'ore',
  name: 'Iron Ore',
  quantity: 3,
  ingredientQuantity: 1,
  resultGroups: [
    {
      id: 'sg-1',
      results: [
        { id: 'sr-1', componentId: 'shard' },
        { id: 'sr-2', componentId: 'dust' },
      ],
    },
  ],
};

const target = (extra = {}) => ({
  id: 'ore',
  name: 'Iron Ore',
  quantity: 3,
  ingredientQuantity: 1,
  resultGroups: SHARD_GROUP,
  ...extra,
});

const BULK_DECISION = { confirmed: true, bonus: 0, rollMode: 'publicroll', advantage: null };

const SCENARIOS = [
  {
    name: "simple success awards, records the run and posts the card",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":2}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 17 FABRICATE.Chat.SalvageRecovered 2× Shard FABRICATE.Chat.SalvageConsumed Iron Ore"}],
      ["returned",{"success":true,"results":["Item:made-1"],"message":"Successfully salvaged Iron Ore","value":17,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/1r check:simple complete/complete"}],
    ],
  },
  {
    name: "simple failure consumes the source under the default policy and awards nothing",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending","failed",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[],"checkResult":{"success":false,"outcome":"fail","value":3,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":3,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":-7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":3,"results":[3]}]}},"failureReason":"Salvage check failed"}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 3 FABRICATE.Chat.FailureReason: Salvage check failed FABRICATE.Chat.ConsumedOnFailure Iron Ore"}],
      ["returned",{"success":false,"results":null,"message":"Salvage check failed","salvageRun":"Run:rid-1 ore failed 1c/0t/0r check:simple complete/complete"}],
    ],
  },
  {
    name: "simple failure with consumeComponentOnFail off leaves the source alone",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: {
          simple: PASS_FAIL,
          consumption: { consumeComponentOnFail: false },
        },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple notApplicable/pending"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple notApplicable/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple notApplicable/pending","failed",{"consumedComponents":[],"historySettlement":{"consumption":"notApplicable","awards":"complete"},"usedTools":[],"createdResults":[],"checkResult":{"success":false,"outcome":"fail","value":3,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":3,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":-7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":3,"results":[3]}]}},"failureReason":"Salvage check failed"}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 3 FABRICATE.Chat.FailureReason: Salvage check failed"}],
      ["returned",{"success":false,"results":null,"message":"Salvage check failed","salvageRun":"Run:rid-1 ore failed 0c/0t/0r check:simple notApplicable/complete"}],
    ],
  },
  {
    name: "failure with breakToolsOnFail on breaks the required tool",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: {
          simple: PASS_FAIL,
          consumption: { consumeComponentOnFail: true, breakToolsOnFail: true },
        },
        targets: [target({ toolIds: ['t-hammer'] })],
        awards: [{ id: 'shard', name: 'Shard' }],
        tools: [HAMMER],
      });
      stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["item.setFlag","Item:tool-hammer","fabricate.fabricate.toolUsage",{"timesUsed":1}],
      ["item.delete","Item:tool-hammer"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending","failed",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.tool-hammer","quantity":1,"componentId":"hammer","toolId":"t-hammer","broken":true}],"createdResults":[],"checkResult":{"success":false,"outcome":"fail","value":3,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":3,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":-7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":3,"results":[3]}]}},"failureReason":"Salvage check failed"}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 3 FABRICATE.Chat.FailureReason: Salvage check failed FABRICATE.Chat.ConsumedOnFailure Iron Ore Hammer"}],
      ["returned",{"success":false,"results":null,"message":"Salvage check failed","salvageRun":"Run:rid-1 ore failed 1c/1t/0r check:simple complete/complete"}],
    ],
  },
  {
    name: "failure with breakToolsOnFail off leaves the required tool untouched",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: {
          simple: PASS_FAIL,
          consumption: { consumeComponentOnFail: true, breakToolsOnFail: false },
        },
        targets: [target({ toolIds: ['t-hammer'] })],
        awards: [{ id: 'shard', name: 'Shard' }],
        tools: [HAMMER],
      });
      stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending","failed",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[],"checkResult":{"success":false,"outcome":"fail","value":3,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":3,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":-7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":3,"results":[3]}]}},"failureReason":"Salvage check failed"}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 3 FABRICATE.Chat.FailureReason: Salvage check failed FABRICATE.Chat.ConsumedOnFailure Iron Ore"}],
      ["returned",{"success":false,"results":null,"message":"Salvage check failed","salvageRun":"Run:rid-1 ore failed 1c/0t/0r check:simple complete/complete"}],
    ],
  },
  {
    name: "success always breaks the required tool, with no fail gate to consult",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ toolIds: ['t-hammer'] })],
        awards: [{ id: 'shard', name: 'Shard' }],
        tools: [HAMMER],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["item.setFlag","Item:tool-hammer","fabricate.fabricate.toolUsage",{"timesUsed":1}],
      ["item.delete","Item:tool-hammer"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":2}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.tool-hammer","quantity":1,"componentId":"hammer","toolId":"t-hammer","broken":true}],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 17 FABRICATE.Chat.SalvageRecovered 2× Shard FABRICATE.Chat.SalvageConsumed Iron Ore FABRICATE.Chat.SalvageTools Hammer"}],
      ["returned",{"success":true,"results":["Item:made-1"],"message":"Successfully salvaged Iron Ore","value":17,"salvageRun":"Run:rid-1 ore succeeded 1c/1t/1r check:simple complete/complete"}],
    ],
  },
  {
    name: "routed success awards the group its outcome tier names",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'routed',
        salvageCraftingCheck: { routed: ROUTED },
        targets: [target({ outcomeRouting: { Fine: 'sg-1' } })],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:routed pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:routed complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":2}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:routed complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:routed complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"Fine","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"type":"relative","outcomeId":"t-fine","success":true,"breakTools":false,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 17 FABRICATE.Chat.SalvageRecovered 2× Shard FABRICATE.Chat.SalvageConsumed Iron Ore"}],
      ["returned",{"success":true,"results":["Item:made-1"],"message":"Successfully salvaged Iron Ore","value":17,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/1r check:routed complete/complete"}],
    ],
  },
  {
    name: "routed failure routes the failing tier name and awards its group",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'routed',
        salvageCraftingCheck: { routed: ROUTED },
        targets: [
          target({
            resultGroups: [...SHARD_GROUP, FAILURE_GROUP],
            outcomeRouting: { Fine: 'sg-1', Botch: 'sg-fail' },
          }),
        ],
        awards: [
          { id: 'shard', name: 'Shard' },
          { id: 'slag', name: 'Slag' },
        ],
      });
      stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:routed pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:routed complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Slag","quantity":1}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:routed complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:routed complete/pending","failed",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Slag","img":"icons/src-slag.png","quantity":1,"componentId":"slag","resultRowId":"sg-fail:sf-1:0","sourceItemUuid":"Item.src-slag"}],"checkResult":{"success":false,"outcome":"Botch","value":3,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":3,"type":"relative","outcomeId":"t-botch","success":false,"breakTools":false,"product":"sum","direction":"over","comparison":"meet","target":0,"margin":3,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":3,"results":[3]}]}},"failureReason":"Salvage check failed"}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 3 FABRICATE.Chat.FailureReason: Salvage check failed FABRICATE.Chat.ProducedOnFailure Slag FABRICATE.Chat.ConsumedOnFailure Iron Ore"}],
      ["returned",{"success":false,"results":["Item:made-1"],"message":"Salvage check failed","salvageRun":"Run:rid-1 ore failed 1c/0t/1r check:routed complete/complete"}],
    ],
  },
  {
    name: "progressive success spends the rolled budget down the authored order",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'progressive',
        salvageCraftingCheck: { progressive: PROGRESSIVE },
        targets: [PROGRESSIVE_TARGET],
        awards: [
          { id: 'shard', name: 'Shard', difficulty: 5 },
          { id: 'dust', name: 'Dust', difficulty: 5 },
        ],
      });
      stubRoll(7, [{ number: 1, faces: 20, total: 7 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:progressive pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":1}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:progressive complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:progressive complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":1,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":null,"value":7,"data":{"formula":"1d20","resolvedFormula":null,"total":7,"value":7,"product":"sum","direction":"over","comparison":null,"target":null,"margin":null,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":7,"results":[7]}]}},"failureReason":null}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 7 FABRICATE.Chat.SalvageRecovered Shard FABRICATE.Chat.SalvageConsumed Iron Ore"}],
      ["returned",{"success":true,"results":["Item:made-1"],"message":"Successfully salvaged Iron Ore","value":7,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/1r check:progressive complete/complete"}],
    ],
  },
  {
    name: "a progressive budget of nothing awards nothing and still succeeds",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'progressive',
        salvageCraftingCheck: { progressive: PROGRESSIVE },
        targets: [PROGRESSIVE_TARGET],
        awards: [
          { id: 'shard', name: 'Shard', difficulty: 5 },
          { id: 'dust', name: 'Dust', difficulty: 5 },
        ],
      });
      stubRoll(0, [{ number: 1, faces: 20, total: 0 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:progressive pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[],"checkResult":{"success":true,"outcome":null,"value":0,"data":{"formula":"1d20","resolvedFormula":null,"total":0,"value":0,"product":"sum","direction":"over","comparison":null,"target":null,"margin":null,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":0,"results":[0]}]}},"failureReason":null}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 0 FABRICATE.Chat.SalvageConsumed Iron Ore"}],
      ["returned",{"success":true,"results":[],"message":"Successfully salvaged Iron Ore","value":0,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/0r check:progressive complete/complete"}],
    ],
  },
  {
    name: "progressive failure awards nothing even where the policy permits a failure award",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'progressive',
        salvageCraftingCheck: { progressive: PROGRESSIVE, failureResultPolicy: 'always' },
        targets: [
          { ...PROGRESSIVE_TARGET, resultGroups: [...PROGRESSIVE_TARGET.resultGroups, FAILURE_GROUP] },
        ],
        awards: [
          { id: 'shard', name: 'Shard', difficulty: 5 },
          { id: 'dust', name: 'Dust', difficulty: 5 },
          { id: 'slag', name: 'Slag' },
        ],
      });
      failRollEngine('dice engine unavailable');
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:progressive pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending","failed",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[],"checkResult":{"success":false,"outcome":null,"value":null,"data":{"formula":"1d20"}},"failureReason":"Salvage check roll failed: dice engine unavailable"}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.FailureReason: Salvage check roll failed: dice engine unavailable FABRICATE.Chat.ConsumedOnFailure Iron Ore"}],
      ["returned",{"success":false,"results":null,"message":"Salvage check roll failed: dice engine unavailable","salvageRun":"Run:rid-1 ore failed 1c/0t/0r check:progressive complete/complete"}],
    ],
  },
  {
    name: "the reserved failure group is awarded by role on a failed simple check",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL, failureResultPolicy: 'perRecord' },
        targets: [target({ resultGroups: [...SHARD_GROUP, FAILURE_GROUP] })],
        awards: [
          { id: 'shard', name: 'Shard' },
          { id: 'slag', name: 'Slag' },
        ],
      });
      stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Slag","quantity":1}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending","failed",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Slag","img":"icons/src-slag.png","quantity":1,"componentId":"slag","resultRowId":"sg-fail:sf-1:0","sourceItemUuid":"Item.src-slag"}],"checkResult":{"success":false,"outcome":"fail","value":3,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":3,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":-7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":3,"results":[3]}]}},"failureReason":"Salvage check failed"}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 3 FABRICATE.Chat.FailureReason: Salvage check failed FABRICATE.Chat.ProducedOnFailure Slag FABRICATE.Chat.ConsumedOnFailure Iron Ore"}],
      ["returned",{"success":false,"results":["Item:made-1"],"message":"Salvage check failed","salvageRun":"Run:rid-1 ore failed 1c/0t/1r check:simple complete/complete"}],
    ],
  },
  {
    name: "failureResultPolicy never gates the reserved failure group out",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL, failureResultPolicy: 'never' },
        targets: [target({ resultGroups: [...SHARD_GROUP, FAILURE_GROUP] })],
        awards: [
          { id: 'shard', name: 'Shard' },
          { id: 'slag', name: 'Slag' },
        ],
      });
      stubRoll(3, [{ number: 1, faces: 20, total: 3 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending","failed",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[],"checkResult":{"success":false,"outcome":"fail","value":3,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":3,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":-7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":3,"results":[3]}]}},"failureReason":"Salvage check failed"}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageFailure FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 3 FABRICATE.Chat.FailureReason: Salvage check failed FABRICATE.Chat.ConsumedOnFailure Iron Ore"}],
      ["returned",{"success":false,"results":null,"message":"Salvage check failed","salvageRun":"Run:rid-1 ore failed 1c/0t/0r check:simple complete/complete"}],
    ],
  },
  {
    name: "a misconfigured check discards the run THIS call created and returns none",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'routed',
        salvageCraftingCheck: { routed: { ...ROUTED, rollFormula: '  ' } },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.discardRun","Actor:Salvager","rid-1"],
      ["returned",{"success":false,"misconfigured":true,"results":null,"message":"routed salvage mode requires a configured salvage check roll formula","salvageRun":null}],
    ],
  },
  {
    name: "a misconfigured check leaves a REUSED run untouched and returns it",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'routed',
        salvageCraftingCheck: { routed: { ...ROUTED, rollFormula: '  ' } },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      await world.seedRun();
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["returned",{"success":false,"misconfigured":true,"results":null,"message":"routed salvage mode requires a configured salvage check roll formula","salvageRun":"Run:rid-1 ore inProgress 0c/0t/0r"}],
    ],
  },
  {
    name: "a cancelled interactive check discards the run THIS call created",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage({ interactive: true, rollDecision: { confirmed: false } });
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.discardRun","Actor:Salvager","rid-1"],
      ["returned",{"success":false,"cancelled":true,"results":null,"message":"Salvage cancelled","salvageRun":null}],
    ],
  },
  {
    name: "a cancelled interactive check leaves a REUSED run intact and discards nothing",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.seedRun();
      await world.salvage({ interactive: true, rollDecision: { confirmed: false } });
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["returned",{"success":false,"cancelled":true,"results":null,"message":"Salvage cancelled","salvageRun":"Run:rid-1 ore inProgress 0c/0t/0r"}],
    ],
  },
  {
    name: "an unsupported salvage mode aborts misconfigured with zero mutation",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'tiered',
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.discardRun","Actor:Salvager","rid-1"],
      ["returned",{"success":false,"misconfigured":true,"results":null,"message":"Unsupported salvage resolution mode: tiered","salvageRun":null}],
    ],
  },
  {
    name: "refusal: actor not found",
    async run() {
      const world = salvageRunProbe({ targets: [target()] });
      await world.engine
        .salvage('Actor.Nobody', 'sys-salvage', 'ore', {})
        .then((result) => world.journal.push('returned', result));
      return world.journal.entries;
    },
    journal: [
      ["returned",{"success":false,"results":null,"message":"Actor not found","salvageRun":null}],
    ],
  },
  {
    name: "refusal: crafting system not found",
    async run() {
      const world = salvageRunProbe({ targets: [target()] });
      await world.engine
        .salvage(world.actor.uuid, 'sys-absent', 'ore', {})
        .then((result) => world.journal.push('returned', result));
      return world.journal.entries;
    },
    journal: [
      ["returned",{"success":false,"results":null,"message":"Crafting system \"sys-absent\" not found","salvageRun":null}],
    ],
  },
  {
    name: "refusal: component not found in system",
    async run() {
      const world = salvageRunProbe({ targets: [target()] });
      await world.salvage({}, 'absent');
      return world.journal.entries;
    },
    journal: [
      ["returned",{"success":false,"results":null,"message":"Component \"absent\" not found in system","salvageRun":null}],
    ],
  },
  {
    name: "refusal: the salvage feature is off",
    async run() {
      const world = salvageRunProbe({ targets: [target()], salvageFeature: false });
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["returned",{"success":false,"results":null,"message":"Salvage feature is not enabled on this crafting system","salvageRun":null}],
    ],
  },
  {
    name: "refusal: salvage is disabled on the component",
    async run() {
      const world = salvageRunProbe({ targets: [target({ enabled: false })] });
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["returned",{"success":false,"results":null,"message":"Salvage is not enabled for component \"Iron Ore\"","salvageRun":null}],
    ],
  },
  {
    name: "refusal: invalid salvage configuration carries the misconfigured discriminator",
    async run() {
      const world = salvageRunProbe({
        targets: [target()],
        validateSalvage: { valid: false, errors: ['no result groups'] },
      });
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["returned",{"success":false,"misconfigured":true,"results":null,"message":"Invalid salvage configuration: no result groups","salvageRun":null}],
    ],
  },
  {
    name: "refusal: a named run id with no active run",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
      });
      await world.salvage({ runId: 'rid-absent' });
      return world.journal.entries;
    },
    journal: [
      ["run.getActiveRun","Actor:Salvager","rid-absent"],
      ["returned",{"success":false,"results":null,"message":"Active salvage run not found","salvageRun":null}],
    ],
  },
  {
    name: "refusal: not enough stock, with no run to fail",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ quantity: 1, ingredientQuantity: 2 })],
      });
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["returned",{"success":false,"results":null,"message":"Not enough \"Iron Ore\" to salvage. Need 2, have 1","salvageRun":null}],
    ],
  },
  {
    name: "refusal: not enough stock fails the run it was reusing",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ quantity: 1, ingredientQuantity: 2 })],
      });
      await world.seedRun();
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r","failed",{"failureReason":"Not enough \"Iron Ore\" to salvage. Need 2, have 1"}],
      ["returned",{"success":false,"results":null,"message":"Not enough \"Iron Ore\" to salvage. Need 2, have 1","salvageRun":"Run:rid-1 ore failed 0c/0t/0r"}],
    ],
  },
  {
    name: "refusal: a missing required tool, with no run to fail",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ toolIds: ['t-hammer'] })],
        tools: [{ ...HAMMER, present: false }],
      });
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["returned",{"success":false,"results":null,"message":"Missing required tool (Hammer)","salvageRun":null}],
    ],
  },
  {
    name: "refusal: a missing required tool fails the run it was reusing",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ toolIds: ['t-hammer'] })],
        tools: [{ ...HAMMER, present: false }],
      });
      await world.seedRun();
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r","failed",{"failureReason":"Missing required tool (Hammer)"}],
      ["returned",{"success":false,"results":null,"message":"Missing required tool (Hammer)","salvageRun":"Run:rid-1 ore failed 0c/0t/0r"}],
    ],
  },
  {
    name: "the time gate samples the clock once, waits, and resumes at maturity",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ timeRequirement: { hours: 1 } })],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      world.armClockTick('createRun', 10);
      await world.salvage();
      await world.processPendingSalvageRuns(3600);
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["clock.advance",10],
      ["run.markRunWaitingForTime","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r",{"hours":1}],
      ["run.canProceedTimeGate","Run:rid-1 ore waitingTime 0c/0t/0r gate@3610",0],
      ["returned",{"success":true,"waiting":true,"results":null,"message":"Salvage started for Iron Ore (3610s remaining)","salvageRun":"Run:rid-1 ore waitingTime 0c/0t/0r gate@3610"}],
      ["clock.advance",3600],
      ["run.processWorldTime",3610,"fn"],
      ["run.getActiveRun","Actor:Salvager","rid-1"],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r gate@3610"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r gate@3610 check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r gate@3610 check:simple complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":2}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r gate@3610 check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r gate@3610 check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 17 FABRICATE.Chat.SalvageRecovered 2× Shard FABRICATE.Chat.SalvageConsumed Iron Ore"}],
    ],
  },
  {
    name: "skipTimeGate resumes a waiting run without re-arming its gate",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ timeRequirement: { hours: 1 } })],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.seedRun({
        status: 'waitingTime',
        timeGate: { requiredSeconds: 3600, initiatedAt: 0, availableAt: 3600 },
      });
      await world.salvage({ skipTimeGate: true });
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore waitingTime 0c/0t/0r gate@3600"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r gate@3600 check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r gate@3600 check:simple complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":2}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r gate@3600 check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r gate@3600 check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 17 FABRICATE.Chat.SalvageRecovered 2× Shard FABRICATE.Chat.SalvageConsumed Iron Ore"}],
      ["returned",{"success":true,"results":["Item:made-1"],"message":"Successfully salvaged Iron Ore","value":17,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/1r gate@3600 check:simple complete/complete"}],
    ],
  },
  {
    name: "a progressive run spends the player's captured order and fires its complication",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'progressive',
        salvageCraftingCheck: { progressive: PROGRESSIVE },
        targets: [PROGRESSIVE_TARGET],
        awards: [
          { id: 'shard', name: 'Shard', difficulty: 5 },
          { id: 'dust', name: 'Dust', difficulty: 5, complications: [COMPLICATION('x-dust', 'visible')] },
        ],
        resultOrder: ['sr-2', 'sr-1'],
        complicationWriter: true,
      });
      stubRoll(7, [{ number: 1, faces: 20, total: 7 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":["sr-2","sr-1"]}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r order[sr-2,sr-1]"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:progressive pending/pending order[sr-2,sr-1]"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending order[sr-2,sr-1]"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Dust","quantity":1}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:progressive complete/pending order[sr-2,sr-1]"],
      ["complication.deliver",{"complications":["x-dust"]}],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:progressive complete/pending order[sr-2,sr-1]","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Dust","img":"icons/src-dust.png","quantity":1,"componentId":"dust","resultRowId":"sg-1:sr-2:1","sourceItemUuid":"Item.src-dust"}],"checkResult":{"success":true,"outcome":null,"value":7,"data":{"formula":"1d20","resolvedFormula":null,"total":7,"value":7,"product":"sum","direction":"over","comparison":null,"target":null,"margin":null,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":7,"results":[7]}]}},"failureReason":null,"firedComplications":[{"resultId":"sr-2","componentId":"dust","complicationId":"x-dust","buckets":["full"]}]}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 7 FABRICATE.Chat.SalvageRecovered Dust FABRICATE.Chat.SalvageConsumed Iron Ore FABRICATE.Chat.Complications Complication x-dust — Dust — It goes wrong."}],
      ["returned",{"success":true,"results":["Item:made-1"],"message":"Successfully salvaged Iron Ore","complications":[{"resultId":"sr-2","componentId":"dust","complicationId":"x-dust","position":1,"buckets":["full"],"name":"Complication x-dust","description":"It goes wrong.","severity":"minor"}],"value":7,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/1r check:progressive complete/complete order[sr-2,sr-1] fired[sr-2:x-dust]"}],
    ],
  },
  {
    name: "a gmOnly complication reaches neither the return nor the run record",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'progressive',
        salvageCraftingCheck: { progressive: PROGRESSIVE },
        targets: [PROGRESSIVE_TARGET],
        awards: [
          { id: 'shard', name: 'Shard', difficulty: 5, complications: [COMPLICATION('x-open', 'visible')] },
          { id: 'dust', name: 'Dust', difficulty: 5, complications: [COMPLICATION('x-secret', 'gmOnly')] },
        ],
        complicationWriter: true,
      });
      stubRoll(10, [{ number: 1, faces: 20, total: 10 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:progressive pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":1}]],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Dust","quantity":1}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/2r check:progressive complete/pending"],
      ["complication.deliver",{"complications":["x-open","x-secret"]}],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/2r check:progressive complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":1,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"},{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-2","name":"Dust","img":"icons/src-dust.png","quantity":1,"componentId":"dust","resultRowId":"sg-1:sr-2:1","sourceItemUuid":"Item.src-dust"}],"checkResult":{"success":true,"outcome":null,"value":10,"data":{"formula":"1d20","resolvedFormula":null,"total":10,"value":10,"product":"sum","direction":"over","comparison":null,"target":null,"margin":null,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":10,"results":[10]}]}},"failureReason":null,"firedComplications":[{"resultId":"sr-1","componentId":"shard","complicationId":"x-open","buckets":["full"]}]}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 10 FABRICATE.Chat.SalvageRecovered Shard Dust FABRICATE.Chat.SalvageConsumed Iron Ore FABRICATE.Chat.Complications Complication x-open — Shard — It goes wrong."}],
      ["returned",{"success":true,"results":["Item:made-1","Item:made-2"],"message":"Successfully salvaged Iron Ore","complications":[{"resultId":"sr-1","componentId":"shard","complicationId":"x-open","position":1,"buckets":["full"],"name":"Complication x-open","description":"It goes wrong.","severity":"minor"}],"value":10,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/2r check:progressive complete/complete fired[sr-1:x-open]"}],
    ],
  },
  {
    name: "deferComplicationDelivery fires without emitting and returns the GM requests",
    async run() {
      const world = salvageRunProbe({
        salvageResolutionMode: 'progressive',
        salvageCraftingCheck: { progressive: PROGRESSIVE },
        targets: [PROGRESSIVE_TARGET],
        awards: [
          { id: 'shard', name: 'Shard', difficulty: 5, complications: [COMPLICATION('x-open', 'visible')] },
          { id: 'dust', name: 'Dust', difficulty: 5, complications: [COMPLICATION('x-secret', 'gmOnly')] },
        ],
        complicationWriter: true,
      });
      stubRoll(10, [{ number: 1, faces: 20, total: 10 }]);
      await world.salvage({ deferComplicationDelivery: true });
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:progressive pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:progressive complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":1}]],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Dust","quantity":1}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/2r check:progressive complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/2r check:progressive complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":1,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"},{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-2","name":"Dust","img":"icons/src-dust.png","quantity":1,"componentId":"dust","resultRowId":"sg-1:sr-2:1","sourceItemUuid":"Item.src-dust"}],"checkResult":{"success":true,"outcome":null,"value":10,"data":{"formula":"1d20","resolvedFormula":null,"total":10,"value":10,"product":"sum","direction":"over","comparison":null,"target":null,"margin":null,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":10,"results":[10]}]}},"failureReason":null,"firedComplications":[{"resultId":"sr-1","componentId":"shard","complicationId":"x-open","buckets":["full"]}]}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 10 FABRICATE.Chat.SalvageRecovered Shard Dust FABRICATE.Chat.SalvageConsumed Iron Ore FABRICATE.Chat.Complications Complication x-open — Shard — It goes wrong."}],
      ["returned",{"success":true,"results":["Item:made-1","Item:made-2"],"message":"Successfully salvaged Iron Ore","complicationRequests":[{"craftingSystemId":"sys-salvage","componentId":"shard","complicationId":"x-open","resultId":"sr-1","activity":"salvage","bucket":"full","actorUuid":"Actor.Salvager","resolutionId":null,"effectRollTotal":null},{"craftingSystemId":"sys-salvage","componentId":"dust","complicationId":"x-secret","resultId":"sr-2","activity":"salvage","bucket":"full","actorUuid":"Actor.Salvager","resolutionId":null,"effectRollTotal":null}],"complications":[{"resultId":"sr-1","componentId":"shard","complicationId":"x-open","position":1,"buckets":["full"],"name":"Complication x-open","description":"It goes wrong.","severity":"minor"}],"value":10,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/2r check:progressive complete/complete fired[sr-1:x-open]"}],
    ],
  },
  {
    name: "suppressChat posts no card while the roll still posts",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage({ interactive: true, rollDecision: BULK_DECISION, suppressChat: true });
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["chat.roll",{"flavor":"Iron Ore — Salvage check (DC 10)","total":17}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":2}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["returned",{"success":true,"results":["Item:made-1"],"message":"Successfully salvaged Iron Ore","value":17,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/1r check:simple complete/complete"}],
    ],
  },
  {
    name: "a resumed run with pending history refuses to replay its effects",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      await world.seedRun({ historySettlement: { consumption: 'pending', awards: 'pending' } });
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["threw",{"code":"HISTORY_EFFECT_UNCERTAIN","historyField":null,"message":"This run has invoked effects and cannot be replayed"}],
    ],
  },
  {
    name: "a partial consumption records consumption as uncertain and rethrows",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ quantity: 3, ingredientQuantity: 2, sourceQuantity: 1 })],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.delete","Item:ore"],
      ["run.getActiveRun","Actor:Salvager","rid-1"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple uncertain/pending"],
      ["threw",{"code":"HISTORY_EFFECT_UNCERTAIN","historyField":"consumption","message":"Partial salvage consumption"}],
    ],
  },
  {
    name: "an award-side throw records awards as uncertain and rethrows",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [
          target({
            resultGroups: [{ id: 'sg-1', results: [{ id: 'sr-1', componentId: 'ghost', quantity: 1 }] }],
          }),
        ],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["run.getActiveRun","Actor:Salvager","rid-1"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/uncertain"],
      ["threw",{"code":"HISTORY_EFFECT_UNCERTAIN","historyField":null,"message":"Item effects require reconciliation"}],
    ],
  },
  {
    name: "the settlement write is outside the try, so its rejection escapes uncaught",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target()],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      world.armCallFailure('updateRun', 'salvage run flag write rejected');
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["threw",{"code":null,"historyField":null,"message":"salvage run flag write rejected"}],
    ],
  },
  {
    name: "a bulk run shares one roll decision across three rows and posts one card",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [
          target(),
          { id: 'scrap', name: 'Bent Scrap', quantity: 2, ingredientQuantity: 1, resultGroups: SHARD_GROUP },
          { id: 'husk', name: 'Dry Husk', quantity: 2, ingredientQuantity: 1, resultGroups: SHARD_GROUP },
        ],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.bulkSalvage(['ore', 'scrap', 'husk']);
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["chat.roll",{"flavor":"Iron Ore — Salvage check (DC 10)","total":17}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":2}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","scrap"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"scrap","componentName":"Bent Scrap","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-2 scrap inProgress 0c/0t/0r"],
      ["chat.roll",{"flavor":"Bent Scrap — Salvage check (DC 10)","total":17}],
      ["run.updateRun","Actor:Salvager","Run:rid-2 scrap inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:scrap",{"system.quantity":1}],
      ["run.updateRun","Actor:Salvager","Run:rid-2 scrap inProgress 1c/0t/0r check:simple complete/pending"],
      ["item.update","Item:made-1",{"system.quantity":4}],
      ["run.updateRun","Actor:Salvager","Run:rid-2 scrap inProgress 1c/0t/1r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-2 scrap inProgress 1c/0t/1r check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.scrap","name":"Bent Scrap","img":"icons/scrap.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","husk"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"husk","componentName":"Dry Husk","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-3 husk inProgress 0c/0t/0r"],
      ["chat.roll",{"flavor":"Dry Husk — Salvage check (DC 10)","total":17}],
      ["run.updateRun","Actor:Salvager","Run:rid-3 husk inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:husk",{"system.quantity":1}],
      ["run.updateRun","Actor:Salvager","Run:rid-3 husk inProgress 1c/0t/0r check:simple complete/pending"],
      ["item.update","Item:made-1",{"system.quantity":6}],
      ["run.updateRun","Actor:Salvager","Run:rid-3 husk inProgress 1c/0t/1r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-3 husk inProgress 1c/0t/1r check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.husk","name":"Dry Husk","img":"icons/husk.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["chat.bulk",{"text":"FABRICATE.Chat.BulkSalvageSuccess FABRICATE.Chat.SalvageActor: Salvager FABRICATE.Chat.BulkSalvageSummary FABRICATE.Chat.BulkSalvageSubjects Iron Ore — FABRICATE.Chat.BulkSalvageOutcomeSucceeded FABRICATE.Chat.Roll 17 Bent Scrap — FABRICATE.Chat.BulkSalvageOutcomeSucceeded FABRICATE.Chat.Roll 17 Dry Husk — FABRICATE.Chat.BulkSalvageOutcomeSucceeded FABRICATE.Chat.Roll 17 FABRICATE.Chat.SalvageRecovered 6× Shard FABRICATE.Chat.SalvageConsumed Bent Scrap Dry Husk Iron Ore"}],
      ["bulk.returned",{"counts":{"total":3,"succeeded":3,"failed":0,"waiting":0,"misconfigured":0,"skipped":0,"cancelled":0,"error":0},"posted":true}],
    ],
  },
  {
    name: "an authored currency requirement is never read, checked or spent",
    async run() {
      const world = salvageRunProbe({
        salvageCraftingCheck: { simple: PASS_FAIL },
        targets: [target({ currencyRequirement: { units: [{ id: 'gp', amount: 5 }] } })],
        awards: [{ id: 'shard', name: 'Shard' }],
      });
      stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
      await world.salvage();
      return world.journal.entries;
    },
    journal: [
      ["run.findActiveRunForComponent","Actor:Salvager","sys-salvage","ore"],
      ["run.createRun","Actor:Salvager",{"actorUuid":"Actor.Salvager","craftingSystemId":"sys-salvage","componentId":"ore","componentName":"Iron Ore","status":"inProgress","startedAt":0,"usedTools":[],"resultOrder":null}],
      ["run.markRunInProgress","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r"],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 0c/0t/0r check:simple pending/pending"],
      ["item.update","Item:ore",{"system.quantity":2}],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/0r check:simple complete/pending"],
      ["actor.createEmbedded","Actor:Salvager","Item",[{"name":"Shard","quantity":2}]],
      ["run.updateRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending"],
      ["run.completeRun","Actor:Salvager","Run:rid-1 ore inProgress 1c/0t/1r check:simple complete/pending","succeeded",{"consumedComponents":[{"actorUuid":"Actor.Salvager","itemUuid":"Item.ore","name":"Iron Ore","img":"icons/ore.png","quantity":1}],"historySettlement":{"consumption":"complete","awards":"complete"},"usedTools":[],"createdResults":[{"actorUuid":"Actor.Salvager","itemUuid":"Actor.Salvager.Item.made-1","name":"Shard","img":"icons/src-shard.png","quantity":2,"componentId":"shard","resultRowId":"sg-1:sr-1:0","sourceItemUuid":"Item.src-shard"}],"checkResult":{"success":true,"outcome":"pass","value":17,"data":{"dc":10,"formula":"1d20","resolvedFormula":null,"total":17,"product":"sum","direction":"over","comparison":"meet","target":10,"margin":7,"successes":null,"cancelled":null,"diceGroups":[{"groupId":0,"group":"1d20","sum":17,"results":[17]}]}},"failureReason":null}],
      ["chat.create",{"alias":"Salvager","rolls":0,"text":"FABRICATE.Chat.SalvageSuccess FABRICATE.Chat.SalvageActor: Salvager · FABRICATE.Chat.SalvageSource: Iron Ore FABRICATE.Chat.Roll 17 FABRICATE.Chat.SalvageRecovered 2× Shard FABRICATE.Chat.SalvageConsumed Iron Ore"}],
      ["returned",{"success":true,"results":["Item:made-1"],"message":"Successfully salvaged Iron Ore","value":17,"salvageRun":"Run:rid-1 ore succeeded 1c/0t/1r check:simple complete/complete"}],
    ],
  },
];

for (const scenario of SCENARIOS) {
  test(`salvage pipeline effect journal: ${scenario.name}`, async () => {
    assert.deepEqual(await scenario.run(), scenario.journal);
  });
}
