import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichHistoricalConsumption, historicalItemSources } from '../../src/systems/historyItemEvidence.js';
import { gatheringHistoryEvidence } from '../../src/systems/gatheringHistoryEvidence.js';
import { RunJournalBuilder } from '../../src/systems/RunJournalBuilder.js';
import { legacyGatheringEvidence as legacyGather } from '../helpers/journal-fixtures.js';

const physical = (fields = {}) => ({ actorUuid: 'Actor.a', itemUuid: 'Actor.a.Item.material', quantity: 2, ...fields });
const stage = (rows, prepared = []) => ({ consumedIngredients: rows, preparedConsumption: { consumedSummary: prepared } });

test('consumption enrichment preserves captured identity, quantity, order and physical metadata', () => {
  const input = stage([physical({ name: 'Steel Billet' }), physical({ itemUuid: 'Actor.a.Item.other', quantity: 0 })],
    [physical({ name: 'Iron Ingot', img: 'captured.webp', quantity: 99 })]);
  const before = structuredClone(input);
  const rows = enrichHistoricalConsumption(input);
  assert.equal(rows[0].name, 'Steel Billet');
  assert.equal(rows[0].img, 'captured.webp');
  assert.deepEqual(rows.map(({ itemUuid, quantity }) => ({ itemUuid, quantity })), input.consumedIngredients.map(({ itemUuid, quantity }) => ({ itemUuid, quantity })));
  assert.deepEqual(input, before);
  assert.notEqual(rows[0], input.consumedIngredients[0]);
});

test('metadata precedence is prepared, live, earlier consistent history, genuine scoped component', () => {
  const earlierItems = [physical({ name: 'Earlier', img: 'earlier.webp', quantity: 900 })];
  const options = { earlierItems, liveItem: () => ({ name: 'Live' }), component: () => ({ name: 'Definition', img: 'definition.webp' }) };
  assert.equal(enrichHistoricalConsumption(stage([physical()], [physical({ name: 'Prepared' })]), options)[0].name, 'Prepared');
  assert.deepEqual(enrichHistoricalConsumption(stage([physical()]), options)[0], physical({ name: 'Live', img: 'earlier.webp' }));
  assert.equal(enrichHistoricalConsumption(stage([physical()]), { earlierItems })[0].name, 'Earlier');
  assert.equal(enrichHistoricalConsumption(stage([physical()]), { component: options.component })[0].name, null);
  assert.equal(enrichHistoricalConsumption(stage([physical({ componentId: 'real' })]), { component: options.component })[0].name, 'Definition');
});

test('conflicting fields and incompatible actor qualifiers cannot be repaired by weaker evidence', () => {
  const prepared = [physical({ name: 'One', img: 'same.webp' }), physical({ name: 'Two', img: 'same.webp' })];
  const [row] = enrichHistoricalConsumption(stage([physical()], prepared), { liveItem: () => ({ name: 'Guess' }) });
  assert.equal(row.name, null);
  assert.equal(row.img, 'same.webp');
  for (const itemUuid of ['material', 'Item.material', 'Actor.b.Item.material', 'Scene.s.Token.t.Actor.a.Item.material']) {
    assert.equal(enrichHistoricalConsumption(stage([physical()], [physical({ itemUuid, name: 'Wrong' })]))[0].name, null);
  }
  assert.equal(enrichHistoricalConsumption(stage([physical({ actorUuid: 'Actor.b' })], prepared), { liveItem: () => ({ name: 'Wrong' }) })[0].name, null);
});

test('historical sources require earlier timestamps and applied versioned or legacy terminal receipts', () => {
  const legacy = { status: 'succeeded', finishedAt: 10, steps: [{ createdResults: [physical({ name: 'Legacy' })] }] };
  const current = { ...legacy, lifecycleVersion: 1, executionJournal: { effects: [{ phase: 'planned', receipt: [physical({ name: 'Planned' })] }] } };
  assert.deepEqual(historicalItemSources([legacy, current], 20).map((row) => row.name), ['Legacy']);
  assert.deepEqual(historicalItemSources([legacy], 10), []);
  assert.equal(historicalItemSources([legacy], 10, { sameTimeIsEarlier: true })[0].name, 'Legacy');
  assert.deepEqual(historicalItemSources([legacy], null), []);
  for (const lifecycleVersion of [null, undefined, '1', 2]) {
    assert.deepEqual(historicalItemSources([{ ...legacy, lifecycleVersion }], 20), []);
  }
  current.executionJournal.effects[0].phase = 'applied';
  current.executionJournal.effects[0].kind = 'awardResults';
  current.executionJournal.effects[0].receipt = { results: current.executionJournal.effects[0].receipt };
  assert.deepEqual(historicalItemSources([current], 20).map((row) => row.name), ['Planned']);
});

test('legacy full Item compendium identities recover 12/94 rolls and 2/1 quantities without a root roll', () => {
  const data = legacyGather();
  const before = structuredClone(data);
  const evidence = gatheringHistoryEvidence(data);
  assert.equal(evidence.rollModel, 'perRow');
  assert.equal(evidence.roll, null);
  assert.deepEqual(evidence.entries.map((row) => [row.rawRoll, row.qty]), [[12, 2], [94, 1]]);
  assert.deepEqual(evidence.unattributedAwardIndexes, []);
  assert.deepEqual(data, before);
  data.result.items[1].roll = 12;
  assert.equal(gatheringHistoryEvidence(data).rollModel, 'perRow');
  data.result.roll = 42;
  assert.equal(gatheringHistoryEvidence(data).rollModel, 'shared');
});

test('attribution rejects ambiguity and conflicts, preserves known neighbors and keeps unmatched receipts once', () => {
  const data = legacyGather();
  data.awards.push({ itemUuid: 'Compendium.other.materials.Item.gem', quantity: 4 });
  data.components[1].aliasItemUuids = ['Compendium.example.materials.ore'];
  const evidence = gatheringHistoryEvidence(data);
  assert.deepEqual(evidence.entries.map((row) => row.qty), [null, 1]);
  assert.deepEqual(evidence.unattributedAwardIndexes, [0, 2]);
  data.awards[1].resultRowId = 'absent';
  assert.equal(gatheringHistoryEvidence(data).entries[1].qty, null);
});

test('explicit row linkage sums receipts but rejects conflicting source or scope', () => {
  const data = legacyGather();
  data.result.items[0].resultRowId = 'selected-ore';
  data.awards[0].resultRowId = 'selected-ore';
  data.awards.push({ ...data.awards[0], quantity: 3 });
  assert.equal(gatheringHistoryEvidence(data).entries[0].qty, 5);
  data.awards[0].craftingSystemId = 'other';
  assert.equal(gatheringHistoryEvidence(data).entries[0].qty, 3);
  data.awards[2].itemUuid = 'Compendium.example.materials.Actor.ore';
  assert.equal(gatheringHistoryEvidence(data).entries[0].qty, null);
});

test('source-only attribution requires a valid complete Item address, never names or UUID tails', () => {
  for (const itemUuid of ['ore', 'Item.ore', 'Compendium.other.materials.Item.ore',
    'Compendium.example.other.Item.ore', 'Compendium.example.materials.Actor.ore',
    'Compendium.example.materials.Item.ore.ActiveEffect.effect']) {
    const data = legacyGather();
    data.awards[0].itemUuid = itemUuid;
    assert.equal(gatheringHistoryEvidence(data).entries[0].qty, null, itemUuid);
  }
  const data = legacyGather();
  data.components[0].registeredItemUuid = 'Item.other';
  data.components[0].aliasItemUuids = ['Compendium.example.materials.ore'];
  assert.equal(gatheringHistoryEvidence(data).entries[0].qty, 2);
});

test('unknown, zero and physical actor conflicts retain independent row evidence', () => {
  const data = legacyGather();
  data.awards[0].quantity = 0;
  data.awards[1].quantity = null;
  const result = gatheringHistoryEvidence(data);
  assert.deepEqual(result.entries.map((row) => [row.qty, row.cleared, row.rawRoll]), [[0, true, 12], [null, true, 94]]);
  assert.deepEqual(result.unattributedAwardIndexes, [1]);
  data.awards[1].quantity = false;
  assert.equal(gatheringHistoryEvidence(data).entries[1].qty, null);
  data.result.items[0].itemUuid = 'Actor.a.Item.ore';
  data.awards[0] = { componentId: 'ore', itemUuid: 'Actor.b.Item.ore', quantity: 2 };
  assert.equal(gatheringHistoryEvidence(data).entries[0].qty, null);
});

test('builder uses full scoped definitions while display callbacks remain name/image only', () => {
  const data = legacyGather();
  const run = { id: 'legacy', status: 'succeeded', craftingSystemId: data.systemId, taskId: 'mine', checkResult: data.result, createdResults: data.awards };
  const builder = new RunJournalBuilder({ gatheringRunSource: { getRunHistory: () => [run] },
    getSystem: () => ({ id: data.systemId, components: data.components }), getComponent: () => ({ name: 'Display only', img: '' }) });
  const model = builder.buildListing({ actor: { id: 'a', uuid: 'Actor.a' }, viewer: { isGM: true } }).history[0];
  assert.deepEqual(model.gatheringYield.entries.map((row) => row.qty), [2, 1]);
  assert.equal(model.gatheringYield.rollModel, 'perRow');
  run.createdResults[0].quantity = false;
  const invalid = builder.buildListing({ actor: { id: 'a', uuid: 'Actor.a' }, viewer: { isGM: true } }).history[0];
  assert.equal(invalid.createdResults[0].quantity, null);
  assert.equal(invalid.gatheringYield.entries[0].qty, null);
});

for (const access of ['visible', 'denied', 'throws', 'missing']) {
  test(`builder filters historical metadata sources before enrichment (${access})`, () => {
    const source = { id: 'earlier', recipeId: 'source', status: 'succeeded', finishedAt: 10,
      steps: [{ createdResults: [physical({ name: 'Earlier identity', img: 'earlier.webp' })] }] };
    const target = { id: 'later', recipeId: 'target', status: 'succeeded', startedAt: 10, finishedAt: 10,
      steps: [{ stepId: 'only', status: 'succeeded', ...stage([physical()]), lastCheckResult: { success: true, data: {} } }] };
    const runs = [target, source];
    const before = structuredClone(runs);
    const builder = new RunJournalBuilder({ craftingRunManager: { getRunHistory: () => runs },
      recipeManager: { getRecipe: (id) => ({ id, getExecutionSteps: () => [] }) },
      recipeVisibility: { evaluateRecipeAccess: ({ recipe }) => {
        if (recipe.id === 'target') return { visible: true };
        if (access === 'throws') throw new Error('unavailable');
        return access === 'missing' ? null : { visible: access === 'visible' };
      } },
    });
    const row = builder.buildListing({ actor: { id: 'a', uuid: 'Actor.a' }, viewer: { isGM: false } }).history[0].steps[0];
    assert.equal(row.consumedIngredients[0].name, access === 'visible' ? 'Earlier identity' : null);
    assert.equal(row.consumedIngredients[0].quantity, 2);
    assert.equal(row.resolutionSnapshot, null);
    assert.deepEqual(runs, before);
    runs.reverse();
    const reversed = builder.buildListing({ actor: { id: 'a', uuid: 'Actor.a' }, viewer: { isGM: true } }).history[1];
    assert.equal(reversed.steps[0].consumedIngredients[0].name, null, 'later equal-time records are not earlier metadata');
  });
}
