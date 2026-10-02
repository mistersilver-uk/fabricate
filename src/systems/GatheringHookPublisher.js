import { GATHERING_HOOKS } from '../config/hooks.js';
import { arrayOrWrapped as normalizeList, stringOrNull } from '../utils/scalars.js';

const SCHEMA_VERSION = 1;

/**
 * Publishes the public gathering hooks named in `config/hooks.js` and owns their payload
 * contract: a cloned, serializable public shape, emitted through `Hooks.callAll`. It never throws
 * into the gathering flow; a malformed source or a failing subscriber is logged and swallowed.
 */
export class GatheringHookPublisher {
  constructor({ hooks = globalThis.Hooks, nowWorldTime = () => 0 } = {}) {
    this.hooks = hooks;
    this.nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
  }

  /**
   * Emit the completion hook for a terminal attempt, then one event hook per triggered encounter,
   * after side effects commit so subscribers see the final state. `status` is `succeeded` or
   * `failed`, `initiatedBy` `immediate` or `timed`. An `opaqueBlind` attempt, a non-GM viewer
   * of a blind task, nulls `taskId` and `taskName`, omits `gatheredItems`, `usedTools`,
   * `events` and `checkResult`, and emits no event hooks.
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
    try {
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
        conditions: deepClone(run?.conditionSnapshot) ?? null,
      };

      const events = normalizeList(checkResult?.events).filter(
        (event) => event && typeof event === 'object'
      );

      const completion = {
        ...base,
        hook: GATHERING_HOOKS.ATTEMPT_COMPLETED,
      };
      if (opaqueBlind) {
        completion.taskId = null;
        completion.taskName = null;
      } else {
        completion.taskId = stringOrNull(task?.id);
        completion.taskName = stringOrNull(task?.name);
        completion.gatheredItems = this._normalizeGatheredItems(createdResults, checkResult);
        completion.usedTools = normalizeList(usedTools).map((tool) => normalizeUsedTool(tool));
        completion.events = events.map((event) => deepClone(event));
        completion.checkResult = deepClone(checkResult) ?? null;
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
          event: deepClone(event),
        });
      }
    } catch (error) {
      console.warn('Fabricate | Gathering hook publication failed', error);
    }
  }

  /**
   * Public `{ actorUuid, itemUuid, componentId, quantity }` items. The run drops `componentId`,
   * so it is recovered from `checkResult.items` by `itemUuid`, else `null`.
   */
  _normalizeGatheredItems(createdResults, checkResult) {
    const componentByItemUuid = new Map();
    for (const item of normalizeList(checkResult?.items)) {
      const itemUuid = stringOrNull(item?.itemUuid);
      const componentId = stringOrNull(item?.componentId);
      if (itemUuid && componentId && !componentByItemUuid.has(itemUuid)) {
        componentByItemUuid.set(itemUuid, componentId);
      }
    }
    return normalizeList(createdResults).map((entry) => {
      const itemUuid = stringOrNull(entry?.itemUuid);
      return {
        actorUuid: stringOrNull(entry?.actorUuid),
        itemUuid,
        componentId: stringOrNull(entry?.componentId) || componentByItemUuid.get(itemUuid) || null,
        quantity: numberOr(entry?.quantity, 1),
      };
    });
  }

  _callHook(name, payload) {
    try {
      this.hooks?.callAll?.(name, payload);
    } catch (error) {
      console.warn(`Fabricate | Gathering hook failed: ${name}`, error);
    }
  }
}

/**
 * A tool-breakage plan entry as the public `{ componentId, actorUuid, itemUuid, quantity,
 * broken }`, without `mode`, `evidence` or `onBreak`.
 */
function normalizeUsedTool(entry) {
  const ref = entry?.itemRef && typeof entry.itemRef === 'object' ? entry.itemRef : {};
  return {
    componentId: stringOrNull(entry?.componentId),
    actorUuid: stringOrNull(ref.actorUuid) || stringOrNull(entry?.actorUuid),
    itemUuid: stringOrNull(ref.itemUuid) || stringOrNull(entry?.itemUuid),
    quantity: numberOr(ref.quantity ?? entry?.quantity, 1),
    broken: entry?.broken === true,
  };
}

function idOf(document) {
  return stringOrNull(document?.id) || stringOrNull(document?.uuid);
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function deepClone(value) {
  return value === undefined ? undefined : structuredClone(value);
}
