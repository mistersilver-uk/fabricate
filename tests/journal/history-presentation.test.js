import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { presentHistory, presentStage, materialText } from '../../src/ui/svelte/apps/journal/historyPresentation.js';
import { createPersistedCraftingHistory } from '../helpers/journal-fixtures.js';

const text = (key, data) => `${key.split('.').at(-1)}${data ? JSON.stringify(data) : ''}`;

describe('recorded Journal presentation', () => {
  for (const failLast of [false, true]) {
    for (const awardQuantity of [null, 2]) {
      it(`writer/reload distinguishes empty, zero and positive awards (${awardQuantity}, failed=${failLast})`, async () => {
        const { model } = await createPersistedCraftingHistory({ stageCount: 1, checked: false, failLast, awardQuantity });
        const account = presentHistory(model, text);
        const expected = awardQuantity > 0
          ? (failLast ? 'ClosedFailureAwards' : 'ClosedSuccess')
          : (failLast ? 'ClosedFailedEmpty' : 'ClosedSuccessEmpty');
        assert.ok(account.closed.startsWith(expected), account.closed);
        assert.equal(account.results.length, awardQuantity === null ? 0 : 1);
        if (awardQuantity === 0) assert.equal(account.results[0].quantity, 0);
      });
    }
  }
  it('keeps check evidence when two winning rows share an unattributed award', () => {
    const account = presentHistory({ runType: 'gathering', status: 'succeeded',
      createdResults: [{ name: 'Herb', quantity: 4 }],
      gatheringYield: { mode: 'd100', roll: 100, entries: [31, 81].map((threshold) => ({
        threshold, chance: 101 - threshold, cleared: true, qty: null,
      })) },
    }, text);
    assert.equal(account.usableScale, true);
    assert.equal(account.attributedScaleAwards, false);
    assert.equal(account.results[0].quantity, 4);
  });
  it('distinguishes unknown quantities from confirmed-empty direct awards', () => {
    for (const createdResults of [[], [{ quantity: 0 }], [{ quantity: null }]]) {
      const account = presentHistory({ runType: 'gathering', status: 'succeeded', createdResults,
        createdResultsRecorded: true, gatheringYield: { mode: 'straight' } }, text);
      assert.ok(account.closed.startsWith(createdResults[0]?.quantity === null ? 'ClosedMissing' : 'ClosedSuccessEmpty'));
    }
  });
  it('does not turn an armed stage into an attempt or missing evidence into no check', () => {
    const account = presentHistory({ status: 'cancelled', steps: [{ attempted: false, startedAt: 10 }] }, text);
    assert.equal(account.stages.length, 0);
    assert.equal(account.summary, null);
    assert.equal(presentStage({ status: 'failed' }, text).resolution, 'NotRecorded');
    assert.equal(materialText({ name: null, quantity: null }, text), 'UnknownMaterial · NotRecorded');
  });

  it('keeps the real reloaded writer evidence and actor-qualified shared carriers', async () => {
    const { model } = await createPersistedCraftingHistory({ failLast: true });
    const account = presentHistory(model, text);
    assert.equal(account.multi, true);
    assert.equal(account.stages.length, 2);
    assert.equal(account.summary, null);
    assert.equal(account.stages[0].produced[0].name, 'Award stage-0');
    assert.equal(account.stages[1].produced[0].name, 'Award stage-1');
    const essence = account.stages[0].essence;
    assert.equal(essence.carriers.length, 2);
    assert.notEqual(essence.carriers[0].id, essence.carriers[1].id);
    assert.deepEqual(essence.totals, { sun: 4, moon: 6 });
  });

  for (const [checked, kind] of [[true, 'check'], [false, 'none']]) {
    it(`classifies persisted ${kind} after live configuration changed`, async () => {
      const { deletedRecipeModel } = await createPersistedCraftingHistory({ stageCount: 1, checked });
      const account = presentHistory(deletedRecipeModel, text);
      assert.equal(account.summary.kind, kind);
      assert.equal(account.stages[0].name, 'Stage 1');
    });
  }
});
