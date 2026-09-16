/** The ONE authoredness rule for a subject's check-modifier pick (issue 1095). */

/**
 * Coerce an authored id list to trimmed, non-empty, de-duplicated STRINGS, preserving authored
 * order.
 */
export function normalizeCheckModifierIds(ids) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const normalized = [];
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

/** The absence-preserving ATTACH every subject normalizer spreads. */
export function authoredCheckModifierIds(authored, key = 'checkModifierIds') {
  return Array.isArray(authored) ? { [key]: normalizeCheckModifierIds(authored) } : {};
}
