import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'svelte';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { stubI18n } from '../helpers/rollPromptDialogStub.js';
import { buildSinglePromptData, waitForPrompt } from '../../src/ui/svelte/apps/crafting/rollPrompt.js';
import { openRollPromptModal } from '../../src/ui/svelte/apps/crafting/rollPromptHost.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PROMPT = 'src/ui/svelte/apps/crafting/RollPrompt.svelte';
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-roll-prompt-',
  componentPath: PROMPT,
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/apps/crafting/rollPromptTarget.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    // The roll mode is the shared `Select`, which renders the popover pair behind it.
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
    'src/ui/svelte/components/Select.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/apps/manager/ManagerModal.svelte',
    'src/ui/svelte/apps/crafting/RollPromptTarget.svelte',
    PROMPT,
  ],
  rootClass: 'fabricate fabricate-app',
});

const labels = {
  modifiers: 'Modifiers', modifierChoice: 'Check modifier', unnamedModifier: 'Unnamed modifier',
  unnamedSubject: 'Unnamed item', dcValue: 'DC {dc}', pickUpTo: 'Pick up to 2',
  eachAdds: 'Each adds', bonus: 'Situational bonus', bonusPlaceholder: '+2 or 1d4',
  bonusHelp: 'A bonus adds', rollMode: 'Roll mode', meet: 'meet or beat', exceed: 'beat',
  bulkNote: 'One choice applies to all', bulkRows: 'Rolls in this batch', noCheck: 'No check',
  noSingleTarget: 'No single target', worse: 'keep the worse', better: 'keep the better',
  roll: 'Roll', advantage: 'Advantage', disadvantage: 'Disadvantage', close: 'Close',
};
const modes = [{ value: 'publicroll', label: 'Public roll' }, { value: 'gmroll', label: 'Private GM roll' }];
const choices = [
  { id: 'a', label: 'A', display: '+1' },
  { id: 'b', label: 'B', display: '+1d4' },
  { id: 'c', label: 'C', display: '+3' },
];
const noChoice = { options: [], maxPicks: 1, defaultSelectedIds: [] };
const base = {
  kind: 'single', title: 'Crafting check', subtitle: 'Brenna · Forge rivets', formula: '2d6 + 3',
  dc: 12, dcText: 'DC 12', chipText: 'DC 12 · meet or beat', comparison: 'meet', selectedModifiers: [], labels, rollModes: modes,
  defaultRollMode: 'publicroll', choicePlan: noChoice, allowAdvantage: false,
};
const bulk = {
  ...base, kind: 'bulk', title: 'Salvage checks', subtitle: 'Brenna · 3 items', subjects: [
    { name: 'Ore', need: { kind: 'dc', dc: 18 }, needText: 'DC 18' },
    { name: 'Scrap', need: { kind: 'noCheck' }, needText: 'No check' },
    { name: 'Map', need: { kind: 'noSingleTarget' }, needText: 'No single target' },
  ],
};

const dialogOf = (root) => root.querySelector('[data-roll-prompt]');
const modeTrigger = (dialog) => dialog.querySelector('.mode-field .fabricate-select-trigger');
const loadPrompt = () => harness.loadRuneModule(PROMPT);
const keydown = (key, init = {}) =>
  new document.defaultView.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
const nextFrame = () => new Promise((settle) => document.defaultView.requestAnimationFrame(() => settle()));
const settleUi = async () => {
  await new Promise((settle) => setTimeout(settle, 0));
  flushSync();
};

/** Choose a roll mode the way a player does: open the shared Select and click the row. */
async function chooseRollMode(dialog, value) {
  modeTrigger(dialog).click();
  await settleUi();
  document.querySelector(`[data-popover-option="${value}"]`).click();
  await settleUi();
}

/** The real path: adapter, host and compiled prompt, over an application root holding focus. */
async function openThroughHost(data, allowAdvantage, choicePlan = data.choicePlan) {
  const root = document.createElement('div');
  root.className = 'fabricate fabricate-app';
  const opener = document.createElement('button');
  root.append(opener);
  document.body.append(root);
  opener.focus();
  const pending = waitForPrompt(data, allowAdvantage, choicePlan, (view) =>
    openRollPromptModal(view, { loadComponent: loadPrompt })
  );
  for (let attempt = 0; attempt < 20 && !dialogOf(root); attempt += 1) {
    await new Promise((settle) => setImmediate(settle));
  }
  const dialog = dialogOf(root);
  assert.ok(dialog, 'the prompt mounted into the application root');
  return { root, opener, dialog, pending };
}

describe('mounted roll prompt', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => {
    harness.remount();
    document.body.replaceChildren();
  });

  it('renders one header, the actual formula, an info DC chip and named controls', async () => {
    const root = await harness.mount({ data: base });
    const dialog = dialogOf(root);
    assert.equal(dialog.parentElement, root, 'the modal layers inside the app it covers');
    assert.equal(dialog.querySelectorAll('h1, h2, h3, h4').length, 1, 'one header, no second title');
    assert.equal(dialog.querySelector('.manager-modal-title').textContent, 'Crafting check');
    assert.equal(dialog.querySelector('.manager-modal-subtitle').textContent, 'Brenna · Forge rivets');
    assert.equal(dialog.querySelector('.formula').textContent, '2d6 + 3');
    assert.ok(!dialog.querySelector('code'), 'the formula is not a core-styled code element');
    const chip = dialog.querySelector('.formula-content .manager-chip');
    assert.match(chip.textContent, /DC 12 · meet or beat/);
    assert.ok(chip.classList.contains('is-info'), chip.className);
    assert.ok(!chip.classList.contains('is-mono'), 'the DC chip is not mono');
    assert.ok(dialog.classList.contains('is-banded'), 'the prompt draws the banded library Modal');
    assert.ok(dialog.querySelector('.manager-modal-body > .fabricate-roll-prompt'), 'in a padded body');
    assert.ok(dialog.querySelector('[data-manager-modal-close]').classList.contains('is-size-26'));
    assert.ok(!dialog.querySelector('select'), 'no native select remains');
    const mode = modeTrigger(dialog);
    assert.equal(mode.getAttribute('name'), 'rollMode');
    assert.match(mode.textContent, /Public roll/);
    const caption = dialog.querySelector(`[id="${mode.getAttribute('aria-labelledby')}"]`);
    assert.equal(caption?.textContent, 'Roll mode', 'the caption names the roll-mode Select');
  });

  it('shows the exact selected modifiers, naming an unlabelled one and zeroing a non-finite value', async () => {
    const root = await harness.mount({ data: {
      ...base, comparison: 'exceed', chipText: 'DC 12 · beat',
      selectedModifiers: [choices[1], { value: 3 }, { label: 'Odd', value: 'n/a' }],
    } });
    assert.match(root.textContent, /DC 12 · beat/);
    const chips = [...root.querySelectorAll('.static-modifiers .manager-chip')];
    assert.deepEqual(chips.map((chip) => chip.textContent.trim()), ['B +1d4', 'Unnamed modifier +3', 'Odd 0']);
    assert.ok(chips[1].querySelector('i.fa-dice-d20'), 'an icon-less modifier takes the d20 glyph');
  });

  it('changes a native radio choice and spaces the legend', async () => {
    const root = await harness.mount({ data: { ...base, choicePlan: { options: choices, maxPicks: 1, defaultSelectedIds: ['b'] } } });
    const radios = [...root.querySelectorAll('input[type="radio"][name="craftingModifier"]')];
    assert.equal(radios.length, 3);
    assert.equal(radios.find((input) => input.checked)?.value, 'b');
    radios[0].click();
    flushSync();
    assert.equal(radios.find((input) => input.checked)?.value, 'a');
    assert.equal(root.querySelector('fieldset legend').textContent, 'Check modifier');
  });

  it('caps multipick checkboxes, then releases and replaces a choice', async () => {
    const root = await harness.mount({ data: { ...base, choicePlan: { options: choices, maxPicks: 2, defaultSelectedIds: ['a', 'b'] } } });
    assert.equal(root.querySelector('fieldset legend').textContent, 'Check modifier · Pick up to 2');
    const inputs = [...root.querySelectorAll('input[type="checkbox"][name="craftingModifier"]')];
    assert.equal(inputs.length, 3);
    assert.equal(inputs[2].disabled, true);
    assert.equal(inputs[1].getAttribute('aria-label'), 'B +1d4');
    inputs[0].click();
    flushSync();
    assert.equal(inputs[2].disabled, false);
    inputs[2].click();
    flushSync();
    assert.equal(inputs[2].checked, true);
    assert.equal(inputs[0].disabled, true);
  });

  it('lists each bulk need under its kicker and keeps the batch note on a count-only prompt', async () => {
    const root = await harness.mount({ data: bulk });
    const rows = [...root.querySelectorAll('.bulk-row')].map((row) => [
      row.querySelector('.bulk-name').textContent,
      row.querySelector('.bulk-need').textContent,
    ]);
    assert.deepEqual(rows, [['Ore', 'DC 18'], ['Scrap', 'No check'], ['Map', 'No single target']]);
    const group = root.querySelector('.bulk-group');
    assert.equal(group.firstElementChild.textContent, 'Rolls in this batch', 'the kicker sits above the list');
    assert.ok(group.querySelector('.bulk-list + .bulk-note'));
    harness.remount();
    const empty = await harness.mount({ data: { ...bulk, subtitle: '3 items', subjects: [] } });
    assert.ok(!empty.querySelector('.bulk-row'));
    assert.equal(empty.querySelector('.bulk-note')?.textContent, 'One choice applies to all');
    assert.ok(modeTrigger(empty), 'the roll mode is offered without subjects');
  });

  it('keeps Roll the only submit button, before Advantage, and one Roll unless advantage is strictly true', async () => {
    const root = await harness.mount({ data: { ...base, allowAdvantage: true } });
    const actions = [...root.querySelectorAll('.manager-modal-footer button')];
    assert.deepEqual(actions.map((button) => button.dataset.action), ['disadvantage', 'normal', 'advantage']);
    assert.deepEqual(actions.map((button) => button.type), ['button', 'submit', 'button']);
    assert.equal(root.querySelector('form').querySelector('button[type="submit"]').dataset.action, 'normal');
    assert.deepEqual(
      actions.map((button) => button.querySelector('.action-note')?.textContent ?? null),
      ['keep the worse', null, 'keep the better']
    );
    for (const allowAdvantage of [undefined, null, 'true', 1]) {
      harness.remount();
      const single = await harness.mount({ data: { ...base, allowAdvantage } });
      const buttons = [...single.querySelectorAll('.manager-modal-footer button')];
      assert.deepEqual(buttons.map((button) => button.dataset.action), ['roll'], String(allowAdvantage));
    }
  });

  it('submits radio, bonus and mode fields through every footer action on the real host path', async () => {
    for (const [action, advantage] of [['disadvantage', 'disadvantage'], ['normal', 'normal'], ['advantage', 'advantage']]) {
      document.body.replaceChildren();
      const data = { ...base, choicePlan: { options: choices, maxPicks: 1, defaultSelectedIds: ['b'] } };
      const { dialog, pending } = await openThroughHost(data, true);
      dialog.querySelector('input[value="c"]').click();
      flushSync();
      dialog.querySelector('input[name="situationalBonus"]').value = '+1d4';
      await chooseRollMode(dialog, 'gmroll');
      dialog.querySelector(`button[data-action="${action}"]`).click();
      assert.deepEqual(await pending, {
        confirmed: true, bonus: '1d4', rollMode: 'gmroll', advantage,
        chosenModifierIds: ['c'], chosenModifierId: 'c',
      });
    }
  });

  it('rolls normally when the form submits from the bonus field, in the client default mode', async () => {
    const restore = stubI18n({}, { rollMode: 'gmroll' });
    try {
      const { dialog, pending } = await openThroughHost(base, true, noChoice);
      const form = dialog.querySelector('form');
      assert.equal(form.querySelector('button[type="submit"]').dataset.action, 'normal');
      const bonus = form.elements.namedItem('situationalBonus');
      assert.match(modeTrigger(dialog).textContent, /Private GM roll/, 'the default mode reaches the Select');
      bonus.value = '2';
      form.requestSubmit();
      assert.deepEqual(await pending, { confirmed: true, bonus: '2', rollMode: 'gmroll', advantage: 'normal' });
    } finally {
      restore();
    }
  });

  it('moves focus in, traps Tab, and returns focus to the opener on close', async () => {
    const { root, opener, dialog, pending } = await openThroughHost(base, true);
    const bonus = dialog.querySelector('input[name="situationalBonus"]');
    assert.equal(document.activeElement, bonus, 'focus enters on the bonus field');
    const close = dialog.querySelector('[data-manager-modal-close]');
    const advantage = dialog.querySelector('button[data-action="advantage"]');
    advantage.focus();
    advantage.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, close, 'Tab from the last control wraps to the first');
    close.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, advantage, 'Shift+Tab from the first control wraps to the last');
    close.click();
    assert.deepEqual(await pending, { confirmed: false });
    assert.ok(!dialogOf(root), 'the prompt unmounted');
    await nextFrame();
    assert.equal(document.activeElement, opener, 'focus returned to the opener');
  });

  it('dismisses on Escape without letting Foundry see the key, and ignores an outside click', async () => {
    const { root, dialog, pending } = await openThroughHost(base, false);
    const seen = [];
    const onWindowKey = (event) => seen.push(event.key);
    document.defaultView.addEventListener('keydown', onWindowKey);
    try {
      root.dispatchEvent(new document.defaultView.MouseEvent('mousedown', { bubbles: true }));
      assert.ok(dialog.isConnected, 'a stray click does not cancel a roll');
      dialog.querySelector('input[name="situationalBonus"]')
        .dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      assert.deepEqual(await pending, { confirmed: false });
      assert.deepEqual(seen, [], 'Escape stopped at the prompt');
      assert.ok(!dialogOf(root));
    } finally {
      document.defaultView.removeEventListener('keydown', onWindowKey);
    }
  });

  it('resolves a double-activated Roll once and leaks no listener on any exit', async () => {
    const win = document.defaultView;
    const proto = win.EventTarget.prototype;
    const { addEventListener, removeEventListener } = proto;
    const live = new Set();
    proto.addEventListener = function add(type, listener, options) {
      if (this === document || this === win) live.add(JSON.stringify([this === win, type, String(listener)]));
      return addEventListener.call(this, type, listener, options);
    };
    proto.removeEventListener = function remove(type, listener, options) {
      if (this === document || this === win) live.delete(JSON.stringify([this === win, type, String(listener)]));
      return removeEventListener.call(this, type, listener, options);
    };
    try {
      const baseline = new Set(live);
      for (const exit of ['roll', 'escape', 'close']) {
        const { root, dialog, pending } = await openThroughHost(base, false);
        let settled = 0;
        pending.then(() => { settled += 1; });
        if (exit === 'roll') {
          const roll = dialog.querySelector('button[data-action="roll"]');
          roll.click();
          roll.click();
        } else if (exit === 'escape') {
          dialog.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } else {
          dialog.querySelector('[data-manager-modal-close]').click();
        }
        const result = await pending;
        await new Promise((settle) => setImmediate(settle));
        assert.equal(settled, 1, `${exit} settled once`);
        assert.equal(result.confirmed, exit === 'roll');
        assert.ok(!dialogOf(root), `${exit} unmounted the prompt`);
        root.remove();
      }
      assert.deepEqual([...live].filter((entry) => !baseline.has(entry)), [], 'no document or window listener survives');
    } finally {
      proto.addEventListener = addEventListener;
      proto.removeEventListener = removeEventListener;
    }
  });

  it('owns every key while trapped, yet still lets its own delegated handlers run', async () => {
    const { dialog, pending } = await openThroughHost(base, false);
    const seen = [];
    const onWindowKey = (event) => seen.push(event.key);
    document.defaultView.addEventListener('keydown', onWindowKey);
    try {
      const close = dialog.querySelector('[data-manager-modal-close]');
      close.focus();
      close.dispatchEvent(keydown('Tab'));
      close.dispatchEvent(keydown(' '));
      assert.deepEqual(seen, [], 'Foundry never sees Tab or Space from the close control');
      const trigger = modeTrigger(dialog);
      trigger.focus();
      trigger.dispatchEvent(keydown('ArrowDown'));
      await settleUi();
      assert.equal(trigger.getAttribute('aria-expanded'), 'true', 'the Select still opens from the keyboard');
      trigger.dispatchEvent(keydown('Escape'));
      await settleUi();
      assert.equal(trigger.getAttribute('aria-expanded'), 'false', 'Escape closes the open list');
      assert.ok(dialog.isConnected, 'and leaves the prompt open');
      dialog.querySelector('input[name="situationalBonus"]').dispatchEvent(keydown('Escape'));
      assert.deepEqual(await pending, { confirmed: false });
      assert.deepEqual(seen, [], 'no key escaped the trapped prompt');
    } finally {
      document.defaultView.removeEventListener('keydown', onWindowKey);
    }
  });

  it('returns focus to an opener re-enabled after the answer, else to the host, never to body', async () => {
    for (const reEnable of [true, false]) {
      document.body.replaceChildren();
      const { root, opener, dialog, pending } = await openThroughHost(base, false);
      opener.disabled = true;
      dialog.querySelector('button[data-action="roll"]').click();
      await pending;
      if (reEnable) queueMicrotask(() => (opener.disabled = false));
      await nextFrame();
      const expected = reEnable ? opener : root;
      assert.ok(document.activeElement === expected, `focus lands on the ${reEnable ? 'opener' : 'host'}`);
      assert.ok(document.activeElement !== document.body, 'focus never falls to the page');
    }
  });

  it('answers a dismissal when the window hosting it is removed', async () => {
    const { root, pending } = await openThroughHost(base, false);
    root.remove();
    assert.deepEqual(await pending, { confirmed: false });
    assert.ok(!dialogOf(root), 'the prompt unmounted with its window');
  });

  it('opens on a themed standalone layer with no app root, and removes it on close', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const previousError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    try {
      const pending = openRollPromptModal(base, { loadComponent: loadPrompt });
      let layer = null;
      for (let attempt = 0; attempt < 20 && !layer?.querySelector('[data-roll-prompt]'); attempt += 1) {
        await new Promise((settle) => setImmediate(settle));
        layer = document.querySelector('.fabricate-standalone-overlay');
      }
      assert.ok(layer?.querySelector('[data-roll-prompt]'), 'the prompt mounted into the standalone layer');
      layer.querySelector('[data-manager-modal-close]').click();
      assert.equal(await pending, null);
      assert.ok(!layer.isConnected, 'closing removes the layer');
      await nextFrame();
      assert.ok(document.activeElement === opener, 'focus returns to where it was');
      assert.deepEqual(errors, [], 'the standalone layer is not the missing-host fallback');
    } finally {
      console.error = previousError;
    }
  });

  it('answers once however often Roll is pressed, and claims the submit event', async () => {
    const answers = [];
    const root = await harness.mount({ data: base, onSubmit: (answer) => answers.push(answer) });
    const form = dialogOf(root).querySelector('form');
    const submit = new document.defaultView.Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);
    assert.equal(submit.defaultPrevented, true, 'the page never navigates on submit');
    form.querySelector('button[data-action="roll"]').click();
    assert.equal(answers.length, 1, 'the component settles once');
  });

  it('leaves a composing Escape to the input method editor', async () => {
    let dismissed = 0;
    const root = await harness.mount({ data: base, onDismiss: () => (dismissed += 1) });
    dialogOf(root).querySelector('input[name="situationalBonus"]').dispatchEvent(keydown('Escape', { isComposing: true }));
    assert.equal(dismissed, 0, 'Escape that ends a composition does not dismiss the prompt');
  });

  it('stops handling keys once it is destroyed', async () => {
    let dismissed = 0;
    const root = await harness.mount({ data: base, onDismiss: () => (dismissed += 1) });
    const dialog = dialogOf(root);
    harness.remount();
    dialog.dispatchEvent(keydown('Escape'));
    assert.equal(dismissed, 0, 'a destroyed prompt keeps no keydown listener');
  });

  it('submits the checked multipick modifiers', async () => {
    const data = { ...base, choicePlan: { options: choices, maxPicks: 2, defaultSelectedIds: ['a'] } };
    const { dialog, pending } = await openThroughHost(data, false);
    dialog.querySelector('input[type="checkbox"][value="c"]').click();
    flushSync();
    dialog.querySelector('button[data-action="roll"]').click();
    const answer = await pending;
    assert.deepEqual(answer.chosenModifierIds, ['a', 'c']);
  });

  it('names a roll-under target to stay under, and raises it with every modifier and bonus', async () => {
    const focus = [{ label: 'Focus', display: '+2' }];
    for (const [thresholdMode, text] of [['meet', 'Target 15 · stay at or under'], ['exceed', 'Target 15 · stay under']]) {
      document.body.replaceChildren();
      const view = buildSinglePromptData({
        displayFormula: '1d20', dc: 15, target: 15, direction: 'under', thresholdMode, selectedModifiers: focus,
      });
      const { dialog, pending } = await openThroughHost(view, false, noChoice);
      const chip = dialog.querySelector('.formula-content .manager-chip');
      assert.equal(chip.textContent.trim(), text);
      assert.equal(chip.dataset.rollPromptTarget, 'under');
      assert.ok(chip.classList.contains('is-info'), 'the DC chip primitive, retoned nowhere');
      assert.equal(chip.parentElement.className.split(' ')[0], 'formula-content', 'a fixed, unraised target: a bare chip');
      const note = dialog.querySelector('.formula-content .formula + .formula-note');
      assert.equal(note.textContent, 'The dice are compared as rolled.');
      assert.equal(dialog.querySelector('.static-modifiers .help').textContent, 'Each raises the target.');
      assert.equal(
        dialog.querySelector('.bonus-group .help').textContent,
        'A bonus raises the target. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
      );
      dialog.querySelector('[data-manager-modal-close]').click();
      await pending;
    }
  });

  it('explains a roll-under target beside its chip, and moves both with the picked modifiers', async () => {
    const targetBasis = {
      expression: '@skills.smith.level', value: 12, adjustment: { kind: 'add', value: -2, label: 'Hard Work' },
    };
    const view = buildSinglePromptData({
      displayFormula: '1d20', dc: 10, target: 10, direction: 'under', targetBasis,
      selectedModifiers: [{ label: 'Steady hands', value: 1, display: '+1' }],
    });
    const frame = await openThroughHost(view, false, noChoice);
    const row = frame.dialog.querySelector('.formula-content > .target-row');
    assert.deepEqual([...row.children].map((child) => child.textContent.trim()), [
      'Target 11 · stay at or under', '@skills.smith.level 12 · Hard Work -2 · modifiers +1',
    ], 'frame 29: the chip, then its explanation on the same row');
    assert.equal(row.querySelector('.manager-chip').dataset.rollPromptTarget, 'under');
    frame.dialog.querySelector('[data-manager-modal-close]').click();
    await frame.pending;

    document.body.replaceChildren();
    const options = [
      { id: 'a', label: 'A', value: 1, display: '+1' },
      { id: 'b', label: 'B', value: null, display: '+1d4' },
      { id: 'c', label: 'C', value: 3, display: '+3' },
    ];
    const picks = { options, maxPicks: 1, defaultSelectedIds: ['a'] };
    const { dialog, pending } = await openThroughHost({ ...view, selectedModifiers: [] }, false, picks);
    const shown = () => [...dialog.querySelectorAll('.target-row > *')].map((child) => child.textContent.trim());
    assert.deepEqual(shown(), ['Target 11 · stay at or under', '@skills.smith.level 12 · Hard Work -2 · modifiers +1']);
    dialog.querySelector('input[type="radio"][value="c"]').click();
    flushSync();
    assert.deepEqual(shown(), ['Target 13 · stay at or under', '@skills.smith.level 12 · Hard Work -2 · modifiers +3']);
    dialog.querySelector('input[type="radio"][value="b"]').click();
    flushSync();
    assert.deepEqual(shown(), ['Target 10 · stay at or under', '@skills.smith.level 12 · Hard Work -2'], 'a rolled pick adds nothing yet');
    dialog.querySelector('input[name="situationalBonus"]').value = '4';
    dialog.querySelector('input[name="situationalBonus"]').dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    flushSync();
    assert.equal(shown()[0], 'Target 10 · stay at or under', 'a typed bonus is applied once rolled, not before');
    dialog.querySelector('[data-manager-modal-close]').click();
    await pending;
  });

  it('keeps a roll-over prompt byte-identical, whether or not it names a direction', async () => {
    const focus = [{ label: 'Focus', display: '+2' }];
    const rendered = [];
    for (const extra of [{}, { target: 12, direction: 'over' }]) {
      document.body.replaceChildren();
      const view = buildSinglePromptData({ displayFormula: '1d20', dc: 12, selectedModifiers: focus, ...extra });
      const { dialog, pending } = await openThroughHost(view, false, noChoice);
      const chip = dialog.querySelector('.formula-content .manager-chip');
      assert.equal(chip.textContent.trim(), 'DC 12 · meet or beat');
      assert.ok(!chip.hasAttribute('data-roll-prompt-target'), 'no target hook on a roll-over chip');
      assert.equal(dialog.querySelector('.target-row, .target-source'), null, 'no target explanation over');
      assert.equal(dialog.querySelector('.formula-note'), null, 'no compared-as-rolled note over');
      assert.ok(!chip.hasAttribute('data-roll-prompt-required'), 'no successes hook on a DC chip');
      assert.ok(!dialog.querySelector('[data-roll-prompt-count]'), 'no count hook on a summed formula');
      assert.equal(dialog.querySelector('.static-modifiers .help').textContent, 'Each adds to the total.');
      assert.equal(
        dialog.querySelector('.bonus-group .help').textContent,
        'A bonus adds to the total. A rolled bonus such as 1d4 is rolled with the check.'
      );
      rendered.push(dialog.querySelector('.fabricate-roll-prompt').innerHTML.replaceAll(/id="[^"]*"|aria-labelledby="[^"]*"/g, ''));
      dialog.querySelector('[data-manager-modal-close]').click();
      await pending;
    }
    assert.equal(rendered[1], rendered[0], 'a named roll-over direction renders the same markup as none');
  });

  it('shows a count check its pool line and successes chip, in both directions and destinations', async () => {
    const focus = [{ label: 'Focus', display: '+2', value: 2 }];
    const cases = [
      {
        input: {
          direction: 'over', comparison: 'meet', pool: 6, die: 10, threshold: 8, required: 2, modifierDestination: 'pool',
          explode: { kind: 'best', value: null, once: false }, cancel: { kind: 'worst', value: null },
        },
        formula: '6d10 · each ≥ 8', chip: '2 successes needed', note: 'Each adds dice.',
        rules: 'Success on ≥ 8 · best face explodes · worst face cancels',
        help: 'A bonus adds that many dice. A rolled bonus such as 1d4 is rolled first, and its result is applied.',
      },
      {
        input: {
          direction: 'under', comparison: 'exceed', pool: 3, die: 20, threshold: 13, required: 1, modifierDestination: 'threshold',
          thresholdSource: '@abilities.int.mod + 10',
        },
        formula: '3d20 · each < 13', chip: '1 success needed', note: 'Each moves the threshold.',
        rules: 'Success on < 13 (@abilities.int.mod + 10)',
        help: 'A bonus moves the threshold by that much. A rolled bonus such as 1d4 is rolled first, and its result is applied.',
      },
    ];
    for (const { input, formula, chip: chipText, note, rules, help } of cases) {
      document.body.replaceChildren();
      const view = buildSinglePromptData({
        product: 'count', displayFormula: '1d20 + 3', dc: 12, target: 12, selectedModifiers: focus, ...input,
      });
      const { dialog, pending } = await openThroughHost(view, false, noChoice);
      const line = dialog.querySelector('.formula-content .formula');
      assert.equal(line.textContent, formula, 'the pool line, never the retained 1d20 + 3');
      assert.equal(line.dataset.rollPromptCount, input.direction);
      const ruleLine = line.nextElementSibling;
      assert.ok(ruleLine.matches('p.help.formula-note'), 'frames 30 and 35: the rule sits under the pool line');
      assert.equal(ruleLine.textContent.trim(), rules);
      assert.ok(ruleLine.nextElementSibling.matches('.manager-chip'), 'and above the successes chip');
      const chips = [...dialog.querySelectorAll('.formula-content .manager-chip')];
      assert.equal(chips.length, 1);
      assert.equal(chips[0].textContent.trim(), chipText);
      assert.equal(chips[0].dataset.rollPromptRequired, String(input.required));
      assert.ok(chips[0].classList.contains('is-info'), 'the DC chip primitive, retoned nowhere');
      assert.ok(!chips[0].hasAttribute('data-roll-prompt-target'));
      assert.equal(dialog.querySelector('.target-row, .target-source'), null, 'a count explains no target');
      assert.ok(!/DC|meet or beat|beat/.test(dialog.querySelector('.formula-row').textContent), 'no DC');
      assert.equal(dialog.querySelector('.static-modifiers .help').textContent, note);
      assert.equal(dialog.querySelector('.bonus-group .help').textContent, help);
      assert.ok(!dialog.querySelector('button[data-action="advantage"]'), 'no advantage until issue 2007');
      dialog.querySelector('[data-manager-modal-close]').click();
      await pending;
    }
  });

  it('shows a count prompt whose pool is hidden no pool line, rule or chip, only its wording', async () => {
    const view = buildSinglePromptData({
      product: 'count', direction: 'under', comparison: 'exceed', modifierDestination: 'threshold',
      displayFormula: '1d20 + 3', dc: 12,
    });
    const { dialog, pending } = await openThroughHost(view, false, noChoice);
    assert.equal(dialog.querySelector('.formula-row'), null, 'no pool, threshold or count to show');
    assert.ok(!/\d/.test(dialog.querySelector('.fabricate-roll-prompt').textContent.replace('1d4', '')), 'no number');
    assert.equal(
      dialog.querySelector('.bonus-group .help').textContent,
      'A bonus moves the threshold by that much. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    );
    dialog.querySelector('[data-manager-modal-close]').click();
    await pending;
  });

  it('shows a progressive count check its pool line and no successes chip', async () => {
    const view = buildSinglePromptData({
      product: 'count', direction: 'over', pool: 4, die: 6, threshold: 5, required: null, modifierDestination: 'pool',
    });
    const { dialog, pending } = await openThroughHost(view, false, noChoice);
    assert.equal(dialog.querySelector('.formula-content .formula').textContent, '4d6 · each ≥ 5');
    assert.equal(dialog.querySelector('.formula-note').textContent.trim(), 'Success on ≥ 5');
    assert.ok(!dialog.querySelector('.formula-content .manager-chip'), 'a budget has no count to reach');
    dialog.querySelector('[data-manager-modal-close]').click();
    await pending;
  });

  it('shows the base formula once and itemises each applied modifier as a chip', async () => {
    const view = buildSinglePromptData({
      formula: '1d20 + 3 + 6[Modifiers]', resolvedFormula: '1d20 + 3 + 6[Modifiers]',
      displayFormula: '1d20 + 3', selectedModifiers: [{ label: 'Focus', display: '+6' }],
    });
    const { dialog, pending } = await openThroughHost(view, false, noChoice);
    assert.equal(dialog.querySelector('.formula').textContent, '1d20 + 3');
    const chips = [...dialog.querySelectorAll('.static-modifiers .manager-chip')];
    assert.deepEqual(chips.map((chip) => chip.textContent.trim()), ['Focus +6']);
    dialog.querySelector('[data-manager-modal-close]').click();
    await pending;
  });
});
