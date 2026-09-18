import { getFabricateFlag } from '../config/flags.js';
import { greedyAllocate } from '../utils/essenceAllocation.js';

import {
  buildEssenceIndex,
  essenceBlockMember,
  essenceMemberIsFundable,
  essencePoolFrom,
  essenceResolverFor,
  isFundableEssenceOption,
  resolveEssenceBlock,
} from './ingredientEssenceBlock.js';
import { IngredientGroup } from './IngredientGroup.js';
import {
  INGREDIENT_SEARCH_NODE_CAP,
  buildItemPlanForOption,
  candidateStacksWithAvailability,
  chargeNode,
  commitItemPlan,
  enumerateUnitPlans,
  itemKeyOf,
  planSignature,
  seedRemaining,
  undoLedger,
} from './ingredientLedger.js';
import { getMatchHandler } from './match/matchTypes.js';
import {
  isEmptyArray,
  isEmptyMap,
  isEmptyString,
  isNull,
  omitReconstructibleDefaults,
} from './reconstructibleDefaults.js';

/**
 * Serialized ingredient-SET fields the `IngredientSet` constructor rebuilds to EXACTLY this value
 * when the key is absent, so emitting them is pure payload weight (issue 1135).
 */
export const INGREDIENT_SET_OMITTED_WHEN_DEFAULT = {
  name: isEmptyString,
  essences: isEmptyMap,
  toolIds: isEmptyArray,
  resultMapping: isEmptyArray,
  resultGroupId: isNull,
};

// Re-exported so callers of the model keep reading the cap from it while the ledger owns the value.
export { INGREDIENT_SEARCH_NODE_CAP } from './ingredientLedger.js';

/**
 * A union-find (disjoint-set) forest over `size` vertices, with path compression and a
 * deterministic tie-break: a union always keeps the LOWER vertex as the root, so a component's root
 * is its lowest member, and iterating roots in ascending order yields the components in author
 * order.
 */
function unionFind(size) {
  const parent = Array.from({ length: size }, (_unused, vertex) => vertex);
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
  return { find, union };
}

/**
 * Represents a set of ingredients that can satisfy a recipe's input requirements. Multiple
 * ingredient sets allow recipes to accept alternative combinations (e.g., "2xA OR 1xB + 1xC")
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
   * Normalize an array of library tool id strings: coerce to trimmed, non-empty, deduped strings.
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

  /** PERMANENT INBOUND SHIM — do not remove with a "the alias is gone" cleanup. */
  _legacyIngredientsToGroups(ingredients = []) {
    return (ingredients || []).map((ingredient, idx) => ({
      id: foundry.utils.randomID(),
      name: `Group ${idx + 1}`,
      options: [ingredient],
    }));
  }

  /** Validate that this ingredient set has all required data */
  validate({ requireComplete = true } = {}) {
    const errors = [];

    if (
      requireComplete &&
      this.ingredientGroups.length === 0 &&
      Object.keys(this.essences).length === 0
    ) {
      errors.push('Ingredient set must have at least one ingredient group or essence requirement');
    }

    // Validate ingredient groups/options.
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

    // Validate essence requirements.
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

  /** Check if this ingredient set can be crafted with the given items */
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

  /** Accumulate essences from all available items */
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

  /** Match ingredients to available items and return consumption plan */
  matchIngredients(availableItems, matcher = null, opts = {}) {
    const selection = this.resolveIngredientSelection(availableItems, matcher, opts);
    return selection.success ? selection.plan : [];
  }

  /**
   * Resolve which option satisfies each ingredient group, building the item consumption plan and
   * (when a currency probe is supplied) the currency spends.
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
    const resolveEssences = essenceResolverFor(resolveItemEssences);
    const ctx = {
      affordCurrency,
      optionOverrides,
      resolveEssences,
      essenceAllocation: essenceAllocation ?? null,
      allocate: typeof allocateEssences === 'function' ? allocateEssences : greedyAllocate,
    };
    // The per-pass resolution index (issue 1083).
    ctx.index = this._buildPassIndex(availableItems, matcher, ctx);

    // Item-level bounded backtracking (issue 663): find a satisfying item->group assignment
    // whenever one exists.
    const search = this._searchAssignment(availableItems, matcher, ctx);

    // The solver's own cost, surfaced rather than discarded (issue 1072).
    const searchStats = Object.freeze({ nodes: search.nodes, capHit: search.capHit });
    if (search.selection) return { ...search.selection, searchStats };

    // Proven unsatisfiable, or the generous search bound was reached (a safeguard degradation that
    // is never worse than the pre-663 behaviour and never double-counts): fall back to the
    // author-order greedy pass.
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
   * The author-order greedy resolution (the pre-issue-663 behaviour), retained as the deterministic
   * `missingGroups` source and the bounded-search safeguard fallback.
   */
  _resolveGreedy(availableItems, matcher, ctx) {
    const pass = {
      availableItems,
      matcher,
      ctx,
      // The greedy pass is a {@link SCAN} too, so the candidate generators read one shape whichever
      // resolution stage is driving them.
      index: ctx.index ?? null,
      remaining: seedRemaining(availableItems),
      plan: [],
      currencySpends: [],
    };

    const outcomes = this.ingredientGroups.map((group) => this._resolveGroupGreedy(group, pass));

    const members = outcomes.filter((outcome) => outcome.member).map((outcome) => outcome.member);
    const block = resolveEssenceBlock(members, availableItems, pass.remaining, ctx);
    commitItemPlan(block.plan, pass.plan, pass.remaining);

    const { selectedIngredients, missingGroups } = this._collectGreedyOutcomes(outcomes, block);
    return {
      success: missingGroups.length === 0,
      selectedIngredients,
      plan: pass.plan,
      currencySpends: pass.currencySpends,
      missingGroups,
      essenceAllocation: block.allocation,
      essencePool: essencePoolFrom(block),
    };
  }

  /**
   * Resolve ONE group in the greedy pass, mutating the pass accumulators for a
   * component/tag/currency choice.
   */
  _resolveGroupGreedy(group, pass) {
    const options = group.options || [];
    // Player override (issue 552): resolve the explicitly chosen option instead of the
    // first-satisfiable default.
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
   * The `optionOverrides` branch of {@link _resolveGroupGreedy}: THAT option is resolved,
   * satisfiable or not.
   */
  _resolveOverriddenGroupGreedy(group, option, override, pass) {
    if (option?.match?.type === 'currency') {
      const spend = this._currencySpendFor(option, pass.ctx.affordCurrency);
      if (!spend) return { missing: { group, ingredient: option, have: 0, need: option.quantity } };
      pass.currencySpends.push({ unit: spend.unit, amount: spend.amount, ingredient: option });
      return { option };
    }
    if (option?.match?.type === 'essence') {
      return { member: essenceBlockMember(group, option) };
    }
    const candidate = buildItemPlanForOption(option, override.heldItemId, pass);
    if (!candidate.ok) {
      return {
        missing: { group, ingredient: option, have: candidate.have, need: option.quantity },
      };
    }
    commitItemPlan(candidate.plan, pass.plan, pass.remaining);
    return { option };
  }

  /** The default branch of {@link _resolveGroupGreedy}: items-first, then currency. */
  _resolveFirstSatisfiableGroupGreedy(group, options, pass) {
    let bestMissing = null;

    for (const option of options) {
      if (option?.match?.type === 'currency') continue;
      if (option?.match?.type === 'essence') return { member: essenceBlockMember(group, option) };
      const candidate = buildItemPlanForOption(option, null, pass);
      if (candidate.ok) {
        commitItemPlan(candidate.plan, pass.plan, pass.remaining);
        return { option };
      }
      if (!bestMissing || candidate.have > bestMissing.have) {
        bestMissing = { ingredient: option, have: candidate.have, need: option.quantity };
      }
    }

    return this._resolveCurrencyFallbackGreedy(group, options, bestMissing, pass);
  }

  /**
   * Currency-fallback for {@link _resolveFirstSatisfiableGroupGreedy}: only when no item option
   * satisfied, choose the first AFFORDABLE currency option (author order among currency options).
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
   * Pass 3 of {@link _resolveGreedy}: emit `selectedIngredients` and `missingGroups` in
   * AUTHOR-GROUP order, reading each deferred essence group's verdict out of the block's
   * per-requirement partition (parallel to `block.members`).
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
            // The essence AMOUNT the partition assigns this requirement — never the ledger total of
            // matching items held, which would render `6/4 ✗` for a player who allocated 2 of a
            // needed 4 while holding 6.
            have: state?.delivered ?? 0,
            need: outcome.member.need,
          });
        }
      }
    }

    return { selectedIngredients, missingGroups };
  }

  /**
   * The PER-PASS resolution index (issue 1083): everything both resolution paths would otherwise
   * re-derive per search node, derived once instead.
   */
  _buildPassIndex(availableItems, matcher, ctx) {
    const items = Array.isArray(availableItems) ? availableItems : [];
    const optionItems = new Map();
    const essenceOptions = [];
    const groupCandidateKeys = this.ingredientGroups.map((group) =>
      this._indexGroupCandidates(group, items, matcher, optionItems, essenceOptions)
    );
    const essence = buildEssenceIndex(items, essenceOptions, ctx, { seedRemaining });

    return {
      optionItems,
      groupCandidateKeys,
      blockGroups: this._groupsCarryingTheBlock(essence),
      essence,
    };
  }

  /**
   * Index one group: record each non-currency option's matching stacks, collect its essence options
   * for the block index, and return the group's candidate item keys — the vertex data {@link
   * _contentionComponents} joins on.
   */
  _indexGroupCandidates(group, items, matcher, optionItems, essenceOptions) {
    const keys = new Set();
    for (const option of group.options || []) {
      const type = option?.match?.type;
      if (type === 'currency') continue;
      if (type === 'essence') {
        essenceOptions.push(essenceBlockMember(group, option));
        continue;
      }
      const matched = items.filter((item) =>
        matcher ? matcher(option, item) : option.matches(item)
      );
      optionItems.set(option, matched);
      for (const item of matched) keys.add(itemKeyOf(item));
    }
    return keys;
  }

  /**
   * The groups that could still add a requirement to the essence block, and are therefore jointly
   * constrained by it however disjoint their item candidates are.
   */
  _groupsCarryingTheBlock(essence) {
    const carrying = new Set();
    if (!essence) return carrying;
    for (const [groupIndex, group] of this.ingredientGroups.entries()) {
      const options = group.options || [];
      if (options.some((option) => isFundableEssenceOption(option, group, essence))) {
        carrying.add(groupIndex);
      }
    }
    return carrying;
  }

  /**
   * Partition the ingredient groups into CONTENTION COMPONENTS: the connected components of the
   * graph whose vertices are the groups (plus one vertex for the essence block) and whose edges
   * join any two that could draw on the same held stack.
   */
  _contentionComponents(index) {
    const groupCount = this.ingredientGroups.length;
    const blockVertex = groupCount;
    const { find, union } = unionFind(groupCount + 1);

    const claimedBy = this._joinGroupContention(index, groupCount, union);
    const blockLive = index.blockGroups.size > 0;
    if (blockLive) this._joinBlockContention(index, blockVertex, claimedBy, union);

    const byRoot = new Map();
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const root = find(groupIndex);
      if (!byRoot.has(root)) byRoot.set(root, { groups: [], ownsBlock: false });
      byRoot.get(root).groups.push(groupIndex);
    }
    if (blockLive) {
      const blockRoot = find(blockVertex);
      // The block always shares a root with at least one group, because a live block exists only
      // when some group carries a feasible essence option.
      if (byRoot.has(blockRoot)) byRoot.get(blockRoot).ownsBlock = true;
    }

    return [...byRoot].sort(([left], [right]) => left - right).map(([, component]) => component);
  }

  /**
   * Join every pair of groups sharing a candidate held stack, and report which group first claimed
   * each key so {@link _joinBlockContention} can join the block to it in one pass rather than
   * re-walking the group index.
   */
  _joinGroupContention(index, groupCount, union) {
    const claimedBy = new Map();
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      for (const key of index.groupCandidateKeys[groupIndex]) {
        const prior = claimedBy.get(key);
        if (prior === undefined) claimedBy.set(key, groupIndex);
        else union(groupIndex, prior);
      }
    }
    return claimedBy;
  }

  /**
   * Join the essence-block vertex to the groups it contends with, in BOTH directions the block
   * contends: by membership (a group carrying a still-feasible essence option) and by draw (a group
   * whose candidates include one of the block's carrier stacks).
   */
  _joinBlockContention(index, blockVertex, claimedBy, union) {
    for (const groupIndex of index.blockGroups) union(groupIndex, blockVertex);
    for (const key of index.essence.carrierKeys) {
      const prior = claimedBy.get(key);
      if (prior !== undefined) union(blockVertex, prior);
    }
  }

  /**
   * Item-level bounded backtracking over the ingredient groups (issue 663), STAGED by contention
   * (issue 1083).
   */
  _searchAssignment(availableItems, matcher, ctx) {
    // A caller holding the private ctx directly (the search-seam tests) has no index, so mint one
    // rather than silently falling back to the unindexed scans.
    ctx.index ??= this._buildPassIndex(availableItems, matcher, ctx);
    const budget = { nodes: 0, capHit: false };
    const frame = {
      availableItems,
      matcher,
      ctx,
      budget,
      index: ctx.index,
      remaining: seedRemaining(availableItems),
      // The shared undo journal: `[key, previousValue, key, previousValue, ...]` in write order.
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

  /** Assemble the success result from the per-group choices, in AUTHOR order. */
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
      essencePool: essencePoolFrom(block),
    };
  }

  /**
   * Resolve ONE contention component: either the indexed fast path or a search scoped to that
   * component's groups.
   */
  _resolveContentionComponent(component, frame) {
    if (component.groups.length === 1 && !component.ownsBlock) {
      const group = this.ingredientGroups[component.groups[0]];
      const choice = this._firstGroupChoice(group, frame);
      if (!choice) return null;
      if (!choice.currency && !choice.member) {
        commitItemPlan(choice.plan, [], frame.remaining);
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
   * The first choice a group yields against the current ledger, or null when it yields none (the
   * group cannot be satisfied at all).
   */
  _firstGroupChoice(group, frame) {
    const { done, value } = this._groupChoices(group, frame).next();
    return done ? null : value;
  }

  /** Recursive DFS body for one contention component. */
  _searchComponentGroup(position, component, state, frame) {
    const { budget } = frame;
    if (budget.capHit) return false;
    if (position >= component.groups.length) {
      return this._searchComponentTerminal(component, state, frame);
    }
    if (chargeNode(budget)) return false;

    const group = this.ingredientGroups[component.groups[position]];
    for (const choice of this._groupChoices(group, frame)) {
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

  /** The terminal node of one component's traversal. */
  _searchComponentTerminal(component, state, frame) {
    if (chargeNode(frame.budget)) return false;
    return component.ownsBlock ? this._settleEssenceBlock(state, frame) : true;
  }

  /** Commit one chosen choice. */
  _applyChoice(choice, state, frame) {
    if (choice.member) {
      state.essenceMembers.push(choice.member);
    } else if (!choice.currency) {
      commitItemPlan(choice.plan, state.plan, frame.remaining, frame.journal);
    }
  }

  /** Undo {@link _applyChoice}, reverting the ledger to the caller's `mark`. */
  _revertChoice(choice, state, frame, mark) {
    if (choice.member) {
      state.essenceMembers.pop();
    } else if (!choice.currency) {
      state.plan.length -= choice.plan.length;
    }
    undoLedger(frame.remaining, frame.journal, mark);
  }

  /**
   * The DFS terminal node: settle the whole set's essence block against whatever the component/tag
   * groups left in `remaining`.
   */
  _settleEssenceBlock(state, frame) {
    const block = resolveEssenceBlock(
      state.essenceMembers,
      frame.availableItems,
      frame.remaining,
      frame.ctx
    );
    if (!block.ok) return false;
    commitItemPlan(block.plan, state.plan, frame.remaining, frame.journal);
    state.block = block;
    return true;
  }

  /** Lazily yield the ordered candidate choices for one group against the current `remaining`. */
  *_groupChoices(group, frame) {
    const { ctx } = frame;
    const options = group.options || [];
    const override = this._resolveGroupOverride(ctx.optionOverrides, group, options);
    if (override) {
      const option = options[override.optionIndex];
      if (option?.match?.type === 'currency') {
        const spend = this._currencySpendFor(option, ctx.affordCurrency);
        if (spend) yield { option, plan: [], currency: spend };
        return;
      }
      yield* this._optionItemChoices(option, group, override.heldItemId, frame);
      return;
    }

    for (const option of options) {
      if (option?.match?.type === 'currency') continue;
      yield* this._optionItemChoices(option, group, null, frame);
    }
    for (const option of options) {
      if (option?.match?.type !== 'currency') continue;
      const spend = this._currencySpendFor(option, ctx.affordCurrency);
      if (spend) yield { option, plan: [], currency: spend };
    }
  }

  /**
   * Lazily yield the item-consumption candidates for a NON-currency option against the current
   * `remaining`, greedy subset first (byte-identical to the plan builder's pick), then alternative
   * subsets that free contended items.
   */
  *_optionItemChoices(option, group, restrictItemId, scan) {
    if (option?.match?.type === 'essence') {
      const member = essenceBlockMember(group, option);
      if (!essenceMemberIsFundable(member, scan.index?.essence)) return;
      yield { option, plan: [], currency: null, member };
      return;
    }
    yield* this._componentTagOptionChoices(option, restrictItemId, scan);
  }

  /**
   * Candidate item plans for a component/tag option: the greedy front-loaded pick first, then every
   * distinct alternative unit-count assignment over the matching stacks that also meets `quantity`.
   */
  *_componentTagOptionChoices(option, restrictItemId, scan) {
    const { budget } = scan;
    const greedy = buildItemPlanForOption(option, restrictItemId, scan);
    if (!greedy.ok) return;

    yield { option, plan: greedy.plan, currency: null };

    const seen = new Set([planSignature(greedy.plan)]);
    const matchingItems = candidateStacksWithAvailability(option, restrictItemId, scan);
    for (const plan of enumerateUnitPlans(option, matchingItems, option.quantity, budget)) {
      if (budget.capHit) return;
      const signature = planSignature(plan);
      if (seen.has(signature)) continue;
      seen.add(signature);
      yield { option, plan, currency: null };
    }
  }

  /**
   * Resolve a validated `{ optionIndex, heldItemId }` override for a group, or null when there is
   * no override (or it names an out-of-range option, in which case the default author-order
   * resolution applies).
   */
  _resolveGroupOverride(optionOverrides, group, options) {
    const raw = optionOverrides?.[group?.id];
    if (!raw) return null;
    const idx = Number(raw.optionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;
    return { optionIndex: idx, heldItemId: raw.heldItemId ?? null };
  }

  /**
   * The affordable currency spend for a currency option, or null when the option is not currency or
   * the actor cannot afford it.
   */
  _currencySpendFor(option, affordCurrency) {
    if (option?.match?.type !== 'currency') return null;
    const handler = getMatchHandler(option.match);
    if (!handler.affords(option.match, { affordCurrency })) return null;
    return handler.getCurrencySpend(option.match);
  }

  /**
   * Serialize this set, omitting every reconstructible default and the write-retired flat
   * `ingredients` alias (issue 1135).
   */
  toJSON() {
    return omitReconstructibleDefaults(
      {
        id: this.id,
        name: this.name,
        ingredientGroups: this.ingredientGroups.map((group) => group.toJSON()),
        essences: this.essences,
        toolIds: [...this.toolIds],
        resultMapping: this.resultMapping,
        resultGroupId: this.resultGroupId,
      },
      INGREDIENT_SET_OMITTED_WHEN_DEFAULT
    );
  }

  static fromJSON(data) {
    return new IngredientSet(data);
  }
}
