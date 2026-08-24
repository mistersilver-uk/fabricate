import { RunContainerManagerBase } from './runContainerStore.js';
import { selectWritableActors } from './writableActors.js';

const HISTORY_LIMIT = 50;

/**
 * Manages actor-scoped salvage runs (active + history). The per-actor cache, baseline
 * snapshots, document-coherent persistence, and run getters live in
 * {@link RunContainerManagerBase}; this class adds the salvage-specific run lifecycle.
 */
export class SalvageRunManager extends RunContainerManagerBase {
  /**
   * @param {object} [deps]
   * @param {() => boolean} [deps.isPrimaryGM] Primary-GM gate for the timed
   *   world-time resume path (issue 656). `processWorldTime` runs off the synced
   *   `updateWorldTime` hook, so without this every connected client resumes a
   *   maturing run and races the broadcast `setFlag` write. The default `() => true`
   *   is intentional: unit fixtures build no `activeGM` and must still resume, and
   *   the immediate `CraftingEngine.salvage()` path never routes through here. Because
   *   the default fails OPEN, the real `game.users.activeGM?.id === game.user?.id`
   *   check is WIRED at construction in `main.js` — that wiring is load-bearing.
   */
  constructor({ isPrimaryGM = () => true } = {}) {
    super({ flagKey: 'salvageRuns' });
    this._isPrimaryGM = typeof isPrimaryGM === 'function' ? isPrimaryGM : () => true;
  }

  findActiveRunForComponent(actor, craftingSystemId, componentId) {
    const runs = this.getActiveRuns(actor);
    return (
      runs.find(
        (run) => run?.craftingSystemId === craftingSystemId && run?.componentId === componentId
      ) || null
    );
  }

  async createRun(actor, runData = {}) {
    const container = this._getContainer(actor);
    const now = this._nowWorldTime();
    const runId = foundry.utils.randomID();
    const run = {
      // Defaults first; `...runData` lets the caller override; then the
      // authoritative fields below are re-asserted so they cannot be clobbered.
      craftingSystemId: null,
      componentId: null,
      status: 'inProgress',
      startedAt: now,
      finishedAt: undefined,
      timeGate: undefined,
      checkResult: undefined,
      consumedComponents: [],
      usedTools: [],
      createdResults: [],
      failureReason: undefined,
      ...runData,
      id: runId,
      actorUuid: runData.actorUuid || actor.uuid,
      userId: runData.userId ?? game.user?.id ?? null,
      updatedAt: now,
    };

    if (run.status === 'waitingTime' || run.status === 'inProgress') {
      container.active[runId] = run;
      await this._persist(actor, container);
      return run;
    }

    container.history.unshift(run);
    if (container.history.length > HISTORY_LIMIT) {
      container.history = container.history.slice(0, HISTORY_LIMIT);
    }
    await this._persist(actor, container);
    return run;
  }

  async updateRun(actor, run) {
    const container = this._getContainer(actor);
    if (!container.active?.[run.id]) return null;
    run.updatedAt = this._nowWorldTime();
    container.active[run.id] = run;
    await this._persist(actor, container);
    return run;
  }

  async markRunWaitingForTime(actor, run, timeRequirement) {
    const seconds = this._durationToSeconds(timeRequirement);
    if (seconds <= 0) return run;

    const worldTime = this._nowWorldTime();
    const nextRun = run || (await this.createRun(actor, {}));
    const existingGate = nextRun.timeGate;
    if (!existingGate) {
      nextRun.timeGate = {
        requiredSeconds: seconds,
        initiatedAt: worldTime,
        availableAt: worldTime + seconds,
      };
    }
    nextRun.status = 'waitingTime';
    nextRun.updatedAt = worldTime;
    return this.updateRun(actor, nextRun);
  }

  canProceedTimeGate(run, worldTime = this._nowWorldTime()) {
    if (!run?.timeGate) return true;
    return Number(worldTime) >= Number(run.timeGate.availableAt || 0);
  }

  async markRunInProgress(actor, run) {
    if (!run) return null;
    run.status = 'inProgress';
    run.updatedAt = this._nowWorldTime();
    return this.updateRun(actor, run);
  }

  /**
   * Archive an active run to history with a terminal status and whatever the caller has
   * to record about how it ended.
   *
   * ## The payload is NOT an allowlist, and one field now depends on that
   *
   * `...payload` is spread wholesale between the run and the authoritative status fields,
   * so any key a caller passes lands on the persisted record and survives the
   * flag round-trip — `_normalizeContainer` normalizes the CONTAINER, never the individual
   * run records. That is a deliberate property of this class (the salvage `resultOrder`
   * capture already relies on it) and it is what lets `salvage()` write
   * `firedComplications` here rather than amending an archived entry afterwards, which
   * this class offers no way to do (issue 1286).
   *
   * `firedComplications` is `[{resultId, componentId, complicationId, buckets}]` and is
   * REDACTED BY THE CALLER, at the write, through `publicComplications`. That is not a
   * caller courtesy this class could take over: the container is an actor flag replicated
   * to every client with permission on the actor — for a player character, the owning
   * player — so a `gmOnly` complication reaching this method has already leaked, whatever
   * this method then does with it. Redacting on the way OUT would be too late and would
   * also be the wrong shape, because history records are read straight off the flag by
   * surfaces that never call back through here.
   *
   * The list may legitimately hold SEVERAL records differing only in `resultId`: a
   * complication fires per result entry, so a component staged twice that went wrong twice
   * wrote two firings. Nothing on the write path may de-duplicate them.
   *
   * A run that fired nothing player-visible carries no such key at all, matching the
   * omitted-when-default doctrine the rest of the persisted shapes follow.
   *
   * @param {Actor} actor
   * @param {object} run The active run being completed.
   * @param {'succeeded'|'failed'|'cancelled'} [status]
   * @param {object} [payload] Terminal evidence, spread verbatim onto the record.
   * @returns {Promise<object>} the archived record.
   */
  async completeRun(actor, run, status = 'succeeded', payload = {}) {
    const container = this._getContainer(actor);
    if (!container.active?.[run.id]) return run;

    const now = this._nowWorldTime();
    const completed = {
      ...run,
      ...payload,
      status,
      updatedAt: now,
      finishedAt: payload.finishedAt ?? now,
    };

    delete container.active[run.id];
    container.history.unshift(completed);
    if (container.history.length > HISTORY_LIMIT) {
      container.history = container.history.slice(0, HISTORY_LIMIT);
    }
    await this._persist(actor, container);
    return completed;
  }

  async cancelRun(actor, runId, reason = 'Salvage cancelled') {
    const run = this.getActiveRun(actor, runId);
    if (!run) return null;
    return this.completeRun(actor, run, 'cancelled', {
      failureReason: run.failureReason || reason,
    });
  }

  /**
   * Discard an active salvage run WITHOUT recording it in history — for a run that
   * was created but never legitimately resolved (e.g. the player dismissed the
   * interactive roll dialog before the check ran). Unlike {@link cancelRun}, which
   * archives to history as `cancelled`, this leaves no trace: the attempt never
   * began. Mirrors `CraftingRunManager#discardRun`.
   *
   * @param {Actor} actor
   * @param {string} runId
   * @returns {Promise<object|null>} the discarded run, or null if not active
   */
  async discardRun(actor, runId) {
    const container = this._getContainer(actor);
    const run = container.active?.[runId];
    if (!run) return null;
    delete container.active[runId];
    await this._persist(actor, container);
    return run;
  }

  async processWorldTime(worldTime = this._nowWorldTime(), onReadyRun = null) {
    // Timed resume only (issue 656): this is the exclusively timed path (callers are
    // CraftingEngine.processPendingSalvageRuns and startup processFabricateWorldTime),
    // driven from the synced updateWorldTime hook. Gate to the primary GM so exactly
    // one client resumes maturing runs and persists the broadcast setFlag write.
    // Immediate CraftingEngine.salvage() never routes here, so it stays on the acting
    // client. If only players are online the resume defers until the primary GM
    // connects and its startup pass catches up any matured run.
    if (this._isPrimaryGM() !== true) return;
    for (const actor of game.actors || []) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const run of Object.values(container.active || {})) {
        if (run.status !== 'waitingTime') continue;
        if (!run.timeGate) continue;
        if (Number(worldTime) < Number(run.timeGate.availableAt || 0)) continue;

        run.status = 'inProgress';
        run.updatedAt = Number(worldTime);
        dirty = true;
        if (typeof onReadyRun === 'function') {
          await onReadyRun(actor, run);
        }
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }

  /**
   * Startup maintenance: drop salvage runs naming a deleted crafting system or a
   * component that system no longer defines.
   *
   * Scoped to the actors THIS client may write (issue 970) — it runs on every
   * client at `initialize()`, where a player owns only their own characters.
   */
  async cleanupInvalidRuns(validSystemIds = new Set(), validComponentIdsBySystem = new Map()) {
    for (const actor of selectWritableActors(game.actors)) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        const systemValid = run?.craftingSystemId && validSystemIds.has(run.craftingSystemId);
        const validComponents = validComponentIdsBySystem.get(run?.craftingSystemId) || new Set();
        const componentValid = run?.componentId && validComponents.has(run.componentId);
        if (systemValid && componentValid) continue;
        delete container.active[runId];
        dirty = true;
      }

      const nextHistory = (container.history || []).filter((run) => {
        const systemValid = run?.craftingSystemId && validSystemIds.has(run.craftingSystemId);
        const validComponents = validComponentIdsBySystem.get(run?.craftingSystemId) || new Set();
        const componentValid = run?.componentId && validComponents.has(run.componentId);
        return systemValid && componentValid;
      });
      if (nextHistory.length !== (container.history || []).length) {
        container.history = nextHistory;
        dirty = true;
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }

  async removeRunsForSystem(systemId, options = {}) {
    const {
      cancelActive = true,
      removeHistory = true,
      cancellationReason = 'Salvage system disabled',
    } = options;

    for (const actor of game.actors || []) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        if (run?.craftingSystemId !== systemId) continue;
        delete container.active[runId];
        if (cancelActive) {
          container.history.unshift({
            ...run,
            status: 'cancelled',
            failureReason: run.failureReason || cancellationReason,
            updatedAt: this._nowWorldTime(),
            finishedAt: this._nowWorldTime(),
          });
        }
        dirty = true;
      }

      if (removeHistory) {
        const nextHistory = (container.history || []).filter(
          (run) => run?.craftingSystemId !== systemId
        );
        if (nextHistory.length !== (container.history || []).length) {
          container.history = nextHistory;
          dirty = true;
        }
      }

      if (container.history.length > HISTORY_LIMIT) {
        container.history = container.history.slice(0, HISTORY_LIMIT);
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }

  async removeRunsForComponent(componentId, options = {}) {
    const {
      systemId = null,
      cancelActive = true,
      removeHistory = true,
      cancellationReason = 'Salvage component removed',
    } = options;

    for (const actor of game.actors || []) {
      const container = this._getContainer(actor);
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active || {})) {
        const componentMatches = run?.componentId === componentId;
        const systemMatches = !systemId || run?.craftingSystemId === systemId;
        if (!componentMatches || !systemMatches) continue;
        delete container.active[runId];
        if (cancelActive) {
          container.history.unshift({
            ...run,
            status: 'cancelled',
            failureReason: run.failureReason || cancellationReason,
            updatedAt: this._nowWorldTime(),
            finishedAt: this._nowWorldTime(),
          });
        }
        dirty = true;
      }

      if (removeHistory) {
        const nextHistory = (container.history || []).filter((run) => {
          const componentMatches = run?.componentId === componentId;
          const systemMatches = !systemId || run?.craftingSystemId === systemId;
          return !(componentMatches && systemMatches);
        });
        if (nextHistory.length !== (container.history || []).length) {
          container.history = nextHistory;
          dirty = true;
        }
      }

      if (container.history.length > HISTORY_LIMIT) {
        container.history = container.history.slice(0, HISTORY_LIMIT);
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }
}
