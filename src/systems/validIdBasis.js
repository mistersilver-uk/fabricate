/**
 * The **Valid Id Basis** gate (issue 1224, `data-models/spec.md` § Valid Id Basis).
 *
 * A destructive startup pass derives its "still valid" answer from a set of live-corpus id
 * sets. When that set is incomplete the pass does not see a live record, concludes the
 * thing naming it is stale, and deletes durable state that was never stale — learned
 * recipes, discovery progress, active runs, GM preferences. None of it is recoverable by
 * finishing the conversion afterwards, because the actor flags are already gone.
 *
 * This module answers ONE question, per entity kind: is that kind's id basis
 * known-complete? It reads nothing itself — `getSetting` and the highest-registered
 * migration accessor are parameters — so the whole gate is drivable from a fixture.
 *
 * ## Why it takes FOUR clauses
 *
 * Three of them describe settings, and settings alone cannot see the race:
 *
 * 1. **the layout is not `'unsettled'`** — a Storage Layout Conversion sets `unsettled`
 *    first and clears it last, so `unsettled` means the corpus is spread across both
 *    arrangements and neither can be read alone;
 * 2. **the layout equals the target** — a failed conversion's compensation DELETES the
 *    layout document, restoring the registered `singleArray` default, while the target
 *    stays `perRecord`. Repository selection reads the target, so the per-record adapter
 *    is built and `loadAll()` returns ZERO records while clause 1 reads "settled";
 * 3. **`migrationVersion` is not behind the highest registered migration** — an aborted
 *    migration pass returns before any setting write, and the version bump is the LAST
 *    write of the writeback, so an abort implies this clause;
 * 4. **the arrangement the repository was actually built for equals both** — the only
 *    clause that closes a CROSS-CLIENT race. `RecipeManager` freezes its repository choice
 *    in its constructor; the corpus is read later; these facts are read later still. A
 *    player who built the settings adapter, and whose `loadAll()` then found nothing
 *    because the GM's conversion completed and deleted the legacy document in between,
 *    reads layout and target both `perRecord` at this point. All three settings clauses
 *    hold. Only the captured arrangement disagrees.
 *
 * ## Fail direction
 *
 * `layout !== 'unsettled'` is `true` for `undefined`, `null`, `''` and for a read that
 * threw and was swallowed, so the natural implementation fails OPEN. Every clause here is
 * therefore stated positively: a value must be an explicitly recognised arrangement before
 * any comparison against it counts, and only a positively established known-complete runs
 * a pass.
 *
 * The one exception is deliberate and narrow: **an entity kind with no granular repository
 * is known-complete by construction**, because its corpus cannot be partial — it is one
 * whole-array read that either succeeded or threw. That rule is stated on the REPOSITORY
 * ({@link GRANULAR_DEFINITION_REPOSITORY_KINDS}), never on the registered settings pair: a
 * change that lands a granular repository for a kind before registering its pair would
 * otherwise be scored known-complete while its corpus is already partial, which is
 * fail-open in exactly the release that arms the hazard.
 *
 * Note the repo precedent points the other way and is correct where it sits:
 * `readRecipeStorageTarget` answers an unreadable setting with `singleArray` so that an
 * unreadable target can never PROMOTE a world onto the granular backend. Here the same
 * default would wave through the state this gate exists to catch.
 */

import { DEFINITION_STORAGE_LAYOUTS, SETTING_KEYS } from '../config/settings.js';
import { compareSemver } from '../migration/MigrationRunner.js';

/**
 * The entity kinds a startup pass can derive a valid-id answer from.
 *
 * `components` is listed separately from `systems` even though components ride inside
 * `system.components` today: they are the two halves of the salvage passes' basis and they
 * acquire independent storage pairs the moment component extraction lands.
 *
 * @type {readonly string[]}
 */
export const VALID_ID_BASIS_ENTITY_KINDS = Object.freeze(['recipes', 'systems', 'components']);

/**
 * The registered Definition Storage layout/target key pair per entity kind.
 *
 * One pair per entity class, never a shared one: converting one class would otherwise
 * appear to un-settle the other and re-gate destructive passes for a corpus already
 * converted (`data-models/spec.md` § Granular Definition Storage).
 *
 * @type {Readonly<Record<string, {layout: string, target: string}>>}
 */
export const DEFINITION_STORAGE_KEY_PAIRS = Object.freeze({
  recipes: Object.freeze({
    layout: SETTING_KEYS.RECIPE_STORAGE_LAYOUT,
    target: SETTING_KEYS.RECIPE_STORAGE_TARGET,
  }),
});

/**
 * The entity kinds for which a GRANULAR definition repository exists in this build.
 *
 * This — not {@link DEFINITION_STORAGE_KEY_PAIRS} — is what decides whether a kind's basis
 * has to be established at all, for the reason given in this module's header. Recipes are
 * the only kind whose records can be read one document at a time today; crafting systems
 * and components come back from a single whole-array read.
 *
 * @type {readonly string[]}
 */
export const GRANULAR_DEFINITION_REPOSITORY_KINDS = Object.freeze(['recipes']);

/** Every value a Definition Storage LAYOUT may legitimately hold. */
const RECOGNISED_ARRANGEMENTS = Object.freeze(Object.values(DEFINITION_STORAGE_LAYOUTS));

/**
 * True only for a value this build recognises as a storage arrangement.
 *
 * `unsettled` is recognised here and rejected by clause 1 further down, deliberately: if
 * recognition rejected it, clause 1 would never be the deciding clause for any fixture and
 * a later reader would delete it as dead code.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isRecognisedArrangement(value) {
  return typeof value === 'string' && RECOGNISED_ARRANGEMENTS.includes(value);
}

/**
 * Read one setting without letting an unregistered key or an absent `game` throw.
 *
 * A swallowed throw yields `null`, which no clause recognises, so an unreadable setting
 * fails CLOSED rather than passing the `!== 'unsettled'` test the way `undefined` would.
 *
 * @param {(key: string) => *} getSetting
 * @param {string} key
 * @returns {*}
 */
function readSettingDefensively(getSetting, key) {
  if (typeof getSetting !== 'function') return null;
  try {
    const value = getSetting(key);
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

/**
 * The highest registered migration version, read through the injected accessor.
 *
 * @param {() => string} getHighestRegisteredMigrationVersion
 * @returns {string|null}
 */
function readHighestMigrationVersion(getHighestRegisteredMigrationVersion) {
  if (typeof getHighestRegisteredMigrationVersion !== 'function') return null;
  try {
    const value = getHighestRegisteredMigrationVersion();
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Sample the raw facts every Valid Id Basis clause is decided from, per entity kind.
 *
 * Separated from {@link basisFromInputs} so the composition site can report the DECIDING
 * INPUT alongside the labels it omitted: the startup runner returns only failed labels and
 * the caller discards them, so a gate that omitted everything is otherwise indistinguishable
 * from a clean boot.
 *
 * @param {object} options
 * @param {(key: string) => *} options.getSetting Setting reader. A PARAMETER, never an
 *   import: importing `getSetting` here would make the caller's parameter decorative — a
 *   test would thread a fixture in, this module would read the seeded global instead, and
 *   the case would pass for the wrong reason.
 * @param {() => string} options.getHighestRegisteredMigrationVersion Highest registered
 *   migration version accessor, a parameter for the same reason.
 * @param {Record<string, string|null>} [options.arrangements] Per kind, the arrangement
 *   that kind's repository was actually BUILT for. An absent entry is unknown, and unknown
 *   is not known-complete.
 * @returns {Record<string, object>} one entry per {@link VALID_ID_BASIS_ENTITY_KINDS} member.
 */
export function readValidIdBasisInputs({
  getSetting,
  getHighestRegisteredMigrationVersion,
  arrangements = {},
} = {}) {
  const migrationVersion = readSettingDefensively(getSetting, SETTING_KEYS.MIGRATION_VERSION);
  const highestMigrationVersion = readHighestMigrationVersion(getHighestRegisteredMigrationVersion);
  const inputs = {};
  for (const kind of VALID_ID_BASIS_ENTITY_KINDS) {
    if (!GRANULAR_DEFINITION_REPOSITORY_KINDS.includes(kind)) {
      inputs[kind] = Object.freeze({ granular: false });
      continue;
    }
    const pair = DEFINITION_STORAGE_KEY_PAIRS[kind] ?? null;
    inputs[kind] = Object.freeze({
      granular: true,
      pairRegistered: pair !== null,
      arrangement: arrangements?.[kind] ?? null,
      layout: pair ? readSettingDefensively(getSetting, pair.layout) : null,
      target: pair ? readSettingDefensively(getSetting, pair.target) : null,
      migrationVersion,
      highestMigrationVersion,
    });
  }
  return Object.freeze(inputs);
}

/**
 * Decide one kind's basis from its sampled inputs.
 *
 * @param {object} input
 * @returns {boolean}
 */
function isKindKnownComplete(input) {
  // Known-complete BY CONSTRUCTION: no granular repository exists for this kind, so its
  // corpus arrives as one whole-array read that either succeeded or threw. There is no
  // partial state for a gate to detect.
  if (input?.granular !== true) return true;
  // A granular repository with no registered layout/target pair cannot be established at
  // all, so it fails closed. This is the direction component extraction trips.
  if (input.pairRegistered !== true) return false;

  const { arrangement, layout, target, migrationVersion, highestMigrationVersion } = input;
  // Every value must be positively recognised BEFORE any comparison, so that `undefined`,
  // `null`, `''` and a swallowed throw can never satisfy a `!==` test.
  if (!isRecognisedArrangement(arrangement)) return false;
  if (!isRecognisedArrangement(layout)) return false;
  if (!isRecognisedArrangement(target)) return false;

  // Clause 1 — the layout is not `unsettled`.
  if (layout === DEFINITION_STORAGE_LAYOUTS.UNSETTLED) return false;
  // Clause 2 — the layout equals the target.
  if (layout !== target) return false;
  // Clause 4 — the arrangement this client's repository was built for equals both. Stated
  // against BOTH rather than against the layout alone, so it remains a statement about
  // this client even if clause 2 is ever relaxed.
  if (arrangement !== layout || arrangement !== target) return false;

  // Clause 3 — `migrationVersion` is not BEHIND the highest registered migration. `>= 0`,
  // never `=== highest`: a downgraded build sits AHEAD of its own highest registered
  // migration, and reading "not equal" as "behind" would omit every destructive pass on
  // every downgraded world, permanently.
  if (typeof migrationVersion !== 'string' || migrationVersion === '') return false;
  if (typeof highestMigrationVersion !== 'string' || highestMigrationVersion === '') return false;
  return compareSemver(migrationVersion, highestMigrationVersion) >= 0;
}

/**
 * Reduce sampled inputs to the per-kind booleans a pass list is gated on.
 *
 * The returned object carries EXACTLY the {@link VALID_ID_BASIS_ENTITY_KINDS} keys and
 * nothing else. That is a contract, not an implementation detail: `data-models/spec.md`
 * forbids "this client did not run the migration pass" as an input by name, because it is
 * true on every non-primary client on every boot and would omit the destructive passes on
 * every player client permanently — while some pruned state is `user`-scoped and only that
 * user's own client can prune it. An `isPrimaryGM` or `didRunMigrations` key appearing here
 * is that regression.
 *
 * @param {Record<string, object>} inputs From {@link readValidIdBasisInputs}.
 * @returns {Record<string, boolean>}
 */
export function basisFromInputs(inputs) {
  const basis = {};
  for (const kind of VALID_ID_BASIS_ENTITY_KINDS) {
    basis[kind] = isKindKnownComplete(inputs?.[kind]);
  }
  return Object.freeze(basis);
}

/**
 * Sample and decide in one call, for callers that need no deciding-input report.
 *
 * @param {object} options See {@link readValidIdBasisInputs}.
 * @returns {Record<string, boolean>}
 */
export function readValidIdBasis(options) {
  return basisFromInputs(readValidIdBasisInputs(options));
}
