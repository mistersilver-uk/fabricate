/**
 * Unit tests for the pure crafting chat card formatter
 * (`buildCraftingChatContent`). No Foundry globals required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCraftingChatContent } from '../src/systems/CraftingChatCard.js';

function successModel(overrides = {}) {
  return {
    status: 'succeeded',
    actorName: 'Gandalf',
    recipeName: 'Iron Sword',
    results: [{ name: 'Iron Sword', img: 'icons/sword.png', quantity: 1 }],
    consumed: [
      { name: 'Iron Ingot', img: 'icons/ingot.png', quantity: 3 },
      { name: 'Leather Strap', img: 'icons/strap.png', quantity: 1 },
    ],
    tools: [{ name: 'Forge Hammer', img: 'icons/hammer.png' }],
    ...overrides,
  };
}

function failureModel(overrides = {}) {
  return {
    status: 'failed',
    actorName: 'Merlin',
    recipeName: 'Iron Sword',
    results: [],
    consumed: [{ name: 'Silver Dust', img: 'icons/silver.png', quantity: 2 }],
    tools: [{ name: 'Magic Crucible', img: 'icons/crucible.png' }],
    failureReason: 'Skill check too low',
    ...overrides,
  };
}

test('renders success header, modifier class, crafter and recipe', () => {
  const content = buildCraftingChatContent(successModel());
  assert.ok(content.includes('fabricate-craft-chat--success'), 'success modifier class');
  assert.ok(content.includes('FABRICATE.Chat.CraftSuccess'), 'success title key (identity localize)');
  assert.ok(content.includes('Gandalf'), 'actor name');
  assert.ok(content.includes('Iron Sword'), 'recipe name');
});

test('renders created, consumed and tools sections with quantity prefix and image src', () => {
  const content = buildCraftingChatContent(successModel());
  assert.ok(content.includes('FABRICATE.Chat.Results'), 'created heading');
  assert.ok(content.includes('FABRICATE.Chat.Consumed'), 'consumed heading');
  assert.ok(content.includes('FABRICATE.Chat.Tools'), 'tools heading');
  assert.ok(content.includes('3× Iron Ingot'), 'quantity > 1 prefixed');
  assert.ok(
    content.includes('Leather Strap') && !content.includes('1× Leather Strap'),
    'quantity 1 not prefixed'
  );
  assert.ok(content.includes('src="icons/ingot.png"'), 'consumed image src');
  assert.ok(content.includes('src="icons/hammer.png"'), 'tool image src');
});

test('failure card uses failure modifier, reason notice and merged forfeited section', () => {
  const content = buildCraftingChatContent(failureModel());
  assert.ok(content.includes('fabricate-craft-chat--failure'), 'failure modifier');
  assert.ok(content.includes('FABRICATE.Chat.CraftFailure'), 'failure title');
  assert.ok(content.includes('fabricate-craft-chat__notice'), 'failure notice element');
  assert.ok(content.includes('FABRICATE.Chat.FailureReason'), 'failure reason label');
  assert.ok(content.includes('Skill check too low'), 'failure reason text');
  assert.ok(content.includes('FABRICATE.Chat.ConsumedOnFailure'), 'merged forfeited heading');
  assert.ok(content.includes('Silver Dust'), 'consumed ingredient forfeited');
  assert.ok(content.includes('Magic Crucible'), 'tool forfeited in the same section');
  assert.ok(!content.includes('FABRICATE.Chat.Results'), 'no created section on failure');
});

test('omits empty sections', () => {
  const content = buildCraftingChatContent({
    status: 'succeeded',
    actorName: 'Gandalf',
    recipeName: 'Iron Sword',
    results: [{ name: 'Iron Sword', img: 'icons/sword.png', quantity: 1 }],
    consumed: [],
    tools: [],
  });
  assert.ok(!content.includes('FABRICATE.Chat.Consumed'), 'no consumed section');
  assert.ok(!content.includes('FABRICATE.Chat.Tools'), 'no tools section');
  assert.ok(content.includes('FABRICATE.Chat.Results'), 'created section still shown');
});

test('failure with nothing forfeited shows the reason but no forfeited section', () => {
  const content = buildCraftingChatContent(
    failureModel({ consumed: [], tools: [] })
  );
  assert.ok(content.includes('Skill check too low'), 'reason still shown');
  assert.ok(!content.includes('FABRICATE.Chat.ConsumedOnFailure'), 'no forfeited section when nothing consumed');
});

test('uses the item-bag fallback image when an entry has no img', () => {
  const content = buildCraftingChatContent(
    successModel({ results: [{ name: 'Mystery Blade', img: '', quantity: 1 }] })
  );
  assert.ok(content.includes('src="icons/svg/item-bag.svg"'), 'fallback image used');
});

test('renders the roll total row when a finite check value is present', () => {
  const content = buildCraftingChatContent(successModel({ rollValue: 17 }));
  assert.ok(content.includes('fabricate-craft-chat__roll'), 'roll row element');
  assert.ok(content.includes('FABRICATE.Chat.Roll'), 'roll label key');
  assert.ok(content.includes('fabricate-craft-chat__roll-value">17<'), 'roll value rendered');
});

test('shows the roll total on failure cards too', () => {
  const content = buildCraftingChatContent(failureModel({ rollValue: 4 }));
  assert.ok(content.includes('fabricate-craft-chat__roll-value">4<'), 'failure roll value rendered');
});

test('omits the roll row when no check ran (null / absent / non-finite value)', () => {
  for (const rollValue of [null, undefined, NaN, Infinity]) {
    const content = buildCraftingChatContent(successModel({ rollValue }));
    assert.ok(!content.includes('fabricate-craft-chat__roll'), `no roll row for ${rollValue}`);
  }
  assert.ok(
    !buildCraftingChatContent(successModel()).includes('fabricate-craft-chat__roll'),
    'no roll row when the field is absent'
  );
});

test('escapes HTML in user-authored names', () => {
  const content = buildCraftingChatContent(
    successModel({ results: [{ name: '<script>x</script> & "rare"', img: 'icons/x.png', quantity: 1 }] })
  );
  assert.ok(!content.includes('<script>x</script>'), 'raw script tag not present');
  assert.ok(content.includes('&lt;script&gt;'), 'angle brackets escaped');
  assert.ok(content.includes('&amp;'), 'ampersand escaped');
  assert.ok(content.includes('&quot;rare&quot;'), 'quotes escaped');
});

test('routes every label through the localize function', () => {
  const seen = [];
  buildCraftingChatContent(successModel(), (key) => {
    seen.push(key);
    return `loc:${key}`;
  });
  for (const key of ['CraftSuccess', 'Actor', 'Recipe', 'Results', 'Consumed', 'Tools']) {
    assert.ok(seen.includes(`FABRICATE.Chat.${key}`), `localize asked for FABRICATE.Chat.${key}`);
  }
});
