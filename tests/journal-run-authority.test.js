import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  JOURNAL_RUN_CLAIM_PAGE_ID,
  createFoundryJournalRunAuthority,
  createJournalRunAuthority,
} from '../src/systems/journalRunAuthority.js';

function foundryAuthorityFixture(crypto) {
  const journal = [];
  const makeEntry = (source) => {
    let state = source.flags.fabricate.journalRunAuthorityState;
    const pages = new Map();
    return {
      id: 'ledger',
      pages,
      getFlag: (scope, key) =>
        scope === 'fabricate' && key === 'journalRunAuthorityState'
          ? state
          : source.flags?.[scope]?.[key],
      update: async (changes) => {
        state = changes['flags.fabricate.journalRunAuthorityState'];
      },
      get state() {
        return state;
      },
      createEmbeddedDocuments: async (_type, [pageSource]) => {
        const page = {
          id: pageSource._id,
          getFlag: (scope, key) => pageSource.flags?.[scope]?.[key],
        };
        pages.set(page.id, page);
        return [page];
      },
      deleteEmbeddedDocuments: async (_type, ids) => {
        for (const id of ids) pages.delete(id);
        return ids;
      },
    };
  };
  const game = {
    journal,
    user: { id: 'gm', isGM: true },
    users: { activeGM: { id: 'gm', isGM: true } },
  };
  const JournalEntry = {
    create: async (source) => {
      const entry = makeEntry(source);
      journal.push(entry);
      return entry;
    },
  };
  return createFoundryJournalRunAuthority({
    game,
    JournalEntry,
    crypto,
    reconstructExecutions: async () => ({ success: true, reconstructed: 0 }),
  });
}

function sharedAuthorityWorld() {
  const records = [];
  const log = [];
  let ledger = null;
  let nextId = 0;
  let currentTime = 1000;

  const realm = (
    userId = 'gm',
    {
      reconstructExecutions = async () => ({ success: true, reconstructed: 0 }),
      getCurrentUser = () => ({ id: userId, isGM: userId === 'gm' }),
      getActiveGM = () => ({ id: 'gm', active: true, isGM: true }),
    } = {}
  ) =>
    createJournalRunAuthority({
      currentUser: getCurrentUser,
      activeGM: getActiveGM,
      listLedgers: async () => (ledger ? [ledger] : []),
      createLedger: async (source) => {
        ledger = { id: 'ledger', source, state: source.state, claim: null };
        return ledger;
      },
      readState: async (entry) => structuredClone(entry.state),
      writeState: async (entry, state) => {
        log.push(['write', structuredClone(state)]);
        entry.state = structuredClone(state);
      },
      createClaim: async (entry, source) => {
        log.push(['claim', source.claimId]);
        if (entry.claim) throw new Error('duplicate embedded id');
        entry.claim = { id: JOURNAL_RUN_CLAIM_PAGE_ID, ...structuredClone(source) };
        return entry.claim;
      },
      readClaim: async (entry) => entry.claim,
      deleteClaim: async (entry, claimId) => {
        log.push(['release', claimId]);
        if (entry.claim?.claimId !== claimId) return false;
        entry.claim = null;
        return true;
      },
      randomId: () => `id-${++nextId}`,
      now: () => currentTime,
      reconstructExecutions,
    });

  return {
    realm,
    log,
    records,
    get ledger() {
      return ledger;
    },
    setNow(value) {
      currentTime = value;
    },
  };
}

describe('journal run authority ledger', () => {
  it('uses the one global fixed 16-character embedded page id', () => {
    assert.equal(JOURNAL_RUN_CLAIM_PAGE_ID.length, 16);
  });

  it('uses Web Crypto UUIDs for authority claims and prepare tokens', async () => {
    const authority = foundryAuthorityFixture({ randomUUID: () => 'secure-uuid' });
    assert.equal((await authority.setup()).success, true);
    const response = await authority.run(
      { requestId: 'secure-token', senderId: 'player', sessionId: 'one' },
      ({ issuePrepareToken }) => ({
        success: true,
        token: issuePrepareToken({ actorUuid: 'Actor.a', runId: 'run-1' }),
      })
    );
    assert.equal(response.token, 'secure-uuid');
  });

  it('uses Web Crypto bytes when randomUUID is unavailable', async () => {
    let calls = 0;
    const authority = foundryAuthorityFixture({
      getRandomValues: (bytes) => {
        calls += 1;
        bytes.set(Array.from({ length: bytes.length }, (_value, index) => index));
        return bytes;
      },
    });
    assert.equal((await authority.setup()).success, true);
    const response = await authority.run(
      { requestId: 'secure-bytes-token', senderId: 'player', sessionId: 'one' },
      ({ issuePrepareToken }) => ({
        success: true,
        token: issuePrepareToken({ actorUuid: 'Actor.a', runId: 'run-1' }),
      })
    );
    assert.equal(response.token, '000102030405060708090a0b0c0d0e0f');
    assert.ok(calls >= 4, 'boot, claims, and the token use secure random values');
  });

  it('fails closed when Web Crypto is unavailable and has no Math.random fallback', async () => {
    const authority = foundryAuthorityFixture({});
    assert.deepEqual(await authority.setup(), {
      success: false,
      reason: 'secure-random-unavailable',
    });
    const source = readFileSync(new URL('../src/systems/journalRunAuthority.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Math\.random/);
  });

  it('requires explicit active-GM setup and creates a private ledger once', async () => {
    const world = sharedAuthorityWorld();
    const player = world.realm('player');
    assert.deepEqual(await player.setup(), {
      success: false,
      reason: 'active-gm-required',
    });

    const gm = world.realm();
    assert.equal((await gm.availability()).reason, 'ledger-missing');
    assert.equal((await gm.setup()).success, true);
    assert.equal(world.ledger.source.ownership.default, 0);
    assert.equal(world.ledger.source.flags.fabricate.journalRunAuthorityLedger, true);
    assert.deepEqual(await gm.setup(), { success: false, reason: 'ledger-already-exists' });
  });

  it('arbitrates two independent realms through the shared embedded claim', async () => {
    const world = sharedAuthorityWorld();
    const first = world.realm();
    const second = world.realm();
    await first.setup();

    let finish;
    const held = new Promise((resolve) => (finish = resolve));
    const firstRun = first.run(
      { requestId: 'request-a', senderId: 'player', sessionId: 'one' },
      async () => {
        await held;
        return { success: true, value: 'settled' };
      }
    );
    await new Promise((resolve) => setImmediate(resolve));

    const competing = await second.run(
      { requestId: 'request-b', senderId: 'player', sessionId: 'two' },
      async () => ({ success: true, value: 'must-not-run' })
    );
    assert.equal(competing.success, false);
    assert.equal(competing.reason, 'claim-held');

    finish();
    assert.deepEqual(await firstRun, { success: true, value: 'settled' });
    assert.equal(world.ledger.claim, null);
    const writeIndex = world.log.findLastIndex(([kind]) => kind === 'write');
    const releaseIndex = world.log.findLastIndex(([kind]) => kind === 'release');
    assert.ok(writeIndex > -1 && releaseIndex > writeIndex, 'settlement is durable before release');
  });

  it('bootstraps and executes when this realm becomes the elected GM', async () => {
    const world = sharedAuthorityWorld();
    await world.realm().setup();
    let activeGmId = 'gm';
    let reconstructions = 0;
    let executions = 0;
    const successor = world.realm('successor', {
      getCurrentUser: () => ({ id: 'successor', isGM: true }),
      getActiveGM: () => ({ id: activeGmId, active: true, isGM: true }),
      reconstructExecutions: async (scope) => {
        reconstructions += 1;
        assert.deepEqual(scope, { operationId: null, orphaned: true });
        return { success: true, reconstructed: 0 };
      },
    });

    assert.equal(
      (
        await successor.run(
          { requestId: 'before-election', senderId: 'player', sessionId: 'one' },
          async () => (++executions, { success: true })
        )
      ).reason,
      'active-gm-required'
    );
    activeGmId = 'successor';

    assert.deepEqual(
      await successor.run(
        { requestId: 'after-election', senderId: 'player', sessionId: 'one' },
        async () => (++executions, { success: true, executions })
      ),
      { success: true, executions: 1 }
    );
    assert.equal(reconstructions, 1);
    assert.equal(world.ledger.claim, null);
  });

  it('lets a surviving same-user GM tab bootstrap on its next command', async () => {
    const world = sharedAuthorityWorld();
    let finishWinningBoot;
    const winningBootHeld = new Promise((resolve) => (finishWinningBoot = resolve));
    const bootWinner = world.realm('gm', {
      reconstructExecutions: async () => {
        await winningBootHeld;
        return { success: true, reconstructed: 0 };
      },
    });
    let reconstructions = 0;
    const survivor = world.realm('gm', {
      reconstructExecutions: async (scope) => {
        reconstructions += 1;
        assert.deepEqual(scope, { operationId: null, orphaned: true });
        return { success: true, reconstructed: 0 };
      },
    });
    const winnerSetup = bootWinner.setup();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await survivor.bootstrapRecovery()).reason, 'claim-held');
    finishWinningBoot();
    await winnerSetup;
    let executions = 0;

    assert.deepEqual(
      await survivor.run(
        { requestId: 'survivor-command', senderId: 'player', sessionId: 'one' },
        async () => (++executions, { success: true })
      ),
      { success: true }
    );
    assert.equal(reconstructions, 1);
    assert.equal(executions, 1);
    assert.equal(world.ledger.claim, null);
  });

  it('releases the acquired claim and performs no work when the elected GM changes', async () => {
    let activeGmId = 'gm';
    let claim = null;
    let handlerCalls = 0;
    let changeElectionOnClaim = false;
    const ledger = { id: 'ledger', state: { version: 1, requests: {}, prepareTokens: {} } };
    const authority = createJournalRunAuthority({
      currentUser: () => ({ id: 'gm', isGM: true }),
      activeGM: () => ({ id: activeGmId, isGM: true }),
      listLedgers: async () => [ledger],
      createLedger: async () => ledger,
      readState: async () => structuredClone(ledger.state),
      writeState: async (_entry, state) => { ledger.state = structuredClone(state); },
      createClaim: async (_entry, source) => {
        claim = { id: JOURNAL_RUN_CLAIM_PAGE_ID, ...source };
        if (changeElectionOnClaim) activeGmId = 'replacement-gm';
        return claim;
      },
      readClaim: async () => claim,
      deleteClaim: async (_entry, claimId) => {
        if (claim?.claimId !== claimId) return false;
        claim = null;
        return true;
      },
      reconstructExecutions: async () => ({ success: true, reconstructed: 0 }),
      randomId: () => 'claim-id',
    });
    assert.equal((await authority.bootstrapRecovery()).success, true);
    changeElectionOnClaim = true;

    const response = await authority.run(
      { requestId: 'changed-election', senderId: 'player', sessionId: 'one' },
      async () => (++handlerCalls, { success: true })
    );

    assert.deepEqual(response, { success: false, reason: 'active-gm-required' });
    assert.equal(handlerCalls, 0);
    assert.equal(claim, null);
    assert.equal(Object.hasOwn(ledger.state.requests, 'changed-election'), false);
  });

  it('returns a durable settled response for duplicate delivery without replay', async () => {
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();
    let calls = 0;
    const request = { requestId: 'same-request', senderId: 'player', sessionId: 'one' };
    const run = () =>
      authority.run(request, async () => {
        calls += 1;
        return { success: true, receipt: calls };
      });

    assert.deepEqual(await run(), { success: true, receipt: 1 });
    assert.deepEqual(await run(), { success: true, receipt: 1 });
    assert.equal(calls, 1);
    assert.deepEqual(
      await authority.run(
        { requestId: 'same-request', senderId: 'other', sessionId: 'two' },
        async () => ({ success: true, receipt: 'must-not-run' })
      ),
      { success: false, reason: 'request-id-collision' }
    );
  });

  it('retains an ambiguous claim and requires exact recorded reconciliation', async () => {
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();

    const result = await authority.run(
      { requestId: 'uncertain', senderId: 'player', sessionId: 'one' },
      async ({ createExecutionGrant }) => {
        const grant = createExecutionGrant({ operation: 'execute', actorUuid: 'Actor.a' });
        assert.ok(
          authority.consumeExecutionGrant(grant, {
            operation: 'execute',
            actorUuid: 'Actor.a',
            requestId: 'uncertain',
          })
        );
        throw new Error('write acknowledgement lost');
      }
    );

    assert.equal(result.recoveryRequired, true);
    const claimId = world.ledger.claim.claimId;
    assert.deepEqual(await authority.reconcile({ claimId: 'wrong', disposition: 'abandoned' }), {
      success: false,
      reason: 'claim-mismatch',
    });
    assert.equal(world.ledger.claim.claimId, claimId);
    assert.equal((await authority.reconcile({ claimId, disposition: 'abandoned' })).success, true);
    assert.equal(world.ledger.claim, null);
    assert.equal(world.ledger.state.requests.uncertain.status, 'abandoned');
  });

  it('boot reconstruction scans orphaned journals only under a newly acquired claim', async () => {
    const world = sharedAuthorityWorld();
    const scopes = [];
    const authority = world.realm('gm', {
      reconstructExecutions: async (scope) => {
        scopes.push(scope);
        return { success: true, reconstructed: 2 };
      },
    });
    await authority.setup();

    assert.deepEqual(scopes, [{ operationId: null, orphaned: true }]);
    assert.equal(world.ledger.claim, null);
    assert.deepEqual(authority.availability(), { available: true, reason: null });
  });

  it('ordinary observation and a retained claim never trigger orphan reconstruction', async () => {
    const world = sharedAuthorityWorld();
    let reconstructions = 0;
    const authority = world.realm('gm', {
      reconstructExecutions: async () => (++reconstructions, { success: true }),
    });
    await authority.setup();
    reconstructions = 0;
    const player = world.realm('player', {
      reconstructExecutions: async () => (++reconstructions, { success: true }),
    });
    assert.deepEqual(await player.bootstrapRecovery(), { available: true, reason: null });
    assert.equal(reconstructions, 0);
    world.ledger.claim = {
      id: JOURNAL_RUN_CLAIM_PAGE_ID,
      claimId: 'live-claim',
      requestId: 'live-operation',
    };

    assert.equal((await authority.refreshAvailability()).reason, 'claim-held');
    assert.equal((await authority.bootstrapRecovery()).reason, 'claim-held');
    assert.equal((await player.bootstrapRecovery()).reason, 'claim-held');
    let handlerCalls = 0;
    const pendingRealm = world.realm('gm', {
      reconstructExecutions: async () => (++reconstructions, { success: true }),
    });
    assert.equal(
      (
        await pendingRealm.run(
          { requestId: 'must-not-run', senderId: 'player', sessionId: 'one' },
          async () => (++handlerCalls, { success: true })
        )
      ).reason,
      'claim-held'
    );
    assert.equal(reconstructions, 0);
    assert.equal(handlerCalls, 0);
    assert.equal(world.ledger.claim.claimId, 'live-claim');
  });

  it('reconstructs the retained operation before reconciliation releases its claim', async () => {
    const world = sharedAuthorityWorld();
    const events = [];
    const authority = world.realm('gm', {
      reconstructExecutions: async (scope) => {
        events.push(['reconstruct', scope]);
        return { success: true, reconstructed: 1 };
      },
    });
    await authority.setup();
    events.length = 0;
    world.ledger.claim = {
      id: JOURNAL_RUN_CLAIM_PAGE_ID,
      claimId: 'retained',
      requestId: 'operation-7',
    };
    world.ledger.state.requests['operation-7'] = {
      status: 'recoveryRequired',
      operationId: 'operation-7',
      claimId: 'retained',
    };
    const releaseStart = world.log.length;

    assert.equal((await authority.reconcile({
      claimId: 'retained',
      disposition: 'reconciled',
    })).success, true);
    const release = world.log.slice(releaseStart).find(([kind]) => kind === 'release');
    assert.deepEqual(events, [[
      'reconstruct',
      { operationId: 'operation-7', orphaned: false },
    ]]);
    assert.ok(release, 'the claim is released after reconstruction succeeds');
  });

  it('retains the reconciliation claim when reconstruction persistence is uncertain', async () => {
    const world = sharedAuthorityWorld();
    let reconstructionFails = false;
    const authority = world.realm('gm', {
      reconstructExecutions: async () =>
        reconstructionFails
          ? { success: false, reason: 'persist-failed' }
          : { success: true, reconstructed: 0 },
    });
    await authority.setup();
    reconstructionFails = true;
    world.ledger.claim = {
      id: JOURNAL_RUN_CLAIM_PAGE_ID,
      claimId: 'retained',
      requestId: 'operation-8',
    };

    const response = await authority.reconcile({
      claimId: 'retained',
      disposition: 'abandoned',
    });
    assert.deepEqual(response, {
      success: false,
      reason: 'reconstruction-failed',
      claimId: 'retained',
    });
    assert.equal(world.ledger.claim.claimId, 'retained');
  });

  it('persists one-use prepare tokens and refuses release, replay, expiry, and binding mismatch', async () => {
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();
    const binding = {
      senderId: 'player',
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 2,
    };

    const prepared = await authority.run(
      { requestId: 'prepare', senderId: 'player', sessionId: 'one' },
      ({ issuePrepareToken }) => ({
        success: true,
        token: issuePrepareToken(binding, { expiresAt: 2000 }),
      })
    );
    const resolve = (requestId, token, overrides = {}) =>
      authority.run(
        { requestId, senderId: 'player', sessionId: 'one' },
        ({ consumePrepareToken }) => ({
          success: consumePrepareToken(token, { ...binding, ...overrides }) !== null,
        })
      );
    assert.deepEqual(await resolve('resolve', prepared.token), { success: true });
    assert.deepEqual(await resolve('replay', prepared.token), { success: false });

    const released = await authority.run(
      { requestId: 'prepare-release', senderId: 'player', sessionId: 'one' },
      ({ issuePrepareToken, releasePrepareToken }) => {
        const token = issuePrepareToken(binding, { expiresAt: 2000 });
        releasePrepareToken(token, binding);
        return { success: true, token };
      }
    );
    assert.deepEqual(await resolve('released', released.token), { success: false });
    assert.deepEqual(await resolve('mismatch', 'unknown', { runId: 'other' }), { success: false });

    const expires = await authority.run(
      { requestId: 'prepare-expiry', senderId: 'player', sessionId: 'one' },
      ({ issuePrepareToken }) => ({
        success: true,
        token: issuePrepareToken(binding, { expiresAt: 1500 }),
      })
    );
    world.setNow(1501);
    assert.deepEqual(await resolve('expired', expires.token), { success: false });

    const senderBound = await authority.run(
      { requestId: 'prepare-sender', senderId: 'player', sessionId: 'one' },
      ({ issuePrepareToken }) => ({ success: true, token: issuePrepareToken(binding) })
    );
    const wrongSender = await authority.run(
      { requestId: 'wrong-sender', senderId: 'other', sessionId: 'two' },
      ({ consumePrepareToken }) => ({
        success: consumePrepareToken(senderBound.token, binding) !== null,
      })
    );
    assert.deepEqual(wrongSender, { success: false });
  });
});
