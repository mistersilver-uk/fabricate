import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS,
  JOURNAL_RUN_CLAIM_PAGE_ID,
  createFoundryJournalRunAuthority,
  createJournalRunAuthority,
} from '../src/systems/journalRunAuthority.js';
import { JOURNAL_RUN_COMMAND_TIMEOUT_MS } from '../src/systems/journalRunCommands.js';

/**
 * Models the V13.351/V14.365 server rules the arbitration rests on: `keepId` is what preserves a
 * requested embedded `_id` (without it the id is silently replaced by a fresh one), and only then
 * does the parent collection's duplicate-`_id` check reject the second create.
 */
function foundryAuthorityFixture(crypto, { failServerRead = () => false } = {}) {
  const journal = [];
  const claimCalls = [];
  // Every message the real `SocketInterface.#handleError` would have shown the user. It raises
  // `ui.notifications.error` UNCONDITIONALLY before returning the error for rejection, so a
  // server rejection IS a toast and no `catch` in the adapter can take it back. Counting them is
  // the only way to assert the maintainer's requirement: that the user sees nothing.
  const serverRejections = [];
  const getCalls = [];
  let generatedPageIds = 0;
  let ledgerSeq = 0;
  const makeEntry = (source) => {
    let state = source.flags.fabricate.journalRunAuthorityState;
    // The SERVER's pages, and the broadcast-fed LOCAL mirror of them, kept as two collections so
    // a test can drive them apart the way a missed delete broadcast does in a real world.
    const serverPages = new Map();
    const pages = new Map();
    ledgerSeq += 1;
    const entryId = ledgerSeq === 1 ? 'ledger' : `ledger-${ledgerSeq}`;
    return {
      id: entryId,
      _id: entryId,
      _stats: { createdTime: 5000 },
      pages,
      serverPages,
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
      createEmbeddedDocuments: async (_type, [pageSource], options = {}) => {
        claimCalls.push({ source: pageSource, options });
        generatedPageIds += 1;
        const id =
          options.keepId && pageSource._id ? pageSource._id : `generated-${generatedPageIds}`;
        if (serverPages.has(id)) {
          // `_createDocuments` throws this inside the database semaphore, which is what makes
          // the fixed-`_id` claim an atomic compare-and-set.
          const message = `The _id [${id}] already exists within the parent collection`;
          serverRejections.push(message);
          throw new Error(message);
        }
        const page = { id, getFlag: (scope, key) => pageSource.flags?.[scope]?.[key] };
        serverPages.set(page.id, page);
        pages.set(page.id, page);
        return [page];
      },
      // Core resolves the DELETED DOCUMENTS, not their ids. A looser double answering ids kept
      // the adapter's `item === page.id` fallback alive and hid the fall-open branch beside it.
      //
      // It also never REFUSED, which is how a vacuous absence guard came to ship beside it. Real
      // `deleteEmbeddedDocuments` rejects twice over: `#preDeleteDocumentArray` resolves each id
      // through `collection.get(id, {strict: true})` against the LOCAL collection before
      // dispatching, and `_deleteDocuments` then throws `<Type> "<id>" does not exist!` for an id
      // the SERVER has not got. Only the second is a toast, and only a SUCCESSFUL response prunes
      // the local collection, so a rejected delete leaves `pages` exactly as it was.
      deleteEmbeddedDocuments: async (type, ids) => {
        for (const id of ids) {
          if (!pages.has(id)) {
            throw new Error(`${type} id [${id}] does not exist in the EmbeddedCollection`);
          }
        }
        for (const id of ids) {
          if (!serverPages.has(id)) {
            const message = `${type} "${id}" does not exist!`;
            serverRejections.push(message);
            throw new Error(message);
          }
        }
        const removed = ids.map((id) => serverPages.get(id));
        for (const id of ids) {
          serverPages.delete(id);
          pages.delete(id);
        }
        return removed;
      },
      /** Another realm's delete, whose broadcast this client never received. */
      dropServerPage: (id) => serverPages.delete(id),
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
  // The authoritative server read the provisioner and the claim release both rest on.
  // `CONFIG.DatabaseBackend.get` is public on V13.351 and V14.365, and an adapter that CANNOT
  // perform it now reports unsettled rather than "no ledger exists" — so a fixture without it
  // would model a dead runtime. It answers from `serverPages`, never from the local mirror, and
  // honours the `_id` query the release scopes its read with.
  const CONFIG = {
    DatabaseBackend: {
      get: async (_documentClass, { query = {} } = {}) => {
        getCalls.push(query);
        // `get` dispatches through `SocketInterface`, whose `#handleError` toasts and THEN
        // rejects, so the read is a rejecting seam exactly like the writes beside it.
        if (failServerRead(query)) {
          const message = 'You do not have permission to browse this Journal';
          serverRejections.push(message);
          throw new Error(message);
        }
        return journal
          .filter((entry) => Object.entries(query).every(([key, value]) => entry[key] === value))
          .map((entry) => ({
            _id: entry._id,
            id: entry.id,
            _stats: entry._stats,
            pages: new Map(entry.serverPages),
            getFlag: entry.getFlag,
          }));
      },
    },
  };
  const authority = createFoundryJournalRunAuthority({
    game,
    JournalEntry,
    CONFIG,
    crypto,
    reconstructExecutions: async () => ({ success: true, reconstructed: 0 }),
  });
  return Object.assign(authority, { claimCalls, journal, makeEntry, serverRejections, getCalls });
}

/**
 * Seat a claim page belonging to ANOTHER realm on one ledger, server copy and local mirror alike,
 * exactly as the create broadcast would have delivered it.
 */
function seatForeignClaim(entry, claimId, acquiredAt = Date.now()) {
  const flags = {
    fabricate: {
      journalRunClaimId: claimId,
      journalRunRequestId: 'req-elsewhere',
      journalRunClaimedAt: acquiredAt,
    },
  };
  const page = {
    id: JOURNAL_RUN_CLAIM_PAGE_ID,
    getFlag: (scope, key) => flags[scope]?.[key],
  };
  entry.serverPages.set(page.id, page);
  entry.pages.set(page.id, page);
  return page;
}

function sharedAuthorityWorld() {
  const server = new Map();
  const log = [];
  let nextId = 0;
  let currentTime = 1000;
  let createdTime = 5000;
  let ledgerSeq = 0;

  function addLedger(state = null) {
    ledgerSeq += 1;
    createdTime += 10;
    const ledger = {
      id: ledgerSeq === 1 ? 'ledger' : `ledger-${ledgerSeq}`,
      createdTime,
      source: { ownership: { default: 0 }, flags: { fabricate: {} } },
      state: state ?? { version: 1, requests: {}, prepareTokens: {}, reconciliations: [] },
      claim: null,
    };
    server.set(ledger.id, ledger);
    return ledger;
  }

  function present(entry) {
    if (!server.has(entry?.id)) throw new Error('ledger deleted');
    return entry;
  }

  const realm = (
    userId = 'gm',
    {
      onAvailabilityRestored = null,
      reconstructExecutions = async () => ({ success: true, reconstructed: 0 }),
      getCurrentUser = () => ({ id: userId, isGM: userId === 'gm' }),
      getActiveGM = () => ({ id: 'gm', active: true, isGM: true }),
      canCreateLedger = () => true,
      // The authoritative server read. `null` / a rejection models an adapter that could not
      // perform it, which must never be read as "the server says no ledger exists".
      listLedgerRecords = async () =>
        [...server.values()].map((entry) => ({ id: entry.id, createdTime: entry.createdTime })),
      beforeCreate = null,
      beforeClaim = null,
      beforeWrite = null,
    } = {}
  ) =>
    createJournalRunAuthority({
      currentUser: getCurrentUser,
      activeGM: getActiveGM,
      listLedgers: async () => [...server.values()],
      listLedgerRecords,
      canCreateLedger,
      createLedger: async (source) => {
        await beforeCreate?.();
        const ledger = addLedger(source.state);
        ledger.source = source;
        log.push(['create', ledger.id]);
        return ledger;
      },
      deleteLedger: async (entry) => {
        log.push(['delete', entry.id]);
        server.delete(entry.id);
      },
      readState: async (entry) => structuredClone(present(entry).state),
      writeState: async (entry, state) => {
        await beforeWrite?.(entry);
        log.push(['write', structuredClone(state)]);
        present(entry).state = structuredClone(state);
      },
      createClaim: async (entry, source) => {
        await beforeClaim?.(entry);
        log.push(['claim', source.claimId]);
        if (present(entry).claim) throw new Error('duplicate embedded id');
        entry.claim = { id: JOURNAL_RUN_CLAIM_PAGE_ID, ...structuredClone(source) };
        return entry.claim;
      },
      readClaim: async (entry) => present(entry).claim,
      deleteClaim: async (entry, claimId) => {
        log.push(['release', claimId]);
        if (entry.claim?.claimId !== claimId) return false;
        entry.claim = null;
        return true;
      },
      randomId: () => `id-${++nextId}`,
      now: () => currentTime,
      reconstructExecutions,
      onAvailabilityRestored,
    });

  return {
    realm,
    log,
    addLedger,
    removeLedger: (id) => server.delete(id),
    ledgers: () => [...server.values()],
    get ledger() {
      return [...server.values()][0] ?? null;
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

  it('reconciles a claim whose page is already gone, rather than refusing or throwing', async () => {
    // The maintainer hit this on the release button. `entry.pages` is the BROADCAST-FED local
    // copy, so the UI can offer a release for a claim the server has already removed — another
    // realm's reaper, or a release this client has not heard about. Core's
    // `deleteEmbeddedDocuments` THROWS for an absent id, and the escaping throw left the run
    // blocked reporting `JournalEntryPage "FabRunAuthority1" does not exist!`.
    //
    // Absence IS the goal state reconciliation exists to reach, so reaching it already is a
    // success, not a `claim-mismatch` refusal. A DIFFERENT claim still refuses — asserted below.
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();
    world.ledger.state.requests['req-uncertain'] = {
      kind: 'command',
      status: 'recoveryRequired',
      claimId: 'claim-gone',
    };
    world.ledger.claim = null;

    const released = await authority.reconcile({
      claimId: 'claim-gone',
      disposition: 'reconciled',
    });
    assert.equal(released.success, true, 'an already-absent claim reports the goal state reached');
    assert.equal(
      authority.availability().available,
      true,
      'and the run the claim blocked is usable again'
    );

    world.ledger.claim = {
      id: JOURNAL_RUN_CLAIM_PAGE_ID,
      claimId: 'someone-elses',
      requestId: 'req-other',
      acquiredAt: 1000,
    };
    assert.equal(
      (await authority.reconcile({ claimId: 'claim-gone', disposition: 'reconciled' })).reason,
      'claim-mismatch',
      'a DIFFERENT live claim is still a refusal, so the tolerance is not a blanket yes'
    );
  });

  it('announces a refusal LIFTING, and never the refusal itself', async () => {
    // M25: availability is read when a surface builds, so a refusal captured while a command
    // held the claim outlives that claim in the rendered view. The lift is the moment every
    // such reading became false, so it is the one thing worth announcing. Announcing the
    // refusal too would only repaint mid-command, and polling was ruled out.
    const world = sharedAuthorityWorld();
    let restored = 0;
    const authority = world.realm('gm', { onAvailabilityRestored: () => (restored += 1) });

    assert.equal(authority.availability().available, false, 'it starts refused');
    assert.equal(restored, 0, 'and being refused announces nothing');

    await authority.setup();
    assert.deepEqual(authority.availability(), { available: true, reason: null });
    assert.equal(restored, 1, 'the first lift is announced exactly once');

    await authority.refreshAvailability();
    assert.equal(restored, 1, 'a re-publication of the SAME available answer announces nothing');

    const held = await authority.run(
      { requestId: 'req-1', senderId: 'gm', sessionId: 'session' },
      async () => {
        // What `main.js` does on `createJournalEntryPage`: the claim is live, so this is true.
        await authority.refreshAvailability();
        assert.deepEqual(authority.availability(), { available: false, reason: 'claim-held' });
        assert.equal(restored, 1, 'publishing the refusal announces nothing');
        return { success: true };
      }
    );

    assert.equal(held.success, true);
    assert.equal(world.ledger.claim, null);
    assert.deepEqual(authority.availability(), { available: true, reason: null });
    assert.equal(restored, 2, 'releasing the claim announces the lift');
  });

  it('creates the arbitrating claim page with keepId, whose absence is a silent no-op', async () => {
    const authority = foundryAuthorityFixture({ randomUUID: () => 'secure-uuid' });
    assert.equal((await authority.setup()).success, true);
    const claim = authority.claimCalls.at(0);
    assert.equal(claim.source._id, JOURNAL_RUN_CLAIM_PAGE_ID);
    assert.deepEqual(claim.options, { keepId: true });

    const ledger = authority.journal.at(0);
    await ledger.createEmbeddedDocuments('JournalEntryPage', [{ _id: JOURNAL_RUN_CLAIM_PAGE_ID }], {
      keepId: true,
    });
    await assert.rejects(
      () =>
        ledger.createEmbeddedDocuments(
          'JournalEntryPage',
          [{ _id: JOURNAL_RUN_CLAIM_PAGE_ID }],
          { keepId: true }
        ),
      /already exists within the parent collection/,
      'the lock exists only because the server rejects a duplicate embedded id'
    );

    // Mutation control for the invisible half: dropping `keepId` raises NO error. The fixed id
    // is discarded, a fresh one is written, and the cross-browser lock quietly stops existing.
    const withoutKeepId = authority.makeEntry({
      flags: { fabricate: { journalRunAuthorityState: {} } },
    });
    const [first] = await withoutKeepId.createEmbeddedDocuments('JournalEntryPage', [
      { _id: JOURNAL_RUN_CLAIM_PAGE_ID },
    ]);
    const [second] = await withoutKeepId.createEmbeddedDocuments('JournalEntryPage', [
      { _id: JOURNAL_RUN_CLAIM_PAGE_ID },
    ]);
    assert.notEqual(first.id, JOURNAL_RUN_CLAIM_PAGE_ID);
    assert.notEqual(first.id, second.id);
  });

  it('releases a claim the server already lost, without a delete it would reject', async () => {
    // The maintainer's own world, reproduced. `entry.pages` is the BROADCAST-FED local copy, so
    // it can still show a claim page another realm's reaper has already deleted. The release
    // used to dispatch a delete naming that id, and the server answered
    // `JournalEntryPage "FabRunAuthority1" does not exist!` — a message `SocketInterface`
    // raises as a toast BEFORE rejecting, so catching the rejection never hid it, and the
    // absence re-read beside the catch could never answer true because a rejected delete does
    // not prune the local collection. The claim then read as unreleased and the run was left
    // behind a blocking `claim-release-failed` recovery notice.
    const authority = foundryAuthorityFixture({ randomUUID: () => 'secure-uuid' });
    assert.equal((await authority.setup()).success, true);
    const ledger = authority.journal.at(0);

    const response = await authority.run(
      { requestId: 'reaped-claim', senderId: 'player', sessionId: 'one' },
      async () => {
        ledger.dropServerPage(JOURNAL_RUN_CLAIM_PAGE_ID);
        assert.equal(
          ledger.pages.has(JOURNAL_RUN_CLAIM_PAGE_ID),
          true,
          'the local copy still shows the page, which is the whole problem'
        );
        return { success: true };
      }
    );

    assert.deepEqual(response, { success: true });
    assert.deepEqual(
      authority.serverRejections,
      [],
      'nothing was dispatched that the server would refuse, so the user saw no toast'
    );
    assert.deepEqual(
      authority.availability(),
      { available: true, reason: null },
      'and absence is the goal state, so the run is not left behind a recovery notice'
    );
  });

  it('still fails the release when the claim survives the attempt', async () => {
    // The tolerance is not a blanket yes: a delete that failed with the claim STILL on the
    // server is a real failure, and the answer comes from asking the server again rather than
    // from `entry.pages`, which a rejected delete leaves untouched.
    const authority = foundryAuthorityFixture({ randomUUID: () => 'secure-uuid' });
    assert.equal((await authority.setup()).success, true);
    const ledger = authority.journal.at(0);
    const dispatch = ledger.deleteEmbeddedDocuments;

    const response = await authority.run(
      { requestId: 'refused-delete', senderId: 'player', sessionId: 'one' },
      async () => {
        ledger.deleteEmbeddedDocuments = async () => {
          throw new Error('User lacks permission to delete this JournalEntryPage');
        };
        return { success: true };
      }
    );
    ledger.deleteEmbeddedDocuments = dispatch;

    assert.deepEqual(response, { success: true });
    assert.deepEqual(authority.availability(), {
      available: false,
      reason: 'claim-release-failed',
    });
    assert.equal(
      ledger.serverPages.has(JOURNAL_RUN_CLAIM_PAGE_ID),
      true,
      'the claim really did survive, which is why the release reports failure'
    );
  });

  it('never deletes a claim page a different claim holds', async () => {
    const authority = foundryAuthorityFixture({ randomUUID: () => 'secure-uuid' });
    assert.equal((await authority.setup()).success, true);
    const ledger = authority.journal.at(0);

    await authority.run(
      { requestId: 'stolen-claim', senderId: 'player', sessionId: 'one' },
      async () => {
        ledger.dropServerPage(JOURNAL_RUN_CLAIM_PAGE_ID);
        ledger.pages.delete(JOURNAL_RUN_CLAIM_PAGE_ID);
        seatForeignClaim(ledger, 'someone-elses');
        return { success: true };
      }
    );

    assert.equal(
      ledger.serverPages.get(JOURNAL_RUN_CLAIM_PAGE_ID)?.getFlag('fabricate', 'journalRunClaimId'),
      'someone-elses',
      "another holder's claim is left exactly where it was"
    );
    assert.deepEqual(authority.availability(), {
      available: false,
      reason: 'claim-release-failed',
    });
    assert.deepEqual(authority.serverRejections, []);
  });

  /**
   * FI1. The release CONFIRMS server-side before deleting, and the confirming read can reject —
   * the same seam, the same `#handleError`, as the writes around it. Unguarded, that rejection
   * escaped `deleteClaim`, whose contract is `async => boolean`, and unwound the queued task after
   * the request was already settled with `claimId: null`: the claim survived with nothing
   * recording it, `publishAvailability` never ran, and every client sat at `claim-held`.
   */
  it('answers a release whose confirming server read rejects, rather than letting it escape', async () => {
    let failRead = false;
    const authority = foundryAuthorityFixture(
      { randomUUID: () => 'secure-uuid' },
      { failServerRead: () => failRead }
    );
    assert.equal((await authority.setup()).success, true);

    const response = await authority.run(
      { requestId: 'read-rejects', senderId: 'player', sessionId: 'one' },
      async () => {
        failRead = true;
        return { success: true, handlerRan: true };
      }
    );

    assert.deepEqual(
      response,
      { success: true, handlerRan: true },
      'the command answers its caller rather than rejecting out of the queue'
    );
    assert.ok(authority.serverRejections.length > 0, 'and the read really did reject');
    // An unreadable server is UNSETTLED, never "the claim is gone": the release falls through to
    // the local delete, which the fixture's server honours, so the claim is genuinely released.
    assert.deepEqual(authority.availability(), { available: true, reason: null });
  });

  it('refuses a contended acquire before any create is dispatched', async () => {
    // Why `claimOn` KEEPS its rejection. The create's duplicate-`_id` refusal is the atomic
    // compare-and-set the whole lock is made of, and it is not the everyday error the release
    // was, because ordinary contention never reaches it: `ledgerResult` reads the claim and
    // answers `claim-held` for a LIVE claim before `acquire` ever calls `claimOn`. Only two
    // realms that both saw the claim free can collide at the server, which is the knife-edge the
    // atomicity exists for and the one case asking first could not resolve either.
    const authority = foundryAuthorityFixture({ randomUUID: () => 'secure-uuid' });
    assert.equal((await authority.setup()).success, true);
    const ledger = authority.journal.at(0);
    seatForeignClaim(ledger, 'held-elsewhere');
    const dispatchedCreates = authority.claimCalls.length;

    const response = await authority.run(
      { requestId: 'contended', senderId: 'player', sessionId: 'one' },
      async () => ({ success: true, handlerRan: true })
    );

    assert.deepEqual(response, { success: false, reason: 'claim-held' });
    assert.equal(
      authority.claimCalls.length,
      dispatchedCreates,
      'no create was dispatched, so there was no duplicate-id rejection to toast'
    );
    assert.deepEqual(authority.serverRejections, []);
    assert.equal(
      ledger.serverPages.get(JOURNAL_RUN_CLAIM_PAGE_ID)?.getFlag('fabricate', 'journalRunClaimId'),
      'held-elsewhere',
      'and the incumbent claim is untouched'
    );
  });

  it('reaps a stale local claim the server already lost and carries on', async () => {
    // The same drift reached through the reaper rather than the release. A claim page left in
    // the local copy after the server lost it is judged LEAKED once it outlives the live window,
    // and reaping it used to dispatch the delete the server refuses — so the Journal answered
    // `claim-held` and toasted, every command, indefinitely. Absence is the goal state, so the
    // reap now succeeds and the command runs.
    const authority = foundryAuthorityFixture({ randomUUID: () => 'secure-uuid' });
    assert.equal((await authority.setup()).success, true);
    const ledger = authority.journal.at(0);
    seatForeignClaim(ledger, 'stale-local-only', Date.now() - JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS - 1);
    ledger.dropServerPage(JOURNAL_RUN_CLAIM_PAGE_ID);

    const response = await authority.run(
      { requestId: 'after-stale-reap', senderId: 'player', sessionId: 'one' },
      async () => ({ success: true })
    );

    assert.deepEqual(response, { success: true });
    assert.deepEqual(authority.serverRejections, []);
    assert.deepEqual(authority.availability(), { available: true, reason: null });
  });

  it('scopes the release read to one ledger rather than the whole journal', async () => {
    // The provisioner's duplicate hunt must read every entry; a release must not. `find` matches
    // the `_id` query server-side, so an ordinary release ships one entry.
    const authority = foundryAuthorityFixture({ randomUUID: () => 'secure-uuid' });
    assert.equal((await authority.setup()).success, true);
    assert.deepEqual(
      authority.getCalls.filter((query) => Object.keys(query).length > 0),
      [{ _id: 'ledger' }],
      'the only narrowed read is the one the release makes'
    );
    assert.ok(
      authority.getCalls.some((query) => Object.keys(query).length === 0),
      'and the provisioner still reads every entry, because a duplicate could be any of them'
    );
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

  it('provisions one private ledger for the active GM and keeps setup an idempotent ensure', async () => {
    const world = sharedAuthorityWorld();
    const player = world.realm('player');
    assert.deepEqual(await player.setup(), {
      success: false,
      reason: 'active-gm-required',
    });
    assert.deepEqual(world.ledgers(), [], 'a player realm never provisions a ledger');

    const gm = world.realm();
    assert.equal(gm.availability().reason, 'ledger-missing');
    assert.deepEqual(await gm.setup(), { success: true, ledgerId: 'ledger' });
    assert.equal(world.ledgers().length, 1);
    assert.equal(world.ledger.source.ownership.default, 0);
    assert.equal(world.ledger.source.flags.fabricate.journalRunAuthorityLedger, true);
    assert.deepEqual(await gm.setup(), { success: true, ledgerId: 'ledger' });
    assert.equal(world.ledgers().length, 1, 'the ensure never provisions a second ledger');
  });

  it('provisions on boot recovery and on a first command, with no explicit setup at all', async () => {
    const booted = sharedAuthorityWorld();
    const scopes = [];
    const booting = booted.realm('gm', {
      reconstructExecutions: async (scope) => (scopes.push(scope), { success: true }),
    });
    assert.deepEqual(await booting.bootstrapRecovery(), { success: true });
    assert.equal(booted.ledgers().length, 1);
    assert.deepEqual(scopes, [{ operationId: null, orphaned: true }], 'boot reconstruction runs');

    const commanded = sharedAuthorityWorld();
    assert.deepEqual(
      await commanded
        .realm()
        .run({ requestId: 'first-command', senderId: 'player', sessionId: 'one' }, async () => ({
          success: true,
          ran: true,
        })),
      { success: true, ran: true }
    );
    assert.equal(commanded.ledgers().length, 1, 'the command path provisions lazily');
  });

  it('leaves a player with no elected GM refusing rather than provisioning', async () => {
    const world = sharedAuthorityWorld();
    const player = world.realm('player', { getActiveGM: () => null });
    assert.deepEqual(await player.refreshAvailability(), {
      available: false,
      reason: 'active-gm-missing',
    });
    assert.equal(
      (
        await player.run(
          { requestId: 'player-command', senderId: 'player', sessionId: 'one' },
          async () => ({ success: true })
        )
      ).reason,
      'active-gm-required'
    );
    assert.deepEqual(world.ledgers(), []);
  });

  it('reports a revoked JOURNAL_CREATE permission rather than failing unlabelled', async () => {
    const world = sharedAuthorityWorld();
    const gm = world.realm('gm', { canCreateLedger: () => false });
    assert.deepEqual(await gm.bootstrapRecovery(), {
      success: false,
      reason: 'ledger-create-denied',
    });
    assert.deepEqual(gm.availability(), { available: false, reason: 'ledger-create-denied' });
    assert.deepEqual(world.ledgers(), []);
  });

  it('converges two racing GM sessions that both create on exactly one ledger', async () => {
    const world = sharedAuthorityWorld();
    let releaseSlowCreate;
    const slowCreateHeld = new Promise((resolve) => (releaseSlowCreate = resolve));
    // The session that creates SECOND wins here, which is exactly what the "whoever created
    // first always sees both and defers" argument gets wrong: the loser is the earlier create.
    const slow = world.realm('gm', { beforeCreate: () => slowCreateHeld });
    const fast = world.realm();

    const slowBoot = slow.bootstrapRecovery();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(await fast.bootstrapRecovery(), { success: true });
    const winner = world.ledger.id;
    releaseSlowCreate();

    assert.deepEqual(await slowBoot, { success: true });
    assert.deepEqual(
      world.ledgers().map((entry) => entry.id),
      [winner],
      'the ledger holding durable evidence wins and the pristine duplicate is deleted'
    );
    assert.deepEqual(slow.availability(), { available: true, reason: null });
  });

  it('elects the same ledger from two independent sessions, pristine then used', async () => {
    const world = sharedAuthorityWorld();
    const early = world.addLedger();
    world.addLedger();

    assert.deepEqual(await world.realm().bootstrapRecovery(), { success: true });
    assert.deepEqual(
      world.ledgers().map((entry) => entry.id),
      [early.id],
      'the earliest createdTime wins the total order both sessions compute from the same values'
    );

    // A second session meeting the now-used ledger plus a fresh pristine duplicate must reach
    // the same answer, and must never elect the empty one over recorded request evidence.
    world.addLedger();
    assert.deepEqual(await world.realm().bootstrapRecovery(), { success: true });
    assert.deepEqual(
      world.ledgers().map((entry) => entry.id),
      [early.id]
    );
  });

  it('refuses to elect between two ledgers that both hold durable evidence', async () => {
    const world = sharedAuthorityWorld();
    world.addLedger({ version: 1, requests: { 'request-a': { status: 'settled' } } });
    world.addLedger({ version: 1, requests: { 'request-b': { status: 'settled' } } });
    const gm = world.realm();

    assert.deepEqual(await gm.bootstrapRecovery(), { success: false, reason: 'ledger-ambiguous' });
    assert.equal(world.ledgers().length, 2, 'neither used ledger is deleted');
    assert.deepEqual(gm.availability(), { available: false, reason: 'ledger-ambiguous' });
  });

  // A READ THAT DID NOT ANSWER AUTHORISES NOTHING. The rejection used to collapse to `[]`,
  // which `resolve()` cannot tell from "the server says none exist" — so two GMs booting while
  // that read rejected each provisioned their own ledger, and the fixed-`_id` embedded claim
  // cannot exclude them because they claim on different parents.
  it('never provisions from an authoritative read that failed to answer', async () => {
    for (const [label, listLedgerRecords] of [
      ['a rejection', async () => { throw new Error('socket closed'); }],
      ['an adapter that cannot perform it', async () => null],
    ]) {
      const world = sharedAuthorityWorld();
      const gm = world.realm('gm', { listLedgerRecords });
      const boot = await gm.bootstrapRecovery();
      assert.equal(boot.success, false, label);
      assert.equal(boot.reason, 'ledger-unsettled', `${label} is unsettled, not ambiguous`);
      assert.equal(world.ledgers().length, 0, `${label} created no ledger`);
      assert.equal(
        world.log.filter(([kind]) => kind === 'create').length,
        0,
        `${label} reached no create at all`
      );
    }
  });

  it('still provisions when the authoritative read answers an empty world', async () => {
    // The control for the pair above: an ANSWER of "none" is what authorises the create, so the
    // refusal cannot be a blanket one.
    const world = sharedAuthorityWorld();
    const gm = world.realm('gm', { listLedgerRecords: async () => [] });
    assert.deepEqual(await gm.bootstrapRecovery(), { success: true });
    assert.equal(world.ledgers().length, 1);
  });

  it('retries the claim and the receipt write after a racing session deletes the ledger', async () => {
    const world = sharedAuthorityWorld();
    const doomed = world.addLedger();
    let replaced = 0;
    const replaceLedger = (entry) => {
      if (replaced > 0 || entry.id !== doomed.id) return;
      replaced += 1;
      world.addLedger();
      world.removeLedger(doomed.id);
    };
    const gm = world.realm('gm', { beforeClaim: replaceLedger });

    assert.deepEqual(await gm.bootstrapRecovery(), { success: true });
    assert.equal(replaced, 1, 'the racing deletion actually happened');
    assert.deepEqual(world.ledgers().map((entry) => entry.id), ['ledger-2']);
    assert.equal(
      Object.values(world.ledger.state.requests).at(0)?.kind,
      'bootRecovery',
      'the receipt landed on the surviving ledger rather than deadlocking the boot'
    );
  });

  it('releases a claim for a refusal that wrote nothing and retains it for an uncertain effect', async () => {
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();
    const redeem = (grant, requestId) =>
      authority.consumeExecutionGrant(grant, {
        operation: 'pause',
        actorUuid: 'Actor.a',
        requestId,
      });

    // Direction one: the grant is redeemed, then an in-memory guard refuses before any document
    // write, so the handler RETURNS its refusal and the claim must not survive it.
    const refused = await authority.run(
      { requestId: 'pre-write-refusal', senderId: 'player', sessionId: 'one' },
      async ({ createExecutionGrant }) => {
        const grant = createExecutionGrant({ operation: 'pause', actorUuid: 'Actor.a' });
        assert.ok(redeem(grant, 'pre-write-refusal'));
        return {
          success: false,
          reason: 'lifecycle-refused',
          message: 'The run is already paused',
        };
      }
    );
    assert.deepEqual(refused, {
      success: false,
      reason: 'lifecycle-refused',
      message: 'The run is already paused',
    });
    assert.equal(world.ledger.claim, null, 'a refusal that wrote nothing releases its claim');
    assert.deepEqual(authority.availability(), { available: true, reason: null });
    assert.deepEqual(
      await authority.run(
        { requestId: 'still-usable', senderId: 'player', sessionId: 'one' },
        async () => ({ success: true })
      ),
      { success: true },
      'the run stays usable after a refusal'
    );

    // Direction two: the same redeemed grant with a THROWN failure is genuinely uncertain, so
    // the claim is retained and only reconciliation clears it.
    const uncertain = await authority.run(
      { requestId: 'uncertain-effect', senderId: 'player', sessionId: 'two' },
      async ({ createExecutionGrant }) => {
        const grant = createExecutionGrant({ operation: 'pause', actorUuid: 'Actor.a' });
        assert.ok(redeem(grant, 'uncertain-effect'));
        throw new Error('write acknowledgement lost');
      }
    );
    assert.equal(uncertain.recoveryRequired, true);
    const claimId = world.ledger.claim.claimId;
    assert.deepEqual(authority.availability(), { available: false, reason: 'recovery-required' });
    assert.equal(
      (
        await authority.run(
          { requestId: 'blocked', senderId: 'player', sessionId: 'two' },
          async () => ({ success: true })
        )
      ).reason,
      'claim-held'
    );
    assert.equal(
      (await authority.reconcile({ claimId, disposition: 'reconciled' })).success,
      true,
      'only reconcileJournalRunAuthority clears a retained claim'
    );
    assert.equal(world.ledger.claim, null);
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
      // The stamp a real claim always carries; the reaper ages it to tell live from leaked.
      acquiredAt: 1000,
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

  // --------------------------------------------------------------------------------------
  // The claim reaper. `ledgerResult` used to answer `claim-held` for ANY claim with no
  // liveness test of any kind, so one leaked claim blocked every user on every surface
  // permanently until a GM ran a console API — which is how an ordinary recipe came to show
  // a claim-held callout. The line is drawn at the REQUEST the claim guards, never at age
  // alone, and every ambiguous case stays retained.
  // --------------------------------------------------------------------------------------

  it('derives the claim live window from the command timeout it has to outlast', () => {
    assert.ok(
      JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS >= JOURNAL_RUN_COMMAND_TIMEOUT_MS * 4,
      'the window must comfortably outlast the longest a client waits for its own reply, or a '
        + 'slow command is judged dead while it is still running'
    );
  });

  it('reaps a leaked claim and retains an uncertain one, at any age', async () => {
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();
    const plant = (claimId, requestId, request, acquiredAt = 1000) => {
      world.ledger.state.requests[requestId] = request;
      world.ledger.claim = { id: JOURNAL_RUN_CLAIM_PAGE_ID, claimId, requestId, acquiredAt };
      world.setNow(acquiredAt + JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS + 1);
    };

    // DIRECTION ONE — the request this claim guarded is SETTLED, so releasing it is provably
    // safe: the very next thing its owner does is release it, and that evidently never ran.
    plant('leaked', 'settled-request', { kind: 'command', status: 'settled', response: {} });
    assert.deepEqual(
      await authority.refreshAvailability(),
      { available: true, reason: null },
      'a leaked claim self-heals with no console call at all'
    );
    assert.ok(!world.ledger.claim, 'and the claim page is gone');
    assert.deepEqual(
      await authority.run(
        { requestId: 'after-reap', senderId: 'player', sessionId: 'one' },
        async () => ({ success: true })
      ),
      { success: true },
      'the world is usable again'
    );

    // DIRECTION TWO — the mutation control for the same code path. An uncertain effect is
    // exactly what the recovery design exists for, so its claim is NEVER reaped, however old.
    plant('kept', 'uncertain-request', { kind: 'command', status: 'recoveryRequired' }, 9000);
    world.setNow(9000 + JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS * 1000);
    assert.deepEqual(
      await authority.refreshAvailability(),
      {
        available: false,
        reason: 'recovery-required',
        // Issue 1648: the identity a GM needs to reconcile it in the app, rather than only from
        // a console macro that first had to read the claim page's flags by hand.
        retained: {
          claimId: 'kept',
          requestId: 'uncertain-request',
          requestKind: 'command',
          requestStatus: 'recoveryRequired',
          failureReason: null,
          failureMessage: null,
          claimedAt: 9000,
        },
      },
      'a retained claim publishes the exact token reconciliation requires'
    );
    assert.equal(world.ledger.claim?.claimId, 'kept', 'the uncertain claim is still held');
    let handlerCalls = 0;
    assert.equal(
      (
        await authority.run(
          { requestId: 'must-not-run', senderId: 'player', sessionId: 'one' },
          async () => (++handlerCalls, { success: true })
        )
      ).reason,
      'recovery-required'
    );
    assert.equal(handlerCalls, 0);
    assert.equal(
      (await authority.reconcile({ claimId: 'kept', disposition: 'reconciled' })).success,
      true,
      'only reconcileJournalRunAuthority clears it, exactly as before'
    );
  });

  it('keeps a dead session half-applied command retained rather than releasing it', async () => {
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();
    // `processing` and old: the holding session cannot still be running it, but the effect may
    // have half applied, so this is NOT provably safe and takes the conservative path.
    world.ledger.state.requests['abandoned-command'] = { kind: 'command', status: 'processing' };
    world.ledger.claim = {
      id: JOURNAL_RUN_CLAIM_PAGE_ID,
      claimId: 'orphan',
      requestId: 'abandoned-command',
      acquiredAt: 1000,
    };
    world.setNow(1000 + JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS + 1);
    assert.deepEqual(await authority.refreshAvailability(), {
      available: false,
      reason: 'recovery-required',
      retained: {
        claimId: 'orphan',
        requestId: 'abandoned-command',
        requestKind: 'command',
        requestStatus: 'processing',
        failureReason: null,
        failureMessage: null,
        claimedAt: 1000,
      },
    });
    assert.equal(world.ledger.claim?.claimId, 'orphan');
  });

  it('reports a claim inside its live window as held, and never touches it', async () => {
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();
    // The bound's own mutation control: the SAME leaked fixture one millisecond earlier is a
    // real concurrent command, and `claim-held` is the honest answer for it.
    world.ledger.state.requests['settled-request'] = { kind: 'command', status: 'settled' };
    world.ledger.claim = {
      id: JOURNAL_RUN_CLAIM_PAGE_ID,
      claimId: 'fresh',
      requestId: 'settled-request',
      acquiredAt: 1000,
    };
    world.setNow(1000 + JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS);
    assert.deepEqual(await authority.refreshAvailability(), {
      available: false,
      reason: 'claim-held',
    });
    assert.equal(world.ledger.claim?.claimId, 'fresh');
  });

  it('lets a player realm read past a leaked claim without writing to the ledger', async () => {
    const world = sharedAuthorityWorld();
    await world.realm().setup();
    world.ledger.state.requests['settled-request'] = { kind: 'command', status: 'settled' };
    world.ledger.claim = {
      id: JOURNAL_RUN_CLAIM_PAGE_ID,
      claimId: 'leaked',
      requestId: 'settled-request',
      acquiredAt: 1000,
    };
    world.setNow(1000 + JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS + 1);
    const player = world.realm('player');
    assert.deepEqual(await player.refreshAvailability(), { available: true, reason: null });
    assert.equal(
      world.ledger.claim?.claimId,
      'leaked',
      'the player judged the claim but only the elected GM may release it'
    );
  });

  // --------------------------------------------------------------------------------------
  // A ledger swap mid-command. `writeLedgerState` retries onto the ledger that replaced a
  // deleted one, and the claim page lives INSIDE the ledger it was created on — so the
  // command used to run to completion holding no lock on the ledger it was writing to.
  // --------------------------------------------------------------------------------------

  it('re-claims on the replacement ledger when a racing deletion swaps it mid-command', async () => {
    const world = sharedAuthorityWorld();
    const gm = world.realm();
    await gm.setup();
    const doomed = world.ledger;
    let swapped = 0;
    let armed = false;
    const swapOnFirstWrite = (entry) => {
      if (!armed || swapped > 0 || entry.id !== doomed.id) return;
      swapped += 1;
      world.addLedger();
      world.removeLedger(doomed.id);
    };
    const swapping = world.realm('gm', { beforeWrite: swapOnFirstWrite });
    // Arm AFTER this realm's own boot write, so the swap lands on the command's write.
    assert.equal((await swapping.bootstrapRecovery()).success, true);
    armed = true;
    let heldDuringHandler = null;
    const result = await swapping.run(
      { requestId: 'swapped-command', senderId: 'player', sessionId: 'one' },
      async () => {
        heldDuringHandler = world.ledger.claim?.claimId ?? null;
        return { success: true };
      }
    );
    assert.equal(swapped, 1, 'the racing deletion actually happened');
    assert.deepEqual(result, { success: true });
    assert.ok(heldDuringHandler, 'the command held a claim on the ledger it was writing to');
    assert.ok(!world.ledger.claim, 'and released it on that same replacement');
  });

  it('refuses rather than executing unlocked when the replacement is already claimed', async () => {
    const world = sharedAuthorityWorld();
    const gm = world.realm();
    await gm.setup();
    const doomed = world.ledger;
    let swapped = 0;
    let armed = false;
    const swapOnFirstWrite = (entry) => {
      if (!armed || swapped > 0 || entry.id !== doomed.id) return;
      swapped += 1;
      const replacement = world.addLedger();
      // The other session got there first, so this command CANNOT re-acquire.
      replacement.claim = {
        id: JOURNAL_RUN_CLAIM_PAGE_ID,
        claimId: 'other-session',
        requestId: 'other-request',
        acquiredAt: 1000,
      };
      world.removeLedger(doomed.id);
    };
    const swapping = world.realm('gm', { beforeWrite: swapOnFirstWrite });
    assert.equal((await swapping.bootstrapRecovery()).success, true);
    armed = true;
    let handlerCalls = 0;
    const result = await swapping.run(
      { requestId: 'unlocked-command', senderId: 'player', sessionId: 'one' },
      async () => (++handlerCalls, { success: true })
    );
    assert.equal(swapped, 1);
    assert.equal(handlerCalls, 0, 'the handler never ran against a ledger this command lost');
    assert.equal(result.reason, 'claim-held');
    assert.equal(world.ledger.claim?.claimId, 'other-session', 'the other session keeps its lock');
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

  /**
   * An execution grant is a bearer token, so the ONLY thing standing between it and an
   * unrelated privileged call is the per-field binding comparison and the single-use flag.
   * Both survived the whole corpus (issue 1648, Q-H3/Q-H4): under the first mutation a grant
   * issued to pause `Actor.a`'s `run-1` redeemed as an execute against `Actor.evil`/`run-999`.
   */
  it('redeems an execution grant once, and only for the binding it was issued for', async () => {
    const world = sharedAuthorityWorld();
    const authority = world.realm();
    await authority.setup();
    const issued = { operation: 'pause', actorUuid: 'Actor.a', runId: 'run-1' };
    const exact = { ...issued, requestId: 'bound', senderId: 'player' };

    const observed = await authority.run(
      { requestId: 'bound', senderId: 'player', sessionId: 'one' },
      async ({ createExecutionGrant }) => {
        const grant = createExecutionGrant(issued);
        const forged = {
          operation: { ...exact, operation: 'execute' },
          actorUuid: { ...exact, actorUuid: 'Actor.evil' },
          runId: { ...exact, runId: 'run-999' },
          requestId: { ...exact, requestId: 'another-request' },
          senderId: { ...exact, senderId: 'other' },
          // The `actor` document form of the same field, which resolves through uuid then id.
          actor: { ...exact, actor: { uuid: 'Actor.evil' } },
        };
        return {
          refused: Object.fromEntries(
            Object.entries(forged).map(([key, expected]) => [
              key,
              authority.consumeExecutionGrant(grant, expected),
            ])
          ),
          unknownGrant: authority.consumeExecutionGrant({ authority: 'forged' }, exact),
          // A grant carrying the actor as a document, matched by uuid rather than by string.
          byDocument: authority.consumeExecutionGrant(
            createExecutionGrant(issued),
            { ...exact, actor: { uuid: 'Actor.a' } }
          ),
          first: authority.consumeExecutionGrant(grant, exact),
          replay: authority.consumeExecutionGrant(grant, exact),
          success: true,
        };
      }
    );

    assert.deepEqual(
      observed.refused,
      {
        operation: null,
        actorUuid: null,
        runId: null,
        requestId: null,
        senderId: null,
        actor: null,
      },
      'every bound field is compared, so no forged field is redeemable'
    );
    assert.equal(observed.unknownGrant, null, 'a grant this authority never issued is not a grant');
    assert.deepEqual(observed.byDocument, {}, 'the matching binding still redeems');
    assert.deepEqual(observed.first, {}, 'the exact binding redeems');
    assert.equal(observed.replay, null, 'and a consumed grant is never redeemable again');
  });
});
