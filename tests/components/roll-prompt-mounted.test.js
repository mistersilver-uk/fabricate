import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'svelte';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-roll-prompt-',
  componentPath: 'src/ui/svelte/apps/crafting/RollPrompt.svelte',
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/crafting/RollPrompt.svelte',
  ],
  rootClass: 'fabricate fabricate-roll-prompt-dialog',
});

const labels = {
  modifiers: 'Modifiers', modifierChoice: 'Check modifier', unnamedModifier: 'Unnamed modifier',
  unnamedSubject: 'Unnamed item', dcValue: 'DC {dc}',
  pickUpTo: 'Pick up to {count}', eachAdds: 'Each adds', bonus: 'Situational bonus',
  bonusPlaceholder: '+2 or 1d4', bonusHelp: 'A bonus adds', rollMode: 'Roll mode',
  meet: 'meet or beat', exceed: 'beat', bulkNote: 'One choice applies to all',
  bulkRows: 'Rolls in this batch', noCheck: 'No check', noSingleTarget: 'No single target',
};
const modes = [{ value: 'publicroll', label: 'Public roll' }, { value: 'gmroll', label: 'Private roll' }];
const choices = [
  { id: 'a', label: 'A', display: '+1' },
  { id: 'b', label: 'B', display: '+1d4' },
  { id: 'c', label: 'C', display: '+3' },
];
const base = {
  kind: 'single', title: 'Crafting check', subtitle: 'Forge rivets', formula: '2d6 + 3',
  dc: 12, comparison: 'meet', selectedModifiers: [], labels, rollModes: modes,
  defaultRollMode: 'publicroll', choicePlan: { options: [], maxPicks: 1, defaultSelectedIds: [] },
};

describe('mounted roll prompt', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => harness.remount());

  it('shows the actual formula, inclusive target, named bonus and native mode controls', async () => {
    const root = await harness.mount({ data: base });
    assert.match(root.textContent, /2d6 \+ 3/);
    assert.match(root.textContent, /DC 12 · meet or beat/);
    const bonus = root.querySelector('input[name="situationalBonus"]');
    const mode = root.querySelector('select[name="rollMode"]');
    assert.ok(bonus);
    assert.ok(mode);
    bonus.value = '+2';
    mode.value = 'gmroll';
    assert.equal(bonus.value, '+2');
    assert.equal(mode.value, 'gmroll');
    bonus.focus();
    assert.equal(root.ownerDocument.activeElement, bonus);
  });

  it('uses strict comparison and the exact selected rolling modifier', async () => {
    const root = await harness.mount({ data: { ...base, comparison: 'exceed', selectedModifiers: [choices[1]] } });
    assert.match(root.textContent, /DC 12 · beat/);
    assert.match(root.textContent, /B \+1d4/);
    assert.ok(!root.textContent.includes('A +1'));
  });

  it('uses native radio choice and changes the submitted selection', async () => {
    const root = await harness.mount({ data: { ...base, choicePlan: { options: choices, maxPicks: 1, defaultSelectedIds: ['b'] } } });
    const radios = [...root.querySelectorAll('input[type="radio"][name="craftingModifier"]')];
    assert.equal(radios.length, 3);
    assert.equal(radios.find((input) => input.checked)?.value, 'b');
    radios[0].click();
    flushSync();
    assert.equal(radios.find((input) => input.checked)?.value, 'a');
    assert.match(root.querySelector('fieldset legend').textContent, /Check modifier/);
    radios[0].focus();
    assert.equal(root.ownerDocument.activeElement, radios[0]);
  });

  it('caps multipick checkboxes, then releases and replaces a choice', async () => {
    const root = await harness.mount({ data: { ...base, choicePlan: { options: choices, maxPicks: 2, defaultSelectedIds: ['a', 'b'] } } });
    const inputs = [...root.querySelectorAll('input[type="checkbox"][name="craftingModifier"]')];
    assert.equal(inputs.length, 3);
    assert.equal(inputs[2].disabled, true);
    inputs[0].click();
    flushSync();
    assert.equal(inputs[2].disabled, false);
    inputs[2].click();
    flushSync();
    assert.equal(inputs[2].checked, true);
    assert.equal(inputs[0].disabled, true);
  });

  it('shows each bulk need and leaves a count-only prompt operable', async () => {
    const bulk = { ...base, kind: 'bulk', title: 'Bulk check', subtitle: '4 items', subjects: [
      { name: 'Ore', need: { kind: 'dc', dc: 18 } },
      { name: 'Scrap', need: { kind: 'noCheck' } },
      { name: 'Map', need: { kind: 'noSingleTarget' } },
    ] };
    const root = await harness.mount({ data: bulk });
    assert.match(root.textContent, /Ore.*DC 18/);
    assert.match(root.textContent, /Scrap.*No check/);
    assert.match(root.textContent, /Map.*No single target/);
    const empty = await harness.mount({ data: { ...bulk, subjects: [] } });
    assert.ok(!empty.querySelector('.bulk-row'));
    assert.ok(empty.querySelector('select[name="rollMode"]'));
  });

  it('keeps the plain-d20 and light-frame bodies complete', async () => {
    for (const state of ['advantage', 'light']) {
      const root = await harness.mount({ data: { ...base, state, formula: '1d20 + 2' } });
      assert.equal(root.querySelector('.fabricate-roll-prompt').dataset.rollPromptState, state);
      assert.match(root.textContent, /1d20 \+ 2/);
      assert.ok(root.querySelector('input[name="situationalBonus"]'));
      assert.ok(root.querySelector('select[name="rollMode"]'));
    }
  });

  it('keeps dense modifier names and a capped rolling option in operable controls', async () => {
    const longLabel = 'Herbalism lore carried through many seasons and patient field notes';
    const root = await harness.mount({ data: {
      ...base, state: 'overflow', choicePlan: {
        options: [{ ...choices[0], label: longLabel }, { ...choices[1], display: '+1d4' }, choices[2]],
        maxPicks: 2, defaultSelectedIds: ['a', 'b'],
      },
    } });
    assert.match(root.textContent, new RegExp(longLabel));
    const inputs = [...root.querySelectorAll('input[type="checkbox"][name="craftingModifier"]')];
    assert.equal(inputs[2].disabled, true);
    assert.equal(inputs[1].getAttribute('aria-label'), 'B');
    assert.match(root.textContent, /B\+1d4/);
  });
});
