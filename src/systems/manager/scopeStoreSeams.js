/** Resolve an injected store seam, given as the store or as a lazy getter (the production shape,
 * since `game.fabricate` is unpopulated at construction). A throwing getter answers `null`, an
 * unknown basis, rather than breaking the normalizer (issue 970). */
export function resolveStoreSeam(seam) {
  if (!seam) return null;
  try {
    return typeof seam === 'function' ? (seam() ?? null) : seam;
  } catch {
    return null;
  }
}

/** One scope store's published corpus, or `null` when no world half is readable, catching a
 * throwing `corpus()` too. `## Scoped Entity Definitions` requirement 16: an unreadable world
 * half answers the in-system array itself. */
export function resolveStoreCorpus(seam) {
  try {
    return resolveStoreSeam(seam)?.corpus?.() ?? null;
  } catch {
    return null;
  }
}
