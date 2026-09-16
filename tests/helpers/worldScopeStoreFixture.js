/**
 * The world-scope definition store fake every scope-store suite drives its write path through.
 *
 * ## Why it is shared rather than restated
 *
 * The essence suite and the component suite carried BYTE-IDENTICAL copies of this function under
 * two names. SonarCloud's copy-paste detector counts `tests/**` exactly like `src/**` and matches
 * by token SHAPE rather than by literal, so two copies differing only in a name were reported as
 * duplicated new lines against the quality gate. They are one shape because they are one contract:
 * the scope store is generic over the entity family, and the three families differ only in the
 * descriptor the projection is handed.
 *
 * ## The one thing the shape is load-bearing about
 *
 * THE PUBLISHED CORPUS IS THE ARRAY SHAPE AND THE PERSISTED VALUE IS THE MAP SHAPE. The real store
 * converts between them on `load()` and `save()`, and a fake that published the map makes
 * `projectWorldScopeEntity` see NO memberships at all — so every projection reads `member: false`
 * with `inherited` all-true, which looks exactly like a switch that will not move rather than like
 * a broken fixture.
 *
 * It is also a NEW OBJECT PER PUBLISH, because the resolved-union memo keys on the corpus object's
 * identity: a fake that returned the same object twice would serve a stale union after a write and
 * every assertion about a write's effect would read the state before it.
 *
 * `tests/helpers/**` is outside the `npm test` glob, so this file adds no test count.
 *
 * @param {object[]} entities the world entities the store starts seeded with.
 * @returns {{payload: {entities: object[], defaults: object, membership: object}, store: object}}
 *   the live payload, so a test can read what landed, and the store the actions are handed.
 */
export function makeWorldScopeStoreFake(entities) {
  const payload = { entities: [...entities], defaults: {}, membership: {} };
  return {
    payload,
    store: {
      get: () => JSON.parse(JSON.stringify(payload)),
      corpus: () => ({
        entities: [...payload.entities],
        defaults: Object.values(payload.defaults),
        membership: Object.values(payload.membership),
      }),
      isSeeded: () => payload.entities.length > 0,
      save: async (next) => {
        payload.entities = next.entities;
        payload.defaults = next.defaults;
        payload.membership = next.membership;
      },
    },
  };
}
