/**
 * The world identity snapshot drift detector (issue 1363). The `1.30.0` migration leaves every
 * identity in two copies, equal at migration time, and either side can move since issue 1371; it
 * reports a divergence, never a direction. The active GM runs it once per session after the scope
 * stores load and before any manager exists, as an informational notice: a disclosure, since the
 * read union already resolves every divergence safely. It repairs and writes nothing, and the
 * migration's own output must report zero entries. Not named after a mirror: a copy kept in sync
 * is unimplementable, as the writer set cannot be enumerated.
 *
 * In-system writers: `CraftingSystemManager`'s `createItem`, `addItemFromUuid`,
 * `replaceItemSource`, `updateItem`, `applyBulkEditToComponents`, `addRecipeItemFromUuid` and
 * `refreshComponentMetadataForUpdatedItem`, bound unconditionally to the `updateItem` hook.
 * Snapshot writers: the world entry editors, through `worldScopeActions.updateEntity`. The
 * in-system list is NOT PR 2's "five mutation-time bypass sites", which answers the basis concern.
 * Contract: `data-models/spec.md` § Scoped Entity Definitions requirement 15.
 */

import { isPlainObject } from '../utils/scalars.js';

import { subKeyEntries } from './scopedDefinitionStore.js';
import { WORLD_IDENTITY_FIELDS } from './worldScopeEntityGrouping.js';

const ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/** The `craftingSystem` array each entity type is stored under. */
const ENTITY_FIELDS = Object.freeze({
  components: 'components',
  essences: 'essenceDefinitions',
  tools: 'tools',
});

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Every member `(systemId, entityType, entityId, field)` whose lifted identity field differs,
 * absence included, with both values. `scopeCorpus` holds persisted payloads or published
 * corpora; a malformed input answers `[]`.
 */
export function reportWorldIdentityDrift(craftingSystems, scopeCorpus) {
  const drift = [];
  const corpus = isPlainObject(scopeCorpus) ? scopeCorpus : {};
  for (const entityType of ENTITY_TYPES) {
    const payload = isPlainObject(corpus[entityType]) ? corpus[entityType] : {};
    const entities = new Map();
    for (const entity of subKeyEntries(payload.entities)) {
      if (isPlainObject(entity) && typeof entity.id === 'string') entities.set(entity.id, entity);
    }
    if (entities.size === 0) continue;
    const members = new Set();
    for (const record of subKeyEntries(payload.membership)) {
      if (isPlainObject(record) && record.entityId && record.systemId) {
        members.add(`${record.entityId}|${record.systemId}`);
      }
    }
    for (const system of arrayOf(craftingSystems)) {
      const systemId = isPlainObject(system) && typeof system.id === 'string' ? system.id : null;
      if (!systemId) continue;
      for (const record of arrayOf(system[ENTITY_FIELDS[entityType]])) {
        const entityId = isPlainObject(record) && typeof record.id === 'string' ? record.id : null;
        if (!entityId) continue;
        const entity = entities.get(entityId);
        if (!entity || !members.has(`${entityId}|${systemId}`)) continue;
        for (const field of WORLD_IDENTITY_FIELDS[entityType] ?? []) {
          const systemValue = record[field];
          const worldValue = entity[field];
          if (JSON.stringify(systemValue ?? null) === JSON.stringify(worldValue ?? null)) continue;
          drift.push({ systemId, entityType, entityId, field, systemValue, worldValue });
        }
      }
    }
  }
  return drift;
}
