import { getFabricateFlag } from '../config/flags.js';

import { IngredientGroup } from './IngredientGroup.js';
import { getMatchHandler } from './match/matchTypes.js';

/**
 * Node/subset budget for the item-level backtracking assignment search (issue 663).
 * It is a SAFEGUARD, not a normal limit: authored recipes (a handful of groups,
 * options, and matching stacks) find a satisfying assignment on the greedy-first
 * path in on the order of one node per group — orders of magnitude below this
 * bound. Only a pathological input can reach it, at which point the resolver
 * degrades to the deterministic greedy pass (never worse than the pre-663
 * behaviour, never a double-count).
 * @type {number}
 */
export const INGREDIENT_SEARCH_NODE_CAP = 200_000;

/**
 * Represents a set of ingredients that can satisfy a recipe's input requirements
 * Multiple ingredient sets allow recipes to accept alternative combinations (e.g., "2xA OR 1xB + 1xC")
 */
export class IngredientSet {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || '';

    // Ingredient groups: all groups required, one option satisfies each group.
    const groups =
      Array.isArray(data.ingredientGroups) && data.ingredientGroups.length > 0
        ? data.ingredientGroups
        : this._legacyIngredientsToGroups(data.ingredients || []);
    this.ingredientGroups = groups.map((group) =>
      group instanceof IngredientGroup ? group : IngredientGroup.fromJSON(group)
    );

    // Legacy alias retained for older UI code paths.
    this.ingredients = this.ingredientGroups
      .map((group) => group.options?.[0] || null)
      .filter(Boolean);

    // Required essences (accumulated from ingredients)
    this.essences = data.essences || {}; // { 'light': 2, 'fire': 1 }

    // Shared library tool references applying to this ingredient set.
    this.toolIds = this._normalizeToolIds(data.toolIds);

    // Result IDs to produce when this set is used (for variable recipes)
    this.resultMapping = data.resultMapping || [];

    // Mapped mode: direct routing to a specific result group.
    this.resultGroupId = data.resultGroupId || null;
  }

  /**
   * Normalize an array of library tool id strings: coerce to trimmed, non-empty,
   * deduped strings. Tolerant of non-array / nullish input (returns []).
   * @param {unknown} toolIds
   * @returns {string[]}
   */
  _normalizeToolIds(toolIds) {
    if (!Array.isArray(toolIds)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of toolIds) {
      const id = String(raw ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  _legacyIngredientsToGroups(ingredients = []) {
    return (ingredients || []).map((ingredient, idx) => ({
      id: foundry.utils.randomID(),
      name: `Group ${idx + 1}`,
      options: [ingredient],
    }));
  }

  /**
   * Validate that this ingredient set has all required data
   * @param {{requireComplete?: boolean}} [options] - When `requireComplete` is
   *   false, the completeness check (must have at least one ingredient group or
   *   essence requirement) is waived; structural checks still fire.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate({ requireComplete = true } = {}) {
    const errors = [];

    if (
      requireComplete &&
      this.ingredientGroups.length === 0 &&
      Object.keys(this.essences).length === 0
    ) {
      errors.push('Ingredient set must have at least one ingredient group or essence requirement');
    }

    // Validate ingredient groups/options. Name the group by author-name or 1-based
    // position (never its internal id) so this detail — surfaced through the recipe's
    // `ingredientSetInvalid` issue — cannot leak an id on save (issue 595).
    for (const [groupIndex, group] of this.ingredientGroups.entries()) {
      const groupValidation = group.validate({ requireComplete });
      if (!groupValidation.valid) {
        const groupLabel =
          typeof group.name === 'string' && group.name.trim()
            ? group.name.trim()
            : String(groupIndex + 1);
        errors.push(`Ingredient group "${groupLabel}": ${groupValidation.errors.join(', ')}`);
      }
    }

    // Validate essence requirements. The set is mode/system-unaware here, so it
    // cannot resolve an essence NAME; a bad quantity is reported name-free rather
    // than echoing the raw essence id (issue 595). RecipeManager's essence-reference
    // validator surfaces the same failure with a resolved essence name when it can.
    for (const quantity of Object.values(this.essences)) {
      if (typeof quantity !== 'number' || quantity <= 0) {
        errors.push('An essence requirement must have a positive quantity');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if this ingredient set can be crafted with the given items
   * @param {Item[]} availableItems - Items from actor(s)
   * @param {{ resolveItemEssences?: (item: object) => Record<string, number> }} [opts] -
   *   the bound essence resolver forwarded to {@link resolveIngredientSelection} so an
   *   essence group option can draw down essence-carrying items. Defaults (undefined)
   *   to the flag-only resolver, keeping the legacy item-only path byte-for-byte.
   * @returns {boolean}
   */
  canBeCraftedWith(availableItems, { resolveItemEssences } = {}) {
    const selection = this.resolveIngredientSelection(availableItems, null, {
      resolveItemEssences,
    });
    if (!selection.success) return false;

    // Check if all essence requirements are satisfied
    if (Object.keys(this.essences).length > 0) {
      const accumulatedEssences = this._accumulateEssences(availableItems);

      for (const [essenceType, requiredQty] of Object.entries(this.essences)) {
        const availableQty = accumulatedEssences[essenceType] || 0;
        if (availableQty < requiredQty) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Accumulate essences from all available items
   * @param {Item[]} items - Items to check
   * @returns {Object} - Accumulated essences { 'light': 3, 'fire': 2 }
   * @private
   */
  _accumulateEssences(items) {
    const accumulated = {};

    for (const item of items) {
      const itemEssences = getFabricateFlag(item, 'essences', {});
      for (const [essenceType, quantity] of Object.entries(itemEssences)) {
        accumulated[essenceType] = (accumulated[essenceType] || 0) + quantity;
      }
    }

    return accumulated;
  }

  /**
   * Match ingredients to available items and return consumption plan
   * @param {Item[]} availableItems - Items from actor(s)
   * @param {Function|null} [matcher] - `(ingredient, item) => boolean` override
   * @param {{ affordCurrency?: (match: object) => boolean }} [opts] - forwarded to
   *   {@link resolveIngredientSelection}; the `currencySpends` it returns are NOT
   *   part of the item plan this method returns (currency is spent separately).
   * @returns {Array<{item: Item, quantity: number, ingredient: Ingredient}>}
   */
  matchIngredients(availableItems, matcher = null, opts = {}) {
    const selection = this.resolveIngredientSelection(availableItems, matcher, opts);
    return selection.success ? selection.plan : [];
  }

  /**
   * Resolve which option satisfies each ingredient group, building the item
   * consumption plan and (when a currency probe is supplied) the currency spends.
   *
   * The set is satisfiable iff there EXISTS an assignment of items to its AND-groups
   * that satisfies every group (one option each, respecting per-option quantity and
   * the shared no-double-count `remaining` ledger). An item-level bounded
   * backtracking search (issue 663) finds such an assignment whenever one exists, so
   * craftability does not depend on inventory or group iteration order — a
   * dual-purpose item (one satisfying more than one requirement) is no longer
   * greedily consumed by the wrong group, causing a false `insufficient`.
   *
   * The search is deterministic and zero-churn: it tries the greedy author-order
   * choice FIRST at every node (per group, non-currency options in author order then
   * currency options; per option, the greedy item subset then alternatives), so any
   * assignment the pre-663 greedy pass satisfied is returned byte-for-byte, and only
   * a recipe that greedy wrongly rejected gains a newly found alternative.
   *
   * Items strictly beat currency (the ordering MECHANISM): a currency option is
   * considered for a group only AFTER every item/essence branch for the set has been
   * exhausted (currency is free — no `remaining` draw — so it is ordered last). A
   * satisfied currency group adds a `{ unit, amount, ingredient }` entry to
   * `currencySpends`; the item `plan` stays item-only.
   *
   * With no `affordCurrency` probe (the default), currency is NEVER chosen, so the
   * result is byte-for-byte the legacy item-only behavior that `canBeCraftedWith`
   * and the display path rely on.
   *
   * A per-group `optionOverrides` map (keyed by `group.id` — an Ingredient has no
   * stable id) lets a caller (the player-facing per-slot selector, issue 552) pick
   * a SPECIFIC option for a group instead of the first-satisfiable default. Each
   * entry is `{ optionIndex, heldItemId? }`. When an override names a valid option
   * index, THAT option is resolved (never the author-order fallback), honoured
   * whether satisfiable or not: a satisfiable option wins; a short option reports
   * the group missing with THAT option's have/need (the caller still blocks the
   * craft with the usual missing-materials message). A `heldItemId` restricts a tag
   * option to one specific held stack so the player can choose which of several
   * matching held items to consume. An explicit currency override routes to
   * `currencySpends` when affordable (an EXPLICIT player choice may pick a currency
   * option over an available item — the default items-first rule is unchanged). A
   * group with no override keeps the byte-for-byte default resolution.
   *
   * An `resolveItemEssences` probe supplies each item's essence map so an ESSENCE
   * group option can draw down essence-carrying items (see
   * {@link _buildPlanForEssenceOption}). It defaults to a flag-only resolver, which
   * keeps the no-probe `canBeCraftedWith`/display path byte-for-byte; component-aware
   * callers bind a resolver that also reads component-defined essences.
   *
   * @param {Item[]} availableItems
   * @param {Function|null} [matcher]
   * @param {{ affordCurrency?: (match: object) => boolean,
   *   optionOverrides?: Record<string, {optionIndex: number, heldItemId?: string|null}>,
   *   resolveItemEssences?: (item: object) => Record<string, number> }} [options]
   * @returns {{ success: boolean, selectedIngredients: Ingredient[],
   *   plan: Array<{item: Item, quantity: number, ingredient: Ingredient}>,
   *   currencySpends: Array<{unit: string, amount: number, ingredient: Ingredient}>,
   *   missingGroups: Array<object> }}
   */
  resolveIngredientSelection(
    availableItems,
    matcher = null,
    { affordCurrency, optionOverrides, resolveItemEssences } = {}
  ) {
    const resolveEssences = this._essenceResolver(resolveItemEssences);
    const ctx = { affordCurrency, optionOverrides, resolveEssences };

    // Item-level bounded backtracking (issue 663): find a satisfying item->group
    // assignment whenever one exists. The search tries the greedy author-order
    // choice first at every node, so any assignment greedy resolution satisfies
    // today is returned byte-identical (zero churn); only a recipe greedy wrongly
    // rejected gains a newly found alternative.
    const search = this._searchAssignment(availableItems, matcher, ctx);
    if (search.selection) return search.selection;

    // Proven unsatisfiable, or the generous search bound was reached (a safeguard
    // degradation that is never worse than the pre-663 behaviour and never
    // double-counts): fall back to the author-order greedy pass. It yields the
    // deterministic, optionOverrides-aware missingGroups (have/need) callers rely on.
    if (search.capHit) {
      console.warn(
        `Fabricate | IngredientSet ${this.id}: ingredient assignment search reached its ` +
          `${INGREDIENT_SEARCH_NODE_CAP}-node bound; falling back to greedy resolution ` +
          '(a satisfiable assignment may be missed for this pathological input).'
      );
    }
    return this._resolveGreedy(availableItems, matcher, ctx);
  }

  /**
   * The essence resolver used by the selection paths: the caller-supplied probe, or
   * a flag-only default mirroring the legacy `_accumulateEssences` so the no-probe
   * `canBeCraftedWith`/display path stays byte-for-byte. Component-aware callers
   * (RecipeManager/CraftingEngine) bind the real resolver so standard craft can also
   * resolve component-defined essences.
   * @private
   */
  _essenceResolver(resolveItemEssences) {
    return typeof resolveItemEssences === 'function'
      ? resolveItemEssences
      : (item) => getFabricateFlag(item, 'essences', {});
  }

  /**
   * Build the initial remaining-quantity ledger (item key -> available units),
   * shared by the search and the greedy pass.
   * @private
   */
  _initialRemaining(availableItems) {
    const remaining = new Map();
    for (const item of availableItems) {
      remaining.set(this._itemKey(item), Number(item.system?.quantity || 1));
    }
    return remaining;
  }

  /**
   * The author-order greedy resolution (the pre-issue-663 behaviour), retained as
   * the deterministic `missingGroups` source and the bounded-search safeguard
   * fallback. Per group: honour an `optionOverrides` pin, else take the first
   * item-satisfiable non-currency option, else the first affordable currency option;
   * items strictly beat currency.
   * @private
   */
  _resolveGreedy(availableItems, matcher, { affordCurrency, optionOverrides, resolveEssences }) {
    const remaining = this._initialRemaining(availableItems);

    const selectedIngredients = [];
    const plan = [];
    const currencySpends = [];
    const missingGroups = [];

    for (const group of this.ingredientGroups) {
      const options = group.options || [];

      // Player override (issue 552): resolve the explicitly chosen option instead
      // of the first-satisfiable default. Honoured whether satisfiable or not.
      const override = this._resolveGroupOverride(optionOverrides, group, options);
      if (override) {
        const option = options[override.optionIndex];
        if (option?.match?.type === 'currency') {
          const spend = this._currencySpendFor(option, affordCurrency);
          if (spend) {
            selectedIngredients.push(option);
            currencySpends.push({ unit: spend.unit, amount: spend.amount, ingredient: option });
          } else {
            missingGroups.push({ group, ingredient: option, have: 0, need: option.quantity });
          }
          continue;
        }
        if (option?.match?.type === 'essence') {
          const essenceCandidate = this._buildPlanForEssenceOption(
            option,
            availableItems,
            remaining,
            resolveEssences
          );
          if (essenceCandidate.ok) {
            selectedIngredients.push(option);
            this._commitItemPlan(essenceCandidate.plan, plan, remaining);
          } else {
            missingGroups.push({
              group,
              ingredient: option,
              have: essenceCandidate.have,
              need: Math.max(0, Number(option?.match?.amount) || 0),
            });
          }
          continue;
        }
        const candidate = this._buildPlanForIngredient(
          option,
          availableItems,
          remaining,
          matcher,
          override.heldItemId
        );
        if (candidate.ok) {
          selectedIngredients.push(option);
          this._commitItemPlan(candidate.plan, plan, remaining);
        } else {
          missingGroups.push({
            group,
            ingredient: option,
            have: candidate.have,
            need: option.quantity,
          });
        }
        continue;
      }

      let chosen = null;
      let bestMissing = null;

      // Items-first: try every non-currency option; first item-satisfiable wins. An
      // essence option is item-satisfiable too — it draws down items carrying the
      // essence via `_buildPlanForEssenceOption` (parallel to `_buildPlanForIngredient`).
      for (const option of options) {
        if (option?.match?.type === 'currency') continue;
        const isEssence = option?.match?.type === 'essence';
        const candidate = isEssence
          ? this._buildPlanForEssenceOption(option, availableItems, remaining, resolveEssences)
          : this._buildPlanForIngredient(option, availableItems, remaining, matcher);
        if (candidate.ok) {
          chosen = { option, plan: candidate.plan };
          break;
        }
        const need = isEssence ? Math.max(0, Number(option?.match?.amount) || 0) : option.quantity;
        if (!bestMissing || candidate.have > bestMissing.have) {
          bestMissing = { ingredient: option, have: candidate.have, need };
        }
      }

      // Currency-fallback: only if no item option satisfied, choose the first
      // AFFORDABLE currency option (author order among currency options).
      let chosenCurrency = null;
      if (!chosen) {
        for (const option of options) {
          if (option?.match?.type !== 'currency') continue;
          const handler = getMatchHandler(option.match);
          if (handler.affords(option.match, { affordCurrency })) {
            chosenCurrency = { option, spend: handler.getCurrencySpend(option.match) };
            break;
          }
          // Track an unaffordable currency option as the missing representative
          // when the group has no item option at all (so the missing entry can
          // surface the currency requirement).
          if (!bestMissing) {
            bestMissing = { ingredient: option, have: 0, need: option.quantity };
          }
        }
      }

      if (chosenCurrency?.spend) {
        selectedIngredients.push(chosenCurrency.option);
        currencySpends.push({
          unit: chosenCurrency.spend.unit,
          amount: chosenCurrency.spend.amount,
          ingredient: chosenCurrency.option,
        });
        continue;
      }

      if (!chosen) {
        missingGroups.push({
          group,
          ...bestMissing,
        });
        continue;
      }

      selectedIngredients.push(chosen.option);
      this._commitItemPlan(chosen.plan, plan, remaining);
    }

    return {
      success: missingGroups.length === 0,
      selectedIngredients,
      plan,
      currencySpends,
      missingGroups,
    };
  }

  /**
   * Item-level bounded backtracking over the ingredient groups (issue 663).
   * Traverses groups in AUTHOR order (preserving the positional
   * `selectedIngredients` contract `RecipeManager._chosenOptionByGroup` reads); at
   * each group tries its choices lazily in the order [non-currency options in author
   * order, then currency options in author order], and for each non-currency option
   * branches over candidate item subsets with the greedy subset first. The
   * `remaining` ledger is snapshot/restored per node, so a committed choice is
   * cleanly undone on backtrack — the first complete assignment under this fixed
   * traversal wins.
   *
   * @returns {{ selection: object|null, nodes: number, capHit: boolean }} `selection`
   *   is the success result (exact `resolveIngredientSelection` shape) or null when
   *   no assignment was found (unsatisfiable, or the node bound was reached).
   * @private
   */
  _searchAssignment(availableItems, matcher, ctx) {
    const remaining = this._initialRemaining(availableItems);
    const acc = { selectedIngredients: [], plan: [], currencySpends: [] };
    const budget = { nodes: 0, capHit: false };
    const found = this._searchGroup(0, remaining, acc, availableItems, matcher, ctx, budget);
    if (found) {
      return {
        selection: {
          success: true,
          selectedIngredients: [...acc.selectedIngredients],
          plan: [...acc.plan],
          currencySpends: [...acc.currencySpends],
          missingGroups: [],
        },
        nodes: budget.nodes,
        capHit: budget.capHit,
      };
    }
    return { selection: null, nodes: budget.nodes, capHit: budget.capHit };
  }

  /**
   * Recursive DFS body for {@link _searchAssignment}. Returns true when groups
   * `[index..]` all receive a satisfying assignment against `remaining`, mutating
   * `acc` into the accumulated selection along the successful path.
   * @private
   */
  _searchGroup(index, remaining, acc, availableItems, matcher, ctx, budget) {
    if (budget.capHit) return false;
    if (index >= this.ingredientGroups.length) return true;
    if (++budget.nodes > INGREDIENT_SEARCH_NODE_CAP) {
      budget.capHit = true;
      return false;
    }

    const group = this.ingredientGroups[index];
    const options = group.options || [];
    for (const choice of this._groupChoices(
      group,
      options,
      remaining,
      availableItems,
      matcher,
      ctx,
      budget
    )) {
      if (budget.capHit) return false;
      const snapshot = new Map(remaining);
      acc.selectedIngredients.push(choice.option);
      if (choice.currency) {
        acc.currencySpends.push({
          unit: choice.currency.unit,
          amount: choice.currency.amount,
          ingredient: choice.option,
        });
      } else {
        this._commitItemPlan(choice.plan, acc.plan, remaining);
      }

      if (this._searchGroup(index + 1, remaining, acc, availableItems, matcher, ctx, budget)) {
        return true;
      }

      acc.selectedIngredients.pop();
      if (choice.currency) {
        acc.currencySpends.pop();
      } else {
        acc.plan.length -= choice.plan.length;
      }
      this._restoreRemaining(remaining, snapshot);
    }
    return false;
  }

  /**
   * Reset `remaining` in place to a snapshot, undoing a committed search branch.
   * @private
   */
  _restoreRemaining(remaining, snapshot) {
    remaining.clear();
    for (const [key, value] of snapshot) remaining.set(key, value);
  }

  /**
   * Lazily yield the ordered candidate choices for one group against the current
   * `remaining`. Honours an `optionOverrides` pin (the OPTION is fixed but its item
   * subset is still branchable in the shared pool); otherwise every non-currency
   * option (author order) contributes its item-subset candidates, then every
   * affordable currency option (author order) contributes a free currency choice.
   * Laziness keeps the greedy-first success path to ~one candidate per group.
   * @private
   */
  *_groupChoices(group, options, remaining, availableItems, matcher, ctx, budget) {
    const override = this._resolveGroupOverride(ctx.optionOverrides, group, options);
    if (override) {
      const option = options[override.optionIndex];
      if (option?.match?.type === 'currency') {
        const spend = this._currencySpendFor(option, ctx.affordCurrency);
        if (spend) yield { option, plan: [], currency: spend };
        return;
      }
      yield* this._optionItemChoices(
        option,
        availableItems,
        remaining,
        matcher,
        ctx.resolveEssences,
        override.heldItemId,
        budget
      );
      return;
    }

    for (const option of options) {
      if (option?.match?.type === 'currency') continue;
      yield* this._optionItemChoices(
        option,
        availableItems,
        remaining,
        matcher,
        ctx.resolveEssences,
        null,
        budget
      );
    }
    for (const option of options) {
      if (option?.match?.type !== 'currency') continue;
      const spend = this._currencySpendFor(option, ctx.affordCurrency);
      if (spend) yield { option, plan: [], currency: spend };
    }
  }

  /**
   * Lazily yield the item-consumption candidates for a NON-currency option against
   * the current `remaining`, greedy subset first (byte-identical to the plan
   * builder's pick), then alternative subsets that free contended items.
   * @private
   */
  *_optionItemChoices(
    option,
    availableItems,
    remaining,
    matcher,
    resolveEssences,
    restrictItemId,
    budget
  ) {
    if (option?.match?.type === 'essence') {
      yield* this._essenceOptionChoices(option, availableItems, remaining, resolveEssences, budget);
      return;
    }
    yield* this._componentTagOptionChoices(
      option,
      availableItems,
      remaining,
      matcher,
      restrictItemId,
      budget
    );
  }

  /**
   * Candidate item plans for a component/tag option: the greedy front-loaded pick
   * first (via {@link _buildPlanForIngredient}), then every distinct alternative
   * unit-count assignment over the matching stacks that also meets `quantity`.
   * Yields nothing when even the full matching pool cannot meet the quantity (no
   * subset can either), which prunes the branch.
   * @private
   */
  *_componentTagOptionChoices(option, availableItems, remaining, matcher, restrictItemId, budget) {
    const greedy = this._buildPlanForIngredient(
      option,
      availableItems,
      remaining,
      matcher,
      restrictItemId
    );
    if (!greedy.ok) return;

    yield { option, plan: greedy.plan, currency: null };

    const seen = new Set([this._planSignature(greedy.plan)]);
    const matchingItems = this._matchingItemsWithAvail(
      option,
      availableItems,
      remaining,
      matcher,
      restrictItemId
    );
    for (const plan of this._enumerateUnitPlans(option, matchingItems, option.quantity, budget)) {
      if (budget.capHit) return;
      const signature = this._planSignature(plan);
      if (seen.has(signature)) continue;
      seen.add(signature);
      yield { option, plan, currency: null };
    }
  }

  /**
   * Candidate item plans for an essence option: the greedy front-loaded draw first
   * (via {@link _buildPlanForEssenceOption}), then every distinct plan produced by
   * excluding one or more essence-carrying stacks (freeing them for other groups).
   * Yields nothing when even the full pool cannot meet `amount`.
   * @private
   */
  *_essenceOptionChoices(option, availableItems, remaining, resolveEssences, budget) {
    const greedy = this._buildPlanForEssenceOption(
      option,
      availableItems,
      remaining,
      resolveEssences
    );
    if (!greedy.ok) return;

    yield { option, plan: greedy.plan, currency: null };

    const seen = new Set([this._planSignature(greedy.plan)]);
    const essenceId = String(option?.match?.essenceId || '').trim();
    const carriers = availableItems.filter((item) => {
      if (Number(remaining.get(this._itemKey(item)) || 0) <= 0) return false;
      return (Number(resolveEssences(item)?.[essenceId]) || 0) > 0;
    });
    for (const subset of this._enumerateSubsets(carriers, budget)) {
      if (budget.capHit) return;
      const candidate = this._buildPlanForEssenceOption(option, subset, remaining, resolveEssences);
      if (!candidate.ok) continue;
      const signature = this._planSignature(candidate.plan);
      if (seen.has(signature)) continue;
      seen.add(signature);
      yield { option, plan: candidate.plan, currency: null };
    }
  }

  /**
   * The matching stacks (respecting `matcher`/`restrictItemId`) with a positive
   * remaining count, in availableItems order — the domain the unit-count
   * enumeration draws from (mirrors {@link _buildPlanForIngredient}'s filter, with
   * the availability snapshotted so later `remaining` mutations do not disturb it).
   * @private
   */
  _matchingItemsWithAvail(option, availableItems, remaining, matcher, restrictItemId) {
    const out = [];
    for (const item of availableItems) {
      if (restrictItemId && this._itemKey(item) !== restrictItemId) continue;
      const matched = matcher ? matcher(option, item) : option.matches(item);
      if (!matched) continue;
      const avail = Number(remaining.get(this._itemKey(item)) || 0);
      if (avail > 0) out.push({ item, avail });
    }
    return out;
  }

  /**
   * Enumerate the distinct unit-count plans over `matchingItems` consuming exactly
   * `need` units, front-loaded (greedy) first. Each yielded plan is an array of
   * `{ item, quantity, ingredient }`. Bounded by the shared node budget.
   * @private
   */
  *_enumerateUnitPlans(option, matchingItems, need, budget) {
    yield* this._enumerateUnitPlansFrom(option, matchingItems, 0, need, [], budget);
  }

  /**
   * Recursive helper for {@link _enumerateUnitPlans}: assign `remainingNeed` units
   * across `matchingItems[index..]`, taking the most from the earliest stack first
   * so the first complete plan is the front-loaded greedy pick.
   * @private
   */
  *_enumerateUnitPlansFrom(option, matchingItems, index, remainingNeed, entries, budget) {
    if (++budget.nodes > INGREDIENT_SEARCH_NODE_CAP) {
      budget.capHit = true;
      return;
    }
    if (remainingNeed === 0) {
      yield entries.map((entry) => ({
        item: entry.item,
        quantity: entry.quantity,
        ingredient: option,
      }));
      return;
    }
    if (index >= matchingItems.length) return;

    const { item, avail } = matchingItems[index];
    const maxHere = Math.min(avail, remainingNeed);
    for (let take = maxHere; take >= 0; take -= 1) {
      if (budget.capHit) return;
      if (take > 0) entries.push({ item, quantity: take });
      yield* this._enumerateUnitPlansFrom(
        option,
        matchingItems,
        index + 1,
        remainingNeed - take,
        entries,
        budget
      );
      if (take > 0) entries.pop();
    }
  }

  /**
   * Enumerate the subsets of `items`, the full set first (so an essence option's
   * greedy full-pool draw is reached before any exclusion). Bounded by the node
   * budget.
   * @private
   */
  *_enumerateSubsets(items, budget) {
    yield* this._enumerateSubsetsFrom(items, 0, [], budget);
  }

  /**
   * Recursive helper for {@link _enumerateSubsets}: include-before-exclude so the
   * first yielded subset is the whole set.
   * @private
   */
  *_enumerateSubsetsFrom(items, index, chosen, budget) {
    if (++budget.nodes > INGREDIENT_SEARCH_NODE_CAP) {
      budget.capHit = true;
      return;
    }
    if (index >= items.length) {
      yield [...chosen];
      return;
    }
    chosen.push(items[index]);
    yield* this._enumerateSubsetsFrom(items, index + 1, chosen, budget);
    chosen.pop();
    if (budget.capHit) return;
    yield* this._enumerateSubsetsFrom(items, index + 1, chosen, budget);
  }

  /**
   * A canonical dedup key for a candidate item plan. Plan entries are always built
   * in availableItems order, so a positional join is stable; it distinguishes plans
   * by which stacks are drawn and by how much.
   * @private
   */
  _planSignature(plan) {
    return plan.map((entry) => `${this._itemKey(entry.item)}x${entry.quantity}`).join('|');
  }

  /**
   * Resolve a validated `{ optionIndex, heldItemId }` override for a group, or null
   * when there is no override (or it names an out-of-range option, in which case the
   * default author-order resolution applies). Keyed by `group.id`.
   * @private
   */
  _resolveGroupOverride(optionOverrides, group, options) {
    const raw = optionOverrides?.[group?.id];
    if (!raw) return null;
    const idx = Number(raw.optionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;
    return { optionIndex: idx, heldItemId: raw.heldItemId ?? null };
  }

  /**
   * The affordable currency spend for a currency option, or null when the option is
   * not currency or the actor cannot afford it.
   * @private
   */
  _currencySpendFor(option, affordCurrency) {
    if (option?.match?.type !== 'currency') return null;
    const handler = getMatchHandler(option.match);
    if (!handler.affords(option.match, { affordCurrency })) return null;
    return handler.getCurrencySpend(option.match);
  }

  /**
   * Append a chosen option's item plan entries to the running plan and deduct their
   * quantities from the remaining pool (shared by the default and override paths so
   * the remaining-quantity bookkeeping stays identical).
   * @private
   */
  _commitItemPlan(candidatePlan, plan, remaining) {
    for (const entry of candidatePlan) {
      plan.push(entry);
      const key = this._itemKey(entry.item);
      const next = (remaining.get(key) || 0) - entry.quantity;
      remaining.set(key, Math.max(0, next));
    }
  }

  _buildPlanForIngredient(
    ingredient,
    availableItems,
    remaining,
    matcher = null,
    restrictItemId = null
  ) {
    // A currency option is never item-satisfiable: short-circuit to not-satisfiable
    // so the resolver never item-matches it (currency is chosen by the affordability
    // probe in the fallback pass, not here).
    if (ingredient?.match?.type === 'currency') {
      return { ok: false, plan: [], have: 0 };
    }

    let neededQuantity = ingredient.quantity;
    const optionPlan = [];
    let totalAvailable = 0;

    // `restrictItemId` (issue 552 tag-stack choice) narrows a tag option to one
    // specific held stack the player picked, so the craft consumes THAT item.
    const matchingItems = availableItems.filter((item) => {
      if (restrictItemId && this._itemKey(item) !== restrictItemId) return false;
      return matcher ? matcher(ingredient, item) : ingredient.matches(item);
    });

    for (const item of matchingItems) {
      const key = this._itemKey(item);
      const availableQty = Number(remaining.get(key) || 0);
      if (availableQty <= 0) continue;

      totalAvailable += availableQty;
      if (neededQuantity <= 0) continue;

      const toConsume = Math.min(neededQuantity, availableQty);
      optionPlan.push({
        item,
        quantity: toConsume,
        ingredient,
      });
      neededQuantity -= toConsume;
    }

    return {
      ok: neededQuantity <= 0,
      plan: optionPlan,
      have: totalAvailable,
    };
  }

  /**
   * Build the item-consumption plan for an ESSENCE option: draw down items whose
   * accumulated `essenceId` essence reaches the option's `amount`, unit-granular.
   * Parallel to {@link _buildPlanForIngredient} — it reads the shared `remaining`
   * Map (skipping items already exhausted by a component/tag group in the same set,
   * the anti-double-consume invariant) and returns entries committed through
   * {@link _commitItemPlan}. Consumption is unit-granular, so an indivisible item
   * may over-consume past `amount` (symmetric with tag/component options).
   *
   * The per-item essence map comes from the injected `resolveItemEssences` probe
   * (flag-only by default, component-aware in callers), NEVER from
   * `Ingredient.matches()`.
   *
   * @param {object} option - the essence Ingredient option
   * @param {Item[]} availableItems
   * @param {Map<string, number>} remaining
   * @param {(item: object) => Record<string, number>} resolveItemEssences
   * @returns {{ ok: boolean, plan: Array<{item: object, quantity: number, ingredient: object}>, have: number }}
   * @private
   */
  _buildPlanForEssenceOption(option, availableItems, remaining, resolveItemEssences) {
    const essenceId = String(option?.match?.essenceId || '').trim();
    const amount = Math.max(0, Number(option?.match?.amount) || 0);
    if (!essenceId || amount <= 0) {
      // A zero-amount / id-less essence option is a runtime no-op — satisfied with no
      // consumption (mirrors dropping non-positive essence entries at migration).
      return { ok: true, plan: [], have: 0 };
    }

    let accumulated = 0;
    let totalAvailable = 0;
    const optionPlan = [];

    for (const item of availableItems) {
      const key = this._itemKey(item);
      const availableUnits = Number(remaining.get(key) || 0);
      if (availableUnits <= 0) continue;

      const essences = resolveItemEssences ? resolveItemEssences(item) : {};
      const perUnit = Number(essences?.[essenceId]) || 0;
      if (perUnit <= 0) continue;

      totalAvailable += perUnit * availableUnits;
      if (accumulated >= amount) continue;

      // Units needed to reach the remaining requirement (unit-granular; the last
      // unit may over-consume past `amount` when the item is worth more per unit).
      const unitsNeeded = Math.ceil((amount - accumulated) / perUnit);
      const unitsToConsume = Math.min(unitsNeeded, availableUnits);
      optionPlan.push({ item, quantity: unitsToConsume, ingredient: option });
      accumulated += perUnit * unitsToConsume;
    }

    return {
      ok: accumulated >= amount,
      plan: optionPlan,
      have: totalAvailable,
    };
  }

  _itemKey(item) {
    return item.uuid || item.id;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      ingredientGroups: this.ingredientGroups.map((group) => group.toJSON()),
      // Legacy alias retained for compatibility with older consumers.
      ingredients: this.ingredients.map((i) => i.toJSON()),
      essences: this.essences,
      toolIds: [...this.toolIds],
      resultMapping: this.resultMapping,
      resultGroupId: this.resultGroupId,
    };
  }

  static fromJSON(data) {
    return new IngredientSet(data);
  }
}
