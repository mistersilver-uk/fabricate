/**
 * Player gathering store.
 *
 * Runtime and Foundry access stay behind injected services so this store can be
 * tested without Foundry globals and without reimplementing gathering gates.
 */
import { writable, get } from 'svelte/store';

const DEFAULT_ACTOR_IMAGE = 'icons/svg/mystery-man.svg';

function normalizeActors(actors = []) {
  if (!actors) return [];
  if (Array.isArray(actors)) return actors.filter(Boolean);
  if (Array.isArray(actors.contents)) return actors.contents.filter(Boolean);
  if (typeof actors.values === 'function') return Array.from(actors.values()).filter(Boolean);
  if (typeof actors[Symbol.iterator] === 'function') return Array.from(actors).filter(Boolean);
  return [];
}

function actorOption(actor) {
  return {
    id: actor?.id ?? '',
    uuid: actor?.uuid ?? null,
    name: actor?.name || 'Unknown Actor',
    img: actor?.img || DEFAULT_ACTOR_IMAGE,
    actor
  };
}

function firstMessage(result, fallback) {
  const reason = Array.isArray(result?.blockedReasons) ? result.blockedReasons[0] : null;
  return reason?.message || fallback;
}

function notifyAttemptResult(result, services, localize) {
  const state = result?.state || result?.runStatus || '';
  if (state === 'succeeded') {
    services.notify?.info?.(localize('FABRICATE.Gathering.Notifications.Succeeded'));
    return;
  }
  if (state === 'waitingTime') {
    services.notify?.info?.(localize('FABRICATE.Gathering.Notifications.Started'));
    return;
  }
  if (state === 'failed') {
    // Runtime failure feedback is applied before terminal failed results are
    // returned. Avoid a second generic warning from the app shell.
    return;
  }
  if (result?.accepted === true || result?.started === true) {
    services.notify?.info?.(localize('FABRICATE.Gathering.Notifications.Started'));
    return;
  }
  services.notify?.warn?.(firstMessage(
    result,
    localize('FABRICATE.Gathering.Notifications.Blocked')
  ));
}

function normalizeRunRows(rows) {
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

function normalizeListing(listing, actor, availableActors) {
  return {
    visible: listing?.visible === true,
    attemptable: listing?.attemptable === true,
    blockedReasons: Array.isArray(listing?.blockedReasons) ? listing.blockedReasons : [],
    state: listing?.state || (listing?.attemptable ? 'ready' : 'blocked'),
    selectedActorId: listing?.selectedActorId ?? actor?.id ?? null,
    selectableActors: Array.isArray(listing?.selectableActors)
      ? listing.selectableActors
      : availableActors.map(actorOption),
    environments: Array.isArray(listing?.environments) ? listing.environments : [],
    activeRuns: normalizeRunRows(listing?.activeRuns),
    history: normalizeRunRows(listing?.history)
  };
}

function attemptLabel(task, localize) {
  if (task?.blind === true || task?.action === 'blindGather') {
    return task?.label || localize('FABRICATE.Gathering.BlindTaskLabel');
  }
  return task?.label || task?.name || localize('FABRICATE.Gathering.BlindTaskLabel');
}

function statusMessageKey(status) {
  if (status === 'succeeded') return 'FABRICATE.Gathering.Feedback.Succeeded';
  if (status === 'failed') return 'FABRICATE.Gathering.Feedback.Failed';
  if (status === 'waitingTime') return 'FABRICATE.Gathering.Feedback.WaitingTime';
  if (status === 'cancelled') return 'FABRICATE.Gathering.Feedback.Cancelled';
  return 'FABRICATE.Gathering.Feedback.Blocked';
}

function feedbackTone(status, accepted) {
  if (status === 'succeeded') return 'success';
  if (status === 'waitingTime') return 'info';
  if (status === 'failed' || status === 'cancelled') return 'warning';
  return accepted === true ? 'info' : 'warning';
}

function normalizeAttemptFeedback(result, task, localize) {
  if (!result) return null;
  const status = result.state || result.runStatus || 'blocked';
  const reason = Array.isArray(result.blockedReasons) ? result.blockedReasons[0] : null;
  return {
    status,
    accepted: result.accepted === true,
    started: result.started === true,
    label: attemptLabel(task, localize),
    message: reason?.message || localize(statusMessageKey(status)),
    messageKey: reason?.messageKey || statusMessageKey(status),
    tone: feedbackTone(status, result.accepted),
    runId: result.runId ?? result.run?.id ?? null
  };
}

function buildViewState({
  selectedActor,
  availableActors,
  listing,
  loading = false,
  startingTaskKey = null,
  error = null,
  lastResult = null
}) {
  return {
    loading,
    startingTaskKey,
    error,
    lastResult,
    selectedActor,
    selectedActorId: selectedActor?.id ?? null,
    availableActors,
    hasSelectableActors: availableActors.length > 0,
    listing,
    environments: listing?.environments ?? [],
    activeRuns: listing?.activeRuns ?? [],
    history: listing?.history ?? [],
    blockedReasons: listing?.blockedReasons ?? [],
    state: listing?.state ?? (availableActors.length > 0 ? 'idle' : 'NO_SELECTABLE_ACTORS'),
    attemptable: listing?.attemptable === true,
    feedback: lastResult?.feedback ?? null
  };
}

function selectDefaultActor(services, availableActors) {
  const savedId = services.getSetting?.('lastGatheringActor') || '';
  if (savedId) {
    const saved = availableActors.find(actor => actor?.id === savedId);
    if (saved) return saved;
    Promise.resolve(services.setSetting?.('lastGatheringActor', '')).catch(() => {});
  }

  const character = services.getGameUser?.()?.character;
  if (character && availableActors.some(actor => actor?.id === character.id)) {
    return character;
  }

  return availableActors[0] ?? null;
}

/**
 * Create the player Gathering app store.
 *
 * The store remembers the selected actor in `lastGatheringActor`, clears stale
 * remembered actors when they are no longer selectable, lists visible
 * environments/tasks plus active/history runs through the runtime facade, and
 * starts attempts through the same facade. Active/history rows are kept in view
 * even when environment browsing is empty or blocked. Terminal failed attempts
 * intentionally rely on runtime failure feedback instead of emitting an
 * additional generic warning here.
 *
 * @param {object} services Runtime and Foundry service adapter.
 * @returns {object} Svelte stores and player gathering actions.
 */
export function createGatheringStore(services) {
  const localize = (key, data) => services.localize?.(key, data) ?? key;
  const availableActors = writable(normalizeActors(services.getAvailableActors?.()));
  const selectedActor = writable(selectDefaultActor(services, get(availableActors)));
  const listing = writable(null);
  const loading = writable(false);
  const startingTaskKey = writable(null);
  const error = writable(null);
  const lastResult = writable(null);
  const viewState = writable(buildViewState({
    selectedActor: get(selectedActor),
    availableActors: get(availableActors),
    listing: get(listing)
  }));

  function syncViewState() {
    viewState.set(buildViewState({
      selectedActor: get(selectedActor),
      availableActors: get(availableActors),
      listing: get(listing),
      loading: get(loading),
      startingTaskKey: get(startingTaskKey),
      error: get(error),
      lastResult: get(lastResult)
    }));
  }

  function refreshActors() {
    const actors = normalizeActors(services.getAvailableActors?.());
    availableActors.set(actors);
    const current = get(selectedActor);
    if (current && !actors.some(actor => actor?.id === current.id)) {
      selectedActor.set(actors[0] ?? null);
    }
    syncViewState();
    return actors;
  }

  async function refresh() {
    const actors = refreshActors();
    const actor = get(selectedActor);
    loading.set(true);
    error.set(null);
    syncViewState();

    try {
      if (!actor) {
        listing.set(normalizeListing({
          visible: true,
          attemptable: false,
          state: 'NO_SELECTABLE_ACTORS',
          blockedReasons: [{
            code: 'NO_SELECTABLE_ACTORS',
            messageKey: 'FABRICATE.Gathering.Blocked.NoSelectableActors',
            message: localize('FABRICATE.Gathering.Blocked.NoSelectableActors')
          }],
          environments: []
        }, null, actors));
        return get(listing);
      }

      const result = await services.listGatheringForActor({ actor });
      listing.set(normalizeListing(result, actor, actors));
      return get(listing);
    } catch (err) {
      const message = err?.message || localize('FABRICATE.Gathering.Notifications.RefreshFailed');
      error.set(message);
      services.notify?.error?.(message);
      return null;
    } finally {
      loading.set(false);
      syncViewState();
    }
  }

  async function selectActor(actorId) {
    const actors = refreshActors();
    const actor = actors.find(candidate => candidate?.id === actorId) ?? null;
    selectedActor.set(actor);
    await services.setSetting?.('lastGatheringActor', actor?.id ?? '');
    listing.set(null);
    syncViewState();
    return actor;
  }

  async function startTask(environmentId, task = {}) {
    const actor = get(selectedActor);
    if (!actor) {
      const message = localize('FABRICATE.Gathering.Blocked.NoSelectableActors');
      services.notify?.warn?.(message);
      return null;
    }

    const taskId = task?.id ?? null;
    const key = `${environmentId || 'environment'}:${taskId || task?.action || 'blind'}`;
    startingTaskKey.set(key);
    error.set(null);
    syncViewState();

    try {
      const result = await services.startGatheringAttempt({
        actor,
        environmentId,
        taskId
      });
      lastResult.set(result
        ? {
            ...result,
            feedback: normalizeAttemptFeedback(result, task, localize)
          }
        : null);

      notifyAttemptResult(result, services, localize);

      await refresh();
      return result;
    } catch (err) {
      const message = err?.message || localize('FABRICATE.Gathering.Notifications.StartFailed');
      error.set(message);
      services.notify?.error?.(message);
      return null;
    } finally {
      startingTaskKey.set(null);
      syncViewState();
    }
  }

  function destroy() {
    // Store currently owns no external subscriptions.
  }

  syncViewState();

  return {
    selectedActor,
    availableActors,
    listing,
    loading,
    startingTaskKey,
    error,
    lastResult,
    viewState,
    refresh,
    refreshActors,
    selectActor,
    startTask,
    destroy
  };
}
