import { getFabricateFlag } from '../config/flags.js';
// `itemStackQuantity.js` never touches `game`, `ui`, `Hooks` or `CONFIG` — it receives
// the configured path by push — so importing it here does NOT break the ingredient
// model's Foundry-free contract (`openspec/specs/data-models/spec.md:1328`).
import { readStackQuantity } from '../systems/itemStackQuantity.js';
import { clampAllocation, deliveredEssences, greedyAllocate } from '../utils/essenceAllocation.js';

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
   * `currencySpends`; the item `plan` stays item-only. That ordering survives the
   * essence block: a group authored `[essence, currency]` takes the block branch
   * first, and a block that cannot fund backtracks INTO the currency option.
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
   * {@link _resolveEssenceBlock}). It defaults to a flag-only resolver, which keeps
   * the no-probe `canBeCraftedWith`/display path byte-for-byte; component-aware
   * callers bind a resolver that also reads component-defined essences.
   *
   * Every essence option in the set resolves in ONE shared, backtrackable essence
   * BLOCK placed last, after every component/tag group has claimed from `remaining`
   * (issue 917). `essenceAllocation` lets the player steer which held stacks fund
   * that block; `allocateEssences` overrides the suggestion strategy for a test or a
   * caller that has already computed one. See {@link _resolveEssenceBlock}.
   *
   * @param {Item[]} availableItems
   * @param {Function|null} [matcher]
   * @param {{ affordCurrency?: (match: object) => boolean,
   *   optionOverrides?: Record<string, {optionIndex: number, heldItemId?: string|null}>,
   *   resolveItemEssences?: (item: object) => Record<string, number>,
   *   essenceAllocation?: Record<string, number>|null,
   *   allocateEssences?: (requirements: Array<object>, carriers: Array<object>,
   *     availableUnits: Record<string, number>) => Record<string, number> }} [options]
   * @returns {{ success: boolean, selectedIngredients: Ingredient[],
   *   plan: Array<{item: Item, quantity: number, ingredient: Ingredient, essenceGroupIds?: string[]}>,
   *   currencySpends: Array<{unit: string, amount: number, ingredient: Ingredient}>,
   *   missingGroups: Array<object>, essenceAllocation: Record<string, number>,
   *   essencePool: object|null }}
   */
  resolveIngredientSelection(
    availableItems,
    matcher = null,
    {
      affordCurrency,
      optionOverrides,
      resolveItemEssences,
      essenceAllocation,
      allocateEssences,
    } = {}
  ) {
    const resolveEssences = this._essenceResolver(resolveItemEssences);
    const ctx = {
      affordCurrency,
      optionOverrides,
      resolveEssences,
      essenceAllocation: essenceAllocation ?? null,
      allocate: typeof allocateEssences === 'function' ? allocateEssences : greedyAllocate,
    };

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
      // BLOCKING routing site (issue 1024): this ledger is what the whole consumption
      // plan is computed from. Leaving it on a hardcoded path while `_consumeIngredients`
      // reads the configured one would split the read from the write one layer up —
      // exactly the failure the single-resolved-path requirement forbids.
      remaining.set(this._itemKey(item), readStackQuantity(item));
    }
    return remaining;
  }

  /**
   * The author-order greedy resolution (the pre-issue-663 behaviour), retained as
   * the deterministic `missingGroups` source and the bounded-search safeguard
   * fallback. Per group: honour an `optionOverrides` pin, else take the first
   * item-satisfiable non-currency option, else the first affordable currency option;
   * items strictly beat currency.
   *
   * Three passes, because the essence block is resolved LAST (issue 917) while
   * `selectedIngredients` must still be emitted in AUTHOR-GROUP order — the
   * positional contract `RecipeManager._chosenOptionByGroup` reads by running index:
   *
   *  1. every component/tag/currency group claims from `remaining`; an essence option
   *     claims nothing and only records its block membership;
   *  2. the block draws from what pass 1 left;
   *  3. the per-group outcomes are emitted in author order, essence groups included.
   * @private
   */
  _resolveGreedy(availableItems, matcher, ctx) {
    const pass = {
      availableItems,
      matcher,
      ctx,
      remaining: this._initialRemaining(availableItems),
      plan: [],
      currencySpends: [],
    };

    const outcomes = this.ingredientGroups.map((group) => this._resolveGroupGreedy(group, pass));

    const members = outcomes.filter((outcome) => outcome.member).map((outcome) => outcome.member);
    const block = this._resolveEssenceBlock(members, availableItems, pass.remaining, ctx);
    this._commitItemPlan(block.plan, pass.plan, pass.remaining);

    const { selectedIngredients, missingGroups } = this._collectGreedyOutcomes(outcomes, block);
    return {
      success: missingGroups.length === 0,
      selectedIngredients,
      plan: pass.plan,
      currencySpends: pass.currencySpends,
      missingGroups,
      essenceAllocation: block.allocation,
      essencePool: this._essencePoolFrom(block),
    };
  }

  /**
   * Resolve ONE group in the greedy pass, mutating the pass accumulators for a
   * component/tag/currency choice. Returns a per-group outcome:
   * `{ option }` for a resolved group, `{ member }` for one deferred to the essence
   * block, or `{ missing }` for a short group.
   * @private
   */
  _resolveGroupGreedy(group, pass) {
    const options = group.options || [];
    // Player override (issue 552): resolve the explicitly chosen option instead of
    // the first-satisfiable default. Honoured whether satisfiable or not.
    const override = this._resolveGroupOverride(pass.ctx.optionOverrides, group, options);
    if (override) {
      return this._resolveOverriddenGroupGreedy(
        group,
        options[override.optionIndex],
        override,
        pass
      );
    }
    return this._resolveFirstSatisfiableGroupGreedy(group, options, pass);
  }

  /**
   * The `optionOverrides` branch of {@link _resolveGroupGreedy}: THAT option is
   * resolved, satisfiable or not.
   * @private
   */
  _resolveOverriddenGroupGreedy(group, option, override, pass) {
    if (option?.match?.type === 'currency') {
      const spend = this._currencySpendFor(option, pass.ctx.affordCurrency);
      if (!spend) return { missing: { group, ingredient: option, have: 0, need: option.quantity } };
      pass.currencySpends.push({ unit: spend.unit, amount: spend.amount, ingredient: option });
      return { option };
    }
    if (option?.match?.type === 'essence') {
      return { member: this._essenceMember(group, option) };
    }
    const candidate = this._buildPlanForIngredient(
      option,
      pass.availableItems,
      pass.remaining,
      pass.matcher,
      override.heldItemId
    );
    if (!candidate.ok) {
      return {
        missing: { group, ingredient: option, have: candidate.have, need: option.quantity },
      };
    }
    this._commitItemPlan(candidate.plan, pass.plan, pass.remaining);
    return { option };
  }

  /**
   * The default branch of {@link _resolveGroupGreedy}: items-first, then currency.
   * An essence option is taken by DEFERRING it to the block — greedy cannot know in
   * author position whether the block funds it, and the bounded search (which runs
   * first) is what re-branches a group whose block branch fails.
   * @private
   */
  _resolveFirstSatisfiableGroupGreedy(group, options, pass) {
    let bestMissing = null;

    for (const option of options) {
      if (option?.match?.type === 'currency') continue;
      if (option?.match?.type === 'essence') return { member: this._essenceMember(group, option) };
      const candidate = this._buildPlanForIngredient(
        option,
        pass.availableItems,
        pass.remaining,
        pass.matcher
      );
      if (candidate.ok) {
        this._commitItemPlan(candidate.plan, pass.plan, pass.remaining);
        return { option };
      }
      if (!bestMissing || candidate.have > bestMissing.have) {
        bestMissing = { ingredient: option, have: candidate.have, need: option.quantity };
      }
    }

    return this._resolveCurrencyFallbackGreedy(group, options, bestMissing, pass);
  }

  /**
   * Currency-fallback for {@link _resolveFirstSatisfiableGroupGreedy}: only when no
   * item option satisfied, choose the first AFFORDABLE currency option (author order
   * among currency options). The first unaffordable currency option becomes the
   * missing representative when the group has no item option at all, so the missing
   * entry can still surface the currency requirement.
   * @private
   */
  _resolveCurrencyFallbackGreedy(group, options, bestMissing, pass) {
    let fallback = bestMissing;
    for (const option of options) {
      if (option?.match?.type !== 'currency') continue;
      const spend = this._currencySpendFor(option, pass.ctx.affordCurrency);
      if (spend) {
        pass.currencySpends.push({ unit: spend.unit, amount: spend.amount, ingredient: option });
        return { option };
      }
      fallback ??= { ingredient: option, have: 0, need: option.quantity };
    }
    return { missing: { group, ...fallback } };
  }

  /**
   * Pass 3 of {@link _resolveGreedy}: emit `selectedIngredients` and `missingGroups`
   * in AUTHOR-GROUP order, reading each deferred essence group's verdict out of the
   * block's per-requirement partition (parallel to `block.members`).
   * @private
   */
  _collectGreedyOutcomes(outcomes, block) {
    const stateByMember = new Map(
      block.members.map((member, index) => [member, block.requirements[index]])
    );
    const selectedIngredients = [];
    const missingGroups = [];

    for (const outcome of outcomes) {
      if (outcome.option) {
        selectedIngredients.push(outcome.option);
      } else if (outcome.missing) {
        missingGroups.push(outcome.missing);
      } else {
        const state = stateByMember.get(outcome.member);
        if (state?.satisfied) {
          selectedIngredients.push(outcome.member.option);
        } else {
          missingGroups.push({
            group: outcome.member.group,
            ingredient: outcome.member.option,
            // The essence AMOUNT the partition assigns this requirement — never the
            // ledger total of matching items held, which would render `6/4 ✗` for a
            // player who allocated 2 of a needed 4 while holding 6.
            have: state?.delivered ?? 0,
            need: outcome.member.need,
          });
        }
      }
    }

    return { selectedIngredients, missingGroups };
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
   * Every essence option is taken as a DEFERRED choice: it occupies its group's
   * author position in `selectedIngredients` immediately but consumes nothing, and
   * the whole set's essence block is settled at the terminal node
   * ({@link _settleEssenceBlock}). A block that cannot fund therefore fails the
   * terminal and forces the earlier component/tag groups to re-branch — the block is
   * a genuine backtrackable node, not a post-pass, which is what makes joint essence
   * resolution a strict relaxation rather than a new way to fail.
   *
   * @returns {{ selection: object|null, nodes: number, capHit: boolean }} `selection`
   *   is the success result (exact `resolveIngredientSelection` shape) or null when
   *   no assignment was found (unsatisfiable, or the node bound was reached).
   * @private
   */
  _searchAssignment(availableItems, matcher, ctx) {
    const remaining = this._initialRemaining(availableItems);
    const acc = {
      selectedIngredients: [],
      plan: [],
      currencySpends: [],
      essenceMembers: [],
      essenceBlock: null,
    };
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
          essenceAllocation: acc.essenceBlock?.allocation ?? {},
          essencePool: this._essencePoolFrom(acc.essenceBlock),
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
    if (index >= this.ingredientGroups.length) {
      if (++budget.nodes > INGREDIENT_SEARCH_NODE_CAP) {
        budget.capHit = true;
        return false;
      }
      return this._settleEssenceBlock(remaining, acc, availableItems, ctx);
    }
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
      } else if (choice.member) {
        acc.essenceMembers.push(choice.member);
      } else {
        this._commitItemPlan(choice.plan, acc.plan, remaining);
      }

      if (this._searchGroup(index + 1, remaining, acc, availableItems, matcher, ctx, budget)) {
        return true;
      }

      acc.selectedIngredients.pop();
      if (choice.currency) {
        acc.currencySpends.pop();
      } else if (choice.member) {
        acc.essenceMembers.pop();
      } else {
        acc.plan.length -= choice.plan.length;
      }
      this._restoreRemaining(remaining, snapshot);
    }
    return false;
  }

  /**
   * The DFS terminal node: settle the whole set's essence block against whatever the
   * component/tag groups left in `remaining`.
   *
   * Returning false here is the mechanism that makes the block backtrackable — the
   * caller restores `remaining` and re-branches an earlier group, so a tag group with
   * two matching stacks, only one of which carries the essence, resolves the OTHER
   * stack for the tag and leaves the carrier to the block.
   *
   * Nothing is committed on the failing path, so a false return leaves `acc` and
   * `remaining` exactly as the caller left them.
   * @private
   */
  _settleEssenceBlock(remaining, acc, availableItems, ctx) {
    const block = this._resolveEssenceBlock(acc.essenceMembers, availableItems, remaining, ctx);
    if (!block.ok) return false;
    this._commitItemPlan(block.plan, acc.plan, remaining);
    acc.essenceBlock = block;
    return true;
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
        group,
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
        group,
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
   *
   * An ESSENCE option has exactly ONE candidate — a deferred block membership. It
   * enumerates no item subsets of its own, because the whole set's essence funding is
   * a joint problem settled once at the terminal node.
   * @private
   */
  *_optionItemChoices(option, availableItems, remaining, matcher, group, restrictItemId, budget) {
    if (option?.match?.type === 'essence') {
      yield { option, plan: [], currency: null, member: this._essenceMember(group, option) };
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
   * One essence requirement's membership of the set's essence block. Built once per
   * option so the search and the greedy pass describe the block identically.
   *
   * A blank `essenceId` or a non-positive `amount` is a runtime no-op (mirroring the
   * migration dropping non-positive essence entries), which {@link _partitionBlock}
   * settles as satisfied with nothing delivered.
   * @private
   */
  _essenceMember(group, option) {
    return {
      group,
      option,
      groupId: group?.id ?? null,
      essenceId: String(option?.match?.essenceId || '').trim(),
      need: Math.max(0, Number(option?.match?.amount) || 0),
    };
  }

  /**
   * Resolve the set's essence BLOCK: every `match.type === 'essence'` option taken by
   * this branch, funded JOINTLY from what the component/tag groups left in
   * `remaining` (issue 917).
   *
   * Within the block a consumed unit credits every essence it carries to every
   * requirement in the block, so one dual-essence carrier can fund two requirements
   * at once. That is a strict relaxation of the old per-group draw, so no authored
   * recipe becomes uncraftable; the block's scope is exactly one ingredient set (it
   * spans neither sets nor steps, and never reaches across the component/tag
   * boundary, whose units `remaining` has already spent).
   *
   * Which units fund it is either the player's `essenceAllocation` — clamped against
   * what `remaining` actually holds, honoured whether or not it satisfies, and NEVER
   * topped up from unallocated carriers — or the injected allocator's suggestion.
   * `suggested` is always computed, so a surface can offer "pick for me" beside a
   * short player allocation.
   *
   * @param {Array<object>} members - block memberships in AUTHOR order
   * @param {Item[]} availableItems
   * @param {Map<string, number>} remaining
   * @param {object} ctx - the resolution context (`resolveEssences`, `allocate`,
   *   `essenceAllocation`)
   * @returns {{ ok: boolean, members: Array<object>, requirements: Array<object>,
   *   carriers: Array<object>, allocation: Record<string, number>,
   *   suggested: Record<string, number>, delivered: Record<string, number>,
   *   plan: Array<object> }}
   * @private
   */
  _resolveEssenceBlock(members, availableItems, remaining, ctx) {
    if (!Array.isArray(members) || members.length === 0) {
      return {
        ok: true,
        members: [],
        requirements: [],
        carriers: [],
        allocation: {},
        suggested: {},
        delivered: {},
        plan: [],
      };
    }

    const carriers = this._essenceCarriers(members, availableItems, remaining, ctx.resolveEssences);
    const availableUnits = Object.fromEntries(
      carriers.map((carrier) => [carrier.itemKey, carrier.ownedUnits])
    );
    // Default the strategy here as well as at the public entry point, so a caller
    // holding the private ctx directly (the search-seam tests) still allocates.
    const allocate = typeof ctx.allocate === 'function' ? ctx.allocate : greedyAllocate;
    const suggested = allocate(members, carriers, availableUnits);
    const allocation = ctx.essenceAllocation
      ? clampAllocation(ctx.essenceAllocation, availableUnits)
      : suggested;
    const delivered = deliveredEssences(allocation, carriers);
    const requirements = this._partitionBlock(members, carriers, delivered);

    return {
      ok: requirements.every((requirement) => requirement.satisfied),
      members,
      requirements,
      carriers,
      allocation,
      suggested,
      delivered,
      plan: this._essenceBlockPlan(members, carriers, allocation),
    };
  }

  /**
   * The stacks that can fund the block: every item `remaining` still holds units of
   * that carries at least one essence the block needs, deduped by item key.
   *
   * `ownedUnits` is what `remaining` holds — the units left AFTER every component/tag
   * group has claimed — so an allocation can never be steered into an infeasible
   * state, and no caller has to re-read the item's raw stack quantity at the
   * game-system-specific configured path.
   * @private
   */
  _essenceCarriers(members, availableItems, remaining, resolveEssences) {
    const neededIds = new Set(members.map((member) => member.essenceId).filter(Boolean));
    const carriers = [];
    const seen = new Set();

    for (const item of availableItems) {
      const itemKey = this._itemKey(item);
      if (seen.has(itemKey)) continue;
      seen.add(itemKey);

      const ownedUnits = Number(remaining.get(itemKey) || 0);
      if (ownedUnits <= 0) continue;

      const essences = (resolveEssences ? resolveEssences(item) : null) || {};
      const perUnit = {};
      for (const essenceId of neededIds) {
        const amount = Number(essences?.[essenceId]) || 0;
        if (amount > 0) perUnit[essenceId] = amount;
      }
      if (Object.keys(perUnit).length === 0) continue;

      carriers.push({ itemKey, item, perUnit, ownedUnits });
    }

    return carriers;
  }

  /**
   * Attribute what the block delivered across its requirements, PER ESSENCE ID: the
   * requirements naming an id settle in author order, each taking
   * `min(need, remaining delivered of that id)`.
   *
   * The partition is total (every requirement is satisfied or reported short), runs
   * whether or not the block funds, and is independent across essence ids — a short
   * Radiant requirement never marks a fully delivered Shadow requirement missing.
   * Because every take is capped at `need`, a SATISFIED requirement always reports
   * `delivered === need`: `[Radiant 2, Radiant 2]` against a block delivering
   * Radiant 4 reads `2/2` and `2/2`, never `4/2`.
   *
   * `owned` is the separate, uncapped essence amount the whole carrier ledger holds
   * for that id — an essence amount like `need` and `delivered`, and distinct from a
   * carrier's `ownedUnits`, which counts item units.
   * @private
   */
  _partitionBlock(members, carriers, delivered) {
    const unassigned = new Map(Object.entries(delivered));
    const owned = new Map();
    for (const carrier of carriers) {
      for (const [essenceId, perUnit] of Object.entries(carrier.perUnit)) {
        owned.set(essenceId, (owned.get(essenceId) ?? 0) + perUnit * carrier.ownedUnits);
      }
    }

    return members.map((member) => {
      const { essenceId, need } = member;
      // A blank essence id or a non-positive amount is a runtime no-op, satisfied
      // with nothing consumed, exactly as the pre-block per-option builder treated it.
      const degenerate = !essenceId || need <= 0;
      const pool = unassigned.get(essenceId) ?? 0;
      const take = degenerate ? 0 : Math.min(need, pool);
      if (take > 0) unassigned.set(essenceId, pool - take);
      return {
        groupId: member.groupId,
        essenceId,
        need,
        delivered: take,
        owned: owned.get(essenceId) ?? 0,
        satisfied: degenerate || take >= need,
      };
    });
  }

  /**
   * The block's consumption plan: AT MOST ONE entry per item key, whose `quantity` is
   * the units the allocation draws from that stack.
   *
   * One entry per (item, requirement) would be a live double-consume bug: the engine
   * re-reads the item's live stack quantity per plan entry and deletes the document once the
   * live quantity is covered, so a second entry for the same shared unit throws on a
   * document that is already gone — after earlier ingredients have been deleted. A
   * component/tag group MAY still contribute its own entry for the same item key,
   * because those draws are disjoint and compose correctly under that live read.
   *
   * Because one entry names one `ingredient`, it also carries `essenceGroupIds` for
   * every requirement it funds; a reader resolving an essence requirement's consumed
   * item MUST prefer that list, or sibling essence tiles resolve to no item.
   * @private
   */
  _essenceBlockPlan(members, carriers, allocation) {
    const plan = [];
    for (const carrier of carriers) {
      const units = Number(allocation?.[carrier.itemKey]) || 0;
      if (units <= 0) continue;
      const funded = members.filter(
        (member) => (Number(carrier.perUnit[member.essenceId]) || 0) > 0
      );
      if (funded.length === 0) continue;
      plan.push({
        item: carrier.item,
        quantity: units,
        // The first funded option, retained for the back-compat readers that key off
        // `entry.ingredient`.
        ingredient: funded[0].option,
        essenceGroupIds: funded.map((member) => member.groupId).filter(Boolean),
      });
    }
    return plan;
  }

  /**
   * Project a resolved block into the read-side pool model the crafting surfaces
   * render: what each requirement needs and was delivered, what each carrier holds
   * and contributes, and the allocation that ties the two together. Null for a set
   * with no essence requirement, so a caller can gate on its presence.
   * @private
   */
  _essencePoolFrom(block) {
    if (!block || block.members.length === 0) return null;
    return {
      requirements: block.requirements,
      carriers: block.carriers.map((carrier) => ({
        itemKey: carrier.itemKey,
        item: carrier.item,
        perUnit: carrier.perUnit,
        ownedUnits: carrier.ownedUnits,
        allocatedUnits: Number(block.allocation?.[carrier.itemKey]) || 0,
      })),
      allocation: block.allocation,
      suggested: block.suggested,
      totals: block.delivered,
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
