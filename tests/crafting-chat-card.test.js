/**
 * Unit tests for the pure crafting chat card formatter (`buildCraftingChatContent`). No Foundry
 * globals required (issue 1286).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { buildBulkSalvageChatContent } from '../src/ui/presenters/BulkSalvageChatCard.js';
import { buildCraftingChatContent } from '../src/ui/presenters/CraftingChatCard.js';
import { buildGmComplicationCardContent } from '../src/systems/complicationRuntime.js';
import { buildGatheringChatContent } from '../src/ui/presenters/GatheringChatCard.js';
import { buildSalvageChatContent } from '../src/ui/presenters/SalvageChatCard.js';

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

/** The text inside the rendered tier-step notice, or null when no note rendered. */
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
  assert.ok(
    content.includes('FABRICATE.Chat.CraftSuccess'),
    'success title key (identity localize)'
  );
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
  const content = buildCraftingChatContent(failureModel({ consumed: [], tools: [] }));
  assert.ok(content.includes('Skill check too low'), 'reason still shown');
  assert.ok(
    !content.includes('FABRICATE.Chat.ConsumedOnFailure'),
    'no forfeited section when nothing consumed'
  );
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

test('1645: a rolled result states its roll beside the produced line', () => {
  const content = buildCraftingChatContent(
    successModel({
      results: [
        {
          name: 'Iron Sword',
          img: 'icons/sword.png',
          quantity: 3,
          rolled: { formula: '1d4+1', total: 3 },
        },
      ],
    }),
    shippedLocalize
  );
  assert.ok(content.includes('3× Iron Sword'), 'the awarded integer still leads the row');
  assert.ok(
    content.includes('fabricate-craft-chat__item-roll">Rolled 1d4+1 = 3<'),
    'the roll is a second run of the same row, in the card\'s rolled-total treatment'
  );
  assert.ok(!content.includes('{formula}'), 'no unsubstituted placeholder reaches chat');
  assert.ok(!content.includes('{total}'), 'no unsubstituted placeholder reaches chat');
});

test('1645: an empty award states the roll that produced nothing', () => {
  const content = buildCraftingChatContent(
    successModel({
      results: [{ name: 'Iron Ore', img: '', quantity: 0, rolled: { formula: '1d4-8', total: -3 } }],
    }),
    shippedLocalize
  );
  assert.ok(content.includes('Rolled 1d4-8 = -3, nothing produced'), 'the roll as it fell');
  assert.ok(content.includes('Iron Ore'), 'and what it was rolled for');
});

test('1645: the SHIPPED rolled-amount sentences carry both placeholders the card substitutes', () => {
  for (const key of ['RolledAmount', 'RolledAmountEmpty']) {
    const value = LANG.FABRICATE.Chat[key];
    assert.equal(typeof value, 'string', `FABRICATE.Chat.${key} must be a string leaf`);
    assert.ok(value.includes('{formula}'), `FABRICATE.Chat.${key} must carry {formula}`);
    assert.ok(value.includes('{total}'), `FABRICATE.Chat.${key} must carry {total}`);
  }
});

test('1645: a fixed or malformed amount renders no rolled run at all', () => {
  for (const rolled of [undefined, null, {}, { formula: '1d4' }, { total: 2 }]) {
    const content = buildCraftingChatContent(
      successModel({ results: [{ name: 'Iron Sword', img: '', quantity: 2, rolled }] }),
      shippedLocalize
    );
    assert.ok(
      !content.includes('fabricate-craft-chat__item-roll'),
      `no rolled run for ${JSON.stringify(rolled)}`
    );
  }
});

test('shows the roll total on failure cards too', () => {
  const content = buildCraftingChatContent(failureModel({ rollValue: 4 }));
  assert.ok(
    content.includes('fabricate-craft-chat__roll-value">4<'),
    'failure roll value rendered'
  );
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
  const target = buildCraftingChatContent(successModel({ tierStep: { mode: 'target', steps: 3 } }));
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
  // Every other assertion here (and in `tests/salvage-chat-card.test.js`) stubs `localize` with its
  // own COPY of the sentence, so the substitution is exercised against a fixture of the string
  // rather than against the string.
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
    successModel({
      results: [{ name: '<script>x</script> & "rare"', img: 'icons/x.png', quantity: 1 }],
    })
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

// The shared fired-complications block, across all four builders (issue 1286)

/** The four builders, keyed by the card each one draws. */
const BUILDERS = Object.freeze({
  crafting: buildCraftingChatContent,
  salvage: buildSalvageChatContent,
  gathering: buildGatheringChatContent,
  bulk: buildBulkSalvageChatContent,
});

/** One model per builder, none of which mentions complications. */
const NO_COMPLICATION_MODELS = Object.freeze({
  crafting: {
    status: 'succeeded',
    actorName: 'Gandalf',
    recipeName: 'Iron Sword',
    results: [{ name: 'Iron Sword', img: 'icons/sword.png', quantity: 1 }],
    consumed: [{ name: 'Iron Ingot', img: 'icons/ingot.png', quantity: 3 }],
    tools: [{ name: 'Forge Hammer', img: 'icons/hammer.png' }],
    rollValue: 17,
  },
  salvage: {
    status: 'succeeded',
    actorName: 'Akra',
    componentName: 'Iron Ore',
    results: [{ name: 'Iron Shard', img: 'icons/shard.png', quantity: 2 }],
    consumed: [{ name: 'Iron Ore', img: 'icons/ore.png', quantity: 1 }],
    tools: [],
    rollValue: 12,
  },
  gathering: {
    status: 'succeeded',
    actorName: 'Brann',
    taskName: 'Forage the thicket',
    components: [{ name: 'Sage', img: 'icons/sage.png', quantity: 2 }],
    events: [],
    brokenTools: [],
    staminaSpent: 3,
    nodesRemaining: 4,
  },
  bulk: {
    status: 'mixed',
    actorNames: ['Akra'],
    counts: { total: 2, succeeded: 1, failed: 1 },
    subjects: [
      {
        name: 'Iron Ore',
        img: 'icons/ore.png',
        outcome: 'succeeded',
        rollValue: 12,
        tierStep: null,
        message: '',
      },
    ],
    results: [{ name: 'Iron Shard', img: 'icons/shard.png', quantity: 2 }],
    consumed: [],
    tools: [],
  },
});

/**
 * The markup each builder produced for the model above BEFORE the complications block existed,
 * captured from the base build under the identity localizer.
 */
const PRE_CHANGE_CARDS = Object.freeze({
  crafting:
    '<div class="fabricate-craft-chat fabricate-craft-chat--success"><header class="fabricate-craft-chat__header"><div class="fabricate-craft-chat__title">FABRICATE.Chat.CraftSuccess</div><div class="fabricate-craft-chat__subtitle">FABRICATE.Chat.Actor: Gandalf · FABRICATE.Chat.Recipe: Iron Sword</div></header><div class="fabricate-craft-chat__roll"><span class="fabricate-craft-chat__roll-label">FABRICATE.Chat.Roll</span><span class="fabricate-craft-chat__roll-value">17</span></div><section class="fabricate-craft-chat__section fabricate-craft-chat__section--results"><div class="fabricate-craft-chat__heading">FABRICATE.Chat.Results</div><ul class="fabricate-craft-chat__grid"><li class="fabricate-craft-chat__item"><img class="fabricate-craft-chat__icon" src="icons/sword.png" alt="" /><span class="fabricate-craft-chat__label">Iron Sword</span></li></ul></section><section class="fabricate-craft-chat__section fabricate-craft-chat__section--consumed"><div class="fabricate-craft-chat__heading">FABRICATE.Chat.Consumed</div><ul class="fabricate-craft-chat__grid"><li class="fabricate-craft-chat__item"><img class="fabricate-craft-chat__icon" src="icons/ingot.png" alt="" /><span class="fabricate-craft-chat__label">3× Iron Ingot</span></li></ul></section><section class="fabricate-craft-chat__section fabricate-craft-chat__section--tools"><div class="fabricate-craft-chat__heading">FABRICATE.Chat.Tools</div><ul class="fabricate-craft-chat__grid"><li class="fabricate-craft-chat__item"><img class="fabricate-craft-chat__icon" src="icons/hammer.png" alt="" /><span class="fabricate-craft-chat__label">Forge Hammer</span></li></ul></section></div>',
  salvage:
    '<div class="fabricate-craft-chat fabricate-craft-chat--success"><header class="fabricate-craft-chat__header"><div class="fabricate-craft-chat__title">FABRICATE.Chat.SalvageSuccess</div><div class="fabricate-craft-chat__subtitle">FABRICATE.Chat.SalvageActor: Akra · FABRICATE.Chat.SalvageSource: Iron Ore</div></header><div class="fabricate-craft-chat__roll"><span class="fabricate-craft-chat__roll-label">FABRICATE.Chat.Roll</span><span class="fabricate-craft-chat__roll-value">12</span></div><section class="fabricate-craft-chat__section fabricate-craft-chat__section--results"><div class="fabricate-craft-chat__heading">FABRICATE.Chat.SalvageRecovered</div><ul class="fabricate-craft-chat__grid"><li class="fabricate-craft-chat__item"><img class="fabricate-craft-chat__icon" src="icons/shard.png" alt="" /><span class="fabricate-craft-chat__label">2× Iron Shard</span></li></ul></section><section class="fabricate-craft-chat__section fabricate-craft-chat__section--consumed"><div class="fabricate-craft-chat__heading">FABRICATE.Chat.SalvageConsumed</div><ul class="fabricate-craft-chat__grid"><li class="fabricate-craft-chat__item"><img class="fabricate-craft-chat__icon" src="icons/ore.png" alt="" /><span class="fabricate-craft-chat__label">Iron Ore</span></li></ul></section></div>',
  gathering:
    '<div class="fabricate-gather-chat fabricate-gather-chat--success"><header class="fabricate-gather-chat__header"><div class="fabricate-gather-chat__title">FABRICATE.Chat.GatherSuccess</div><div class="fabricate-gather-chat__subtitle">FABRICATE.Chat.GatherActor: Brann · FABRICATE.Chat.GatherTask: Forage the thicket</div></header><section class="fabricate-gather-chat__section"><div class="fabricate-gather-chat__heading">FABRICATE.Chat.GatherComponents</div><ul class="fabricate-gather-chat__grid"><li class="fabricate-gather-chat__item"><img class="fabricate-gather-chat__icon" src="icons/sage.png" alt="" /><span class="fabricate-gather-chat__label">2× Sage</span></li></ul></section><footer class="fabricate-gather-chat__footer"><span class="fabricate-gather-chat__stat"><i class="fabricate-gather-chat__stat-icon fas fa-bolt" aria-hidden="true"></i><span class="fabricate-gather-chat__stat-text">FABRICATE.Chat.GatherStamina: <span class="fabricate-gather-chat__stat-value">3</span></span></span><span class="fabricate-gather-chat__stat"><i class="fabricate-gather-chat__stat-icon fas fa-mountain" aria-hidden="true"></i><span class="fabricate-gather-chat__stat-text">FABRICATE.Chat.GatherNodes: <span class="fabricate-gather-chat__stat-value">4</span></span></span></footer></div>',
  bulk: '<div class="fabricate-craft-chat fabricate-craft-chat--mixed"><header class="fabricate-craft-chat__header"><div class="fabricate-craft-chat__title">FABRICATE.Chat.BulkSalvageMixed</div><div class="fabricate-craft-chat__subtitle">FABRICATE.Chat.SalvageActor: Akra</div></header><div class="fabricate-craft-chat__notice">FABRICATE.Chat.BulkSalvageSummary</div><section class="fabricate-craft-chat__section fabricate-craft-chat__section--subjects"><div class="fabricate-craft-chat__heading">FABRICATE.Chat.BulkSalvageSubjects</div><ul class="fabricate-craft-chat__grid"><li class="fabricate-craft-chat__item"><img class="fabricate-craft-chat__icon" src="icons/ore.png" alt="" /><span class="fabricate-craft-chat__label">Iron Ore — FABRICATE.Chat.BulkSalvageOutcomeSucceeded</span><div class="fabricate-craft-chat__roll"><span class="fabricate-craft-chat__roll-label">FABRICATE.Chat.Roll</span><span class="fabricate-craft-chat__roll-value">12</span></div></li></ul></section><section class="fabricate-craft-chat__section fabricate-craft-chat__section--results"><div class="fabricate-craft-chat__heading">FABRICATE.Chat.SalvageRecovered</div><ul class="fabricate-craft-chat__grid"><li class="fabricate-craft-chat__item"><img class="fabricate-craft-chat__icon" src="icons/shard.png" alt="" /><span class="fabricate-craft-chat__label">2× Iron Shard</span></li></ul></section></div>',
});

for (const card of Object.keys(BUILDERS)) {
  test(`${card}: no complications renders the pre-change card byte-for-byte`, () => {
    const model = NO_COMPLICATION_MODELS[card];
    assert.equal(BUILDERS[card](model), PRE_CHANGE_CARDS[card], 'absent key: unchanged card');
    // An authored-empty list must render as absence too, or a caller that always threads
    // the field (every engine site does) would move every card in every world.
    assert.equal(
      BUILDERS[card]({ ...model, complications: [] }),
      PRE_CHANGE_CARDS[card],
      'empty list: still the unchanged card'
    );
  });
}

/** A benign fired complication, as the engines project it onto a card model. */
const FIRED = Object.freeze([
  {
    name: 'Shrapnel Burst',
    description: 'Splinters spray across the bench.',
    severity: 'major',
    componentName: 'Iron Ingot',
  },
]);

for (const card of Object.keys(BUILDERS)) {
  test(`${card}: a fired complication renders its name, source and prose`, () => {
    const html = BUILDERS[card]({ ...NO_COMPLICATION_MODELS[card], complications: FIRED });
    assert.ok(html.includes('__section--complications'), 'the block rendered');
    assert.ok(html.includes('FABRICATE.Chat.Complications'), 'one shared heading key');
    assert.ok(html.includes('Shrapnel Burst'), 'the authored name');
    assert.ok(html.includes('Splinters spray across the bench.'), 'the authored prose');
    assert.ok(
      html.includes('Iron Ingot'),
      'the stage occurrence is named, so a card that also GRANTED it can be reconciled'
    );
    assert.ok(
      html.includes('data-fabricate-complication-severity="major"'),
      'severity travels as a double-quoted data attribute, not as visible copy'
    );
  });
}

test('a complication with no prose and no source renders just its name', () => {
  const html = buildCraftingChatContent({
    ...NO_COMPLICATION_MODELS.crafting,
    complications: [{ name: 'Bad Luck', description: '', severity: '', componentName: '' }],
  });
  assert.ok(html.includes('Bad Luck'), 'the name still renders');
  assert.ok(!html.includes('__complication-description'), 'no empty prose span');
  assert.ok(!html.includes('__complication-source'), 'no empty source span');
});

// Two firings of ONE complication, told apart by their stage position (issue 1286)

/**
 * The exact case the per-result-entry ruling created: a component staged TWICE that went wrong
 * twice.
 */
const TWICE_STAGED = Object.freeze([
  {
    name: 'Shrapnel Burst',
    description: 'Splinters spray across the bench.',
    severity: 'major',
    componentName: 'Steel Shard',
    position: 3,
  },
  {
    name: 'Shrapnel Burst',
    description: 'Splinters spray across the bench.',
    severity: 'major',
    componentName: 'Steel Shard',
    position: 5,
  },
]);

/** Every complication `<li>` in a card, in document order. */
function complicationRows(html) {
  return [...html.matchAll(/<li class="[^"]*__item--complication"[\s\S]*?<\/li>/g)].map(
    (match) => match[0]
  );
}

for (const card of Object.keys(BUILDERS)) {
  test(`${card}: two firings of one complication on one component are DISTINGUISHABLE`, () => {
    const html = BUILDERS[card](
      { ...NO_COMPLICATION_MODELS[card], complications: TWICE_STAGED },
      shippedLocalize
    );
    const rows = complicationRows(html);

    assert.equal(rows.length, 2, 'both firings are reported — the rows are never collapsed');
    assert.ok(rows[0] !== rows[1], 'and the two rows are not byte-identical');
    assert.ok(rows[0].includes('Result 3'), 'the first row names its own stage position');
    assert.ok(rows[1].includes('Result 5'), 'the second names its own, which is a DIFFERENT one');
    assert.ok(!html.includes('{position}'), 'the shipped placeholder is substituted, not printed');
    // The position qualifies the component it follows, so the identity half of the row —
    // name, source, position — reads as one phrase before the authored prose.
    assert.ok(
      /__complication-source">Steel Shard<\/span> — <span class="[^"]*__complication-position">Result 3</.test(
        rows[0]
      ),
      'the position follows the component it disambiguates'
    );
  });
}

test('a complication that fired ONCE states no position, because there is nothing to resolve', () => {
  const html = buildCraftingChatContent(
    { ...NO_COMPLICATION_MODELS.crafting, complications: [TWICE_STAGED[0]] },
    shippedLocalize
  );
  assert.ok(html.includes('Shrapnel Burst'), 'the row still renders');
  assert.ok(!html.includes('__complication-position'), 'no position span');
  assert.ok(!html.includes('Result 3'), 'and no number for a reader to check for nothing');
});

test('rows for DIFFERENT components never collide, so neither states a position', () => {
  // The aggregate bulk card's normal shape: many rows, each from its own resolution, and two
  // of them at their own position 1. They are already told apart by the component they name.
  const html = buildBulkSalvageChatContent(
    {
      ...NO_COMPLICATION_MODELS.bulk,
      complications: [
        { ...TWICE_STAGED[0], componentName: 'Steel Shard', position: 1 },
        { ...TWICE_STAGED[0], componentName: 'Copper Wire', position: 1 },
      ],
    },
    shippedLocalize
  );
  assert.equal(complicationRows(html).length, 2, 'both rows render');
  assert.ok(!html.includes('__complication-position'), 'and neither needs a position');
});

test('two DIFFERENT complications a GM worded identically are disambiguated on the same rule', () => {
  // The rule is keyed on what the row DRAWS, not on `(componentId, complicationId)`: two
  // records with different ids that a GM named and worded alike are exactly as unreadable
  // as one complication fired twice, and want the same treatment.
  const html = buildCraftingChatContent(
    {
      ...NO_COMPLICATION_MODELS.crafting,
      complications: [
        { ...TWICE_STAGED[0], position: 2 },
        { ...TWICE_STAGED[0], position: 4 },
      ],
    },
    shippedLocalize
  );
  assert.ok(html.includes('Result 2') && html.includes('Result 4'), 'both are named');
});

test('a repeated row carrying no position degrades to silence, never to "Result null"', () => {
  // A firing recorded before positions existed. The card is a permanent world document, so
  // the safe failure is an unmarked row rather than a stated non-number.
  const unpositioned = { ...TWICE_STAGED[0], position: null };
  const html = buildCraftingChatContent(
    { ...NO_COMPLICATION_MODELS.crafting, complications: [unpositioned, unpositioned] },
    shippedLocalize
  );
  assert.equal(complicationRows(html).length, 2, 'both rows still render, undeduped');
  assert.ok(!html.includes('__complication-position'), 'no position span');
  assert.ok(!/Result\s*(?:null|undefined|NaN|0\b)/.test(html), 'and no broken sentence');
});

test('the position sentence is a real shipped key, and reads as the panel numbers stages', () => {
  // The number in chat must mean what the number in the salvage panel means, or it is worse
  // than nothing. Both are "Result {position}" over the player's own ordered list.
  assert.equal(LANG.FABRICATE.Chat.ComplicationResult, 'Result {position}');
  assert.ok(
    LANG.FABRICATE.App.Complications.ResultEyebrow.startsWith('Result {position}'),
    'the panel eyebrow the chat row borrows its vocabulary from still leads with it'
  );
});

/** Every attribute in `html` whose value is NOT double-quoted, by name. */
function unquotedAttributes(html) {
  const offenders = [];
  for (const [, tag] of html.matchAll(/<([a-zA-Z][^>]*)>/g)) {
    const pattern = /([a-zA-Z-]+)\s*=\s*/g;
    let match = pattern.exec(tag);
    while (match !== null) {
      if (tag[pattern.lastIndex] === '"') {
        const close = tag.indexOf('"', pattern.lastIndex + 1);
        if (close === -1) {
          offenders.push(match[1]);
          break;
        }
        pattern.lastIndex = close + 1;
      } else {
        offenders.push(match[1]);
      }
      match = pattern.exec(tag);
    }
  }
  return offenders;
}

test('unquotedAttributes actually reports a single-quoted attribute', () => {
  // NEGATIVE CONTROL for the scanner below. Without this the quoting assertions could be
  // passing because the scanner never matches anything at all.
  assert.deepEqual(unquotedAttributes(`<li class='x'></li>`), ['class']);
  assert.deepEqual(unquotedAttributes(`<li class=x></li>`), ['class']);
  assert.deepEqual(unquotedAttributes(`<li class="x" data-y="a='b'"></li>`), []);
});

/** A complication authored by someone hostile. */
const HOSTILE = Object.freeze([
  {
    name: '<img src=x onerror=alert(1)>',
    description: `it's a trap & <b>bold</b>`,
    severity: `minor' onmouseover='alert(1)`,
    componentName: '<script>x</script>',
  },
]);

for (const card of Object.keys(BUILDERS)) {
  test(`${card}: a hostile complication is escaped and every attribute stays double-quoted`, () => {
    const html = BUILDERS[card]({ ...NO_COMPLICATION_MODELS[card], complications: HOSTILE });

    assert.ok(!html.includes('<img src=x'), 'no injected element');
    assert.ok(!html.includes('<script>x</script>'), 'no injected script');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'the name is inert text');
    assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'), 'the source name is inert text');
    assert.ok(html.includes('&amp;'), 'the ampersand in the prose is escaped');

    // `esc` deliberately does not escape `'` — it never has — so the single quote survives
    // verbatim.
    assert.ok(html.includes(`it's a trap`), 'a single quote in prose is left alone');
    assert.ok(
      html.includes(`data-fabricate-complication-severity="minor' onmouseover='alert(1)"`),
      'the single-quoted payload is contained by the double quotes around it'
    );
    assert.deepEqual(unquotedAttributes(html), [], 'no attribute anywhere is left unquoted');
  });
}

// The fired-complications block, RENDERED (issue 1286)

/**
 * WHY THIS IS A BROWSER GATE AND NOT A STRING ASSERTION. Every test above establishes that the
 * description is in the MARKUP, and the description was in the markup while being invisible on
 * screen.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FABRICATE_CSS = readFileSync(resolve(REPO_ROOT, 'styles/fabricate.css'), 'utf8');
const FOUNDRY_CSS = readFileSync(resolve(REPO_ROOT, 'tests/fixtures/foundry-core-min.css'), 'utf8');

/** A description of the length the feature is FOR. */
const LONG_FIRED = Object.freeze([
  {
    name: 'Choking Dust Cloud',
    description:
      'A cloud of choking dust billows out of the grinder and fills the room, and everyone at ' +
      'the bench must hold their breath or spend the next minute coughing.',
    severity: 'major',
    componentName: 'Dried Sagebrush',
  },
]);

/** Foundry's chat sidebar, which is the width this card is actually read at. */
const CHAT_WIDTH = 300;

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

/**
 * Strip the `--complication` element modifier from every complication `<li>`.
 *
 * @param {string} html A rendered card.
 * @returns {string} The same card with the modifier removed.
 */
function withoutComplicationModifier(html) {
  return html.replaceAll(/ fabricate-(?:craft|gather)-chat__item--complication/g, '');
}

/**
 * Measure one complication row in a real engine.
 *
 * @param {string} root The card container's id.
 * @param {string} block The BEM block the card draws.
 * @returns {Promise<object>} The measurements this gate asserts on.
 */
function measureComplication(page, root, block) {
  return page.evaluate(
    ([rootId, blockName]) => {
      // Reached by the DATA ATTRIBUTE, which both copies carry, rather than by the modifier
      // class — the control copy is defined by not having that class.
      const item = document.querySelector(`#${rootId} [data-fabricate-complication-severity]`);
      const list = item.parentElement;
      const label = item.querySelector(`.${blockName}__label`);
      const description = item.querySelector(`.${blockName}__complication-description`);
      const labelBox = label.getBoundingClientRect();
      const descriptionBox = description.getBoundingClientRect();
      return {
        carriesModifier: item.classList.contains(`${blockName}__item--complication`),
        overflowsOwnBox: label.scrollWidth > label.clientWidth + 1,
        descriptionEscapesLabel: descriptionBox.right > labelBox.right + 1,
        descriptionHasArea: descriptionBox.width > 0 && descriptionBox.height > 0,
        labelHeight: labelBox.height,
        itemWidth: item.getBoundingClientRect().width,
        listWidth: list.getBoundingClientRect().width,
      };
    },
    [root, block]
  );
}

for (const [card, block] of [
  ['crafting', 'fabricate-craft-chat'],
  ['gathering', 'fabricate-gather-chat'],
]) {
  test(`${card}: a fired complication's description is READABLE at chat width`, async () => {
    const html = BUILDERS[card]({ ...NO_COMPLICATION_MODELS[card], complications: LONG_FIRED });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    try {
      await page.setContent(
        `<style>${FOUNDRY_CSS}</style><style>${FABRICATE_CSS}</style>` +
          `<style>html,body{margin:0}</style>` +
          `<div id="shipped" style="width:${CHAT_WIDTH}px">${html}</div>` +
          `<div id="unstyled" style="width:${CHAT_WIDTH}px">${withoutComplicationModifier(html)}</div>`
      );

      const shipped = await measureComplication(page, 'shipped', block);
      const unstyled = await measureComplication(page, 'unstyled', block);

      // THE NEGATIVE CONTROL. The identical markup without the modifier is the rendering this
      // gate exists to have caught; if it does not clip, nothing below is measuring anything.
      assert.ok(
        unstyled.overflowsOwnBox && unstyled.descriptionEscapesLabel,
        'control: without the `--complication` modifier the row is a single clipped line, ' +
          `measured overflow ${unstyled.overflowsOwnBox}, escaped ${unstyled.descriptionEscapesLabel}`
      );

      assert.ok(shipped.carriesModifier, 'the shipped row is the one carrying the modifier');
      assert.ok(!unstyled.carriesModifier, 'the control row is the one that is not');
      assert.ok(!shipped.overflowsOwnBox, 'the label holds all of its own content');
      assert.ok(!shipped.descriptionEscapesLabel, 'the description is inside the label it is in');
      assert.ok(shipped.descriptionHasArea, 'the description occupies a real box');
      assert.ok(
        shipped.labelHeight > unstyled.labelHeight,
        `the row wraps to more than the one line it used to be: ${shipped.labelHeight}px ` +
          `against ${unstyled.labelHeight}px`
      );
      assert.ok(
        Math.abs(shipped.itemWidth - shipped.listWidth) <= 0.5,
        `the row takes the whole grid rather than one 140px track: ${shipped.itemWidth}px ` +
          `of ${shipped.listWidth}px`
      );
    } finally {
      await context.close();
    }
  });
}

/**
 * The other half of the same claim, and the reason the rules could be added at all: they are
 * reachable ONLY through classes a card without a fired complication never emits.
 */
/** The GM-only card's row, measured at chat width (issue 1286). */
const GM_ROW = Object.freeze({
  name: 'The gland ruptures',
  description:
    'The acid sacs burst as the carcass comes apart, and everything within arm’s reach of ' +
    'the bench is splashed.',
  severity: 'major',
  visibility: 'visible',
  componentName: 'Balehound Mordant',
  effectLabel: 'Acid damage',
  effectRoll: { requested: true, attempted: true, total: 10, formula: '2d6', posted: true },
  reasons: ['halted'],
  claimed: { bucket: 'halted', effectRollTotal: null },
  macro: null,
});

function measureGmComplication(page, rootId) {
  return page.evaluate((id) => {
    const block = 'fabricate-craft-chat';
    const item = document.querySelector(`#${id} [data-fabricate-complication-severity]`);
    const label = item.querySelector(`.${block}__label`);
    const head = item.querySelector(`.${block}__complication-head`);
    const severity = item.querySelector(`.${block}__complication-severity`);
    const sections = [...item.querySelectorAll('[data-fabricate-complication-section]')];
    // The row's RUNS in source order: the three identity lines, then each labelled section.
    const runs = [
      head,
      item.querySelector(`.${block}__complication-meta`),
      item.querySelector(`.${block}__complication-description`),
      ...sections,
    ].map((node) => node.getBoundingClientRect());
    const labelBox = label.getBoundingClientRect();
    const headBox = head.getBoundingClientRect();
    const severityBox = severity.getBoundingClientRect();
    return {
      sectionCount: sections.length,
      // A STACK: every run starts at or below the bottom of the one before it.
      stacked: runs.every((box, index) => index === 0 || box.top >= runs[index - 1].bottom - 1),
      // And INSIDE a section: the heading is its own line above its facts, not a bold word
      // run into the sentence after it.
      headingsOwnLine: sections.every((section) => {
        const heading = section
          .querySelector(`.${block}__complication-heading`)
          .getBoundingClientRect();
        const fact = section.querySelector(`.${block}__complication-fact`).getBoundingClientRect();
        return fact.top >= heading.bottom - 1;
      }),
      narrowestRunShare: Math.min(...runs.map((box) => box.width)) / labelBox.width,
      overflowsOwnBox: label.scrollWidth > label.clientWidth + 1,
      // The severity eyebrow on ONE line, at the right of the name it qualifies.
      severityHeight: severityBox.height,
      headHeight: headBox.height,
      severityOnHeadLine:
        severityBox.top >= headBox.top - 1 && severityBox.bottom <= headBox.bottom + 1,
      severityFlushRight: labelBox.right - severityBox.right < 2,
      itemWidth: item.getBoundingClientRect().width,
      listWidth: item.parentElement.getBoundingClientRect().width,
    };
  }, rootId);
}

test('the GM complication row STACKS its sections at chat width', async () => {
  const html = buildGmComplicationCardContent(
    { entries: [GM_ROW], actorName: 'Aldric', reporterName: 'Player One' },
    // The FULL dotted path, not the leaf: the severity label lives under the manager's
    // namespace, and a leaf lookup would resolve it to the key itself — a 60-character string
    // that overflows the row and would make this gate fail on its own stub.
    (key) => key.split('.').reduce((node, part) => node?.[part], { FABRICATE: LANG.FABRICATE }) ?? key
  );
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${FOUNDRY_CSS}</style><style>${FABRICATE_CSS}</style>` +
        `<style>html,body{margin:0}</style>` +
        `<div id="shipped" style="width:${CHAT_WIDTH}px">${html}</div>` +
        `<div id="unstyled" style="width:${CHAT_WIDTH}px">` +
        `${html.replace(' fabricate-craft-chat--gm', '')}</div>`
    );

    const shipped = await measureGmComplication(page, 'shipped');
    const unstyled = await measureGmComplication(page, 'unstyled');

    assert.equal(shipped.sectionCount, 2, 'why it fired, and what happens');
    // THE CONTROL. Without the `--gm` rules every run is an inline span, so the identity lines
    // share lines with each other and each heading runs into its own facts.
    assert.ok(
      !unstyled.stacked,
      'the control runs the row together on shared lines'
    );
    assert.ok(!unstyled.headingsOwnLine, 'and runs each heading into the fact after it');

    assert.ok(shipped.stacked, 'each run starts below the one before it');
    assert.ok(shipped.headingsOwnLine, 'and each section heading sits above its own facts');
    assert.ok(
      shipped.narrowestRunShare > 0.9,
      `every run takes the row's whole width rather than a track of it: ` +
        `${shipped.narrowestRunShare.toFixed(2)}`
    );
    assert.ok(!shipped.overflowsOwnBox, 'nothing is clipped out of the row');
    assert.ok(shipped.severityOnHeadLine, 'the severity rides the name line');
    assert.ok(shipped.severityFlushRight, 'at the right of it');
    assert.ok(
      shipped.severityHeight < 24 && shipped.headHeight < 24,
      `both on ONE line — the live defect drew the five-letter severity as three: ` +
        `severity ${shipped.severityHeight}px in a head of ${shipped.headHeight}px`
    );
    assert.ok(
      Math.abs(shipped.itemWidth - shipped.listWidth) <= 0.5,
      `the row takes the whole grid rather than one 140px track: ${shipped.itemWidth}px ` +
        `of ${shipped.listWidth}px`
    );
  } finally {
    await context.close();
  }
});

test('the stage-position span is de-emphasised on the same rule as the component it follows', () => {
  // The class ships with the markup or the number shouts on exactly the rows that already repeat,
  // which is the opposite of the job it was added for.
  const rule = FABRICATE_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.includes('__complication-position'));

  assert.ok(Boolean(rule), 'the position span is styled at all');
  assert.ok(rule.includes('__complication-source'), 'and by the same rule as the source');
  for (const block of ['craft', 'gather']) {
    assert.ok(
      rule.includes(`.fabricate-${block}-chat__complication-position`),
      `both card blocks style it — ${block} would otherwise ship unstyled`
    );
  }
});

test('every rule the complications block adds is reached through a complication-only class', () => {
  // Comments are removed FIRST. Prose in this sheet discusses the very classes this scan
  // looks for, and a comment left in place would be read as a selector.
  const complicationRules = FABRICATE_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => chunk.split('{', 1)[0].trim())
    // Scoped to the two CHAT blocks: `styles/fabricate.css` also carries a manager rule for
    // the Recipe Studio's own stage-complication strip, which is a different surface.
    .filter((selector) => /-chat__(?:item--complication|complication-)/.test(selector));

  assert.ok(complicationRules.length > 0, 'the rules exist at all');
  for (const selector of complicationRules) {
    for (const branch of selector.split(',')) {
      assert.match(
        branch.trim(),
        /(__item--complication|__complication-[a-z]+)(\s|$)/,
        `every branch of "${selector}" is gated on a complication-only class`
      );
    }
  }
});

/** The rolled run is the one part of the row that MUST survive chat width (issue 1645): the item
 *  label is `nowrap` + ellipsis in a `minmax(140px, 1fr)` track, so the control moves the run back
 *  onto that treatment and must clip where the shipped markup does not. */
test('1645: the rolled run stays readable at chat width where a label would be ellipsed', async () => {
  const html = buildCraftingChatContent(
    successModel({
      results: [
        {
          name: 'Powdered Sagebrush Extract',
          img: '',
          quantity: 0,
          rolled: { formula: '1d4-8', total: -3 },
        },
      ],
    }),
    shippedLocalize
  );
  const control = html.replace(
    'fabricate-craft-chat__roll fabricate-craft-chat__item-roll">',
    'fabricate-craft-chat__label">'
  );
  assert.notEqual(control, html, 'the control actually moved the run onto the label treatment');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${FOUNDRY_CSS}</style><style>${FABRICATE_CSS}</style>` +
        `<style>html,body{margin:0}</style>` +
        `<div id="shipped" style="width:${CHAT_WIDTH}px">${html}</div>` +
        `<div id="control" style="width:${CHAT_WIDTH}px">${control}</div>`
    );
    const measure = (root) =>
      page.evaluate((id) => {
        const run = document.querySelector(`#${id} .fabricate-craft-chat__item span:last-child`);
        return { text: run.textContent, clipped: run.scrollWidth > run.clientWidth + 1 };
      }, root);

    const clipped = await measure('control');
    assert.ok(clipped.clipped, 'control: on the label treatment the sentence is cut off');
    const shipped = await measure('shipped');
    assert.ok(!shipped.clipped, `the whole sentence is readable: ${shipped.text}`);
    assert.equal(shipped.text, 'Rolled 1d4-8 = -3, nothing produced', 'and it is the sentence');
  } finally {
    await context.close();
  }
});
