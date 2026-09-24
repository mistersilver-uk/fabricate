import { readInteractableBehaviorSystem } from '../canvas/regions/interactableRegionFlags.js';

import { depleteNodeOnce, normalizeNodeConfig } from './gatheringNodeConfig.js';
import {
  cloneJson,
  durationToSeconds,
  nonNegativeInteger,
  normalizeList,
  numberOrNullStrict,
} from './gatheringRichStateInternals.js';
import { resolveAccrualAnchor, respawnNodeOnce } from './nodeRespawnMath.js';

/**
 * The finite resource-node subsystem of {@link GatheringRichStateService}, which delegates its
 * node methods here: state resolution, the environment or interactable node source, restock,
 * respawn and the library-config merge. Every collaborator is injected, with no globals; the
 * arithmetic is the pure `nodeRespawnMath` and `gatheringNodeConfig`.
 */
export class GatheringNodeService {
  /**
   * `secondsPerUnit` is calendar-aware. `depleteEnvironmentNode({ environmentId, taskId })` routes
   * an attempt's environment-pool decrement to the GM, since that pool is a world setting a player
   * cannot write; without it the write is direct. `nodesEnabled(systemId)` lets the active-GM
   * applier re-check the economy toggle rather than trust the requester.
   */
  constructor({
    environmentStore = null,
    getConfig,
    secondsPerUnit = null,
    rollD100,
    evaluateExpression = null,
    callHook = () => {},
    nowWorldTime = () => 0,
    resolveRegionBehavior = null,
    writeInteractableBehavior = null,
    depleteEnvironmentNode = null,
    nodesEnabled = null,
  } = {}) {
    this.environmentStore = environmentStore;
    this.getConfig = getConfig;
    this.secondsPerUnit = typeof secondsPerUnit === 'function' ? secondsPerUnit : () => 3600;
    this.rollD100 = rollD100;
    this.evaluateExpression = evaluateExpression;
    this.callHook = typeof callHook === 'function' ? callHook : () => {};
    this.nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
    this.resolveRegionBehavior =
      typeof resolveRegionBehavior === 'function' ? resolveRegionBehavior : null;
    this.writeInteractableBehavior =
      typeof writeInteractableBehavior === 'function' ? writeInteractableBehavior : null;
    this.depleteEnvironmentNode =
      typeof depleteEnvironmentNode === 'function' ? depleteEnvironmentNode : null;
    this.nodesEnabled = typeof nodesEnabled === 'function' ? nodesEnabled : null;
  }

  async restockNode({ environmentId, taskId, current = null, max = null } = {}) {
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    const existing = this._currentNodeState(environment, taskId);
    if (!existing) return null;
    // The library config is authoritative, so a `nonRegenerating` pool is never restocked,
    // whatever a stale snapshot says: no write and no `nodeRestocked` hook.
    const effective = this._mergeNodeConfigState(
      this._libraryNodeConfigs(environment.craftingSystemId).get(String(taskId)) || null,
      existing
    );
    if (effective?.respawn?.policy === 'nonRegenerating') return existing;
    // A null/undefined max keeps the existing cap (don't let Number(null)→0 wipe it).
    const nextMax =
      max === null || max === undefined
        ? Number(existing.max || 0)
        : nonNegativeInteger(max, existing.max);
    const node = {
      ...existing,
      enabled: true,
      max: nextMax,
      current: Math.min(nonNegativeInteger(current, nextMax), nextMax),
    };
    const updated = await this._writeNodeState({ environmentId, taskId, node });
    this.callHook('fabricate.gathering.nodeRestocked', { environmentId, taskId, current, max });
    return updated;
  }

  /** The environment's runtime pool, else a full pool from the library config, else `null`. */
  _currentNodeState(environment, taskId) {
    const runtime = environment?.nodeRuntime?.[taskId];
    if (runtime) return runtime;
    const libraryTasks =
      this.getConfig().systems?.[String(environment?.craftingSystemId || '')]?.tasks || [];
    const config = normalizeNodeConfig(
      normalizeList(libraryTasks).find((task) => task?.id === taskId)?.nodes
    );
    return config ? { ...config, current: config.max } : null;
  }

  /**
   * The attempt's node source as a `{ kind, routed, read, write, deplete }` handle. An
   * `interactableRef` whose behaviour is `taskNodeLink: 'unlinked'` with a node selects that
   * self-authoritative pool, with no library merge (issue 302); anything else, including a
   * throwing resolver, is the environment pool. `deplete` is the attempt-commit write: routed, it
   * sends no node, and the GM recomputes the unit in {@link applyEnvironmentNodeDepletion}.
   */
  _resolveNodeSource({ environment, task, interactableRef = null } = {}) {
    const environmentSource = {
      kind: 'environment',
      // When routed this client never learns the count the GM wrote, so callers must not
      // publish their local `current` as fact (`commitAcceptedAttempt`).
      routed: !!this.depleteEnvironmentNode,
      read: () => task?.nodes ?? null,
      write: (node) =>
        this._writeNodeState({ environmentId: environment?.id, taskId: task?.id, node }),
      deplete: (node) =>
        this.depleteEnvironmentNode
          ? this.depleteEnvironmentNode({ environmentId: environment?.id, taskId: task?.id })
          : this._writeNodeState({ environmentId: environment?.id, taskId: task?.id, node }),
    };

    if (!interactableRef || typeof this.resolveRegionBehavior !== 'function') {
      return environmentSource;
    }

    let view = null;
    try {
      const behavior = this.resolveRegionBehavior(interactableRef);
      view = behavior ? readInteractableBehaviorSystem(behavior) : null;
    } catch {
      view = null;
    }
    if (!view || view.taskNodeLink !== 'unlinked' || !view.node) {
      return environmentSource;
    }

    const write = (node) => this.writeInteractableBehavior?.(interactableRef, { node });
    return {
      kind: 'interactable',
      // The behaviour writer relays to the GM but sends this client's node, so its `current`
      // is what gets written.
      routed: false,
      read: () => view.node,
      write,
      deplete: write,
    };
  }

  /**
   * The active-GM edge of a routed depletion: take one unit from the GM's own stored state, never
   * a node off the wire, so concurrent gatherers add up and a forged request costs one unit.
   * `null` when the environment, the node config or the node economy is absent.
   */
  async applyEnvironmentNodeDepletion({ environmentId, taskId } = {}) {
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    if (this.nodesEnabled && this.nodesEnabled(environment.craftingSystemId) !== true) return null;
    const existing = this._currentNodeState(environment, taskId);
    if (!existing) return null;
    // Library config is authoritative, so a stale snapshot cannot resurrect an old policy or cap.
    const effective = this._mergeNodeConfigState(
      this._libraryNodeConfigs(environment.craftingSystemId).get(String(taskId)) || null,
      existing
    );
    const node = depleteNodeOnce(effective, { worldTime: Number(this.nowWorldTime?.() ?? 0) });
    if (!node) return null;
    return this._writeNodeState({ environmentId, taskId, node });
  }

  /** Persist into the stored environment's `nodeRuntime`, never a composed environment. */
  async _writeNodeState({ environmentId, taskId, node }) {
    const stored = this.environmentStore?.get?.(environmentId);
    if (!stored) return null;
    return this.environmentStore.update(environmentId, {
      nodeRuntime: { ...stored.nodeRuntime, [taskId]: node },
    });
  }

  /**
   * Respawn one environment's `overTime` pools as world time passes; the caller gates on
   * `nodes.enabled`. One write when anything changed, else `null`.
   */
  async respawnNodes({ environment, worldTime } = {}) {
    if (!environment) return null;
    const now = Number(worldTime);
    if (!Number.isFinite(now)) return null;

    // `nodeRuntime` holds only state; the config is always the current library task's, or a
    // pool seeded under an older policy would never respawn. Sequential, as expressions await.
    let runtimeChanged = false;
    const nodeRuntime = { ...environment.nodeRuntime };
    const libNodes = this._libraryNodeConfigs(environment.craftingSystemId);
    for (const [taskId, node] of Object.entries(nodeRuntime)) {
      const effective = this._mergeNodeConfigState(libNodes.get(String(taskId)) || null, node);

      const result = await this._respawnNode(effective, {
        now,
        environment,
        environmentId: environment.id,
        taskId,
      });
      if (result.changed) {
        runtimeChanged = true;
        nodeRuntime[taskId] = result.node;
      }
    }

    if (!runtimeChanged) return null;
    return this.environmentStore.update(environment.id, { nodeRuntime });
  }

  /** A system's library node configs by task id. */
  _libraryNodeConfigs(systemId) {
    const tasks = this.getConfig().systems?.[String(systemId || '')]?.tasks;
    const map = new Map();
    if (Array.isArray(tasks)) {
      for (const task of tasks) {
        if (task?.id && task.nodes) map.set(String(task.id), task.nodes);
      }
    }
    return map;
  }

  /**
   * The library node config, `max` included, with only the stored state kept: `current`,
   * clamped to the library cap, and the respawn anchor and roll. `stored` alone when the library
   * task has no node config.
   */
  _mergeNodeConfigState(libNode, stored) {
    if (!libNode) return stored;
    const storedRespawn = stored?.respawn || {};
    const max = Number(libNode.max);
    const storedCurrent = Number(stored?.current);
    const merged = {
      ...cloneJson(libNode),
      current: Number.isFinite(storedCurrent)
        ? Number.isFinite(max)
          ? Math.min(storedCurrent, max)
          : storedCurrent
        : libNode.current,
      respawn: {
        ...cloneJson(libNode.respawn || { policy: 'manual' }),
        lastEvaluatedWorldTime: numberOrNullStrict(storedRespawn.lastEvaluatedWorldTime),
        nextEvaluationWorldTime: numberOrNullStrict(storedRespawn.nextEvaluationWorldTime),
        lastRoll:
          storedRespawn.lastRoll && typeof storedRespawn.lastRoll === 'object'
            ? cloneJson(storedRespawn.lastRoll)
            : null,
      },
    };
    if (stored?.showCountsToPlayers === true) merged.showCountsToPlayers = true;
    return merged;
  }

  /** Respawn one `overTime` pool through `respawnNodeOnce`, the single implementation. */
  async _respawnNode(nodes, { now, environment = null, environmentId, taskId }) {
    const respawn = nodes?.respawn;
    if (!nodes || !respawn || respawn.policy !== 'overTime') {
      return { changed: false, node: nodes };
    }
    // The math is synchronous, so expression amounts are pre-rolled here, bounded by elapsed
    // intervals capped by the room. The anchor must come from `resolveAccrualAnchor`, since a
    // `null` anchor reads as 0 to a finiteness test (issues 403, 896); surplus rolls go unused.
    let expressionRolls = null;
    let expressionCursor = 0;
    if ((respawn.gainMode || 'guaranteed') === 'expression') {
      const interval = respawn.intervalUnit
        ? durationToSeconds(this.secondsPerUnit, respawn.intervalAmount, respawn.intervalUnit)
        : Number(respawn.intervalSeconds || 0);
      const last = resolveAccrualAnchor(respawn.lastEvaluatedWorldTime, now);
      if (interval > 0 && now > last) {
        const elapsedIntervals = Math.floor((now - last) / interval);
        const room = Math.max(0, Number(nodes.max || 0) - Number(nodes.current || 0));
        const needed = Math.min(Math.max(0, elapsedIntervals), room);
        expressionRolls = [];
        for (let i = 0; i < needed; i++) {
          expressionRolls.push(
            await this._respawnExpressionAmount({
              expression: respawn.amountExpression,
              environment,
            })
          );
        }
      }
    }

    const before = Number(nodes.current || 0);
    const { changed, node } = respawnNodeOnce(nodes, {
      now,
      secondsPerUnit: (unit) => this._respawnIntervalSecondsSeam(respawn, unit),
      // A raw 1..100 roll; the math hits on `roll <= chance*100` and persists it in `lastRoll`.
      rollChance: () => Number(this.rollD100()),
      rollExpression: () =>
        expressionRolls ? Number(expressionRolls[expressionCursor++] || 0) : 0,
    });

    if (changed) {
      const nextCurrent = Number(node?.current ?? before);
      const max = Number(node?.max ?? nodes.max ?? 0);
      // A seed or an anchor advance with no room changes the node but gains nothing.
      if (nextCurrent !== before) {
        this.callHook('fabricate.gathering.nodeRespawned', {
          environmentId,
          taskId,
          amount: nextCurrent - before,
          current: nextCurrent,
          max,
        });
      }
    }
    return { changed, node };
  }

  /**
   * Respawn one self-authoritative interactable pool (issue 302), with no library merge and the
   * environment path's seams. Answers `{ changed, node }`; the caller persists the node.
   */
  async respawnInteractableNode({ node, worldTime } = {}) {
    const respawn = node?.respawn;
    if (!node || !respawn || respawn.policy !== 'overTime') {
      return { changed: false, node };
    }
    const now = Number(worldTime);
    if (!Number.isFinite(now)) return { changed: false, node };

    // Pre-rolled exactly as in `_respawnNode`.
    let expressionRolls = null;
    let expressionCursor = 0;
    if ((respawn.gainMode || 'guaranteed') === 'expression') {
      const interval = respawn.intervalUnit
        ? durationToSeconds(this.secondsPerUnit, respawn.intervalAmount, respawn.intervalUnit)
        : Number(respawn.intervalSeconds || 0);
      const last = resolveAccrualAnchor(respawn.lastEvaluatedWorldTime, now);
      if (interval > 0 && now > last) {
        const elapsedIntervals = Math.floor((now - last) / interval);
        const room = Math.max(0, Number(node.max || 0) - Number(node.current || 0));
        const needed = Math.min(Math.max(0, elapsedIntervals), room);
        expressionRolls = [];
        for (let i = 0; i < needed; i++) {
          expressionRolls.push(
            await this._respawnExpressionAmount({
              expression: respawn.amountExpression,
              environment: null,
            })
          );
        }
      }
    }

    return respawnNodeOnce(node, {
      now,
      secondsPerUnit: (unit) => this._respawnIntervalSecondsSeam(respawn, unit),
      rollChance: () => Number(this.rollD100()),
      rollExpression: () =>
        expressionRolls ? Number(expressionRolls[expressionCursor++] || 0) : 0,
    });
  }

  /** One calendar-aware unit; the math falls back to legacy `intervalSeconds` itself. */
  _respawnIntervalSecondsSeam(respawn, unit) {
    return durationToSeconds(this.secondsPerUnit, 1, unit);
  }

  /**
   * One interval's gain for an `expression` respawn, a non-negative integer. There is no actor,
   * so `@actor.*` resolves to 0; never throws.
   */
  async _respawnExpressionAmount({ expression, environment = null } = {}) {
    if (expression === null || expression === undefined || String(expression).trim() === '')
      return 0;
    let value;
    try {
      value =
        typeof this.evaluateExpression === 'function'
          ? await this.evaluateExpression({
              expression: String(expression),
              provider: null,
              actor: null,
              kind: 'nodeRespawn',
              system: null,
              environment,
            })
          : // No Roll available (e.g. headless): a plain number still resolves.
            Number(expression);
    } catch {
      // A malformed formula gains nothing rather than abort the environment's respawn.
      return 0;
    }
    const numeric = Number(value);
    return Math.max(0, Math.round(Number.isFinite(numeric) ? numeric : 0));
  }
}
