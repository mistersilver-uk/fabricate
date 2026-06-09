/**
 * World-time respawn pass for placed gathering-task `fabricate.interactable`
 * Region Behaviours.
 *
 * In the region-first model a gathering-task interactable owns its own
 * depletion/respawn state on the Region Behaviour (`system.node`), independent of
 * `environment.nodeRuntime[taskId]`. As world time advances, each placed
 * behaviour's node respawns on its own calendar-aware interval. This mirrors
 * the engine's per-ENVIRONMENT respawn pass: ACTIVE-GM ONLY so connected clients
 * never double-apply.
 *
 * The respawn ARITHMETIC is pure (`respawnNodeOnce`); this module is the thin
 * Foundry edge that walks scenes → regions → behaviours and writes changed nodes
 * via the injected active-GM appliers. The caller (main.js) gates the whole pass
 * on the active GM (the gate is also passable so it is unit-testable).
 */

import { normalizeNodeConfig } from '../../systems/gatheringNodeConfig.js';
import { respawnNodeOnce, isNodeDepleted } from '../../systems/nodeRespawnMath.js';
import { isInteractableRegionBehavior, readInteractableBehaviorSystem } from './interactableRegionFlags.js';
import {
  applyInteractableBehaviorUpdate,
  buildLinkedVisualApply
} from '../interactableSocketBridge.js';

/**
 * Iterate every placed gathering-task `fabricate.interactable` Region Behaviour
 * across all scenes and respawn each behaviour's `system.node` one step for the
 * elapsed world time. Active-GM gated. Returns the list of
 * `{ sceneId, regionId, behaviorId }` actually changed.
 *
 * @param {object} [opts]
 * @param {number} opts.worldTime Current world time (seconds).
 * @param {(unit: string) => number} opts.secondsPerUnit Calendar seam.
 * @param {() => boolean} [opts.isActiveGM] Active-GM predicate. When it returns
 *   false the whole pass is a no-op (`[]`). Defaults to a
 *   `game.user === game.users.activeGM` check.
 * @param {() => number} [opts.rollD100] D100 roller (test seam).
 * @param {(expression: string) => number} [opts.rollExpression] Dice roller (test seam).
 * @param {object} [opts.scenes] Foundry scenes collection (defaults to `game.scenes`).
 * @param {(args: object) => (void|Promise<void>)} [opts.applyBehaviorUpdate] Behaviour-update edge.
 * @param {(args: { behaviorSystem: object, depleted: boolean }) => (void|Promise<void>)} [opts.applyLinkedVisual]
 *   Linked-visual depleted reflection: a node that respawns back above 0 reverts
 *   its depleted marker. Defaults to the GM-routed applier; injectable for tests.
 * @returns {Promise<Array<{ sceneId: string, regionId: string, behaviorId: string }>>}
 */
export async function respawnInteractableRegionBehaviors({
  worldTime,
  secondsPerUnit,
  isActiveGM = () => globalThis.game?.user === globalThis.game?.users?.activeGM,
  rollD100 = () => Math.floor(Math.random() * 100) + 1,
  rollExpression = () => 0,
  scenes = globalThis.game?.scenes,
  applyBehaviorUpdate = applyInteractableBehaviorUpdate,
  applyLinkedVisual = buildLinkedVisualApply()
} = {}) {
  // Active-GM ONLY: a non-active client applies nothing, so connected clients
  // never double-apply the per-behaviour respawn.
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return [];
  const now = Number(worldTime);
  if (!Number.isFinite(now)) return [];
  const sceneList = normalizeCollection(scenes);
  const changed = [];

  for (const scene of sceneList) {
    const sceneId = String(scene?.id ?? '');
    const regions = normalizeCollection(scene?.regions);
    for (const region of regions) {
      const regionId = String(region?.id ?? region?._id ?? '');
      const behaviors = normalizeCollection(region?.behaviors);
      for (const behavior of behaviors) {
        if (!isInteractableRegionBehavior(behavior)) continue;
        const system = readInteractableBehaviorSystem(behavior);
        if (!system || system.interactableType !== 'gatheringTask') continue;
        const node = normalizeNodeConfig(system.node);
        if (!node) continue; // unlimited node — nothing to respawn.

        const { changed: didChange, node: next } = respawnNodeOnce(node, {
          now,
          secondsPerUnit,
          // Raw 1..100 roll seam (the math hits on `roll <= chance*100`),
          // identical to the per-environment + per-tile respawn paths.
          rollChance: () => Number(rollD100()),
          rollExpression
        });
        if (!didChange) continue;

        const behaviorId = String(behavior?.id ?? behavior?._id ?? '');
        if (!sceneId || !regionId || !behaviorId) continue;
        // eslint-disable-next-line no-await-in-loop
        await applyBehaviorUpdate({ sceneId, regionId, behaviorId, update: { system: { node: next } } });
        // Keep the linked visual in lockstep with the respawned count.
        if (typeof applyLinkedVisual === 'function') {
          // eslint-disable-next-line no-await-in-loop
          await applyLinkedVisual({
            behaviorSystem: { ...system, node: next },
            depleted: isNodeDepleted(next)
          });
        }
        changed.push({ sceneId, regionId, behaviorId });
      }
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
