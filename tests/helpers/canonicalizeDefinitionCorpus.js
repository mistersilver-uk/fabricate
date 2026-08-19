/**
 * The identity-PROVENANCE oracle for a crafting-definition corpus (issues 1080, 1233, 1261).
 *
 * **Read this header before deleting this file.** It was built as ADR 0001's backend
 * equivalence criterion — canonicalize a corpus loaded through the whole-array backend and
 * through the per-record one and compare the two byte for byte — and issue 1261 removed the
 * second backend, which reads as removing this module's purpose. It does not. What this
 * canonical form actually pins is the **authored-versus-hydrate-minted identity
 * distinction** across the eight model call sites named below, and that distinction is
 * arrangement-independent, load-bearing for referential integrity and durable identity, and
 * guarded nowhere else. Its stated purpose is therefore restated here rather than left as a
 * description of a comparison that can no longer be run.
 *
 * The form is committed rather than improvised per test, which is why it carries
 * {@link CANONICAL_FORM_VERSION}. Storage bytes will and should differ from it; it asserts
 * at the DOMAIN level.
 *
 * It lives in `tests/helpers/` because it is a comparison tool, not shipped behaviour.
 * `tests/helpers/` sits outside the `npm test` glob; the exercising suite is
 * `tests/canonical-definition-corpus.test.js`.
 *
 * ## The load path invents identity, and shape cannot tell you which
 *
 * Hydrating a stored record is not a pure read. Eight model call sites mint an id when the
 * stored bytes carry none — `IngredientSet.js:144` and `:210` (the flat-`ingredients`
 * PERMANENT INBOUND SHIM), `IngredientGroup.js:8`, `Recipe.js:154`, `:820`, `:850` and
 * `:904`, and `Result.js:7` — and every one of them calls `foundry.utils.randomID()`, whose
 * output is a 16-character alphanumeric: **the same shape an authored recipe, component,
 * tool or `recipeItemDefinition` id has**. So a legacy-shaped record canonicalized twice
 * from the SAME stored bytes produced two different strings under v1, and neither of the
 * two obvious repairs works:
 *
 * - Widening the id pattern to `/^[a-zA-Z0-9]{16}$/` swallows every authored id too, which
 *   is precisely the identity the referential-integrity and durable-identity checks exist
 *   to verify. The instrument would go deterministic by going blind.
 * - Excluding legacy-shaped fixtures forces the acceptance away from the only shape the
 *   conversion exists to handle.
 *
 * The distinction that has to be made is **authored identity versus hydrate-minted
 * identity**, and since the two share a shape it cannot be made by shape. It cannot be made
 * by position either: `ingredientGroups[0].id` is authored in a migrated record and minted
 * in a legacy one. What actually separates them is PROVENANCE — an authored id is in the
 * stored bytes and a hydrate-minted one is not — and provenance is only observable by
 * handing the canonical form the bytes the corpus was hydrated from. That is what
 * `storedRecords` is. It needs no production change: the shim is deliberate and permanent,
 * and the missing information was never in the hydrated object to begin with.
 *
 * ## The rules
 *
 * 1. **Recursive key order.** Every object is rebuilt with its keys sorted, so a
 *    normalizer that emits the same fields in a different order compares equal.
 * 2. **The top-level corpus is sorted by AUTHORED record id.** Corpus order is not semantic
 *    (`data-models/spec.md` § Destructive Pass Safety), and the whole-array corpus arrives in
 *    the manager map's insertion order, so an order is imposed rather than inherited.
 *    A record whose own id was minted at hydrate (or is missing) has no stable key to sort
 *    on, so those records sort AFTER the authored ones in input order — sorting them by the
 *    random value would reintroduce the non-determinism this form exists to remove.
 * 3. **Nested array order is PRESERVED, never sorted.** This is a deliberate narrowing of
 *    "arrays sorted by id". Nested order in this domain is authored and semantic — result
 *    groups are stages, ingredient options are offered in order — and both backends hold
 *    the identical serialized record, so nested order cannot differ for a reason the
 *    criterion cares about. Sorting it would HIDE a real nested-reordering regression
 *    while proving nothing, so the canonical form declines to.
 * 4. **Hydrate-minted identity is renumbered positionally and reference-preservingly;
 *    authored identity is preserved VERBATIM.** An id is hydrate-minted when it does not
 *    appear anywhere in `storedRecords` AND it is found where the model layer MINTS — at an
 *    `id` key ({@link MINTING_KEYS}), which is where all eight `randomID()` call sites
 *    assign. Every such id is replaced by `minted-NNNN` in first-encounter order over the
 *    canonical traversal, and the SAME id gets the SAME placeholder everywhere it appears,
 *    including at reference positions — so a reference from elsewhere in the corpus still
 *    resolves to its target, and a broken reference still fails to. Anything present in the
 *    stored bytes is authored by definition and is never renumbered, so every recipe,
 *    component, tool, `recipeItemDefinition`, `craftingSystemId` and durable-identity flag
 *    leaf survives into the comparison unchanged.
 *
 *    The `id`-position restriction is load-bearing rather than tidy. `CORE_ID_PATTERN` is
 *    "16 alphanumerics", which ordinary strings satisfy by accident — `craftingModifier` is
 *    a 16-character FIELD NAME, and a 16-character recipe name would qualify too. Deciding
 *    provenance for every string in the corpus would therefore renumber structure and prose
 *    as if it were identity. Deciding it only where an id can be minted is what keeps the
 *    rule about identity.
 *
 *    COLLECTION is restricted that way; SUBSTITUTION is not. A minted id is recorded only at
 *    a {@link MINTING_KEYS} position, but once recorded it is substituted wherever the same
 *    string recurs — which is what makes a reference resolve to its target. The rule is
 *    therefore complete only while a minted id is always serialized at its own `id` key
 *    ALONGSIDE the references to it: a minted-shaped value appearing ONLY at a non-`id` key
 *    would never be collected and would be emitted verbatim, i.e. non-deterministically.
 *    Two facts make that unreachable, and `tests/canonical-definition-corpus.test.js` pins
 *    BOTH by scanning `src/models/`, because either one alone leaves the rule half-guarded:
 *    every `randomID()` call site assigns to `id`, and no `*_OMITTED_WHEN_DEFAULT`
 *    serialization table makes `id` omittable, so the defining occurrence is always emitted.
 *
 *    Two migrations also mint `crypto.randomUUID()` values on the load path
 *    (`migrateEssencesToIngredientGroups.js` for a converted essence group,
 *    `migrateLegacyResolutionModes.js` for a rebuilt result group). Provenance covers them
 *    with no shape special case: before the migration result is persisted the uuid is
 *    absent from the stored bytes and is renumbered; afterwards it IS the stored bytes and
 *    is compared verbatim. A uuid needs no `id`-position restriction — nothing in this
 *    domain is authored or named in that shape — so it is collected wherever it appears.
 * 5. **A `metadata` block that is not in the stored bytes was stamped at hydrate.**
 *    `Recipe.js:244-249` rebuilds an absent block wholesale from `Date.now()` twice and
 *    `game.user.name`, so two loads a millisecond apart diverge for no defect. It is
 *    all-or-nothing (`data.metadata || {…}`), and a stored block is passed through
 *    untouched, so the block is replaced by {@link HYDRATE_STAMPED_METADATA} exactly when
 *    its structure does not appear at a `metadata` key in `storedRecords`. A STORED
 *    `metadata` block is domain data and is compared in full — a conversion that drops one
 *    still reddens.
 *
 *    That match is corpus-GLOBAL and STRUCTURAL: the stored blocks are collected from
 *    anywhere in `storedRecords`, so a block that was in fact stamped at hydrate is compared
 *    in full rather than replaced whenever it happens to structurally equal a stored block on
 *    some OTHER record. Reaching it needs a frozen clock and a `game.user.name` equal to the
 *    stored author, so it is effectively test-only; and it fails toward comparing MORE than
 *    the rule intends, which reddens spuriously rather than passing falsely. Narrowing the
 *    match to the record it was read from is the fix if a real corpus ever hits it.
 *
 *    That is the only clock- or environment-derived default in the model layer;
 *    `tests/canonical-definition-corpus.test.js` pins the set of `Date.now()` and
 *    `randomID()` hydrate defaults under `src/models/` so a new one cannot be added without
 *    this rule list being revisited.
 *
 * ## Provenance is stamped, because the degraded mode is not deterministic
 *
 * Without `storedRecords` the form falls back to v1's rule 4 — only the `crypto.randomUUID()`
 * shape is treated as minted — and it is therefore NOT deterministic over a corpus that
 * mints `randomID()` ids or stamps `metadata` on the load path. That mode is still useful
 * for a corpus of hand-built literals with no hydration behind it, so it is kept rather than
 * refused, but the returned form carries `provenance: 'shape' | 'stored'` so a form built
 * under one mode cannot be compared with a form built under the other without the JSON
 * differing loudly on the first field.
 *
 * ## Omitting bytes is permitted; supplying bytes that describe nothing is REFUSED
 *
 * Those two are not the same mistake and are deliberately not treated the same way.
 *
 * A caller that OMITS `storedRecords` (or passes `null`) has said it holds no bytes, and gets
 * the degraded mode, stamped `provenance: 'shape'` so nobody can mistake it for the other
 * one. A caller that SUPPLIES bytes has asserted those bytes are what the corpus was
 * hydrated from, and the `'stored'` stamp attests to that. Empty or unrelated bytes break the
 * assertion while still earning the stamp: with no stored strings, EVERY `CORE_ID_PATTERN`
 * string at an `id` key classifies as hydrate-minted, so the whole identity graph collapses
 * to `minted-NNNN` placeholders, rule 2's imposed order is gone (no record has an authored
 * key), and two corpora that differ by real identity loss compare EQUAL under a reassuring
 * `provenance: 'stored'`. That is the exact failure this form exists to prevent: deterministic
 * because it discards everything.
 *
 * It is reachable by ordinary sequencing rather than by carelessness. Once a forward
 * conversion has retired the pre-conversion setting, `ClientSettings#get` serves the
 * registered `[]` default silently, so "read the pre-conversion bytes" run at the wrong point
 * in an acceptance yields `storedRecords: []` and a comparison that measures nothing.
 * {@link canonicalizeDefinitionCorpus} therefore throws in that case, in the same spirit as
 * {@link _refuseMintedKey}: a quietly wrong form is worse than no form.
 *
 * ## Id churn: the stated position
 *
 * - **Stored id churn IS detected.** Any id in the stored bytes is compared verbatim, so a
 *   conversion that re-mints, renumbers or drops a persisted id reddens. v1 could not say
 *   this: it renumbered every uuid regardless of provenance and so hid exactly that.
 * - **A conversion that DROPS a stored id and lets the load path mint a replacement at the
 *   same structural position IS detected**, because one side compares a literal and the
 *   other a `minted-NNNN` placeholder.
 * - **Hydrate-minted id churn is deliberately OUTSIDE what equivalence means here.** A value
 *   the load path invents per load is not domain data: it differs on every hydrate of the
 *   same bytes, so requiring it to be stable would make the instrument permanently red.
 *   Two corpora that differ ONLY by which random value was invented at the same structural
 *   position therefore compare EQUAL, by construction and on purpose. A later reader should
 *   not assume coverage there.
 *
 * ## What it deliberately does NOT normalize
 *
 * `null` is preserved and is NOT conflated with an absent key. Both backends store their
 * value through the same JSON round trip, so `null`-versus-absent cannot differ for a
 * storage reason — it can only differ because a normalizer behaved differently on the two
 * load paths, which is precisely the class of defect this comparison exists to catch.
 * {@link canonicalizeDefinitionCorpus} takes `treatNullAsAbsent` for a caller that has
 * proven a benign divergence and wants to look past it; turning it on hides that class.
 *
 * A per-record migration stamp, if issue 1211 introduces one, needs a rule here too:
 * written by the conversion rather than by the author, it is not in the pre-conversion
 * stored bytes, so every "identical canonical output" assertion would compare stamps
 * instead of domain data. Rule 5 is the shape such an exclusion should take.
 *
 * ## Version history
 *
 * - **1** (issue 1080) — rules 1-3, plus a `crypto.randomUUID()`-shaped rule 4.
 * - **2** (issue 1233) — rule 4 becomes provenance-based and covers `foundry.utils.randomID()`
 *   minting; rule 5 (hydrate-stamped `metadata`) added; rule 2 no longer sorts on a minted
 *   record id; `provenance` added to the emitted form; a minted id used as an object KEY is
 *   now refused rather than silently non-deterministic, as are supplied `storedRecords` that
 *   cannot describe the corpus.
 */

/**
 * Bump when any rule above changes. A canonical form is only a baseline if the comparison
 * can say WHICH form two sides were compared under.
 */
export const CANONICAL_FORM_VERSION = 2;

/**
 * `foundry.utils.randomID()` / `Document.createNewId()` output, and the same pattern
 * `DocumentIdField` validates against. Authored Fabricate ids (recipe, component, tool,
 * recipe-item) have this shape — and so does every id the model layer mints at hydrate,
 * which is why matching on it decides NOTHING on its own. See rule 4.
 */
export const CORE_ID_PATTERN = /^[a-zA-Z0-9]{16}$/;

/**
 * The object keys the model layer assigns a minted id to. All eight `randomID()` call sites
 * under `src/models/` write `id`, which `tests/canonical-definition-corpus.test.js` pins by
 * scanning the tree — so this is the complete set of positions where a `CORE_ID_PATTERN`
 * string can be identity rather than an accident of length. See rule 4.
 */
export const MINTING_KEYS = new Set(['id']);

/**
 * `crypto.randomUUID()` output: RFC 4122 version 4, variant 1. The two load-path migrations
 * mint with it.
 */
export const UUID_V4_ID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

/**
 * Replaces a `metadata` block the load path stamped from the clock and the current user
 * rather than read from storage. See rule 5.
 */
export const HYDRATE_STAMPED_METADATA = '<hydrate-stamped-metadata>';

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
 * A context that substitutes nothing, used to compare a hydrated `metadata` block with the
 * stored blocks by STRUCTURE alone (rule 5) — the two sides must be reduced by the same
 * rules, and neither side may depend on the minted-id numbering that has not been computed
 * yet when the stored side is read.
 */
const INERT_CONTEXT = { minted: new Map(), treatNullAsAbsent: false, storedMetadata: null };

/**
 * @param {object} value
 * @returns {string} The value's canonical JSON under substitution-free rules.
 */
function _structuralKey(value) {
  return JSON.stringify(_canonicalValue(value, INERT_CONTEXT));
}

/**
 * Record every string the STORED bytes contain — values and object keys alike, because a
 * durable identity flag keys its map by `systemId` (`flags.fabricate.roles[systemId]`) and
 * an essence requirement keys its map by essence id, so an id can be authored identity
 * while never appearing as a value. Also record the structure of every stored `metadata`
 * block, for rule 5.
 *
 * @param {any} value
 * @param {{strings: Set<string>, metadata: Set<string>}} identity
 */
function _collectStoredIdentity(value, identity) {
  if (typeof value === 'string') {
    identity.strings.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) _collectStoredIdentity(entry, identity);
    return;
  }
  if (!_isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    identity.strings.add(key);
    if (key === 'metadata' && _isPlainObject(entry)) identity.metadata.add(_structuralKey(entry));
    _collectStoredIdentity(entry, identity);
  }
}

/**
 * @param {any} storedRecords The payload the corpus was hydrated FROM. Any iterable of
 *   stored records, or the parsed setting value itself.
 * @returns {{strings: Set<string>, metadata: Set<string>}|null} `null` for the degraded
 *   shape-only mode.
 */
function _buildStoredIdentity(storedRecords) {
  if (storedRecords === undefined || storedRecords === null) return null;
  const identity = { strings: new Set(), metadata: new Set() };
  const iterable =
    typeof storedRecords !== 'string' && typeof storedRecords[Symbol.iterator] === 'function';
  _collectStoredIdentity(iterable ? [...storedRecords] : storedRecords, identity);
  return identity;
}

/**
 * Whether a string found at `atMintingKey` (an {@link MINTING_KEYS} position) or anywhere
 * else is identity the load path invented rather than identity the author stored.
 *
 * @param {{strings: Set<string>}|null} storedIdentity
 * @returns {(value: string, atMintingKey: boolean) => boolean}
 */
function _mintedIdentityPredicate(storedIdentity) {
  if (!storedIdentity) return (value) => UUID_V4_ID_PATTERN.test(value);
  return (value, atMintingKey) => {
    if (storedIdentity.strings.has(value)) return false;
    if (UUID_V4_ID_PATTERN.test(value)) return true;
    return atMintingKey && CORE_ID_PATTERN.test(value);
  };
}

/**
 * Walk a value in canonical order (object keys sorted, arrays in source order) and record
 * every hydrate-minted id in first-encounter order.
 *
 * The walk is separate from the emit pass because the placeholder assignment must be
 * POSITIONAL — determined by where an id first appears, not by the random value itself —
 * and because the same id must map to one placeholder wherever it recurs, including at the
 * reference positions this pass deliberately does not collect from.
 *
 * @param {any} value
 * @param {Map<string, string>} minted
 * @param {(value: string, atMintingKey: boolean) => boolean} isMinted
 * @param {boolean} [atMintingKey=false] Whether `value` sits at an {@link MINTING_KEYS} key.
 */
function _collectMintedIds(value, minted, isMinted, atMintingKey = false) {
  if (typeof value === 'string') {
    if (isMinted(value, atMintingKey) && !minted.has(value)) {
      minted.set(value, `minted-${String(minted.size + 1).padStart(4, '0')}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) _collectMintedIds(entry, minted, isMinted, atMintingKey);
    return;
  }
  if (!_isPlainObject(value)) return;
  for (const key of Object.keys(value).sort(_byCodePoint)) {
    _collectMintedIds(value[key], minted, isMinted, MINTING_KEYS.has(key));
  }
}

/**
 * @param {string} key
 * @param {any} entry
 * @param {{minted: Map<string, string>, treatNullAsAbsent: boolean,
 *   storedMetadata: Set<string>|null}} context
 * @returns {any}
 */
function _canonicalMember(key, entry, context) {
  if (key === 'metadata' && context.storedMetadata !== null && _isPlainObject(entry)) {
    return context.storedMetadata.has(_structuralKey(entry))
      ? _canonicalValue(entry, context)
      : HYDRATE_STAMPED_METADATA;
  }
  return _canonicalValue(entry, context);
}

/**
 * @param {any} value
 * @param {{minted: Map<string, string>, treatNullAsAbsent: boolean,
 *   storedMetadata: Set<string>|null}} context
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
      _refuseMintedKey(key, context);
      const entry = value[key];
      if (entry === undefined) continue;
      if (entry === null && context.treatNullAsAbsent) continue;
      canonical[key] = _canonicalMember(key, entry, context);
    }
    return canonical;
  }
  return value;
}

/**
 * A minted id used as an object KEY is REFUSED rather than renumbered. The traversal order
 * that assigns placeholders is itself keyed on the sorted key list, so a random key would
 * make the numbering depend on the random value and the form would be quietly
 * non-deterministic again — the exact defect this version exists to remove. No map in this
 * domain is keyed by minted identity (`flags.fabricate.roles` is keyed by the AUTHORED
 * system id, `essences` by the authored essence id); if one appears, this rule has to be
 * designed rather than inherited.
 *
 * @param {string} key
 * @param {{minted: Map<string, string>}} context
 */
function _refuseMintedKey(key, context) {
  if (!context.minted.has(key)) return;
  throw new Error(
    `canonicalizeDefinitionCorpus: "${key}" is hydrate-minted identity used as an object KEY, ` +
      'which would make the placeholder numbering depend on the random value. ' +
      'The canonical form has no rule for that shape; design one before adding such a map.'
  );
}

/**
 * @param {any} record
 * @param {(value: string, atMintingKey: boolean) => boolean} isMinted
 * @returns {string|null} The record's AUTHORED id, or `null` when it has none to sort on.
 */
function _authoredRecordKey(record, isMinted) {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return null;
  return isMinted(id, true) ? null : id;
}

/**
 * Refuse SUPPLIED `storedRecords` that cannot describe the corpus they are supplied for.
 *
 * The check is "no record's own id is authored" rather than "the byte set is empty", because
 * the two failures that matter — an empty payload and a payload read from the wrong key or
 * the wrong world — both land there, and both leave every id in the corpus classified as
 * hydrate-minted. An empty string set is called out separately in the message only because it
 * names a different mistake than a mismatched one.
 *
 * OMITTING `storedRecords` is not this case and is not refused: it selects the documented
 * degraded `provenance: 'shape'` mode, which a hand-built literal corpus with no hydration
 * behind it legitimately wants. An EMPTY corpus is not this case either — there is nothing
 * for the bytes to describe, so `canonicalizeDefinitionCorpus([], {storedRecords: []})` is
 * consistent rather than undescriptive.
 *
 * @param {{key: string|null}[]} entries Prepared records with their authored sort keys.
 * @param {{strings: Set<string>}|null} storedIdentity
 */
function _refuseUndescriptiveStoredIdentity(entries, storedIdentity) {
  if (!storedIdentity || entries.length === 0) return;
  if (storedIdentity.strings.size > 0 && entries.some((entry) => entry.key !== null)) return;
  throw new Error(
    'canonicalizeDefinitionCorpus: storedRecords was supplied but describes none of the ' +
      `${entries.length} record(s) in the corpus — it holds ${storedIdentity.strings.size} ` +
      'string(s), and no record own-id appears among them. The usual cause is reading the ' +
      'stored bytes AFTER the conversion under test has already run, at which point the ' +
      'pre-conversion setting is gone and ClientSettings#get serves its registered [] default. ' +
      'Canonicalizing under those bytes would classify EVERY id as hydrate-minted, so real ' +
      'identity loss would compare equal under a provenance: "stored" stamp. Read the bytes ' +
      'before the conversion, or omit storedRecords to select the degraded "shape" mode.'
  );
}

/**
 * @param {{key: string|null, index: number}} left
 * @param {{key: string|null, index: number}} right
 * @returns {number}
 */
function _byRecordOrder(left, right) {
  if (left.key === null || right.key === null) {
    if (left.key === right.key) return left.index - right.index;
    return left.key === null ? 1 : -1;
  }
  if (left.key === right.key) return left.index - right.index;
  return _byCodePoint(left.key, right.key);
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
 * @param {any} [options.storedRecords] The payload `records` was hydrated FROM, as it came
 *   out of storage and BEFORE any model constructor ran (`JSON.parse` the raw setting value
 *   if you hold bytes). This is what separates authored identity from hydrate-minted
 *   identity; omitting it (or passing `null`) selects the degraded `provenance: 'shape'`
 *   mode, which is not deterministic over a corpus the model layer mints ids or stamps
 *   `metadata` for. SUPPLYING bytes that describe none of `records` — an empty payload, or
 *   one read from the wrong key — is REFUSED rather than stamped `'stored'`; see
 *   {@link _refuseUndescriptiveStoredIdentity}.
 * @param {boolean} [options.treatNullAsAbsent=false] Conflate `null` with an absent key.
 *   Off by default; see the module documentation for what turning it on hides.
 * @returns {{ version: number, provenance: string, records: object[] }} The canonical form,
 *   version- and provenance-stamped so two sides cannot be compared under different rules
 *   without noticing.
 * @throws {Error} When `storedRecords` is supplied but cannot describe a non-empty `records`,
 *   or when hydrate-minted identity is used as an object key.
 */
export function canonicalizeDefinitionCorpus(records, options = {}) {
  const {
    normalizeRecord = (record) => record,
    treatNullAsAbsent = false,
    storedRecords,
  } = options;

  const storedIdentity = _buildStoredIdentity(storedRecords);
  const isMinted = _mintedIdentityPredicate(storedIdentity);

  const prepared = [...records].map((record, index) => {
    const normalized = normalizeRecord(record);
    return { record: normalized, index, key: _authoredRecordKey(normalized, isMinted) };
  });
  _refuseUndescriptiveStoredIdentity(prepared, storedIdentity);
  const ordered = prepared.sort(_byRecordOrder).map((entry) => entry.record);

  const minted = new Map();
  for (const record of ordered) _collectMintedIds(record, minted, isMinted);

  const context = {
    minted,
    treatNullAsAbsent,
    storedMetadata: storedIdentity?.metadata ?? null,
  };
  return {
    version: CANONICAL_FORM_VERSION,
    provenance: storedIdentity ? 'stored' : 'shape',
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
