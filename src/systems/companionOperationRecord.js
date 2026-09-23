const OPERATION_ID_PATTERN = /^[A-Za-z0-9]{16}$/u;
const RECORD_STATES = new Set([
  'accepted',
  'pending',
  'awaitingDecision',
  'reviewRequired',
  'failed',
  'completed',
  'completedWithOmissions',
]);
const DECISION_STATES = new Set(['pending', 'resolved']);
const EFFECT_PHASES = new Set([
  'pending',
  'applying',
  'applied',
  'knownFailure',
  'reviewRequired',
  'waived',
]);
const TERMINAL_STATES = new Set(['completed', 'completedWithOmissions']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Invalid companion operation input or persisted evidence, identified by a stable internal code. */
export class CompanionOperationRecordError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CompanionOperationRecordError';
    this.code = code;
  }
}

/** Create the immutable accepted snapshot for one validated operation submission. */
export function createCompanionOperationRecord(submission, acceptedAt) {
  const code = 'INVALID_COMPANION_OPERATION_SUBMISSION';
  const input = structuralObject(submission, ['operationId', 'plan'], 'submission', code);
  const operationId = normalizeOperationId(input.operationId, code);
  const plan = normalizePlan(input.plan, code);
  const timestamp = finiteNumber(acceptedAt, 'acceptedAt', code);
  return {
    recordVersion: 1,
    operationId,
    plan,
    state: 'accepted',
    revision: 0,
    decisionStates: plan.decisions.map(({ decisionId }) => ({
      decisionId,
      state: 'pending',
      value: null,
      evidence: null,
    })),
    effectStates: plan.effects.map(({ effectId }) => ({
      effectId,
      phase: 'pending',
      evidence: null,
      waiver: null,
    })),
    outcome: null,
    acceptedAt: timestamp,
    updatedAt: timestamp,
    archive: { hiddenAt: null, hiddenBy: null },
  };
}

/** Validate persisted evidence and return a detached, canonical snapshot. */
export function observeCompanionOperationRecord(value) {
  const code = 'INVALID_COMPANION_OPERATION_RECORD';
  const input = structuralObject(
    value,
    [
      'recordVersion',
      'operationId',
      'plan',
      'state',
      'revision',
      'decisionStates',
      'effectStates',
      'outcome',
      'acceptedAt',
      'updatedAt',
      'archive',
    ],
    'record',
    code
  );
  if (input.recordVersion !== 1) invalid('Unknown companion operation record version', code);
  if (!RECORD_STATES.has(input.state)) invalid('Unknown companion operation state', code);

  const record = {
    recordVersion: 1,
    operationId: normalizeOperationId(input.operationId, code),
    plan: normalizePlan(input.plan, code),
    state: input.state,
    revision: revision(input.revision, code),
    decisionStates: normalizeDecisionStates(input.decisionStates, code),
    effectStates: normalizeEffectStates(input.effectStates, code),
    outcome: normalizeJson(input.outcome, code),
    acceptedAt: finiteNumber(input.acceptedAt, 'acceptedAt', code),
    updatedAt: finiteNumber(input.updatedAt, 'updatedAt', code),
    archive: normalizeArchive(input.archive, code),
  };
  assertSlotIdentity(record, code);
  assertSlotInvariants(record, code);
  assertRecordState(record, code);
  return record;
}

/** Whether two valid plans differ only in object key insertion order. */
export function sameCompanionOperationPlan(left, right) {
  const code = 'INVALID_COMPANION_OPERATION_SUBMISSION';
  return JSON.stringify(normalizePlan(left, code)) === JSON.stringify(normalizePlan(right, code));
}

/** Validate and return one unmodified Foundry operation id. */
export function observeCompanionOperationId(value) {
  return normalizeOperationId(value, 'INVALID_COMPANION_OPERATION_ID');
}

/** Return the first terminal archive transition, or an unchanged detached snapshot on repetition. */
export function archiveCompanionOperationRecord(record, { hiddenBy, hiddenAt } = {}) {
  const current = observeCompanionOperationRecord(record);
  if (!TERMINAL_STATES.has(current.state)) {
    invalid(
      'Only a terminal companion operation may be archived',
      'COMPANION_OPERATION_NOT_TERMINAL'
    );
  }
  if (current.archive.hiddenAt !== null) return current;
  const code = 'INVALID_COMPANION_OPERATION_ARCHIVE';
  if (current.revision === Number.MAX_SAFE_INTEGER) {
    invalid('Companion operation revision cannot advance', code);
  }
  const next = {
    ...current,
    revision: current.revision + 1,
    updatedAt: finiteNumber(hiddenAt, 'hiddenAt', code),
    archive: {
      hiddenAt: finiteNumber(hiddenAt, 'hiddenAt', code),
      hiddenBy: nonblankString(hiddenBy, 'hiddenBy', code),
    },
  };
  return observeCompanionOperationRecord(next);
}

function normalizePlan(value, code) {
  const plan = structuralObject(
    value,
    ['schemaVersion', 'source', 'decisions', 'effects'],
    'plan',
    code
  );
  if (plan.schemaVersion !== 1) invalid('Unknown companion operation plan version', code);
  const source = structuralObject(
    plan.source,
    ['namespace', 'occurrenceId', 'kind'],
    'source',
    code
  );
  const decisions = mapDenseArray(plan.decisions, 'decisions', code, (entry) => {
    const decision = structuralObject(entry, ['decisionId', 'kind', 'payload'], 'decision', code);
    return {
      decisionId: nonblankString(decision.decisionId, 'decisionId', code),
      kind: nonblankString(decision.kind, 'decision kind', code),
      payload: normalizeJson(decision.payload, code),
    };
  });
  assertUnique(
    decisions.map(({ decisionId }) => decisionId),
    'decision ids',
    code
  );
  const decisionIds = new Set(decisions.map(({ decisionId }) => decisionId));
  const effects = mapDenseArray(plan.effects, 'effects', code, (entry) => {
    const effect = structuralObject(
      entry,
      ['effectId', 'kind', 'payload', 'requiresDecisionIds'],
      'effect',
      code
    );
    const requiresDecisionIds = mapDenseArray(
      effect.requiresDecisionIds,
      'decision dependencies',
      code,
      (decisionId) => nonblankString(decisionId, 'decision dependency', code)
    );
    if (requiresDecisionIds.some((decisionId) => !decisionIds.has(decisionId))) {
      invalid('Effect names an undeclared decision', code);
    }
    return {
      effectId: nonblankString(effect.effectId, 'effectId', code),
      kind: nonblankString(effect.kind, 'effect kind', code),
      payload: normalizeJson(effect.payload, code),
      requiresDecisionIds,
    };
  });
  assertUnique(
    effects.map(({ effectId }) => effectId),
    'effect ids',
    code
  );
  return {
    decisions,
    effects,
    schemaVersion: 1,
    source: {
      kind: nonblankString(source.kind, 'source kind', code),
      namespace: nonblankString(source.namespace, 'source namespace', code),
      occurrenceId: nonblankString(source.occurrenceId, 'source occurrenceId', code),
    },
  };
}

function normalizeDecisionStates(value, code) {
  return mapDenseArray(value, 'decision states', code, (entry) => {
    const slot = structuralObject(
      entry,
      ['decisionId', 'state', 'value', 'evidence'],
      'decision state',
      code
    );
    if (!DECISION_STATES.has(slot.state)) invalid('Unknown companion decision state', code);
    return {
      decisionId: nonblankString(slot.decisionId, 'decisionId', code),
      state: slot.state,
      value: normalizeJson(slot.value, code),
      evidence: normalizeJson(slot.evidence, code),
    };
  });
}

function normalizeEffectStates(value, code) {
  return mapDenseArray(value, 'effect states', code, (entry) => {
    const slot = structuralObject(
      entry,
      ['effectId', 'phase', 'evidence', 'waiver'],
      'effect state',
      code
    );
    if (!EFFECT_PHASES.has(slot.phase)) invalid('Unknown companion effect phase', code);
    return {
      effectId: nonblankString(slot.effectId, 'effectId', code),
      phase: slot.phase,
      evidence: normalizeJson(slot.evidence, code),
      waiver: normalizeWaiver(slot.waiver, code),
    };
  });
}

function normalizeWaiver(value, code) {
  if (value === null) return null;
  const waiver = structuralObject(value, ['userId', 'at', 'reason'], 'waiver', code);
  return {
    userId: nonblankString(waiver.userId, 'waiver userId', code),
    at: finiteNumber(waiver.at, 'waiver timestamp', code),
    reason: nonblankString(waiver.reason, 'waiver reason', code),
  };
}

function normalizeArchive(value, code) {
  const archive = structuralObject(value, ['hiddenAt', 'hiddenBy'], 'archive', code);
  if (archive.hiddenAt === null && archive.hiddenBy === null) {
    return { hiddenAt: null, hiddenBy: null };
  }
  if (archive.hiddenAt === null || archive.hiddenBy === null) {
    invalid('Archive metadata must be present as one pair', code);
  }
  return {
    hiddenAt: finiteNumber(archive.hiddenAt, 'archive timestamp', code),
    hiddenBy: nonblankString(archive.hiddenBy, 'archive user', code),
  };
}

function assertSlotIdentity(record, code) {
  if (record.decisionStates.length !== record.plan.decisions.length) {
    invalid('Decision slots do not match the accepted plan', code);
  }
  if (record.effectStates.length !== record.plan.effects.length) {
    invalid('Effect slots do not match the accepted plan', code);
  }
  for (const [index, decision] of record.plan.decisions.entries()) {
    if (record.decisionStates[index].decisionId !== decision.decisionId) {
      invalid('Decision slots are not in accepted-plan order', code);
    }
  }
  for (const [index, effect] of record.plan.effects.entries()) {
    if (record.effectStates[index].effectId !== effect.effectId) {
      invalid('Effect slots are not in accepted-plan order', code);
    }
  }
}

function assertSlotInvariants(record, code) {
  for (const decision of record.decisionStates) {
    const pending = decision.state === 'pending';
    if (pending !== (decision.value === null && decision.evidence === null)) {
      invalid('Decision value and evidence contradict its state', code);
    }
    if (!pending && (decision.value === null || decision.evidence === null)) {
      invalid('Resolved decisions require saved value and evidence', code);
    }
  }
  for (const effect of record.effectStates) {
    if (effect.phase === 'pending' && (effect.evidence !== null || effect.waiver !== null)) {
      invalid('Pending effects cannot carry evidence or a waiver', code);
    }
    if (
      ['applied', 'knownFailure', 'reviewRequired'].includes(effect.phase) &&
      effect.evidence === null
    ) {
      invalid('Settled or blocked effects require durable evidence', code);
    }
    if ((effect.phase === 'waived') !== (effect.waiver !== null)) {
      invalid('An effect waiver must agree with the waived phase', code);
    }
  }
  const decisions = new Map(record.decisionStates.map((slot) => [slot.decisionId, slot]));
  for (const [index, effect] of record.plan.effects.entries()) {
    const hasPendingDependency = effect.requiresDecisionIds.some(
      (decisionId) => decisions.get(decisionId)?.state === 'pending'
    );
    if (hasPendingDependency && !['pending', 'waived'].includes(record.effectStates[index].phase)) {
      invalid('An unresolved dependency cannot have an attempted effect', code);
    }
  }
}

function assertRecordState(record, code) {
  if (record.state === 'accepted') {
    assertAcceptedState(record, code);
    return;
  }
  if (record.revision === 0) invalid('A non-initial record requires a positive revision', code);
  if (record.archive.hiddenAt !== null && !TERMINAL_STATES.has(record.state)) {
    invalid('Only terminal records may be archived', code);
  }
  if (TERMINAL_STATES.has(record.state)) {
    assertTerminalState(record, code);
    return;
  }
  if (record.outcome !== null) invalid('A nonterminal record cannot carry an outcome', code);
  const expected = expectedNonterminalState(record);
  if (record.state !== expected) invalid('Record state contradicts its effect blockers', code);
}

function assertAcceptedState(record, code) {
  const allPending =
    record.revision === 0 &&
    record.acceptedAt === record.updatedAt &&
    record.outcome === null &&
    record.archive.hiddenAt === null &&
    record.archive.hiddenBy === null &&
    record.decisionStates.every(
      (slot) => slot.state === 'pending' && slot.value === null && slot.evidence === null
    ) &&
    record.effectStates.every(
      (slot) => slot.phase === 'pending' && slot.evidence === null && slot.waiver === null
    );
  if (!allPending) invalid('Accepted state must be the exact initial snapshot', code);
}

function expectedNonterminalState(record) {
  if (record.effectStates.some(({ phase }) => phase === 'reviewRequired')) return 'reviewRequired';
  if (record.effectStates.some(({ phase }) => phase === 'knownFailure')) return 'failed';
  const decisions = new Map(record.decisionStates.map((slot) => [slot.decisionId, slot.state]));
  const awaitsDecision = record.plan.effects.some(
    (effect, index) =>
      record.effectStates[index].phase === 'pending' &&
      effect.requiresDecisionIds.some((decisionId) => decisions.get(decisionId) === 'pending')
  );
  const applying = record.effectStates.some(({ phase }) => phase === 'applying');
  return awaitsDecision && !applying ? 'awaitingDecision' : 'pending';
}

function assertTerminalState(record, code) {
  if (record.outcome === null) invalid('Terminal records require a saved outcome', code);
  const phases = record.effectStates.map(({ phase }) => phase);
  if (record.state === 'completed' && phases.some((phase) => phase !== 'applied')) {
    invalid('Completed records require every effect applied', code);
  }
  if (
    record.state === 'completedWithOmissions' &&
    (!phases.includes('waived') || phases.some((phase) => !['applied', 'waived'].includes(phase)))
  ) {
    invalid('Completed-with-omissions records require applied or waived effects', code);
  }
  const decisions = new Map(record.decisionStates.map((slot) => [slot.decisionId, slot.state]));
  for (const [index, effect] of record.plan.effects.entries()) {
    if (
      record.effectStates[index].phase === 'applied' &&
      effect.requiresDecisionIds.some((decisionId) => decisions.get(decisionId) !== 'resolved')
    ) {
      invalid('Applied effects require every declared decision', code);
    }
  }
}

function normalizeJson(value, code, active = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return finiteNumber(value, 'JSON number', code);
  if (typeof value !== 'object') invalid('Value is not strict JSON data', code);
  if (active.has(value)) invalid('Strict JSON data cannot contain a cycle', code);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      return mapDenseArray(value, 'JSON array', code, (entry) =>
        normalizeJson(entry, code, active)
      );
    }
    const descriptors = plainDataDescriptors(value, 'JSON object', code);
    const normalized = {};
    for (const key of Object.keys(descriptors).sort((left, right) => left.localeCompare(right))) {
      if (UNSAFE_KEYS.has(key)) invalid('Unsafe JSON object key', code);
      normalized[key] = normalizeJson(descriptors[key].value, code, active);
    }
    return normalized;
  } finally {
    active.delete(value);
  }
}

function mapDenseArray(value, label, code, transform) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalid(`${label} must be an array`, code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
    invalid(`${label} cannot have symbol properties`, code);
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length') continue;
    if (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
      invalid(`${label} cannot have extra properties`, code);
    }
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      invalid(`${label} cannot contain accessors or hidden values`, code);
    }
  }
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(descriptors, String(index))) invalid(`${label} must be dense`, code);
    result.push(transform(descriptors[index].value, index));
  }
  return result;
}

function structuralObject(value, expectedKeys, label, code) {
  const descriptors = plainDataDescriptors(value, label, code);
  const compare = (left, right) => left.localeCompare(right);
  const keys = Object.keys(descriptors).sort(compare);
  const expected = [...expectedKeys].sort(compare);
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    invalid(`${label} has missing or unknown fields`, code);
  }
  return Object.fromEntries(expectedKeys.map((key) => [key, descriptors[key].value]));
}

function plainDataDescriptors(value, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be a plain object`, code);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid(`${label} must be a plain object`, code);
  }
  if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
    invalid(`${label} cannot have symbol properties`, code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      invalid(`${label} cannot contain accessors or hidden values`, code);
    }
  }
  return descriptors;
}

function normalizeOperationId(value, code) {
  if (typeof value !== 'string' || !OPERATION_ID_PATTERN.test(value)) {
    invalid('operationId must be one unmodified Foundry id', code);
  }
  return value;
}

function nonblankString(value, label, code) {
  if (typeof value !== 'string' || !value.trim())
    invalid(`${label} must be a nonblank string`, code);
  return value;
}

function finiteNumber(value, label, code) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`${label} must be a finite number`, code);
  }
  return Object.is(value, -0) ? 0 : value;
}

function revision(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) {
    invalid('revision must be a non-negative safe integer', code);
  }
  return value;
}

function assertUnique(values, label, code) {
  if (new Set(values).size !== values.length) invalid(`${label} must be unique`, code);
}

function invalid(message, code) {
  throw new CompanionOperationRecordError(message, code);
}
