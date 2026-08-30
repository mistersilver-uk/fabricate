/**
 * THE WORLD IDENTITY SNAPSHOT DRIFT DETECTOR (issue 1363, epic 1357, PR 3).
 *
 * The `1.30.0` migration makes two copies of every entity's identity: the in-system record,
 * which stays **LIVE AND AUTHORITATIVE** while `## CraftingSystem` requirement 36 holds, and the WORLD IDENTITY
 * SNAPSHOT held on `fabricate.componentScope` / `essenceScope` / `toolScope`. The two are EQUAL
 * AT MIGRATION TIME BY CONSTRUCTION — the migration writes the merged identity back onto every
 * in-system record — and the snapshot goes stale on the GM's first post-migration identity edit,
 * because every shipped identity writer writes the in-system copy and nothing writes the
 * snapshot.
 *
 * **THIS MODULE IS PURE, AND SINCE ISSUE 1370 IT HAS A PRODUCTION CONSUMER.** `initialize()`
 * calls it once per session on the ACTIVE GM alone, after the three scope stores load and
 * before either manager is constructed, and composes the report into an INFORMATIONAL notice.
 * The report is a DISCLOSURE obligation and not a correctness one: the read union already
 * resolves every divergence in the safe direction, and this tells the GM which of their own
 * edits the snapshot no longer reflects. It repairs nothing and writes nothing.
 * The claim it makes executable — "the two copies are equal at migration time" — is the whole
 * reason the deferred shed is reconcilable, and an unchecked claim of that kind is exactly the
 * acceptance criterion this programme has already shipped twice unable to fail. The migration's
 * own output must produce ZERO entries, over every corpus in the acceptance set.
 *
 * ## IT IS DELIBERATELY NOT NAMED `reportScopeMirrorDrift`
 *
 * In `openspec/specs/data-models/spec.md` a MIRROR is a copy KEPT IN SYNC, which is precisely the
 * mechanism `#### D11` shows to be unimplementable: the identity-writer set cannot be enumerated,
 * because `SettingsCraftingDefinitionRepository.save()` flushes "every in-memory mutation,
 * including ones made in place by code paths that never called `save()` themselves", and a set
 * defined as *paths that never call save* cannot be found by grepping save sites. Naming the
 * detector after the mirror would re-import the claim this module exists because we cannot make.
 *
 * ## THE IDENTITY-WRITER SET, ENUMERATED BY NAME
 *
 * PR 8a - the READ repointing half of the split consumer sweep - must run this detector before repointing any reader, and must REPORT every divergence
 * rather than silently resolve it. These are the writers that make divergence reachable:
 *
 *   - `CraftingSystemManager#createItem`
 *   - `CraftingSystemManager#addItemFromUuid`
 *   - `CraftingSystemManager#replaceItemSource`
 *   - `CraftingSystemManager#updateItem`
 *   - `CraftingSystemManager#applyBulkEditToComponents`
 *   - `CraftingSystemManager#refreshComponentMetadataForUpdatedItem` — bound UNCONDITIONALLY to
 *     the `updateItem` hook in `src/main.js`, mutating `name`, `img` and `description` IN PLACE
 *   - `CraftingSystemManager#addRecipeItemFromUuid`
 *
 * **THIS LIST IS NOT PR 2's "five mutation-time bypass sites".** That list was built for the
 * Valid Id BASIS concern and is about which mutations bypass a normalize; this one is about which
 * code paths write a LIFTED IDENTITY FIELD. Reusing that list as the writer set is the easiest
 * way for PR 8 to inherit a wrong enumeration, and it would miss
 * `refreshComponentMetadataForUpdatedItem` outright.
 *
 * ## RESOLUTION DIRECTION, as issue 1370 settled it
 *
 * The read union used to resolve `{ ...legacyEntry, ...entity, ...resolved }`, which made the
 * STALE snapshot identity beat the FRESH in-system one. It now RE-APPLIES the whole in-system
 * record last and DELETES every lifted identity field that record does not carry, re-derived AT
 * READ TIME rather than by a one-shot pass — which could not hold anyway, because the component
 * metadata refresh rewrites `name`, `img` and `description` in place at any point in a session.
 *
 * **NOT "the same transform the migration uses".** That spelling names an IDENTITY projection,
 * which re-applies none of the behaviour keys and would leave a GM-disabled tool reading back
 * usable. The identity projection supplies the DELETE key-set ONLY; the re-application is a
 * re-spread of the whole record.
 */

import { WORLD_IDENTITY_FIELDS } from '../migration/worldScopeEntityGrouping.js';

import { subKeyEntries } from './scopedDefinitionStore.js';

const ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

/** The `craftingSystem` array each entity type is stored under. */
const ENTITY_FIELDS = Object.freeze({
  components: 'components',
  essences: 'essenceDefinitions',
  tools: 'tools',
});

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Every `(systemId, entityType, entityId, field)` where the in-system copy and the world
 * identity snapshot disagree on a LIFTED field.
 *
 * Only pairs the system is a MEMBER of are compared: an entity a system has no membership record
 * for does not exist in that system, so there is no in-system copy to disagree with.
 *
 * ABSENCE IS A VALUE. A field present on one side and absent on the other is a divergence, because
 * the migration's write-back deletes an identity field the world entity does not carry — so equal
 * means "agrees, including on absence".
 *
 * TOTAL AND NON-THROWING: a malformed corpus answers an empty list.
 *
 * @param {unknown} craftingSystems The raw `craftingSystems` setting.
 * @param {unknown} scopeCorpus `{ components, essences, tools }`, each either the persisted scope
 *   payload or a store's published corpus.
 * @returns {Array<{systemId: string, entityType: string, entityId: string, field: string,
 *   systemValue: unknown, worldValue: unknown}>}
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
