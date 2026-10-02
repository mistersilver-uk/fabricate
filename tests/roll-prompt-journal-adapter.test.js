import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  journalCheckSeams,
  promptJournalStageCheck,
  withPromptActivity,
} from '../src/bootstrap/journalOperations.js';
import { buildSinglePromptData, promptCheckRoll } from '../src/ui/svelte/apps/crafting/rollPrompt.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';

describe('Journal roll prompt adapter', () => {
  it('states a changed check in the reopened prompt, and as a warning toast beside it', async () => {
    const seams = journalCheckSeams();
    const toasts = [];
    const previousUi = globalThis.ui;
    const warn = (message) => {
      toasts.push(message);
    };
    Object.assign(globalThis, { ui: { notifications: { warn } } });
    const surface = stubPromptSurface(() => null);
    try {
      await seams.promptCheck({ subject: 'Horseshoe' });
      assert.ok(!('notice' in surface.view), 'a first prompt states no notice');
      await seams.promptCheck({ subject: 'Horseshoe' }, { changed: true });
      assert.match(surface.view.notice, /details changed while you were deciding/);
      seams.onCheckChanged();
      assert.deepEqual(toasts, [surface.view.notice], 'the toast says the same sentence');
    } finally {
      surface.restore();
      if (previousUi === undefined) delete globalThis.ui;
      else Object.assign(globalThis, { ui: previousUi });
    }
  });

  it('shows the prepared formula without its chat-card flavour labels', async () => {
    let received;
    await promptJournalStageCheck(
      { subject: 'Runeblade', formula: '1d20 + 3 + 6[Modifiers]', resolvedFormula: '1d20 + 3 + 6[Modifiers]' },
      async (options) => {
        received = options;
      }
    );
    assert.equal(received.formula, '1d20 + 3 + 6');
    assert.equal(received.resolvedFormula, '1d20 + 3 + 6');
  });

  it('shows the base formula without the modifier terms its chips itemise', async () => {
    let received;
    const selectedModifiers = [{ label: 'Focus', display: '+6' }];
    await promptJournalStageCheck(
      { subject: 'Runeblade', formula: '1d20 + 3[Tool] + 6[Modifiers]', resolvedFormula: '1d20 + 3[Tool] + 6[Modifiers]', displayFormula: '1d20 + 3[Tool]', selectedModifiers },
      async (options) => {
        received = options;
      }
    );
    const view = buildSinglePromptData(received);
    assert.equal(view.formula, '1d20 + 3', 'the Tool term stays and the itemised modifier does not');
    assert.deepEqual(view.selectedModifiers, selectedModifiers, 'the modifier is still itemised');
  });

  it('forwards the prepared offer, so an offer-false stage prompt shows no bonus field (issue 2005)', async () => {
    const offerOf = async (descriptor) => {
      let received;
      await promptJournalStageCheck({ subject: 'Horseshoe', ...descriptor }, async (options) => {
        received = options;
      });
      return buildSinglePromptData(received).offerSituationalBonus;
    };
    assert.equal(await offerOf({ offerSituationalBonus: false }), false);
    assert.equal(await offerOf({}), true, 'an unentitled prompt without the key still offers the field');
  });

  it('forwards a character-value target source, so a roll-over stage names a target, not a DC', async () => {
    let received;
    await promptJournalStageCheck(
      { subject: 'Horseshoe', target: 55, direction: 'over', comparison: 'meet', targetSource: 'attribute' },
      async (options) => {
        received = options;
      }
    );
    assert.equal(buildSinglePromptData(received).targetSource, 'attribute');
    const surface = stubPromptSurface(() => null);
    try {
      await promptCheckRoll(received);
      assert.equal(surface.view.chipText, 'Target 55 · meet or beat');
    } finally {
      surface.restore();
    }
  });

  it('forwards the versioned target direction, so a roll-under stage names its target', async () => {
    const view = async (descriptor) => {
      let received;
      await promptJournalStageCheck({ subject: 'Horseshoe', ...descriptor }, async (options) => {
        received = options;
      });
      return { received, view: buildSinglePromptData(received) };
    };
    const under = await view({ target: 15, direction: 'under', comparison: 'exceed' });
    assert.equal(under.received.direction, 'under');
    assert.deepEqual([under.view.dc, under.view.direction, under.view.comparison], [15, 'under', 'exceed']);
    const over = await view({ target: 12, direction: 'over', comparison: 'meet' });
    assert.deepEqual([over.view.dc, over.view.direction], [12, 'over']);
    const none = await view({ target: null, direction: null, comparison: null });
    assert.deepEqual([none.view.dc, none.view.direction], [null, 'over']);
  });

  it('forwards a versioned count prompt, so it shows its pool line and required successes', async () => {
    let received;
    const count = {
      subject: 'Horseshoe', product: 'count', direction: 'under', comparison: 'exceed', pool: 3, die: 20,
      threshold: 13, required: 2, modifierDestination: 'threshold', target: null, formula: '', displayFormula: '',
    };
    await promptJournalStageCheck(count, async (options) => {
      received = options;
    });
    assert.deepEqual(
      [received.product, received.pool, received.die, received.threshold, received.required, received.modifierDestination],
      ['count', 3, 20, 13, 2, 'threshold']
    );
    const view = buildSinglePromptData(received);
    assert.deepEqual([view.dc, view.direction, view.comparison], [null, 'under', 'exceed']);
    assert.equal(
      buildSinglePromptData({ ...received, formula: '1d20', displayFormula: '1d20' }).formula,
      '',
      'a count view carries no retained formula, even when one is supplied'
    );
    assert.deepEqual(view.count, {
      pool: 3, die: 20, threshold: 13, thresholdAnchor: null, thresholdSource: null, explode: null, cancel: null,
      zeroPoolFails: true, required: 2, destination: 'threshold',
    });
    await promptJournalStageCheck({ ...count, product: undefined }, async (options) => {
      received = options;
    });
    assert.ok(!Object.hasOwn(received, 'pool'), 'a summed descriptor forwards no count field');
    const rules = {
      thresholdSource: 'character', thresholdAnchor: 14, zeroPoolFails: false,
      explode: { kind: 'from', face: 19, once: true }, cancel: { kind: 'worst', face: 20 },
    };
    await promptJournalStageCheck({ ...count, ...rules }, async (options) => {
      received = options;
    });
    const forwarded = Object.fromEntries(Object.keys(rules).map((key) => [key, received[key]]));
    assert.deepEqual(forwarded, rules, 'the anchor, source, zero-pool rule and faces reach the prompt (issue 2006)');
    assert.equal(
      buildSinglePromptData(received).count.thresholdAnchor,
      14,
      'and survive into the view the note reads'
    );
  });

  it('words a redacted count prompt by its destination and shows no pool, threshold or count', async () => {
    let received;
    const redacted = {
      allowsSituationalModifier: true, allowAdvantage: false,
      product: 'count', direction: 'under', comparison: 'exceed', modifierDestination: 'threshold',
    };
    await promptJournalStageCheck(redacted, async (options) => {
      received = options;
    });
    const surface = stubPromptSurface(() => null);
    try {
      await promptCheckRoll(received);
    } finally {
      surface.restore();
    }
    const { view } = surface;
    assert.equal(
      view.labels.bonusHelp,
      'A bonus moves the threshold by that much. A rolled bonus such as 1d4 is rolled first, and its result is applied.',
      'the count help, not the summed "adds to the total"'
    );
    assert.deepEqual([view.formula, view.dc, view.neededText, view.labels.formulaNote], ['', null, '', undefined]);
    assert.deepEqual(view.count, {
      pool: null, die: null, threshold: null, thresholdAnchor: null, thresholdSource: null, explode: null,
      cancel: null, zeroPoolFails: true, required: null, destination: 'threshold',
    });
  });

  it('titles a named gathering check with its activity and leaves a hidden one generic', async () => {
    const describe = (publicPrompt) => async () => ({ required: true, publicPrompt, privateEvaluation: {} });
    const named = withPromptActivity({ describeCheck: describe({ label: 'Copper vein' }) }, () => 'Gathering');
    const promptOf = async (operations) => (await operations.describeCheck({})).publicPrompt;

    const visible = await promptOf(named);
    assert.equal(visible.activity, 'Gathering');
    assert.equal(buildSinglePromptData({ name: visible.label, activity: visible.activity }).title, 'Gathering check');

    const hidden = await promptOf(withPromptActivity({ describeCheck: describe({ allowAdvantage: true }) }, () => 'Gathering'));
    assert.ok(!Object.hasOwn(hidden, 'activity'), 'a hidden prompt keeps the generic "Roll check" title');

    const crafted = await promptOf(withPromptActivity({ describeCheck: describe({ label: 'Tea', activity: 'Crafting' }) }, () => 'Gathering'));
    assert.equal(crafted.activity, 'Crafting');
  });
});
