/**
 * IoTable (issue 917) as the requirement surface's COMPOSITION ROOT.
 *
 * The rail, the single open chooser and the consumption plan are separately
 * covered; what only IoTable can prove is that they compose — that exactly one
 * chooser renders, that it is the RIGHT one for the open slot, that a choice
 * chooser shows only the open group rather than the old stacked list of every
 * group, and that the legacy set-level essence rows are untouched by any of it.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { craftability, sharedEssenceCraftability } from '../helpers/crafting-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-io-table-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/detail/IoTable.svelte',
});

function choiceState(groupId, name, overrides = {}) {
  return {
    groupId,
    name,
    img: `icons/${groupId}.webp`,
    need: 1,
    have: 0,
    satisfied: false,
    hasChoice: true,
    choiceCount: 2,
    ...overrides,
  };
}

function optionChoice(groupId, groupName) {
  return {
    kind: 'option',
    groupId,
    groupName,
    selectedOptionIndex: 0,
    options: [
      { optionIndex: 0, name: `${groupName} A`, img: null, need: 1, have: 1, satisfied: true, isCurrency: false, costLabel: '', affordable: true },
      { optionIndex: 1, name: `${groupName} B`, img: null, need: 1, have: 0, satisfied: false, isCurrency: false, costLabel: '', affordable: true },
    ],
  };
}

function twoChoiceCraftability() {
  return craftability({
    canCraft: false,
    ingredientStates: [choiceState('g-herb', 'Herb'), choiceState('g-metal', 'Metal')],
    ingredientChoices: [optionChoice('g-herb', 'Herb'), optionChoice('g-metal', 'Metal')],
  });
}

describe('IoTable mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('keeps the io section marker and renders the rail for a set with requirements', async () => {
    const target = await harness.mount({ craftability: craftability() });
    assert.ok(target.querySelector('[data-recipe-section="io"]'));
    assert.ok(target.querySelector('[data-recipe-section="requirement-rail"]'));
    assert.equal(target.querySelectorAll('[data-requirement-slot]').length, 1);
  });

  it('renders no rail at all for an outputs-only table', async () => {
    const target = await harness.mount({
      craftability: null,
      result: { items: [{ name: 'Potion', img: null, qty: 1 }] },
    });
    assert.ok(!target.querySelector('[data-recipe-section="requirement-rail"]'));
    assert.ok(target.querySelector('[data-io-group="outputs"]'));
  });

  it('always states the consumption plan alongside the rail', async () => {
    const target = await harness.mount({ craftability: craftability() });
    assert.ok(target.querySelector('[data-recipe-section="consumption-plan"]'));
  });

  // Composition-root wiring, not presentation: the plan panel ACCEPTS a `formatList`
  // prop and no ancestor of IoTable supplies one, so unless the root itself defaults
  // it to the bridge's locale-bound joiner the seam is dead — a rendered-but-inert
  // prop that no rendering assertion can see. Stubbing Foundry's own list-formatter
  // read proves the real helper is what reaches the panel.
  it('supplies the active language list formatter to the consumption plan', async () => {
    const asked = [];
    globalThis.game.i18n.getListFormatter = (options) => {
      asked.push(options);
      return { format: (names) => names.join(' ~AND~ ') };
    };
    try {
      const target = await harness.mount({ craftability: twoChoiceCraftability() });
      const pending = target.querySelector('[data-consumption-pending]').textContent;
      assert.match(pending, / ~AND~ /, 'IoTable must hand the plan the language formatter');
      assert.deepEqual(asked, [{ style: 'long', type: 'conjunction' }]);
    } finally {
      delete globalThis.game.i18n.getListFormatter;
    }
  });

  // The old surface stacked EVERY group's alternatives below the grid at once; the
  // rail's contract is that the open slot is the single point of interaction.
  it('shows only the open group when a choice slot is open', async () => {
    const target = await harness.mount({
      craftability: twoChoiceCraftability(),
      openSlotId: 'g-metal',
    });
    const groups = [...target.querySelectorAll('[role="radiogroup"]')];
    assert.equal(groups.length, 1, 'one focused group, not one per choice');
    assert.equal(groups[0].getAttribute('data-alt-group'), 'g-metal');
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
  });

  it('preserves the alternatives roving-tabindex radio model inside the rail', async () => {
    const target = await harness.mount({
      craftability: twoChoiceCraftability(),
      openSlotId: 'g-herb',
    });
    const radios = [...target.querySelectorAll('[role="radio"]')];
    assert.deepEqual(
      radios.map((radio) => [radio.getAttribute('aria-checked'), radio.getAttribute('tabindex')]),
      [
        ['true', '0'],
        ['false', '-1'],
      ]
    );
  });

  it('routes the chosen option back through onChooseOption', async () => {
    const calls = [];
    const target = await harness.mount({
      craftability: twoChoiceCraftability(),
      openSlotId: 'g-herb',
      onChooseOption: (groupId, choice) => calls.push([groupId, choice]),
    });
    target.querySelectorAll('[role="radio"]')[1].click();
    assert.deepEqual(calls.at(-1), ['g-herb', { optionIndex: 1 }]);
  });

  it('opens the shared essence pool — and not an alternatives group — for an essence slot', async () => {
    const target = await harness.mount({
      craftability: sharedEssenceCraftability(),
      openSlotId: 'essence-pool',
    });
    assert.ok(target.querySelector('[data-recipe-section="essence-pool"]'));
    assert.ok(!target.querySelector('[role="radiogroup"]'));
    assert.equal(
      target.querySelectorAll('[data-essence-meter]').length,
      2,
      'both requirements share one pool'
    );
  });

  it('labels the open panel back at the tile that controls it', async () => {
    const target = await harness.mount({
      craftability: sharedEssenceCraftability(),
      openSlotId: 'essence-pool',
      idPrefix: 'fabricate-req-step-1',
    });
    const panel = target.querySelector('[data-recipe-section="essence-pool"]');
    const tile = target.querySelector('[data-slot-kind="essence"]');
    assert.equal(panel.getAttribute('id'), 'fabricate-req-step-1-panel');
    assert.equal(tile.getAttribute('aria-controls'), 'fabricate-req-step-1-panel');
    assert.equal(panel.getAttribute('aria-labelledby'), tile.getAttribute('id'));
  });

  it('opens no chooser at all on a read-only rail', async () => {
    const target = await harness.mount({
      craftability: sharedEssenceCraftability(),
      openSlotId: 'essence-pool',
      readOnly: true,
    });
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
    assert.ok(!target.querySelector('[role="radiogroup"]'));
    assert.ok(target.querySelector('[data-requirement-rail-readonly]'));
  });

  it('routes an allocation change back through onAllocateEssence', async () => {
    const calls = [];
    const target = await harness.mount({
      craftability: sharedEssenceCraftability(),
      openSlotId: 'essence-pool',
      onAllocateEssence: (itemKey, units) => calls.push([itemKey, units]),
    });
    target
      .querySelector('[data-essence-carrier="Item.prism-1"] [data-stepper-increment]')
      .click();
    assert.deepEqual(calls.at(-1), ['Item.prism-1', 1]);
  });

  // Legacy set-level essences are threshold-only and never consumed, so they cannot
  // enter the pool and keep their own row presentation (and its pinned selector).
  it('keeps legacy set-level essence rows out of the rail and out of the pool', async () => {
    const target = await harness.mount({
      craftability: craftability({
        essenceStates: [
          { type: 'aether', name: 'Aether', icon: 'fa-regular fa-star', need: 1, have: 1, satisfied: true },
        ],
      }),
    });
    assert.ok(target.querySelector('[data-io-group="essences"] .crafting-io-essence-icon'));
    assert.equal(
      target.querySelectorAll('[data-slot-kind="essence"]').length,
      0,
      'a legacy threshold essence is not a rail slot'
    );
  });

  it('still renders the tool and output groups unchanged', async () => {
    const target = await harness.mount({
      craftability: craftability({
        toolStates: [{ name: 'Mortar', img: 'icons/mortar.webp', available: false }],
      }),
      result: { items: [{ name: 'Potion', img: null, qty: 2 }] },
    });
    assert.ok(target.querySelector('[data-io-group="tools"] .crafting-io-tool-label'));
    assert.equal(
      target.querySelector('[data-io-group="outputs"] .crafting-io-output-qty').textContent.trim(),
      '×2'
    );
  });
});
