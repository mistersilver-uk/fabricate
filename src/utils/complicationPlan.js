/**
 * The PURE half of progressive component complications (issue 1286): which complications a
 * committed progressive award should fire, and the two player-facing projections of them.
 *
 * ## Why this is its own leaf, and why the player projections live HERE
 *
 * The decision is pure — no dice, no macros, no I/O — and the effects are isolated in
 * {@link ../systems/complicationRuntime.js}. That split is not cosmetic. `checkRoll.js`
 * carries a sixteen-module static-import closure, and the mounted Svelte suites that load a
 * real player store must declare their whole closure verbatim; the moment a player
 * view-model imports a filter from the runtime module, every one of those suites gains all
 * sixteen. So {@link publicComplications} and {@link forecastComplications} — the only two
 * projections a player surface may ever read — live in this import-free leaf, on the
 * `progressiveStageThresholds.js` precedent, and the PLACEMENT is what makes the wrong call
 * unspellable from a view-model rather than merely discouraged by a name.
 *
 * The one import is `componentComplications.js`'s frozen vocabularies, itself an import-free
 * leaf. Restating them here would be the drift that split exists to prevent, so the
 * allowlist assertion in `tests/component-complications-plan.test.js` pins "imports nothing
 * BUT that module" rather than "imports nothing".
 *
 * ## Five buckets, because the award loop stops rather than skipping
 *
 * All three award modes `break` at the first unaffordable stage, so "unawarded" merges two
 * genuinely different facts — the one stage the player nearly reached, and every stage never
 * evaluated at all. Each stage in the ordered list lands in exactly ONE bucket:
 *
 *  - `full`      — awarded, and not the partial tail.
 *  - `partial`   — the `partial`-mode tail award. It IS A MEMBER of `awarded`, so
 *                  `full = awarded \ {partialResult}`; a classifier reading "full = every
 *                  member of awarded" makes a partial-only component match BOTH
 *                  `stageAwarded` and `stagePartial`.
 *  - `halted`    — the one stage that stopped the loop and was not awarded. A partial tail
 *                  and a halt are mutually exclusive.
 *  - `unreached` — every stage the loop never evaluated, which is everything after the stop
 *                  point (the halt, or the partial tail the loop breaks on).
 *  - `skipped`   — an invalid cost, derived by the award loop over the WHOLE ordered list, so
 *                  a misconfigured stage sitting after the halt is `skipped` and never
 *                  mistaken for `unreached`. It contributes to NOTHING: a GM misconfiguration
 *                  is not a narrative outcome.
 *
 * `halted` and `unreached` stay distinct even though `when.stageMissed` unions them, so a
 * later issue can offer "only the stage you nearly reached" without reopening this model, and
 * so the chat card can say which it was.
 *
 * ## At most once per component per resolution
 *
 * A component may legitimately appear several times in one ordered list, so `full`, `partial`
 * and `stageMissed` can all be true at once for it — that is the honest reading. But a `1d6`
 * shrapnel complication on a component listed five times must not roll five times, so firing
 * is deduped on `(componentId, complicationId)` and each firing NAMES the stage occurrence
 * that produced it. Without that name a player reading "you missed the iron ingot" against a
 * card that also granted an iron ingot cannot reconcile the two.
 *
 * ## What this module deliberately cannot do
 *
 * A `rollCondition` needs a live dice roll, which is an effect. A complication whose fate
 * rests on one comes back PENDING (`needsDice: true`) for the runtime to settle; the planner
 * never guesses at it. Likewise `when.checkTrigger` is resolved by the caller — matching a
 * trigger's condition means evaluating it against the roll, which is the runtime's job — and
 * arrives here as two flat id sets.
 *
 * @module src/utils/complicationPlan
 */

import {
  COMPLICATION_ACTIVITIES,
  COMPLICATION_STAGE_CONDITIONS,
} from './componentComplications.js';

/**
 * The five buckets, in the order a projection should present them. Exported so a chat card
 * or a strip orders them the same way this module does rather than restating the list.
 * @type {ReadonlyArray<'full'|'partial'|'halted'|'unreached'|'skipped'>}
 */
export const COMPLICATION_STAGE_BUCKETS = Object.freeze([
  'full',
  'partial',
  'halted',
  'unreached',
  'skipped',
]);

/**
 * The buckets each stage-outcome clause reads. `stageMissed` unions two, which is why the
 * union lives in ONE table rather than in each reader.
 */
const BUCKETS_BY_STAGE_CONDITION = Object.freeze({
  stageAwarded: Object.freeze(['full']),
  stagePartial: Object.freeze(['partial']),
  stageMissed: Object.freeze(['halted', 'unreached']),
});

/** @param {unknown} value @returns {Array<any>} */
function list(value) {
  return Array.isArray(value) ? value : [];
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * @param {unknown} value a result object or a bare result id
 * @returns {string|null}
 */
function idOf(value) {
  if (typeof value === 'string') return value.trim() || null;
  const id = value?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/** @param {unknown} values @returns {Set<string>} */
function idSet(values) {
  const ids = new Set();
  for (const value of list(values)) {
    const id = idOf(value);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * @param {object} stage one ordered stage occurrence
 * @returns {{resultId: string|null, componentId: string|null, component: object|null,
 *   complications: Array<object>}}
 */
function readStage(stage) {
  const component = stage?.component ?? null;
  return {
    resultId: idOf(stage?.resultId ?? stage?.result ?? null),
    componentId: idOf(stage?.componentId ?? component ?? null),
    component,
    complications: list(stage?.complications ?? component?.complications),
  };
}

/**
 * The bucket one stage lands in. Order is load-bearing twice: `skipped` is tested FIRST so an
 * invalid cost after the halt is never read as `unreached`, and `partial` is tested before
 * `full` because the tail award is a member of `awarded`.
 *
 * A stage with no resolvable result id falls through to `unreached`: the partition must be
 * total (every stage lands in exactly one bucket), and the loop demonstrably did not award
 * something it could not name.
 *
 * @param {string|null} resultId
 * @param {{skipped: Set<string>, awarded: Set<string>, partialId: string|null,
 *   haltedId: string|null}} award
 * @returns {'full'|'partial'|'halted'|'unreached'|'skipped'}
 */
function bucketFor(resultId, award) {
  if (!resultId) return 'unreached';
  if (award.skipped.has(resultId)) return 'skipped';
  if (resultId === award.partialId) return 'partial';
  if (award.awarded.has(resultId)) return 'full';
  if (resultId === award.haltedId) return 'halted';
  return 'unreached';
}

/**
 * Classify the ordered stage list against the award loop's own report.
 *
 * @param {Array<object>} stages ordered stage occurrences
 * @param {{awarded?: Array<object>, partialResult?: object|null, haltedResult?: object|null,
 *   skippedResults?: Array<object>}} award the award loop's return, verbatim
 * @returns {Array<{resultId: string|null, componentId: string|null, component: object|null,
 *   complications: Array<object>, bucket: string}>}
 */
function classifyStages(stages, award) {
  const buckets = {
    skipped: idSet(award?.skippedResults),
    awarded: idSet(award?.awarded),
    partialId: idOf(award?.partialResult ?? null),
    haltedId: idOf(award?.haltedResult ?? null),
  };
  return list(stages).map((stage) => {
    const read = readStage(stage);
    return { ...read, bucket: bucketFor(read.resultId, buckets) };
  });
}

/**
 * Group the classified stages by component, preserving FIRE ORDER: a `Map` keyed on first
 * insertion is the ordered stage list's order, which is the player's reordered list and, for
 * salvage, the order captured onto the run at start.
 *
 * @param {Array<object>} classified
 * @returns {Map<string, {componentId: string, component: object|null,
 *   complications: Array<object>, stages: Array<object>}>}
 */
function groupByComponent(classified) {
  const grouped = new Map();
  for (const stage of classified) {
    if (!stage.componentId) continue;
    let entry = grouped.get(stage.componentId);
    if (!entry) {
      entry = {
        componentId: stage.componentId,
        component: stage.component,
        complications: stage.complications,
        stages: [],
      };
      grouped.set(stage.componentId, entry);
    }
    entry.stages.push(stage);
  }
  return grouped;
}

/**
 * The per-component facts the three stage-outcome clauses read, derived over ALL of that
 * component's occurrences.
 *
 * @param {Array<{bucket: string}>} stages
 * @returns {{stageAwarded: boolean, stagePartial: boolean, stageMissed: boolean}}
 */
function stageFacts(stages) {
  const facts = {};
  for (const [condition, buckets] of Object.entries(BUCKETS_BY_STAGE_CONDITION)) {
    facts[condition] = stages.some((stage) => buckets.includes(stage.bucket));
  }
  return facts;
}

/**
 * The distinct buckets a component's stages landed in, in canonical order and WITHOUT
 * `skipped` — a misconfigured stage is not a narrative outcome and must not appear on a card
 * as one.
 *
 * @param {Array<{bucket: string}>} stages
 * @returns {Array<string>}
 */
function distinctBuckets(stages) {
  const held = new Set(stages.map((stage) => stage.bucket));
  return COMPLICATION_STAGE_BUCKETS.filter((bucket) => bucket !== 'skipped' && held.has(bucket));
}

/**
 * @param {string} triggerId
 * @param {Set<string>|null} ownedTriggerIds every trigger id the ACTIVE activity's progressive
 *   check block owns, or `null` when the caller cannot say
 * @returns {boolean} `false` leaves the clause INERT (fail-open), never a validation error:
 *   an id that no longer resolves, or that belongs to another activity's id space, contributes
 *   nothing to `match` rather than blocking it.
 */
function isOwnedTrigger(triggerId, ownedTriggerIds) {
  return ownedTriggerIds === null || ownedTriggerIds.has(triggerId);
}

/**
 * The ENABLED clauses of one complication and whether each matched. A clause the GM did not
 * enable is absent rather than false, because `match: 'all'` quantifies over the enabled ones
 * only.
 *
 * @param {object} complication
 * @param {{facts: object, matchedTriggerIds: Set<string>, ownedTriggerIds: Set<string>|null}} ctx
 * @returns {Array<{name: string, matched: boolean}>}
 */
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
 * Combine the enabled clauses under `match`, deferring to the runtime when — and only when —
 * a live condition roll is what is left to decide.
 *
 * `rollCondition.enabled: false` contributes NOTHING, so it can never make `all`
 * unsatisfiable. Nothing enabled never fires.
 *
 * @param {object} complication
 * @param {Array<{name: string, matched: boolean}>} clauses
 * @returns {{matched: Array<string>, needsDice: boolean}|null} `null` when it does not fire
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

/**
 * The stage occurrence a firing NAMES: the first, in fire order, whose bucket satisfied one of
 * the matched stage clauses. A firing decided only by a trigger or a condition roll names the
 * component's first non-`skipped` occurrence instead, so the card still points at a row.
 *
 * @param {Array<{resultId: string|null, bucket: string}>} stages
 * @param {Array<string>} matched the matched clause names
 * @returns {{resultId: string|null, bucket: string|null}}
 */
function namedOccurrence(stages, matched) {
  const wanted = new Set(matched.flatMap((name) => BUCKETS_BY_STAGE_CONDITION[name] ?? []));
  const hit =
    stages.find((stage) => wanted.has(stage.bucket)) ??
    stages.find((stage) => stage.bucket !== 'skipped') ??
    stages[0];
  return { resultId: hit?.resultId ?? null, bucket: hit?.bucket ?? null };
}

/**
 * @param {object} complication
 * @param {string} activity
 * @returns {boolean} whether the GM enabled this complication for the activity being resolved.
 */
function appliesToActivity(complication, activity) {
  return complication?.activities?.[activity] === true;
}

/**
 * Every firing one component contributes, in authored complication order, at most one per
 * `(componentId, complicationId)`.
 *
 * @param {object} entry the grouped component
 * @param {object} ctx `{ activity, resolutionId, matchedTriggerIds, ownedTriggerIds }`
 * @returns {Array<object>}
 */
function componentFirings(entry, ctx) {
  const facts = stageFacts(entry.stages);
  const buckets = distinctBuckets(entry.stages);
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
    const occurrence = namedOccurrence(entry.stages, decision.matched);
    firings.push({
      activity: ctx.activity,
      resolutionId: ctx.resolutionId,
      componentId: entry.componentId,
      componentName: text(entry.component?.name),
      complicationId,
      complication,
      resultId: occurrence.resultId,
      bucket: occurrence.bucket,
      buckets,
      matchedConditions: decision.matched,
      needsDice: decision.needsDice,
    });
  }
  return firings;
}

/**
 * PLAN the complications a committed progressive award should fire.
 *
 * Pure: no dice, no macros, no I/O, no Foundry globals. A firing whose fate still rests on a
 * `rollCondition` comes back with `needsDice: true` for
 * {@link ../systems/complicationRuntime.js fireComplications} to settle.
 *
 * @param {object} options
 * @param {'crafting'|'salvage'|'gathering'} options.activity the activity being resolved.
 * @param {Array<{resultId?: string|object, componentId?: string, component?: object,
 *   complications?: Array<object>}>} options.stages the ORDERED stage occurrences the award
 *   loop ran over, one entry per occurrence. `resultId` is the id class `meta.awardedResultIds`
 *   uses; a component listed five times supplies five entries with five ids.
 * @param {{awarded?: Array<object>, remaining?: number, partialResult?: object|null,
 *   haltedResult?: object|null, skippedResults?: Array<object>, invalidResultId?: string}}
 *   options.award `resolveProgressiveAward`'s return, VERBATIM. Re-deriving any of it in a
 *   caller is what makes the salvage and crafting classifiers differ.
 * @param {Array<string>} [options.matchedTriggerIds] the ids of triggers on the ACTIVE
 *   activity's progressive check block that matched this roll. Resolved by the caller because
 *   matching a trigger means evaluating its condition against the roll, which is an effect.
 * @param {Array<string>|null} [options.checkTriggerIds] every trigger id that check block owns.
 *   `null` (the default) means the caller cannot say, and no clause is made inert on that
 *   ground.
 * @param {string|null} [options.resolutionId] the per-resolution id minted once on the acting
 *   client, carried through so the GM side can dedupe delivery.
 * @returns {{activity: string, resolutionId: string|null, aborted: boolean,
 *   stages: Array<{resultId: string|null, componentId: string|null, bucket: string}>,
 *   firings: Array<object>}} `aborted` is true only for a resolution the award loop failed on
 *   an invalid cost (`invalidCost: 'fail'`), which fires NOTHING — a GM misconfiguration is not
 *   a narrative outcome.
 */
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
  for (const entry of groupByComponent(classified).values()) {
    plan.firings.push(...componentFirings(entry, ctx));
  }
  return plan;
}

/**
 * The player-safe projection of ONE complication record. Never emits `when`, `rollCondition`,
 * `effectRoll` or `macroUuid`: a player must not be shown the trigger, and the macro is not
 * theirs to know about.
 *
 * @param {object} complication
 * @returns {{id: string|null, name: string, description: string, severity: string,
 *   visibility: string}}
 */
function projectForPlayer(complication) {
  return {
    id: idOf(complication),
    name: text(complication?.name),
    description: text(complication?.description),
    severity: text(complication?.severity),
    visibility: text(complication?.visibility),
  };
}

/**
 * @param {object} entry a planned or fired complication
 * @returns {string} the authored audience token.
 */
function visibilityOf(entry) {
  return text(entry?.complication?.visibility ?? entry?.visibility);
}

/**
 * The RESOLVED-tense player projection: filter a resolution's fired complications to what a
 * player may see.
 *
 * This is the ONLY projection that may be persisted or reach a player view-model. It is keyed
 * on the AUDIENCE and never on the acting user's role — a salvage run record is an actor flag
 * the owning player can read, so a `{ isGM }` parameter would write `gmOnly` complications
 * into a player-readable document every time a GM was the acting user, and defeat the socket
 * entirely.
 *
 * The four keys the salvage run record stores (`resultId`, `componentId`, `complicationId`,
 * `buckets`) are a SUBSET of what comes back; the extra three are the authored strings the
 * chat card renders, all of them already player-visible by the `visible` filter above. A
 * caller persisting this may narrow it, and must not widen it.
 *
 * @param {Array<object>} fired the runtime's fired list (or a plan's firings)
 * @returns {Array<{resultId: string|null, componentId: string|null, complicationId: string|null,
 *   buckets: Array<string>, name: string, description: string, severity: string}>}
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
        buckets: [...list(entry?.buckets)],
        name: projected.name,
        description: projected.description,
        severity: projected.severity,
      };
    });
}

/**
 * Whether a complication has any clause that could EVER match, so the bulk block's
 * "N complications could fire" is not a lie.
 *
 * @param {object} complication
 * @param {Set<string>|null} ownedTriggerIds
 * @returns {boolean}
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
 * The FORECAST-tense player projection: the `visible` complications a component COULD fire in
 * an activity, with no roll and no run.
 *
 * Two of the three player surfaces are forecasts rather than resolutions — the bulk block's
 * whole title is "N complications could fire" and the per-stage strip renders "This can go
 * wrong" before any roll — so a filter over a fired list cannot serve them.
 *
 * It is a PLAYER projection and is never the source for a GM authoring or read-only surface:
 * `visibility` defaults to `gmOnly`, so feeding the Component Studio's salvage strip from it
 * would show a GM three authored complications above a strip listing none. The GM strips read
 * the unredacted authored list.
 *
 * @param {object} component the normalized component record
 * @param {object} [options]
 * @param {'crafting'|'salvage'|'gathering'} options.activity the activity being projected
 * @param {Array<string>|null} [options.checkTriggerIds] the trigger ids that activity's
 *   progressive check block owns; supplying them excludes a complication whose ONLY enabled
 *   clause names a trigger the activity does not own
 * @returns {Array<{id: string|null, name: string, description: string, severity: string,
 *   visibility: string}>}
 */
export function forecastComplications(component, { activity, checkTriggerIds = null } = {}) {
  const ownedTriggerIds = checkTriggerIds === null ? null : idSet(checkTriggerIds);
  return list(component?.complications)
    .filter((complication) => complication?.visibility === 'visible')
    .filter((complication) => appliesToActivity(complication, activity))
    .filter((complication) => canEverFire(complication, ownedTriggerIds))
    .map((complication) => projectForPlayer(complication));
}
