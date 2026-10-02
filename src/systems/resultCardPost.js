/** The crafting and salvage result card's chat post, with the rolls it carries. */
import { isPublicCheckDisplay } from '../ui/presenters/checkDisplay.js';

import { chatModeOption } from './bulkChatVisibility.js';
import {
  CARD_ROLLS,
  claimCardRolls,
  offeredCardAuthor,
  offeredCardRolls,
} from './checkCardRolls.js';

/** `rolls` led by its first dice-bearing one: Dice So Nice animates none when the first has no dice. */
function diceFirst(rolls) {
  const lead = rolls.findIndex((roll) => roll?.dice?.length > 0);
  return lead > 0 ? [rolls[lead], ...rolls.slice(0, lead), ...rolls.slice(lead + 1)] : rolls;
}

/**
 * Posts a crafting or salvage result card as `actor`, carrying its rolled award amounts and, for a
 * public check, the check's offered rolls, which it then claims. A card with check rolls states the
 * public mode itself, since `ChatMessage.create` applies a mode only when one is passed, and is
 * authored as the offer's user, whose dice Dice So Nice then draws. A failed post is logged and
 * never thrown.
 */
export async function postResultCard({ actor, content, rolls, check, label }) {
  const key = check?.[CARD_ROLLS];
  const checkRolls = isPublicCheckDisplay(check) ? offeredCardRolls(key) : [];
  const carried = diceFirst([...checkRolls, ...rolls]);
  const author = checkRolls.length > 0 ? offeredCardAuthor(key) : null;
  const { ChatMessage } = globalThis;
  try {
    const data = { speaker: ChatMessage.getSpeaker({ actor }), content };
    if (carried.length > 0) data.rolls = carried;
    if (author) data.author = author;
    const mode = checkRolls.length > 0 ? [chatModeOption('publicroll')] : [];
    await ChatMessage.create(data, ...mode);
    if (checkRolls.length > 0) claimCardRolls(key);
  } catch (error) {
    console.error(`Fabricate | Failed to post ${label} chat message:`, error);
  }
}
