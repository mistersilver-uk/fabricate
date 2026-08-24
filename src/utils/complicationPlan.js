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
 *                  is not a narrative outcome. A stage carrying no resolvable result id lands
 *                  here too, for the same reason and stated at {@link bucketFor}: it is the
 *                  bucket for a stage this classifier cannot place, and placing one in
 *                  `unreached` instead would accuse the player of missing a stage the award
 *                  loop may well have granted.
 *
 * `halted` and `unreached` stay distinct even though `when.stageMissed` unions them, so a
 * later issue can offer "only the stage you nearly reached" without reopening this model, and
 * so the chat card can say which it was.
 *
 * ## Once per RESULT ENTRY, never once per component
 *
 * A component may legitimately appear several times in one ordered list, and each occurrence is
 * its OWN award. Repetition is how a progressive result set asks for more of a result — an
 * entry carries no quantity, so listing the iron ingot five times IS the request for five
 * ingots — and it is a request a player can make by reordering and a GM can mandate by
 * authoring. So each occurrence is evaluated on its own bucket and fires on its own: a `1d6`
 * shrapnel complication on a component listed five times rolls five times, once per entry that
 * matched, because five awards went wrong five times.
 *
 * The unit of evaluation and the unit of firing are therefore the SAME unit, the result entry,
 * and each firing names the entry that produced it in `resultId`, states WHERE that entry sits
 * in the ordered list in `position`, and reports that entry's own
 * `bucket`. Nothing here consults a component's other occurrences: a `stageMissed` complication
 * on an entry the loop awarded does not fire, even when a later entry for the same component
 * was missed.
 *
 * The only dedupe left is WITHIN one entry, on `complicationId`, so a component that authors
 * the same complication id twice still fires it once for that entry. There is no
 * `(componentId, complicationId)` key any more, and reintroducing one would collapse exactly
 * the awards this model keeps apart.
 *
 * A `skipped` entry never fires. It is not an outcome — it is a stage the award loop refused —
 * so a firing attributed to one would report a consequence for an award that never happened.
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
 * or a strip that lists several of them orders them canonically rather than restating the
 * list; a single firing is in exactly one of them, and never in `skipped`.
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
 * @param {number} index its 0-based index in the ORDERED stage list
 * @returns {{resultId: string|null, componentId: string|null, component: object|null,
 *   complications: Array<object>, position: number}}
 */
function readStage(stage, index) {
  const component = stage?.component ?? null;
  return {
    resultId: idOf(stage?.resultId ?? stage?.result ?? null),
    componentId: idOf(stage?.componentId ?? component ?? null),
    component,
    complications: list(stage?.complications ?? component?.complications),
    // WHERE IN THE RENDERED LIST THIS ENTRY SITS, 1-based, counting EVERY stage (issue
    // 1286). The caller's `stages` is already the order the roll spends — the player's
    // reordered list for crafting, the order captured onto the run at start for salvage,
    // the authored order for gathering — so this index IS the player's own ordering, and
    // is the same number the salvage panel's per-stage rows are numbered by
    // (`FABRICATE.App.Complications.ResultEyebrow`).
    //
    // Counting every stage rather than only the complication-bearing ones is the whole
    // point: a stage authoring nothing leaves a GAP in the numbering, and the gap is what
    // makes the number findable in the list the player is looking at. A dense 1..N over
    // the fired rows would name rows that screen does not have.
    position: index + 1,
  };
}

/**
 * The bucket one stage lands in. Order is load-bearing twice: `skipped` is tested FIRST so an
 * invalid cost after the halt is never read as `unreached`, and `partial` is tested before
 * `full` because the tail award is a member of `awarded`.
 *
 * ## A stage with no resolvable result id is `skipped`, deliberately
 *
 * The partition must be total, so an id-less stage has to land somewhere, and `skipped` is the
 * one bucket that contributes to NOTHING. It is emphatically not `unreached`: the award loop
 * pushes a result into `awarded` whatever its id, and only {@link idSet} drops the id-less
 * ones, so an id-less stage that WAS awarded would classify as `unreached` and fire a
 * `stageMissed` complication on a component the player is holding. That is the worst reading
 * available, and it is the one an "it demonstrably did not award something it could not name"
 * argument produces — the loop can and does award such a result; it is this classifier that
 * cannot recognise it afterwards.
 *
 * `skipped` is the honest answer to a stage this function cannot classify, and it is already
 * the bucket a stage the GM misconfigured lands in. `_normalizeSalvageResult` mints an id for
 * every salvage result, so nothing reaches this today — but `resolution-modes/spec.md`
 * contemplates an id-less progressive result, and a complication must fail toward silence
 * rather than toward accusing the player of a miss.
 *
 * @param {string|null} resultId
 * @param {{skipped: Set<string>, awarded: Set<string>, partialId: string|null,
 *   haltedId: string|null}} award
 * @returns {'full'|'partial'|'halted'|'unreached'|'skipped'}
 */
function bucketFor(resultId, award) {
  if (!resultId) return 'skipped';
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
 *   complications: Array<object>, bucket: string, position: number}>}
 */
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
 * The facts the three stage-outcome clauses read for ONE result entry, from that entry's own
 * bucket and nothing else.
 *
 * This is where the per-entry rule actually lives. Deriving these over a component's other
 * occurrences is what let a `stageMissed` complication fire against an entry the loop
 * awarded, and then needed a separate mechanism to decide which entry to blame it on.
 *
 * @param {string} bucket the entry's bucket
 * @returns {{stageAwarded: boolean, stagePartial: boolean, stageMissed: boolean}}
 */
function stageFacts(bucket) {
  const facts = {};
  for (const [condition, buckets] of Object.entries(BUCKETS_BY_STAGE_CONDITION)) {
    facts[condition] = buckets.includes(bucket);
  }
  return facts;
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
 * @param {object} complication
 * @param {string} activity
 * @returns {boolean} whether the GM enabled this complication for the activity being resolved.
 */
function appliesToActivity(complication, activity) {
  return complication?.activities?.[activity] === true;
}

/**
 * Every firing ONE result entry contributes, in authored complication order.
 *
 * The entry is the unit. Its own bucket decides its stage clauses, its own id is what each
 * firing names, and its `buckets` list is that one bucket — a list only because the persisted
 * shape and the two projections have always carried a list, never because an entry can be in
 * two buckets.
 *
 * Two guards refuse an entry outright, and both are total rather than per complication:
 * an entry naming no component has nothing to read complications off, and a `skipped` entry is
 * a stage the award loop refused rather than an outcome, so a firing attributed to it would
 * report a consequence for an award that never happened. That second guard also covers the
 * id-less entry, which {@link bucketFor} classifies as `skipped` for the same reason.
 *
 * The one dedupe is `seen`, scoped to THIS entry and keyed on `complicationId` alone: a
 * component authoring the same complication id twice fires it once here. It is emphatically
 * not a `(componentId, complicationId)` key — that key spans entries, and spanning entries is
 * what the ruling this module implements removed.
 *
 * @param {{resultId: string|null, componentId: string|null, component: object|null,
 *   complications: Array<object>, bucket: string, position: number}} entry one classified
 *   result entry
 * @param {object} ctx `{ activity, resolutionId, matchedTriggerIds, ownedTriggerIds }`
 * @returns {Array<object>}
 */
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
      // The entry's place in the ordered list, carried so a player-facing output can name
      // WHICH occurrence fired without re-deriving an order it does not hold (issue 1286).
      // `resultId` already identifies the occurrence, but it is an opaque id: it keeps two
      // firings apart in a dedupe key and tells a player nothing.
      position: entry.position,
      bucket: entry.bucket,
      buckets: [entry.bucket],
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
  // Fire order IS stage order: the player's reordered list for crafting, the order captured
  // onto the run at start for salvage, the authored order for gathering. A per-component
  // grouping pass used to sit here and it is gone — nothing left reads a component's other
  // occurrences, so grouping by component could only have reintroduced the collapse.
  for (const entry of classified) {
    plan.firings.push(...entryFirings(entry, ctx));
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
 * `buckets`) are a SUBSET of what comes back; the extra four are the authored strings the
 * chat card renders plus the stage POSITION it names them by, all of them already
 * player-visible by the `visible` filter above. A caller persisting this may narrow it, and
 * must not widen it.
 *
 * `position` is a player-safe fact by construction: it is where this firing's entry sits in
 * the list that player is looking at, and discloses nothing about the trigger, the effect
 * roll or the macro. It is what lets a card distinguish two legitimate firings of ONE
 * complication on ONE twice-staged component, which `resultId` — an opaque id — cannot do on
 * screen.
 *
 * @param {Array<object>} fired the runtime's fired list (or a plan's firings)
 * @returns {Array<{resultId: string|null, componentId: string|null, complicationId: string|null,
 *   position: number|null, buckets: Array<string>, name: string, description: string,
 *   severity: string}>}
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
        // Null rather than absent for a firing minted before this key existed (a run record
        // read back, a hand-built fixture), so a renderer tests one thing to decide whether
        // it can name a position at all.
        position: Number.isFinite(entry?.position) ? entry.position : null,
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
