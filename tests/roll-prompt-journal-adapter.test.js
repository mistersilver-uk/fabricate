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
