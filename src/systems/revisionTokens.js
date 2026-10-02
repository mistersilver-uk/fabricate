/**
 * The revision-token contract for crafting definitions (issue 1076; `data-models/spec.md`
 * § Revision Tokens): only the two managers mint, and consumers compare with `===`. Every mutation
 * advances the entity scope (`recipes`, `systems`), the owning system's scope and each moved
 * `facts:<invalidation domain>:<systemId>` scope; a moved recipe advances both systems'. A token is
 * a per-process counter from `0`, never persisted or replicated, because a counter cannot report
 * "unchanged" for a change the way a hash or a clock can. `corpusChanged` and `corpusDelta`
 * replace `JSON.stringify`-ing the corpus on every reload; a replicated setting arrives as freshly
 * parsed objects, so `corpusDelta` names what moved and lets a reload reuse the records it proved
 * unchanged, the identity retained indexes key on. Nothing weaker than record-level structural
 * equality licenses that reuse (clause 3 of `definitionIndex`'s invalidation rule).
 */

/** Canonical scope names; a hand-composed string that differs silently never invalidates. */
export const REVISION_SCOPES = Object.freeze({
  /** Every recipe in the world. */
  recipes: 'recipes',
  /** Every crafting system in the world. */
  systems: 'systems',
  /** The recipes of one crafting system. */
  recipesOfSystem: (systemId) => `recipes:${systemId ?? ''}`,
  /** One system's own definitions: components, tools, essences and recipe items. */
  system: (systemId) => `system:${systemId ?? ''}`,
  /**
   * One invalidation domain's facts in one system. `factClass` is not validated: a typo is a scope
   * nobody advances, never a wrong answer.
   */
  facts: (factClass, systemId) => `facts:${factClass ?? ''}:${systemId ?? ''}`,
});

/** Per-manager counters, never a module singleton: two managers in one process must not share. */
export class RevisionRegistry {
  constructor() {
    this._tokens = new Map();
  }

  /** The scope's current token, `0` when nothing has advanced it. */
  read(scope) {
    return this._tokens.get(scope) ?? 0;
  }

  /** Advance every scope named, skipping a nullish one; a mutation passes all it affects. */
  advance(...scopes) {
    for (const scope of scopes) {
      if (scope == null) continue;
      this._tokens.set(scope, this.read(scope) + 1);
    }
  }

  /** Whether a token read earlier is current; a never-read (non-number) token is not. */
  isCurrent(scope, token) {
    return typeof token === 'number' && token === this.read(scope);
  }
}

/**
 * Short-circuiting deep equality with `JSON.stringify` semantics: `undefined` and function values
 * are absent and two `NaN`s are equal (both serialize to `null`); everything else is `Object.is`.
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

/** The own enumerable keys `JSON.stringify` would emit. */
function presentKeys(value) {
  return Object.keys(value).filter((key) => {
    const entry = value[key];
    return entry !== undefined && typeof entry !== 'function';
  });
}

/**
 * Whether two corpora differ, without serializing either. Order is significant (the persisted
 * array's order is the map's insertion order), a reference-equal record is skipped, and it stops
 * at the first difference. `project` maps a record to its comparable form (`toJSON()` for recipes).
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
 * Which records changed, for `reload()`, which walks the whole corpus anyway (`corpusChanged`
 * stays the cheap boolean). It pairs by record id, never by index, so one insertion does not mark
 * the whole tail changed. It answers `{ changed, reordered, perRecord }`: `perRecord` maps each
 * changed id (in `before` order, then ids only `after` holds) to `{ kind, fields, before, after }`,
 * carrying the projected records and their sorted differing top-level keys. `fields` is every
 * present key for an `added` or `removed` record, and EMPTY for a changed non-plain-object
 * projection, which means "everything". A pure reordering, or a corpus with a nullish or duplicate
 * id, is `reordered` with an empty `perRecord`, and every consumer routes it broadly.
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
 * Freeze the delta and replace `perRecord`'s mutators, since a consumer deleting an entry would
 * license `patchCorpusInPlace` to reuse a record the delta reported changed.
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
 * Apply a delta to the manager's live map, keeping the map object and every record the delta
 * reported unchanged (full structural equality, stronger than `definitionIndex` needs). A
 * `reordered` delta throws, keeping this the single reuse audit. `next` is consumed: its values are
 * rewritten in place, then the map is refilled in `next`'s order, since the persisted array's order
 * IS the map's insertion order and an appended insertion would replicate as a reordering.
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

/** A corpus indexed by record id, or `null` when it cannot be indexed injectively. */
function pairById(records, readId) {
  const byId = new Map();
  for (const record of records) {
    const id = readId(record);
    if (id == null || byId.has(id)) return null;
    byId.set(id, record);
  }
  return byId;
}

/** A whole record arriving or leaving, every present field part of the change. */
function recordDelta(kind, previous, current) {
  const record = current ?? previous;
  const fields = isRecordObject(record) ? presentKeys(record).sort(byName) : [];
  return { kind, fields, before: previous, after: current };
}

/** A stable field order, so two reads of one delta agree. */
function byName(left, right) {
  return left.localeCompare(right);
}

/** Whether a projected record can name its own changed fields. */
function isRecordObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The top-level keys two projected records disagree on, sorted. */
function changedFields(previous, current) {
  const keys = new Set([...presentKeys(previous), ...presentKeys(current)]);
  const fields = [];
  for (const key of keys) {
    if (!jsonEquals(previous[key], current[key])) fields.push(key);
  }
  return fields.sort(byName);
}

/**
 * Whether the ids both corpora hold appear in a different relative order; filtering to them first
 * keeps an insertion or a deletion from reading as a reordering.
 */
function commonOrderDiffers(leftById, rightById) {
  const leftCommon = [...leftById.keys()].filter((id) => rightById.has(id));
  const rightCommon = [...rightById.keys()].filter((id) => leftById.has(id));
  return leftCommon.some((id, index) => rightCommon[index] !== id);
}
