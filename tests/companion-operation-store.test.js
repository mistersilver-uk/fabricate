import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCompanionOperationRecord,
  observeCompanionOperationRecord,
} from '../src/systems/companionOperationRecord.js';
import {
  COMPANION_OPERATION_RECORD_FLAG,
  createCompanionOperationStore,
} from '../src/systems/companionOperationStore.js';

const OPERATION_ID = 'AbCdEfGhIjKlMn01';

function submission(componentId = 'iron') {
  return {
    operationId: OPERATION_ID,
    plan: {
      schemaVersion: 1,
      source: { namespace: 'fabricate-premium', occurrenceId: 'activity-1', kind: 'resolution' },
      decisions: [],
      effects: [
        {
          effectId: 'reward',
          kind: 'awardComponents',
          payload: { componentId },
          requiresDecisionIds: [],
        },
      ],
    },
  };
}

function page(record, id = record.operationId) {
  return {
    id,
    _id: id,
    flags: { fabricate: { companionOperationRecord: structuredClone(record) } },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
  };
}

function parent(id, pages) {
  return {
    id,
    _id: id,
    pages: {
      get(pageId) {
        return pages.get(pageId) ?? null;
      },
    },
  };
}

function harness({ now = 100 } = {}) {
  const stored = new Map();
  const calls = { reads: [], creates: [], updates: [] };
  const ledger = {
    id: 'ledger-1',
    async createEmbeddedDocuments(type, sources, options) {
      calls.creates.push({ type, sources: structuredClone(sources), options: structuredClone(options) });
      const source = sources[0];
      if (stored.has(source._id)) throw new Error('duplicate id');
      const created = page(source.flags.fabricate.companionOperationRecord, source._id);
      stored.set(source._id, created);
      return [created];
    },
    async updateEmbeddedDocuments(type, updates) {
      calls.updates.push({ type, updates: structuredClone(updates) });
      const update = updates[0];
      const existing = stored.get(update._id);
      if (!existing) throw new Error('missing page');
      existing.flags.fabricate.companionOperationRecord = structuredClone(
        update[COMPANION_OPERATION_RECORD_FLAG]
      );
      return [existing];
    },
  };
  const readAuthoritativeLedger = async (ledgerId) => {
    calls.reads.push(ledgerId);
    return { status: 'available', ledger: parent(ledger.id, stored) };
  };
  return {
    calls,
    ledger,
    stored,
    store: createCompanionOperationStore({ ledger, readAuthoritativeLedger, clock: () => now }),
  };
}

function completedRecord() {
  const record = createCompanionOperationRecord(submission(), 100);
  record.state = 'completed';
  record.revision = 1;
  record.decisionStates = [];
  record.effectStates[0] = {
    effectId: 'reward',
    phase: 'applied',
    evidence: { itemId: 'item-1' },
    waiver: null,
  };
  record.outcome = { awarded: 1 };
  record.updatedAt = 101;
  return observeCompanionOperationRecord(record);
}

test('accept maps the fixed operation id to the exact Foundry embedded-page call', async () => {
  const { calls, stored, store } = harness();
  const result = await store.accept(submission());

  assert.equal(result.status, 'accepted');
  assert.equal(result.record.operationId, OPERATION_ID);
  assert.deepEqual(calls.reads, ['ledger-1']);
  assert.equal(calls.creates.length, 1);
  assert.deepEqual(calls.creates[0], {
    type: 'JournalEntryPage',
    sources: [
      {
        _id: OPERATION_ID,
        name: `Fabricate Companion Operation ${OPERATION_ID}`,
        type: 'text',
        text: { content: '', format: 1 },
        flags: {
          fabricate: {
            companionOperationRecord: result.record,
          },
        },
      },
    ],
    options: { keepId: true },
  });
  assert.deepEqual(
    stored.get(OPERATION_ID).flags.fabricate.companionOperationRecord,
    result.record
  );
});

test('existing records classify duplicate or conflict without creating', async () => {
  const duplicate = harness();
  duplicate.stored.set(OPERATION_ID, page(createCompanionOperationRecord(submission(), 50)));
  const duplicateResult = await duplicate.store.accept(submission());
  assert.equal(duplicateResult.status, 'duplicate');
  assert.equal(duplicateResult.record.acceptedAt, 50);
  assert.equal(duplicate.calls.creates.length, 0);

  const conflict = await duplicate.store.accept(submission('copper'));
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.record.plan.effects[0].payload.componentId, 'iron');
  assert.equal(duplicate.calls.creates.length, 0);
});

test('two absent pre-reads preserve the winning immutable plan and conflict the loser', async () => {
  const fixture = harness();
  let reads = 0;
  let releaseReads;
  const bothRead = new Promise((resolve) => {
    releaseReads = resolve;
  });
  const readAuthoritativeLedger = async () => {
    reads += 1;
    if (reads === 2) releaseReads();
    await bothRead;
    return { status: 'available', ledger: parent(fixture.ledger.id, fixture.stored) };
  };
  const first = createCompanionOperationStore({
    ledger: fixture.ledger,
    readAuthoritativeLedger,
    clock: () => 100,
  });
  const second = createCompanionOperationStore({
    ledger: fixture.ledger,
    readAuthoritativeLedger,
    clock: () => 200,
  });

  const iron = submission('iron');
  const copper = submission('copper');
  const results = await Promise.all([first.accept(iron), second.accept(copper)]);
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ['accepted', 'conflict']
  );
  assert.equal(fixture.calls.creates.length, 2);
  assert.equal(fixture.calls.creates.every((call) => call.options.keepId === true), true);
  assert.equal(fixture.stored.size, 1);

  const winner = fixture.stored.get(OPERATION_ID).flags.fabricate.companionOperationRecord;
  const winnerComponentId = winner.plan.effects[0].payload.componentId;
  const loser = winnerComponentId === 'iron' ? copper : iron;
  const winningRetry = winnerComponentId === 'iron' ? iron : copper;
  const conflict = results.find((result) => result.status === 'conflict');
  assert.equal(conflict.record.plan.effects[0].payload.componentId, winnerComponentId);

  conflict.record.plan.effects[0].payload.componentId = 'mutated-conflict-output';
  const reread = await first.read(OPERATION_ID);
  assert.equal(reread.record.plan.effects[0].payload.componentId, winnerComponentId);
  assert.equal((await first.accept(loser)).status, 'conflict');
  assert.equal((await first.accept(winningRetry)).status, 'duplicate');
  assert.equal(
    fixture.stored.get(OPERATION_ID).flags.fabricate.companionOperationRecord.plan.effects[0]
      .payload.componentId,
    winnerComponentId
  );
});

test('a rejected or acknowledgement-lost create classifies only from authoritative readback', async () => {
  const fixture = harness();
  fixture.ledger.createEmbeddedDocuments = async (type, sources, options) => {
    fixture.calls.creates.push({ type, sources: structuredClone(sources), options });
    const source = sources[0];
    fixture.stored.set(
      source._id,
      page(source.flags.fabricate.companionOperationRecord, source._id)
    );
    throw new Error('acknowledgement lost');
  };

  const result = await fixture.store.accept(submission());
  assert.equal(result.status, 'duplicate');
  assert.equal(result.record.operationId, OPERATION_ID);
  assert.equal(fixture.calls.reads.length, 2);

  const empty = harness();
  empty.ledger.createEmbeddedDocuments = async () => [];
  assert.deepEqual(await empty.store.accept(submission()), { status: 'unavailable' });

  const rejected = harness();
  rejected.ledger.createEmbeddedDocuments = async () => {
    throw new Error('rejected');
  };
  assert.deepEqual(await rejected.store.accept(submission()), { status: 'unavailable' });
});

test('missing parents, unreadable storage and malformed stored flags fail closed', async () => {
  const fixture = harness();
  const missing = createCompanionOperationStore({
    ledger: fixture.ledger,
    readAuthoritativeLedger: async () => ({ status: 'available', ledger: null }),
    clock: () => 1,
  });
  assert.deepEqual(await missing.accept(submission()), { status: 'unavailable' });

  const unreadable = createCompanionOperationStore({
    ledger: fixture.ledger,
    readAuthoritativeLedger: async () => ({ status: 'unavailable' }),
    clock: () => 1,
  });
  assert.deepEqual(await unreadable.accept(submission()), { status: 'unavailable' });

  fixture.stored.set(OPERATION_ID, page({ recordVersion: 999, operationId: OPERATION_ID }));
  assert.deepEqual(await fixture.store.accept(submission()), { status: 'invalidStored' });
});

test('input and returned records stay detached across the first awaited write', async () => {
  const fixture = harness();
  let releaseCreate;
  const createReleased = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  fixture.ledger.createEmbeddedDocuments = async (type, sources, options) => {
    fixture.calls.creates.push({ type, sources: structuredClone(sources), options });
    await createReleased;
    const source = fixture.calls.creates[0].sources[0];
    const created = page(source.flags.fabricate.companionOperationRecord);
    fixture.stored.set(OPERATION_ID, created);
    return [created];
  };

  const input = submission();
  const pending = fixture.store.accept(input);
  await new Promise((resolve) => setImmediate(resolve));
  input.plan.effects[0].payload.componentId = 'mutated';
  releaseCreate();
  const result = await pending;
  assert.equal(result.record.plan.effects[0].payload.componentId, 'iron');

  result.record.plan.effects[0].payload.componentId = 'returned-mutation';
  const reread = await fixture.store.read(OPERATION_ID);
  assert.equal(reread.status, 'found');
  assert.equal(reread.record.plan.effects[0].payload.componentId, 'iron');
});

test('archive uses the exact dotted flag update, verifies persistence and is idempotent', async () => {
  const fixture = harness({ now: 75 });
  fixture.stored.set(OPERATION_ID, page(completedRecord()));

  const result = await fixture.store.archive(OPERATION_ID, 'gm-1');
  assert.equal(result.status, 'archived');
  assert.equal(result.record.revision, 2);
  assert.deepEqual(result.record.archive, { hiddenAt: 75, hiddenBy: 'gm-1' });
  assert.deepEqual(fixture.calls.updates, [
    {
      type: 'JournalEntryPage',
      updates: [
        {
          _id: OPERATION_ID,
          [COMPANION_OPERATION_RECORD_FLAG]: result.record,
        },
      ],
    },
  ]);

  result.record.outcome.awarded = 99;
  const repeated = await fixture.store.archive(OPERATION_ID, 'gm-2');
  assert.equal(repeated.status, 'duplicate');
  assert.equal(repeated.record.outcome.awarded, 1);
  assert.deepEqual(repeated.record.archive, { hiddenAt: 75, hiddenBy: 'gm-1' });
  assert.equal(fixture.calls.updates.length, 1);
});

test('archive acknowledgement loss reconciles, while ineffective updates cannot report success', async () => {
  const lost = harness({ now: 120 });
  lost.stored.set(OPERATION_ID, page(completedRecord()));
  lost.ledger.updateEmbeddedDocuments = async (type, updates) => {
    lost.calls.updates.push({ type, updates: structuredClone(updates) });
    lost.stored.get(OPERATION_ID).flags.fabricate.companionOperationRecord = structuredClone(
      updates[0][COMPANION_OPERATION_RECORD_FLAG]
    );
    throw new Error('acknowledgement lost');
  };
  const reconciled = await lost.store.archive(OPERATION_ID, 'gm-1');
  assert.equal(reconciled.status, 'archived');
  assert.equal(reconciled.record.archive.hiddenAt, 120);

  const ineffective = harness({ now: 130 });
  ineffective.stored.set(OPERATION_ID, page(completedRecord()));
  ineffective.ledger.updateEmbeddedDocuments = async () => [];
  assert.deepEqual(await ineffective.store.archive(OPERATION_ID, 'gm-1'), {
    status: 'unavailable',
  });

  const rejected = harness({ now: 140 });
  rejected.stored.set(OPERATION_ID, page(completedRecord()));
  rejected.ledger.updateEmbeddedDocuments = async () => {
    throw new Error('write failed');
  };
  assert.deepEqual(await rejected.store.archive(OPERATION_ID, 'gm-1'), {
    status: 'unavailable',
  });
});

test('invalid input is tagged before storage', async () => {
  const fixture = harness();
  assert.deepEqual(await fixture.store.accept({ operationId: 'bad', plan: {} }), {
    status: 'invalidInput',
  });
  assert.deepEqual(await fixture.store.read('bad'), { status: 'invalidInput' });
  assert.deepEqual(await fixture.store.archive(OPERATION_ID, ' '), { status: 'invalidInput' });
  assert.equal(fixture.calls.reads.length, 0);
});
