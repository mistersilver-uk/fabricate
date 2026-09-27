import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { promptJournalStageCheck, withPromptActivity } from '../src/bootstrap/journalOperations.js';
import { buildSinglePromptData } from '../src/ui/svelte/apps/crafting/rollPrompt.js';

describe('Journal roll prompt adapter', () => {
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
    assert.deepEqual(view.count, { pool: 3, die: 20, threshold: 13, required: 2, destination: 'threshold' });
    await promptJournalStageCheck({ ...count, product: undefined }, async (options) => {
      received = options;
    });
    assert.ok(!Object.hasOwn(received, 'pool'), 'a summed descriptor forwards no count field');
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
