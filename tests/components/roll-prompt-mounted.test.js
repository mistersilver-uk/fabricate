import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'svelte';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createLabDialogV2 } from '../view-lab/foundryDialog.js';
import { waitForPrompt } from '../../src/ui/svelte/apps/crafting/rollPrompt.js';

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

function createMountedLabDialog() {
  const nodeEventTarget = globalThis.EventTarget;
  globalThis.EventTarget = document.defaultView.EventTarget;
  try {
    return createLabDialogV2({ localize: (key) => key });
  } finally {
    globalThis.EventTarget = nodeEventTarget;
  }
}

async function submitMountedDialog(data, allowAdvantage, interact) {
  const root = await harness.mount({ data });
  const lab = createMountedLabDialog();
  lab.setAnswer('open');
  const pending = waitForPrompt(lab.DialogV2, data, allowAdvantage, data.choicePlan, {
    loadBody: async () => ({ default: () => {} }),
    mountBody: (_component, { target }) => {
      target.append(root);
      return root;
    },
    unmountBody: () => {},
  });
  let frame;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    [frame] = lab.openDialogs();
    if (frame?.querySelector('input[name="situationalBonus"]')) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(frame?.querySelector('input[name="situationalBonus"]'), 'DialogV2 mounted the real form body');
  await interact(frame);
  return pending;
}

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
    assert.equal(mode.value, 'publicroll');
    assert.equal(mode.selectedOptions[0].textContent, 'Public roll');
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
    assert.equal(inputs[1].getAttribute('aria-label'), 'B +1d4');
    assert.equal(inputs[2].getAttribute('aria-label'), 'C +3');
    assert.match(root.textContent, /B\+1d4/);
  });

  it('submits actual radio, bonus and mode fields through every DialogV2 footer action', async () => {
    for (const [action, advantage] of [['disadvantage', 'disadvantage'], ['normal', 'normal'], ['advantage', 'advantage']]) {
      harness.remount();
      const data = { ...base, choicePlan: { options: choices, maxPicks: 1, defaultSelectedIds: ['b'] } };
      const result = await submitMountedDialog(data, true, async (frame) => {
        const radio = frame.querySelector('input[value="c"]');
        radio.click();
        flushSync();
        frame.querySelector('input[name="situationalBonus"]').value = '+1d4';
        frame.querySelector('select[name="rollMode"]').value = 'gmroll';
        frame.querySelector(`button[data-action="${action}"]`).click();
      });
      assert.deepEqual(result, {
        confirmed: true, bonus: '1d4', rollMode: 'gmroll', advantage,
        chosenModifierIds: ['c'], chosenModifierId: 'c',
      });
    }
  });

  it('submits cap-released multipicks and maps a DialogV2 dismissal to false', async () => {
    const data = { ...base, choicePlan: { options: choices, maxPicks: 2, defaultSelectedIds: ['a', 'b'] } };
    const result = await submitMountedDialog(data, false, async (frame) => {
      const [first, , third] = frame.querySelectorAll('input[type="checkbox"]');
      assert.equal(third.disabled, true);
      first.click();
      flushSync();
      assert.equal(third.disabled, false);
      third.click();
      flushSync();
      frame.querySelector('button[data-action="roll"]').click();
    });
    assert.deepEqual(result.chosenModifierIds, ['b', 'c']);
    harness.remount();
    const dismissed = await submitMountedDialog(base, false, (frame) => {
      frame.querySelector('button[data-action="close"]').click();
    });
    assert.deepEqual(dismissed, { confirmed: false });
  });

  it('keeps the default Enter submit and native control order in the real dialog form', async () => {
    const result = await submitMountedDialog(base, true, (frame) => {
      const form = frame.querySelector('form');
      const bonus = form.elements.namedItem('situationalBonus');
      const mode = form.elements.namedItem('rollMode');
      const defaultButton = frame.querySelector('button[autofocus]');
      assert.equal(defaultButton.dataset.action, 'normal');
      assert.ok(bonus.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING);
      assert.ok(mode.compareDocumentPosition(defaultButton) & Node.DOCUMENT_POSITION_FOLLOWING);
      bonus.focus();
      assert.equal(document.activeElement, bonus);
      form.requestSubmit(defaultButton);
    });
    assert.equal(result.advantage, 'normal');
    assert.equal(result.rollMode, 'publicroll');
  });

  it('re-centers an expanded DialogV2 frame while preserving other position dimensions', async () => {
    const lab = createMountedLabDialog();
    const dialog = new lab.DialogV2({
      buttons: [{ action: 'roll', label: 'Roll' }], position: { width: 500, height: 'auto' },
    });
    await dialog.render();
    const frame = dialog.element;
    const oldWidth = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth');
    const oldHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight');
    const priorRect = frame.getBoundingClientRect;
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1280 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 860 });
    frame.getBoundingClientRect = () => ({ width: 500, height: 600 });
    try {
      assert.equal(dialog.setPosition({ top: 400 }).top, 260);
      assert.equal(dialog.setPosition({ height: 'auto' }).top, 260, 'omitting top retains the prior offset');
      const refit = dialog.setPosition({ height: 'auto', top: null });
      assert.equal(refit.top, 130);
      assert.equal(refit.width, 500);
    } finally {
      frame.getBoundingClientRect = priorRect;
      if (oldWidth) Object.defineProperty(document.documentElement, 'clientWidth', oldWidth);
      else delete document.documentElement.clientWidth;
      if (oldHeight) Object.defineProperty(document.documentElement, 'clientHeight', oldHeight);
      else delete document.documentElement.clientHeight;
      await dialog.close();
    }
  });
});
