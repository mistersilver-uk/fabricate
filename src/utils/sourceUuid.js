/**
 * Resolve the compendium source UUID of a Foundry item document.
 *
 * On Foundry v12+, the canonical location is `_stats.compendiumSource`.
 * Older versions (and some migration paths) store it in `flags.core.sourceId`.
 * This helper checks both, preferring the modern field.
 *
 * @param {Item} item - A Foundry item document (or item-like object with flags/_stats)
 * @returns {string|null} The source UUID, or null if neither field is set
 */
export function getSourceUuid(item) {
  if (!item) return null;
  // Foundry v12+ canonical field
  const compendiumSource = item._stats?.compendiumSource
    || item.system?._stats?.compendiumSource
    || null;
  if (compendiumSource) return compendiumSource;
  // Legacy fallback
  if (typeof foundry !== 'undefined' && foundry?.utils?.getProperty) {
    return foundry.utils.getProperty(item, 'flags.core.sourceId') || null;
  }
  return item.flags?.core?.sourceId || null;
}
