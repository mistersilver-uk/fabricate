import { incrementRunRevision, RunLifecycleError } from './runLifecycleState.js';

const JOURNAL_STATUSES = new Set(['planned', 'committed', 'recoveryRequired']);
const EFFECT_PHASES = new Set(['planned', 'applying', 'applied']);

export class RunExecutionJournalError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RunExecutionJournalError';
    this.code = code;
  }
}

export function observeExecutionJournal(journal) {
  return normalizeJournal(journal);
}

export function getCommittedExecutionOutcome(journal, requestId) {
  const current = normalizeJournal(journal);
  if (current.status !== 'committed' || current.requestId !== String(requestId ?? '').trim()) {
    return null;
  }
  return cloneJson(current.outcome);
}

export function transitionExecutionJournal(journal, transition = {}) {
  if (transition.type === 'plan') return createPlan(journal, transition.plan);

  const current = normalizeJournal(journal);
  if (transition.type === 'reconstructAfterReload') return reconstructAfterReload(current);
  if (transition.type === 'recoveryRequired') return requireRecovery(current);
  assertUnsettled(current);

  switch (transition.type) {
    case 'effectApplying':
      return markEffectApplying(current, transition.effectId);
    case 'effectApplied':
      return markEffectApplied(current, transition);
    case 'commit':
      return commitJournal(current, transition.outcome);
    default:
      throw journalError('Unknown execution journal transition', 'INVALID_JOURNAL_TRANSITION');
  }
}

export async function persistExecutionJournalTransition(location, transition, options = {}) {
  if (!location) return null;
  location.assertMutation({ ...options, currentOnly: true, allowExecutionJournal: true });
  assertPlanRevision(location.run, transition);
  const nextJournal = transitionExecutionJournal(location.run.executionJournal, transition);
  if (JSON.stringify(nextJournal) === JSON.stringify(location.run.executionJournal)) {
    return location.run;
  }
  location.run.executionJournal = nextJournal;
  incrementRunRevision(location.run);
  return location.persist();
}

function createPlan(existing, plan) {
  if (
    existing !== null &&
    existing !== undefined &&
    normalizeJournal(existing).status !== 'committed'
  ) {
    throw journalError('A run already has an execution journal', 'JOURNAL_EXISTS');
  }
  const input = plan && typeof plan === 'object' ? plan : {};
  const effects = Array.isArray(input.effects)
    ? input.effects.map((effect) => ({
        effectId: requiredId(effect?.effectId, 'effectId'),
        kind: requiredId(effect?.kind, 'kind'),
        planned: cloneJson(effect?.planned) ?? null,
        phase: 'planned',
      }))
    : [];
  assertUniqueEffectIds(effects);
  return normalizeJournal({
    operationId: requiredId(input.operationId, 'operationId'),
    requestId: requiredId(input.requestId, 'requestId'),
    baseRunRevision: revision(input.baseRunRevision),
    status: 'planned',
    intent: cloneJson(input.intent) ?? null,
    effects,
  });
}

function markEffectApplying(journal, effectId) {
  if (journal.effects.some((effect) => effect.phase === 'applying')) {
    throw journalError('Only one effect may be applying', 'INVALID_EFFECT_TRANSITION');
  }
  const index = journal.effects.findIndex((effect) => effect.effectId === effectId);
  const nextIndex = journal.effects.findIndex((effect) => effect.phase === 'planned');
  if (index < 0 || index !== nextIndex) {
    throw journalError('Effects must apply in planned order', 'INVALID_EFFECT_TRANSITION');
  }
  journal.effects[index].phase = 'applying';
  return normalizeJournal(journal);
}

function markEffectApplied(journal, transition) {
  const effect = journal.effects.find((entry) => entry.effectId === transition.effectId);
  if (
    !effect ||
    effect.phase !== 'applying' ||
    !Object.hasOwn(transition, 'receipt') ||
    transition.receipt === undefined
  ) {
    throw journalError(
      'Only the applying effect may record an actual receipt',
      'INVALID_EFFECT_TRANSITION'
    );
  }
  effect.phase = 'applied';
  effect.receipt = cloneJson(transition.receipt);
  return normalizeJournal(journal);
}

function commitJournal(journal, outcome) {
  if (journal.effects.some((effect) => effect.phase !== 'applied')) {
    throw journalError('Every effect must be applied before commit', 'INCOMPLETE_EFFECTS');
  }
  journal.status = 'committed';
  if (outcome !== undefined) journal.outcome = cloneJson(outcome);
  return normalizeJournal(journal);
}

function reconstructAfterReload(journal) {
  if (journal.status !== 'planned') return journal;
  if (journal.effects.some((effect) => effect.phase === 'applying')) {
    journal.status = 'recoveryRequired';
  }
  return normalizeJournal(journal);
}

function requireRecovery(journal) {
  if (journal.status === 'committed') {
    throw journalError('A committed journal cannot require recovery', 'JOURNAL_SETTLED');
  }
  journal.status = 'recoveryRequired';
  return normalizeJournal(journal);
}

function normalizeJournal(value) {
  if (!value || typeof value !== 'object') {
    throw journalError('Execution journal is missing', 'INVALID_EXECUTION_JOURNAL');
  }
  const status = JOURNAL_STATUSES.has(value.status) ? value.status : null;
  if (!status || !Array.isArray(value.effects)) {
    throw journalError('Execution journal has an invalid shape', 'INVALID_EXECUTION_JOURNAL');
  }
  const journal = {
    operationId: requiredId(value.operationId, 'operationId'),
    requestId: requiredId(value.requestId, 'requestId'),
    baseRunRevision: revision(value.baseRunRevision),
    status,
    intent: cloneJson(value.intent) ?? null,
    effects: value.effects.map(normalizeEffect),
  };
  if (Object.hasOwn(value, 'outcome')) journal.outcome = cloneJson(value.outcome);
  assertUniqueEffectIds(journal.effects);
  assertEffectOrder(journal);
  if (status === 'committed' && journal.effects.some((effect) => effect.phase !== 'applied')) {
    throw journalError('Committed journal has incomplete effects', 'INVALID_EXECUTION_JOURNAL');
  }
  return journal;
}

function normalizeEffect(effect) {
  if (!effect || typeof effect !== 'object' || !EFFECT_PHASES.has(effect.phase)) {
    throw journalError(
      'Execution journal effect has an invalid shape',
      'INVALID_EXECUTION_JOURNAL'
    );
  }
  const normalized = {
    effectId: requiredId(effect.effectId, 'effectId'),
    kind: requiredId(effect.kind, 'kind'),
    planned: cloneJson(effect.planned) ?? null,
    phase: effect.phase,
  };
  if (Object.hasOwn(effect, 'receipt')) normalized.receipt = cloneJson(effect.receipt);
  if (effect.phase === 'applied' && !Object.hasOwn(normalized, 'receipt')) {
    throw journalError('Applied effect has no receipt', 'INVALID_EXECUTION_JOURNAL');
  }
  return normalized;
}

function assertEffectOrder(journal) {
  let sawNonApplied = false;
  let sawPlanned = false;
  let applyingCount = 0;
  for (const effect of journal.effects) {
    if (effect.phase === 'applied' && sawNonApplied) invalidOrder();
    if (effect.phase === 'applying') {
      applyingCount += 1;
      if (sawPlanned || applyingCount > 1) invalidOrder();
      sawNonApplied = true;
    }
    if (effect.phase === 'planned') {
      sawNonApplied = true;
      sawPlanned = true;
    }
  }
}

function invalidOrder() {
  throw journalError(
    'Execution effects do not form an applied prefix',
    'INVALID_EXECUTION_JOURNAL'
  );
}

function assertUniqueEffectIds(effects) {
  const ids = new Set(effects.map((effect) => effect.effectId));
  if (ids.size !== effects.length) {
    throw journalError('Execution effect ids must be unique', 'INVALID_EXECUTION_JOURNAL');
  }
}

function assertUnsettled(journal) {
  if (journal.status !== 'planned') {
    throw journalError('Execution journal is already settled', 'JOURNAL_SETTLED');
  }
}

function requiredId(value, field) {
  const normalized = String(value ?? '').trim();
  if (!normalized)
    throw journalError(`Execution journal is missing ${field}`, 'INVALID_EXECUTION_JOURNAL');
  return normalized;
}

function revision(value) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw journalError(
      'Execution journal has an invalid base revision',
      'INVALID_EXECUTION_JOURNAL'
    );
  }
  return normalized;
}

function assertPlanRevision(run, transition) {
  if (transition?.type !== 'plan') return;
  if (Number(transition.plan?.baseRunRevision) === Number(run.runRevision)) return;
  throw new RunLifecycleError('The execution plan has a stale base revision', 'STALE_RUN_REVISION');
}

function journalError(message, code) {
  return new RunExecutionJournalError(message, code);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
