import { cloneJson } from '../utils/scalars.js';

/** Current opt-in run contract. Missing versions retain legacy behavior. */
export const RUN_LIFECYCLE_VERSION = 1;

const COMPLETION_MODES = new Set(['manual', 'worldTime']);

/** Lifecycle refusal with a stable `code` for callers to present or handle. */
export class RunLifecycleError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RunLifecycleError';
    this.code = code;
  }
}

/**
 * Classify without coercion or migration. A present undefined/null/string version is unsupported.
 * @param {object|null} run
 * @returns {'legacy'|'current'|'unsupported'}
 */
export function getRunLifecycleContract(run) {
  if (!hasOwn(run, 'lifecycleVersion')) return 'legacy';
  return run?.lifecycleVersion === RUN_LIFECYCLE_VERSION ? 'current' : 'unsupported';
}

/**
 * Build explicitly opted-in lifecycle fields with revision zero and manual completion by default.
 * Unstamped callers receive no lifecycle fields. Unsupported versions throw.
 * @param {object} [data]
 * @returns {object}
 */
export function buildNewRunLifecycleFields(data = {}) {
  const contract = getRunLifecycleContract(data);
  if (contract === 'legacy') return {};
  if (contract === 'unsupported') throw unsupportedVersionError(data.lifecycleVersion);
  return normalizeCurrentFields({
    ...data,
    runRevision: 0,
    pauseState: undefined,
    pausedDurationSeconds: 0,
  });
}

/**
 * Project lifecycle fields for persistence without upgrading legacy or unsupported records.
 * For an unsupported contract, only its version is returned by this helper.
 * @param {object} [data]
 * @returns {object}
 */
export function preserveRunLifecycleFields(data = {}) {
  const contract = getRunLifecycleContract(data);
  if (contract === 'legacy') return {};
  if (contract === 'unsupported') {
    return { lifecycleVersion: cloneJson(data.lifecycleVersion) };
  }
  return normalizeCurrentFields(data);
}

/**
 * Refuse unsupported, recovery-required, paused or stale mutations as applicable.
 * This guard does not acquire authority, validate resources or persist a transition.
 * @param {object} run
 * @param {{currentOnly?: boolean, expectedRevision?: number, allowPaused?: boolean}} [options]
 * @returns {'legacy'|'current'}
 * @throws {RunLifecycleError}
 */
export function assertRunLifecycleMutation(
  run,
  { currentOnly = false, expectedRevision, allowPaused = false } = {}
) {
  const contract = getRunLifecycleContract(run);
  if (contract === 'unsupported') throw unsupportedVersionError(run?.lifecycleVersion);
  if (currentOnly && contract !== 'current') {
    throw new RunLifecycleError(
      'This operation requires a versioned run lifecycle',
      'LIFECYCLE_OPERATION_UNAVAILABLE'
    );
  }
  if (run?.executionJournal?.status === 'recoveryRequired') {
    throw new RunLifecycleError(
      'This run requires recovery before it can be changed',
      'EXECUTION_RECOVERY_REQUIRED'
    );
  }
  if (!allowPaused && contract === 'current' && run.pauseState) {
    throw new RunLifecycleError('This run is paused', 'RUN_PAUSED');
  }
  if (expectedRevision !== undefined && contract === 'current') {
    const expected = Number(expectedRevision);
    if (
      !Number.isSafeInteger(expected) ||
      expected < 0 ||
      expected !== normalizeRevision(run.runRevision)
    ) {
      throw new RunLifecycleError('The run revision is stale', 'STALE_RUN_REVISION');
    }
  }
  return contract;
}

/** Increment a current run in place, returning legacy and unsupported runs unchanged. */
export function incrementRunRevision(run) {
  if (getRunLifecycleContract(run) !== 'current') return run;
  run.runRevision = normalizeRevision(run.runRevision) + 1;
  return run;
}

/**
 * Set a current run's preference in place and increment its revision.
 * Preference is intent, not automatic-execution eligibility or permission to spend materials.
 * @param {object} run
 * @param {'manual'|'worldTime'} completionMode
 * @param {{expectedRevision?: number}} [options]
 * @returns {object} The mutated run, not yet persisted.
 */
export function applyCompletionMode(run, completionMode, options = {}) {
  assertRunLifecycleMutation(run, { ...options, currentOnly: true, allowPaused: true });
  if (!COMPLETION_MODES.has(completionMode)) {
    throw new RunLifecycleError(
      `Unsupported completion mode "${completionMode}"`,
      'INVALID_COMPLETION_MODE'
    );
  }
  run.completionMode = completionMode;
  return incrementRunRevision(run);
}

/**
 * Freeze remaining world-time seconds in place, retaining selections and completion preference.
 * The caller validates that this is a pausable waiting gate.
 * @param {object} run
 * @param {{now?: number, availableAt?: number, expectedRevision?: number}} [options]
 * @returns {object} The mutated run, not yet persisted.
 */
export function applyPause(run, { now, availableAt, expectedRevision } = {}) {
  assertRunLifecycleMutation(run, { currentOnly: true, expectedRevision, allowPaused: true });
  if (run.pauseState) {
    throw new RunLifecycleError('The run is already paused', 'RUN_ALREADY_PAUSED');
  }
  const pausedAt = finiteNumber(now, 0);
  run.pauseState = {
    pausedAt,
    remainingSeconds: Math.max(0, finiteNumber(availableAt, pausedAt) - pausedAt),
  };
  return incrementRunRevision(run);
}

/**
 * Clear pause in place and accumulate paused duration, returning the new gate deadline.
 * The caller assigns `availableAt` to the gate and persists it with the run.
 * @param {object} run
 * @param {{now?: number, expectedRevision?: number}} [options]
 * @returns {{run: object, availableAt: number}}
 */
export function applyResume(run, { now, expectedRevision } = {}) {
  assertRunLifecycleMutation(run, { currentOnly: true, expectedRevision, allowPaused: true });
  if (!run.pauseState) {
    throw new RunLifecycleError('The run is not paused', 'RUN_NOT_PAUSED');
  }
  const resumedAt = finiteNumber(now, 0);
  const pausedAt = finiteNumber(run.pauseState.pausedAt, resumedAt);
  const remainingSeconds = Math.max(0, finiteNumber(run.pauseState.remainingSeconds, 0));
  run.pausedDurationSeconds =
    Math.max(0, finiteNumber(run.pausedDurationSeconds, 0)) + Math.max(0, resumedAt - pausedAt);
  delete run.pauseState;
  incrementRunRevision(run);
  return { run, availableAt: resumedAt + remainingSeconds };
}

/**
 * Validate, change and persist preference through a manager-owned run location.
 * @param {object|null} location Supplies `run`, `assertMutation` and async `persist`.
 * @param {'manual'|'worldTime'} completionMode
 * @param {{expectedRevision?: number}} [options]
 * @returns {Promise<object|null>} Persisted run, or null when the location is absent.
 */
export async function persistCompletionMode(location, completionMode, options = {}) {
  if (!location) return null;
  location.assertMutation({ ...options, currentOnly: true, allowPaused: true });
  applyCompletionMode(location.run, completionMode);
  return location.persist();
}

/**
 * Pause a current waiting gate through its manager location and persist the revised run.
 * @param {object|null} location Supplies `run`, `assertMutation`, `getTimeGate`, `now`, `persist`.
 * @param {{expectedRevision?: number}} [options]
 * @returns {Promise<object|null>}
 */
export async function persistPausedRun(location, options = {}) {
  if (!location) return null;
  location.assertMutation({ ...options, currentOnly: true, allowPaused: true });
  const timeGate = location.getTimeGate();
  assertWaitingTimeGate(location.run, timeGate, 'RUN_NOT_PAUSABLE', 'paused');
  applyPause(location.run, {
    now: location.now(),
    availableAt: timeGate.availableAt,
  });
  return location.persist();
}

/**
 * Resume and reanchor a waiting gate through its manager location, then persist it.
 * @param {object|null} location As for pause, with optional `touchTimeGate` for native timestamps.
 * @param {{expectedRevision?: number}} [options]
 * @returns {Promise<object|null>}
 */
export async function persistResumedRun(location, options = {}) {
  if (!location) return null;
  location.assertMutation({ ...options, currentOnly: true, allowPaused: true });
  const timeGate = location.getTimeGate();
  assertWaitingTimeGate(location.run, timeGate, 'RUN_NOT_RESUMABLE', 'resumed');
  const resumed = applyResume(location.run, { now: location.now() });
  timeGate.availableAt = resumed.availableAt;
  location.touchTimeGate?.();
  return location.persist();
}

function normalizeCurrentFields(data) {
  const fields = {
    lifecycleVersion: RUN_LIFECYCLE_VERSION,
    runRevision: normalizeRevision(data.runRevision),
    completionMode: COMPLETION_MODES.has(data.completionMode) ? data.completionMode : 'manual',
    pausedDurationSeconds: Math.max(0, finiteNumber(data.pausedDurationSeconds, 0)),
  };
  const pauseState = normalizePauseState(data.pauseState);
  if (pauseState) fields.pauseState = pauseState;
  return fields;
}

function assertWaitingTimeGate(run, timeGate, code, action) {
  if (run.status === 'waitingTime' && timeGate) return;
  throw new RunLifecycleError(`Only a versioned waiting time gate can be ${action}`, code);
}

function normalizePauseState(value) {
  if (!value || typeof value !== 'object') return null;
  const pausedAt = Number(value.pausedAt);
  const remainingSeconds = Number(value.remainingSeconds);
  if (!Number.isFinite(pausedAt) || !Number.isFinite(remainingSeconds)) return null;
  return { pausedAt, remainingSeconds: Math.max(0, remainingSeconds) };
}

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unsupportedVersionError(version) {
  return new RunLifecycleError(
    `Unsupported run lifecycle version "${String(version)}"`,
    'UNSUPPORTED_LIFECYCLE_VERSION'
  );
}

function hasOwn(value, key) {
  return Boolean(value && typeof value === 'object' && Object.hasOwn(value, key));
}
