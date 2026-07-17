/**
 * Pure presentation helper for the salvage result chat card (issue 675).
 *
 * `buildSalvageChatContent` takes an already-resolved, plain data model (no
 * Foundry documents, no globals) and returns the HTML string posted via
 * `ChatMessage.create`. It reuses {@link module:src/systems/CraftingChatCard}'s
 * `buildResultCard` renderer verbatim, so a salvage card is the SAME card as a
 * crafting card — same markup, same `fabricate-craft-chat` styles — differing
 * only in its labels: it reads as a salvage analogue of the crafting card, not a
 * second unrelated format. All image/name resolution happens in the caller
 * (CraftingEngine); this module only maps the salvage model onto the shared keys.
 */

import { buildResultCard } from './CraftingChatCard.js';

/**
 * The salvage label-key map for `buildResultCard`: the subject is the source
 * component being broken down, the results are what was recovered, and the tools
 * section lists any tools that broke during the salvage.
 */
export const SALVAGE_CHAT_KEYS = Object.freeze({
  success: 'FABRICATE.Chat.SalvageSuccess',
  failure: 'FABRICATE.Chat.SalvageFailure',
  actor: 'FABRICATE.Chat.SalvageActor',
  subject: 'FABRICATE.Chat.SalvageSource',
  results: 'FABRICATE.Chat.SalvageRecovered',
  consumed: 'FABRICATE.Chat.SalvageConsumed',
  tools: 'FABRICATE.Chat.SalvageTools',
  failureReason: 'FABRICATE.Chat.FailureReason',
  consumedOnFailure: 'FABRICATE.Chat.ConsumedOnFailure',
});

/**
 * Build the HTML content for a salvage result chat card.
 *
 * @param {object} model
 * @param {'succeeded'|'failed'} model.status
 * @param {string}  model.actorName
 * @param {string}  [model.componentName] - The salvaged source component.
 * @param {Array<{name:string,img:string,quantity:number}>} [model.results]  - Recovered items.
 * @param {Array<{name:string,img:string,quantity:number}>} [model.consumed] - The source broken down.
 * @param {Array<{name:string,img:string}>}                 [model.tools]    - Tools that broke.
 * @param {string}  [model.failureReason]
 * @param {(key:string)=>string} [localize] - Localization lookup; defaults to identity.
 * @returns {string} HTML string suitable for ChatMessage content.
 */
export function buildSalvageChatContent(model = {}, localize = (key) => key) {
  return buildResultCard(
    {
      status: model.status,
      actorName: model.actorName,
      subjectName: model.componentName,
      results: model.results,
      consumed: model.consumed,
      tools: model.tools,
      failureReason: model.failureReason,
    },
    SALVAGE_CHAT_KEYS,
    localize
  );
}
