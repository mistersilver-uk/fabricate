import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-alt-selector-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/crafting/CraftingEssenceThumb.svelte',
    'src/ui/svelte/apps/crafting/QuantityTag.svelte',
    'src/ui/svelte/apps/crafting/detail/IngredientOptionSelector.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/crafting/detail/IngredientOptionSelector.svelte',
});

function optionChoice(overrides = {}) {
  return {
    kind: 'option',
    groupId: 'g1',
    groupName: 'Herb slot',
    selectedOptionIndex: 0,
    options: [
      { optionIndex: 0, name: 'Red Herb', img: null, need: 1, have: 2, satisfied: true, isCurrency: false, costLabel: '', affordable: true },
      { optionIndex: 1, name: 'Blue Herb', img: null, need: 1, have: 0, satisfied: false, isCurrency: false, costLabel: '', affordable: true },
    ],
    ...overrides,
  };
}

describe('IngredientOptionSelector mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders nothing when there are no choices (single-option groups)', async () => {
    const target = await harness.mount({ choices: [], onChoose: null });
    assert.equal(target.querySelector('[data-recipe-section="alternatives"]'), null);
    assert.equal(target.querySelector('[role="radiogroup"]'), null);
  });

  it('renders a radiogroup with one radio per option for a multi-option group', async () => {
    const target = await harness.mount({ choices: [optionChoice()], onChoose: null });
    const group = target.querySelector('[role="radiogroup"][data-alt-kind="option"]');
    assert.ok(group, 'a radiogroup renders for the multi-option group');
    assert.equal(group.getAttribute('aria-label'), 'Herb slot', 'aria-label is the group name');
    const radios = group.querySelectorAll('[role="radio"]');
    assert.equal(radios.length, 2, 'one radio per option');
    assert.equal(radios[0].getAttribute('aria-checked'), 'true', 'the selected option is checked');
    assert.equal(radios[1].getAttribute('aria-checked'), 'false');
    // Roving tabindex: exactly one tabbable radio per group.
    assert.equal(radios[0].getAttribute('tabindex'), '0');
    assert.equal(radios[1].getAttribute('tabindex'), '-1');
  });

  it('renders an authored essence glyph at 40px without changing radio semantics', async () => {
    const choice = optionChoice();
    choice.options[1] = {
      ...choice.options[1],
      name: 'Restorative essence',
      img: null,
      isEssence: true,
      icon: 'fa-solid fa-heart',
    };
    const target = await harness.mount({ choices: [choice], onChoose: null });
    const radio = target.querySelectorAll('[role="radio"]')[1];
    const thumb = radio.querySelector('.crafting-essence-thumb');
    assert.ok(thumb, 'essence alternative uses a glyph thumb');
    assert.match(thumb.getAttribute('style'), /40px/, 'alternative glyph keeps 40px geometry');
    assert.ok(thumb.querySelector('i').classList.contains('fa-heart'));
    assert.equal(radio.querySelector('img'), null);
    assert.equal(radio.getAttribute('aria-checked'), 'false');
    assert.match(radio.getAttribute('aria-label'), /Restorative essence/);
    assert.match(radio.textContent, /0\/1/, 'have/need remains visible');
  });

  it('flags an insufficient option as selectable-but-flagged', async () => {
    const target = await harness.mount({ choices: [optionChoice()], onChoose: null });
    const radios = target.querySelectorAll('[role="radio"]');
    assert.equal(radios[1].getAttribute('data-option-satisfied'), 'false', 'insufficient option is flagged');
    assert.equal(radios[1].hasAttribute('disabled'), false, 'but stays reachable (not disabled)');
  });

  it('invokes onChoose with the group id and option index on click', async () => {
    const calls = [];
    const target = await harness.mount({
      choices: [optionChoice()],
      onChoose: (groupId, choice) => calls.push([groupId, choice]),
    });
    const radios = target.querySelectorAll('[role="radio"]');
    radios[1].click();
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 1 }], 'commits the clicked option');
  });

  it('renders a stack radiogroup keyed to held item ids', async () => {
    const stackChoice = {
      kind: 'stack',
      groupId: 'g1',
      groupName: 'metal',
      optionIndex: 0,
      selectedHeldItemId: 'iron',
      stacks: [
        { itemId: 'iron', name: 'Iron', img: null, have: 3 },
        { itemId: 'copper', name: 'Copper', img: null, have: 2 },
      ],
    };
    const calls = [];
    const target = await harness.mount({
      choices: [stackChoice],
      onChoose: (groupId, choice) => calls.push([groupId, choice]),
    });
    const group = target.querySelector('[role="radiogroup"][data-alt-kind="stack"]');
    assert.ok(group, 'a stack radiogroup renders');
    const radios = group.querySelectorAll('[role="radio"]');
    assert.equal(radios.length, 2);
    radios[1].click();
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 0, heldItemId: 'copper' }], 'commits the chosen stack');
  });
});
