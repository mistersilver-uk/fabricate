/**
 * THE SHARED READ SEAM over the three world-scope entity corpora (issue 1370, epic 1357, PR 8a).
 *
 * #1359 built the read union, #1363 corrected its merge and #1364 taught import and export about
 * world scope — and through all three NOTHING IN PRODUCTION READ THE UNION. This module is what
 * makes it load-bearing: every non-UI reader of a crafting system's `components`,
 * `essenceDefinitions` or `tools` array now enters here instead of touching the array directly.
 *
 * **READ ENTRY IS NOT AUTHORITY, AND NEITHER IS A SHED.** `## CraftingSystem` requirement 36 keeps
 * the in-system arrays LIVE AND AUTHORITATIVE, and this seam is built to honour that rather than
 * to erode it: the union answers every key, every row and the row ORDER from the in-system record,
 * and the world layer supplies only the keys that record does not carry. Nothing is deleted from
 * any crafting system by this change, and nothing about the persisted shape moves.
 *
 * ## IT IS A MODULE AND NOT A `CraftingSystemManager` METHOD — AND BOTH SPELLINGS SHARE ONE BODY
 *
 * `CraftingSystemManager.resolveScopedComponents` and its two siblings already exist with an
 * INJECTED store seam, which unit fixtures depend on. They stay, and `_resolveScopedUnion`
 * delegates into {@link resolveScopedEntityRead} with its own resolved store, so there is exactly
 * one implementation of the unknown-half rule below. Several repointed readers hold a system
 * RECORD and no manager — `gatheringResultCreation.js`, `companionPooledHoldings.js`,
 * `toolBreakageRuntime.js` — and threading a manager into a pure leaf is the import cycle
 * `models/match/matchTypes.js` forbids, so a module is the only shape that serves both.
 *
 * ## FOUNDRY-FREE, ON THE `toolBreakageAuthority.js` PRECEDENT
 *
 * The world corpus is read through a LAZY, fully optional-chained global probe wrapped in
 * `try`/`catch`, never imported. The consumers are pure-ish domain leaves, and importing
 * `src/config/settings.js` into any of them would drag `src/ui/theme.js` into their closure. A
 * store that throws degrades to "no world half" and never takes a craft down.
 *
 * ## AN UNKNOWN WORLD HALF RETURNS THE IN-SYSTEM ARRAY ITSELF
 *
 * `null` means UNKNOWN, and UNKNOWN prunes nothing. When the store is absent, unloaded, throwing,
 * carries no entities, or the system record has no id, the answer is `systemDefinitions` — THE
 * SAME OBJECT, not a copy and not a rebuild. Three things depend on that and each fails
 * differently:
 *
 * 1. **Identical content.** A null-corpus `unionScopedDefinitions` does not reproduce the array it
 *    was handed: it drops id-less entries and, before this change, de-duplicated first-wins and
 *    collapsed a whitespace-padded id against its trimmed twin. Measured, a six-row in-system
 *    array came back as two.
 * 2. **Identical object identity**, so `getDefinitionIndex`'s `WeakMap` stays warm and
 *    `RecipeManager`'s signature-guard `components` identity check keeps matching.
 * 3. **No memo build is counted**, so the scale baselines' `identityIndexBuilds` do not move for
 *    the overwhelming majority of worlds, which have written no world corpus at all.
 *
 * A shared sentinel corpus was declined: it still allocates on the first call and it still drops
 * clause 1's rows.
 */

import { getScopedDefinitionUnion } from '../utils/definitionIndex.js';

import { resolveComponentScope } from './componentScope.js';
import { resolveEssenceScope } from './essenceScope.js';
import { resolveToolScope } from './toolScope.js';

/**
 * The three corpora, keyed by the in-system array each one unions with.
 *
 * The key IS the `craftingSystem` field name, so a caller naming the field it was about to read
 * cannot pick the wrong corpus.
 */
const SCOPED_READS = Object.freeze({
  components: Object.freeze({ store: 'getComponentScopeStore', union: resolveComponentScope }),
  essenceDefinitions: Object.freeze({ store: 'getEssenceScopeStore', union: resolveEssenceScope }),
  tools: Object.freeze({ store: 'getToolScopeStore', union: resolveToolScope }),
});

/**
 * The published world corpus for one entity type, or `null` when there is no store to read.
 *
 * @param {string} accessor The `game.fabricate` store accessor name.
 * @returns {object|null}
 */
function publishedCorpus(accessor) {
  try {
    return globalThis.game?.fabricate?.[accessor]?.()?.corpus?.() ?? null;
  } catch {
    // A store that throws must degrade to "no world half", never take a read down.
    return null;
  }
}

/**
 * Is this corpus a world half worth unioning against?
 *
 * An EMPTY roster is treated as unknown deliberately: it cannot contribute a key, a row or an
 * order to any answer, so unioning against it can only reallocate the in-system array and count a
 * memo build for a result identical to the array it started from.
 *
 * @param {unknown} corpus
 * @returns {boolean}
 */
function hasWorldHalf(corpus) {
  return (
    !!corpus &&
    typeof corpus === 'object' &&
    Array.isArray(corpus.entities) &&
    corpus.entities.length > 0
  );
}

/**
 * One crafting system's effective entity list for one of the three world-scope corpora.
 *
 * @param {object|null|undefined} system The crafting system RECORD.
 * @param {object|null|undefined} corpus The published world corpus. Pass `undefined` to probe the
 *   global store, and `null` to state that there is no world half.
 * @param {'components'|'essenceDefinitions'|'tools'} field
 * @returns {Array<object>}
 */
export function resolveScopedEntityRead(system, corpus, field) {
  const read = SCOPED_READS[field];
  const systemDefinitions = system?.[field];
  if (!read || !Array.isArray(systemDefinitions)) return [];
  const world = corpus === undefined ? publishedCorpus(read.store) : corpus;
  // THE UNKNOWN-HALF PASSTHROUGH. `system.id` is checked here rather than inherited from the
  // manager's retired `if (!record?.id) return []` branch: every reader this seam replaces
  // answered `system.components` for an id-less record, and blanking one would delete a whole
  // system's library from every listing that reads it.
  if (!hasWorldHalf(world) || !system?.id) return systemDefinitions;
  return getScopedDefinitionUnion(world, systemDefinitions, () =>
    read.union(world, system.id, systemDefinitions)
  );
}

/**
 * One crafting system's effective component library.
 *
 * @param {object|null|undefined} system
 * @param {object|null|undefined} [corpus]
 * @returns {Array<object>}
 */
export function resolvedComponentsFor(system, corpus) {
  return resolveScopedEntityRead(system, corpus, 'components');
}

/**
 * One crafting system's effective essence definitions.
 *
 * @param {object|null|undefined} system
 * @param {object|null|undefined} [corpus]
 * @returns {Array<object>}
 */
export function resolvedEssencesFor(system, corpus) {
  return resolveScopedEntityRead(system, corpus, 'essenceDefinitions');
}

/**
 * One crafting system's effective tool library.
 *
 * @param {object|null|undefined} system
 * @param {object|null|undefined} [corpus]
 * @returns {Array<object>}
 */
export function resolvedToolsFor(system, corpus) {
  return resolveScopedEntityRead(system, corpus, 'tools');
}
