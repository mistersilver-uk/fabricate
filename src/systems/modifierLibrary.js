import { isRollExpression, resolveModifierBounds } from './checkModifierResolver.js';

/**
 * Normalize the world Modifier Library (DOMAIN.md "Modifier Library"; issues 1117, 1308): drop
 * malformed entries, trim and de-duplicate ids, coerce a bad expression to `''`, and derive
 * `isRollExpression` rather than read it. The store, the migration and the export upcast all call
 * this one normalizer so they agree byte for byte. `icon`, `min` and `max` are absence-preserving
 * (absent means unbounded; `0` is a real bound), an inverted `min > max` is kept verbatim for the
 * blocking `modifierBoundsInverted` readiness issue, and an entry with no expression is kept.
 */
export function normalizeModifierLibrary(library) {
  const raw = Array.isArray(library) ? library : [];
  const seenIds = new Set();
  const modifiers = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : null;
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const expression = typeof entry.expression === 'string' ? entry.expression.trim() : '';
    const normalized = {
      id,
      label: typeof entry.label === 'string' ? entry.label : '',
      expression,
      isRollExpression: isRollExpression(expression),
    };
    if (typeof entry.icon === 'string' && entry.icon.trim()) normalized.icon = entry.icon.trim();
    // The resolver decides what unbounded means, so a cleared bound never becomes a bound of 0.
    const { min, max } = resolveModifierBounds(entry);
    if (min !== null) normalized.min = min;
    if (max !== null) normalized.max = max;
    modifiers.push(normalized);
  }
  return modifiers;
}
