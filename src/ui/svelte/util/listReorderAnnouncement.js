// ONE sentence for "this row moved" (issue 1311). The Move up/down chevrons reflow a manager
// settings list in place, so without sight of it the move is observable only through a polite live
// region — and the sentence is one product statement, not a per-page one. Each page still owns its
// own region, because a page cannot announce into a sibling route; only the wording is shared.
import { localize } from './foundryBridge.js';

const REORDERED_KEY = 'FABRICATE.Admin.Manager.ListErgonomics.ReorderedAnnouncement';

// `position` is ONE-BASED; callers hold a zero-based index. The English fallback is load-bearing:
// `localize` returns the key with no `game.i18n`, and a key read aloud is worse than a wrong tongue.
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
