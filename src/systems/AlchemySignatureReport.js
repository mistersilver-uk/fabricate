/**
 * @module AlchemySignatureReport
 *
 * The compiled, revision-scoped alchemy signature report (issue 1074, under #1070).
 *
 * ## The cost this removes
 *
 * `SignatureValidator.validateSystem` compares every pair of enabled ingredient-set
 * signatures in a system, so one audit is O(sets²). The GM recipe browser used to trigger
 * a WHOLE audit per row — `buildRecipeList` → `canActivateRecipe` →
 * `_validateRecipeForActivation` → `_validateSignatures` → `validateRecipe` →
 * `validateSystem` — which makes preparing N rows O(N³), plus one full recipe-corpus copy
 * per row for the adapter that fed it. Measured on this checkout at the `alchemy-signatures`
 * profile: 25 rows cost 23 ms and 7,500 comparisons; 200 rows cost 10.4 s and 3.98 MILLION
 * comparisons, with 40,400 recipe objects copied. The 2,000-row case is hours.
 *
 * This module compiles the audit ONCE per revision and answers each subsequent row from the
 * compiled snapshot, with an inverted component index so a candidate is compared only
 * against entries that could possibly collide with it.
 *
 * ## Why an inverted component index is a SOUND filter, not a heuristic
 *
 * `signaturesOverlap(A, B)` is `someTransversalSatisfies(A.groupOptions, B.signature) &&
 * someTransversalSatisfies(B.groupOptions, A.signature)`. The second conjunct can only be
 * true if EVERY group of `A.signature` contains at least one component id that some option
 * of `B` expands to — `someTransversalSatisfies` reaches its full mask only by setting every
 * bit, and a group whose bit no supplied component can set makes the mask unreachable.
 *
 * So for any group `G` of the candidate: a colliding entry MUST contain at least one id
 * drawn from `G`. Taking the candidate's SMALLEST group as `G` yields the tightest such
 * filter, and every entry it excludes is one `signaturesOverlap` would have rejected anyway.
 * The pruning therefore cannot change an answer — only the number of comparisons made to
 * reach it. `validateSystem` is deliberately left as the unpruned oracle so the two can be
 * differentially tested against each other.
 *
 * ## Conflict ORDER is part of the contract
 *
 * `RecipeManager._validateSignatures` maps conflicts straight onto `errors[]` and
 * `issues[]`, so the order a full audit would have produced is observable. A full audit
 * flattens (enabled recipe, ingredient set) into one array in cohort order and walks
 * `i < j`, so the order key is `(cohortIndex, setIndex)` — the index in the UNFILTERED
 * cohort, not in the enabled-filtered list. That distinction is load-bearing: the enable
 * gate substitutes a currently-disabled candidate into the scan, which shifts every
 * enabled-filtered position after it while leaving relative cohort order untouched.
 */

/**
 * A compiled snapshot of one alchemy system's enabled ingredient signatures.
 *
 * Immutable by contract: `RecipeManager` throws the whole object away when its revision
 * guard fails rather than patching it, because a report that can be edited in place is a
 * report whose staleness has nowhere to be detected.
 */
export class AlchemySignatureReport {
  /**
   * @param {object} deps
   * @param {string} deps.systemId
   * @param {import('./SignatureValidator.js').SignatureValidator} deps.validator The
   *   overlap authority. Injected rather than imported so this module stays a leaf and the
   *   guard and the report can never disagree about what "overlapping" means.
   * @param {object[]} deps.components The system's managed component library.
   * @param {object[]} deps.entries Compiled `(recipe, ingredient set)` entries for every
   *   ENABLED recipe, in audit order, each carrying `cohortIndex` and `setIndex`.
   * @param {Map<*, number>} deps.cohortIndexByRecipeId Every recipe of the system —
   *   enabled or not — mapped to its position in the unfiltered cohort.
   * @param {object[]} deps.conflicts The full audit's conflicts, in audit order.
   */
  constructor({ systemId, validator, components, entries, cohortIndexByRecipeId, conflicts }) {
    this.systemId = systemId;
    this.components = components;
    this.entries = entries;
    this.cohortIndexByRecipeId = cohortIndexByRecipeId;
    this.conflicts = conflicts;
    /**
     * Every recipe id that participates in at least one conflict among the CURRENTLY
     * enabled set. The reconciliation pass (`disableSignatureConflicts`) reads this;
     * a browser row does NOT, because a disabled row's question is "would enabling it
     * collide?", which this set cannot answer (it is absent from the audit entirely).
     * @type {Set<*>}
     */
    this.blockedRecipeIds = new Set();
    /**
     * The audit's conflicts, per participating recipe id, each list in audit order. This is
     * exactly what `validateRecipe` derived by filtering the whole conflict list, and it is
     * the answer for a candidate that compiles to the entries already in this report.
     * @type {Map<*, object[]>}
     */
    this.conflictsByRecipeId = new Map();
    for (const conflict of conflicts) {
      this.blockedRecipeIds.add(conflict.recipeA.id);
      this.blockedRecipeIds.add(conflict.recipeB.id);
      pushConflict(this.conflictsByRecipeId, conflict.recipeA.id, conflict);
      // A conflict BETWEEN two sets of one recipe is filed once, matching
      // `validateRecipe`'s `recipeA.id === id || recipeB.id === id` filter over one array.
      if (conflict.recipeB.id !== conflict.recipeA.id) {
        pushConflict(this.conflictsByRecipeId, conflict.recipeB.id, conflict);
      }
    }
    /** @type {Map<*, object[]>} The compiled entries of each ENABLED recipe. */
    this.entriesByRecipeId = new Map();
    for (const entry of entries) {
      pushConflict(this.entriesByRecipeId, entry.recipe.id, entry);
    }
    this._validator = validator;
    /** @type {Map<string, number[]>|null} Built on first candidate query. */
    this._entryIndexByComponentId = null;
  }

  /**
   * The inverted `component id -> entry indices` index, built once per report.
   *
   * Lazy because a report compiled purely to answer "what conflicts exist right now"
   * (the reconciliation and diagnostic paths) never queries a candidate and should not
   * pay for the index.
   *
   * @returns {Map<string, number[]>}
   * @private
   */
  _componentIndex() {
    if (this._entryIndexByComponentId) return this._entryIndexByComponentId;
    const index = new Map();
    for (const [entryIndex, entry] of this.entries.entries()) {
      for (const group of entry.signature) {
        for (const id of group) {
          const bucket = index.get(id);
          if (bucket) {
            // A component appearing in two groups of ONE entry must not list that entry
            // twice, or the candidate cohort double-counts it.
            if (bucket.at(-1) !== entryIndex) bucket.push(entryIndex);
          } else {
            index.set(id, [entryIndex]);
          }
        }
      }
    }
    this._entryIndexByComponentId = index;
    return index;
  }

  /**
   * The conflicts a candidate recipe would participate in, as the equivalent full audit
   * would have reported them.
   *
   * The candidate is evaluated as though its activation had already landed, and it reaches
   * this method at two different moments (issue 1167):
   *
   * - **Stored** — an enable transition (`updateRecipe`, `canActivateRecipe`). The candidate
   *   REPLACES its stored copy in the scan, so that copy's compiled entries are excluded and
   *   the candidate's own sets are compared with each other as well as with the rest of the
   *   system.
   * - **Not stored** — a create or import (`createRecipe`, `importRecipes`), which both gate
   *   BEFORE `this.recipes.set`. The candidate is APPENDED, taking the cohort position
   *   persisting it will literally give it, and is otherwise scanned identically. Nothing is
   *   excluded, because no stored entry carries its id.
   *
   * @param {object} candidate A recipe (usually a clone with `enabled: true`).
   * @returns {object[]} Conflicts in full-audit order; empty when the candidate cannot
   *   participate in one.
   */
  candidateConflicts(candidate) {
    // The audit scans `recipes.filter((r) => r?.enabled)`. A candidate that would not
    // survive that filter contributes no entry and therefore no conflict. The truthy test
    // mirrors the validator's own scan scope deliberately and must not be "corrected" to
    // `!== false` here — that divergence from the model's meaning is issue 1134's, and
    // changing which recipes the collision gate scans is not this cache's business.
    if (!candidate?.enabled) return [];

    // A candidate the stored cohort has never seen is the CREATE/IMPORT case, and it is
    // scanned at the position persisting it would give it: appended after every stored
    // recipe (issue 1167). Returning `[]` here — which is what a substitute-only scan
    // amounts to for a recipe that has no stored copy to substitute for — made the gate
    // unconditionally vacuous on exactly the two paths that introduce a first-time
    // collision, because no conflict the audit reports can name a recipe the audit never
    // scanned.
    //
    // `cohortIndexByRecipeId` holds one entry per cohort member, enabled or not, so its
    // SIZE is the index one past the last — the append slot, and strictly greater than
    // every stored entry's `cohortIndex`. That keeps `(cohortIndex, setIndex)` a total
    // order over the scan and puts the newcomer last in every conflict it participates in,
    // which is the side an audit of the post-create cohort would have put it on.
    const storedIndex = this.cohortIndexByRecipeId.get(candidate.id);
    const cohortIndex = storedIndex === undefined ? this.cohortIndexByRecipeId.size : storedIndex;

    const candidateEntries = this._validator.compileRecipeEntries(
      candidate,
      this.components,
      cohortIndex
    );
    if (candidateEntries.length === 0) return [];

    // The GM browser's question for an ALREADY-ENABLED row is "would enabling this refuse?",
    // asked of a clone that differs from the stored recipe only in an `enabled` flag it
    // already carries. The substituted scan is then the audit this report already ran, so
    // its answer is already filed. Proving that costs one structural comparison of the
    // candidate's own compiled entries — the same order of work as compiling them — and
    // takes the common row from O(candidate cohort) to O(recipe size).
    const stored = this.entriesByRecipeId.get(candidate.id);
    if (stored && entryListsMatch(stored, candidateEntries)) {
      return this.conflictsByRecipeId.get(candidate.id) || [];
    }

    const pairs = [];
    for (const [position, entry] of candidateEntries.entries()) {
      for (const other of this._candidateCohort(entry, candidate.id)) {
        if (this._validator.signaturesOverlap(entry, other)) pairs.push(orderPair(entry, other));
      }
      // The candidate's own sets are compared with each other, exactly as the audit's
      // `i < j` walk does; only a set compared with ITSELF is skipped.
      for (const sibling of candidateEntries.slice(position + 1)) {
        if (entry.setId === sibling.setId) continue;
        if (this._validator.signaturesOverlap(entry, sibling)) pairs.push([entry, sibling]);
      }
    }

    pairs.sort(
      ([leftA, leftB], [rightA, rightB]) =>
        compareEntries(leftA, rightA) || compareEntries(leftB, rightB)
    );
    return pairs.map(([first, second]) =>
      this._validator.describeConflict(first, second, this.components)
    );
  }

  /**
   * The compiled entries a candidate entry could possibly collide with.
   *
   * Sound by the argument in this module's header: every group of the candidate must be
   * covered by a collider's components, so the collider must share an id with the
   * candidate's SMALLEST group. The candidate's own stored entries are excluded because
   * the substitution removed them from the scan; for an APPENDED candidate (issue 1167)
   * that exclusion matches nothing, which is correct — there is no stored copy to remove.
   *
   * @param {object} entry
   * @param {*} candidateRecipeId
   * @returns {object[]}
   * @private
   */
  _candidateCohort(entry, candidateRecipeId) {
    const narrowest = smallestGroup(entry.signature);
    // An entry with no groups, or a group no component satisfies, is inert: the validator
    // rejects it before comparing, so no cohort is worth assembling.
    if (!narrowest || narrowest.size === 0) return [];

    const index = this._componentIndex();
    const seen = new Set();
    const cohort = [];
    for (const id of narrowest) {
      for (const entryIndex of index.get(id) || []) {
        if (seen.has(entryIndex)) continue;
        seen.add(entryIndex);
        const other = this.entries[entryIndex];
        if (other.recipe.id === candidateRecipeId) continue;
        cohort.push(other);
      }
    }
    return cohort;
  }
}

/**
 * Append to a `Map<key, list>`, creating the list on first use.
 *
 * @param {Map<*, object[]>} map
 * @param {*} key
 * @param {object} value
 * @returns {void}
 */
function pushConflict(map, key, value) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

/**
 * Whether two compiled entry lists would produce identical conflicts against an unchanged
 * rest-of-system.
 *
 * Compares every field {@link SignatureValidator#describeConflict} and
 * {@link SignatureValidator#signaturesOverlap} actually read — the reported names and
 * positions as well as the expanded signature and the per-option capacities — so a
 * candidate that renamed a set, reordered its options or changed a required quantity is
 * NOT treated as unchanged, however similar its component expansion looks.
 *
 * @param {object[]} left
 * @param {object[]} right
 * @returns {boolean}
 */
function entryListsMatch(left, right) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entriesMatch(entry, right[index]));
}

/**
 * @param {object} left
 * @param {object} right
 * @returns {boolean}
 */
function entriesMatch(left, right) {
  return (
    left.recipe.name === right.recipe.name &&
    left.setId === right.setId &&
    left.setName === right.setName &&
    left.setPosition === right.setPosition &&
    left.cohortIndex === right.cohortIndex &&
    left.setIndex === right.setIndex &&
    signaturesMatch(left.signature, right.signature) &&
    groupOptionsMatch(left.groupOptions, right.groupOptions)
  );
}

/**
 * @param {Set<string>[]} left
 * @param {Set<string>[]} right
 * @returns {boolean}
 */
function signaturesMatch(left, right) {
  return (
    left.length === right.length && left.every((group, index) => setsMatch(group, right[index]))
  );
}

/**
 * @param {{ids: Set<string>, capacity: number}[][]} left
 * @param {{ids: Set<string>, capacity: number}[][]} right
 * @returns {boolean}
 */
function groupOptionsMatch(left, right) {
  return (
    left.length === right.length &&
    left.every(
      (options, index) =>
        options.length === right[index].length &&
        options.every(
          (option, position) =>
            option.capacity === right[index][position].capacity &&
            setsMatch(option.ids, right[index][position].ids)
        )
    )
  );
}

/**
 * @param {Set<string>} left
 * @param {Set<string>} right
 * @returns {boolean}
 */
function setsMatch(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

/**
 * The group of a signature with the fewest satisfying components, or `null` for a
 * signature with no groups.
 *
 * @param {Set<string>[]} signature
 * @returns {Set<string>|null}
 */
function smallestGroup(signature) {
  let smallest = null;
  for (const group of signature) {
    if (!smallest || group.size < smallest.size) smallest = group;
  }
  return smallest;
}

/**
 * Two compiled entries in full-audit order: `(cohortIndex, setIndex)` ascending.
 *
 * @param {{cohortIndex: number, setIndex: number}} left
 * @param {{cohortIndex: number, setIndex: number}} right
 * @returns {number}
 */
function compareEntries(left, right) {
  return left.cohortIndex - right.cohortIndex || left.setIndex - right.setIndex;
}

/**
 * A pair in full-audit order, so the conflict's `recipeA`/`recipeB` match the side the
 * unpruned `i < j` walk would have put first.
 *
 * @param {object} left
 * @param {object} right
 * @returns {object[]}
 */
function orderPair(left, right) {
  return compareEntries(left, right) <= 0 ? [left, right] : [right, left];
}
