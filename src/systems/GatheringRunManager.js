const FLAG_NAMESPACE = 'fabricate';
const FLAG_KEY = 'gatheringRuns';
const HISTORY_LIMIT = 50;

const ACTIVE_STATUSES = new Set(['inProgress', 'waitingTime']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export class GatheringRunManagerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'GatheringRunManagerError';
    this.code = code;
  }
}

/**
 * Owns actor-scoped gathering run persistence at flags.fabricate.gatheringRuns.
 * Active waitingTime runs are surfaced for completion only after their
 * timeGate.availableAt world-time target matures; terminal writes remove the
 * active run, prepend history, and preserve the active run's identity refs
 * unless a caller supplies explicit terminal redaction refs.
 */
export class GatheringRunManager {
  constructor({
    randomID = defaultRandomID,
    nowWorldTime = defaultNowWorldTime,
    getUserId = defaultGetUserId,
    getActors = defaultGetActors
  } = {}) {
    this.randomID = randomID;
    this.nowWorldTime = nowWorldTime;
    this.getUserId = getUserId;
    this.getActors = getActors;
    this._cache = new Map();
  }

  invalidateCache(actorId = null) {
    if (actorId) {
      this._cache.delete(actorId);
      return;
    }
    this._cache.clear();
  }

  getActiveRuns(actor) {
    const container = this._getContainer(actor);
    return Object.values(container.active);
  }

  getActiveRun(actor, runId) {
    if (!runId) return null;
    const container = this._getContainer(actor);
    return container.active[String(runId)] || null;
  }

  getRunHistory(actor, limit = null) {
    const container = this._getContainer(actor);
    if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) {
      return [...container.history];
    }
    return container.history.slice(0, Number(limit));
  }

  findActiveRunForTask(actor, taskId) {
    const normalizedTaskId = stringOrNull(taskId);
    if (!normalizedTaskId) return null;
    return this.getActiveRuns(actor).find(run => run.taskId === normalizedTaskId) || null;
  }

  async createRun(actor, runData = {}) {
    this._assertActor(actor);
    this._assertRunReferences(runData);
    this._assertNoActiveTaskRun(actor, runData.taskId);

    if (runData.status === 'waitingTime' && !this._normalizeTimeGate(runData.timeGate)) {
      throw new GatheringRunManagerError('Waiting gathering runs require a positive time gate', 'INVALID_TIME_GATE');
    }

    const container = cloneContainer(this._getContainer(actor));
    const now = this._now();
    const run = this._normalizeRun({
      actorUuid: actor.uuid,
      userId: this.getUserId(),
      ...pickRunPayload(runData),
      id: this.randomID(),
      status: ACTIVE_STATUSES.has(runData.status) ? runData.status : 'inProgress',
      startedAtWorldTime: now,
      updatedAtWorldTime: now
    }, { actor, terminal: false });

    container.active[run.id] = run;
    await this._persist(actor, container);
    return run;
  }

  async createWaitingRun(actor, runData = {}, timeRequirementOrGate = null) {
    const gate = this._normalizeTimeGate(timeRequirementOrGate ?? runData.timeGate ?? runData.timeRequirement);
    if (!gate) {
      throw new GatheringRunManagerError('Waiting gathering runs require a positive time gate', 'INVALID_TIME_GATE');
    }

    return this.createRun(actor, {
      ...runData,
      status: 'waitingTime',
      timeGate: gate
    });
  }

  async createTerminalRun(actor, runData = {}, status = 'succeeded', payload = {}) {
    this._assertActor(actor);
    this._assertRunReferences(runData);
    this._assertNoActiveTaskRun(actor, runData.taskId);
    if (!TERMINAL_STATUSES.has(status)) {
      throw new GatheringRunManagerError(`Invalid terminal gathering run status "${status}"`, 'INVALID_STATUS');
    }

    const container = cloneContainer(this._getContainer(actor));
    const now = this._now();
    const terminalPayload = this._terminalPayload(status, payload);
    const run = this._normalizeRun({
      actorUuid: actor.uuid,
      userId: this.getUserId(),
      ...pickRunPayload(runData),
      ...terminalPayload,
      id: this.randomID(),
      status,
      startedAtWorldTime: now,
      updatedAtWorldTime: now,
      completedAtWorldTime: now
    }, { actor, terminal: true });

    container.history = [run, ...container.history].slice(0, HISTORY_LIMIT);
    await this._persist(actor, container);
    return run;
  }

  getMaturedWaitingRuns(worldTime = this._now()) {
    const readyAt = Number(worldTime);
    if (!Number.isFinite(readyAt)) return [];

    const readyRuns = [];
    for (const actor of normalizeActorList(this.getActors())) {
      for (const run of this.getActiveRuns(actor)) {
        if (run?.status !== 'waitingTime') continue;
        if (!run.timeGate) continue;
        if (readyAt < Number(run.timeGate.availableAt || 0)) continue;
        readyRuns.push({ actor, run: cloneJson(run) });
      }
    }
    return readyRuns;
  }

  async completeRun(actor, run, status = 'succeeded', payload = {}, options = {}) {
    this._assertActor(actor);
    if (!run?.id) return null;
    if (!TERMINAL_STATUSES.has(status)) {
      throw new GatheringRunManagerError(`Invalid terminal gathering run status "${status}"`, 'INVALID_STATUS');
    }

    const container = cloneContainer(this._getContainer(actor));
    const activeRun = container.active[String(run.id)];
    if (!activeRun) return null;

    const now = this._now();
    const completed = this._normalizeRun({
      ...activeRun,
      ...pickTerminalIdentity(options.terminalRunData),
      ...this._terminalPayload(status, payload, { preserveMissingTimeGate: true }),
      status,
      updatedAtWorldTime: now,
      completedAtWorldTime: now
    }, { actor, terminal: true });

    delete container.active[completed.id];
    container.history = [completed, ...container.history].slice(0, HISTORY_LIMIT);
    await this._persist(actor, container);
    return completed;
  }

  async clearActiveRun(actor, runId) {
    this._assertActor(actor);
    if (!runId) return null;

    const container = cloneContainer(this._getContainer(actor));
    const activeRun = container.active[String(runId)];
    if (!activeRun) return null;

    delete container.active[String(runId)];
    await this._persist(actor, container);
    return activeRun;
  }

  async cancelRun(actor, runId, options = {}) {
    const run = this.getActiveRun(actor, runId);
    if (!run) return null;
    return this.completeRun(actor, run, 'cancelled', options.payload ?? {}, {
      terminalRunData: options.terminalRunData
    });
  }

  async removeRunsForSystem(systemId) {
    if (!systemId) return;
    await this._removeRunsWhere(run => run?.craftingSystemId === String(systemId));
  }

  async removeRunsForEnvironment(environmentId) {
    if (!environmentId) return;
    await this._removeRunsWhere(run => run?.environmentId === String(environmentId));
  }

  async removeRunsForTask(taskId, { environmentId = null } = {}) {
    if (!taskId) return;
    await this._removeRunsWhere(run => {
      const taskMatches = run?.taskId === String(taskId);
      const environmentMatches = !environmentId || run?.environmentId === String(environmentId);
      return taskMatches && environmentMatches;
    });
  }

  _getContainer(actor) {
    this._assertActor(actor);
    const key = actorKey(actor);
    if (this._cache.has(key)) {
      return this._cache.get(key);
    }
    const container = this._normalizeContainer(readGatheringRunsFlag(actor), actor);
    this._cache.set(key, container);
    return container;
  }

  async _persist(actor, container) {
    const normalized = this._normalizeContainer(container, actor);
    await writeGatheringRunsFlag(actor, normalized);
    this._cache.set(actorKey(actor), normalized);
  }

  _normalizeContainer(raw = {}, actor = null) {
    const active = {};
    const latestActiveByTask = new Map();
    const activeEntries = raw?.active && typeof raw.active === 'object' && !Array.isArray(raw.active)
      ? Object.entries(raw.active)
      : [];

    for (const [runId, record] of activeEntries) {
      const run = this._normalizeRun({ ...record, id: record?.id || runId }, { actor, terminal: false });
      if (!run) continue;
      const previous = latestActiveByTask.get(run.taskId);
      if (!previous || compareRunFreshness(run, previous) >= 0) {
        latestActiveByTask.set(run.taskId, run);
      }
    }

    for (const run of latestActiveByTask.values()) {
      active[run.id] = run;
    }

    const history = (Array.isArray(raw?.history) ? raw.history : [])
      .map(record => this._normalizeRun(record, { actor, terminal: true }))
      .filter(Boolean)
      .sort(compareNewestFirst)
      .slice(0, HISTORY_LIMIT);

    return { active, history };
  }

  _normalizeRun(record = {}, { actor = null, terminal = false } = {}) {
    if (!record || typeof record !== 'object') return null;
    if (!terminal && TERMINAL_STATUSES.has(record.status)) return null;

    const id = stringOrNull(record.id);
    const craftingSystemId = stringOrNull(record.craftingSystemId);
    const environmentId = stringOrNull(record.environmentId);
    const taskId = stringOrNull(record.taskId);
    if (!id || !craftingSystemId || !environmentId || !taskId) return null;

    const status = normalizeStatus(record.status, terminal);
    if (terminal && !TERMINAL_STATUSES.has(status)) return null;
    if (!terminal && !ACTIVE_STATUSES.has(status)) return null;

    const run = {
      id,
      actorUuid: stringOrNull(record.actorUuid) || stringOrNull(actor?.uuid),
      userId: stringOrNull(record.userId),
      craftingSystemId,
      environmentId,
      taskId,
      status,
      startedAtWorldTime: numberOrDefault(record.startedAtWorldTime, 0),
      updatedAtWorldTime: numberOrDefault(record.updatedAtWorldTime, record.startedAtWorldTime, 0)
    };

    if (terminal) {
      run.completedAtWorldTime = numberOrDefault(record.completedAtWorldTime, run.updatedAtWorldTime);
    }

    const timeGate = this._normalizeTimeGate(record.timeGate);
    if (timeGate) run.timeGate = timeGate;
    if (!terminal && status === 'waitingTime' && !timeGate) return null;

    if (record.checkResult && typeof record.checkResult === 'object') {
      run.checkResult = cloneJson(record.checkResult);
    }

    run.usedCatalysts = normalizeRunItems(record.usedCatalysts);
    run.createdResults = terminal && status !== 'succeeded' ? [] : normalizeRunItems(record.createdResults);

    return run;
  }

  _normalizeTimeGate(data = null) {
    if (!data || typeof data !== 'object') return null;
    const initiatedAt = numberOrDefault(data.initiatedAt, this._now());
    const declaredSeconds = numberOrDefault(data.requiredSeconds, null);
    const durationSeconds = declaredSeconds ?? durationToSeconds(data);
    const availableAt = numberOrDefault(data.availableAt, initiatedAt + durationSeconds);
    const requiredSeconds = durationSeconds > 0 ? durationSeconds : availableAt - initiatedAt;

    if (!Number.isFinite(requiredSeconds) || requiredSeconds <= 0) return null;
    if (!Number.isFinite(initiatedAt) || !Number.isFinite(availableAt)) return null;

    return {
      requiredSeconds,
      availableAt,
      initiatedAt
    };
  }

  async _removeRunsWhere(predicate) {
    for (const actor of normalizeActorList(this.getActors())) {
      const container = cloneContainer(this._getContainer(actor));
      let dirty = false;

      for (const [runId, run] of Object.entries(container.active)) {
        if (!predicate(run)) continue;
        delete container.active[runId];
        dirty = true;
      }

      const nextHistory = container.history.filter(run => !predicate(run));
      if (nextHistory.length !== container.history.length) {
        container.history = nextHistory;
        dirty = true;
      }

      if (dirty) {
        await this._persist(actor, container);
      }
    }
  }

  _assertActor(actor) {
    if (!actor || typeof actor.getFlag !== 'function' || typeof actor.setFlag !== 'function') {
      throw new GatheringRunManagerError('Gathering runs require an actor with getFlag and setFlag', 'INVALID_ACTOR');
    }
  }

  _assertRunReferences(runData) {
    for (const field of ['craftingSystemId', 'environmentId', 'taskId']) {
      if (!stringOrNull(runData?.[field])) {
        throw new GatheringRunManagerError(`Gathering run is missing ${field}`, 'MISSING_REFERENCE');
      }
    }
  }

  _assertNoActiveTaskRun(actor, taskId) {
    const existing = this.findActiveRunForTask(actor, taskId);
    if (!existing) return;
    throw new GatheringRunManagerError(
      `Actor already has an active gathering run for task "${taskId}"`,
      'DUPLICATE_ACTIVE_TASK'
    );
  }

  _terminalPayload(status, payload = {}, { preserveMissingTimeGate = false } = {}) {
    const terminalPayload = {};
    if (!preserveMissingTimeGate || payload.timeGate !== undefined) {
      terminalPayload.timeGate = payload.timeGate;
    }
    if (payload.checkResult !== undefined) terminalPayload.checkResult = payload.checkResult;
    if (payload.usedCatalysts !== undefined) terminalPayload.usedCatalysts = payload.usedCatalysts;
    terminalPayload.createdResults = status === 'succeeded' ? payload.createdResults : [];
    return terminalPayload;
  }

  _now() {
    const value = Number(this.nowWorldTime());
    return Number.isFinite(value) ? value : 0;
  }
}

function readGatheringRunsFlag(actor) {
  try {
    return actor.getFlag(FLAG_NAMESPACE, FLAG_KEY);
  } catch (_err) {
    return null;
  }
}

async function writeGatheringRunsFlag(actor, value) {
  const current = readGatheringRunsFlag(actor);
  const currentActive = current?.active && typeof current.active === 'object' && !Array.isArray(current.active)
    ? current.active
    : {};
  const nextActive = value?.active && typeof value.active === 'object' && !Array.isArray(value.active)
    ? value.active
    : {};
  const activeDeletions = Object.keys(currentActive)
    .filter(runId => !(runId in nextActive))
    .reduce((updates, runId) => {
      updates[`flags.${FLAG_NAMESPACE}.${FLAG_KEY}.active.-=${runId}`] = null;
      return updates;
    }, {});

  if (Object.keys(activeDeletions).length > 0 && typeof actor.update === 'function') {
    await actor.update(activeDeletions);
  }

  return actor.setFlag(FLAG_NAMESPACE, FLAG_KEY, cloneJson(value));
}

function pickRunPayload(data = {}) {
  const payload = {};
  for (const field of [
    'craftingSystemId',
    'environmentId',
    'taskId',
    'timeGate',
    'checkResult',
    'usedCatalysts',
    'createdResults'
  ]) {
    if (data[field] !== undefined) payload[field] = data[field];
  }
  return payload;
}

function pickTerminalIdentity(data = {}) {
  const payload = {};
  for (const field of ['craftingSystemId', 'environmentId', 'taskId']) {
    const value = stringOrNull(data?.[field]);
    if (value) payload[field] = value;
  }
  return payload;
}

function normalizeRunItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      actorUuid: stringOrNull(item.actorUuid),
      itemUuid: stringOrNull(item.itemUuid),
      quantity: positiveNumberOrDefault(item.quantity, 1)
    }))
    .filter(item => item.actorUuid && item.itemUuid);
}

function normalizeStatus(status, terminal) {
  if (terminal) {
    return TERMINAL_STATUSES.has(status) ? status : null;
  }
  return ACTIVE_STATUSES.has(status) ? status : 'inProgress';
}

function durationToSeconds(timeRequirement = {}) {
  const minutes = Number(timeRequirement.minutes || 0);
  const hours = Number(timeRequirement.hours || 0);
  const days = Number(timeRequirement.days || 0);
  const months = Number(timeRequirement.months || 0);
  const years = Number(timeRequirement.years || 0);
  const daySeconds = 24 * 60 * 60;
  const total = (minutes * 60) +
    (hours * 60 * 60) +
    (days * daySeconds) +
    (months * 30 * daySeconds) +
    (years * 365 * daySeconds);

  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

function compareNewestFirst(a, b) {
  return compareRunFreshness(b, a);
}

function compareRunFreshness(a, b) {
  const aTime = Number(a.completedAtWorldTime ?? a.updatedAtWorldTime ?? a.startedAtWorldTime ?? 0);
  const bTime = Number(b.completedAtWorldTime ?? b.updatedAtWorldTime ?? b.startedAtWorldTime ?? 0);
  if (aTime !== bTime) return aTime - bTime;
  return String(a.id).localeCompare(String(b.id));
}

function normalizeActorList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw.values === 'function') return Array.from(raw.values());
  if (typeof raw[Symbol.iterator] === 'function') return Array.from(raw);
  return [];
}

function actorKey(actor) {
  return stringOrNull(actor?.uuid) || stringOrNull(actor?.id);
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numberOrDefault(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function positiveNumberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cloneContainer(container) {
  return cloneJson(container) || { active: {}, history: [] };
}

function defaultRandomID() {
  return globalThis.foundry?.utils?.randomID?.() || `gathering-${Math.random().toString(36).slice(2)}`;
}

function defaultNowWorldTime() {
  return Number(globalThis.game?.time?.worldTime || 0);
}

function defaultGetUserId() {
  return globalThis.game?.user?.id || null;
}

function defaultGetActors() {
  return globalThis.game?.actors || [];
}

export const GATHERING_RUN_HISTORY_LIMIT = HISTORY_LIMIT;
