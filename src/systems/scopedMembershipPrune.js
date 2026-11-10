/** The System Membership Record prune behind the component and crafting-system deletes
 * (`data-models` § Component scope requirement 5, `destructive-changes-and-migrations`). */
import { isPlainObject, trimString } from '../utils/scalars.js';

/** The keys of records naming `systemId` and, if given, one of `entityIds`, matched trimmed; a
 * blank `systemId` or an empty `entityIds` plans nothing. */
export function planMembershipPrune(payload, { systemId, entityIds } = {}) {
  const system = trimString(systemId);
  const wanted = entityIds === undefined ? null : new Set([...entityIds].map(trimString));
  wanted?.delete('');
  if (!system || wanted?.size === 0) return [];
  const membership = isPlainObject(payload?.membership) ? payload.membership : {};
  return Object.keys(membership).filter((key) => {
    const record = membership[key];
    if (trimString(record?.systemId) !== system) return false;
    return !wanted || wanted.has(trimString(record?.entityId));
  });
}

/** Delete the planned records in one `store.save`, read in the same turn so an earlier write is
 * kept; a rejected save reloads the store and answers `{ count: 0, error }`. */
export async function removeScopedMemberships(store, options) {
  if (!store) return { count: 0 };
  const payload = store.get();
  const keys = planMembershipPrune(payload, options);
  if (keys.length === 0) return { count: 0 };
  for (const key of keys) delete payload.membership[key];
  try {
    await store.save(payload);
  } catch (error) {
    store.load?.();
    return { count: 0, error };
  }
  return { count: keys.length };
}
