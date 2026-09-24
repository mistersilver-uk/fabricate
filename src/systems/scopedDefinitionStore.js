import { cloneJson } from '../utils/scalars.js';

import { findWorldDefault, membershipKey } from './scopedDefinitions.js';
import {
  ESSENCE_EFFECT_SOURCE_FIELDS,
  identityOf,
  WORLD_IDENTITY_FIELDS,
} from './worldScopeEntityGrouping.js';

/**
 * The persistence shell behind `fabricate.componentScope`, `fabricate.essenceScope` and
 * `fabricate.toolScope` (issue 1359). One factory, three keys, so each entity type's `isSeeded()`
 * stays honest: a shared key would persist its siblings as empty, and so prunable, on the first
 * write. The persisted shape is `{ entities: [], defaults: {id: record},
 * membership: {"entityId|systemId": record} }`; map keys are re-derived from the record on every
 * normalize, and `entities` enforces identity only.
 *
 * A load reads raw, records key presence, then normalizes, and never throws; the cache is published
 * before the write is awaited; persistence is never gated on validity. Each store publishes one
 * corpus and replaces it wholesale, because the union memo keys on the corpus object. The setting
 * seams are injected so the three scope modules stay Foundry- and UI-free leaves;
 * `worldScopeStores.js` supplies them. Contract: `data-models/spec.md` § Scoped Entity Definitions
 * requirements 13 to 16.
 */

/** The three sub-keys a scope setting carries, in layer order. */
export const SCOPE_SUB_KEYS = Object.freeze(['entities', 'defaults', 'membership']);

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * The entries of a raw sub-key, delivered as either a map or an array. The one shared reader of
 * that tolerance for the store, the export assembler and the drift detector (issue 1364).
 */
export function subKeyEntries(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

/**
 * The world entity roster, identity only: a non-object or id-less entry is dropped, ids are trimmed
 * and de-duplicated first-wins, and every other field is kept verbatim. Total, non-throwing and
 * idempotent.
 */
export function normalizeWorldEntities(raw) {
  const seen = new Set();
  const normalized = [];
  for (const entry of subKeyEntries(raw)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ ...entry, id });
  }
  return normalized;
}

/** Key records back into the persisted map, with each key derived from its record. */
function keyedByRecord(records, keyOf) {
  const map = {};
  for (const record of records) map[keyOf(record)] = record;
  return map;
}

function membershipsForSystem(memberships, systemId) {
  const bySystem = new Map();
  for (const record of memberships) {
    if (record?.systemId === systemId) bySystem.set(record.entityId, record);
  }
  return bySystem;
}

/**
 * The read union for one entity type and one system; not the basis union
 * (`CraftingSystemManager#_scopeBasis`), which is not membership-filtered because an absent
 * membership is a refusal, never a prune. Rows, their order and duplicate ids come from the
 * in-system array walked once; a row with a present membership and world entity merges
 * `{ ...entry, ...entity, ...resolved, ...entry }`, deletes every lifted identity field the
 * in-system record does not carry, then answers each inheriting section from the world default
 * (issues 1363, 1370, 1372). `enabled`, component `tags` and tool `repairRequirements` are not
 * sections, so they answer from the in-system record.
 *
 * The memo guards the system half by `(revision, length)`, so a writer that edits `tools` or
 * `essenceDefinitions` in place must advance the revision. `entityType` is required and an unknown
 * one throws. Contract: `data-models/spec.md` § Scoped Entity Definitions requirement 15.
 */
export function unionScopedDefinitions({
  corpus,
  systemId,
  systemDefinitions,
  resolve,
  entityType,
}) {
  const legacy = Array.isArray(systemDefinitions) ? systemDefinitions : [];
  const entities = Array.isArray(corpus?.entities) ? corpus.entities : [];
  const defaults = Array.isArray(corpus?.defaults) ? corpus.defaults : [];
  const memberships = Array.isArray(corpus?.membership) ? corpus.membership : [];
  const system = typeof systemId === 'string' ? systemId.trim() : '';
  if (!system) return [...legacy];

  // Bucket once rather than scan per row: a memo over an O(entities x memberships) build still
  // rebuilds on every world edit.
  const bySystem = membershipsForSystem(memberships, system);
  const byId = worldEntitiesById(entities);
  const identityFields = liftedIdentityFields(entityType);
  const sectionWriters = inheritedSectionWriters(entityType, declaredSections(resolve));

  const union = [];
  for (const entry of legacy) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : entry?.id;
    const membership = id === undefined || id === null ? undefined : bySystem.get(id);
    const entity = id === undefined || id === null ? undefined : byId.get(id);
    if (!membership || !entity) {
      // No world half, so the row is the in-system record itself, unreallocated.
      union.push(entry);
      continue;
    }
    const worldDefault = findWorldDefault(defaults, id);
    const resolved = resolve(worldDefault, membership);
    const merged = { ...entry, ...entity, ...resolved, ...entry };
    const carried = identityOf(entry, entityType);
    for (const field of identityFields) {
      if (!(field in carried)) delete merged[field];
    }
    // Last, after the re-spread and the identity delete: an inheriting section is the one thing
    // the in-system record does not answer.
    applyInheritedSections(merged, worldDefault, resolved.inherited, sectionWriters);
    union.push(merged);
  }
  return union;
}

/**
 * Apply the world default for each inheriting section onto the fresh merged row. A missing
 * `inherit` key reads as inheriting, as in `isSectionInherited`; an `undefined` world value applies
 * nothing, while `null` is authored and applies.
 */
function applyInheritedSections(row, worldDefault, inherited, writers) {
  if (!worldDefault || typeof worldDefault !== 'object') return;
  for (const [section, write] of Object.entries(writers)) {
    if (inherited?.[section] === false) continue;
    const value = worldDefault[section];
    if (value === undefined) continue;
    write(row, value);
  }
}

/**
 * Spread an inherited `effectSource` block over the three shipped source fields. Unset is `null`
 * on this record, so an authored `effectSource: {}` clears all three.
 */
function writeInheritedEffectSource(row, value) {
  const block = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  for (const field of ESSENCE_EFFECT_SOURCE_FIELDS) row[field] = block[field] ?? null;
}

/**
 * How each section is written onto a merged row, since a section name is not always its shipped
 * field name (an essence's `effectSource` and `macro`). Each key set must equal its scope's section
 * list, which `inheritedSectionWriters` checks; the field names are driven per section by
 * `tests/world-scope-inherited-section-resolution.test.js`. `repairRequirements` is a seed, not a
 * section.
 */
const INHERITED_SECTION_WRITERS = Object.freeze({
  components: Object.freeze({
    category(row, value) {
      row.category = value;
    },
    // A copy, so a consumer cannot edit the world default through the row (issue 1371).
    essences(row, value) {
      row.essences = value && typeof value === 'object' ? { ...value } : value;
    },
  }),
  essences: Object.freeze({
    effectSource: writeInheritedEffectSource,
    macro(row, value) {
      row.propertyMacroUuid = value;
    },
  }),
  tools: Object.freeze({
    breakage(row, value) {
      row.breakage = value;
    },
    onBreak(row, value) {
      row.onBreak = value;
    },
    // Section and `Tool` field names coincide here (issue 1373).
    prerequisites(row, value) {
      row.prerequisites = value;
    },
    bonus(row, value) {
      row.bonus = value;
    },
  }),
});

/**
 * The sections a scope declares, probed as the key set of `resolve(null, null).inherited`. Not
 * imported, because the three scope modules import this one and that would close a cycle.
 */
function declaredSections(resolve) {
  if (typeof resolve !== 'function') return [];
  return Object.keys(resolve(null, null)?.inherited ?? {});
}

/**
 * The section writers for one entity type. Throws on an unknown type and on a declared section the
 * table does not write, which would otherwise answer from the in-system record with every suite
 * green (issue 1373). An empty `declared` checks nothing.
 */
function inheritedSectionWriters(entityType, declared = []) {
  const writers = INHERITED_SECTION_WRITERS[entityType];
  if (!writers) {
    const known = Object.keys(INHERITED_SECTION_WRITERS).join(', ');
    throw new TypeError(
      'unionScopedDefinitions: unknown entityType ' +
        JSON.stringify(entityType) +
        '; expected one of ' +
        known
    );
  }
  const unwritten = declared.filter((section) => !Object.hasOwn(writers, section));
  if (unwritten.length > 0) {
    throw new TypeError(
      'unionScopedDefinitions: entityType ' +
        JSON.stringify(entityType) +
        ' declares section(s) ' +
        unwritten.map((section) => JSON.stringify(section)).join(', ') +
        ' that INHERITED_SECTION_WRITERS does not write; an inheriting system would silently ' +
        'answer them from the in-system record'
    );
  }
  return writers;
}

/**
 * The lifted identity fields for one entity type. Throws rather than defaulting to none, which
 * would fail open and leave a cleared identity field stale on every read.
 */
function liftedIdentityFields(entityType) {
  const fields = WORLD_IDENTITY_FIELDS[entityType];
  if (!fields) {
    const known = Object.keys(WORLD_IDENTITY_FIELDS).join(', ');
    throw new TypeError(
      'unionScopedDefinitions: unknown entityType ' +
        JSON.stringify(entityType) +
        '; expected one of ' +
        known
    );
  }
  return fields;
}

/** The world roster keyed by id, first-wins like {@link normalizeWorldEntities}. */
function worldEntitiesById(entities) {
  const byId = new Map();
  for (const entity of entities) {
    const id = entity?.id;
    if (id === undefined || id === null || byId.has(id)) continue;
    byId.set(id, entity);
  }
  return byId;
}

/**
 * Build one world-scope entity store. `normalizeDefaults` and `normalizeMemberships` come from the
 * entity's scope module; `normalizeExtras` supplies per-key fields beside the three sub-keys, used
 * only by `toolScope` for the world tool-breakage authority.
 */
export function createScopedDefinitionStore({
  settingKey,
  getSetting,
  setSetting,
  normalizeDefaults,
  normalizeMemberships,
  normalizeExtras = () => ({}),
}) {
  return new ScopedDefinitionStore({
    settingKey,
    getSetting,
    setSetting,
    normalizeDefaults,
    normalizeMemberships,
    normalizeExtras,
  });
}

/** @see createScopedDefinitionStore */
class ScopedDefinitionStore {
  constructor({
    settingKey,
    getSetting,
    setSetting,
    normalizeDefaults,
    normalizeMemberships,
    normalizeExtras,
  }) {
    this.settingKey = settingKey;
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this._normalizeDefaults = normalizeDefaults;
    this._normalizeMemberships = normalizeMemberships;
    this._normalizeExtras = normalizeExtras;
    this._corpus = null;
    this._entityIds = null;
    this.loaded = false;
    this.seeded = { entities: false, defaults: false, membership: false };
  }

  /**
   * Read raw, record key presence, then normalize, in that order. Never throws: an unreadable
   * setting degrades to an unknown basis.
   */
  load() {
    let raw;
    try {
      raw = this.getSetting(this.settingKey);
    } catch {
      raw = null;
    }
    this.seeded = carriedSubKeys(raw);
    this._publish(this._normalize(raw));
    return this._corpus;
  }

  /** Replace the corpus wholesale; the union memo keys on its identity, so never edit in place. */
  _publish(corpus) {
    this._corpus = corpus;
    this._entityIds = null;
    this.loaded = true;
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
  }

  _normalize(raw) {
    const source = plainObject(raw);
    return {
      entities: normalizeWorldEntities(source.entities),
      defaults: this._normalizeDefaults(subKeyEntries(source.defaults)),
      membership: this._normalizeMemberships(subKeyEntries(source.membership)),
      ...this._normalizeExtras(source),
    };
  }

  /**
   * The published corpus by reference, since the union memo keys on its identity; a caller that
   * edits uses {@link ScopedDefinitionStore#get}.
   */
  corpus() {
    this._ensureLoaded();
    return this._corpus;
  }

  /** The world entity roster, by reference. */
  listEntities() {
    return this.corpus().entities;
  }

  /** The world defaults, by reference. */
  listDefaults() {
    return this.corpus().defaults;
  }

  /** The system membership records, by reference. */
  listMemberships() {
    return this.corpus().membership;
  }

  /** The world entity ids, cached until `_publish`; `_scopeBasis` asks on every normalize. */
  entityIds() {
    this._ensureLoaded();
    if (!this._entityIds) {
      this._entityIds = new Set(this._corpus.entities.map((entity) => entity.id));
    }
    return this._entityIds;
  }

  /**
   * Whether the setting was ever written rather than read back as the registered default; the
   * predicate that makes a destructive prune decidable. `_scopeBasis` asks per sub-key, because
   * the no-argument form ORs across sub-keys and would vouch on a sibling's strength.
   */
  isSeeded(subKey = null) {
    this._ensureLoaded();
    if (!subKey) return SCOPE_SUB_KEYS.some((key) => this.seeded[key]);
    return this.seeded[subKey] === true;
  }

  /** A deep copy of the persisted shape, arrays back to maps, for a caller that edits. */
  get() {
    this._ensureLoaded();
    return cloneJson(this._persistedShape(this._corpus));
  }

  _persistedShape(corpus) {
    const { entities, defaults, membership, ...extras } = corpus;
    return {
      entities,
      defaults: keyedByRecord(defaults, (record) => record.id),
      membership: keyedByRecord(membership, (record) =>
        membershipKey(record.entityId, record.systemId)
      ),
      ...extras,
    };
  }

  /** Publish the cache before awaiting the write, so an overlapping edit reads this one. */
  async _persist(next) {
    this._publish(next);
    // A write is a real payload, so every sub-key is seeded from here on and a removed id prunes.
    this.seeded = { entities: true, defaults: true, membership: true };
    await this.setSetting(this.settingKey, cloneJson(this._persistedShape(next)));
    return this._corpus;
  }

  /** Replace the whole scope; not gated on validity, since a GM authors incrementally. */
  async save(raw) {
    this._ensureLoaded();
    return this._persist(this._normalize(raw));
  }
}

/**
 * Which sub-keys the raw payload carries, as against the synthesized default. An array or a scalar
 * is not a payload this store wrote, so every sub-key reads unseeded.
 */
function carriedSubKeys(raw) {
  const source = plainObject(raw);
  const carried = {};
  for (const key of SCOPE_SUB_KEYS) {
    carried[key] = Object.prototype.hasOwnProperty.call(source, key);
  }
  return carried;
}
