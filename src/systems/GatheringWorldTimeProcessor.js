import {
  isInteractableRegionBehavior,
  readInteractableBehaviorSystem,
} from '../canvas/regions/interactableRegionFlags.js';
import { identifyRegionBehaviorRef } from '../canvas/regions/interactableRegionNodeAdapter.js';

import { idOf, iterateCollection, normalizeList } from './gatheringEngineInternals.js';

/**
 * GM-gated, world-time-driven maintenance passes extracted from GatheringEngine
 * (issue 374). Runs stamina regeneration, environment-scoped node respawn, and
 * interactable-scoped node respawn off the same world-time tick that matures
 * timed gathering runs.
 *
 * This collaborator is UNGUARDED by design: the engine calls
 * `processRegenAndRespawn` only inside its primary-GM guard, so the processor
 * carries no `isPrimaryGM` of its own and must never default a guard to
 * `() => true`. It forwards the supplied `worldTime` verbatim — it never reads
 * `globalThis.game.time` — because idempotency relies on richState's advanced-
 * anchor short-circuit against that exact value.
 */
export class GatheringWorldTimeProcessor {
  /**
   * @param {object} deps
   * @param {object} deps.richState - GatheringRichStateService (stamina/node/interactable persistence).
   * @param {object} deps.environmentStore - GatheringEnvironmentStore (`list()`).
   * @param {Function} deps.getActors - Returns the actor list to regenerate.
   * @param {Function} deps.scenes - Returns the scene graph (or null) for the V13 region traversal.
   * @param {Function} deps.applyInteractableBehaviorUpdate - Active-GM routed scoped-behaviour writer.
   * @param {Function} deps.enabledGatheringSystems - Seam returning the enabled-systems Map (shared with the engine's listing path).
   */
  constructor({
    richState = null,
    environmentStore = null,
    getActors = null,
    scenes = null,
    applyInteractableBehaviorUpdate = null,
    enabledGatheringSystems = null,
  } = {}) {
    this.richState = richState;
    this.environmentStore = environmentStore;
    this.getActors = typeof getActors === 'function' ? getActors : () => [];
    this.scenes = typeof scenes === 'function' ? scenes : () => null;
    this.applyInteractableBehaviorUpdate =
      typeof applyInteractableBehaviorUpdate === 'function' ? applyInteractableBehaviorUpdate : null;
    this.enabledGatheringSystems =
      typeof enabledGatheringSystems === 'function' ? enabledGatheringSystems : () => new Map();
  }

  /**
   * Run the three world-time maintenance passes in order — stamina regen,
   * environment node respawn, interactable-scoped node respawn — and return the
   * aggregate the engine folds into its `processWorldTime` result.
   *
   * @param {number} worldTime - Forwarded verbatim to every pass.
   * @returns {Promise<{staminaRegen:Array, nodeRespawn:Array, interactableNodeRespawn:Array}>}
   */
  async processRegenAndRespawn(worldTime) {
    const staminaRegen = await this._processStaminaRegen(worldTime);
    const nodeRespawn = await this._processNodeRespawn(worldTime);
    const interactableNodeRespawn = await this._processInteractableNodeRespawn(worldTime);
    return { staminaRegen, nodeRespawn, interactableNodeRespawn };
  }

  /**
   * Regenerate stamina for every actor that owns a pool in a stamina-enabled
   * system. Per-actor failures are swallowed so one bad actor cannot abort the
   * world-time tick. Returns the list of `{actorId, systemId}` actually changed.
   */
  async _processStaminaRegen(worldTime) {
    if (typeof this.richState?.regenerateActorStamina !== 'function') return [];
    const staminaSystems = [...this.enabledGatheringSystems().values()].filter(
      (system) => this.richState.staminaEnabled?.(system.id) === true
    );
    if (staminaSystems.length === 0) return [];
    const actors = normalizeList(this.getActors?.());
    const changed = [];
    for (const system of staminaSystems) {
      for (const actor of actors) {
        try {
          const updated = await this.richState.regenerateActorStamina({
            actor,
            systemId: system.id,
            system,
            worldTime,
          });
          if (updated) changed.push({ actorId: idOf(actor), systemId: String(system.id) });
        } catch (error) {
          // Surface (don't silently swallow) so a broken regen is diagnosable.
          console.warn(
            `Fabricate | stamina regen failed for actor ${idOf(actor)} in system ${system.id}:`,
            error
          );

          continue;
        }
      }
    }
    return changed;
  }

  /**
   * Respawn nodes for every environment owned by a nodes-enabled system. Per-
   * environment failures are swallowed. Returns the changed environment ids.
   */
  async _processNodeRespawn(worldTime) {
    if (typeof this.richState?.respawnNodes !== 'function') return [];
    const systems = this.enabledGatheringSystems();
    const changed = [];
    for (const environment of normalizeList(this.environmentStore?.list?.())) {
      if (!systems.has(environment?.craftingSystemId)) continue;
      if (!this.richState.nodesEnabled?.(environment.craftingSystemId)) continue;
      try {
        const updated = await this.richState.respawnNodes({ environment, worldTime });
        if (updated) changed.push({ environmentId: String(environment.id) });
      } catch (error) {
        // Surface (don't silently swallow) so a broken respawn is diagnosable.
        console.warn(`Fabricate | node respawn failed for environment ${environment?.id}:`, error);

        continue;
      }
    }
    return changed;
  }

  /**
   * Respawn interactable-SCOPED resource nodes as world time passes (issue 302).
   * Scans every scene region behaviour for `fabricate.interactable` gathering
   * tasks that own their own node pool (`taskNodeLink === 'unlinked'`, with a
   * real `node`) in a nodes-enabled system, advances each pool through the same
   * calendar-aware respawn arithmetic the environment pass uses, and writes the
   * changed `system.node` back via the active-GM routed seam. `nonRegenerating` /
   * `manual` pools never gain (the math short-circuits). Per-behaviour failures
   * are swallowed so one bad behaviour cannot abort the tick. Returns the list of
   * changed `{sceneId, regionId, behaviorId}` refs.
   *
   * @param {number} worldTime
   * @returns {Promise<Array<{sceneId:string, regionId:string, behaviorId:string}>>}
   */
  async _processInteractableNodeRespawn(worldTime) {
    if (typeof this.richState?.respawnInteractableNode !== 'function') return [];
    const sceneGraph = this.scenes?.();
    if (!sceneGraph || typeof this.applyInteractableBehaviorUpdate !== 'function') return [];
    const now = Number(worldTime);
    if (!Number.isFinite(now)) return [];

    const changed = [];
    for (const scene of iterateCollection(sceneGraph)) {
      for (const region of iterateCollection(scene?.regions)) {
        for (const behavior of iterateCollection(region?.behaviors)) {
          try {
            if (!isInteractableRegionBehavior(behavior)) continue;
            const view = readInteractableBehaviorSystem(behavior);
            if (!view || view.taskNodeLink !== 'unlinked' || !view.node) continue;
            if (this.richState.nodesEnabled?.(view.systemId) !== true) continue;

            const ref = identifyRegionBehaviorRef(behavior);
            if (!ref) continue;

            const result = await this.richState.respawnInteractableNode({
              node: view.node,
              worldTime: now,
            });
            if (!result?.changed) continue;

            await this.applyInteractableBehaviorUpdate(ref, {
              system: { node: result.node },
            });
            this._callRespawnHook(ref, view, result.node);
            changed.push(ref);
          } catch (error) {
            console.warn('Fabricate | interactable-scoped node respawn failed:', error);

            continue;
          }
        }
      }
    }
    return changed;
  }

  _callRespawnHook(ref, view, node) {
    try {
      globalThis.Hooks?.callAll?.('fabricate.gathering.nodeRespawned', {
        interactableRef: ref,
        systemId: view.systemId,
        taskId: view.taskId,
        current: Number(node?.current || 0),
        max: Number(node?.max || 0),
      });
    } catch {
      // A hook callback must never abort the respawn pass.
    }
  }
}
