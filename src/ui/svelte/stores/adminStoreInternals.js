/**
 * adminStoreInternals — the file-private helpers `adminStore` shares with the pure GM
 * browser projection modules extracted beside it (issue 1090).
 *
 * This module exists for exactly one reason: each helper here is called by BOTH the
 * retained store and one of the extracted projections. A copy on each side would be a
 * duplicated block the SonarCloud new-code duplication gate counts, so the shared leaf
 * lives here and both sides import it.
 *
 * Nothing here is a projection. `clonePlain` is the store's deep-copy chokepoint,
 * `fallbackRandomID` the module-scope id fallback its normalizers default to, and
 * `normalizeGatheringLibraryTool` the legacy-alias coalescing every tool read runs
 * through.
 *
 * Deliberately a LEAF under `stores/`: no `.svelte` in this repo imports from
 * `src/ui/svelte/stores/`, so nothing added here can reach a mounted-component test's
 * dependency closure (where a missing allowlist entry HANGS the suite as `# cancelled`
 * rather than failing it).
 */
import { Tool } from '../../../models/Tool.js';

/**
 * Deep-copy a plain JSON-safe value, passing `null` and `undefined` through unchanged.
 *
 * The store's chokepoint for handing a caller a value it may mutate freely: drafts,
 * published view state, and every projected sub-object that came off a manager record.
 *
 * @param {*} value
 * @returns {*} a structurally equal copy, or the same `null`/`undefined`.
 */
export function clonePlain(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

// Module-scope id fallback for the normalizer helpers (which run before the store
// closure's services-aware _randomID exists). Prefers Foundry's randomID, then the
// Web Crypto UUID; the last resort is a time + counter id (no PRNG) so we never
// rely on Math.random for identity.
let _fallbackIdCounter = 0;
/**
 * @returns {string} a fresh id, never derived from `Math.random`.
 */
export function fallbackRandomID() {
  if (typeof globalThis.foundry?.utils?.randomID === 'function') {
    return globalThis.foundry.utils.randomID();
  }
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  _fallbackIdCounter += 1;
  return `id-${Date.now().toString(36)}-${_fallbackIdCounter.toString(36)}`;
}

/**
 * Normalize one system-owned library tool through the `Tool` model.
 *
 * Coalesces the four historical source-uuid spellings into the canonical
 * `originItemUuid` / `registeredItemUuid` pair and the legacy `fallbackItemIds` into
 * `aliasItemUuids` BEFORE the model sees them, because `Tool.fromJSON` reads only the
 * canonical names and would otherwise drop a legacy tool's link silently.
 *
 * @param {object} [tool] Raw tool record.
 * @param {() => string} [randomID] Id source for a tool with no id yet.
 * @returns {object} the model's `toJSON()` shape.
 */
export function normalizeGatheringLibraryTool(tool = {}, randomID = fallbackRandomID) {
  const originItemUuid =
    tool.originItemUuid ||
    tool.registeredItemUuid ||
    tool.sourceItemUuid ||
    tool.sourceUuid ||
    null;
  const registeredItemUuid =
    tool.registeredItemUuid ||
    tool.originItemUuid ||
    tool.sourceUuid ||
    tool.sourceItemUuid ||
    null;
  const rawAliasItemUuids = Array.isArray(tool.aliasItemUuids)
    ? tool.aliasItemUuids
    : Array.isArray(tool.fallbackItemIds)
      ? tool.fallbackItemIds
      : [];
  return Tool.fromJSON({
    ...tool,
    id: String(tool.id || randomID()),
    registeredItemUuid,
    originItemUuid,
    aliasItemUuids: rawAliasItemUuids,
  }).toJSON();
}
