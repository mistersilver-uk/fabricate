/**
 * The entity kinds each startup pass derives its "still valid" answer from (issue 1224), exported
 * so a test can read and extend it. Every pass is declared, even the keep-biased phantom-run prune.
 * `stale preferences` is declared on the UNION (DOMAIN.md "Valid Id Basis").
 * `componentIdentityRemap` asks about CURRENCY (issue 1363): the `1.30.0` migration moves component
 * ids and the actor-side repair runs later in the same `ready` tick on the active GM alone, so the
 * two passes pruning against component ids declare it.
 */
export const STARTUP_PASS_ENTITY_KINDS = Object.freeze({
  'crafting runs': Object.freeze(['recipes', 'systems']),
  'phantom crafting runs': Object.freeze(['recipes']),
  'salvage runs': Object.freeze(['systems', 'components', 'componentIdentityRemap']),
  'learned recipes': Object.freeze(['recipes']),
  'stale preferences': Object.freeze([
    'recipes',
    'systems',
    'components',
    'componentIdentityRemap',
  ]),
});

/**
 * Every kind complete, since each class's corpus arrives as one read that returns all of it or
 * throws (issue 1261). The builder still requires each kind positively, so a typo omits the pass.
 */
export const WHOLE_CORPUS_ID_BASIS = Object.freeze({
  recipes: true,
  systems: true,
  components: true,
});

/**
 * The candidates whose id basis is known-complete, in order (issue 1224, `data-models/spec.md`
 * § Valid Id Basis). Pure, and it omits rather than throws, since `runStartupMaintenance` catches a
 * throw only after the destructive work landed. An undeclared pass, or a declared kind not
 * `=== true` in `basis`, is omitted and reported to `onOmit`. `mutationCleanupComposition.js`
 * (issue 1226) calls it with its own `declarations`, so the two doors cannot drift.
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
 * Run the passes in order, isolating each failure (issue 970): every pass writes and may reject,
 * and one escaping the boot would leave the facade unready all session. Answers the failed labels.
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
