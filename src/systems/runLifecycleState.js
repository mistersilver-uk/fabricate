export const RUN_LIFECYCLE_VERSION = 1;

const COMPLETION_MODES = new Set(['manual', 'worldTime']);

export class RunLifecycleError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RunLifecycleError';
    this.code = code;
  }
}

export function getRunLifecycleContract(run) {
  if (!hasOwn(run, 'lifecycleVersion')) return 'legacy';
  return run?.lifecycleVersion === RUN_LIFECYCLE_VERSION ? 'current' : 'unsupported';
}

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

export function preserveRunLifecycleFields(data = {}) {
  const contract = getRunLifecycleContract(data);
  if (contract === 'legacy') return {};
  if (contract === 'unsupported') {
    return { lifecycleVersion: cloneJson(data.lifecycleVersion) };
  }
  return normalizeCurrentFields(data);
}

export function assertRunLifecycleMutation(
  run,
  { currentOnly = false, expectedRevision = undefined, allowPaused = false } = {}
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

export function incrementRunRevision(run) {
  if (getRunLifecycleContract(run) !== 'current') return run;
  run.runRevision = normalizeRevision(run.runRevision) + 1;
  return run;
}

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

export function applyPause(run, { now, availableAt, expectedRevision = undefined } = {}) {
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

export function applyResume(run, { now, expectedRevision = undefined } = {}) {
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

export async function persistCompletionMode(location, completionMode, options = {}) {
  if (!location) return null;
  location.assertMutation({ ...options, currentOnly: true, allowPaused: true });
  applyCompletionMode(location.run, completionMode);
  return location.persist();
}

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

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
