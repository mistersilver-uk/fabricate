import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'svelte';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { stubI18n } from '../helpers/rollPromptDialogStub.js';
import { waitForPrompt } from '../../src/ui/svelte/apps/crafting/rollPrompt.js';
import { openRollPromptModal } from '../../src/ui/svelte/apps/crafting/rollPromptHost.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PROMPT = 'src/ui/svelte/apps/crafting/RollPrompt.svelte';
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-roll-prompt-',
  componentPath: PROMPT,
  rawModules: [
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/overlayHost.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/apps/manager/ManagerModal.svelte',
    PROMPT,
  ],
  rootClass: 'fabricate fabricate-app',
});

const labels = {
  modifiers: 'Modifiers', modifierChoice: 'Check modifier', unnamedModifier: 'Unnamed modifier',
  unnamedSubject: 'Unnamed item', dcValue: 'DC {dc}', pickUpTo: 'Pick up to {count}',
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
  dc: 12, comparison: 'meet', selectedModifiers: [], labels, rollModes: modes,
  defaultRollMode: 'publicroll', choicePlan: noChoice, allowAdvantage: false,
};
const bulk = {
  ...base, kind: 'bulk', title: 'Salvage checks', subtitle: 'Brenna · 3 items', subjects: [
    { name: 'Ore', need: { kind: 'dc', dc: 18 } },
    { name: 'Scrap', need: { kind: 'noCheck' } },
    { name: 'Map', need: { kind: 'noSingleTarget' } },
  ],
};

const dialogOf = (root) => root.querySelector('[data-roll-prompt]');
const loadPrompt = () => harness.loadRuneModule(PROMPT);

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
    const mode = dialog.querySelector('select[name="rollMode"]');
    assert.equal(mode.value, 'publicroll');
    assert.equal(mode.selectedOptions[0].textContent, 'Public roll');
    assert.ok(dialog.querySelector('.mode-control .fa-chevron-down'));
  });

  it('shows the exact selected modifiers, naming an unlabelled one and zeroing a non-finite value', async () => {
    const root = await harness.mount({ data: {
      ...base, comparison: 'exceed',
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
    assert.ok(empty.querySelector('select[name="rollMode"]'));
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
      dialog.querySelector('select[name="rollMode"]').value = 'gmroll';
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
      assert.equal(dialog.querySelector('select[name="rollMode"]').value, 'gmroll');
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
});
