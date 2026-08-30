/**
 * THE EFFECTIVE TOOL-BREAKAGE AUTHORITY (issue 1363, epic 1357, PR 3).
 *
 * `resolveToolBreakageAuthority` in `toolScope.js` is the pure resolver over a world value and a
 * per-system override. It was shipped INERT at issue 1359, because
 * `_normalizeToolBreakageAuthority` substituted `toolSpecific` for anything missing on EVERY
 * normalize, so `system.toolBreakage.authority` was never absent and the world branch could never
 * be taken. `1.30.0` makes that normalizer ABSENCE-PRESERVING, which makes the world branch
 * reachable for the first time.
 *
 * THE FLIP IS INERT WITHOUT THIS MODULE. Nine sites re-defaulted to `toolSpecific` locally, so
 * making the world half reachable in the resolver changed nothing until the readers went through
 * it. This is the seam the FOUR non-UI readers — the shared breakage evaluator, the two crafting
 * engine decisions and the inventory listing builder's exhaustion projection — now share.
 *
 * THE UI SITES ARE ROUTED TOO, AT ONE POINT, AND NOT THROUGH THIS SEAM (issue 1374). They were
 * deferred here to the world tool-breakage editor, and that editor cannot discharge the
 * obligation: four of the five sit in `CraftingSystemManagerRoot.svelte`, which
 * `### GM World Scoped Entity Routes` requirement 7 closes to the lane that builds it. The fifth
 * IS the projection the other four read, so the manager's selected-system projection
 * (`adminSystemInspectorProjection.js`) calls the pure resolver directly, with the world block
 * passed to it EXPLICITLY by `adminStore` rather than probed. That is `adminStore`'s constraint
 * rather than the projection's — all eight `game.*` occurrences in `adminStore.js` are comments
 * and five of them promise it stays that way, while the projection does hold one real probe, for
 * the learned-knowledge actor index. A probe here would have been the store's first. Publishing
 * value there routes all five manager surfaces at once and keeps the reader count from growing
 * with the screens. A manager surface that re-defaults locally is therefore a DEFECT rather than
 * a duplicate of this seam, and `tests/world-scope-tool-breakage-authority.test.js` gates it.
 *
 * THE WORLD VALUE IS READ THROUGH A LAZY GLOBAL PROBE, not imported. The three consumers are
 * pure-ish domain modules, and `toolScope.js` is a deliberate leaf with no Foundry and no UI in
 * its closure; importing `src/config/settings.js` into any of them would drag `src/ui/theme.js`
 * along with it. The probe is the same shape `CraftingSystemManager` already uses for the three
 * scope-store seams, and it is fully optional-chained so a Foundry-free unit fixture reads
 * `null` and falls through to the shipped default.
 */

import { resolveToolBreakageAuthority } from './toolScope.js';

/**
 * The published world tool-breakage block, or `null` when there is no store to read.
 *
 * @returns {object|null}
 */
function publishedWorldToolBreakage() {
  try {
    return globalThis.game?.fabricate?.getToolScopeStore?.()?.corpus?.()?.toolBreakage ?? null;
  } catch {
    // A store that throws must degrade to "no world authority", never take a craft down.
    return null;
  }
}

/**
 * The authority that actually decides whether a tool breaks for one crafting system.
 *
 * ABSENT-PRESERVING ON THE SYSTEM SIDE: a system that authored nothing INHERITS the world value
 * rather than re-defaulting to `toolSpecific`. Only when neither scope authors a recognized token
 * does the answer fall to `toolSpecific`, so a world that has authored no world value reads
 * exactly as `## CraftingSystem` requirement 21 already shipped.
 *
 * @param {object|null} system The crafting system record.
 * @param {object|null} [worldToolBreakage] The world block, taken explicitly by tests.
 * @returns {string} `"toolSpecific"` or `"checkDriven"`.
 */
export function effectiveToolBreakageAuthority(system, worldToolBreakage) {
  const world = worldToolBreakage === undefined ? publishedWorldToolBreakage() : worldToolBreakage;
  return resolveToolBreakageAuthority(world, system?.toolBreakage);
}
