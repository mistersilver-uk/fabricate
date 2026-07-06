import {
  getFabricateFlag,
  setFabricateFlag,
  deleteRemovedActiveRunFlags,
} from '../config/flags.js';

const HISTORY_LIMIT = 50;

/**
 * Manages actor-scoped salvage runs (active + history).
 */
export class SalvageRunManager {
  constructor() {
    this._cache = new Map(); // actorId -> container
  }

  _normalizeContainer(raw = {}) {
    const active = raw?.active && typeof raw.active === 'object' ? { ...raw.active } : {};
    const history = Array.isArray(raw?.history) ? [...raw.history] : [];
    return { active, history };
  }

  _nowWorldTime() {
    return Number(game.time?.worldTime || 0);
  }

  _durationToSeconds(timeRequirement = null) {
    if (!timeRequirement || typeof timeRequirement !== 'object') return 0;
    const minutes = Number(timeRequirement.minutes || 0);
    const hours = Number(timeRequirement.hours || 0);
    const days = Number(timeRequirement.days || 0);
    const months = Number(timeRequirement.months || 0);
    const years = Number(timeRequirement.years || 0);
    const daySeconds = 24 * 60 * 60;

    return Math.max(
      0,
      minutes * 60 +
        hours * 60 * 60 +
        days * daySeconds +
        months * 30 * daySeconds +
        years * 365 * daySeconds
    );
  }

  async _persist(actor, container) {
    this._cache.set(actor.id, container);
    // setFlag's recursive merge can't delete removed `active` keys; do it explicitly
    // so completed/cleared runs don't resurrect on reload (see the shared helper).
    await deleteRemovedActiveRunFlags(actor, 'salvageRuns', container);
    await setFabricateFlag(actor, 'salvageRuns', container);
  }

  invalidateCache(actorId = null) {
    if (actorId) {
      this._cache.delete(actorId);
    } else {
      this._cache.clear();
    }
  }

  _getContainer(actor) {
    if (this._cache.has(actor.id)) {
      return this._cache.get(actor.id);
    }
    return this._normalizeContainer(getFabricateFlag(actor, 'salvageRuns', null));
  }

  getActiveRuns(actor) {
    const container = this._getContainer(actor);
    return Object.values(container.active || {});
  }

  getActiveRun(actor, runId) {
    const container = this._getContainer(actor);
    return container.active?.[runId] || null;
  }

  getRunHistory(actor, limit = null) {
    const container = this._getContainer(actor);
    const history = Array.isArray(container.history) ? container.history : [];
    if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) return [...history];
    return history.slice(0, Number(limit));
  }

  getRun(actor, runId) {
    if (!runId) return null;
    const container = this._getContainer(actor);
    if (container.active?.[runId]) return container.active[runId];
    return (container.history || []).find((run) => run?.id === runId) || null;
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

  async cleanupInvalidRuns(validSystemIds = new Set(), validComponentIdsBySystem = new Map()) {
    for (const actor of game.actors || []) {
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
