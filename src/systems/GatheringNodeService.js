import { readInteractableBehaviorSystem } from '../canvas/regions/interactableRegionFlags.js';

import { normalizeNodeConfig } from './gatheringNodeConfig.js';
import {
  cloneJson,
  durationToSeconds,
  nonNegativeInteger,
  normalizeList,
  numberOrNullStrict,
} from './gatheringRichStateInternals.js';
import { respawnNodeOnce } from './nodeRespawnMath.js';

/**
 * Owns the finite resource-node subsystem extracted from
 * {@link GatheringRichStateService}: current-state resolution, scoped-source
 * resolution (environment vs interactable), restock, per-environment and
 * interactable-scoped respawn, and the library-config merge. Behaviour, persisted
 * shapes, and node maths are identical to the prior in-place implementation; the
 * parent delegates its public node methods here and routes its retained d100
 * touchpoints through `_resolveNodeSource`.
 *
 * All coupling is injected so this collaborator never reaches for globals: the
 * normalized gathering config is read through `getConfig` (the parent's single
 * `_config` read path), node maths reuse the pure `nodeRespawnMath` /
 * `gatheringNodeConfig` modules, interval lengths come from the calendar-aware
 * `secondsPerUnit`, hooks fire through `callHook`, and the interactable-scoped
 * seams (`resolveRegionBehavior`/`writeInteractableBehavior`) match the parent's.
 */
export class GatheringNodeService {
  /**
   * @param {object} options
   * @param {object} [options.environmentStore] Gathering environment store.
   * @param {Function} options.getConfig Normalized gathering config reader
   *   (the parent's `_config`).
   * @param {Function} [options.secondsPerUnit] Seam resolving one interval unit
   *   to seconds (calendar-aware day/week lengths).
   * @param {Function} options.rollD100 D100 roller (1..100).
   * @param {Function} [options.evaluateExpression] Async expression evaluator.
   * @param {Function} [options.callHook] Hook dispatcher.
   * @param {Function} [options.nowWorldTime] Current world-time getter.
   * @param {Function|null} [options.resolveRegionBehavior] Interactable behaviour
   *   resolver by ref (issue 302).
   * @param {Function|null} [options.writeInteractableBehavior] Interactable
   *   scoped-node writer (issue 302).
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
  }

  async restockNode({ environmentId, taskId, current = null, max = null } = {}) {
    const environment = this.environmentStore?.get?.(environmentId);
    if (!environment) return null;
    const existing = this._currentNodeState(environment, taskId);
    if (!existing) return null;
    // Resolve the EFFECTIVE policy from the library config ("config is
    // authoritative", mirroring _mergeNodeConfigState) so a `nonRegenerating`
    // pool can never be restocked even if a stale per-environment snapshot
    // claims otherwise. A permanently depletable node is a no-op: return it
    // unchanged without writing state or firing the nodeRestocked hook.
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

  /**
   * The current node object for a task in an environment: the per-environment
   * runtime pool if present, else a fresh full pool seeded from the library
   * task's node config. Null when the task has no node config.
   */
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
   * Resolve the node source for an attempt: either the ENVIRONMENT pool (default,
   * unchanged) or an interactable's OWN scoped pool (issue 302), selected by the
   * `interactableRef`. Returns a `{ kind, read(), write(node) }` handle so the
   * gate / depletion / listing touchpoints stay scope-agnostic.
   *
   * - No `interactableRef` → `kind: 'environment'`. `read()` returns the task's
   *   composed node (`task.nodes`); `write(node)` persists into the per-environment
   *   `nodeRuntime[taskId]` via {@link _writeNodeState}. This is the UNCHANGED path
   *   and never resolves a behaviour.
   * - With an `interactableRef` whose behaviour resolves to `taskNodeLink:'unlinked'`
   *   with a real `node` → `kind: 'interactable'`. `read()` returns that scoped node
   *   verbatim (self-authoritative — NO library merge); `write(node)` patches the
   *   behaviour `system.node` via the injected `writeInteractableBehavior` seam.
   * - Any other ref (behaviour gone, environment scope, malformed node) falls back
   *   to the environment branch — safe and never throws.
   *
   * @param {object} params
   * @param {object} params.environment
   * @param {object} params.task
   * @param {{sceneId:string,regionId:string,behaviorId:string}|null} [params.interactableRef]
   * @returns {{ kind: 'environment'|'interactable', read: () => (object|null), write: (node: object) => (void|Promise<void>) }}
   */
  _resolveNodeSource({ environment, task, interactableRef = null } = {}) {
    const environmentSource = {
      kind: 'environment',
      read: () => task?.nodes ?? null,
      write: (node) =>
        this._writeNodeState({ environmentId: environment?.id, taskId: task?.id, node }),
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

    return {
      kind: 'interactable',
      // Self-authoritative scoped pool — no library merge (it owns its own config).
      read: () => view.node,
      write: (node) => this.writeInteractableBehavior?.(interactableRef, { node }),
    };
  }

  /**
   * Persist a node object for a task into the per-environment `nodeRuntime` map
   * (reading the raw stored environment so a composed/runtime environment is
   * never written).
   */
  async _writeNodeState({ environmentId, taskId, node }) {
    const stored = this.environmentStore?.get?.(environmentId);
    if (!stored) return null;
    return this.environmentStore.update(environmentId, {
      nodeRuntime: { ...stored.nodeRuntime, [taskId]: node },
    });
  }

  /**
   * Respawn finite resource nodes for one environment as world time passes
   * (systems with `nodes.enabled` only — the caller gates on that). For each task
   * with an `overTime` respawn policy, adds nodes per elapsed interval per the
   * gain mode: `guaranteed` (+1), `chance` (a persisted d100 roll per interval),
   * or `expression` (roll `amountExpression` per interval and add the rolled
   * total), clamped to the task max. Advances each task's
   * `respawn.lastEvaluatedWorldTime` with the consumed intervals (persisting
   * `lastRoll`) so a same-tick refresh never rerolls. Writes the environment once
   * when any task changed.
   *
   * @param {object} payload
   * @returns {Promise<object|null>} The updated environment, or null on no-op.
   */
  async respawnNodes({ environment, worldTime } = {}) {
    if (!environment) return null;
    const now = Number(worldTime);
    if (!Number.isFinite(now)) return null;

    // Per-environment `nodeRuntime` holds only runtime STATE (the `current` count
    // and respawn timers); the respawn CONFIG is always sourced fresh from the
    // current library task. Otherwise a `nodeRuntime` entry seeded under an older
    // config (e.g. `manual` before the GM switched the task to `overTime`) would
    // freeze that stale config and never respawn — and an emptied pool never
    // re-depletes to pick up the new config. A sequential loop (not `.map`) so the
    // `expression` gain mode can await.
    let runtimeChanged = false;
    const nodeRuntime = { ...environment.nodeRuntime };
    // Resolve the library node configs once for this environment (not per node).
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

  /**
   * Index a system's library node configs by task id (`taskId → normalized
   * task.nodes`). Read once from the canonical config so respawn always reflects
   * the GM's current authoring rather than a per-environment snapshot, without
   * re-normalizing the whole config per node.
   *
   * @param {string} systemId
   * @returns {Map<string, object>}
   */
  _libraryNodeConfigs(systemId) {
    const tasks = this.getConfig().systems?.[String(systemId || '')]?.tasks;
    const map = new Map();
    if (Array.isArray(tasks)) {
      for (const task of tasks) {
        if (task?.id && task?.nodes) map.set(String(task.id), task.nodes);
      }
    }
    return map;
  }

  /**
   * Merge a per-environment runtime node (`stored`) onto the current library node
   * CONFIG so respawn/listing always use the authoritative policy, gain mode,
   * interval, depletion timing, AND capacity (`max`) from the library task, while
   * preserving only the per-environment STATE: the `current` count (clamped to the
   * library `max`) and the respawn anchor/roll. `max` is config, not state — a
   * persisted snapshot (seeded on first depletion) must never shadow a later
   * library edit, or raising a task's node count would have no effect in
   * environments that had already gathered it. Falls back to `stored` when the
   * library task has no node config (e.g. the task was deleted).
   *
   * @param {object|null} libNode Authoritative library node config.
   * @param {object} stored The persisted per-environment node entry.
   * @returns {object}
   */
  _mergeNodeConfigState(libNode, stored) {
    if (!libNode) return stored;
    const storedRespawn = stored?.respawn || {};
    // Capacity is library config and authoritative — `...cloneJson(libNode)`
    // already supplies `max`, so we never read a stale `stored.max`.
    const max = Number(libNode.max);
    const storedCurrent = Number(stored?.current);
    const merged = {
      ...cloneJson(libNode),
      // STATE stays per-environment: the live count, clamped to the library cap so
      // a lowered cap can't leave `current` above `max`.
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

  /**
   * Respawn one resource-node pool as world time passes (`overTime` policy
   * only). Per elapsed interval, adds nodes per `respawn.gainMode`: `guaranteed`
   * (+1), `chance` (a persisted d100 roll), or `expression` (roll
   * `respawn.amountExpression` and add the rolled total). Clamped to max,
   * advancing the `respawn.lastEvaluatedWorldTime` anchor so a same-tick refresh
   * never rerolls.
   *
   * @param {object} nodes The node object (config + state).
   * @param {{now:number, environment?:object, environmentId:string, taskId:string}} ctx
   * @returns {Promise<{changed: boolean, node: object}>}
   */
  async _respawnNode(nodes, { now, environment = null, environmentId, taskId }) {
    const respawn = nodes?.respawn;
    if (!nodes || !respawn || respawn.policy !== 'overTime') {
      return { changed: false, node: nodes };
    }
    // The respawn ARITHMETIC (interval resolution, gain per mode, anchor advance,
    // backwards/stalled-time re-anchor, room===0 short-circuit, max-clamp early
    // break) is the single pure implementation in `nodeRespawnMath`. This env
    // path injects the SAME calendar/random seams the per-token adapter uses —
    // `secondsPerUnit` (legacy `intervalSeconds` falls through inside the math),
    // the `rollD100() <= chance*100` chance seam, and a SYNCHRONOUS expression
    // roll backed by pre-rolled async amounts (so Roll/`evaluateExpression`
    // evaluation still happens, while the math stays pure). Keeping one
    // implementation removes the prior `_respawnNode`/`respawnNodeOnce` drift.

    // Pre-roll expression amounts asynchronously (the math is sync). The needed
    // count is bounded by the elapsed whole intervals capped by the restock room,
    // mirroring the math's stochastic-loop bound; the math may consume fewer (the
    // max-clamp early break) — surplus pre-rolls are simply unused.
    let expressionRolls = null;
    let expressionCursor = 0;
    if ((respawn.gainMode || 'guaranteed') === 'expression') {
      const interval = respawn.intervalUnit
        ? durationToSeconds(this.secondsPerUnit, respawn.intervalAmount, respawn.intervalUnit)
        : Number(respawn.intervalSeconds || 0);
      const last = Number.isFinite(Number(respawn.lastEvaluatedWorldTime))
        ? Number(respawn.lastEvaluatedWorldTime)
        : now;
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
      // Raw 1..100 roll seam (the math hits on `roll <= chance*100` and persists
      // the raw roll in `lastRoll.rolls`, identical to the prior env path).
      rollChance: () => Number(this.rollD100()),
      rollExpression: () =>
        expressionRolls ? Number(expressionRolls[expressionCursor++] || 0) : 0,
    });

    if (changed) {
      const nextCurrent = Number(node?.current ?? before);
      const max = Number(node?.max ?? nodes.max ?? 0);
      // Only emit the respawn hook when the count actually moved (a pure
      // re-anchor changes the node but gains nothing).
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
   * Respawn one interactable-SCOPED node pool as world time passes (issue 302).
   * The scoped node is self-authoritative — it carries its OWN config + state, so
   * (unlike the per-environment path) there is no library merge. Applies the same
   * pure respawn arithmetic ({@link respawnNodeOnce}) with the identical
   * calendar/random seams the environment path injects: `overTime` pools regrow
   * per the gain mode; `manual` / `nonRegenerating` pools never gain (the math
   * short-circuits on policy). Returns `{ changed, node }`; the caller persists the
   * changed node back onto the behaviour.
   *
   * @param {object} params
   * @param {object} params.node The scoped node object (config + state).
   * @param {number} params.worldTime Current world time (seconds).
   * @returns {Promise<{ changed: boolean, node: object }>}
   */
  async respawnInteractableNode({ node, worldTime } = {}) {
    const respawn = node?.respawn;
    if (!node || !respawn || respawn.policy !== 'overTime') {
      return { changed: false, node };
    }
    const now = Number(worldTime);
    if (!Number.isFinite(now)) return { changed: false, node };

    // Pre-roll expression amounts asynchronously (the math is sync), mirroring the
    // env path's bound: elapsed whole intervals capped by the restock room.
    let expressionRolls = null;
    let expressionCursor = 0;
    if ((respawn.gainMode || 'guaranteed') === 'expression') {
      const interval = respawn.intervalUnit
        ? durationToSeconds(this.secondsPerUnit, respawn.intervalAmount, respawn.intervalUnit)
        : Number(respawn.intervalSeconds || 0);
      const last = Number.isFinite(Number(respawn.lastEvaluatedWorldTime))
        ? Number(respawn.lastEvaluatedWorldTime)
        : now;
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

  /**
   * `secondsPerUnit` seam for `respawnNodeOnce` on the env path: resolve the
   * interval unit through the calendar-aware `durationToSeconds(1, unit)`, so
   * day/week lengths follow the active world calendar exactly like the per-token
   * adapter. The math's own legacy `intervalSeconds` fallback handles
   * pre-unit-schema nodes (it only calls this seam when `respawn.intervalUnit`
   * is set).
   *
   * @param {object} respawn The node's respawn block.
   * @param {string} unit The interval unit passed by the math.
   * @returns {number} Seconds for one unit.
   */
  _respawnIntervalSecondsSeam(respawn, unit) {
    return durationToSeconds(this.secondsPerUnit, 1, unit);
  }

  /**
   * Roll the per-interval node gain for an `expression` respawn. Respawn is
   * environment-level with no actor, so the expression must be plain dice
   * (e.g. `1d4`); any `@actor.*` reference resolves against an empty roll-data
   * context and coerces to 0 (never throws). Floored at 0 and rounded.
   *
   * @param {object} payload
   * @returns {Promise<number>} Non-negative integer node gain for one interval.
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
      // A malformed dice string (e.g. `1d`, `(`) or an `@actor.*` reference with
      // no actor must not abort respawn for the rest of the environment — treat
      // this interval as no gain.
      return 0;
    }
    const numeric = Number(value);
    return Math.max(0, Math.round(Number.isFinite(numeric) ? numeric : 0));
  }
}
