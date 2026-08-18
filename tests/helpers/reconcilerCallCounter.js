/**
 * The reconciler-wide call counter and the ABANDONMENT seam (issue 1211).
 *
 * ## It is reconciler-wide, not boot-wide, and the difference is not a preference
 *
 * No seam can count `_runMigrations`'s writes together with the conversion's, because
 * `src/main.js` imports the global stylesheet and the Svelte UI roots at module load and
 * therefore cannot be imported under `node --test`. So the counted set is stated rather than
 * implied: every `setSetting` the reconciler issues, every bulk `Setting` document call
 * (`createDocuments` / `updateDocuments` / `deleteDocuments`), and every single-document
 * `Document#delete()` the conversion's step 4 or its compensation performs.
 *
 * **Its PLACEMENT is what decides the verdict**, which is why the suites pin the exact total
 * for a clean run over a fixture of MORE THAN ONE record and assert that the total is
 * INVARIANT across corpus sizes. A counter moved inside the conversion's record loop makes
 * W1, W5 and W6 inexpressible — none of them is inside any loop — and the suite silently
 * shrinks; the invariance assertion is what catches it, because an in-loop counter scales
 * with the corpus and a reconciler-wide one does not. That invariance is also #1070's own
 * "at most three document calls whatever the corpus size" claim made observable.
 *
 * ## Interruption is modelled by ABANDONING the in-flight call, never by throwing
 *
 * `reconcileRecipeStorageLayout` catches every throw, so a throwing seam exercises the
 * COMPENSATION path instead of an interruption: it never leaves the layout `unsettled`, which
 * erases the two windows that depend on it before the harness can observe them, and on the
 * shared catch it reverts the target, which removes the later windows' precondition. All six
 * windows then pass having tested nothing. Proven, not assumed:
 *
 * ```text
 * abandon call 2 -> layout=unsettled  target=perRecord   (the window)
 * throw at call 2 -> layout=singleArray target=singleArray (the compensation path)
 * ```
 *
 * So the seam returns a **never-settling promise**, and the harness MUST NOT `await` the
 * reconciler it abandoned: awaiting hangs the test, and `node --test` reports a hang as
 * `# cancelled` rather than `# fail`, which this repository's gate treats as a failure of
 * unclear origin. {@link instrumentReconcilerCalls} therefore exposes `reachedAbandonment`,
 * a promise that settles when the abandoned call BEGINS, so a harness can fire the reconciler
 * and forget it, wait for the world to reach the window, and assert on world state.
 */

/**
 * Wrap a set of reconciler seams so every call it issues is counted, and optionally abandon
 * the n-th one.
 *
 * @param {object} seams the seams `reconcileRecipeStorageLayout` takes.
 * @param {object} [options]
 * @param {number} [options.abandonAt] 1-based ordinal of the call to abandon. The call is
 *   never issued to the underlying implementation and its promise never settles, which is
 *   what a lost socket looks like to the caller.
 * @returns {{seams: object, calls: string[], reachedAbandonment: Promise<void>}}
 */
export function instrumentReconcilerCalls(seams, { abandonAt = Number.POSITIVE_INFINITY } = {}) {
  const calls = [];
  let announceReached = () => {};
  const reachedAbandonment = new Promise((resolve) => {
    announceReached = resolve;
  });

  /**
   * @param {string} name
   * @returns {Promise<never>|null} a never-settling promise when this call is abandoned.
   */
  const gate = (name) => {
    calls.push(name);
    if (calls.length !== abandonAt) return null;
    announceReached();
    // Deliberately NOT a throw. See this module's header.
    return new Promise(() => {});
  };

  const wrap =
    (describe, real) =>
    (...args) => {
      const abandoned = gate(describe(...args));
      return abandoned ?? real(...args);
    };

  const realDocumentClass = seams.documentClass();
  const documentClass = {
    createDocuments: wrap(
      (data) => `createDocuments:${data.length}`,
      (data, options) => realDocumentClass.createDocuments(data, options)
    ),
    updateDocuments: wrap(
      (data) => `updateDocuments:${data.length}`,
      (data) => realDocumentClass.updateDocuments(data)
    ),
    deleteDocuments: wrap(
      (ids) => `deleteDocuments:${ids.length}`,
      (ids) => realDocumentClass.deleteDocuments(ids)
    ),
  };

  return {
    calls,
    reachedAbandonment,
    seams: {
      ...seams,
      setSetting: wrap(
        (key) => `setSetting:${key}`,
        (key, value) => seams.setSetting(key, value)
      ),
      documentClass: () => documentClass,
      settingDocuments: {
        // `exists` is a READ and is deliberately uncounted: the counted set is writes.
        exists: (key) => seams.settingDocuments.exists(key),
        delete: wrap(
          (key) => `documentDelete:${key}`,
          (key) => seams.settingDocuments.delete(key)
        ),
      },
    },
  };
}
