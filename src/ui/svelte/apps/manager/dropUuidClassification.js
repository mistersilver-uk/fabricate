/**
 * What a dropped Item uuid names: an actor's embedded Item, or the source of an existing world
 * entry. Pure; the caller reads `foundry.utils.parseUuid` and hands it in.
 */
import { getItemMatchUuids } from '../../../../utils/sourceReferenceUnion.js';

// The embedded-uuid rule is shared with component import, which asks it of an unresolved uuid.
export { isEmbeddedItemUuid } from '../../../../utils/sourceReferenceUnion.js';

/** The entry whose source-reference union already names `uuid`, or `null`. */
export function entryForSourceItem(entries, uuid) {
  const needle = String(uuid ?? '').trim();
  if (!needle) return null;
  return entries.find((entry) => getItemMatchUuids(entry?.entity).includes(needle)) ?? null;
}
