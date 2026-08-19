/**
 * The startup maintenance COMPOSITION SITE (issue 1224).
 *
 * `Fabricate#initialize` used to hold this as an inline array literal, which made the pass
 * list untestable in principle: `src/main.js` imports the global stylesheet and Svelte UI
 * roots at module load, so it cannot be imported under `node --test` at all. Extracting the
 * composition to this module is what gives the gate a seam — the spec requires the pass list
 * to be "constructed by a pure, exported builder that the composition site calls, so the
 * omission is directly assertable", and an assertion needs something importable to assert
 * against.
 *
 * ## Why the id sets are read HERE
 *
 * The valid-id sets are derived from the live managers, after both have completed
 * `initialize()`, so every pass prunes against the corpus this boot actually loaded rather
 * than one sampled earlier. Each class's corpus arrives as one whole-array read that either
 * returns the corpus or throws, so a set derived here is complete or the boot failed
 * (issue 1261) — which is what {@link WHOLE_CORPUS_ID_BASIS} declares to the builder.
 *
 * ## Why it warns
 *
 * `runStartupMaintenance` returns only FAILED labels and the caller discards the return, so
 * a gate that omitted every pass is otherwise indistinguishable from a clean boot — and
 * `tests/startup-cleanup-scoping.test.js` would sit green forever reading as a positive
 * health signal. The warning names the omitted labels and the deciding kinds so an omission
 * is visible rather than silent. It does not fail the boot.
 */

import { cleanupStalePreferences } from '../config/preferencesCleanup.js';

import { buildStartupPassList, WHOLE_CORPUS_ID_BASIS } from './startupMaintenance.js';

/**
 * Compose the startup housekeeping pass list for this boot.
 *
 * Reads no globals: every collaborator, both setting accessors and the reporter are
 * parameters, so the whole composition — including which passes the builder omits — is
 * drivable from a fixture.
 *
 * @param {object} options
 * @param {object} options.recipeManager Supplies the recipe corpus and the per-id lookup the
 *   phantom-run prune walks.
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
 *   `runStartupMaintenance`, with every undeclared or basis-incomplete pass omitted.
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
    basis: WHOLE_CORPUS_ID_BASIS,
    onOmit: (omission) => {
      omissions.push(omission);
    },
  });

  if (omissions.length > 0) {
    warn(
      'Fabricate | Startup cleanup skipped: the ids it would prune against are not known to be complete. ' +
        'No data was removed. Omitted: ' +
        omissions.map((omission) => omission.label).join(', '),
      { omitted: omissions, basis: WHOLE_CORPUS_ID_BASIS }
    );
  }
  return passes;
}
