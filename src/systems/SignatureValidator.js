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
    const match = ingredient?.match;
    if (!match) return new Set();

    if (match.type === 'component') {
      const id = match.componentId || match.systemItemId || null;
      return id ? new Set([id]) : new Set();
    }

    if (match.type === 'tags') {
      const tags = Array.isArray(match.tags) ? match.tags : [];
      const tagMatch = match.tagMatch === 'all' ? 'all' : 'any';

      return new Set(
        (systemComponents || [])
          .filter((c) => {
            const compTags = Array.isArray(c.tags) ? c.tags : [];
            return tagMatch === 'all'
              ? tags.every((t) => compTags.includes(t))
              : tags.some((t) => compTags.includes(t));
          })
          .map((c) => c.id)
      );
    }

    return new Set();
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
   * Check whether two signatures overlap (i.e., share at least one component ID
   * across the union of all groups in both signatures).
   *
   * Conservative approach: if any component can appear in both signatures,
   * the signatures overlap. This avoids false negatives at the cost of potential
   * false positives for complex multi-group recipes with disjoint group assignments.
   *
   * @param {Set<string>[]} sigA
   * @param {Set<string>[]} sigB
   * @returns {boolean}
   */
  signaturesOverlap(sigA, sigB) {
    if (sigA.length === 0 || sigB.length === 0) return false;

    // Compute the union of all components in each signature
    const allA = new Set();
    for (const groupSet of sigA) {
      for (const id of groupSet) {
        allA.add(id);
      }
    }

    const allB = new Set();
    for (const groupSet of sigB) {
      for (const id of groupSet) {
        allB.add(id);
      }
    }

    // Overlap if the intersection of all-A and all-B is non-empty
    for (const id of allA) {
      if (allB.has(id)) return true;
    }
    return false;
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
