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
 * ## Why it takes FIVE clauses
 *
 * Three of them describe settings, and settings alone see none of the races:
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
 * 4. **the arrangement the repository was actually built for equals both** — the reader's
 *    own commitment, captured before the corpus read. A client that built the single-array
 *    adapter, and whose `loadAll()` then found nothing because another client's conversion
 *    completed and deleted the legacy document in between, reads layout and target both
 *    `perRecord` here: all three settings clauses hold and the corpus is empty;
 * 5. **the layout observed ACROSS the corpus read is recognised, is not `'unsettled'`, and
 *    still equals the layout at basis time.** Clause 4 is necessary and not sufficient,
 *    because the arrangement derives from the TARGET — which is set before a conversion
 *    starts and does not move until it is over, so it is CONSTANT across the entire
 *    conversion window and cannot witness anything that happened inside it. A reader that
 *    built the granular adapter correctly, read a half-written corpus, and then watched the
 *    conversion's tail finish during the ordinary construction work between the read and
 *    the basis sample, satisfies clauses 1-4 in full. Only the layout it saw at read time
 *    disagrees, and it always disagrees: `unsettled` is set first and cleared last, so a
 *    read overlapping a conversion saw `unsettled` without exception.
 *
 * Clause 5's window is far wider than clause 4's, which is why both are needed. Clause 4's
 * race requires the WHOLE conversion to land between the repository construction and the
 * corpus read — a span with no `await` in it. Clause 5's requires only the conversion's
 * TAIL to land between the corpus read and the basis sample, which is a span containing a
 * second manager's initialization and a dozen other awaited constructions.
 *
 * ## Fail direction
 *
 * `layout !== 'unsettled'` is `true` for `undefined`, `null`, `''` and for a read that
 * threw and was swallowed, so the natural implementation fails OPEN. Every clause here is
 * therefore stated positively: a value must be an explicitly recognised arrangement before
 * any comparison against it counts, and only a positively established known-complete runs
 * a pass.
 *
 * The one exception is deliberate and narrow: **an entity kind that has no granular
 * repository at all is known-complete by construction**, because its corpus arrives as a
 * single whole-array read rather than a set of records that can be half-written. Two rules
 * keep that exemption from becoming the hole:
 *
 * - it is keyed on the KIND ({@link GRANULAR_DEFINITION_REPOSITORY_KINDS}), never on a flag
 *   carried in the sampled data. A declared-granular kind whose input is missing,
 *   malformed, or reports itself non-granular is NOT known-complete — otherwise a caller
 *   that sampled its own inputs, or caught a sampling error and passed `{}`, would be told
 *   to run every pass;
 * - it is refused for any kind whose repository REPORTS itself granular, whether this build
 *   declares that kind granular or not. That report comes from the repository object that
 *   was actually built ({@link
 *   import('./CraftingDefinitionRepository.js').CraftingDefinitionRepository#storesRecordsGranularly}),
 *   so a second granular class, or one injected through a manager's `repository` seam,
 *   cannot slip past. Landing a granular repository for a kind before registering its
 *   settings pair is exactly the #1212 window, and it fails closed here.
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
  // Issue 1212. WITHOUT this entry `input.pairRegistered !== true` and the component basis is
  // `false` FOREVER on every world, silently omitting the `salvage runs` and `stale
  // preferences` passes permanently — the OPPOSITE failure direction from omitting the kind
  // below, which is why both halves carry their own acceptance item.
  components: Object.freeze({
    layout: SETTING_KEYS.COMPONENT_STORAGE_LAYOUT,
    target: SETTING_KEYS.COMPONENT_STORAGE_TARGET,
  }),
});

/**
 * The entity kinds for which a GRANULAR definition repository exists in this build.
 *
 * This — not {@link DEFINITION_STORAGE_KEY_PAIRS} — is what decides whether a kind's basis
 * has to be established at all, for the reason given in this module's header. Recipes and
 * components are the kinds whose records CAN be read one document at a time; crafting
 * systems themselves still come back from a single whole-array read.
 *
 * Note "can", not "did". A world on `singleArray` builds the settings adapter for recipes,
 * and the recipe basis is still established in full — because a settings adapter can also
 * read an incomplete corpus (a completed conversion deletes the legacy document, so a
 * client that built the settings adapter afterwards reads nothing at all). Membership here
 * means the kind's storage can be in flux; it is not a claim about this boot's backend.
 *
 * Issue 1212 added `components`. WITHOUT it {@link isKindKnownComplete} answers `true` BY
 * CONSTRUCTION whenever the repository does not report itself granular, so a mid-conversion
 * world runs every destructive pass against a half-written component corpus — the OPPOSITE
 * failure direction from omitting the key pair above.
 *
 * @type {readonly string[]}
 */
export const GRANULAR_DEFINITION_REPOSITORY_KINDS = Object.freeze(['recipes', 'components']);

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
 * @param {Record<string, {granular: boolean, arrangement: string|null,
 *   layoutAtCorpusRead: string|null}>} [options.storage] Per kind, what the manager that
 *   owns that kind can attest about its own definition storage — see
 *   `RecipeManager#describeDefinitionStorage`. An absent entry is unknown, and unknown is
 *   not known-complete for any kind this build declares granular.
 * @returns {Record<string, object>} one entry per {@link VALID_ID_BASIS_ENTITY_KINDS} member.
 */
export function readValidIdBasisInputs({
  getSetting,
  getHighestRegisteredMigrationVersion,
  storage = {},
} = {}) {
  const migrationVersion = readSettingDefensively(getSetting, SETTING_KEYS.MIGRATION_VERSION);
  const highestMigrationVersion = readHighestMigrationVersion(getHighestRegisteredMigrationVersion);
  const inputs = {};
  for (const kind of VALID_ID_BASIS_ENTITY_KINDS) {
    const report = storage?.[kind] ?? null;
    const declaredGranular = GRANULAR_DEFINITION_REPOSITORY_KINDS.includes(kind);
    const repositoryGranular = report?.granular === true;
    if (!declaredGranular && !repositoryGranular) {
      inputs[kind] = Object.freeze({ declaredGranular, repositoryGranular });
      continue;
    }
    const pair = DEFINITION_STORAGE_KEY_PAIRS[kind] ?? null;
    inputs[kind] = Object.freeze({
      declaredGranular,
      repositoryGranular,
      pairRegistered: pair !== null,
      arrangement: report?.arrangement ?? null,
      layoutAtCorpusRead: report?.layoutAtCorpusRead ?? null,
      layout: pair ? readSettingDefensively(getSetting, pair.layout) : null,
      target: pair ? readSettingDefensively(getSetting, pair.target) : null,
      // Sampled once and stamped onto every granular kind rather than hoisted out of this
      // branch, and that placement is LOAD-BEARING, not an artefact. Migration currency is
      // deliberately not applied to a kind this build exempts by construction: `_runMigrations`
      // is primary-GM-only and `migrationVersion` is world-scoped defaulting to `'0.0.0'`, so
      // gating every kind on it would omit `salvage runs` on EVERY client for the whole window
      // between a GM upgrade and its migration pass — and permanently on any world whose GM has
      // not booted since. That is the same permanent silent omission the spec forbids by name
      // for the primacy input, bought for no hazard reduction: a non-granular corpus cannot be
      // partial whatever the migration version says. Hoisting these two fields out of this
      // branch would re-arm it silently.
      migrationVersion,
      highestMigrationVersion,
    });
  }
  return Object.freeze(inputs);
}

/**
 * Decide one kind's basis from its sampled inputs.
 *
 * Takes the KIND, not just the input, so the by-construction exemption is keyed on what
 * this build declares rather than on a flag carried in the sampled data. A declared-granular
 * kind whose input is missing or malformed then fails closed, where a data-keyed exemption
 * would answer `basisFromInputs({})` with "run every pass" — the exact inversion of this
 * module's stated fail direction, reachable by any caller that samples its own inputs or
 * catches a sampling error.
 *
 * @param {string} kind
 * @param {object} input
 * @returns {boolean}
 */
function isKindKnownComplete(kind, input) {
  const declaredGranular = GRANULAR_DEFINITION_REPOSITORY_KINDS.includes(kind);
  // Known-complete BY CONSTRUCTION, and only here: this build has no granular repository
  // for the kind AND the repository actually built agrees, so its corpus arrives as one
  // whole-array read and there is no partial state for the clauses below to detect.
  if (!declaredGranular && input?.repositoryGranular !== true) return true;
  // Declared granular with nothing sampled: fail closed.
  if (input == null || typeof input !== 'object') return false;
  // A granular repository with no registered layout/target pair cannot be established at
  // all, so it fails closed. This is the direction component extraction trips.
  if (input.pairRegistered !== true) return false;

  const {
    arrangement,
    layout,
    target,
    layoutAtCorpusRead,
    migrationVersion,
    highestMigrationVersion,
  } = input;
  // Every value must be positively recognised BEFORE any comparison, so that `undefined`,
  // `null`, `''` and a swallowed throw can never satisfy a `!==` test.
  if (!isRecognisedArrangement(arrangement)) return false;
  if (!isRecognisedArrangement(layout)) return false;
  if (!isRecognisedArrangement(target)) return false;
  if (!isRecognisedArrangement(layoutAtCorpusRead)) return false;

  // Clause 1 — the layout is not `unsettled`. DEFENCE IN DEPTH, not live coverage: clause 5
  // rejects an `unsettled` read-time layout, and clause 4 rejects any layout the arrangement
  // does not equal, while a production arrangement derives from the target and the spec
  // constrains a target to `singleArray`/`perRecord`. The only fixture that reaches this line
  // is deliberately out of domain. It is kept because it states the requirement the spec
  // states, and because the subsumption above is a property of clauses 4 and 5 that a future
  // relaxation of either would quietly remove.
  if (layout === DEFINITION_STORAGE_LAYOUTS.UNSETTLED) return false;
  // Clause 2 — the layout equals the target. Also DEFENCE IN DEPTH: clause 4 admits only
  // inputs where the arrangement equals both, which implies this. Kept for the same reason —
  // the spec states it as an independent input, and it is only redundant while clause 4 is
  // stated against BOTH values rather than against the layout alone.
  if (layout !== target) return false;
  // Clause 4 — the arrangement this client's repository was built for equals both.
  if (arrangement !== layout || arrangement !== target) return false;
  // Clause 5 — the layout observed ACROSS the corpus read is settled and still current. The
  // decisive one, and the only clause that can witness a conversion that overlapped the read:
  // the arrangement derives from the target, which does not move for the whole duration of a
  // conversion, so clauses 1-4 are all satisfied by a client holding a half-written corpus
  // once the conversion's tail has landed.
  if (layoutAtCorpusRead === DEFINITION_STORAGE_LAYOUTS.UNSETTLED) return false;
  if (layoutAtCorpusRead !== layout) return false;

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
    basis[kind] = isKindKnownComplete(kind, inputs?.[kind]);
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
