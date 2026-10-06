import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-alt-selector-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/craftingArtResolution.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Kicker.svelte',
    // Issue 1644: the stack picker is the shared radiogroup's adapter.
    'src/ui/svelte/components/ChoiceOptionList.svelte',
    'src/ui/svelte/apps/crafting/detail/IngredientOptionSelector.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/crafting/detail/IngredientOptionSelector.svelte',
});

function stackChoice(overrides = {}) {
  return {
    kind: 'stack',
    groupId: 'g1',
    groupName: 'Hardwood',
    optionIndex: 0,
    selectedHeldItemId: 'Item.oak',
    stacks: [
      { itemId: 'Item.oak', name: 'Oak Haft', img: null, have: 12 },
      { itemId: 'Item.bog', name: 'Bog Oak', img: null, have: 1 },
    ],
    ...overrides,
  };
}

const readingOf = (target, radio) =>
  target.querySelector(`[id="${radio.getAttribute('aria-describedby')}"]`)?.textContent;

// The option alternatives are the requirement chooser's tiles (issue 1518); this is the stack picker.
describe('IngredientOptionSelector mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders nothing without a stack choice, and ignores an option choice', async () => {
    const option = { kind: 'option', groupId: 'g1', groupName: 'Herb', selectedOptionIndex: 0, options: [] };
    const target = await harness.mount({ choices: [option], onChoose: null });
    assert.ok(!target.querySelector('[data-recipe-section]'));
    assert.ok(!target.querySelector('[role="radiogroup"]'));
  });

  it('draws each stack group as the shared radiogroup, titled visibly and named by that title', async () => {
    const target = await harness.mount({ choices: [stackChoice()], need: 2 });
    const section = target.querySelector(
      '[data-recipe-section="stacks"][data-alt-group="g1"][data-alt-kind="stack"]'
    );
    assert.ok(section.matches('.fab-choice-option-list[data-choice-options="g1"]'));
    const title = section.querySelector('.fab-kicker').textContent.trim();
    assert.match(title, /Io\.ChooseStackTitle/);
    assert.match(title, /"name":"Hardwood"/);
    assert.equal(section.querySelector('[role="radiogroup"]').getAttribute('aria-label'), title);
    assert.deepEqual(
      [...section.querySelectorAll('[role="radio"]')].map((radio) => radio.dataset.choiceId),
      ['Item.oak', 'Item.bog']
    );
  });

  it('dims a held stack short of the slot need, describes it by its reading, and keeps it offered', async () => {
    const calls = [];
    const target = await harness.mount({
      choices: [stackChoice()],
      need: 2,
      onChoose: (groupId, choice) => {
        calls.push([groupId, choice]);
      },
    });
    const [oak, bog] = target.querySelectorAll('[role="radio"]');
    assert.ok(!oak.classList.contains('is-short'));
    assert.ok(bog.classList.contains('is-short'), 'one held against a need of two');
    assert.equal(bog.disabled, false, 'crafting claims no stack elsewhere, so none is disabled');
    assert.match(readingOf(target, bog), /Io\.StackReading:\{"have":1,"need":2\}/);
    assert.ok(!oak.hasAttribute('aria-describedby'), 'a met stack names its reading instead');
    assert.match(oak.textContent, /Oak Haft.*Io\.StackReading:\{"have":12,"need":2\}/s);
    assert.ok(!bog.hasAttribute('title'));
    bog.click();
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 0, heldItemId: 'Item.bog' }]);
  });

  it('keeps the roving keyboard model over the stacks, moving focus with the choice', async () => {
    const calls = [];
    const target = await harness.mount({
      choices: [stackChoice()],
      onChoose: (groupId, choice) => calls.push([groupId, choice]),
    });
    const radios = [...target.querySelectorAll('[role="radio"]')];
    assert.deepEqual(
      radios.map((radio) => [radio.getAttribute('aria-checked'), radio.getAttribute('tabindex')]),
      [
        ['true', '0'],
        ['false', '-1'],
      ]
    );
    const press = (key) =>
      radios[0].dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key, bubbles: true }));
    press('ArrowRight');
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 0, heldItemId: 'Item.bog' }]);
    assert.ok(globalThis.document.activeElement === radios[1], 'focus follows the choice');
    press('End');
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 0, heldItemId: 'Item.bog' }]);
    press(' ');
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 0, heldItemId: 'Item.oak' }]);
  });

  it('draws a stack with no linked image as the crafting default art', async () => {
    const target = await harness.mount({
      choices: [stackChoice({ stacks: [{ itemId: 'iron', name: 'Iron', img: null, have: 3 }] })],
      need: 1,
      onChoose: null,
    });
    const medallion = target.querySelector('[data-alt-kind="stack"] [role="radio"] .fab-medallion');
    assert.equal(medallion.dataset.medallion, 'image');
    assert.equal(medallion.querySelector('img').getAttribute('alt'), '');
  });
});
