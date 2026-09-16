/**
 * The player-character concept: which Foundry Actor types Fabricate treats as player characters
 * (issue 1024). A world-scoped module setting rather than a `CraftingSystem` property, storing
 * ADDITIONAL types only — {@link resolvePlayerCharacterTypes} unions them with the literal
 * `'character'`, so additivity holds by construction. It is deliberately distinct from attempt
 * authorization, write permission and access-grant resolution, none of which may be narrowed to
 * match it. The setting is read per call, so nothing caches a stale set.
 */

// Matches FABRICATE_SETTINGS_NAMESPACE in settings.js; hardcoded (as `repairItemData.js` does)
// because settings.js imports THIS module for the key constant below, and `import-x/no-cycle` is an
// error.
const NAMESPACE = 'fabricate';

/** The setting key holding the GM-configured ADDITIONAL player-character actor types. */
export const ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY = 'additionalPlayerCharacterActorTypes';

/** The actor type that always counts as a player character, whatever the setting says. */
export const ALWAYS_PLAYER_CHARACTER_TYPE = 'character';

/** The fallback spelling of `CONST.BASE_DOCUMENT_TYPE`. */
export const BASE_DOCUMENT_TYPE_FALLBACK = 'base';

/** Coerce a stored setting value into a clean list of additional type ids. */
export function normalizeAdditionalPlayerCharacterTypes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

/** The resolved set of actor types that count as player characters. */
export function resolvePlayerCharacterTypes(additionalTypes) {
  const resolved = new Set([ALWAYS_PLAYER_CHARACTER_TYPE]);
  for (const type of normalizeAdditionalPlayerCharacterTypes(additionalTypes)) {
    resolved.add(type);
  }
  return resolved;
}

/** Build a player-character predicate over an injected reader of the additional types. */
export function createPlayerCharacterActorPredicate(readAdditionalTypes) {
  return function isPlayerCharacter(actor) {
    const type = actor?.type;
    if (typeof type !== 'string' || type === '') return false;
    return resolvePlayerCharacterTypes(readAdditionalTypes?.()).has(type);
  };
}

/** Read the stored additional player-character actor types from Foundry's settings. */
export function readAdditionalPlayerCharacterActorTypes() {
  try {
    const stored = globalThis.game?.settings?.get?.(
      NAMESPACE,
      ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY
    );
    return normalizeAdditionalPlayerCharacterTypes(stored);
  } catch {
    return [];
  }
}

/**
 * The settings-bound player-character predicate — the single implementation of the concept for the
 * whole module.
 */
export const isPlayerCharacterActor = createPlayerCharacterActorPredicate(
  readAdditionalPlayerCharacterActorTypes
);

/** Build the picker's row model. */
export function buildActorTypeOptions({
  declaredTypes = [],
  selectedTypes = [],
  labelFor = null,
  baseDocumentType = BASE_DOCUMENT_TYPE_FALLBACK,
} = {}) {
  const declared = normalizeAdditionalPlayerCharacterTypes(declaredTypes).filter(
    // A second, defensive pass: `enumerateActorTypes()` already drops the base type, but this
    // function is also called with a hand-built list.
    (type) => type !== baseDocumentType
  );
  const selected = new Set(normalizeAdditionalPlayerCharacterTypes(selectedTypes));
  const declaredSet = new Set(declared);

  const label = (type) => {
    const resolved = typeof labelFor === 'function' ? labelFor(type) : null;
    return typeof resolved === 'string' && resolved.trim() !== '' ? resolved : type;
  };

  const options = [
    {
      id: ALWAYS_PLAYER_CHARACTER_TYPE,
      label: label(ALWAYS_PLAYER_CHARACTER_TYPE),
      checked: true,
      locked: true,
      known: declaredSet.has(ALWAYS_PLAYER_CHARACTER_TYPE),
    },
  ];

  for (const type of declared) {
    if (type === ALWAYS_PLAYER_CHARACTER_TYPE) continue;
    options.push({
      id: type,
      label: label(type),
      checked: selected.has(type),
      locked: false,
      known: true,
    });
  }

  // Stored ids the world no longer declares, appended in stored order so the round trip is stable.
  for (const type of selected) {
    if (type === ALWAYS_PLAYER_CHARACTER_TYPE || declaredSet.has(type)) continue;
    options.push({ id: type, label: type, checked: true, locked: false, known: false });
  }

  return options;
}
