import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'svelte';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  ROLL_PROMPT_COMPILED_MODULES,
  ROLL_PROMPT_PATH as PROMPT,
  ROLL_PROMPT_RAW_MODULES,
} from '../helpers/rollPromptHarnessModules.js';
import { stubI18n } from '../helpers/rollPromptDialogStub.js';
import { intersectAdvantageOffers, resolveAdvantageOffer } from '../../src/systems/checkAdvantage.js';
import {
  buildBulkPromptData,
  buildSinglePromptData,
  overrideRollPromptSurface,
  promptActions,
  promptBulkCheckRoll,
  promptCheckRoll,
  waitForPrompt,
} from '../../src/ui/svelte/apps/crafting/rollPrompt.js';
import { openRollPromptModal } from '../../src/ui/svelte/apps/crafting/rollPromptHost.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-roll-prompt-',
  componentPath: PROMPT,
  rawModules: ROLL_PROMPT_RAW_MODULES,
  compiledModules: ROLL_PROMPT_COMPILED_MODULES,
  rootClass: 'fabricate fabricate-app',
});

const labels = {
  modifiers: 'Modifiers', modifierChoice: 'Check modifier', unnamedModifier: 'Unnamed modifier',
  unnamedSubject: 'Unnamed item', dcValue: 'DC {dc}', pickUpTo: 'Pick up to 2',
  eachAdds: 'Each adds', bonus: 'Situational bonus', bonusPlaceholder: '+2 or 1d4',
  bonusHelp: 'A bonus adds', rollMode: 'Roll mode', meet: 'meet or beat', exceed: 'beat',
  bulkNote: 'One choice applies to all', bulkRows: 'Rolls in this batch', noCheck: 'No check',
  noSingleTarget: 'No single target', roll: 'Roll', advantage: 'Advantage', disadvantage: 'Disadvantage', close: 'Close',
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
  actions: promptActions(null, labels),
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

/** Open a prompt through `start(open)` on the real host, over an application root holding focus. */
async function openFocused(start) {
  const root = document.createElement('div');
  root.className = 'fabricate fabricate-app';
  const opener = document.createElement('button');
  root.append(opener);
  document.body.append(root);
  opener.focus();
  const pending = start((view) => openRollPromptModal(view, { loadComponent: loadPrompt }));
  for (let attempt = 0; attempt < 20 && !dialogOf(root); attempt += 1) {
    await new Promise((settle) => setImmediate(settle));
  }
  const dialog = dialogOf(root);
  assert.ok(dialog, 'the prompt mounted into the application root');
  return { root, opener, dialog, pending };
}

/** The real path: adapter, host and compiled prompt. */
const openThroughHost = (data, allowAdvantage, choicePlan = data.choicePlan) =>
  openFocused((open) => waitForPrompt(data, allowAdvantage, choicePlan, open));

/** The public entry point (`promptCheckRoll`, `promptBulkCheckRoll`) with the host as its surface. */
const openThroughEntry = (start) =>
  openFocused((open) => {
    const restore = overrideRollPromptSurface(open);
    try {
      return start();
    } finally {
      restore();
    }
  });

/** Each footer button as `[action, note, accessible name, title]`. */
const footerOf = (dialog) =>
  [...dialog.querySelectorAll(':scope .manager-modal-footer button')].map((button) => [
    button.dataset.action,
    button.querySelector('.action-note')?.textContent ?? '',
    button.getAttribute('aria-label'),
    button.getAttribute('title') ?? '',
  ]);

const sumOver = { product: 'sum', direction: 'over' };
const sumUnder = { product: 'sum', direction: 'under' };
/** Any class stands in for core's `Die`, whose presence alone lets a keep offer stand. */
const CORE_DIE = class Die {};
const offerFor = (advantage, evaluation = sumOver, authoredFormula = '1d20 + 3') =>
  resolveAdvantageOffer({ advantage, evaluation, authoredFormula, Die: CORE_DIE });
const DECISION = { disadvantage: 'disadvantage', normal: 'normal', advantage: 'advantage', roll: 'normal' };

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

  it('keeps Roll the only submit button, between the outer actions, and one Roll for an empty offer', async () => {
    const keep = { advantage: true, disadvantage: true, kind: 'keep', detail: null };
    const root = await harness.mount({ data: { ...base, actions: promptActions(keep, labels) } });
    const actions = [...root.querySelectorAll('.manager-modal-footer button')];
    assert.deepEqual(actions.map((button) => button.dataset.action), ['disadvantage', 'normal', 'advantage']);
    assert.deepEqual(actions.map((button) => button.type), ['button', 'submit', 'button']);
    assert.equal(root.querySelector('form').querySelector('button[type="submit"]').dataset.action, 'normal');
    assert.deepEqual(
      actions.map((button) => button.querySelector('.action-note')?.textContent ?? null),
      ['keep the worse', null, 'keep the better']
    );
    for (const offer of [undefined, null, { advantage: 'true', disadvantage: true, kind: 'keep' }]) {
      harness.remount();
      const single = await harness.mount({ data: { ...base, actions: promptActions(offer, labels) } });
      const buttons = [...single.querySelectorAll('.manager-modal-footer button')];
      assert.deepEqual(buttons.map((button) => button.dataset.action), ['roll'], JSON.stringify(offer));
      assert.equal(buttons[0].type, 'submit');
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
      assert.equal(chip.parentElement.className.split(' ')[0], 'target-live', 'a bare chip in its live region');
      assert.equal(chip.parentElement.parentElement.className.split(' ')[0], 'formula-content');
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
      displayFormula: '1d20', dc: 10, target: 10, direction: 'under', targetBasis, actorName: 'Sera Vane',
      selectedModifiers: [{ label: 'Steady hands', value: 1, display: '+1' }],
    });
    const frame = await openThroughHost(view, false, noChoice);
    const row = frame.dialog.querySelector('.formula-content .target-row');
    assert.deepEqual([...row.children].map((child) => child.textContent.trim()), [
      'Target 11 · stay at or under', 'Sera Vane @skills.smith.level 12 · Hard Work −2 · modifiers +1',
    ], 'frame 29: the chip, then its explanation naming the character, on the same row');
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
    assert.equal(
      dialog.querySelector('.modifier-group .help').textContent.trim(),
      'Each raises the target.',
      'a roll-under pick says what it does, as an applied modifier does (F14)'
    );
    assert.deepEqual(shown(), ['Target 11 · stay at or under', 'Sera Vane @skills.smith.level 12 · Hard Work −2 · modifiers +1']);
    dialog.querySelector('input[type="radio"][value="c"]').click();
    flushSync();
    assert.deepEqual(shown(), ['Target 13 · stay at or under', 'Sera Vane @skills.smith.level 12 · Hard Work −2 · modifiers +3']);
    dialog.querySelector('input[type="radio"][value="b"]').click();
    flushSync();
    assert.deepEqual(
      shown(),
      ['Target 10 + 1d4 · stay at or under', 'Sera Vane @skills.smith.level 12 · Hard Work −2'],
      'a rolled pick is pending, never averaged into the target (issue 2005)'
    );
    dialog.querySelector('input[name="situationalBonus"]').value = '4';
    dialog.querySelector('input[name="situationalBonus"]').dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    flushSync();
    assert.deepEqual(
      shown(),
      ['Target 14 + 1d4 · stay at or under', 'Sera Vane @skills.smith.level 12 · Hard Work −2 · situational +4'],
      'a typed number raises the target as it is typed'
    );
    dialog.querySelector('[data-manager-modal-close]').click();
    await pending;
  });

  it('names a typed rolled bonus as pending, in a live region, and draws no number for it (Q8)', async () => {
    const view = buildSinglePromptData({ displayFormula: '1d20', dc: 12, target: 12, direction: 'under' });
    const { dialog, pending } = await openThroughHost(view, false, noChoice);
    const chip = () => dialog.querySelector('.formula-content .manager-chip');
    const region = dialog.querySelector('.formula-content [aria-live]');
    assert.equal(region.getAttribute('aria-live'), 'polite', 'the roll-under target announces');
    assert.ok(region.contains(chip()), 'from one region around the chip');
    const bonus = dialog.querySelector('input[name="situationalBonus"]');
    for (const [typed, text] of [
      ['1d4', 'Target 12 + 1d4 · stay at or under'],
      ['+2', 'Target 14 · stay at or under'],
      ['', 'Target 12 · stay at or under'],
    ]) {
      bonus.value = typed;
      bonus.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
      flushSync();
      assert.equal(chip().textContent.trim(), text, `typed ${JSON.stringify(typed)}`);
    }
    assert.doesNotMatch(chip().textContent, /meet or beat/, 'never the roll-over comparison under');
    const row = dialog.querySelector('.target-row');
    bonus.value = '2';
    bonus.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    flushSync();
    assert.ok(!row, 'an unraised fixed target starts as a bare chip');
    assert.ok(dialog.querySelector('.target-row'), 'a raised one gains its line');
    assert.ok(
      dialog.querySelector('.formula-content [aria-live]') === region,
      'the live region is the same node before and after typing, so it announces the change (R2)'
    );
    assert.equal(dialog.querySelectorAll('[aria-live]').length, 1, 'and it is the only one');
    dialog.querySelector('[data-manager-modal-close]').click();
    await pending;
  });

  it('shows no bonus field, caption or help when the check offers none, and focus lands on Roll (Q6)', async () => {
    for (const offer of [undefined, false]) {
      document.body.replaceChildren();
      const view = buildSinglePromptData({ displayFormula: '1d20', dc: 12, offerSituationalBonus: offer });
      const { dialog, pending } = await openThroughHost(view, false, noChoice);
      const input = dialog.querySelector('input[name="situationalBonus"]');
      if (offer === false) {
        assert.ok(!input, 'no bonus input');
        assert.ok(!dialog.querySelector('.bonus-group'), 'and no group around one');
        assert.doesNotMatch(dialog.textContent, /Situational bonus|A bonus adds/, 'no caption or help');
        assert.equal(document.activeElement, dialog.querySelector('button[type="submit"]'));
      } else {
        assert.equal(document.activeElement, input, 'positive control: the offer focuses the field');
      }
      dialog.querySelector('form').requestSubmit();
      const answer = await pending;
      assert.equal(answer.confirmed, true, 'Enter still rolls');
      assert.equal(answer.bonus, null);
    }
  });

  it('hides a bulk bonus only when every row with a check declines the offer (Q6)', async () => {
    const rows = (offers) =>
      offers.map((offerSituationalBonus, index) => ({
        name: `Row ${index}`,
        need: { kind: 'dc', dc: 10 + index },
        offerSituationalBonus,
      }));
    for (const [offers, shown] of [
      [[false, false], false],
      [[false, true], true],
      [[false, undefined], true],
    ]) {
      document.body.replaceChildren();
      const view = buildBulkPromptData({
        count: offers.length,
        subjects: [...rows(offers), { name: 'Scrap', need: { kind: 'noCheck' }, offerSituationalBonus: true }],
      });
      const { dialog, pending } = await openThroughHost(view, false, noChoice);
      assert.equal(Boolean(dialog.querySelector('input[name="situationalBonus"]')), shown, JSON.stringify(offers));
      if (!shown) assert.equal(document.activeElement, dialog.querySelector('button[type="submit"]'));
      dialog.querySelector('[data-manager-modal-close]').click();
      await pending;
    }
  });

  it('gives a roll-over pick no help line (F14 leaves roll-high unchanged)', async () => {
    const picks = { options: [{ id: 'a', label: 'A', value: 1, display: '+1' }], maxPicks: 1, defaultSelectedIds: ['a'] };
    const view = buildSinglePromptData({ displayFormula: '1d20', dc: 12, target: 12, direction: 'over' });
    const { dialog, pending } = await openThroughHost(view, false, picks);
    assert.ok(dialog.querySelector('.modifier-group'), 'positive control: the picks render');
    assert.ok(!dialog.querySelector('.modifier-group .help'));
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
          explode: { kind: 'best', face: 10, once: false }, cancel: { kind: 'worst', face: 1 },
        },
        formula: '8d10 · each ≥ 8', chip: '2 successes needed', note: 'Each adds dice.',
        rules: 'Success on ≥ 8 · explodes on 10 · 1 cancels a success',
        help: 'A bonus adds that many dice. A rolled bonus such as 1d4 is rolled first, and its result is applied.',
      },
      {
        input: {
          direction: 'under', comparison: 'exceed', pool: 3, die: 20, threshold: 13, required: 1, modifierDestination: 'threshold',
          thresholdSource: 'character', thresholdAnchor: 13,
        },
        formula: '3d20 · each < 15', chip: '1 success needed', note: 'Each moves the threshold.',
        rules: 'Success on < 15 (character value 13), moved +2 by modifiers',
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
      assert.equal(line.textContent, formula, 'the pool line settled by Focus +2, never the retained 1d20 + 3');
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

  it('settles the count line and its note as the player picks and types, never naming a default face (N30)', async () => {
    const picks = {
      options: [
        { id: 'a', label: 'Steady', value: 1, display: '+1' },
        { id: 'b', label: 'Luck', value: null, display: '+1d4' },
      ],
      maxPicks: 2,
      defaultSelectedIds: ['a'],
    };
    const view = buildSinglePromptData({
      product: 'count', direction: 'over', comparison: 'meet', pool: 6, die: 10, threshold: 8, thresholdAnchor: 8,
      thresholdSource: 'fixed', required: 2, modifierDestination: 'threshold',
      explode: { kind: 'from', face: 9, once: true }, displayFormula: '1d20 + @skills.smith.rank', dc: 15,
    });
    const { dialog, pending } = await openThroughHost(view, false, picks);
    const line = () => dialog.querySelector('.formula-content .formula');
    const note = () => dialog.querySelector('.formula-content .formula-note').textContent.trim();
    assert.equal(line().getAttribute('aria-live'), 'polite', 'the settled line announces each change');
    assert.equal(line().textContent, '6d10 · each ≥ 7', 'the default pick already moved the threshold');
    assert.equal(note(), 'Success on ≥ 7, moved +1 by modifiers · explodes on 9 or above once');
    dialog.querySelectorAll('input[name="craftingModifier"]')[1].click();
    flushSync();
    assert.equal(line().textContent, '6d10 · each ≥ 7 + 1d4', 'a rolled pick is pending, never averaged');
    const bonus = dialog.querySelector('input[name="situationalBonus"]');
    bonus.value = '+2';
    bonus.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    flushSync();
    assert.equal(line().textContent, '6d10 · each ≥ 5 + 1d4');
    assert.equal(note(), 'Success on ≥ 5, moved +3 by modifiers · explodes on 9 or above once');
    dialog.querySelectorAll('input[name="craftingModifier"]')[0].click();
    flushSync();
    assert.equal(line().textContent, '6d10 · each ≥ 6 + 1d4', 'unpicking a flat modifier gives its step back');
    const shown = dialog.querySelector('.formula-row').textContent;
    assert.ok(!/explodes on 10|@|DC|1d20|15/.test(shown), 'no default face, expression, path, DC or formula');
    dialog.querySelector('[data-manager-modal-close]').click();
    await pending;
  });

  it('warns that a pool reduced to zero fails, and still rolls (issue 2006)', async () => {
    const view = buildSinglePromptData({
      product: 'count', direction: 'over', comparison: 'meet', pool: 1, die: 6, threshold: 5, thresholdAnchor: 5,
      thresholdSource: 'fixed', required: null, modifierDestination: 'pool', zeroPoolFails: true,
    });
    const { dialog, pending } = await openThroughHost(view, false, noChoice);
    const notice = () => dialog.querySelector('[data-roll-prompt-zero-pool]');
    assert.ok(!notice(), 'a pool holding a die claims no automatic failure');
    const bonus = dialog.querySelector('input[name="situationalBonus"]');
    const type = (value) => {
      bonus.value = value;
      bonus.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
      flushSync();
    };
    type('-1');
    assert.equal(dialog.querySelector('.formula-content .formula').textContent, '0d6 · each ≥ 5');
    assert.ok(Boolean(notice()), 'the zero-pool notice shows');
    assert.equal(notice().textContent.trim(), 'This roll fails automatically: the pool is reduced to zero.');
    assert.deepEqual([notice().dataset.noticeTone, notice().getAttribute('role')], ['warning', 'status']);
    const roll = dialog.querySelector('button[type="submit"]');
    assert.equal(roll.disabled, false, 'Roll stays enabled');
    type('');
    assert.ok(!notice(), 'and it leaves once the pool holds a die again');
    type('-3');
    dialog.querySelector('form').requestSubmit();
    const answer = await pending;
    assert.deepEqual([answer.confirmed, answer.bonus], [true, '-3'], 'the player can still roll it');
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
  it('offers each check its own buttons and notes, and every button answers its own choice (issue 2007)', async () => {
    const keep = [['disadvantage', 'keep the worse'], ['normal', ''], ['advantage', 'keep the better']];
    const cases = [
      ['keep over', offerFor({ mode: 'keep' }), keep],
      ['keep under', offerFor({ mode: 'keep' }, sumUnder, '1d20'), keep],
      ['keep, two dice', offerFor({ mode: 'keep', extraDice: 2 }, sumOver, '2d6 + @prof'), keep],
      ['bonus over', offerFor({ mode: 'bonus', bonusExpression: '1d6' }), [
        ['disadvantage', '−1d6 to the total'], ['normal', ''], ['advantage', '+1d6 to the total'],
      ]],
      ['bonus under', offerFor({ mode: 'bonus', bonusExpression: ' +1d8 + 1 ' }, sumUnder, '1d20'), [
        ['disadvantage', '−(1d8 + 1) to the target'], ['normal', ''], ['advantage', '+(1d8 + 1) to the target'],
      ]],
      ['bonus, no disadvantage', offerFor({ mode: 'bonus', bonusExpression: '1d6', offerDisadvantage: false }), [
        ['normal', ''], ['advantage', '+1d6 to the total'],
      ]],
      ['keep, no disadvantage', offerFor({ mode: 'keep', offerDisadvantage: false }), [
        ['normal', ''], ['advantage', 'keep the better'],
      ]],
      ['count', offerFor({}, { product: 'count' }, ''), [['disadvantage', '−1 die'], ['normal', ''], ['advantage', '+1 die']]],
      ['count, three dice', offerFor({ countDice: 3 }, { product: 'count' }), [
        ['disadvantage', '−3 dice'], ['normal', ''], ['advantage', '+3 dice'],
      ]],
      ['off', offerFor({ mode: 'off' }), [['roll', '']]],
      ['keep, no plain first group', offerFor({ mode: 'keep' }, sumOver, '(1d20 + 2) * 2'), [['roll', '']]],
      ['count, disabled', offerFor({ countEnabled: false }, { product: 'count' }), [['roll', '']]],
    ];
    const name = { disadvantage: 'Disadvantage', normal: 'Roll', advantage: 'Advantage', roll: 'Roll' };
    for (const [label, advantageOffer, expected] of cases) {
      for (const [clicked] of expected) {
        document.body.replaceChildren();
        const { dialog, pending } = await openThroughEntry(() =>
          promptCheckRoll({ displayFormula: '1d20 + 3', dc: 12, allowAdvantage: advantageOffer.advantage, advantageOffer })
        );
        // `title` stays empty here: happy-dom's zeroed scrollWidth/clientWidth never overflow, so
        // none of these untruncated notes duplicate onto `title` (UX-L1; the truncated case is
        // proven below with an overridden layout).
        assert.deepEqual(
          footerOf(dialog),
          expected.map(([action, note]) => [action, note, note ? `${name[action]}, ${note}` : name[action], '']),
          label
        );
        assert.deepEqual(
          [...dialog.querySelectorAll(':scope .manager-modal-footer button[type="submit"]')].map((button) => button.dataset.action),
          [expected.length === 1 ? 'roll' : 'normal'],
          `${label}: Roll is the only submit`
        );
        assert.ok(!dialog.querySelector(':scope .manager-modal-footer i'), `${label}: no footer glyph`);
        dialog.querySelector(`:scope .manager-modal-footer button[data-action="${clicked}"]`).click();
        assert.equal((await pending).advantage, DECISION[clicked], `${label}: ${clicked}`);
      }
    }
  });

  it('adds a title only once the footer note actually clips (issue 2007 UX-L1)', async () => {
    const keep = { advantage: true, disadvantage: true, kind: 'keep', detail: null };
    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(globalThis.Element.prototype, 'scrollWidth');
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(globalThis.HTMLElement.prototype, 'clientWidth');
    // happy-dom never lays out real pixels, so the note is stubbed to overflow its box the way a
    // real browser's ellipsis would once the text is longer than the button can show on one line.
    Object.defineProperty(globalThis.Element.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return this.classList?.contains('action-note') ? 200 : scrollWidthDescriptor.get.call(this);
      },
    });
    Object.defineProperty(globalThis.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.classList?.contains('action-note') ? 80 : clientWidthDescriptor.get.call(this);
      },
    });
    try {
      const { dialog, pending } = await openThroughEntry(() =>
        promptCheckRoll({ displayFormula: '1d20 + 3', dc: 12, allowAdvantage: true, advantageOffer: keep })
      );
      const advantage = dialog.querySelector('button[data-action="advantage"]');
      assert.equal(advantage.getAttribute('title'), 'keep the better', 'the clipped note becomes the title');
      assert.equal(advantage.getAttribute('aria-label'), 'Advantage, keep the better', 'unchanged');
      dialog.querySelector('button[data-action="normal"]').click();
      await pending;
    } finally {
      Object.defineProperty(globalThis.Element.prototype, 'scrollWidth', scrollWidthDescriptor);
      Object.defineProperty(globalThis.HTMLElement.prototype, 'clientWidth', clientWidthDescriptor);
    }
  });

  it('offers a batch only what every roll in it offers, and a note only when every roll agrees (issue 2007)', async () => {
    const keepOver = offerFor({ mode: 'keep' });
    const keepUnder = offerFor({ mode: 'keep' }, sumUnder, '1d20');
    const count = offerFor({}, { product: 'count' });
    const bonus = (bonusExpression) => offerFor({ mode: 'bonus', bonusExpression });
    const bare = [['disadvantage', ''], ['normal', ''], ['advantage', '']];
    const cases = [
      ['keep over and under', [keepOver, keepUnder], [['disadvantage', 'keep the worse'], ['normal', ''], ['advantage', 'keep the better']]],
      ['keep and count', [keepOver, count], bare],
      ['bonus 1d6 and 1d8', [bonus('1d6'), bonus('1d8')], bare],
      ['one off subject', [keepOver, offerFor({ mode: 'off' })], [['roll', '']]],
      ['one without disadvantage', [keepOver, offerFor({ mode: 'keep', offerDisadvantage: false })], [
        ['normal', ''], ['advantage', 'keep the better'],
      ]],
    ];
    const subjects = [{ name: 'Ore', need: { kind: 'dc', dc: 12 } }, { name: 'Scrap', need: { kind: 'dc', dc: 14 } }];
    for (const [label, offers, expected] of cases) {
      const advantageOffer = intersectAdvantageOffers(offers);
      const [clicked] = expected.at(-1);
      document.body.replaceChildren();
      const { dialog, pending } = await openThroughEntry(() =>
        promptBulkCheckRoll({ allowAdvantage: advantageOffer.advantage, advantageOffer, count: 2, subjects })
      );
      assert.equal(dialog.dataset.rollPrompt, 'bulk');
      assert.deepEqual(footerOf(dialog).map(([action, note]) => [action, note]), expected, label);
      dialog.querySelector(`:scope .manager-modal-footer button[data-action="${clicked}"]`).click();
      assert.equal((await pending).advantage, DECISION[clicked], `${label}: ${clicked}`);
    }
  });
});
