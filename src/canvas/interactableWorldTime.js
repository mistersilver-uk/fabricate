/**
 * World-time respawn pass for placed gathering-task Interactable tokens.
 *
 * A gathering-task token owns its own depletion/respawn state in
 * `flags.fabricate.node` (independent of `environment.nodeRuntime[taskId]`). As
 * world time advances, each placed token's node respawns on its own
 * calendar-aware interval. This mirrors the engine's per-ENVIRONMENT node respawn
 * pass (`_processNodeRespawn`), which runs ACTIVE-GM ONLY so connected clients
 * never double-apply.
 *
 * The respawn ARITHMETIC is pure (`respawnNodeOnce`); this module is the thin
 * Foundry edge that walks scenes/tokens and writes changed nodes via the active
 * GM applier. The caller (main.js) gates the whole pass on the active GM.
 */

import { normalizeNodeConfig } from '../systems/gatheringNodeConfig.js';
import { respawnNodeOnce, isNodeDepleted } from '../systems/nodeRespawnMath.js';
import { readInteractableFlags } from './interactableTokenFlags.js';
import { applyInteractableNodeUpdate, buildDepletedBehaviorApply } from './interactableSocketBridge.js';

/**
 * Iterate every placed gathering-task Interactable token across all scenes and
 * respawn each token's `flags.fabricate.node` one step for the elapsed world
 * time. Active-GM gated by the caller. Returns the list of `{ sceneId, tokenId }`
 * actually changed.
 *
 * @param {object} [opts]
 * @param {number} opts.worldTime Current world time (seconds).
 * @param {(unit: string) => number} opts.secondsPerUnit Calendar seam.
 * @param {() => boolean} [opts.isActiveGM] Active-GM predicate (passable so the
 *   "non-active-GM applies nothing" decision is unit-testable). When it returns
 *   false the whole pass is a no-op (`[]`) — node-state writes belong to the
 *   single active GM, mirroring the per-environment respawn gate. Defaults to a
 *   `game.user === game.users.activeGM` check.
 * @param {() => number} [opts.rollD100] D100 roller (test seam).
 * @param {(expression: string) => number} [opts.rollExpression] Dice roller (test seam).
 * @param {object} [opts.scenes] Foundry scenes collection (defaults to `game.scenes`).
 * @param {(args: object) => (void|Promise<void>)} [opts.applyUpdate] Token-update edge.
 * @param {(args: { token: object, behavior: object|null, depleted: boolean }) => (void|Promise<void>)} [opts.applyDepletedBehavior]
 *   Depleted-behavior visual edge: a node that respawns back above 0 reverts its
 *   swap-image/postfix visual; one that respawns into depletion (unusual, but
 *   handled) applies it. `deleteToken` tokens are already absent and never reach
 *   here. Defaults to the GM-routed writer; injectable so the pass is testable.
 * @returns {Promise<Array<{ sceneId: string, tokenId: string }>>}
 */
export async function respawnInteractableTokens({
  worldTime,
  secondsPerUnit,
  isActiveGM = () => globalThis.game?.user === globalThis.game?.users?.activeGM,
  rollD100 = () => Math.floor(Math.random() * 100) + 1,
  rollExpression = () => 0,
  scenes = globalThis.game?.scenes,
  applyUpdate = applyInteractableNodeUpdate,
  applyDepletedBehavior = buildDepletedBehaviorApply()
} = {}) {
  // Active-GM ONLY: a non-active client applies nothing (no token writes), so
  // connected clients never double-apply the per-token respawn.
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return [];
  const now = Number(worldTime);
  if (!Number.isFinite(now)) return [];
  const sceneList = normalizeCollection(scenes);
  const changed = [];

  for (const scene of sceneList) {
    const tokens = normalizeCollection(scene?.tokens);
    for (const token of tokens) {
      const flags = readInteractableFlags(token);
      if (!flags || flags.interactableType !== 'gatheringTask') continue;
      const node = normalizeNodeConfig(flags.node);
      if (!node) continue; // unlimited node — nothing to respawn.

      const { changed: didChange, node: next } = respawnNodeOnce(node, {
        now,
        secondsPerUnit,
        // Raw 1..100 roll seam (the math hits on `roll <= chance*100`), identical
        // to the per-environment respawn path.
        rollChance: () => Number(rollD100()),
        rollExpression
      });
      if (!didChange) continue;

      const sceneId = String(scene?.id ?? token?.parent?.id ?? '');
      const tokenId = String(token?.id ?? token?._id ?? '');
      if (!sceneId || !tokenId) continue;
      // eslint-disable-next-line no-await-in-loop
      await applyUpdate({ sceneId, tokenId, update: { flags: { fabricate: { node: next } } } });
      // Keep the token visual in lockstep with the respawned count: a node that
      // climbs back above 0 reverts its depleted swap-image/postfix. Idempotent
      // (the pure planner no-ops when nothing changed). `deleteToken` tokens are
      // terminal — already absent, so they never enter this loop.
      if (typeof applyDepletedBehavior === 'function') {
        // eslint-disable-next-line no-await-in-loop
        await applyDepletedBehavior({
          token,
          behavior: next.depletedBehavior ?? null,
          depleted: isNodeDepleted(next)
        });
      }
      changed.push({ sceneId, tokenId });
    }
  }
  return changed;
}

function normalizeCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}
