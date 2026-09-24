/**
 * Enable-time alchemy signature validation (`resolution-modes/spec.md`, signature inseparability):
 * a signature is, per group of an ingredient set, the component ids able to satisfy it. The
 * manager exposes `getSystem`, `getRecipesForSystem` and `getComponentsForSystem`; an adapter
 * stands in for a candidate recipe or a snapshot of a system not yet persisted.
 */
import { getMatchHandler } from '../models/match/matchTypes.js';

import { AlchemySignatureReport } from './AlchemySignatureReport.js';

/**
 * Process-wide counters (issue 1074), since the row path builds its validator deep inside
 * `RecipeManager`; `reportBuilds` exposes a cache that saved comparisons by answering stale.
 */
const _counters = {
  signatureComparisons: 0,
  reportBuilds: 0,
};

export function readSignatureCounters() {
  return { ..._counters };
}

/** Zero the counters before a measured region; they are process-global and monotonic. */
export function resetSignatureCounters() {
  _counters.signatureComparisons = 0;
  _counters.reportBuilds = 0;
}

/**
 * Every union of 1 to `capacity` distinct component coverage masks an option can contribute: the
 * one notion of "a transversal covers a signature" the overlap guard and the specificity tiebreak
 * share, so the two cannot drift.
 */
function optionCoverageMasks(option, coverageOf) {
  const distinct = new Set();
  for (const id of option.ids) {
    distinct.add(coverageOf(id));
  }
  // BFS: each round unions one more distinct mask into every union achievable so far.
  const achievable = new Set(distinct);
  let frontier = new Set(distinct);
  for (let picks = 2; picks <= option.capacity && frontier.size > 0; picks++) {
    const nextFrontier = new Set();
    for (const partial of frontier) {
      for (const mask of distinct) {
        const combined = partial | mask;
        if (!achievable.has(combined)) {
          achievable.add(combined);
          nextFrontier.add(combined);
        }
      }
    }
    frontier = nextFrontier;
  }
  return achievable;
}

/**
 * Whether some transversal of `fromGroupOptions` (one option per group, supplying up to its
 * `capacity` distinct components) satisfies every group of `toSignature`. A component matters only
 * through its coverage mask, so this is a DP over the reachable covered masks.
 */
export function someTransversalSatisfies(fromGroupOptions, toSignature) {
  const fullMask = (1 << toSignature.length) - 1;

  // Coverage mask of a component id: which toSignature groups contain it.
  const coverageOf = (id) => {
    let mask = 0;
    for (const [i, group] of toSignature.entries()) {
      if (group.has(id)) mask |= 1 << i;
    }
    return mask;
  };

  let reachable = new Set([0]);
  for (const options of fromGroupOptions) {
    // Every mask any option of this group can contribute.
    const groupMasks = new Set();
    for (const option of options) {
      for (const mask of optionCoverageMasks(option, coverageOf)) {
        groupMasks.add(mask);
      }
    }
    const next = new Set();
    for (const covered of reachable) {
      for (const mask of groupMasks) {
        const combined = covered | mask;
        if (combined === fullMask) return true;
        next.add(combined);
      }
    }
    reachable = next;
  }
  return reachable.has(fullMask);
}

/** Never matchable (no groups, or a group nothing satisfies): inert for overlap and dominance. */
function isInertSignature(entry) {
  const signature = entry?.signature;
  if (!Array.isArray(signature) || signature.length === 0) return true;
  return signature.some((group) => group.size === 0);
}

/**
 * The runtime specificity order (issue 774): `A` dominates `B` when a transversal of `A` satisfies
 * `B` and none of `B` satisfies `A`, containment of required groups rather than units consumed.
 * The enable-time guard rejects the symmetric case and the runtime matcher picks the unique
 * dominator, both through `someTransversalSatisfies`, so they never disagree.
 */
export function signatureDominates(entryA, entryB) {
  if (isInertSignature(entryA) || isInertSignature(entryB)) return false;
  const aCoversB = someTransversalSatisfies(entryA.groupOptions, entryB.signature);
  const bCoversA = someTransversalSatisfies(entryB.groupOptions, entryA.signature);
  return aCoversB && !bCoversA;
}

export class SignatureValidator {
  constructor(craftingSystemManager) {
    this._csm = craftingSystemManager;
  }

  /** The component ids able to satisfy one ingredient option. */
  expandIngredientToComponentIds(ingredient, systemComponents) {
    return getMatchHandler(ingredient?.match).expandToComponentIds(
      ingredient?.match,
      systemComponents
    );
  }

  /** The union of the ids able to satisfy any option of a group. */
  expandGroupToComponentIds(group, systemComponents) {
    const expanded = new Set();
    for (const option of group.options || []) {
      for (const id of this.expandIngredientToComponentIds(option, systemComponents)) {
        expanded.add(id);
      }
    }
    return expanded;
  }

  /** A set's signature: one id set per required group. */
  computeSignature(ingredientSet, systemComponents) {
    return (ingredientSet.ingredientGroups || []).map((g) =>
      this.expandGroupToComponentIds(g, systemComponents)
    );
  }

  /**
   * Per group, each option's `{ ids, capacity }`, `capacity` being `min(quantity, ids.size)`: a
   * `quantity: N` option can be crafted from N distinct components, each covering other groups.
   * An option expanding to no component (such as currency) is dropped.
   */
  computeGroupOptions(ingredientSet, systemComponents) {
    return (ingredientSet.ingredientGroups || []).map((group) =>
      (group.options || [])
        .map((option) => {
          const ids = this.expandIngredientToComponentIds(option, systemComponents);
          // An essence option counts `match.amount` (its quantity stays 1); capping it at the
          // quantity would fail overlap detection OPEN.
          const count =
            option?.match?.type === 'essence'
              ? Math.max(1, Number(option?.match?.amount) || 1)
              : Math.max(1, Number(option?.quantity) || 1);
          return { ids, capacity: Math.min(count, ids.size) };
        })
        .filter((option) => option.ids.size > 0)
    );
  }

  /**
   * Whether two ingredient sets are INSEPARABLE (issue 774): a transversal of each satisfies the
   * other. The superset-tolerant runtime matcher resolves a one-directional pair to its dominator
   * and fizzles on incomparable siblings, so only this symmetric case blocks enabling.
   */
  signaturesOverlap(entryA, entryB) {
    _counters.signatureComparisons += 1;

    if (isInertSignature(entryA) || isInertSignature(entryB)) return false;

    return (
      someTransversalSatisfies(entryA.groupOptions, entryB.signature) &&
      someTransversalSatisfies(entryB.groupOptions, entryA.signature)
    );
  }

  /**
   * The sorted managed-component names both signatures share, naming a conflict without leaking an
   * id (issue 550): an id with no managed name is dropped, never shown.
   */
  _overlapComponentNames(entryA, entryB, systemComponents) {
    const idsA = new Set();
    for (const group of entryA.signature) for (const id of group) idsA.add(id);
    const shared = new Set();
    for (const group of entryB.signature) for (const id of group) if (idsA.has(id)) shared.add(id);

    const nameById = new Map(
      (systemComponents || []).map((component) => [component?.id, component?.name])
    );
    return [...shared]
      .map((id) => nameById.get(id))
      .filter((name) => typeof name === 'string' && name.length > 0)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Audit the system's ENABLED recipes, the exact set the runtime matcher considers, so every gate
   * funnelling through here (`blocksSystem`, the save block, `disableSignatureConflicts`, the
   * adminStore validator, the 1.17.0 migration) enforces one invariant: enabled recipes never
   * collide. Disabling every participant clears a conflict, and re-enabling one is re-caught.
   */
  validateSystem(systemId) {
    const compiled = this.compileSystemEntries(systemId);
    if (!compiled) return { valid: true, conflicts: [] };

    const conflicts = this._auditEntries(compiled.entries, compiled.components);
    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * The enabled recipes' `(recipe, ingredient set)` entries, each with its 1-based set position (a
   * conflict names a set by its author name or position, never the raw id, issue 550), and
   * `cohortIndexByRecipeId` over the WHOLE cohort, so the enable-time gate can place a disabled
   * candidate in audit order. `null` for an unknown system.
   */
  compileSystemEntries(systemId) {
    const system = this._csm.getSystem(systemId);
    if (!system) return null;

    const cohort = this._csm.getRecipesForSystem(systemId) || [];
    const components = this._csm.getComponentsForSystem(systemId) || [];
    const entries = [];
    const cohortIndexByRecipeId = new Map();
    for (const [cohortIndex, recipe] of cohort.entries()) {
      cohortIndexByRecipeId.set(recipe?.id, cohortIndex);
      if (!recipe?.enabled) continue;
      entries.push(...this.compileRecipeEntries(recipe, components, cohortIndex));
    }
    return { system, components, entries, cohortIndexByRecipeId };
  }

  /** One recipe's audit entries; the candidate check compiles through it too (issue 1074). */
  compileRecipeEntries(recipe, components, cohortIndex = 0) {
    return (recipe?.ingredientSets || []).map((set, index) => ({
      recipe: { id: recipe.id, name: recipe.name },
      setId: set.id,
      setPosition: index + 1,
      setName: set.name || null,
      signature: this.computeSignature(set, components),
      groupOptions: this.computeGroupOptions(set, components),
      cohortIndex,
      setIndex: index,
    }));
  }

  /**
   * The unpruned `i < j` pairwise audit, kept unpruned as the oracle that
   * `AlchemySignatureReport`'s indexed answer is differentially tested against.
   */
  _auditEntries(entries, components) {
    const conflicts = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];

        // Skip comparing a set with itself (can happen with same recipe ID + same set ID)
        if (a.recipe.id === b.recipe.id && a.setId === b.setId) continue;

        if (this.signaturesOverlap(a, b)) {
          conflicts.push(this.describeConflict(a, b, components));
        }
      }
    }
    return conflicts;
  }

  /** One overlapping pair's conflict, `entryA` being the side an `i < j` walk visits first. */
  describeConflict(entryA, entryB, components) {
    const componentNames = this._overlapComponentNames(entryA, entryB, components);
    const setA = entryA.setName || String(entryA.setPosition);
    const setB = entryB.setName || String(entryB.setPosition);
    const componentsLabel = componentNames.join(', ');
    return {
      recipeA: entryA.recipe,
      ingredientSetA: entryA.setId,
      recipeB: entryB.recipe,
      ingredientSetB: entryB.setId,
      // A stable code and params the UI localizes (issue 550): set names or positions and
      // component names, never raw ids.
      code: 'signatureCollision',
      params: {
        recipeA: entryA.recipe.name,
        recipeB: entryB.recipe.name,
        setA,
        setB,
        components: componentsLabel,
      },
      // Headless English for console callers, naming no set id.
      message: componentsLabel
        ? `Overlapping signatures between "${entryA.recipe.name}" and "${entryB.recipe.name}" (shared components: ${componentsLabel})`
        : `Overlapping signatures between "${entryA.recipe.name}" and "${entryB.recipe.name}"`,
    };
  }

  /**
   * The cold build of a reusable `AlchemySignatureReport`: one full audit, the per-revision budget
   * issue 1074 allows; `RecipeManager` owns the revision guard. `null` for an unknown system.
   */
  compileReport(systemId) {
    const compiled = this.compileSystemEntries(systemId);
    if (!compiled) return null;
    _counters.reportBuilds += 1;
    return new AlchemySignatureReport({
      systemId,
      validator: this,
      components: compiled.components,
      entries: compiled.entries,
      cohortIndexByRecipeId: compiled.cohortIndexByRecipeId,
      conflicts: this._auditEntries(compiled.entries, compiled.components),
    });
  }

  /** The system audit's conflicts naming one recipe. */
  validateRecipe(recipe, systemId) {
    const result = this.validateSystem(systemId);
    const recipeConflicts = result.conflicts.filter(
      (c) => c.recipeA.id === recipe.id || c.recipeB.id === recipe.id
    );
    return {
      valid: recipeConflicts.length === 0,
      conflicts: recipeConflicts,
    };
  }
}
