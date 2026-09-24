/**
 * Visibility for Fabricate's roll-free chat cards (issue 859), applied to the data with the V13 or
 * V14 applier and vocabulary picked together (`.agents/docs/foundry-and-architecture.md`).
 */

/** Core's own `Roll._mapLegacyRollMode` table; an unmapped token such as `ic` passes through. */
export const V14_CHAT_MODE_BY_LEGACY_ROLL_MODE = Object.freeze({
  publicroll: 'public',
  gmroll: 'gm',
  blindroll: 'blind',
  selfroll: 'self',
});

/** The `toMessage` visibility option for the running build, key and token chosen together. */
export function chatModeOption(rollMode) {
  if (typeof globalThis.ChatMessage?.applyMode === 'function') {
    return { messageMode: V14_CHAT_MODE_BY_LEGACY_ROLL_MODE[rollMode] || rollMode };
  }
  return { rollMode };
}

/**
 * Apply `rollMode` to `chatData` in place; `speaker` must already be set. Throws on an unmapped
 * non-mode token (V14) or with neither applier, failing closed: each caller posts inside a `try`.
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
