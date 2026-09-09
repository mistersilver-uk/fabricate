const PAGE_SIZES = Object.freeze([4, 6, 12, 25]);
const RECENT_TERMINAL_LIMIT = 3;
const KIND_FILTERS = new Set(['all', 'crafting', 'alchemy', 'gathering', 'salvage']);
const ACTIVE_STATUS_FILTERS = new Set(['all', 'ready', 'waiting', 'paused']);

/**
 * Reactive state for the player Journal. Foundry reads and writes remain behind
 * the injected service boundary so this module can be compiled and exercised as
 * an ordinary Svelte store.
 *
 * @param {object} deps
 * @param {object} deps.services
 * @returns {object}
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
  let worldTimeTick = $state(0);
  let loadedOnce = $state(false);
  let viewedStageByRunKey = $state({});

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
    const current = Number(run.stepIndex);
    const fallback = Number.isSafeInteger(current)
      ? current
      : Math.max(0, (run.steps?.length ?? 1) - 1);
    return normalizeStageIndex(run, Number.isSafeInteger(remembered) ? remembered : fallback);
  });
  const viewedStage = $derived.by(() => {
    if (viewedStageIndex === null) return null;
    return selectedRun?.steps?.[viewedStageIndex] ?? null;
  });
  const navCount = $derived(Number(listing?.counts?.active ?? 0));

  async function load(quiet = false) {
    if (!quiet) {
      loading = true;
      error = false;
    }
    try {
      const next = await services?.listJournalForActor?.({
        rememberedActorId: services?.getSelectedActorId?.() ?? null,
      });
      listing = next ?? null;
      error = !next;
      reconcileSelection();
      clampPages();
    } catch {
      error = true;
    } finally {
      loading = false;
      loadedOnce = true;
    }
  }

  function reconcileSelection() {
    if (!selectedRunKey && !selectedRunId) return;
    const all = [...(listing?.activeRuns ?? []), ...(listing?.history ?? [])];
    const exists = selectedRunKey
      ? all.some((run) => runKey(run, listing) === selectedRunKey)
      : all.some((run) => run?.id === selectedRunId);
    if (exists) return;
    selectedRunKey = '';
    selectedRunId = '';
  }

  function clampPages() {
    activePage = clampPage(activePage, activePageSize, activeRuns.length);
    historyPage = clampPage(historyPage, historyPageSize, sortedHistory.length);
  }

  function select(runOrId, runType = null) {
    const run = resolveRun(runOrId, runType, listing);
    selectedRunId = run?.id ?? (typeof runOrId === 'string' ? runOrId : '');
    selectedRunKey = run ? runKey(run, listing) : '';
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

  function viewStage(run, index) {
    if (!run) return;
    viewedStageByRunKey[runKey(run, listing)] = normalizeStageIndex(run, index);
  }

  function returnToCurrentStage(run = selectedRun) {
    if (!run) return;
    const current = Number(run.stepIndex);
    viewStage(run, Number.isSafeInteger(current) ? current : (run.steps?.length ?? 1) - 1);
  }

  async function execute(run, payload = { interactive: true }) {
    if (run?.lifecycleContract === 'legacy' || !run?.lifecycleContract) {
      return advanceLegacy(run);
    }
    return runCommand(run, 'execute', payload);
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
    return runCommand(run, 'setSelection', selection ?? {});
  }

  async function runCommand(run, action, payload) {
    if (
      !run?.id ||
      busyRunKey ||
      run?.lifecycleContract !== 'current' ||
      run?.actions?.[action] !== true
    )
      return;
    busyRunId = run.id;
    busyRunKey = runKey(run, listing);
    try {
      const result = await services?.executeJournalRunCommand?.({
        actorUuid: run.actorUuid ?? listing?.selectedActorUuid ?? null,
        runType: run.runType,
        runId: run.id,
        expectedRevision: normalizeRevision(run.runRevision),
        action,
        payload: payload ?? {},
      });
      if (result?.cancelled === true) return;
      if (result?.message) services?.notify?.(result.message);
      await load(true);
    } catch (err) {
      console.error(`Fabricate | Error running Journal ${action} command:`, err);
      services?.notify?.(services?.craftErrorMessage?.() ?? '');
      await load(true);
    } finally {
      busyRunId = '';
      busyRunKey = '';
    }
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
      return selectedRunId;
    },
    get selectedRunKey() {
      return selectedRunKey;
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
    execute,
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
  return (run) => status === 'all' || run?.derivedStatus === status;
}

function activityKind(run) {
  return run?.activityKind ?? run?.runType ?? 'crafting';
}

function countActiveStatuses(runs) {
  const counts = { all: runs.length, ready: 0, waiting: 0, paused: 0 };
  for (const run of runs) {
    if (run?.derivedStatus === 'ready') counts.ready += 1;
    if (run?.derivedStatus === 'waiting') counts.waiting += 1;
    if (run?.derivedStatus === 'paused') counts.paused += 1;
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
