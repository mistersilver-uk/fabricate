/**
 * The EFFECTFUL half of progressive component complications (issue 1286): settle the pending
 * condition rolls a plan could not, roll the player-visible effect rolls, and build the
 * addressing-only requests the GM side executes from.
 *
 * The decision itself is pure and lives in {@link ../utils/complicationPlan.js}, together with
 * the two PLAYER-facing projections. That placement is deliberate and not merely a naming
 * choice: `checkRoll.js` carries a sixteen-module static-import closure, and every mounted
 * Svelte suite that loads a real player store must declare its closure verbatim, so a player
 * view-model importing a filter from THIS module would drag all sixteen into each of them. The
 * GM-facing projection ({@link gmComplications}) lives here, where a view-model cannot reach it
 * by accident.
 *
 * ## Never throws, three nested guards
 *
 * Complications are strictly DOWNSTREAM of a committed award and must never influence it:
 *
 *  1. **Per complication.** One bad complication must not cost the resolution its other
 *     twenty-four — the argument `BulkSalvageService._runOne` already makes for one bad row.
 *  2. **Per effect.** A failed effect roll still lets the macro request be made, because the
 *     two are independent consequences of the same authored complication.
 *  3. **Whole call.** This function resolves rather than rejects, so an engine site that
 *     forgot its own guard still cannot lose a craft to a complication. Engine sites carry one
 *     anyway.
 *
 * ## What this module does NOT do
 *
 * It does not run macros and it does not create chat messages for a GM-only complication.
 * Every complication macro executes on a GM client, over the complication socket, from a
 * payload that carries ADDRESSING ONLY — never a macro uuid, never chat content, never a
 * speaker — so that a forged message can do no more than fire a complication the GM themselves
 * authored. The `type === 'script'` gate and the `fromUuid` resolve therefore live where the
 * macro RUNS, on the GM client, not here: compendium ownership is GM-configurable per role, so
 * an acting player's `fromUuid` can miss a macro the GM resolves fine.
 *
 * The requests come back on the return value rather than being emitted from here. Bulk salvage
 * batches every row's requests into ONE socket message — per-row emits would collide head-on
 * with the GM-side rate limiter, which is sized for human gathering speed — so the caller owns
 * the emit and this function owns the decision.
 *
 * @module src/systems/complicationRuntime
 */

import { compareNumbersByOperatorId } from './characterPrerequisites.js';
import { evaluateCheckRoll, evaluateSideRoll, resolveCheckFormulaDisplay } from './checkRoll.js';

/** The visibility token whose effect roll the ACTING client rolls and posts publicly. */
const VISIBLE = 'visible';

/** @param {unknown} value @returns {Array<any>} */
function list(value) {
  return Array.isArray(value) ? value : [];
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Reduce a `rollCondition.value` comparand to a NUMBER, or `null` when it does not reduce.
 *
 * The comparand stays a string in the persisted record because it may itself carry roll data,
 * so `@abilities.str.mod` has to resolve against the actor. It resolves through
 * {@link resolveCheckFormulaDisplay}, which SUBSTITUTES roll data without rolling — never
 * through `evaluateCheckRoll`, which would re-roll a `1d6` comparand on every evaluation and
 * make the same authored gate mean something different each time it was asked.
 *
 * A comparand that survives substitution as a dice expression (`1d6`) is therefore not a
 * number, and this returns `null`: the gate FAILS CLOSED rather than guessing at an average.
 *
 * @param {unknown} value the authored comparand
 * @param {object|null} actor
 * @returns {number|null}
 */
function resolveComparand(value, actor) {
  const authored = text(value).trim();
  if (authored === '') return null;
  const direct = Number(authored);
  if (Number.isFinite(direct)) return direct;
  const substituted = resolveCheckFormulaDisplay(authored, actor);
  if (!substituted?.resolved) return null;
  const resolved = Number(substituted.display);
  return Number.isFinite(resolved) ? resolved : null;
}

/**
 * Roll a complication's CONDITION and answer whether it matched.
 *
 * Non-interactive, no modifier context, posting nothing: this is a gate, not a beat, and a
 * player must not see a die roll for a complication that then does not fire.
 *
 * It FAILS CLOSED on every uncertainty — no dice engine, a non-finite total, an unparseable
 * comparand, or an operator the numeric table does not know (the three valueless prerequisite
 * operators have no reading against a roll total and `compareNumbersByOperatorId` returns
 * `false` for them).
 *
 * @param {object} rollCondition the authored `{enabled, expr, cmp, value}`
 * @param {object|null} actor
 * @returns {Promise<boolean>}
 */
async function conditionMatched(rollCondition, actor) {
  const expr = text(rollCondition?.expr).trim();
  if (expr === '') return false;
  const rolled = await evaluateCheckRoll(expr, actor, {});
  if (!rolled?.engine) return false;
  const total = Number(rolled.total);
  if (!Number.isFinite(total)) return false;
  const comparand = resolveComparand(rollCondition?.value, actor);
  if (comparand === null) return false;
  return compareNumbersByOperatorId(total, rollCondition?.cmp, comparand) === true;
}

/**
 * Roll a `visible` complication's EFFECT roll on the acting client, where the player's own
 * Dice So Nice appearance applies.
 *
 * A `gmOnly` complication's effect roll is NOT rolled here: it is rolled and posted by the
 * elected GM, from the GM's own re-read of the authored record, so the player sees only
 * "<GM> rolled privately".
 *
 * Guarded in its own `try`/`catch` — guard 2 of 3 — so a malformed expression still leaves the
 * macro request intact.
 *
 * @param {object} firing
 * @param {object|null} actor
 * @param {{speaker?: object}} context
 * @returns {Promise<{requested: boolean, total: number|null, formula: string|null,
 *   posted: boolean, error?: string}>}
 */
async function runEffectRoll(firing, actor, context) {
  const effectRoll = firing?.complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  const rolledHere = firing?.complication?.visibility === VISIBLE;
  if (effectRoll?.enabled !== true || expr === '' || !rolledHere) {
    return {
      requested: effectRoll?.enabled === true && expr !== '',
      total: null,
      formula: expr || null,
      posted: false,
    };
  }
  try {
    const rolled = await evaluateSideRoll(expr, actor, {
      // EXPLICIT, never the client's `core.rollMode` selector: a GM acting on a player's
      // behalf with Private GM Roll selected would otherwise hide a visible complication's roll.
      rollMode: 'publicroll',
      flavor: text(effectRoll?.label) || text(firing?.complication?.name),
      speaker: context?.speaker,
    });
    return {
      requested: true,
      total: rolled.engine ? rolled.total : null,
      formula: rolled.formula ?? expr,
      posted: rolled.posted,
    };
  } catch (error) {
    console.error('Fabricate | Complication effect roll failed', error);
    return {
      requested: true,
      total: null,
      formula: expr,
      posted: false,
      error: text(error?.message),
    };
  }
}

/**
 * The ADDRESSING-ONLY payload for one fired complication.
 *
 * It names WHICH complication on WHICH component fired, and the outcome facts the GM card
 * echoes. It carries no `macroUuid`, no `visibility`, no `name`, no `description`, no
 * `severity`, no chat content and no speaker: the elected GM re-reads all of those from its own
 * copy of the `craftingSystems` world setting, so a forged payload can do no more than fire a
 * complication that GM already authored. The sender is the server-attested second callback
 * argument of the socket handler and is never a payload field.
 *
 * `bucket`, `resultId` and `effectRollTotal` are client-supplied outcome facts the GM cannot
 * verify, and the GM card presents them as the acting client's claim.
 *
 * The `action` key is stamped by the socket writer, which owns that constant.
 *
 * @param {object} firing
 * @param {object} effect
 * @param {{craftingSystemId?: string, actorUuid?: string}} context
 * @param {object|null} actor
 * @returns {object}
 */
function gmRequestFor(firing, effect, context, actor) {
  return {
    craftingSystemId: context?.craftingSystemId ?? null,
    componentId: firing.componentId,
    complicationId: firing.complicationId,
    resultId: firing.resultId,
    activity: firing.activity,
    bucket: firing.bucket,
    actorUuid: context?.actorUuid ?? actor?.uuid ?? null,
    resolutionId: firing.resolutionId ?? null,
    effectRollTotal: effect?.total ?? null,
  };
}

/**
 * Whether one fired complication needs anything of the GM client at all.
 *
 * Two independent reasons: a `gmOnly` complication's card (and its effect roll) can only be
 * authored by a GM — `#canCreate` forbids a player authoring as a GM, and a whispered message
 * a player authored renders in that player's OWN sidebar — and EVERY complication macro runs on
 * a GM client so its authority does not depend on whether the activity was time-gated.
 *
 * @param {object} firing
 * @returns {boolean}
 */
function needsGmClient(firing) {
  const complication = firing?.complication;
  return complication?.visibility !== VISIBLE || Boolean(text(complication?.macroUuid).trim());
}

/**
 * FIRE the complications a plan decided on: settle each pending condition roll, roll the
 * player-visible effect rolls, and return both the fired list and the GM requests.
 *
 * Resolves, never rejects.
 *
 * @param {object} options
 * @param {{activity?: string, resolutionId?: string|null, firings?: Array<object>}} options.plan
 *   {@link ../utils/complicationPlan.js planComplications}'s return.
 * @param {object|null} [options.actor] the acting actor, whose roll data resolves both the
 *   condition roll and its comparand.
 * @param {{craftingSystemId?: string, actorUuid?: string, speaker?: object}} [options.context]
 *   the addressing the GM side resolves the speaker and acting actor from. Explicit
 *   collaborators, not a grab bag: nothing else is read from it.
 * @returns {Promise<{activity: string|null, resolutionId: string|null, fired: Array<object>,
 *   gmRequests: Array<object>}>} `fired` is in fire order, at most one entry per
 *   `(componentId, complicationId)`.
 */
export async function fireComplications({ plan, actor = null, context = {} } = {}) {
  const result = {
    activity: plan?.activity ?? null,
    resolutionId: plan?.resolutionId ?? null,
    fired: [],
    gmRequests: [],
  };
  try {
    for (const firing of list(plan?.firings)) {
      // A firing that is not a firing is DROPPED rather than fired: everything downstream
      // reads an audience and a macro uuid off it, and the safe reading of "no record" is
      // "nothing to do", not "a GM-only complication with no name".
      if (!firing || typeof firing !== 'object') continue;
      // Guard 1 of 3: one bad complication must not cost the resolution its others.
      try {
        if (
          firing.needsDice === true &&
          !(await conditionMatched(firing.complication?.rollCondition, actor))
        )
          continue;
        const effect = await runEffectRoll(firing, actor, context);
        const fired = {
          ...firing,
          needsDice: false,
          matchedConditions: firing.needsDice
            ? [...list(firing.matchedConditions), 'rollCondition']
            : [...list(firing.matchedConditions)],
          effectRoll: effect,
        };
        result.fired.push(fired);
        if (needsGmClient(fired))
          result.gmRequests.push(gmRequestFor(fired, effect, context, actor));
      } catch (error) {
        console.error('Fabricate | Complication failed to fire', error);
      }
    }
  } catch (error) {
    // Guard 3 of 3. Reached only by something outside the per-complication guard; the
    // partially-built result is still returned, because the award it follows is committed.
    console.error('Fabricate | Complication firing aborted', error);
  }
  return result;
}

/**
 * The GM-facing projection of a resolution's fired complications: EVERYTHING the GM authored,
 * for the GM-only card.
 *
 * The counterpart to `publicComplications`, and it deliberately lives in this module rather
 * than beside it. Two audience-named exports on opposite sides of the runtime boundary make
 * the wrong call unspellable: a `visibleComplications(fired, {isGM})` would be called with
 * `isGM: true` at the salvage run-record write site whenever a GM was the acting user — which
 * is correct about the user and catastrophic about the record, since that record is an actor
 * flag the owning player can read.
 *
 * The macro UUID is NOT projected: the GM side re-reads it from its own copy of the world
 * setting, and a projection carrying it would be one step from a payload carrying it.
 *
 * @param {Array<object>} fired {@link fireComplications}'s `fired` list
 * @returns {Array<{resultId: string|null, componentId: string|null, componentName: string,
 *   complicationId: string|null, name: string, description: string, severity: string,
 *   visibility: string, bucket: string|null, buckets: Array<string>,
 *   matchedConditions: Array<string>, effectRoll: object|null}>}
 */
export function gmComplications(fired) {
  return list(fired).map((entry) => ({
    resultId: entry?.resultId ?? null,
    componentId: entry?.componentId ?? null,
    componentName: text(entry?.componentName),
    complicationId: entry?.complicationId ?? null,
    name: text(entry?.complication?.name),
    description: text(entry?.complication?.description),
    severity: text(entry?.complication?.severity),
    visibility: text(entry?.complication?.visibility),
    bucket: entry?.bucket ?? null,
    buckets: [...list(entry?.buckets)],
    matchedConditions: [...list(entry?.matchedConditions)],
    effectRoll: entry?.effectRoll ?? null,
  }));
}
