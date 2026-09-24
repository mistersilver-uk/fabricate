/**
 * The shared read seam every non-UI reader of a system's `components`, `essenceDefinitions` or
 * `tools` enters (issue 1370); `CraftingSystemManager`'s `_resolveScopedUnion` delegates here, so
 * the unknown-half rule has one body. A module, not a manager method, because record-holding
 * leaves cannot import the manager. The world corpus comes from a lazy, guarded global probe, never
 * an import, and a throwing store means no world half. An unknown world half answers the in-system
 * array itself, same object: a rebuild drops rows, breaks the definition-index and signature-guard
 * identity, and counts a memo build. Contract: `data-models/spec.md` § Scoped Entity Definitions
 * requirement 16.
 */

import { getScopedDefinitionUnion } from '../utils/definitionIndex.js';

import { resolveComponentScope } from './componentScope.js';
import { resolveEssenceScope } from './essenceScope.js';
import { resolveToolScope } from './toolScope.js';

/** The three corpora, keyed by the `craftingSystem` field each unions with. */
const SCOPED_READS = Object.freeze({
  components: Object.freeze({ store: 'getComponentScopeStore', union: resolveComponentScope }),
  essenceDefinitions: Object.freeze({ store: 'getEssenceScopeStore', union: resolveEssenceScope }),
  tools: Object.freeze({ store: 'getToolScopeStore', union: resolveToolScope }),
});

function publishedCorpus(accessor) {
  try {
    return globalThis.game?.fabricate?.[accessor]?.()?.corpus?.() ?? null;
  } catch {
    return null;
  }
}

/** An empty roster counts as unknown: it can contribute nothing but a reallocation. */
function hasWorldHalf(corpus) {
  return (
    !!corpus &&
    typeof corpus === 'object' &&
    Array.isArray(corpus.entities) &&
    corpus.entities.length > 0
  );
}

/**
 * One system's effective entity list for `field`. `corpus` `undefined` probes the global store;
 * `null` states there is no world half.
 */
export function resolveScopedEntityRead(system, corpus, field) {
  const read = SCOPED_READS[field];
  const systemDefinitions = system?.[field];
  if (!read || !Array.isArray(systemDefinitions)) return [];
  const world = corpus === undefined ? publishedCorpus(read.store) : corpus;
  // An id-less record keeps its own array rather than blanking. Trimmed as the union trims, or a
  // whitespace id would reach the union and come back reallocated.
  const systemId = typeof system?.id === 'string' ? system.id.trim() : system?.id;
  if (!hasWorldHalf(world) || !systemId) return systemDefinitions;
  return getScopedDefinitionUnion(world, systemDefinitions, () =>
    read.union(world, systemId, systemDefinitions)
  );
}

export function resolvedComponentsFor(system, corpus) {
  return resolveScopedEntityRead(system, corpus, 'components');
}

export function resolvedEssencesFor(system, corpus) {
  return resolveScopedEntityRead(system, corpus, 'essenceDefinitions');
}

export function resolvedToolsFor(system, corpus) {
  return resolveScopedEntityRead(system, corpus, 'tools');
}
