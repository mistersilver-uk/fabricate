import { getFabricateFlag } from '../config/flags.js';

import {
  reconcileAgainstDocument,
  compareFinishedAtNewestFirst,
  runContainerBaseline,
} from './runContainerCoherence.js';
import {
  historyEvidenceFields,
  itemReceipt,
  preserveSettledHistory,
  writeAcknowledgedRunContainer,
} from './runHistoryEvidence.js';

const HISTORY_LIMIT = 50;

/**
 * Shared actor-scoped run-container plumbing for the doubly-nested Fabricate run
 * managers (crafting + salvage). Owns the per-actor in-memory cache, the last-observed
 * baseline snapshots, document-coherent persistence, container normalization, world-time
 * / duration helpers, and the run getters. The crafting and salvage managers are
 * identical here apart from their flag key, so each subclass passes its own via
 * `super({ flagKey })` and adds only its domain-specific methods.
 *
 * The gathering manager keeps its own store: its flag lives at a single scope, its
 * container normalizer is actor-aware, and it keys by actor uuid rather than `actor.id`.
 */
export class RunContainerManagerBase {
  /** `flagKey` is the container flag, `'craftingRuns'` or `'salvageRuns'`. */
  constructor({ flagKey }) {
    this._flagKey = flagKey;
    this._cache = new Map(); // actorId -> container
    // actorId -> the `{ activeKeys, historyIds }` last observed, so `_persist` removes only what
    // THIS writer dropped, never another client's concurrent run (see runContainerCoherence).
    this._baseline = new Map();
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
    const current = this._normalizeContainer(getFabricateFlag(actor, this._flagKey, null));
    const next = this._normalizeContainer(JSON.parse(JSON.stringify(container)));
    next.history = preserveSettledHistory(current.history, next.history);
    const reconciled = reconcileAgainstDocument({
      current,
      next,
      baseline: this._baseline.get(actor.id),
      compareHistory: compareFinishedAtNewestFirst,
      historyLimit: HISTORY_LIMIT,
    });
    for (const run of reconciled.history) delete reconciled.active[run.id];
    try {
      await writeAcknowledgedRunContainer(
        actor,
        'fabricate',
        `fabricate.${this._flagKey}`,
        current,
        reconciled
      );
    } catch (error) {
      this.invalidateCache(actor.id);
      throw error;
    }
    Object.assign(container, reconciled);
    this._cache.set(actor.id, structuredClone(reconciled));
    this._recordBaseline(actor.id, reconciled);
  }

  _recordBaseline(actorId, container) {
    this._baseline.set(actorId, runContainerBaseline(container));
  }

  async settleHistory(actor, runId, payload = {}) {
    this.invalidateCache(actor.id);
    const container = this._getContainer(actor);
    const run = container.history.find((entry) => entry.id === runId);
    if (!run || Object.hasOwn(run, 'lifecycleVersion'))
      throw new Error('Native terminal history is required');
    const settlement = Object.values(run.historySettlement ?? {});
    if (settlement.length > 0 && !settlement.includes('pending')) return structuredClone(run);
    Object.assign(run, historyEvidenceFields(payload));
    for (const field of ['consumedIngredients', 'consumedComponents', 'createdResults']) {
      if (Array.isArray(payload[field])) run[field] = payload[field].map(itemReceipt);
    }
    await this._persist(actor, container);
    return structuredClone(run);
  }

  invalidateCache(actorId = null) {
    if (actorId) {
      this._cache.delete(actorId);
      this._baseline.delete(actorId);
    } else {
      this._cache.clear();
      this._baseline.clear();
    }
  }

  _getContainer(actor) {
    const container = this._cache.has(actor.id)
      ? this._cache.get(actor.id)
      : this._normalizeContainer(getFabricateFlag(actor, this._flagKey, null));
    // Snapshot what the caller is about to mutate from, so `_persist` can tell an intentional
    // removal from a run another client added concurrently.
    this._recordBaseline(actor.id, container);
    return structuredClone(container);
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
}

export const RUN_CONTAINER_HISTORY_LIMIT = HISTORY_LIMIT;
