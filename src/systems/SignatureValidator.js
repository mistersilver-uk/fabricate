/**
 * Validates uniqueness of satisfiable ingredient signatures across recipes in a crafting system.
 *
 * A "signature" is the set of components that can satisfy a given ingredient set.
 * If two ingredient sets from different recipes (or the same recipe) overlap in their
 * satisfiable components, the runtime cannot unambiguously choose which recipe a player
 * is attempting to craft — this is a conflict.
 *
 * Usage: instantiate with a craftingSystemManager that exposes:
 *   - getSystem(systemId)
 *   - getRecipesForSystem(systemId)
 *   - getComponentsForSystem(systemId)
 */
import { getMatchHandler } from '../models/match/matchTypes.js';

export class SignatureValidator {
  constructor(craftingSystemManager) {
    this._csm = craftingSystemManager;
  }

  /**
   * Expand a single ingredient option to the set of component IDs that can satisfy it.
   *
   * @param {object} ingredient - Ingredient-like object with a `match` property
   * @param {object[]} systemComponents - All managed components in the system
   * @returns {Set<string>} component IDs that can match this ingredient
   */
  expandIngredientToComponentIds(ingredient, systemComponents) {
    return getMatchHandler(ingredient?.match).expandToComponentIds(
      ingredient?.match,
      systemComponents
    );
  }

  /**
   * Expand an ingredient group (one of several options satisfies the group)
   * to the union of all component IDs that can satisfy any option.
   *
   * @param {object} group - IngredientGroup with `options` array
   * @param {object[]} systemComponents
   * @returns {Set<string>}
   */
  expandGroupToComponentIds(group, systemComponents) {
    const expanded = new Set();
    for (const option of group.options || []) {
      for (const id of this.expandIngredientToComponentIds(option, systemComponents)) {
        expanded.add(id);
      }
    }
    return expanded;
  }

  /**
   * Compute the signature for an ingredient set: an array of expanded group sets.
   * Each element of the array represents one required group, and the set within
   * contains all component IDs that could satisfy that group.
   *
   * @param {object} ingredientSet - IngredientSet with `ingredientGroups`
   * @param {object[]} systemComponents
   * @returns {Set<string>[]}
   */
  computeSignature(ingredientSet, systemComponents) {
    return (ingredientSet.ingredientGroups || []).map((g) =>
      this.expandGroupToComponentIds(g, systemComponents)
    );
  }

  /**
   * Check whether two signatures overlap — i.e. whether they are genuinely
   * ambiguous because a single plausible submission satisfies BOTH sets'
   * group requirements at once.
   *
   * The runtime signature matcher (`CraftingEngine._matchAlchemySignature`)
   * requires **every** group of a set to be satisfied and is superset-tolerant
   * (`>= required`, no leftover guard; extras are consumed as essence
   * contributors). It returns the FIRST set that fully matches. So a pair is only
   * ambiguous when a submission a player would plausibly make to craft one set
   * ALSO fully satisfies the other — then the runtime silently shadows one.
   *
   * The plausible submissions for a set are its **transversals**: pick one
   * satisfying component per group (the natural "one ingredient per requirement"
   * craft). Merely sharing a base component is NOT enough — Healing
   * `{Water},{Herb}` and Mana `{Water},{Mineral}` share Water, but no transversal
   * of one (`Water+Herb` / `Water+Mineral`) satisfies the other, so they are
   * distinguishable and must both be enablable. By contrast a set whose group
   * requirements are a subset of another's IS ambiguous: every transversal of the
   * larger set also satisfies the smaller one, so the smaller recipe can never be
   * reached distinctly (superset-tolerance). Two single-group sets sharing a
   * component that satisfies both (e.g. a `mithril` tagged both `rare` and
   * `metal`) are likewise ambiguous: the one-item `{mithril}` submission matches
   * both.
   *
   * Two signatures therefore overlap iff some transversal of A satisfies all of
   * B's groups, or some transversal of B satisfies all of A's groups. See
   * {@link _someTransversalSatisfies}.
   *
   * @param {Set<string>[]} sigA
   * @param {Set<string>[]} sigB
   * @returns {boolean}
   */
  signaturesOverlap(sigA, sigB) {
    if (sigA.length === 0 || sigB.length === 0) return false;

    // A set carrying a group that no component can satisfy is unsatisfiable: it
    // can never match a submission at runtime, so it cannot be the source of any
    // ambiguity and never conflicts with another set.
    if (sigA.some((group) => group.size === 0)) return false;
    if (sigB.some((group) => group.size === 0)) return false;

    return this._someTransversalSatisfies(sigA, sigB) || this._someTransversalSatisfies(sigB, sigA);
  }

  /**
   * Whether some transversal of `fromGroups` (one component chosen per group)
   * satisfies every group of `toGroups` (each `toGroups` group contains at least
   * one chosen component).
   *
   * Each `fromGroups` group contributes exactly one component, and a chosen
   * component's only relevance to `toGroups` is which `toGroups` groups contain
   * it — its **coverage mask**. Components of a `fromGroups` group with identical
   * coverage are interchangeable, so we reduce each group to its distinct coverage
   * masks and DP over the reachable set of covered-`toGroups` masks. Feasible iff
   * the fully-covered mask is reachable.
   *
   * @param {Set<string>[]} fromGroups - the transversal source signature's groups
   * @param {Set<string>[]} toGroups - the signature whose groups must all be covered
   * @returns {boolean}
   * @private
   */
  _someTransversalSatisfies(fromGroups, toGroups) {
    const fullMask = (1 << toGroups.length) - 1;

    // Coverage mask of a component id: which toGroups contain it.
    const coverageOf = (id) => {
      let mask = 0;
      for (const [i, group] of toGroups.entries()) {
        if (group.has(id)) mask |= 1 << i;
      }
      return mask;
    };

    let reachable = new Set([0]);
    for (const group of fromGroups) {
      const distinctMasks = new Set();
      for (const id of group) {
        distinctMasks.add(coverageOf(id));
      }
      const next = new Set();
      for (const covered of reachable) {
        for (const mask of distinctMasks) {
          const combined = covered | mask;
          if (combined === fullMask) return true;
          next.add(combined);
        }
      }
      reachable = next;
    }
    return reachable.has(fullMask);
  }

  /**
   * Validate all recipes in a crafting system for ingredient signature conflicts.
   *
   * @param {string} systemId
   * @returns {{ valid: boolean, conflicts: object[] }}
   */
  validateSystem(systemId) {
    const system = this._csm.getSystem(systemId);
    if (!system) return { valid: true, conflicts: [] };

    const recipes = this._csm.getRecipesForSystem(systemId) || [];
    const components = this._csm.getComponentsForSystem(systemId) || [];
    const conflicts = [];

    // Collect all (recipe, ingredientSet, signature) entries
    const entries = [];
    for (const recipe of recipes) {
      for (const set of recipe.ingredientSets || []) {
        entries.push({
          recipe: { id: recipe.id, name: recipe.name },
          setId: set.id,
          setName: set.name || set.id,
          signature: this.computeSignature(set, components),
        });
      }
    }

    // Pairwise comparison — skip same-recipe comparisons only if same set
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];

        // Skip comparing a set with itself (can happen with same recipe ID + same set ID)
        if (a.recipe.id === b.recipe.id && a.setId === b.setId) continue;

        if (this.signaturesOverlap(a.signature, b.signature)) {
          conflicts.push({
            recipeA: a.recipe,
            ingredientSetA: a.setId,
            recipeB: b.recipe,
            ingredientSetB: b.setId,
            message: `Overlapping signatures between "${a.recipe.name}" (set ${a.setName}) and "${b.recipe.name}" (set ${b.setName})`,
          });
        }
      }
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Validate a single recipe against all others in its system.
   *
   * @param {object} recipe - Recipe object with `id`, `craftingSystemId`, `ingredientSets`
   * @param {string} systemId
   * @returns {{ valid: boolean, conflicts: object[] }}
   */
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
