/** The crafting and salvage result card's chat post, with the rolls it carries. */
import { isPublicCheckDisplay } from '../ui/presenters/checkDisplay.js';

import { chatModeOption } from './bulkChatVisibility.js';
import { CARD_ROLLS, claimCardRolls, offeredCardRolls } from './checkCardRolls.js';

/**
 * Posts a crafting or salvage result card as `actor`, carrying its rolled award amounts and, for a
 * public check, the check's offered rolls, which it then claims. A card with check rolls names the
 * public mode, so its visibility never follows the creating client's own chat-mode selector. A
 * failed post is logged and never thrown.
 */
export async function postResultCard({ actor, content, rolls, check, label }) {
  const key = check?.[CARD_ROLLS];
  const checkRolls = isPublicCheckDisplay(check) ? offeredCardRolls(key) : [];
  const carried = [...checkRolls, ...rolls];
  const { ChatMessage } = globalThis;
  try {
    const data = { speaker: ChatMessage.getSpeaker({ actor }), content };
    if (carried.length > 0) data.rolls = carried;
    const mode = checkRolls.length > 0 ? [chatModeOption('publicroll')] : [];
    await ChatMessage.create(data, ...mode);
    if (checkRolls.length > 0) claimCardRolls(key);
  } catch (error) {
    console.error(`Fabricate | Failed to post ${label} chat message:`, error);
  }
}
