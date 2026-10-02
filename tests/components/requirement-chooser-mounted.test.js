/** RequirementChooser: the shared player-side requirement chooser (issue 1518). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createRawSnippet } from 'svelte';

import { injectedCss } from '../helpers/chipPaint.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-requirement-chooser-',
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/SlotTile.svelte',
    'src/ui/svelte/components/RequirementChooser.svelte',
  ],
  componentPath: 'src/ui/svelte/components/RequirementChooser.svelte',
  rootClass: 'fabricate-app',
});

const OAK = {
  id: 'oak',
  name: 'Oak Haft',
  label: 'Oak Haft, you hold 12 of 2',
  icon: 'fas fa-leaf',
  pip: '12/2',
  selected: true,
  short: false,
};
const BOG = {
  id: 'bog',
  name: 'Bog Oak',
  label: 'Bog Oak, you hold 1 of 2',
  icon: 'fas fa-leaf',
  pip: '1/2',
  selected: false,
  short: true,
  reading: 'Bog Oak: you hold 1 and this needs 2.',
};

// A slot id on a fixed slot, so its kind alone is what keeps it from opening.
const FIXED = {
  key: 'g-iron',
  slotId: 'g-iron',
  kind: 'fixed',
  state: 'met',
  name: 'Iron',
  label: 'Iron is ready with 2 of 2.',
  icon: 'fas fa-cube',
  pip: '2/2',
};
const CHOICE = {
  key: 'g-haft',
  slotId: 'g-haft',
  kind: 'choice',
  state: 'partial',
  name: 'Hardwood',
  label: 'Hardwood has 0 of 2 so far.',
  icon: 'fas fa-leaf',
  pip: '0/2',
  affordance: '2 alternatives',
  tileId: 'tile-haft',
  alternatives: [OAK, BOG],
};
const ESSENCE = {
  key: 'g-vitality',
  slotId: 'pool',
  kind: 'essence',
  state: 'short',
  name: 'Vitality',
  label: 'Vitality needs 4 and you have 0.',
  icon: 'fas fa-flask',
  tint: 'sage',
  pip: '0/4',
  tileId: 'tile-vitality',
};
const SLOTS = [FIXED, CHOICE, ESSENCE];

function slotsIn(target) {
  return [...target.querySelectorAll('[data-requirement-slot]')];
}

/** The face the shared tile paints a slot with. */
function paintOf(slot) {
  return slot.querySelector('.fab-slot-tile-shell').dataset.slotState;
}

function alternativesIn(target) {
  return [...target.querySelectorAll('[data-requirement-alternative]')];
}

function expandedIn(target) {
  return slotsIn(target).filter((slot) => slot.getAttribute('aria-expanded') === 'true');
}

/** A caller panel that states which slot it was rendered for. */
const POOL = createRawSnippet((slot) => ({
  render: () => `<p data-test-pool>${slot().slotId}</p>`,
}));

describe('RequirementChooser mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('draws each kind: a fixed slot is a labelled image, a choice or essence slot a button', async () => {
    const target = await harness.mount({ slots: SLOTS });
    const [fixed, choice, essence] = slotsIn(target);

    assert.deepEqual(
      slotsIn(target).map((slot) => slot.getAttribute('data-slot-kind')),
      ['fixed', 'choice', 'essence']
    );
    assert.notEqual(fixed.tagName, 'BUTTON');
    assert.equal(
      fixed.querySelector('[role="img"]').getAttribute('aria-label'),
      'Iron is ready with 2 of 2.'
    );
    for (const slot of [choice, essence]) {
      assert.equal(slot.tagName, 'BUTTON');
      assert.equal(slot.getAttribute('data-keyboard-focus'), 'true');
      assert.equal(slot.getAttribute('aria-expanded'), 'false');
    }
    assert.equal(choice.getAttribute('aria-label'), 'Hardwood has 0 of 2 so far.');
    assert.match(choice.querySelector('.fab-requirement-slot-affordance').textContent, /2 alt/);
    assert.ok(!essence.querySelector('.fab-requirement-slot-affordance'), 'none was supplied');
  });

  it('states each state, and paints an unchosen choice as open, never as short', async () => {
    const target = await harness.mount({ slots: SLOTS });
    assert.deepEqual(
      slotsIn(target).map((slot) => slot.getAttribute('data-slot-state')),
      ['met', 'partial', 'short']
    );
    // The shared tile's own state hook is what it paints from.
    assert.deepEqual(
      slotsIn(target).map((slot) => paintOf(slot)),
      ['met', 'open', 'short']
    );
    const pip = slotsIn(target)[1].querySelector('.fab-slot-pip');
    assert.ok(pip.classList.contains('is-candidate'), 'and its pill takes the accent, not success');
    assert.deepEqual(
      slotsIn(target).map((slot) => slot.querySelector('.fab-slot-pip').textContent.trim()),
      ['2/2', '0/2', '0/4']
    );
  });

  it('paints short for a chosen short choice and for a partly met essence', async () => {
    const target = await harness.mount({
      slots: [
        { ...CHOICE, state: 'short' },
        { ...ESSENCE, state: 'partial', pip: '2/4' },
      ],
    });
    assert.deepEqual(
      slotsIn(target).map((slot) => paintOf(slot)),
      ['short', 'short']
    );
    for (const slot of slotsIn(target)) {
      assert.ok(slot.querySelector('.fab-slot-pip').classList.contains('is-ratio'));
    }
  });

  it('draws no pip for a slot that supplies none', async () => {
    const target = await harness.mount({ slots: [{ ...FIXED, name: '100 gp', pip: '' }] });
    assert.ok(!target.querySelector('.fab-slot-pip'));
  });

  it('inks each pip with the on-colour of the fill it stands on', async () => {
    await harness.mount({ slots: SLOTS });
    const css = injectedCss();
    for (const [selector, ink] of [
      [String.raw`\.fab-slot-pip`, '--fab-on-success'],
      [String.raw`\.is-short\S* \.fab-slot-pip`, '--fab-on-danger'],
      [String.raw`\.fab-slot-pip\S*\.is-candidate`, '--fab-on-accent'],
    ]) {
      assert.match(
        css,
        new RegExp(String.raw`${selector}[^{,]*\{[^}]*[^-]color:\s*var\(${ink}\)`),
        `${selector} is inked ${ink}, the ink the solid chip takes on the same fill`
      );
    }
  });

  it('opens at most one slot, moving and closing it through openSlotId', async () => {
    const toggled = [];
    const target = await harness.mount({
      slots: SLOTS,
      openSlotId: 'g-haft',
      panel: POOL,
      onToggle: (slotId, open) => {
        toggled.push([slotId, open]);
      },
    });
    /** The caller adopts what the last press asked for. */
    const adopt = () => {
      const [slotId, open] = toggled.at(-1);
      return harness.setProps({ openSlotId: open ? slotId : null });
    };
    const [fixed, choice, essence] = slotsIn(target);
    assert.deepEqual(expandedIn(target), [choice]);
    assert.ok(choice.classList.contains('is-open'));
    assert.ok(!fixed.hasAttribute('aria-expanded'), 'a fixed slot never opens, whatever its id');

    essence.click();
    await adopt();
    assert.deepEqual(
      expandedIn(target),
      [slotsIn(target)[2]],
      'the open slot moved, it did not add'
    );
    assert.equal(target.querySelector('[data-requirement-panel]').dataset.requirementPanel, 'pool');
    assert.ok(Boolean(target.querySelector('[data-test-pool]')), 'the caller panel is kept');
    assert.ok(!target.querySelector('[data-requirement-alternative]'), 'the choice panel closed');

    slotsIn(target)[2].click();
    await adopt();
    assert.deepEqual(expandedIn(target), [], 'pressing the open tile closes it');
    assert.ok(!target.querySelector('[data-requirement-panel]'));
    assert.deepEqual(toggled, [
      ['pool', true],
      ['pool', false],
    ]);
  });

  // The caller owns the open slot: a press the caller refuses must not open a second chooser
  // beneath a panel the caller still draws for the first.
  it('opens nothing itself when the caller does not adopt a press', async () => {
    const toggled = [];
    const target = await harness.mount({
      slots: SLOTS,
      openSlotId: 'g-haft',
      panel: POOL,
      onToggle: (slotId, open) => {
        toggled.push([slotId, open]);
      },
    });
    slotsIn(target)[2].click();
    await harness.setProps({});
    assert.deepEqual(toggled, [['pool', true]], 'the press is reported');
    assert.deepEqual(expandedIn(target), [slotsIn(target)[1]], 'and the open slot is unchanged');
    assert.equal(
      target.querySelector('[data-requirement-panel]').dataset.requirementPanel,
      'g-haft'
    );
  });

  it('names the open panel by its tile, and points the tile at it', async () => {
    const target = await harness.mount({ slots: SLOTS, openSlotId: 'g-haft', panelId: 'panel-1' });
    const panel = target.querySelector('#panel-1');
    assert.equal(panel.getAttribute('role'), 'region');
    assert.equal(panel.getAttribute('aria-labelledby'), 'tile-haft');
    assert.equal(slotsIn(target)[1].getAttribute('aria-controls'), 'panel-1');
  });

  it('opens no panel for a slot with no alternatives and no caller content', async () => {
    const target = await harness.mount({ slots: SLOTS, openSlotId: 'pool', panelId: 'panel-1' });
    assert.equal(slotsIn(target)[2].getAttribute('aria-expanded'), 'true');
    assert.ok(!slotsIn(target)[2].hasAttribute('aria-controls'));
    assert.ok(!target.querySelector('#panel-1'));
  });

  it('offers every alternative as a pressable tile and marks the selected one', async () => {
    const target = await harness.mount({
      slots: SLOTS,
      openSlotId: 'g-haft',
      alternativesLabel: 'Hardwood alternatives',
    });
    const buttons = alternativesIn(target).map((entry) => entry.querySelector('button'));
    assert.equal(
      target.querySelector('.fab-requirement-alternatives').getAttribute('aria-label'),
      'Hardwood alternatives'
    );
    assert.deepEqual(
      buttons.map((button) => button.getAttribute('aria-pressed')),
      ['true', 'false']
    );
    assert.deepEqual(
      buttons.map((button) => button.getAttribute('aria-label')),
      [OAK.label, BOG.label],
      'the name carries the held-against-needed pair'
    );
  });

  it('keeps a short alternative selectable, dimmed, and stated in words', async () => {
    const chosen = [];
    const target = await harness.mount({
      slots: SLOTS,
      openSlotId: 'g-haft',
      onChoose: (slot, alternative) => {
        chosen.push([slot, alternative]);
      },
    });
    const [, short] = alternativesIn(target);
    const button = short.querySelector('button');

    assert.equal(short.getAttribute('data-alternative-state'), 'short');
    assert.ok(short.classList.contains('is-short'));
    assert.ok(!button.disabled, 'a short alternative is still offered');
    assert.match(
      injectedCss(),
      /\.fab-requirement-alternative\.is-short[^{]*\{[^}]*opacity:\s*0?\.6/,
      'and it is dimmed'
    );
    assert.equal(
      target.querySelector('[data-requirement-shortfall="bog"]').textContent.trim(),
      'Bog Oak: you hold 1 and this needs 2.'
    );
    assert.ok(!target.querySelector('[data-requirement-shortfall="oak"]'), 'a met one states none');
    const reading = target.querySelector('[data-requirement-shortfall="bog"]');
    assert.ok(reading.id.length > 0);
    assert.equal(
      button.getAttribute('aria-describedby'),
      reading.id,
      'the reading describes the tile it is about'
    );
    assert.ok(
      !alternativesIn(target)[0].querySelector('button').hasAttribute('aria-describedby'),
      'and a met tile is described by nothing'
    );

    button.click();
    assert.equal(chosen.length, 1);
    assert.equal(chosen[0][0].slotId, 'g-haft', 'the slot the alternative belongs to');
    assert.equal(chosen[0][1].id, 'bog', 'and the alternative the player picked');
  });

  it('renders the caller panel beneath the alternatives, for the open slot', async () => {
    const target = await harness.mount({ slots: SLOTS, openSlotId: 'g-haft', panel: POOL });
    const panel = target.querySelector('[data-requirement-panel="g-haft"]');
    const pool = panel.querySelector('[data-test-pool]');
    assert.equal(pool.textContent, 'g-haft');
    assert.equal(
      panel.querySelector('.fab-requirement-alternatives').compareDocumentPosition(pool) & 4,
      4,
      'the alternatives come first'
    );
  });

  it('renders read-only with no control and no panel', async () => {
    const target = await harness.mount({
      slots: SLOTS,
      openSlotId: 'g-haft',
      readOnly: true,
      panel: POOL,
    });
    assert.equal(target.querySelectorAll('button').length, 0);
    assert.equal(slotsIn(target).filter((slot) => slot.querySelector('[role="img"]')).length, 3);
    assert.ok(!target.querySelector('[data-requirement-panel]'));
  });

  it('names the tile group and forwards class and rest to the root', async () => {
    const target = await harness.mount({
      slots: SLOTS,
      ariaLabel: 'Requirements',
      class: 'caller-layout',
      'data-test-root': 'rail',
    });
    const root = target.querySelector('.fab-requirement-chooser');
    assert.ok(root.classList.contains('caller-layout'));
    assert.equal(root.getAttribute('data-test-root'), 'rail');
    assert.equal(root.querySelector('[role="group"]').getAttribute('aria-label'), 'Requirements');
  });
});
