/**
 * `1.12.0` — seed the flat system-level `visibilityMode` enum from the legacy
 * `recipeVisibility.listMode` plus `knowledge.mode` pair, so existing systems keep their prior
 * behaviour (issue 511). Pure and idempotent: a system already carrying the enum is untouched.
 * The legacy `recipeVisibility` block is intentionally NOT removed — its residual
 * `knowledge.learn.dragDropEnabled` is still normalized on read.
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
 * Map a legacy `recipeVisibility` block onto the flat enum; a missing or invalid block yields the
 * `'knowledge'` default.
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
