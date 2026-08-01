/**
 * The actors the CURRENT user is permitted to write to (issue 970).
 *
 * Fabricate has no socket-to-GM relay: every actor mutation is performed directly
 * by the acting client, so a pass that walks `game.actors` and writes is only
 * legal for the subset that client owns. Foundry refuses the rest, and
 * `setFabricateFlag` deliberately REJECTS on a refused update rather than
 * reporting a phantom success — so an un-filtered walk turns one stale entry on
 * someone else's character into an unhandled rejection on every player client.
 *
 * `Actor#isOwner` is Foundry's own answer to "may I update this document", and it
 * is unconditionally true for a GM, so a GM client still sweeps the whole world
 * while a player sweeps only their own characters. That is deliberately DIFFERENT
 * from the primary-GM gate on the world-time resume loops (`processWorldTime`):
 *
 *   - the resume loops must run on exactly ONE client, because they advance run
 *     state that then resolves, and N clients racing it would resolve N times;
 *   - the startup maintenance passes are idempotent housekeeping (they delete keys
 *     that name deleted content), so several clients doing their own share is
 *     harmless — and unlike a primary-GM gate, it does not make cleanup hostage to
 *     a GM ever logging in.
 *
 * This is a WRITE-permission question and is deliberately not the same predicate as
 * `isGatheringActorSelectableByUser` in `config/preferencesCleanup.js`, which asks
 * the different question of which actor a user may ACT AS.
 *
 * @param {Iterable<object>|null|undefined} actors Typically `game.actors`.
 * @returns {object[]} Only the actors this client may update; never null.
 */
export function selectWritableActors(actors) {
  if (!actors) return [];
  return [...actors].filter((actor) => actor?.isOwner === true);
}
