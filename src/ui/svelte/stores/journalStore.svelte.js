import {
  isResolvedFailureOutcome,
  journalRefusalMessage,
  resolvedFailureMessage,
} from '../util/journalRunReasons.js';

const PAGE_SIZES = Object.freeze([4, 6, 12, 25]);
const RECENT_TERMINAL_LIMIT = 3;
const KIND_FILTERS = new Set(['all', 'crafting', 'alchemy', 'gathering', 'salvage']);
/**
 * The player-facing Active status tabs. `inProgress` selects BOTH projected statuses that wear
 * the merged `In progress` badge (issue 1648, D-029): before the merge there was no tab for
 * `inProgress` at all, so a run between stages — or any unbegun stage — matched nothing but
 * `All`, and the tab counts reported `Ready 0, Waiting 0, Paused 0` beside `Active (1)`.
 */
const ACTIVE_STATUS_FILTERS = new Set(['all', 'ready', 'inProgress', 'paused']);
/** The projected `derivedStatus` values each tab selects. */
const ACTIVE_STATUS_MEMBERS = Object.freeze({
  ready: ['ready'],
  inProgress: ['waiting', 'inProgress'],
  paused: ['paused'],
});

/**
 * Active and Finished have independent pages and sorts, with shared search/kind filtering.
 * Status counts use the kind cohort before search, status filtering or paging.
 * Native run keys retain selected detail off-page or filtered out until removal/dismissal.
 */
export function createJournalStore({ services } = {}) {
  let listing = $state(null);
  let loading = $state(false);
  let error = $state(false);
  let selectedRunId = $state('');
  let selectedRunKey = $state('');
  let search = $state('');
  let kindFilter = $state('all');
  let activeStatusFilter = $state('all');
  let activeSort = $state('soonestReady');
  let historySort = $state('newest');
  let activePage = $state(0);
  let activePageSize = $state(PAGE_SIZES[0]);
  let historyPage = $state(0);
  let historyPageSize = $state(PAGE_SIZES[0]);
  let busyRunId = $state('');
  let busyRunKey = $state('');
  let commandError = $state(null);
  let commandResult = $state(null);
  let selectionGeneration = 0;
  let commandRetry = null;
  let worldTimeTick = $state(0);
  let loadedOnce = $state(false);
  const viewedStageByRunKey = $state({});
  let loadGeneration = 0;

  function worldTime() {
    void worldTimeTick;
    return Number(services?.getWorldTime?.() ?? 0);
  }

  const allActiveRuns = $derived.by(() => [...(listing?.activeRuns ?? [])]);
  const allHistoryRuns = $derived.by(() => [...(listing?.history ?? [])]);
  const kindActiveRuns = $derived.by(() => allActiveRuns.filter(matchesKind(kindFilter)));
  const activeCounts = $derived.by(() => countActiveStatuses(kindActiveRuns));

  const activeRuns = $derived.by(() => {
    const now = worldTime();
    const comparator =
      activeSort === 'newest'
        ? compareNewest
        : (left, right) => compareSoonestReady(left, right, now);
    return kindActiveRuns
      .filter(matchesSearch(search))
      .filter(matchesActiveStatus(activeStatusFilter))
      .sort(comparator);
  });

  const sortedHistory = $derived.by(() =>
    allHistoryRuns
      .filter(matchesKind(kindFilter))
      .filter(matchesSearch(search))
      .sort(historySort === 'oldest' ? compareOldestFinished : compareNewestFinished)
  );

  const activePageItems = $derived.by(() => {
    const start = activePage * activePageSize;
    return activeRuns.slice(start, start + activePageSize);
  });
  const historyPageItems = $derived.by(() => {
    const start = historyPage * historyPageSize;
    return sortedHistory.slice(start, start + historyPageSize);
  });
  const recentTerminalRuns = $derived.by(() =>
    [...allHistoryRuns].sort(compareNewestFinished).slice(0, RECENT_TERMINAL_LIMIT)
  );

  const selectedRun = $derived.by(() => {
    const all = [...allActiveRuns, ...allHistoryRuns];
    const match = selectedRunKey
      ? all.find((run) => runKey(run, listing) === selectedRunKey)
      : all.find((run) => run?.id === selectedRunId);
    return match ?? allActiveRuns[0] ?? allHistoryRuns[0] ?? null;
  });

  const viewedStageIndex = $derived.by(() => {
    const run = selectedRun;
    if (!run) return null;
    const key = runKey(run, listing);
    const remembered = Number(viewedStageByRunKey[key]);
    const fallback = stageAnchor(run);
    return normalizeStageIndex(run, Number.isSafeInteger(remembered) ? remembered : fallback);
  });
  const viewedStage = $derived.by(() => {
    if (viewedStageIndex === null) return null;
    return selectedRun?.steps?.[viewedStageIndex] ?? null;
  });
  const navCount = $derived(Number(listing?.counts?.active ?? 0));

  async function load(quiet = false) {
    const generation = ++loadGeneration;
    const rememberedActorId = services?.getSelectedActorId?.() ?? null;
    const isCurrentLoad = () =>
      generation === loadGeneration &&
      rememberedActorId === (services?.getSelectedActorId?.() ?? null);
    if (!quiet) {
      loading = true;
      error = false;
    }
    try {
      const next = await services?.listJournalForActor?.({
        rememberedActorId,
      });
      if (!isCurrentLoad()) return;
      listing = next ?? null;
      if (
        commandResult &&
        [...(listing?.history ?? [])].every((run) => runKey(run, listing) !== commandResult.runKey)
      )
        commandResult = null;
      error = !next;
      reconcileCommandError();
      reconcileSelection();
      clampPages();
    } catch {
      if (isCurrentLoad() && (!quiet || !listing)) error = true;
    } finally {
      if (generation === loadGeneration) {
        loading = false;
        if (isCurrentLoad()) loadedOnce = true;
      }
    }
  }

  function reconcileSelection() {
    const effective = selectedRun;
    selectedRunKey = effective ? runKey(effective, listing) : '';
    selectedRunId = effective?.id ?? '';
  }

  function reconcileCommandError() {
    if (!commandError) return;
    const actorUuid = listing?.selectedActorUuid ?? listing?.selectedActorId ?? null;
    const all = [...(listing?.activeRuns ?? []), ...(listing?.history ?? [])];
    const sameActor = commandError.actorUuid === actorUuid;
    const runExists = all.some((run) => runKey(run, listing) === commandError.runKey);
    if (!sameActor || !runExists) clearCommandError();
  }

  function clampPages() {
    activePage = clampPage(activePage, activePageSize, activeRuns.length);
    historyPage = clampPage(historyPage, historyPageSize, sortedHistory.length);
  }

  function select(runOrId, runType = null) {
    selectionGeneration += 1;
    commandResult = null;
    const run = resolveRun(runOrId, runType, listing);
    selectedRunId = run?.id ?? (typeof runOrId === 'string' ? runOrId : '');
    selectedRunKey = run ? runKey(run, listing) : '';
    if (commandError && commandError.runKey !== selectedRunKey) clearCommandError();
  }

  function setSearch(next) {
    search = String(next ?? '').trim();
    activePage = 0;
    historyPage = 0;
  }

  function setKindFilter(next) {
    if (!KIND_FILTERS.has(next)) return;
    kindFilter = next;
    activePage = 0;
    historyPage = 0;
  }

  function setActiveStatusFilter(next) {
    if (!ACTIVE_STATUS_FILTERS.has(next)) return;
    activeStatusFilter = next;
    activePage = 0;
  }

  function setActiveSort(next) {
    if (next === 'soonestReady' || next === 'newest') activeSort = next;
    activePage = 0;
  }

  function setHistorySort(next) {
    if (next === 'newest' || next === 'oldest') historySort = next;
    historyPage = 0;
  }

  function setActivePage(next) {
    activePage = clampPage(next, activePageSize, activeRuns.length);
  }

  function setHistoryPage(next) {
    historyPage = clampPage(next, historyPageSize, sortedHistory.length);
  }

  function setActivePageSize(next) {
    const size = Number(next);
    if (!PAGE_SIZES.includes(size)) return;
    activePageSize = size;
    activePage = 0;
  }

  function setHistoryPageSize(next) {
    const size = Number(next);
    if (!PAGE_SIZES.includes(size)) return;
    historyPageSize = size;
    historyPage = 0;
  }

  // Browsing is transient and never overwrites the executable stage.
  function viewStage(run, index) {
    if (!run) return;
    viewedStageByRunKey[runKey(run, listing)] = normalizeStageIndex(run, index);
  }

  function returnToCurrentStage(run = selectedRun) {
    if (!run) return;
    viewStage(run, stageAnchor(run));
  }

  // Versioned actions send revision/stage-scoped commands; legacy crafting retains its own seam.
  async function execute(run, payload) {
    if (run?.lifecycleContract === 'legacy' || !run?.lifecycleContract) {
      return advanceLegacy(run);
    }
    return runCommand(run, 'execute', payload === undefined ? { interactive: true } : payload);
  }

  // Beginning a stage is its own command: it locks the choice, spends the materials and
  // starts the clock, and nothing else does any of the three.
  async function beginStep(run) {
    // Beginning COMMITS the stage's choice, so the command carries the plan the screen showed
    // rather than depending on a separate earlier write having landed. The persisted plan is the
    // base; the projection's resolved route fills the id a just-advanced stage has yet to record
    // (issue 1648, M17).
    const step = run?.currentStep ?? null;
    const selectedIngredientSetId =
      step?.selectionPlan?.selectedIngredientSetId ??
      step?.selectionAvailability?.selectedIngredientSetId ??
      null;
    if (!selectedIngredientSetId) return runCommand(run, 'beginStep', {});
    return runCommand(run, 'beginStep', {
      selectionPlan: { ...step.selectionPlan, selectedIngredientSetId },
    });
  }

  async function pause(run) {
    return runCommand(run, 'pause', {});
  }

  async function resume(run) {
    return runCommand(run, 'resume', {});
  }

  async function setCompletionMode(run, completionMode) {
    return runCommand(run, 'setCompletionMode', { completionMode });
  }

  async function setSelection(run, selection) {
    return runCommand(run, 'setSelection', {
      stepIndex: run?.stepIndex,
      selectionPlan: selection ?? {},
    });
  }

  async function runCommand(run, action, payload) {
    if (
      !run?.id ||
      busyRunKey ||
      run?.lifecycleContract !== 'current' ||
      run?.actions?.[action] !== true
    )
      return;
    clearCommandError();
    commandResult = null;
    const selectionAtStart = selectionGeneration;
    const actorAtStart = services?.getSelectedActorId?.() ?? null;
    busyRunId = run.id;
    busyRunKey = runKey(run, listing);
    const request = {
      runKey: busyRunKey,
      actorUuid: run.actorUuid ?? listing?.selectedActorUuid ?? null,
      action,
      payload: payload ?? {},
    };
    try {
      const result = await services?.executeJournalRunCommand?.({
        actorUuid: request.actorUuid,
        runType: run.runType,
        runId: run.id,
        expectedRevision: normalizeRevision(run.runRevision),
        action,
        payload: payload ?? {},
      });
      if (result?.cancelled === true) return;
      // Two different `success: false` results. A REFUSAL carries `reason` and no `message`
      // (which recorded an EMPTY command error and toasted nothing); a resolved failed check
      // is an OUTCOME the run's own history records, so it raises no command error and never
      // takes the generic craft error's "Nothing was consumed" promise.
      const outcome = isResolvedFailureOutcome(result);
      const refused = result?.success === false && !outcome;
      let message = safeCommandMessage(result?.message);
      if (outcome) message = resolvedFailureMessage(services?.localize);
      if (refused) {
        const generic = services?.craftErrorMessage?.();
        message = journalRefusalMessage(result, services?.localize, generic);
        setCommandError(request, message);
      }
      if (message) services?.notify?.(message);
      await load(true);
      if (
        action === 'execute' &&
        result?.success === true &&
        selectionAtStart === selectionGeneration &&
        actorAtStart === (services?.getSelectedActorId?.() ?? null)
      ) {
        const completed = allHistoryRuns.find((entry) => runKey(entry, listing) === request.runKey);
        if (completed && !completed.recoveryEvidence?.required && !completed.redacted)
          commandResult = { runKey: request.runKey };
      }
    } catch (err) {
      console.error(`Fabricate | Error running Journal ${action} command:`, err);
      const message = safeCommandMessage(services?.craftErrorMessage?.());
      setCommandError(request, message);
      services?.notify?.(message);
      await load(true);
    } finally {
      busyRunId = '';
      busyRunKey = '';
    }
  }

  function setCommandError(request, message) {
    commandError = {
      runKey: request.runKey,
      actorUuid: request.actorUuid,
      message,
    };
    commandRetry = request;
  }

  function clearCommandError() {
    commandError = null;
    commandRetry = null;
  }

  async function retryCommandError() {
    const request = commandRetry;
    if (!request) return;
    const all = [...allActiveRuns, ...allHistoryRuns];
    const run = all.find((candidate) => runKey(candidate, listing) === request.runKey);
    if (!run || run.lifecycleContract !== 'current' || run.actions?.[request.action] !== true) {
      clearCommandError();
      return;
    }
    return runCommand(run, request.action, request.payload);
  }

  function safeCommandMessage(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  async function advanceLegacy(run) {
    if (!run?.id || busyRunKey) return;
    busyRunId = run.id;
    busyRunKey = runKey(run, listing);
    try {
      const result = await services?.advanceCraftingRun?.({
        actorId: listing?.selectedActorId ?? null,
        runId: run.id,
        interactive: true,
      });
      if (result?.cancelled === true) return;
      if (result?.message) services?.notify?.(result.message);
      await load(true);
    } catch (err) {
      console.error('Fabricate | Error advancing a crafting run:', err);
      services?.notify?.(services?.craftErrorMessage?.() ?? '');
    } finally {
      busyRunId = '';
      busyRunKey = '';
    }
  }

  async function cancel(run) {
    if (run?.lifecycleContract === 'current') return runCommand(run, 'cancel', {});
    if (!run?.id || busyRunKey) return;
    busyRunId = run.id;
    busyRunKey = runKey(run, listing);
    try {
      const result = await services?.cancelCraftingRun?.({
        actorId: listing?.selectedActorId ?? null,
        runId: run.id,
      });
      if (result?.message) services?.notify?.(result.message);
      await load(true);
    } catch (err) {
      console.error('Fabricate | Error cancelling a crafting run:', err);
      services?.notify?.(services?.craftErrorMessage?.() ?? '');
    } finally {
      busyRunId = '';
      busyRunKey = '';
    }
  }

  // Refresh only after the user-scoped dismissal write settles; actor history remains intact.
  async function dismiss(run) {
    if (!run?.id || busyRunKey || run?.actions?.dismiss !== true) return;
    busyRunId = run.id;
    busyRunKey = runKey(run, listing);
    try {
      const result = await services?.dismissJournalRun?.({
        actorUuid: run.actorUuid ?? listing?.selectedActorUuid ?? null,
        runType: run.runType,
        runId: run.id,
      });
      if (result?.message) services?.notify?.(result.message);
      await load(true);
    } catch (err) {
      console.error('Fabricate | Error dismissing a Journal run:', err);
      services?.notify?.(services?.craftErrorMessage?.() ?? '');
      await load(true);
    } finally {
      busyRunId = '';
      busyRunKey = '';
    }
  }

  function tickWorldTime() {
    worldTimeTick += 1;
  }

  return {
    get listing() {
      return listing;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get selectedRunId() {
      return selectedRun?.id ?? '';
    },
    get selectedRunKey() {
      return selectedRun ? runKey(selectedRun, listing) : '';
    },
    get search() {
      return search;
    },
    get kindFilter() {
      return kindFilter;
    },
    get activeStatusFilter() {
      return activeStatusFilter;
    },
    get activeSort() {
      return activeSort;
    },
    get historySort() {
      return historySort;
    },
    get activePage() {
      return activePage;
    },
    get activePageSize() {
      return activePageSize;
    },
    get historyPage() {
      return historyPage;
    },
    get historyPageSize() {
      return historyPageSize;
    },
    get pageSizes() {
      return PAGE_SIZES;
    },
    get historyPageSizes() {
      return PAGE_SIZES;
    },
    get busyRunId() {
      return busyRunId;
    },
    get busyRunKey() {
      return busyRunKey;
    },
    get commandError() {
      return commandError;
    },
    get commandResult() {
      return commandResult;
    },
    get loadedOnce() {
      return loadedOnce;
    },
    get worldTime() {
      return worldTime();
    },
    get activeCounts() {
      return activeCounts;
    },
    get activeRuns() {
      return activeRuns;
    },
    get activePageItems() {
      return activePageItems;
    },
    get activeCount() {
      return activeRuns.length;
    },
    get historyPageItems() {
      return historyPageItems;
    },
    get historyCount() {
      return sortedHistory.length;
    },
    get recentTerminalRuns() {
      return recentTerminalRuns;
    },
    get selectedRun() {
      return selectedRun;
    },
    get viewedStageIndex() {
      return viewedStageIndex;
    },
    get viewedStage() {
      return viewedStage;
    },
    get navCount() {
      return navCount;
    },
    load,
    select,
    setSearch,
    setKindFilter,
    setActiveStatusFilter,
    setActiveSort,
    setHistorySort,
    setActivePage,
    setActivePageSize,
    setHistoryPage,
    setHistoryPageSize,
    viewStage,
    returnToCurrentStage,
    retryCommandError,
    execute,
    beginStep,
    pause,
    resume,
    setCompletionMode,
    setSelection,
    advance: execute,
    cancel,
    dismiss,
    tickWorldTime,
  };
}

function matchesKind(kind) {
  return (run) => kind === 'all' || activityKind(run) === kind;
}

function matchesSearch(query) {
  const normalized = String(query ?? '')
    .trim()
    .toLocaleLowerCase();
  if (!normalized) return () => true;
  return (run) =>
    [run?.names?.title, run?.names?.subtitle, run?.craftingSystemName].some((value) =>
      String(value ?? '')
        .toLocaleLowerCase()
        .includes(normalized)
    );
}

function matchesActiveStatus(status) {
  if (status === 'all') return () => true;
  const members = ACTIVE_STATUS_MEMBERS[status] ?? [status];
  return (run) => members.includes(run?.derivedStatus);
}

function activityKind(run) {
  return run?.activityKind ?? run?.runType ?? 'crafting';
}

function countActiveStatuses(runs) {
  const counts = { all: runs.length, ready: 0, inProgress: 0, paused: 0 };
  for (const run of runs) {
    for (const [tab, members] of Object.entries(ACTIVE_STATUS_MEMBERS)) {
      if (members.includes(run?.derivedStatus)) counts[tab] += 1;
    }
  }
  return counts;
}

function resolveRun(runOrId, runType, listing) {
  if (runOrId && typeof runOrId === 'object') return runOrId;
  const id = String(runOrId ?? '');
  const all = [...(listing?.activeRuns ?? []), ...(listing?.history ?? [])];
  return all.find((run) => run?.id === id && (!runType || run?.runType === runType)) ?? null;
}

function runKey(run, listing) {
  if (run?.key) return run.key;
  return JSON.stringify([
    run?.actorUuid ?? listing?.selectedActorUuid ?? listing?.selectedActorId ?? null,
    run?.runType ?? 'crafting',
    run?.id ?? null,
  ]);
}

function stageAnchor(run) {
  const current = run.stepIndex == null ? null : Number(run.stepIndex);
  if (Number.isSafeInteger(current)) return current;
  if (!run.lifecycleContract || run.lifecycleContract === 'legacy') {
    const executed =
      run.steps?.findLastIndex((step) => ['succeeded', 'failed', 'done'].includes(step?.status)) ??
      -1;
    if (executed >= 0) return executed;
  }
  return Math.max(0, (run.steps?.length ?? 1) - 1);
}

function normalizeStageIndex(run, value) {
  const upper = Math.max(0, (run?.steps?.length ?? 1) - 1);
  const index = Math.trunc(Number(value) || 0);
  return Math.min(upper, Math.max(0, index));
}

function clampPage(value, pageSize, itemCount) {
  const requested = Math.max(0, Math.trunc(Number(value) || 0));
  const last = Math.max(0, Math.ceil(itemCount / pageSize) - 1);
  return Math.min(requested, last);
}

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function runAvailableAt(run) {
  const availableAt = Number(run?.timeGate?.availableAt);
  return Number.isFinite(availableAt) ? availableAt : null;
}

function isReady(run, worldTime) {
  if (run?.derivedStatus === 'paused') return false;
  const availableAt = runAvailableAt(run);
  return availableAt === null ? true : availableAt <= worldTime;
}

function compareSoonestReady(left, right, worldTime) {
  const leftReady = isReady(left, worldTime);
  const rightReady = isReady(right, worldTime);
  if (leftReady !== rightReady) return leftReady ? -1 : 1;
  const leftAt = runAvailableAt(left) ?? 0;
  const rightAt = runAvailableAt(right) ?? 0;
  if (leftAt !== rightAt) return leftAt - rightAt;
  return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
}

function compareNewest(left, right) {
  const delta = (Number(right?.startedAt) || 0) - (Number(left?.startedAt) || 0);
  return delta || String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
}

function compareNewestFinished(left, right) {
  const delta = (Number(right?.finishedAt) || 0) - (Number(left?.finishedAt) || 0);
  return delta || String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
}

function compareOldestFinished(left, right) {
  return -compareNewestFinished(left, right);
}
