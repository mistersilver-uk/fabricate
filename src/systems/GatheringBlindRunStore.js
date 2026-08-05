/**
 * World-scoped secret state for in-flight BLIND gathering runs (issue 901).
 *
 * ## Why this exists
 *
 * A gathering run is persisted in `flags.fabricate.gatheringRuns` on the
 * gathering actor, and Foundry pushes an owned Actor's full source — flags
 * included — to that client. A blind run that stored its drawn `taskId` there
 * was therefore readable by the player before any reveal policy disclosed it,
 * AND writable by them, because a player may update a document they own.
 *
 * ## What this store does and does NOT buy
 *
 * The boundary this store draws is INTEGRITY, not confidentiality. Foundry
 * 14.361 has no server-side read authorization: `dist/packages/world.mjs`
 * assembles the world payload by calling `dump()` on every collection and never
 * passes the requesting user, so `ownership.default = NONE` means "sent but
 * hidden in the sidebar", not "withheld". A determined player with a console can
 * still READ a world Setting. What they can no longer do is FORGE one: Foundry's
 * `BaseSetting.#canModify` requires the `SETTINGS_MODIFY` permission, whose
 * `requiredRoles` is `[GAMEMASTER]`, so a player-authored write to a
 * `scope: 'world'` setting is refused at the server. That is the whole point of
 * putting the drawn task, its start-time snapshot, and its node reservation
 * here rather than on a flag the player owns.
 *
 * Encryption (AES-GCM keyed from a GM `scope: 'client'` setting) was considered
 * and rejected: the key would be browser-bound and per-GM, so a cache clear or a
 * second GM leaves in-flight runs undecryptable.
 *
 * ## Single-writer rule (load-bearing)
 *
 * `game.settings.set` REPLACES the stored value; it does not merge. Every
 * mutation here is therefore a read-modify-write of the whole map, which is only
 * safe because exactly one client ever writes it: the active GM. Player-side
 * blind starts are relayed to that GM (see `gatheringBlindRunSocket.js`), and
 * `canWrite()` fails closed on any other client. Do NOT add a second writer
 * without introducing a compare-and-set — there is none anywhere in this module.
 *
 * ## Liveness
 *
 * A record is meaningful only while its run is still active on its actor. The
 * injected `isRunActive` predicate lets reads ignore, and `prune()` delete,
 * records whose run has completed, been cancelled, or had its actor/environment
 * deleted out from under it. That is what makes a reservation PROVISIONAL: a run
 * that never matures releases its claim on the pool without the real
 * `nodeRuntime` count ever having moved.
 */

/** Units one blind run reserves from a node pool. One attempt, one node. */
export const BLIND_RESERVATION_UNITS = 1;

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * Normalize one stored record, or null when it cannot identify a run.
 *
 * @param {string} runId
 * @param {*} raw
 * @returns {object|null}
 */
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
   * @param {object} deps
   * @param {Function} deps.getSetting `(key) => value` reader for the world setting.
   * @param {Function} deps.setSetting `(key, value) => Promise` writer. GM-only at
   *   the server; see the single-writer rule above.
   * @param {string} deps.settingKey The `fabricate` setting key holding the map.
   * @param {Function} [deps.isActiveGM] `() => boolean`. Defaults to `true` so unit
   *   fixtures (which model no relay) write directly; `main.js` wires the real check.
   * @param {Function|null} [deps.isRunActive] `({ actorUuid, runId }) => boolean`.
   *   Absent means "treat every record as live", which is correct for fixtures and
   *   merely conservative in production (a stale reservation over-counts rather than
   *   under-counts, so a pool is never over-harvested because the predicate is missing).
   * @param {Function} [deps.nowWorldTime] `() => number` stamp for new records.
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

  /**
   * Whether this client may write the world setting. Fails closed: a caller that
   * cannot write must relay to the active GM rather than attempt the write and
   * eat a server-side permission rejection.
   *
   * @returns {boolean}
   */
  canWrite() {
    return this.isActiveGM() === true;
  }

  /**
   * The raw stored map (`runId -> record`), never null.
   * @returns {object}
   * @private
   */
  _stored() {
    return plainObject(this.getSetting?.(this.settingKey)) || {};
  }

  /**
   * Whether a normalized record's run is still active on its actor.
   * @private
   */
  _isLive(record) {
    if (!this.isRunActive) return true;
    return this.isRunActive({ actorUuid: record.actorUuid, runId: record.runId }) === true;
  }

  /**
   * The secret record for one run, or null when there is none (which is the case
   * for every run written before this change — see the back-compat note on
   * `GatheringEngine#_hydrateBlindWaitingRun`).
   *
   * @param {string} runId
   * @returns {object|null}
   */
  get(runId) {
    const id = stringOrNull(runId);
    if (!id) return null;
    return normalizeRecord(id, this._stored()[id]);
  }

  /**
   * Every live record. Dead records (run completed/cancelled/deleted) are skipped
   * rather than deleted, so a read never needs write permission.
   *
   * @returns {object[]}
   */
  list() {
    return Object.entries(this._stored())
      .map(([runId, raw]) => normalizeRecord(runId, raw))
      .filter((record) => record && this._isLive(record));
  }

  /**
   * How many node units are currently RESERVED but not yet consumed for one
   * `(environment, task)` pool. This is the number a start-time availability
   * check must subtract from `nodeRuntime.current`, or a party could hold more
   * outstanding blind runs than the pool can pay out.
   *
   * @param {object} args
   * @param {string} args.environmentId
   * @param {string} args.taskId
   * @param {string|null} [args.excludeRunId] Ignore this run's own reservation.
   * @returns {number}
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

  /**
   * Record a blind run's secret state: the drawn task, its start-time snapshot,
   * and its provisional node reservation. GM-only.
   *
   * @param {object} record
   * @returns {Promise<object|null>} The stored record, or null when refused.
   */
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
    // Read-modify-write of the WHOLE map: `game.settings.set` replaces rather
    // than merges. Safe only because the active GM is the single writer.
    await this.setSetting?.(this.settingKey, {
      ...this._stored(),
      [normalized.runId]: normalized,
    });
    return normalized;
  }

  /**
   * Drop one run's secret record, releasing any node reservation it held. The
   * real `nodeRuntime` pool is untouched — a reservation that is released was
   * never a decrement, which is what makes cancellation free of a
   * "reserved but not consumed" limbo state.
   *
   * @param {string} runId
   * @returns {Promise<object|null>} The removed record, or null when absent/refused.
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
   * Delete every record whose run is no longer active. This is the safety net
   * that keeps a reservation provisional under paths that never reach the
   * maturity release — a GM deleting the environment, task, or actor, or a run
   * container rewritten out of band.
   *
   * @returns {Promise<string[]>} The run ids removed.
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
