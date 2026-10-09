import { createJournalRunAuthority } from '../../src/systems/journalRunAuthority.js';

/**
 * A real Journal run authority for one elected GM over an in-memory ledger. `readable` collects
 * every document a replicated flag would carry, `state()` reads the ledger's current state and
 * `now` is the authority's clock. `electedGM` answers the elected GM on each read, for a suite in
 * which the election moves.
 */
export function replicatedAuthorityFixture({ now = () => Date.now(), electedGM = null } = {}) {
  let ledger = null;
  let sequence = 0;
  const readable = [];
  const gm = { id: 'gm', isGM: true };
  const elected = electedGM ?? (() => gm);
  const authority = createJournalRunAuthority({
    currentUser: elected,
    activeGM: elected,
    listLedgers: async () => (ledger ? [ledger] : []),
    listLedgerRecords: async () => (ledger ? [{ id: ledger.id, createdTime: 1 }] : []),
    createLedger: async (source) => {
      readable.push(structuredClone(source));
      ledger = { id: 'ledger', state: structuredClone(source.state), claim: null };
      return ledger;
    },
    readState: async () => structuredClone(ledger.state),
    writeState: async (_entry, state) => {
      readable.push(structuredClone(state));
      ledger.state = structuredClone(state);
    },
    createClaim: async (_entry, source) => {
      if (ledger.claim) throw new Error('claim-held');
      ledger.claim = structuredClone(source);
      return ledger.claim;
    },
    readClaim: async () => ledger.claim,
    deleteClaim: async (_entry, claimId) => {
      if (ledger.claim?.claimId !== claimId) return false;
      ledger.claim = null;
      return true;
    },
    reconstructExecutions: async () => ({ success: true }),
    randomId: () => `private-${++sequence}`,
    now,
  });
  return { authority, readable, state: () => structuredClone(ledger.state) };
}
