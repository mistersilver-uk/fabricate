/**
 * Unit tests for the pure crafting chat card formatter
 * (`buildCraftingChatContent`). No Foundry globals required.
 *
 * The final section covers the SHARED fired-complications block (issue 1286), which lives
 * in `CraftingChatCard.js` and is consumed by all FOUR card builders. Its cases import the
 * other three builders too, because the two claims being made — "escaped and
 * double-quoted, whatever the definition author wrote" and "byte-identical when nothing
 * fired" — are claims about the renderer across every card that draws it, and asserting
 * them one card at a time in four suites is how three of them end up unasserted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBulkSalvageChatContent } from '../src/systems/BulkSalvageChatCard.js';
import { buildCraftingChatContent } from '../src/systems/CraftingChatCard.js';
import { buildGatheringChatContent } from '../src/systems/GatheringChatCard.js';
import { buildSalvageChatContent } from '../src/systems/SalvageChatCard.js';

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

// ---------------------------------------------------------------------------
// The shared fired-complications block, across all four builders (issue 1286)
// ---------------------------------------------------------------------------

/** The four builders, keyed by the card each one draws. */
const BUILDERS = Object.freeze({
  crafting: buildCraftingChatContent,
  salvage: buildSalvageChatContent,
  gathering: buildGatheringChatContent,
  bulk: buildBulkSalvageChatContent,
});

/**
 * One model per builder, none of which mentions complications.
 *
 * These are the exact inputs the goldens below were captured from, against the build at
 * this branch's base commit. Keeping the pair adjacent is the whole point: a golden whose
 * model has drifted proves nothing.
 */
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
 * The markup each builder produced for the model above BEFORE the complications block
 * existed, captured from the base build under the identity localizer.
 *
 * This is the acceptance criterion "a component with no complications produces a chat card
 * string identical to the pre-change build, for all four builders", stated as the only
 * thing that can actually falsify it. A structural assertion — "the card contains no
 * complications section" — would still pass if the block had been threaded in a way that
 * moved a section, changed a class or dropped a filter, which is exactly the class of
 * regression byte-identity is being demanded against.
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

/**
 * Every attribute in `html` whose value is NOT double-quoted, by name.
 *
 * Hand-walked rather than regex-scanned in one pass, because the interesting input is an
 * attribute VALUE that itself contains `foo='bar'` — a naive scan reports that as an
 * unquoted attribute and the guard then fails on the very case it exists to bless. After
 * a `name=` this skips to the closing double quote before looking for the next attribute.
 */
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

/**
 * A complication authored by someone hostile. Fabricate imports third-party crafting
 * systems, so this is the threat model rather than a typo: the definition arrives as data
 * and a `visible` complication puts its `name` and free-prose `description` on a card
 * every player at the table renders.
 */
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
    // verbatim. That is SAFE only because every attribute the block writes is
    // double-quoted, which is what the scan below establishes rather than assumes.
    assert.ok(html.includes(`it's a trap`), 'a single quote in prose is left alone');
    assert.ok(
      html.includes(`data-fabricate-complication-severity="minor' onmouseover='alert(1)"`),
      'the single-quoted payload is contained by the double quotes around it'
    );
    assert.deepEqual(unquotedAttributes(html), [], 'no attribute anywhere is left unquoted');
  });
}
