import { RunContainerManagerBase } from './runContainerStore.js';
import {
  assertNativeEffectsUninvoked,
  historyEvidenceFields,
  nativeHistoryRecord,
} from './runHistoryEvidence.js';
import { selectWritableActors } from './writableActors.js';

const HISTORY_LIMIT = 50;

/**
 * Manages actor-scoped salvage runs (active + history). The per-actor cache, baseline
 * snapshots, document-coherent persistence, and run getters live in
 * {@link RunContainerManagerBase}; this class adds the salvage-specific run lifecycle.
 */
export class SalvageRunManager extends RunContainerManagerBase {
  /**
   * `isPrimaryGM` gates the timed world-time resume (issue 656), so not every client resumes a
   * maturing run and races the broadcast `setFlag`. The default `() => true` fails OPEN for
   * fixtures, and the immediate `CraftingEngine.salvage()` never routes through it, so
   * `src/bootstrap/composeServices.js` wires the real `activeGM` check (load-bearing).
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

  _normalizeContainer(raw) {
    const container = super._normalizeContainer(raw);
    return {
      active: Object.fromEntries(
        Object.entries(container.active).map(([id, run]) => [id, nativeHistoryRecord(run)])
      ),
      history: container.history.map(nativeHistoryRecord),
    };
  }

  async createRun(actor, runData = {}) {
    const container = this._getContainer(actor);
    const now = this._nowWorldTime();
    const runId = foundry.utils.randomID();
    const run = nativeHistoryRecord({
      // Defaults, then the caller's `...runData`, then the authoritative fields re-asserted below.
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
      ...historyEvidenceFields(runData),
      id: runId,
      actorUuid: runData.actorUuid || actor.uuid,
      userId: runData.userId ?? game.user?.id ?? null,
      updatedAt: now,
    });

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
    container.active[run.id] = nativeHistoryRecord(run);
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
    if (run.status === 'inProgress') return run;
    run.status = 'inProgress';
    run.updatedAt = this._nowWorldTime();
    return this.updateRun(actor, run);
  }

  /**
   * Archive an active run with a terminal status. `payload` is spread verbatim, NOT allowlisted
   * (`_normalizeContainer` normalizes the container, never a record), which the salvage
   * `resultOrder` capture and `firedComplications` rely on (issue 1286). `firedComplications`,
   * `[{resultId, componentId, complicationId, buckets}]`, is REDACTED BY THE CALLER through
   * `publicComplications` at the write: the flag replicates to everyone with permission on the
   * actor, so a `gmOnly` complication reaching here has already leaked. Records differing only in
   * `resultId` are separate firings and are never de-duplicated; a run that fired nothing
   * player-visible omits the key. Answers the archived record.
   */
  async completeRun(actor, run, status = 'succeeded', payload = {}) {
    const container = this._getContainer(actor);
    if (!container.active?.[run.id]) return run;

    const now = this._nowWorldTime();
    const completed = nativeHistoryRecord({
      ...run,
      ...payload,
      ...historyEvidenceFields(payload),
      status,
      updatedAt: now,
      finishedAt: payload.finishedAt ?? now,
    });

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
    assertNativeEffectsUninvoked(run);
    return this.completeRun(actor, run, 'cancelled', {
      failureReason: run.failureReason || reason,
    });
  }

  /**
   * Discard an active salvage run WITHOUT a history entry, for a run that never legitimately
   * resolved (such as a dismissed roll dialog); `cancelRun` archives instead. `null` when not
   * active.
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
    // Timed resume only (issue 656), from the synced `updateWorldTime` hook: only the primary GM
    // resumes and writes the broadcast `setFlag`. The immediate `salvage()` never routes here;
    // with only players online the resume waits for the primary GM's startup catch-up.
    if (this._isPrimaryGM() !== true) return;
    for (const actor of game.actors || []) {
      for (const run of this.getActiveRuns(actor)) {
        if (run.status !== 'waitingTime') continue;
        if (!run.timeGate) continue;
        if (Number(worldTime) < Number(run.timeGate.availableAt || 0)) continue;
        assertNativeEffectsUninvoked(run);
        const container = this._getContainer(actor);
        if (!container.active[run.id]) continue;
        run.status = 'inProgress';
        run.updatedAt = Number(worldTime);
        container.active[run.id] = run;
        await this._persist(actor, container);
        if (typeof onReadyRun === 'function') {
          await onReadyRun(actor, run);
        }
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
