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

/**
 * All coverage masks an option can contribute: every union of between 1 and
 * `capacity` DISTINCT component coverage masks drawn from the option. A
 * `capacity: 1` option contributes each component's mask singly; a
 * `capacity: 2` option additionally contributes the pairwise unions, and so on.
 *
 * Module-level pure primitive (reads no `this`) so the enable-time guard
 * (`signaturesOverlap`) and the runtime specificity tiebreak
 * ({@link signatureDominates}) derive from ONE notion of "a transversal covers a
 * signature" and can never drift into two conflicting definitions of specificity.
 *
 * @param {{ ids: Set<string>, capacity: number }} option
 * @param {(id: string) => number} coverageOf
 * @returns {Set<number>}
 */
function optionCoverageMasks(option, coverageOf) {
  const distinct = new Set();
  for (const id of option.ids) {
    distinct.add(coverageOf(id));
  }
  // BFS over unions of ≤ capacity distinct masks. `achievable` accumulates every
  // union achievable so far; each round unions one more distinct mask in.
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
 * Whether some transversal of `fromGroupOptions` (one option chosen per group,
 * supplying up to its `capacity` distinct components) satisfies every group of
 * `toSignature` (each `toSignature` group contains at least one supplied
 * component).
 *
 * A supplied component's only relevance to `toSignature` is which of its groups
 * contain the component — its **coverage mask**. So each chosen option
 * contributes the union of up to `capacity` distinct component coverage masks;
 * we enumerate the achievable per-group masks and DP over the reachable set of
 * covered-`toSignature` masks. Feasible iff the fully-covered mask is reachable.
 *
 * @param {{ ids: Set<string>, capacity: number }[][]} fromGroupOptions
 * @param {Set<string>[]} toSignature - the groups that must all be covered
 * @returns {boolean}
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
    // The distinct masks this whole group can contribute: for each of its
    // options, every union of up to `capacity` distinct component masks.
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

/**
 * A signature entry is unsatisfiable — it can never match any runtime submission —
 * when it has no groups or carries a group no component can satisfy. Such a set is
 * inert for both overlap and domination reasoning.
 *
 * @param {{ signature: Set<string>[] }} entry
 * @returns {boolean}
 */
function isInertSignature(entry) {
  const signature = entry?.signature;
  if (!Array.isArray(signature) || signature.length === 0) return true;
  return signature.some((group) => group.size === 0);
}

/**
 * The runtime specificity partial order (LOAD-BEARING, issue 774). Entry `A`
 * **dominates** entry `B` — is strictly MORE SPECIFIC — iff a natural transversal
 * of `A` also satisfies every group of `B` (so `A`'s required-group structure
 * CONTAINS `B`'s) while no transversal of `B` satisfies `A` (so `B` is strictly
 * smaller). This is exactly the asymmetric half of the enable-time inseparability
 * test: {@link SignatureValidator#signaturesOverlap} rejects the SYMMETRIC case
 * (both directions satisfy — identical signatures, or the tag/OR case), and the
 * runtime matcher ({@link resolveMostSpecificSignatureMatch}) breaks a multi-match
 * tie by picking the unique dominator. Both consume this same
 * {@link someTransversalSatisfies} primitive so the guard and the runtime can never
 * disagree about which of two matching sets is more specific.
 *
 * Domination is a proper-superset relation on required-group structure, NOT on
 * units consumed (alchemy consumes ALL submitted units regardless).
 *
 * @param {{ signature: Set<string>[], groupOptions: object[][] }} entryA
 * @param {{ signature: Set<string>[], groupOptions: object[][] }} entryB
 * @returns {boolean}
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
   * Compute the per-group option contributions for an ingredient set, preserving
   * each option's required **quantity** (which {@link computeSignature}
   * discards).
   *
   * Each group becomes an array of options `{ ids, capacity }`, where `ids` is
   * the set of component IDs that can satisfy the option and `capacity` is the
   * maximum number of DISTINCT components a natural craft can supply for that
   * option — `min(quantity, ids.size)`. This matters because the runtime
   * satisfies a `quantity: N` option by counting N matching submissions, and
   * those N units can be N *distinct* components (a `quantity: 2` "metal"-tag
   * option is naturally crafted as iron + gold), each of which contributes its
   * own coverage toward another set's groups.
   *
   * Options that expand to no component (e.g. currency) are dropped.
   *
   * @param {object} ingredientSet - IngredientSet with `ingredientGroups`
   * @param {object[]} systemComponents
   * @returns {{ ids: Set<string>, capacity: number }[][]}
   */
  computeGroupOptions(ingredientSet, systemComponents) {
    return (ingredientSet.ingredientGroups || []).map((group) =>
      (group.options || [])
        .map((option) => {
          const ids = this.expandIngredientToComponentIds(option, systemComponents);
          // An essence option carries its count on `match.amount` (quantity stays 1),
          // so its capacity derives from the amount, not the option quantity — else
          // `amount: 3` would cap capacity at 1 and fail-OPEN overlap detection.
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
   * Check whether two ingredient sets are INSEPARABLE — genuinely ambiguous in a
   * way no added or different ingredient can ever resolve, so the runtime could
   * never distinguish them (issue 774).
   *
   * The runtime signature matcher (`CraftingEngine._matchAlchemySignature`) is
   * superset-tolerant (`>= required`, extras consumed) and, since issue 774, picks
   * the MOST-SPECIFIC matching set (the unique dominator under
   * {@link signatureDominates}), fizzling safely when no unique maximum exists.
   * That runtime disambiguates any pair related by strict subset/superset (the
   * superset dominates) and safely fizzles an ambiguous over-submission of
   * incomparable siblings. So a pair is only unenablable when it is INSEPARABLE:
   * a plausible submission of EACH set also fully satisfies the OTHER — the
   * SYMMETRIC transversal case, where neither dominates and no ingredient choice
   * can pick a winner.
   *
   * The plausible submissions for a set are its **transversals**: for each group,
   * pick one satisfying option and supply exactly its required quantity of units
   * (the natural "the ingredients each requirement calls for" craft), choosing
   * WHICH components those units are to maximise the chance of also matching the
   * other set. A `quantity: N` option can therefore contribute up to N distinct
   * components. Symmetric-transversal overlap covers exactly: identical signatures;
   * the tag/OR case where one item satisfies both (a `mithril` tagged both `rare`
   * and `metal` for `A={rare}` / `B={metal}`, ambiguous via the one-item
   * `{mithril}` submission); and an OR-option set that fully shadows a narrower one.
   * By contrast a strict subset/superset pair (`{Water}` vs `{Water},{Herb}`) is
   * ONE-directional and now ALLOWED — the runtime brews the superset when Herb is
   * added and the base when it is not — and incomparable siblings
   * (`{S,V,E}` / `{S,V,R}`) satisfy neither direction and are also allowed.
   *
   * @param {object} entryA - `{ signature: Set<string>[], groupOptions }`
   * @param {object} entryB - `{ signature: Set<string>[], groupOptions }`
   * @returns {boolean}
   */
  signaturesOverlap(entryA, entryB) {
    // A set carrying no groups, or a group no component can satisfy, is
    // unsatisfiable: it can never match a submission at runtime, so it cannot be
    // the source of any ambiguity and never conflicts with another set.
    if (isInertSignature(entryA) || isInertSignature(entryB)) return false;

    // Inseparable == SYMMETRIC transversal satisfaction: a natural craft of EACH
    // set also satisfies the OTHER. One-directional satisfaction (strict
    // subset/superset) is disambiguated by the runtime's most-specific pick, and
    // neither-directional (incomparable siblings) fizzles safely, so only the
    // symmetric (`&&`) case is rejected at enable time (issue 774).
    return (
      someTransversalSatisfies(entryA.groupOptions, entryB.signature) &&
      someTransversalSatisfies(entryB.groupOptions, entryA.signature)
    );
  }

  /**
   * The managed-component NAMES shared by two overlapping signatures — the
   * components a player could submit that satisfy both sets, and therefore the
   * concrete reason the runtime cannot tell the recipes apart. Used to describe a
   * conflict to the user without leaking ids (issue 550). A component that expands
   * to an id with no managed name is dropped rather than falling back to its id,
   * so no raw id can ever reach the user through this label. Result is sorted for
   * a deterministic message.
   *
   * @param {object} entryA - `{ signature: Set<string>[] }`
   * @param {object} entryB - `{ signature: Set<string>[] }`
   * @param {object[]} systemComponents
   * @returns {string[]}
   * @private
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
   * Validate all ENABLED recipes in a crafting system for ingredient signature
   * conflicts.
   *
   * The scan is scoped to enabled recipes — the exact complement of the runtime
   * matcher's `if (!recipe.enabled) continue;` skip in
   * `CraftingEngine._matchAlchemySignature` — so the scanned set equals the
   * matchable set. Because every gate consumer (`collectAlchemySignatureBlockers`
   * → `blocksSystem`, `_assertNoAlchemySignatureCollisions`, `disableSignatureConflicts`,
   * the adminStore validator, and the 1.17.0 migration reconciliation) funnels
   * through this method, the invariant they all enforce is "the set of ENABLED
   * recipes is collision-free" — the only invariant the runtime needs. Disabling all
   * participants of a conflict genuinely clears it; re-enabling a disabled collider
   * is re-caught at that mutation by the same save-block.
   *
   * @param {string} systemId
   * @returns {{ valid: boolean, conflicts: object[] }}
   */
  validateSystem(systemId) {
    const system = this._csm.getSystem(systemId);
    if (!system) return { valid: true, conflicts: [] };

    const recipes = (this._csm.getRecipesForSystem(systemId) || []).filter(
      (recipe) => recipe?.enabled
    );
    const components = this._csm.getComponentsForSystem(systemId) || [];
    const conflicts = [];

    // Collect all (recipe, ingredientSet, signature) entries. Track each set's
    // 1-based POSITION within its recipe so a conflict can be reported by
    // position (issue 550) — never by the raw Foundry set id, which is opaque to
    // the user and cannot be mapped back to anything in the editor. A set's
    // author-given `name` (when present) is safe to show; an absent name falls
    // back to the position, NOT the id.
    const entries = [];
    for (const recipe of recipes) {
      for (const [index, set] of (recipe.ingredientSets || []).entries()) {
        entries.push({
          recipe: { id: recipe.id, name: recipe.name },
          setId: set.id,
          setPosition: index + 1,
          setName: set.name || null,
          signature: this.computeSignature(set, components),
          groupOptions: this.computeGroupOptions(set, components),
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

        if (this.signaturesOverlap(a, b)) {
          const componentNames = this._overlapComponentNames(a, b, components);
          const setA = a.setName || String(a.setPosition);
          const setB = b.setName || String(b.setPosition);
          const componentsLabel = componentNames.join(', ');
          conflicts.push({
            recipeA: a.recipe,
            ingredientSetA: a.setId,
            recipeB: b.recipe,
            ingredientSetB: b.setId,
            // Stable code + human-readable params so the UI can localize the
            // conflict (issue 550), mirroring the `systemValidation` issue-code
            // pattern. `setA`/`setB` are author names or 1-based positions;
            // `components` are managed-component NAMES — never raw ids.
            code: 'signatureCollision',
            params: {
              recipeA: a.recipe.name,
              recipeB: b.recipe.name,
              setA,
              setB,
              components: componentsLabel,
            },
            // Default English for headless/console callers. Keeps the recipe
            // names and the "Overlapping signatures" phrase (no set id).
            message: componentsLabel
              ? `Overlapping signatures between "${a.recipe.name}" and "${b.recipe.name}" (shared components: ${componentsLabel})`
              : `Overlapping signatures between "${a.recipe.name}" and "${b.recipe.name}"`,
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
