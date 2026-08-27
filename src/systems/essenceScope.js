import {
  defineScope,
  normalizeMemberships,
  normalizeWorldDefaults,
  resolveScopedDefinition,
} from './scopedDefinitions.js';

/**
 * The essence half of Scoped Entity Definitions (issue 1358, part of epic 1357).
 *
 * NOT YET LIVE. `## EssenceDefinition` describes the shipped per-system shape and stays
 * authoritative until the world-scope migration (epic 1357, PR 3) lands.
 *
 * TWO INDEPENDENT INHERIT SWITCHES, over `effectSource` and `macro`. They are two sections rather
 * than one because a system may reasonably take the world's active-effect source and author its
 * own property macro, or the reverse; a single switch over both would force one choice on the
 * other.
 *
 * `enabled` KEEPS ITS SHIPPED MEANING VERBATIM. It gates essence-carried BEHAVIOUR and never
 * essence ARITHMETIC (`## EssenceDefinition` requirements 7-8): a disabled essence still matches,
 * accumulates and is consumed exactly as before, because a mid-session toggle must not change what
 * an already-held item is worth. What it withholds is what the essence carries ONTO a result -
 * neither its property macro nor its active-effect transfer runs. It is a soft disable and fully
 * reversible: nothing is deleted, every stored reference is preserved and still rendered, and a
 * disabled essence is never removed from the valid-essence-id set threaded into component
 * normalization.
 *
 * DISABLED IS NOT ABSENT. A disabled essence is a MEMBER that is off and keeps its overrides;
 * removing it from the system deletes the membership record and its overrides with it.
 */

/**
 * The essence sections resolution reads through, and the only keys an essence membership record's
 * `inherit` map may carry.
 *
 * @type {readonly string[]}
 */
export const ESSENCE_SECTIONS = Object.freeze(['effectSource', 'macro']);

/**
 * The essence scope descriptor.
 *
 * @type {Readonly<object>}
 */
export const ESSENCE_SCOPE = defineScope({
  sections: ESSENCE_SECTIONS,
  enableable: true,
});

/**
 * Normalize the world essence defaults.
 *
 * @param {unknown} raw
 * @returns {Array<object>}
 */
export function normalizeEssenceWorldDefaults(raw) {
  return normalizeWorldDefaults(raw, ESSENCE_SCOPE);
}

/**
 * Normalize the essence system membership records.
 *
 * `enabled` defaults to TRUE on a record that authored none, matching `## EssenceDefinition`
 * requirement 6: an absent key already reads as enabled everywhere the shipped normalizer runs.
 *
 * @param {unknown} raw
 * @returns {Array<object>}
 */
export function normalizeEssenceMemberships(raw) {
  return normalizeMemberships(raw, ESSENCE_SCOPE);
}

/**
 * Resolve one `(essence, system)` pair.
 *
 * The answer carries `effectSource` and `macro` (each when authored at the winning scope),
 * `member`, the per-section `inherited` map, and `enabled`.
 *
 * `enabled` is `false` for a non-member because it is NOT A MEMBER, never because it inherited an
 * off: a world default carries no enabled flag.
 *
 * @param {object|null} worldDefault
 * @param {object|null} membership
 * @returns {{effectSource?: unknown, macro?: unknown, member: boolean, enabled: boolean,
 *   inherited: {[section: string]: boolean}}}
 */
export function resolveEssence(worldDefault, membership) {
  return resolveScopedDefinition(worldDefault, membership, ESSENCE_SCOPE);
}

/**
 * Whether a resolved essence carries its behaviour onto a crafted result.
 *
 * This is the ONLY thing `enabled` gates. It deliberately answers nothing about matching,
 * accumulation or consumption, which a disabled essence still participates in unchanged.
 *
 * @param {{member?: boolean, enabled?: boolean}} resolved
 * @returns {boolean}
 */
export function essenceCarriesBehaviour(resolved) {
  return Boolean(resolved?.member) && resolved?.enabled === true;
}
