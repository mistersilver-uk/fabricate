/**
 * RequirementRail + RequirementTile (issue 917).
 *
 * The claims under test are the ones a reviewer cannot check by reading: that the
 * rail is a DISCLOSURE (fixed slots expose a name without promising a selection,
 * selectable slots carry aria-expanded/aria-controls over the whole column), that
 * exactly one chooser reads as open, and that a read-only rail offers no controls
 * at all.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { installLangBackedI18n } from '../helpers/langBackedI18n.js';
import { buildRequirementSlots } from '../../src/ui/svelte/util/requirementSlots.js';
import {
  SPENDABLE_GOLD_UNITS,
  UNSPENDABLE_GOLD_UNITS,
  makeCurrencyRecipeManager,
  currencyOption,
} from '../helpers/currencyRequirementFixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RAIL_PATH = 'src/ui/svelte/apps/crafting/detail/RequirementRail.svelte';

// ---------------------------------------------------------------------------
// Issue 1493 — the currency fixture is evaluated END TO END, not hand-written.
//
// The acceptance criterion is explicitly ONE test: a real `evaluateCraftability`
// result, projected by the real `buildRequirementSlots`, rendered by the real rail. A
// slot literal with an `issue` typed into it proves the projection and the markup, but
// not that anything upstream ever produces the field — which is the whole capability.
//
// The Foundry globals and the manager import must therefore happen HERE, before the
// harness replaces `game` with its i18n stub in `before()`; the craftability is a plain
// object by then, so nothing below depends on these globals surviving.
// ---------------------------------------------------------------------------
globalThis.foundry = {
  utils: {
    randomID: () => 'fixed-id',
    getProperty: (object, path) =>
      String(path)
        .split('.')
        .reduce((value, key) => (value == null ? undefined : value[key]), object),
  },
};
globalThis.game = { user: { isGM: true }, fabricate: null };

const { RecipeManager } = await import('../../src/systems/RecipeManager.js');
const { Recipe } = await import('../../src/models/Recipe.js');

const CURRENCY_SYSTEM_ID = 'sys-1493-rail';

/**
 * Evaluate a two-requirement recipe — one held item, one 100 gp cost — against the
 * given world ladder, with a player carrying both the plank and a thousand gold.
 *
 * @param {object[]} units The world's currency ladder. Omitting `actorPath` is the
 *   misconfiguration under test: the unit exists but cannot be read off any actor.
 * @param {number} [gp] The purse the cost is evaluated against. The default is ten times
 *   the toll, because the misconfiguration case is only a defect for a player who could
 *   plainly pay; a poor purse is what distinguishes a genuine shortfall from it.
 */
function craftabilityFor(units, gp = 1000) {
  const manager = makeCurrencyRecipeManager(RecipeManager, {
    systemId: CURRENCY_SYSTEM_ID,
    units,
  });
  const recipe = new Recipe({
    name: 'Toll Bridge Plank',
    craftingSystemId: CURRENCY_SYSTEM_ID,
    ingredientSets: [
      {
        ingredientGroups: [
          { id: 'g-plank', name: 'Plank', options: [{ itemUuid: 'Item.plank', quantity: 2 }] },
          {
            id: 'g-toll',
            name: 'Toll',
            options: [currencyOption(100)],
          },
        ],
        essences: {},
      },
    ],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  const actor = {
    items: [
      {
        uuid: 'Item.plank',
        id: 'Item.plank',
        system: { quantity: 2 },
        flags: {},
        getFlag: () => undefined,
      },
    ],
    system: { currency: { gp } },
  };
  return manager.evaluateCraftability([actor], recipe, { craftingActor: actor });
}


const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-requirement-rail-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/requirementSlots.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/crafting/CraftingEssenceThumb.svelte',
    'src/ui/svelte/apps/crafting/detail/RequirementTile.svelte',
    'src/ui/svelte/apps/crafting/detail/RequirementRail.svelte',
  ],
  componentPath: RAIL_PATH,
});

const STATES = [
  { groupId: 'g-fixed', name: 'Iron', img: 'icons/iron.webp', need: 2, have: 2, satisfied: true },
  {
    groupId: 'g-choice',
    name: 'Red Herb',
    img: 'icons/herb.webp',
    need: 1,
    have: 0,
    satisfied: false,
    hasChoice: true,
    choiceCount: 3,
  },
  {
    groupId: 'g-radiant',
    name: 'Radiant',
    isEssence: true,
    icon: 'fa-solid fa-sun',
    colorToken: 'butter',
    need: 4,
    delivered: 2,
    owned: 6,
    satisfied: false,
  },
];

function slots(states = STATES) {
  return buildRequirementSlots({ ingredientStates: states });
}

function tilesIn(target) {
  return [...target.querySelectorAll('[data-requirement-slot]')];
}

describe('RequirementRail mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders nothing when the set has no requirements', async () => {
    const target = await harness.mount({ slots: [] });
    assert.ok(!target.querySelector('[data-recipe-section="requirement-rail"]'));
  });

  it('renders one slot per requirement in author order', async () => {
    const target = await harness.mount({ slots: slots() });
    assert.deepEqual(
      tilesIn(target).map((tile) => tile.getAttribute('data-slot-kind')),
      ['fixed', 'choice', 'essence']
    );
  });

  // A fixed slot is not selectable, so a tab or button role would promise a choice
  // the surface does not offer; an aria-label on a non-focusable span exposes nothing
  // at all, hence role="img".
  it('exposes a fixed slot as a labelled image, never as a control', async () => {
    const target = await harness.mount({ slots: slots() });
    const [fixed] = tilesIn(target);
    assert.equal(fixed.tagName, 'SPAN');
    assert.equal(fixed.getAttribute('role'), 'img');
    assert.ok(fixed.getAttribute('aria-label').includes('Iron'));
    assert.ok(!fixed.hasAttribute('aria-expanded'), 'and promises no disclosure');
  });

  it('exposes a choice or essence slot as a button with the disclosure contract', async () => {
    const target = await harness.mount({ slots: slots(), openSlotId: 'g-choice', panelId: 'panel-1' });
    const [, choice, essence] = tilesIn(target);

    assert.equal(choice.tagName, 'BUTTON');
    assert.equal(choice.getAttribute('aria-expanded'), 'true');
    assert.equal(choice.getAttribute('aria-controls'), 'panel-1');
    assert.equal(essence.getAttribute('aria-expanded'), 'false');
    assert.ok(!essence.hasAttribute('aria-controls'), 'a closed slot controls nothing');
  });

  it('opens exactly one chooser at a time', async () => {
    const target = await harness.mount({ slots: slots(), openSlotId: 'essence-pool' });
    const expanded = tilesIn(target).filter((tile) => tile.getAttribute('aria-expanded') === 'true');
    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].getAttribute('data-slot-kind'), 'essence');
  });

  // Open must NOT be a ring: the app already paints a 2px accent focus-visible
  // outline, so a ring would make "focused" and "open" indistinguishable.
  it('marks the open slot with the accent-soft fill class rather than a ring', async () => {
    const target = await harness.mount({ slots: slots(), openSlotId: 'g-choice' });
    const [, choice, essence] = tilesIn(target);
    assert.ok(choice.classList.contains('is-open'));
    assert.ok(!essence.classList.contains('is-open'));
  });

  it('paints the slot states from the matrix (met / partial / short)', async () => {
    const target = await harness.mount({
      slots: slots([
        STATES[0],
        STATES[1],
        { ...STATES[2], delivered: 0 },
        { ...STATES[2], groupId: 'g-shadow', name: 'Shadow', delivered: 4, satisfied: true },
      ]),
    });
    assert.deepEqual(
      tilesIn(target).map((tile) => tile.getAttribute('data-slot-state')),
      ['met', 'partial', 'short', 'met']
    );
  });

  it('renders the have/need pip from the delivered amount for an essence slot', async () => {
    const target = await harness.mount({ slots: slots() });
    const pips = tilesIn(target).map((tile) =>
      tile.querySelector('.requirement-slot-pip').textContent.trim()
    );
    assert.deepEqual(pips, ['2/2', '0/1', '2/4']);
  });

  it('tints an authored essence glyph through the shared tag palette', async () => {
    const target = await harness.mount({ slots: slots() });
    const essence = tilesIn(target)[2];
    const tile = essence.querySelector('.requirement-slot-tile');
    assert.match(tile.getAttribute('style'), /--fab-chip-color: var\(--fab-tag-butter\)/);
    assert.ok(essence.querySelector('.requirement-slot-glyph i').classList.contains('fa-sun'));
  });

  // One essence, ONE component. The rail used to inline its own glyph box while
  // CraftingEssenceThumb still rendered the same essence in the alternatives picker and
  // the shopping list, so one screen drew the same thing two ways. The tint survives the
  // component boundary because it is an inherited custom property on the ANCESTOR, which
  // is exactly why a second component was never needed to carry it.
  it('draws the essence glyph with the shared CraftingEssenceThumb', async () => {
    const target = await harness.mount({ slots: slots() });
    const glyph = tilesIn(target)[2].querySelector('.requirement-slot-glyph');
    assert.ok(glyph.classList.contains('crafting-essence-thumb'), 'the shared thumb renders it');
    // The smoke harness waits on `.requirement-slot-glyph`, so the hook must survive.
    const style = glyph.getAttribute('style');
    assert.match(style, /--crafting-essence-thumb-size:\s*44px/);
    // 44 * 0.42 rounds to the 18px the rail hard-coded before it shared this component.
    assert.match(style, /--crafting-essence-icon-size:\s*18px/);
    assert.match(style, /--crafting-essence-thumb-radius:\s*8px/);
  });

  // WCAG 2.5.3 Label in Name: the accessible name must CONTAIN the visible label, or
  // speech activation by the visible label fails. Labelling the button with the hint
  // sentence replaced "Pick for me" entirely.
  it('names Pick for me by its visible label and keeps the hint on the title', async () => {
    const target = await harness.mount({ slots: slots() });
    const wand = target.querySelector('[data-requirement-pick-for-me]');
    assert.ok(!wand.hasAttribute('aria-label'), 'the visible span is the accessible name');
    assert.match(wand.textContent.trim(), /Slots\.PickForMe$/, 'and it is the short label');
    assert.match(wand.getAttribute('title'), /Slots\.PickForMeHint/);
  });

  it('falls back to the theme accent for an essence with no authored colour', async () => {
    const target = await harness.mount({
      slots: slots([{ ...STATES[2], colorToken: null }]),
    });
    const tile = tilesIn(target)[0].querySelector('.requirement-slot-tile');
    assert.equal(tile.getAttribute('style'), '', 'no custom property, so the CSS default applies');
  });

  it('reports the opened slot id on click', async () => {
    const opened = [];
    const target = await harness.mount({ slots: slots(), onOpenSlot: (id) => opened.push(id) });
    tilesIn(target)[2].click();
    assert.deepEqual(opened, ['essence-pool']);
  });

  it('offers Pick for me while any selectable slot is unmet, and hides it once none is', async () => {
    const picked = [];
    const target = await harness.mount({ slots: slots(), onPickForMe: () => picked.push(true) });
    const wand = target.querySelector('[data-requirement-pick-for-me]');
    assert.ok(wand, 'the wand lives in the rail header, not the app footer');
    wand.click();
    assert.equal(picked.length, 1);

    const settled = await harness.setProps({
      slots: slots([
        STATES[0],
        { ...STATES[1], satisfied: true, have: 1 },
        { ...STATES[2], delivered: 4, satisfied: true },
      ]),
    });
    assert.ok(!settled.querySelector('[data-requirement-pick-for-me]'));
  });

  // A later step's rail, or one whose time gate is armed, describes a craft the
  // button will not fire, so it must offer nothing to press.
  it('renders read-only with no controls and an explanation', async () => {
    const target = await harness.mount({ slots: slots(), readOnly: true, openSlotId: 'g-choice' });
    assert.equal(target.querySelectorAll('button').length, 0, 'no control anywhere in the rail');
    assert.deepEqual(
      tilesIn(target).map((tile) => tile.getAttribute('role')),
      ['img', 'img', 'img']
    );
    assert.ok(target.querySelector('[data-requirement-rail-readonly]'));
  });

  it('announces the open chooser through its own live region, not the stage list one', async () => {
    const target = await harness.mount({ slots: slots(), openSlotId: 'g-choice' });
    const live = target.querySelector('[data-requirement-rail-live]');
    assert.equal(live.getAttribute('aria-live'), 'polite');
    assert.equal(live.getAttribute('role'), 'status');
    assert.match(live.textContent, /Slots\.NowShowing/);

    // Auto-advance elsewhere in the rail changes the text, which is what a screen
    // reader hears; focus is never moved.
    const advanced = await harness.setProps({ slots: slots(), openSlotId: 'essence-pool' });
    assert.match(advanced.querySelector('[data-requirement-rail-live]').textContent, /Radiant/);
  });

  it('lets an explicit announcement win over the open-chooser sentence', async () => {
    const target = await harness.mount({
      slots: slots(),
      openSlotId: 'g-choice',
      announcement: 'Picked for you.',
    });
    assert.equal(target.querySelector('[data-requirement-rail-live]').textContent.trim(), 'Picked for you.');
  });

  // -------------------------------------------------------------------------
  // Issue 1493. Every case below renders a REAL craftability through the real
  // projection: `buildRequirementSlots(evaluateCraftability(fixture))`.
  // -------------------------------------------------------------------------

  it('draws no have/need pip on a currency tile, affordable or not', async () => {
    for (const ladder of [SPENDABLE_GOLD_UNITS, UNSPENDABLE_GOLD_UNITS]) {
      const target = await harness.mount({ slots: buildRequirementSlots(craftabilityFor(ladder)) });
      const [plank, toll] = tilesIn(target);
      assert.ok(plank.querySelector('.requirement-slot-pip'), 'an item tile keeps its ratio');
      // `have` is always 0 and `need` is a PRICE, so "0/100" would state a shortfall a
      // player holding 1000 gp does not have. assert.ok(!el) rather than an equality
      // check on the element, which OOMs happy-dom.
      assert.ok(!toll.querySelector('.requirement-slot-pip'), 'a currency tile draws none');
      assert.match(toll.querySelector('.requirement-slot-caption').textContent, /100 gp/);
      harness.remount();
    }
  });

  it('names a currency tile by its cost and verdict, never by a have/need ratio', async () => {
    const target = await harness.mount({
      slots: buildRequirementSlots(craftabilityFor(SPENDABLE_GOLD_UNITS)),
    });
    const label = tilesIn(target)[1].getAttribute('aria-label');
    // The pip is aria-hidden, so this sentence is what a screen-reader user actually
    // receives. Left on the shared TileMet/TileShort keys it read "100 gp is ready with
    // 0 of 100" — the removed pip surviving in the one place it is still spoken.
    assert.ok(label.includes('100 gp'), 'the cost is named');
    assert.ok(!/have/i.test(label), 'and no held count is interpolated into it');
    assert.ok(!/\bneed\b/i.test(label));
  });

  it('names an unresolvable currency tile by its reason, never by a shortfall', async () => {
    const target = await harness.mount({
      slots: buildRequirementSlots(craftabilityFor(UNSPENDABLE_GOLD_UNITS)),
    });
    const label = tilesIn(target)[1].getAttribute('aria-label');
    // The player is carrying 1000 gp. Telling them they cannot afford 100 gp is the
    // original defect wearing the redesign's clothes.
    assert.ok(label.includes('100 gp'));
    assert.match(label, /Currency configuration is invalid/);
    assert.ok(!/afford|pay/i.test(label), 'and it makes no claim about their money');
  });

  it('renders the world currency reason ONCE for the rail, not once per tile', async () => {
    const craftability = craftabilityFor(UNSPENDABLE_GOLD_UNITS);
    // Two currency requirements from one broken world: the reason is a property of the
    // configuration, so repeating it per tile would assert it of each.
    const doubled = {
      ...craftability,
      ingredientStates: [
        ...craftability.ingredientStates,
        { ...craftability.ingredientStates[1], groupId: 'g-toll-2' },
      ],
    };
    const target = await harness.mount({ slots: buildRequirementSlots(doubled) });

    const notes = target.querySelectorAll('[data-requirement-rail-issue]');
    assert.equal(notes.length, 1, 'one reason for the whole rail');
    assert.match(notes[0].textContent, /Currency configuration is invalid/);
    assert.match(notes[0].textContent, /actor data path/, 'and it names what is unavailable');
    // Before the tiles, so the cause is reached before the requirements it explains.
    assert.equal(
      notes[0].compareDocumentPosition(target.querySelector('[data-requirement-rail-slots]')) &
        4 /* DOCUMENT_POSITION_FOLLOWING */,
      4
    );
  });

  // -------------------------------------------------------------------------
  // Issue 1493 (revision 2) — every currency accessible name is on a KEYED path, and
  // the English fallbacks byte-match the shipped copy.
  // -------------------------------------------------------------------------

  it('reads the unresolvable currency name through its localization key', async () => {
    // Proves the sentence is keyed rather than composed. The harness returns the key for
    // a missing string, so the fallback would render either way and the DOM alone cannot
    // tell the two apart — a resolving `format` is what distinguishes them.
    const original = globalThis.game.i18n.format;
    globalThis.game.i18n.format = (key, data) =>
      key === 'FABRICATE.App.Crafting.Slots.TileCurrencyUnavailable'
        ? `TRANSLATED ${data.name} :: ${data.issue}`
        : `${key}:${JSON.stringify(data)}`;
    try {
      const target = await harness.mount({
        slots: buildRequirementSlots(craftabilityFor(UNSPENDABLE_GOLD_UNITS)),
      });
      const label = tilesIn(target)[1].getAttribute('aria-label');
      assert.match(label, /^TRANSLATED 100 gp :: /, 'the key owns the sentence, not a join');
      assert.match(label, /Currency configuration is invalid/, 'and the reason is interpolated');
    } finally {
      globalThis.game.i18n.format = original;
    }
  });

  it('renders no reason line for a rail whose currency resolves', async () => {
    const target = await harness.mount({
      slots: buildRequirementSlots(craftabilityFor(SPENDABLE_GOLD_UNITS)),
    });
    assert.ok(!target.querySelector('[data-requirement-rail-issue]'));
  });

  it('keeps stable geometry for a long localized requirement name', async () => {
    const target = await harness.mount({
      slots: slots([
        { ...STATES[0], name: 'Exquisitely Refined Moonsilver Filigree Wire, Half-Drawn' },
      ]),
    });
    const caption = target.querySelector('.requirement-slot-caption');
    assert.match(caption.textContent, /Moonsilver/);
    // The tile column is fixed width and the caption ellipsises rather than growing it.
    assert.ok(tilesIn(target)[0].classList.contains('requirement-slot'));
  });
});

// ---------------------------------------------------------------------------
// Issue 1493 (revision 3) — the rail's currency copy, read from the REAL `lang/en.json`.
//
// The component carries no English fallbacks for these keys. Every one of them ships in
// this same change and Foundry merges `en` under every other language, so a fallback could
// only ever be a second wording of the same sentence that nothing forces to agree with the
// first — and the guard for the pair covered two of the five keys, so drifting the other
// three changed nothing anybody could see.
//
// Backing `game.i18n` with the shipped file instead makes the DOM itself the guard: a
// renamed key renders as its dotted self, and reworded copy renders the new words. Both
// fail the literals below.
// ---------------------------------------------------------------------------

describe('RequirementRail currency copy (issue 1493)', () => {
  let restoreI18n = () => {};

  before(async () => {
    await harness.setup();
    restoreI18n = installLangBackedI18n(repoRoot);
  });
  after(() => {
    restoreI18n();
    harness.teardown();
  });
  afterEach(harness.remount);

  async function tollLabel(units, gp) {
    const target = await harness.mount({ slots: buildRequirementSlots(craftabilityFor(units, gp)) });
    return tilesIn(target)[1].getAttribute('aria-label');
  }

  it('speaks the shipped sentence for a cost the player can pay', async () => {
    assert.equal(await tollLabel(SPENDABLE_GOLD_UNITS, 1000), '100 gp. You can afford this.');
  });

  it('speaks the shipped sentence for a cost the player cannot pay', async () => {
    assert.equal(await tollLabel(SPENDABLE_GOLD_UNITS, 3), "100 gp. You can't afford this.");
  });

  it('speaks the reason, not a verdict, for a cost the world cannot resolve', async () => {
    const label = await tollLabel(UNSPENDABLE_GOLD_UNITS, 1000);
    assert.match(label, /^100 gp\. Currency configuration is invalid/);
    assert.ok(!/afford/i.test(label), 'a player holding 1000 gp is not short of 100 gp');
  });

  // The reason alone is an engine sentence. "Currency unit "Gold" is missing an actor data
  // path" tells a PLAYER nothing they can act on — not whose fault it is, not what to do —
  // and this rail is the primary pre-craft discovery surface.
  it('follows the reason with a directive naming who fixes it and where', async () => {
    const target = await harness.mount({
      slots: buildRequirementSlots(craftabilityFor(UNSPENDABLE_GOLD_UNITS, 1000)),
    });
    const note = target.querySelector('[data-requirement-rail-issue]');
    const text = note.textContent.replace(/\s+/g, ' ').trim();

    assert.match(text, /^Currency configuration is invalid/, 'the reason leads');
    assert.ok(
      text.endsWith(
        "Ask your GM to finish the world's currency setup (Crafting Systems → World → Currency)."
      ),
      `the directive follows it in the same paragraph: "${text}"`
    );
    assert.equal(
      target.querySelectorAll('[data-requirement-rail-issue]').length,
      1,
      'reason and directive are ONE statement to this reader, so they are one paragraph'
    );
  });

  it('renders no directive for a rail whose currency resolves', async () => {
    const target = await harness.mount({
      slots: buildRequirementSlots(craftabilityFor(SPENDABLE_GOLD_UNITS, 1000)),
    });
    assert.ok(!target.querySelector('[data-requirement-rail-issue]'));
  });

  // Tone is not decoration here: this rail's red already means "you cannot afford this",
  // so painting a GM setup problem the same colour tells the player they did it.
  it('paints the reason in the warning tone rather than the danger one', () => {
    const source = readFileSync(resolve(repoRoot, RAIL_PATH), 'utf8');
    const block = source.match(/\.requirement-rail-issue\s*{([^}]*)}/)?.[1];
    assert.ok(block, 'the reason line must declare its own colour');
    assert.match(block, /color:\s*var\(--fab-warning-text\)/);
    assert.ok(!block.includes('--fab-danger'), 'the fault is not the player\'s');
  });
});
