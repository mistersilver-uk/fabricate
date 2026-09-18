/**
 * `1.23.0` — merge a crafting system's two modifier libraries into ONE `system.modifiers` (issue
 * 1117; spec § Unified Modifier Library Migration owns the rules, the lossy downgrade and why THE
 * RUNNER'S ORDERING IS LOAD-BEARING). THE CHECK-CATALOGUE ENTRY KEEPS THE ID, being the only side
 * whose references this pass can rewrite EXHAUSTIVELY.
 */

import { isPlainObject } from './migrationHelpers.js';

/** Where the check-modifier catalogue lived between `1.22.0` and `1.23.0`. */
const LEGACY_CHECK_LIBRARY_KEY = 'checkModifiers';

/** Where the gathering character-modifier library lived, inside the gathering config. */
const LEGACY_GATHERING_LIBRARY_KEY = 'characterModifiers';

/** The one merged library, on the crafting system. */
const UNIFIED_LIBRARY_KEY = 'modifiers';

/** The suffix a re-keyed gathering entry takes when its id collides. */
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

/**
 * Rewrite every `modifierId` in one reference list through the rename map, in place. A reference
 * naming an id that did not collide is left as authored, and a malformed one is skipped.
 */
function _rewriteReferences(references, renames) {
  if (!Array.isArray(references) || renames.size === 0) return;
  for (const reference of references) {
    if (!isPlainObject(reference)) continue;
    const renamed = renames.get(String(reference.modifierId ?? ''));
    if (renamed) reference.modifierId = renamed;
  }
}

/**
 * Apply the renames across every gathering reference site in ONE system's block. The three sites are
 * exactly the ones `migrateRemoveSystemProvider` scrubs, which is the enumeration the determinism
 * argument rests on: if a fourth existed, renaming the gathering side would not be a closed rewrite.
 */
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

/**
 * Apply the whole `1.23.0` transform to ONE system and its gathering block, both mutated in place,
 * answering how many entries were re-keyed. Split out so the world migration and the export upcast
 * share ONE derivation.
 */
export function applyUnifiedModifierLibrary(system, systemConfig = null) {
  if (!isPlainObject(system)) return 0;

  const checkEntries = Array.isArray(system[LEGACY_CHECK_LIBRARY_KEY])
    ? system[LEGACY_CHECK_LIBRARY_KEY]
    : null;
  const gatheringEntries =
    isPlainObject(systemConfig) && Array.isArray(systemConfig[LEGACY_GATHERING_LIBRARY_KEY])
      ? systemConfig[LEGACY_GATHERING_LIBRARY_KEY]
      : null;

  // A MALFORMED LEGACY VALUE IS SKIPPED, NOT DELETED — the same call `1.22.0` makes: deleting a
  // non-array library is a repair, and this migration would be destroying data it has decided it
  // cannot read, on the one path where the GM has no copy left.
  if (checkEntries === null && gatheringEntries === null) return 0;

  // GUARDED, so the transform is idempotent without relying on the version gate: an authored
  // unified library is the newer location and is never clobbered, while the legacy keys are still
  // retired so a half-migrated system converges. The View Lab depends on this directly — it boots
  // the real runner over fixtures seeding no `migrationVersion`.
  const alreadyUnified = Array.isArray(system[UNIFIED_LIBRARY_KEY]);
  const merged = alreadyUnified ? system[UNIFIED_LIBRARY_KEY] : [];
  const taken = new Set(merged.map((entry) => _entryId(entry)).filter(Boolean));

  if (!alreadyUnified && checkEntries) {
    for (const entry of checkEntries) {
      const id = _entryId(entry);
      // A check entry with no usable id cannot collide and cannot be referenced; it is carried
      // through verbatim and the normalizer drops it.
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

/** Runner entry point. */
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
  for (const system of systems) {
    if (!isPlainObject(system)) continue;
    const systemId = String(system.id ?? '');
    const systemConfig = systemId && configSystems ? configSystems[systemId] : null;
    const collided = applyUnifiedModifierLibrary(system, systemConfig);
    if (collided > 0) {
      collisions.push({ system: String(system.name ?? systemId), collisions: collided });
    }
  }

  const result = {
    systems,
    gatheringConfig: gatheringConfig ?? data.gatheringConfig,
  };
  if (collisions.length > 0) result._unifiedModifierCollisions = collisions;
  return result;
}
