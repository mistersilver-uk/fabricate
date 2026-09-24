import {
  defineScope,
  normalizeMemberships,
  normalizeWorldDefaults,
  resolveScopedDefinition,
} from './scopedDefinitions.js';
import { unionScopedDefinitions } from './scopedDefinitionStore.js';

/**
 * The essence half of Scoped Entity Definitions (issue 1358): two independent switches over
 * `effectSource` and `macro`. `enabled` gates only what an essence carries onto a result, never
 * matching, accumulation or consumption; a disabled essence is a member that is off, keeping its
 * overrides. Contract: `data-models/spec.md` § Scoped Entity Definitions, Essence scope, and
 * § EssenceDefinition requirements 6 to 8.
 */

/** The essence sections, and the only keys an `inherit` map may carry. */
export const ESSENCE_SECTIONS = Object.freeze(['effectSource', 'macro']);

export const ESSENCE_SCOPE = defineScope({
  sections: ESSENCE_SECTIONS,
  enableable: true,
});

export function normalizeEssenceWorldDefaults(raw) {
  return normalizeWorldDefaults(raw, ESSENCE_SCOPE);
}

/** Normalize the essence memberships; an absent `enabled` reads as true. */
export function normalizeEssenceMemberships(raw) {
  return normalizeMemberships(raw, ESSENCE_SCOPE);
}

/** Resolve one `(essence, system)` pair; a non-member is `enabled: false` for not being one. */
export function resolveEssence(worldDefault, membership) {
  return resolveScopedDefinition(worldDefault, membership, ESSENCE_SCOPE);
}

/** Whether a resolved essence carries behaviour onto a result: the only thing `enabled` gates. */
export function essenceCarriesBehaviour(resolved) {
  return Boolean(resolved?.member) && resolved?.enabled === true;
}

/** The read union for essences; see `unionScopedDefinitions`. */
export function resolveEssenceScope(worldCorpus, systemId, systemEssences) {
  return unionScopedDefinitions({
    corpus: worldCorpus,
    systemId,
    systemDefinitions: systemEssences,
    resolve: resolveEssence,
    entityType: 'essences',
  });
}
