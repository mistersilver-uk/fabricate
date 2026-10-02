/**
 * Read side of the world character libraries (issue 1308): the character-prerequisite and the
 * modifier library. A resolver rather than an injected store because the readers are pure
 * functions deep in the call graph; every entry point still accepts an explicit seam. Each read
 * is a Read Union (DOMAIN.md): the world library, once seeded, unioned with the system's
 * surviving legacy copy, world first on an id collision, and bounded by the 1.28.0 migration.
 */

/** The store from an explicit seam (the store or a getter), else the module registry; a throwing
 *  getter resolves `null`. */
export function resolveCharacterLibrariesStore(seam = null) {
  const candidate = seam ?? (() => globalThis.game?.fabricate?.getCharacterLibrariesStore?.());
  try {
    const store = typeof candidate === 'function' ? candidate() : candidate;
    return store ?? null;
  } catch {
    return null;
  }
}

/** Union by entry id, the first list winning a collision. */
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

export function resolveModifierLibrary(system, seam = null) {
  const store = resolveCharacterLibrariesStore(seam);
  const world = store?.isSeeded?.() === true ? store.listModifiers() : [];
  return unionById(world, system?.modifiers);
}

export function resolveCharacterPrerequisiteLibrary(system, seam = null) {
  const store = resolveCharacterLibrariesStore(seam);
  const world = store?.isSeeded?.() === true ? store.listCharacterPrerequisites() : [];
  return unionById(world, system?.characterPrerequisites);
}
