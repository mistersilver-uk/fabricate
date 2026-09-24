/**
 * The actors this client may update (issue 970). Actor writes are made by the acting client, with
 * no GM relay, and `setFabricateFlag` rejects a refused update, so an unfiltered `game.actors` walk
 * throws on every player client. `Actor#isOwner` is always true for a GM, so a GM sweeps the world
 * and a player only their own characters; that suits idempotent startup housekeeping, unlike the
 * single-GM world-time resume loops. A write-permission question, unlike
 * `isGatheringActorSelectableByUser`, which asks which actor a user may act as.
 */
export function selectWritableActors(actors) {
  if (!actors) return [];
  return [...actors].filter((actor) => actor?.isOwner === true);
}
