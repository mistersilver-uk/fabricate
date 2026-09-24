/**
 * `1.28.0`: lift the character libraries to world scope (issue 1308); spec § Character Libraries
 * World-Scope Migration owns the strip and why collisions are reported, not re-keyed.
 */

import { normalizeCharacterPrerequisiteList } from '../systems/characterPrerequisites.js';
import { normalizeModifierLibrary } from '../systems/modifierLibrary.js';

import { isPlainObject, clone, forEachSystem, mapSystems } from './migrationHelpers.js';

/** The two library keys, and the normalizer that decides what "the same entry" means for each. */
const LIBRARIES = Object.freeze([
  Object.freeze({ key: 'characterPrerequisites', normalize: normalizeCharacterPrerequisiteList }),
  Object.freeze({ key: 'modifiers', normalize: normalizeModifierLibrary }),
]);

/** So sameness is judged on the persisted shape, not the raw record. */
function normalizedEntry(entry, normalize) {
  try {
    const [normalized] = normalize([entry]) ?? [];
    return normalized ?? null;
  } catch {
    return null;
  }
}

/** The first system wins an id collision. */
function buildLibrary(systems, library) {
  const entries = [];
  const seen = new Map();
  const collisions = [];

  forEachSystem(systems, (system) => {
    const raw = system[library.key];
    if (!Array.isArray(raw)) return;
    const systemId = String(system.id || '');

    for (const entry of raw) {
      if (!isPlainObject(entry)) continue;
      const id = String(entry.id || '').trim();
      if (!id) continue;

      if (seen.has(id)) {
        const kept = seen.get(id);
        const incoming = normalizedEntry(entry, library.normalize);
        // Same id and meaning is a seeded preset: harmless, and reporting it buries real ones.
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
  });

  return { entries, collisions };
}

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
 * Only what the world now holds: the lift is per library, so an unconditional strip would silently
 * delete an un-lifted one. Unchanged systems return by reference.
 */
export function stripSystemCharacterLibraries(systems, keys = LIBRARIES.map((l) => l.key)) {
  const list = Array.isArray(systems) ? systems : [];
  const strip = Array.isArray(keys) ? keys : [];
  if (strip.length === 0) return list;
  return mapSystems(list, (system) => {
    const carries = strip.some((key) => Object.prototype.hasOwnProperty.call(system, key));
    // The runner detects change by JSON comparison, so a rebuild rewrites the corpus for nothing.
    if (!carries) return system;
    const next = { ...system };
    for (const key of strip) delete next[key];
    return next;
  });
}

export function migrateCharacterLibrariesToWorldScope(data = {}) {
  const systems = Array.isArray(data.systems) ? data.systems : [];
  const existing = isPlainObject(data.characterLibraries) ? data.characterLibraries : {};

  // Guarded per library, not by a disjunction: an assistant GM adding one modifier would make
  // "either is populated" true, and the pass would strip both libraries unlifted.
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
    systems: stripSystemCharacterLibraries(systems, lifted),
    // Nothing lifted answers the original, or empty arrays over a stored `{}` write every world.
    characterLibraries:
      JSON.stringify(characterLibraries) === JSON.stringify(existing)
        ? existing
        : characterLibraries,
  };
  if (collisions.length > 0) result._characterLibraryCollisions = collisions;
  return result;
}
