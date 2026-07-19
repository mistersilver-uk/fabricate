/**
 * Tests for item-level bounded backtracking in
 * IngredientSet.resolveIngredientSelection (issue 663): a dual-purpose item (one
 * that can satisfy more than one AND-required group) must no longer be greedily
 * consumed by the wrong group, producing a false `insufficient`. The resolver now
 * finds a satisfying item->group assignment whenever one exists, so craftability is
 * independent of inventory and group iteration order, while preserving the
 * shared-ledger no-double-count invariant, the items-strictly-beat-currency
 * ordering, the optionOverrides pins, and deterministic output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = { utils: { randomID: () => crypto.randomUUID() } };

const { IngredientSet, INGREDIENT_SEARCH_NODE_CAP } = await import('../src/models/IngredientSet.js');

// A minimal item: uuid, quantity, and Fabricate essence flags (resolved as a path
// within the fabricate scope, mirroring getFabricateFlag).
function item(uuid, quantity = 1, essences = {}) {
  const scopes = { fabricate: { fabricate: { essences }, essences } };
  return {
    uuid,
    system: { quantity },
    getFlag: (scope, key) =>
      String(key)
        .split('.')
        .reduce((value, part) => (value == null ? undefined : value[part]), scopes[scope]),
  };
}

function tagGroup(id, tags, quantity = 1) {
  return { id, options: [{ quantity, match: { type: 'tags', tags, tagMatch: 'any' } }] };
}

function componentGroup(id, componentId, quantity = 1) {
  return { id, options: [{ quantity, match: { type: 'component', componentId } }] };
}

function essenceGroup(id, essenceId, amount) {
  return { id, options: [{ quantity: 1, match: { type: 'essence', essenceId, amount } }] };
}

// A matcher keyed by match type: `rules[type]` is the Set of item uuids that match
// an option of that type. Avoids the resolver's flag-based matching so a test can
// declare exactly which held items carry a tag/component identity.
function matcherFor(rules) {
  return (ingredient, held) => {
    const allowed = rules[ingredient?.match?.type];
    return allowed ? allowed.has(held.uuid) : false;
  };
}

// A component-aware essence probe from a { uuid: { essenceId: perUnit } } table.
function essenceProbe(table) {
  return (held) => table[held.uuid] || {};
}

function planKey(selection) {
  return selection.plan
    .map((entry) => `${entry.item.uuid}x${entry.quantity}`)
    .join('|');
}

function consumedByUuid(selection) {
  const totals = {};
  for (const entry of selection.plan) {
    totals[entry.item.uuid] = (totals[entry.item.uuid] || 0) + entry.quantity;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// The #663 worked case: `any tag:iron AND 2 fire essence`.
// Blazing Iron carries BOTH the iron tag and 2 fire essence; Iron Ingot carries
// the iron tag only. A valid assignment exists (Ingot -> tag, Blazing -> essence),
// so the craft must succeed in BOTH item orders AND BOTH group orders.
// ---------------------------------------------------------------------------

const WORKED_MATCHER = matcherFor({ tags: new Set(['blazing', 'ingot']) });
const WORKED_PROBE = essenceProbe({ blazing: { fire: 2 } });

function workedSet(groupOrder) {
  const tag = tagGroup('g-tag', ['iron']);
  const essence = essenceGroup('g-essence', 'fire', 2);
  const groups = groupOrder === 'essence-first' ? [essence, tag] : [tag, essence];
  return new IngredientSet({ id: 's', ingredientGroups: groups });
}

for (const groupOrder of ['tag-first', 'essence-first']) {
  for (const label of ['blazing-first', 'ingot-first']) {
    test(`#663 worked case craftable (${groupOrder}, ${label})`, () => {
      const blazing = item('blazing', 1);
      const ingot = item('ingot', 1);
      const items = label === 'blazing-first' ? [blazing, ingot] : [ingot, blazing];
      const set = workedSet(groupOrder);

      const selection = set.resolveIngredientSelection(items, WORKED_MATCHER, {
        resolveItemEssences: WORKED_PROBE,
      });

      assert.equal(selection.success, true, 'a valid Ingot->tag, Blazing->essence assignment exists');
      assert.equal(selection.missingGroups.length, 0);
      // No double-count: exactly two distinct single-unit stacks consumed.
      assert.equal(selection.plan.length, 2);
      const consumed = consumedByUuid(selection);
      assert.equal(consumed.blazing, 1, 'Blazing Iron consumed once');
      assert.equal(consumed.ingot, 1, 'Iron Ingot consumed once');
    });
  }
}

// ---------------------------------------------------------------------------
// Component-vs-tag overlap: a dual item matches BOTH a component group and a tag
// group; greedily consuming it for the tag group would strand the component group.
// ---------------------------------------------------------------------------

test('component-vs-tag overlap is craftable in both group orders', () => {
  const matcher = matcherFor({
    component: new Set(['dual']),
    tags: new Set(['dual', 'plain-iron']),
  });

  for (const groupOrder of ['tag-first', 'component-first']) {
    const tag = tagGroup('g-tag', ['iron']);
    const component = componentGroup('g-comp', 'cmp-dual');
    const groups = groupOrder === 'tag-first' ? [tag, component] : [component, tag];
    const set = new IngredientSet({ id: 's', ingredientGroups: groups });

    const selection = set.resolveIngredientSelection([item('dual', 1), item('plain-iron', 1)], matcher);

    assert.equal(selection.success, true, `craftable (${groupOrder})`);
    const consumed = consumedByUuid(selection);
    assert.equal(consumed.dual, 1);
    assert.equal(consumed['plain-iron'], 1);
  }
});

// ---------------------------------------------------------------------------
// Multi-essence overlap: the only carrier of one essence is a dual item that also
// carries the other essence; the resolver must steer the dual to the essence only
// it can satisfy.
// ---------------------------------------------------------------------------

test('multi-essence overlap steers the dual item to the essence only it satisfies', () => {
  const probe = essenceProbe({ dual: { fire: 2, earth: 2 }, 'fire-only': { fire: 2 } });
  // fire group first: greedy would grab `dual` for fire, stranding earth (dual is
  // the only earth carrier). The search reassigns fire -> fire-only, earth -> dual.
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-fire', 'fire', 2), essenceGroup('g-earth', 'earth', 2)],
  });

  const selection = set.resolveIngredientSelection([item('dual', 1), item('fire-only', 1)], null, {
    resolveItemEssences: probe,
  });

  assert.equal(selection.success, true, 'earth can only come from the dual item, fire from fire-only');
  const consumed = consumedByUuid(selection);
  assert.equal(consumed.dual, 1, 'the dual item is consumed once (for earth)');
  assert.equal(consumed['fire-only'], 1, 'the fire-only item covers fire');
});

// ---------------------------------------------------------------------------
// quantity > 1 unit-subset contention: a `quantity:3` tag group competes with a
// specific-component group for the same stacks. Only a partial unit split
// (1 of A + 2 of B for the tag group) leaves the single A the component group
// needs — subset-of-items enumeration cannot express it; unit-count enumeration can.
// ---------------------------------------------------------------------------

test('quantity>1 unit-subset contention is resolved by unit-count enumeration', () => {
  const matcher = matcherFor({
    tags: new Set(['a', 'b']),
    component: new Set(['a']),
  });
  // tag group needs 3 of {A(2), B(2)}; component group needs 1 of A specifically.
  // Valid only assignment: tag -> 1A + 2B, component -> 1A.
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [tagGroup('g-tag', ['t'], 3), componentGroup('g-comp', 'cmp-a', 1)],
  });

  const selection = set.resolveIngredientSelection([item('a', 2), item('b', 2)], matcher);

  assert.equal(selection.success, true, 'a 1A+2B tag split frees one A for the component group');
  const consumed = consumedByUuid(selection);
  assert.equal(consumed.a, 2, 'both units of A are used (1 tag + 1 component)');
  assert.equal(consumed.b, 2, 'both units of B are used by the tag group');
  assert.equal(consumed.a <= 2 && consumed.b <= 2, true, 'no stack is over-drawn (no double-count)');
});

// ---------------------------------------------------------------------------
// Genuinely unsatisfiable inputs stay `false` with correct missingGroups.
// ---------------------------------------------------------------------------

test('genuinely unsatisfiable set stays false with have/need missingGroups', () => {
  const matcher = matcherFor({ component: new Set(['a']) });
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [componentGroup('g-comp', 'cmp-a', 3)],
  });

  const selection = set.resolveIngredientSelection([item('a', 2)], matcher);

  assert.equal(selection.success, false);
  assert.equal(selection.missingGroups.length, 1);
  assert.equal(selection.missingGroups[0].have, 2);
  assert.equal(selection.missingGroups[0].need, 3);
});

test('a pinned-but-short optionOverrides group reports THAT option (pin-aware, never redirected)', () => {
  // g-or offers component (needs 2) OR fire essence (amount 2, satisfiable here).
  // Pinning the component option must report the component's have/need even though
  // the essence option would otherwise satisfy the group (issue 552 contract).
  const matcher = matcherFor({ component: new Set(['a']) });
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [
      {
        id: 'g-or',
        options: [
          { quantity: 2, match: { type: 'component', componentId: 'cmp-a' } },
          { quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 2 } },
        ],
      },
    ],
  });

  const selection = set.resolveIngredientSelection([item('a', 1), item('fire', 5)], matcher, {
    optionOverrides: { 'g-or': { optionIndex: 0 } },
    resolveItemEssences: essenceProbe({ fire: { fire: 1 } }),
  });

  assert.equal(selection.success, false, 'the pinned component option is short and blocks the craft');
  assert.equal(selection.missingGroups.length, 1);
  assert.equal(selection.missingGroups[0].ingredient.match.type, 'component', 'pin is honoured, not redirected');
  assert.equal(selection.missingGroups[0].have, 1);
  assert.equal(selection.missingGroups[0].need, 2);
});

// ---------------------------------------------------------------------------
// Determinism (plan-review clarification #1): (a) repeatability — same inputs
// yield the same plan across runs; (b) order-independent craftability — `success`
// is invariant under shuffled availableItems AND group iteration order. The plan
// itself MAY legitimately vary with availableItems order (greedy-first by
// inventory order); it is NOT asserted shuffle-identical.
// ---------------------------------------------------------------------------

test('determinism: repeatable plan across runs for identical inputs', () => {
  const items = [item('blazing', 1), item('ingot', 1)];
  const set = workedSet('tag-first');

  const first = set.resolveIngredientSelection(items, WORKED_MATCHER, {
    resolveItemEssences: WORKED_PROBE,
  });
  const second = set.resolveIngredientSelection(items, WORKED_MATCHER, {
    resolveItemEssences: WORKED_PROBE,
  });

  assert.equal(first.success, true);
  assert.equal(planKey(first), planKey(second), 'same inputs produce the same plan every run');
});

test('determinism: craftability is invariant under shuffled item and group order', () => {
  const itemOrders = [
    () => [item('blazing', 1), item('ingot', 1)],
    () => [item('ingot', 1), item('blazing', 1)],
  ];
  for (const groupOrder of ['tag-first', 'essence-first']) {
    for (const makeItems of itemOrders) {
      const set = workedSet(groupOrder);
      const selection = set.resolveIngredientSelection(makeItems(), WORKED_MATCHER, {
        resolveItemEssences: WORKED_PROBE,
      });
      assert.equal(selection.success, true, `craftable for ${groupOrder} under a shuffled item order`);
    }
  }
});

// ---------------------------------------------------------------------------
// Stress / bound: a large authored recipe (many groups, options, stacks, and a
// quantity>1 group) is satisfied on the greedy-first path, so the node budget used
// stays orders of magnitude below the safeguard cap and the cap is never reached.
// ---------------------------------------------------------------------------

test('stress: a large authored recipe stays orders of magnitude under the search cap', () => {
  const groups = [];
  const items = [];
  const componentRules = new Set();
  const tagRules = new Set();

  // 12 component groups, each with its own dedicated stack; a couple need quantity 2.
  for (let i = 0; i < 12; i += 1) {
    const uuid = `cmp-item-${i}`;
    const quantity = i % 4 === 0 ? 2 : 1;
    groups.push(componentGroup(`g-cmp-${i}`, `cmp-${i}`, quantity));
    items.push(item(uuid, quantity + 3));
    componentRules.add(uuid);
  }
  // 4 tag groups (quantity 2) each with two matching stacks, so the enumeration has
  // real breadth to traverse if it degenerated.
  for (let i = 0; i < 4; i += 1) {
    const a = `tag-item-${i}-a`;
    const b = `tag-item-${i}-b`;
    groups.push(tagGroup(`g-tag-${i}`, [`t-${i}`], 2));
    items.push(item(a, 2), item(b, 2));
    tagRules.add(a);
    tagRules.add(b);
  }
  // 2 essence groups with a dedicated carrier each.
  const probeTable = {};
  for (let i = 0; i < 2; i += 1) {
    const uuid = `ess-item-${i}`;
    groups.push(essenceGroup(`g-ess-${i}`, `e-${i}`, 2));
    items.push(item(uuid, 1));
    probeTable[uuid] = { [`e-${i}`]: 2 };
  }

  const matcher = matcherFor({ component: componentRules, tags: tagRules });
  const set = new IngredientSet({ id: 's', ingredientGroups: groups });
  const ctx = {
    affordCurrency: undefined,
    optionOverrides: undefined,
    resolveEssences: set._essenceResolver(essenceProbe(probeTable)),
  };

  const search = set._searchAssignment(items, matcher, ctx);

  assert.ok(search.selection, 'the large recipe is satisfiable');
  assert.equal(search.capHit, false, 'the search never reaches its bound');
  assert.ok(
    search.nodes < INGREDIENT_SEARCH_NODE_CAP / 100,
    `nodes used (${search.nodes}) is orders of magnitude below the cap (${INGREDIENT_SEARCH_NODE_CAP})`
  );

  // The public path agrees and produces a valid, non-double-counting plan.
  const selection = set.resolveIngredientSelection(items, matcher, {
    resolveItemEssences: essenceProbe(probeTable),
  });
  assert.equal(selection.success, true);
});
