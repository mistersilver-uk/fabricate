/**
 * Ingredient assignment: which option satisfies each of a set's groups, found by a contention-staged
 * bounded search over the held stacks, with the author-order greedy pass as its fallback.
 */
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
import {
  INGREDIENT_SEARCH_NODE_CAP,
  buildItemPlanForOption,
  candidateStacksWithAvailability,
  chargeNode,
  commitItemPlan,
  enumerateUnitPlans,
  itemKeyOf,
  planSignature,
  seedRemaining as seedRemainingDefault,
  undoLedger,
} from './ingredientLedger.js';
import { getMatchHandler } from './match/matchTypes.js';

/**
 * A solver for one ingredient set's groups. `seedRemaining` and `buildPassIndex` are injectable so
 * a cost probe can count what the resolution does to the ledger and where the per-pass index ends.
 */
export function createIngredientSolver({
  ingredientGroups,
  ingredientSetId,
  seedRemaining = seedRemainingDefault,
  buildPassIndex = buildPassIndexDefault,
}) {
  return {
    resolve(availableItems, matcher = null, options = {}) {
      const { affordCurrency, optionOverrides, resolveItemEssences } = options;
      const ctx = {
        affordCurrency,
        optionOverrides,
        resolveEssences: essenceResolverFor(resolveItemEssences),
        essenceAllocation: options.essenceAllocation ?? null,
        allocate:
          typeof options.allocateEssences === 'function'
            ? options.allocateEssences
            : greedyAllocate,
      };
      const deps = { ingredientGroups, seedRemaining, buildPassIndex };
      // The per-pass resolution index (issue 1083).
      ctx.index = buildPassIndex(availableItems, matcher, ctx, deps);

      // Bounded item-level backtracking (issue 663): find a satisfying assignment if one exists.
      const search = searchAssignment(availableItems, matcher, ctx, deps);

      // The solver's own cost, surfaced rather than discarded (issue 1072).
      const searchStats = Object.freeze({ nodes: search.nodes, capHit: search.capHit });
      if (search.selection) return { ...search.selection, searchStats };

      // Proven unsatisfiable, or the generous search bound was reached (a safeguard degradation that
      // is never worse than the pre-663 behaviour and never double-counts): fall back to the
      // author-order greedy pass.
      if (search.capHit) {
        console.warn(
          `Fabricate | IngredientSet ${ingredientSetId}: ingredient assignment search reached its ` +
            `${INGREDIENT_SEARCH_NODE_CAP}-node bound; falling back to greedy resolution ` +
            '(a satisfiable assignment may be missed for this pathological input).'
        );
      }
      return { ...resolveGreedy(availableItems, matcher, ctx, deps), searchStats };
    },
  };
}

/**
 * The per-pass resolution index (issue 1083): everything both resolution paths would otherwise
 * re-derive per search node, derived once instead.
 */
export function buildPassIndexDefault(
  availableItems,
  matcher,
  ctx,
  { ingredientGroups, seedRemaining = seedRemainingDefault }
) {
  const items = Array.isArray(availableItems) ? availableItems : [];
  const optionItems = new Map();
  const essenceOptions = [];
  const groupCandidateKeys = ingredientGroups.map((group) =>
    indexGroupCandidates(group, items, matcher, optionItems, essenceOptions)
  );
  const essence = buildEssenceIndex(items, essenceOptions, ctx, { seedRemaining });

  return {
    optionItems,
    groupCandidateKeys,
    blockGroups: groupsCarryingTheBlock(ingredientGroups, essence),
    essence,
  };
}

/**
 * Index one group: record each non-currency option's matching stacks, collect its essence options
 * for the block index, and return the group's candidate item keys, which are the vertex data the
 * contention components join on.
 */
function indexGroupCandidates(group, items, matcher, optionItems, essenceOptions) {
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
function groupsCarryingTheBlock(ingredientGroups, essence) {
  const carrying = new Set();
  if (!essence) return carrying;
  for (const [groupIndex, group] of ingredientGroups.entries()) {
    const options = group.options || [];
    if (options.some((option) => isFundableEssenceOption(option, group, essence))) {
      carrying.add(groupIndex);
    }
  }
  return carrying;
}

/**
 * A union-find (disjoint-set) forest over `size` vertices, with path compression and a deterministic
 * tie-break: a union always keeps the lower vertex as the root, so a component's root is its lowest
 * member and iterating roots in ascending order yields the components in author order.
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
 * Partition the ingredient groups into contention components: the connected components of the graph
 * whose vertices are the groups (plus one vertex for the essence block) and whose edges join any two
 * that could draw on the same held stack.
 */
function contentionComponents(index, ingredientGroups) {
  const groupCount = ingredientGroups.length;
  const blockVertex = groupCount;
  const { find, union } = unionFind(groupCount + 1);

  const claimedBy = joinGroupContention(index, groupCount, union);
  const blockLive = index.blockGroups.size > 0;
  if (blockLive) joinBlockContention(index, blockVertex, claimedBy, union);

  const byRoot = new Map();
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const root = find(groupIndex);
    if (!byRoot.has(root)) byRoot.set(root, { groups: [], ownsBlock: false });
    byRoot.get(root).groups.push(groupIndex);
  }
  if (blockLive) {
    const blockRoot = find(blockVertex);
    // The block always shares a root with at least one group, because a live block exists only when
    // some group carries a fundable essence option.
    if (byRoot.has(blockRoot)) byRoot.get(blockRoot).ownsBlock = true;
  }

  return [...byRoot].sort(([left], [right]) => left - right).map(([, component]) => component);
}

/**
 * Join every pair of groups sharing a candidate held stack, and report which group first claimed
 * each key so the block can be joined to it in one pass rather than by re-walking the group index.
 */
function joinGroupContention(index, groupCount, union) {
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
 * Join the essence-block vertex to the groups it contends with, in both directions the block
 * contends: by membership (a group carrying a still-fundable essence option) and by draw (a group
 * whose candidates include one of the block's carrier stacks).
 */
function joinBlockContention(index, blockVertex, claimedBy, union) {
  for (const groupIndex of index.blockGroups) union(groupIndex, blockVertex);
  for (const key of index.essence.carrierKeys) {
    const prior = claimedBy.get(key);
    if (prior !== undefined) union(blockVertex, prior);
  }
}

/**
 * Item-level bounded backtracking over the ingredient groups (issue 663), staged by contention
 * (issue 1083).
 */
function searchAssignment(
  availableItems,
  matcher,
  ctx,
  { ingredientGroups, seedRemaining, buildPassIndex }
) {
  // A ctx that arrives without an index mints one here, so no caller silently falls back to the
  // unindexed scans.
  ctx.index ??= buildPassIndex(availableItems, matcher, ctx, { ingredientGroups, seedRemaining });
  const budget = { nodes: 0, capHit: false };
  const frame = {
    availableItems,
    matcher,
    ctx,
    budget,
    groups: ingredientGroups,
    index: ctx.index,
    remaining: seedRemaining(availableItems),
    // The shared undo journal: `[key, previousValue, key, previousValue, ...]` in write order.
    journal: [],
  };

  const chosenByGroup = Array.from({ length: ingredientGroups.length }, () => null);
  let block = null;
  for (const component of contentionComponents(frame.index, ingredientGroups)) {
    const resolved = resolveContentionComponent(component, frame);
    if (!resolved) return { selection: null, nodes: budget.nodes, capHit: budget.capHit };
    for (const [position, groupIndex] of component.groups.entries()) {
      chosenByGroup[groupIndex] = resolved.chosen[position];
    }
    if (resolved.block) block = resolved.block;
  }

  return {
    selection: composeSelection(chosenByGroup, block),
    nodes: budget.nodes,
    capHit: budget.capHit,
  };
}

/** Assemble the success result from the per-group choices, in author order. */
function composeSelection(chosenByGroup, block) {
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
 * Resolve one contention component: either the indexed fast path or a search scoped to that
 * component's groups.
 */
function resolveContentionComponent(component, frame) {
  if (component.groups.length === 1 && !component.ownsBlock) {
    const group = frame.groups[component.groups[0]];
    const choice = firstGroupChoice(group, frame);
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
  return searchComponentGroup(0, component, state, frame) ? state : null;
}

/**
 * The first choice a group yields against the current ledger, or null when it yields none (the group
 * cannot be satisfied at all).
 */
function firstGroupChoice(group, frame) {
  const { done, value } = groupChoices(group, frame).next();
  return done ? null : value;
}

/** Recursive depth-first body for one contention component. */
function searchComponentGroup(position, component, state, frame) {
  const { budget } = frame;
  if (budget.capHit) return false;
  if (position >= component.groups.length) {
    return searchComponentTerminal(component, state, frame);
  }
  if (chargeNode(budget)) return false;

  const group = frame.groups[component.groups[position]];
  for (const choice of groupChoices(group, frame)) {
    if (budget.capHit) return false;
    const mark = frame.journal.length;
    state.chosen[position] = choice;
    applyChoice(choice, state, frame);

    if (searchComponentGroup(position + 1, component, state, frame)) return true;

    state.chosen[position] = null;
    revertChoice(choice, state, frame, mark);
  }
  return false;
}

/** The terminal node of one component's traversal. */
function searchComponentTerminal(component, state, frame) {
  if (chargeNode(frame.budget)) return false;
  return component.ownsBlock ? settleEssenceBlock(state, frame) : true;
}

/** Commit one chosen choice. */
function applyChoice(choice, state, frame) {
  if (choice.member) {
    state.essenceMembers.push(choice.member);
  } else if (!choice.currency) {
    commitItemPlan(choice.plan, state.plan, frame.remaining, frame.journal);
  }
}

/** Undo a committed choice, reverting the ledger to the caller's `mark`. */
function revertChoice(choice, state, frame, mark) {
  if (choice.member) {
    state.essenceMembers.pop();
  } else if (!choice.currency) {
    state.plan.length -= choice.plan.length;
  }
  undoLedger(frame.remaining, frame.journal, mark);
}

/**
 * The search's terminal node: settle the whole set's essence block against whatever the
 * component/tag groups left in `remaining`.
 */
function settleEssenceBlock(state, frame) {
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
function* groupChoices(group, frame) {
  const { ctx } = frame;
  const options = group.options || [];
  const override = resolveGroupOverride(ctx.optionOverrides, group, options);
  if (override) {
    const option = options[override.optionIndex];
    if (option?.match?.type === 'currency') {
      const spend = currencySpendFor(option, ctx.affordCurrency);
      if (spend) yield { option, plan: [], currency: spend };
      return;
    }
    yield* optionItemChoices(option, group, override.heldItemId, frame);
    return;
  }

  for (const option of options) {
    if (option?.match?.type === 'currency') continue;
    yield* optionItemChoices(option, group, null, frame);
  }
  for (const option of options) {
    if (option?.match?.type !== 'currency') continue;
    const spend = currencySpendFor(option, ctx.affordCurrency);
    if (spend) yield { option, plan: [], currency: spend };
  }
}

/**
 * Lazily yield the item-consumption candidates for a non-currency option against the current
 * `remaining`, greedy subset first (byte-identical to the plan builder's pick), then alternative
 * subsets that free contended items.
 */
function* optionItemChoices(option, group, restrictItemId, scan) {
  if (option?.match?.type === 'essence') {
    const member = essenceBlockMember(group, option);
    if (!essenceMemberIsFundable(member, scan.index?.essence)) return;
    yield { option, plan: [], currency: null, member };
    return;
  }
  yield* componentTagOptionChoices(option, restrictItemId, scan);
}

/**
 * Candidate item plans for a component/tag option: the greedy front-loaded pick first, then every
 * distinct alternative unit-count assignment over the matching stacks that also meets `quantity`.
 */
function* componentTagOptionChoices(option, restrictItemId, scan) {
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
 * The author-order greedy resolution (the pre-issue-663 behaviour), retained as the deterministic
 * `missingGroups` source and the bounded-search safeguard fallback.
 */
function resolveGreedy(availableItems, matcher, ctx, { ingredientGroups, seedRemaining }) {
  const pass = {
    availableItems,
    matcher,
    ctx,
    // The greedy pass presents the same scan shape as the search, so the candidate generators read
    // one shape whichever resolution stage drives them.
    index: ctx.index ?? null,
    remaining: seedRemaining(availableItems),
    plan: [],
    currencySpends: [],
  };

  const outcomes = ingredientGroups.map((group) => resolveGroupGreedy(group, pass));

  const members = outcomes.filter((outcome) => outcome.member).map((outcome) => outcome.member);
  const block = resolveEssenceBlock(members, availableItems, pass.remaining, ctx);
  commitItemPlan(block.plan, pass.plan, pass.remaining);

  const { selectedIngredients, missingGroups } = collectGreedyOutcomes(outcomes, block);
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
 * Resolve one group in the greedy pass, mutating the pass accumulators for a component, tag or
 * currency choice.
 */
function resolveGroupGreedy(group, pass) {
  const options = group.options || [];
  // Player override (issue 552): resolve the explicitly chosen option instead of the
  // first-satisfiable default.
  const override = resolveGroupOverride(pass.ctx.optionOverrides, group, options);
  if (override) {
    return resolveOverriddenGroupGreedy(group, options[override.optionIndex], override, pass);
  }
  return resolveFirstSatisfiableGroupGreedy(group, options, pass);
}

/** The `optionOverrides` branch of the greedy pass: that option is resolved, satisfiable or not. */
function resolveOverriddenGroupGreedy(group, option, override, pass) {
  if (option?.match?.type === 'currency') {
    const spend = currencySpendFor(option, pass.ctx.affordCurrency);
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

/** The default branch of the greedy pass: items first, then currency. */
function resolveFirstSatisfiableGroupGreedy(group, options, pass) {
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

  return resolveCurrencyFallbackGreedy(group, options, bestMissing, pass);
}

/**
 * The greedy currency fallback: only when no item option satisfied, choose the first affordable
 * currency option, in author order among the currency options.
 */
function resolveCurrencyFallbackGreedy(group, options, bestMissing, pass) {
  let fallback = bestMissing;
  for (const option of options) {
    if (option?.match?.type !== 'currency') continue;
    const spend = currencySpendFor(option, pass.ctx.affordCurrency);
    if (spend) {
      pass.currencySpends.push({ unit: spend.unit, amount: spend.amount, ingredient: option });
      return { option };
    }
    fallback ??= { ingredient: option, have: 0, need: option.quantity };
  }
  return { missing: { group, ...fallback } };
}

/**
 * Emit `selectedIngredients` and `missingGroups` in author-group order, reading each deferred
 * essence group's verdict out of the block's per-requirement partition, parallel to `block.members`.
 */
function collectGreedyOutcomes(outcomes, block) {
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
          // The essence amount the partition assigns this requirement, never the ledger total of
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
 * A validated `{ optionIndex, heldItemId }` override for a group, or null when there is no override
 * (or it names an out-of-range option, in which case the default author-order resolution applies).
 */
function resolveGroupOverride(optionOverrides, group, options) {
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
function currencySpendFor(option, affordCurrency) {
  if (option?.match?.type !== 'currency') return null;
  const handler = getMatchHandler(option.match);
  if (!handler.affords(option.match, { affordCurrency })) return null;
  return handler.getCurrencySpend(option.match);
}
