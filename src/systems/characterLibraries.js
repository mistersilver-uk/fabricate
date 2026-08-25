/**
 * Read side of the WORLD character libraries (issue 1308): the character-prerequisite library and
 * the modifier library.
 *
 * WHY A RESOLVER RATHER THAN AN INJECTED STORE EVERYWHERE. Most readers of these libraries are
 * pure functions deep in the call graph — `buildCheckModifierContext` alone has eight callers —
 * and threading a collaborator through all of them to reach a value that is global to the world
 * would be a lot of plumbing for no isolation. This mirrors `getCurrencyRequirementConfig`, which
 * resolves the world currency config the same way and for the same reason. Every entry point
 * still accepts an explicit seam, so a test never has to touch globals.
 *
 * THE RESULT IS A UNION of the world library and the crafting system's own surviving legacy copy,
 * world first on an id collision. That is the same reasoning `CraftingSystemManager`'s Valid Id
 * Basis uses, applied to reading rather than to pruning: before the 1.28.0 migration lifts them
 * the legacy in-system entries ARE the live corpus, and migrations run on the ACTIVE GM only, so
 * every player and every assistant GM spends at least one session reading a world setting that
 * has not been written yet. Without the union their tools, books and checks would resolve
 * nothing at all in that window.
 *
 * This is deliberately NOT the "silent read-alias" the 1.22.0 and 1.23.0 relocations refused. An
 * alias hides a relocation by making the old location keep working forever; this is bounded by
 * the migration, which strips the legacy copy the first time an active GM loads the world.
 */

/**
 * Resolve the world character-libraries store from an explicit seam, or from the module registry.
 *
 * @param {object|Function|null} [seam] The store, or a getter for it.
 * @returns {object|null}
 */
export function resolveCharacterLibrariesStore(seam = null) {
  const candidate = seam ?? (() => globalThis.game?.fabricate?.getCharacterLibrariesStore?.());
  try {
    const store = typeof candidate === 'function' ? candidate() : candidate;
    return store ?? null;
  } catch {
    return null;
  }
}

/**
 * Union two libraries by entry id, preferring the first list on a collision.
 *
 * @param {Array<object>} preferred
 * @param {Array<object>} fallback
 * @returns {Array<object>}
 */
function unionById(preferred, fallback) {
  const first = Array.isArray(preferred) ? preferred : [];
  const second = Array.isArray(fallback) ? fallback : [];
  if (first.length === 0) return second;
  if (second.length === 0) return first;
  const seen = new Set(first.map((entry) => String(entry?.id ?? '').trim()).filter(Boolean));
  const extra = second.filter((entry) => {
    const id = String(entry?.id ?? '').trim();
    return id && !seen.has(id);
  });
  return extra.length === 0 ? first : [...first, ...extra];
}

/**
 * The modifier library a crafting system resolves against.
 *
 * @param {object|null} system The normalized crafting system, when the caller has one.
 * @param {object|Function|null} [seam]
 * @returns {Array<object>}
 */
export function resolveModifierLibrary(system, seam = null) {
  const store = resolveCharacterLibrariesStore(seam);
  const world = store?.isSeeded?.() === true ? store.listModifiers() : [];
  return unionById(world, system?.modifiers);
}

/**
 * The character-prerequisite library a crafting system resolves against.
 *
 * @param {object|null} system The normalized crafting system, when the caller has one.
 * @param {object|Function|null} [seam]
 * @returns {Array<object>}
 */
export function resolveCharacterPrerequisiteLibrary(system, seam = null) {
  const store = resolveCharacterLibrariesStore(seam);
  const world = store?.isSeeded?.() === true ? store.listCharacterPrerequisites() : [];
  return unionById(world, system?.characterPrerequisites);
}
