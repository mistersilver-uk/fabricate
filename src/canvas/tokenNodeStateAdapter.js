/**
 * Per-token gathering node-state adapter.
 *
 * A gathering-task Interactable token owns its OWN depletion/respawn state in
 * `token.flags.fabricate.node`, fully independent of
 * `environment.nodeRuntime[taskId]`. This adapter is the read/write interface the
 * gathering engine's rich-state service uses when an attempt is scoped to a
 * placed token: it reads the node LOCALLY from the token flags and routes every
 * WRITE through the active GM (the `interactableSocket` writer), because players
 * cannot update tokens they do not own.
 *
 * The read, depletion, and respawn ARITHMETIC is pure (delegated to
 * `nodeRespawnMath` + `gatheringNodeConfig`), so it is unit-testable without a
 * live Foundry runtime; only the persist step (`writeNode`) is a Foundry/socket
 * edge, supplied as the injected `emitWrite` seam.
 *
 * SNAPSHOT SEMANTICS: at drop time the token snapshots the task's node CONFIG
 * (carrying both config + runtime) into `flags.fabricate.node` via
 * {@link buildTokenNodeSnapshot}. Tool requirements are NOT snapshotted — they
 * resolve live from `task.toolIds`. A task with no node config snapshots NO node
 * (the token is an unlimited / never-depleting gathering point).
 */

import { normalizeNodeConfig } from '../systems/gatheringNodeConfig.js';
import { isNodeDepleted, respawnNodeOnce, nextRespawnEta } from '../systems/nodeRespawnMath.js';

/**
 * Build the `flags.fabricate.node` snapshot for a gathering-task token from a
 * resolved library task. Returns `null` when the task has no node config — such
 * a token is an UNLIMITED gathering point: no depletion, no respawn, no node
 * writes, and the engine treats it as always available (it falls through to the
 * task's own tool/visibility gates only).
 *
 * The snapshot carries BOTH config and runtime: `current` is seeded to `max`
 * (a freshly-placed node starts full) unless the source already pins a `current`.
 *
 * @param {object|null} task Resolved library gathering task (`{ nodes, ... }`).
 * @returns {object|null} Normalized node snapshot, or null for an unlimited node.
 */
export function buildTokenNodeSnapshot(task) {
  const config = normalizeNodeConfig(task?.nodes);
  if (!config) return null;
  // A freshly-placed token starts full unless the source already carries a count.
  const current = Number.isFinite(Number(task?.nodes?.current)) ? Number(task.nodes.current) : Number(config.max || 0);
  return { ...config, current };
}

/**
 * Read and normalize the node block from a token document/plain object. Returns
 * `null` when the token carries no node snapshot (unlimited node).
 *
 * @param {object} token
 * @returns {object|null}
 */
export function readTokenNode(token) {
  const raw = token?.flags?.fabricate?.node;
  return normalizeNodeConfig(raw);
}

/**
 * Resolve a token document's scene id + token id, tolerating both a live
 * TokenDocument (`token.parent`/`token.scene`, `token.id`) and a placeable's
 * document. Pure (no `game.*`): returns null when either id is missing.
 *
 * @param {object} token
 * @returns {{ sceneId: string, tokenId: string } | null}
 */
export function identifyTokenRef(token) {
  const tokenId = token?.id ?? token?._id ?? null;
  const sceneId = token?.parent?.id ?? token?.scene?.id ?? null;
  if (!tokenId || !sceneId) return null;
  return { sceneId: String(sceneId), tokenId: String(tokenId) };
}

/**
 * Create a per-token node-state adapter for one placed gathering-task token.
 *
 * Reads are local (off the live token flags); writes route through the injected
 * `emitWrite` seam (the GM socket). The respawn/depletion math is pure via the
 * injected `secondsPerUnit` / `now` / roll seams.
 *
 * The adapter exposes the small interface the rich-state service prefers over
 * `environment.nodeRuntime[taskId]`:
 *  - `read()`              → the current normalized node, or null (unlimited).
 *  - `isDepleted()`        → `node.current <= 0`.
 *  - `respawnEta()`        → `{ nextWorldTime, secondsUntil } | null`.
 *  - `write(node)`         → persist a node object via the GM socket.
 *  - `respawn()`           → compute + persist a respawn step; no-op vs a deleted token.
 *
 * @param {object} opts
 * @param {object} opts.token The placed token document (carries `flags.fabricate.node`).
 * @param {(node: object) => (void|Promise<void>)} opts.emitWrite Persist seam:
 *   routes `{ node }` to the active GM as an `interactableNodeUpdate` write.
 * @param {() => number} [opts.now] World-time getter (seconds).
 * @param {(unit: string) => number} [opts.secondsPerUnit] Calendar seam.
 * @param {(chance: number) => number} [opts.rollChance] Per-interval chance roll:
 *   returns the raw 1..100 roll (a hit is `roll <= chance*100`), matching the
 *   authoritative per-environment respawn seam.
 * @param {(expression: string) => number} [opts.rollExpression] Per-interval dice roll.
 * @param {() => boolean} [opts.isDeleted] Whether the token has been removed
 *   (terminal `deleteToken`); respawn no-ops against a deleted token.
 * @param {{ sceneId: string, tokenId: string } | null} [opts.tokenRef] The
 *   persisted scene+token identity for this adapter. Threaded into a waiting
 *   gathering run so a TIMED `onSuccess` attempt can rebuild this adapter at
 *   maturity (on the active GM) and land the node decrement on the TOKEN flag,
 *   not `environment.nodeRuntime[taskId]`. Falls back to `identifyTokenRef(token)`.
 * @returns {object}
 */
export function createTokenNodeStateAdapter({
  token,
  emitWrite,
  now = () => 0,
  // Default roll seams MIRROR the authoritative production env/world-time path:
  // `rollChance` returns a raw 1..100 roll (the shared math hits on
  // `roll <= chance*100`), so the per-token adapter's respawn arithmetic is
  // identical to the per-environment respawn even when callers inject no explicit
  // seams. (The world-time pass in `interactableWorldTime.js` injects the same.)
  secondsPerUnit = () => 3600,
  rollChance = () => Math.floor(Math.random() * 100) + 1,
  rollExpression = () => 0,
  isDeleted = () => false,
  tokenRef = null,
  // Phase 6: enact the depleted-behavior token VISUAL (swap-image / postfix /
  // terminal delete) whenever the node is (re)written. Given the freshly-written
  // node's depleted state, it routes a token.update/delete through the same GM
  // path. No-op by default (e.g. unit tests that only assert the node math).
  applyDepletedBehavior = null
} = {}) {
  const read = () => readTokenNode(token);

  // After a node write, keep the token visual in lockstep with the count: apply
  // the depleted visual when the written node is depleted, revert it otherwise.
  // `depletedBehavior` rides on the normalized node config, so the writer reads
  // it from the node we just persisted. Idempotent — the pure planner no-ops when
  // the visual already matches.
  const enactDepleted = (node) => {
    if (typeof applyDepletedBehavior !== 'function' || !node) return undefined;
    return applyDepletedBehavior({
      token,
      behavior: node.depletedBehavior ?? null,
      depleted: isNodeDepleted(node)
    });
  };

  const write = (node) => {
    if (!node || typeof node !== 'object') return undefined;
    const result = emitWrite?.(node);
    if (result && typeof result.then === 'function') {
      return result.then(() => enactDepleted(node));
    }
    enactDepleted(node);
    return result;
  };

  const resolvedRef = tokenRef && tokenRef.sceneId && tokenRef.tokenId
    ? { sceneId: String(tokenRef.sceneId), tokenId: String(tokenRef.tokenId) }
    : identifyTokenRef(token);

  return {
    /**
     * The persisted scene+token identity for this adapter, or null when the
     * token cannot be identified. A waiting run persists this so the adapter can
     * be rebuilt at maturity (see {@link createTokenNodeStateAdapter}).
     *
     * @returns {{ sceneId: string, tokenId: string } | null}
     */
    tokenRef() {
      return resolvedRef ? { ...resolvedRef } : null;
    },
    /** Whether this is a per-token node (false for an unlimited node). */
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
    /** Persist a node object via the GM socket. */
    write,
    /**
     * Compute and persist one respawn step as world time passes. No-ops against
     * a deleted token (terminal `deleteToken` has no node to respawn) and when
     * there is nothing to gain.
     *
     * @returns {object|null} The next node when it changed (already persisted),
     *   else null.
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
