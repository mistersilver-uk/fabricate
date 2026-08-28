/**
 * The pure half of the world-scope entity merge an import performs (issue 1364, part of epic
 * 1357): the three per-layer merges, and the DESTINATION re-check of every world default the
 * import would add.
 *
 * IT LIVES HERE, BESIDE THE IMPORTER RATHER THAN INSIDE IT, for two reasons. The first is
 * ordinary: `CompendiumImporter` is a large orchestrator, and a changed function is re-flagged as
 * NEW CODE by the SonarCloud cognitive-complexity gate, so a constraint ladder added to one of its
 * methods would take the whole method with it. The second is the one that matters: every rule
 * below is decidable from the corpus alone, so it is unit-testable against a literal corpus with
 * no importer, no store and no Foundry anywhere in the closure.
 *
 * ## THE MERGE IS THREE INDEPENDENT PER-LAYER MERGES, NEVER ONE OBJECT-LEVEL MERGE
 *
 * `entities` merges by `id`, `defaults` by `id`, `membership` by `(entityId, systemId)`, with the
 * DESTINATION winning every collision and no destination record ever reordered or removed. A
 * single object-level merge would let a destination holding entities but no defaults win the whole
 * scope and silently discard every incoming default — the exact failure the character-libraries
 * merge documents for its own two lists.
 *
 * ## THE RE-CHECK, AND WHY ITS CORPUS IS A LOGICAL UNION RATHER THAN A PERSISTED STATE
 *
 * The `1.30.0` migration decides its five world-default constraints against the SOURCE world.
 * None survives a membership-filtered export unexamined: the every-member precondition was decided
 * over systems the export does not carry, and a world-addressable `effectSource`,
 * `onBreak.replacementTarget.componentId` or `repairRequirements` group may name a component
 * absent from the destination entirely.
 *
 * So when the merge would ADD a `defaults` record — a destination record already present WINS and
 * is never re-examined — every SECTION on it is re-evaluated against the destination's MERGED
 * corpus, and a failing section is DECLINED.
 *
 * That corpus is computed IN MEMORY and includes records that are not yet persisted. The
 * membership layer is written AFTER the defaults layer, because the destination's system id does
 * not exist until the system is created, so reading persisted membership alone would make the
 * every-member precondition VACUOUSLY TRUE for every entity the import mints — and the second
 * write would then land a membership record carrying no `category` / `breakage` / `onBreak` under
 * a world default the first write persisted, handing that system a value no GM there authored.
 * That is the exact behaviour the precondition exists to prevent.
 *
 * The incoming records count as ONE system distinct from every destination system, under the
 * SYNTHETIC token below and never under the payload's own id: copy mode has not minted the
 * destination id yet, and a keep-mode overwrite may have resolved an existing system by NAME under
 * a different id, so the payload's id names the destination's system in neither mode.
 *
 * The union is deliberately CONSERVATIVE. Under a keep-mode overwrite the incoming records may in
 * fact belong to a destination system already in the union, so counting them separately can add a
 * member that is not really new and OVER-DECLINE. A world default valid against the DESTINATION
 * ALONE can therefore be declined against the union. That is correct rather than a defect:
 * over-declining is lossless — every incoming membership record still overrides every section with
 * its own system's value verbatim — while under-declining hands a member system a resolved value
 * its GM never authored.
 *
 * The claim is stated against the destination alone rather than as "valid in each world
 * separately", and the narrowing is a correction rather than a hedge: the stronger form is
 * UNREACHABLE here. Every predicate below is either universally quantified over the member union
 * or a membership test on a roster that only ever grows, so validity over each half IMPLIES
 * validity over the union and no fixture can exhibit the case.
 *
 * ## WHEN THE COMPONENT ROSTER IS UNDECIDABLE
 *
 * The seeding gate is evaluated per entity type, so `toolScope` can be seeded while
 * `componentScope` is not — reachable through a torn migration or a future world-scope editor.
 * Three of the constraints consult the merged COMPONENT roster, and when no component write will
 * happen there is no merged roster to consult, so every section carrying a component reference is
 * DECLINED. A section carrying NO component reference — a dotted-UUID `effectSource`, an
 * `itemUuid` `onBreak`, a `category`, a `breakage` — is unaffected.
 *
 * That is NOT an inversion of the unknown-basis rule, and the distinction is worth stating because
 * it reads like one. That rule governs a DESTRUCTIVE pass over data that already exists, where an
 * unknown basis must not license a DELETION. This governs a WRITE of newly derived data, where an
 * unknown basis must not license a DANGLING SEED. Both refuse to act on an unknown basis; they
 * only look opposite because the actions are opposite.
 */

import {
  FALLBACK_EXPOSED_SECTIONS,
  isWorldAddressable,
  referencedComponentIds,
  RESERVED_CATEGORY,
  sectionIsAuthoredBy,
  WORLD_DEFAULT_SECTIONS,
} from '../migration/worldScopeDefaults.js';

import { membershipKey } from './scopedDefinitions.js';
import { subKeyEntries } from './scopedDefinitionStore.js';

/**
 * The system token the INCOMING membership records are counted under while the re-check runs.
 *
 * A synthetic token, never the payload's own system id: copy mode has not minted the destination
 * id yet, and a keep-mode overwrite may have resolved an existing system by NAME under a different
 * id. Keying on the payload's id would mis-group the repair-requirements constraint in precisely
 * the case the split write itself identifies.
 *
 * @type {string}
 */
export const INCOMING_SYSTEM_TOKEN = '__fabricate.incoming__';

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function trimmedId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The records of one incoming slice sub-key, in either shape, dropping anything that is not a
 * record.
 *
 * @param {unknown} slice
 * @param {'entities'|'defaults'|'membership'} subKey
 * @returns {object[]}
 */
export function sliceRecords(slice, subKey) {
  if (!isPlainObject(slice)) return [];
  return subKeyEntries(slice[subKey]).filter((record) => isPlainObject(record));
}

/**
 * The re-check corpus's membership union for one entity type: the destination's PERSISTED records
 * plus every incoming record, the latter counted under {@link INCOMING_SYSTEM_TOKEN}.
 *
 * @param {unknown} persistedSlice The destination store's persisted projection, or null.
 * @param {unknown} incomingSlice The envelope slice, or null.
 * @returns {Array<{entityId: string, systemId: string, record: object}>}
 */
export function mergedMembershipUnion(persistedSlice, incomingSlice) {
  const union = [];
  for (const record of sliceRecords(persistedSlice, 'membership')) {
    const entityId = trimmedId(record.entityId);
    const systemId = trimmedId(record.systemId);
    if (entityId && systemId) union.push({ entityId, systemId, record });
  }
  for (const record of sliceRecords(incomingSlice, 'membership')) {
    const entityId = trimmedId(record.entityId);
    if (entityId) union.push({ entityId, systemId: INCOMING_SYSTEM_TOKEN, record });
  }
  return union;
}

/**
 * The merged world entity id roster for one entity type — the destination's persisted `entities`
 * unioned with the incoming slice's.
 *
 * @param {unknown} persistedSlice
 * @param {unknown} incomingSlice
 * @returns {Set<string>}
 */
export function mergedEntityIds(persistedSlice, incomingSlice) {
  const ids = new Set();
  for (const slice of [persistedSlice, incomingSlice]) {
    for (const entity of sliceRecords(slice, 'entities')) {
      const id = trimmedId(entity.id);
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Whether every reference a section carries is addressable in the merged destination roster.
 *
 * `worldComponentIds === null` means the component roster is UNDECIDABLE, in which case a section
 * carrying any non-dotted reference fails and one carrying none passes.
 *
 * @param {unknown[]} references
 * @param {ReadonlySet<string>|null} worldComponentIds
 * @returns {string|null} the offending reference, or `null` when every one is addressable.
 */
function firstUnaddressable(references, worldComponentIds) {
  for (const reference of references) {
    const value = trimmedId(reference);
    if (!value) continue;
    // THE SHIPPED PREDICATE when the roster is decidable; when it is not, only a dotted value —
    // a document UUID, globally addressable either way — survives.
    const addressable = worldComponentIds
      ? isWorldAddressable(value, worldComponentIds)
      : value.includes('.');
    if (!addressable) return value;
  }
  return null;
}

/**
 * Decide ONE section of an incoming world default against the merged destination corpus.
 *
 * @param {object} options
 * @returns {{ok: boolean, referenceValue?: string}}
 */
function sectionPasses({
  entityType,
  section,
  value,
  worldComponentIds,
  componentMembers,
  entityMemberSystems,
}) {
  if (entityType === 'components') {
    // `general` is the reserved implicit bucket; a world default carrying it would reset every
    // inheriting system's category on the first resolve.
    return value === RESERVED_CATEGORY ? { ok: false, referenceValue: section } : { ok: true };
  }

  if (entityType === 'essences') {
    // A Macro UUID is globally addressable, so there is no constraint to apply.
    if (section === 'macro') return { ok: true };
    const effectSource = isPlainObject(value) ? value : {};
    const offending = firstUnaddressable(
      ['sourceComponentId', 'sourceItemUuid', 'associatedSystemItemId'].map(
        (field) => effectSource[field]
      ),
      worldComponentIds
    );
    return offending ? { ok: false, referenceValue: offending } : { ok: true };
  }

  // `breakage` carries no reference, so it is decided by the every-member precondition alone.
  if (section === 'breakage') return { ok: true };

  if (section === 'onBreak') {
    const target = isPlainObject(value) ? value.replacementTarget : null;
    if (!isPlainObject(target) || target.type !== 'component') return { ok: true };
    const offending = firstUnaddressable([target.componentId], worldComponentIds);
    return offending ? { ok: false, referenceValue: offending } : { ok: true };
  }

  // `repairRequirements` is a SEED, copied once and never re-read, so a dangling group is baked
  // silently into a future system's repair recipe. It is DECLINED outright when the component
  // roster is undecidable, because there is then nothing to lift it against.
  if (!Array.isArray(value) || value.length === 0) return { ok: true };
  if (!worldComponentIds) return { ok: false, referenceValue: section };
  for (const componentId of referencedComponentIds(value)) {
    if (!worldComponentIds.has(componentId)) return { ok: false, referenceValue: componentId };
    // Every system holding a merged membership record for this TOOL must hold one for the
    // component too, or the seeded repair recipe names an ingredient that system does not have.
    for (const systemId of entityMemberSystems) {
      if (!componentMembers.has(membershipKey(componentId, systemId))) {
        return { ok: false, referenceValue: componentId };
      }
    }
  }
  return { ok: true };
}

/**
 * Re-check one incoming world default against the destination's MERGED corpus, per SECTION.
 *
 * Decline is per section, matching the migration's own granularity: the key is deleted from the
 * incoming record before it merges, the world ENTITY and every membership record are UNAFFECTED,
 * and a record left carrying only `id` is not written at all. Declining is LOSSLESS, because every
 * incoming membership record still overrides every section with its own system's value verbatim —
 * a world default matters only for a system added LATER or an override cleared later, which is
 * exactly the case a destination-blind default would get wrong.
 *
 * @param {object} options
 * @param {string} options.entityType
 * @param {object} options.record The incoming `defaults` record.
 * @param {ReadonlySet<string>|null} options.worldComponentIds The merged component roster, or
 *   `null` when the component scope will not be written and the roster is undecidable.
 * @param {Array<{entityId: string, systemId: string, record: object}>} options.membershipUnion
 *   The merged membership union for THIS entity type.
 * @param {ReadonlySet<string>} options.componentMembers The merged COMPONENT membership union,
 *   keyed `(componentId, systemId)`.
 * @returns {{record: object|null, declined: Array<{section: string, referenceValue: string}>}}
 */
export function recheckWorldDefault({
  entityType,
  record,
  worldComponentIds,
  membershipUnion,
  componentMembers,
}) {
  const declined = [];
  const entityId = trimmedId(record?.id);
  if (!entityId) return { record: null, declined };

  const members = membershipUnion.filter((entry) => entry.entityId === entityId);
  const entityMemberSystems = [...new Set(members.map((entry) => entry.systemId))];

  const next = { id: entityId };
  for (const section of WORLD_DEFAULT_SECTIONS[entityType] ?? []) {
    const value = record[section];
    if (value === undefined) continue;

    // THE EVERY-MEMBER PRECONDITION, applied through the MIGRATION'S OWN PREDICATE rather than a
    // second one — literally the same function, not the same rule restated.
    //
    // It does NOT reduce to a key-presence test, and that reduction is exactly the gap a
    // hand-authored payload walks through. `buildMembershipRecord` writes `category` only when it
    // is trimmed-non-empty, so for a record IT produced the two readings agree; a hand-authored
    // record may carry `category: ''` or `'  '`, which passes key presence, is coerced to ABSENCE
    // by the store on the way in, and then falls back to the very world default this precondition
    // was asked to decide — handing the imported system a category no GM authored.
    if (
      FALLBACK_EXPOSED_SECTIONS.has(section) &&
      members.some((entry) => !sectionIsAuthoredBy(entry.record, entityType, section))
    ) {
      declined.push({ section, referenceValue: section });
      continue;
    }

    const verdict = sectionPasses({
      entityType,
      section,
      value,
      worldComponentIds,
      componentMembers,
      entityMemberSystems,
    });
    if (verdict.ok) next[section] = value;
    else declined.push({ section, referenceValue: verdict.referenceValue ?? section });
  }

  const authored = Object.keys(next).filter((key) => key !== 'id');
  return { record: authored.length > 0 ? next : null, declined };
}

/**
 * The merged COMPONENT membership union, as the `(componentId, systemId)` key set constraint 4
 * asks its question in.
 *
 * @param {Array<{entityId: string, systemId: string}>} membershipUnion
 * @returns {Set<string>}
 */
export function membershipKeySet(membershipUnion) {
  return new Set(membershipUnion.map((entry) => membershipKey(entry.entityId, entry.systemId)));
}
