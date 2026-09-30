/**
 * The decision policy a prepared check binds when it is described and enforces when it is
 * evaluated: whether its situational bonus applies and which advantage buttons it offers.
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
