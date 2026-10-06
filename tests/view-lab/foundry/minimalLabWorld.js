/**
 * The smallest world `installFoundryShim` accepts, for the Primitive Lab (issue 1487). A specimen
 * reads no system, recipe or actor, so the lab never boots `src/main.js` or runs a migration the
 * way `buildLabWorld()` does. The fields are exactly the `world.<field>` reads the shim makes.
 */

/** Two weeks in, as the View Lab fixture uses; zero would read the same as an unset field. */
export const MINIMAL_LAB_WORLD_TIME = 1_209_600;

/** Every field `installFoundryShim` reads off its world. */
export const MINIMAL_LAB_WORLD_FIELDS = Object.freeze([
  'seed',
  'actorList',
  'scenes',
  'settings',
  'i18n',
  'worldTime',
  'documents',
]);

/**
 * Build the world the Primitive Lab installs its Foundry globals from.
 *
 * @param {object} options Options.
 * @param {{localize: Function, format: Function}} options.i18n The `game.i18n` pair, from
 *   `labI18n.js`; required, since an echoing stub would print raw `FABRICATE.*` keys.
 * @param {number} [options.seed] Seed for the deterministic `randomID` stream.
 * @returns {object} The world, holding exactly {@link MINIMAL_LAB_WORLD_FIELDS}.
 * @throws {TypeError} When the i18n pair or the seed is missing.
 */
export function createMinimalLabWorld({ i18n, seed = 20_260_601 } = {}) {
  if (typeof i18n?.localize !== 'function' || typeof i18n?.format !== 'function') {
    throw new TypeError('createMinimalLabWorld requires a game.i18n stub with localize and format');
  }
  if (!Number.isFinite(seed)) throw new TypeError('createMinimalLabWorld requires a numeric seed');
  return {
    seed,
    actorList: [],
    scenes: [],
    settings: new Map(),
    i18n,
    worldTime: MINIMAL_LAB_WORLD_TIME,
    documents: new Map(),
  };
}
