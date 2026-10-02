/**
 * A public check's evaluated rolls on their way to the result card that states their outcome, so
 * one message both announces the result and animates the dice. An offer's key is a string, which
 * survives the clone the authority takes of a check result. Whoever opens an offer settles it.
 */
const offers = new Map();
let sequence = 0;

/** Bounds what a caller that never settles can leave open. */
const OPEN_OFFER_LIMIT = 50;

/** The key a card projection names its offer under; a Symbol, so no transport or clone keeps it. */
export const CARD_ROLLS = Symbol('fabricate.cardRolls');

/**
 * Opens an offer and answers its key. `rolls()` builds the live Rolls the card carries, the check
 * roll first, and `post()` posts them as their own message when no card claims them.
 */
export function offerCardRolls({ rolls, post = null }, key = `card-rolls-${(sequence += 1)}`) {
  if (offers.size >= OPEN_OFFER_LIMIT) offers.delete(offers.keys().next().value);
  offers.set(key, { rolls, post, claimed: false });
  return key;
}

/** An open offer's live Rolls; none for an unknown key, or for Rolls that cannot be rebuilt. */
export function offeredCardRolls(key) {
  try {
    return offers.get(key)?.rolls() ?? [];
  } catch (error) {
    console.error('Fabricate | Failed to rebuild check rolls for a result card:', error);
    return [];
  }
}

/** Records that a posted card carries the offer's rolls. */
export function claimCardRolls(key) {
  const offer = offers.get(key);
  if (offer) offer.claimed = true;
}

/** Closes an offer, posting its fallback when no card claimed it; answers whether one did. */
export async function settleCardRolls(key) {
  const offer = offers.get(key);
  offers.delete(key);
  if (!offer) return false;
  if (!offer.claimed) await offer.post?.();
  return offer.claimed;
}

/** A serialized roll handoff's Rolls, the check roll first. `Roll.fromData` mutates its input. */
export function handoffRolls(handoff, Roll = globalThis.Roll) {
  const serialized = [handoff.serializedRoll, ...(handoff.serializedPreRolls ?? [])];
  const rolls = serialized.map((data) => Roll.fromData(structuredClone(data)));
  if (!rolls.every(Boolean)) throw new TypeError('Check roll reconstruction failed');
  return rolls;
}

/** `checkResult` with a public check's handoff offered to its card under `key`, else unchanged. */
export function withOfferedHandoff(checkResult, handoff, key) {
  const { rollMode, secret } = checkResult?.visibility ?? {};
  if (!handoff?.serializedRoll || rollMode !== 'publicroll' || secret === true) return checkResult;
  return { ...checkResult, cardRolls: offerCardRolls({ rolls: () => handoffRolls(handoff) }, key) };
}
