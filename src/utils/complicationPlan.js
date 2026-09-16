/**
 * The PURE half of progressive component complications (issue 1286): which complications a
 * committed award fires, and the two player-facing projections of them. Buckets, firing unit and
 * dedupe key are the resolution-modes requirements "The five stage buckets", "The per-entry facts"
 * and "Once per result entry, never once per component". An import-free leaf but for
 * `componentComplications.js`, so a player view-model never pulls `checkRoll.js`'s sixteen-module
 * closure; `tests/component-complications-plan.test.js` pins that allowlist.
 */

import {
  COMPLICATION_ACTIVITIES,
  COMPLICATION_STAGE_CONDITIONS,
} from './componentComplications.js';

/** The five buckets, in the order a projection should present them. */
export const COMPLICATION_STAGE_BUCKETS = Object.freeze([
  'full',
  'partial',
  'halted',
  'unreached',
  'skipped',
]);

/** The buckets each stage-outcome clause reads. */
const BUCKETS_BY_STAGE_CONDITION = Object.freeze({
  stageAwarded: Object.freeze(['full']),
  stagePartial: Object.freeze(['partial']),
  stageMissed: Object.freeze(['halted', 'unreached']),
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function idOf(value) {
  if (typeof value === 'string') return value.trim() || null;
  const id = value?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function idSet(values) {
  const ids = new Set();
  for (const value of list(values)) {
    const id = idOf(value);
    if (id) ids.add(id);
  }
  return ids;
}

function readStage(stage, index) {
  const component = stage?.component ?? null;
  return {
    resultId: idOf(stage?.resultId ?? stage?.result ?? null),
    componentId: idOf(stage?.componentId ?? component ?? null),
    component,
    complications: list(stage?.complications ?? component?.complications),
    // WHERE IN THE RENDERED LIST THIS ENTRY SITS, 1-based, counting EVERY stage (issue 1286).
    position: index + 1,
  };
}

/** The bucket one stage lands in. */
function bucketFor(resultId, award) {
  if (!resultId) return 'skipped';
  if (award.skipped.has(resultId)) return 'skipped';
  if (resultId === award.partialId) return 'partial';
  if (award.awarded.has(resultId)) return 'full';
  if (resultId === award.haltedId) return 'halted';
  return 'unreached';
}

/** Classify the ordered stage list against the award loop's own report. */
function classifyStages(stages, award) {
  const buckets = {
    skipped: idSet(award?.skippedResults),
    awarded: idSet(award?.awarded),
    partialId: idOf(award?.partialResult ?? null),
    haltedId: idOf(award?.haltedResult ?? null),
  };
  return list(stages).map((stage, index) => {
    const read = readStage(stage, index);
    return { ...read, bucket: bucketFor(read.resultId, buckets) };
  });
}

/**
 * The facts the three stage-outcome clauses read for ONE result entry, from that entry's own bucket
 * and nothing else.
 */
function stageFacts(bucket) {
  const facts = {};
  for (const [condition, buckets] of Object.entries(BUCKETS_BY_STAGE_CONDITION)) {
    facts[condition] = buckets.includes(bucket);
  }
  return facts;
}

/**
 * `null` is a fail-OPEN sentinel meaning "the caller cannot say which triggers this block owns",
 * and it is LIVE on the runtime path: neither `CraftingEngine` nor `GatheringEngine` passes ids to
 * `planComplications`, so a clause naming an unknown trigger stays evaluable rather than being
 * silently made unsatisfiable.
 */
function isOwnedTrigger(triggerId, ownedTriggerIds) {
  return ownedTriggerIds === null || ownedTriggerIds.has(triggerId);
}

/** The ENABLED clauses of one complication and whether each matched. */
function resolveClauses(complication, ctx) {
  const clauses = [];
  for (const condition of COMPLICATION_STAGE_CONDITIONS) {
    if (complication?.when?.[condition] === true) {
      clauses.push({ name: condition, matched: ctx.facts[condition] === true });
    }
  }
  const triggerId = complication?.when?.checkTrigger;
  if (
    typeof triggerId === 'string' &&
    triggerId &&
    isOwnedTrigger(triggerId, ctx.ownedTriggerIds)
  ) {
    clauses.push({ name: 'checkTrigger', matched: ctx.matchedTriggerIds.has(triggerId) });
  }
  return clauses;
}

/**
 * Combine the enabled clauses under `match`, deferring to the runtime when — and only when — a live
 * condition roll is what is left to decide.
 */
function decideFiring(complication, clauses) {
  const needsDice = complication?.rollCondition?.enabled === true;
  if (clauses.length === 0 && !needsDice) return null;
  if (complication?.match === 'all') {
    if (clauses.some((clause) => !clause.matched)) return null;
    return { matched: clauses.map((clause) => clause.name), needsDice };
  }
  const matched = clauses.filter((clause) => clause.matched);
  if (matched.length > 0)
    return { matched: matched.map((clause) => clause.name), needsDice: false };
  return needsDice ? { matched: [], needsDice: true } : null;
}

function appliesToActivity(complication, activity) {
  return complication?.activities?.[activity] === true;
}

/** Every firing ONE result entry contributes, in authored complication order. */
function entryFirings(entry, ctx) {
  if (!entry.componentId || entry.bucket === 'skipped') return [];
  const facts = stageFacts(entry.bucket);
  const firings = [];
  const seen = new Set();
  for (const complication of entry.complications) {
    const complicationId = idOf(complication);
    if (!complicationId || seen.has(complicationId)) continue;
    if (!appliesToActivity(complication, ctx.activity)) continue;
    const clauses = resolveClauses(complication, { ...ctx, facts });
    const decision = decideFiring(complication, clauses);
    if (!decision) continue;
    seen.add(complicationId);
    firings.push({
      activity: ctx.activity,
      resolutionId: ctx.resolutionId,
      componentId: entry.componentId,
      componentName: text(entry.component?.name),
      complicationId,
      complication,
      resultId: entry.resultId,
      // The entry's place in the ordered list, carried so a player-facing output can name WHICH
      // occurrence fired without re-deriving an order it does not hold (issue 1286).
      position: entry.position,
      bucket: entry.bucket,
      buckets: [entry.bucket],
      matchedConditions: decision.matched,
      needsDice: decision.needsDice,
    });
  }
  return firings;
}

/** PLAN the complications a committed progressive award should fire. */
export function planComplications({
  activity,
  stages,
  award,
  matchedTriggerIds = [],
  checkTriggerIds = null,
  resolutionId = null,
} = {}) {
  const classified = classifyStages(stages, award);
  const reported = classified.map(({ resultId, componentId, bucket }) => ({
    resultId,
    componentId,
    bucket,
  }));
  const aborted = Boolean(award?.invalidResultId);
  const plan = { activity, resolutionId, aborted, stages: reported, firings: [] };
  if (aborted || !COMPLICATION_ACTIVITIES.includes(activity)) return plan;
  const ctx = {
    activity,
    resolutionId,
    matchedTriggerIds: idSet(matchedTriggerIds),
    ownedTriggerIds: checkTriggerIds === null ? null : idSet(checkTriggerIds),
  };
  // Fire order IS stage order: the player's reordered list for crafting, the order captured onto
  // the run at start for salvage, the authored order for gathering.
  for (const entry of classified) {
    plan.firings.push(...entryFirings(entry, ctx));
  }
  return plan;
}

/** The player-safe projection of ONE complication record. */
function projectForPlayer(complication) {
  return {
    id: idOf(complication),
    name: text(complication?.name),
    description: text(complication?.description),
    severity: text(complication?.severity),
    visibility: text(complication?.visibility),
  };
}

function visibilityOf(entry) {
  return text(entry?.complication?.visibility ?? entry?.visibility);
}

/**
 * The RESOLVED-tense player projection: filter a resolution's fired complications to what a player
 * may see.
 */
export function publicComplications(fired) {
  return list(fired)
    .filter((entry) => visibilityOf(entry) === 'visible')
    .map((entry) => {
      const projected = projectForPlayer(entry.complication ?? entry);
      return {
        resultId: entry?.resultId ?? null,
        componentId: entry?.componentId ?? null,
        complicationId: entry?.complicationId ?? projected.id,
        // Null rather than absent for a firing minted before this key existed (a run record read
        // back, a hand-built fixture), so a renderer tests one thing to decide whether it can name
        // a position at all.
        position: Number.isFinite(entry?.position) ? entry.position : null,
        buckets: [...list(entry?.buckets)],
        name: projected.name,
        description: projected.description,
        severity: projected.severity,
      };
    });
}

/**
 * Whether a complication has any clause that could EVER match, so the bulk block's "N complications
 * could fire" is not a lie.
 */
function canEverFire(complication, ownedTriggerIds) {
  if (complication?.rollCondition?.enabled === true) return true;
  if (COMPLICATION_STAGE_CONDITIONS.some((name) => complication?.when?.[name] === true))
    return true;
  const triggerId = complication?.when?.checkTrigger;
  return (
    typeof triggerId === 'string' &&
    Boolean(triggerId) &&
    isOwnedTrigger(triggerId, ownedTriggerIds)
  );
}

/**
 * The FORECAST-tense player projection: the `visible` complications a component COULD fire in an
 * activity, with no roll and no run.
 */
export function forecastComplications(component, { activity, checkTriggerIds }) {
  const ownedTriggerIds = idSet(checkTriggerIds);
  return list(component?.complications)
    .filter((complication) => complication?.visibility === 'visible')
    .filter((complication) => appliesToActivity(complication, activity))
    .filter((complication) => canEverFire(complication, ownedTriggerIds))
    .map((complication) => projectForPlayer(complication));
}
