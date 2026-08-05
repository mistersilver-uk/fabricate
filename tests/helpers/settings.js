/**
 * Settings seams that model Foundry's PERMISSION behaviour, not just its storage.
 *
 * Every persistence fake in this suite has historically been omnipotent: a `Map.set`
 * that cannot refuse. That is precisely why a player-reachable world-scope write could
 * ship — the fake replaced the only object capable of saying no, so "forgot to route
 * this through the GM" was structurally invisible to `npm test` and only surfaced as
 * `User <name> lacks permission to update Setting [...]` in a real player session.
 *
 * `makeSettingsSeam({ isGM: false })` rejects exactly as the server does, so a test can
 * assert that a player-reachable path does NOT write world state. The scope is read
 * from the REAL setting definitions via {@link isWorldScopedSettingKey}, so this can
 * never drift from `src/config/settings.js` the way a hand-copied key list would.
 *
 * Default `isGM: true` keeps existing GM-shaped fixtures green; opt in to the player
 * client where the flow is player-reachable.
 */

import { FABRICATE_SETTINGS_NAMESPACE, WORLD_SCOPED_SETTING_KEYS } from '../../src/config/settings.js';

/**
 * Whether a Fabricate setting key is world-scoped, and therefore GM-only to write.
 * Accepts either a bare key (`'gatheringEnvironments'`) or a fully-qualified one
 * (`'fabricate.gatheringEnvironments'`).
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isWorldScopedSettingKey(key) {
  const raw = String(key ?? '');
  const bare = raw.startsWith(`${FABRICATE_SETTINGS_NAMESPACE}.`)
    ? raw.slice(FABRICATE_SETTINGS_NAMESPACE.length + 1)
    : raw;
  return WORLD_SCOPED_SETTING_KEYS.has(bare);
}

/**
 * The exact error Foundry's server backend produces for a refused Setting update, so
 * a test asserting on the failure sees the real shape rather than a stand-in.
 *
 * @param {string} userName
 * @param {string} key
 * @returns {Error}
 */
export function settingPermissionError(userName, key) {
  return new Error(`User ${userName} lacks permission to update Setting [${key}]`);
}

/**
 * Build a `{ getSetting, setSetting, settings, writes }` seam whose `setSetting`
 * REJECTS world-scope keys when the acting client is not a GM.
 *
 * @param {object} [options]
 * @param {boolean} [options.isGM=true] Whether the acting client is a GM.
 * @param {string} [options.userName='Player'] Name used in the rejection message.
 * @param {Iterable<[string, any]>} [options.initial] Seed entries.
 * @returns {{
 *   getSetting: (key: string) => any,
 *   setSetting: (key: string, value: any) => Promise<any>,
 *   settings: Map<string, any>,
 *   writes: Array<{ key: string, value: any }>,
 *   refused: Array<string>,
 * }}
 */
export function makeSettingsSeam({ isGM = true, userName = 'Player', initial = [] } = {}) {
  const settings = new Map(initial);
  const writes = [];
  const refused = [];
  return {
    settings,
    writes,
    refused,
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => {
      if (!isGM && isWorldScopedSettingKey(key)) {
        refused.push(String(key));
        throw settingPermissionError(userName, `${FABRICATE_SETTINGS_NAMESPACE}.${key}`);
      }
      settings.set(key, value);
      writes.push({ key, value });
      return value;
    },
  };
}
