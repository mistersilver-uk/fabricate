/**
 * Automatic provisioning and duplicate arbitration for the private run-authority ledger.
 *
 * `game.journal` is broadcast-fed, so re-listing it after a create is not a synchronisation
 * point: two GM sessions can each see only their own ledger. Convergence therefore comes from
 * an authoritative server read, a total order every session computes from the same stored
 * values, and a caller that retries after a relist when a racing session deleted its ledger.
 */

const RESOLUTION_PASSES = 3;

/** A ledger no session has committed anything to may be discarded without losing evidence. */
async function isPristine(ledger, { readState, readClaim }) {
  if (await readClaim(ledger)) return false;
  const state = await readState(ledger);
  if (!state || typeof state !== 'object') return true;
  if (Object.keys(state.requests ?? {}).length > 0) return false;
  return Object.values(state.prepareTokens ?? {}).every((token) => token?.status !== 'active');
}

/**
 * Deterministic total order every session converges on, not a claim about creation order:
 * `_stats.createdTime` is a server wall clock in whole milliseconds with no monotonicity
 * guarantee, so the random-but-shared `_id` resolves its realistic ties.
 */
function compareCandidates(left, right) {
  if (left.pristine !== right.pristine) return left.pristine ? 1 : -1;
  if (left.createdTime !== right.createdTime) return left.createdTime - right.createdTime;
  return left.id < right.id ? -1 : 1;
}

/**
 * Merge the broadcast-fed view with the authoritative server read.
 *
 * A read that did not ANSWER — it rejected, or the adapter could not perform it — is reported as
 * `null` rather than collapsed to `[]`, because `[]` is indistinguishable from "the server says
 * none exist" and would authorise a second ledger. Only an ABSENT `listLedgerRecords` means there
 * is no authoritative read to wait for.
 *
 * @returns {Promise<Array<{id: string, createdTime: number}>|null>} `null` when unanswered.
 */
async function mergedLedgerRecords(live, listLedgerRecords) {
  let authoritative = [];
  if (typeof listLedgerRecords === 'function') {
    try {
      authoritative = await listLedgerRecords();
    } catch {
      return null;
    }
    if (!Array.isArray(authoritative)) return null;
  }
  const merged = new Map(live.map((ledger) => [ledger.id, ledgerRecord(ledger)]));
  for (const record of authoritative) {
    if (record?.id) merged.set(record.id, { id: record.id, createdTime: record.createdTime ?? 0 });
  }
  return [...merged.values()];
}

function unsettled() {
  return { success: false, reason: 'ledger-unsettled' };
}

function ledgerRecord(ledger) {
  return { id: ledger?.id, createdTime: Number(ledger?.createdTime) || 0 };
}

/**
 * Build the retry seam for a ledger a racing session deleted mid-operation.
 * A ledger still listed when a write failed means the write itself failed and must not retry.
 * @param {Function} deps.listLedgers `async () => ledger[]`.
 * @param {Function} deps.writeState `async (ledger, state) => void`.
 * @returns {{replacementLedger: Function, writeLedgerState: Function}}
 */
export function createLedgerRetry({ listLedgers, writeState }) {
  async function replacementLedger(ledger) {
    const ledgers = (await listLedgers()) ?? [];
    if (ledgers.some((entry) => entry?.id === ledger?.id)) return null;
    return ledgers.length === 1 ? ledgers[0] : null;
  }

  /** Persist state, retrying once against the ledger that replaced a deleted one. */
  async function writeLedgerState(ledger, state) {
    try {
      await writeState(ledger, state);
      return ledger;
    } catch (error) {
      const replacement = await replacementLedger(ledger);
      if (!replacement) throw error;
      await writeState(replacement, state);
      return replacement;
    }
  }

  return { replacementLedger, writeLedgerState };
}

/**
 * Build the active-GM ledger provisioner.
 * @param {Function} deps.listLedgers `async () => ledger[]` from this client's world collection.
 * @param {Function} [deps.listLedgerRecords] `async () => [{id, createdTime}]|null`, the
 *   authoritative server read; GM-side only, because the `get` action is not permission-filtered.
 * @param {Function} deps.createLedger `async (source) => ledger`.
 * @param {Function} deps.deleteLedger `async (ledger) => void`.
 * @param {Function} deps.readState `async (ledger) => state`.
 * @param {Function} deps.readClaim `async (ledger) => claim|null`.
 * @param {Function} deps.ledgerSource `() => source` for a newly provisioned ledger.
 * @param {Function} [deps.canCreateLedger] `() => boolean`; `JOURNAL_CREATE` is revocable.
 * @returns {{ensureSingleLedger: Function}}
 */
export function createJournalRunLedgerProvisioner({
  listLedgers,
  listLedgerRecords = null,
  createLedger,
  deleteLedger,
  readState,
  readClaim,
  ledgerSource,
  canCreateLedger = () => true,
}) {
  const liveLedgers = async () => ((await listLedgers()) ?? []).filter((entry) => entry?.id);

  async function provision() {
    if (canCreateLedger() !== true) return { success: false, reason: 'ledger-create-denied' };
    try {
      await createLedger(ledgerSource());
    } catch {
      return { success: false, reason: 'ledger-create-failed' };
    }
    return { ...unsettled(), provisioned: true };
  }

  async function arbitrate(candidates) {
    const ranked = [...candidates].sort(compareCandidates);
    const [winner, ...losers] = ranked;
    // Never silently elect against durable evidence: two used ledgers need a person.
    if (losers.some((candidate) => !candidate.pristine)) {
      return { success: false, reason: 'ledger-ambiguous' };
    }
    for (const loser of losers) {
      try {
        await deleteLedger(loser.ledger);
      } catch {
        return { success: false, reason: 'ledger-ambiguous' };
      }
    }
    return { success: true, ledger: winner.ledger };
  }

  async function resolve() {
    const live = await liveLedgers();
    const byId = new Map(live.map((ledger) => [ledger.id, ledger]));
    const observed = await mergedLedgerRecords(live, listLedgerRecords);
    // A read that did not answer authorises nothing, least of all a create.
    if (observed === null) return unsettled();
    if (observed.length === 0) return provision();
    if (observed.length === 1) {
      const ledger = byId.get(observed[0].id);
      // The winner exists on the server but its broadcast has not reached this client yet.
      return ledger ? { success: true, ledger } : unsettled();
    }
    const candidates = [];
    for (const record of observed) {
      const ledger = byId.get(record.id);
      if (!ledger) return unsettled();
      candidates.push({
        ...record,
        ledger,
        pristine: await isPristine(ledger, { readState, readClaim }),
      });
    }
    return arbitrate(candidates);
  }

  /**
   * Resolve this world to exactly one ledger, creating one when none exists.
   * @returns {Promise<{success: boolean, ledger?: object, reason?: string, provisioned?: boolean}>}
   */
  async function ensureSingleLedger() {
    const settled = await liveLedgers();
    if (settled.length === 1) return { success: true, ledger: settled[0] };
    let provisioned = false;
    for (let pass = 0; pass < RESOLUTION_PASSES; pass += 1) {
      const outcome = await resolve();
      provisioned ||= outcome.provisioned === true;
      if (outcome.success) return { ...outcome, provisioned };
      if (outcome.reason !== 'ledger-unsettled') return { ...outcome, provisioned };
    }
    // Exhausting the passes proves only that this client never settled — nothing here has
    // established that two ledgers exist, which is what `ledger-ambiguous` asserts.
    return { ...unsettled(), provisioned };
  }

  return { ensureSingleLedger };
}
