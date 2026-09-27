import { forcedReplacementEntry } from '../config/flags.js';

import {
  CompanionOperationRecordError,
  archiveCompanionOperationRecord,
  completeCompanionOperationRecord,
  createCompanionOperationRecord,
  observeCompanionOperationId,
  observeCompanionOperationRecord,
  sameCompanionOperationPlan,
  transitionCompanionOperationEffect,
} from './companionOperationRecord.js';

const FLAG_SCOPE = 'fabricate';
const FLAG_KEY = 'companionOperationRecord';

/** Dotted Foundry update key for the persisted operation record. */
export const COMPANION_OPERATION_RECORD_FLAG = `flags.${FLAG_SCOPE}.${FLAG_KEY}`;

/**
 * Create the internal Journal adapter for accepting, reading, transitioning and archiving records.
 * The authoritative reader is the only read source; the live ledger is used only for writes.
 */
export function createCompanionOperationStore({ ledger, readAuthoritativeLedger, clock }) {
  return Object.freeze(new CompanionOperationStore({ ledger, readAuthoritativeLedger, clock }));
}

class CompanionOperationStore {
  constructor({ ledger, readAuthoritativeLedger, clock }) {
    const ledgerId = ledger?.id ?? ledger?._id;
    if (!ledgerId || typeof readAuthoritativeLedger !== 'function' || typeof clock !== 'function') {
      throw new TypeError(
        'Companion operation store requires a ledger, authoritative reader and clock'
      );
    }
    if (
      typeof ledger.createEmbeddedDocuments !== 'function' ||
      typeof ledger.updateEmbeddedDocuments !== 'function'
    ) {
      throw new TypeError('Companion operation ledger does not support embedded document writes');
    }
    this.ledger = ledger;
    this.ledgerId = ledgerId;
    this.readAuthoritativeLedger = readAuthoritativeLedger;
    this.clock = clock;
  }

  async readStored(operationId) {
    let answer;
    try {
      answer = await this.readAuthoritativeLedger(this.ledgerId);
    } catch {
      return { kind: 'unavailable' };
    }
    if (answer?.status !== 'available' || !answer.ledger) return { kind: 'unavailable' };
    const authoritativeId = answer.ledger.id ?? answer.ledger._id;
    if (authoritativeId !== this.ledgerId || typeof answer.ledger.pages?.get !== 'function') {
      return { kind: 'unavailable' };
    }
    const foundPage = answer.ledger.pages.get(operationId) ?? null;
    if (!foundPage) return { kind: 'absent' };
    if ((foundPage.id ?? foundPage._id) !== operationId) return { kind: 'invalid' };
    const record = recordFromPage(foundPage);
    if (!record || record.operationId !== operationId) return { kind: 'invalid' };
    return { kind: 'found', record };
  }

  async accept(submission) {
    let intended;
    try {
      intended = createCompanionOperationRecord(submission, this.clock());
    } catch (error) {
      if (error instanceof CompanionOperationRecordError) return { status: 'invalidInput' };
      return { status: 'invalidInput' };
    }

    const before = await this.readStored(intended.operationId);
    if (before.kind === 'found') return classifyExisting(before.record, intended.plan);
    if (before.kind === 'invalid') return { status: 'invalidStored' };
    if (before.kind !== 'absent') return { status: 'unavailable' };

    let created;
    try {
      created = await this.ledger.createEmbeddedDocuments(
        'JournalEntryPage',
        [operationPageSource(intended)],
        { keepId: true }
      );
    } catch {
      return reconcileAcceptance((id) => this.readStored(id), intended);
    }
    const returned = verifiedReturnedRecord(created, intended.operationId);
    if (returned && recordsEqual(returned, intended)) return result('accepted', returned);
    return reconcileAcceptance((id) => this.readStored(id), intended);
  }

  async read(operationId) {
    let id;
    try {
      id = observeCompanionOperationId(operationId);
    } catch {
      return { status: 'invalidInput' };
    }
    const stored = await this.readStored(id);
    if (stored.kind === 'found') return result('found', stored.record);
    if (stored.kind === 'absent') return { status: 'notFound' };
    if (stored.kind === 'invalid') return { status: 'invalidStored' };
    return { status: 'unavailable' };
  }

  async archive(operationId, hiddenBy) {
    let id;
    let hiddenAt;
    try {
      id = observeCompanionOperationId(operationId);
      if (typeof hiddenBy !== 'string' || !hiddenBy.trim()) throw new TypeError('invalid user');
      hiddenAt = this.clock();
      if (typeof hiddenAt !== 'number' || !Number.isFinite(hiddenAt)) {
        throw new TypeError('invalid clock');
      }
    } catch {
      return { status: 'invalidInput' };
    }
    const stored = await this.readStored(id);
    if (stored.kind === 'absent') return { status: 'notFound' };
    if (stored.kind === 'invalid') return { status: 'invalidStored' };
    if (stored.kind !== 'found') return { status: 'unavailable' };
    if (stored.record.archive.hiddenAt !== null) return result('duplicate', stored.record);

    let next;
    try {
      next = archiveCompanionOperationRecord(stored.record, { hiddenBy, hiddenAt });
    } catch (error) {
      if (error instanceof CompanionOperationRecordError) return { status: 'invalidInput' };
      return { status: 'invalidInput' };
    }
    let updated;
    try {
      updated = await this.ledger.updateEmbeddedDocuments('JournalEntryPage', [
        { _id: id, [COMPANION_OPERATION_RECORD_FLAG]: next },
      ]);
    } catch {
      return reconcileArchive((recordId) => this.readStored(recordId), next);
    }
    const returned = verifiedReturnedRecord(updated, id);
    if (returned && recordsEqual(returned, next)) return result('archived', returned);
    return reconcileArchive((recordId) => this.readStored(recordId), next);
  }

  /** Persist one effect change; input is the record transition's without `at`. */
  async transitionEffect(operationId, input) {
    return this.writeTransition(operationId, input, transitionCompanionOperationEffect);
  }

  /** Persist completion of a record whose every effect is applied; input `{ expectedRevision }`. */
  async complete(operationId, input) {
    return this.writeTransition(operationId, input, completeCompanionOperationRecord);
  }

  /**
   * Read authoritatively, refuse a moved revision as `stale`, then replace the record flag
   * wholesale. Read-then-write, not compare-and-set: the held run claim serializes writers.
   */
  async writeTransition(operationId, input, transition) {
    let id;
    let at;
    try {
      id = observeCompanionOperationId(operationId);
      if (!input || typeof input !== 'object') throw new TypeError('invalid input');
      at = this.clock();
    } catch {
      return { status: 'invalidInput' };
    }
    const stored = await this.readStored(id);
    if (stored.kind === 'absent') return { status: 'notFound' };
    if (stored.kind === 'invalid') return { status: 'invalidStored' };
    if (stored.kind !== 'found') return { status: 'unavailable' };
    const { expectedRevision } = input;
    if (stored.record.revision !== expectedRevision) return result('stale', stored.record);

    let next;
    try {
      next = transition(stored.record, { ...input, at });
    } catch (error) {
      if (!(error instanceof CompanionOperationRecordError)) return { status: 'invalidInput' };
      return result('invalidTransition', stored.record);
    }
    const [path, value] = forcedReplacementEntry(`flags.${FLAG_SCOPE}`, FLAG_KEY, next);
    const reconcile = () =>
      reconcileTransition((recordId) => this.readStored(recordId), next, expectedRevision);
    let updated;
    try {
      updated = await this.ledger.updateEmbeddedDocuments('JournalEntryPage', [
        { _id: id, [path]: value },
      ]);
    } catch {
      return reconcile();
    }
    const returned = verifiedReturnedRecord(updated, id);
    if (returned && recordsEqual(returned, next)) return result('updated', returned);
    return reconcile();
  }
}

function operationPageSource(record) {
  return {
    _id: record.operationId,
    name: `Fabricate Companion Operation ${record.operationId}`,
    type: 'text',
    text: { content: '', format: 1 },
    flags: { [FLAG_SCOPE]: { [FLAG_KEY]: record } },
  };
}

function recordFromPage(page) {
  try {
    const value =
      typeof page?.getFlag === 'function'
        ? page.getFlag(FLAG_SCOPE, FLAG_KEY)
        : page?.flags?.[FLAG_SCOPE]?.[FLAG_KEY];
    return observeCompanionOperationRecord(value);
  } catch {
    return null;
  }
}

function verifiedReturnedRecord(documents, operationId) {
  if (!Array.isArray(documents) || documents.length !== 1) return null;
  const returned = documents[0];
  if ((returned?.id ?? returned?._id) !== operationId) return null;
  const record = recordFromPage(returned);
  return record?.operationId === operationId ? record : null;
}

async function reconcileAcceptance(readStored, intended) {
  const stored = await readStored(intended.operationId);
  if (stored.kind === 'found') return classifyExisting(stored.record, intended.plan);
  if (stored.kind === 'invalid') return { status: 'invalidStored' };
  return { status: 'unavailable' };
}

function classifyExisting(record, intendedPlan) {
  return sameCompanionOperationPlan(record.plan, intendedPlan)
    ? result('duplicate', record)
    : result('conflict', record);
}

async function reconcileArchive(readStored, intended) {
  const stored = await readStored(intended.operationId);
  if (stored.kind === 'invalid') return { status: 'invalidStored' };
  if (stored.kind !== 'found') return { status: 'unavailable' };
  if (recordsEqual(stored.record, intended)) return result('archived', stored.record);
  if (stored.record.archive.hiddenAt !== null) return result('duplicate', stored.record);
  return { status: 'unavailable' };
}

async function reconcileTransition(readStored, intended, expectedRevision) {
  const stored = await readStored(intended.operationId);
  if (stored.kind === 'invalid') return { status: 'invalidStored' };
  if (stored.kind !== 'found') return { status: 'unavailable' };
  if (recordsEqual(stored.record, intended)) return result('updated', stored.record);
  if (stored.record.revision !== expectedRevision) return result('stale', stored.record);
  return { status: 'unavailable' };
}

function recordsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function result(status, record) {
  return { status, record: observeCompanionOperationRecord(record) };
}
