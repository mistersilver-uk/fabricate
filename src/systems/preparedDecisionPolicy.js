/**
 * The decision policy a prepared check binds when it is described and enforces when it is
 * evaluated: whether its situational bonus applies, which advantage buttons it offers and the
 * additional dice it offers, and the decision the evaluator accepts against its snapshot.
 */
import { publicAdditionalDiceOffer } from './additionalDiceReach.js';
import { offeredDecision, publicAdvantageOffer } from './checkAdvantage.js';

/** The allowlisted policy a prepare token binds and persists, from the public prompt. */
export function preparedDecisionPolicy(prompt) {
  const additionalDiceOffer = publicAdditionalDiceOffer(prompt?.additionalDiceOffer);
  return {
    allowsSituationalModifier: prompt?.allowsSituationalModifier === true,
    allowAdvantage: prompt?.allowAdvantage === true,
    advantageOffer: publicAdvantageOffer(prompt?.advantageOffer),
    ...(additionalDiceOffer && { additionalDiceOffer }),
  };
}

/**
 * `{ additionalDice }` when a decision names bought dice, else nothing. The value is kept as sent,
 * never coerced or clamped, so a count the evaluator cannot honour refuses with its reason.
 */
export function decisionAdditionalDice(decision) {
  const dice = decision?.additionalDice;
  return [undefined, null, 0].includes(dice) || typeof dice === 'object'
    ? {}
    : { additionalDice: dice };
}

/** Why the bound offer excludes a whole count of bought dice, else null; a fresh read bounds it too. */
function excludedAdditionalDice({ additionalDice: dice, additionalDiceOffer: offer }) {
  if (!Number.isInteger(dice) || dice <= 0) return null;
  if (!offer) return 'notOffered';
  return offer.unavailable ?? (dice > offer.limit ? 'choiceAboveLimit' : null);
}

/**
 * A player's decision as its bound policy permits: an unoffered bonus or button is dropped, and
 * bought dice the offer excludes carry `additionalDiceRefusal` with its notice facts, never clamped.
 */
export function authorizedPreparedDecision(decision) {
  const refusal = excludedAdditionalDice(decision ?? {});
  const offer = decision?.additionalDiceOffer;
  return {
    ...decision,
    bonus: decision?.allowsSituationalModifier === true ? decision.bonus : null,
    advantage: offeredDecision(decision?.advantageOffer, decision?.advantage),
    ...(refusal && {
      additionalDiceRefusal: refusal,
      additionalDiceNotice: {
        dice: decision.additionalDice,
        limit: offer?.limit ?? 0,
        available: offer?.available ?? 0,
        label: offer?.resourceLabel ?? '',
        source: null,
      },
    }),
  };
}

const ROLL_MODES = Object.freeze(['publicroll', 'gmroll', 'blindroll', 'selfroll']);

/**
 * A prepared decision as the evaluator reads it: offered modifier ids only, a known roll mode, a
 * button only when `advantageOffer`, derived from the prepare-time snapshot, includes it, and any
 * bought dice, which the evaluator validates against a fresh read of the resource.
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
    ...decisionAdditionalDice(source),
  };
}
