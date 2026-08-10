/**
 * `promptBulkCheckRoll` — the ONE dialog a whole batch answers (issue 859).
 *
 * It is a sibling export rather than a mode flag on `promptCheckRoll`, whose body is
 * already a dense conditional matrix — but the two share every leaf below the surface
 * (`renderDieRow`, `renderBonusInput`, `renderRollModePicker`, `readSharedRollChoice`,
 * `buildRollButtons`), which is why this suite and `tests/roll-prompt-options.test.js`
 * share ONE dialog stub out of `tests/helpers/rollPromptDialogStub.js`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { promptBulkCheckRoll } from '../src/ui/svelte/apps/crafting/rollPrompt.js';
import {
  stubDialogCapture,
  stubDialogDismissal,
  stubI18n,
} from './helpers/rollPromptDialogStub.js';

/** The fields a real submitted form carries. */
const FORM = { situationalBonus: { value: '' }, rollMode: { value: 'publicroll' } };

/** Eight subjects is the strip limit; nine is the first that overflows. */
const subjects = (count) =>
  Array.from({ length: count }, (unused, index) => ({
    name: `Component ${index + 1}`,
    img: `icons/c${index + 1}.webp`,
  }));

/** Open the prompt against a captured dialog and hand back both halves. */
async function open(args, formElements = FORM, options = {}) {
  const captured = stubDialogCapture(formElements, options);
  try {
    const choice = await promptBulkCheckRoll(args);
    return { captured, choice };
  } finally {
    captured.restore();
  }
}

describe('promptBulkCheckRoll: the headless and dismissal paths', () => {
  it('confirms without blocking when no DialogV2 exists at all', async () => {
    // Headless (tests, and any harness with no dialog API). It must not stall a run, and
    // it threads the SAME shape a confirmed click produces so the caller's downstream
    // code has one path.
    const original = globalThis.foundry;
    if (original !== undefined) delete globalThis.foundry;
    try {
      const choice = await promptBulkCheckRoll({ allowAdvantage: true, subjects: subjects(3) });
      assert.deepEqual(choice, {
        confirmed: true,
        bonus: null,
        rollMode: undefined,
        advantage: 'normal',
      });
    } finally {
      if (original !== undefined) globalThis.foundry = original;
    }
  });

  it('returns { confirmed: false } when the dialog resolves null', async () => {
    // `DialogV2.wait` with the default `rejectClose = false` resolves `result ?? null` on
    // BOTH Escape and the window X — neither REJECTS, so a `.catch()` alone cannot see a
    // dismissal. This is the shape the service reads as "cancel with zero mutation".
    const stub = stubDialogDismissal(null);
    try {
      assert.deepEqual(await promptBulkCheckRoll({ subjects: subjects(2) }), { confirmed: false });
    } finally {
      stub.restore();
    }
  });

  it('returns { confirmed: false } for any result that is not a confirmation', async () => {
    for (const resolved of [undefined, false, {}, { confirmed: false }, { confirmed: 'yes' }]) {
      const stub = stubDialogDismissal(resolved);
      try {
        assert.deepEqual(
          await promptBulkCheckRoll({ subjects: subjects(1) }),
          { confirmed: false },
          JSON.stringify(resolved)
        );
      } finally {
        stub.restore();
      }
    }
  });

  it('tolerates a rejecting wait rather than escaping into the run', async () => {
    const original = globalThis.foundry;
    globalThis.foundry = {
      applications: {
        api: { DialogV2: { wait: async () => Promise.reject(new Error('closed')) } },
      },
    };
    try {
      assert.deepEqual(await promptBulkCheckRoll({ subjects: subjects(1) }), { confirmed: false });
    } finally {
      if (original === undefined) delete globalThis.foundry;
      else globalThis.foundry = original;
    }
  });
});

describe('promptBulkCheckRoll: what it deliberately does NOT show', () => {
  it('renders no DC chip and no formula block', async () => {
    // A batch has no single subject: each item rolls its OWN system's formula against its
    // own DC / tiers / stages. Rendering one item's formula would be a claim about the
    // other twenty-four, and rendering all of them would be a wall of text.
    const { captured } = await open({ allowAdvantage: true, subjects: subjects(3) });
    assert.doesNotMatch(captured.content, /fabricate-roll-prompt__dc/, 'no DC chip');
    assert.doesNotMatch(captured.content, /fabricate-roll-prompt__formula/, 'no formula block');
    assert.doesNotMatch(captured.content, /\bDC\b/, 'nor the letters in any other guise');
    assert.doesNotMatch(captured.content, /1d20/, 'and no rolled expression anywhere');
  });

  it('renders no playerPicks modifier fieldset', async () => {
    // `playerPicks` is crafting-only, so a salvage batch never carries a
    // `modifierChoice` at all.
    const { captured } = await open({ allowAdvantage: true, subjects: subjects(2) });
    assert.doesNotMatch(captured.content, /craftingModifier/);
  });
});

describe('promptBulkCheckRoll: the subject strip', () => {
  it('renders one thumbnail per subject up to the strip limit, with the name as ALT', () => {
    // Eight captions do not fit the row, so the name is the thumbnail's accessible name
    // rather than a visible caption — a screen-reader user still learns what is queued.
    return open({ subjects: subjects(8) }).then(({ captured }) => {
      const thumbs = captured.content.match(/fabricate-roll-prompt__subject"/g) ?? [];
      assert.equal(thumbs.length, 8);
      assert.match(captured.content, /alt="Component 1"/);
      assert.match(captured.content, /alt="Component 8"/);
      assert.doesNotMatch(captured.content, /subjects-more/, 'nothing overflowed');
    });
  });

  it('caps the strip and states the overflow as "+K more"', async () => {
    const { captured } = await open({ subjects: subjects(11) });
    const thumbs = captured.content.match(/fabricate-roll-prompt__subject"/g) ?? [];
    assert.equal(thumbs.length, 8, 'the strip is bounded');
    assert.match(captured.content, /fabricate-roll-prompt__subjects-more">\+3 more</);
  });

  it('falls back to the shared item image for a subject with none', async () => {
    const { captured } = await open({ subjects: [{ name: 'Iron Ore' }] });
    assert.match(captured.content, /src="icons\/svg\/item-bag\.svg"/);
  });

  it('escapes an authored subject name in both the ALT text and the image path', async () => {
    const { captured } = await open({
      subjects: [{ name: '<b>Ore</b> & "stuff"', img: '"><script>x</script>' }],
    });
    assert.doesNotMatch(captured.content, /<script>/);
    assert.match(captured.content, /alt="&lt;b&gt;Ore&lt;\/b&gt; &amp; &quot;stuff&quot;"/);
  });

  it('renders no strip at all for a batch with no subjects', async () => {
    const { captured } = await open({ subjects: [] });
    assert.doesNotMatch(captured.content, /fabricate-roll-prompt__subjects/);
  });

  it('counts from `count` when supplied, and from the subjects otherwise', async () => {
    const restore = stubI18n({
      'FABRICATE.App.RollPrompt.BulkHeading': 'One setting for {count} items',
    });
    try {
      const explicit = await open({ count: 25, subjects: subjects(3) });
      assert.match(explicit.captured.content, /One setting for 25 items/);
      const implicit = await open({ subjects: subjects(4) });
      assert.match(implicit.captured.content, /One setting for 4 items/);
    } finally {
      restore();
    }
  });
});

describe('promptBulkCheckRoll: advantage is offered only under allowAdvantage', () => {
  it('offers three buttons and a d20 glyph when advantage is allowed', async () => {
    const { captured } = await open({ allowAdvantage: true, subjects: subjects(2) });
    assert.equal(captured.buttons.length, 3, 'Advantage / Normal / Disadvantage');
    assert.match(captured.content, /fa-dice-d20/, 'the d20 glyph, not the generic die');
  });

  it('offers one Roll button and a generic die otherwise', async () => {
    for (const allowAdvantage of [false, undefined, null, 'true', 1]) {
      const { captured } = await open({ allowAdvantage, subjects: subjects(2) });
      assert.equal(captured.buttons.length, 1, `allowAdvantage: ${String(allowAdvantage)}`);
      assert.match(captured.content, /fa-dice"/, 'a generic die above a single Roll button');
      assert.doesNotMatch(captured.content, /fa-dice-d20/);
    }
  });

  it('tags each button with the disposition it represents', async () => {
    // The disposition reaches `applyD20Advantage` for EVERY roll in the batch, so a
    // mislabelled button would silently roll the wrong pool twenty-five times.
    const dispositions = [];
    for (const index of [0, 1, 2]) {
      const { choice } = await open({ allowAdvantage: true, subjects: subjects(2) }, FORM, {
        pick: (buttons) => buttons[index],
      });
      dispositions.push(choice.advantage);
    }
    assert.deepEqual(dispositions, ['advantage', 'normal', 'disadvantage']);
  });

  it('reports `normal` from the single-button footer', async () => {
    const { choice } = await open({ allowAdvantage: false, subjects: subjects(2) });
    assert.equal(choice.advantage, 'normal');
  });
});

describe('promptBulkCheckRoll: bonus normalization', () => {
  const CASES = [
    { label: 'empty', typed: '', bonus: null },
    { label: 'whitespace only', typed: '   ', bonus: null },
    { label: 'a bare number', typed: '2', bonus: '2' },
    { label: 'a leading plus', typed: '+2', bonus: '2' },
    { label: 'a leading plus with spaces', typed: '  +2  ', bonus: '2' },
    { label: 'a negative', typed: '-1', bonus: '-1' },
    { label: 'an expression', typed: '1d4 + 1', bonus: '1d4 + 1' },
    // Only ONE leading plus is stripped, so `++2` stays malformed rather than being
    // silently repaired into something the player did not type. `evaluateCheckRoll`'s
    // `Roll.validate` net is what stops it becoming a rolled (consuming) failure.
    { label: 'a double plus', typed: '++2', bonus: '+2' },
  ];

  for (const testCase of CASES) {
    it(`normalizes ${testCase.label}`, async () => {
      const { choice } = await open(
        { allowAdvantage: false, subjects: subjects(1) },
        {
          situationalBonus: { value: testCase.typed },
          rollMode: { value: 'publicroll' },
        }
      );
      assert.equal(choice.bonus, testCase.bonus);
      assert.equal(choice.confirmed, true);
    });
  }

  it('reads null from a form carrying no bonus field at all', async () => {
    const { choice } = await open({ subjects: subjects(1) }, { rollMode: { value: 'gmroll' } });
    assert.equal(choice.bonus, null);
    assert.equal(choice.rollMode, 'gmroll');
  });
});

describe('promptBulkCheckRoll: the roll-mode picker keeps the LEGACY vocabulary', () => {
  it('offers exactly the four legacy tokens', async () => {
    // Load-bearing, not merely cheap: the aggregate card and the N dice messages then
    // carry the SAME token on both Foundry versions — the dice through `Roll#toMessage`'s
    // own legacy map, the card through `applyBulkChatVisibility` using the identical
    // table — so card visibility and dice visibility cannot diverge.
    const { captured } = await open({ subjects: subjects(1) });
    const values = [...captured.content.matchAll(/<option value="([^"]+)"/g)].map(
      (match) => match[1]
    );
    assert.deepEqual(values, ['publicroll', 'gmroll', 'blindroll', 'selfroll']);
  });

  it("pre-selects the client's own core.rollMode", async () => {
    const restore = stubI18n({}, { rollMode: 'blindroll' });
    try {
      const { captured, choice } = await open(
        { subjects: subjects(1) },
        {
          situationalBonus: { value: '' },
        }
      );
      assert.match(captured.content, /<option value="blindroll" selected>/);
      assert.equal(choice.rollMode, 'blindroll', 'and it is what a field-less form returns');
    } finally {
      restore();
    }
  });

  it('returns the chosen token verbatim', async () => {
    const { choice } = await open(
      { subjects: subjects(1) },
      {
        situationalBonus: { value: '' },
        rollMode: { value: 'blindroll' },
      }
    );
    assert.equal(choice.rollMode, 'blindroll');
  });
});

describe('promptBulkCheckRoll: the batch-wide note and the dialog frame', () => {
  it('says in words that the answer applies to EVERY roll', async () => {
    // An accepted consequence of the one-prompt design; the note is where the player is
    // told, rather than being left to infer it from a `+2` that lands twenty-five times.
    const { captured } = await open({ subjects: subjects(5) });
    assert.match(captured.content, /fabricate-roll-prompt__bulk-note/);
    assert.match(captured.content, /every roll in this batch/i);
  });

  it('carries the shared dialog classes and does not reject on close', async () => {
    const { captured } = await open({ subjects: subjects(2) });
    assert.deepEqual(captured.config.classes, [
      'fabricate',
      'fabricate-dialog',
      'fabricate-roll-prompt-dialog',
    ]);
    assert.equal(captured.config.rejectClose, false, 'a dismissal RESOLVES, it never rejects');
  });

  it('localizes the title, heading, overflow chip and note', async () => {
    const restore = stubI18n({
      'FABRICATE.App.RollPrompt.BulkTitle': 'Jet groupe',
      'FABRICATE.App.RollPrompt.BulkHeading': 'Un reglage pour {count} objets',
      'FABRICATE.App.RollPrompt.BulkMore': '+{count} de plus',
      'FABRICATE.App.RollPrompt.BulkNote': 'Applique a chaque jet.',
    });
    try {
      const { captured } = await open({ subjects: subjects(10) });
      assert.equal(captured.config.window.title, 'Jet groupe');
      assert.match(captured.content, /Un reglage pour 10 objets/);
      assert.match(captured.content, /\+2 de plus/);
      assert.match(captured.content, /Applique a chaque jet\./);
    } finally {
      restore();
    }
  });
});
