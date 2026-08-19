/**
 * The MUTATION-TIME maintenance composition site (issue 1226).
 *
 * `startupPassComposition.js` composes the boot-time housekeeping. This module is the same
 * gate on the other door: the flag cleanup a GM triggers by deleting a recipe, deleting a
 * set of recipes, deleting a crafting system, re-importing a pack, or switching a system's
 * resolution mode.
 *
 * Those paths recompute the SAME valid-id sets from the live managers and call the SAME
 * destructive collaborators — `cleanupInvalidRuns`, `cleanupLearnedRecipes`,
 * `cleanupStalePreferences` — so a partial corpus destroys the same durable actor state,
 * and the trigger is more ordinary than a boot. `data-models/spec.md` § Valid Id Basis
 * used to scope its requirement to a "startup cleanup pass" and record this as a
 * deliberately-excluded door; the requirement now covers every corpus-derived destructive
 * prune, and this is the mutation-time half of it.
 *
 * ## Two kinds of prune, and only one of them needs a basis
 *
 * A **corpus-derived** prune asks "is this id still in the live corpus?" and removes
 * everything that is not. It infers a deletion from an ABSENCE, so a corpus that is only
 * part of the corpus makes it delete state that was never stale. That is the prune this
 * gate governs.
 *
 * A **subject-targeted** prune asks "does this name one of the ids the caller just
 * removed?". The ids are positively known — the GM deleted them a moment ago — and no
 * amount of missing corpus can make a just-deleted id valid again, so it is safe on any
 * corpus and is NOT gated. `CraftingRunManager#removeRunsForSystem` and
 * `#removeRunsForRecipes`, and `RecipeVisibilityService#forgetDeletedRecipes`, are of this
 * kind.
 *
 * The distinction is what stops the gate from trading a data-loss bug for a flag leak.
 * Refusing the corpus-derived sweep while the corpus is unattestable would otherwise leave
 * the very flags the mutation orphaned — the reason this cleanup path exists at all — so a
 * gated pass names a targeted fallback and the fallback runs in the sweep's place. What is
 * given up on a partial corpus is only the hunt for orphans of UNKNOWN origin, which is
 * exactly what the startup pass reconciles on the next known-complete boot.
 *
 * ## Reusing the startup builder rather than restating it
 *
 * The partition is {@link import('./startupMaintenance.js').buildStartupPassList} — the
 * same pure builder, with a mutation-time declaration table — so the two doors cannot
 * drift into two gates with different rules. It carries its fail-closed properties with
 * it: an UNDECLARED pass is omitted, and a declared kind missing from the basis is
 * required to be positively `true` rather than merely not `false`.
 */

import { buildStartupPassList, WHOLE_CORPUS_ID_BASIS } from './startupMaintenance.js';

/**
 * The entity kinds each mutation-time sweep derives its "still valid" answer from.
 *
 * Mirrors {@link import('./startupMaintenance.js').STARTUP_PASS_ENTITY_KINDS} pass for
 * pass, because the collaborators are the same collaborators; the labels differ only so an
 * omission warning says which door it came from.
 *
 * `orphaned crafting preferences` is declared on the UNION and must not be decomposed, for
 * the reason the startup table gives: it rewrites one progressive-order map keyed by both
 * `recipe:<id>` and `salvage:<componentId>` as a whole-map replacement, so gating it on the
 * recipe basis alone would wipe every `salvage:` key whenever the component basis is
 * incomplete.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const MUTATION_CLEANUP_ENTITY_KINDS = Object.freeze({
  'orphaned crafting runs': Object.freeze(['recipes', 'systems']),
  'orphaned learned recipes': Object.freeze(['recipes']),
  'orphaned crafting preferences': Object.freeze(['recipes', 'systems', 'components']),
});

/**
 * @typedef {object} MutationCleanupPass
 * @property {string} label Must appear in {@link MUTATION_CLEANUP_ENTITY_KINDS}; an
 *   undeclared label is omitted rather than run.
 * @property {() => Promise<unknown>} sweep The corpus-derived prune, run only on a
 *   known-complete basis.
 * @property {(() => Promise<unknown>)|null} [targeted] The subject-targeted prune run in
 *   the sweep's place when the basis is incomplete. `null` when the mutation removed
 *   nothing to target (an import, or the public orphan sweep called with no id set), in
 *   which case an omission removes nothing and leaks nothing.
 */

/**
 * Run one mutation's flag cleanup through the shared pass builder.
 *
 * Reads no globals: the reporter is a parameter, so the whole decision — including which
 * sweeps were omitted — is drivable from a fixture.
 *
 * @param {object} options
 * @param {MutationCleanupPass[]} options.passes
 * @param {(message: string, detail: object) => void} [options.warn] Omission reporter. An
 *   omission MUST be reported — the callers discard the return value, so an omitted sweep
 *   is otherwise indistinguishable from one that found nothing to prune.
 * @param {string} [options.subject] What the GM did, named in the warning.
 * @returns {Promise<{swept: string[], targeted: string[], omitted: string[],
 *   basis: Record<string, boolean>}>} what actually ran, so the decision is assertable at
 *   the call site rather than only observable through the collaborators.
 */
export async function runGatedMutationCleanup({
  passes = [],
  warn = console.warn,
  subject = 'a content change',
} = {}) {
  const omissions = [];
  const permitted = buildStartupPassList({
    candidates: passes.map((pass) => [pass.label, pass]),
    basis: WHOLE_CORPUS_ID_BASIS,
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
      `Fabricate | Orphaned-flag cleanup after ${subject} skipped a sweep: the ids it would prune against are not known to be complete. ` +
        'Nothing beyond what was just removed was deleted, and the next boot on a complete corpus reconciles the rest. ' +
        `Skipped: ${omitted.join(', ')}`,
      {
        omitted: omissions,
        targetedFallbacks: fallbacks.map((pass) => pass.label),
        basis: WHOLE_CORPUS_ID_BASIS,
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

  return { swept, targeted, omitted, basis: WHOLE_CORPUS_ID_BASIS };
}
