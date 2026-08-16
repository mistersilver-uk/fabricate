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
// Multi-essence overlap. Issue 917 INVERTED this case by design: two essence
// requirements in one set are now funded from a single shared block, so one unit of
// a dual carrier credits BOTH of them. The pre-917 expectation (dual -> earth,
// fire-only -> fire, two units spent) described the per-group draw-down this change
// deliberately relaxes; the set is still craftable, but it now costs one unit, and
// `fire-only` is left alone because nothing needs it.
// ---------------------------------------------------------------------------

test('multi-essence overlap funds both essence requirements from one shared carrier', () => {
  const probe = essenceProbe({ dual: { fire: 2, earth: 2 }, 'fire-only': { fire: 2 } });
  const set = new IngredientSet({
    id: 's',
    ingredientGroups: [essenceGroup('g-fire', 'fire', 2), essenceGroup('g-earth', 'earth', 2)],
  });

  const selection = set.resolveIngredientSelection([item('dual', 1), item('fire-only', 1)], null, {
    resolveItemEssences: probe,
  });

  assert.equal(selection.success, true, 'the block funds fire and earth together');
  const consumed = consumedByUuid(selection);
  assert.equal(consumed.dual, 1, 'the dual carrier is consumed once and credits both essences');
  assert.equal(consumed['fire-only'], undefined, 'no second unit is spent on an already-funded essence');
  assert.equal(selection.plan.length, 1, 'one plan entry — one item key, one draw');
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
// Stress / bound. Two fixtures, because they bound different things and only one of
// them existed: an 18-group recipe whose groups mostly do NOT contend (bounded by
// how little of it reaches the search at all), and an 8-group recipe whose groups
// ALL contend for one shared pool (bounded by how far the search walks when it has
// no choice but to run). Without the second, the largest contended fixture anywhere
// in issue 1083's work was 4 groups, so nothing bounded node growth for a large
// contended authored recipe.
// ---------------------------------------------------------------------------

test('stress: a large mostly-uncontended recipe costs about one node per group', () => {
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

  // Asserted through the PUBLIC result's `searchStats` (issue 1072's seam), not by calling
  // `_searchAssignment` directly. The direct call was this guard's weak point: issue 1083's
  // staged resolver routes an uncontended recipe around the backtracking search entirely, so a
  // guard bound to the private entry point would stop describing how the fixture is actually
  // resolved and would pass because nothing reached it — a vacuous green rather than a
  // satisfied bound. `searchStats` is attached on BOTH exits, so this reads the real cost
  // whichever stage produced the answer.
  const selection = set.resolveIngredientSelection(items, matcher, {
    resolveItemEssences: essenceProbe(probeTable),
  });

  assert.equal(selection.success, true, 'the large recipe is satisfiable');
  assert.equal(selection.searchStats.capHit, false, 'the search never reaches its bound');
  // Bounded against the recipe's OWN size rather than against the cap. Measured: 21 nodes for
  // 18 groups here, against 19 for the pre-1083 whole-set solver — this fixture was ALREADY
  // answered on the greedy-first path, so it never demonstrated a node-count reduction and the
  // old `CAP/100` ceiling left ~95x of slack over a search that barely happens. What it can
  // still say, falsifiably, is that a large authored recipe costs about one node per group;
  // a resolver that started enumerating alternatives per group would blow through this while
  // sitting comfortably inside the cap.
  assert.ok(
    selection.searchStats.nodes <= groups.length * 2,
    `a large authored recipe must resolve at roughly one node per group; used ` +
      `${selection.searchStats.nodes} for ${groups.length} groups (the ` +
      `${INGREDIENT_SEARCH_NODE_CAP}-node cap is deliberately not what this bound leans on)`
  );

  // And it produces a valid, non-double-counting plan: every group is satisfied and no stack is
  // drawn past what it holds. Without this the bound above could be met by a resolver that
  // simply did less and answered wrongly.
  assert.equal(selection.missingGroups.length, 0);
  assert.equal(selection.selectedIngredients.length, groups.length);
  const held = new Map(items.map((entry) => [entry.uuid, entry.system.quantity]));
  for (const [uuid, consumed] of Object.entries(consumedByUuid(selection))) {
    assert.ok(consumed <= held.get(uuid), `${uuid} consumed ${consumed} of ${held.get(uuid)}`);
  }
});

/**
 * The fully CONTENDED counterpart of the fixture above, and the one this file was missing.
 *
 * Every group here shares candidate stacks with every other, so contention scoping cannot help:
 * the whole recipe is one component and the search has to run. A broad tag group matches every
 * held stack, six component groups each need two units of one specific stack, and a live essence
 * block draws on a seventh — so the greedy front-load (the tag group taking `stack-0`) strands a
 * pinned group and the solver must walk its way out.
 *
 * Contended fixtures are not automatically bounded: several natural constructions of this shape
 * — N interchangeable tag groups over one shared pool — are symmetric enough to exhaust the
 * 200,000-node cap and report a satisfiable recipe as insufficient, which is the documented
 * pre-663 safeguard degradation rather than a regression. This fixture is the realistic
 * asymmetric case: distinct component identities pin most of the assignment, so the branching
 * is confined to the one broad group.
 */
test('stress: a fully contended recipe stays two orders of magnitude under the search cap', () => {
  const PINNED = 6;
  const groups = [
    { id: 'g-broad', options: [{ quantity: 2, match: { type: 'tags', tags: ['shared'], tagMatch: 'any' } }] },
  ];
  const items = [];
  for (let i = 0; i < PINNED; i += 1) {
    items.push(item(`stack-${i}`, 2));
    groups.push(componentGroup(`g-pin-${i}`, `cmp-stack-${i}`, 2));
  }
  // `spare` is the only stack no component group claims, so it is the tag group's only correct
  // answer; `ember` funds the block.
  items.push(item('spare', 4), item('ember', 2));
  groups.push(essenceGroup('g-ess', 'fire', 2));

  // The broad tag matches every real stack; a component option matches only the stack its id
  // names, which is what makes the groups pin each other rather than being interchangeable.
  const matcher = (ingredient, held) => {
    if (ingredient?.match?.type === 'tags') return !held.uuid.startsWith('filler-');
    if (ingredient?.match?.type === 'component') return `cmp-${held.uuid}` === ingredient.match.componentId;
    return false;
  };
  const probe = essenceProbe({ ember: { fire: 1 } });
  const set = new IngredientSet({ id: 's', ingredientGroups: groups });

  const selection = set.resolveIngredientSelection(items, matcher, { resolveItemEssences: probe });

  assert.equal(selection.success, true, 'the contended recipe is satisfiable');
  assert.equal(selection.searchStats.capHit, false, 'the search never reaches its bound');
  assert.ok(
    selection.searchStats.nodes > groups.length,
    `this fixture must genuinely backtrack, not resolve one choice per group; used ` +
      `${selection.searchStats.nodes} nodes for ${groups.length} groups`
  );
  assert.ok(
    selection.searchStats.nodes < INGREDIENT_SEARCH_NODE_CAP / 100,
    `a fully contended ${groups.length}-group recipe used ${selection.searchStats.nodes} nodes, ` +
      `which must stay two orders of magnitude under the ${INGREDIENT_SEARCH_NODE_CAP}-node cap`
  );

  // Correctness, so the bound cannot be met by a resolver that simply did less: the tag group
  // must have taken the spare stack, leaving every pinned group and the block whole.
  assert.equal(selection.missingGroups.length, 0);
  assert.equal(selection.selectedIngredients.length, groups.length);
  const consumed = consumedByUuid(selection);
  assert.equal(consumed.spare, 2, 'the broad tag group takes the one unclaimed stack');
  assert.equal(consumed.ember, 2, 'the block keeps its carrier');
  for (let i = 0; i < PINNED; i += 1) assert.equal(consumed[`stack-${i}`], 2);

  // And the node count is a property of the CONTENDED candidates, not of the inventory: 500
  // stacks that match nothing must not enlarge the search by a single node.
  const padded = [...items];
  for (let i = 0; i < 500; i += 1) padded.push(item(`filler-${i}`, 1));
  const withFiller = set.resolveIngredientSelection(padded, matcher, {
    resolveItemEssences: probe,
  });
  assert.equal(withFiller.success, true);
  assert.equal(
    withFiller.searchStats.nodes,
    selection.searchStats.nodes,
    'non-matching held stacks must not widen a contended search'
  );
});
