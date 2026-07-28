import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ESSENCE_POOL_SLOT_ID,
  SLOT_KIND,
  SLOT_STATE,
  buildConsumptionPlan,
  buildRequirementSlots,
  composeSlotKey,
  resolveOpenSlotId,
  suggestChoiceOverrides,
} from '../../src/ui/svelte/util/requirementSlots.js';

function fixedState(overrides = {}) {
  return {
    groupId: 'g-fixed',
    name: 'Spring Water',
    description: '2x Spring Water',
    img: 'icons/water.webp',
    need: 2,
    have: 2,
    satisfied: true,
    ...overrides,
  };
}

function choiceState(overrides = {}) {
  return {
    groupId: 'g-choice',
    name: 'Red Herb',
    description: '1x Red Herb',
    img: 'icons/herb.webp',
    need: 1,
    have: 0,
    satisfied: false,
    hasChoice: true,
    choiceCount: 3,
    ...overrides,
  };
}

function essenceState(overrides = {}) {
  return {
    groupId: 'g-radiant',
    name: 'Radiant',
    description: '4x Radiant essence',
    img: null,
    isEssence: true,
    icon: 'fas fa-sun',
    colorToken: 'butter',
    need: 4,
    delivered: 2,
    owned: 6,
    satisfied: false,
    ...overrides,
  };
}

describe('buildRequirementSlots', () => {
  it('keys every slot to its group and marks only choice/essence slots interactive', () => {
    const slots = buildRequirementSlots({
      ingredientStates: [fixedState(), choiceState(), essenceState()],
    });

    assert.deepEqual(
      slots.map((slot) => [slot.kind, slot.slotId, slot.interactive]),
      [
        [SLOT_KIND.FIXED, null, false],
        [SLOT_KIND.CHOICE, 'g-choice', true],
        [SLOT_KIND.ESSENCE, ESSENCE_POOL_SLOT_ID, true],
      ]
    );
  });

  // The whole point of the `delivered` rename: `have` on an essence requirement now
  // answers a different question upstream, so reading it would render 0 on every
  // essence tile while the pool bars showed the real number.
  it('reads an essence slot ratio from `delivered`, never `have`', () => {
    const [slot] = buildRequirementSlots({
      ingredientStates: [essenceState({ delivered: 3, have: 99 })],
    });

    assert.equal(slot.have, 3, 'the ratio numerator is the delivered essence amount');
    assert.equal(slot.need, 4);
    assert.equal(slot.owned, 6, 'owned stays available as the separate held amount');
  });

  it('falls back to `have` only for a craftability that predates the rename', () => {
    const [slot] = buildRequirementSlots({
      ingredientStates: [{ groupId: 'g', isEssence: true, need: 2, have: 1 }],
    });
    assert.equal(slot.have, 1);
  });

  const ESSENCE_CASES = [
    { delivered: 0, expected: SLOT_STATE.SHORT, why: 'zero delivered is an error' },
    { delivered: 2, expected: SLOT_STATE.PARTIAL, why: 'partly delivered is a to-do' },
    { delivered: 4, expected: SLOT_STATE.MET, why: 'fully delivered is met' },
  ];

  for (const { delivered, expected, why } of ESSENCE_CASES) {
    it(`maps an essence slot delivering ${delivered}/4 to ${expected} (${why})`, () => {
      const [slot] = buildRequirementSlots({
        ingredientStates: [essenceState({ delivered, satisfied: delivered >= 4 })],
      });
      assert.equal(slot.state, expected);
    });
  }

  // An untouched choice is a to-do, never danger: the resolver's default pick is a
  // starting point, not a decision the player made.
  it('renders an unchosen, unsatisfied choice as partial rather than short', () => {
    const [slot] = buildRequirementSlots({ ingredientStates: [choiceState()] });
    assert.equal(slot.state, SLOT_STATE.PARTIAL);
  });

  it('renders an explicitly chosen, unsatisfied choice as short', () => {
    const [slot] = buildRequirementSlots(
      { ingredientStates: [choiceState()] },
      { chosenGroupIds: ['g-choice'] }
    );
    assert.equal(slot.state, SLOT_STATE.SHORT);
  });

  it('renders a satisfied choice as met whether or not the player picked it', () => {
    const states = { ingredientStates: [choiceState({ satisfied: true, have: 2 })] };
    assert.equal(buildRequirementSlots(states)[0].state, SLOT_STATE.MET);
    assert.equal(
      buildRequirementSlots(states, { chosenGroupIds: ['g-choice'] })[0].state,
      SLOT_STATE.MET
    );
  });

  it('maps a fixed slot to met or short on its own numbers only', () => {
    assert.equal(buildRequirementSlots({ ingredientStates: [fixedState()] })[0].state, SLOT_STATE.MET);
    assert.equal(
      buildRequirementSlots({ ingredientStates: [fixedState({ satisfied: false, have: 1 })] })[0]
        .state,
      SLOT_STATE.SHORT
    );
  });

  it('returns an empty list for a null craftability', () => {
    assert.deepEqual(buildRequirementSlots(null), []);
  });
});

describe('resolveOpenSlotId', () => {
  const slots = buildRequirementSlots({
    ingredientStates: [fixedState(), choiceState({ satisfied: true, have: 2 }), essenceState()],
  });

  it('opens nothing when no slot is selectable', () => {
    const fixedOnly = buildRequirementSlots({ ingredientStates: [fixedState()] });
    assert.equal(resolveOpenSlotId({ slots: fixedOnly, scopeKey: 'set-a' }), null);
  });

  it('auto-advances to the first unsatisfied selectable slot', () => {
    assert.equal(
      resolveOpenSlotId({ slots, scopeKey: 'set-a', rememberedKey: null }),
      ESSENCE_POOL_SLOT_ID
    );
  });

  it('honours a remembered key that still names a slot in this scope', () => {
    assert.equal(
      resolveOpenSlotId({ slots, scopeKey: 'set-a', rememberedKey: 'set-a:g-choice' }),
      'g-choice'
    );
  });

  // A bare sticky key is the defect: after a set or step change it either opens a
  // chooser belonging to another scope or opens nothing at all.
  it('drops a remembered key from another scope', () => {
    assert.equal(
      resolveOpenSlotId({ slots, scopeKey: 'set-b', rememberedKey: 'set-a:g-choice' }),
      ESSENCE_POOL_SLOT_ID
    );
  });

  it('drops a remembered key naming a slot the live list no longer has', () => {
    assert.equal(
      resolveOpenSlotId({ slots, scopeKey: 'set-a', rememberedKey: 'set-a:g-gone' }),
      ESSENCE_POOL_SLOT_ID
    );
  });

  it('falls back to the first selectable slot when every slot is met', () => {
    const allMet = buildRequirementSlots({
      ingredientStates: [
        choiceState({ satisfied: true, have: 2 }),
        essenceState({ delivered: 4, satisfied: true }),
      ],
    });
    assert.equal(resolveOpenSlotId({ slots: allMet, scopeKey: 'set-a' }), 'g-choice');
  });

  it('composes and rejects scoped keys symmetrically', () => {
    assert.equal(composeSlotKey('set-a::step-1', 'g-choice'), 'set-a::step-1:g-choice');
    assert.equal(composeSlotKey(null, 'g-choice'), null);
    assert.equal(composeSlotKey('set-a', null), null);
  });
});

describe('buildConsumptionPlan', () => {
  const pool = {
    requirements: [
      { groupId: 'g-radiant', essenceId: 'radiant', name: 'Radiant', icon: 'fas fa-sun', colorToken: 'butter', need: 4, delivered: 2 },
    ],
    carriers: [
      { itemKey: 'Item.a', name: 'Duskcrystal', img: 'icons/gem.webp', ownedUnits: 3, allocatedUnits: 1, perUnit: { radiant: 2, shadow: 1 } },
      { itemKey: 'Item.b', name: 'Prism Ash', img: null, ownedUnits: 2, allocatedUnits: 0, perUnit: { radiant: 1 } },
    ],
  };

  it('lists resolved non-essence requirements and every allocated carrier', () => {
    const plan = buildConsumptionPlan({
      ingredientStates: [fixedState(), choiceState({ satisfied: true, have: 2 }), essenceState()],
      essencePool: pool,
    });

    assert.deepEqual(
      plan.rows.map((row) => [row.name, row.quantity]),
      [
        ['Spring Water', 2],
        ['Red Herb', 1],
        ['Duskcrystal', 1],
      ]
    );
  });

  // One row per ITEM KEY however many requirements that item funds — the block
  // contributes at most one plan entry per item, and a second row would imply a
  // second draw on the same units.
  it('emits ONE row for a dual-essence carrier funding two requirements', () => {
    const plan = buildConsumptionPlan({
      ingredientStates: [essenceState(), essenceState({ groupId: 'g-shadow', name: 'Shadow' })],
      essencePool: pool,
    });
    const carrierRows = plan.rows.filter((row) => row.isEssence);
    assert.equal(carrierRows.length, 1);
    assert.deepEqual(
      carrierRows[0].contributions.map((c) => [c.essenceId, c.amount, c.required]),
      [
        ['radiant', 2, true],
        ['shadow', 1, false],
      ],
      'an essence the set does not require still shows the unit spend, marked unrequired'
    );
  });

  it('names untouched choices and short essences on the pending line, and nothing else', () => {
    const plan = buildConsumptionPlan({
      ingredientStates: [
        fixedState({ satisfied: false, have: 0 }),
        choiceState(),
        essenceState(),
        essenceState({ groupId: 'g-shadow', name: 'Shadow', delivered: 3, need: 3, satisfied: true }),
      ],
      essencePool: pool,
    });

    assert.deepEqual(
      plan.pending.map((entry) => [entry.kind, entry.name]),
      [
        [SLOT_KIND.CHOICE, 'Red Herb'],
        [SLOT_KIND.ESSENCE, 'Radiant'],
      ],
      'a short FIXED requirement is not "still to choose" — there is nothing to choose'
    );
  });

  it('is empty for a null craftability', () => {
    assert.deepEqual(buildConsumptionPlan(null), { rows: [], pending: [] });
  });
});

describe('suggestChoiceOverrides', () => {
  it('prefers a satisfying option, then the most held, then the authored order', () => {
    const overrides = suggestChoiceOverrides({
      ingredientChoices: [
        {
          kind: 'option',
          groupId: 'g1',
          options: [
            { optionIndex: 0, have: 9, satisfied: false },
            { optionIndex: 1, have: 2, satisfied: true },
            { optionIndex: 2, have: 5, satisfied: true },
          ],
        },
      ],
    });
    assert.deepEqual(overrides, { g1: { optionIndex: 2, heldItemId: null } });
  });

  it('breaks an all-equal tie on the authored option order', () => {
    const overrides = suggestChoiceOverrides({
      ingredientChoices: [
        {
          kind: 'option',
          groupId: 'g1',
          options: [
            { optionIndex: 1, have: 3, satisfied: true },
            { optionIndex: 0, have: 3, satisfied: true },
          ],
        },
      ],
    });
    assert.deepEqual(overrides, { g1: { optionIndex: 0, heldItemId: null } });
  });

  it('merges a stack choice onto the option it belongs to', () => {
    const overrides = suggestChoiceOverrides({
      ingredientChoices: [
        { kind: 'option', groupId: 'g1', options: [{ optionIndex: 3, have: 1, satisfied: true }] },
        {
          kind: 'stack',
          groupId: 'g1',
          optionIndex: 3,
          stacks: [
            { itemId: 'iron', have: 1 },
            { itemId: 'copper', have: 4 },
          ],
        },
      ],
    });
    assert.deepEqual(overrides, { g1: { optionIndex: 3, heldItemId: 'copper' } });
  });

  it('suggests nothing for a craftability offering no choices', () => {
    assert.deepEqual(suggestChoiceOverrides({ ingredientChoices: [] }), {});
    assert.deepEqual(suggestChoiceOverrides(null), {});
  });
});
