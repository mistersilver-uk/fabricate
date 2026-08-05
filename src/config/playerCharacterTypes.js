/**
 * The **player-character concept**: which Foundry Actor types Fabricate treats as
 * player characters.
 *
 * A Foundry world runs exactly ONE game system, and an Actor's type does not vary by
 * crafting system, so this is a module-wide, `world`-scoped setting rather than a
 * property of the `CraftingSystem` aggregate (issue 1024).
 *
 * The setting stores **additional** types only. {@link resolvePlayerCharacterTypes}
 * unions them with the literal `'character'`, so additivity is guaranteed BY
 * CONSTRUCTION: a GM can never clear the list and break a dnd5e/pf2e world. In a
 * system that does not declare `'character'` the entry is simply inert — it matches
 * no actor.
 *
 * This module is a sibling of `preferencesCleanup.js`, which holds the OTHER actor
 * predicate, so the "these answer different questions" comments stay checkable. The
 * player-character concept governs FOUR surfaces — the actor-selection bar, the GM
 * stamina roster, the manager's Access and Knowledge rosters, and the party member
 * picker — and is deliberately distinct from three predicates that MUST NOT be
 * narrowed to match it:
 *
 *   - attempt authorization (`isGatheringActorSelectableByUser`, ownership-based),
 *   - write permission (`selectWritableActors`), and
 *   - access-grant resolution (which resolves granted character ids over EVERY world
 *     actor with no type filter).
 *
 * A configurable type list is precisely what will tempt a future implementer to
 * "make the runtime consistent with the roster". Do not.
 *
 * The module touches neither `game` nor `Hooks` except through the one guarded read
 * below, which degrades to `[]` when `game.settings.get` is absent or throws. The
 * predicate reads the setting PER CALL, so nothing caches a stale set.
 */

// Matches FABRICATE_SETTINGS_NAMESPACE in settings.js; hardcoded (as
// `repairItemData.js` does) because settings.js imports THIS module for the key
// constant below, and `import-x/no-cycle` is an error.
const NAMESPACE = 'fabricate';

/**
 * The setting key holding the GM-configured ADDITIONAL player-character actor types.
 *
 * Declared here rather than in `settings.js` so the dependency runs
 * `settings.js -> playerCharacterTypes.js` and never the other way.
 *
 * @type {string}
 */
export const ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES_KEY = 'additionalPlayerCharacterActorTypes';

/**
 * The actor type that always counts as a player character, whatever the setting says.
 *
 * @type {string}
 */
export const ALWAYS_PLAYER_CHARACTER_TYPE = 'character';

/**
 * Coerce a stored setting value into a clean list of additional type ids.
 *
 * Everything that is not a non-empty string is dropped, and duplicates collapse
 * (order-preserving, first occurrence wins). Unknown / stale ids are KEPT: they are
 * inert by construction (no actor carries them) and the realistic cause is a
 * temporarily disabled module or a mid-update system, so auto-pruning would destroy a
 * GM's configuration with no undo.
 *
 * @param {unknown} value Raw stored value.
 * @returns {string[]} Normalized additional type ids.
 */
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

/**
 * The resolved set of actor types that count as player characters.
 *
 * ALWAYS contains {@link ALWAYS_PLAYER_CHARACTER_TYPE}. This is the additivity
 * guarantee, and it is structural rather than validated: the union is built from the
 * literal, so no stored value — `[]`, `null`, garbage, or even `['character']` — can
 * remove it.
 *
 * @param {unknown} additionalTypes Raw stored additional types.
 * @returns {Set<string>} The resolved player-character actor types.
 */
export function resolvePlayerCharacterTypes(additionalTypes) {
  const resolved = new Set([ALWAYS_PLAYER_CHARACTER_TYPE]);
  for (const type of normalizeAdditionalPlayerCharacterTypes(additionalTypes)) {
    resolved.add(type);
  }
  return resolved;
}

/**
 * Build a player-character predicate over an injected reader of the additional types.
 *
 * The reader is invoked on EVERY call, so a GM's mid-session change takes effect
 * without a reload and without an invalidation step.
 *
 * @param {() => unknown} readAdditionalTypes Reader for the stored additional types.
 * @returns {(actor: object) => boolean} The predicate.
 */
export function createPlayerCharacterActorPredicate(readAdditionalTypes) {
  return function isPlayerCharacter(actor) {
    const type = actor?.type;
    if (typeof type !== 'string' || type === '') return false;
    return resolvePlayerCharacterTypes(readAdditionalTypes?.()).has(type);
  };
}

/**
 * Read the stored additional player-character actor types from Foundry's settings.
 *
 * Degrades to `[]` when `game.settings.get` is absent (the test harness, or any point
 * before `registerFabricateSettings()`) or throws (an unregistered key). Never throws.
 *
 * @returns {string[]} Normalized additional type ids.
 */
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
 * The settings-bound player-character predicate — the single implementation of the
 * concept for the whole module.
 *
 * NOT published on `game.fabricate`: it is an internal predicate, `docs/` documents no
 * such API, and adding one as a side effect of a settings change would be an
 * undeclared public-surface expansion. Consumers import it directly.
 *
 * @param {object} actor Candidate actor.
 * @returns {boolean} True when the actor's type counts as a player character.
 */
export const isPlayerCharacterActor = createPlayerCharacterActorPredicate(
  readAdditionalPlayerCharacterActorTypes
);

/**
 * Build the picker's row model.
 *
 * The enumerated types are unioned with the STORED selection, so a type id whose
 * module is temporarily disabled still renders (with its raw id as the label, since
 * there is no `typeLabels` entry for it) and therefore survives an open -> Save round
 * trip. Unticking such a row is the documented manual prune.
 *
 * `'character'` is pinned first and marked locked. The caller renders a locked row as
 * checked, `disabled`, and — load-bearing — with NO `name` attribute; see
 * `playerCharacterTypesMenu.js`.
 *
 * Module-added subtype ids contain a dot (`` `${moduleId}.${type}` ``), which is
 * exactly why we enumerate `game.documentTypes.Actor` at all. Ids therefore reach the
 * caller raw and are never used as object keys.
 *
 * @param {object} [options]
 * @param {string[]} [options.declaredTypes] Types the active world declares.
 * @param {unknown} [options.selectedTypes] The stored additional types.
 * @param {(type: string) => string} [options.labelFor] Label resolver; falls back to
 *   the raw id.
 * @returns {Array<{id: string, label: string, checked: boolean, locked: boolean, known: boolean}>}
 */
export function buildActorTypeOptions({
  declaredTypes = [],
  selectedTypes = [],
  labelFor = null,
} = {}) {
  const declared = normalizeAdditionalPlayerCharacterTypes(declaredTypes).filter(
    // `CONST.BASE_DOCUMENT_TYPE` is always present in `game.documentTypes` and is not
    // a real actor type — core's own enumeration recipe filters it.
    (type) => type !== 'base'
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

  // Stored ids the world no longer declares, appended in stored order so the round
  // trip is stable.
  for (const type of selected) {
    if (type === ALWAYS_PLAYER_CHARACTER_TYPE || declaredSet.has(type)) continue;
    options.push({ id: type, label: type, checked: true, locked: false, known: false });
  }

  return options;
}
