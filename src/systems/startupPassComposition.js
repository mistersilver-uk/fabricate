/**
 * The startup maintenance COMPOSITION SITE (issue 1224).
 *
 * `Fabricate#initialize` used to hold this as an inline array literal, which made the
 * Valid Id Basis gate untestable in principle: `src/main.js` imports the global stylesheet
 * and Svelte UI roots at module load, so it cannot be imported under `node --test` at all.
 * Extracting the composition to this module is what gives the gate a seam — the spec
 * requires the pass list to be "constructed by a pure, exported builder that the
 * composition site calls, so the omission is directly assertable", and an assertion needs
 * something importable to assert against.
 *
 * ## Why the id sets and the basis facts are read HERE, together
 *
 * The valid-id sets and the basis facts are sampled in the same statement group, on
 * purpose. The storage conversion this gate protects against runs from inside
 * `recipeManager.initialize()`, so a basis fact captured earlier in startup — beside
 * `registerSettings()` or `_runMigrations()`, the natural tidy — records the
 * PRE-conversion value, and a conversion that then crashed mid-flight yields a partial
 * corpus here with a "settled" fact in hand. Reading both in one place means the facts
 * cannot be older than the corpus they describe.
 *
 * `src/main.js` therefore passes `getSetting` itself, never a pre-read value, and calls
 * this after both managers' `initialize()`. Both halves of that are pinned by
 * `tests/startup-valid-id-basis.test.js`.
 *
 * ## Why it warns
 *
 * `runStartupMaintenance` returns only FAILED labels and the caller discards the return, so
 * a gate that omitted every pass is otherwise indistinguishable from a clean boot — and
 * `tests/startup-cleanup-scoping.test.js` would sit green forever reading as a positive
 * health signal. The warning names the omitted labels and the deciding inputs so a GM
 * whose world is mid-conversion can see why the housekeeping did not run. It does not fail
 * the boot: a partial corpus must never become a boot failure.
 */

import { cleanupStalePreferences } from '../config/preferencesCleanup.js';
import { getHighestRegisteredMigrationVersion } from '../migration/MigrationRunner.js';

import { buildStartupPassList } from './startupMaintenance.js';
import { basisFromInputs, readValidIdBasisInputs } from './validIdBasis.js';

/**
 * Compose the startup housekeeping pass list for this boot.
 *
 * Reads no globals: every collaborator, both setting accessors and the reporter are
 * parameters, so the whole composition — including which passes the Valid Id Basis omits —
 * is drivable from a fixture.
 *
 * @param {object} options
 * @param {object} options.recipeManager Supplies the recipe corpus, the per-id lookup the
 *   phantom-run prune walks, and the arrangement its repository was BUILT for.
 * @param {object} options.craftingSystemManager Supplies the crafting systems and, inside
 *   them, the salvage components.
 * @param {object} options.craftingRunManager
 * @param {object} options.salvageRunManager
 * @param {object} options.recipeVisibilityService
 * @param {(key: string) => *} options.getSetting
 * @param {(key: string, value: *) => Promise<*>} options.setSetting
 * @param {(actorId: string) => object|null} options.resolveGatheringActor
 * @param {(actor: object) => boolean} options.isSelectableGatheringActor
 * @param {(message: string, detail: object) => void} [options.warn] Omission reporter.
 * @returns {Array<[string, () => Promise<unknown>]>} labelled thunks for
 *   `runStartupMaintenance`, with every basis-incomplete pass omitted.
 */
export function composeStartupPassList({
  recipeManager,
  craftingSystemManager,
  craftingRunManager,
  salvageRunManager,
  recipeVisibilityService,
  getSetting,
  setSetting,
  resolveGatheringActor,
  isSelectableGatheringActor,
  warn = console.warn,
} = {}) {
  const validRecipes = new Set(recipeManager.getRecipes({}).map((r) => r.id));
  const validSystems = new Set(craftingSystemManager.getSystems().map((s) => s.id));
  const validSalvageComponentsBySystem = new Map(
    craftingSystemManager
      .getSystems()
      .map((system) => [
        system.id,
        new Set((system.components || []).map((component) => component.id)),
      ])
  );
  // Flatten the per-system salvage component sets the run cleanup already computed: the
  // progressive-order map's `salvage:<componentId>` keys are not system-scoped, so the
  // prune needs one flat id set.
  const validComponentIds = new Set(
    [...validSalvageComponentsBySystem.values()].flatMap((ids) => [...ids])
  );
  // Sampled HERE, in the same statement group as the id sets above and after both
  // managers' `initialize()` — see this module's header for why the position is
  // load-bearing rather than stylistic.
  const basisInputs = readValidIdBasisInputs({
    getSetting,
    getHighestRegisteredMigrationVersion,
    arrangements: {
      recipes: recipeManager.getDefinitionStorageArrangement?.() ?? null,
    },
  });
  const basis = basisFromInputs(basisInputs);

  const candidates = [
    ['crafting runs', () => craftingRunManager.cleanupInvalidRuns(validRecipes, validSystems)],
    // Prune legacy phantom crafting runs: a single-step recipe with no time requirement
    // can never legitimately persist an active run, so any such run left in the active
    // store predates the craft() cleanup guard and is stranded.
    [
      'phantom crafting runs',
      () => craftingRunManager.pruneInstantaneousActiveRuns((id) => recipeManager.getRecipe(id)),
    ],
    [
      'salvage runs',
      () => salvageRunManager.cleanupInvalidRuns(validSystems, validSalvageComponentsBySystem),
    ],
    ['learned recipes', () => recipeVisibilityService.cleanupLearnedRecipes(validRecipes)],
    [
      'stale preferences',
      () =>
        cleanupStalePreferences(validSystems, validRecipes, getSetting, setSetting, {
          resolveGatheringActor,
          isSelectableGatheringActor,
          validComponentIds,
        }),
    ],
  ];

  const omissions = [];
  const passes = buildStartupPassList({
    candidates,
    basis,
    onOmit: (omission) => {
      omissions.push(omission);
    },
  });

  if (omissions.length > 0) {
    warn(
      'Fabricate | Startup cleanup skipped: the ids it would prune against are not known to be complete. ' +
        'No data was removed. Omitted: ' +
        omissions.map((omission) => omission.label).join(', '),
      { omitted: omissions, basis, basisInputs }
    );
  }
  return passes;
}
