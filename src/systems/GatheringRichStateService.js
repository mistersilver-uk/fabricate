const FLAG_NAMESPACE = 'fabricate';
const STATE_FLAG_KEY = 'gatheringState';

const BLOCKED_REASON_KEYS = Object.freeze({
  NODE_DEPLETED: 'FABRICATE.Gathering.Blocked.NodeDepleted',
  ATTEMPT_LIMIT_EXHAUSTED: 'FABRICATE.Gathering.Blocked.AttemptLimitExhausted',
  STAMINA_BLOCKED: 'FABRICATE.Gathering.Blocked.StaminaBlocked'
});

/**
 * Owns additive rich-gathering state that is not part of result resolution:
 * node counts stored on environment tasks, actor-scoped stamina, attempt
 * counters, and blind task reveal evidence. The service is intentionally small
 * and side-effect explicit so GatheringEngine can keep history-before-effects
 * ordering.
 */
export class GatheringRichStateService {
  constructor({
    environmentStore = null,
    nowWorldTime = () => Number(globalThis.game?.time?.worldTime || 0),
    getUserId = () => globalThis.game?.user?.id || null,
    hooks = globalThis.Hooks ?? null
  } = {}) {
    this.environmentStore = environmentStore;
    this.nowWorldTime = nowWorldTime;
    this.getUserId = getUserId;
    this.hooks = hooks;
  }

  inspectEnvironment(environmentId) {
    const environment = this.environmentStore?.get?.(environmentId);
    return environment ? cloneJson(environment) : null;
  }

  buildListingMetadata({ environment, task, actor, viewer }) {
    const opaqueBlind = environment?.selectionMode === 'blind' && viewer?.isGM !== true;
    const nodes = task?.nodes ? {
      enabled: true,
      available: Number(task.nodes.current || 0) > 0,
      current: task.nodes.showCountsToPlayers === true || viewer?.isGM === true || !opaqueBlind ? Number(task.nodes.current || 0) : null,
      max: task.nodes.showCountsToPlayers === true || viewer?.isGM === true || !opaqueBlind ? Number(task.nodes.max || 0) : null
    } : null;
    const stamina = Number(task?.staminaCost || 0) > 0 ? {
      cost: Number(task.staminaCost || 0),
      state: this.getActorStamina(actor, environment?.craftingSystemId)
    } : null;
    const attemptLimit = task?.attemptLimit ? this._attemptLimitEvidence({ actor, environment, task, viewer }) : null;
    return {
      nodes,
      stamina,
      attemptLimit,
      risk: task?.riskOverride || environment?.risk || 'safe',
      conditions: cloneJson(environment?.conditions || {})
    };
  }

  getActorStamina(actor, systemId = null) {
    const state = readState(actor);
    const key = systemId || 'default';
    const stamina = state.stamina?.[key] || {};
    return {
      current: Number.isFinite(Number(stamina.current)) ? Number(stamina.current) : null,
      max: Number.isFinite(Number(stamina.max)) ? Number(stamina.max) : null,
      provider: stamina.provider || 'fabricate',
      regenerationMode: stamina.regenerationMode || 'manual'
    };
  }

  async setActorStamina(actor, { systemId = 'default', current = null, max = null, provider = 'fabricate', regenerationMode = 'manual' } = {}) {
    const state = readState(actor);
    const key = systemId || 'default';
    const previous = state.stamina?.[key] || {};
    const next = {
      provider: provider || previous.provider || 'fabricate',
      regenerationMode: regenerationMode || previous.regenerationMode || 'manual',
      current: nonNegativeNumber(current, previous.current ?? 0),
      max: nonNegativeNumber(max, previous.max ?? current ?? 0)
    };
    state.stamina = { ...(state.stamina || {}), [key]: next };
    state.history = [
      this._historyEvent('stamina.set', { systemId: key, current: next.current, max: next.max }),
      ...normalizeList(state.history)
    ].slice(0, 50);
    await writeState(actor, state);
    this._callHook('fabricate.gathering.staminaAdjusted', { actor, systemId: key, stamina: cloneJson(next) });
    return cloneJson(next);
  }

  async adjustActorStamina(actor, { systemId = 'default', delta = 0 } = {}) {
    const current = this.getActorStamina(actor, systemId);
    const nextCurrent = Math.max(0, Number(current.current || 0) + Number(delta || 0));
    return this.setActorStamina(actor, {
      systemId,
      current: current.max !== null ? Math.min(nextCurrent, current.max) : nextCurrent,
      max: current.max ?? nextCurrent,
      provider: current.provider,
      regenerationMode: current.regenerationMode
    });
  }

  async restockNode({ environmentId, taskId, current = null, max = null } = {}) {
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    const tasks = normalizeList(environment.tasks).map(task => {
      if (task?.id !== taskId) return task;
      const existing = task.nodes || { enabled: true, max: 0, current: 0, depletionTiming: 'onStart', respawn: { policy: 'none' } };
      const nextMax = nonNegativeInteger(max, existing.max);
      return {
        ...task,
        nodes: {
          ...existing,
          enabled: true,
          max: nextMax,
          current: Math.min(nonNegativeInteger(current, nextMax), nextMax)
        }
      };
    });
    const updated = await this.environmentStore.update(environmentId, { tasks });
    this._callHook('fabricate.gathering.nodeRestocked', { environmentId, taskId, current, max });
    return updated;
  }

  async updateConditions({ environmentId, conditions = {} } = {}) {
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    const updated = await this.environmentStore.update(environmentId, {
      conditions: {
        ...(environment.conditions || {}),
        ...conditions
      }
    });
    this._callHook('fabricate.gathering.conditionsUpdated', { environmentId, conditions: updated?.conditions || {} });
    return updated;
  }

  async revealTask(actor, { environmentId, taskId, scope = 'actor' } = {}) {
    const state = readState(actor);
    const key = revealKey({ environmentId, taskId, scope, actor, userId: this.getUserId() });
    state.reveals = { ...(state.reveals || {}), [key]: this._historyEvent('blind.reveal', { environmentId, taskId, scope }) };
    await writeState(actor, state);
    this._callHook('fabricate.gathering.blindRevealed', { actor, environmentId, taskId, scope });
    return cloneJson(state.reveals[key]);
  }

  async clearReveal(actor, { environmentId, taskId, scope = 'actor' } = {}) {
    const state = readState(actor);
    const key = revealKey({ environmentId, taskId, scope, actor, userId: this.getUserId() });
    if (state.reveals) delete state.reveals[key];
    await writeState(actor, state);
    return true;
  }

  async evaluateStart({ actor, system, environment, task, viewer } = {}) {
    const blockedReasons = [];
    const evidence = this.buildListingMetadata({ environment, task, actor, viewer });

    if (task?.nodes && Number(task.nodes.current || 0) <= 0 && viewer?.isGM !== true) {
      blockedReasons.push(this._blockedReason('NODE_DEPLETED', { taskId: task.id }));
    }

    if (task?.attemptLimit) {
      const attempt = this._attemptLimitEvidence({ actor, environment, task, viewer });
      evidence.attemptLimit = attempt;
      if (attempt.remaining !== null && attempt.remaining <= 0 && viewer?.isGM !== true) {
        blockedReasons.push(this._blockedReason('ATTEMPT_LIMIT_EXHAUSTED', { taskId: task.id }));
      }
    }

    const staminaCost = Number(task?.staminaCost || 0);
    if (staminaCost > 0 && viewer?.isGM !== true) {
      const stamina = this.getActorStamina(actor, system?.id || environment?.craftingSystemId);
      evidence.stamina = { cost: staminaCost, state: stamina };
      if (Number(stamina.current ?? 0) < staminaCost) {
        blockedReasons.push(this._blockedReason('STAMINA_BLOCKED', {
          taskId: task.id,
          required: staminaCost,
          current: stamina.current ?? 0
        }));
      }
    }

    return { blockedReasons, evidence };
  }

  async commitAcceptedAttempt({ actor, system, environment, task, outcome = null } = {}) {
    const evidence = {
      conditions: cloneJson(environment?.conditions || {}),
      risk: task?.riskOverride || environment?.risk || 'safe',
      node: null,
      stamina: null,
      attemptLimit: null
    };

    if (task?.nodes && shouldDepleteNode(task, outcome)) {
      const current = Math.max(0, Number(task.nodes.current || 0) - 1);
      await this.restockNode({ environmentId: environment.id, taskId: task.id, current, max: task.nodes.max });
      evidence.node = { taskId: task.id, consumed: 1, remaining: current };
    }

    const staminaCost = Number(task?.staminaCost || 0);
    if (staminaCost > 0) {
      await this.adjustActorStamina(actor, { systemId: system?.id || environment?.craftingSystemId, delta: -staminaCost });
      evidence.stamina = { spent: staminaCost };
    }

    if (task?.attemptLimit) {
      const state = readState(actor);
      const key = attemptKey({ actor, environment, task, userId: this.getUserId() });
      const previous = state.attempts?.[key] || { count: 0 };
      const next = {
        count: Number(previous.count || 0) + 1,
        updatedAtWorldTime: this._now()
      };
      state.attempts = { ...(state.attempts || {}), [key]: next };
      await writeState(actor, state);
      evidence.attemptLimit = { key, count: next.count, max: task.attemptLimit.max };
    }

    this._callHook('fabricate.gathering.richAttemptCommitted', { actor, system, environment, task, outcome, evidence });
    return evidence;
  }

  _attemptLimitEvidence({ actor, environment, task }) {
    if (!task?.attemptLimit) return null;
    const state = readState(actor);
    const key = attemptKey({ actor, environment, task, userId: this.getUserId() });
    const current = Number(state.attempts?.[key]?.count || 0);
    const max = Number(task.attemptLimit.max || 1);
    return {
      key,
      scope: task.attemptLimit.scope || 'actor',
      count: current,
      max,
      remaining: Math.max(0, max - current)
    };
  }

  _blockedReason(code, data = null) {
    return {
      code,
      messageKey: BLOCKED_REASON_KEYS[code] || `FABRICATE.Gathering.Blocked.${code}`,
      data
    };
  }

  _historyEvent(type, data = {}) {
    return {
      id: `${type}-${this._now()}-${Math.random().toString(36).slice(2)}`,
      type,
      worldTime: this._now(),
      ...cloneJson(data)
    };
  }

  _now() {
    const value = Number(this.nowWorldTime());
    return Number.isFinite(value) ? value : 0;
  }

  _callHook(name, payload) {
    try {
      this.hooks?.callAll?.(name, payload);
    } catch (err) {
      console.warn(`Fabricate | Gathering hook failed: ${name}`, err);
    }
  }
}

function shouldDepleteNode(task, outcome) {
  if (!task?.nodes) return false;
  if (task.nodes.depletionTiming === 'onSuccess') return outcome?.status === 'succeeded';
  return true;
}

function attemptKey({ actor, environment, task, userId }) {
  const scope = task?.attemptLimit?.scope || 'actor';
  if (scope === 'global') return `global:${task?.id}`;
  if (scope === 'environment') return `environment:${environment?.id}:${task?.id}`;
  if (scope === 'user') return `user:${userId || 'unknown'}:${task?.id}`;
  if (scope === 'task') return `task:${task?.id}`;
  return `actor:${actor?.uuid || actor?.id || 'unknown'}:${task?.id}`;
}

function revealKey({ environmentId, taskId, scope, actor, userId }) {
  if (scope === 'global') return `global:${environmentId}:${taskId}`;
  if (scope === 'user') return `user:${userId || 'unknown'}:${environmentId}:${taskId}`;
  return `actor:${actor?.uuid || actor?.id || 'unknown'}:${environmentId}:${taskId}`;
}

function readState(actor) {
  try {
    const state = actor?.getFlag?.(FLAG_NAMESPACE, STATE_FLAG_KEY);
    return state && typeof state === 'object' ? cloneJson(state) : {};
  } catch (_err) {
    return {};
  }
}

async function writeState(actor, state) {
  return actor?.setFlag?.(FLAG_NAMESPACE, STATE_FLAG_KEY, cloneJson(state));
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number(fallback || 0);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number(fallback || 0);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
