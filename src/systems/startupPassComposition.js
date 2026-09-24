/**
 * The startup maintenance composition site (issue 1224), a module of its own because the boot
 * cannot load under `node --test` and the spec requires the pass list from "a pure, exported
 * builder that the composition site calls, so the omission is directly assertable".
 *
 * The valid-id sets are read from the live managers after both finished `initialize()`, as
 * whole-array reads that return the corpus or throw, so a set derived here is complete or the boot
 * failed (issue 1261): what `WHOLE_CORPUS_ID_BASIS` declares. `componentIdentityRemap` is computed
 * here per boot and spread over that shared constant, which the mutation-time cleanup also reads
 * and which has no `1.30.0` re-key window; `worldScopeRekeyPending.js` says why that currency
 * question fails closed. An omission warns, naming the labels and the deciding kinds, because
 * `runStartupMaintenance` returns only failures and a gate that omitted every pass would otherwise
 * look like a clean boot. It never fails the boot.
 */

import { cleanupStalePreferences } from '../config/preferencesCleanup.js';

import { buildStartupPassList, WHOLE_CORPUS_ID_BASIS } from './startupMaintenance.js';
import { hasPendingWorldScopeRekey } from './worldScopeRekeyPending.js';

/**
 * This boot's labelled passes for `runStartupMaintenance`, every undeclared or basis-incomplete
 * one omitted. It reads no globals: the collaborators, both setting accessors and the `warn`
 * omission reporter are parameters, so the whole composition is drivable from a fixture.
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
  // One flat id set, because the progressive-order map's `salvage:<componentId>` keys are not
  // system-scoped.
  const validComponentIds = new Set(
    [...validSalvageComponentsBySystem.values()].flatMap((ids) => [...ids])
  );

  const candidates = [
    ['crafting runs', () => craftingRunManager.cleanupInvalidRuns(validRecipes, validSystems)],
    // A single-step recipe with no time requirement never legitimately persists an active run, so
    // such a run predates the craft() cleanup guard and is stranded.
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

  const basis = {
    ...WHOLE_CORPUS_ID_BASIS,
    // FALSE while the `1.30.0` re-key map is still pending: the ids are complete but they have
    // just MOVED, and the pass that repairs every actor-side reference to them has not run.
    componentIdentityRemap: !hasPendingWorldScopeRekey(getSetting),
  };
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
      'Fabricate | Startup cleanup skipped: the ids it would prune against are not known to be complete, ' +
        'or have just been re-keyed by a migration whose identity repair has not run yet. ' +
        'No data was removed. Omitted: ' +
        omissions.map((omission) => omission.label).join(', '),
      { omitted: omissions, basis }
    );
  }
  return passes;
}
