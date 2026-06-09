/**
 * Depleted-behavior apply/revert for the TILE linked visual of a region-first
 * `fabricate.interactable` (the Tile branch of `linkedInteractableVisual.js`).
 *
 * A gathering task may configure `depletedBehavior { swapImage?, deleteToken? }`
 * on its node config (normalized by `gatheringNodeConfig.js`). The authoritative
 * node state lives on the Region Behaviour; when it transitions to depleted
 * (`node.current <= 0`), the linked Tile's VISUAL changes; when the node respawns
 * back above 0, the visual is reverted to the tile's original image (captured in
 * `flags.fabricate.nodeOriginal`). A missing linked Tile is a clean no-op — the
 * interactable still works region-only.
 *
 * A tile has NO nameplate, so the `postfixName` mode is NOT supported for the Tile
 * marker — only swap-image and the terminal delete change a tile's appearance.
 * (The `postfixName` flag is ignored if present on a legacy/raw behavior config.)
 *
 * The DECISION — what tile mutation to apply/revert given the config + the
 * current tile state — is a PURE function ({@link planDepletedBehavior}). The
 * thin Foundry/socket edge ({@link buildDepletedBehaviorWriter}) turns that plan
 * into a `tile.update`/`tile.delete` routed through the SAME active-GM socket
 * path as the node writes (players never write tiles directly).
 *
 * `deleteToken` (delete the linked visual) is TERMINAL: a deleted visual cannot
 * be restored by respawn, so the world-time respawn pass must no-op against a
 * deleted/absent visual. The flag key `deleteToken` is retained for data
 * compatibility — it deletes the linked visual.
 */

import { normalizeDepletedBehavior } from '../systems/gatheringNodeConfig.js';

/**
 * Read the original tile image as a `nodeOriginal` capture. Pure: reads the
 * tile's `texture.src`, tolerating both a live TileDocument and a plain object.
 * Tiles have no name, so only the image is captured.
 *
 * @param {object} tile
 * @returns {{ img?: string }}
 */
function captureOriginal(tile) {
  const capture = {};
  const img = tile?.texture?.src;
  if (typeof img === 'string' && img) capture.img = img;
  return capture;
}

/**
 * Decide the tile mutation for a depleted-behavior transition. PURE — no Foundry
 * globals, no tile mutation; it returns a plan the caller's thin edge enacts.
 *
 * Inputs:
 *  - `behavior`   : the (normalized) `depletedBehavior` config, or null/none.
 *  - `depleted`   : whether the node is currently depleted (`current <= 0`).
 *  - `tile`       : the tile (for the current image + existing
 *                   `flags.fabricate.nodeOriginal` stash).
 *
 * Output `plan` shapes (all idempotent — a re-run in the same visual state
 * returns `{ action: 'none' }`):
 *  - `{ action: 'none' }`                      — nothing to do.
 *  - `{ action: 'delete' }`                    — terminal delete (depleted + deleteToken).
 *  - `{ action: 'apply', update }`             — apply swap-image; `update` is a
 *      tile-document patch carrying `texture.src` and the freshly-stashed
 *      `flags.fabricate.nodeOriginal` (only stashed when not already present).
 *  - `{ action: 'revert', update }`            — restore from `nodeOriginal`;
 *      `update` clears the stash (`flags.fabricate.nodeOriginal = null`).
 *
 * The `postfixName` mode is dropped for tiles (no nameplate), so it never
 * produces a name change here.
 *
 * @param {object} args
 * @param {{ swapImage?: string, deleteToken?: boolean }|null} args.behavior
 * @param {boolean} args.depleted
 * @param {object} args.tile
 * @returns {{ action: 'none' } | { action: 'delete' } | { action: 'apply', update: object } | { action: 'revert', update: object }}
 */
export function planDepletedBehavior({ behavior, depleted, tile } = {}) {
  const normalized = normalizeDepletedBehavior(behavior);
  // No behavior configured ⇒ nothing ever changes on the tile visual.
  if (!normalized) return { action: 'none' };

  const existingOriginal = tile?.flags?.fabricate?.nodeOriginal ?? null;

  if (depleted) {
    if (normalized.deleteToken === true) {
      return { action: 'delete' };
    }
    // swap-image apply. Idempotent: once a stash exists the visual is already
    // applied, so re-running is a no-op. (postfixName is ignored for tiles.)
    if (existingOriginal) return { action: 'none' };

    const original = captureOriginal(tile);
    const update = { flags: { fabricate: { nodeOriginal: original } } };
    if (normalized.swapImage) {
      update.texture = { src: normalized.swapImage };
    }
    // Nothing visual to change (e.g. behavior had only a blank swap, or only the
    // dropped postfix) ⇒ no-op.
    if (update.texture === undefined) return { action: 'none' };
    return { action: 'apply', update };
  }

  // Not depleted ⇒ revert any applied visual back to the captured original.
  // Idempotent: no stash means nothing was applied, so nothing to revert.
  if (!existingOriginal) return { action: 'none' };
  const update = { flags: { fabricate: { nodeOriginal: null } } };
  if (typeof existingOriginal.img === 'string' && existingOriginal.img) {
    update.texture = { src: existingOriginal.img };
  }
  return { action: 'revert', update };
}

/**
 * Build a `({ tile, behavior, depleted }) => void|Promise` seam that
 * applies/reverts depleted behavior for one tile, routing the tile mutation
 * through the GM. The node `current` write itself is handled separately by the
 * node adapter; this seam only enacts the VISUAL transition tied to that node's
 * depleted state.
 *
 * The depleted state is derived from the supplied node's depleted flag (the
 * freshly-written node), so the visual stays in lockstep with the count.
 *
 * @param {object} deps
 * @param {(args: { sceneId: string, tileId: string, update: object }) => (void|Promise<void>)} deps.emitUpdate
 *   Route a `tile.update` patch through the GM (local apply or socket emit).
 * @param {(args: { sceneId: string, tileId: string }) => (void|Promise<void>)} deps.emitDelete
 *   Route a `tile.delete` through the GM.
 * @param {(tile: object) => ({ sceneId: string, tileId: string }|null)} deps.identify
 *   Resolve the tile's scene + id.
 * @returns {(args: { tile: object, behavior: object|null, depleted: boolean }) => (void|Promise<void>)}
 */
export function buildDepletedBehaviorWriter({ emitUpdate, emitDelete, identify } = {}) {
  return ({ tile, behavior, depleted } = {}) => {
    const plan = planDepletedBehavior({ behavior, depleted, tile });
    if (plan.action === 'none') return undefined;
    const ids = typeof identify === 'function' ? identify(tile) : null;
    if (!ids) return undefined;
    if (plan.action === 'delete') {
      return emitDelete?.({ sceneId: ids.sceneId, tileId: ids.tileId });
    }
    return emitUpdate?.({ sceneId: ids.sceneId, tileId: ids.tileId, update: plan.update });
  };
}
