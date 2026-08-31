/**
 * Apply a legacy roll-mode token's VISIBILITY to chat data before the message is created
 * (issue 859).
 *
 * ## Why this cannot be left to `ChatMessage.create(data, { rollMode })`
 *
 * `ChatMessage#_preCreate` maps the legacy `rollMode` create option INSIDE
 * `if (this.isRoll)`, and `isRoll` is `rolls.length > 0`. The aggregated bulk salvage
 * card carries NO rolls — the N dice messages do — so passing `rollMode: 'blindroll'` to
 * `create` maps nothing, never reaches the applier, and posts the card PUBLICLY. A blind
 * bulk run would leak its whole result table to the table. This module is what stops
 * that, which is why it is a module: `src/main.js` cannot be imported under
 * `node --test` (see `tests/helpers/fabricateFacadeHarness.js`), so a pin on the token
 * vocabulary living there could only ever be a hand-mirrored copy of the mapping rather
 * than a test of it.
 *
 * ## Dependency-free apart from the `ChatMessage` global, deliberately
 *
 * Nothing here reads `game`, `ui` or `CONFIG`. The one global it touches is
 * `ChatMessage`, so a suite can stub that global, drive BOTH version branches, and
 * assert exactly which `(method, token)` pair the applier received.
 *
 * @module src/systems/bulkChatVisibility
 */

/**
 * Foundry V14's message-mode key for each LEGACY roll-mode token.
 *
 * This is core's OWN table, copied from `Roll._mapLegacyRollMode`, so Fabricate applies
 * exactly the translation core applies to the dice messages beside the card and the two
 * cannot drift across a Foundry release.
 *
 * Deliberately NOT exhaustive over V14's vocabulary: a token with no entry here is
 * passed through UNCHANGED (see {@link applyBulkChatVisibility}) rather than defaulted.
 * V14's `core.rollMode` shim returns `'ic'` verbatim for a user set to In-Character, and
 * `ic` is a real `CONFIG.ChatMessage.modes` key — so pass-through is correct, while a
 * `?? 'public'` default would silently downgrade a BLIND client default to public, which
 * is the exact leak this edge exists to close.
 */
export const V14_CHAT_MODE_BY_LEGACY_ROLL_MODE = Object.freeze({
  publicroll: 'public',
  gmroll: 'gm',
  blindroll: 'blind',
  selfroll: 'self',
});

/**
 * Apply `rollMode`'s visibility to `chatData`, translating the token when the running
 * Foundry expects V14's vocabulary.
 *
 * ## One probe selects the applier AND the vocabulary together
 *
 * V13 and V14 have DISJOINT vocabularies, and crossing them fails in two different
 * ways: a legacy key handed to V14's `applyMode` THROWS, and a V14 key handed to V13's
 * `applyRollMode` silently posts public. So the probe — `typeof
 * ChatMessage.applyMode === 'function'`, a static, which a subclassed
 * `CONFIG.ChatMessage.documentClass` inherits and therefore cannot fool — decides the
 * method and the translation in one step; they are never chosen independently.
 *
 * ## An unmapped token is CONTAINED BY THE CALLER, not here
 *
 * Pass-through is right for `ic` and for any other real V14 mode key, but it also means
 * a token that is NEITHER a legacy key nor a V14 mode key reaches `applyMode`, which
 * THROWS on one. Nothing in this function catches that. Today every call site sits inside
 * a `try`/`catch` that logs and gives up on the message —
 * `Fabricate#_postBulkSalvageChatMessage`, reached through
 * `BulkSalvageService#_postAggregateCard`, and `Fabricate#postGmComplicationCard` — so a
 * bad token costs the run its chat card and never the awards it already made. That
 * containment is the CALLER'S and a future caller must bring its own; calling this on a
 * naked path would let a chat-visibility token abort whatever it is embedded in.
 *
 * ## NEITHER applier present is a THROW, not a shrug
 *
 * `applyRollMode` is called unguarded on purpose. A build exposing neither applier is a
 * build in which this function cannot establish visibility at all, and every caller wants
 * the same answer to that: post nothing. An optional call would instead return `chatData`
 * unchanged and the caller would create the message with core's own default, which is
 * PUBLIC — so a rename or removal in a future Foundry would turn a whispered GM card and a
 * blind bulk run's result table into table-wide chat, silently. Failing closed puts that
 * into the caller's `catch`, which is where every other failure on these paths already
 * lands.
 *
 * ## The caller must set `chatData.speaker` FIRST
 *
 * `applyMode`'s `ic` branch reads `chatData.speaker.actor` UNGUARDED. This function does
 * not defend against that, because defending would hide the ordering requirement rather
 * than enforce it; `Fabricate#_postBulkSalvageChatMessage` builds the speaker onto
 * `chatData` before calling in, and any future caller must do the same.
 *
 * @param {object} chatData The message data, mutated in place (both core appliers mutate),
 *   with `speaker` already set.
 * @param {string} rollMode A LEGACY token (`publicroll`/`gmroll`/`blindroll`/`selfroll`),
 *   or any other string, which is passed through untranslated. A null/empty token applies
 *   nothing.
 * @returns {object} The same `chatData`, for call-site readability.
 */
export function applyBulkChatVisibility(chatData, rollMode) {
  if (!rollMode) return chatData;
  if (typeof ChatMessage.applyMode === 'function') {
    ChatMessage.applyMode(chatData, V14_CHAT_MODE_BY_LEGACY_ROLL_MODE[rollMode] || rollMode);
    return chatData;
  }
  ChatMessage.applyRollMode(chatData, rollMode);
  return chatData;
}
