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
   *   essencePool: object|null,
   *   searchStats: {nodes: number, capHit: boolean} }}
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
    // The per-pass resolution index (issue 1083). Built ONCE here and reachable only
    // through this call's `ctx`, so it is per-pass and never retained across a resolve
    // — the same lifetime rule `inventorySnapshot.js` states for its own tallies, and
    // for the same reason: nothing mints a token when `actor.items` changes, so a
    // retained item-side index would report "unchanged" across the craft that consumed
    // the very stacks it describes.
    ctx.index = this._buildPassIndex(availableItems, matcher, ctx);

    // Item-level bounded backtracking (issue 663): find a satisfying item->group
    // assignment whenever one exists. The search tries the greedy author-order
    // choice first at every node, so any assignment greedy resolution satisfies
    // today is returned byte-identical (zero churn); only a recipe greedy wrongly
    // rejected gains a newly found alternative.
    const search = this._searchAssignment(availableItems, matcher, ctx);

    // The solver's own cost, surfaced rather than discarded (issue 1072). `nodes` is the
    // ONLY deterministic measure of assignment work: the node cap bounds nodes, not work,
    // because each node copies and restores the whole available-item ledger, so per-node
    // cost is O(inventory) and the wall clock of a resolve is a product of two terms a
    // timing assertion cannot separate. A regression guard asserts `nodes`; #1083's
    // indexed fast paths are expected to lower it, and nothing else can observe that.
    // Frozen so a consumer cannot mutate a shared statistic, and attached on BOTH exits
    // so a caller never has to branch on which one produced the result.
    const searchStats = Object.freeze({ nodes: search.nodes, capHit: search.capHit });
    if (search.selection) return { ...search.selection, searchStats };

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
    return { ...this._resolveGreedy(availableItems, matcher, ctx), searchStats };
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
      override.heldItemId,
      pass.ctx.index
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
        pass.matcher,
        null,
        pass.ctx.index
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
   * The PER-PASS resolution index (issue 1083): everything both resolution paths would
   * otherwise re-derive per search node, derived once instead.
   *
   * ## Why the index is built here and not handed in
   *
   * #1077's `buildInventorySnapshot(...).componentTallies(system)` exposes exactly the
   * shape this wants — `quantityByComponentId`, `stacksByComponentId`, `quantityByTag`.
   * It cannot be consumed here: it resolves an item to a component through an injected
   * `resolveComponent` against a SYSTEM's component library, and an ingredient set is
   * handed neither. Its identity oracle is the caller's `matcher(option, item)` (or
   * `option.matches(item)`), which is opaque and not invertible — `componentHandler`'s
   * own `matchesItem` returns false by design, because component identity is resolved
   * upstream in `RecipeManager.ingredientMatchesItem`.
   *
   * So the same index is built through the only oracle this boundary has, and it answers
   * the same questions: `optionItems` is `stacksByComponentId`/`quantityByTag` for the
   * options this set actually names, and the essence half is the carrier index
   * `componentTallies` deliberately does NOT provide (`essenceTotals` is a scalar per
   * essence id, not a carrier list, so `_essenceCarriers` had no index to consume).
   *
   * The lifetime rule is copied verbatim: per pass, never retained. Nothing mints a
   * revision token when `actor.items` changes, so an index that outlived its pass would
   * describe stacks a craft had already consumed.
   *
   * ## What it removes
   *
   * `_buildPlanForIngredient` filtered the whole of `availableItems` through the matcher
   * on EVERY call, and so did `_matchingItemsWithAvail` — once per option per node. That
   * is the second O(|availableItems|) per-node term, the one the undo journal does not
   * touch. Here it is paid once per option per pass.
   *
   * @returns {{optionItems: Map<object, object[]>, groupCandidateKeys: Array<Set<string>>,
   *   blockGroups: Set<number>, essence: {carriers: Array<object>,
   *   ceiling: Map<string, number>, carrierKeys: Set<string>}|null}}
   * @private
   */
  _buildPassIndex(availableItems, matcher, ctx) {
    const items = Array.isArray(availableItems) ? availableItems : [];
    const optionItems = new Map();
    const essenceOptions = [];
    const groupCandidateKeys = this.ingredientGroups.map((group) =>
      this._indexGroupCandidates(group, items, matcher, optionItems, essenceOptions)
    );
    const essence = this._buildEssenceIndex(items, essenceOptions, ctx);

    return {
      optionItems,
      groupCandidateKeys,
      blockGroups: this._groupsCarryingTheBlock(essence),
      essence,
    };
  }

  /**
   * Index one group: record each non-currency option's matching stacks, collect its
   * essence options for the block index, and return the group's candidate item keys — the
   * vertex data {@link _contentionComponents} joins on.
   *
   * `optionItems` and `essenceOptions` accumulate across the whole call because both are
   * SET-scoped rather than group-scoped: the option-to-stacks map is keyed by option
   * identity across the set, and the essence block spans every group at once.
   * @private
   */
  _indexGroupCandidates(group, items, matcher, optionItems, essenceOptions) {
    const keys = new Set();
    for (const option of group.options || []) {
      const type = option?.match?.type;
      if (type === 'currency') continue;
      if (type === 'essence') {
        essenceOptions.push(this._essenceMember(group, option));
        continue;
      }
      const matched = items.filter((item) =>
        matcher ? matcher(option, item) : option.matches(item)
      );
      optionItems.set(option, matched);
      for (const item of matched) keys.add(this._itemKey(item));
    }
    return keys;
  }

  /**
   * The groups that could still add a requirement to the essence block, and are therefore
   * jointly constrained by it however disjoint their item candidates are.
   *
   * A group whose only essence options are provably unfundable is NOT one of them: it can
   * never take the block branch, so treating it as a block member would couple it to
   * groups it cannot interact with.
   * @private
   */
  _groupsCarryingTheBlock(essence) {
    const carrying = new Set();
    if (!essence) return carrying;
    for (const [groupIndex, group] of this.ingredientGroups.entries()) {
      const options = group.options || [];
      if (options.some((option) => this._isLiveEssenceOption(option, group, essence))) {
        carrying.add(groupIndex);
      }
    }
    return carrying;
  }

  /**
   * Whether `option` is an essence option this ledger could still fund.
   * @private
   */
  _isLiveEssenceOption(option, group, essence) {
    if (option?.match?.type !== 'essence') return false;
    return this._essenceOptionIsFeasible(this._essenceMember(group, option), essence);
  }

  /**
   * The essence half of the pass index: the stacks that could ever fund this set's
   * essence block, and the CEILING each essence id can deliver from them.
   *
   * `_essenceCarriers` walked the whole of `availableItems` and ran a `resolveEssences`
   * probe per item at EVERY terminal node. Both are paid once here instead; the terminal
   * then only re-reads the ledger for the carriers, which is the part that legitimately
   * changes as groups claim.
   *
   * The ceiling is computed against the UNTOUCHED ledger, so it is an upper bound on
   * what the block can deliver at any point in any branch — `remaining` only ever
   * decreases. That makes it sound to prune an essence option needing more than its
   * ceiling ({@link _essenceOptionIsFeasible}): no assignment of the ledger can satisfy
   * it, so every branch that chose it was destined to fail the terminal.
   *
   * Null when the set has no essence option at all, in which case there is no block and
   * nothing to index.
   * @private
   */
  _buildEssenceIndex(availableItems, essenceOptions, ctx) {
    const essenceIds = new Set(essenceOptions.map((member) => member.essenceId).filter(Boolean));
    if (essenceOptions.length === 0) return null;

    const seeded = this._initialRemaining(availableItems);
    const resolveEssences = ctx?.resolveEssences;
    const carriers = [];
    const ceiling = new Map();
    const seen = new Set();

    for (const item of availableItems) {
      const itemKey = this._itemKey(item);
      if (seen.has(itemKey)) continue;
      seen.add(itemKey);

      const essences = (resolveEssences ? resolveEssences(item) : null) || {};
      const perUnit = {};
      for (const essenceId of essenceIds) {
        const amount = Number(essences?.[essenceId]) || 0;
        if (amount > 0) perUnit[essenceId] = amount;
      }
      if (Object.keys(perUnit).length === 0) continue;

      carriers.push({ itemKey, item, perUnit });
      const units = Number(seeded.get(itemKey) || 0);
      for (const [essenceId, amount] of Object.entries(perUnit)) {
        ceiling.set(essenceId, (ceiling.get(essenceId) ?? 0) + amount * units);
      }
    }

    const carrierKeys = this._contendedCarrierKeys(carriers, essenceOptions, ceiling);
    return { carriers, ceiling, carrierKeys };
  }

  /**
   * The carrier stacks a component/tag group can actually contend with the block for.
   *
   * Only the carriers of essence ids some option can still REACH count. A carrier whose
   * only essence belongs to an option the ceiling already rules out is never drawn, so
   * counting it as contention would couple groups that cannot interact.
   * @private
   */
  _contendedCarrierKeys(carriers, essenceOptions, ceiling) {
    const liveIds = new Set(
      essenceOptions
        .filter((member) => this._essenceOptionIsFeasible(member, { ceiling }))
        .map((member) => member.essenceId)
        .filter(Boolean)
    );
    return new Set(
      carriers
        .filter((carrier) => Object.keys(carrier.perUnit).some((id) => liveIds.has(id)))
        .map((carrier) => carrier.itemKey)
    );
  }

  /**
   * Whether an essence option could be satisfied by ANY assignment of the untouched
   * ledger. A degenerate member (blank essence id or a non-positive amount) is a runtime
   * no-op that {@link _partitionBlock} settles as satisfied, so it is always feasible.
   *
   * This is a strict prune, not a heuristic: a false answer means every branch choosing
   * that option fails the block terminal, so removing the branch removes only work.
   * @private
   */
  _essenceOptionIsFeasible(member, essence) {
    if (!member.essenceId || member.need <= 0) return true;
    if (!essence) return true;
    return (essence.ceiling.get(member.essenceId) ?? 0) >= member.need;
  }

  /**
   * Partition the ingredient groups into CONTENTION COMPONENTS: the connected components
   * of the graph whose vertices are the groups (plus one vertex for the essence block)
   * and whose edges join any two that could draw on the same held stack.
   *
   * Two groups with no candidate stack in common cannot affect each other's choices at
   * all, so searching them together multiplied two independent search spaces for nothing.
   * Resolving each component alone turns that product back into a sum.
   *
   * The essence block is a vertex rather than an afterthought because it contends in TWO
   * ways, and missing either one would silently break the joint-allocation guarantee:
   *
   *  - by MEMBERSHIP — every group carrying a still-feasible essence option may add a
   *    requirement to the shared block, so their choices are jointly constrained even
   *    when their item candidates are disjoint;
   *  - by DRAW — a component/tag group whose candidates include a block carrier competes
   *    for the units the block needs, which is exactly the #663/#917 worked case (a tag
   *    group must take the non-carrier stack so the block can have the carrier).
   *
   * @returns {Array<{groups: number[], ownsBlock: boolean}>} components ordered by their
   *   lowest group index, each listing its groups in author order.
   * @private
   */
  _contentionComponents(index) {
    const groupCount = this.ingredientGroups.length;
    const blockVertex = groupCount;
    const parent = Array.from({ length: groupCount + 1 }, (_unused, vertex) => vertex);
    const find = (vertex) => {
      let root = vertex;
      while (parent[root] !== root) root = parent[root];
      let cursor = vertex;
      while (parent[cursor] !== root) {
        const next = parent[cursor];
        parent[cursor] = root;
        cursor = next;
      }
      return root;
    };
    const union = (left, right) => {
      const [a, b] = [find(left), find(right)];
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    };

    const claimedBy = new Map();
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      for (const key of index.groupCandidateKeys[groupIndex]) {
        const prior = claimedBy.get(key);
        if (prior === undefined) claimedBy.set(key, groupIndex);
        else union(groupIndex, prior);
      }
    }

    const blockLive = index.blockGroups.size > 0;
    if (blockLive) {
      for (const groupIndex of index.blockGroups) union(groupIndex, blockVertex);
      for (const key of index.essence.carrierKeys) {
        const prior = claimedBy.get(key);
        if (prior !== undefined) union(blockVertex, prior);
      }
    }

    const byRoot = new Map();
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const root = find(groupIndex);
      if (!byRoot.has(root)) byRoot.set(root, { groups: [], ownsBlock: false });
      byRoot.get(root).groups.push(groupIndex);
    }
    if (blockLive) {
      const blockRoot = find(blockVertex);
      // The block always shares a root with at least one group, because a live block
      // exists only when some group carries a feasible essence option.
      if (byRoot.has(blockRoot)) byRoot.get(blockRoot).ownsBlock = true;
    }

    return [...byRoot].sort(([left], [right]) => left - right).map(([, component]) => component);
  }

  /**
   * Item-level bounded backtracking over the ingredient groups (issue 663), STAGED by
   * contention (issue 1083).
   *
   * Groups are traversed in AUTHOR order (preserving the positional
   * `selectedIngredients` contract `RecipeManager._chosenOptionByGroup` reads); at each
   * group choices are tried lazily in the order [non-currency options in author order,
   * then currency options in author order], and for each non-currency option the
   * candidate item subsets branch with the greedy subset first. The first complete
   * assignment under this fixed traversal wins.
   *
   * ## Two costs, removed separately
   *
   * The `remaining` ledger is mutated in place and reverted through a shared undo
   * JOURNAL rather than copied and restored per node. Copying cost O(|availableItems|)
   * on every branch, so the 200,000-node cap bounded the search TREE while leaving the
   * work it implied unbounded — a 1,000-stack party inventory at the cap is on the order
   * of 2x10^8 Map operations. A node now records only the keys it actually overwrote.
   *
   * Separately, the set is partitioned into CONTENTION COMPONENTS
   * ({@link _contentionComponents}) and each is resolved on its own. Two groups whose
   * candidate stacks do not intersect cannot affect each other's choices, so a single
   * whole-set DFS spent its exponent re-exploring independent groups: a set of three
   * groups that merely happened to be authored together was searched as one product
   * rather than three sums. A component of one group with no essence block is not
   * searched at all — its first choice is its answer.
   *
   * The result is byte-identical wherever the whole-set search already succeeded. The
   * whole-set DFS enumerates choice tuples in lexicographic order and feasibility is a
   * conjunction of independent per-component constraints, so its lexicographic minimum
   * is exactly the concatenation of the per-component lexicographic minima. What changes
   * is only how much of the space is walked to reach it, which `searchStats.nodes`
   * reports and nothing else observes.
   *
   * Every essence option is taken as a DEFERRED choice: it occupies its group's author
   * position in `selectedIngredients` immediately but consumes nothing, and the whole
   * set's essence block is settled at the terminal node of the ONE component that
   * carries it ({@link _settleEssenceBlock}). A block that cannot fund therefore fails
   * that terminal and forces its component's component/tag groups to re-branch — the
   * block is a genuine backtrackable node, not a post-pass, which is what makes joint
   * essence resolution a strict relaxation rather than a new way to fail.
   *
   * @returns {{ selection: object|null, nodes: number, capHit: boolean }} `selection`
   *   is the success result (exact `resolveIngredientSelection` shape) or null when
   *   no assignment was found (unsatisfiable, or the node bound was reached).
   * @private
   */
  _searchAssignment(availableItems, matcher, ctx) {
    // A caller holding the private ctx directly (the search-seam tests) has no index,
    // so mint one rather than silently falling back to the unindexed scans.
    ctx.index ??= this._buildPassIndex(availableItems, matcher, ctx);
    const budget = { nodes: 0, capHit: false };
    const frame = {
      availableItems,
      matcher,
      ctx,
      budget,
      index: ctx.index,
      remaining: this._initialRemaining(availableItems),
      // The shared undo journal: `[key, previousValue, key, previousValue, ...]` in
      // write order. One array for the whole search, sliced by per-node marks, so a
      // node pays only for the ledger keys it actually overwrote.
      journal: [],
    };

    const chosenByGroup = Array.from({ length: this.ingredientGroups.length }, () => null);
    let block = null;
    for (const component of this._contentionComponents(frame.index)) {
      const resolved = this._resolveContentionComponent(component, frame);
      if (!resolved) return { selection: null, nodes: budget.nodes, capHit: budget.capHit };
      for (const [position, groupIndex] of component.groups.entries()) {
        chosenByGroup[groupIndex] = resolved.chosen[position];
      }
      if (resolved.block) block = resolved.block;
    }

    return {
      selection: this._composeSelection(chosenByGroup, block),
      nodes: budget.nodes,
      capHit: budget.capHit,
    };
  }

  /**
   * Assemble the success result from the per-group choices, in AUTHOR order.
   *
   * Author order is re-imposed here rather than inherited from the traversal, because
   * contention components are resolved one at a time and a component's groups need not
   * be adjacent in the set. Emitting per component would put group 2's plan entries
   * before group 1's for a set whose components interleave — a difference no test of
   * `success` would catch and every consumer of `plan` order would inherit.
   *
   * The essence block's entries come LAST, exactly where the single global DFS put them
   * when it settled the block at its terminal after every group had claimed.
   * @private
   */
  _composeSelection(chosenByGroup, block) {
    const selectedIngredients = [];
    const plan = [];
    const currencySpends = [];
    for (const choice of chosenByGroup) {
      selectedIngredients.push(choice.option);
      if (choice.currency) {
        currencySpends.push({
          unit: choice.currency.unit,
          amount: choice.currency.amount,
          ingredient: choice.option,
        });
      } else if (!choice.member) {
        plan.push(...choice.plan);
      }
    }
    if (block) plan.push(...block.plan);

    return {
      success: true,
      selectedIngredients,
      plan,
      currencySpends,
      missingGroups: [],
      essenceAllocation: block?.allocation ?? {},
      essencePool: this._essencePoolFrom(block),
    };
  }

  /**
   * Resolve ONE contention component: either the indexed fast path or a search scoped
   * to that component's groups.
   *
   * The fast path applies to a component of exactly one group that does not carry the
   * essence block. Nothing else in the set competes for that group's candidate stacks,
   * so the FIRST choice the group yields is the one the full search would have kept:
   * backtracking into a later choice can only ever be provoked by a downstream group
   * that this component, by construction, does not have. It therefore costs zero search
   * nodes, which is what "an ordinary direct-component recipe resolves without entering
   * the DFS" has to mean to be observable in `searchStats`.
   *
   * The choice is still committed to the shared ledger. Nothing else reads those keys,
   * so it changes no answer — but a ledger that stopped describing what the resolution
   * consumed would be a trap for the next reader.
   *
   * @returns {{chosen: object[], block: object|null}|null} null when the component has
   *   no satisfying assignment (or the node bound was reached inside it).
   * @private
   */
  _resolveContentionComponent(component, frame) {
    if (component.groups.length === 1 && !component.ownsBlock) {
      const group = this.ingredientGroups[component.groups[0]];
      const choice = this._firstGroupChoice(group, frame);
      if (!choice) return null;
      if (!choice.currency && !choice.member) {
        this._commitItemPlan(choice.plan, [], frame.remaining);
      }
      return { chosen: [choice], block: null };
    }

    const state = {
      chosen: Array.from({ length: component.groups.length }, () => null),
      essenceMembers: [],
      plan: [],
      block: null,
    };
    return this._searchComponentGroup(0, component, state, frame) ? state : null;
  }

  /**
   * The first choice a group yields against the current ledger, or null when it yields
   * none (the group cannot be satisfied at all).
   *
   * Laziness is what makes this free: {@link _componentTagOptionChoices} yields the
   * greedy front-loaded pick BEFORE enumerating any alternative unit plan, and returns
   * without enumerating when even the full matching pool is short. So neither a hit nor
   * a miss reaches {@link _enumerateUnitPlansFrom}, and neither bumps the node budget.
   * @private
   */
  _firstGroupChoice(group, frame) {
    for (const choice of this._groupChoices(
      group,
      group.options || [],
      frame.remaining,
      frame.availableItems,
      frame.matcher,
      frame.ctx,
      frame.budget
    )) {
      return choice;
    }
    return null;
  }

  /**
   * Recursive DFS body for one contention component. Returns true when the component's
   * groups from `position` on all receive a satisfying assignment against the shared
   * ledger, recording the successful path in `state`.
   *
   * Traversal is in AUTHOR order within the component, so the choice sequence a group
   * sees is byte-identical to the one the single whole-set DFS produced: the groups this
   * component omits have candidate stacks disjoint from its own, so they cannot alter
   * the availability any of these choices is generated from.
   * @private
   */
  _searchComponentGroup(position, component, state, frame) {
    const { budget } = frame;
    if (budget.capHit) return false;
    if (position >= component.groups.length) {
      return this._searchComponentTerminal(component, state, frame);
    }
    if (this._chargeNode(budget)) return false;

    const group = this.ingredientGroups[component.groups[position]];
    for (const choice of this._groupChoices(
      group,
      group.options || [],
      frame.remaining,
      frame.availableItems,
      frame.matcher,
      frame.ctx,
      budget
    )) {
      if (budget.capHit) return false;
      const mark = frame.journal.length;
      state.chosen[position] = choice;
      this._applyChoice(choice, state, frame);

      if (this._searchComponentGroup(position + 1, component, state, frame)) return true;

      state.chosen[position] = null;
      this._revertChoice(choice, state, frame, mark);
    }
    return false;
  }

  /**
   * Charge one node against the shared safeguard budget.
   *
   * One definition of "a node", used by the group traversal, its terminal and the unit-plan
   * enumeration alike, so a search scoped to a contention component cannot quietly stop
   * counting some of the work it does.
   *
   * @returns {boolean} true when this charge reached the bound, so the caller must stop.
   * @private
   */
  _chargeNode(budget) {
    if (++budget.nodes > INGREDIENT_SEARCH_NODE_CAP) {
      budget.capHit = true;
      return true;
    }
    return false;
  }

  /**
   * The terminal node of one component's traversal. Only the component carrying the
   * essence block settles it; every other component is complete once its groups are
   * assigned.
   * @private
   */
  _searchComponentTerminal(component, state, frame) {
    if (this._chargeNode(frame.budget)) return false;
    return component.ownsBlock ? this._settleEssenceBlock(state, frame) : true;
  }

  /**
   * Commit one chosen choice. A currency choice draws nothing (it is free, which is
   * exactly why it is ordered last) and an essence choice defers to the block, so only a
   * component/tag choice touches the ledger.
   * @private
   */
  _applyChoice(choice, state, frame) {
    if (choice.member) {
      state.essenceMembers.push(choice.member);
    } else if (!choice.currency) {
      this._commitItemPlan(choice.plan, state.plan, frame.remaining, frame.journal);
    }
  }

  /**
   * Undo {@link _applyChoice}, reverting the ledger to the caller's `mark`.
   * @private
   */
  _revertChoice(choice, state, frame, mark) {
    if (choice.member) {
      state.essenceMembers.pop();
    } else if (!choice.currency) {
      state.plan.length -= choice.plan.length;
    }
    this._undoLedger(frame.remaining, frame.journal, mark);
  }

  /**
   * The DFS terminal node: settle the whole set's essence block against whatever the
   * component/tag groups left in `remaining`.
   *
   * Returning false here is the mechanism that makes the block backtrackable — the
   * caller reverts `remaining` and re-branches an earlier group, so a tag group with
   * two matching stacks, only one of which carries the essence, resolves the OTHER
   * stack for the tag and leaves the carrier to the block.
   *
   * This terminal performs NO revert of its own on the false path and deliberately
   * relies on the caller's undo journal, exactly as it previously relied on the
   * caller's ledger snapshot. Every ledger write it makes goes through
   * {@link _commitItemPlan} with the SAME `journal` the calling node marked, so the
   * caller's {@link _undoLedger} reverts them whether or not this returns true —
   * which is what lets the commit stay unconditional-looking here.
   *
   * It runs at the terminal of the ONE component that carries the block. Every other
   * component's groups have candidate stacks disjoint from the block's carriers, so the
   * order components are resolved in cannot change what the block has to draw from.
   * @private
   */
  _settleEssenceBlock(state, frame) {
    const block = this._resolveEssenceBlock(
      state.essenceMembers,
      frame.availableItems,
      frame.remaining,
      frame.ctx
    );
    if (!block.ok) return false;
    this._commitItemPlan(block.plan, state.plan, frame.remaining, frame.journal);
    state.block = block;
    return true;
  }

  /**
   * Revert `remaining` to the state it held when the caller took `mark`, by
   * replaying the shared undo journal backwards to that mark and truncating it.
   *
   * Backwards is load-bearing: one node may overwrite the same ledger key more than
   * once (two plan entries drawing on one stack), and only the EARLIEST recorded
   * value for a key is the pre-node one. Replaying forwards would restore the
   * intermediate value instead.
   *
   * Cost is O(keys this node wrote), never O(|availableItems|), which is the whole
   * point of the journal (issue 1083).
   * @private
   */
  _undoLedger(remaining, journal, mark) {
    for (let index = journal.length - 2; index >= mark; index -= 2) {
      remaining.set(journal[index], journal[index + 1]);
    }
    journal.length = mark;
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
        budget,
        ctx.index
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
        budget,
        ctx.index
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
   *
   * That candidate is withheld when the pass index proves the requirement exceeds what
   * the whole untouched ledger could ever deliver for its essence id (issue 1083). The
   * branch is not skipped on a guess: it is a branch whose terminal is already known to
   * fail, so choosing it could only ever cost a subtree and then backtrack. Withholding
   * it changes no verdict — the group is reported short by the greedy pass exactly as
   * before, with THAT option's have/need.
   * @private
   */
  *_optionItemChoices(
    option,
    availableItems,
    remaining,
    matcher,
    group,
    restrictItemId,
    budget,
    index = null
  ) {
    if (option?.match?.type === 'essence') {
      const member = this._essenceMember(group, option);
      if (!this._essenceOptionIsFeasible(member, index?.essence)) return;
      yield { option, plan: [], currency: null, member };
      return;
    }
    yield* this._componentTagOptionChoices(
      option,
      availableItems,
      remaining,
      matcher,
      restrictItemId,
      budget,
      index
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
  *_componentTagOptionChoices(
    option,
    availableItems,
    remaining,
    matcher,
    restrictItemId,
    budget,
    index = null
  ) {
    const greedy = this._buildPlanForIngredient(
      option,
      availableItems,
      remaining,
      matcher,
      restrictItemId,
      index
    );
    if (!greedy.ok) return;

    yield { option, plan: greedy.plan, currency: null };

    const seen = new Set([this._planSignature(greedy.plan)]);
    const matchingItems = this._matchingItemsWithAvail(
      option,
      availableItems,
      remaining,
      matcher,
      restrictItemId,
      index
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
  _matchingItemsWithAvail(
    option,
    availableItems,
    remaining,
    matcher,
    restrictItemId,
    index = null
  ) {
    const out = [];
    for (const item of this._optionCandidates(
      option,
      availableItems,
      matcher,
      restrictItemId,
      index
    )) {
      const avail = Number(remaining.get(this._itemKey(item)) || 0);
      if (avail > 0) out.push({ item, avail });
    }
    return out;
  }

  /**
   * The stacks an option matches, in `availableItems` order.
   *
   * Reads the per-pass index when one is available and re-derives the filter otherwise,
   * so a caller holding the private search seam directly still gets the same answer. The
   * index makes this O(matching stacks) per call instead of O(|availableItems|) MATCHER
   * INVOCATIONS per call — and this is called once per option per search node, so it was
   * the second inventory-sized per-node term (the undo journal removed the first).
   *
   * `restrictItemId` (issue 552's tag-stack choice) narrows the result to one specific
   * held stack; it is applied to the indexed pool rather than baked into it, because the
   * index is shared by every branch and only one of them is pinned.
   * @private
   */
  _optionCandidates(option, availableItems, matcher, restrictItemId, index) {
    const pool =
      index?.optionItems.get(option) ??
      availableItems.filter((item) => (matcher ? matcher(option, item) : option.matches(item)));
    if (!restrictItemId) return pool;
    return pool.filter((item) => this._itemKey(item) === restrictItemId);
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
    if (this._chargeNode(budget)) return;
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
   *
   * When a `journal` is supplied (the backtracking search always supplies one; the
   * greedy pass never does, because it never backtracks) every overwritten key is
   * appended to it as a `key, previousValue` pair in write order, so
   * {@link _undoLedger} can revert exactly the keys this commit touched.
   * @private
   */
  _commitItemPlan(candidatePlan, plan, remaining, journal = null) {
    for (const entry of candidatePlan) {
      plan.push(entry);
      const key = this._itemKey(entry.item);
      const previous = remaining.get(key) || 0;
      if (journal) journal.push(key, previous);
      remaining.set(key, Math.max(0, previous - entry.quantity));
    }
  }

  _buildPlanForIngredient(
    ingredient,
    availableItems,
    remaining,
    matcher = null,
    restrictItemId = null,
    index = null
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

    // The matching stacks, from the per-pass index when there is one. `restrictItemId`
    // (issue 552 tag-stack choice) narrows a tag option to one specific held stack the
    // player picked, so the craft consumes THAT item.
    const matchingItems = this._optionCandidates(
      ingredient,
      availableItems,
      matcher,
      restrictItemId,
      index
    );

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

    const carriers = this._essenceCarriers(
      members,
      availableItems,
      remaining,
      ctx.resolveEssences,
      ctx.index
    );
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
  _essenceCarriers(members, availableItems, remaining, resolveEssences, index = null) {
    const neededIds = new Set(members.map((member) => member.essenceId).filter(Boolean));
    // The indexed path (issue 1083). The pass index already knows which stacks carry any
    // of this SET's essence ids and how much per unit, so the terminal re-reads only the
    // ledger — the one thing that legitimately changes as groups claim. Without it this
    // walked every held document and ran a `resolveEssences` probe per document at EVERY
    // terminal node, which is the essence half of the per-node inventory term.
    if (index?.essence) {
      return index.essence.carriers.flatMap((carrier) => {
        const ownedUnits = Number(remaining.get(carrier.itemKey) || 0);
        if (ownedUnits <= 0) return [];
        const perUnit = {};
        for (const essenceId of neededIds) {
          const amount = Number(carrier.perUnit[essenceId]) || 0;
          if (amount > 0) perUnit[essenceId] = amount;
        }
        if (Object.keys(perUnit).length === 0) return [];
        return [{ itemKey: carrier.itemKey, item: carrier.item, perUnit, ownedUnits }];
      });
    }

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
