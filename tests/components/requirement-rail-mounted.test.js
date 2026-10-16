/** RequirementRail over the shared RequirementChooser (issues 917 and 1518). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRawSnippet } from 'svelte';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { installLangBackedI18n } from '../helpers/langBackedI18n.js';
import { buildRequirementSlots } from '../../src/ui/svelte/util/requirementSlots.js';
import { essenceChoiceCraftability } from '../helpers/crafting-fixtures.js';
import {
  SPENDABLE_GOLD_UNITS,
  UNSPENDABLE_GOLD_UNITS,
  makeCurrencyRecipeManager,
  currencyOption,
} from '../helpers/currencyRequirementFixtures.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RAIL_PATH = 'src/ui/svelte/apps/crafting/detail/RequirementRail.svelte';

// Issue 1493 — the currency fixture is evaluated END TO END, not hand-written.
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
 * Evaluate a two-requirement recipe — one held item, one 100 gp cost.
 *
 * @param {object[]} units The world's currency ladder. Omitting `actorPath` is the
 * @param {number} [gp] The purse the cost is evaluated against. The default is ten times
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
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/craftingArtResolution.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  'src/ui/svelte/util/foundryIconCatalogue.json',
    'src/ui/svelte/util/requirementSlots.js',
    'src/ui/svelte/util/craftingQuantityReading.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/SlotTile.svelte',
    'src/ui/svelte/components/RequirementChooser.svelte',
    'src/ui/svelte/components/Well.svelte',
    // The shared eyebrow (issue 1505). The rail's header title is a `<Kicker>`.
    'src/ui/svelte/components/Kicker.svelte',
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

/** The choice slot's option entry: a met item, a short item and an affordable cost. */
const HERBS = {
  kind: 'option',
  groupId: 'g-choice',
  groupName: 'Herb',
  selectedOptionIndex: 1,
  options: [
    { optionIndex: 0, name: 'Red Herb', img: 'icons/red.webp', need: 1, have: 2, satisfied: true },
    { optionIndex: 1, name: 'Blue Herb', img: null, need: 1, have: 0, satisfied: false },
    {
      optionIndex: 2,
      name: '12 gp',
      isCurrency: true,
      costLabel: '12 gp',
      affordable: true,
      satisfied: true,
    },
  ],
};

/** The rail with the choice slot open and picked from, so the default is not a to-do. */
function openChoice(props = {}) {
  return harness.mount({
    slots: buildRequirementSlots({ ingredientStates: STATES }, { chosenGroupIds: ['g-choice'] }),
    choices: [HERBS],
    openSlotId: 'g-choice',
    panelId: 'panel-1',
    ...props,
  });
}

function alternativesIn(target) {
  return [...target.querySelectorAll('[data-requirement-alternative]')];
}

function tilesIn(target) {
  return [...target.querySelectorAll('[data-requirement-slot]')];
}

/** A slot's accessible name: the button's own, or the labelled image inside a fixed slot. */
function nameOf(tile) {
  return (
    tile.getAttribute('aria-label') ?? tile.querySelector('[role="img"]').getAttribute('aria-label')
  );
}

/** A stand-in for the panel content the composition root supplies. */
const PANEL = createRawSnippet(() => ({ render: () => '<p data-test-panel>panel</p>' }));

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

  // A fixed slot is not selectable.
  it('exposes a fixed slot as a labelled image, never as a control', async () => {
    const target = await harness.mount({ slots: slots() });
    const [fixed] = tilesIn(target);
    assert.notEqual(fixed.tagName, 'BUTTON');
    assert.ok(nameOf(fixed).includes('Iron'), 'the shared tile is the labelled image');
    assert.ok(!fixed.hasAttribute('aria-expanded'), 'and promises no disclosure');
  });

  it('exposes a choice or essence slot as a button with the disclosure contract', async () => {
    const target = await harness.mount({
      slots: slots(),
      openSlotId: 'g-choice',
      panelId: 'panel-1',
      chooser: PANEL,
    });
    const [, choice, essence] = tilesIn(target);

    assert.equal(choice.tagName, 'BUTTON');
    assert.equal(choice.getAttribute('aria-expanded'), 'true');
    assert.equal(choice.getAttribute('aria-controls'), 'panel-1');
    assert.equal(essence.getAttribute('aria-expanded'), 'false');
    assert.ok(!essence.hasAttribute('aria-controls'), 'a closed slot controls nothing');

    const panel = target.querySelector('#panel-1');
    assert.equal(panel.getAttribute('role'), 'region', 'a roleless labelled element exposes nothing');
    assert.equal(panel.getAttribute('aria-labelledby'), choice.id, 'and it is named by its tile');
  });

  it('opens no panel, and points at none, when the open slot has nothing to show', async () => {
    const target = await harness.mount({ slots: slots(), openSlotId: 'g-choice', panelId: 'panel-1' });
    const [, choice] = tilesIn(target);
    assert.equal(choice.getAttribute('aria-expanded'), 'true');
    assert.ok(!choice.hasAttribute('aria-controls'));
    assert.ok(!target.querySelector('#panel-1'));
  });

  it('opens exactly one chooser at a time', async () => {
    const target = await harness.mount({ slots: slots(), openSlotId: 'essence-pool' });
    const expanded = tilesIn(target).filter((tile) => tile.getAttribute('aria-expanded') === 'true');
    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].getAttribute('data-slot-kind'), 'essence');
  });

  // Open must NOT be a ring: the app already paints a 2px accent focus-visible
  // outline, so a ring would make "focused" and "open" indistinguishable.
  it('marks the open slot with the pressed fill class rather than a ring', async () => {
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

  // An unchosen choice is a to-do, never an error (ui-crafting-app, Requirement Rail).
  it('paints an unchosen choice slot open and a partly delivered essence partial', async () => {
    const target = await harness.mount({ slots: slots() });
    assert.deepEqual(
      tilesIn(target).map((tile) => tile.querySelector('.fab-slot-tile-shell').dataset.slotState),
      ['met', 'open', 'partial']
    );
    const essence = tilesIn(target)[2].querySelector('.fab-slot-tile');
    assert.ok(essence.classList.contains('is-partial'), 'the essence tile takes the partial face');
    assert.ok(!essence.classList.contains('is-short'), 'and is never painted short');
    const chosen = await harness.setProps({
      slots: buildRequirementSlots({ ingredientStates: STATES }, { chosenGroupIds: ['g-choice'] }),
    });
    assert.equal(
      tilesIn(chosen)[1].querySelector('.fab-slot-tile-shell').dataset.slotState,
      'short',
      'a choice the player picked and cannot meet is short'
    );
  });

  it('renders the have/need pip from the delivered amount for an essence slot', async () => {
    const target = await harness.mount({ slots: slots() });
    const pips = tilesIn(target).map((tile) =>
      tile.querySelector('.fab-slot-pip').textContent.trim()
    );
    assert.deepEqual(pips, ['2/2', '0/1', '2/4']);
  });

  // ISSUE 1506 MOVED THE VEHICLE, not the behaviour. The authored key used to reach the glyph as
  // a `--fab-chip-color` inherited from the slot wrapper, because the retired essence tile took
  // no colour argument. The shared tile takes a `tint` PROP, so the property is emitted by the
  // tile itself and the wrapper carries no style at all.
  it('tints an authored essence glyph through the shared tag palette', async () => {
    const target = await harness.mount({ slots: slots() });
    const essence = tilesIn(target)[2];
    const glyph = essence.querySelector('[data-medallion="glyph"]');
    assert.equal(glyph.dataset.medallionTint, 'butter', 'the authored key reaches the tile');
    assert.match(glyph.getAttribute('style'), /--fab-medallion-tint:\s*var\(--fab-tag-butter\)/);
    assert.ok(glyph.querySelector('i').classList.contains('fa-sun'));
  });

  // One essence, ONE component — and since issue 1506 one component for the whole app.
  it('draws the essence glyph with the shared tile', async () => {
    const target = await harness.mount({ slots: slots() });
    const glyph = tilesIn(target)[2].querySelector('[data-medallion]');
    assert.ok(Boolean(glyph), 'the shared tile renders it, and the smoke harness can find it');
    const style = glyph.getAttribute('style');
    assert.match(style, /width:\s*56px;\s*height:\s*56px/, 'the slot tile is the 56px rung');
    assert.match(style, /--fab-medallion-glyph:\s*19px/);
  });

  // WCAG 2.5.3 Label in Name: the accessible name must CONTAIN the visible label.
  it('names Pick for me by its visible label and keeps the hint on the title', async () => {
    const target = await harness.mount({ slots: slots() });
    const wand = target.querySelector('[data-requirement-pick-for-me]');
    assert.ok(!wand.hasAttribute('aria-label'), 'the visible span is the accessible name');
    assert.ok(wand.matches('.fab-manager-button.is-ghost'), 'a secondary verb, so a ghost');
    assert.match(wand.textContent.trim(), /Slots\.PickForMe$/, 'and it is the short label');
    assert.match(wand.getAttribute('title'), /Slots\.PickForMeHint/);
  });

  it('falls back to the theme accent for an essence with no authored colour', async () => {
    const target = await harness.mount({
      slots: slots([{ ...STATES[2], colorToken: null }]),
    });
    const glyph = tilesIn(target)[0].querySelector('[data-medallion="glyph"]');
    assert.ok(
      !glyph.hasAttribute('data-medallion-tint'),
      'no authored key, so the tile emits no tint hook'
    );
    assert.ok(
      !/--fab-medallion-tint/.test(glyph.getAttribute('style')),
      'and no custom property, so the primitive own `var()` fallback paints the theme accent'
    );
  });

  // Issue 2142: the caption states the alternative count whichever option is chosen.
  it('captions a choice slot whose chosen option is an essence by its alternatives', async () => {
    const restoreI18n = installLangBackedI18n(repoRoot);
    try {
      const target = await harness.mount({
        slots: buildRequirementSlots(essenceChoiceCraftability()),
        openSlotId: 'g-primal',
      });
      const [tile] = tilesIn(target);
      assert.equal(tile.getAttribute('aria-expanded'), 'true');
      assert.equal(
        tile.querySelector('.fab-requirement-slot-affordance').textContent.trim(),
        '2 alternatives'
      );
    } finally {
      restoreI18n();
    }
  });

  // An unchosen choice and a short slot both read 0/N, so the to-do is stated in words.
  it('captions an unchosen choice with its to-do, and a chosen one with its alternatives', async () => {
    const restoreI18n = installLangBackedI18n(repoRoot);
    try {
      const caption = (target) =>
        tilesIn(target)[1].querySelector('.fab-requirement-slot-affordance').textContent.trim();
      const target = await harness.mount({ slots: slots() });
      assert.equal(caption(target), 'Choose 1 of 3');
      const chosen = await harness.setProps({
        slots: buildRequirementSlots(
          { ingredientStates: STATES },
          { chosenGroupIds: ['g-choice'] }
        ),
      });
      assert.equal(caption(chosen), '3 alternatives', 'a picked choice is no longer a to-do');
    } finally {
      restoreI18n();
    }
  });

  it('draws the open choice slot’s options as chooser tiles carrying the smoke harness hooks', async () => {
    const target = await openChoice();
    const tiles = alternativesIn(target);
    assert.deepEqual(
      tiles.map((tile) => tile.getAttribute('data-option-index')),
      ['0', '1', '2']
    );
    assert.ok(tiles.every((tile) => tile.classList.contains('crafting-alt-option')));
    assert.ok(target.querySelector(':scope #panel-1 .fab-requirement-alternatives'), 'inside the panel');
    assert.deepEqual(
      tiles.map((tile) => tile.querySelector('.fab-slot-pip').textContent.trim()),
      ['2/1', '0/1', '12 gp'],
      'an item states held against needed, and a cost states its price'
    );
    assert.deepEqual(
      tiles.map((tile) => tile.querySelector('button').getAttribute('aria-pressed')),
      ['false', 'true', 'false'],
      'the option the craft will use is pressed'
    );
  });

  it('routes a pressed alternative to onChooseOption with its group and option index', async () => {
    const chosen = [];
    const target = await openChoice({
      onChooseOption: (groupId, choice) => {
        chosen.push([groupId, choice]);
      },
    });
    alternativesIn(target)[0].querySelector('button').click();
    alternativesIn(target)[2].querySelector('button').click();
    assert.deepEqual(chosen, [
      ['g-choice', { optionIndex: 0 }],
      ['g-choice', { optionIndex: 2 }],
    ]);
  });

  it('states a short alternative in visible words its tile is described by', async () => {
    const target = await openChoice();
    const [met, short, coin] = alternativesIn(target).map((tile) => tile.querySelector('button'));
    const reading = target.querySelector('[data-requirement-shortfall="1"]');
    assert.match(reading.textContent, /Slots\.TileShort/);
    assert.match(reading.textContent, /"name":"Blue Herb","have":0,"need":1/);
    assert.equal(short.getAttribute('aria-describedby'), reading.id);
    assert.match(short.getAttribute('aria-label'), /Io\.ChooseOption:\{"name":"Blue Herb"\}/);
    assert.match(met.getAttribute('aria-label'), /Slots\.TileMet:.*"have":2,"need":1/);
    assert.match(coin.getAttribute('aria-label'), /Slots\.TileCurrencyMet:\{"name":"12 gp"/);
    assert.equal(target.querySelectorAll('[data-requirement-shortfall]').length, 1);
  });

  // An unchosen choice is a to-do: a ticked default would contradict its open face.
  it('presses no alternative on a choice the player has not picked from', async () => {
    const target = await openChoice({ slots: slots() });
    const pressed = target.querySelectorAll(':scope [data-requirement-alternative] [aria-pressed="true"]');
    assert.equal(pressed.length, 0);
  });

  it('offers alternatives only for the open slot, and none on a read-only rail', async () => {
    const closed = await openChoice({ openSlotId: 'essence-pool' });
    assert.equal(alternativesIn(closed).length, 0);
    harness.remount();
    const inert = await openChoice({ readOnly: true });
    assert.equal(alternativesIn(inert).length, 0);
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

  // A later step's rail, or one whose time gate is armed.
  it('renders read-only with no controls and an explanation', async () => {
    const target = await harness.mount({ slots: slots(), readOnly: true, openSlotId: 'g-choice' });
    assert.equal(target.querySelectorAll('button').length, 0, 'no control anywhere in the rail');
    assert.equal(tilesIn(target).filter((tile) => tile.querySelector('[role="img"]')).length, 3);
    assert.ok(target.querySelector('[data-requirement-rail-readonly]'));
  });

  it('announces the open chooser through its own live region, not the stage list one', async () => {
    const target = await harness.mount({ slots: slots(), openSlotId: 'g-choice' });
    const live = target.querySelector('[data-requirement-rail-live]');
    assert.equal(live.getAttribute('aria-live'), 'polite');
    assert.equal(live.getAttribute('role'), 'status');
    assert.match(live.textContent, /Slots\.NowShowing/);

    // Auto-advance elsewhere in the rail changes the text.
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

  // Issue 1493. Every case below renders a REAL craftability through the real
  // projection: `buildRequirementSlots(evaluateCraftability(fixture))`.

  it('draws no have/need pip on a currency tile, affordable or not', async () => {
    for (const ladder of [SPENDABLE_GOLD_UNITS, UNSPENDABLE_GOLD_UNITS]) {
      const target = await harness.mount({ slots: buildRequirementSlots(craftabilityFor(ladder)) });
      const [plank, toll] = tilesIn(target);
      assert.ok(plank.querySelector('.fab-slot-pip'), 'an item tile keeps its ratio');
      // `have` is always 0 and `need` is a PRICE.
      assert.ok(!toll.querySelector('.fab-slot-pip'), 'a currency tile draws none');
      assert.match(toll.querySelector('.fab-slot-caption').textContent, /100 gp/);
      harness.remount();
    }
  });

  it('names a currency tile by its cost and verdict, never by a have/need ratio', async () => {
    const target = await harness.mount({
      slots: buildRequirementSlots(craftabilityFor(SPENDABLE_GOLD_UNITS)),
    });
    const label = nameOf(tilesIn(target)[1]);
    // This sentence is what a screen-reader user receives. Left on the shared
    // TileMet/TileShort keys it read "100 gp is ready with 0 of 100".
    assert.ok(label.includes('100 gp'), 'the cost is named');
    assert.ok(!/have/i.test(label), 'and no held count is interpolated into it');
    assert.ok(!/\bneed\b/i.test(label));
  });

  it('names an unresolvable currency tile by its reason, never by a shortfall', async () => {
    const target = await harness.mount({
      slots: buildRequirementSlots(craftabilityFor(UNSPENDABLE_GOLD_UNITS)),
    });
    const label = nameOf(tilesIn(target)[1]);
    // The player is carrying 1000 gp. Telling them they cannot afford 100 gp is the
    // original defect wearing the redesign's clothes.
    assert.ok(label.includes('100 gp'));
    assert.match(label, /Currency configuration is invalid/);
    assert.ok(!/afford|pay/i.test(label), 'and it makes no claim about their money');
  });

  it('renders the world currency reason ONCE for the rail, not once per tile', async () => {
    const craftability = craftabilityFor(UNSPENDABLE_GOLD_UNITS);
    // Two currency requirements from one broken world.
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

  // Issue 1493 (revision 2) — every currency accessible name is on a KEYED path.

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
      const label = nameOf(tilesIn(target)[1]);
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
    const caption = target.querySelector('.fab-slot-caption');
    assert.match(caption.textContent, /Moonsilver/);
    // The shared tile's shell is a fixed 56px column and its caption clamps rather than growing it.
    assert.ok(Boolean(caption.closest('.fab-slot-tile-shell')));
  });
});

// Issue 1493 (revision 3) — the rail's currency copy, read from the REAL `lang/en.json`.

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
    return nameOf(tilesIn(target)[1]);
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
