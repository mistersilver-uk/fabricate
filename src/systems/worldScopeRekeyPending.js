/**
 * IS A `1.30.0` RE-KEY STILL PENDING? (issue 1363, epic 1357, PR 3.)
 *
 * The `1.30.0` migration moves component and tool ids, and the pass that repairs every durable
 * reference to them — `remapWorldScopeIdentityFlags` — runs LATER in the same `ready` tick, on
 * the ACTIVE GM ALONE. Between those two moments the corpus is internally consistent and the
 * ACTOR-SIDE references to it are not, and that window is what this predicate names.
 *
 * ## Why it exists at all: the Valid Id Basis is structurally blind to it
 *
 * `WHOLE_CORPUS_ID_BASIS` answers "did we read the WHOLE corpus", and after the migration the
 * answer is honestly yes. Every destructive startup pass is gated on that and would therefore
 * run — against a corpus that is complete but whose IDS HAVE JUST MOVED. The salvage-run prune
 * deletes an in-flight run whose `componentId` is not in the freshly re-keyed component set,
 * and the stale-preference prune drops every `salvage:<oldComponentId>` ordering key, both
 * BEFORE the remap that would have repaired them. Completeness and CURRENCY are different
 * questions, and the basis only ever asked the first.
 *
 * ## Why it is CORPUS-DERIVED rather than an ordering fix
 *
 * Reordering the GM's own `ready` body would fix the GM and leave every player exposed: the
 * startup passes are scoped to `selectWritableActors` and run on EVERY client, while the remap
 * is active-GM gated and runs on ONE. A player booting during the window prunes its own
 * actors' runs and nothing ever repairs them. This predicate is a plain world-setting read, so
 * every client reaches the same answer independently and withholds together.
 *
 * ## It FAILS CLOSED
 *
 * An unreadable setting answers PENDING. The passes it gates are housekeeping — skipping one
 * boot costs nothing — and what they delete is not recoverable.
 *
 * ## PURE, AND DELIBERATELY IMPORT-FREE
 *
 * It is read by `startupPassComposition.js`, which is documented as reading no globals and is
 * the composition seam the whole Valid Id Basis gate is asserted through. Importing
 * `src/config/settings.js` there to reach `SETTING_KEYS` would drag `src/ui/theme.js` into that
 * seam's closure. The key is therefore spelled once here and PINNED against `SETTING_KEYS` by
 * `tests/world-scope-startup-prune-ordering.test.js`, so the mirror is guarded rather than
 * hand-maintained.
 */

/**
 * The world setting the `1.30.0` migration writes its re-key map to.
 *
 * A GUARDED MIRROR of `SETTING_KEYS.WORLD_SCOPE_REKEY_MAP`. See the module note for why it is
 * not imported, and `tests/world-scope-startup-prune-ordering.test.js` for the pin.
 *
 * @type {string}
 */
export const WORLD_SCOPE_REKEY_MAP_SETTING_KEY = 'worldScopeRekeyMap';

/**
 * Whether the persisted re-key map still holds pairs nothing has consumed.
 *
 * @param {unknown} rekeyMap The raw `fabricate.worldScopeRekeyMap` value.
 * @returns {boolean}
 */
export function isPendingWorldScopeRekeyMap(rekeyMap) {
  if (!rekeyMap || typeof rekeyMap !== 'object' || Array.isArray(rekeyMap)) return false;
  return Object.keys(rekeyMap).length > 0;
}

/**
 * Whether a `1.30.0` re-key is still pending on this world, read through an injected accessor.
 *
 * @param {(key: string) => unknown} getSetting
 * @returns {boolean} `true` when the map is non-empty OR could not be read at all.
 */
export function hasPendingWorldScopeRekey(getSetting) {
  if (typeof getSetting !== 'function') return true;
  try {
    return isPendingWorldScopeRekeyMap(getSetting(WORLD_SCOPE_REKEY_MAP_SETTING_KEY));
  } catch {
    // FAIL CLOSED. See the module note.
    return true;
  }
}
