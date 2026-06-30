/**
 * journalStore — shared Svelte 5 runes store for the player-facing Journal
 * screen (active + terminal run monitoring, crafting "Trigger Next Step").
 *
 * Mirrors {@link createActorBarStore}: the factory is plain and never touches
 * Foundry globals (`game`/`ui`/`Hooks`). All data and side effects go through the
 * injected `services` bag (`listJournalForActor`, `advanceCraftingRun`,
 * `getWorldTime`, `getSelectedActorId`, `notify`), preserving the
 * presentational-component boundary. Re-fetch effects (actor change, scene
 * change, `updateWorldTime`) live in the hosting view, not here.
 *
 * Readiness is computed from `run.timeGate.availableAt <= getWorldTime()` — never
 * from `run.status` — because the engine flips matured `waitingTime` runs to
 * `inProgress` asynchronously off the same world-time hook. `worldTimeTick` is a
 * reactive nudge so the derived getters recompute when world time advances.
 *
 * @param {object} deps
 * @param {object} deps.services Injected services bag.
 * @returns {object} The reactive journal store.
 */
const HISTORY_PAGE_SIZES = Object.freeze([6, 12, 25]);
const RECENT_TERMINAL_LIMIT = 3;

export function createJournalStore({ services } = {}) {
  let listing = $state(null);
  let loading = $state(false);
  let error = $state(false);
  let selectedRunId = $state('');
  let activeSort = $state('soonestReady');
  let historySort = $state('newest');
  let historyPage = $state(0);
  let historyPageSize = $state(HISTORY_PAGE_SIZES[0]);
  let busyRunId = $state('');
  let worldTimeTick = $state(0);
  let loadedOnce = $state(false);

  function worldTime() {
    // Read the reactive tick so derived getters recompute on world-time change;
    // the actual value comes from the (non-reactive) services seam.
    void worldTimeTick;
    return Number(services?.getWorldTime?.() ?? 0);
  }

  const activeRuns = $derived.by(() => {
    const runs = [...(listing?.activeRuns ?? [])];
    const now = worldTime();
    const comparator =
      activeSort === 'newest' ? compareNewest : (left, right) => compareSoonestReady(left, right, now);
    return runs.sort(comparator);
  });

  const sortedHistory = $derived.by(() => {
    const runs = [...(listing?.history ?? [])];
    return runs.sort(historySort === 'oldest' ? compareOldestFinished : compareNewestFinished);
  });

  const historyPageItems = $derived.by(() => {
    const start = historyPage * historyPageSize;
    return sortedHistory.slice(start, start + historyPageSize);
  });

  const recentTerminalRuns = $derived(sortedHistory.slice(0, RECENT_TERMINAL_LIMIT));

  const selectedRun = $derived.by(() => {
    const active = activeRuns;
    const history = sortedHistory;
    const match = [...active, ...history].find((run) => run?.id === selectedRunId);
    if (match) return match;
    return active[0] ?? history[0] ?? null;
  });

  const navCount = $derived(Number(listing?.counts?.active ?? 0));

  /**
   * Fetch the unified listing for the remembered actor. Sets `loading` unless
   * `quiet` (a background refresh from a world-time / scene / advance event).
   *
   * @param {boolean} [quiet] Suppress the loading flag + error reset.
   * @returns {Promise<void>}
   */
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
    } catch {
      error = true;
    } finally {
      loading = false;
      loadedOnce = true;
    }
  }

  function select(runId) {
    selectedRunId = runId ?? '';
  }

  function setActiveSort(next) {
    if (next === 'soonestReady' || next === 'newest') activeSort = next;
  }

  function setHistorySort(next) {
    if (next === 'newest' || next === 'oldest') historySort = next;
    historyPage = 0;
  }

  function setHistoryPage(next) {
    const page = Math.max(0, Math.trunc(Number(next) || 0));
    historyPage = page;
  }

  function setHistoryPageSize(next) {
    const size = Number(next);
    if (HISTORY_PAGE_SIZES.includes(size)) {
      historyPageSize = size;
      historyPage = 0;
    }
  }

  /**
   * Advance a crafting run's current step. Guards re-entrancy via `busyRunId`,
   * surfaces the engine result message, then quietly re-fetches so the run's new
   * step / terminal state (and the selected-run fallback) reflect immediately.
   *
   * Threads the loaded listing's `selectedActorId` (the world-actor `.id` the
   * runs are keyed to) so the Foundry edge can resolve the crafting actor via
   * `game.actors.get` — without it the advance always returns NeedsOwner.
   *
   * @param {object} run The crafting RunModel to advance.
   * @returns {Promise<void>}
   */
  async function advance(run) {
    if (!run?.id || busyRunId) return;
    busyRunId = run.id;
    try {
      const result = await services?.advanceCraftingRun?.({
        actorId: listing?.selectedActorId ?? null,
        runId: run.id,
        recipeId: run.recipeId,
      });
      const message = result?.message;
      if (message) services?.notify?.(message);
      await load(true);
    } finally {
      busyRunId = '';
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
    get activeSort() {
      return activeSort;
    },
    get historySort() {
      return historySort;
    },
    get historyPage() {
      return historyPage;
    },
    get historyPageSize() {
      return historyPageSize;
    },
    get historyPageSizes() {
      return HISTORY_PAGE_SIZES;
    },
    get busyRunId() {
      return busyRunId;
    },
    get loadedOnce() {
      return loadedOnce;
    },
    // Reactive current world time: reads the `worldTimeTick` nudge so consumers
    // (RunCard countdowns, ActionsPanel readiness) recompute when world time
    // advances. The value itself comes from the (non-reactive) services seam.
    get worldTime() {
      return worldTime();
    },
    get activeRuns() {
      return activeRuns;
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
    get navCount() {
      return navCount;
    },
    load,
    select,
    setActiveSort,
    setHistorySort,
    setHistoryPage,
    setHistoryPageSize,
    advance,
    tickWorldTime,
  };
}

function runAvailableAt(run) {
  const availableAt = Number(run?.timeGate?.availableAt);
  return Number.isFinite(availableAt) ? availableAt : null;
}

/**
 * A run is "ready" when its current time gate has matured (or there is no gate —
 * an un-armed crafting step is actionable now). Readiness is derived from
 * `availableAt <= worldTime`, NOT from `run.status`.
 */
function isReady(run, worldTime) {
  const availableAt = runAvailableAt(run);
  return availableAt === null ? true : availableAt <= worldTime;
}

/**
 * Soonest-ready comparator: ready runs first, then ascending `availableAt`
 * (ready runs sort by how long they have been ready; waiting runs by how soon
 * they mature). Ties broken by id for a stable order. An explicit comparator is
 * required (a bare `Array#sort()` fails the SonarCloud gate).
 */
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
  if (delta !== 0) return delta;
  return String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
}

function compareNewestFinished(left, right) {
  const delta = (Number(right?.finishedAt) || 0) - (Number(left?.finishedAt) || 0);
  if (delta !== 0) return delta;
  return String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
}

function compareOldestFinished(left, right) {
  return -compareNewestFinished(left, right);
}
