import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildInteractiveRollOptions,
  promptCheckRoll,
} from '../src/ui/svelte/apps/crafting/rollPrompt.js';

// Stub DialogV2.wait: capture the rendered content + buttons, then invoke the default
// button's callback with a fake form so `readChoice` runs against known field values.
function stubDialogCapture(formElements) {
  const original = globalThis.foundry;
  const captured = {};
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: {
          wait: async (config) => {
            captured.content = config.content;
            captured.buttons = config.buttons;
            const button = { form: { elements: formElements } };
            const chosenButton = config.buttons.find((b) => b.default) || config.buttons[0];
            captured.result = chosenButton.callback({}, button);
            return captured.result;
          },
        },
      },
    },
  };
  captured.restore = () => {
    if (original === undefined) delete globalThis.foundry;
    else globalThis.foundry = original;
  };
  return captured;
}

const PICK_DESCRIPTOR = {
  modifiers: [
    { id: 'med', label: 'Medicine', icon: 'fa-solid fa-med', value: 3 },
    { id: 'herb', label: 'Herbalism', icon: 'fa-solid fa-herb', value: 5 },
  ],
  defaultSelectedId: 'herb',
};

/**
 * `buildInteractiveRollOptions` threads the subject `name`/`activity`/`img` into
 * the options bag so the prompt can render its icon-first header. Guard that the
 * header inputs actually survive into the bag (the image fix depends on it).
 */
describe('buildInteractiveRollOptions', () => {
  it('threads name, activity, and img into the options bag', () => {
    const options = buildInteractiveRollOptions({
      interactive: true,
      actor: { id: 'a1' },
      name: 'Forge Iron Rivets',
      activity: 'Crafting',
      img: 'icons/tools/smithing/anvil.webp',
      dc: 12,
    });
    assert.equal(options.interactive, true);
    assert.equal(options.name, 'Forge Iron Rivets');
    assert.equal(options.activity, 'Crafting');
    assert.equal(options.img, 'icons/tools/smithing/anvil.webp');
    assert.equal(options.dc, 12);
    assert.equal(typeof options.prompt, 'function');
  });

  it('carries a false interactive flag through for automated callers', () => {
    const options = buildInteractiveRollOptions({
      interactive: false,
      actor: null,
      name: 'Extract Iron Ore',
      activity: 'Gathering',
    });
    assert.equal(options.interactive, false);
    assert.equal(options.name, 'Extract Iron Ore');
    assert.equal(options.activity, 'Gathering');
  });

  it('forwards a modifierChoice descriptor into the bag when present', () => {
    const options = buildInteractiveRollOptions({
      interactive: true,
      actor: null,
      name: 'Healing Salve',
      activity: 'Crafting',
      modifierChoice: PICK_DESCRIPTOR,
    });
    assert.equal(options.modifierChoice, PICK_DESCRIPTOR);
  });

  it('omits the modifierChoice key entirely when absent (byte-identical bag)', () => {
    const options = buildInteractiveRollOptions({
      interactive: true,
      actor: null,
      name: 'Iron Rivets',
      activity: 'Crafting',
    });
    assert.equal('modifierChoice' in options, false, 'no stray key on non-playerPicks paths');
  });
});

describe('promptCheckRoll: playerPicks radio fieldset', () => {
  it('renders a radio option per modifier with the default pre-checked, and returns the chosen id', async () => {
    const captured = stubDialogCapture({
      situationalBonus: { value: '' },
      rollMode: { value: 'publicroll' },
      craftingModifier: { value: 'med' },
    });
    try {
      const choice = await promptCheckRoll({
        formula: '1d20 + (5)',
        resolvedFormula: '1d20 + (5)',
        activity: 'Crafting',
        modifierChoice: PICK_DESCRIPTOR,
      });
      assert.match(captured.content, /name="craftingModifier"/, 'radio group rendered');
      assert.match(captured.content, /value="med"/);
      assert.match(captured.content, /value="herb"\s+checked/, 'the default (herb) is pre-checked');
      assert.match(captured.content, /Medicine/);
      assert.match(captured.content, /Herbalism/);
      assert.match(captured.content, /\+3/, 'signed value chip');
      assert.match(captured.content, /\+5/);
      assert.match(captured.content, /fabricate-roll-prompt__modifiers/);
      assert.equal(choice.chosenModifierId, 'med', 'the checked radio value is returned');
    } finally {
      captured.restore();
    }
  });

  it('falls back to the default selection when the radio field is absent (headless form)', async () => {
    const captured = stubDialogCapture({
      situationalBonus: { value: '' },
      rollMode: { value: 'publicroll' },
      // no craftingModifier field
    });
    try {
      const choice = await promptCheckRoll({
        formula: '1d20 + (5)',
        activity: 'Crafting',
        modifierChoice: PICK_DESCRIPTOR,
      });
      assert.equal(choice.chosenModifierId, 'herb');
    } finally {
      captured.restore();
    }
  });

  it('renders no fieldset and adds no chosenModifierId when modifierChoice is absent', async () => {
    const captured = stubDialogCapture({
      situationalBonus: { value: '' },
      rollMode: { value: 'publicroll' },
    });
    try {
      const choice = await promptCheckRoll({
        formula: '1d20 + 3',
        activity: 'Crafting',
      });
      assert.doesNotMatch(captured.content, /craftingModifier/, 'no modifier fieldset');
      assert.equal('chosenModifierId' in choice, false, 'byte-identical choice object');
    } finally {
      captured.restore();
    }
  });

  it('returns the pre-selected default in the headless (no DialogV2) path', async () => {
    const original = globalThis.foundry;
    if (original !== undefined) delete globalThis.foundry;
    try {
      const choice = await promptCheckRoll({
        formula: '1d20 + (5)',
        activity: 'Crafting',
        modifierChoice: PICK_DESCRIPTOR,
      });
      assert.equal(choice.confirmed, true);
      assert.equal(choice.chosenModifierId, 'herb');
    } finally {
      if (original !== undefined) globalThis.foundry = original;
    }
  });
});
