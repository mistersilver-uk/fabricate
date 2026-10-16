/**
 * One world's journal-run ledger held in memory, shared by every realm `realm()` builds over it:
 * the real `createJournalRunAuthority` with adapters that model the server's exclusive claim page.
 */
import {
  JOURNAL_RUN_CLAIM_PAGE_ID,
  createJournalRunAuthority,
} from '../../src/systems/journalRunAuthority.js';

export function sharedAuthorityWorld() {
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
      // The ledger listing is the one adapter call no authority body wraps in a try/catch, so
      // this is the seam that drives a genuine CHAIN rejection rather than a handled failure.
      beforeList = null,
      queueWaitMs = undefined,
      // The server copy of one ledger; the fake's single store is already authoritative.
      readAuthoritativeLedger = async (ledgerId) =>
        server.has(ledgerId)
          ? { status: 'available', ledger: server.get(ledgerId) }
          : { status: 'unavailable' },
      hasLedgerEvidence = null,
    } = {}
  ) =>
    createJournalRunAuthority({
      currentUser: getCurrentUser,
      activeGM: getActiveGM,
      listLedgers: async () => {
        await beforeList?.();
        return [...server.values()];
      },
      listLedgerRecords,
      canCreateLedger,
      createLedger: async (source) => {
        await beforeCreate?.();
        const ledger = addLedger(source.state);
        ledger.source = source;
        log.push(['create', structuredClone(source)]);
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
      queueWaitMs,
      readAuthoritativeLedger,
      hasLedgerEvidence,
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
