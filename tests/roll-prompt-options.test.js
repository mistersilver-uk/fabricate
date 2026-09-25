import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { buildInteractiveRollOptions, buildSinglePromptData, promptCheckRoll, waitForPrompt } from '../src/ui/svelte/apps/crafting/rollPrompt.js';
import { checkboxGroupField, stubDialogCapture, stubDialogDismissal, stubI18n } from './helpers/rollPromptDialogStub.js';

const choice = {
  modifiers: [{ id: 'a', label: 'A', display: '+1' }, { id: 'b', label: 'B', display: '+1d4' }],
  maxPicks: 2,
  defaultSelectedIds: ['a', 'b'],
};

function open(args, elements, options) {
  const dialog = stubDialogCapture(elements, options);
  return promptCheckRoll(args).then((result) => ({ dialog, result })).finally(() => dialog.restore());
}

describe('roll prompt DialogV2 adapter', () => {
  it('threads the public runner options without a stray choice', () => {
    const options = buildInteractiveRollOptions({ interactive: true, actor: { name: 'Brenna' }, activity: 'Crafting', name: 'Iron', dc: 12 });
    assert.equal(options.name, 'Iron');
    assert.equal(options.dc, 12);
    assert.ok(!Object.hasOwn(options, 'modifierChoice'));
    assert.equal(typeof options.prompt, 'function');
  });

  it('builds localized activity and actor-subject labels without inventing a missing subject', () => {
    const named = buildSinglePromptData({ activity: 'Crafting', actorName: 'Brenna', name: 'Iron', dc: 12, thresholdMode: 'exceed' });
    assert.equal(named.title, 'Crafting check');
    assert.equal(named.subtitle, 'Brenna · Iron');
    assert.equal(named.comparison, 'exceed');
    assert.equal(buildSinglePromptData({ activity: 'Salvage', actorName: 'Brenna' }).subtitle, 'Brenna');
    assert.equal(buildSinglePromptData({ thresholdMode: 'exceed', comparison: null }).comparison, null);
    assert.equal(buildSinglePromptData({ thresholdMode: 'exceed', comparison: 'meet' }).comparison, 'meet');
  });

  it('binds the actor name while preserving the runner prompt payload', async () => {
    let captured;
    const options = buildInteractiveRollOptions({ actor: { name: 'Brenna' }, activity: 'Crafting' }, async (payload) => {
      captured = payload;
      return { confirmed: true };
    });
    assert.deepEqual(await options.prompt({ resolvedFormula: '1d20 + 2', thresholdMode: 'exceed' }), { confirmed: true });
    assert.deepEqual(captured, { resolvedFormula: '1d20 + 2', thresholdMode: 'exceed', actorName: 'Brenna' });
  });

  it('offers the retained actions in their new visual order with Roll default', async () => {
    const { dialog, result } = await open({ activity: 'Crafting', allowAdvantage: true }, {
      situationalBonus: { value: '+ 1d4' }, rollMode: { value: 'gmroll' },
    });
    assert.deepEqual(dialog.buttons.map((button) => button.action), ['disadvantage', 'normal', 'advantage']);
    assert.equal(dialog.buttons[1].default, true);
    assert.equal(result.advantage, 'normal');
    assert.equal(result.bonus, '1d4');
    assert.equal(result.rollMode, 'gmroll');
    assert.equal(dialog.config.position.width, 500);
    assert.match(dialog.content, /fabricate-roll-prompt-host/);
    assert.ok(!dialog.content.includes('craftingModifier'), 'body is mounted after sanitization');
  });

  it('uses a supported visible default and submitted mode when the client setting is missing or invalid', async () => {
    for (const [setting, expected] of [[undefined, 'publicroll'], ['unknown', 'publicroll'], ['gmroll', 'gmroll']]) {
      const restoreI18n = stubI18n({}, { rollMode: setting });
      try {
        assert.equal(buildInteractiveRollOptions({ activity: 'Crafting' }).rollMode, expected);
        const { result } = await open({ activity: 'Crafting' }, {});
        assert.equal(result.rollMode, expected);
        const { result: invalidField } = await open({ activity: 'Crafting' }, { rollMode: { value: 'unknown' } });
        assert.equal(invalidField.rollMode, expected);
      } finally {
        restoreI18n();
      }
    }
  });

  it('returns the selected capped checkbox values and legacy first id', async () => {
    const { result } = await open({ modifierChoice: choice }, {
      situationalBonus: { value: '' }, rollMode: { value: 'publicroll' },
      craftingModifier: checkboxGroupField(choice.modifiers, ['a', 'b']),
    });
    assert.deepEqual(result.chosenModifierIds, ['a', 'b']);
    assert.equal(result.chosenModifierId, 'a');
  });

  it('preserves explicit empty selection and headless defaults', async () => {
    const { result } = await open({ modifierChoice: choice }, {
      craftingModifier: checkboxGroupField(choice.modifiers, []),
    });
    assert.deepEqual(result.chosenModifierIds, []);
    assert.ok(!Object.hasOwn(result, 'chosenModifierId'));
    const previous = globalThis.foundry;
    delete globalThis.foundry;
    try {
      const headless = await promptCheckRoll({ modifierChoice: choice });
      assert.deepEqual(headless.chosenModifierIds, ['a', 'b']);
    } finally {
      globalThis.foundry = previous;
    }
  });

  it('maps dismissal and rejection to the unchanged false shape', async () => {
    const stub = stubDialogDismissal(null);
    try { assert.deepEqual(await promptCheckRoll(), { confirmed: false }); }
    finally { stub.restore(); }
  });

  it('mounts after render, adds footer notes once, and unmounts once per render and close', async () => {
    const previousDocument = globalThis.document;
    const restoreI18n = stubI18n({ 'CHAT.RollPublic': 'Everyone' });
    const window = new Window();
    globalThis.document = window.document;
    const root = window.document.createElement('div');
    root.innerHTML = '<div class="fabricate-roll-prompt-host"></div><button data-action="disadvantage"></button><button data-action="advantage"></button>';
    const mounted = [];
    const removed = [];
    const positions = [];
    try {
      const result = await waitForPrompt({ wait: async (config) => {
        const dialog = { element: root, setPosition: (position) => {
          assert.equal(mounted.length, positions.length + 1);
          positions.push(position);
        } };
        config.render(null, dialog);
        config.render(null, dialog);
        assert.equal(root.querySelectorAll('.fabricate-roll-prompt__footer-note').length, 2);
        config.close();
        config.close();
        return config.buttons[1].callback(null, { form: { elements: {} } });
      } }, { kind: 'single', frameTitle: 'Crafting check' }, true,
      { options: [], maxPicks: 1, defaultSelectedIds: [] }, {
        loadBody: async () => ({ default: () => {} }),
        mountBody: (_component, options) => {
          assert.equal(options.target.className, 'fabricate-roll-prompt-host');
          assert.equal(options.props.data.defaultRollMode, 'publicroll');
          assert.equal(options.props.data.rollModes[0].label, 'Everyone');
          const handle = { number: mounted.length };
          mounted.push(handle);
          return handle;
        },
        unmountBody: (handle) => removed.push(handle),
      });
      assert.equal(result.confirmed, true);
      assert.equal(mounted.length, 2);
      assert.deepEqual(positions, [{ height: 'auto', top: null }, { height: 'auto', top: null }]);
      assert.deepEqual(removed, mounted);
    } finally {
      restoreI18n();
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
      await window.happyDOM.abort();
    }
  });

  it('closes a failed mount as a dismissal', async () => {
    const previousDocument = globalThis.document;
    const previousError = console.error;
    const window = new Window();
    globalThis.document = window.document;
    console.error = () => {};
    let closed = 0;
    try {
      const result = await waitForPrompt({ wait: async (config) => {
        config.render(null, {
          element: { querySelector: () => ({}) },
          close: () => { closed += 1; },
        });
        return null;
      } }, { kind: 'single', frameTitle: 'Crafting check' }, false,
      { options: [], maxPicks: 1, defaultSelectedIds: [] }, {
        loadBody: async () => ({ default: () => {} }),
        mountBody: () => { throw new Error('mount failure'); },
      });
      assert.deepEqual(result, { confirmed: false });
      assert.equal(closed, 1);
    } finally {
      console.error = previousError;
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
      await window.happyDOM.abort();
    }
  });
});
