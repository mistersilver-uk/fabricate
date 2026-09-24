/**
 * The compiled, revision-scoped alchemy signature report (issue 1074): the pairwise audit runs once
 * per revision and each browser row is answered from it, where a whole audit per row made N rows
 * O(N³). A candidate is compared only with entries sharing an id with its SMALLEST group, which is
 * sound: overlap needs a transversal of the other entry to cover every candidate group, so pruning
 * never changes an answer (`validateSystem` stays the unpruned oracle). Conflict ORDER is part of
 * the contract, since `RecipeManager._validateSignatures` maps conflicts onto `errors[]`: the key
 * is `(cohortIndex, setIndex)` in the UNFILTERED cohort, which a substituted disabled candidate
 * leaves stable.
 */

/**
 * One alchemy system's compiled enabled signatures, immutable: `RecipeManager` discards the whole
 * report when its revision guard fails rather than patching it.
 */
export class AlchemySignatureReport {
  /**
   * `validator` is injected, keeping this module a leaf with one overlap authority. `entries` are
   * the ENABLED recipes' compiled entries in audit order; `cohortIndexByRecipeId` maps every recipe
   * of the system, enabled or not, to its unfiltered cohort position.
   */
  constructor({ systemId, validator, components, entries, cohortIndexByRecipeId, conflicts }) {
    this.systemId = systemId;
    this.components = components;
    this.entries = entries;
    this.cohortIndexByRecipeId = cohortIndexByRecipeId;
    this.conflicts = conflicts;
    // Recipes in a conflict among the enabled set, for `disableSignatureConflicts`; a browser row
    // cannot use it, since a disabled recipe is absent from the audit.
    this.blockedRecipeIds = new Set();
    // Each recipe's conflicts in audit order, exactly what `validateRecipe` filters out.
    this.conflictsByRecipeId = new Map();
    for (const conflict of conflicts) {
      this.blockedRecipeIds.add(conflict.recipeA.id);
      this.blockedRecipeIds.add(conflict.recipeB.id);
      pushConflict(this.conflictsByRecipeId, conflict.recipeA.id, conflict);
      // A conflict between two sets of one recipe is filed once, as `validateRecipe` does.
      if (conflict.recipeB.id !== conflict.recipeA.id) {
        pushConflict(this.conflictsByRecipeId, conflict.recipeB.id, conflict);
      }
    }
    // The compiled entries of each enabled recipe.
    this.entriesByRecipeId = new Map();
    for (const entry of entries) {
      pushConflict(this.entriesByRecipeId, entry.recipe.id, entry);
    }
    this._validator = validator;
    this._entryIndexByComponentId = null;
  }

  /** The lazy inverted `component id -> entry indices` index, unbuilt until a candidate asks. */
  _componentIndex() {
    if (this._entryIndexByComponentId) return this._entryIndexByComponentId;
    const index = new Map();
    for (const [entryIndex, entry] of this.entries.entries()) {
      for (const group of entry.signature) {
        for (const id of group) {
          const bucket = index.get(id);
          if (bucket) {
            // An id in two groups of one entry lists it once, or the cohort double-counts it.
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
   * The conflicts a candidate recipe would join once enabled, in full-audit order (issue 1167). A
   * STORED candidate replaces its stored copy in the scan; a create or import candidate, gated
   * before `this.recipes.set`, is APPENDED at the cohort position persisting will give it.
   */
  candidateConflicts(candidate) {
    // The audit's own truthy scan scope, deliberately not `!== false` (issue 1134).
    if (!candidate?.enabled) return [];

    // A never-stored candidate takes the append slot, the cohort map's size, so it sorts last in
    // every conflict; returning `[]` instead made the gate vacuous on create and import, the two
    // paths that introduce a first collision (issue 1167).
    const storedIndex = this.cohortIndexByRecipeId.get(candidate.id);
    const cohortIndex = storedIndex === undefined ? this.cohortIndexByRecipeId.size : storedIndex;

    const candidateEntries = this._validator.compileRecipeEntries(
      candidate,
      this.components,
      cohortIndex
    );
    if (candidateEntries.length === 0) return [];

    // An already-enabled row's substituted scan IS this report's audit, so a structural match of
    // its compiled entries answers from the filed conflicts.
    const stored = this.entriesByRecipeId.get(candidate.id);
    if (stored && entryListsMatch(stored, candidateEntries)) {
      return this.conflictsByRecipeId.get(candidate.id) || [];
    }

    const pairs = [];
    for (const [position, entry] of candidateEntries.entries()) {
      for (const other of this._candidateCohort(entry, candidate.id)) {
        if (this._validator.signaturesOverlap(entry, other)) pairs.push(orderPair(entry, other));
      }
      // The candidate's own sets compare with each other, as the audit's `i < j` walk does.
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
   * The stored entries sharing an id with the entry's smallest group (sound, per the module
   * header), minus the candidate's own stored entries, which the substitution removed.
   */
  _candidateCohort(entry, candidateRecipeId) {
    const narrowest = smallestGroup(entry.signature);
    // An inert entry never overlaps, so no cohort is worth assembling.
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

/** Append to a `Map<key, list>`, creating the list on first use. */
function pushConflict(map, key, value) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

/**
 * Whether two compiled entry lists yield identical conflicts: every field `describeConflict` and
 * `signaturesOverlap` read, so a renamed set or a changed quantity is not "unchanged".
 */
function entryListsMatch(left, right) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entriesMatch(entry, right[index]));
}

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

function signaturesMatch(left, right) {
  return (
    left.length === right.length && left.every((group, index) => setsMatch(group, right[index]))
  );
}

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

function setsMatch(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

/** The signature group with the fewest components, or `null` with no groups. */
function smallestGroup(signature) {
  let smallest = null;
  for (const group of signature) {
    if (!smallest || group.size < smallest.size) smallest = group;
  }
  return smallest;
}

/** Full-audit order: `(cohortIndex, setIndex)` ascending. */
function compareEntries(left, right) {
  return left.cohortIndex - right.cohortIndex || left.setIndex - right.setIndex;
}

/** A pair in full-audit order, so `recipeA` is the side the `i < j` walk puts first. */
function orderPair(left, right) {
  return compareEntries(left, right) <= 0 ? [left, right] : [right, left];
}
