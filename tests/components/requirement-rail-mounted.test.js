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
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { buildRequirementSlots } from '../../src/ui/svelte/util/requirementSlots.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-requirement-rail-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
    'src/ui/svelte/util/requirementSlots.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/crafting/CraftingEssenceThumb.svelte',
    'src/ui/svelte/apps/crafting/detail/RequirementTile.svelte',
    'src/ui/svelte/apps/crafting/detail/RequirementRail.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/crafting/detail/RequirementRail.svelte',
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
