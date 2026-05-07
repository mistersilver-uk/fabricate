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

function taskKey(environmentId, task = {}, index = 0) {
  return `${environmentId || 'environment'}:${task?.id || task?.action || index}`;
}

function environmentAvailability(environment) {
  if (environment?.attemptable === true) return 'available';
  if (environment?.attemptable === false) return 'blocked';
  const tasks = Array.isArray(environment?.tasks) ? environment.tasks : [];
  if (tasks.length === 0) return 'empty';
  return tasks.some(task => task?.attemptable === true) ? 'available' : 'blocked';
}

function environmentMatchesAvailability(environment, filter) {
  if (!filter || filter === 'all') return true;
  return environmentAvailability(environment) === filter;
}

function firstAttemptableTask(environment) {
  const tasks = Array.isArray(environment?.tasks) ? environment.tasks : [];
  return tasks.find(task => task?.attemptable === true) ?? tasks[0] ?? null;
}

function normalizeStaminaSummary(environments = []) {
  for (const environment of environments) {
    for (const task of Array.isArray(environment?.tasks) ? environment.tasks : []) {
      const state = task?.rich?.stamina?.state;
      if (!state || state.current === null || state.current === undefined) continue;
      return {
        current: state.current,
        max: state.max ?? null,
        provider: state.provider || null,
        regenerationMode: state.regenerationMode || null
      };
    }
  }
  return null;
}

function normalizeSystemOptions(listing) {
  const explicit = Array.isArray(listing?.gatheringSystems) ? listing.gatheringSystems : [];
  const byId = new Map();
  for (const system of explicit) {
    const id = String(system?.id || '').trim();
    if (!id) continue;
    byId.set(id, { id, name: String(system?.name || id).trim() || id });
  }
  for (const row of [
    ...(Array.isArray(listing?.environments) ? listing.environments : []),
    ...(Array.isArray(listing?.activeRuns) ? listing.activeRuns : []),
    ...(Array.isArray(listing?.history) ? listing.history : [])
  ]) {
    const id = String(row?.craftingSystemId || '').trim();
    if (!id || byId.has(id)) continue;
    const name = String(row?.craftingSystemName || id).trim() || id;
    byId.set(id, { id, name });
  }
  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
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
    history: normalizeRunRows(listing?.history),
    gatheringSystems: normalizeSystemOptions(listing)
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
  selectedSystemId = 'all',
  selectedEnvironmentId = null,
  selectedTaskKey = null,
  activeTab = 'environments',
  availabilityFilter = 'all',
  loading = false,
  startingTaskKey = null,
  error = null,
  lastResult = null
}) {
  const systemOptions = listing?.gatheringSystems ?? [];
  const systemFilterId = systemOptions.some(system => system.id === selectedSystemId) ? selectedSystemId : 'all';
  const environments = listing?.environments ?? [];
  const systemFilteredEnvironments = systemFilterId === 'all'
    ? environments
    : environments.filter(environment => String(environment?.craftingSystemId || '') === systemFilterId);
  const filteredEnvironments = systemFilteredEnvironments
    .filter(environment => environmentMatchesAvailability(environment, availabilityFilter));
  const selectedEnvironment = filteredEnvironments.find(environment => environment?.id === selectedEnvironmentId)
    ?? null;
  const tasks = Array.isArray(selectedEnvironment?.tasks) ? selectedEnvironment.tasks : [];
  const selectedTask = tasks.find((task, index) => taskKey(selectedEnvironment?.id, task, index) === selectedTaskKey)
    ?? firstAttemptableTask(selectedEnvironment);
  return {
    loading,
    startingTaskKey,
    error,
    lastResult,
    activeTab: activeTab === 'log' ? 'log' : 'environments',
    availabilityFilter: ['all', 'available', 'blocked', 'empty'].includes(availabilityFilter) ? availabilityFilter : 'all',
    selectedActor,
    selectedActorId: selectedActor?.id ?? null,
    availableActors,
    hasSelectableActors: availableActors.length > 0,
    listing,
    environments,
    systemFilteredEnvironments,
    filteredEnvironments,
    selectedEnvironment,
    selectedEnvironmentId: selectedEnvironment?.id ?? null,
    selectedTask,
    selectedTaskKey: selectedTask ? taskKey(selectedEnvironment?.id, selectedTask, tasks.indexOf(selectedTask)) : null,
    selectedEnvironmentAvailability: selectedEnvironment ? environmentAvailability(selectedEnvironment) : null,
    staminaSummary: normalizeStaminaSummary(systemFilteredEnvironments),
    gatheringSystems: systemOptions,
    selectedSystemId: systemFilterId,
    hasMultipleGatheringSystems: systemOptions.length > 1,
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
  const selectedSystemId = writable('all');
  const selectedEnvironmentId = writable(null);
  const selectedTaskKey = writable(null);
  const activeTab = writable('environments');
  const availabilityFilter = writable('all');
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
      selectedSystemId: get(selectedSystemId),
      selectedEnvironmentId: get(selectedEnvironmentId),
      selectedTaskKey: get(selectedTaskKey),
      activeTab: get(activeTab),
      availabilityFilter: get(availabilityFilter),
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
      const normalized = normalizeListing(result, actor, actors);
      listing.set(normalized);
      if (get(selectedSystemId) !== 'all' && !normalized.gatheringSystems.some(system => system.id === get(selectedSystemId))) {
        selectedSystemId.set('all');
      }
      syncSelection();
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
    selectedSystemId.set('all');
    selectedEnvironmentId.set(null);
    selectedTaskKey.set(null);
    syncViewState();
    return actor;
  }

  function syncSelection() {
    const state = buildViewState({
      selectedActor: get(selectedActor),
      availableActors: get(availableActors),
      listing: get(listing),
      selectedSystemId: get(selectedSystemId),
      selectedEnvironmentId: get(selectedEnvironmentId),
      selectedTaskKey: get(selectedTaskKey),
      activeTab: get(activeTab),
      availabilityFilter: get(availabilityFilter),
      loading: get(loading),
      startingTaskKey: get(startingTaskKey),
      error: get(error),
      lastResult: get(lastResult)
    });
    if (state.selectedEnvironmentId !== get(selectedEnvironmentId)) {
      selectedEnvironmentId.set(state.selectedEnvironmentId);
    }
    if (state.selectedTaskKey !== get(selectedTaskKey)) {
      selectedTaskKey.set(state.selectedTaskKey);
    }
    viewState.set(state);
    return state;
  }

  function selectSystem(systemId) {
    const normalizedId = String(systemId || 'all');
    const systems = get(listing)?.gatheringSystems ?? [];
    selectedSystemId.set(normalizedId === 'all' || systems.some(system => system.id === normalizedId) ? normalizedId : 'all');
    syncSelection();
    return get(selectedSystemId);
  }

  function selectEnvironment(environmentId) {
    selectedEnvironmentId.set(environmentId || null);
    selectedTaskKey.set(null);
    syncSelection();
    return get(selectedEnvironmentId);
  }

  function selectTask(environmentId, task = {}, index = 0) {
    selectedEnvironmentId.set(environmentId || null);
    selectedTaskKey.set(taskKey(environmentId, task, index));
    syncSelection();
    return get(selectedTaskKey);
  }

  function selectTab(tab) {
    activeTab.set(tab === 'log' ? 'log' : 'environments');
    syncViewState();
    return get(activeTab);
  }

  function setAvailabilityFilter(filter) {
    availabilityFilter.set(['all', 'available', 'blocked', 'empty'].includes(filter) ? filter : 'all');
    syncSelection();
    return get(availabilityFilter);
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
    selectedSystemId,
    selectedEnvironmentId,
    selectedTaskKey,
    activeTab,
    availabilityFilter,
    viewState,
    refresh,
    refreshActors,
    selectActor,
    selectSystem,
    selectEnvironment,
    selectTask,
    selectTab,
    setAvailabilityFilter,
    startTask,
    destroy
  };
}
