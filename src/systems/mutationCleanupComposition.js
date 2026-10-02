/**
 * The mutation-time maintenance composition site (issue 1226): the gate `startupPassComposition.js`
 * applies at boot, on the flag cleanup a GM triggers by deleting a recipe, a set of recipes or a
 * crafting system, re-importing a pack, or switching a system's resolution mode. Those paths call
 * the same destructive collaborators (`cleanupInvalidRuns`, `cleanupLearnedRecipes`,
 * `cleanupStalePreferences`) on the same valid-id sets, so the same rule holds (DOMAIN.md "Valid Id
 * Basis"): a corpus-derived sweep runs only on a known-complete basis, and a gated pass runs its
 * subject-targeted fallback instead (`CraftingRunManager#removeRunsForSystem`,
 * `RecipeVisibilityService#forgetDeletedRecipes` and the like), so refusing the sweep never leaks
 * the flags the mutation orphaned. Only the hunt for orphans of unknown origin waits for the next
 * known-complete boot. The partition is `buildStartupPassList`, fail-closed properties included.
 */

import { buildStartupPassList, WHOLE_CORPUS_ID_BASIS } from './startupMaintenance.js';

/**
 * The mutation-time mirror of `STARTUP_PASS_ENTITY_KINDS`, pass for pass, labelled so an omission
 * warning names its door. `orphaned crafting preferences` is declared on the UNION for the reason
 * the startup table gives.
 */
export const MUTATION_CLEANUP_ENTITY_KINDS = Object.freeze({
  'orphaned crafting runs': Object.freeze(['recipes', 'systems']),
  'orphaned learned recipes': Object.freeze(['recipes']),
  'orphaned crafting preferences': Object.freeze([
    'recipes',
    'systems',
    'components',
    'componentIdentityRemap',
  ]),
});

/**
 * Run one mutation's flag cleanup through the shared builder. A pass is `{ label, sweep,
 * targeted }`, and `targeted` runs in the sweep's place on an incomplete basis, or is `null` when
 * the mutation removed nothing to target (an import, or an id-less orphan sweep). An omission is
 * always warned, since callers discard the answer. The default basis answers completeness only, so
 * a pass declaring `componentIdentityRemap` (issue 1363) is omitted unless the caller answers it.
 */
export async function runGatedMutationCleanup({
  passes = [],
  warn = console.warn,
  subject = 'a content change',
  basis = WHOLE_CORPUS_ID_BASIS,
} = {}) {
  const omissions = [];
  const permitted = buildStartupPassList({
    candidates: passes.map((pass) => [pass.label, pass]),
    basis,
    declarations: MUTATION_CLEANUP_ENTITY_KINDS,
    onOmit: (omission) => {
      omissions.push(omission);
    },
  });

  const omitted = omissions.map((omission) => omission.label);
  const fallbacks = omissions
    .map((omission) => passes.find((pass) => pass.label === omission.label))
    .filter((pass) => typeof pass?.targeted === 'function');

  // Reported BEFORE anything runs, so a sweep that then rejects cannot swallow the
  // omission notice with it.
  if (omitted.length > 0) {
    warn(
      `Fabricate | Orphaned-flag cleanup after ${subject} skipped a sweep: the ids it would prune against are not known to be complete, or have just been re-keyed by a migration whose identity repair has not run yet. ` +
        'Nothing beyond what was just removed was deleted, and the next boot on a complete corpus reconciles the rest. ' +
        `Skipped: ${omitted.join(', ')}`,
      {
        omitted: omissions,
        targetedFallbacks: fallbacks.map((pass) => pass.label),
        basis,
      }
    );
  }

  const swept = [];
  for (const [label, pass] of permitted) {
    await pass.sweep();
    swept.push(label);
  }

  const targeted = [];
  for (const pass of fallbacks) {
    await pass.targeted();
    targeted.push(pass.label);
  }

  return { swept, targeted, omitted, basis };
}
