/** Read-only presentation of the builder's entitled evidence, with no catalogue or runtime reads. */
import { formatCountRoll, formatGradedRoll } from './runDetailPresentation.js';

const prefix = 'FABRICATE.App.Journal.History.';
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value) => value != null && Number.isFinite(Number(value));
const named = (value) => typeof value === 'string' && value.trim() !== '';

export function materialText(item, localize) {
  const name = named(item?.name) ? item.name : localize(`${prefix}UnknownMaterial`);
  const quantity = finite(item?.quantity)
    ? localize('FABRICATE.App.Journal.Quantity', { n: item.quantity })
    : localize(`${prefix}NotRecorded`);
  return `${name} · ${quantity}`;
}

/** Recorded item rows, with an absent quantity or name stated as unrecorded rather than filled in. */
export function presentMaterials(items, localize) {
  return list(items).map((item, index) => ({
    ...item,
    id: JSON.stringify([item.actorUuid, item.itemUuid ?? item.componentId, index]),
    name: named(item.name) ? item.name : localize(`${prefix}UnknownMaterial`),
    quantityText: finite(item.quantity)
      ? localize('FABRICATE.App.Journal.Quantity', { n: item.quantity })
      : localize(`${prefix}NotRecorded`),
    label: materialText(item, localize),
  }));
}

/**
 * The settled currency spends of one stage, as label/value rows. A currency-only ingredient set
 * is authorable (D-031), so this is the third receipt field — beside materials and essence — that
 * the live and terminal readings of one record MUST render identically.
 *
 * A non-positive or unnamed amount is dropped: a record that settled nothing is not a payment.
 */
export function presentCurrencySpends(spends, localize) {
  return list(spends)
    .filter((spend) => finite(spend?.amount) && Number(spend.amount) > 0 && named(spend?.unit))
    .map((spend, index) => ({
      id: `currency-${index}`,
      label: localize(`${prefix}CurrencySpent`),
      value: `${spend.amount} ${spend.unit}`,
    }));
}

/** The amount a credit's roll states, or '' for a fixed amount (issue 1645). */
function rolledText(rolled, localize) {
  return named(rolled?.formula) && finite(rolled?.total)
    ? localize('FABRICATE.App.Journal.RolledAmount', {
        formula: rolled.formula,
        total: rolled.total,
      })
    : '';
}

/**
 * One stage's currency credits and knowledge grants as label/value rows (issue 1773), as its
 * currency spends are: a credit under its label with its amount, roll and reason, and a grant
 * saying whether its recipe was learned or already known. `quantity` is what it banked.
 */
export function presentRewards(stage, localize) {
  const credits = list(stage?.currencyCredits).map((credit, index) => {
    const unit = named(credit.unitName) ? credit.unitName : credit.unit;
    return {
      id: `credit-${stage?.stepId ?? ''}-${index}`,
      kind: 'currency',
      icon: 'fa-coins',
      label: named(credit.label) ? credit.label : localize(`${prefix}CurrencyAwarded`),
      value: [`${credit.amount} ${unit}`, rolledText(credit.rolled, localize), credit.reason]
        .filter(named)
        .join(' · '),
      quantity: credit.amount,
    };
  });
  const grants = list(stage?.knowledgeGrants).map((grant, index) => {
    const known = grant.outcome === 'alreadyKnown';
    return {
      id: `grant-${stage?.stepId ?? ''}-${index}`,
      kind: 'knowledge',
      icon: 'fa-book-open',
      label: localize(`${prefix}${known ? 'RecipeAlreadyKnown' : 'RecipeLearned'}`),
      value: named(grant.recipeName) ? grant.recipeName : grant.recipeId,
      quantity: known ? 0 : 1,
    };
  });
  return [...credits, ...grants];
}

function checkText(check, localize) {
  if (!check) return '';
  if (check.count) return formatCountRoll(check.count, localize);
  const total = finite(check.total) ? check.total : check.value;
  if (!finite(total)) return '';
  // Outside sum/over/fixed the executed target and margin, never a DC (issue 2005).
  const graded = formatGradedRoll(
    {
      formula: named(check.formula) ? check.formula : '',
      total: Number(total),
      value: Number(total),
      target: finite(check.target) ? Number(check.target) : NaN,
      margin: finite(check.margin) ? Number(check.margin) : NaN,
    },
    localize
  );
  if (graded) return graded;
  const suffix = finite(check.dc) ? 'WithDc' : '';
  const key = named(check.formula) ? 'RollResult' : 'RollResultValue';
  return localize(`FABRICATE.App.Journal.StepDetails.${key}${suffix}`, {
    formula: check.formula,
    total,
    value: total,
    ...(finite(check.dc) && { dc: check.dc }),
  });
}

/**
 * The recorded essence contribution of one stage: what each carrier gave, and the authored
 * amounts it was measured against. Shared with the ACTIVE started stage (issue 1648, M21), so
 * a stage's essence reads the same before and after its run finishes.
 */
export function presentEssenceSpend(stage, localize) {
  if (!stage?.essenceSpend) return null;
  const carriers = presentMaterials(stage.essenceSpend.carriers, localize);
  const totals = {};
  for (const carrier of carriers) {
    for (const contribution of list(carrier.contributions)) {
      if (!finite(contribution.amount)) continue;
      totals[contribution.essenceId] =
        (totals[contribution.essenceId] ?? 0) + Number(contribution.amount);
    }
  }
  const requirements = list(stage.selectedRequirementSnapshot?.ingredientGroups).flatMap(
    (group) => {
      const picked = stage.selectionPlan?.ingredientOptionOverrides?.[group.id]?.optionIndex ?? 0;
      return list(group.options)
        .filter((_option, index) => index === picked)
        .map((option) => option.match)
        .filter((match) => match?.type === 'essence');
    }
  );
  return { carriers, totals, labels: stage.essenceSpend.labels ?? {}, requirements };
}

/** One attempted or browsed stage. Absence is distinct from a captured empty receipt. */
export function presentStage(stage, localize) {
  const check = checkText(stage?.lastCheckResult, localize);
  const kind = stage?.resolutionSnapshot?.kind ?? (check ? 'check' : 'unknown');
  const resolution =
    check ||
    localize(
      `${prefix}${{ none: 'NoCheck', ingredients: 'ByIngredients' }[kind] ?? 'NotRecorded'}`
    );
  return {
    ...stage,
    name: stage?.presentationSnapshot?.name || stage?.stepName || localize(`${prefix}NotRecorded`),
    description: stage?.presentationSnapshot?.description || '',
    kind,
    check,
    resolution,
    route: stage?.selectedRequirementSnapshot?.name || '',
    consumed: presentMaterials(stage?.consumedIngredients, localize),
    produced: presentMaterials(stage?.createdResults, localize),
    rewards: presentRewards(stage, localize),
    tools: presentMaterials(stage?.usedTools, localize),
    essence: presentEssenceSpend(stage ?? {}, localize),
  };
}

function attempted(stage) {
  if (typeof stage?.attempted === 'boolean') return stage.attempted;
  return (
    ['succeeded', 'done', 'failed'].includes(stage?.status) ||
    Boolean(stage?.lastCheckResult) ||
    list(stage?.consumedIngredients).length > 0 ||
    list(stage?.createdResults).length > 0
  );
}

function closedKey(run, stages, results) {
  if (run?.recoveryEvidence?.required) return 'ClosedRecovery';
  if (run?.recoveryEvidence?.status === 'planned') return 'SettlementPending';
  if (run?.redacted) return 'ClosedRedacted';
  if (run?.status === 'cancelled') return cancelledClosedKey(run, stages);
  if (run?.status === 'failed') {
    if (results.some((entry) => finite(entry.quantity) && Number(entry.quantity) > 0))
      return 'ClosedFailureAwards';
    if (stages.some((stage) => stage.check) || run?.gatheringYield?.check)
      return 'ClosedFailedCheck';
    if (recordedEmptyAwards(run, stages, results)) return 'ClosedFailedEmpty';
    return 'ClosedMissing';
  }
  if (results.some((entry) => finite(entry.quantity) && Number(entry.quantity) > 0))
    return 'ClosedSuccess';
  return recordedEmptyAwards(run, stages, results) ? 'ClosedSuccessEmpty' : 'ClosedMissing';
}

// Plurals are TWO whole literal keys chosen by a ternary. A concatenated suffix
// credits only the prefix under the lang-key orphan guard and strands the leaf.
function cancelledClosedKey(run, stages) {
  if (run?.lifecycleContract === 'legacy') return 'ClosedLegacyCancelled';
  if (stages.length === 0) return 'ClosedCancelledBefore';
  return stages.length === 1 ? 'ClosedCancelledOne' : 'ClosedCancelledMany';
}

function recordedEmptyAwards(run, stages, results) {
  const recorded =
    run?.createdResultsRecorded === true ||
    (stages.length > 0 && stages.every((stage) => stage.createdResultsRecorded === true));
  return (
    recorded && results.every((entry) => finite(entry.quantity) && Number(entry.quantity) === 0)
  );
}

function gatheringSummary(run, localize) {
  if (run?.runType !== 'gathering' && run?.resolutionSnapshot?.kind) {
    const stage = presentStage(
      { resolutionSnapshot: run.resolutionSnapshot, lastCheckResult: run.lastCheckResult },
      localize
    );
    return { kind: stage.kind, value: stage.resolution };
  }
  const mode = run?.gatheringYield?.mode;
  if (run?.runType === 'gathering') {
    if (mode === 'straight') return { kind: 'none', value: localize(`${prefix}NoRoll`) };
    if (['routed', 'progressive'].includes(mode))
      return {
        kind: 'check',
        value: checkText(run.gatheringYield.check, localize) || localize(`${prefix}NotRecorded`),
      };
  }
  return { kind: 'unknown', value: localize(`${prefix}NotRecorded`) };
}

function historySummary(run, stages, localize) {
  if (
    stages.length > 1 ||
    run?.status === 'cancelled' ||
    run?.redacted ||
    run?.gatheringYield?.mode === 'd100'
  )
    return null;
  const stage = stages[0];
  const summary = stage
    ? { kind: stage.kind, value: stage.resolution }
    : gatheringSummary(run, localize);
  return run?.status === 'failed' && summary.kind === 'check' ? null : summary;
}

function usableHistoricalScale(run) {
  return run?.gatheringYield?.mode === 'd100' && list(run.gatheringYield.entries).length > 0;
}

function unattributedScaleResults(run, results) {
  const indexes = run?.gatheringYield?.unattributedAwardIndexes;
  return Array.isArray(indexes)
    ? results.filter((_entry, index) => indexes.includes(index))
    : results;
}

/**
 * Whether the unattributed list is the WHOLE haul rather than a subset of it.
 * The gate moved from all-or-nothing to a per-award subset, and the two need different copy:
 * a partial list under whole-haul wording reads as the total.
 */
function unattributedIsWholeHaul(unattributed, results) {
  return unattributed.length === results.length;
}

// Identity comes only from a recorded Actor Item address, never from current metadata.
// A contradictory actor qualifier, virtual tool or ambiguous address stays an occurrence.
function physicalToolKey(tool) {
  if (tool.virtual === true || !named(tool.itemUuid)) return null;
  const match = /^(Actor\.[^.]+|Scene\.[^.]+\.Token\.[^.]+\.Actor\.[^.]+)\.Item\.[^.]+$/.exec(
    tool.itemUuid
  );
  if (!match || (named(tool.actorUuid) && tool.actorUuid !== match[1])) return null;
  return tool.itemUuid;
}

function toolOccurrenceText(tool, stageIndex, localize) {
  const state = [
    ['broken', 'ToolBroken'],
    ['virtual', 'ToolVirtual'],
    ['spared', 'ToolSpared'],
    ['skippedImmune', 'ToolImmune'],
  ]
    .filter(([flag]) => tool[flag] === true)
    .map(([, key]) => localize(`${prefix}${key}`));
  return [
    localize(`${prefix}ToolOccurrence`, { stage: stageIndex + 1, quantity: tool.quantityText }),
    ...state,
  ].join(' · ');
}

function historyTools(stages, localize) {
  const cards = [];
  const byPhysicalItem = new Map();
  for (const [index, stage] of stages.entries()) {
    const stageIndex = Number.isInteger(stage.index) ? stage.index : index;
    for (const tool of stage.tools) {
      const key = physicalToolKey(tool);
      let card = key ? byPhysicalItem.get(key) : null;
      if (!card) {
        card = {
          id: `tool-${cards.length}`,
          name: tool.name,
          img: tool.img,
          quantityText: null,
          occurrences: [],
          evidence: '',
        };
        cards.push(card);
        if (key) byPhysicalItem.set(key, card);
      }
      card.occurrences.push({ ...tool, stepId: stage.stepId, stageIndex });
      const evidence = toolOccurrenceText(tool, stageIndex, localize);
      card.evidence = card.evidence ? `${card.evidence}; ${evidence}` : evidence;
    }
  }
  return cards;
}

/** Choose the terminal composition from typed receipts, never from translated mode labels. */
export function presentHistory(run, localize) {
  const stages = run?.redacted
    ? []
    : list(run?.steps)
        .filter(attempted)
        .map((stage) => presentStage(stage, localize));
  const results = presentMaterials(run?.createdResults, localize);
  const rewards = stages.flatMap((stage) => stage.rewards);
  const multi = stages.length > 1;
  const mode = run?.gatheringYield?.mode;
  const gathering = run?.runType === 'gathering';
  const cancelled = run?.status === 'cancelled';
  const failed = run?.status === 'failed';
  const stage = stages[0];
  const unattributed = unattributedScaleResults(run, results);
  return {
    stages,
    consumed: presentMaterials(run?.consumedIngredients, localize),
    tools: historyTools(stages, localize),
    results,
    multi,
    gathering,
    mode,
    usableScale: usableHistoricalScale(run),
    unattributedResults: unattributed,
    unattributedWholeHaul: unattributedIsWholeHaul(unattributed, results),
    settling: run?.recoveryEvidence?.status === 'planned',
    gatheringCheck: checkText(run?.gatheringYield?.check, localize),
    gatheringOutcome: run?.gatheringYield?.check?.outcome || localize(`${prefix}NotRecorded`),
    summary: historySummary(run, stages, localize),
    failed,
    cancelled,
    verdictCheck: failed && !multi && mode !== 'routed' ? (stage?.check ?? '') : '',
    failureDetail:
      run?.failureReason === 'checkFailed'
        ? localize(`${prefix}CheckFailed`)
        : run?.failureReason ||
          stages.find((entry) => entry.status === 'failed')?.detail?.failureText ||
          localize(`${prefix}FailureReason`),
    rewards,
    closed: localize(`${prefix}${closedKey(run, stages, [...results, ...rewards])}`, {
      count: stages.length,
    }),
  };
}
