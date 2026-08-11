/**
 * 1.23.0 — Merge the two modifier libraries a crafting system authored into ONE
 * `system.modifiers` (issue 1117; pure, clone-first, idempotent, version-gated).
 *
 * WHY THIS EXISTS. A system authored modifiers in TWO places, in two near-identical
 * shapes: the check-modifier catalogue at `system.checkModifiers` (put there by `1.22.0`)
 * and the gathering character-modifier library at
 * `gatheringConfig.systems[systemId].characterModifiers`. The two differ only in which
 * optional fields each consumer honours, and nothing in the domain distinguishes them —
 * "a named actor-driven expression" is one concept. Authoring it twice meant a GM defining
 * Medicine for a check and Medicine for a drop row as two unrelated records that could
 * silently disagree. They merge here, and both old keys are retired.
 *
 * A NEW FORWARD MIGRATION, not an amendment to `1.22.0`. `1.22.0` is merged and may
 * already have run in a GM's world, so rewriting it would leave `migrationVersion` at
 * `1.22.0` with the OLD transform applied and the new one never reachable. This takes its
 * own version and downgrades to `1.22.0`.
 *
 * THE RUNNER'S ORDERING IS LOAD-BEARING, exactly as it was for `1.22.0`. `_runMigrations()`
 * runs BEFORE any manager loads persisted data (`src/main.js`), and both
 * `CraftingSystemManager._normalizeModifierLibrary` and the gathering config normalizer are
 * ALLOWLIST REBUILDS that no longer emit the old keys — so had any save run first, BOTH
 * libraries would have been DELETED rather than merged, silently and with no recoverable
 * copy.
 *
 * ═══ ID COLLISIONS ═══
 *
 * Two independently authored libraries can carry the same id, and the merge must resolve
 * that DETERMINISTICALLY rather than by last-write-wins — a merge whose winner depends on
 * iteration order is a merge whose result a GM cannot predict or reproduce.
 *
 * THE CHECK-CATALOGUE ENTRY KEEPS THE ID; the colliding gathering entry is re-keyed. That
 * is not a preference between the two, it is the only side whose references this migration
 * can rewrite exhaustively:
 *
 *   - The check catalogue's ids are referenced from `Recipe.craftingModifier.modifierIds`
 *     (a DIFFERENT world setting, `recipes`), `Component.salvage.checkModifierIds`,
 *     `GatheringTask.checkModifierIds` and the three activity `defaultModifierIds[]`.
 *   - The gathering library's ids are referenced ONLY from inside the same
 *     `gatheringConfig.systems[systemId]` block this migration is already rewriting:
 *     `tasks[].dropRows[].characterModifiers[]`, `tasks[].staminaCostModifiers[]` and
 *     `events[].characterModifiers[]`.
 *
 * So renaming the gathering side is a closed rewrite, and renaming the check side would
 * not be. The rule is "rename the side whose every reference is in scope", which is a fact
 * about the data rather than a judgement about which library matters more.
 *
 * The replacement id is `<id>-gathering`, then `<id>-gathering-2`, `-3`, … until one is
 * free. The search reads only the set of ids already taken, and entries are visited in
 * their authored array order, so the output is a pure function of the input — re-running
 * the migration on the same world yields the same ids, and two GMs upgrading the same
 * world get the same result.
 *
 * The per-system collision COUNT is reported through the transient
 * `_unifiedModifierCollisions` field, which the runner captures for the one-time GM notice
 * and strips before persisting.
 *
 * ═══ ORDER ═══
 *
 * Check-catalogue entries first, in their authored order, then gathering entries in
 * theirs. The check catalogue is the one whose order was already meaningful to a rolled
 * check, and appending is the only merge that preserves both source orders.
 *
 * IT SEEDS NOTHING. A system with neither library gets no `modifiers` key from this
 * migration; the normalizer defaults it to `[]` on the next read. Writing an empty array
 * would be storage churn for zero observable change, the same call `1.22.0` and
 * `migrateMaxModifierPicks` already make.
 *
 * PURE AND CLONE-FIRST. The runner spread-merges a migration's return value
 * (`data = { ...data, ...result }`), so this returns `{ systems, gatheringConfig }` rather
 * than mutating the runner's payload. Clone-first is also what makes the no-throw
 * guarantee total: the runner restores its pre-migration checkpoint only on the FATAL
 * branch, so an in-place migration that threw halfway would persist a half-applied world.
 * Nothing here throws (every level is guarded and a malformed system/library is skipped
 * rather than repaired — normalization is the normalizer's job).
 *
 * Mutated setting keys: `craftingSystems` and `gatheringConfig`.
 *
 * THE DOWNGRADE LOSES BOTH LIBRARIES, and the registry entry says so rather than leaving
 * it to be inferred. `1.22.0`'s normalizers are allowlists that never saw `system.modifiers`,
 * so a downgraded world drops the merged library on the first read: every check modifier
 * stops contributing to every roll AND every gathering drop row, event and stamina cost
 * loses the entry it references. That is strictly more loss than `1.22.0`'s own lossy
 * downgrade, which is why it is declared and named again rather than inherited.
 */

/** Where the check-modifier catalogue lived between `1.22.0` and `1.23.0`. */
const LEGACY_CHECK_LIBRARY_KEY = 'checkModifiers';

/** Where the gathering character-modifier library lived, inside the gathering config. */
const LEGACY_GATHERING_LIBRARY_KEY = 'characterModifiers';

/** The one merged library, on the crafting system. */
const UNIFIED_LIBRARY_KEY = 'modifiers';

/** The suffix a re-keyed gathering entry takes when its id collides. */
const COLLISION_SUFFIX = 'gathering';

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _entryId(entry) {
  if (!_isPlainObject(entry)) return '';
  return typeof entry.id === 'string' ? entry.id.trim() : '';
}

/**
 * The first free id in the deterministic `<id>-gathering`, `<id>-gathering-2`, … sequence.
 *
 * @param {string} id The colliding id.
 * @param {Set<string>} taken Every id already claimed in the merged library.
 * @returns {string}
 */
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
 * Rewrite every `modifierId` in one reference list through the collision rename map.
 *
 * The list is mutated in place. A reference naming an id that did not collide is left
 * exactly as authored, and a malformed reference is skipped rather than repaired.
 *
 * @param {unknown} references A `{modifierId}[]` reference list.
 * @param {Map<string, string>} renames Old id → new id.
 */
function _rewriteReferences(references, renames) {
  if (!Array.isArray(references) || renames.size === 0) return;
  for (const reference of references) {
    if (!_isPlainObject(reference)) continue;
    const renamed = renames.get(String(reference.modifierId ?? ''));
    if (renamed) reference.modifierId = renamed;
  }
}

/**
 * Apply the collision renames across every gathering reference site in ONE system's
 * gathering config block.
 *
 * The three sites are exactly the ones `migrateRemoveSystemProvider` already scrubs, which
 * is the enumeration this migration's determinism argument rests on: if a fourth existed,
 * renaming the gathering side would not be a closed rewrite.
 *
 * @param {object} systemConfig One `gatheringConfig.systems[systemId]` block.
 * @param {Map<string, string>} renames Old id → new id.
 */
function _rewriteGatheringReferences(systemConfig, renames) {
  if (!_isPlainObject(systemConfig) || renames.size === 0) return;
  if (Array.isArray(systemConfig.tasks)) {
    for (const task of systemConfig.tasks) {
      if (!_isPlainObject(task)) continue;
      if (Array.isArray(task.dropRows)) {
        for (const row of task.dropRows) {
          if (_isPlainObject(row)) _rewriteReferences(row.characterModifiers, renames);
        }
      }
      _rewriteReferences(task.staminaCostModifiers, renames);
    }
  }
  if (Array.isArray(systemConfig.events)) {
    for (const event of systemConfig.events) {
      if (_isPlainObject(event)) _rewriteReferences(event.characterModifiers, renames);
    }
  }
}

/**
 * Apply the whole 1.23.0 transform to ONE system and its gathering config block.
 *
 * Both arguments are mutated in place, so callers must hand over structures they already
 * own (clones). Splitting the per-system transform out this way is what lets the
 * world-setting migration below and the export-payload upcast in `migrateExportPayload.js`
 * share one derivation instead of maintaining two copies of it: an export bundle carries
 * exactly one system and exactly one gathering-config slice, so there is nothing to group.
 *
 * @param {unknown} system One raw crafting system, mutated in place.
 * @param {unknown} [systemConfig] That system's raw `gatheringConfig.systems[id]` block,
 *   mutated in place. Omitted when the system has no gathering config at all.
 * @returns {number} How many gathering entries had to be re-keyed for a collision.
 */
export function applyUnifiedModifierLibrary(system, systemConfig = null) {
  if (!_isPlainObject(system)) return 0;

  const checkEntries = Array.isArray(system[LEGACY_CHECK_LIBRARY_KEY])
    ? system[LEGACY_CHECK_LIBRARY_KEY]
    : null;
  const gatheringEntries =
    _isPlainObject(systemConfig) && Array.isArray(systemConfig[LEGACY_GATHERING_LIBRARY_KEY])
      ? systemConfig[LEGACY_GATHERING_LIBRARY_KEY]
      : null;

  // A MALFORMED LEGACY VALUE IS SKIPPED, NOT DELETED — the same call `1.22.0` makes, and
  // for the same reason: deleting a non-array library is a repair, and this migration
  // would be destroying data it has decided it cannot read on the one code path where the
  // GM has no copy left. The allowlist rebuilds drop it on the next save anyway.
  if (checkEntries === null && gatheringEntries === null) return 0;

  // GUARDED, so the transform is idempotent without relying on the version gate: an
  // authored unified library is the newer, correct location and is never clobbered. The
  // legacy keys are still retired, so a half-migrated system converges rather than
  // carrying libraries that could disagree. (The View Lab depends on this directly —
  // `tests/view-lab/world/labWorld.js` boots the real runner over fixtures seeding no
  // `migrationVersion`, so every migration runs on every lab build.)
  const alreadyUnified = Array.isArray(system[UNIFIED_LIBRARY_KEY]);
  const merged = alreadyUnified ? system[UNIFIED_LIBRARY_KEY] : [];
  const taken = new Set(merged.map((entry) => _entryId(entry)).filter(Boolean));

  if (!alreadyUnified && checkEntries) {
    for (const entry of checkEntries) {
      const id = _entryId(entry);
      // A check entry with no usable id cannot collide and cannot be referenced; it is
      // carried through verbatim and the normalizer drops it, exactly as it does today.
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

/**
 * Runner entry point.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {object} [data.gatheringConfig] Raw gatheringConfig setting.
 * @returns {{ systems: Array<object>, gatheringConfig: object,
 *   _unifiedModifierCollisions?: Array<{ system: string, collisions: number }> }}
 */
export function migrateUnifyModifierLibraries(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  if (!Array.isArray(systems)) {
    return { systems: data.systems, gatheringConfig: data.gatheringConfig };
  }
  const gatheringConfig = _isPlainObject(data.gatheringConfig)
    ? structuredClone(data.gatheringConfig)
    : null;
  const configSystems = _isPlainObject(gatheringConfig?.systems) ? gatheringConfig.systems : null;

  const collisions = [];
  for (const system of systems) {
    if (!_isPlainObject(system)) continue;
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
