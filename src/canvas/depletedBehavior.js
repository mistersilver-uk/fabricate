/**
 * Depleted-behavior apply/revert for placed gathering-task Interactable tokens
 * (Phase 6).
 *
 * A gathering task may configure `depletedBehavior { swapImage?, postfixName?,
 * deleteToken? }` on its node config (normalized by `gatheringNodeConfig.js`).
 * When the token's node transitions to depleted (`node.current <= 0`), the token
 * VISUAL changes; when it respawns back above 0, the visual is reverted to the
 * token's original image/name (captured in `flags.fabricate.nodeOriginal`).
 *
 * The DECISION — what token mutation to apply/revert given the config + the
 * current token state — is a PURE function ({@link planDepletedBehavior}). The
 * thin Foundry/socket edge ({@link buildDepletedBehaviorWriter}) turns that plan
 * into a `token.update`/`token.delete` routed through the SAME active-GM socket
 * path as the node writes (players never write tokens directly).
 *
 * `deleteToken` is TERMINAL: a deleted token cannot be restored by respawn, so
 * the world-time respawn pass must no-op against a deleted/absent token (see
 * `interactableWorldTime.js`, which only iterates tokens still present).
 */

import { normalizeDepletedBehavior } from '../systems/gatheringNodeConfig.js';

const NAME_POSTFIX = ' (depleted)';

/**
 * Read the original token image + name as a `nodeOriginal` capture. Pure: reads
 * the token's `texture.src` / `name`, tolerating both a live TokenDocument and a
 * plain object.
 *
 * @param {object} token
 * @returns {{ img?: string, name?: string }}
 */
function captureOriginal(token) {
  const capture = {};
  const img = token?.texture?.src;
  if (typeof img === 'string' && img) capture.img = img;
  const name = token?.name;
  if (typeof name === 'string' && name) capture.name = name;
  return capture;
}

/**
 * Decide the token mutation for a depleted-behavior transition. PURE — no Foundry
 * globals, no token mutation; it returns a plan the caller's thin edge enacts.
 *
 * Inputs:
 *  - `behavior`   : the (normalized) `depletedBehavior` config, or null/none.
 *  - `depleted`   : whether the node is currently depleted (`current <= 0`).
 *  - `token`      : the token (for the current image/name + existing
 *                   `flags.fabricate.nodeOriginal` stash).
 *
 * Output `plan` shapes (all idempotent — a re-run in the same visual state
 * returns `{ action: 'none' }`):
 *  - `{ action: 'none' }`                      — nothing to do.
 *  - `{ action: 'delete' }`                    — terminal delete (depleted + deleteToken).
 *  - `{ action: 'apply', update }`             — apply swap/postfix; `update` is a
 *      token-document patch carrying `texture.src`/`name` and the freshly-stashed
 *      `flags.fabricate.nodeOriginal` (only stashed when not already present).
 *  - `{ action: 'revert', update }`            — restore from `nodeOriginal`;
 *      `update` clears the stash (`flags.fabricate.nodeOriginal = null`).
 *
 * @param {object} args
 * @param {{ swapImage?: string, postfixName?: boolean, deleteToken?: boolean }|null} args.behavior
 * @param {boolean} args.depleted
 * @param {object} args.token
 * @returns {{ action: 'none' } | { action: 'delete' } | { action: 'apply', update: object } | { action: 'revert', update: object }}
 */
export function planDepletedBehavior({ behavior, depleted, token } = {}) {
  const normalized = normalizeDepletedBehavior(behavior);
  // No behavior configured ⇒ nothing ever changes on the token visual.
  if (!normalized) return { action: 'none' };

  const existingOriginal = token?.flags?.fabricate?.nodeOriginal ?? null;

  if (depleted) {
    if (normalized.deleteToken === true) {
      return { action: 'delete' };
    }
    // swap/postfix apply. Idempotent: once a stash exists the visual is already
    // applied, so re-running is a no-op.
    if (existingOriginal) return { action: 'none' };

    const original = captureOriginal(token);
    const update = { flags: { fabricate: { nodeOriginal: original } } };
    if (normalized.swapImage) {
      update.texture = { src: normalized.swapImage };
    }
    if (normalized.postfixName === true) {
      const base = typeof token?.name === 'string' ? token.name : '';
      update.name = `${base}${NAME_POSTFIX}`;
    }
    // Nothing visual to change (e.g. behavior had only a blank swap) ⇒ no-op.
    if (update.texture === undefined && update.name === undefined) return { action: 'none' };
    return { action: 'apply', update };
  }

  // Not depleted ⇒ revert any applied visual back to the captured original.
  // Idempotent: no stash means nothing was applied, so nothing to revert.
  if (!existingOriginal) return { action: 'none' };
  const update = { flags: { fabricate: { nodeOriginal: null } } };
  if (typeof existingOriginal.img === 'string' && existingOriginal.img) {
    update.texture = { src: existingOriginal.img };
  }
  if (typeof existingOriginal.name === 'string') {
    update.name = existingOriginal.name;
  }
  return { action: 'revert', update };
}

/**
 * Build a `(token, node) => void|Promise` seam that applies/reverts depleted
 * behavior for one token, routing the token mutation through the GM. The node
 * `current` write itself is handled separately by the node adapter; this seam
 * only enacts the VISUAL transition tied to that node's depleted state.
 *
 * The depleted state is derived from the supplied `node` (the freshly-written
 * node), so the visual stays in lockstep with the count. `behavior` is resolved
 * from the task's node config (NOT snapshotted on the node — though a token's
 * snapshot node DOES carry it; either source works since both are normalized).
 *
 * @param {object} deps
 * @param {(args: { sceneId: string, tokenId: string, update: object }) => (void|Promise<void>)} deps.emitUpdate
 *   Route a `token.update` patch through the GM (local apply or socket emit).
 * @param {(args: { sceneId: string, tokenId: string }) => (void|Promise<void>)} deps.emitDelete
 *   Route a `token.delete` through the GM.
 * @param {(token: object) => ({ sceneId: string, tokenId: string }|null)} deps.identify
 *   Resolve the token's scene + id.
 * @returns {(args: { token: object, behavior: object|null, depleted: boolean }) => (void|Promise<void>)}
 */
export function buildDepletedBehaviorWriter({ emitUpdate, emitDelete, identify } = {}) {
  return ({ token, behavior, depleted } = {}) => {
    const plan = planDepletedBehavior({ behavior, depleted, token });
    if (plan.action === 'none') return undefined;
    const ids = typeof identify === 'function' ? identify(token) : null;
    if (!ids) return undefined;
    if (plan.action === 'delete') {
      return emitDelete?.({ sceneId: ids.sceneId, tokenId: ids.tokenId });
    }
    return emitUpdate?.({ sceneId: ids.sceneId, tokenId: ids.tokenId, update: plan.update });
  };
}
