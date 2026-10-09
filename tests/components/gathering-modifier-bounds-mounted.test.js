/**
 * The character-modifier bounds row MOUNTED through `GatheringModifierEditor`, at both subjects
 * (issues 1050, 1521): each bound forwards its own patch, and a cleared bound is `null`, never `0`.
 * Its character-modifier search is refused, with the reason as its tooltip, on an empty library.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const EDITOR_PATH = 'src/ui/svelte/apps/manager/environment/GatheringModifierEditor.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-gathering-modifier-bounds-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/components/stepperLabels.js',
  ],
  runeModules: [...TYPEAHEAD_RUNE_MODULES],
  compiledModules: [
    // The condition picker and the operator are `<Select>`s (issue 1777).
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    // Each attached condition modifier is a rule row (issue 1782).
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/RuleSentence.svelte',
    'src/ui/svelte/components/RuleRow.svelte',
    // The character-modifier search is the shared typeahead over the search field (issue 1782).
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/components/Typeahead.svelte',
    EDITOR_PATH,
  ],
  componentPath: EDITOR_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** Mount the editor with one reference row and return its two bound inputs and the patches. */
async function mountRow(subject, bounds) {
  const patches = [];
  const root = await harness.mount({
    subject,
    rowCharacterModifiers: () => [{ id: 'ref-1', modifierId: 'mod-1', ...bounds }],
    characterModifierLibraryEntry: () => ({ id: 'mod-1' }),
    onUpdateCharacterModifier: (id, patch) => {
      patches.push([id, patch]);
    },
  });
  const inputs = [
    ...root.querySelectorAll(':scope .manager-character-modifier-row-bounds [data-stepper-input]'),
  ];
  return { patches, minInput: inputs[0], maxInput: inputs[1], count: inputs.length };
}

/** Type `raw` into the field the way a user would, firing the real `input` event. */
function type(input, raw) {
  input.value = raw;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

const BOUND_CASES = [
  { key: 'min', field: 'minInput', value: 5 },
  { key: 'max', field: 'maxInput', value: 20 },
];

for (const subject of ['drop', 'event']) {
  describe(`the ${subject} subject's bounds row`, () => {
    it('renders one stepper per bound', async () => {
      const { count } = await mountRow(subject, { min: 5, max: 20 });
      assert.equal(count, 2);
    });

    for (const { key, field, value } of BOUND_CASES) {
      it(`clearing the ${key} bound emits { ${key}: null }, not { ${key}: 0 }`, async () => {
        const mounted = await mountRow(subject, { [key]: value });
        const { patches } = mounted;
        const input = mounted[field];
        type(input, '');
        assert.deepEqual(patches, [['ref-1', { [key]: null }]], 'a cleared bound is no bound');
      });

      it(`entering a number for ${key} emits that number`, async () => {
        const mounted = await mountRow(subject, { [key]: null });
        const { patches } = mounted;
        const input = mounted[field];
        type(input, '7');
        assert.deepEqual(patches, [['ref-1', { [key]: 7 }]]);
      });
    }

    it('patches only the bound that was edited', async () => {
      const { patches, minInput } = await mountRow(subject, { min: 5, max: 20 });
      type(minInput, '');
      assert.deepEqual(patches, [['ref-1', { min: null }]]);
    });
  });
}

for (const subject of ['drop', 'event']) {
  describe(`the ${subject} subject's character-modifier search (issue 1782)`, () => {
    const selector = `[data-gathering-${subject}-character-modifier-search] input`;

    it('is disabled, its tooltip saying why, while the library is empty', async () => {
      const root = await harness.mount({ subject, characterModifierLibrary: [] });
      const input = root.querySelector(selector);
      assert.equal(input.disabled, true);
      assert.equal(
        input.getAttribute('data-tooltip'),
        'Add a modifier to the system library first to reference it here.'
      );
    });

    it('is enabled, with no tooltip, once the library holds a modifier', async () => {
      const root = await harness.mount({
        subject,
        characterModifierLibrary: [{ id: 'mod-1', label: 'Training' }],
      });
      const input = root.querySelector(selector);
      assert.equal(input.disabled, false);
      assert.ok(!input.hasAttribute('data-tooltip'));
    });
  });
}
