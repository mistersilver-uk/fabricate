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

// The catalogue editor creates a row with `label: ''` and never forces a value, and the
// icon is only defaulted in the editor's own control — so a saved entry can reach the
// prompt with BOTH empty. This descriptor is that entry, alongside a normal sibling.
const BARE_DESCRIPTOR = {
  modifiers: [
    { id: 'bare', label: '', icon: '', value: 3 },
    { id: 'herb', label: 'Herbalism', icon: 'fa-solid fa-herb', value: 5 },
  ],
  defaultSelectedId: 'herb',
};

/** Install a `game.i18n.localize` backed by `table`, returning a restore function. */
function stubI18n(table) {
  const original = globalThis.game;
  globalThis.game = { i18n: { localize: (key) => table[key] ?? key } };
  return () => {
    if (original === undefined) delete globalThis.game;
    else globalThis.game = original;
  };
}

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

  // The engine NEVER omits the key: `_buildInteractiveModifierChoice` returns `null` on
  // every deterministic / non-interactive path, so `null` — not `undefined` — is the
  // production shape the byte-identical-bag guard has to survive. Widening the builder's
  // test to `modifierChoice !== undefined` would keep the case above green.
  it('omits the modifierChoice key when the engine passes an explicit null', () => {
    const options = buildInteractiveRollOptions({
      interactive: true,
      actor: null,
      name: 'Iron Rivets',
      activity: 'Crafting',
      modifierChoice: null,
    });
    assert.equal(
      'modifierChoice' in options,
      false,
      'a null descriptor (the engine default) must not add the key'
    );
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

  // A row can reach the prompt with an empty label AND an empty icon. Neither may be
  // dropped: an unlabelled radio's only accessible name would be its value chip ("+3"),
  // and a missing `<i>` collapses the flex row's icon gutter, starting that option's
  // label ~1.1rem left of every sibling.
  it('names an unlabelled modifier and still emits its icon and value chip', async () => {
    const captured = stubDialogCapture({
      situationalBonus: { value: '' },
      rollMode: { value: 'publicroll' },
      craftingModifier: { value: 'bare' },
    });
    try {
      await promptCheckRoll({
        formula: '1d20 + (modifier)',
        activity: 'Crafting',
        modifierChoice: BARE_DESCRIPTOR,
      });
      assert.match(
        captured.content,
        /<span class="fabricate-roll-prompt__modifier-label">Unnamed modifier<\/span>/,
        'an empty label falls back to a readable name, not a bare value chip'
      );
      assert.match(
        captured.content,
        /<i class="fabricate-roll-prompt__modifier-icon fa-solid fa-dice-d20"/,
        'an icon-less option keeps its gutter via the catalogue default icon'
      );
      // Both options emit an icon, so the icon/label/chip columns line up.
      assert.equal(
        captured.content.match(/fabricate-roll-prompt__modifier-icon/g).length,
        2,
        'every option emits an icon slot'
      );
      assert.equal(
        captured.content.match(/fabricate-roll-prompt__modifier-value/g).length,
        2,
        'every option emits a value chip'
      );
    } finally {
      captured.restore();
    }
  });

  // A non-finite value is the one case with two possible answers; the chip must still
  // render (row alignment) and `formatSigned` owns the single fallback.
  it('renders a chip for a non-finite modifier value rather than dropping it', async () => {
    const captured = stubDialogCapture({
      situationalBonus: { value: '' },
      rollMode: { value: 'publicroll' },
      craftingModifier: { value: 'broken' },
    });
    try {
      await promptCheckRoll({
        formula: '1d20 + (modifier)',
        activity: 'Crafting',
        modifierChoice: {
          modifiers: [
            { id: 'broken', label: 'Broken', icon: 'fa-solid fa-x', value: undefined },
            { id: 'herb', label: 'Herbalism', icon: 'fa-solid fa-herb', value: 5 },
          ],
          defaultSelectedId: 'herb',
        },
      });
      assert.match(
        captured.content,
        /<span class="fabricate-roll-prompt__modifier-value">0<\/span>/,
        'a non-finite value renders an unsigned 0 chip'
      );
      assert.equal(
        captured.content.match(/fabricate-roll-prompt__modifier-value/g).length,
        2,
        'the chip is never omitted'
      );
    } finally {
      captured.restore();
    }
  });

  it('localizes the fieldset legend and the unnamed-modifier fallback', async () => {
    const restoreI18n = stubI18n({
      'FABRICATE.App.RollPrompt.CheckModifier': 'Modificateur',
      'FABRICATE.App.RollPrompt.UnnamedModifier': 'Modificateur sans nom',
    });
    const captured = stubDialogCapture({
      situationalBonus: { value: '' },
      rollMode: { value: 'publicroll' },
      craftingModifier: { value: 'bare' },
    });
    try {
      await promptCheckRoll({
        formula: '1d20 + (modifier)',
        activity: 'Crafting',
        modifierChoice: BARE_DESCRIPTOR,
      });
      assert.match(
        captured.content,
        /<legend class="fabricate-roll-prompt__modifiers-legend">Modificateur<\/legend>/,
        'the legend reads through game.i18n'
      );
      assert.match(captured.content, /Modificateur sans nom/, 'the fallback name is localized too');
      assert.doesNotMatch(captured.content, /Check modifier/, 'no hard-coded English legend');
    } finally {
      captured.restore();
      restoreI18n();
    }
  });

  it('falls back to English copy when the key does not resolve', async () => {
    const captured = stubDialogCapture({
      situationalBonus: { value: '' },
      rollMode: { value: 'publicroll' },
      craftingModifier: { value: 'bare' },
    });
    try {
      await promptCheckRoll({
        formula: '1d20 + (modifier)',
        activity: 'Crafting',
        modifierChoice: BARE_DESCRIPTOR,
      });
      assert.match(captured.content, /<legend[^>]*>Check modifier<\/legend>/);
      assert.match(captured.content, /Unnamed modifier/);
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
