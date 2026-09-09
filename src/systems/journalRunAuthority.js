const AUTHORITY_VERSION = 1;
const AUTHORITY_FLAG = 'journalRunAuthorityLedger';
const AUTHORITY_STATE_FLAG = 'journalRunAuthorityState';
const NON_MUTATING_GRANTS = new Set(['describeCheck', 'prepareAlchemyStart']);

export const JOURNAL_RUN_CLAIM_PAGE_ID = 'FabRunAuthority1';

function emptyState() {
  return { version: AUTHORITY_VERSION, requests: {}, prepareTokens: {}, reconciliations: [] };
}

function normalizedState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    version: AUTHORITY_VERSION,
    requests: source.requests && typeof source.requests === 'object' ? { ...source.requests } : {},
    prepareTokens:
      source.prepareTokens && typeof source.prepareTokens === 'object'
        ? { ...source.prepareTokens }
        : {},
    reconciliations: Array.isArray(source.reconciliations) ? [...source.reconciliations] : [],
  };
}

function sameBinding(actual, expected) {
  for (const key of ['senderId', 'actorUuid', 'runType', 'runId', 'expectedRevision']) {
    if (String(actual?.[key] ?? '') !== String(expected?.[key] ?? '')) return false;
  }
  return true;
}

function includesExpectedBinding(actual, expected) {
  if (expected?.actor) {
    const expectedActorUuid = expected.actor.uuid ?? expected.actor.id;
    if (String(actual?.actorUuid ?? '') !== String(expectedActorUuid ?? '')) return false;
  }
  for (const key of [
    'operation',
    'actorUuid',
    'runType',
    'runId',
    'expectedRevision',
    'requestId',
    'senderId',
  ]) {
    if (!Object.hasOwn(expected ?? {}, key)) continue;
    if (String(actual?.[key] ?? '') !== String(expected[key] ?? '')) return false;
  }
  return true;
}

function activeGmMatches(currentUser, activeGM) {
  return Boolean(
    currentUser && currentUser.isGM && currentUser.id && currentUser.id === activeGM?.id
  );
}

function unavailable(reason, extras = {}) {
  return { success: false, reason, ...extras };
}

/**
 * Durable run-command arbitration. Foundry access is supplied at this boundary so tests can
 * model two browser realms sharing one server-side embedded-document database.
 */
export function createJournalRunAuthority({
  currentUser,
  activeGM,
  listLedgers,
  createLedger,
  readState,
  writeState,
  createClaim,
  readClaim,
  deleteClaim,
  randomId,
  now = () => Date.now(),
}) {
  let localQueue = Promise.resolve();
  let cachedAvailability = { available: false, reason: 'ledger-missing' };
  const grants = new WeakMap();
  const createdGrantRecords = new Set();

  async function ledgerResult() {
    const gm = activeGM?.();
    if (!gm?.id) return unavailable('active-gm-missing');
    const ledgers = (await listLedgers()) ?? [];
    if (ledgers.length === 0) return unavailable('ledger-missing');
    if (ledgers.length !== 1) return unavailable('ledger-ambiguous');
    const claim = await readClaim(ledgers[0]);
    if (claim) return unavailable('claim-held', { ledger: ledgers[0], claim });
    return { success: true, ledger: ledgers[0] };
  }

  async function refreshAvailability() {
    const result = await ledgerResult();
    cachedAvailability = {
      available: result.success === true,
      reason: result.success === true ? null : result.reason,
    };
    return cachedAvailability;
  }

  async function setup() {
    if (!activeGmMatches(currentUser?.(), activeGM?.())) return unavailable('active-gm-required');
    const ledgers = (await listLedgers()) ?? [];
    if (ledgers.length > 0) {
      const reason = ledgers.length === 1 ? 'ledger-already-exists' : 'ledger-ambiguous';
      cachedAvailability = { available: false, reason };
      return unavailable(reason);
    }
    await createLedger({
      name: 'Fabricate Run Authority',
      ownership: { default: 0 },
      flags: { fabricate: { [AUTHORITY_FLAG]: true } },
      state: emptyState(),
    });
    const after = (await listLedgers()) ?? [];
    if (after.length !== 1) {
      cachedAvailability = { available: false, reason: 'ledger-ambiguous' };
      return unavailable('ledger-ambiguous');
    }
    cachedAvailability = { available: true, reason: null };
    return { success: true, ledgerId: after[0]?.id ?? null };
  }

  function createGrant(binding) {
    const grant = Object.freeze({ authority: 'fabricate-journal-run' });
    const record = {
      binding: { ...binding },
      requestId: binding.requestId,
      consumed: false,
    };
    grants.set(grant, record);
    createdGrantRecords.add(record);
    return grant;
  }

  function consumeExecutionGrant(grant, expected) {
    const record = grants.get(grant);
    if (!record || record.consumed || !includesExpectedBinding(record.binding, expected))
      return null;
    record.consumed = true;
    return structuredClone(record.binding.trustedContext ?? {});
  }

  function queue(task) {
    const scheduled = localQueue.then(task, task);
    localQueue = scheduled.catch(() => {});
    return scheduled;
  }

  async function acquire(request) {
    if (!activeGmMatches(currentUser?.(), activeGM?.())) return unavailable('active-gm-required');
    const ledgerCheck = await ledgerResult();
    if (!ledgerCheck.success) return ledgerCheck;
    const claimId = randomId();
    try {
      const claim = await createClaim(ledgerCheck.ledger, {
        _id: JOURNAL_RUN_CLAIM_PAGE_ID,
        claimId,
        requestId: request.requestId,
        acquiredAt: now(),
      });
      if (!claim) return unavailable('claim-held');
    } catch {
      return unavailable('claim-held');
    }
    return { success: true, ledger: ledgerCheck.ledger, claimId };
  }

  function tokenHelpers({ state, request, persist }) {
    return {
      issuePrepareToken(binding, { expiresAt } = {}) {
        const token = randomId();
        state.prepareTokens[token] = {
          status: 'active',
          binding: { ...binding, senderId: request.senderId },
          createdAt: now(),
          expiresAt: Number.isFinite(Number(expiresAt)) ? Number(expiresAt) : now() + 60_000,
        };
        return token;
      },
      consumePrepareToken(token, binding) {
        const record = state.prepareTokens[token];
        if (
          record?.status !== 'active' ||
          record.expiresAt <= now() ||
          !sameBinding(record.binding, { ...binding, senderId: request.senderId })
        ) {
          return null;
        }
        record.status = 'consumed';
        record.consumedByRequestId = request.requestId;
        return structuredClone(record);
      },
      releasePrepareToken(token, binding) {
        const record = state.prepareTokens[token];
        if (
          record?.status !== 'active' ||
          !sameBinding(record.binding, { ...binding, senderId: request.senderId })
        ) {
          return false;
        }
        record.status = 'released';
        record.releasedAt = now();
        return true;
      },
      persist,
    };
  }

  function run(request, handler) {
    return queue(async () => {
      const acquired = await acquire(request);
      if (!acquired.success) {
        cachedAvailability = { available: false, reason: acquired.reason };
        return unavailable(acquired.reason);
      }
      const { ledger, claimId } = acquired;
      if (!activeGmMatches(currentUser?.(), activeGM?.())) {
        const released = await deleteClaim(ledger, claimId);
        cachedAvailability = released
          ? { available: false, reason: 'active-gm-required' }
          : { available: false, reason: 'claim-release-failed' };
        return unavailable(released ? 'active-gm-required' : 'claim-release-failed');
      }
      const state = normalizedState(await readState(ledger));
      const prior = state.requests[request.requestId];
      if (prior && (prior.senderId !== request.senderId || prior.sessionId !== request.sessionId)) {
        if (!(await deleteClaim(ledger, claimId))) {
          cachedAvailability = { available: false, reason: 'claim-release-failed' };
          return unavailable('claim-release-failed');
        }
        return unavailable('request-id-collision');
      }
      if (
        prior?.status === 'settled' ||
        prior?.status === 'abandoned' ||
        prior?.status === 'reconciled'
      ) {
        if (!(await deleteClaim(ledger, claimId))) {
          cachedAvailability = { available: false, reason: 'claim-release-failed' };
          return unavailable('claim-release-failed');
        }
        cachedAvailability = { available: true, reason: null };
        return structuredClone(prior.response ?? unavailable('request-not-replayable'));
      }

      state.requests[request.requestId] = {
        status: 'processing',
        senderId: request.senderId,
        sessionId: request.sessionId,
        startedAt: now(),
      };
      await writeState(ledger, state);
      const persist = async () => writeState(ledger, state);
      const helpers = tokenHelpers({ state, request, persist });
      let response;
      try {
        response = await handler({
          ...helpers,
          createExecutionGrant: (binding) =>
            createGrant({ ...binding, requestId: request.requestId, senderId: request.senderId }),
        });
      } catch (error) {
        response = unavailable('operation-failed', { message: error?.message ?? String(error) });
        const requestGrantConsumed = [...createdGrantRecords].some(
          (record) =>
            record.requestId === request.requestId &&
            !NON_MUTATING_GRANTS.has(record.binding.operation) &&
            record.consumed
        );
        if (requestGrantConsumed) response.recoveryRequired = true;
      }

      const recoveryRequired = response?.recoveryRequired === true;
      let durableResponse;
      try {
        durableResponse = structuredClone(response);
      } catch {
        response = unavailable('response-not-serializable', { recoveryRequired: true });
        durableResponse = structuredClone(response);
      }
      const mustRecover = recoveryRequired || response.recoveryRequired === true;
      state.requests[request.requestId] = {
        ...state.requests[request.requestId],
        status: mustRecover ? 'recoveryRequired' : 'settled',
        settledAt: now(),
        response: durableResponse,
        claimId: mustRecover ? claimId : null,
      };
      await writeState(ledger, state);
      if (mustRecover) {
        cachedAvailability = { available: false, reason: 'recovery-required' };
        return response;
      }
      for (const record of createdGrantRecords) {
        if (record.requestId === request.requestId) createdGrantRecords.delete(record);
      }
      const released = await deleteClaim(ledger, claimId);
      cachedAvailability = released
        ? { available: true, reason: null }
        : { available: false, reason: 'claim-release-failed' };
      return response;
    });
  }

  async function reconcile({ claimId, disposition }) {
    if (!activeGmMatches(currentUser?.(), activeGM?.())) return unavailable('active-gm-required');
    if (!['reconciled', 'abandoned'].includes(disposition))
      return unavailable('invalid-disposition');
    const ledgers = (await listLedgers()) ?? [];
    if (ledgers.length !== 1) {
      return unavailable(ledgers.length > 0 ? 'ledger-ambiguous' : 'ledger-missing');
    }
    const ledger = ledgers[0];
    const claim = await readClaim(ledger);
    if (!claim || claim.claimId !== claimId) return unavailable('claim-mismatch');
    const state = normalizedState(await readState(ledger));
    const requestId = claim.requestId;
    const prior = state.requests[requestId] ?? {};
    state.requests[requestId] = {
      ...prior,
      status: disposition,
      response: unavailable('request-not-replayable', { disposition }),
      reconciledAt: now(),
      claimId: null,
    };
    state.reconciliations.push({ claimId, requestId, disposition, at: now() });
    await writeState(ledger, state);
    if (!(await deleteClaim(ledger, claimId))) return unavailable('claim-release-failed');
    cachedAvailability = { available: true, reason: null };
    return { success: true, disposition };
  }

  return {
    setup,
    run,
    reconcile,
    consumeExecutionGrant,
    availability: () => ({ ...cachedAvailability }),
    refreshAvailability,
  };
}

/** Create the Foundry V13/V14 JournalEntry-backed authority adapter. */
export function createFoundryJournalRunAuthority({
  game = globalThis.game,
  JournalEntry = globalThis.JournalEntry,
  randomId = () =>
    globalThis.foundry?.utils?.randomID?.() ??
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}${Math.random()}`,
  now = () => Date.now(),
} = {}) {
  const listLedgers = async () =>
    [...(game?.journal ?? [])].filter(
      (entry) => entry?.getFlag?.('fabricate', AUTHORITY_FLAG) === true
    );
  return createJournalRunAuthority({
    currentUser: () => game?.user ?? null,
    activeGM: () => game?.users?.activeGM ?? null,
    listLedgers,
    createLedger: async (source) => {
      if (typeof JournalEntry?.create !== 'function')
        throw new Error('JournalEntry API unavailable');
      return JournalEntry.create({
        name: source.name,
        ownership: source.ownership,
        flags: {
          fabricate: {
            [AUTHORITY_FLAG]: true,
            [AUTHORITY_STATE_FLAG]: source.state,
          },
        },
      });
    },
    readState: async (entry) => entry?.getFlag?.('fabricate', AUTHORITY_STATE_FLAG),
    writeState: async (entry, state) =>
      entry.update({ [`flags.fabricate.${AUTHORITY_STATE_FLAG}`]: state }),
    createClaim: async (entry, source) => {
      const created = await entry.createEmbeddedDocuments(
        'JournalEntryPage',
        [
          {
            _id: JOURNAL_RUN_CLAIM_PAGE_ID,
            name: 'Fabricate Run Authority Claim',
            type: 'text',
            text: { content: '', format: 1 },
            flags: {
              fabricate: {
                journalRunClaimId: source.claimId,
                journalRunRequestId: source.requestId,
                journalRunClaimedAt: source.acquiredAt,
              },
            },
          },
        ],
        { keepId: true }
      );
      return created?.[0] ?? null;
    },
    readClaim: async (entry) => {
      const page = entry?.pages?.get?.(JOURNAL_RUN_CLAIM_PAGE_ID) ?? null;
      if (!page) return null;
      return {
        id: page.id,
        claimId: page.getFlag?.('fabricate', 'journalRunClaimId') ?? null,
        requestId: page.getFlag?.('fabricate', 'journalRunRequestId') ?? null,
      };
    },
    deleteClaim: async (entry, claimId) => {
      const page = entry?.pages?.get?.(JOURNAL_RUN_CLAIM_PAGE_ID) ?? null;
      if (!page || page.getFlag?.('fabricate', 'journalRunClaimId') !== claimId) return false;
      const deleted = await entry.deleteEmbeddedDocuments('JournalEntryPage', [page.id]);
      return Array.isArray(deleted)
        ? deleted.some((item) => item === page.id || item?.id === page.id)
        : true;
    },
    randomId,
    now,
  });
}
