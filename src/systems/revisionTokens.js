/**
 * @module revisionTokens
 *
 * The revision-token contract for crafting definitions (issue 1076, under #1070).
 *
 * Three sibling issues need to know "has this changed since I last looked?" without
 * re-deriving the answer from the corpus: #1074 (alchemy signature-report invalidation),
 * #1077 (inventory/knowledge snapshot identity) and #1078 (scoped invalidation routing).
 * The contract lives here, once, so those three do not invent three schemes.
 *
 * ## Who mints tokens
 *
 * The two runtime managers, and nobody else. `RecipeManager` mints the recipe scopes and
 * `CraftingSystemManager` mints the system scopes. A consumer READS tokens and compares
 * them; it never advances one. That asymmetry is the whole safety property: a token can
 * only be wrong if a manager failed to advance it, which is one bounded audit, rather than
 * if any of N consumers advanced it at the wrong moment, which is not.
 *
 * ## Granularity: both, deliberately
 *
 * Every mutation advances TWO scopes — the domain scope and the affected crafting system's
 * scope:
 *
 * | Scope                     | Advanced by                                                   |
 * |---------------------------|---------------------------------------------------------------|
 * | `recipes`                 | any recipe create / update / delete / import / changed reload  |
 * | `recipes:<systemId>`      | the same, for the system the recipe belongs to                 |
 * | `systems`                 | any crafting-system create / update / delete / import / reload |
 * | `system:<systemId>`       | the same, for that one system                                  |
 *
 * A consumer that caches per system (#1074's signature report, #1077's snapshots) watches
 * the narrow scope and is untouched by an edit in a different system. A consumer that
 * cannot attribute its cache to one system watches the domain scope. Publishing only the
 * narrow scope would force every such consumer to enumerate systems; publishing only the
 * domain scope would make one edit invalidate every system's cache, which is the
 * over-broad invalidation #1078 exists to remove. Both cost one integer.
 *
 * A recipe MOVED between systems advances the scopes of BOTH the system it left and the
 * system it joined, because a consumer watching the old system must also stop trusting its
 * cache.
 *
 * ## What a token IS
 *
 * A non-negative integer, monotonically increasing within one registry and one scope,
 * starting at `0` for a scope nothing has ever advanced.
 *
 * Its VALUE is meaningless. The only supported operation is `===` against a token the same
 * consumer read earlier from the same scope of the same registry. It is deliberately not a
 * hash, a timestamp, or a content digest:
 *
 * - a **hash** of the corpus is the `JSON.stringify`-the-whole-world pattern this contract
 *   replaces, and it costs O(corpus) to compute the thing you wanted to avoid computing;
 * - a **timestamp** is not monotonic across clients and collides at clock resolution;
 * - a **counter** is O(1) to advance, O(1) to compare, and cannot accidentally report
 *   "unchanged" for a change, which is the only failure direction that corrupts a cache.
 *
 * It is per-process and per-registry: it never crosses the wire, is never persisted, and
 * carries no meaning on another client. A remote edit reaches this client as a replicated
 * setting change, `reload()` runs, and the LOCAL token advances then — which is exactly
 * what a local consumer needs.
 *
 * ## How a no-change reload avoids advancing anything
 *
 * `reload()` is called from the `updateSetting` hook on every client including the writer,
 * whose in-memory map already holds the saved data. Both managers therefore have to answer
 * "did anything actually change?", and both used to answer it by running `JSON.stringify`
 * over the whole corpus TWICE per reload — 22.3 MB of string per pass at 10,000 recipes.
 *
 * {@link corpusChanged} replaces that. It compares record by record, takes a reference
 * fast path per record, short-circuits at the first difference, and never builds a whole-
 * corpus string. In the common no-change case on the writing client it still walks the
 * corpus — the persisted array was rebuilt, so the records are not reference-equal — but it
 * allocates one projection per record instead of one projection plus two 22 MB strings, and
 * in the common CHANGED case it stops at the first differing record instead of serializing
 * everything twice.
 *
 * ## Why a reload also has to say WHICH records moved (issue 1078)
 *
 * A world setting replicates as ONE `Setting` document whose entire value is a JSON string,
 * so a remote client re-parses the whole corpus and no object reference survives the wire.
 * A reload that then replaced its map and advanced every scope made every retained guard in
 * the codebase miss unconditionally, on every client except the writer's, for any edit
 * anywhere in the world — which is to say the guards did nothing for a player at all.
 *
 * {@link corpusDelta} is what both `reload()` paths use instead. It names the records that
 * changed, so a reload can advance only their scopes and REUSE the record objects it proved
 * unchanged — and with them their `components` / `tools` / `essenceDefinitions` /
 * `recipeItemDefinitions` arrays, which is the identity the retained indexes are keyed on.
 *
 * Reuse is licensed by record-level structural equality and by nothing weaker. Anything
 * coarser — reusing arrays because the id set is unchanged, say — hands back a same-object,
 * same-length array whose ELEMENTS moved, which is precisely the hole clause 3 of
 * `definitionIndex`'s invalidation rule exists to close.
 */

/**
 * The canonical scope names. Use these rather than composing scope strings by hand: a
 * consumer watching `recipes-<id>` while a manager advances `recipes:<id>` is a cache that
 * never invalidates and no test would notice.
 */
export const REVISION_SCOPES = Object.freeze({
  /** Every recipe in the world. */
  recipes: 'recipes',
  /** Every crafting system in the world. */
  systems: 'systems',
  /**
   * The recipes belonging to one crafting system.
   *
   * @param {string|null|undefined} systemId
   * @returns {string}
   */
  recipesOfSystem: (systemId) => `recipes:${systemId ?? ''}`,
  /**
   * One crafting system's own definitions (components, tools, essences, recipe items).
   *
   * @param {string|null|undefined} systemId
   * @returns {string}
   */
  system: (systemId) => `system:${systemId ?? ''}`,
});

/**
 * A per-manager registry of monotonic revision counters, keyed by scope.
 *
 * Deliberately not a module-level singleton: two managers constructed in one test process
 * (which every fixture in this repository does) must not share counters, or one fixture's
 * mutation would invalidate another's cache and the resulting flake would be blamed on the
 * cache rather than on the registry.
 */
export class RevisionRegistry {
  constructor() {
    /** @type {Map<string, number>} */
    this._tokens = new Map();
  }

  /**
   * The current token of a scope.
   *
   * @param {string} scope
   * @returns {number} `0` for a scope nothing has advanced.
   */
  read(scope) {
    return this._tokens.get(scope) ?? 0;
  }

  /**
   * Advance one or more scopes. Passing every affected scope in one call is the intended
   * shape, because a mutation always affects the domain scope AND a system scope.
   *
   * A nullish scope is ignored, so a caller need not guard a system id it may not have.
   *
   * @param {...(string|null|undefined)} scopes
   * @returns {void}
   */
  advance(...scopes) {
    for (const scope of scopes) {
      if (scope == null) continue;
      this._tokens.set(scope, this.read(scope) + 1);
    }
  }

  /**
   * Whether a token a consumer read earlier is still current.
   *
   * @param {string} scope
   * @param {number|null|undefined} token
   * @returns {boolean} `false` for a token never read (so a cold consumer rebuilds).
   */
  isCurrent(scope, token) {
    return typeof token === 'number' && token === this.read(scope);
  }
}

/**
 * JSON-shaped deep equality, short-circuiting at the first difference.
 *
 * Matches `JSON.stringify` semantics closely enough that swapping it in for a string
 * comparison does not change which reloads report a change: `undefined` and function
 * values are treated as ABSENT (as `JSON.stringify` drops them from an object), and two
 * `NaN`s compare equal (both serialize to `null`). Everything else is `Object.is`.
 *
 * @param {*} left
 * @param {*} right
 * @returns {boolean}
 */
function jsonEquals(left, right) {
  if (left === right) return true;
  if (typeof left === 'number' && typeof right === 'number') {
    return Number.isNaN(left) && Number.isNaN(right);
  }
  if (left === null || right === null) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;

  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;
  if (leftIsArray) {
    if (left.length !== right.length) return false;
    for (const [index, entry] of left.entries()) {
      if (!jsonEquals(entry, right[index])) return false;
    }
    return true;
  }

  const leftKeys = presentKeys(left);
  const rightKeys = presentKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key)) return false;
    if (!jsonEquals(left[key], right[key])) return false;
  }
  return true;
}

/**
 * The own enumerable keys `JSON.stringify` would actually emit for an object.
 *
 * @param {object} value
 * @returns {string[]}
 */
function presentKeys(value) {
  return Object.keys(value).filter((key) => {
    const entry = value[key];
    return entry !== undefined && typeof entry !== 'function';
  });
}

/**
 * Whether two corpora differ, without serializing either one.
 *
 * The replacement for `JSON.stringify(before) !== JSON.stringify(after)` in both managers'
 * `reload()`. Three properties matter:
 *
 * 1. **Order is significant**, exactly as it was for the string comparison: the persisted
 *    array's order is the in-memory map's insertion order, and a reordering IS a change a
 *    consumer must see.
 * 2. **A reference-equal record is skipped**, so a backend that hands back the same objects
 *    costs one pointer comparison per record and nothing else.
 * 3. **It short-circuits.** The string comparison had to serialize everything before it
 *    could tell; this returns at the first differing record.
 *
 * @param {Iterable<object>} before
 * @param {Iterable<object>} after
 * @param {(record: object) => object} [project] Map a record to its comparable form —
 *   `(recipe) => recipe.toJSON()` for recipes, identity for already-plain systems.
 * @returns {boolean}
 */
export function corpusChanged(before, after, project = (record) => record) {
  const left = [...before];
  const right = [...after];
  if (left.length !== right.length) return true;
  for (const [index, record] of left.entries()) {
    if (record === right[index]) continue;
    if (!jsonEquals(project(record), project(right[index]))) return true;
  }
  return false;
}

/**
 * One record's contribution to a {@link corpusDelta}.
 *
 * @typedef {object} CorpusRecordDelta
 * @property {'added'|'removed'|'changed'} kind What happened to the record.
 * @property {string[]} fields The differing top-level keys of the PROJECTED record, sorted.
 *   Every present key for an `added` or `removed` record, because the whole record arrived
 *   or left. EMPTY for a `changed` record whose projection is not a plain object (an array,
 *   a primitive): the change is real but not attributable to a field, and a consumer
 *   attributing work by field must treat an empty set as "everything", never as "nothing".
 * @property {object|null} before The PROJECTED previous record; `null` for `added`.
 * @property {object|null} after The PROJECTED next record; `null` for `removed`.
 */

/**
 * Which records of a corpus changed, rather than merely whether any did.
 *
 * @typedef {object} CorpusDelta
 * @property {boolean} changed Exactly what {@link corpusChanged} would have answered.
 * @property {boolean} reordered The change is NOT attributable to individual records — see
 *   below. A consumer MUST route a `reordered` delta broadly, whatever `perRecord` holds.
 * @property {Map<*, CorpusRecordDelta>} perRecord Keyed by record id, in `before` order
 *   followed by ids only `after` holds. Empty when nothing changed.
 */

/**
 * The per-record sibling of {@link corpusChanged}, for the one caller that has to walk the
 * whole corpus anyway: `reload()`, which builds the replacement map (issue 1078).
 *
 * `corpusChanged` short-circuits at the first differing record, which is exactly what makes
 * it cheap and exactly what stops it naming what moved. This walks everything instead. Use
 * it ONLY where the walk is already being paid for; `corpusChanged`'s contract is unchanged
 * and stays the answer for a plain boolean.
 *
 * ## It pairs by record id, never by index
 *
 * `corpusChanged` compares by array index and returns `true` the moment the lengths differ,
 * because for a boolean that is both correct and cheapest. A delta cannot borrow that: one
 * insertion shifts every later record by one position, so index pairing would report the
 * whole tail as changed and a single recipe create would invalidate every record after it —
 * the over-broad invalidation this exists to remove, reintroduced on the path that runs on
 * every connected client.
 *
 * ## Reordering, and anything else that cannot be attributed
 *
 * Order is significant, exactly as it is for {@link corpusChanged} (see property 1 there),
 * so a pure reordering of otherwise-identical records IS a change. It is also not
 * attributable to any record: every record is individually equal to its counterpart. Such a
 * delta reports `changed: true`, `reordered: true` and an EMPTY `perRecord`, and the
 * consumer contract is that it routes broadly — invalidate everything, advance every scope,
 * preserve no identity.
 *
 * The same answer is given for a corpus whose records cannot be paired at all — a nullish or
 * duplicated id on either side. It is unreachable from either manager's `reload()`, whose
 * corpora come from a `Map` keyed by that same id, but this is an exported function and the
 * honest answer for "I cannot attribute this" is the one that fails safe.
 *
 * @param {Iterable<object>} before
 * @param {Iterable<object>} after
 * @param {object} [options]
 * @param {(record: object) => object} [options.project] Map a record to its comparable form —
 *   `(recipe) => recipe.toJSON()` for recipes, identity for already-plain systems. The
 *   projected form is what `fields`, `before` and `after` carry.
 * @param {(record: object) => *} [options.identify] Read a record's id. Defaults to `.id`.
 * @returns {CorpusDelta}
 */
export function corpusDelta(before, after, { project = (record) => record, identify } = {}) {
  const readId = identify ?? ((record) => record?.id);
  const left = [...before];
  const right = [...after];
  const leftById = pairById(left, readId);
  const rightById = pairById(right, readId);
  const perRecord = new Map();

  if (!leftById || !rightById) {
    const changed = corpusChanged(left, right, project);
    return sealedDelta(changed, changed, perRecord);
  }

  for (const [id, record] of leftById) {
    const nextRecord = rightById.get(id);
    if (nextRecord === undefined) {
      const previous = project(record);
      perRecord.set(id, recordDelta('removed', previous, null));
      continue;
    }
    if (record === nextRecord) continue;
    const previous = project(record);
    const current = project(nextRecord);
    if (isRecordObject(previous) && isRecordObject(current)) {
      const fields = changedFields(previous, current);
      if (fields.length > 0) {
        perRecord.set(id, { kind: 'changed', fields, before: previous, after: current });
      }
    } else if (!jsonEquals(previous, current)) {
      perRecord.set(id, { kind: 'changed', fields: [], before: previous, after: current });
    }
  }
  for (const [id, record] of rightById) {
    if (leftById.has(id)) continue;
    perRecord.set(id, recordDelta('added', null, project(record)));
  }

  const reordered = commonOrderDiffers(leftById, rightById);
  return sealedDelta(reordered || perRecord.size > 0, reordered, perRecord);
}

/**
 * A delta neither half of which a consumer can rewrite.
 *
 * `Object.freeze` does not reach inside a `Map`, so freezing the delta object alone still
 * handed out a `perRecord` a consumer could `delete` from — and deleting an entry is
 * precisely the mutation that would license {@link patchCorpusInPlace} to reuse a record the
 * delta reported CHANGED, which is the one failure direction that corrupts a cache. The
 * mutators are therefore replaced rather than merely documented away, ahead of Part B handing
 * one delta to more than one reader.
 *
 * @param {boolean} changed
 * @param {boolean} reordered
 * @param {Map<*, CorpusRecordDelta>} perRecord Sealed in place; the caller must not retain a
 *   writable alias to it.
 * @returns {CorpusDelta}
 */
function sealedDelta(changed, reordered, perRecord) {
  for (const mutator of ['set', 'delete', 'clear']) {
    Object.defineProperty(perRecord, mutator, {
      value: () => {
        throw new TypeError(`A corpus delta is read-only: perRecord.${mutator}() is refused.`);
      },
    });
  }
  return Object.freeze({ changed, reordered, perRecord: Object.freeze(perRecord) });
}

/**
 * Apply a {@link corpusDelta} to a live corpus map, KEEPING the map object and reusing every
 * record the delta proved unchanged (issue 1078).
 *
 * This is the reuse licence, and it lives here — once — rather than in each manager's
 * `reload()`. Container identity is the thing three retained caches are keyed on, so "which
 * records may keep their object" is exactly the rule that must have one audit rather than
 * two copies drifting apart.
 *
 * A record is reused only when the delta reports NO entry for its id, which is full
 * structural equality of the whole record. That is strictly stronger than any of the three
 * clauses of `definitionIndex`'s invalidation rule needs: a reused record's arrays are
 * byte-equivalent element by element, so a same-object array cannot hide a moved field.
 *
 * A `reordered` delta is REFUSED rather than merely documented against: a reordering is not
 * attributable per record, so there is nothing here to reuse and the corpus must be replaced
 * wholesale instead. Both callers already return before reaching this, so the throw is
 * unreachable in production — its job is to keep the single audit this function exists to
 * concentrate from being quietly widened by a third caller.
 *
 * `next` is CONSUMED — its values are rewritten in place, which is safe only because both
 * callers discard it immediately. `Map#set` on an existing key updates the value and keeps
 * the key's position, so `next`'s order survives that rewrite. The retained map is then
 * cleared and refilled in that order rather than patched key by key, because the persisted
 * array's order IS the map's insertion order: appending a mid-corpus insertion at the end
 * would leave the map ordered differently from storage, and the next save would replicate
 * that difference to every client as a broad, unattributable reordering.
 *
 * @param {Map<*, object>} retained The manager's live map, kept by identity.
 * @param {Map<*, object>} next The freshly hydrated corpus, in persisted order. Consumed.
 * @param {CorpusDelta} delta The delta between the two. Must not be `reordered`.
 * @throws {TypeError} When the delta is `reordered`.
 * @returns {void}
 */
export function patchCorpusInPlace(retained, next, delta) {
  if (delta.reordered) {
    throw new TypeError(
      'patchCorpusInPlace cannot patch a reordered delta: a reordering is attributable to no ' +
        'record, so the corpus must be replaced wholesale instead.'
    );
  }
  for (const [id] of next) {
    const previous = retained.get(id);
    if (previous !== undefined && !delta.perRecord.has(id)) next.set(id, previous);
  }
  retained.clear();
  for (const [id, record] of next) retained.set(id, record);
}

/**
 * Index a corpus by record id, or `null` when it cannot be indexed injectively.
 *
 * @param {object[]} records
 * @param {(record: object) => *} readId
 * @returns {Map<*, object>|null}
 */
function pairById(records, readId) {
  const byId = new Map();
  for (const record of records) {
    const id = readId(record);
    if (id == null || byId.has(id)) return null;
    byId.set(id, record);
  }
  return byId;
}

/**
 * A whole record arriving or leaving, whose every present field is part of the change.
 *
 * @param {'added'|'removed'} kind
 * @param {object|null} previous
 * @param {object|null} current
 * @returns {CorpusRecordDelta}
 */
function recordDelta(kind, previous, current) {
  const record = current ?? previous;
  const fields = isRecordObject(record) ? presentKeys(record).sort(byName) : [];
  return { kind, fields, before: previous, after: current };
}

/**
 * Field names in a stable order, so two reads of the same delta agree.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function byName(left, right) {
  return left.localeCompare(right);
}

/**
 * Whether a projected record can name its own changed fields.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isRecordObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The top-level keys two projected records disagree on, sorted for a stable read.
 *
 * @param {object} previous
 * @param {object} current
 * @returns {string[]}
 */
function changedFields(previous, current) {
  const keys = new Set([...presentKeys(previous), ...presentKeys(current)]);
  const fields = [];
  for (const key of keys) {
    if (!jsonEquals(previous[key], current[key])) fields.push(key);
  }
  return fields.sort(byName);
}

/**
 * Whether the records present in BOTH corpora appear in a different relative order.
 *
 * Filtering to the common ids first is what keeps an insertion or a deletion from reading as
 * a reordering: appending a record, or removing one from the middle, leaves every surviving
 * record in the same relative order and is fully attributable per record.
 *
 * @param {Map<*, object>} leftById
 * @param {Map<*, object>} rightById
 * @returns {boolean}
 */
function commonOrderDiffers(leftById, rightById) {
  const leftCommon = [...leftById.keys()].filter((id) => rightById.has(id));
  const rightCommon = [...rightById.keys()].filter((id) => leftById.has(id));
  return leftCommon.some((id, index) => rightCommon[index] !== id);
}
