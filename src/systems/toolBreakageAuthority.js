/**
 * The effective tool-breakage authority the four non-UI readers share (issue 1363), live since
 * `1.30.0` made the system normalizer absence-preserving. The manager surfaces instead call the
 * pure resolver through `adminSystemInspectorProjection.js` (issue 1374), and a surface that
 * re-defaults locally is a defect `tests/world-scope-tool-breakage-authority.test.js` gates. The
 * world value comes from a lazy, optional-chained global probe, never an import, and a throwing or
 * absent store reads as no world value. A system inherits the world value unless it authored a
 * recognised token, falling back to `toolSpecific` (`## CraftingSystem` requirement 21).
 */

import { resolveToolBreakageAuthority } from './toolScope.js';

function publishedWorldToolBreakage() {
  try {
    return globalThis.game?.fabricate?.getToolScopeStore?.()?.corpus?.()?.toolBreakage ?? null;
  } catch {
    return null;
  }
}

export function effectiveToolBreakageAuthority(system, worldToolBreakage) {
  const world = worldToolBreakage === undefined ? publishedWorldToolBreakage() : worldToolBreakage;
  return resolveToolBreakageAuthority(world, system?.toolBreakage);
}
