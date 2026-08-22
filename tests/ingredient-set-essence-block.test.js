/**
 * Issue 917 — the shared essence BLOCK in `IngredientSet.resolveIngredientSelection`.
 *
 * Every `match.type === 'essence'` option in one ingredient set is funded jointly from
 * one backtrackable node placed after every component/tag group has claimed. These
 * tests pin the parts of that contract whose breakage is SILENT: the author-order
 * emission `RecipeManager` reads positionally, the block's ability to force an earlier
 * group to re-branch, the one-entry-per-item-key plan, and the per-essence-id
 * attribution partition that supplies every requirement's reported quantity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = { utils: { randomID: () => crypto.randomUUID() } };

const { IngredientSet } = await import('../src/models/IngredientSet.js');

// A minimal item: uuid + quantity. Essence contributions come from an explicit probe
// rather than flags, so a test declares exactly which stack carries what.
function item(uuid, quantity = 1) {
  return { uuid, system: { quantity }, getFlag: () => undefined };
}

function essenceProbe(table) {
  return (held) => table[held.uuid] || {};
}

function matcherFor(rules) {
  return (ingredient, held) => {
    const allowed = rules[ingredient?.match?.type];
    return allowed ? allowed.has(held.uuid) : false;
  };
}

function essenceGroup(id, essenceId, amount) {
  return { id, options: [{ quantity: 1, match: { type: 'essence', essenceId, amount } }] };
}

function componentGroup(id, componentId, quantity = 1) {
  return { id, options: [{ quantity, match: { type: 'component', componentId } }] };
}

function tagGroup(id, tags, quantity = 1) {
  return { id, options: [{ quantity, match: { type: 'tags', tags, tagMatch: 'any' } }] };
}

function consumedByUuid(selection) {
  const totals = {};
  for (const entry of selection.plan) {
    totals[entry.item.uuid] = (totals[entry.item.uuid] || 0) + entry.quantity;
  }
  return totals;
}

function requirementFor(selection, groupId) {
  return selection.essencePool?.requirements.find((entry) => entry.groupId === groupId) ?? null;
}

// ---------------------------------------------------------------------------
// The positional `selectedIngredients` contract. `RecipeManager._chosenOptionByGroup`
// reads it by RUNNING INDEX over non-missing groups, so emitting the essence entry
// out of author position mis-maps every later tile's image, name, need and checked
// radio with no exception thrown anywhere.
// ---------------------------------------------------------------------------

test('selectedIngredients stays in author-group order when the essence group is authored FIRST', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-ess', 'fire', 2), componentGroup('g-cmp', 'cmp-iron')],
  });
  const matcher = matcherFor({ component: new Set(['iron']) });

  const selection = set.resolveIngredientSelection([item('ember'), item('iron')], matcher, {
    resolveItemEssences: essenceProbe({ ember: { fire: 2 } }),
  });

  assert.equal(selection.success, true);
  assert.equal(selection.selectedIngredients.length, 2);
  assert.equal(
    selection.selectedIngredients[0].match.type,
    'essence',
    'index 0 is the FIRST AUTHORED group, even though the block resolves last'
  );
  assert.equal(selection.selectedIngredients[1].match.type, 'component');
});

test('selectedIngredients stays in author-group order with essence groups either side of a component group', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [
      essenceGroup('g-fire', 'fire', 2),
      componentGroup('g-cmp', 'cmp-iron'),
      essenceGroup('g-earth', 'earth', 1),
    ],
  });
  const matcher = matcherFor({ component: new Set(['iron']) });

  const selection = set.resolveIngredientSelection(
    [item('ember'), item('iron'), item('loam')],
    matcher,
    { resolveItemEssences: essenceProbe({ ember: { fire: 2 }, loam: { earth: 1 } }) }
  );

  assert.equal(selection.success, true);
  assert.deepEqual(
    selection.selectedIngredients.map((option) => option.match.type),
    ['essence', 'component', 'essence'],
    'one entry per non-missing group, in author order'
  );
});

test('a missing essence group still leaves the later groups index-aligned', () => {
  // g-ess cannot fund, so it contributes NO selectedIngredients entry; the component
  // group must therefore read back at running index 0, not 1.
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-ess', 'fire', 5), componentGroup('g-cmp', 'cmp-iron')],
  });
  const matcher = matcherFor({ component: new Set(['iron']) });

  const selection = set.resolveIngredientSelection([item('iron')], matcher, {
    resolveItemEssences: essenceProbe({}),
  });

  assert.equal(selection.success, false);
  assert.equal(selection.selectedIngredients.length, 1);
  assert.equal(selection.selectedIngredients[0].match.type, 'component');
  assert.equal(selection.missingGroups.length, 1);
  assert.equal(selection.missingGroups[0].group.id, 'g-ess');
});

// ---------------------------------------------------------------------------
// The block is a backtrackable NODE, not a post-pass. If it cannot force an earlier
// component/tag group to re-branch then joint resolution stops being a strict
// relaxation and worlds craftable today become uncraftable.
// ---------------------------------------------------------------------------

test('a block that cannot fund forces an earlier tag group to re-branch onto its other stack', () => {
  // Both stacks carry the tag; only `ember` carries the essence. Greedy takes `ember`
  // for the tag group first, which strands the block — the search must undo that.
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [tagGroup('g-tag', ['metal']), essenceGroup('g-ess', 'fire', 2)],
  });
  const matcher = matcherFor({ tags: new Set(['ember', 'slag']) });

  const selection = set.resolveIngredientSelection([item('ember'), item('slag')], matcher, {
    resolveItemEssences: essenceProbe({ ember: { fire: 2 } }),
  });

  assert.equal(selection.success, true, 'the block re-branched the tag group onto `slag`');
  const consumed = consumedByUuid(selection);
  assert.equal(consumed.slag, 1, 'the non-carrier satisfies the tag requirement');
  assert.equal(consumed.ember, 1, 'the carrier is left for the essence block');
});

test('a requirement needing EXACTLY the ledger ceiling is still feasible and search-rescued', () => {
  // The boundary of issue 1083's essence prune. The pass index withholds an essence option
  // whose need exceeds what the WHOLE untouched ledger could ever deliver for that id
  // (`ceiling >= need`); at `ceiling === need` the option must survive, because an assignment
  // that consumes every carrier unit satisfies it exactly.
  //
  // This case is here rather than in the differential corpus for a specific reason. Withholding
  // the option makes the SEARCH fail, and `resolveIngredientSelection` then falls back to
  // `_resolveGreedy`, which does not apply the prune at all — so a wrong verdict is invisible in
  // every case greedy can already answer, which is most of them. It has to be a case greedy gets
  // WRONG: the carrier is listed first, so greedy spends it on the tag group and strands the
  // block, and only the re-branch onto `x` satisfies the set. Mutating `>=` to `>` here reports
  // a craftable recipe as unsatisfiable.
  //
  // Ceiling: `y` carries fire 1 per unit and holds 2 units, so the ledger can deliver exactly 2,
  // which is exactly what the requirement needs.
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [tagGroup('g-tag', ['metal']), essenceGroup('g-ess', 'fire', 2)],
  });
  const matcher = matcherFor({ tags: new Set(['y', 'x']) });

  const selection = set.resolveIngredientSelection([item('y', 2), item('x', 2)], matcher, {
    resolveItemEssences: essenceProbe({ y: { fire: 1 } }),
  });

  assert.equal(
    selection.success,
    true,
    'a requirement sitting exactly on the ceiling must not be pruned'
  );
  assert.deepEqual(
    consumedByUuid(selection),
    { x: 1, y: 2 },
    'the tag group takes the non-carrier and the block takes both carrier units'
  );
  assert.equal(requirementFor(selection, 'g-ess').delivered, 2);
  assert.ok(
    selection.searchStats.nodes > 0,
    'this case is genuinely search-rescued — greedy alone strands the block on `y`, which is ' +
      'what makes it able to see a prune the greedy fallback would otherwise mask'
  );
});

test('the block draws only what the component/tag groups left in the ledger', () => {
  // One 2-unit stack carries the essence AND matches the component group. The
  // component group claims one unit; only the second is available to the block.
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [componentGroup('g-cmp', 'cmp-ember'), essenceGroup('g-ess', 'fire', 4)],
  });
  const matcher = matcherFor({ component: new Set(['ember']) });

  const selection = set.resolveIngredientSelection([item('ember', 2)], matcher, {
    resolveItemEssences: essenceProbe({ ember: { fire: 2 } }),
  });

  assert.equal(selection.success, false, 'only one unit is left for the block, worth 2 of 4');
  const essence = selection.missingGroups.find((entry) => entry.group.id === 'g-ess');
  assert.equal(essence.have, 2, 'the block delivered 2 — the whole ledger holds 4');
  assert.equal(essence.need, 4);
  assert.equal(
    selection.essencePool.carriers[0].ownedUnits,
    1,
    'ownedUnits is net of the non-essence plan, not the raw stack quantity'
  );
});

// ---------------------------------------------------------------------------
// One plan entry per item key. A second entry for the same shared unit makes the
// engine re-read a live `system.quantity` and delete a document that is already gone.
// ---------------------------------------------------------------------------

test('a dual-essence carrier funding two requirements contributes ONE plan entry', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-fire', 'fire', 2), essenceGroup('g-earth', 'earth', 2)],
  });

  const selection = set.resolveIngredientSelection([item('dual')], null, {
    resolveItemEssences: essenceProbe({ dual: { fire: 2, earth: 2 } }),
  });

  assert.equal(selection.success, true);
  assert.equal(selection.plan.length, 1, 'one entry, not one per requirement');
  assert.equal(selection.plan[0].quantity, 1);
  assert.deepEqual(
    [...selection.plan[0].essenceGroupIds].sort(),
    ['g-earth', 'g-fire'],
    'the single entry names every requirement it funds'
  );
});

test('a 2-stack dual carrier drawn twice by the block is still ONE summed plan entry', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-fire', 'fire', 2), essenceGroup('g-earth', 'earth', 2)],
  });

  const selection = set.resolveIngredientSelection([item('dual', 2)], null, {
    resolveItemEssences: essenceProbe({ dual: { fire: 1, earth: 1 } }),
  });

  assert.equal(selection.success, true);
  assert.equal(selection.plan.length, 1, 'one entry per item key regardless of units drawn');
  assert.equal(selection.plan[0].quantity, 2, 'its quantity is the units the block draws');
});

test('a component group and the block may each contribute an entry for the same item key', () => {
  // Disjoint draws over one 3-unit stack: the tag takes 1, the block takes 2. Two
  // entries are correct here because they do not name the same unit.
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [tagGroup('g-tag', ['metal']), essenceGroup('g-ess', 'fire', 2)],
  });
  const matcher = matcherFor({ tags: new Set(['ember']) });

  const selection = set.resolveIngredientSelection([item('ember', 3)], matcher, {
    resolveItemEssences: essenceProbe({ ember: { fire: 1 } }),
  });

  assert.equal(selection.success, true);
  assert.equal(selection.plan.length, 2, 'one tag entry plus one block entry');
  assert.equal(consumedByUuid(selection).ember, 3, 'the disjoint draws sum to the whole stack');
});

// ---------------------------------------------------------------------------
// The per-essence-id attribution partition. It runs unconditionally and is the SOLE
// source of every essence requirement's reported quantity, satisfied or short.
// ---------------------------------------------------------------------------

test('two same-essence requirements each report their own need, never the id total', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-a', 'radiant', 2), essenceGroup('g-b', 'radiant', 2)],
  });

  const selection = set.resolveIngredientSelection([item('shard', 4)], null, {
    resolveItemEssences: essenceProbe({ shard: { radiant: 1 } }),
  });

  assert.equal(selection.success, true);
  assert.equal(requirementFor(selection, 'g-a').delivered, 2, 'reads 2/2, never 4/2');
  assert.equal(requirementFor(selection, 'g-b').delivered, 2);
  assert.equal(requirementFor(selection, 'g-a').satisfied, true);
  assert.equal(requirementFor(selection, 'g-b').satisfied, true);
});

test('a half-funded same-essence pair settles in author order and reports the short take', () => {
  // Radiant 3 available against a need of 2 + 2: the first requirement takes 2, the
  // second takes the remaining 1 and is short.
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-a', 'radiant', 2), essenceGroup('g-b', 'radiant', 2)],
  });

  const selection = set.resolveIngredientSelection([item('shard', 3)], null, {
    resolveItemEssences: essenceProbe({ shard: { radiant: 1 } }),
  });

  assert.equal(selection.success, false);
  assert.equal(selection.missingGroups.length, 1, 'only the unsettled requirement is missing');
  const missing = selection.missingGroups[0];
  assert.equal(missing.group.id, 'g-b');
  assert.equal(missing.have, 1, 'the take, capped by what the earlier requirement left');
  assert.ok(missing.have < missing.need, 'a short requirement reports below its need');
});

test('essence ids are independent — a short Radiant never marks a delivered Shadow missing', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-rad', 'radiant', 2), essenceGroup('g-sha', 'shadow', 1)],
  });

  const selection = set.resolveIngredientSelection([item('dusk')], null, {
    resolveItemEssences: essenceProbe({ dusk: { radiant: 1, shadow: 1 } }),
  });

  assert.equal(selection.success, false);
  assert.deepEqual(
    selection.missingGroups.map((entry) => entry.group.id),
    ['g-rad'],
    'the fully delivered Shadow requirement is NOT in missingGroups'
  );
  assert.equal(requirementFor(selection, 'g-sha').satisfied, true);
  assert.equal(requirementFor(selection, 'g-sha').delivered, 1);
});

test('a satisfied requirement reports delivered exactly equal to need despite unit overshoot', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('g-a', 'fire', 2)] });

  const selection = set.resolveIngredientSelection([item('geode')], null, {
    resolveItemEssences: essenceProbe({ geode: { fire: 5 } }),
  });

  assert.equal(selection.success, true);
  const requirement = requirementFor(selection, 'g-a');
  assert.equal(requirement.delivered, 2, 'the ratio is capped at need, never 5/2');
  assert.equal(requirement.owned, 5, 'the uncapped held amount is carried separately as `owned`');
  assert.equal(selection.essencePool.carriers[0].allocatedUnits, 1, 'overshoot shows in units');
});

// ---------------------------------------------------------------------------
// The `essenceAllocation` override channel.
// ---------------------------------------------------------------------------

test('a player allocation is honoured and is exactly what the plan consumes', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('g-a', 'fire', 2)] });
  const items = [item('cheap', 5), item('rich', 5)];
  const probe = essenceProbe({ cheap: { fire: 1 }, rich: { fire: 2 } });

  const selection = set.resolveIngredientSelection(items, null, {
    resolveItemEssences: probe,
    essenceAllocation: { cheap: 2 },
  });

  assert.equal(selection.success, true);
  assert.deepEqual(selection.essenceAllocation, { cheap: 2 });
  assert.deepEqual(consumedByUuid(selection), { cheap: 2 }, 'the richer stack is untouched');
});

test('a SHORT allocation is reported short and is never topped up from unallocated carriers', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('g-a', 'fire', 4)] });

  const selection = set.resolveIngredientSelection([item('shard', 6)], null, {
    resolveItemEssences: essenceProbe({ shard: { fire: 1 } }),
    essenceAllocation: { shard: 2 },
  });

  assert.equal(selection.success, false);
  const missing = selection.missingGroups[0];
  assert.equal(missing.have, 2, 'the amount DELIVERED, not the 6 the whole ledger holds');
  assert.equal(missing.need, 4);
});

test('an allocation naming a spent or unknown item key contributes zero and is dropped', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('g-a', 'fire', 2)] });

  const selection = set.resolveIngredientSelection([item('shard', 4)], null, {
    resolveItemEssences: essenceProbe({ shard: { fire: 1 } }),
    essenceAllocation: { shard: 2, 'Item.deleted-yesterday': 99 },
  });

  assert.equal(selection.success, true);
  assert.deepEqual(
    selection.essenceAllocation,
    { shard: 2 },
    'the stale key is dropped rather than resolved'
  );
});

test('an allocation is clamped to the units left AFTER the non-essence plan claims', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [tagGroup('g-tag', ['metal'], 2), essenceGroup('g-ess', 'fire', 1)],
  });
  const matcher = matcherFor({ tags: new Set(['ember']) });

  const selection = set.resolveIngredientSelection([item('ember', 3)], matcher, {
    resolveItemEssences: essenceProbe({ ember: { fire: 1 } }),
    essenceAllocation: { ember: 3 },
  });

  assert.equal(selection.success, true);
  assert.deepEqual(selection.essenceAllocation, { ember: 1 }, 'clamped to the one remaining unit');
});

test('the suggestion is always offered alongside a short player allocation', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('g-a', 'fire', 4)] });

  const selection = set.resolveIngredientSelection([item('shard', 6)], null, {
    resolveItemEssences: essenceProbe({ shard: { fire: 1 } }),
    essenceAllocation: { shard: 1 },
  });

  assert.deepEqual(selection.essencePool.allocation, { shard: 1 });
  assert.deepEqual(selection.essencePool.suggested, { shard: 4 }, 'a "pick for me" answer');
});

test('allocateEssences overrides the suggestion strategy', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('g-a', 'fire', 2)] });
  const calls = [];

  const selection = set.resolveIngredientSelection([item('a', 3), item('b', 3)], null, {
    resolveItemEssences: essenceProbe({ a: { fire: 1 }, b: { fire: 1 } }),
    allocateEssences: (requirements, carriers, availableUnits) => {
      calls.push({ carriers: carriers.length, availableUnits });
      return { b: 2 };
    },
  });

  assert.equal(calls.length > 0, true, 'the injected strategy is consulted');
  assert.deepEqual(selection.essenceAllocation, { b: 2 }, 'and its answer is used verbatim');
  assert.deepEqual(consumedByUuid(selection), { b: 2 });
});

// ---------------------------------------------------------------------------
// Shape guarantees the read side depends on.
// ---------------------------------------------------------------------------

test('a set with no essence requirement has a null pool and an empty allocation', () => {
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [componentGroup('g-cmp', 'cmp-iron')],
  });
  const matcher = matcherFor({ component: new Set(['iron']) });

  const selection = set.resolveIngredientSelection([item('iron')], matcher);

  assert.equal(selection.essencePool, null);
  assert.deepEqual(selection.essenceAllocation, {});
  assert.equal(selection.success, true);
});

test('the pool carries per-carrier units and per-requirement amounts as distinct quantities', () => {
  const set = new IngredientSet({ id: 's', ingredientGroups: [essenceGroup('g-a', 'fire', 3)] });

  const selection = set.resolveIngredientSelection([item('shard', 4)], null, {
    resolveItemEssences: essenceProbe({ shard: { fire: 2 } }),
  });

  const carrier = selection.essencePool.carriers[0];
  assert.equal(carrier.ownedUnits, 4, 'ownedUnits counts ITEM units');
  assert.equal(carrier.allocatedUnits, 2, 'two units cover a need of 3 at 2 per unit');
  assert.deepEqual(carrier.perUnit, { fire: 2 });

  const requirement = requirementFor(selection, 'g-a');
  assert.equal(requirement.need, 3, 'need/delivered/owned are ESSENCE amounts');
  assert.equal(requirement.delivered, 3);
  assert.equal(requirement.owned, 8);
});
