/**
 * The decision policy a prepared check binds when it is described and enforces when it is
 * evaluated: whether its situational bonus applies and which advantage buttons it offers, and
 * the decision the evaluator accepts against its prepare-time snapshot.
 */
import { offeredDecision, publicAdvantageOffer } from './checkAdvantage.js';

/** The allowlisted policy a prepare token binds and persists, from the public prompt. */
export function preparedDecisionPolicy(prompt) {
  return {
    allowsSituationalModifier: prompt?.allowsSituationalModifier === true,
    allowAdvantage: prompt?.allowAdvantage === true,
    advantageOffer: publicAdvantageOffer(prompt?.advantageOffer),
  };
}

/** A player's decision as its bound policy permits: an unoffered bonus or button is dropped. */
export function authorizedPreparedDecision(decision) {
  return {
    ...decision,
    bonus: decision?.allowsSituationalModifier === true ? decision.bonus : null,
    advantage: offeredDecision(decision?.advantageOffer, decision?.advantage),
  };
}

const ROLL_MODES = Object.freeze(['publicroll', 'gmroll', 'blindroll', 'selfroll']);

/**
 * A prepared decision as the evaluator reads it: offered modifier ids only, a known roll mode, and
 * a button only when `advantageOffer`, derived from the prepare-time snapshot, includes it.
 */
export function validatedPreparedDecision(decision, modifierChoice, advantageOffer) {
  const source = decision && typeof decision === 'object' ? decision : {};
  const offered = new Set(
    (Array.isArray(modifierChoice?.modifiers) ? modifierChoice.modifiers : [])
      .map((modifier) => modifier?.id)
      .filter((id) => typeof id === 'string')
  );
  const selected = (Array.isArray(source.modifierIds) ? source.modifierIds : []).filter(
    (id) => typeof id === 'string' && offered.has(id)
  );
  // Absent ids fall through to the descriptor's defaults; an empty array is an answer.
  return {
    bonus: typeof source.bonus === 'string' ? source.bonus : null,
    advantage: offeredDecision(advantageOffer, source.advantage),
    rollMode: ROLL_MODES.includes(source.rollMode) ? source.rollMode : null,
    ...(Array.isArray(source.modifierIds) && { chosenModifierIds: selected }),
  };
}
