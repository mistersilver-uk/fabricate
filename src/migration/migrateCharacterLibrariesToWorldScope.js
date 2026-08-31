/**
 * 1.28.0 — Lift the character prerequisite library and the modifier library from every crafting
 * system to world scope (issue 1308; pure, idempotent, version-gated).
 *
 * WHY THIS EXISTS. Both libraries describe the acting CHARACTER, not the crafting system. "Smith's
 * Tools proficiency at least 1" is a fact about a character; `@abilities.med.mod` is a number read
 * off a character sheet. Neither becomes a different rule because the GM switched from the
 * blacksmithing system to the alchemy system, yet Fabricate stored both on each crafting system,
 * so a world running three systems maintained three copies of every rule and the copies could
 * drift apart.
 *
 * They now live in the `characterLibraries` world setting. Unlike currency (issue 1278) and travel
 * (issue 1282), NOTHING stays on the crafting system — there is no participation flag, because an
 * unreferenced entry already costs nothing and there is no meaningful "off" state to model.
 *
 * Without this migration the readers would find an empty world library in every upgraded world.
 * They tolerate that — a system's surviving legacy copy is unioned in on read, precisely so an
 * unmigrated client is not broken — but the GM would still be editing a library that no crafting
 * system ever adopts, so the migration is what actually completes the move.
 *
 * HOW ENTRIES ARE RECONCILED — union-merge, keyed by entry `id`, first system wins, and the
 * union is per LIBRARY rather than across both.
 *
 * Keying by id is what makes the merge reference-preserving. Books and scrolls
 * (`caps.learn.characterPrerequisiteIds`), tool requirement gates, complications, recipes
 * (`craftingModifier.modifierIds`), components (`salvage.checkModifierIds`), gathering tasks, drop
 * rows, events and stamina costs all store IDS, so an entry dropped by the merge orphans every
 * reference to it.
 *
 * COLLISIONS ARE THE NORMAL CASE HERE, which is what makes this different from the currency and
 * travel merges it otherwise copies. Preset ids are stable semantic slugs on both libraries —
 * `smithsTools`, `proficientArcana`, `expertCrafter` for prerequisites; `strength`, `perception`,
 * `survival` for modifiers — so a GM who seeded presets into two systems collides on every seeded
 * entry. And presets are explicitly editable once seeded.
 *
 * That changes what the harm IS. Elsewhere a bad merge orphans a reference, which is visible. Here
 * the reference still RESOLVES — to a different rule. If system B edited its `smithsTools` to
 * require rank 2 and system A's copy wins, system B's books silently start gating at the easier
 * threshold, with no error and nothing on screen to notice. So collisions are REPORTED, never
 * re-keyed (re-keying would orphan every reference, which is the harm the union exists to
 * prevent).
 *
 * ONLY CONTENT-DIFFERING COLLISIONS ARE REPORTED. Two systems seeded from the same preset bundle
 * collide on every entry while agreeing exactly about what each one means, and reporting those
 * would bury the one collision that actually changed a rule under dozens that changed nothing.
 * Sameness is judged on the NORMALIZED entry, so a difference in key order or in an absent-versus-
 * undefined bound is not mistaken for a disagreement.
 *
 * Mutated setting keys: `characterLibraries` (created) and `craftingSystems` (shrunk).
 *
 * IDEMPOTENT, and the guard is load-bearing. Once the world setting carries either library this is
 * a no-op for it: a second run must never re-merge stale system blocks over a library the GM has
 * since edited, because they may have deliberately deleted an entry. The guard is a two-list
 * DISJUNCTION — one populated library is enough to prove the lift already ran, even if the other
 * is legitimately empty.
 *
 * Never throws: every level is guarded, and a malformed system or entry is skipped rather than
 * repaired. Repair is the normalizer's job, not this migration's.
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
 * Normalize ONE entry through its library's normalizer, so sameness is judged on the persisted
 * shape rather than on whatever the raw record happened to carry.
 *
 * @param {object} entry
 * @param {(list: unknown) => Array<object>} normalize
 * @returns {object|null}
 */
function normalizedEntry(entry, normalize) {
  try {
    const [normalized] = normalize([entry]) ?? [];
    return normalized ?? null;
  } catch {
    return null;
  }
}

/**
 * Union one library across every system, first system winning an id collision.
 *
 * @param {Array<object>} systems
 * @param {{ key: string, normalize: Function }} library
 * @returns {{ entries: object[], collisions: object[] }}
 */
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
        // Same id AND same meaning is the seeded-preset case: numerous, harmless, and reporting
        // it would bury the collision that actually changed a rule.
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

/**
 * Build the world character libraries by unioning every system's entries, per library.
 *
 * @param {Array<object>} systems
 * @returns {{ characterPrerequisites: object[], modifiers: object[], _collisions?: object[] }}
 */
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
 * Drop the named library keys from every system.
 *
 * STRIPS ONLY WHAT THE WORLD NOW HOLDS, and that pairing is load-bearing rather than tidy. The
 * lift is decided PER LIBRARY — a world that already carries modifiers is not re-merged, while
 * its prerequisites may still be waiting to be lifted — so a strip that removed both keys
 * unconditionally would delete the un-lifted library outright, with no error and no copy
 * anywhere. That state is easy to reach: any GM edit seeds the setting, and only the ACTIVE GM
 * ever runs migrations, so an assistant GM adding one modifier is enough to arm it.
 *
 * @param {Array<object>} systems
 * @param {Array<string>} keys The library keys the world now owns.
 * @returns {Array<object>} a new array; unchanged systems are returned BY REFERENCE
 */
export function stripSystemCharacterLibraries(systems, keys = LIBRARIES.map((l) => l.key)) {
  const list = Array.isArray(systems) ? systems : [];
  const strip = Array.isArray(keys) ? keys : [];
  if (strip.length === 0) return list;
  return list.map((system) => {
    if (!isPlainObject(system)) return system;
    const carries = strip.some((key) => Object.prototype.hasOwnProperty.call(system, key));
    // Returning the ORIGINAL reference matters: the runner detects change by JSON comparison over
    // the whole corpus, so rebuilding every system unconditionally would report the crafting
    // systems as changed in every upgraded world and rewrite the entire corpus for nothing.
    if (!carries) return system;
    const next = { ...system };
    for (const key of strip) delete next[key];
    return next;
  });
}

/**
 * @param {{ systems: Array<object>, characterLibraries: object }} data
 * @returns {{ systems: Array<object>, characterLibraries: object, _characterLibraryCollisions?: object[] }}
 */
export function migrateCharacterLibrariesToWorldScope(data = {}) {
  const systems = Array.isArray(data.systems) ? data.systems : [];
  const existing = isPlainObject(data.characterLibraries) ? data.characterLibraries : {};

  // THE IDEMPOTENCE GUARD IS PER LIBRARY, not a disjunction across the two.
  //
  // A disjunction reads "either populated library proves the lift already ran", which is true of
  // a world the ACTIVE GM migrated and false of every other way the setting can come to hold
  // entries. Any GM edit writes it, and migrations run on the active GM alone, so an assistant
  // GM adding a single modifier makes `alreadyMigrated` true while every crafting system still
  // carries both libraries — and the pass would then strip them without ever lifting them.
  //
  // Deciding each library on its own removes that entirely: the modifiers half is left alone
  // because the world already owns it, and the prerequisites half is lifted because it does not.
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
    // Return the ORIGINAL object when nothing was lifted. The runner detects change by JSON
    // comparison, so emitting a freshly-built pair of empty arrays over a stored `{}` would
    // register as a change and write the setting in every world that has never authored either
    // library — churn that shows up as an unexplained write in an otherwise no-op upgrade.
    characterLibraries:
      JSON.stringify(characterLibraries) === JSON.stringify(existing)
        ? existing
        : characterLibraries,
  };
  if (collisions.length > 0) result._characterLibraryCollisions = collisions;
  return result;
}
