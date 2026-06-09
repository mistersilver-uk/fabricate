/**
 * Behaviour-backed gathering node-state adapter for the region-first model.
 *
 * In the region-first model a gathering-task interactable's authoritative node
 * state lives on the `fabricate.interactable` Region Behaviour
 * (`behavior.system.node`), not on a Tile flag. This adapter is the read/write
 * interface the gathering engine's rich-state service uses when an attempt is
 * scoped to a placed interactable region: it reads the node LOCALLY off the live
 * behaviour and routes every WRITE through the active GM (players cannot update
 * region behaviours they do not own).
 *
 * It exposes the node-state adapter interface
 * (`hasNode/read/isDepleted/respawnEta/write/respawn/tileRef`) so the engine seam
 * is unchanged. The method name `tileRef` is DELIBERATELY kept (the engine treats
 * the ref as opaque — see `GatheringEngine._resolveMaturedTileNodeState` /
 * `economyEvidence.tileNodeRef`); only the payload is widened to
 * `{ sceneId, regionId, behaviorId }`.
 *
 * The read / depletion / respawn ARITHMETIC is pure (delegated to
 * `nodeRespawnMath` + `gatheringNodeConfig`), so it is unit-testable without a
 * live Foundry runtime; only the persist step (`emitWrite`) and the linked-visual
 * reflection (`applyLinkedVisual`) are edges, supplied as injected seams.
 */

import { normalizeNodeConfig } from '../../systems/gatheringNodeConfig.js';
import { isNodeDepleted, respawnNodeOnce, nextRespawnEta } from '../../systems/nodeRespawnMath.js';

/**
 * Build the `system.node` snapshot for a gathering-task interactable from a
 * resolved library task. Returns `null` when the task has no node config — such
 * an interactable is an UNLIMITED gathering point: no depletion, no respawn, no
 * node writes, and the engine treats it as always available (it falls through to
 * the task's own tool/visibility gates only).
 *
 * The snapshot carries BOTH config and runtime: `current` is seeded to `max`
 * (a freshly-placed node starts full) unless the source already pins a `current`.
 *
 * @param {object|null} task Resolved library gathering task (`{ nodes, ... }`).
 * @returns {object|null} Normalized node snapshot, or null for an unlimited node.
 */
export function buildInteractableNodeSnapshot(task) {
  const config = normalizeNodeConfig(task?.nodes);
  if (!config) return null;
  // A freshly-placed interactable starts full unless the source already carries a count.
  const current = Number.isFinite(Number(task?.nodes?.current)) ? Number(task.nodes.current) : Number(config.max || 0);
  return { ...config, current };
}

/**
 * Read and normalize the node block from a region behaviour document/plain
 * object. Returns `null` when the behaviour carries no node (unlimited node).
 * Reads `behavior.system.node` defensively (the behaviour may be a live
 * RegionBehavior doc).
 *
 * @param {object} behavior
 * @returns {object|null}
 */
export function readRegionBehaviorNode(behavior) {
  const system = behavior?.system && typeof behavior.system === 'object' ? behavior.system : null;
  return normalizeNodeConfig(system?.node ?? null);
}

/**
 * Resolve a region-behaviour document's scene + region + behaviour ids, tolerating
 * a live RegionBehavior document (whose `parent` is the Region, whose `parent` is
 * the Scene). Pure (no `game.*`): returns null when any id is missing.
 *
 * @param {object} behavior
 * @returns {{ sceneId: string, regionId: string, behaviorId: string } | null}
 */
export function identifyRegionBehaviorRef(behavior) {
  const behaviorId = behavior?.id ?? behavior?._id ?? null;
  const region = behavior?.parent ?? null;
  const regionId = region?.id ?? region?._id ?? behavior?.regionId ?? null;
  const sceneId = region?.parent?.id ?? region?.parent?._id
    ?? behavior?.scene?.id ?? behavior?.sceneId ?? null;
  if (!behaviorId || !regionId || !sceneId) return null;
  return { sceneId: String(sceneId), regionId: String(regionId), behaviorId: String(behaviorId) };
}

/**
 * Create a behaviour-backed node-state adapter for one placed gathering-task
 * region interactable.
 *
 * Reads are local (off the live behaviour `system.node`); writes route through the
 * injected `emitWrite` seam (the GM socket) as a `{ system: { node } }` behaviour
 * update, then reflect the depleted state onto the linked visual via the injected
 * `applyLinkedVisual` seam. The respawn/depletion math is pure via the injected
 * `secondsPerUnit` / `now` / roll seams.
 *
 * The adapter interface:
 *  - `hasNode()`     → whether there is a node (false for an unlimited node).
 *  - `read()`        → the current normalized node, or null (unlimited).
 *  - `isDepleted()`  → `node.current <= 0`.
 *  - `respawnEta()`  → `{ nextWorldTime, secondsUntil } | null`.
 *  - `write(node)`   → emit `{ system: { node } }` via the GM socket, then reflect.
 *  - `respawn()`     → compute + persist a respawn step; no-op vs a deleted behaviour.
 *  - `tileRef()`     → the persisted `{ sceneId, regionId, behaviorId }` identity.
 *
 * @param {object} opts
 * @param {object} opts.behavior The live RegionBehavior document (carries `system.node`).
 * @param {(update: object) => (void|Promise<void>)} opts.emitWrite Persist seam:
 *   routes a `{ system: { node } }` behaviour update to the active GM.
 * @param {() => number} [opts.now] World-time getter (seconds).
 * @param {(unit: string) => number} [opts.secondsPerUnit] Calendar seam.
 * @param {(chance: number) => number} [opts.rollChance] Per-interval chance roll
 *   (raw 1..100; a hit is `roll <= chance*100`).
 * @param {(expression: string) => number} [opts.rollExpression] Per-interval dice roll.
 * @param {() => boolean} [opts.isDeleted] Whether the behaviour/region was removed.
 * @param {(args: { behaviorSystem: object, depleted: boolean }) => (void|Promise<void>)} [opts.applyLinkedVisual]
 *   Reflect the depleted state onto the linked visual after a node write. No-op by default.
 * @param {{ sceneId: string, regionId: string, behaviorId: string } | null} [opts.ref]
 *   The persisted scene+region+behaviour identity. Falls back to
 *   `identifyRegionBehaviorRef(behavior)`.
 * @returns {object}
 */
export function createRegionNodeStateAdapter({
  behavior,
  emitWrite,
  now = () => 0,
  secondsPerUnit = () => 3600,
  rollChance = () => Math.floor(Math.random() * 100) + 1,
  rollExpression = () => 0,
  isDeleted = () => false,
  applyLinkedVisual = null,
  ref = null
} = {}) {
  const read = () => readRegionBehaviorNode(behavior);

  // After a node write, keep the linked visual in lockstep with the count: reflect
  // the depleted state. `applyLinkedVisual` reads the node's depletedBehavior off
  // the behaviour system itself, so we pass the freshly-written node onto a system
  // view. Idempotent — the pure planner no-ops when the visual already matches.
  const reflect = (node) => {
    if (typeof applyLinkedVisual !== 'function' || !node) return undefined;
    const behaviorSystem = behavior?.system && typeof behavior.system === 'object'
      ? { ...behavior.system, node }
      : { node };
    return applyLinkedVisual({ behaviorSystem, depleted: isNodeDepleted(node) });
  };

  const write = (node) => {
    if (!node || typeof node !== 'object') return undefined;
    const result = emitWrite?.({ system: { node } });
    if (result && typeof result.then === 'function') {
      return result.then(() => reflect(node));
    }
    reflect(node);
    return result;
  };

  const resolvedRef = ref && ref.sceneId && ref.regionId && ref.behaviorId
    ? { sceneId: String(ref.sceneId), regionId: String(ref.regionId), behaviorId: String(ref.behaviorId) }
    : identifyRegionBehaviorRef(behavior);

  return {
    /**
     * The persisted scene+region+behaviour identity for this adapter, or null when
     * the behaviour cannot be identified. KEEPS the name `tileRef` so the engine
     * seam (`economyEvidence.tileNodeRef`) is unchanged; only the payload widens.
     *
     * @returns {{ sceneId: string, regionId: string, behaviorId: string } | null}
     */
    tileRef() {
      return resolvedRef ? { ...resolvedRef } : null;
    },
    /** Whether this is a node-backed interactable (false for an unlimited node). */
    hasNode() {
      return read() !== null;
    },
    /** The current normalized node, or null (unlimited node). */
    read,
    /** Depletion trigger — `node.current <= 0` (one shared definition). */
    isDepleted() {
      const node = read();
      return node ? isNodeDepleted(node) : false;
    },
    /** Respawn ETA for the player-facing depleted/respawn surface, or null. */
    respawnEta() {
      const node = read();
      if (!node) return null;
      return nextRespawnEta(node, secondsPerUnit, Number(now()));
    },
    /** Persist a node object as a `{ system: { node } }` behaviour update via the GM socket. */
    write,
    /**
     * Compute and persist one respawn step as world time passes. No-ops against a
     * deleted behaviour and when there is nothing to gain.
     *
     * @returns {object|null} The next node when it changed (already persisted), else null.
     */
    respawn() {
      if (typeof isDeleted === 'function' && isDeleted()) return null;
      const node = read();
      if (!node) return null;
      const { changed, node: next } = respawnNodeOnce(node, {
        now: Number(now()),
        secondsPerUnit,
        rollChance,
        rollExpression
      });
      if (!changed) return null;
      write(next);
      return next;
    }
  };
}
