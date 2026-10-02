/**
 * World-scoped secret state for in-flight blind gathering runs (issue 901): the drawn task, its
 * start-time snapshot and its node reservation, which on the run's actor flag the owning player
 * could read and write. The boundary is integrity, not confidentiality: Foundry 14.361 has no
 * server-side read authorization (`dist/packages/world.mjs` calls `dump()` on every collection
 * without the user), so a player can still read a world setting, but cannot forge one, since
 * `BaseSetting.#canModify` needs `SETTINGS_MODIFY`, whose `requiredRoles` is `[GAMEMASTER]`.
 *
 * Single writer: `game.settings.set` replaces the value, so every mutation rewrites the whole map,
 * safe only because the active GM alone writes it. Player starts relay through
 * `gatheringBlindRunSocket.js` and `canWrite()` fails closed; there is no compare-and-set, so a
 * second writer needs one first. A record lives only while its run is active (`isRunActive`),
 * which keeps a reservation provisional: a run that never matures never moved `nodeRuntime`.
 */

import { stringOrNull } from '../utils/scalars.js';

/** Units one blind run reserves from a node pool. One attempt, one node. */
export const BLIND_RESERVATION_UNITS = 1;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** One stored record, or `null` when it cannot identify a run. */
function normalizeRecord(runId, raw) {
  const record = plainObject(raw);
  const id = stringOrNull(runId) || stringOrNull(record?.runId);
  if (!record || !id) return null;
  const taskId = stringOrNull(record.taskId);
  if (!taskId) return null;
  return {
    runId: id,
    actorUuid: stringOrNull(record.actorUuid),
    craftingSystemId: stringOrNull(record.craftingSystemId),
    environmentId: stringOrNull(record.environmentId),
    taskId,
    snapshot: plainObject(record.snapshot),
    reservation: normalizeReservation(record.reservation),
    createdAtWorldTime: Number(record.createdAtWorldTime) || 0,
  };
}

function normalizeReservation(raw) {
  const reservation = plainObject(raw);
  const taskId = stringOrNull(reservation?.taskId);
  const environmentId = stringOrNull(reservation?.environmentId);
  if (!taskId || !environmentId) return null;
  const units = Number(reservation.units);
  return {
    environmentId,
    taskId,
    units: Number.isFinite(units) && units > 0 ? units : BLIND_RESERVATION_UNITS,
    scope: stringOrNull(reservation.scope) || 'environment',
  };
}

export class GatheringBlindRunStore {
  /**
   * `isActiveGM` defaults to `true` for fixtures that model no relay. Without `isRunActive` every
   * record is live, which over-counts reservations rather than over-harvesting a pool.
   */
  constructor({
    getSetting = null,
    setSetting = null,
    settingKey = null,
    isActiveGM = null,
    isRunActive = null,
    nowWorldTime = null,
  } = {}) {
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.settingKey = settingKey;
    this.isActiveGM = typeof isActiveGM === 'function' ? isActiveGM : () => true;
    this.isRunActive = typeof isRunActive === 'function' ? isRunActive : null;
    this.nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
  }

  /** Fails closed: a caller that cannot write relays to the active GM instead. */
  canWrite() {
    return this.isActiveGM() === true;
  }

  _stored() {
    return plainObject(this.getSetting?.(this.settingKey)) || {};
  }

  _isLive(record) {
    if (!this.isRunActive) return true;
    return this.isRunActive({ actorUuid: record.actorUuid, runId: record.runId }) === true;
  }

  /** One run's record, or `null`, as for every pre-901 run (`_hydrateBlindWaitingRun`). */
  get(runId) {
    const id = stringOrNull(runId);
    if (!id) return null;
    return normalizeRecord(id, this._stored()[id]);
  }

  /** Every live record; dead ones are skipped, not deleted, so a read never writes. */
  list() {
    return Object.entries(this._stored())
      .map(([runId, raw]) => normalizeRecord(runId, raw))
      .filter((record) => record && this._isLive(record));
  }

  /**
   * Units reserved but unconsumed on one pool, which a start-time availability check subtracts
   * from `nodeRuntime.current`; `excludeRunId` skips that run's own reservation.
   */
  reservedUnits({ environmentId, taskId, excludeRunId = null } = {}) {
    const environment = stringOrNull(environmentId);
    const task = stringOrNull(taskId);
    if (!environment || !task) return 0;
    const skip = stringOrNull(excludeRunId);
    return this.list()
      .filter((record) => record.runId !== skip && record.reservation)
      .filter(
        (record) =>
          record.reservation.environmentId === environment && record.reservation.taskId === task
      )
      .reduce((total, record) => total + record.reservation.units, 0);
  }

  /** Record a blind run's secret state, GM-only; `null` when refused. */
  async reserve({
    runId,
    actorUuid = null,
    craftingSystemId = null,
    environmentId = null,
    taskId = null,
    snapshot = null,
    reservation = null,
  } = {}) {
    if (!this.canWrite()) return null;
    const normalized = normalizeRecord(runId, {
      runId,
      actorUuid,
      craftingSystemId,
      environmentId,
      taskId,
      snapshot,
      reservation,
      createdAtWorldTime: Number(this.nowWorldTime()) || 0,
    });
    if (!normalized) return null;
    await this.setSetting?.(this.settingKey, {
      ...this._stored(),
      [normalized.runId]: normalized,
    });
    return normalized;
  }

  /**
   * Drop one run's record and its reservation; `nodeRuntime` is untouched, as a reservation was
   * never a decrement. The removed record, or `null`.
   */
  async release(runId) {
    const id = stringOrNull(runId);
    if (!id || !this.canWrite()) return null;
    const stored = this._stored();
    if (!(id in stored)) return null;
    const removed = normalizeRecord(id, stored[id]);
    const next = { ...stored };
    delete next[id];
    await this.setSetting?.(this.settingKey, next);
    return removed;
  }

  /**
   * Delete every dead record, the safety net for paths that never reach the maturity release;
   * answers the removed run ids.
   */
  async prune() {
    if (!this.canWrite() || !this.isRunActive) return [];
    const stored = this._stored();
    const next = {};
    const removed = [];
    for (const [runId, raw] of Object.entries(stored)) {
      const record = normalizeRecord(runId, raw);
      if (record && this._isLive(record)) next[record.runId] = record;
      else removed.push(runId);
    }
    if (removed.length === 0) return [];
    await this.setSetting?.(this.settingKey, next);
    return removed;
  }
}
