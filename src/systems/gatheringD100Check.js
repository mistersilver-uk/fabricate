/** An immediate d100 gather's player check (issue 2398): its prompt, the GM's roll and its answer. */
import { cloneJson, stringOrEmpty, stringOrNull } from '../utils/scalars.js';

import { checkRollHandoff, postCheckRoll } from './checkRollOutput.js';
import { carryAdditionalDice } from './countCheckRoll.js';
import { isBlindWaitingTaskId } from './gatheringEngineInternals.js';
import { authorizedPreparedDecision, validatedPreparedDecision } from './preparedDecisionPolicy.js';

const D100 = '1d100';
const BLIND_TASK_LABEL_KEY = 'FABRICATE.Gathering.BlindTaskLabel';
const NO_BONUS = Object.freeze({ total: 0, roll: null });

/** A d100 task prompts only on a run started untimed, so a later time edit never changes it. */
export function offersD100Prompt({ task, run }) {
  return task?.resolutionMode === 'd100' && !run?.timeGate;
}

/** A routed or progressive task always resolves through a player check. */
export function gatheringTaskRequiresPlayerCheck(task) {
  return ['routed', 'progressive'].includes(stringOrNull(task?.resolutionMode));
}

/** Whether resolving this run asks its player for a check: what execute prompts for. */
export function gatheringRunNeedsPlayerCheck({ task, run }) {
  return gatheringTaskRequiresPlayerCheck(task) || offersD100Prompt({ task, run });
}

/**
 * The versioned descriptor: a `1d100` with a situational bonus and no target, since every row and
 * event grades itself. An opaque blind run's check is secret, so its prompt names no formula.
 */
export function describeD100Check({ actor, run, system, environment, task, localize }) {
  const secret = isBlindWaitingTaskId(run?.taskId);
  const label = secret ? localize(BLIND_TASK_LABEL_KEY) : stringOrEmpty(task?.name);
  const formula = secret ? '' : D100;
  return {
    required: true,
    publicPrompt: {
      label,
      mode: 'd100',
      actorName: secret ? '' : (actor?.name ?? ''),
      formula,
      resolvedFormula: formula,
      displayFormula: formula,
      allowsSituationalModifier: true,
      offerSituationalBonus: true,
    },
    privateEvaluation: {
      secret,
      actorUuid: stringOrNull(actor?.uuid),
      flavor: `${label ? `${label} — ` : ''}Gathering check`,
      speaker: cloneJson(globalThis.ChatMessage?.getSpeaker?.({ actor })) ?? null,
      craftingSystemId: stringOrNull(system?.id),
      environmentId: stringOrNull(environment?.id),
      taskId: stringOrNull(task?.id),
      mode: 'd100',
      slot: null,
      rollFormula: D100,
      checkConfig: null,
    },
  };
}

/**
 * A free-text situational bonus as `{ total, roll }`: a plain number as typed with no roll, any
 * other entry rolled against the actor's roll data, and a malformed or throwing entry `0`.
 */
export async function rollSituationalBonus(bonus, actor = null) {
  const entry = typeof bonus === 'string' ? bonus.trim() : bonus;
  if ([null, undefined, ''].includes(entry)) return NO_BONUS;
  const direct = Number(entry);
  if (Number.isFinite(direct)) return { total: direct, roll: null };
  const RollClass = globalThis.Roll;
  if (typeof RollClass !== 'function') return NO_BONUS;
  const formula = String(entry);
  // Called as a method, not detached, as in `evaluateCheckRoll`.
  if (typeof RollClass.validate === 'function' && RollClass.validate(formula) === false) {
    console.warn('Fabricate | Ignoring invalid situational bonus', bonus);
    return NO_BONUS;
  }
  try {
    const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
    const roll = await new RollClass(formula, rollData).evaluate({ allowInteractive: false });
    const total = Number(roll?.total);
    return Number.isFinite(total) ? { total, roll } : NO_BONUS;
  } catch (error) {
    console.warn('Fabricate | Ignoring invalid situational bonus', bonus, error);
    return NO_BONUS;
  }
}

async function rollAttempt() {
  if (typeof globalThis.Roll !== 'function') return null;
  try {
    const roll = await new globalThis.Roll(D100).evaluate({ allowInteractive: false });
    return Number.isFinite(Number(roll?.total)) ? roll : null;
  } catch (error) {
    console.error('Fabricate | Failed to roll the d100 gathering check:', error);
    return null;
  }
}

/**
 * The GM's evaluation of a prepared d100 check, which grades nothing: the stage grades each row
 * and event. A visible roll is handed back for the requester to post after the result card; a
 * secret one posts GM-private here. An unknown roll mode is `null`, so the client's own applies.
 */
export async function evaluatePreparedD100Check({ actor, privateEvaluation, decision = {} }) {
  const secret = privateEvaluation?.secret === true;
  const authorized = authorizedPreparedDecision(decision);
  if (authorized.additionalDiceRefusal) {
    return carryAdditionalDice({ success: false, cancelled: true, data: {} }, authorized);
  }
  const { bonus, rollMode } = validatedPreparedDecision(authorized);
  const situational = await rollSituationalBonus(bonus, actor);
  const roll = await rollAttempt();
  const face = roll ? Number(roll.total) : null;
  const result = {
    success: true,
    outcome: null,
    value: face,
    data: { d100: { roll: face, situationalBonus: situational.total } },
    message: null,
    engineEvaluated: true,
    secret,
  };
  if (!roll) return result;
  const shown = situational.total > 0 ? `+${situational.total}` : String(situational.total);
  const base = privateEvaluation?.flavor ?? null;
  const flavor = situational.total === 0 ? base : `${base} (situational ${shown})`;
  const preRolls = situational.roll ? [situational.roll] : [];
  const speaker = privateEvaluation?.speaker ?? null;
  if (secret) {
    const options = { interactive: true, speaker };
    await postCheckRoll({ roll, preRolls, options, flavor, rollMode: 'gmroll' });
    return result;
  }
  const rollHandoff = checkRollHandoff({
    roll,
    placement: { preRolls: preRolls.map((entry) => ({ serializedRoll: cloneJson(entry) })) },
    options: { includeRollHandoff: true, speaker },
    flavor,
    rollMode,
  });
  return rollHandoff ? { ...result, rollHandoff } : result;
}

/**
 * The answered face and bonus a stage resolves with: a face that is not an integer from 1 to 100
 * is `null`, so the stage rolls its own, and the bonus still applies.
 */
export function answeredD100Roll(checkResult) {
  const answer = checkResult?.data?.d100;
  const face = answer?.roll;
  const bonus = Number(answer?.situationalBonus);
  return {
    attemptRoll: Number.isInteger(face) && face >= 1 && face <= 100 ? face : null,
    extraModifier: Number.isFinite(bonus) ? bonus : 0,
  };
}
