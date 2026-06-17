import { GATHERING_HOOKS } from '../config/hooks.js';

const SCHEMA_VERSION = 1;

/**
 * Publishes Fabricate's public gathering hooks for other module authors to
 * subscribe to. The publisher owns the payload contract: it normalizes the
 * engine's internal attempt data into a cloned, serializable shape and emits it
 * via Foundry's Hooks system. It never throws into the gathering flow — a
 * misbehaving subscriber is logged and swallowed.
 *
 * Wired into {@link GatheringEngine} as an injected collaborator so the engine
 * stays free of global lookups and the payload shape has one testable home.
 *
 * @see module:config/hooks for the published hook names.
 */
export class GatheringHookPublisher {
  /**
   * @param {object} [deps]
   * @param {object} [deps.hooks] - Foundry Hooks-like object exposing `callAll`.
   *   Defaults to `globalThis.Hooks`. Injected as a fake in tests.
   * @param {() => number} [deps.nowWorldTime] - Returns the current world time,
   *   stamped onto the completion payload.
   */
  constructor({ hooks = globalThis.Hooks, nowWorldTime = () => 0 } = {}) {
    this.hooks = hooks;
    this.nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
  }

  /**
   * Emit the public completion hook for a terminal gathering attempt, then one
   * event hook per triggered encounter. Called from
   * {@link GatheringEngine#_terminalStart} after side effects are committed, so
   * subscribers observe the final, authoritative state.
   *
   * For opaque blind attempts (a non-GM viewer of a blind task) the payload is
   * redacted to match what that client may see: `taskId`/`taskName`,
   * `gatheredItems`, `usedTools`, and `events` are omitted and no per-event hook
   * is emitted.
   *
   * @param {object} params
   * @param {object}  params.viewer         - The Foundry user viewing/initiating.
   * @param {object}  params.actor          - The gathering actor.
   * @param {object}  params.system         - The crafting system.
   * @param {object}  params.environment    - The gathering environment.
   * @param {object}  params.task           - The resolved task.
   * @param {string}  params.status         - `'succeeded'` | `'failed'`.
   * @param {object}  params.run            - The persisted terminal run.
   * @param {Array}   [params.createdResults] - Gathered item refs.
   * @param {Array}   [params.usedTools]      - Tool breakage plan entries.
   * @param {object}  [params.checkResult]    - Resolution detail (carries events).
   * @param {boolean} [params.opaqueBlind]    - True when the viewer may not see detail.
   * @param {('immediate'|'timed')} [params.initiatedBy] - Resolution trigger.
   */
  publishAttemptCompleted({
    viewer,
    actor,
    system,
    environment,
    task,
    status,
    run,
    createdResults = [],
    usedTools = [],
    checkResult,
    opaqueBlind = false,
    initiatedBy = 'immediate',
  } = {}) {
    const base = {
      schemaVersion: SCHEMA_VERSION,
      status: stringOrNull(status),
      worldTime: numberOr(this.nowWorldTime(), 0),
      initiatedBy: initiatedBy === 'timed' ? 'timed' : 'immediate',
      userId: stringOrNull(run?.userId),
      viewerId: idOf(viewer),
      actorId: idOf(actor),
      actorUuid: stringOrNull(actor?.uuid),
      actorName: stringOrNull(actor?.name),
      craftingSystemId: stringOrNull(system?.id),
      craftingSystemName: stringOrNull(system?.name),
      environmentId: stringOrNull(environment?.id),
      environmentName: stringOrNull(environment?.name),
      runId: stringOrNull(run?.id),
      runStatus: stringOrNull(run?.status) || stringOrNull(status),
      riskLevel: stringOrNull(run?.riskLevel),
      conditions: cloneJson(run?.conditionSnapshot) ?? null,
    };

    const events = normalizeList(checkResult?.events).filter(
      (event) => event && typeof event === 'object'
    );

    const completion = {
      ...base,
      hook: GATHERING_HOOKS.ATTEMPT_COMPLETED,
      checkResult: cloneJson(checkResult) ?? null,
    };
    if (opaqueBlind) {
      completion.taskId = null;
      completion.taskName = null;
    } else {
      completion.taskId = stringOrNull(task?.id);
      completion.taskName = stringOrNull(task?.name);
      completion.gatheredItems = normalizeList(createdResults).map((item) => cloneJson(item));
      completion.usedTools = normalizeList(usedTools).map((tool) => cloneJson(tool));
      completion.events = events.map((event) => cloneJson(event));
    }

    this._callHook(GATHERING_HOOKS.ATTEMPT_COMPLETED, completion);

    if (opaqueBlind) return;
    for (const event of events) {
      this._callHook(GATHERING_HOOKS.EVENT_TRIGGERED, {
        schemaVersion: SCHEMA_VERSION,
        hook: GATHERING_HOOKS.EVENT_TRIGGERED,
        status: base.status,
        actorId: base.actorId,
        actorUuid: base.actorUuid,
        craftingSystemId: base.craftingSystemId,
        environmentId: base.environmentId,
        taskId: stringOrNull(task?.id),
        runId: base.runId,
        event: cloneJson(event),
      });
    }
  }

  _callHook(name, payload) {
    try {
      this.hooks?.callAll?.(name, payload);
    } catch (error) {
      console.warn(`Fabricate | Gathering hook failed: ${name}`, error);
    }
  }
}

function idOf(document) {
  return stringOrNull(document?.id) || stringOrNull(document?.uuid);
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
