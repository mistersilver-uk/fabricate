import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness
} from '../helpers/svelte-component-harness.js';
import { chipGroundAlpha, themeTokens } from '../helpers/chipPaint.js';
import { chipToneOf } from '../helpers/chipTone.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const THEMES = themeTokens(readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8'));

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-alt-selector-',
  rawModules: [
    // Issue 1504/1506: the raw closure the shared `<Select>` reaches through
    // `SearchablePopover`, which the compiled `<Chip>` closure below arrives with.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    // Issue 1506: the tone map and the quantity readings the retired tag's six sites now use.
    ...STATUS_TONE_RAW_MODULES,
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/craftingArtResolution.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  'src/ui/svelte/util/foundryIconCatalogue.json',
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    // Issue 1506: the have/need tag retired into the shared chip.
    ...SELECT_COMPILED_MODULES,
    // The shared eyebrow (issue 1505). The stack group's title is a `<Kicker>`.
    'src/ui/svelte/components/Kicker.svelte',
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

  it('titles the stack group visibly and names the radiogroup by that title', async () => {
    const target = await harness.mount({ choices: [stackChoice()], need: 2 });
    const section = target.querySelector('[data-recipe-section="stacks"]');
    const title = section.querySelector('.fab-kicker').textContent.trim();
    assert.match(title, /Io\.ChooseStackTitle/);
    assert.match(title, /"name":"Hardwood"/);
    assert.equal(section.querySelector('[role="radiogroup"]').getAttribute('aria-label'), title);
  });

  it('flags a held stack that is short of the slot need, and keeps it selectable', async () => {
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
    assert.equal(chipToneOf(bog.querySelector('.manager-chip')), 'danger');
    assert.equal(chipGroundAlpha(bog.querySelector('.manager-chip'), THEMES), 1);
    assert.equal(bog.hasAttribute('disabled'), false);
    assert.match(bog.getAttribute('aria-label'), /Io\.ChooseShortOption/);
    assert.match(bog.getAttribute('aria-label'), /"name":"Bog Oak".*"have":1.*"need":2/);
    assert.match(oak.getAttribute('aria-label'), /Io\.ChooseOption:/);
    assert.ok(!bog.hasAttribute('title'));
    bog.click();
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 0, heldItemId: 'Item.bog' }]);
  });

  it('keeps the roving-tabindex keyboard model over the stacks', async () => {
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
    press('End');
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 0, heldItemId: 'Item.bog' }]);
    press(' ');
    assert.deepEqual(calls.at(-1), ['g1', { optionIndex: 0, heldItemId: 'Item.oak' }]);
  });

  it('draws a held stack count behind the multiplication sign', async () => {
    const target = await harness.mount({
      choices: [stackChoice({ stacks: [{ itemId: 'iron', name: 'Iron', img: null, have: 3 }] })],
      onChoose: null,
    });
    const chip = target.querySelector('[data-alt-kind="stack"] .manager-chip');
    assert.equal(chipToneOf(chip), 'neutral', 'a held count is a fact that is merely present');
    assert.equal(chip.textContent.trim(), '×3');
  });
});
