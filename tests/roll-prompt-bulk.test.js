import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { promptBulkCheckRoll } from '../src/ui/svelte/apps/crafting/rollPrompt.js';
import { stubDialogCapture, stubDialogDismissal } from './helpers/rollPromptDialogStub.js';

const subjects = [{ name: 'Ore', need: { kind: 'dc', dc: 17 } }, { name: 'Scrap', need: { kind: 'noCheck' } }];

async function open(args, fields = {}) {
  const dialog = stubDialogCapture(fields);
  try { return { dialog, result: await promptBulkCheckRoll(args) }; }
  finally { dialog.restore(); }
}

describe('bulk roll prompt adapter', () => {
  it('preserves one decision and one Roll action for a mixed batch', async () => {
    const { dialog, result } = await open({ count: 2, subjects }, {
      situationalBonus: { value: '+3' }, rollMode: { value: 'blindroll' },
    });
    assert.deepEqual(dialog.buttons.map((button) => button.action), ['roll']);
    assert.equal(dialog.buttons[0].default, true);
    assert.deepEqual(result, { confirmed: true, bonus: '3', rollMode: 'blindroll', advantage: 'normal' });
    assert.equal(dialog.config.position.width, 500);
    assert.match(dialog.content, /fabricate-roll-prompt-host/);
  });

  it('keeps count-only companion calls operable without subjects', async () => {
    const { dialog, result } = await open({ count: 3 }, { situationalBonus: { value: '' } });
    assert.equal(dialog.buttons.length, 1);
    assert.equal(result.confirmed, true);
  });

  it('offers the unchanged three advantage results', async () => {
    const dialog = stubDialogCapture({}, { pick: (buttons) => buttons.find((button) => button.action === 'advantage') });
    try {
      const result = await promptBulkCheckRoll({ allowAdvantage: true, subjects });
      assert.deepEqual(dialog.buttons.map((button) => button.action), ['disadvantage', 'normal', 'advantage']);
      assert.equal(result.advantage, 'advantage');
    } finally { dialog.restore(); }
  });

  it('normalizes dismissal and confirms headlessly', async () => {
    const stub = stubDialogDismissal(null);
    try { assert.deepEqual(await promptBulkCheckRoll({ subjects }), { confirmed: false }); }
    finally { stub.restore(); }
    const previous = globalThis.foundry;
    delete globalThis.foundry;
    try {
      assert.deepEqual(await promptBulkCheckRoll({ count: 3 }), {
        confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal',
      });
    } finally { globalThis.foundry = previous; }
  });
});
