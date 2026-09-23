/**
 * The identity-PROVENANCE oracle for a crafting-definition corpus (issues 1080, 1233, 1261). The
 * distinction that has to be made is **authored identity versus hydrate-minted identity**, and
 * since the two share a shape it cannot be made by shape.
 */

/**
 * Bump when any rule above changes. A canonical form is only a baseline if the comparison
 * can say WHICH form two sides were compared under.
 */
export const CANONICAL_FORM_VERSION = 2;

/**
 * `foundry.utils.randomID()` / `Document.createNewId()` output, and the same pattern
 * `DocumentIdField` validates against.
 */
export const CORE_ID_PATTERN = /^[a-zA-Z0-9]{16}$/;

/** The object keys the model layer assigns a minted id to. */
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
 * Codepoint order, not locale order. `localeCompare` collates differently per ICU build, which
 * would make a canonical form machine-dependent.
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
 * Record every string the STORED bytes contain — values and object keys alike, because a durable
 * identity flag keys its map by `systemId` (`flags.fabricate.roles[systemId]`) and an essence
 * requirement keys its map by essence id, so an id can be authored identity while never appearing
 * as a value.
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
 * Whether a string found at `atMintingKey` (an {@link MINTING_KEYS} position) or anywhere else is
 * identity the load path invented rather than identity the author stored.
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
 * Walk a value in canonical order (object keys sorted, arrays in source order) and record every
 * hydrate-minted id in first-encounter order.
 *
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

/** A minted id used as an object KEY is REFUSED rather than renumbered. */
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
 * @param {{key: string|null}[]} entries Prepared records with their authored sort keys.
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
 * `getSystems()`, or the equivalent.
 * @param {(record: object) => object} [options.normalizeRecord] Applied to each record before
 * canonicalization. Components must canonicalize through the manager's own `_normalizeComponent`,
 * which is a whitelist rebuild — a local approximation of it would compare fields the real load
 * path drops.
 * @param {any} [options.storedRecords] The payload `records` was hydrated FROM, as it came out of
 * storage and BEFORE any model constructor ran (`JSON.parse` the raw setting value if you hold
 * bytes). This is what separates authored identity from hydrate-minted identity; omitting it (or
 * passing `null`) selects the degraded `provenance: 'shape'` mode, which is not deterministic over
 * a corpus the model layer mints ids or stamps `metadata` for. SUPPLYING bytes that describe none
 * of `records` — an empty payload, or one read from the wrong key — is REFUSED rather than stamped
 * `'stored'`; see {@link _refuseUndescriptiveStoredIdentity}.
 * @param {boolean} [options.treatNullAsAbsent=false] Conflate `null` with an absent key. Off by
 * default; see the module documentation for what turning it on hides.
 * @returns {{ version: number, provenance: string, records: object[] }} The canonical form,
 * version- and provenance-stamped so two sides cannot be compared under different rules without
 * noticing.
 * @throws {Error} When `storedRecords` is supplied but cannot describe a non-empty `records`, or
 * when hydrate-minted identity is used as an object key.
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
 * @param {object} [options] See {@link canonicalizeDefinitionCorpus}.
 */
export function canonicalDefinitionCorpusJson(records, options = {}) {
  return JSON.stringify(canonicalizeDefinitionCorpus(records, options));
}
