/**
 * Persisted history-data witnesses: recovered identity, legacy row rolls and settled receipts.
 *
 * Records are assembled through the writers' own normalizers, so a field the Journal reads is a
 * field a manager persists. The mining witness keeps the saved world's independent per-row rolls
 * 12 and 94 with receipts 2 and 1, which no evaluated row quantity can supply.
 */
import { historyEvidenceFields, itemReceipt } from '../../../src/systems/runHistoryEvidence.js';

import { ICON_BASE, LAB_SYSTEM_IDS } from './labContent.js';

const MINING_TASK_ID = 'sm-task-prospect';
const MINE_ENVIRONMENT_ID = 'sm-env-mine';
// The retained registration spelling from the saved world: a pack address with no `Item`
// qualifier. Its hauls use the equivalent `Item`-qualified spelling, and only that equivalence
// recovers the mining quantities.
const ORE_PACK = 'Compendium.fabricate-lab.ore';
const ART = Object.freeze({
  'sm-iron-ore': 'commodities/stone/ore-chunk-brown.webp',
  'sm-copper-ore': 'commodities/stone/ore-chunk-copper-orange.webp',
  'sm-silver-ore': 'commodities/stone/ore-chunk-blue.webp',
  'sm-coal': 'commodities/stone/ore-chunk-black.webp',
  'sm-ruby': 'commodities/gems/gem-faceted-radiant-red.webp',
  'sm-iron-ingot': 'commodities/metal/ingot-worn-iron.webp',
  'sm-steel-ingot': 'commodities/metal/ingot-stack-steel.webp',
  'al-quicksilver': 'commodities/stone/ore-chunk-blue.webp',
  'al-sulphur': 'commodities/materials/bowl-powder-yellow.webp',
});

/** Focused persisted states, each selected by one `journalCaseState` query. */
export const LAB_HISTORY_DATA_STATES = Object.freeze([
  'history-data-legacy-row-rolls',
  'history-data-shared-roll-control',
  'history-data-recovered-materials',
  'history-data-unknown-material-resolution',
  'history-data-settled-zero',
  'history-data-uncertain-awards',
  'history-data-fizzle',
  'history-data-salvage',
]);

const art = (componentId) => `${ICON_BASE}/${ART[componentId]}`;
const stateRunId = (state) => `lab-v1-${state}`;

function requireEntry(entries, id, kind) {
  const found = (entries ?? []).find((entry) => entry?.id === id);
  if (!found) throw new Error(`labHistoryEvidence: fixture requires the real ${kind} "${id}"`);
  return found;
}

/** One evaluated drop row, in the shape `rollDropRow` records onto `checkResult.itemRows`. */
function dropRow([id, componentId, quantity, finalDropRate, roll, modifier = 0], rank) {
  return {
    id,
    componentId,
    quantity,
    itemUuid: '',
    sourceItemUuid: `${ORE_PACK}.${componentId}`,
    rank,
    dropRate: finalDropRate,
    finalDropRate,
    roll,
    modifier,
    conditionModifier: 0,
    characterModifierTotal: 0,
    characterModifierFactor: 1,
    effectiveRoll: roll === null ? null : roll + modifier,
    threshold: finalDropRate === null ? null : 101 - finalDropRate,
    // An outcome exists only where the row was actually resolved; the neutral row records none.
    ...(finalDropRate !== null &&
      roll !== null && { dropped: roll + modifier >= 101 - finalDropRate }),
  };
}

function evaluatedRows(specs, { linked = false } = {}) {
  return specs.map((spec, rank) => {
    const row = dropRow(spec, rank);
    return linked ? { ...row, resultRowId: `${spec[0]}:${rank}` } : row;
  });
}

/** An owned receipt: the destination stack, plus whatever identity the writer captured on it. */
function ownedReceipt(context, itemId, fields) {
  return itemReceipt({
    actorUuid: context.actorUuid,
    itemUuid: `${context.actorUuid}.Item.${itemId}`,
    ...fields,
  });
}

/** A component receipt, taking the display identity the catalogue carries for that component. */
function partReceipt(context, itemId, componentId, name, quantity) {
  return ownedReceipt(context, itemId, { componentId, name, img: art(componentId), quantity });
}

/**
 * Haul receipts. The older haul carried captured names and a source address rather than a
 * component id; the repaired writer carries an explicit result-row link instead.
 */
function hauls(context, rows, links = []) {
  return rows.map(([componentId, name, quantity, itemId], index) =>
    ownedReceipt(context, itemId, {
      name,
      img: art(componentId),
      quantity,
      ...(links[index] === undefined
        ? { sourceItemUuid: `${ORE_PACK}.Item.${componentId}` }
        : { resultRowId: links[index] }),
    })
  );
}

function gatheringHistoryRun({
  context,
  state,
  task,
  checkResult,
  awards,
  status = 'succeeded',
  settlement = null,
  versioned = false,
}) {
  const id = stateRunId(state);
  const closedAt = context.now - context.hour;
  const base = {
    id,
    actorUuid: context.actorUuid,
    userId: context.userId,
    craftingSystemId: task.craftingSystemId,
    environmentId: MINE_ENVIRONMENT_ID,
    taskId: task.id,
    status,
    startedAtWorldTime: closedAt - 2 * context.hour,
    updatedAtWorldTime: closedAt,
    completedAtWorldTime: closedAt,
    timeGate: {
      requiredSeconds: 2 * context.hour,
      initiatedAt: closedAt - 2 * context.hour,
      availableAt: closedAt,
    },
    economyEvidence: { runtimeSnapshot: { task } },
    checkResult,
    createdResults: awards,
    ...(settlement && historyEvidenceFields({ historySettlement: settlement })),
  };
  if (!versioned) return base;
  return {
    ...base,
    lifecycleVersion: 1,
    runRevision: 1,
    completionMode: 'manual',
    pausedDurationSeconds: 0,
    executionJournal: {
      operationId: `${id}-collect`,
      requestId: `${id}-request`,
      baseRunRevision: 0,
      status: 'committed',
      // The applied receipt is the award authority; an absent one cannot establish zero.
      effects: [
        { effectId: 'results', kind: 'createGatheredResults', phase: 'applied', receipt: awards },
      ],
    },
  };
}

function craftingHistoryRun({
  context,
  id,
  recipe,
  status,
  finishedAt,
  step,
  executionJournal = null,
}) {
  return {
    id,
    actorUuid: context.actorUuid,
    userId: context.userId,
    craftingSystemId: recipe.craftingSystemId,
    recipeId: recipe.id,
    status,
    startedAt: finishedAt - 3 * context.hour,
    updatedAt: finishedAt,
    finishedAt,
    currentStepIndex: 0,
    steps: [step],
    componentSourceActorUuids: [context.actorUuid],
    ...(executionJournal && {
      lifecycleVersion: 1,
      runRevision: 2,
      completionMode: 'manual',
      pausedDurationSeconds: 0,
      executionJournal,
    }),
  };
}

function craftingStep(recipe, { status, completedAt, consumed = [], created = [], prepared = null }) {
  const authored = recipe.getExecutionSteps()[0];
  return {
    index: 0,
    stepId: authored.id,
    stepName: authored.name || 'Step 1',
    status,
    startedAt: completedAt - 3600,
    updatedAt: completedAt,
    completedAt,
    consumedIngredients: consumed,
    createdResults: created,
    usedTools: [],
    ...(prepared && { preparedConsumption: { consumedSummary: prepared } }),
  };
}

// Evaluated rows as `[id, componentId, quantity, finalDropRate, roll, modifier]`.
//
// The legacy pair is the saved world's: two genuinely independent rolls, no root roll at all, and
// authored quantities that deliberately differ from the receipts so nothing can read one for the
// other. The shared trio carries one root roll and a modifier, so its raw roll differs from the
// effective roll every row was read against.
const MINING_LEGACY_ROWS = [
  ['legacy-iron-ore-roll-12', 'sm-iron-ore', 3, 90, 12],
  ['legacy-copper-ore-roll-94', 'sm-copper-ore', 5, 35, 94],
];
const MINING_SHARED_ROWS = [
  ['shared-iron-ore', 'sm-iron-ore', 2, 90, 40, 15],
  ['shared-coal', 'sm-coal', 2, 50, 40, 15],
  ['shared-ruby', 'sm-ruby', 1, 5, 40, 15],
];
const MINING_UNKNOWN_ROWS = [
  ['unknown-silver-ore', 'sm-silver-ore', 1, 70, 55],
  ['unknown-coal', 'sm-coal', 2, 50, 55],
  // Never resolved: no rate, no roll, and therefore no recorded outcome.
  ['unknown-ruby', 'sm-ruby', 1, null, null],
];
const MINING_BARREN_ROWS = [
  ['barren-iron-ore', 'sm-iron-ore', 3, 50, 2],
  ['barren-coal', 'sm-coal', 2, 35, 2],
  ['barren-ruby', 'sm-ruby', 1, 5, 2],
];

function legacyRowRolls(context, task) {
  const rows = evaluatedRows(MINING_LEGACY_ROWS);
  const awards = hauls(context, [
    ['sm-iron-ore', 'Iron Ore', 2, 'lab-haul-iron'],
    ['sm-copper-ore', 'Copper Ore', 1, 'lab-haul-copper'],
  ]);
  return gatheringHistoryRun({
    context,
    state: 'history-data-legacy-row-rolls',
    task,
    awards,
    checkResult: { provider: 'd100', success: true, itemRows: rows, items: rows },
  });
}

function sharedRollControl(context, task) {
  const rows = evaluatedRows(MINING_SHARED_ROWS, { linked: true });
  const awards = hauls(
    context,
    [
      ['sm-iron-ore', 'Iron Ore', 2, 'lab-cut-iron'],
      ['sm-coal', 'Coal', 2, 'lab-cut-coal'],
    ],
    [rows[0].resultRowId, rows[1].resultRowId]
  );
  return gatheringHistoryRun({
    context,
    state: 'history-data-shared-roll-control',
    task,
    awards,
    versioned: true,
    settlement: { awards: 'complete' },
    checkResult: {
      provider: 'd100',
      success: true,
      roll: 40,
      value: 40,
      data: { total: 40, resolvedFormula: '1d100' },
      itemRows: rows,
      items: rows.filter((row) => row.dropped),
    },
  });
}

function unknownMaterialResolution(context, task) {
  const rows = evaluatedRows(MINING_UNKNOWN_ROWS);
  const awards = [
    ...hauls(context, [['sm-silver-ore', 'Silver Ore', 3, 'lab-known-silver']]),
    // A haul whose recorded source belongs to no evaluated row: its quantity is real, its row is not.
    ownedReceipt(context, 'lab-unattributed-ruby', {
      sourceItemUuid: `${ORE_PACK}.Item.sm-ruby-cluster`,
      name: 'Cave Ruby',
      img: art('sm-ruby'),
      quantity: 1,
    }),
  ];
  return gatheringHistoryRun({
    context,
    state: 'history-data-unknown-material-resolution',
    task,
    awards,
    checkResult: {
      provider: 'd100',
      success: true,
      roll: 55,
      value: 55,
      data: { total: 55, resolvedFormula: '1d100' },
      itemRows: rows,
      items: rows,
    },
  });
}

function settledZero(context, task) {
  const rows = evaluatedRows(MINING_BARREN_ROWS);
  return gatheringHistoryRun({
    context,
    state: 'history-data-settled-zero',
    task,
    awards: [],
    status: 'failed',
    versioned: true,
    settlement: { awards: 'complete' },
    checkResult: {
      provider: 'd100',
      success: false,
      roll: 2,
      value: 2,
      data: { total: 2, resolvedFormula: '1d100' },
      itemRows: rows,
      items: [],
    },
  });
}

function recoveredMaterials(context) {
  const folded = requireEntry(context.recipes, 'sm-r-steel-ingot', 'recipe');
  const smelted = requireEntry(context.recipes, 'sm-r-iron-ingot', 'recipe');
  const lean = (itemId, quantity) => ownedReceipt(context, itemId, { quantity });
  const closedAt = context.now - context.hour;
  const selected = craftingHistoryRun({
    context,
    id: stateRunId('history-data-recovered-materials'),
    recipe: folded,
    status: 'succeeded',
    finishedAt: closedAt,
    step: craftingStep(folded, {
      status: 'succeeded',
      completedAt: closedAt,
      // Lean rows exactly as the older writer left them: an owned address and a quantity.
      consumed: [
        lean('lab-billet-stack', 2),
        lean('lab-coal-stack', 2),
        lean('lab-deleted-flux', 3),
      ],
      created: [partReceipt(context, 'lab-steel-stack', 'sm-steel-ingot', 'Steel Ingot', 1)],
      // Captured physical metadata wins over the live requirement name.
      prepared: [
        ownedReceipt(context, 'lab-billet-stack', {
          name: 'Steel Billet',
          img: art('sm-steel-ingot'),
          quantity: 2,
        }),
      ],
    }),
  });
  const earlier = craftingHistoryRun({
    context,
    id: 'lab-v1-history-data-recovered-source',
    recipe: smelted,
    status: 'succeeded',
    finishedAt: context.now - 6 * context.hour,
    step: craftingStep(smelted, {
      status: 'succeeded',
      completedAt: context.now - 6 * context.hour,
      // The same physical coal stack, captured with its name back when this run recorded it.
      consumed: [partReceipt(context, 'lab-coal-stack', 'sm-coal', 'Coal', 1)],
      created: [partReceipt(context, 'lab-iron-ingot-stack', 'sm-iron-ingot', 'Iron Ingot', 1)],
    }),
  });
  return [selected, earlier];
}

function uncertainAwards(context) {
  const smelted = requireEntry(context.recipes, 'sm-r-iron-ingot', 'recipe');
  const id = stateRunId('history-data-uncertain-awards');
  const finishedAt = context.now - context.hour;
  const spent = partReceipt(context, 'lab-uncertain-ore', 'sm-iron-ore', 'Iron Ore', 2);
  const banked = partReceipt(context, 'lab-uncertain-ingot', 'sm-iron-ingot', 'Iron Ingot', 1);
  return craftingHistoryRun({
    context,
    id,
    recipe: smelted,
    status: 'succeeded',
    finishedAt,
    step: craftingStep(smelted, {
      status: 'succeeded',
      completedAt: finishedAt,
      consumed: [spent],
      created: [banked],
    }),
    executionJournal: {
      operationId: `${id}-forge`,
      requestId: `${id}-request`,
      baseRunRevision: 1,
      status: 'recoveryRequired',
      intent: { stepIndex: 0 },
      // A confirmed prefix belongs to its still-uncertain effect, never to an applied one.
      effects: [
        {
          effectId: 'consume',
          kind: 'consumeIngredients',
          phase: 'applied',
          receipt: { items: [spent] },
        },
        {
          effectId: 'award',
          kind: 'awardItems',
          phase: 'applying',
          receipt: { confirmed: [banked], uncertain: true },
        },
        { effectId: 'chat', kind: 'postCraftChat', phase: 'planned' },
      ],
    },
  });
}

function fizzle(context) {
  const finishedAt = context.now - context.hour;
  return {
    id: stateRunId('history-data-fizzle'),
    actorUuid: context.actorUuid,
    userId: context.userId,
    craftingSystemId: LAB_SYSTEM_IDS.ALCHEMY,
    recipeId: null,
    isFizzle: true,
    status: 'failed',
    startedAt: finishedAt - context.hour,
    updatedAt: finishedAt,
    finishedAt,
    currentStepIndex: null,
    steps: [],
    ...historyEvidenceFields({
      resolutionSnapshot: { kind: 'none', mode: 'alchemy' },
      historySettlement: { consumption: 'complete', awards: 'complete' },
    }),
    consumedIngredients: [
      partReceipt(context, 'lab-fizzle-quicksilver', 'al-quicksilver', 'Quicksilver', 1),
      partReceipt(context, 'lab-fizzle-sulphur', 'al-sulphur', 'Yellow Sulphur', 2),
    ],
    createdResults: [],
  };
}

function salvage(context) {
  const finishedAt = context.now - context.hour;
  // Two per-invocation receipts from ONE source row: a new stack and a top-up of an existing one.
  const scrap = (itemId, quantity) => ({
    ...partReceipt(context, itemId, 'sm-iron-ore', 'Iron Ore', quantity),
    resultRowId: 'salvage-scrap-row:0',
  });
  return {
    id: stateRunId('history-data-salvage'),
    actorUuid: context.actorUuid,
    userId: context.userId,
    craftingSystemId: LAB_SYSTEM_IDS.SMITHING,
    componentId: 'sm-steel-ingot',
    componentName: 'Steel Ingot',
    status: 'failed',
    startedAt: finishedAt - context.hour,
    updatedAt: finishedAt,
    finishedAt,
    consumedComponents: [],
    usedTools: [],
    createdResults: [scrap('lab-salvage-scrap-new', 1), scrap('lab-salvage-scrap-stack', 2)],
    checkResult: {
      success: false,
      outcome: 'Short',
      value: 6,
      data: { resolvedFormula: '1d20 + 2', total: 6, dc: 14 },
    },
    ...historyEvidenceFields({
      resolutionSnapshot: { kind: 'check', mode: 'simple' },
      // The failure spared the source item, so nothing was consumed and nothing is unknown.
      historySettlement: { consumption: 'notApplicable', awards: 'complete' },
    }),
  };
}

/**
 * Run sets per focused history-data state, keyed by `journalCaseState`.
 *
 * @param {object} context Actor identity, world clock and the seeded recipes/tasks.
 * @returns {Record<string, () => object>} Container inputs for `emptyRunContainers`.
 */
export function historyDataRunSets(context) {
  const task = () => requireEntry(context.tasks, MINING_TASK_ID, 'gathering task');
  const gathering = (build) => () => ({ gatheringHistory: [build(context, task())] });
  return {
    'history-data-legacy-row-rolls': gathering(legacyRowRolls),
    'history-data-shared-roll-control': gathering(sharedRollControl),
    'history-data-unknown-material-resolution': gathering(unknownMaterialResolution),
    'history-data-settled-zero': gathering(settledZero),
    'history-data-recovered-materials': () => ({ craftingHistory: recoveredMaterials(context) }),
    'history-data-uncertain-awards': () => ({ craftingHistory: [uncertainAwards(context)] }),
    'history-data-fizzle': () => ({ craftingHistory: [fizzle(context)] }),
    'history-data-salvage': () => ({ salvageHistory: [salvage(context)] }),
  };
}
