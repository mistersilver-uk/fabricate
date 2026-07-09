/**
 * 1.12.0 — Seed the flat system-level `visibilityMode` enum (issue 511, PR-B
 * redesign) from the legacy compound `recipeVisibility.listMode` +
 * `recipeVisibility.knowledge.mode` pair.
 *
 * `visibilityMode` ∈ {global, restricted, item, knowledge} is the single knob
 * that now gates the whole Crafting authoring surface (see
 * `src/ui/svelte/apps/manager/crafting/craftingVisibility.js`). It replaces the
 * two-field strategy each system used to carry. This one-time migration derives
 * the new value from the legacy fields so existing systems keep their prior
 * behaviour:
 *
 *   legacy listMode 'global'    → 'global'
 *   legacy listMode 'player'    → 'restricted'
 *   legacy listMode 'teaser'    → 'global'   (teaserConfig is left untouched)
 *   legacy listMode 'knowledge' → split on knowledge.mode:
 *       'item'          → 'item'
 *       'learned'       → 'knowledge'
 *       'itemOrLearned' → 'knowledge'
 *   absent / invalid            → 'knowledge'
 *
 * The legacy `recipeVisibility` block is intentionally NOT removed — its
 * residual `knowledge.learn.dragDropEnabled` is still normalized on read.
 *
 * Idempotent: a system that already carries a `visibilityMode` is left
 * untouched, so a re-run finds nothing to seed.
 *
 * Pure: returns `{ systems }` and performs no I/O.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @returns {{ systems: Array<object> }}
 */
export function migrateVisibilityModeEnum(data = {}) {
  const systems = _clone(data.systems);

  if (!Array.isArray(systems)) {
    return { systems: data.systems };
  }

  for (const system of systems) {
    if (!_isPlainObject(system)) continue;
    if (typeof system.visibilityMode === 'string' && system.visibilityMode) continue;
    system.visibilityMode = _deriveVisibilityMode(system.recipeVisibility);
  }

  return { systems };
}

/**
 * Map a legacy `recipeVisibility` block onto the flat `visibilityMode` enum.
 * A missing/invalid block yields the `'knowledge'` default.
 * @param {object|undefined} recipeVisibility
 * @returns {'global'|'restricted'|'item'|'knowledge'}
 */
function _deriveVisibilityMode(recipeVisibility) {
  const listMode = _isPlainObject(recipeVisibility) ? recipeVisibility.listMode : undefined;
  switch (listMode) {
    case 'global': {
      return 'global';
    }
    case 'player': {
      return 'restricted';
    }
    case 'teaser': {
      return 'global';
    }
    case 'knowledge': {
      return recipeVisibility?.knowledge?.mode === 'item' ? 'item' : 'knowledge';
    }
    default: {
      return 'knowledge';
    }
  }
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
