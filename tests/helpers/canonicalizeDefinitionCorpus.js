/**
 * The pinned, versioned canonical form for a crafting-definition corpus (issue 1080).
 *
 * ADR 0001's domain-level equivalence criterion is that, for each fixture world,
 * `JSON.stringify(canonicalize(manager.getRecipes()))` is byte-identical when loaded from
 * the legacy single-array backend and from the migrated per-record backend. That criterion
 * is only meaningful if `canonicalize` is committed rather than improvised per test, which
 * is what this module is — and why it carries {@link CANONICAL_FORM_VERSION}. Storage
 * bytes will and should differ; this asserts at the DOMAIN level.
 *
 * It lives in `tests/helpers/` because it is a comparison tool, not shipped behaviour.
 * `tests/helpers/` sits outside the `npm test` glob; the exercising suite is
 * `tests/per-record-definition-repository.test.js`.
 *
 * ## Four rules, and the one that needed a decision
 *
 * 1. **Recursive key order.** Every object is rebuilt with its keys sorted, so a
 *    normalizer that emits the same fields in a different order compares equal.
 * 2. **The top-level corpus is sorted by record id.** This is the ONLY ordering the two
 *    backends genuinely disagree about: the legacy array is in the manager map's insertion
 *    order, while the per-record collection arrives in `_id` byte order on one client and
 *    insertion order on another. Corpus order is not semantic, so it is imposed.
 * 3. **Nested array order is PRESERVED, never sorted.** This is a deliberate narrowing of
 *    "arrays sorted by id". Nested order in this domain is authored and semantic — result
 *    groups are stages, ingredient options are offered in order — and both backends hold
 *    the identical serialized record, so nested order cannot differ for a reason the
 *    criterion cares about. Sorting it would HIDE a real nested-reordering regression
 *    while proving nothing, so the canonical form declines to.
 * 4. **Machine-minted ids are renumbered positionally and reference-preservingly.** Two
 *    migrations mint `crypto.randomUUID()` values (`migrateEssencesToIngredientGroups.js`
 *    for a converted essence group, `migrateLegacyResolutionModes.js` for a rebuilt result
 *    group), so a corpus migrated twice is unequal to itself before anything else is
 *    compared. Every such id is replaced by `minted-NNNN` in first-encounter order over
 *    the canonical traversal, and the SAME id gets the SAME placeholder everywhere it
 *    appears — so a reference from elsewhere in the corpus still resolves to its target,
 *    and a broken reference still fails to.
 *
 * ## What it deliberately does NOT normalize
 *
 * `null` is preserved and is NOT conflated with an absent key. Both backends store their
 * value through the same JSON round trip, so `null`-versus-absent cannot differ for a
 * storage reason — it can only differ because a normalizer behaved differently on the two
 * load paths, which is precisely the class of defect this comparison exists to catch.
 * {@link canonicalizeDefinitionCorpus} takes `treatNullAsAbsent` for a caller that has
 * proven a benign divergence and wants to look past it; turning it on hides that class.
 */

/**
 * Bump when any rule above changes. A canonical form is only a baseline if the comparison
 * can say WHICH form two sides were compared under.
 */
export const CANONICAL_FORM_VERSION = 1;

/**
 * `crypto.randomUUID()` output: RFC 4122 version 4, variant 1. Both machine-minting call
 * sites use it, and no authored Fabricate id has this shape (recipe, component, tool and
 * recipe-item ids are `foundry.utils.randomID()` 16-character alphanumerics or
 * user-authored slugs), so matching on the shape cannot capture an authored id.
 */
export const MACHINE_MINTED_ID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

/**
 * Codepoint order, not locale order. `localeCompare` collates differently per ICU build,
 * which would make a canonical form machine-dependent.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function _byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** @param {any} value @returns {boolean} */
function _isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Walk a value in canonical order (object keys sorted, arrays in source order) and record
 * every machine-minted id in first-encounter order.
 *
 * The walk is separate from the emit pass because the placeholder assignment must be
 * POSITIONAL — determined by where an id first appears, not by the random value itself —
 * and because the same id must map to one placeholder wherever it recurs.
 *
 * @param {any} value
 * @param {Map<string, string>} minted
 */
function _collectMintedIds(value, minted) {
  if (typeof value === 'string') {
    if (MACHINE_MINTED_ID_PATTERN.test(value) && !minted.has(value)) {
      minted.set(value, `minted-${String(minted.size + 1).padStart(4, '0')}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) _collectMintedIds(entry, minted);
    return;
  }
  if (_isPlainObject(value)) {
    for (const key of Object.keys(value).sort(_byCodePoint)) _collectMintedIds(value[key], minted);
  }
}

/**
 * @param {number} value
 * @returns {number|null} `-0` flattened to `0`, and a non-finite number to `null` — which
 *   is what `JSON.stringify` would have done anyway, made explicit so the canonical form
 *   is the same whether it is compared as a structure or as JSON.
 */
function _canonicalNumber(value) {
  if (!Number.isFinite(value)) return null;
  return value === 0 ? 0 : value;
}

/**
 * @param {any} value
 * @param {{minted: Map<string, string>, treatNullAsAbsent: boolean}} context
 * @returns {any}
 */
function _canonicalValue(value, context) {
  if (typeof value === 'string') return context.minted.get(value) ?? value;
  if (typeof value === 'number') return _canonicalNumber(value);
  if (Array.isArray(value)) {
    // Source order, deliberately — see rule 3. `undefined` inside an array is `null` in
    // JSON, and is made `null` here so structure and JSON agree.
    return value.map((entry) => (entry === undefined ? null : _canonicalValue(entry, context)));
  }
  if (_isPlainObject(value)) {
    const canonical = {};
    for (const key of Object.keys(value).sort(_byCodePoint)) {
      const entry = value[key];
      if (entry === undefined) continue;
      if (entry === null && context.treatNullAsAbsent) continue;
      canonical[key] = _canonicalValue(entry, context);
    }
    return canonical;
  }
  return value;
}

/**
 * @param {any} record
 * @returns {string}
 */
function _recordSortKey(record) {
  return String(record?.id ?? '');
}

/**
 * Canonicalize a definition corpus for domain-level equivalence comparison.
 *
 * @param {Iterable<object>} records The corpus as a manager returns it — `getRecipes()`,
 *   `getSystems()`, or the equivalent.
 * @param {object} [options]
 * @param {(record: object) => object} [options.normalizeRecord] Applied to each record
 *   before canonicalization. Components must canonicalize through the manager's own
 *   `_normalizeComponent`, which is a whitelist rebuild — a local approximation of it would
 *   compare fields the real load path drops.
 * @param {boolean} [options.treatNullAsAbsent=false] Conflate `null` with an absent key.
 *   Off by default; see the module documentation for what turning it on hides.
 * @returns {{ version: number, records: object[] }} The canonical form, version-stamped so
 *   two sides cannot be compared under different rules without noticing.
 */
export function canonicalizeDefinitionCorpus(records, options = {}) {
  const { normalizeRecord = (record) => record, treatNullAsAbsent = false } = options;
  const prepared = [...records].map((record) => normalizeRecord(record));
  const ordered = prepared
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const leftKey = _recordSortKey(left.record);
      const rightKey = _recordSortKey(right.record);
      if (leftKey === rightKey) return left.index - right.index;
      return leftKey < rightKey ? -1 : 1;
    })
    .map((entry) => entry.record);

  const minted = new Map();
  for (const record of ordered) _collectMintedIds(record, minted);

  const context = { minted, treatNullAsAbsent };
  return {
    version: CANONICAL_FORM_VERSION,
    records: ordered.map((record) => _canonicalValue(record, context)),
  };
}

/**
 * The comparison the acceptance criterion is stated in: the canonical form as JSON.
 *
 * @param {Iterable<object>} records
 * @param {object} [options] See {@link canonicalizeDefinitionCorpus}.
 * @returns {string}
 */
export function canonicalDefinitionCorpusJson(records, options = {}) {
  return JSON.stringify(canonicalizeDefinitionCorpus(records, options));
}
