import { forcedDeletionEntry, isSafeFlagKeySegment } from '../config/flags.js';

import {
  createJournalRunLedgerProvisioner,
  createLedgerRetry,
  retainedClaimIdentity,
} from './journalRunLedger.js';
import {
  createJournalRunPrivatePreparation,
  legacyPrivatePaths,
  normalizeJournalRunAuthorityState,
  safeJournalRunResponse,
} from './journalRunPrivatePreparation.js';

const AUTHORITY_VERSION = 1;
const AUTHORITY_FLAG = 'journalRunAuthorityLedger';
const AUTHORITY_STATE_FLAG = 'journalRunAuthorityState';
const AUTHORITY_STATE_PATH = `flags.fabricate.${AUTHORITY_STATE_FLAG}`;
const NON_MUTATING_GRANTS = new Set(['describeCheck', 'prepareAlchemyStart']);

/** Fixed embedded-page ID used for arbitration, distinct from the claim's random `claimId`. */
export const JOURNAL_RUN_CLAIM_PAGE_ID = 'FabRunAuthority1';

/**
 * How long a claim may be held before the command it guards is judged no longer running: four
 * times the requester's `JOURNAL_RUN_COMMAND_TIMEOUT_MS` (15s), the only declared bound on a
 * command's life, so a slow command is never misjudged and an honest `claim-held` stays brief.
 * `tests/journal-run-authority.test.js` pins it against that timeout.
 */
export const JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS = 60_000;

/**
 * How long a task may WAIT FOR ITS TURN in the local queue before it refuses, so one task that
 * never settles cannot silently stop every later command on the client (issue 1759). The same 15s
 * as `JOURNAL_RUN_COMMAND_TIMEOUT_MS`, not the 60s claim window: a remote caller has already been
 * told `timeout`, and the GM's own command has no other bound. Restated rather than imported so
 * the ledger layer does not pull in the socket layer; `tests/journal-run-authority.test.js` pins
 * the two equal. A refusal names the command holding the line.
 */
export const JOURNAL_RUN_QUEUE_WAIT_MS = 15_000;

/** Statuses whose request is finished, so the claim guarding it can only have leaked. */
const FINISHED_REQUEST_STATUSES = new Set(['settled', 'abandoned', 'reconciled']);

/**
 * Judge a claim from the REQUEST it guards, never from age alone: `leaked` only once it has
 * outlived the live window AND its request provably finished (or was never recorded, so no
 * handler ever ran). Every ambiguous case — an uncertain effect, an unreadable stamp, an unknown
 * status — is `retained` and still requires `reconcileJournalRunAuthority`, because releasing a
 * claim that should have been kept is a data-integrity bug.
 * @returns {'live'|'leaked'|'retained'}
 */
function claimStanding(claim, state, nowMs) {
  const acquiredAt = Number(claim?.acquiredAt);
  if (!Number.isFinite(acquiredAt)) return 'retained';
  if (nowMs - acquiredAt <= JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS) return 'live';
  const request = state.requests[claim.requestId];
  if (!request || FINISHED_REQUEST_STATUSES.has(request.status)) return 'leaked';
  return 'retained';
}

function emptyState() {
  return { version: AUTHORITY_VERSION, requests: {}, prepareTokens: {}, reconciliations: [] };
}

function normalizedState(value) {
  return normalizeJournalRunAuthorityState(value);
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

/** The GM-owned ledger's creation source; its top-level `_id` must stay server-assigned. */
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
 * The ledger ONE command holds its claim on, and the only thing allowed to move it.
 * The claim page lives INSIDE its ledger, so a racing deletion takes the lock with it while
 * `writeLedgerState` silently retries onto the replacement. `persist` re-claims there rather than
 * letting the command finish holding no lock on the ledger it is writing to; a re-claim that
 * loses the race sets `lockLost`, which the caller turns into a refusal or into recovery.
 * @returns {{ledger: object, held: boolean, lockLost: boolean, persist: Function}}
 */
function claimedLedgerWriter({ ledger, claimId, requestId, writeLedgerState, claimOn }) {
  let current = ledger;
  let held = true;
  let lost = false;
  return {
    get ledger() {
      return current;
    },
    get held() {
      return held;
    },
    get lockLost() {
      return lost;
    },
    async persist(state) {
      const next = await writeLedgerState(current, state);
      if (next === current) return;
      current = next;
      held = (await claimOn(next, claimId, requestId)) !== null;
      if (!held) lost = true;
    },
  };
}

/**
 * Cross-realm exclusion requires exclusive fixed-page creation under exactly one GM-owned ledger.
 * The elected GM provisions and arbitrates that ledger; settled requests deduplicate, a pre-write
 * refusal releases its claim, and a claim left by an uncertain effect never expires — while one
 * whose guarded request provably finished is reaped once it outlives
 * {@link JOURNAL_RUN_CLAIM_LIVE_WINDOW_MS}.
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
 * @param {Function} deps.readClaim `async (ledger) => {claimId, requestId, acquiredAt}|null`.
 * @param {Function} deps.deleteClaim `async (ledger, claimId) => boolean`, matching the exact claim.
 * @param {Function} deps.reconstructExecutions `async ({operationId, orphaned}) => {success}`.
 * @param {Function} deps.randomId Secure nonempty ID supplier.
 * @param {Function} [deps.now] Wall-clock milliseconds for request/token records, not run timing.
 * @param {Function} [deps.onAvailabilityRestored] Announced when a published refusal LIFTS, so a
 *   surface holding a reading of it re-derives rather than refusing against a claim that is gone.
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
  queueWaitMs = JOURNAL_RUN_QUEUE_WAIT_MS,
  onAvailabilityRestored = null,
}) {
  let localQueue = Promise.resolve();
  let cachedAvailability = { available: false, reason: 'ledger-missing' };
  /** What currently holds the local chain, named in a `queue-timeout` so the wait is diagnosable. */
  let queueHolder = 'idle';
  let recoveryReady = false;

  /**
   * The ONE writer of the cached answer. A refusal is published freely, and its LIFTING is
   * announced, because that is the moment every reading of it became false; otherwise a surface
   * keeps refusing against a claim that is gone (issue 1648, M25). Event-driven: nothing
   * re-derives on a timer or per read.
   */
  function publishAvailability(next) {
    const wasRefused = cachedAvailability.available !== true;
    cachedAvailability = next;
    if (wasRefused && next.available === true) {
      try {
        onAvailabilityRestored?.();
      } catch {
        // A consumer that throws while refreshing must not fail the command that freed the claim.
      }
    }
    return next;
  }
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
    if (!ensured.success) publishAvailability({ available: false, reason: ensured.reason });
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
  const privatePreparation = createJournalRunPrivatePreparation({
    now,
    currentUser,
    activeGM,
    nextRandomId,
  });

  async function shouldHandleRequest(request) {
    privatePreparation.prune();
    let ledgers;
    try {
      ledgers = (await listLedgers()) ?? [];
    } catch {
      return false;
    }
    if (ledgers.length !== 1) return true;
    let state;
    try {
      state = normalizedState(await readState(ledgers[0]));
    } catch {
      return false;
    }
    return privatePreparation.belongsHere(request, state);
  }

  /**
   * Resolve this world's one ledger, reaping a claim that provably guards nothing, so `claim-held`
   * is reported only while a command may still be running; only the elected GM ever writes.
   */
  async function ledgerResult() {
    const gm = activeGM?.();
    if (!gm?.id) return unavailable('active-gm-missing');
    const ledgers = (await listLedgers()) ?? [];
    if (ledgers.length === 0) return unavailable('ledger-missing');
    if (ledgers.length !== 1) return unavailable('ledger-ambiguous');
    const ledger = ledgers[0];
    const claim = await readClaim(ledger);
    if (!claim) return { success: true, ledger };
    const state = normalizedState(await readState(ledger));
    const standing = claimStanding(claim, state, now());
    if (standing === 'live') return unavailable('claim-held', { ledger, claim });
    if (standing === 'retained') {
      const retained = retainedClaimIdentity(claim, state);
      return unavailable('recovery-required', { ledger, claim, retained });
    }
    // A non-GM realm cannot write, and does not need to: the claim guards nothing, and the
    // elected GM that actually executes the command reaps it on its own acquire.
    if (!activeGmMatches(currentUser?.(), gm)) return { success: true, ledger };
    const released = await deleteClaim(ledger, claim.claimId);
    return released ? { success: true, ledger } : unavailable('claim-held', { ledger, claim });
  }

  /** Cache an answer WITH any retained-claim identity it carries, for every realm. */
  function cacheAvailability(available, reason, result) {
    const next = { available, reason };
    if (result?.retained) next.retained = result.retained;
    publishAvailability(next);
    return next;
  }

  async function refreshAvailability() {
    const result = await ledgerResult();
    const activeRealmNeedsRecovery = activeGmMatches(currentUser?.(), activeGM?.());
    if (!activeRealmNeedsRecovery) recoveryReady = false;
    const available = result.success === true && (!activeRealmNeedsRecovery || recoveryReady);
    return cacheAvailability(
      available,
      available ? null : result.success === true ? 'recovery-pending' : result.reason,
      result
    );
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

  /**
   * Serialise a task on this client's one authority chain, bounding the WAIT for a turn, never the
   * task: a started command runs to its own settlement, since abandoning it mid-write is the
   * uncertainty the claim records, while one that never starts refuses with a named reason (issue
   * 1759). One timer both answers the caller and forfeits the turn, so a write can never follow a
   * "nothing was changed" answer. The refusal reads the holder's name when it REFUSES, set as each
   * task STARTS: a task reaching a free line starts on the next microtask, long before any timer
   * fires, so the name is right by construction, where one captured at enqueue could blame a
   * command that had already finished.
   */
  function queue(holder, task) {
    const refuse = () => unavailable('queue-timeout', { blockedBy: queueHolder });
    let abandoned = false;
    let timer = null;
    const waited = new Promise((resolve) => {
      timer = setTimeout(() => {
        abandoned = true;
        resolve(refuse());
      }, queueWaitMs);
    });
    const guarded = async () => {
      // Its caller has already been answered "nothing was changed", so starting now would make
      // that answer a lie. The turn is forfeit, not deferred.
      if (abandoned) return refuse();
      clearTimeout(timer);
      queueHolder = holder;
      return task();
    };
    const scheduled = localQueue.then(guarded, guarded);
    localQueue = scheduled.catch(() => {});
    return Promise.race([scheduled, waited]);
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
      publishAvailability({ available: false, reason: 'secure-random-unavailable' });
      return unavailable('secure-random-unavailable');
    }
    const requestId = `boot-${bootId}`;
    const acquired = await acquire({ requestId });
    if (!acquired.success) {
      cacheAvailability(false, acquired.reason, acquired);
      return unavailable(acquired.reason);
    }
    const { ledger, claimId } = acquired;
    if (!activeGmMatches(currentUser?.(), activeGM?.())) {
      const released = await deleteClaim(ledger, claimId);
      publishAvailability({
        available: false,
        reason: released ? 'active-gm-required' : 'claim-release-failed',
      });
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
      publishAvailability({ available: false, reason: 'recovery-required' });
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
      publishAvailability({ available: false, reason: 'recovery-required' });
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
      publishAvailability({ available: false, reason: 'recovery-required' });
      return unavailable('reconstruction-failed', { claimId });
    }
    const released = await deleteClaim(ledger, claimId);
    recoveryReady = released;
    publishAvailability(
      released
        ? { available: true, reason: null }
        : { available: false, reason: 'claim-release-failed' }
    );
    return released ? { success: true } : unavailable('claim-release-failed');
  }

  function bootstrapRecovery() {
    return queue('bootstrap-recovery', performBootstrapRecovery);
  }

  /**
   * Create the exclusive claim page on one ledger, answering `null` for every refusal.
   * `acquiredAt` is what {@link claimStanding} ages, so every create stamps it.
   */
  async function claimOn(ledger, claimId, requestId) {
    try {
      // `keepId` is what makes the server's duplicate embedded-`_id` rejection reachable; without
      // it the fixed id is discarded and the cross-browser lock degrades to a silent no-op.
      const source = { _id: JOURNAL_RUN_CLAIM_PAGE_ID, claimId, requestId, acquiredAt: now() };
      return (await createClaim(ledger, source)) ?? null;
    } catch {
      return null;
    }
  }

  async function acquire(request) {
    if (!activeGmMatches(currentUser?.(), activeGM?.())) return unavailable('active-gm-required');
    const ledgerCheck = await ledgerResult();
    if (!ledgerCheck.success) return ledgerCheck;
    const claimId = nextRandomId();
    if (!claimId) return unavailable('secure-random-unavailable');
    let ledger = ledgerCheck.ledger;
    let claim = await claimOn(ledger, claimId, request.requestId);
    if (!claim) {
      // A racing session may have deleted this ledger mid-acquire: relist and retry once.
      const replacement = await replacementLedger(ledger);
      if (!replacement) return unavailable('claim-held');
      ledger = replacement;
      claim = await claimOn(ledger, claimId, request.requestId);
      if (!claim) return unavailable('claim-held');
    }
    return { success: true, ledger, claimId };
  }

  function tokenHelpers({ state, request, persist }) {
    return {
      issuePrepareToken: (binding, { expiresAt } = {}) =>
        privatePreparation.issue(state, request, binding, expiresAt),
      consumePrepareToken: (token, binding) =>
        privatePreparation.consume(state, request, token, binding),
      releasePrepareToken: (token, binding) =>
        privatePreparation.release(state, request, token, binding),
      persist,
    };
  }

  function run(request, handler) {
    return queue(`command:${request?.requestId ?? 'unknown'}`, async () => {
      privatePreparation.prune();
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
        cacheAvailability(false, acquired.reason, acquired);
        return unavailable(acquired.reason);
      }
      const { claimId } = acquired;
      const writer = claimedLedgerWriter({
        ledger: acquired.ledger,
        claimId,
        requestId: request.requestId,
        writeLedgerState,
        claimOn,
      });
      const releaseClaim = async () => (writer.held ? deleteClaim(writer.ledger, claimId) : true);
      if (!activeGmMatches(currentUser?.(), activeGM?.())) {
        recoveryReady = false;
        const released = await releaseClaim();
        publishAvailability(
          released
            ? { available: false, reason: 'active-gm-required' }
            : { available: false, reason: 'claim-release-failed' }
        );
        return unavailable(released ? 'active-gm-required' : 'claim-release-failed');
      }
      const state = normalizedState(await readState(writer.ledger));
      const prior = state.requests[request.requestId];
      if (prior && (prior.senderId !== request.senderId || prior.sessionId !== request.sessionId)) {
        if (!(await releaseClaim())) {
          publishAvailability({ available: false, reason: 'claim-release-failed' });
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
          publishAvailability({ available: false, reason: 'claim-release-failed' });
          return unavailable('claim-release-failed');
        }
        publishAvailability({ available: true, reason: null });
        const privateReply = privatePreparation.reply(request.requestId);
        if (privateReply) return privateReply;
        if (prior.response?.checkRequired) return unavailable('prepare-token-invalid');
        return structuredClone(prior.response ?? unavailable('request-not-replayable'));
      }

      state.requests[request.requestId] = {
        kind: 'command',
        operationId: request.requestId,
        status: 'processing',
        senderId: request.senderId,
        sessionId: request.sessionId,
        issuerGMId: currentUser?.()?.id,
        issuerInstanceId: privatePreparation.instanceId(),
        startedAt: now(),
      };
      const persist = () => writer.persist(state);
      await persist();
      if (writer.lockLost) {
        // The swap happened before the handler ran, so nothing has been applied and refusing is
        // clean. Proceeding would execute against a ledger another session can claim.
        publishAvailability({ available: false, reason: 'claim-held' });
        return unavailable('claim-held');
      }
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
        durableResponse = safeJournalRunResponse(structuredClone(response));
      } catch {
        response = unavailable('response-not-serializable', { recoveryRequired: true });
        durableResponse = structuredClone(response);
      }
      // A lost lock is genuinely uncertain: the handler ran on to completion against a ledger
      // this command no longer held, so its effect is exactly what reconciliation is for.
      const mustRecover = recoveryRequired || response.recoveryRequired === true || writer.lockLost;
      state.requests[request.requestId] = {
        ...state.requests[request.requestId],
        status: mustRecover ? 'recoveryRequired' : 'settled',
        settledAt: now(),
        response: durableResponse,
        claimId: mustRecover ? claimId : null,
      };
      await persist();
      if (mustRecover) {
        publishAvailability({ available: false, reason: 'recovery-required' });
        return response;
      }
      privatePreparation.rememberReply(request.requestId, response, state);
      for (const record of createdGrantRecords) {
        if (record.requestId === request.requestId) createdGrantRecords.delete(record);
      }
      const released = await releaseClaim();
      publishAvailability(
        released
          ? { available: true, reason: null }
          : { available: false, reason: 'claim-release-failed' }
      );
      return response;
    });
  }

  function reconcile({ claimId, disposition }) {
    return queue(`reconcile:${claimId ?? 'unknown'}`, async () => {
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
      // A claim that is already gone is the outcome reconciliation exists to reach, so report it
      // reached rather than refusing. Only a DIFFERENT claim is a genuine mismatch.
      if (!claim) {
        recoveryReady = true;
        publishAvailability({ available: true, reason: null });
        return { success: true, disposition, alreadyReleased: true };
      }
      if (claim.claimId !== claimId) return unavailable('claim-mismatch');
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
        publishAvailability({ available: false, reason: 'recovery-required' });
        return unavailable('reconstruction-failed', { claimId });
      }
      if (!activeGmMatches(currentUser?.(), activeGM?.())) {
        publishAvailability({ available: false, reason: 'recovery-required' });
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
        publishAvailability({ available: false, reason: 'recovery-required' });
        return unavailable('reconstruction-failed', { claimId });
      }
      if (!(await deleteClaim(ledger, claimId))) return unavailable('claim-release-failed');
      recoveryReady = true;
      publishAvailability({ available: true, reason: null });
      return { success: true, disposition };
    });
  }

  return {
    setup,
    run,
    shouldHandleRequest,
    reconcile,
    consumeExecutionGrant,
    availability: () => ({ ...cachedAvailability }),
    refreshAvailability,
    bootstrapRecovery,
  };
}

/**
 * The forced deletions for every legacy private field the persisted flag still holds: the state
 * write deep-merges, so a key normalization omits survives it. An id that is not one flag-key
 * segment cannot be addressed by a dotted path and is skipped.
 */
function legacyPrivateDeletions(rawState) {
  const entries = legacyPrivatePaths(rawState)
    .filter(([parent]) => parent.split('.').every(isSafeFlagKeySegment))
    .map(([parent, key]) => forcedDeletionEntry(`${AUTHORITY_STATE_PATH}.${parent}`, key));
  return Object.fromEntries(entries.filter(Boolean));
}

/**
 * Create the Foundry V13/V14 JournalEntry-backed authority adapter.
 * Ledger ownership defaults to NONE and claims use `JournalEntryPage` creation with `keepId`.
 * The elected GM provisions the ledger automatically on boot and on its first command.
 * @param {object} [options] Foundry globals, secure randomness, clock, reconstruction and
 *   availability-restored seams.
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
  onAvailabilityRestored = null,
} = {}) {
  const isLedger = (entry) => entry?.getFlag?.('fabricate', AUTHORITY_FLAG) === true;
  const listLedgers = async () => [...(game?.journal ?? [])].filter(isLedger);
  // `game.journal` is broadcast-fed, so a post-create relist of it can still miss a racing
  // session's ledger. This `get` round-trips to the server, but is NOT permission-filtered for
  // world documents, so it stays behind the GM check. Its documents are detached `fromSource`
  // copies WITH their embedded pages expanded (the server answers a non-index get through
  // `find`, which runs `expandEmbedded` on every matched record), so a claim page can be read
  // from one. Rank on them, then act by id against `game.journal`.
  // `null` means the read could not be performed, which every caller treats as unsettled — never
  // as "the server has nothing", which would authorise a duplicate ledger or call a held claim
  // released.
  const authoritativeEntries = async (query) => {
    if (game?.user?.isGM !== true || typeof CONFIG?.DatabaseBackend?.get !== 'function') {
      return null;
    }
    try {
      return [...((await CONFIG.DatabaseBackend.get(JournalEntry, { query })) ?? [])];
    } catch {
      // The read itself can reject: `get` dispatches through `SocketInterface`, whose error
      // handler toasts and then rejects. A rejection is "unanswered", the same `null` the
      // provisioner's guarded read returns (`journalRunLedger.js`) - never "nothing exists".
      return null;
    }
  };
  const listLedgerRecords = async () => {
    const entries = await authoritativeEntries({});
    if (entries === null) return null;
    return entries.filter(isLedger).map((entry) => ({
      id: entry._id ?? entry.id,
      createdTime: Number(entry._stats?.createdTime) || 0,
    }));
  };
  /**
   * Read ONE ledger's claim page from the SERVER, not from the broadcast-fed local copy. Scoped
   * by `_id` so an ordinary release ships one entry rather than the whole journal, and re-checked
   * below, so the narrowing stays an optimisation rather than a correctness assumption.
   * @returns {Promise<{present: boolean, claimId: ?string}|null>} `null` when unreadable.
   */
  const readServerClaim = async (ledgerId) => {
    if (!ledgerId) return null;
    const entries = await authoritativeEntries({ _id: ledgerId });
    if (entries === null) return null;
    const entry = entries.find((candidate) => (candidate?._id ?? candidate?.id) === ledgerId);
    // A ledger the server no longer has holds no claim either: absent, not unreadable.
    const page = entry?.pages?.get?.(JOURNAL_RUN_CLAIM_PAGE_ID) ?? null;
    if (!page) return { present: false, claimId: null };
    return { present: true, claimId: page.getFlag?.('fabricate', 'journalRunClaimId') ?? null };
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
    // Two sequential awaited updates, never one payload mixing the deletions with the write.
    writeState: async (entry, state) => {
      const deletions = legacyPrivateDeletions(entry?.getFlag?.('fabricate', AUTHORITY_STATE_FLAG));
      if (Object.keys(deletions).length > 0) await entry.update(deletions);
      return entry.update({ [AUTHORITY_STATE_PATH]: state });
    },
    // This create KEEPS its duplicate-`_id` rejection: it is the lock's compare-and-set
    // (`_createDocuments` runs inside the database semaphore), which asking first could not
    // replace. `ledgerResult` refuses a LIVE claim locally, so only two realms that BOTH saw the
    // claim free collide here, as two tabs of the same elected GM can inside the broadcast window;
    // the loser is handled correctly, but `SocketInterface` toasts the server's throw first (a
    // per-session election would remove it; issue 1648, FI2).
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
        // The stamp {@link claimStanding} ages; without it every claim reads as unjudgeable.
        acquiredAt: page.getFlag?.('fabricate', 'journalRunClaimedAt') ?? null,
      };
    },
    // `deleteEmbeddedDocuments` resolves the DELETED DOCUMENTS, so document identity is the whole
    // answer. ASK THE SERVER FIRST: `pages` is the broadcast-fed local copy and can show a page the
    // server already removed, whose delete throws `JournalEntryPage "FabRunAuthority1" does not
    // exist!`. `SocketInterface.#handleError` toasts UNCONDITIONALLY before rejecting, so a `catch`
    // hides the exception but never the toast; confirming beforehand removes it.
    deleteClaim: async (entry, claimId) => {
      const local = entry?.pages?.get?.(JOURNAL_RUN_CLAIM_PAGE_ID) ?? null;
      // A page some OTHER claim holds is never this caller's to delete, whoever asks.
      if (local && local.getFlag?.('fabricate', 'journalRunClaimId') !== claimId) return false;
      const server = await readServerClaim(entry?.id ?? entry?._id);
      if (server) {
        // Absence is the goal state this release exists to reach, so reaching it already is a
        // success — the same answer `reconcile` gives the identical state.
        if (!server.present) return true;
        if (server.claimId !== claimId) return false;
      }
      // Core resolves each id through `collection.get(id, {strict: true})` BEFORE dispatching,
      // so a page this realm has not got cannot be deleted from here at all.
      if (!local) return false;
      try {
        const deleted = await entry.deleteEmbeddedDocuments('JournalEntryPage', [local.id]);
        return Array.isArray(deleted) && deleted.some((document) => document?.id === local.id);
      } catch {
        // Confirmation narrows the window to one round trip; it cannot close it. This catch
        // keeps a residual rejection from escaping the release, and does NOT hide its toast. A
        // rejected delete never prunes the local collection — the client removes documents only
        // on a SUCCESSFUL response — so ask the server again rather than reading `entry.pages`.
        const after = await readServerClaim(entry?.id ?? entry?._id);
        return after !== null && !after.present;
      }
    },
    reconstructExecutions,
    randomId,
    now,
    onAvailabilityRestored,
  });
}
