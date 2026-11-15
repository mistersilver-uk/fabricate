/**
 * The effectful half of progressive component complications (issue 1286): settle the condition
 * rolls a plan could not, roll the player-visible effect rolls, and build the addressing-only
 * requests the GM side executes from. The pure decision and the player-facing projections live
 * in `../utils/complicationPlan.js`, so a player view-model never drags in this module's
 * `checkRoll.js` import closure; the GM-facing projection lives here, out of a view-model's reach.
 * Never throws, through three nested guards (per complication, per effect, whole call), because a
 * complication is strictly downstream of a committed award. It runs no macro and creates no chat
 * message: the `script` gate, `fromUuid` and `ChatMessage.create` belong to the elected GM's
 * edge, and the caller owns the emit so bulk salvage can batch per addressed pair. Both audiences'
 * effect rollers live here so each looks up only its own `EFFECT_ROLL_MODE` token.
 */

import { compareNumbersByOperatorId } from './characterPrerequisites.js';
import { evaluateCheckRoll, evaluateSideRoll, resolveCheckFormulaDisplay } from './checkRoll.js';

/** The visibility token whose effect roll the ACTING client rolls and posts publicly. */
const VISIBLE = 'visible';

/**
 * The explicit chat token each audience's effect roll posts under, never the client-scoped
 * `core.rollMode`/`core.messageMode` fallback on either side, which would let the writing GM's
 * own selector hide a `visible` roll or publish a `gmOnly` one.
 */
const EFFECT_ROLL_MODE = Object.freeze({ visible: 'publicroll', gmOnly: 'gmroll' });

/** A presentation mirror of `complicationPlan.js`'s private `BUCKETS_BY_STAGE_CONDITION`, held
 *  to it by the oracle test in `tests/component-complications-fire.test.js`. */
const STAGE_CLAUSE_BUCKETS = Object.freeze({
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

/**
 * Reduce a `rollCondition.value` comparand to a number, or `null`. Roll data is substituted,
 * never rolled, so one authored gate means the same thing on every evaluation; a comparand that
 * is still dice after substitution is `null`, and the gate fails closed.
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

/** Roll a condition non-interactively, posting nothing, and fail closed on any uncertainty: no
 *  engine, a non-finite total, an unparseable comparand, or a valueless operator. */
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
 * The effect result when nothing was rolled here. `requested` answers whether the GM authored a
 * roll (it has no production reader but stays distinct); `attempted` answers whether this client
 * rolled it. A `visible` complication with a macro reaches the GM side, which declines the roll by
 * audience, so the card keys on `attempted` or it would report a failed roll.
 */
function unrolledEffect(effectRoll, expr) {
  return {
    requested: effectRoll?.enabled === true && expr !== '',
    attempted: false,
    total: null,
    formula: expr || null,
    posted: false,
  };
}

/** Roll one authored effect under an explicit audience token, never throwing; both audiences
 *  share it, and every return carries `attempted: true`. */
async function rollEffect(complication, actor, { rollMode, speaker }) {
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  try {
    const rolled = await evaluateSideRoll(expr, actor, {
      rollMode,
      flavor: text(effectRoll?.label) || text(complication?.name),
      speaker,
    });
    return {
      requested: true,
      attempted: true,
      total: rolled.engine ? rolled.total : null,
      formula: rolled.formula ?? expr,
      posted: rolled.posted,
    };
  } catch (error) {
    console.error('Fabricate | Complication effect roll failed', error);
    return {
      requested: true,
      attempted: true,
      total: null,
      formula: expr,
      posted: false,
      error: text(error?.message),
    };
  }
}

/** Roll a `visible` effect on the acting client (guard 2 of 3), where the player's own Dice So
 *  Nice applies; a `gmOnly` one is left to `rollGmComplicationEffect`. */
async function runEffectRoll(firing, actor, context) {
  const complication = firing?.complication;
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  if (effectRoll?.enabled !== true || expr === '' || complication?.visibility !== VISIBLE)
    return unrolledEffect(effectRoll, expr);
  return rollEffect(complication, actor, {
    rollMode: EFFECT_ROLL_MODE.visible,
    speaker: context?.speaker,
  });
}

/**
 * Roll a `gmOnly` effect on the elected GM's client under `gmroll`, never throwing, and refuse a
 * `visible` one. The disclosure is intended: `ChatMessage#visible` passes any message with rolls
 * before testing whispers, so the player, neither author nor recipient, reads "<GM> rolled
 * privately", where a player-authored `gmroll` would render in that player's own sidebar.
 */
export async function rollGmComplicationEffect({
  complication,
  actor = null,
  speaker = null,
} = {}) {
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  if (effectRoll?.enabled !== true || expr === '' || complication?.visibility === VISIBLE)
    return unrolledEffect(effectRoll, expr);
  return rollEffect(complication, actor, { rollMode: EFFECT_ROLL_MODE.gmOnly, speaker });
}

/** The addressing-only payload for one firing (`openspec/specs/recipes-and-steps/spec.md`
 *  § The relay payload carries ADDRESSING ONLY); the socket writer stamps `action`. */
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

/** A `gmOnly` card can only be authored by a GM (a player's whispered message renders in their
 *  own sidebar), and every complication macro runs on a GM client. */
function needsGmClient(firing) {
  const complication = firing?.complication;
  return complication?.visibility !== VISIBLE || Boolean(text(complication?.macroUuid).trim());
}

/**
 * Fire what a plan decided: settle pending condition rolls, roll visible effects, and return the
 * fired list and the GM requests. Resolves, never rejects. `fired` is in result-entry order, so a
 * component staged twice appears twice with independent rolls.
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
      // A non-object firing is dropped: no record means nothing to do.
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
    // Guard 3 of 3: the partial result still returns, because the award is committed.
    console.error('Fabricate | Complication firing aborted', error);
  }
  return result;
}

/**
 * The GM-facing projection for the GM-only card, named by audience opposite
 * `publicComplications` so a salvage run record (a player-readable actor flag) cannot receive
 * it. The macro uuid is never projected; `effectLabel` is authored GM text, so it is attested
 * even when the total beside it is a claim.
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
    effectLabel: text(entry?.complication?.effectRoll?.label),
  }));
}

/**
 * Why one complication fired, re-derived GM-side from the authored record plus the claimed
 * bucket rather than relayed, since a reason list would be one more client claim on the payload.
 * Sound, not complete: every token did contribute, and a firing whose deciding clause cannot be
 * named here is `unknown`. Under `match: 'all'` every enabled clause is named; under `'any'` a
 * matched stage clause settles it and the trigger is not named. Never empty.
 */
export function complicationReasons(complication, bucket) {
  const claimed = text(bucket);
  // The bucket sets are disjoint, so the reason token is the bucket itself.
  const stageMatched = Object.entries(STAGE_CLAUSE_BUCKETS).some(
    ([clause, buckets]) => complication?.when?.[clause] === true && buckets.includes(claimed)
  );
  const trigger = text(complication?.when?.checkTrigger).trim() !== '';
  const dice = complication?.rollCondition?.enabled === true;
  if (complication?.match === 'all') {
    const reasons = [
      stageMatched ? claimed : '',
      trigger ? 'checkTrigger' : '',
      dice ? 'rollCondition' : '',
    ];
    const named = reasons.filter(Boolean);
    return named.length > 0 ? named : ['unknown'];
  }
  if (stageMatched) return [claimed];
  // No stage clause matched: exactly one of trigger and dice authored names it; both is unknown.
  if (trigger !== dice) return [trigger ? 'checkTrigger' : 'rollCondition'];
  return ['unknown'];
}

/**
 * The GM card's row model: each applied row projected on its own (never zipped back by index),
 * plus `reasons`, the acting client's `claimed` bucket and total kept apart so the card labels
 * them as reported, and the macro report. Kept out of `main.js` so tests can drive rows
 * that disagree.
 */
export function gmComplicationCardEntries(applied) {
  return list(applied).map((row) => {
    const [projected] = gmComplications([
      {
        resultId: row?.entry?.resultId ?? null,
        componentId: row?.component?.id ?? row?.entry?.componentId ?? null,
        componentName: row?.component?.name ?? '',
        complicationId: row?.complication?.id ?? null,
        complication: row?.complication,
        bucket: row?.entry?.bucket ?? null,
        effectRoll: row?.report?.effect ?? null,
      },
    ]);
    return {
      ...projected,
      reasons: complicationReasons(row?.complication, row?.entry?.bucket ?? null),
      claimed: {
        bucket: row?.entry?.bucket ?? null,
        effectRollTotal: row?.entry?.effectRollTotal ?? null,
      },
      macro: row?.report?.macro ?? null,
    };
  });
}
