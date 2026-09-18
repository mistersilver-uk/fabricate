/**
 * The world-scope definition store fake every scope-store suite drives its write path through. The
 * essence suite and the component suite carried BYTE-IDENTICAL copies of this function under two
 * names.
 *
 * @param {object[]} entities the world entities the store starts seeded with.
 * @returns {{payload: {entities: object[], defaults: object, membership: object}, store: object}}
 * the live payload, so a test can read what landed, and the store the actions are handed.
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
