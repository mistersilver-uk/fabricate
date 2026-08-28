import { findWorldDefault, membershipKey } from './scopedDefinitions.js';

/**
 * The persistence shell behind the three world-scope entity settings (issue 1359, part of epic
 * 1357): `fabricate.componentScope`, `fabricate.essenceScope` and `fabricate.toolScope`.
 *
 * ONE PARAMETERIZED FACTORY, THREE KEYS — and the decisive reason is SEEDEDNESS INDEPENDENCE
 * rather than write amplification. `isSeeded()` is the predicate that makes a destructive prune
 * decidable, and on a SHARED key it cannot be honest per entity type: a store writes the whole
 * object, so one entity type's first write persists the others as empty and converts UNKNOWN bases
 * into real, empty, PRUNABLE ones in a single keystroke. `CharacterLibrariesStore._persist` does
 * exactly that today, and it survives only because the legacy in-system half of the union still
 * vouches for the ids. Across three entity types whose references reach recipe ingredients,
 * results, salvage, gathering drop rows, tool links and essence source components, it would not.
 *
 * Three keys REDUCE but do not REMOVE the clobber window, and this says so rather than
 * overclaiming. Separate keys are separate `Setting` documents and cannot lose each other's
 * update. They do not reduce the INTRA-key window: a whole scope value is read-modify-written per
 * edit, Foundry offers no per-key merge and no compare-and-set, so two GMs editing two different
 * components still race. That window is mitigated only by publish-before-await, within one client,
 * and is unchanged from today's `craftingSystems` write.
 *
 * ## The persisted shape
 *
 * ```text
 * { entities: [ {id, ...} ], defaults: { [entityId]: {id, ...} },
 *   membership: { [entityId|systemId]: {entityId, systemId, ...} } }
 * ```
 *
 * Three sub-keys for the three layers `## Scoped Entity Definitions` names: the World Component /
 * World Essence / World Tool identity roster, the world defaults that carry behaviour, and the
 * per-`(entity, system)` membership record. `defaults` and `membership` are MAPS because that is
 * how they are addressed — `membershipKey(entityId, systemId)` exists for exactly this — and the
 * map key is DERIVED FROM THE RECORD on every normalize rather than trusted, so a hand-edited or
 * imported payload whose key and record disagree cannot produce a lookup that finds the wrong
 * record.
 *
 * `entities` IS NOT GIVEN A SCHEMA HERE, and that is deliberate. This change is additive: nothing
 * is migrated, so no writer exists yet, and inventing an identity schema now would pre-empt the
 * migration issue that has to agree with the shipped `## Component` / `## EssenceDefinition` /
 * `## Tool` shapes. So the entity normalizer enforces IDENTITY ONLY — a non-object entry is
 * dropped, an id-less entry is dropped, ids are trimmed and de-duplicated first-wins — and every
 * other authored field is preserved verbatim.
 *
 * ## Every property of `CharacterLibrariesStore` this copies is load-bearing
 *
 * - RAW READ, THEN KEY PRESENCE, THEN NORMALIZE. `game.settings.get` on a world setting that was
 *   never written returns the REGISTERED DEFAULT, so an unmigrated world reads `{}` and normalizes
 *   to three empty collections — byte-identical, at this API, to a GM who deliberately emptied
 *   them. Those two states must not be treated alike, because `CraftingSystemManager` prunes
 *   reference ids against this corpus, so the distinction is captured from the RAW payload first.
 * - `isSeeded(subKey)` OVER THE NAMED RAW SUB-KEYS, because Foundry synthesizes a document for an
 *   unwritten key and offers no value-level presence answer.
 * - PUBLISH THE CACHE BEFORE AWAITING THE WRITE. A GM authoring incrementally fires one write per
 *   keystroke, so a second edit routinely starts while the first is in flight; publishing after
 *   the await would have that second edit read the pre-first-edit corpus and clobber it.
 * - `load()` IS GUARDED AND NEVER THROWS. A throw propagates through `_normalizeSystem` into
 *   `hydrate` and out of `initialize()` — the issue-970 failure mode where the manager never
 *   initializes at all. An unreadable setting must degrade to an UNKNOWN basis, not take the
 *   module down.
 * - PERSISTENCE IS NEVER GATED ON VALIDITY, exactly as `CurrencyConfigStore` is not: a GM authors
 *   incrementally, so rejecting a transiently incomplete write would make the editor unusable.
 *
 * ## One stable corpus per store, replaced wholesale
 *
 * The resolved-union memo (`src/utils/definitionIndex.js`) keys on the corpus OBJECT, so this
 * store publishes exactly one and replaces it wholesale in `load()` and `_persist()`. Nothing
 * mutates it in place, which is what makes replication invalidate the memo by identity and is why
 * no revision counter is minted for world scope. Keying on the corpus object rather than on any
 * one of its three arrays is deliberate: a store publishes THREE arrays — `entities`, `defaults`
 * and `membership` — and {@link unionScopedDefinitions} reads all three, so keying on one alone
 * would be a PARTIAL identity, missing an invalidation that changed only `defaults` or
 * `membership` while `entities` stayed the same reference.
 *
 * ## The seams are injected, not imported
 *
 * `getSetting` / `setSetting` are constructor parameters with no module-level default, unlike
 * `CharacterLibrariesStore`, so this module does not import `src/config/settings.js` — which
 * transitively pulls in `src/ui/theme.js`. That matters because the three per-entity scope modules
 * import {@link unionScopedDefinitions} from here, and #1358 built them as pure leaves with no
 * Foundry and no UI in their closure. `src/systems/worldScopeStores.js` is the composition root
 * that supplies the real seams.
 */

/**
 * The three sub-keys a scope setting carries, in layer order.
 *
 * @type {readonly string[]}
 */
export const SCOPE_SUB_KEYS = Object.freeze(['entities', 'defaults', 'membership']);

/**
 * A plain object, or `{}` for anything that cannot be one.
 *
 * @param {unknown} value
 * @returns {object}
 */
function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * The entries of a raw sub-key, whether it arrived as a map or as an array.
 *
 * TOLERANT OF BOTH, because the persisted shape is a map while every normalizer #1358 ships takes
 * an array, and an import or a hand edit may legitimately deliver either.
 *
 * @param {unknown} raw
 * @returns {unknown[]}
 */
function subKeyEntries(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

/**
 * Normalize the world entity roster: IDENTITY ONLY.
 *
 * A non-object or id-less entry is DROPPED rather than repaired, ids are trimmed and de-duplicated
 * first-wins, and every other authored field is preserved VERBATIM. See the module note for why
 * this deliberately enforces no schema beyond identity.
 *
 * Total, non-throwing and idempotent, on the `normalizeModifierLibrary` contract.
 *
 * @param {unknown} raw
 * @returns {Array<object>}
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

/**
 * Key a normalized list back into the persisted map shape.
 *
 * The key is DERIVED FROM THE RECORD, never carried over from the raw payload, so a payload whose
 * map key and record disagree cannot survive a round trip in that state.
 *
 * @param {Array<object>} records
 * @param {(record: object) => string} keyOf
 * @returns {Record<string, object>}
 */
function keyedByRecord(records, keyOf) {
  const map = {};
  for (const record of records) map[keyOf(record)] = record;
  return map;
}

/**
 * The membership records for one system, keyed by entity id.
 *
 * @param {Array<object>} memberships
 * @param {string} systemId
 * @returns {Map<string, object>}
 */
function membershipsForSystem(memberships, systemId) {
  const bySystem = new Map();
  for (const record of memberships) {
    if (record?.systemId === systemId) bySystem.set(record.entityId, record);
  }
  return bySystem;
}

/**
 * THE READ UNION for one entity type and one crafting system.
 *
 * IT IS NOT THE BASIS UNION, and conflating the two is the single most consequential mistake
 * available in this change. This one answers what a system's entity list IS: the world entities
 * whose membership record for that system is PRESENT, resolved through #1358's three-layer
 * resolver, unioned with that system's surviving in-system array, WORLD WINNING on an id
 * collision FIELD BY FIELD. It is MEMBERSHIP-FILTERED and returns RESOLVED values, never raw
 * world entities — an unfiltered union would give every system every world entity and delete the
 * membership model #1358 built, and a raw-entity union would hand back world defaults in place of
 * a system's own overrides, bypassing the inherit map.
 *
 * ## "WORLD WINS" IS PER FIELD, AND WAS PER RECORD (issue 1363)
 *
 * The collision branch used to push the world-resolved entry, mark the id claimed, and then SKIP
 * the legacy entry entirely. That was harmless only while nothing wrote the world corpus. After
 * the `1.30.0` migration the in-system record and the world entity share an id BY CONSTRUCTION,
 * so that skip would drop `salvage`, `essences`, `difficulty` and `complications` from EVERY
 * component the union returns. The merge is `{ ...legacyEntry, ...entity, ...resolved }`: the
 * in-system record supplies fields no world layer owns, and the world layer still wins every
 * field it authors. Nothing about world precedence is weakened — it is corrected only in that a
 * world record no longer ERASES disjoint in-system fields.
 *
 * TWO SPREAD HAZARDS, both real and both intended, stated here so neither is later read as a
 * defect:
 *
 * - `resolveScopedDefinition` guards `undefined`, so `resolved` cannot blank a section.
 *   `...entity` is NOT guarded that way: a world entity carrying an EMPTY-STRING `description`
 *   or `img` overwrites a populated legacy one, because `normalizeWorldEntities` preserves every
 *   authored field verbatim and enforces only an identity floor. That is world precedence working
 *   as specified — an authored empty string is an authored value.
 * - `resolveScopedDefinition` ALWAYS emits `member` and `inherited`, and for an enableable scope
 *   ALWAYS emits `enabled`, so the merge overwrites a legacy `enabled` on essences and tools.
 *   THAT IS INTENDED: after the migration the membership record is the only correct source of
 *   `enabled` for a world-claimed essence or tool, and the legacy value is the pre-migration copy.
 *
 * The BASIS union (`CraftingSystemManager#_scopeBasis`) is deliberately NOT membership-filtered,
 * because #1358's membership requirement is that an absent record is a REFUSAL, never a PRUNE: a
 * reference to a world entity this system is not a member of must survive normalization and be
 * refused at use.
 *
 * BOUNDED, NOT A READ-ALIAS. It exists because migrations run on the ACTIVE GM alone: every player
 * and assistant GM spends at least one session reading settings that have not been written, and
 * before the migration the in-system arrays ARE the corpus. It is bounded by that migration —
 * deliberately not the permanent read-alias the `1.22.0` and `1.23.0` relocations refused.
 *
 * @param {object} options
 * @param {{entities: Array<object>, defaults: Array<object>, membership: Array<object>}|null}
 *   options.corpus The store's published world corpus.
 * @param {string} options.systemId
 * @param {unknown} options.systemDefinitions The system's surviving in-system array.
 * @param {(worldDefault: object|null, membership: object|null) => object} options.resolve The
 *   per-entity resolver from `componentScope.js` / `essenceScope.js` / `toolScope.js`.
 * @returns {Array<object>}
 */
export function unionScopedDefinitions({ corpus, systemId, systemDefinitions, resolve }) {
  const legacy = Array.isArray(systemDefinitions) ? systemDefinitions : [];
  const entities = Array.isArray(corpus?.entities) ? corpus.entities : [];
  const defaults = Array.isArray(corpus?.defaults) ? corpus.defaults : [];
  const memberships = Array.isArray(corpus?.membership) ? corpus.membership : [];
  const system = typeof systemId === 'string' ? systemId.trim() : '';

  const union = [];
  const claimed = new Set();
  if (system) {
    // One pass to bucket the memberships and one to walk the entities, rather than a
    // `findMembership` scan per entity: the union is memoized, but a memo over an O(entities x
    // memberships) build is still an O(entities x memberships) build on every world edit.
    const bySystem = membershipsForSystem(memberships, system);
    const byId = legacyById(legacy);
    for (const entity of entities) {
      const membership = bySystem.get(entity.id);
      if (!membership) continue;
      claimed.add(entity.id);
      // FIELD BY FIELD, NOT RECORD BY RECORD (issue 1363). The surviving in-system record is
      // spread FIRST, so it supplies every field no world layer owns, and the world layer still
      // wins every field it authors. See the docblock for why this is not a weakening of
      // "world wins".
      union.push({
        ...byId.get(entity.id),
        ...entity,
        ...resolve(findWorldDefault(defaults, entity.id), membership),
      });
    }
  }
  for (const entry of legacy) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : entry?.id;
    if (id === undefined || id === null || claimed.has(id)) continue;
    claimed.add(id);
    union.push(entry);
  }
  return union;
}

/**
 * The legacy in-system records of one system, keyed by trimmed id.
 *
 * LAST-WINS ON A DUPLICATE ID, deliberately, because both shipped index builders are — the
 * definition index and `CraftingSystemManager`'s own `itemById`. A hand-edited corpus carrying a
 * duplicate id is already broken, but it must break the SAME WAY everywhere: a first-wins map
 * here would make the read union answer one record while every index answered the other, which
 * is the silent divergence the migration's own output-uniqueness post-condition exists to
 * prevent it ever creating.
 *
 * @param {Array<object>} legacy
 * @returns {Map<unknown, object>}
 */
function legacyById(legacy) {
  const byId = new Map();
  for (const entry of legacy) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : entry?.id;
    if (id === undefined || id === null) continue;
    byId.set(id, entry);
  }
  return byId;
}

/**
 * Build one world-scope entity store.
 *
 * @param {object} options
 * @param {string} options.settingKey The world setting key this store owns.
 * @param {(key: string) => unknown} options.getSetting
 * @param {(key: string, value: unknown) => Promise<unknown>} options.setSetting
 * @param {(raw: unknown) => Array<object>} options.normalizeDefaults The per-entity world-defaults
 *   normalizer from `componentScope.js` / `essenceScope.js` / `toolScope.js`.
 * @param {(raw: unknown) => Array<object>} options.normalizeMemberships The per-entity membership
 *   normalizer from the same module.
 * @param {(raw: object) => object} [options.normalizeExtras] Per-key fields beside the three
 *   sub-keys — the WORLD tool-breakage authority is the only one, and it belongs to `toolScope`
 *   alone.
 * @returns {object} The store.
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
    /** @type {{entities: Array<object>, defaults: Array<object>, membership: Array<object>}|null} */
    this._corpus = null;
    this._entityIds = null;
    this.loaded = false;
    this.seeded = { entities: false, defaults: false, membership: false };
  }

  /**
   * Read, record raw key presence, then normalize — and the ORDER is the whole point. See the
   * module note.
   *
   * GUARDED. An unreadable or malformed setting degrades to an UNKNOWN basis rather than taking
   * the module down.
   *
   * @returns {object} The published corpus.
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

  /**
   * Replace the published corpus wholesale.
   *
   * WHOLESALE IS THE CONTRACT, not an implementation detail: the resolved-union memo keys on this
   * object's identity, so an in-place edit would serve a stale union forever.
   *
   * @param {object} corpus
   * @returns {void}
   * @private
   */
  _publish(corpus) {
    this._corpus = corpus;
    this._entityIds = null;
    this.loaded = true;
  }

  _ensureLoaded() {
    if (!this.loaded) this.load();
  }

  /**
   * @param {unknown} raw
   * @returns {object}
   * @private
   */
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
   * The published world corpus, BY REFERENCE.
   *
   * Deliberately not a clone: {@link unionScopedDefinitions} is memoized on this object's
   * identity, and a fresh clone per call would miss the memo on every read. Callers that intend to
   * mutate use {@link ScopedDefinitionStore#get}.
   *
   * @returns {{entities: Array<object>, defaults: Array<object>, membership: Array<object>}}
   */
  corpus() {
    this._ensureLoaded();
    return this._corpus;
  }

  /** The world entity roster, by reference. @returns {Array<object>} */
  listEntities() {
    return this.corpus().entities;
  }

  /** The world defaults, by reference. @returns {Array<object>} */
  listDefaults() {
    return this.corpus().defaults;
  }

  /** The system membership records, by reference. @returns {Array<object>} */
  listMemberships() {
    return this.corpus().membership;
  }

  /**
   * The world entity ids, cached against the published corpus.
   *
   * Cached because `CraftingSystemManager#_scopeBasis` asks for it on EVERY normalize, and the
   * roster is world-wide rather than per system. The cache is dropped by `_publish`, so it cannot
   * outlive the corpus it was derived from.
   *
   * @returns {ReadonlySet<string>}
   */
  entityIds() {
    this._ensureLoaded();
    if (!this._entityIds) {
      this._entityIds = new Set(this._corpus.entities.map((entity) => entity.id));
    }
    return this._entityIds;
  }

  /**
   * Whether the setting has ever actually been WRITTEN, as against reading back the registered
   * default. This is the predicate that makes a destructive prune decidable.
   *
   * PER SUB-KEY when given one. `CraftingSystemManager#_scopeBasis` asks `isSeeded('entities')`
   * and never the aggregate form, because the aggregate ORs across sub-keys and would report
   * seeded on the strength of a sibling — handing the basis a real, empty, PRUNABLE id set derived
   * from a sub-key that is simply absent.
   *
   * @param {'entities'|'defaults'|'membership'|null} [subKey]
   * @returns {boolean}
   */
  isSeeded(subKey = null) {
    this._ensureLoaded();
    if (!subKey) return SCOPE_SUB_KEYS.some((key) => this.seeded[key]);
    return this.seeded[subKey] === true;
  }

  /**
   * A deep copy of the persisted shape — arrays back to maps — for a caller that intends to edit.
   *
   * @returns {object}
   */
  get() {
    this._ensureLoaded();
    return cloneJson(this._persistedShape(this._corpus));
  }

  /**
   * The persisted projection of a normalized corpus.
   *
   * @param {object} corpus
   * @returns {object}
   * @private
   */
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

  /**
   * PUBLISH THE CACHE BEFORE AWAITING THE WRITE — see the module note.
   *
   * @param {object} next A normalized corpus.
   * @returns {Promise<object>}
   * @private
   */
  async _persist(next) {
    this._publish(next);
    // A write is by definition a real payload, so every sub-key is seeded from here on. Without
    // this the store would keep reporting UNKNOWN until the next reload and go on refusing to
    // prune ids the GM has just deliberately removed.
    this.seeded = { entities: true, defaults: true, membership: true };
    await this.setSetting(this.settingKey, cloneJson(this._persistedShape(next)));
    return this._corpus;
  }

  /**
   * Replace the whole scope wholesale.
   *
   * NOT GATED ON VALIDITY, deliberately: a GM authors incrementally, so the moment they add an
   * entity and before they name it the payload is transiently incomplete.
   *
   * @param {unknown} raw
   * @returns {Promise<object>}
   */
  async save(raw) {
    this._ensureLoaded();
    return this._persist(this._normalize(raw));
  }
}

/**
 * Which of the three sub-keys the RAW payload actually carries — i.e. which have been WRITTEN, as
 * against synthesized from the registered default. An array or a scalar is not a payload this
 * store ever wrote, so every sub-key reads as unseeded.
 *
 * @param {unknown} raw
 * @returns {{entities: boolean, defaults: boolean, membership: boolean}}
 */
function carriedSubKeys(raw) {
  const source = plainObject(raw);
  const carried = {};
  for (const key of SCOPE_SUB_KEYS) {
    carried[key] = Object.prototype.hasOwnProperty.call(source, key);
  }
  return carried;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
