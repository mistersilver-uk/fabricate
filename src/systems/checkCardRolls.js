/**
 * A public check's evaluated rolls on their way to the result card that states their outcome, so
 * one message both announces the result and animates the dice. An offer's key is a string, which
 * survives the clone the authority takes of a check result. Whoever opens an offer settles it.
 */
const offers = new Map();
let sequence = 0;

/** Bounds what a caller that never settles can leave open; the oldest offer past it is settled. */
const OPEN_OFFER_LIMIT = 50;

/** A key no open offer holds, for a caller that must name its offer before the roll opens it. */
export function cardRollsKey() {
  return `card-rolls-${(sequence += 1)}`;
}

/** The key a card projection names its offer under; a Symbol, so no transport or clone keeps it. */
export const CARD_ROLLS = Symbol('fabricate.cardRolls');

/**
 * Opens an offer and answers its key. `rolls()` builds the live Rolls the card carries, the check
 * roll first, and `post()` posts them as their own message when no card claims them. `author` is
 * the attested id of the user the check was rolled for, when another client posts the card.
 */
export function offerCardRolls({ rolls, post = null, author = null }, key = cardRollsKey()) {
  if (offers.size >= OPEN_OFFER_LIMIT) {
    settleCardRolls(offers.keys().next().value).catch((error) => {
      console.error('Fabricate | Failed to post an evicted check roll:', error);
    });
  }
  offers.set(key, { rolls, post, author, claimed: false });
  return key;
}

/** How many offers are open: zero once every caller has settled the one it opened. */
export function openCardRollsCount() {
  return offers.size;
}

/** The user an open offer's card is authored as, or null for the posting client's own user. */
export function offeredCardAuthor(key) {
  return offers.get(key)?.author ?? null;
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

/** Whether a check's handoff may ride its result card: a public, non-secret, serialized roll. */
export function cardCarriesHandoff(checkResult, handoff) {
  const { rollMode, secret } = checkResult?.visibility ?? {};
  return Boolean(handoff?.serializedRoll) && rollMode === 'publicroll' && secret !== true;
}

/**
 * `checkResult` with a public check's handoff offered to its card under `key`, authored as
 * `author`, else unchanged.
 */
export function withOfferedHandoff(checkResult, handoff, key, author = null) {
  if (!cardCarriesHandoff(checkResult, handoff)) return checkResult;
  const offer = { rolls: () => handoffRolls(handoff), author };
  return { ...checkResult, cardRolls: offerCardRolls(offer, key) };
}
