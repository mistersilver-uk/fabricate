/**
 * The pure half of component complications (issue 1286): what a committed award fires, and its two
 * player projections, per `resolution-modes` "The five stage buckets", "The per-entry facts" and
 * "Once per result entry, never once per component". It imports only `componentComplications.js`,
 * pinned by `tests/component-complications-plan.test.js`, so no view-model pulls `checkRoll.js`.
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
    // 1-based position in the rendered list, counting every stage (issue 1286).
    position: index + 1,
  };
}

function bucketFor(resultId, award) {
  if (!resultId) return 'skipped';
  if (award.skipped.has(resultId)) return 'skipped';
  if (resultId === award.partialId) return 'partial';
  if (award.awarded.has(resultId)) return 'full';
  if (resultId === award.haltedId) return 'halted';
  return 'unreached';
}

/** Against the award loop's own report. */
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

/** From the entry's own bucket and nothing else. */
function stageFacts(bucket) {
  const facts = {};
  for (const [condition, buckets] of Object.entries(BUCKETS_BY_STAGE_CONDITION)) {
    facts[condition] = buckets.includes(bucket);
  }
  return facts;
}

/**
 * `null` fails open, "the caller cannot say which triggers it owns", and is live: neither engine
 * passes ids, so a clause naming an unknown trigger stays evaluable rather than unsatisfiable.
 */
function isOwnedTrigger(triggerId, ownedTriggerIds) {
  return ownedTriggerIds === null || ownedTriggerIds.has(triggerId);
}

/** The enabled clauses and whether each matched. */
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

/** Under `match`, deferring to the runtime only when a live condition roll remains. */
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

/** In authored complication order. */
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
      // So a player output can name which occurrence fired (issue 1286).
      position: entry.position,
      bucket: entry.bucket,
      buckets: [entry.bucket],
      matchedConditions: decision.matched,
      needsDice: decision.needsDice,
    });
  }
  return firings;
}

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
  // Stage order: the player's for crafting, the run's captured one for salvage, the authored
  // one for gathering.
  for (const entry of classified) {
    plan.firings.push(...entryFirings(entry, ctx));
  }
  return plan;
}

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

/** Resolved tense: the fired complications a player may see. */
export function publicComplications(fired) {
  return list(fired)
    .filter((entry) => visibilityOf(entry) === 'visible')
    .map((entry) => {
      const projected = projectForPlayer(entry.complication ?? entry);
      return {
        resultId: entry?.resultId ?? null,
        componentId: entry?.componentId ?? null,
        complicationId: entry?.complicationId ?? projected.id,
        // Null, not absent, for an older firing, so a renderer tests one thing.
        position: Number.isFinite(entry?.position) ? entry.position : null,
        buckets: [...list(entry?.buckets)],
        name: projected.name,
        description: projected.description,
        severity: projected.severity,
      };
    });
}

/** Any clause that could ever match, so "N complications could fire" is true. */
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

/** Forecast tense: the `visible` complications a component could fire, with no roll. */
export function forecastComplications(component, { activity, checkTriggerIds }) {
  const ownedTriggerIds = idSet(checkTriggerIds);
  return list(component?.complications)
    .filter((complication) => complication?.visibility === 'visible')
    .filter((complication) => appliesToActivity(complication, activity))
    .filter((complication) => canEverFire(complication, ownedTriggerIds))
    .map((complication) => projectForPlayer(complication));
}
