/**
 * The entity kinds each startup pass derives its "still valid" answer from (issue 1224).
 *
 * Exported so the declaration can be asserted against the emitted pass list rather than
 * inspected: {@link buildStartupPassList} omits a pass that is NOT declared here, and that
 * rule is only testable while the declaration is a value a test can read and extend.
 *
 * Every pass is declared, including the one that is not hazard-bearing:
 * `pruneInstantaneousActiveRuns` treats an absent recipe as KEEP, the inverse of the
 * inference this gate exists to stop. It is gated for uniformity, and pinning that choice
 * here makes it deliberate rather than accidental.
 *
 * `stale preferences` is declared on the UNION and must not be decomposed. It rewrites one
 * progressive-order map keyed by both `recipe:<id>` and `salvage:<componentId>` as a
 * whole-map replacement, so gating it on the recipe basis alone would wipe every `salvage:`
 * key whenever the component basis is incomplete.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const STARTUP_PASS_ENTITY_KINDS = Object.freeze({
  'crafting runs': Object.freeze(['recipes', 'systems']),
  'phantom crafting runs': Object.freeze(['recipes']),
  'salvage runs': Object.freeze(['systems', 'components']),
  'learned recipes': Object.freeze(['recipes']),
  'stale preferences': Object.freeze(['recipes', 'systems', 'components']),
});

/**
 * Build the startup pass list, omitting any pass whose Valid Id Basis is not
 * known-complete (issue 1224, `data-models/spec.md` § Valid Id Basis).
 *
 * **Pure.** It reads no globals and performs no work: the candidates arrive as labelled
 * thunks and leave as a subset of the same thunks, unwrapped and uninvoked. That is what
 * makes the omission directly assertable as a `deepEqual` on the emitted labels — the
 * requirement the spec states, and the reason the gate is applied by OMISSION rather than
 * by throwing. `runStartupMaintenance` below catches every throw into a failure label, so a
 * guard that throws from inside a pass arrives after the destructive work has landed.
 *
 * **Shared with the mutation-time door.** `mutationCleanupComposition.js` (issue 1226)
 * calls this same builder with its own `declarations` table, so the startup gate and the
 * gate on recipe/system deletion cannot drift into two gates with different rules. The
 * name is historical; nothing in the body is startup-specific.
 *
 * **An undeclared pass is omitted**, so a future destructive pass cannot ship ungated by
 * forgetting to declare a basis for it. A pass whose declared kind is missing from `basis`
 * is omitted for the same reason: `basis[kind] === true` is required positively, because
 * `basis[kind] !== false` would ship the pass on a renamed key or a threading typo.
 *
 * @param {object} options
 * @param {Array<[string, () => Promise<unknown>]>} options.candidates Every pass this boot
 *   would run if nothing were gated, in run order.
 * @param {Record<string, boolean>} options.basis Per entity kind, whether that kind's id
 *   basis is known-complete. See `validIdBasis.js`.
 * @param {Readonly<Record<string, readonly string[]>>} [options.declarations] The pass ->
 *   entity-kinds map. A parameter so a test can inject an undeclared sixth pass.
 * @param {(omission: {label: string, incompleteKinds: string[]}) => void} [options.onOmit]
 *   Notified once per omitted pass, with the kinds that decided it. The composition site
 *   uses it to warn; the builder itself reports nothing.
 * @returns {Array<[string, () => Promise<unknown>]>} the passes that may run, in order.
 */
export function buildStartupPassList({
  candidates,
  basis,
  declarations = STARTUP_PASS_ENTITY_KINDS,
  onOmit = () => {},
} = {}) {
  const emitted = [];
  for (const candidate of candidates || []) {
    const [label] = candidate || [];
    const declaredKinds = declarations?.[label];
    if (!Array.isArray(declaredKinds)) {
      // Undeclared: fail closed and say so, rather than run a pass nothing vouched for.
      onOmit({ label, incompleteKinds: [], undeclared: true });
      continue;
    }
    const incompleteKinds = declaredKinds.filter((kind) => basis?.[kind] !== true);
    if (incompleteKinds.length > 0) {
      onOmit({ label, incompleteKinds, undeclared: false });
      continue;
    }
    emitted.push(candidate);
  }
  return emitted;
}

/**
 * Run the startup housekeeping passes, isolating each one's failure (issue 970).
 *
 * These passes exist to tidy state that names deleted content — runs whose recipe
 * or system is gone, learned entries for a deleted recipe, stale preferences. None
 * of them is a precondition for Fabricate working, but all of them WRITE, so any
 * can reject.
 *
 * Before this guard a single rejection propagated out of `Fabricate#initialize`,
 * `ready` was never set, and every facade method then threw through
 * `_requireReady()` for the rest of the session — while the ready hook's remaining
 * steps (world-time processing and the flag auto-stamps) were skipped too. One
 * stale entry Foundry declined to clean took the whole module down for that client.
 *
 * A failure is reported and the remaining passes still run: they are independent,
 * and a world that cannot clean its salvage runs can still clean its learned
 * recipes.
 *
 * @param {Array<[string, () => Promise<unknown>]>} passes Labelled thunks, run in order.
 * @param {object} [options]
 * @param {(message: string, error: unknown) => void} [options.log] Failure reporter.
 * @returns {Promise<string[]>} The labels of the passes that failed, in order.
 */
export async function runStartupMaintenance(passes, { log = console.error } = {}) {
  const failed = [];
  for (const [label, run] of passes || []) {
    try {
      await run();
    } catch (error) {
      failed.push(label);
      log(`Fabricate | Startup cleanup failed for ${label}; continuing.`, error);
    }
  }
  return failed;
}
