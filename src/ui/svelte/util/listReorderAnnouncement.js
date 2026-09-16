/**
 * ONE SENTENCE FOR "THIS ROW MOVED" (issue 1311).
 *
 * The Move up / Move down chevrons on a manager settings list reflow the list in place, so
 * without sight of it the move is only observable through a polite live region. Every list
 * carrying those chevrons therefore announces the row's new position, and the sentence has
 * to be the same one everywhere: it is one product statement about one interaction, not a
 * per-page one.
 *
 * Extracted when the modifier and character-prerequisite libraries became sibling World
 * pages. Each page owns its own live region — a page cannot announce into a sibling route —
 * but two pages each composing the localized sentence would have been the same dozen lines
 * twice, which is both a drift risk and a duplication the quality gate counts.
 */
import { localize } from './foundryBridge.js';

const REORDERED_KEY = 'FABRICATE.Admin.Manager.ListErgonomics.ReorderedAnnouncement';

/**
 * The polite-live-region sentence for a completed manual reorder.
 *
 * @param {string} name  The moved entry's own label, as the GM named it.
 * @param {number} position  The entry's new ONE-BASED position (callers hold a zero-based index).
 * @param {number} total  How many entries the list holds.
 * @returns {string} The localized sentence, or an English fallback when the key is unresolved —
 *   `localize` returns the key itself with no `game.i18n`, and reading a lang key aloud is worse
 *   than reading a plain sentence in the wrong language.
 */
export function reorderAnnouncementText(name, position, total) {
  const trimmed = String(name || '').trim();
  const announcement = localize(REORDERED_KEY, {
    name: trimmed,
    position: String(position),
    total: String(total),
  });
  if (!announcement || announcement === REORDERED_KEY) {
    return `Moved ${trimmed} to position ${position} of ${total}.`;
  }
  return announcement;
}
