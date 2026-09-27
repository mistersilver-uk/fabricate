/**
 * Companion effect evidence v1: its validation, the effect phase it derives, and the pure effect
 * transitions. Records reach this module already normalized to strict JSON by the record module,
 * which re-observes every record these transitions return.
 */
import { isPlainObject } from '../utils/scalars.js';

/** The closed replay-class set a v1 evidence object names. */
export const COMPANION_REPLAY_CLASSES = Object.freeze([
  'structuredMarker',
  'structuredObserved',
  'idempotentKey',
  'opaqueMacro',
]);

const REPLAY_CLASSES = new Set(COMPANION_REPLAY_CLASSES);
const SUBWRITE_PHASES = new Set(['pending', 'applying', 'applied', 'knownFailure', 'uncertain']);
const EVIDENCE_KEYS = ['evidenceVersion', 'failure', 'replayClass', 'subwrites'];
const SUBWRITE_KEYS = ['failure', 'intent', 'phase', 'receipt', 'subwriteId', 'target'];
const TERMINAL_STATES = new Set(['completed', 'completedWithOmissions']);
const TRANSITION = 'INVALID_COMPANION_EFFECT_TRANSITION';
const STALE = 'COMPANION_OPERATION_STALE_REVISION';
const CHANGE_FIELDS = Object.freeze({
  applying: 'intent',
  applied: 'receipt',
  knownFailure: 'failure',
  uncertain: 'failure',
  effectFailure: 'failure',
});
const SKELETAL_CHANGES = new Set(['applying', 'applied', 'knownFailure']);

/** Invalid companion operation input or persisted evidence, identified by a stable internal code. */
export class CompanionOperationRecordError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CompanionOperationRecordError';
    this.code = code;
  }
}

/**
 * Validate every effect's non-null evidence against v1 and its phase, and that at most one
 * subwrite in the record is applying. A waived effect's evidence is checked for shape only.
 */
export function assertCompanionEffectEvidence(effectStates, code) {
  let applying = 0;
  for (const effect of effectStates) {
    if (effect.evidence === null) continue;
    assertEvidenceShape(effect.evidence, code);
    if (effect.phase !== 'waived' && deriveCompanionEffectPhase(effect.evidence) !== effect.phase) {
      fail('Effect phase contradicts its evidence', code);
    }
    applying += effect.evidence.subwrites.filter(({ phase }) => phase === 'applying').length;
  }
  if (applying > 1) fail('At most one subwrite may be applying', code);
}

/** The effect phase valid v1 evidence derives, in the precedence the data-models spec states. */
export function deriveCompanionEffectPhase(evidence) {
  const phases = evidence.subwrites.map(({ phase }) => phase);
  if (evidence.failure !== null) return 'knownFailure';
  if (phases.includes('uncertain')) return 'reviewRequired';
  if (phases.includes('pending') || phases.includes('applying')) return 'applying';
  if (phases.includes('knownFailure')) return 'knownFailure';
  return 'applied';
}

/** Nonterminal state by blocker precedence: review, failure, awaiting a decision, pending. */
export function deriveNonterminalState(record) {
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

/** Whether a mutation may be in flight: a subwrite applying, or an applying effect without evidence. */
export function hasInFlightCompanionEffect(record) {
  return record.effectStates.some(
    ({ phase, evidence }) =>
      phase === 'applying' &&
      (evidence === null || evidence.subwrites.some((subwrite) => subwrite.phase === 'applying'))
  );
}

/**
 * The next record for one effect change on an observed record, before re-observation. `change`
 * carries `skeleton: { replayClass, subwrites: [{ subwriteId, target }] }` exactly when the
 * effect is still pending.
 */
export function nextEffectTransition(current, input) {
  const { effectId, subwriteId, change, at } = transitionInput(current, input);
  const index = current.plan.effects.findIndex((effect) => effect.effectId === effectId);
  if (index === -1) fail('Unknown companion effect', TRANSITION);
  const slot = current.effectStates[index];
  const evidence =
    change.type === 'effectFailure'
      ? effectFailureEvidence(slot, subwriteId, change)
      : subwriteEvidence(current, slot, subwriteId, change);
  const effectStates = current.effectStates.map((state, position) =>
    position === index ? { ...state, phase: deriveCompanionEffectPhase(evidence), evidence } : state
  );
  const next = { ...current, revision: current.revision + 1, updatedAt: at, effectStates };
  return { ...next, state: deriveNonterminalState(next) };
}

/** The completed record, before re-observation, once every effect of an observed record is applied. */
export function nextCompletedRecord(current, input) {
  const { at } = revisionInput(current, input, ['expectedRevision']);
  if (current.effectStates.some(({ phase }) => phase !== 'applied')) {
    fail('Only a record with every effect applied may complete', TRANSITION);
  }
  const effects = current.plan.effects.map(({ effectId, kind }, index) => ({
    effectId,
    kind,
    subwrites: current.effectStates[index].evidence.subwrites.map(({ subwriteId, receipt }) => ({
      subwriteId,
      receipt,
    })),
  }));
  return {
    ...current,
    state: 'completed',
    revision: current.revision + 1,
    updatedAt: at,
    outcome: { schemaVersion: 1, effects },
  };
}

function assertEvidenceShape(evidence, code) {
  exactKeys(evidence, EVIDENCE_KEYS, 'effect evidence', code);
  if (evidence.evidenceVersion !== 1) fail('Unknown companion effect evidence version', code);
  if (!Array.isArray(evidence.subwrites)) fail('Effect subwrites must be an array', code);
  if (evidence.failure === null) {
    if (!REPLAY_CLASSES.has(evidence.replayClass)) fail('Unknown companion replay class', code);
    if (evidence.subwrites.length === 0) fail('Effect evidence requires a subwrite', code);
  } else {
    objectValue(evidence.failure, 'effect failure', code);
    assertUndottedKeys(evidence.failure, code);
    if (evidence.replayClass !== null || evidence.subwrites.length > 0) {
      fail('A failed effect carries no replay class or subwrites', code);
    }
  }
  const ids = new Set();
  for (const subwrite of evidence.subwrites) {
    exactKeys(subwrite, SUBWRITE_KEYS, 'subwrite', code);
    if (typeof subwrite.subwriteId !== 'string' || !subwrite.subwriteId.trim()) {
      fail('subwriteId must be a nonblank string', code);
    }
    if (ids.has(subwrite.subwriteId)) fail('Subwrite ids must be unique', code);
    ids.add(subwrite.subwriteId);
    objectValue(subwrite.target, 'subwrite target', code);
    if (!SUBWRITE_PHASES.has(subwrite.phase)) fail('Unknown companion subwrite phase', code);
    if (!pairingHolds(subwrite, evidence.replayClass)) {
      fail('Subwrite fields contradict its phase', code);
    }
    for (const field of ['target', 'intent', 'receipt', 'failure']) {
      assertUndottedKeys(subwrite[field], code);
    }
  }
}

/**
 * Refuse any object key holding `.` anywhere in a value: Foundry expands a dotted key on every
 * document write, so a record carrying one could never read back equal to what was sent.
 */
function assertUndottedKeys(value, code) {
  if (Array.isArray(value)) {
    for (const inner of value) assertUndottedKeys(inner, code);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, inner] of Object.entries(value)) {
    if (key.includes('.')) fail('Effect evidence keys may not contain a dot', code);
    assertUndottedKeys(inner, code);
  }
}

function pairingHolds({ phase, intent, receipt, failure }, replayClass) {
  const set = isPlainObject;
  const intentValid = intent === null || set(intent);
  if (!intentValid || (receipt !== null && !set(receipt)) || (failure !== null && !set(failure))) {
    return false;
  }
  if (phase === 'pending') return intent === null && receipt === null && failure === null;
  if (phase === 'applying') return set(intent) && receipt === null && failure === null;
  if (phase === 'knownFailure') return set(failure) && receipt === null;
  if (phase === 'uncertain') return set(intent) && set(failure) && receipt === null;
  if (!set(receipt) || failure !== null) return false;
  return set(intent) || (replayClass === 'idempotentKey' && receipt.result === 'alreadyKnown');
}

function transitionInput(current, input) {
  const keys = ['effectId', 'subwriteId', 'expectedRevision', 'change'];
  const { at } = revisionInput(current, input, keys);
  const { change } = input;
  if (!isPlainObject(change)) fail('A transition requires a change', TRANSITION);
  assertChange(change);
  return { effectId: input.effectId, subwriteId: input.subwriteId, change, at };
}

function revisionInput(current, input, keys) {
  if (!isPlainObject(input)) fail('A transition requires an input object', TRANSITION);
  if (Object.keys(input).some((key) => ![...keys, 'at'].includes(key))) {
    fail('Transition input has unknown fields', TRANSITION);
  }
  if (TERMINAL_STATES.has(current.state)) fail('A terminal record cannot transition', TRANSITION);
  if (input.expectedRevision !== current.revision) {
    fail('Companion operation revision moved', STALE);
  }
  if (current.revision === Number.MAX_SAFE_INTEGER) fail('Revision cannot advance', TRANSITION);
  if (typeof input.at !== 'number' || !Number.isFinite(input.at)) {
    fail('Transition timestamp must be a finite number', TRANSITION);
  }
  return { at: input.at };
}

function effectFailureEvidence(slot, subwriteId, change) {
  if (subwriteId !== null || slot.phase !== 'pending') {
    fail('Only a pending effect may fail as a whole', TRANSITION);
  }
  return { evidenceVersion: 1, replayClass: null, failure: change.failure, subwrites: [] };
}

function subwriteEvidence(current, slot, subwriteId, change) {
  const validFrom =
    (slot.phase === 'pending' && SKELETAL_CHANGES.has(change.type)) ||
    (slot.phase === 'applying' && slot.evidence !== null && !Object.hasOwn(change, 'skeleton'));
  if (!validFrom) fail('This effect cannot take a subwrite change', TRANSITION);
  const evidence = slot.phase === 'pending' ? skeletonEvidence(change.skeleton) : slot.evidence;
  const position = evidence.subwrites.findIndex((entry) => entry.subwriteId === subwriteId);
  if (position === -1) fail('Unknown companion subwrite', TRANSITION);
  const subwrite = evidence.subwrites[position];
  const nextSubwrite = subwriteChange(current, evidence, subwrite, change);
  const subwrites = evidence.subwrites.map((entry, index) =>
    index === position ? nextSubwrite : entry
  );
  return { ...evidence, subwrites };
}

function subwriteChange(current, evidence, subwrite, change) {
  const { phase } = subwrite;
  switch (change.type) {
    case 'applying': {
      if (phase !== 'pending' || hasInFlightCompanionEffect(current)) break;
      return { ...subwrite, phase: 'applying', intent: change.intent };
    }
    case 'applied': {
      if (phase === 'applying') return { ...subwrite, phase: 'applied', receipt: change.receipt };
      if (phase === 'pending' && alreadyKnown(evidence, change.receipt)) {
        return { ...subwrite, phase: 'applied', receipt: change.receipt };
      }
      break;
    }
    case 'knownFailure': {
      if (phase !== 'pending' && phase !== 'applying') break;
      return { ...subwrite, phase: 'knownFailure', failure: change.failure };
    }
    default: {
      if (phase !== 'applying') break;
      return { ...subwrite, phase: 'uncertain', failure: change.failure };
    }
  }
  return fail(`A ${phase} subwrite cannot become ${change.type}`, TRANSITION);
}

function alreadyKnown(evidence, receipt) {
  return evidence.replayClass === 'idempotentKey' && receipt?.result === 'alreadyKnown';
}

function skeletonEvidence(skeleton) {
  exactKeys(skeleton, ['replayClass', 'subwrites'], 'subwrite skeleton', TRANSITION);
  if (!Array.isArray(skeleton.subwrites)) fail('Skeleton subwrites must be an array', TRANSITION);
  const subwrites = skeleton.subwrites.map((entry) => {
    exactKeys(entry, ['subwriteId', 'target'], 'skeleton subwrite', TRANSITION);
    const empty = { phase: 'pending', intent: null, receipt: null, failure: null };
    return { subwriteId: entry.subwriteId, target: entry.target, ...empty };
  });
  return { evidenceVersion: 1, replayClass: skeleton.replayClass, failure: null, subwrites };
}

/** A change is `{ type, <its one field> }`, plus `skeleton` for a change a pending effect takes. */
function assertChange(change) {
  const field = Object.hasOwn(CHANGE_FIELDS, change.type) ? CHANGE_FIELDS[change.type] : null;
  if (!field) fail('Unknown companion effect change', TRANSITION);
  const permitted = SKELETAL_CHANGES.has(change.type) ? [field, 'skeleton'] : [field];
  const keys = Object.keys(change).filter((key) => key !== 'type');
  if (!keys.includes(field) || keys.some((key) => !permitted.includes(key))) {
    fail(`A ${change.type} change has missing or unknown fields`, TRANSITION);
  }
}

function exactKeys(value, keys, label, code) {
  if (!isPlainObject(value)) fail(`${label} must be a plain object`, code);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    fail(`${label} has missing or unknown fields`, code);
  }
}

function objectValue(value, label, code) {
  if (!isPlainObject(value)) fail(`${label} must be a plain object`, code);
}

function fail(message, code) {
  throw new CompanionOperationRecordError(message, code);
}
