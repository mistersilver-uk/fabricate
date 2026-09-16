/**
 * DONOR-ELECTED WORLD DEFAULTS for the `1.30.0` migration (issue 1363). Spec § World-Scope Entity
 * Migration requirement 7 owns every rule. CONSTRAINT 0 is numbered from zero because it runs BEFORE
 * the four addressability rules and can decline a section every one of them would have accepted.
 * A DECLINED SECTION SIMPLY GETS NO WORLD DEFAULT and nothing is lost, every membership record still
 * overriding it verbatim, so refusing is always the safe answer.
 */

import { normalizeComponentEssenceMap } from '../systems/componentScope.js';
import { cloneJson, isPlainObject } from '../utils/scalars.js';

import { ESSENCE_EFFECT_SOURCE_FIELDS } from './worldScopeEntityGrouping.js';

/** The world-default section each entity type may take, in the order they are elected. */
export const WORLD_DEFAULT_SECTIONS = Object.freeze({
  components: Object.freeze(['category', 'essences']),
  essences: Object.freeze(['effectSource', 'macro']),
  tools: Object.freeze(['breakage', 'onBreak', 'repairRequirements']),
});

/** The reserved component category that must NEVER be persisted at world scope. */
export const RESERVED_CATEGORY = 'general';

/**
 * CONSTRAINT 0's population: the sections a membership record cannot express an empty override for,
 * which therefore fall back to the world value when a member authored none.
 */
export const FALLBACK_EXPOSED_SECTIONS = new Set(['category', 'breakage', 'onBreak']);

/**
 * Whether ONE member record authored a section, judged exactly as `buildMembershipRecord` judges it.
 * EXPORTED so the import-time re-check applies THIS predicate rather than a second one: the
 * reduction to a bare key-presence test is sound only for a record that function produced, while a
 * hand-authored payload is a first-class import input — a `category` of `''` carries the key but
 * coerces to ABSENCE on the way in, so key-presence would admit a world default no GM authored.
 */
export function sectionIsAuthoredBy(record, entityType, section) {
  // A component `essences` map can express emptiness, so it is never fallback-exposed.
  if (entityType === 'components') {
    return section === 'essences' || Boolean(trimmedString(record.category));
  }
  if (section === 'breakage') return record.breakage !== undefined;
  if (section === 'onBreak') return record.onBreak !== undefined;
  return true;
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Whether a reference is addressable from WORLD scope: a dotted value is a document UUID, anything
 * else must name a world component, and an absent reference names nothing to dangle.
 */
export function isWorldAddressable(reference, worldComponentIds) {
  const value = trimmedString(reference);
  if (!value) return true;
  if (value.includes('.')) return true;
  return worldComponentIds.has(value);
}

/**
 * Every component id an ingredient-group list references. EXPORTED so the import-time re-check
 * decides constraint 4 with the SAME enumeration the election used (issue 1364).
 */
export function referencedComponentIds(groups, collected = new Set()) {
  for (const group of arrayOf(groups)) {
    for (const option of arrayOf(group?.options)) collectOptionComponentIds(option, collected);
  }
  return collected;
}

function collectOptionComponentIds(option, collected) {
  if (!isPlainObject(option)) return;
  for (const value of [
    option.componentId,
    option.systemItemId,
    option.match?.componentId,
    option.match?.systemItemId,
  ]) {
    const id = trimmedString(value);
    if (id) collected.add(id);
  }
  for (const alternative of arrayOf(option.alternatives)) {
    collectOptionComponentIds(alternative, collected);
  }
}

/**
 * Elect the world default for ONE entity, from its group's donor. ABSENCE-PRESERVING throughout: a
 * section the donor did not author, or that fails its constraint, emits NO key.
 */
export function electWorldDefault({
  entityType,
  entityId,
  donorRecord,
  memberRecords,
  worldComponentIds,
  isMemberOf,
  memberSystemIds,
}) {
  const refusedSections = [];
  const record = { id: entityId };
  if (!isPlainObject(donorRecord)) return { record: null, refusedSections };
  const members = arrayOf(memberRecords).filter((entry) => isPlainObject(entry));
  const liveRecords = members.length > 0 ? members : [donorRecord];

  for (const section of WORLD_DEFAULT_SECTIONS[entityType] ?? []) {
    // CONSTRAINT 0, applied before every other: a section some member left unauthored would change
    // that member's RESOLVED behaviour the moment a world default existed for it.
    if (
      FALLBACK_EXPOSED_SECTIONS.has(section) &&
      liveRecords.some((member) => !sectionIsAuthoredBy(member, entityType, section))
    ) {
      refusedSections.push(section);
      continue;
    }
    const elected = electSection({
      entityType,
      section,
      donorRecord,
      worldComponentIds,
      isMemberOf,
      memberSystemIds,
    });
    if (elected.value !== undefined) record[section] = elected.value;
    else if (elected.refused) refusedSections.push(section);
  }

  const authored = Object.keys(record).filter((key) => key !== 'id');
  return { record: authored.length > 0 ? record : null, refusedSections };
}

/**
 * `value === undefined` means no world default; `refused` distinguishes "the donor authored
 * nothing" from "a constraint declined it".
 */
function electSection({
  entityType,
  section,
  donorRecord,
  worldComponentIds,
  isMemberOf,
  memberSystemIds,
}) {
  if (entityType === 'components' && section === 'essences') {
    // The donor's own map, normalized; an EMPTY one elects nothing, absence-preserving as
    // `category` is. No constraint applies: the map carries no reference.
    const essences = normalizeComponentEssenceMap(donorRecord.essences);
    return essences && Object.keys(essences).length > 0
      ? { value: essences, refused: false }
      : { value: undefined, refused: false };
  }

  if (entityType === 'components') {
    const category = trimmedString(donorRecord.category);
    if (!category) return { value: undefined, refused: false };
    // CONSTRAINT 1. `general` is the reserved implicit bucket; a world default carrying it would
    // reset every inheriting system's category on the first resolve.
    if (category === RESERVED_CATEGORY) return { value: undefined, refused: true };
    return { value: category, refused: false };
  }

  if (entityType === 'essences') {
    if (section === 'macro') {
      // A Macro UUID is globally addressable, so there is no constraint to apply.
      const macro = donorRecord.propertyMacroUuid;
      // ABSENCE-PRESERVING: an unauthored macro emits no key, and `null` is unauthored.
      return { value: macro ?? undefined, refused: false };
    }
    const effectSource = {};
    for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) {
      if (donorRecord[field] !== undefined && donorRecord[field] !== null) {
        effectSource[field] = donorRecord[field];
      }
    }
    if (Object.keys(effectSource).length === 0) return { value: undefined, refused: false };
    // CONSTRAINT 2. Every reference must be world-addressable, or the world default would name a
    // system-local component id, which `### Essence scope` requirement 5 forbids by name.
    const addressable = Object.values(effectSource).every((reference) =>
      isWorldAddressable(reference, worldComponentIds)
    );
    return addressable
      ? { value: cloneJson(effectSource), refused: false }
      : { value: undefined, refused: true };
  }

  if (section === 'breakage') {
    // No references, so the donor's value lifts whenever authored.
    return donorRecord.breakage === undefined
      ? { value: undefined, refused: false }
      : { value: cloneJson(donorRecord.breakage), refused: false };
  }

  if (section === 'onBreak') {
    const onBreak = donorRecord.onBreak;
    if (onBreak === undefined) return { value: undefined, refused: false };
    // CONSTRAINT 3. A `replaceWith` COMPONENT target carries the same addressability concern; an
    // `itemUuid` target is globally addressable.
    const target = isPlainObject(onBreak) ? onBreak.replacementTarget : null;
    if (
      isPlainObject(target) &&
      target.type === 'component' &&
      !isWorldAddressable(target.componentId, worldComponentIds)
    ) {
      return { value: undefined, refused: true };
    }
    return { value: cloneJson(onBreak), refused: false };
  }

  // CONSTRAINT 4. `repairRequirements` is a SEED, copied once and never re-read, so a dangling
  // group is baked silently into a future system's repair recipe. Lift only when every referenced
  // component is a world component that EVERY member system of the group is a member of.
  const groups = donorRecord.repairRequirements;
  if (!Array.isArray(groups) || groups.length === 0) return { value: undefined, refused: false };
  const referenced = referencedComponentIds(groups);
  for (const componentId of referenced) {
    if (!worldComponentIds.has(componentId)) return { value: undefined, refused: true };
    for (const systemId of memberSystemIds) {
      if (!isMemberOf(componentId, systemId)) return { value: undefined, refused: true };
    }
  }
  return { value: cloneJson(groups), refused: false };
}
