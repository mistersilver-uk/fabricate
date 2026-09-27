import {
  hasInFlightCompanionEffect,
  observeCompanionOperationId,
} from './companionOperationRecord.js';
import { JOURNAL_RUN_CLAIM_PAGE_ID } from './journalRunAuthority.js';
import { JOURNAL_RUN_COMMAND_TIMEOUT_MS } from './journalRunCommands.js';

/** Request/reply discriminators multiplexed on the existing module socket, distinct from runs. */
export const COMPANION_OPERATION_SOCKET_KIND = Object.freeze({
  REQUEST: 'fabricate.companionOperation.request',
  REPLY: 'fabricate.companionOperation.reply',
});

/** How long a relaying GM waits for the elected GM's reply before reporting it indeterminate. */
export const COMPANION_OPERATION_TIMEOUT_MS = JOURNAL_RUN_COMMAND_TIMEOUT_MS;

/** Acceptance outcomes whose stored record may go on to the executor, after rereading it. */
const CONTINUABLE_ACCEPTANCE = new Set(['accepted', 'duplicate']);

/** Stored states an ordinary submission may continue; every other state is observation-only. */
const EXECUTABLE_STATES = new Set(['accepted', 'pending']);

/** Authority refusals a losing browser of the same elected GM User answers with silence. */
const CONTENTION_REASONS = new Set(['claim-held', 'recovery-pending']);

function validText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Whether a stored record may reach the executor. Only an accepted or pending record with no
 * mutation in flight: an applying subwrite, or an applying effect without evidence, is uncertain
 * evidence a later step must reconcile, while an applying effect whose subwrites are all settled
 * or pending may resume. A failed, review-required or awaiting-decision record waits for its own
 * explicit ingress.
 */
function executable(record) {
  if (!EXECUTABLE_STATES.has(record?.state)) return false;
  return !hasInFlightCompanionEffect(record);
}

/** The one refusal shape; `reason` is a stable code, never prose. */
function refused(operationId, reason) {
  return { status: 'refused', operationId, reason };
}

function unavailable(operationId, reason) {
  return { status: 'unavailable', operationId, reason };
}

/**
 * The operation id a submission names, or the refusal for it. The claim page's fixed id is itself
 * a syntactically valid operation id, and sharing the ledger makes it the one id that must never be
 * accepted; every other id is used exactly as given.
 */
function checkedOperationId(value) {
  let operationId;
  try {
    operationId = observeCompanionOperationId(value);
  } catch {
    return { refusal: { status: 'invalidInput', operationId: null } };
  }
  if (operationId === JOURNAL_RUN_CLAIM_PAGE_ID) {
    return { refusal: refused(operationId, 'reserved-operation-id') };
  }
  return { operationId };
}

/**
 * Accept under a held claim, then continue only through proven steps: every step after an awaited
 * acceptance proves the claim again before it may go on.
 */
function createClaimedAcceptance({ createStore, clock, executor }) {
  async function continueAccepted({ store, operationId, accepted, heldClaim }) {
    const observed = { status: accepted.status, operationId, record: accepted.record };
    if (!(await heldClaim.claimStillHeld())) {
      return { ...observed, continued: false, reason: 'claim-lost' };
    }
    const stored = await store.read(operationId);
    if (stored.status !== 'found') {
      return { ...observed, continued: false, reason: 'record-unavailable' };
    }
    const current = { ...observed, record: stored.record };
    if (!executable(stored.record)) return { ...current, continued: false };
    if (!(await heldClaim.claimStillHeld())) {
      return { ...current, continued: false, reason: 'claim-lost' };
    }
    if (typeof executor !== 'function') return { ...current, continued: false };
    let ran;
    try {
      ran = await executor({ record: structuredClone(stored.record), heldClaim });
    } catch (error) {
      // Whatever the executor had begun is uncertain, so the claim is retained for reconciliation.
      return {
        ...current,
        continued: true,
        reason: 'executor-failed',
        message: error?.message ?? String(error),
        recoveryRequired: true,
      };
    }
    const after = await store.read(operationId);
    const settled = {
      ...current,
      record: after.status === 'found' ? after.record : current.record,
      continued: true,
    };
    // A claim lost after an intent was recorded leaves a write that may still land elsewhere.
    if (ran?.recoveryRequired === true) {
      return { ...settled, reason: ran.reason ?? 'claim-lost', recoveryRequired: true };
    }
    return settled;
  }

  async function acceptUnderClaim({ operationId, plan }, helpers) {
    const heldClaim = helpers?.heldClaim;
    if (!heldClaim) return unavailable(operationId, 'claim-context-unavailable');
    let store;
    try {
      store = createStore({
        ledger: heldClaim.ledger,
        readAuthoritativeLedger: heldClaim.readAuthoritativeLedger,
        clock,
      });
    } catch {
      return unavailable(operationId, 'store-unavailable');
    }
    const accepted = await store.accept({ operationId, plan });
    if (!CONTINUABLE_ACCEPTANCE.has(accepted.status)) {
      return { ...accepted, operationId, continued: false };
    }
    return continueAccepted({ store, operationId, accepted, heldClaim });
  }

  return acceptUnderClaim;
}

/** The relaying side: pending requests, their timeouts, and the only replies that settle them. */
function createRelay({ currentUser, activeGM, getUser, emit, sessionId, timeoutMs }) {
  const pending = new Map();

  /** Settle only the exact pending request this reply names, from the elected GM alone. */
  function acceptReply(payload, senderId) {
    const gm = activeGM?.();
    if (!gm?.id || senderId !== gm.id || getUser?.(senderId)?.isGM !== true) return false;
    if (payload?.recipientId !== currentUser?.()?.id || payload.sessionId !== sessionId) {
      return false;
    }
    const tracked = pending.get(payload.requestId);
    if (!tracked || tracked.operationId !== payload.operationId) return false;
    clearTimeout(tracked.timer);
    pending.delete(payload.requestId);
    tracked.resolve(payload.response);
    return true;
  }

  /** Relay to the elected GM User; the emit acknowledgement confirms the relay, nothing more. */
  function relay(request, gmId) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(request.requestId);
        // Unknown, not failed: the operation may still be accepted under the same identity.
        resolve({
          status: 'pending',
          operationId: request.operationId,
          indeterminate: true,
          reason: 'timeout',
        });
      }, timeoutMs);
      pending.set(request.requestId, { operationId: request.operationId, resolve, timer });
      try {
        emit(request, { recipients: [gmId] });
      } catch {
        // A relay that could not be sent may still have reached the server; keep waiting.
      }
    });
  }

  return { relay, acceptReply };
}

function buildReply(payload, recipientId, response) {
  return {
    kind: COMPANION_OPERATION_SOCKET_KIND.REPLY,
    recipientId,
    operationId: payload.operationId,
    requestId: payload.requestId,
    sessionId: payload.sessionId,
    response,
  };
}

/**
 * Route companion operation submissions through the elected GM's one durable claim.
 *
 * Any server-attested GM may submit. The elected GM's browser accepts under the shared Journal
 * authority claim, so two browsers of the same elected User contend on one claim page rather than
 * both accepting; a non-elected GM relays over the module socket and awaits a correlated reply.
 * Logical `operationId`, transport `requestId` and browser `sessionId` stay distinct, so a retry
 * may change the last two while naming the same operation.
 *
 * After acceptance the exact claim is verified, the stored record is reread from the server copy,
 * and the claim is verified again before the injected executor is invoked with that stored record
 * and the held-claim context. Bootstrap wires no executor yet, so no effect runs in this
 * increment; recovery and public methods belong to later increments, and none of this claims
 * fencing or exactly-once callbacks. An executor summary with `recoveryRequired: true` keeps the
 * run in recovery, as a throw does.
 *
 * @param {object} deps
 * @param {object} deps.authority The shared authority from `createJournalRunAuthority`.
 * @param {Function} deps.createStore `({ledger, readAuthoritativeLedger, clock}) => store`.
 * @param {Function} deps.currentUser This realm's User supplier.
 * @param {Function} deps.activeGM Foundry's elected GM User supplier.
 * @param {Function} deps.getUser Lookup for the server-attested sender id.
 * @param {Function} deps.emit `(message, options) => void` module-socket adapter.
 * @param {Function} deps.randomId Request and session id supplier.
 * @param {Function} deps.clock Wall-clock milliseconds for acceptance timestamps.
 * @param {Function|null} [deps.executor] `async ({record, heldClaim}) => summary`, as
 *   `createCompanionOperationEffectExecutor` builds; not wired at bootstrap.
 * @param {number} [deps.timeoutMs] Relay reply timeout; expiry never implies failure.
 * @returns {object} Internal `submit`, `handleSubmission` and `handleSocketMessage` methods.
 */
export function createCompanionOperationAuthority({
  authority,
  createStore,
  currentUser,
  activeGM,
  getUser,
  emit,
  randomId,
  clock,
  executor = null,
  timeoutMs = COMPANION_OPERATION_TIMEOUT_MS,
}) {
  const sessionId = randomId();
  const acceptUnderClaim = createClaimedAcceptance({ createStore, clock, executor });
  const { relay, acceptReply } = createRelay({
    currentUser,
    activeGM,
    getUser,
    emit,
    sessionId,
    timeoutMs,
  });

  function realmIsElected() {
    const user = currentUser?.();
    return user?.isGM === true && validText(user.id) && user.id === activeGM?.()?.id;
  }

  /**
   * Accept one submission on the elected GM's browser, under the shared claim. `senderId` is the
   * server-attested sender (or this realm's own User for a local submission), never a payload field.
   */
  async function handleSubmission(submission, senderId) {
    const sender = getUser?.(senderId) ?? null;
    const checked = checkedOperationId(submission?.operationId);
    if (sender?.isGM !== true) return refused(checked.operationId ?? null, 'gm-required');
    if (checked.refusal) return checked.refusal;
    const { operationId } = checked;
    if (!validText(submission?.requestId) || !validText(submission?.sessionId)) {
      return { status: 'invalidInput', operationId };
    }
    if (!realmIsElected()) return unavailable(operationId, 'active-gm-required');
    const request = {
      requestId: submission.requestId,
      operationId,
      senderId,
      sessionId: submission.sessionId,
    };
    const response = await authority.run(request, (helpers) =>
      acceptUnderClaim({ operationId, plan: submission.plan }, helpers)
    );
    if (typeof response?.status === 'string') return response;
    // The authority refused or failed before any companion answer existed.
    return unavailable(operationId, response?.reason ?? 'authority-unavailable');
  }

  async function handleSocketMessage(payload, senderId) {
    if (payload?.kind === COMPANION_OPERATION_SOCKET_KIND.REPLY) {
      return acceptReply(payload, senderId);
    }
    if (payload?.kind !== COMPANION_OPERATION_SOCKET_KIND.REQUEST) return null;
    if (!realmIsElected()) return null;
    const response = await handleSubmission(payload, senderId);
    // A second browser of the elected User receives the same request. Having lost the claim it
    // must stay silent, or its refusal could settle the requester before the winner's answer.
    if (response?.status === 'unavailable' && CONTENTION_REASONS.has(response.reason)) {
      return null;
    }
    const reply = buildReply(payload, senderId, response);
    emit(reply, { recipients: [senderId] });
    return reply;
  }

  /**
   * Submit one complete operation plan from this browser. The elected GM's own browser enters the
   * claim directly; any other GM relays; a non-GM is refused before anything is sent.
   * @param {{operationId: string, plan: object}} submission
   */
  async function submit({ operationId, plan } = {}) {
    const user = currentUser?.();
    const checked = checkedOperationId(operationId);
    if (user?.isGM !== true) return refused(checked.operationId ?? null, 'gm-required');
    if (checked.refusal) return checked.refusal;
    const gm = activeGM?.();
    if (!gm?.id) return unavailable(checked.operationId, 'active-gm-missing');
    const requestId = randomId();
    if (!validText(requestId)) return unavailable(checked.operationId, 'random-id-unavailable');
    const submission = { operationId: checked.operationId, plan, requestId, sessionId };
    if (realmIsElected()) return handleSubmission(submission, user.id);
    return relay({ kind: COMPANION_OPERATION_SOCKET_KIND.REQUEST, ...submission }, gm.id);
  }

  return Object.freeze({ submit, handleSubmission, handleSocketMessage, acceptReply, sessionId });
}
