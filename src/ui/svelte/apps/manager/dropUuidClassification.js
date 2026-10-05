/**
 * What a dropped Item uuid names: an actor's embedded Item, or the source of an existing world
 * entry. Pure; the caller reads `foundry.utils.parseUuid` and hands it in.
 */
import { getItemMatchUuids } from '../../../../utils/sourceReferenceUnion.js';

/** Fails closed: an absent parser, a throw and an unreadable answer all count as embedded. */
export function isEmbeddedItemUuid(uuid, parseUuid) {
  if (typeof parseUuid !== 'function') return true;
  // V13.351 throws a TypeError at `uuid.startsWith` for a truthy non-string; V14.365 returns null.
  try {
    const parsed = parseUuid(uuid);
    if (!parsed || typeof parsed !== 'object') return true;
    return Number(parsed.embedded?.length) > 0;
  } catch {
    return true;
  }
}

/** The entry whose source-reference union already names `uuid`, or `null`. */
export function entryForSourceItem(entries, uuid) {
  const needle = String(uuid ?? '').trim();
  if (!needle) return null;
  return entries.find((entry) => getItemMatchUuids(entry?.entity).includes(needle)) ?? null;
}
