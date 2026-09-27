/**
 * Compose the internal companion operation authority over the Journal run authority it shares a
 * ledger, claim and local queue with. Internal only: no facade publishes it, and it ships no
 * executor, effect or recovery (issue 1953).
 */

import { createCompanionOperationAuthority } from '../systems/companionOperationAuthority.js';
import { createCompanionOperationStore } from '../systems/companionOperationStore.js';
import { EVENT_SCENE_SOCKET } from '../systems/eventSceneCoordinator.js';

/**
 * @param {{authority: object}} deps The one authority instance the Journal commands also use; a
 *   second instance would be a second local queue racing the first for the same claim page.
 * @returns {object} The internal companion operation service.
 */
export function createCompanionOperationsForFabricate({ authority }) {
  return createCompanionOperationAuthority({
    authority,
    createStore: createCompanionOperationStore,
    currentUser: () => game.user ?? null,
    activeGM: () => game.users?.activeGM ?? null,
    getUser: (userId) => game.users?.get(userId) ?? null,
    emit: (message, options) => game.socket?.emit(EVENT_SCENE_SOCKET, message, options ?? {}),
    randomId: () => foundry.utils.randomID(),
    clock: () => Date.now(),
  });
}
