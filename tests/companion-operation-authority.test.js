import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMPANION_OPERATION_SOCKET_KIND,
  createCompanionOperationAuthority,
} from '../src/systems/companionOperationAuthority.js';
import {
  createCompanionOperationRecord,
  observeCompanionOperationRecord,
} from '../src/systems/companionOperationRecord.js';
import { createCompanionOperationStore } from '../src/systems/companionOperationStore.js';
import {
  JOURNAL_RUN_CLAIM_PAGE_ID,
  createJournalRunAuthority,
} from '../src/systems/journalRunAuthority.js';
import { effectEvidence } from './helpers/companionEffectEvidence.js';

const CLAIM = JOURNAL_RUN_CLAIM_PAGE_ID;
const OPERATION_ID = 'AbCdEfGhIjKlMn01';
const OTHER_OPERATION_ID = 'AbCdEfGhIjKlMn02';

function plan(componentId = 'iron') {
  return {
    schemaVersion: 1,
    source: { namespace: 'fabricate-premium', occurrenceId: 'activity-1', kind: 'resolution' },
    decisions: [],
    effects: [
      { effectId: 'reward', kind: 'awardComponents', payload: { componentId }, requiresDecisionIds: [] },
    ],
  };
}

/** A detached page with Foundry's `getFlag`, as both the live and the server copy expose it. */
function view(page) {
  if (!page) return null;
  const copy = structuredClone(page);
  copy.getFlag = (scope, key) => copy.flags?.[scope]?.[key];
  return copy;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/**
 * One world: a single private ledger whose embedded pages are the server's, shared by every realm,
 * with an exclusive fixed-`_id` create exactly as the claim page and operation pages rely on.
 */
function sharedWorld() {
  const pages = new Map();
  const users = new Map([
    ['gm', { id: 'gm', isGM: true }],
    ['gm2', { id: 'gm2', isGM: true }],
    ['player', { id: 'player', isGM: false }],
  ]);
  // `live` stands in for a lagging broadcast-fed copy; `null` keeps it in step with the server.
  const hooks = { beforeOperationCreate: null, serverRead: null, live: null };
  const writes = [];
  let elected = 'gm';
  let ids = 0;
  const ledger = {
    id: 'ledger',
    createdTime: 1,
    state: { version: 1, requests: {}, prepareTokens: {}, reconciliations: [] },
    pages: { get: (id) => view((hooks.live ?? pages).get(id)) },
    async createEmbeddedDocuments(_type, [source]) {
      if (source._id !== CLAIM) await hooks.beforeOperationCreate?.(source);
      if (pages.has(source._id)) throw new Error(`The _id [${source._id}] already exists`);
      writes.push(source._id);
      pages.set(source._id, { id: source._id, _id: source._id, flags: structuredClone(source.flags) });
      return [view(pages.get(source._id))];
    },
    async updateEmbeddedDocuments() {
      throw new Error('this increment writes no operation update');
    },
  };
  const readClaim = async (entry) => {
    const page = entry.pages.get(CLAIM);
    if (!page) return null;
    return {
      claimId: page.getFlag('fabricate', 'journalRunClaimId'),
      requestId: page.getFlag('fabricate', 'journalRunRequestId'),
      acquiredAt: page.getFlag('fabricate', 'journalRunClaimedAt'),
    };
  };

  function realm(userId, { executor = null, timeoutMs = 50 } = {}) {
    const emitted = [];
    const currentUser = () => users.get(userId);
    const activeGM = () => users.get(elected) ?? null;
    const authority = createJournalRunAuthority({
      currentUser,
      activeGM,
      listLedgers: async () => [ledger],
      createLedger: async () => {
        throw new Error('the ledger already exists');
      },
      readState: async () => structuredClone(ledger.state),
      writeState: async (_entry, state) => {
        ledger.state = structuredClone(state);
      },
      createClaim: async (_entry, source) => {
        if (pages.has(CLAIM)) throw new Error('duplicate claim');
        pages.set(CLAIM, {
          id: CLAIM,
          flags: {
            fabricate: {
              journalRunClaimId: source.claimId,
              journalRunRequestId: source.requestId,
              journalRunClaimedAt: source.acquiredAt,
            },
          },
        });
        return view(pages.get(CLAIM));
      },
      readClaim,
      deleteClaim: async (_entry, claimId) => {
        const page = pages.get(CLAIM);
        if (!page) return true;
        if (page.flags.fabricate.journalRunClaimId !== claimId) return false;
        pages.delete(CLAIM);
        return true;
      },
      readAuthoritativeLedger: async (ledgerId) => {
        await hooks.serverRead?.();
        if (ledgerId !== ledger.id) return { status: 'unavailable' };
        const copy = new Map([...pages].map(([id, page]) => [id, view(page)]));
        return { status: 'available', ledger: { id: ledger.id, pages: copy } };
      },
      reconstructExecutions: async () => ({ success: true }),
      randomId: () => `${userId}-claim-${++ids}`,
      now: () => 1000,
    });
    const companion = createCompanionOperationAuthority({
      authority,
      createStore: createCompanionOperationStore,
      currentUser,
      activeGM,
      getUser: (id) => users.get(id) ?? null,
      emit: (message, options) => emitted.push({ message, options }),
      randomId: () => `${userId}-${++ids}`,
      clock: () => 500,
      executor,
      timeoutMs,
    });
    return { companion, authority, emitted };
  }

  return {
    realm,
    pages,
    hooks,
    writes,
    ledger,
    elect: (id) => (elected = id),
    record: (id = OPERATION_ID) => pages.get(id)?.flags.fabricate.companionOperationRecord ?? null,
    storeRecord(record) {
      pages.set(record.operationId, {
        id: record.operationId,
        flags: { fabricate: { companionOperationRecord: structuredClone(record) } },
      });
    },
  };
}

/** A persisted record in any state, proven valid by the record contract before it is stored. */
function storedRecord(state, effectPhase, extra = {}) {
  const initial = createCompanionOperationRecord({ operationId: OPERATION_ID, plan: plan() }, 400);
  if (state === 'accepted') return initial;
  const evidence = effectPhase === 'pending' || effectPhase === 'applying' ? null : effectEvidence(effectPhase);
  return observeCompanionOperationRecord({
    ...initial,
    state,
    revision: 1,
    updatedAt: 450,
    effectStates: [{ effectId: 'reward', phase: effectPhase, evidence, waiver: null }],
    ...extra,
  });
}

describe('companion operation authority', () => {
  it('accepts an elected GM local submission under the claim and keeps identities distinct', async () => {
    const world = sharedWorld();
    const calls = [];
    const { companion } = world.realm('gm', {
      executor: async (args) => calls.push(args),
    });
    const result = await companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(result.status, 'accepted');
    assert.equal(result.operationId, OPERATION_ID);
    assert.equal(result.continued, true);
    assert.equal(world.record().operationId, OPERATION_ID);

    const [request] = Object.entries(world.ledger.state.requests).filter(
      ([, entry]) => entry.kind === 'command'
    );
    assert.notEqual(request[0], OPERATION_ID, 'the transport request id is its own');
    assert.equal(request[1].operationId, OPERATION_ID);
    assert.equal(request[1].sessionId, companion.sessionId);
    assert.equal(request[1].status, 'settled');
    assert.equal(world.pages.has(CLAIM), false, 'the claim is released once settled');

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].record, world.record(), 'the executor gets the stored record');
    assert.equal(calls[0].heldClaim.requestId, request[0]);
    assert.equal(calls[0].heldClaim.ledger, world.ledger, 'and the exact claimed live ledger');
  });

  it('keeps one logical record across retries and refuses a conflicting plan', async () => {
    const world = sharedWorld();
    const calls = [];
    const first = world.realm('gm', { executor: async ({ record }) => calls.push(record.state) });
    const second = world.realm('gm', { executor: async ({ record }) => calls.push(record.state) });
    assert.equal((await first.companion.submit({ operationId: OPERATION_ID, plan: plan() })).status, 'accepted');

    // A retry from another browser session, with a fresh request id and the same operation.
    const retry = await second.companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(retry.status, 'duplicate');
    assert.equal(retry.continued, true, 'an equal eligible retry may continue serially');
    const conflict = await second.companion.submit({ operationId: OPERATION_ID, plan: plan('gold') });
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.continued, false);
    assert.equal(world.record().plan.effects[0].payload.componentId, 'iron', 'first plan wins');

    const distinct = await first.companion.submit({ operationId: OTHER_OPERATION_ID, plan: plan() });
    assert.equal(distinct.status, 'accepted', 'an identical plan under another id is its own');
    assert.deepEqual(world.writes, [OPERATION_ID, OTHER_OPERATION_ID], 'one page per operation');
    assert.deepEqual(calls, ['accepted', 'accepted', 'accepted']);
  });

  it('refuses the reserved claim-page id before acceptance and leaves other ids untouched', async () => {
    const world = sharedWorld();
    const { companion } = world.realm('gm');
    assert.deepEqual(await companion.submit({ operationId: CLAIM, plan: plan() }), {
      status: 'refused',
      operationId: CLAIM,
      reason: 'reserved-operation-id',
    });
    assert.deepEqual(
      await companion.handleSubmission(
        { operationId: CLAIM, plan: plan(), requestId: 'r', sessionId: 's' },
        'gm2'
      ),
      { status: 'refused', operationId: CLAIM, reason: 'reserved-operation-id' }
    );
    assert.deepEqual(world.writes, [], 'nothing was claimed or written');
    const accepted = await companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(accepted.record.operationId, OPERATION_ID, 'a valid id is used unchanged');
  });

  it('refuses a non-GM caller and a forged payload identity before acceptance', async () => {
    const world = sharedWorld();
    const player = world.realm('player');
    assert.deepEqual(await player.companion.submit({ operationId: OPERATION_ID, plan: plan() }), {
      status: 'refused',
      operationId: OPERATION_ID,
      reason: 'gm-required',
    });
    assert.deepEqual(player.emitted, [], 'a player relays nothing');

    const gm = world.realm('gm');
    const forged = {
      kind: COMPANION_OPERATION_SOCKET_KIND.REQUEST,
      operationId: OPERATION_ID,
      plan: plan(),
      requestId: 'forged',
      sessionId: 'player-session',
      senderId: 'gm',
      userId: 'gm',
    };
    const reply = await gm.companion.handleSocketMessage(forged, 'player');
    assert.equal(reply.response.reason, 'gm-required', 'only the attested sender counts');
    assert.deepEqual(gm.emitted[0].options, { recipients: ['player'] });
    assert.deepEqual(world.writes, [], 'nothing was claimed or accepted');
  });

  it('relays a non-elected GM submission and settles only the matching requester session', async () => {
    const world = sharedWorld();
    const gm = world.realm('gm');
    const relaying = world.realm('gm2');
    const sibling = world.realm('gm2');
    const pending = relaying.companion.submit({ operationId: OPERATION_ID, plan: plan() });
    await tick();
    assert.deepEqual(world.writes, [], 'a non-elected GM does not accept locally');
    assert.equal(relaying.emitted.length, 1);
    const { message, options } = relaying.emitted[0];
    assert.equal(message.kind, COMPANION_OPERATION_SOCKET_KIND.REQUEST);
    assert.deepEqual(options, { recipients: ['gm'] }, 'the request targets the elected GM User');
    assert.notEqual(message.requestId, OPERATION_ID);

    await gm.companion.handleSocketMessage(message, 'gm2');
    assert.equal(gm.emitted.length, 1, 'exactly one reply');
    const reply = gm.emitted[0];
    assert.deepEqual(reply.options, { recipients: ['gm2'] });
    assert.equal(reply.message.recipientId, 'gm2');
    assert.equal(reply.message.operationId, OPERATION_ID);
    assert.equal(reply.message.requestId, message.requestId);
    assert.equal(reply.message.sessionId, message.sessionId);

    // Targeted recipients reach every browser of the User; only the requesting session settles.
    assert.equal(await sibling.companion.handleSocketMessage(reply.message, 'gm'), false);
    assert.equal(await relaying.companion.handleSocketMessage(reply.message, 'gm'), true);
    assert.equal(await relaying.companion.handleSocketMessage(reply.message, 'gm'), false);
    const result = await pending;
    assert.equal(result.status, 'accepted');
    assert.equal(world.record().operationId, OPERATION_ID);
  });

  it('never lets a wrong sender, recipient or correlation settle a relayed request', async () => {
    const world = sharedWorld();
    const relaying = world.realm('gm2', { timeoutMs: 30 });
    const pending = relaying.companion.submit({ operationId: OPERATION_ID, plan: plan() });
    const request = relaying.emitted[0].message;
    const good = {
      kind: COMPANION_OPERATION_SOCKET_KIND.REPLY,
      recipientId: 'gm2',
      operationId: OPERATION_ID,
      requestId: request.requestId,
      sessionId: request.sessionId,
      response: { status: 'accepted', operationId: OPERATION_ID },
    };
    for (const [label, payload, senderId] of [
      ['a non-elected GM sender', good, 'gm2'],
      ['a player sender', good, 'player'],
      ['another recipient', { ...good, recipientId: 'player' }, 'gm'],
      ['another session', { ...good, sessionId: 'elsewhere' }, 'gm'],
      ['another request', { ...good, requestId: 'elsewhere' }, 'gm'],
      ['another operation', { ...good, operationId: OTHER_OPERATION_ID }, 'gm'],
    ]) {
      assert.equal(await relaying.companion.handleSocketMessage(payload, senderId), false, label);
    }
    // The emit acknowledgement confirms only the relay: the request is still unsettled.
    const result = await pending;
    assert.deepEqual(result, {
      status: 'pending',
      operationId: OPERATION_ID,
      indeterminate: true,
      reason: 'timeout',
    });
  });

  it('times out with the same operation identity and clears no claim', async () => {
    const world = sharedWorld();
    world.pages.set(CLAIM, { id: CLAIM, flags: { fabricate: { journalRunClaimId: 'held' } } });
    const relaying = world.realm('gm2', { timeoutMs: 10 });
    const result = await relaying.companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(result.status, 'pending');
    assert.equal(result.operationId, OPERATION_ID, 'no replacement identity is minted');
    assert.equal(result.indeterminate, true);
    assert.equal(world.pages.get(CLAIM).flags.fabricate.journalRunClaimId, 'held');
  });

  it('lets two browsers of the elected GM contend on one claim, the loser silently', async () => {
    const world = sharedWorld();
    const calls = [];
    const winner = world.realm('gm', { executor: async () => calls.push('winner') });
    const loser = world.realm('gm', { executor: async () => calls.push('loser') });
    const relaying = world.realm('gm2');
    const submitted = relaying.companion.submit({ operationId: OPERATION_ID, plan: plan() });
    const request = relaying.emitted[0].message;

    let release;
    const barrier = new Promise((resolve) => (release = resolve));
    world.hooks.beforeOperationCreate = () => barrier;
    const winning = winner.companion.handleSocketMessage(request, 'gm2');
    await tick();
    assert.equal(world.pages.has(CLAIM), true, 'the winner holds the claim at the barrier');

    // The other browser of the same elected User receives the same targeted request.
    assert.equal(await loser.companion.handleSocketMessage(request, 'gm2'), null);
    assert.deepEqual(loser.emitted, [], 'the loser sends no premature contention reply');
    release();
    const reply = await winning;
    assert.equal(reply.response.status, 'accepted');
    assert.deepEqual(calls, ['winner'], 'the loser neither accepts nor invokes the executor');
    assert.equal(await relaying.companion.handleSocketMessage(reply, 'gm'), true);
    assert.equal((await submitted).status, 'accepted');
  });

  for (const [label, disturb] of [
    ['removed', (world) => world.pages.delete(CLAIM)],
    [
      'replaced',
      (world) => (world.pages.get(CLAIM).flags.fabricate.journalRunClaimId = 'replacement'),
    ],
    [
      'bound to another request',
      (world) => (world.pages.get(CLAIM).flags.fabricate.journalRunRequestId = 'elsewhere'),
    ],
    [
      'unreadable',
      (world) =>
        (world.hooks.serverRead = async () => {
          throw new Error('socket closed');
        }),
    ],
    ['orphaned by an election change', (world) => world.elect('gm2')],
  ]) {
    it(`suppresses the executor when the claim is ${label} during acceptance`, async () => {
      const world = sharedWorld();
      const calls = [];
      const { companion } = world.realm('gm', { executor: async () => calls.push('ran') });
      world.hooks.beforeOperationCreate = () => disturb(world);
      const result = await companion.submit({ operationId: OPERATION_ID, plan: plan() });
      assert.equal(world.record().operationId, OPERATION_ID, 'first-wins acceptance still lands');
      assert.equal(result.continued, false);
      assert.deepEqual(calls, [], 'no executor runs without the exact held claim');
    });
  }

  it('keeps a delayed old callback from licensing a new executor to repeat its work', async () => {
    const world = sharedWorld();
    const calls = [];
    let finishOld;
    const oldDone = new Promise((resolve) => (finishOld = resolve));
    const old = world.realm('gm', {
      executor: async ({ heldClaim }) => {
        calls.push('old started');
        // The executor is already in flight: a claim check cannot preempt it.
        world.elect('gm2');
        await oldDone;
        calls.push(`old may continue: ${await heldClaim.claimStillHeld()}`);
      },
    });
    const running = old.companion.submit({ operationId: OPERATION_ID, plan: plan() });
    await tick();
    await tick();
    assert.deepEqual(calls, ['old started']);

    // The new elected browser sees the old attempt's claim still held and cannot proceed.
    const next = world.realm('gm2', { executor: async () => calls.push('new ran') });
    const blocked = await next.companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(blocked.status, 'unavailable');
    assert.equal(blocked.reason, 'claim-held');
    finishOld();
    await running;
    assert.deepEqual(calls, ['old started', 'old may continue: false']);
  });

  for (const [label, record] of [
    ['failed', storedRecord('failed', 'knownFailure')],
    ['reviewRequired', storedRecord('reviewRequired', 'reviewRequired')],
    ['pending with an applying effect', storedRecord('pending', 'applying')],
    ['completed', storedRecord('completed', 'applied', { outcome: { applied: 1 } })],
  ]) {
    it(`leaves a ${label} stored record observation-only`, async () => {
      const world = sharedWorld();
      world.storeRecord(record);
      const calls = [];
      const { companion } = world.realm('gm', { executor: async () => calls.push('ran') });
      const result = await companion.submit({ operationId: OPERATION_ID, plan: plan() });
      assert.equal(result.status, 'duplicate');
      assert.equal(result.continued, false);
      assert.equal(result.record.state, record.state);
      assert.deepEqual(calls, []);
    });
  }

  it('leaves an awaiting-decision stored record observation-only', async () => {
    const world = sharedWorld();
    const decided = {
      ...plan(),
      decisions: [{ decisionId: 'roll', kind: 'check', payload: {} }],
      effects: [{ ...plan().effects[0], requiresDecisionIds: ['roll'] }],
    };
    const initial = createCompanionOperationRecord({ operationId: OPERATION_ID, plan: decided }, 400);
    world.storeRecord(
      observeCompanionOperationRecord({ ...initial, state: 'awaitingDecision', revision: 1 })
    );
    const calls = [];
    const { companion } = world.realm('gm', { executor: async () => calls.push('ran') });
    const result = await companion.submit({ operationId: OPERATION_ID, plan: decided });
    assert.equal(result.record.state, 'awaitingDecision');
    assert.equal(result.continued, false);
    assert.deepEqual(calls, []);
  });

  it('continues a pending stored record with no applying effect, from the stored copy', async () => {
    const world = sharedWorld();
    world.storeRecord(storedRecord('pending', 'pending'));
    const seen = [];
    const { companion } = world.realm('gm', { executor: async ({ record }) => seen.push(record) });
    const result = await companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(result.continued, true);
    assert.equal(seen[0].revision, 1, 'the reread stored record, not the request-derived one');
  });

  it('never invokes the executor for invalid input, invalid storage or unavailable storage', async () => {
    const calls = [];
    const executor = async () => calls.push('ran');

    const invalidInput = sharedWorld();
    const input = await invalidInput
      .realm('gm', { executor })
      .companion.submit({ operationId: OPERATION_ID, plan: { schemaVersion: 2 } });
    assert.equal(input.status, 'invalidInput');

    const invalidStored = sharedWorld();
    invalidStored.pages.set(OPERATION_ID, {
      id: OPERATION_ID,
      flags: { fabricate: { companionOperationRecord: { malformed: true } } },
    });
    const stored = await invalidStored
      .realm('gm', { executor })
      .companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(stored.status, 'invalidStored');

    const unavailableStore = sharedWorld();
    let reads = 0;
    unavailableStore.hooks.serverRead = async () => {
      reads += 1;
      if (reads === 1) throw new Error('socket closed');
    };
    const unavailableResult = await unavailableStore
      .realm('gm', { executor })
      .companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(unavailableResult.status, 'unavailable');
    assert.deepEqual(calls, []);
  });

  it('retains the claim for reconciliation when the executor throws mid-flight', async () => {
    const world = sharedWorld();
    const { companion } = world.realm('gm', {
      executor: async () => {
        throw new Error('effect exploded');
      },
    });
    const result = await companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(result.reason, 'executor-failed');
    assert.equal(result.recoveryRequired, true);
    assert.equal(world.pages.has(CLAIM), true, 'uncertain work keeps its claim');
    const [request] = Object.values(world.ledger.state.requests).filter(
      (entry) => entry.kind === 'command'
    );
    assert.equal(request.status, 'recoveryRequired');
  });

  it('suppresses the executor when the claim moves between the reread and the second check', async () => {
    for (const [label, disturb] of [
      ['claim removed', (world) => world.pages.delete(CLAIM)],
      ['election lost', (world) => world.elect('gm2')],
    ]) {
      const world = sharedWorld();
      const calls = [];
      const { companion } = world.realm('gm', { executor: async () => calls.push('ran') });
      let reads = 0;
      // Reads: the store's pre-create lookup, the first claim check, the store's reread, then
      // the second claim check, which alone can see this disturbance.
      world.hooks.serverRead = async () => {
        reads += 1;
        if (reads === 4) disturb(world);
      };
      const result = await companion.submit({ operationId: OPERATION_ID, plan: plan() });
      assert.equal(reads, 4, label);
      assert.equal(result.reason, 'claim-lost', label);
      assert.deepEqual(calls, [], label);
    }
  });

  it('contends on the command claim itself once both browsers have booted', async () => {
    const world = sharedWorld();
    const calls = [];
    const winner = world.realm('gm', { executor: async () => calls.push('winner') });
    const loser = world.realm('gm', { executor: async () => calls.push('loser') });
    assert.deepEqual(await winner.authority.bootstrapRecovery(), { success: true });
    assert.deepEqual(await loser.authority.bootstrapRecovery(), { success: true });
    const relaying = world.realm('gm2');
    relaying.companion.submit({ operationId: OPERATION_ID, plan: plan() });
    const request = relaying.emitted[0].message;

    let release;
    world.hooks.beforeOperationCreate = () => new Promise((resolve) => (release = resolve));
    const winning = winner.companion.handleSocketMessage(request, 'gm2');
    await tick();
    assert.equal(await loser.companion.handleSocketMessage(request, 'gm2'), null);
    assert.deepEqual(loser.emitted, []);
    release();
    assert.equal((await winning).response.status, 'accepted');
    assert.deepEqual(calls, ['winner']);
  });

  it('reads the server copy, never the lagging live copy, for records and the claim', async () => {
    const world = sharedWorld();
    world.storeRecord(storedRecord('accepted', 'pending'));
    // The live copy lags: it has neither the stored record nor, later, the server's claim change.
    world.hooks.live = new Map();
    const calls = [];
    const { companion } = world.realm('gm', { executor: async () => calls.push('ran') });
    const duplicate = await companion.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(duplicate.status, 'duplicate', 'the stored record is found on the server copy');
    assert.deepEqual(calls, ['ran']);

    // Now the live copy still shows a claim the server has replaced.
    const other = sharedWorld();
    const { companion: second } = other.realm('gm', { executor: async () => calls.push('again') });
    other.hooks.beforeOperationCreate = () => {
      other.hooks.live = new Map([...other.pages].map(([id, page]) => [id, structuredClone(page)]));
      other.pages.get(CLAIM).flags.fabricate.journalRunClaimId = 'replacement';
    };
    const result = await second.submit({ operationId: OPERATION_ID, plan: plan() });
    assert.equal(result.continued, false, 'a stale live claim grants nothing');
    assert.deepEqual(calls, ['ran']);
  });
});
