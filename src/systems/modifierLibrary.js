import { isRollExpression, resolveModifierBounds } from './checkModifierResolver.js';

/**
 * Normalize the modifier library (issue 1117, moved to WORLD scope by issue 1308): the ONE
 * named library of `{id, label, icon?, expression, isRollExpression, min?, max?}` entries that
 * every activity's check selects over AND that every gathering drop row, event and stamina cost
 * references. Malformed entries are dropped, ids are trimmed and de-duplicated, and a bad
 * expression coerces to an empty string.
 *
 * IT LIVES HERE, not on `CraftingSystemManager`, because since issue 1308 it has THREE callers
 * that must agree byte for byte: the world store that persists the library, the startup
 * migration that lifts it out of every crafting system, and the export-payload upcast that does
 * the same to an imported bundle. A private method on the manager would have forced the other
 * two to re-implement it, and a second implementation of a normalizer is how a persisted shape
 * and its migration drift apart.
 *
 * IT IS ONE LIBRARY, not two. Until issue 1117 a system authored modifiers twice, in two
 * near-identical shapes: the check-modifier catalogue at `system.checkModifiers` and the
 * gathering character-modifier library at `gatheringConfig.systems[systemId].characterModifiers`.
 * The `1.23.0` migration merged them, and both keys are retired.
 *
 * THE SHAPE IS A SUPERSET, and each field is honoured by whichever consumer needs it: `min`/`max`
 * clamp the resolved value of a CHECK modifier, and gathering's own per-reference `min`/`max`
 * clamp a drop contribution independently of them.
 *
 * `icon`, `min` and `max` are all ABSENCE-PRESERVING: each is attached only when authored, so
 * `null`, `undefined`, `''` and junk all normalize to the same shape (key absent) and absence
 * means unbounded. `0` is a real bound and survives, which is why the guard is `Number.isFinite`
 * and not truthiness. An inverted pair (`min > max`) is PRESERVED VERBATIM rather than repaired:
 * it is a blocking readiness issue (`modifierBoundsInverted`) that the GM must fix, and silently
 * swapping the pair would roll a number nobody authored.
 *
 * `isRollExpression` is DERIVED here and never read off the input, so a persisted or imported
 * flag can never contradict the expression beside it.
 *
 * AN ENTRY WITH NO EXPRESSION IS KEPT. The library has an "Add modifier" button, and an entry
 * that vanished on save the moment it was created would make that button appear broken.
 *
 * @param {unknown} library Raw modifier library.
 * @returns {Array<{id: string, label: string, expression: string, isRollExpression: boolean,
 *   icon?: string, min?: number, max?: number}>}
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
    // Asked of the RESOLVER rather than re-derived here, so the persisted shape and the clamp the
    // engine applies cannot disagree about what an unbounded form is. That matters more than it
    // looks: `Number(null)`, `Number('')` and `Number([])` are all `0`, and `0` is a REAL bound on
    // this field — so a hand-written `Number.isFinite` guard here would MINT a bound of 0 every
    // time the editor cleared one.
    const { min, max } = resolveModifierBounds(entry);
    if (min !== null) normalized.min = min;
    if (max !== null) normalized.max = max;
    modifiers.push(normalized);
  }
  return modifiers;
}
