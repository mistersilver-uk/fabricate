/**
 * The single generic world Actor that backs every Fabricate Interactable token.
 *
 * Interactable tokens are UNLINKED (`actorLink: false`); all per-Interactable
 * data lives in the token flags, not on the actor. We still need ONE backing
 * actor so Foundry can create the tokens. This module find-or-creates that actor
 * lazily, GM-only, and flags it `flags.fabricate.isInteractableActor = true`.
 *
 * The find-or-create LOGIC is pure and testable: `resolveInteractableActor`
 * takes injected accessors (list actors, create actor, gm check). The thin
 * `ensureInteractableActor` wrapper binds those accessors to Foundry globals and
 * resolves a generic actor type valid for the active game system.
 */

export const INTERACTABLE_ACTOR_NAME = 'Fabricate Interactable';
export const INTERACTABLE_ACTOR_FLAG = 'isInteractableActor';

/**
 * Is this actor the Fabricate Interactable backing actor?
 *
 * @param {object} actor
 * @returns {boolean}
 */
export function isInteractableActor(actor) {
  return actor?.flags?.fabricate?.[INTERACTABLE_ACTOR_FLAG] === true;
}

/**
 * Pure find-or-create for the backing actor.
 *
 * Returns the existing flagged actor when present; otherwise creates exactly one
 * (GM-only) and returns it. When no actor exists and the caller is not a GM,
 * returns `null` (a non-GM cannot create the world actor).
 *
 * @param {object} deps
 * @param {() => Iterable<object>} deps.listActors   Yields candidate actors.
 * @param {(data: object) => Promise<object>|object} deps.createActor
 * @param {() => boolean} deps.isGM
 * @param {string} deps.actorType                    Generic actor type valid for the system.
 * @returns {Promise<object|null>}
 */
export async function resolveInteractableActor({ listActors, createActor, isGM, actorType } = {}) {
  const actors = typeof listActors === 'function' ? listActors() : [];
  for (const actor of actors ?? []) {
    if (isInteractableActor(actor)) return actor;
  }

  if (typeof isGM === 'function' && !isGM()) return null;
  if (typeof createActor !== 'function') return null;

  return await createActor({
    name: INTERACTABLE_ACTOR_NAME,
    type: actorType,
    flags: { fabricate: { [INTERACTABLE_ACTOR_FLAG]: true } }
  });
}

/**
 * Pick a generic actor type valid for the active game system.
 *
 * Prefers a conventional generic type when the system declares it, else falls
 * back to the first declared Actor document type. Pure given the injected type
 * list.
 *
 * @param {string[]} actorTypes   Declared Actor document subtypes for the system.
 * @returns {string|null}
 */
export function pickGenericActorType(actorTypes = []) {
  const types = Array.from(actorTypes ?? []).filter(t => typeof t === 'string' && t && t !== 'base');
  if (types.length === 0) return null;
  // Prefer conventional "generic stand-in" types when the system offers them.
  const preferred = ['npc', 'character', 'vehicle', 'group'];
  for (const candidate of preferred) {
    if (types.includes(candidate)) return candidate;
  }
  return types[0];
}

/**
 * Resolve the declared Actor document subtypes for the active game system.
 * Isolated here so it is the single Foundry-global touch for type discovery.
 *
 * @returns {string[]}
 */
function readActorDocumentTypes() {
  const fromGame = globalThis.game?.documentTypes?.Actor;
  if (fromGame) return Array.from(fromGame);
  const fromSystem = globalThis.game?.system?.documentTypes?.Actor;
  if (fromSystem) return Array.from(fromSystem);
  const fromConfig = globalThis.CONFIG?.Actor?.documentClass?.TYPES
    ?? globalThis.CONFIG?.Actor?.typeLabels;
  if (fromConfig) return Array.from(Array.isArray(fromConfig) ? fromConfig : Object.keys(fromConfig));
  return [];
}

/**
 * Find-or-create the Fabricate Interactable backing actor, lazily and GM-only.
 *
 * Thin Foundry-bound wrapper over {@link resolveInteractableActor}: binds the
 * actor collection, `Actor.create`, the GM check, and the generic actor type.
 *
 * @returns {Promise<object|null>} The backing actor, or null when unavailable.
 */
export async function ensureInteractableActor() {
  const actorType = pickGenericActorType(readActorDocumentTypes());
  if (!actorType) {
    console.warn('Fabricate | No generic actor type available for the Interactable backing actor');
    return null;
  }
  return resolveInteractableActor({
    listActors: () => globalThis.game?.actors?.contents ?? [],
    createActor: (data) => globalThis.Actor?.create?.(data),
    isGM: () => globalThis.game?.user?.isGM === true,
    actorType
  });
}
