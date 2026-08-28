/**
 * DONOR-ELECTED WORLD DEFAULTS for the `1.30.0` world-scope entity migration (issue 1363).
 *
 * The maintainer's ruling extends `#### D3`'s oldest-wins rule from IDENTITY to BEHAVIOUR: each
 * world default is elected from the OLDEST contributing system, the same donor that wins identity.
 * Six sections take one - component `category`, essence `effectSource` and `macro`, tool
 * `breakage`, `onBreak` and the seeded `repairRequirements`.
 *
 * ## What is deliberately NOT lifted, and why each reason is different
 *
 * - **Component `tags`.** The tag merge is ADDITIVE with no inherit switch, so a world tag list
 *   is granted to EVERY member system at once the moment it exists. That hazard is independent
 *   of who the donor is: there is no donor whose tags it would be safe to grant to everyone.
 * - **The world tool-breakage authority.** Its reason is unknowable PROVENANCE, not an ambiguous
 *   donor: the pre-flip normalizer minted a concrete `toolSpecific` on EVERY save, so the corpus
 *   cannot distinguish an authored value from a defaulted one, and `### Tool scope` requirement 5
 *   mandates treating every existing value as AUTHORED. The other six sections carry values a GM
 *   really authored, and the only open question was whose.
 *
 * ## CONSTRAINT 0: EVERY LIVE MEMBER MUST HAVE AUTHORED THE SECTION
 *
 * This one is not about addressability, and it is the one the whole safety argument rests on.
 *
 * `resolveScopedDefinition` resolves an `inherit: false` switch over an ABSENT section to the
 * WORLD value - that is a stated requirement, not an accident, because an absent section is not a
 * partial one. So a membership record that omits a section still falls back. `buildMembershipRecord`
 * is necessarily absence-preserving for `category`, `breakage` and `onBreak`, because NONE of the
 * three can express an empty override: `coerceComponentSection` coerces `''` to absence, and a
 * `breakage: {}` or `onBreak: {}` IS an override but one the read union spreads LAST over the
 * surviving in-system block, handing every reader a shape it mis-reads.
 *
 * A world default for a section some member left unauthored would therefore CHANGE THAT MEMBER'S
 * RESOLVED BEHAVIOUR at migration time - silently handing it the donor's category, breakage mode
 * or on-break action - which is precisely the condition this whole election was granted on. So a
 * section is elected ONLY when every live member authored it, and the safety argument becomes
 * true BY CONSTRUCTION rather than by fixture choice.
 *
 * THREE SECTIONS NEED NO SUCH CHECK, for two different reasons, and both are worth stating:
 *
 * - `effectSource` and `macro` are written UNCONDITIONALLY by the membership builder, because
 *   both CAN express emptiness - `{}` and `null` are real overriding values every reader reads as
 *   "no source" and "no macro". Nothing can fall back to them.
 * - `repairRequirements` is not a resolver section at all: `resolveTool` answers it from the
 *   membership record ALONE and never reads the world defaults, so an unauthored one resolves to
 *   absence and the union's surviving in-system half supplies it.
 *
 * ## THE FOUR ADDRESSABILITY CONSTRAINTS, and why a refusal is per SECTION rather than per entity
 *
 * A refused section simply gets no world default. Nothing is lost by that: every membership
 * record still OVERRIDES every section with its own system's value verbatim, so resolution at
 * migration time is unchanged either way, and a world default only ever matters for a system
 * added LATER or an override cleared later. So the safe answer to "can this value be stated at
 * world scope" is always "then do not state it".
 *
 * 1. **`category` is never the reserved `general`.** `## Component` requirement 13 defaults every
 *    component's category to `general`, so a donor almost always HAS one - and an absence-
 *    preserving world category that mints `general` resets every inheriting system on the first
 *    resolve, which `### Component scope` requirement 2 forbids by name.
 * 2. **`effectSource` may name only a WORLD-ADDRESSABLE referent.** `### Essence scope`
 *    requirement 5 makes this binding: a document UUID is globally addressable and a component id
 *    is addressable exactly when it names a WORLD component. A non-addressable donor value is not
 *    lifted, and the requirement already says where it goes instead - the system side, as an
 *    override with the switch off, which is what every membership record carries anyway.
 * 3. **`onBreak` carries the same addressability concern**, because a `replaceWith` target may be
 *    a component reference. An `itemUuid` target is globally addressable and lifts freely.
 * 4. **`repairRequirements` is the hard one, and the rule is the CONSERVATIVE one.** Its
 *    ingredient groups name components, so post-re-key they name world ids - and it is a SEED,
 *    copied once when a tool is added to a system and never re-read, so a dangling group is baked
 *    silently into a future system's repair recipe with no reader that can report it. That is the
 *    failure `### Tool scope` requirement 5's world-addressability clause names. The rule is
 *    therefore: lift ONLY when every referenced component is a world component that EVERY member
 *    system of the group is a member of.
 *
 *    The alternative - lift freely and validate at add-to-system time - puts the check inside an
 *    action that does not exist yet, so it would ship a world default no shipped code can
 *    validate. The chosen rule is decidable from the corpus alone and can never produce a
 *    dangling seed. It is not restrictive in practice: a single-member group always satisfies it,
 *    because every in-system component becomes a world component with a membership record for its
 *    own system.
 */

/** The world-default section each entity type may take, in the order they are elected. */
export const WORLD_DEFAULT_SECTIONS = Object.freeze({
  components: Object.freeze(['category']),
  essences: Object.freeze(['effectSource', 'macro']),
  tools: Object.freeze(['breakage', 'onBreak', 'repairRequirements']),
});

/** The reserved component category that must NEVER be persisted at world scope. */
const RESERVED_CATEGORY = 'general';

/**
 * The sections a membership record CANNOT express an empty override for, and which therefore fall
 * back to the world value when a member authored none. See CONSTRAINT 0 in the module note.
 *
 * `effectSource` and `macro` are absent because the builder writes them unconditionally;
 * `repairRequirements` is absent because it is not a resolver section.
 *
 * @type {ReadonlySet<string>}
 */
const FALLBACK_EXPOSED_SECTIONS = new Set(['category', 'breakage', 'onBreak']);

/**
 * Whether ONE member record authored a section at all, judged exactly as
 * `buildMembershipRecord` judges it — because the question is precisely "will the membership
 * record this member produces carry an override for this section".
 *
 * @param {object} record
 * @param {string} entityType
 * @param {string} section
 * @returns {boolean}
 */
function sectionIsAuthoredBy(record, entityType, section) {
  if (entityType === 'components') return Boolean(trimmedString(record.category));
  if (section === 'breakage') return record.breakage !== undefined;
  if (section === 'onBreak') return record.onBreak !== undefined;
  return true;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Whether a reference is addressable from WORLD scope.
 *
 * A dotted value is a document UUID and is globally addressable; anything else must name a world
 * component. An absent reference is vacuously addressable - it names nothing to dangle.
 *
 * @param {unknown} reference
 * @param {ReadonlySet<string>} worldComponentIds
 * @returns {boolean}
 */
function isWorldAddressable(reference, worldComponentIds) {
  const value = trimmedString(reference);
  if (!value) return true;
  if (value.includes('.')) return true;
  return worldComponentIds.has(value);
}

/** Every component id an ingredient-group list references, including through `alternatives`. */
function referencedComponentIds(groups, collected = new Set()) {
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
 * Elect the world default for ONE entity, from its group's donor.
 *
 * ABSENCE-PRESERVING throughout: a section the donor did not author, or that fails its
 * constraint, emits NO key, and an entity whose every section is absent emits no record at all.
 *
 * @param {object} options
 * @param {string} options.entityType
 * @param {string} options.entityId The world id.
 * @param {object} options.donorRecord The REWRITTEN in-system record of the oldest contributor.
 * @param {Array<object>} [options.memberRecords] Every live member's REWRITTEN record. A section
 *   no member left unauthored is required by CONSTRAINT 0; defaults to the donor alone.
 * @param {ReadonlySet<string>} options.worldComponentIds The world component roster.
 * @param {(componentId: string, systemId: string) => boolean} options.isMemberOf
 * @param {readonly string[]} options.memberSystemIds Every system in the group.
 * @returns {{record: object|null, refusedSections: string[]}}
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
    // CONSTRAINT 0, applied before every other: a section some member left unauthored would
    // change that member's RESOLVED behaviour the moment a world default existed for it.
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
 * @returns {{value: unknown, refused: boolean}} `value === undefined` means no world default;
 *   `refused` distinguishes "the donor authored nothing" from "a constraint declined it".
 */
function electSection({
  entityType,
  section,
  donorRecord,
  worldComponentIds,
  isMemberOf,
  memberSystemIds,
}) {
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
    for (const field of ['sourceComponentId', 'sourceItemUuid', 'associatedSystemItemId']) {
      if (donorRecord[field] !== undefined && donorRecord[field] !== null) {
        effectSource[field] = donorRecord[field];
      }
    }
    if (Object.keys(effectSource).length === 0) return { value: undefined, refused: false };
    // CONSTRAINT 2. Every reference must be world-addressable, or the world default would name a
    // system-local component id - which `### Essence scope` requirement 5 forbids by name.
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
    // CONSTRAINT 3. A `replaceWith` COMPONENT target is a component reference and carries the
    // same addressability concern; an `itemUuid` target is globally addressable.
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
