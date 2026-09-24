/**
 * `1.23.0`: one `system.modifiers` from the two libraries (issue 1117); spec § Unified Modifier
 * Library Migration. The check entry keeps the id, the only side whose references this pass can
 * rewrite exhaustively.
 */

import { isPlainObject, forEachSystem } from './migrationHelpers.js';

/** Where the check-modifier catalogue lived between `1.22.0` and `1.23.0`. */
const LEGACY_CHECK_LIBRARY_KEY = 'checkModifiers';

const LEGACY_GATHERING_LIBRARY_KEY = 'characterModifiers';

const UNIFIED_LIBRARY_KEY = 'modifiers';

const COLLISION_SUFFIX = 'gathering';

function _entryId(entry) {
  if (!isPlainObject(entry)) return '';
  return typeof entry.id === 'string' ? entry.id.trim() : '';
}

/** The first free id in the deterministic `<id>-gathering`, `<id>-gathering-2`, … sequence. */
function _resolveCollision(id, taken) {
  let candidate = `${id}-${COLLISION_SUFFIX}`;
  let suffix = 1;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${id}-${COLLISION_SUFFIX}-${suffix}`;
  }
  return candidate;
}

/** In place; unrenamed and malformed references are left as they are. */
function _rewriteReferences(references, renames) {
  if (!Array.isArray(references) || renames.size === 0) return;
  for (const reference of references) {
    if (!isPlainObject(reference)) continue;
    const renamed = renames.get(String(reference.modifierId ?? ''));
    if (renamed) reference.modifierId = renamed;
  }
}

/** Exactly the three sites `migrateRemoveSystemProvider` scrubs; a fourth would break closure. */
function _rewriteGatheringReferences(systemConfig, renames) {
  if (!isPlainObject(systemConfig) || renames.size === 0) return;
  if (Array.isArray(systemConfig.tasks)) {
    for (const task of systemConfig.tasks) {
      if (!isPlainObject(task)) continue;
      if (Array.isArray(task.dropRows)) {
        for (const row of task.dropRows) {
          if (isPlainObject(row)) _rewriteReferences(row.characterModifiers, renames);
        }
      }
      _rewriteReferences(task.staminaCostModifiers, renames);
    }
  }
  if (Array.isArray(systemConfig.events)) {
    for (const event of systemConfig.events) {
      if (isPlainObject(event)) _rewriteReferences(event.characterModifiers, renames);
    }
  }
}

/** In place, answering the re-key count; shared with the export upcast. */
export function applyUnifiedModifierLibrary(system, systemConfig = null) {
  if (!isPlainObject(system)) return 0;

  const checkEntries = Array.isArray(system[LEGACY_CHECK_LIBRARY_KEY])
    ? system[LEGACY_CHECK_LIBRARY_KEY]
    : null;
  const gatheringEntries =
    isPlainObject(systemConfig) && Array.isArray(systemConfig[LEGACY_GATHERING_LIBRARY_KEY])
      ? systemConfig[LEGACY_GATHERING_LIBRARY_KEY]
      : null;

  // A malformed legacy value is skipped, not deleted, as in `1.22.0`: the GM has no other copy.
  if (checkEntries === null && gatheringEntries === null) return 0;

  // Idempotent without the version gate, which the View Lab relies on: an authored unified
  // library is never clobbered, and the legacy keys still retire.
  const alreadyUnified = Array.isArray(system[UNIFIED_LIBRARY_KEY]);
  const merged = alreadyUnified ? system[UNIFIED_LIBRARY_KEY] : [];
  const taken = new Set(merged.map((entry) => _entryId(entry)).filter(Boolean));

  if (!alreadyUnified && checkEntries) {
    for (const entry of checkEntries) {
      const id = _entryId(entry);
      // No usable id: carried verbatim for the normalizer to drop.
      if (id) {
        if (taken.has(id)) continue;
        taken.add(id);
      }
      merged.push(entry);
    }
  }

  const renames = new Map();
  if (!alreadyUnified && gatheringEntries) {
    for (const entry of gatheringEntries) {
      const id = _entryId(entry);
      if (!id) {
        merged.push(entry);
        continue;
      }
      if (taken.has(id)) {
        const replacement = _resolveCollision(id, taken);
        renames.set(id, replacement);
        taken.add(replacement);
        merged.push({ ...entry, id: replacement });
        continue;
      }
      taken.add(id);
      merged.push(entry);
    }
  }

  if (merged.length > 0 || checkEntries || gatheringEntries) {
    system[UNIFIED_LIBRARY_KEY] = merged;
  }
  if (checkEntries) delete system[LEGACY_CHECK_LIBRARY_KEY];
  if (gatheringEntries) delete systemConfig[LEGACY_GATHERING_LIBRARY_KEY];

  _rewriteGatheringReferences(systemConfig, renames);
  return renames.size;
}

export function migrateUnifyModifierLibraries(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  if (!Array.isArray(systems)) {
    return { systems: data.systems, gatheringConfig: data.gatheringConfig };
  }
  const gatheringConfig = isPlainObject(data.gatheringConfig)
    ? structuredClone(data.gatheringConfig)
    : null;
  const configSystems = isPlainObject(gatheringConfig?.systems) ? gatheringConfig.systems : null;

  const collisions = [];
  forEachSystem(systems, (system) => {
    const systemId = String(system.id ?? '');
    const systemConfig = systemId && configSystems ? configSystems[systemId] : null;
    const collided = applyUnifiedModifierLibrary(system, systemConfig);
    if (collided > 0) {
      collisions.push({ system: String(system.name ?? systemId), collisions: collided });
    }
  });

  const result = {
    systems,
    gatheringConfig: gatheringConfig ?? data.gatheringConfig,
  };
  if (collisions.length > 0) result._unifiedModifierCollisions = collisions;
  return result;
}
