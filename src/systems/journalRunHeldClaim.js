/**
 * The held-claim context a Journal authority handler proves its claim with, and the Foundry
 * server reads it rests on. Split from `journalRunAuthority.js` so the claim's verification
 * reads as one unit.
 */

/**
 * The server's copy of one ledger, in the one shape the operation store reads: never a cached
 * collection, and never a throw, so an unanswered read is only ever `unavailable`.
 */
export async function readLedgerAuthoritatively(readAuthoritativeLedger, ledgerId) {
  if (typeof readAuthoritativeLedger !== 'function' || !ledgerId) return { status: 'unavailable' };
  let answer;
  try {
    answer = await readAuthoritativeLedger(ledgerId);
  } catch {
    return { status: 'unavailable' };
  }
  const ledger = answer?.status === 'available' ? answer.ledger : null;
  if (!ledger || (ledger.id ?? ledger._id) !== ledgerId) return { status: 'unavailable' };
  return { status: 'available', ledger };
}

/**
 * `claimStillHeld` answers from the SERVER copy of the exact ledger the claim was taken on: the
 * same claim page, claim id and request id, and this realm still the elected GM User. A moved,
 * missing, unreadable or replaced claim is `false`. The claim id names the attempt; no timestamp
 * establishes ownership, and a check cannot stop a mutation already in flight, so a caller checks
 * before each next step rather than after.
 * @param {object} deps.writer The claimed ledger writer; a swapped or lost ledger is not held.
 * @param {Function} deps.isElected `() => boolean` for this realm's User.
 */
export function createHeldClaimContext({
  writer,
  claimId,
  requestId,
  readAuthoritativeLedger,
  readClaim,
  isElected,
}) {
  const ledger = writer.ledger;
  const ledgerId = ledger?.id ?? ledger?._id ?? null;
  const read = (id) => readLedgerAuthoritatively(readAuthoritativeLedger, id);
  async function claimStillHeld() {
    if (writer.ledger !== ledger || !writer.held || writer.lockLost || !isElected()) return false;
    const answer = await read(ledgerId);
    if (answer.status !== 'available') return false;
    let claim;
    try {
      claim = await readClaim(answer.ledger);
    } catch {
      return false;
    }
    if (claim?.claimId !== claimId || claim?.requestId !== requestId) return false;
    // Election is read again after the awaited read, since it can move while the read is out.
    return isElected();
  }
  return Object.freeze({
    ledger,
    claimId,
    requestId,
    readAuthoritativeLedger: read,
    claimStillHeld,
  });
}

function pageCount(entry) {
  const size = entry?.pages?.size;
  return Number.isInteger(size) && size >= 0 ? size : null;
}

/**
 * The Foundry reads over `authoritativeEntries(query)`, the GM-only server `get` that answers
 * `null` when it could not be performed.
 */
export function createFoundryLedgerReads(authoritativeEntries) {
  const serverEntry = async (ledgerId) => {
    const entries = await authoritativeEntries({ _id: ledgerId });
    if (entries === null) return null;
    return entries.find((candidate) => (candidate?._id ?? candidate?.id) === ledgerId) ?? false;
  };
  return {
    /** One ledger's server copy, pages expanded, or `unavailable`. */
    readAuthoritativeLedger: async (ledgerId) => {
      const entry = await serverEntry(ledgerId);
      return entry ? { status: 'available', ledger: entry } : { status: 'unavailable' };
    },
    /**
     * Whether a ledger holds any embedded page, live or on the server: an operation record
     * (valid or not) or a page nothing here recognises. An uncountable page collection is
     * evidence; an unanswered server read is `null`, which never authorises a deletion.
     */
    hasLedgerEvidence: async (entry) => {
      if (pageCount(entry) !== 0) return true;
      const server = await serverEntry(entry?.id ?? entry?._id);
      if (server === null) return null;
      // A ledger the server no longer has carries nothing left to lose.
      return server !== false && pageCount(server) !== 0;
    },
  };
}
