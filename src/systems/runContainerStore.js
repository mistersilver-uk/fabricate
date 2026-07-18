import { getFabricateFlag } from '../config/flags.js';

import { persistFabricateRunContainer, runContainerBaseline } from './runContainerCoherence.js';

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
  /**
   * @param {object} args
   * @param {string} args.flagKey the container flag key ('craftingRuns' | 'salvageRuns')
   */
  constructor({ flagKey }) {
    this._flagKey = flagKey;
    this._cache = new Map(); // actorId -> container
    // actorId -> { activeKeys, historyIds } this manager last observed, so `_persist`
    // can reconcile against the document and remove only what THIS writer dropped
    // (never another client's concurrently-added run). See runContainerCoherence.
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
    // Reconcile the about-to-persist container against the CURRENT document, cache the
    // reconciled reference, and write the flag with explicit removed-key deletion, so a
    // stale in-memory view cannot clobber runs written out-of-band by another
    // client/session or the world-time resume (issues 733 + 739). See the shared helper.
    await persistFabricateRunContainer({
      actor,
      container,
      flagKey: this._flagKey,
      normalizeContainer: (raw) => this._normalizeContainer(raw),
      cache: this._cache,
      baseline: this._baseline,
      historyLimit: HISTORY_LIMIT,
    });
  }

  _recordBaseline(actorId, container) {
    this._baseline.set(actorId, runContainerBaseline(container));
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
    // Snapshot the active keys + history ids the caller is about to mutate from, so
    // `_persist` can distinguish an intentional removal from a run this manager never
    // observed (another client's concurrent write).
    this._recordBaseline(actor.id, container);
    return container;
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
