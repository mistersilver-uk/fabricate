/**
 * Unit tests for the pure crafting chat card formatter
 * (`buildCraftingChatContent`). No Foundry globals required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCraftingChatContent } from '../src/systems/CraftingChatCard.js';

/** The SHIPPED localization, so a placeholder assertion reads the real string. */
const LANG = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lang', 'en.json'), 'utf8')
);
const shippedLocalize = (key) => LANG.FABRICATE.Chat[key.replace('FABRICATE.Chat.', '')] ?? key;

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

/**
 * The text inside the rendered tier-step notice, or null when no note rendered.
 * Reading the note in isolation keeps a "carries no count" assertion from being
 * satisfied (or defeated) by an unrelated quantity elsewhere in the card.
 */
function tierStepNoteOf(content) {
  const match = /fabricate-craft-chat__tier-step">([^<]*)</.exec(content);
  return match ? match[1] : null;
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

test('renders a localized tier-step note only for a realized tier change', () => {
  const stepped = buildCraftingChatContent(successModel({ tierStep: { mode: 'up', steps: 1 } }));
  assert.ok(stepped.includes('fabricate-craft-chat__tier-step'), 'semantic tier-step hook');
  assert.ok(stepped.includes('FABRICATE.Chat.TierStepUp'), 'the up key (identity localize)');

  // `tierStepApplied` is absent unless the tier actually moved, so no note renders.
  const notStepped = buildCraftingChatContent(successModel({ tierStep: null }));
  assert.ok(!notStepped.includes('fabricate-craft-chat__tier-step'), 'no note when nothing moved');
  assert.ok(
    !buildCraftingChatContent(successModel()).includes('fabricate-craft-chat__tier-step'),
    'no note when the field is absent'
  );
});

test('a down step renders the down key; a target step is directionless and countless', () => {
  const down = buildCraftingChatContent(successModel({ tierStep: { mode: 'down', steps: 2 } }));
  assert.ok(down.includes('FABRICATE.Chat.TierStepDown'), 'the down key');
  assert.ok(!down.includes('FABRICATE.Chat.TierStepUp'), 'never the up key');

  // "you were placed on Masterwork" has no direction and no magnitude, so `steps` is
  // never rendered for `target` — even when the realized move spanned several tiers.
  const target = buildCraftingChatContent(
    successModel({ tierStep: { mode: 'target', steps: 3 } })
  );
  assert.equal(
    tierStepNoteOf(target),
    'FABRICATE.Chat.TierStepTarget',
    'the target note is the directionless key alone — no direction, no count'
  );
});

test('substitutes the realized {steps} magnitude into the localized relative note', () => {
  // Both card modules take `localize` as a key-only `(key) => string`, so the card
  // itself performs the substitution; a live localization returns the real sentence.
  const localize = (key) =>
    key === 'FABRICATE.Chat.TierStepUp' ? 'Stepped up {steps} tier(s)' : key;
  const content = buildCraftingChatContent(
    successModel({ tierStep: { mode: 'up', steps: 2 } }),
    localize
  );
  assert.ok(content.includes('Stepped up 2 tier(s)'), 'placeholder replaced with the magnitude');
  assert.ok(!content.includes('{steps}'), 'no unsubstituted placeholder reaches chat');
});

test('the SHIPPED relative note strings carry {steps}, and the card substitutes into them', () => {
  // Every other assertion here (and in `tests/salvage-chat-card.test.js`) stubs
  // `localize` with its own COPY of the sentence, so the substitution is exercised
  // against a fixture of the string rather than against the string. Deleting `{steps}`
  // from `lang/en.json` would render "Stepped up tier(s)" to every player with the
  // whole suite green. This is the one place the real value is read; it covers the
  // salvage suite's stub too, since both card modules render these same two keys.
  for (const key of ['TierStepUp', 'TierStepDown']) {
    const value = LANG.FABRICATE.Chat[key];
    assert.equal(typeof value, 'string', `FABRICATE.Chat.${key} must be a string leaf`);
    assert.ok(
      value.includes('{steps}'),
      `FABRICATE.Chat.${key} must carry the {steps} placeholder the card substitutes`
    );
  }

  const content = buildCraftingChatContent(
    successModel({ tierStep: { mode: 'up', steps: 2 } }),
    shippedLocalize
  );
  assert.equal(
    tierStepNoteOf(content),
    LANG.FABRICATE.Chat.TierStepUp.replace('{steps}', '2'),
    'the shipped sentence reaches chat with the realized magnitude in place'
  );
  assert.ok(!content.includes('{steps}'), 'no unsubstituted placeholder reaches chat');
});

test('renders no note for a mode of none, an unknown mode, or a missing magnitude', () => {
  for (const tierStep of [
    { mode: 'none' },
    { mode: 'sideways', steps: 1 },
    { mode: 'up' },
    { mode: 'down', steps: 0 },
    {},
  ]) {
    const content = buildCraftingChatContent(successModel({ tierStep }));
    assert.ok(
      !content.includes('fabricate-craft-chat__tier-step'),
      `no note for ${JSON.stringify(tierStep)}`
    );
  }
});

test('the retired natural-step model key and CSS hook are gone', () => {
  // The old `data.natStep` shape must not keep rendering a note through the renamed
  // renderer — a silent passthrough would leave the migration half-done.
  const content = buildCraftingChatContent(successModel({ natStep: { direction: 'up' } }));
  assert.ok(!content.includes('fabricate-craft-chat__nat-step'), 'the old hook is retired');
  assert.ok(!content.includes('fabricate-craft-chat__tier-step'), 'the old key drives nothing');
  assert.ok(!content.includes('NaturalStep'), 'the retired lang keys are unreferenced');
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
