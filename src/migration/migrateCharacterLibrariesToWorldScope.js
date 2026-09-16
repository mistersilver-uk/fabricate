/**
 * `1.28.0` — lift the character prerequisite and modifier libraries to world scope (issue 1308; spec
 * § Character Libraries World-Scope Migration). Pure, idempotent, version-gated. Unlike currency and
 * travel NOTHING stays on the system, an unreferenced entry costing nothing.
 * COLLISIONS ARE THE NORMAL CASE, preset ids being stable editable slugs, and that changes the HARM:
 * the reference still RESOLVES, to a DIFFERENT rule. They are REPORTED, never re-keyed.
 */

import { normalizeCharacterPrerequisiteList } from '../systems/characterPrerequisites.js';
import { normalizeModifierLibrary } from '../systems/modifierLibrary.js';

import { isPlainObject, clone } from './migrationHelpers.js';

/** The two library keys, and the normalizer that decides what "the same entry" means for each. */
const LIBRARIES = Object.freeze([
  Object.freeze({ key: 'characterPrerequisites', normalize: normalizeCharacterPrerequisiteList }),
  Object.freeze({ key: 'modifiers', normalize: normalizeModifierLibrary }),
]);

/**
 * Normalize ONE entry through its library's normalizer, so sameness is judged on the persisted shape
 * rather than whatever the raw record happened to carry.
 */
function normalizedEntry(entry, normalize) {
  try {
    const [normalized] = normalize([entry]) ?? [];
    return normalized ?? null;
  } catch {
    return null;
  }
}

/** Union one library across every system, first system winning an id collision. */
function buildLibrary(systems, library) {
  const entries = [];
  const seen = new Map();
  const collisions = [];

  for (const system of systems) {
    if (!isPlainObject(system)) continue;
    const raw = system[library.key];
    if (!Array.isArray(raw)) continue;
    const systemId = String(system.id || '');

    for (const entry of raw) {
      if (!isPlainObject(entry)) continue;
      const id = String(entry.id || '').trim();
      if (!id) continue;

      if (seen.has(id)) {
        const kept = seen.get(id);
        const incoming = normalizedEntry(entry, library.normalize);
        // Same id AND same meaning is the seeded-preset case: numerous, harmless, and reporting it
        // would bury the collision that actually changed a rule.
        if (JSON.stringify(kept.normalized) === JSON.stringify(incoming)) continue;
        collisions.push({
          library: library.key,
          entryId: id,
          keptFrom: kept.systemId,
          discardedFrom: systemId,
        });
        continue;
      }

      seen.set(id, { systemId, normalized: normalizedEntry(entry, library.normalize) });
      entries.push(clone(entry));
    }
  }

  return { entries, collisions };
}

/** Build the world character libraries by unioning every system's entries, per library. */
export function buildWorldCharacterLibraries(systems) {
  const list = Array.isArray(systems) ? systems : [];
  const built = {};
  const collisions = [];
  for (const library of LIBRARIES) {
    const result = buildLibrary(list, library);
    built[library.key] = result.entries;
    collisions.push(...result.collisions);
  }
  if (collisions.length > 0) built._collisions = collisions;
  return built;
}

/**
 * Drop the named library keys — STRIPPING ONLY WHAT THE WORLD NOW HOLDS, which is load-bearing
 * rather than tidy: the lift is decided PER LIBRARY, so an unconditional strip would delete the
 * un-lifted one outright, with no error and no copy anywhere. Unchanged systems return BY REFERENCE.
 */
export function stripSystemCharacterLibraries(systems, keys = LIBRARIES.map((l) => l.key)) {
  const list = Array.isArray(systems) ? systems : [];
  const strip = Array.isArray(keys) ? keys : [];
  if (strip.length === 0) return list;
  return list.map((system) => {
    if (!isPlainObject(system)) return system;
    const carries = strip.some((key) => Object.prototype.hasOwnProperty.call(system, key));
    // Returning the ORIGINAL reference matters: the runner detects change by JSON comparison over
    // the whole corpus, so rebuilding every system would rewrite the entire corpus for nothing.
    if (!carries) return system;
    const next = { ...system };
    for (const key of strip) delete next[key];
    return next;
  });
}

export function migrateCharacterLibrariesToWorldScope(data = {}) {
  const systems = Array.isArray(data.systems) ? data.systems : [];
  const existing = isPlainObject(data.characterLibraries) ? data.characterLibraries : {};

  // THE IDEMPOTENCE GUARD IS PER LIBRARY, not a disjunction across the two: "either populated
  // library proves the lift ran" is false of every way but the ACTIVE GM's own migration, so an
  // assistant GM adding one modifier would make it true while every system still carried both — and
  // the pass would then STRIP them without ever lifting them.
  const built = buildWorldCharacterLibraries(systems);
  const collisions = Array.isArray(built._collisions) ? built._collisions : [];
  delete built._collisions;

  const characterLibraries = { ...existing };
  const lifted = [];
  for (const library of LIBRARIES) {
    const stored = existing[library.key];
    const alreadyMigrated = Array.isArray(stored) && stored.length > 0;
    if (alreadyMigrated) {
      // The world owns this library; the systems' copies are stale duplicates and may go.
      lifted.push(library.key);
      continue;
    }
    if (built[library.key].length === 0) continue;
    characterLibraries[library.key] = built[library.key];
    lifted.push(library.key);
  }

  const result = {
    // ONLY the libraries the world now holds are stripped — see `stripSystemCharacterLibraries`.
    systems: stripSystemCharacterLibraries(systems, lifted),
    // Return the ORIGINAL object when nothing was lifted: the runner detects change by JSON
    // comparison, so emitting a freshly-built pair of empty arrays over a stored `{}` would write
    // the setting in every world that never authored either library.
    characterLibraries:
      JSON.stringify(characterLibraries) === JSON.stringify(existing)
        ? existing
        : characterLibraries,
  };
  if (collisions.length > 0) result._characterLibraryCollisions = collisions;
  return result;
}
