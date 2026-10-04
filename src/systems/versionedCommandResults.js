/** The answers a versioned crafting command returns: a transition, an authority outage, a refusal. */

export function versionedTransitionResult(run, outcome = {}) {
  return {
    success: outcome?.success === true,
    runId: run?.id ?? null,
    status: run?.status ?? null,
    runRevision: Number(run?.runRevision) || 0,
    waiting: run?.status === 'waitingTime',
    terminal: run?.currentStepIndex === null,
    disposition: outcome?.disposition ?? null,
    createdResultUuids: Array.isArray(outcome?.createdResultUuids)
      ? [...outcome.createdResultUuids]
      : [],
    ...(Object.hasOwn(outcome || {}, 'consumed') && { consumed: outcome.consumed === true }),
  };
}

export function authorityUnavailableResult() {
  return {
    success: false,
    authorityUnavailable: true,
    results: null,
    message: 'Versioned crafting authority is unavailable.',
  };
}

/** A refusal; `blocker` is the machine-readable code a stage preparation names, if any. */
export function versionedFailure(message, blocker = null) {
  return { success: false, results: null, message, ...(blocker && { blocker }) };
}
