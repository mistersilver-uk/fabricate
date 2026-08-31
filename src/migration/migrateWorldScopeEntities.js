/**
 * 1.30.0 — THE WORLD-SCOPE ENTITY MIGRATION (issue 1363, epic 1357, PR 3).
 *
 * Creates one WORLD ENTITY per resolved source item across every crafting system, re-keys every
 * other member of the group to that id, rewrites every reference the re-key invalidates, and
 * writes one fully-overriding SYSTEM MEMBERSHIP RECORD per original definition — so no system's
 * resolved behaviour changes.
 *
 * PURE, NON-MUTATING AND IDEMPOTENT. It clones what it transforms and returns the ORIGINAL
 * object for any key it did not change, so the runner's per-setting JSON comparison declines to
 * write an unchanged leg.
 *
 * ## THE ORDER IS LOAD-BEARING (`#### D6`)
 *
 * The rewrite runs FIRST, and the three scope payloads are built FROM THE REWRITTEN RECORDS.
 * Three lifted values contain component ids this same pass re-keys — essence `effectSource`,
 * tool `onBreak.replacementTarget.componentId` and tool `repairRequirements` — so a payload
 * built pre-rewrite would ship a membership record naming a retired id in every migrated world,
 * and the per-pair LIFT guard is keyed on the NEW pair, so a re-run would skip it and the stale
 * ids would persist permanently. The shared walk then runs over the three payloads as a FOURTH
 * target as a belt-and-braces check; on a correctly ordered pass it finds nothing to change, and
 * the report's `payloadRewriteRepairs` COUNT is what makes that observable rather than assumed —
 * an unconditional repair arm would otherwise mask the very ordering regression it backs up.
 *
 * ## THE TWO HALVES, AND WHY THEY ARE GATED DIFFERENTLY (`#### D7`, `#### D12`)
 *
 * - The LIFT/CLAIM half is gated PER `(entityId, systemId)` on a CORPUS-DERIVED predicate — the
 *   world corpus already holds a membership record for that pair — never on `migrationVersion`.
 *   `1.28.0`'s "this key has entries" disjunction is not reusable: any GM edit seeds a key, and
 *   migrations run on the active GM alone, so key presence does not prove this pass ran.
 * - The REWRITE half runs UNCONDITIONALLY over `recipes`, `craftingSystems`, `gatheringConfig`
 *   and the three scope payloads, driven by the persisted re-key map alone. It is idempotent by
 *   construction, because each system's map has an image disjoint from its keys and every site
 *   does a single simultaneous lookup.
 *
 * **THE IN-SYSTEM IDENTITY WRITE-BACK RUNS WITH THE UNGUARDED HALF.** It is identity work and
 * sits between the rewrite and the payload build, so it reads as LIFT — but a tear between the
 * three scope legs and `craftingSystems` would then make the re-run skip it, leaving world
 * entities holding merged identity while in-system records keep their original identity, and
 * `#### D11`'s load-bearing equality claim FALSE on a repaired world. On a re-run the merged
 * identity is read from the PERSISTED SCOPE PAYLOADS, keyed by the mapped NEW id, because the
 * map carries old-to-new IDS and no identity VALUES.
 *
 * ## WORLD DEFAULTS ARE ELECTED FROM THE DONOR
 *
 * The maintainer's ruling extends `#### D3`'s oldest-wins rule from IDENTITY to BEHAVIOUR: six
 * sections take a world default from the OLDEST contributing system, the same donor that wins
 * identity. Two are deliberately excluded for two DIFFERENT reasons, and FIVE constraints can
 * decline an individual section - CONSTRAINT 0, which requires that EVERY LIVE MEMBER of the group
 * authored the section, plus four addressability rules. `worldScopeDefaults.js` states all of it
 * and owns the election.
 *
 * NOTHING RESOLVES THROUGH THEM AT MIGRATION TIME, which is why the corpus differential is
 * unchanged by them: every membership record is still created fully OVERRIDING every section with
 * its own system's value verbatim. A world default only ever matters for a system added LATER, or
 * an override a GM clears later - which is exactly the state the catalogue editors exist to fill.
 *
 * A world default a CONSTRAINT declined is reported as `refusedDefaultSections`, distinct from a
 * section the donor simply never authored. **THAT FIELD IS A DIAGNOSTIC, NOT A GM-FACING FACT, AND
 * IT IS DELIBERATELY ABSENT FROM THE NOTICE.** An earlier form of this note said a GM could act on
 * it; CONSTRAINT 0 makes decline the DOMINANT class, so surfacing it would fire on nearly every
 * migrated world - which `worldScopeEntityNotice.js` rejects by name, because a notice that always
 * fires is a notice nobody reads, and the severity derivation would flip almost every pass to a
 * PERMANENT warning. It is also not actionable at `1.30.0`: every membership record is created
 * fully OVERRIDING, and while `## CraftingSystem` requirement 36 holds the in-system record
 * decides every key it carries anyway - so nothing resolves through a world default and a
 * declined section has NO observable consequence in the
 * GM's world, and the remedy once the catalogue editors ship is to author the world default
 * directly rather than to backfill the section in every member system. It is carried on the
 * transient report for the acceptance suite and for the editors of PRs 6a-c.
 */

import { electWorldDefault } from './worldScopeDefaults.js';
import {
  buildWorldScopeGrouping,
  ENTITY_TYPE_FIELDS,
  isRefusedPair,
  REKEYABLE_ENTITY_TYPES,
  WORLD_IDENTITY_FIELDS,
} from './worldScopeEntityGrouping.js';
import {
  keyedRemapper,
  rewriteGatheringSliceReferences,
  rewriteMembershipReferences,
  rewriteRecipeReferences,
  rewriteSystemReferences,
} from './worldScopeReferenceRewrite.js';

/** The `data` keys the three scope payloads travel under inside the migration runner. */
export const SCOPE_PAYLOAD_KEYS = Object.freeze({
  components: 'componentScope',
  essences: 'essenceScope',
  tools: 'toolScope',
});

/** The membership `inherit` map each entity type is created with — every section OVERRIDDEN. */
const OVERRIDING_INHERIT = Object.freeze({
  components: Object.freeze({ category: false }),
  essences: Object.freeze({ effectSource: false, macro: false }),
  tools: Object.freeze({ breakage: false, onBreak: false }),
});

const ENTITY_TYPES = Object.freeze(['components', 'essences', 'tools']);

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

/** The membership map key, spelled exactly as `scopedDefinitions.membershipKey` spells it. */
function membershipKeyOf(entityId, systemId) {
  return `${entityId}|${systemId}`;
}

/**
 * Normalize a persisted re-key map to `{ [systemId]: { components: {}, tools: {} } }`, dropping
 * anything that cannot be one. TOTAL: a hand-edited or absent value answers `{}`.
 *
 * @param {unknown} raw
 * @returns {object}
 */
export function normalizeRekeyMap(raw) {
  if (!isPlainObject(raw)) return {};
  const normalized = {};
  for (const [systemId, perSystem] of Object.entries(raw)) {
    if (!trimmedString(systemId) || !isPlainObject(perSystem)) continue;
    const legs = {};
    for (const entityType of REKEYABLE_ENTITY_TYPES) {
      const leg = perSystem[entityType];
      if (!isPlainObject(leg)) continue;
      const pairs = {};
      for (const [oldId, newId] of Object.entries(leg)) {
        if (trimmedString(oldId) && trimmedString(newId)) pairs[oldId] = newId;
      }
      if (Object.keys(pairs).length > 0) legs[entityType] = pairs;
    }
    if (Object.keys(legs).length > 0) normalized[systemId] = legs;
  }
  return normalized;
}

/** Whether a normalized re-key map carries any pair at all. */
function mapHasEntries(map) {
  return Object.keys(map).length > 0;
}

/**
 * The identity projection of one record, for the write-back and the drift detector.
 *
 * @param {object} record
 * @param {string} entityType
 * @returns {object}
 */
function projectIdentity(record, entityType) {
  const identity = {};
  for (const field of WORLD_IDENTITY_FIELDS[entityType] ?? []) {
    if (record?.[field] === undefined) continue;
    identity[field] = Array.isArray(record[field]) ? [...record[field]] : record[field];
  }
  return identity;
}

/**
 * Apply a merged identity onto one in-system record, IN PLACE.
 *
 * ABSENCE IS PART OF THE UNIT. A field the world entity does not carry is DELETED from the
 * record rather than left, because `#### D3`'s rule is that the oldest contributing definition
 * wins every identity field AS A UNIT - and because `reportWorldIdentityDrift`'s zero case is
 * only true if the two copies agree on absence as well as on value.
 *
 * THE THREE SOURCE-LINK FIELDS ARE THE EXCEPTION TO THE DONOR RULE, NOT TO THIS ONE. They are
 * UNIONED across the group by `groupIdentity`, so what lands here is already every reference any
 * member claimed; writing it back is what keeps the two copies equal, and it is why no member
 * loses a reference it had.
 *
 * @param {object} record
 * @param {object} identity
 * @param {string} entityType
 * @returns {boolean} whether anything changed.
 */
function applyIdentity(record, identity, entityType) {
  let changed = false;
  for (const field of WORLD_IDENTITY_FIELDS[entityType] ?? []) {
    const next = identity?.[field];
    if (next === undefined) {
      if (field in record) {
        delete record[field];
        changed = true;
      }
      continue;
    }
    const value = Array.isArray(next) ? [...next] : next;
    if (JSON.stringify(record[field]) !== JSON.stringify(value)) {
      record[field] = value;
      changed = true;
    }
  }
  return changed;
}

/**
 * The membership record one in-system definition produces — every section OVERRIDDEN, each
 * value copied verbatim from that system's own definition (`#### D6`).
 *
 * @param {object} record The REWRITTEN in-system definition.
 * @param {string} entityType
 * @param {string} entityId
 * @param {string} systemId
 * @returns {object}
 */
export function buildMembershipRecord(record, entityType, entityId, systemId) {
  const membership = {
    entityId,
    systemId,
    inherit: { ...OVERRIDING_INHERIT[entityType] },
  };
  if (entityType === 'components') {
    // `category` verbatim, because this is an OVERRIDE and `general` is a legitimate stored
    // token there. The `general` prohibition binds the WORLD default, which
    // `worldScopeDefaults.js` refuses to mint.
    //
    // THE WRITE IS ABSENCE-PRESERVING AND MUST BE, because an empty override is NOT EXPRESSIBLE
    // for this section: `coerceComponentSection` coerces `''` to absence, and an ABSENT section
    // under an `inherit: false` switch FALLS BACK to the world value by design. So a system that
    // authored no category cannot be given one that means "nothing". The world default is
    // DECLINED instead whenever any member left the section unauthored — see
    // `worldScopeDefaults.js`, which is what keeps resolution unchanged at migration time.
    if (trimmedString(record.category)) membership.category = record.category.trim();
    const tags = arrayOf(record.tags).filter((tag) => trimmedString(tag));
    if (tags.length > 0) membership.tags = tags.map((tag) => tag.trim());
    return membership;
  }
  if (entityType === 'essences') {
    // BOTH SECTIONS ARE WRITTEN UNCONDITIONALLY, and that is what makes them safe rather than
    // merely tidy: an ABSENT section under an `inherit: false` switch FALLS BACK to the world
    // value, so an absence-preserving write would silently hand a system that authored nothing
    // the DONOR's effect source or property macro. Both can express emptiness — `{}` and `null`
    // are real, overriding values that every reader treats as "no source" and "no macro" — so
    // neither needs the world default to be declined the way `category` does.
    const effectSource = {};
    for (const field of ['sourceComponentId', 'sourceItemUuid', 'associatedSystemItemId']) {
      if (record[field] !== undefined) effectSource[field] = record[field];
    }
    membership.effectSource = effectSource;
    membership.macro = record.propertyMacroUuid ?? null;
    membership.enabled = record.enabled !== false;
    return membership;
  }
  // ABSENCE-PRESERVING, AND NECESSARILY SO. Neither section can express an empty override: `{}`
  // IS an override, but the read union spreads the resolved value LAST, so `breakage: {}` would
  // overwrite the surviving in-system block with a shape every reader mis-reads. The world
  // default is DECLINED instead whenever any member left the section unauthored.
  if (record.breakage !== undefined) membership.breakage = cloneJson(record.breakage);
  if (record.onBreak !== undefined) membership.onBreak = cloneJson(record.onBreak);
  // NOT A RESOLVER SECTION. `resolveTool` answers `repairRequirements` from the membership record
  // ALONE and never reads the world defaults, so an unauthored one cannot fall back to the
  // donor's and needs no decline.
  if (Array.isArray(record.repairRequirements)) {
    membership.repairRequirements = cloneJson(record.repairRequirements);
  }
  membership.enabled = record.enabled !== false;
  return membership;
}

/**
 * The persisted scope payload for one entity type, or the ORIGINAL when nothing changed.
 *
 * @param {unknown} existing The persisted value.
 * @returns {{entities: Array<object>, defaults: object, membership: object}}
 */
function readScopePayload(existing) {
  const source = isPlainObject(existing) ? existing : {};
  const { entities, defaults, membership, ...extras } = source;
  return {
    entities: cloneJson(arrayOf(entities).filter((entry) => isPlainObject(entry))),
    defaults: cloneJson(isPlainObject(defaults) ? defaults : {}),
    membership: cloneJson(isPlainObject(membership) ? membership : {}),
    // EVERY OTHER AUTHORED KEY IS PRESERVED, and that is not defensive style. The tool scope
    // carries a FOURTH sibling — the WORLD tool-breakage authority — which
    // `createToolScopeStore` normalizes as an extra and `ScopedDefinitionStore` round-trips.
    // Narrowing the payload to the three sub-keys would DESTROY it on any world this pass
    // lifts, and the `1.30.0` registry label rests `downgradeLosesData: false` on the promise
    // that the three scope settings survive untouched and a re-upgrade finds them intact.
    // Nothing authors an authority at `1.30.0`, but import/export ships in the same release
    // and the catalogue editors follow it.
    ...cloneJson(extras),
  };
}

/**
 * A component id that is plausibly a definition id rather than a document UUID.
 *
 * `sourceItemUuid` legitimately holds EITHER, and a document UUID is not a dangling component
 * reference, so the dangling-reference report excludes anything dotted. Definition ids are
 * `randomID()` output, which never contains a dot.
 */
function looksLikeDefinitionId(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('.');
}

/**
 * Collect every component and tool reference one system reaches, THROUGH THE SHARED WALK.
 *
 * Driving the rewrite functions with recording remappers is deliberate: a second traversal
 * written by hand is a mirror of the enumeration, and mirrors rot. This one cannot report a
 * site the rewrite does not visit, and vice versa.
 *
 * @param {object} system
 * @param {Array<object>} recipes That system's recipes.
 * @param {object|null} gatheringSlice That system's `gatheringConfig.systems[id]` block.
 * @returns {{componentIds: Set<string>, toolIds: Set<string>}}
 */
function collectSystemReferences(system, recipes, gatheringSlice) {
  const componentIds = new Set();
  const toolIds = new Set();
  const remapComponent = (value) => {
    if (looksLikeDefinitionId(value)) componentIds.add(value.trim());
    return value;
  };
  const remapTool = (value) => {
    if (looksLikeDefinitionId(value)) toolIds.add(value.trim());
    return value;
  };
  const remappers = { remapComponent, remapTool };
  // A CLONE, because the collectors are driven through the mutating walk: returning the value
  // unchanged makes each write a no-op, but a walk is still a walk and must not be pointed at
  // the payload the caller is about to persist.
  const probe = cloneJson({ system, recipes, gatheringSlice });
  rewriteSystemReferences(probe.system, remappers);
  for (const recipe of arrayOf(probe.recipes)) rewriteRecipeReferences(recipe, remappers);
  rewriteGatheringSliceReferences(probe.gatheringSlice, remappers);
  return { componentIds, toolIds };
}

/**
 * The references that resolve to NOTHING, reported so a GM can review them.
 *
 * **THIS IS A REPORT, NOT A PREDICTED DELETION, and the correction is measured rather than
 * argued.** An earlier form of this docblock - and of the GM notice - said these references
 * "will be removed on the next save now that the world scope is seeded". Across every corpus in
 * the acceptance set, TEN references resolve to nothing before the migration and ZERO disappear
 * after the round trip. Two facts explain it, and both are independently verifiable:
 *
 * - `_normalizeSystem` consumes `scopeBasis.componentIds` at exactly ONE site, the essence
 *   source-uuid retention. It prunes no recipe ingredient, no salvage result, no gathering drop
 *   row and no tool link against the component basis at all.
 * - The basis was ALREADY known for any system with a NON-EMPTY in-system array, which after
 *   this migration is every system, because `1.30.0` does not shed those arrays. The
 *   newly-decidable case is a system whose array is EMPTY, and that becomes the common case only
 *   when the CONSUMER SWEEP sheds them.
 *
 * So these references are already broken and become PRUNABLE at the sweep; this release deletes
 * none of them. The report is still worth making - it is the one moment the whole corpus is
 * walked end to end - but a notice predicting a deletion that never happens is worse than none.
 */
function computeFlaggedForReview(systems, recipes, gatheringConfig, worldRoster) {
  const flagged = [];
  for (const system of arrayOf(systems)) {
    const systemId = trimmedString(system?.id);
    if (!systemId) continue;
    const ownComponents = new Set(
      arrayOf(system.components)
        .map((record) => trimmedString(record?.id))
        .filter(Boolean)
    );
    const ownTools = new Set(
      arrayOf(system.tools)
        .map((record) => trimmedString(record?.id))
        .filter(Boolean)
    );
    const systemRecipes = arrayOf(recipes).filter(
      (recipe) => trimmedString(recipe?.craftingSystemId) === systemId
    );
    const slice = isPlainObject(gatheringConfig?.systems)
      ? gatheringConfig.systems[systemId]
      : null;
    const { componentIds, toolIds } = collectSystemReferences(system, systemRecipes, slice ?? null);
    for (const referenceId of componentIds) {
      if (ownComponents.has(referenceId) || worldRoster.components.has(referenceId)) continue;
      flagged.push({ systemId, entityType: 'components', referenceId });
    }
    for (const referenceId of toolIds) {
      if (ownTools.has(referenceId) || worldRoster.tools.has(referenceId)) continue;
      flagged.push({ systemId, entityType: 'tools', referenceId });
    }
  }
  return flagged;
}

/**
 * Run the whole `1.30.0` world-scope entity transform.
 *
 * @param {object} data The runner's payload.
 * @returns {object} The keys this migration changed, plus the transient
 *   `_worldScopeEntityReport`. Every unchanged key answers its ORIGINAL object.
 */
export function migrateWorldScopeEntities(data) {
  if (!isPlainObject(data)) return data;
  const originalSystems = arrayOf(data.systems);
  const originalRecipes = arrayOf(data.recipes);
  const originalGatheringConfig = isPlainObject(data.gatheringConfig) ? data.gatheringConfig : {};

  const systems = cloneJson(originalSystems);
  const recipes = cloneJson(originalRecipes);
  const gatheringConfig = cloneJson(originalGatheringConfig);

  const persistedMap = normalizeRekeyMap(data.worldScopeRekeyMap);
  const reusingPersistedMap = mapHasEntries(persistedMap);
  // The grouping is derived on EVERY pass: it supplies the world roster, the memberships and
  // the report. Only its MAP is discarded on a re-run — a torn run may already have re-keyed
  // `craftingSystems`, from which the derived map would be empty while `gatheringConfig` still
  // holds the old ids.
  const grouping = buildWorldScopeGrouping(systems);
  const rekeyMap = reusingPersistedMap ? persistedMap : grouping.rekeyMap;

  const payloads = {};
  for (const entityType of ENTITY_TYPES) {
    payloads[entityType] = readScopePayload(data[SCOPE_PAYLOAD_KEYS[entityType]]);
  }

  // -------------------------------------------------------------------------
  // 1. THE REWRITE HALF — unconditional, driven by the map alone.
  // -------------------------------------------------------------------------
  // How many membership records the FOURTH-target walk had to repair. ZERO on a correctly
  // ordered pass; anything else means a payload was built BEFORE the rewrite ran.
  let payloadRewriteRepairs = 0;
  const recipesBySystem = new Map();
  for (const recipe of recipes) {
    const systemId = trimmedString(recipe?.craftingSystemId);
    if (!systemId) continue;
    if (!recipesBySystem.has(systemId)) recipesBySystem.set(systemId, []);
    recipesBySystem.get(systemId).push(recipe);
  }

  for (const system of systems) {
    const systemId = trimmedString(system?.id);
    if (!systemId) continue;
    const perSystem = rekeyMap[systemId];
    if (!perSystem) continue;
    const remappers = {
      remapComponent: keyedRemapper(perSystem.components),
      remapTool: keyedRemapper(perSystem.tools),
    };
    // The DEFINITION ids themselves, then every reference to them.
    for (const entityType of REKEYABLE_ENTITY_TYPES) {
      const leg = perSystem[entityType] ?? {};
      for (const record of arrayOf(system[ENTITY_TYPE_FIELDS[entityType]])) {
        const id = trimmedString(record?.id);
        if (id && Object.prototype.hasOwnProperty.call(leg, id)) record.id = leg[id];
      }
    }
    rewriteSystemReferences(system, remappers);
    for (const recipe of recipesBySystem.get(systemId) ?? []) {
      rewriteRecipeReferences(recipe, remappers);
    }
    if (isPlainObject(gatheringConfig.systems)) {
      rewriteGatheringSliceReferences(gatheringConfig.systems[systemId], remappers);
    }
    // The three scope payloads as a FOURTH target. On a correctly ordered pass this finds
    // NOTHING to change; it is the belt-and-braces arm.
    //
    // IT IS COUNTED, and that is not telemetry. The arm is UNCONDITIONAL, so it would silently
    // REPAIR a payload built pre-rewrite — and a payload-before-rewrite ordering regression is
    // exactly what `#### D6` exists to prevent. Repaired in place, that regression is invisible
    // to every assertion about the payload's CONTENT, the membership-verbatim arm included.
    // Counting the repairs makes the belt-and-braces arm OBSERVABLE: the report carries the
    // count, an acceptance test pins it at zero, and the arm still repairs.
    for (const entityType of ENTITY_TYPES) {
      for (const record of Object.values(payloads[entityType].membership)) {
        if (record?.systemId !== systemId) continue;
        const beforeRewrite = JSON.stringify(record);
        rewriteMembershipReferences(record, entityType, remappers);
        if (JSON.stringify(record) !== beforeRewrite) payloadRewriteRepairs += 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. THE IN-SYSTEM IDENTITY WRITE-BACK — also unconditional. See the module note.
  // -------------------------------------------------------------------------
  const identityByNewId = {};
  for (const entityType of ENTITY_TYPES) {
    const lookup = new Map();
    // On a re-run the source is the PERSISTED SCOPE PAYLOAD, keyed by the mapped NEW id.
    for (const entity of payloads[entityType].entities) {
      const id = trimmedString(entity?.id);
      if (id) lookup.set(id, projectIdentity(entity, entityType));
    }
    // A fresh pass, or a tear before the scope legs landed, has no persisted payload to read;
    // the grouping is then the only source and is correct, because `craftingSystems` still
    // carries the pre-re-key ids the grouping was derived from.
    for (const entity of grouping.entities[entityType]) {
      if (!lookup.has(entity.id)) lookup.set(entity.id, entity.identity);
    }
    identityByNewId[entityType] = lookup;
  }

  let overriddenRecords = 0;
  for (const system of systems) {
    const systemId = trimmedString(system?.id);
    if (!systemId) continue;
    for (const entityType of ENTITY_TYPES) {
      if (isRefusedPair(grouping.refusals, systemId, entityType)) continue;
      for (const record of arrayOf(system[ENTITY_TYPE_FIELDS[entityType]])) {
        const id = trimmedString(record?.id);
        if (!id) continue;
        const identity = identityByNewId[entityType].get(id);
        if (identity) applyIdentity(record, identity, entityType);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. THE LIFT/CLAIM HALF — gated PER `(entityId, systemId)` on the corpus.
  // -------------------------------------------------------------------------
  const createdEntities = { components: 0, essences: 0, tools: 0 };
  const systemsById = new Map(
    systems.filter((system) => trimmedString(system?.id)).map((system) => [system.id, system])
  );

  for (const entityType of ENTITY_TYPES) {
    const payload = payloads[entityType];
    const entityIds = new Set(payload.entities.map((entity) => entity.id));
    for (const entity of grouping.entities[entityType]) {
      const liveMembers = entity.members.filter(
        (member) => !isRefusedPair(grouping.refusals, member.systemId, entityType)
      );
      if (liveMembers.length === 0) continue;
      if (!entityIds.has(entity.id)) {
        payload.entities.push({ id: entity.id, ...entity.identity });
        entityIds.add(entity.id);
        createdEntities[entityType] += 1;
      }
      for (const member of liveMembers) {
        const key = membershipKeyOf(entity.id, member.systemId);
        // THE GUARD, corpus-derived and per pair. Never `migrationVersion`, and never a
        // disjunction across the three keys: any GM edit seeds a key, and migrations run on
        // the active GM alone, so "this key has entries" does not prove this pass ran.
        if (payload.membership[key]) continue;
        const system = systemsById.get(member.systemId);
        const record = arrayOf(system?.[ENTITY_TYPE_FIELDS[entityType]]).find(
          (candidate) => trimmedString(candidate?.id) === entity.id
        );
        if (!record) continue;
        payload.membership[key] = buildMembershipRecord(
          record,
          entityType,
          entity.id,
          member.systemId
        );
        overriddenRecords += 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3b. THE DONOR-ELECTED WORLD DEFAULTS.
  //
  // Elected from the OLDEST contributing system - the same donor that wins identity - which is
  // the maintainer's ruling extending `#### D3`'s oldest-wins rule from identity to behaviour.
  //
  // IT RUNS AFTER THE MEMBERSHIP LOOP, and that ordering is load-bearing: the
  // `repairRequirements` constraint asks whether every referenced component is a world component
  // that every member system is a MEMBER of, and the membership records that answer it are
  // written above.
  //
  // NOTHING RESOLVES THROUGH THESE AT MIGRATION TIME. Every membership record still overrides
  // every section with its own system's value verbatim, so the corpus differential is unchanged
  // by this block; a world default only ever matters for a system added LATER, or an override a
  // GM clears later.
  // -------------------------------------------------------------------------
  const worldComponentIds = new Set(payloads.components.entities.map((entity) => entity.id));
  const isMemberOf = (componentId, systemId) =>
    Boolean(payloads.components.membership[membershipKeyOf(componentId, systemId)]);
  const refusedDefaultSections = [];

  for (const entityType of ENTITY_TYPES) {
    const payload = payloads[entityType];
    for (const entity of grouping.entities[entityType]) {
      // The per-pair LIFT guard governs this too: an entity whose defaults a previous pass
      // already wrote is not re-elected, so a re-run cannot overwrite a GM's later edit.
      if (payload.defaults[entity.id]) continue;
      const liveMembers = entity.members.filter(
        (member) => !isRefusedPair(grouping.refusals, member.systemId, entityType)
      );
      if (liveMembers.length === 0) continue;
      const recordFor = (systemId) =>
        arrayOf(systemsById.get(systemId)?.[ENTITY_TYPE_FIELDS[entityType]]).find(
          (candidate) => trimmedString(candidate?.id) === entity.id
        );
      const memberRecords = liveMembers.map((member) => recordFor(member.systemId)).filter(Boolean);
      const donorRecord = memberRecords[0];
      if (!donorRecord) continue;
      const { record, refusedSections } = electWorldDefault({
        entityType,
        entityId: entity.id,
        donorRecord,
        // EVERY live member's record, because a section only one of them authored must NOT
        // become a world default: the members that authored none would fall back to it.
        memberRecords,
        worldComponentIds,
        isMemberOf,
        memberSystemIds: liveMembers.map((member) => member.systemId),
      });
      if (record) payload.defaults[entity.id] = record;
      for (const section of refusedSections) {
        refusedDefaultSections.push({ entityType, entityId: entity.id, section });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. THE REPORT.
  // -------------------------------------------------------------------------
  const worldRoster = {
    components: new Set(payloads.components.entities.map((entity) => entity.id)),
    essences: new Set(payloads.essences.entities.map((entity) => entity.id)),
    tools: new Set(payloads.tools.entities.map((entity) => entity.id)),
  };
  const report = {
    createdEntities,
    mergedGroups: grouping.mergedGroups,
    transitiveGroups: grouping.transitiveGroups,
    renames: grouping.renames,
    overriddenRecords,
    refusals: grouping.refusals,
    flaggedForReview: computeFlaggedForReview(systems, recipes, gatheringConfig, worldRoster),
    // ZERO on a correctly ordered pass. See the fourth-target walk above.
    payloadRewriteRepairs,
    // The world-default sections a CONSTRAINT declined, distinct from the ones the donor simply
    // did not author. A DIAGNOSTIC, not a GM-facing fact: see the module note for why it is kept
    // out of the notice rather than added to it.
    refusedDefaultSections,
  };

  // -------------------------------------------------------------------------
  // 5. RETURN THE ORIGINAL OBJECT FOR ANY KEY THIS PASS DID NOT CHANGE.
  // -------------------------------------------------------------------------
  // The comparison is against the NORMALIZED read of the original, not the raw value, so a
  // world with nothing to lift leaves its three scope settings and the map untouched rather
  // than seeding them with empty collections. Seeding an empty `entities` would make
  // `_scopeEntityBasis` report a KNOWN, EMPTY basis, which is a licence to prune.
  const unchanged = (next, original) =>
    JSON.stringify(next) === JSON.stringify(original) ? original : next;

  const result = {
    recipes: unchanged(recipes, data.recipes),
    systems: unchanged(systems, data.systems),
    gatheringConfig: unchanged(gatheringConfig, data.gatheringConfig),
    worldScopeRekeyMap:
      JSON.stringify(rekeyMap) === JSON.stringify(normalizeRekeyMap(data.worldScopeRekeyMap))
        ? data.worldScopeRekeyMap
        : rekeyMap,
    _worldScopeEntityReport: report,
  };
  for (const entityType of ENTITY_TYPES) {
    const key = SCOPE_PAYLOAD_KEYS[entityType];
    result[key] =
      JSON.stringify(payloads[entityType]) === JSON.stringify(readScopePayload(data[key]))
        ? data[key]
        : payloads[entityType];
  }
  return result;
}
