import { createJournalRunLedgerProvisioner, createLedgerRetry } from './journalRunLedger.js';

const AUTHORITY_VERSION = 1;
const AUTHORITY_FLAG = 'journalRunAuthorityLedger';
const AUTHORITY_STATE_FLAG = 'journalRunAuthorityState';
const NON_MUTATING_GRANTS = new Set(['describeCheck', 'prepareAlchemyStart']);

/** Fixed embedded-page ID used for arbitration, distinct from the claim's random `claimId`. */
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

/** The private ledger's creation source; its top-level `_id` must stay server-assigned. */
function newLedgerSource() {
  return {
    name: 'Fabricate Run Authority',
    ownership: { default: 0 },
    flags: { fabricate: { [AUTHORITY_FLAG]: true } },
    state: emptyState(),
  };
}

function unavailable(reason, extras = {}) {
  return { success: false, reason, ...extras };
}

function createSecureRandomId(webCrypto) {
  return () => {
    if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
    if (typeof webCrypto?.getRandomValues !== 'function') {
      throw new TypeError('Secure random ID API unavailable');
    }
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };
}

/**
 * Cross-realm exclusion requires exclusive fixed-page creation under exactly one private ledger.
 * The elected GM provisions and arbitrates that ledger; settled requests deduplicate, a pre-write
 * refusal releases its claim, and a claim left by an uncertain effect never expires.
 * Exclusive recovery reconstructs; reconciliation records disposition before releasing a matching claim.
 * @param {Function} deps.currentUser `() => User|null` for this executing realm.
 * @param {Function} deps.activeGM `() => User|null` for the elected GM.
 * @param {Function} deps.listLedgers `async () => ledger[]`.
 * @param {Function} deps.createLedger `async (source) => ledger`.
 * @param {Function} [deps.deleteLedger] `async (ledger) => void`, for a pristine duplicate only.
 * @param {Function} [deps.listLedgerRecords] `async () => [{id, createdTime}]|null`, authoritative.
 * @param {Function} [deps.canCreateLedger] `() => boolean`; `JOURNAL_CREATE` is revocable.
 * @param {Function} deps.readState `async (ledger) => state`.
 * @param {Function} deps.writeState `async (ledger, state) => void`.
 * @param {Function} deps.createClaim `async (ledger, source) => claim|null` with exclusive creation.
 * @param {Function} deps.readClaim `async (ledger) => {claimId, requestId}|null`.
 * @param {Function} deps.deleteClaim `async (ledger, claimId) => boolean`, matching the exact claim.
 * @param {Function} deps.reconstructExecutions `async ({operationId, orphaned}) => {success}`.
 * @param {Function} deps.randomId Secure nonempty ID supplier.
 * @param {Function} [deps.now] Wall-clock milliseconds for request/token records, not run timing.
 * @returns {object} Setup, command, reconciliation, grant, availability and boot-recovery methods.
 */
export function createJournalRunAuthority({
  currentUser,
  activeGM,
  listLedgers,
  createLedger,
  deleteLedger = async () => {},
  listLedgerRecords = null,
  canCreateLedger = () => true,
  readState,
  writeState,
  createClaim,
  readClaim,
  deleteClaim,
  reconstructExecutions,
  randomId,
  now = () => Date.now(),
}) {
  let localQueue = Promise.resolve();
  let cachedAvailability = { available: false, reason: 'ledger-missing' };
  let recoveryReady = false;
  const grants = new WeakMap();
  const createdGrantRecords = new Set();

  const { ensureSingleLedger } = createJournalRunLedgerProvisioner({
    listLedgers,
    listLedgerRecords,
    createLedger,
    deleteLedger,
    readState,
    readClaim,
    canCreateLedger,
    ledgerSource: newLedgerSource,
  });
  const { replacementLedger, writeLedgerState } = createLedgerRetry({ listLedgers, writeState });

  /**
   * Provision or arbitrate this world's single ledger as the elected GM, before any claim.
   * A freshly provisioned ledger re-arms boot reconstruction, exactly as explicit setup did.
   */
  async function ensureLedger() {
    const ensured = await ensureSingleLedger();
    if (ensured.provisioned === true) recoveryReady = false;
    if (!ensured.success) cachedAvailability = { available: false, reason: ensured.reason };
    return ensured;
  }

  function nextRandomId() {
    try {
      const id = randomId?.();
      return typeof id === 'string' && id.length > 0 ? id : null;
    } catch {
      return null;
    }
  }

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
    const activeRealmNeedsRecovery = activeGmMatches(currentUser?.(), activeGM?.());
    if (!activeRealmNeedsRecovery) recoveryReady = false;
    const available = result.success === true && (!activeRealmNeedsRecovery || recoveryReady);
    cachedAvailability = {
      available,
      reason: available ? null : result.success === true ? 'recovery-pending' : result.reason,
    };
    return cachedAvailability;
  }

  /** Idempotent ensure: boot and the command path provision automatically, so this only confirms. */
  async function setup() {
    if (!activeGmMatches(currentUser?.(), activeGM?.())) return unavailable('active-gm-required');
    const boot = await bootstrapRecovery();
    if (boot.success !== true) return boot.success === false ? boot : unavailable(boot.reason);
    const ledgers = (await listLedgers()) ?? [];
    return { success: true, ledgerId: ledgers[0]?.id ?? null };
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

  async function reconstruct(scope) {
    if (typeof reconstructExecutions !== 'function') {
      return unavailable('reconstruction-unavailable');
    }
    const result = await reconstructExecutions(scope);
    return result?.success === true ? result : unavailable('reconstruction-failed');
  }

  // This body always runs within localQueue, including the opportunistic recovery in run().
  async function performBootstrapRecovery() {
    if (!activeGmMatches(currentUser?.(), activeGM?.())) {
      recoveryReady = false;
      return refreshAvailability();
    }
    const ensured = await ensureLedger();
    if (!ensured.success) return unavailable(ensured.reason);
    if (recoveryReady) {
      const availability = await refreshAvailability();
      return availability.available ? { success: true } : unavailable(availability.reason);
    }
    const bootId = nextRandomId();
    if (!bootId) {
      cachedAvailability = { available: false, reason: 'secure-random-unavailable' };
      return unavailable('secure-random-unavailable');
    }
    const requestId = `boot-${bootId}`;
    const acquired = await acquire({ requestId });
    if (!acquired.success) {
      cachedAvailability = { available: false, reason: acquired.reason };
      return unavailable(acquired.reason);
    }
    const { ledger, claimId } = acquired;
    if (!activeGmMatches(currentUser?.(), activeGM?.())) {
      const released = await deleteClaim(ledger, claimId);
      cachedAvailability = {
        available: false,
        reason: released ? 'active-gm-required' : 'claim-release-failed',
      };
      return unavailable(cachedAvailability.reason);
    }

    const state = normalizedState(await readState(ledger));
    state.requests[requestId] = {
      kind: 'bootRecovery',
      operationId: null,
      status: 'processing',
      senderId: currentUser?.()?.id ?? null,
      sessionId: null,
      startedAt: now(),
      claimId,
    };
    try {
      await writeState(ledger, state);
      const result = await reconstruct({ operationId: null, orphaned: true });
      if (result.success !== true) throw new Error(result.reason);
    } catch {
      state.requests[requestId] = {
        ...state.requests[requestId],
        status: 'recoveryRequired',
        settledAt: now(),
        response: unavailable('reconstruction-failed', { claimId }),
      };
      try {
        await writeState(ledger, state);
      } catch {
        // The embedded claim remains the durable stop signal when state persistence is uncertain.
      }
      cachedAvailability = { available: false, reason: 'recovery-required' };
      return unavailable('reconstruction-failed', { claimId });
    }

    if (!activeGmMatches(currentUser?.(), activeGM?.())) {
      state.requests[requestId] = {
        ...state.requests[requestId],
        status: 'recoveryRequired',
        settledAt: now(),
        response: unavailable('active-gm-required', { claimId }),
      };
      try {
        await writeState(ledger, state);
      } catch {
        // Preserve the claim when either election or persistence became uncertain.
      }
      cachedAvailability = { available: false, reason: 'recovery-required' };
      return unavailable('active-gm-required', { claimId });
    }

    state.requests[requestId] = {
      ...state.requests[requestId],
      status: 'settled',
      settledAt: now(),
      response: { success: true, reconstructed: true },
      claimId: null,
    };
    try {
      await writeState(ledger, state);
    } catch {
      cachedAvailability = { available: false, reason: 'recovery-required' };
      return unavailable('reconstruction-failed', { claimId });
    }
    const released = await deleteClaim(ledger, claimId);
    recoveryReady = released;
    cachedAvailability = released
      ? { available: true, reason: null }
      : { available: false, reason: 'claim-release-failed' };
    return released ? { success: true } : unavailable('claim-release-failed');
  }

  function bootstrapRecovery() {
    return queue(performBootstrapRecovery);
  }

  async function acquire(request) {
    if (!activeGmMatches(currentUser?.(), activeGM?.())) return unavailable('active-gm-required');
    const ledgerCheck = await ledgerResult();
    if (!ledgerCheck.success) return ledgerCheck;
    const claimId = nextRandomId();
    if (!claimId) return unavailable('secure-random-unavailable');
    // `keepId` is what makes the server's duplicate embedded-`_id` rejection reachable; without
    // it the fixed id is discarded and the cross-browser lock degrades to a silent no-op.
    const source = {
      _id: JOURNAL_RUN_CLAIM_PAGE_ID,
      claimId,
      requestId: request.requestId,
      acquiredAt: now(),
    };
    const claimOn = async (ledger) => {
      try {
        return (await createClaim(ledger, source)) ?? null;
      } catch {
        return null;
      }
    };
    let ledger = ledgerCheck.ledger;
    let claim = await claimOn(ledger);
    if (!claim) {
      // A racing session may have deleted this ledger mid-acquire: relist and retry once.
      const replacement = await replacementLedger(ledger);
      if (!replacement) return unavailable('claim-held');
      ledger = replacement;
      claim = await claimOn(ledger);
      if (!claim) return unavailable('claim-held');
    }
    return { success: true, ledger, claimId };
  }

  function tokenHelpers({ state, request, persist }) {
    return {
      issuePrepareToken(binding, { expiresAt } = {}) {
        const token = nextRandomId();
        if (!token) throw new Error('Secure random ID API unavailable');
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
      if (!activeGmMatches(currentUser?.(), activeGM?.())) {
        recoveryReady = false;
        await refreshAvailability();
        return unavailable('active-gm-required');
      }
      const ensured = await ensureLedger();
      if (!ensured.success) return unavailable(ensured.reason);
      if (!recoveryReady) {
        const boot = await performBootstrapRecovery();
        if (!boot.success) return boot;
      }
      const acquired = await acquire(request);
      if (!acquired.success) {
        cachedAvailability = { available: false, reason: acquired.reason };
        return unavailable(acquired.reason);
      }
      const { claimId } = acquired;
      const claimLedger = acquired.ledger;
      let ledger = claimLedger;
      // The claim page lives inside its ledger, so a racing deletion released it with the ledger.
      const releaseClaim = async () =>
        ledger === claimLedger ? deleteClaim(ledger, claimId) : true;
      if (!activeGmMatches(currentUser?.(), activeGM?.())) {
        recoveryReady = false;
        const released = await releaseClaim();
        cachedAvailability = released
          ? { available: false, reason: 'active-gm-required' }
          : { available: false, reason: 'claim-release-failed' };
        return unavailable(released ? 'active-gm-required' : 'claim-release-failed');
      }
      const state = normalizedState(await readState(ledger));
      const prior = state.requests[request.requestId];
      if (prior && (prior.senderId !== request.senderId || prior.sessionId !== request.sessionId)) {
        if (!(await releaseClaim())) {
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
        if (!(await releaseClaim())) {
          cachedAvailability = { available: false, reason: 'claim-release-failed' };
          return unavailable('claim-release-failed');
        }
        cachedAvailability = { available: true, reason: null };
        return structuredClone(prior.response ?? unavailable('request-not-replayable'));
      }

      state.requests[request.requestId] = {
        kind: 'command',
        operationId: request.requestId,
        status: 'processing',
        senderId: request.senderId,
        sessionId: request.sessionId,
        startedAt: now(),
      };
      ledger = await writeLedgerState(ledger, state);
      const persist = async () => {
        ledger = await writeLedgerState(ledger, state);
      };
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
      ledger = await writeLedgerState(ledger, state);
      if (mustRecover) {
        cachedAvailability = { available: false, reason: 'recovery-required' };
        return response;
      }
      for (const record of createdGrantRecords) {
        if (record.requestId === request.requestId) createdGrantRecords.delete(record);
      }
      const released = await releaseClaim();
      cachedAvailability = released
        ? { available: true, reason: null }
        : { available: false, reason: 'claim-release-failed' };
      return response;
    });
  }

  function reconcile({ claimId, disposition }) {
    return queue(async () => {
      if (!activeGmMatches(currentUser?.(), activeGM?.())) {
        return unavailable('active-gm-required');
      }
      if (!['reconciled', 'abandoned'].includes(disposition)) {
        return unavailable('invalid-disposition');
      }
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
      const scope =
        prior.kind === 'bootRecovery'
          ? { operationId: null, orphaned: true }
          : { operationId: prior.operationId ?? requestId, orphaned: false };
      try {
        const result = await reconstruct(scope);
        if (result.success !== true) throw new Error(result.reason);
      } catch {
        cachedAvailability = { available: false, reason: 'recovery-required' };
        return unavailable('reconstruction-failed', { claimId });
      }
      if (!activeGmMatches(currentUser?.(), activeGM?.())) {
        cachedAvailability = { available: false, reason: 'recovery-required' };
        return unavailable('active-gm-required', { claimId });
      }
      state.requests[requestId] = {
        ...prior,
        status: disposition,
        response: unavailable('request-not-replayable', { disposition }),
        reconciledAt: now(),
        claimId: null,
      };
      state.reconciliations.push({ claimId, requestId, disposition, at: now() });
      try {
        await writeState(ledger, state);
      } catch {
        cachedAvailability = { available: false, reason: 'recovery-required' };
        return unavailable('reconstruction-failed', { claimId });
      }
      if (!(await deleteClaim(ledger, claimId))) return unavailable('claim-release-failed');
      recoveryReady = true;
      cachedAvailability = { available: true, reason: null };
      return { success: true, disposition };
    });
  }

  return {
    setup,
    run,
    reconcile,
    consumeExecutionGrant,
    availability: () => ({ ...cachedAvailability }),
    refreshAvailability,
    bootstrapRecovery,
  };
}

/**
 * Create the Foundry V13/V14 JournalEntry-backed authority adapter.
 * Ledger ownership defaults to NONE and claims use `JournalEntryPage` creation with `keepId`.
 * The elected GM provisions the ledger automatically on boot and on its first command.
 * @param {object} [options] Foundry globals, secure randomness, clock and reconstruction seams.
 * @returns {object} The authority API from {@link createJournalRunAuthority}.
 */
export function createFoundryJournalRunAuthority({
  game = globalThis.game,
  JournalEntry = globalThis.JournalEntry,
  CONFIG = globalThis.CONFIG,
  crypto = globalThis.crypto,
  randomId = createSecureRandomId(crypto),
  now = () => Date.now(),
  reconstructExecutions = null,
} = {}) {
  const isLedger = (entry) => entry?.getFlag?.('fabricate', AUTHORITY_FLAG) === true;
  const listLedgers = async () => [...(game?.journal ?? [])].filter(isLedger);
  // `game.journal` is broadcast-fed, so a post-create relist of it can still miss a racing
  // session's ledger. This `get` round-trips to the server, but is NOT permission-filtered for
  // world documents, so it stays behind the GM check. Its documents are detached `fromSource`
  // copies: rank on them, then act by id against `game.journal`.
  const listLedgerRecords = async () => {
    if (game?.user?.isGM !== true || typeof CONFIG?.DatabaseBackend?.get !== 'function') {
      return null;
    }
    const entries = (await CONFIG.DatabaseBackend.get(JournalEntry, { query: {} })) ?? [];
    return [...entries].filter(isLedger).map((entry) => ({
      id: entry._id ?? entry.id,
      createdTime: Number(entry._stats?.createdTime) || 0,
    }));
  };
  return createJournalRunAuthority({
    currentUser: () => game?.user ?? null,
    activeGM: () => game?.users?.activeGM ?? null,
    listLedgers,
    listLedgerRecords,
    canCreateLedger: () => game?.user?.can?.('JOURNAL_CREATE') !== false,
    deleteLedger: async (entry) => entry?.delete?.(),
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
    reconstructExecutions,
    randomId,
    now,
  });
}
