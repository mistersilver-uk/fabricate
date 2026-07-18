/**
 * Unit tests for the pure salvage chat card formatter
 * (`buildSalvageChatContent`). No Foundry globals required.
 *
 * Salvage reuses the crafting card's `buildResultCard` renderer, so these assert
 * the salvage-specific labels/model mapping AND that the rendered card shares the
 * crafting card's markup (the `fabricate-craft-chat` classes) — i.e. it reads as a
 * salvage analogue of the crafting card, not a second unrelated format (issue 675).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSalvageChatContent } from '../src/systems/SalvageChatCard.js';

function successModel(overrides = {}) {
  return {
    status: 'succeeded',
    actorName: 'Akra',
    componentName: 'Iron Ore',
    results: [
      { name: 'Iron Shard', img: 'icons/shard.png', quantity: 2 },
      { name: 'Slag', img: 'icons/slag.png', quantity: 1 },
    ],
    consumed: [{ name: 'Iron Ore', img: 'icons/ore.png', quantity: 1 }],
    tools: [{ name: 'Prospector Hammer', img: 'icons/hammer.png' }],
    ...overrides,
  };
}

function failureModel(overrides = {}) {
  return {
    status: 'failed',
    actorName: 'Merric',
    componentName: 'Iron Ore',
    results: [],
    consumed: [{ name: 'Iron Ore', img: 'icons/ore.png', quantity: 1 }],
    tools: [{ name: 'Prospector Hammer', img: 'icons/hammer.png' }],
    failureReason: 'Roll fell short',
    ...overrides,
  };
}

test('renders the SAME card markup as crafting (shared fabricate-craft-chat styles)', () => {
  const content = buildSalvageChatContent(successModel());
  assert.ok(content.includes('fabricate-craft-chat fabricate-craft-chat--success'), 'shared wrapper + state class');
  assert.ok(content.includes('fabricate-craft-chat__header'), 'shared header');
  assert.ok(content.includes('fabricate-craft-chat__grid'), 'shared icon grid');
});

test('success card uses salvage titles, source subtitle, salvager, and recovered/broken-down sections', () => {
  const content = buildSalvageChatContent(successModel());
  assert.ok(content.includes('FABRICATE.Chat.SalvageSuccess'), 'salvage success title key');
  assert.ok(content.includes('FABRICATE.Chat.SalvageActor'), 'salvager actor label');
  assert.ok(content.includes('Akra'), 'actor name');
  assert.ok(content.includes('FABRICATE.Chat.SalvageSource'), 'source subtitle label');
  assert.ok(content.includes('Iron Ore'), 'source component name');
  assert.ok(content.includes('FABRICATE.Chat.SalvageRecovered'), 'recovered heading');
  assert.ok(content.includes('FABRICATE.Chat.SalvageConsumed'), 'broken-down heading');
  assert.ok(content.includes('FABRICATE.Chat.SalvageTools'), 'tools-broken heading');
  assert.ok(!content.includes('FABRICATE.Chat.CraftSuccess'), 'never the crafting title');
  assert.ok(!content.includes('FABRICATE.Chat.Recipe'), 'never the crafting subject label');
});

test('recovered items render quantity prefix and image src; qty 1 is not prefixed', () => {
  const content = buildSalvageChatContent(successModel());
  assert.ok(content.includes('2× Iron Shard'), 'quantity > 1 prefixed');
  assert.ok(content.includes('Slag') && !content.includes('1× Slag'), 'quantity 1 not prefixed');
  assert.ok(content.includes('src="icons/shard.png"'), 'recovered image src');
  assert.ok(content.includes('src="icons/hammer.png"'), 'broken tool image src');
});

test('failure card uses failure modifier, reason notice, and one merged forfeited section', () => {
  const content = buildSalvageChatContent(failureModel());
  assert.ok(content.includes('fabricate-craft-chat--failure'), 'failure modifier');
  assert.ok(content.includes('FABRICATE.Chat.SalvageFailure'), 'salvage failure title');
  assert.ok(content.includes('fabricate-craft-chat__notice'), 'failure notice element');
  assert.ok(content.includes('Roll fell short'), 'failure reason text');
  assert.ok(content.includes('FABRICATE.Chat.ConsumedOnFailure'), 'merged forfeited heading');
  assert.ok(content.includes('Iron Ore'), 'source forfeited');
  assert.ok(content.includes('Prospector Hammer'), 'broken tool forfeited in the same section');
  assert.ok(!content.includes('FABRICATE.Chat.SalvageRecovered'), 'no recovered section on failure');
});

test('omits empty sections (nothing recovered / no tools broke)', () => {
  const content = buildSalvageChatContent(successModel({ results: [], tools: [] }));
  assert.ok(!content.includes('FABRICATE.Chat.SalvageRecovered'), 'no recovered section');
  assert.ok(!content.includes('FABRICATE.Chat.SalvageTools'), 'no tools section');
  assert.ok(content.includes('FABRICATE.Chat.SalvageConsumed'), 'broken-down section still shown');
});

test('uses the item-bag fallback image when a recovered entry has no img', () => {
  const content = buildSalvageChatContent(
    successModel({ results: [{ name: 'Mystery Dust', img: '', quantity: 1 }] })
  );
  assert.ok(content.includes('src="icons/svg/item-bag.svg"'), 'fallback image used');
});

test('renders the roll total row when a finite check value is present', () => {
  const content = buildSalvageChatContent(successModel({ rollValue: 15 }));
  assert.ok(content.includes('fabricate-craft-chat__roll'), 'shared roll row element');
  assert.ok(content.includes('FABRICATE.Chat.Roll'), 'roll label key');
  assert.ok(content.includes('fabricate-craft-chat__roll-value">15<'), 'roll value rendered');
});

test('omits the roll row for a guaranteed no-check salvage (null / absent value)', () => {
  assert.ok(
    !buildSalvageChatContent(successModel({ rollValue: null })).includes('fabricate-craft-chat__roll'),
    'no roll row when value is null'
  );
  assert.ok(
    !buildSalvageChatContent(successModel()).includes('fabricate-craft-chat__roll'),
    'no roll row when the field is absent'
  );
});

test('escapes HTML in user-authored names', () => {
  const content = buildSalvageChatContent(
    successModel({ results: [{ name: '<script>x</script> & "rare"', img: 'icons/x.png', quantity: 1 }] })
  );
  assert.ok(!content.includes('<script>x</script>'), 'raw script tag not present');
  assert.ok(content.includes('&lt;script&gt;'), 'angle brackets escaped');
  assert.ok(content.includes('&amp;'), 'ampersand escaped');
  assert.ok(content.includes('&quot;rare&quot;'), 'quotes escaped');
});

test('routes every label through the localize function', () => {
  const seen = [];
  buildSalvageChatContent(successModel(), (key) => {
    seen.push(key);
    return `loc:${key}`;
  });
  for (const key of ['SalvageSuccess', 'SalvageActor', 'SalvageSource', 'SalvageRecovered', 'SalvageConsumed', 'SalvageTools']) {
    assert.ok(seen.includes(`FABRICATE.Chat.${key}`), `localize asked for FABRICATE.Chat.${key}`);
  }
});
