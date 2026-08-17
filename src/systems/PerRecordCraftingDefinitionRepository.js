import { FABRICATE_SETTINGS_NAMESPACE } from '../config/settings.js';

import { CraftingDefinitionRepository } from './CraftingDefinitionRepository.js';

/**
 * The {@link CraftingDefinitionRepository} adapter for ADR 0001's selected backend —
 * **B(1), one `world`-scoped `Setting` DOCUMENT per definition record**.
 *
 * Issue 1080 (-b). Behaviour-neutral on landing: `recipeStorageTarget` defaults to
 * `singleArray`, so nothing constructs this adapter yet. The conversion that starts
 * using it is -c; component extraction is -d.
 *
 * Four platform facts shape every line below, and each one was established against
 * Foundry source (13.351 and 14.365) during plan review rather than assumed. They are
 * recorded here because the obvious implementation violates all four.
 *
 * ## 1. `ClientSettings` is not usable for per-record keys
 *
 * `WorldSettings#getSetting` is a linear `find` over the world `Setting` collection with
 * no key index, and `ClientSettings.register` calls it — so registering N per-record keys
 * is O(N²) before a single record is read. This adapter therefore does not register, read
 * or write ANY per-record key through `game.settings`. It indexes the collection **once**
 * into a `Map<key, Setting>` and serves every subsequent read from that map at O(1), which
 * removes the O(N²) path and the per-record `onChange` hazard by construction.
 *
 * Only the two O(1) keys `recipeStorageLayout` and `recipeStorageTarget` are registered,
 * and they live in `src/config/settings.js` like every other Fabricate setting.
 *
 * ## 2. Writes go through the Document API, not `game.settings.set`
 *
 * ADR 0001 said "`game.settings` has no bulk write API at all, so B(1) cannot coalesce".
 * The first clause is true; the second does not follow. `Setting` is an ordinary primary
 * Document, so `Setting.implementation.createDocuments` / `updateDocuments` /
 * `deleteDocuments` exist on both versions and each is **one socket round trip and one
 * server-side atomic batch**. A 50-record write is one call per leg, not 50.
 *
 * `foundry.documents.modifyBatch` is deliberately NOT used: it is not a transaction (the
 * server dry-runs, then runs a second sequential loop that `break`s on first error keeping
 * everything already committed) and its client handler swallows per-operation errors into
 * a toast and resolves, so a compensation keyed on a rejection would silently never fire.
 *
 * **Flush order is pinned as a requirement, not an optimisation: creates, then updates,
 * then deletes.** A tear before the delete leg leaves records that should be gone still
 * present — stale but convergent. A tear *after* a delete leg would leave referents
 * destroyed while their referrers were never updated: silent referential corruption on a
 * world that looks fully converted next boot, with no detector. Ordering is what makes
 * that state unreachable.
 *
 * ## 3. `Setting` has no key uniqueness, so `_id` is derived from the key
 *
 * `_id` is the primary key; `key` is a plain `StringField` validated only for `>= 2`
 * dot-separated parts, with **no unique index at any layer**. An unconditional create
 * therefore mints a SECOND document carrying the same key, which `getSetting` never
 * returns and whose 339-byte envelope is never reclaimed — counting toward the very
 * connect-payload ceiling this backend is bounded by (≈4,160 documents).
 *
 * `keepId: true` on a primary document **silently overwrites**: the `_id`-exists guard is
 * `parent?.getEmbeddedCollection(...)?.has(_id)`, which is embedded-documents-only and so
 * unreachable on `Setting`, and the write is an unconditional put. That is exactly what
 * makes a create with a derived `_id` an idempotent **upsert** — see
 * {@link deriveSettingDocumentId} for the four constraints it carries.
 *
 * **Duplicates are never reaped.** An earlier revision of this plan collapsed duplicate
 * keys at index-build time and it was proved unsafe: "the first document for a key" is not
 * a global fact (`getSetting` finds in insertion order, while a client booting later
 * receives documents in `_id` byte order), so two clients nominate different keepers about
 * half the time and, if each deletes the other's, the key ends with ZERO documents. That
 * converts a recoverable envelope leak into silent loss of the record. This adapter
 * mirrors `getSetting`'s choice — first encountered wins — and deletes nothing.
 *
 * ## 4. Deletion removes the document
 *
 * `ClientSettings` has no delete and `set(key, null)` leaves the envelope forever, so a
 * world that created and deleted 4,160 recipes over its life would reach the ceiling
 * holding zero live recipes. {@link PerRecordCraftingDefinitionRepository#delete} issues
 * `deleteDocuments`, and the budget is stated against **documents in existence**, never
 * live records.
 *
 * ## Every call verifies what came back
 *
 * `createDocuments` can resolve with FEWER documents than requested — a `preCreateSetting`
 * hook returning `false` drops that one and lets the rest commit. Silently accepting the
 * shortfall is how a record goes missing with nothing raised, so every leg compares the
 * returned length against what it asked for and treats a shortfall as a failure. The index
 * is updated from the documents that DID land before the failure is raised, so the next
 * flush converges instead of re-creating what already exists.
 */

/** The `62^16` id space of a 16-character alphanumeric Foundry document id. */
const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 16;
const ID_SPACE = BigInt(ID_ALPHABET.length) ** BigInt(ID_LENGTH);

/**
 * The shape `DocumentIdField._validateType` enforces via `foundry.data.validators.isValidId`,
 * byte-identical on 13.351 and 14.365. A derived id that fails this is rejected at
 * validation, so it is asserted here rather than discovered in a live world.
 */
export const FOUNDRY_DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9]{16}$/;

/** The per-record key prefix for recipes: `fabricate.recipe.<id>`. */
export const RECIPE_RECORD_KEY_PREFIX = 'recipe.';

/**
 * Seed for {@link deriveSettingDocumentId}. Changing it re-derives every id, which on a
 * converted world means every record is re-created under a new document and every old
 * document is orphaned. It is a constant for that reason, not a tunable.
 */
const ID_HASH_SEED = 0x1a_80_10_80;

/**
 * 32-bit multiply that cannot lose precision the way `a * b` does above 2^53.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function _mul32(a, b) {
  return (((a & 0xff_ff) * b + ((((a >>> 16) * b) & 0xff_ff) << 16)) & 0xff_ff_ff_ff) >>> 0;
}

/**
 * @param {number} value
 * @param {number} bits
 * @returns {number}
 */
function _rotl32(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * MurmurHash3's 32-bit finalizer (avalanche).
 *
 * @param {number} value
 * @returns {number}
 */
function _fmix32(value) {
  let h = value >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = _mul32(h, 0x85_eb_ca_6b);
  h = (h ^ (h >>> 13)) >>> 0;
  h = _mul32(h, 0xc2_b2_ae_35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

const MURMUR_C1 = 0x23_9b_96_1b;
const MURMUR_C2 = 0xab_0e_97_89;
const MURMUR_C3 = 0x38_b3_4a_e5;
const MURMUR_C4 = 0xa1_e3_8b_93;

/**
 * @param {number} k
 * @param {number} c
 * @param {number} rotation
 * @param {number} cNext
 * @returns {number}
 */
function _mixKey(k, c, rotation, cNext) {
  return _mul32(_rotl32(_mul32(k, c), rotation), cNext);
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {number} the little-endian uint32 at `offset`.
 */
function _readUint32LE(bytes, offset) {
  return (
    ((bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) &
      0xff_ff_ff_ff) >>>
    0
  );
}

/**
 * The trailing `< 16` bytes assembled into four little-endian lanes.
 *
 * Written as an arithmetic lane index rather than the reference implementation's
 * fall-through `switch`, which `no-fallthrough` rejects and which is harder to read.
 *
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} length
 * @returns {number[]} four uint32 lanes.
 */
function _tailLanes(bytes, offset, length) {
  const lanes = [0, 0, 0, 0];
  for (let index = 0; index < length; index += 1) {
    const lane = index >> 2;
    lanes[lane] = (lanes[lane] | (bytes[offset + index] << (8 * (index & 3)))) >>> 0;
  }
  return lanes;
}

/**
 * MurmurHash3 x86 128-bit, over UTF-8 bytes.
 *
 * A real hash is a requirement rather than a preference here: the derived `_id` mechanism
 * is OVERWRITE, so a collision between two different keys silently destroys a record. A
 * truncation or a weak checksum would make that reachable; a 128-bit hash with full
 * avalanche puts it at ~1e-21 for a 10,000-record world.
 *
 * @param {Uint8Array} bytes
 * @param {number} seed
 * @returns {number[]} four uint32 lanes, most significant first.
 */
function _murmur3x86_128(bytes, seed) {
  let h1 = seed >>> 0;
  let h2 = seed >>> 0;
  let h3 = seed >>> 0;
  let h4 = seed >>> 0;
  const length = bytes.length;
  const blocks = length >> 4;

  for (let block = 0; block < blocks; block += 1) {
    const offset = block * 16;
    h1 = (h1 ^ _mixKey(_readUint32LE(bytes, offset), MURMUR_C1, 15, MURMUR_C2)) >>> 0;
    h1 = (_mul32((_rotl32(h1, 19) + h2) >>> 0, 5) + 0x56_1c_cd_1b) >>> 0;
    h2 = (h2 ^ _mixKey(_readUint32LE(bytes, offset + 4), MURMUR_C2, 16, MURMUR_C3)) >>> 0;
    h2 = (_mul32((_rotl32(h2, 17) + h3) >>> 0, 5) + 0x0b_ca_a7_47) >>> 0;
    h3 = (h3 ^ _mixKey(_readUint32LE(bytes, offset + 8), MURMUR_C3, 17, MURMUR_C4)) >>> 0;
    h3 = (_mul32((_rotl32(h3, 15) + h4) >>> 0, 5) + 0x96_cd_1c_35) >>> 0;
    h4 = (h4 ^ _mixKey(_readUint32LE(bytes, offset + 12), MURMUR_C4, 18, MURMUR_C1)) >>> 0;
    h4 = (_mul32((_rotl32(h4, 13) + h1) >>> 0, 5) + 0x32_ac_3b_17) >>> 0;
  }

  const tail = length & 15;
  const [k1, k2, k3, k4] = _tailLanes(bytes, blocks * 16, tail);
  if (tail > 12) h4 = (h4 ^ _mixKey(k4, MURMUR_C4, 18, MURMUR_C1)) >>> 0;
  if (tail > 8) h3 = (h3 ^ _mixKey(k3, MURMUR_C3, 17, MURMUR_C4)) >>> 0;
  if (tail > 4) h2 = (h2 ^ _mixKey(k2, MURMUR_C2, 16, MURMUR_C3)) >>> 0;
  if (tail > 0) h1 = (h1 ^ _mixKey(k1, MURMUR_C1, 15, MURMUR_C2)) >>> 0;

  const lanes = [h1 ^ length, h2 ^ length, h3 ^ length, h4 ^ length].map((lane) => lane >>> 0);
  return _finalizeLanes(lanes);
}

/**
 * MurmurHash3 x86 128's cross-lane finalization: mix every lane into every other, avalanche
 * each, then mix again.
 *
 * @param {number[]} lanes
 * @returns {number[]}
 */
function _finalizeLanes(lanes) {
  const mixed = [...lanes];
  for (let round = 0; round < 2; round += 1) {
    mixed[0] = (mixed[0] + mixed[1] + mixed[2] + mixed[3]) >>> 0;
    mixed[1] = (mixed[1] + mixed[0]) >>> 0;
    mixed[2] = (mixed[2] + mixed[0]) >>> 0;
    mixed[3] = (mixed[3] + mixed[0]) >>> 0;
    if (round === 0) {
      mixed[0] = _fmix32(mixed[0]);
      mixed[1] = _fmix32(mixed[1]);
      mixed[2] = _fmix32(mixed[2]);
      mixed[3] = _fmix32(mixed[3]);
    }
  }
  return mixed;
}

/**
 * The document `_id` for a per-record setting key.
 *
 * **This is the mechanism that makes a duplicate key unrepresentable.** With no unique
 * index on `Setting#key`, a replayed or raced create would otherwise mint a second
 * document; with a derived `_id` and `keepId: true` it is an idempotent upsert, and
 * exactly one document survives by construction.
 *
 * Four constraints, all of them load-bearing:
 *
 * 1. **The id MUST match `/^[a-zA-Z0-9]{16}$/`**, so the key is HASHED and base-62
 *    encoded. It is never truncated: `fabricate.recipe.<id>` truncated to 16 characters
 *    collides for every recipe in the world.
 * 2. **A collision between two different keys silently destroys a record**, because the
 *    mechanism is overwrite. Hence a 128-bit hash and a collision test over the fixture
 *    corpora rather than an assumption.
 * 3. **Overwrite is last-write-wins on the whole document**, so a late-landing buffered
 *    create clobbers a newer update made in between. That is harmless during conversion,
 *    where content is a pure function of the record, and a genuine lost update at runtime
 *    — which is why the derived id COMPLEMENTS the differential in
 *    {@link PerRecordCraftingDefinitionRepository#putAll} and does not replace it.
 * 4. **A re-create re-stamps `_stats`**, whose `systemId`/`systemVersion` the connect
 *    budget band is stated against, so it moves a world within the band.
 *
 * @param {string} key The fully-qualified setting key, e.g. `fabricate.recipe.r1`.
 * @returns {string} A stable 16-character alphanumeric document id.
 */
export function deriveSettingDocumentId(key) {
  const bytes = new TextEncoder().encode(String(key));
  const [h1, h2, h3, h4] = _murmur3x86_128(bytes, ID_HASH_SEED);
  const combined = (BigInt(h1) << 96n) | (BigInt(h2) << 64n) | (BigInt(h3) << 32n) | BigInt(h4);
  let remaining = combined % ID_SPACE;
  const base = BigInt(ID_ALPHABET.length);
  let id = '';
  for (let position = 0; position < ID_LENGTH; position += 1) {
    id = ID_ALPHABET[Number(remaining % base)] + id;
    remaining /= base;
  }
  return id;
}

/**
 * Resolve the concrete `Setting` document class at call time.
 *
 * `Setting.implementation` IS `CONFIG.Setting.documentClass`; both spellings are read so
 * the adapter works whether or not the deprecated global document namespace is present.
 * Resolved lazily on every call rather than captured in the constructor, because a
 * repository may be built before `CONFIG` is populated.
 *
 * @returns {any}
 */
function defaultSettingDocumentClass() {
  return globalThis.Setting?.implementation ?? globalThis.CONFIG?.Setting?.documentClass ?? null;
}

/**
 * The world `Setting` collection — a `WorldSettings` instance holding every world-scoped
 * `Setting` document the client received at connect.
 *
 * @returns {Iterable<any>|null}
 */
function defaultWorldSettingCollection() {
  return globalThis.game?.settings?.storage?.get('world') ?? null;
}

/**
 * @param {any} document
 * @returns {string} the document's `_id`.
 */
function _documentId(document) {
  return String(document?.id ?? document?._id ?? '');
}

/**
 * @see the module documentation above for the four platform facts this implements.
 */
export class PerRecordCraftingDefinitionRepository extends CraftingDefinitionRepository {
  /**
   * @param {object} options
   * @param {string} options.keyPrefix The record-key prefix WITHOUT the namespace and WITH
   *   its trailing separator, e.g. `'recipe.'`. The trailing dot is not decoration: without
   *   it `recipe` also prefix-matches `recipeStorageLayout` and `recipeStorageTarget`.
   * @param {string} [options.namespace] The settings namespace; `fabricate`.
   * @param {(record: object) => string} [options.identify] Read a record's id.
   * @param {(raw: object) => object} [options.hydrate] Turn one persisted record into its
   *   in-memory form (`Recipe.fromJSON` for recipes).
   * @param {(record: object) => object} [options.serialize] Turn one in-memory record into
   *   its persisted form.
   * @param {(record: object) => string|null} [options.scopeOf] Read the owning crafting
   *   system id of a record.
   * @param {(record: object) => import('./CraftingDefinitionRepository.js').DefinitionSummary}
   *   [options.summarize] Project one record to its summary.
   * @param {() => any} [options.documentClass] Injected for tests; resolves the `Setting`
   *   document class carrying `createDocuments`/`updateDocuments`/`deleteDocuments`.
   * @param {() => Iterable<any>|null} [options.collection] Injected for tests; resolves the
   *   world `Setting` collection this adapter indexes.
   * @param {() => void} [options.assertWritable] Throws when this repository addresses an
   *   arrangement the world has already left (issue 1232) — the mirror of the settings
   *   adapter's guard, and reachable for the first time now that a REVERSE conversion
   *   exists: a client holding this adapter afterwards would write record documents back
   *   into existence and re-spend the envelopes the reverse reclaimed. Defaults to a no-op,
   *   so a directly-constructed adapter (including the conversion's own) is unguarded.
   */
  constructor({
    keyPrefix,
    namespace = FABRICATE_SETTINGS_NAMESPACE,
    identify = (record) => record?.id,
    hydrate = (raw) => raw,
    serialize = (record) => record,
    scopeOf = () => null,
    summarize = null,
    documentClass = defaultSettingDocumentClass,
    collection = defaultWorldSettingCollection,
    assertWritable = () => {},
  }) {
    super();
    if (!keyPrefix || !keyPrefix.endsWith('.')) {
      throw new Error(
        'PerRecordCraftingDefinitionRepository needs a keyPrefix ending in a separator, e.g. "recipe."'
      );
    }
    this.namespace = namespace;
    this.keyPrefix = keyPrefix;
    /** The fully-qualified prefix every record key of this class starts with. */
    this.qualifiedPrefix = `${namespace}.${keyPrefix}`;
    this._identify = identify;
    this._hydrate = hydrate;
    this._serialize = serialize;
    this._scopeOf = scopeOf;
    this._summarize =
      summarize ??
      ((record) => ({
        id: String(this._identify(record) ?? ''),
        name: String(record?.name ?? ''),
        systemId: this._scopeOf(record) ?? null,
      }));
    this._documentClass = documentClass;
    this._collection = collection;
    this._assertWritable = assertWritable;
    /** @type {Map<string, any>|null} key -> `Setting` document. Built once. */
    this._index = null;
    this._batchDepth = 0;
    /** @type {Map<string, object>} */
    this._pendingPuts = new Map();
    /** @type {Set<string>} */
    this._pendingDeletes = new Set();
  }

  /**
   * The fully-qualified setting key holding one record.
   *
   * @param {string} id
   * @returns {string}
   */
  keyFor(id) {
    return `${this.qualifiedPrefix}${id}`;
  }

  /**
   * The record id carried by one of this adapter's keys.
   *
   * @param {string} key
   * @returns {string}
   */
  idFromKey(key) {
    return String(key).slice(this.qualifiedPrefix.length);
  }

  /**
   * Build (or rebuild) the key index with ONE pass over the shared world collection.
   *
   * Every read is then O(1) against this map, which is the whole reason the adapter does
   * not touch `ClientSettings`: `WorldSettings#getSetting` is a linear `find`, so serving
   * reads from it would restore the O(N²) behaviour this backend exists to remove.
   *
   * A duplicate key keeps the FIRST document encountered, mirroring `getSetting`, and
   * deletes nothing — see the module documentation for why reaping is unsafe.
   *
   * **User-scoped documents are skipped**, which is the second half of mirroring
   * `getSetting`: `ClientSettings` aliases USER scope onto the SAME `WorldSettings`
   * instance as world scope, so a user-scoped `Setting` document lives in this very
   * collection, and `getSetting` selects on `user` as well as `key`. Fabricate registers no
   * user-scoped key under a record prefix today, so nothing is filtered on a live world —
   * this is the boundary that keeps the claim above true rather than aspirational, and it
   * matters the moment a companion registers `fabricate.recipe.*` for a single user.
   *
   * @returns {Map<string, any>}
   */
  refreshIndex() {
    const index = new Map();
    for (const setting of this._collection() ?? []) {
      const key = setting?.key;
      if (typeof key !== 'string' || !key.startsWith(this.qualifiedPrefix)) continue;
      if (setting?.user != null) continue;
      if (!index.has(key)) index.set(key, setting);
    }
    this._index = index;
    return index;
  }

  /**
   * @returns {Map<string, any>}
   * @private
   */
  _ensureIndex() {
    return this._index ?? this.refreshIndex();
  }

  /**
   * Read one document's stored value.
   *
   * `Setting#value` is a `JSONField`, which stringifies on cast and parses on initialize —
   * so a hydrated document answers with the parsed value. A raw string is accepted and
   * parsed anyway, because a document constructed from a source object that skipped
   * initialization would otherwise be read as a JSON blob. Definition records always
   * serialize to objects, so there is no ambiguity to resolve.
   *
   * @param {any} setting
   * @returns {object}
   * @private
   */
  _readValue(setting) {
    const raw = setting?.value;
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Fabricate | stored definition ${setting?.key} is not readable JSON`, {
        cause: error,
      });
    }
  }

  /**
   * @param {any} setting
   * @returns {object}
   * @private
   */
  _hydrateSetting(setting) {
    return this._hydrate(this._readValue(setting));
  }

  /**
   * @inheritdoc
   *
   * **Id-ordered, not storage-ordered.** The corpus order of a per-record store is not
   * semantic — the collection arrives in `_id` byte order on one client and insertion order
   * on another — so `loadAll` imposes a total order rather than leaking that difference
   * into the managers' maps.
   */
  async loadAll() {
    const index = this.refreshIndex();
    return [...index.keys()]
      .sort((left, right) => (this.idFromKey(left) < this.idFromKey(right) ? -1 : 1))
      .map((key) => this._hydrateSetting(index.get(key)));
  }

  /** @inheritdoc */
  async get(id) {
    const setting = this._ensureIndex().get(this.keyFor(id));
    return setting ? this._hydrateSetting(setting) : null;
  }

  /** @inheritdoc */
  async listSummaries(query = {}) {
    const wantedIds = Array.isArray(query?.ids) ? new Set(query.ids.map(String)) : null;
    const wantedSystem = query?.systemId == null ? null : String(query.systemId);
    const summaries = [];
    for (const [key, setting] of this._ensureIndex()) {
      if (wantedIds && !wantedIds.has(this.idFromKey(key))) continue;
      const record = this._hydrateSetting(setting);
      if (wantedSystem !== null && String(this._scopeOf(record) ?? '') !== wantedSystem) continue;
      summaries.push(this._summarize(record));
    }
    return summaries;
  }

  /** @inheritdoc */
  async put(record) {
    const id = this._identify(record);
    if (id == null) throw new Error('Cannot persist a crafting definition with no id');
    if (this._batchDepth > 0) {
      this._pendingDeletes.delete(String(id));
      this._pendingPuts.set(String(id), record);
      return;
    }
    await this._writeLegs(this._differential(new Map([[String(id), record]]), new Set()));
  }

  /**
   * @inheritdoc
   *
   * Removes the DOCUMENT. `ClientSettings` has no delete and `set(key, null)` would leave
   * the envelope in existence forever, which is the term the connect budget is stated
   * against. Deleting an absent id is not an error.
   */
  async delete(id) {
    if (this._batchDepth > 0) {
      this._pendingPuts.delete(String(id));
      this._pendingDeletes.add(String(id));
      return;
    }
    await this._writeLegs(this._differential(new Map(), new Set([String(id)])));
  }

  /**
   * @inheritdoc
   *
   * **Differential, and at most three document calls whatever the corpus size.** Records
   * absent from the index are created, records whose stored value differs are updated, and
   * indexed records this corpus no longer contains are deleted — deletes LAST, always.
   *
   * The value comparison is what keeps a whole-corpus `save()` from rewriting 5,000
   * documents to persist one edit, and it is also the mechanism that makes a resumed
   * conversion converge instead of minting duplicates.
   *
   * Always immediate, and deliberately not deferred by an enclosing batch: it carries its
   * own explicit record list, which a later corpus flush would silently replace with
   * something else.
   */
  async putAll(records) {
    const desired = new Map();
    for (const record of records) {
      const id = this._identify(record);
      if (id == null) throw new Error('Cannot persist a crafting definition with no id');
      desired.set(String(id), record);
    }
    const index = this._ensureIndex();
    const removals = new Set();
    for (const key of index.keys()) {
      const id = this.idFromKey(key);
      if (!desired.has(id)) removals.add(id);
    }
    await this._writeLegs(this._differential(desired, removals, { skipUnchanged: true }));
  }

  /**
   * @inheritdoc
   *
   * **The work's own error wins.** The abstract contract mandates the flush on a throw —
   * memory has already moved, so storage must not be left behind — but says nothing about
   * which error a caller sees when the flush fails too. Left to chance, the flush's
   * rejection propagates out of the `finally` and REPLACES the original: a caller catching
   * the batch would be told the write failed while the reason its work aborted is gone. So
   * a failed flush is reported on its own channel and the work's error is the one that
   * surfaces. The flush failure is never silent, and the index has already absorbed
   * whatever did land, so the next write converges.
   */
  async runBatch(work) {
    this._batchDepth += 1;
    let workError = null;
    // Tracked separately from `workError` because a thrown value may be FALSY. Gating on the
    // error itself would let `throw null` resolve successfully, which is worse than the
    // no-unsafe-finally violation this restructure exists to remove: the abstract contract
    // says a throw inside `work` propagates, and the sibling adapter's plain try/finally
    // propagates any value.
    let workThrew = false;
    let result;
    // The flush deliberately sits AFTER this block rather than inside its `finally`. It has
    // to run whether or not the body threw, but a `throw` inside a `finally` is
    // `no-unsafe-finally`: it abandons any in-flight completion, which is exactly the
    // original-error-replacement this method exists to prevent. So `finally` only unwinds
    // the depth, and the two errors are reconciled below where the precedence is explicit.
    try {
      result = await work();
    } catch (error) {
      workError = error;
      workThrew = true;
    } finally {
      this._batchDepth -= 1;
    }

    let flushError = null;
    let flushThrew = false;
    if (this._batchDepth === 0) {
      const puts = this._pendingPuts;
      const deletes = this._pendingDeletes;
      this._pendingPuts = new Map();
      this._pendingDeletes = new Set();
      if (puts.size > 0 || deletes.size > 0) {
        try {
          await this._writeLegs(this._differential(puts, deletes));
        } catch (error) {
          flushError = error;
          flushThrew = true;
        }
      }
    }

    if (workThrew) {
      // The body's error wins. Reporting the flush failure on its own channel keeps it from
      // being silent without letting it replace the reason the caller's work aborted.
      if (flushThrew) {
        console.error(
          'Fabricate | per-record definition batch flush failed after the batch body threw',
          flushError
        );
      }
      throw workError;
    }
    // Nothing else went wrong, so this IS the batch's failure and the caller must see it.
    if (flushThrew) throw flushError;
    return result;
  }

  /**
   * Split a desired record set and a removal set into the three ordered legs.
   *
   * @param {Map<string, object>} desired
   * @param {Set<string>} removals
   * @param {object} [options]
   * @param {boolean} [options.skipUnchanged=false] Omit an update whose stored value is
   *   already byte-identical. Used by {@link PerRecordCraftingDefinitionRepository#putAll},
   *   whose callers hand it the WHOLE corpus; a single `put` is an explicit instruction to
   *   write that record and is never skipped.
   * @returns {{creates: object[], updates: object[], deletes: string[]}}
   * @private
   */
  _differential(desired, removals, { skipUnchanged = false } = {}) {
    const index = this._ensureIndex();
    const creates = [];
    const updates = [];
    const deletes = [];
    for (const [id, record] of desired) {
      const key = this.keyFor(id);
      const value = this._serialize(record);
      const existing = index.get(key);
      if (existing) {
        if (skipUnchanged && this._isStoredValue(existing, value)) continue;
        updates.push({ _id: _documentId(existing), value });
      } else {
        creates.push({ _id: deriveSettingDocumentId(key), key, value });
      }
    }
    for (const id of removals) {
      const existing = index.get(this.keyFor(id));
      if (existing) deletes.push(_documentId(existing));
    }
    return { creates, updates, deletes };
  }

  /**
   * @param {any} setting
   * @param {object} value
   * @returns {boolean} whether the document already stores exactly this value.
   * @private
   */
  _isStoredValue(setting, value) {
    try {
      return JSON.stringify(this._readValue(setting)) === JSON.stringify(value);
    } catch {
      return false;
    }
  }

  /**
   * Issue the three legs in the pinned order: creates, updates, **deletes last**.
   *
   * Empty legs cost nothing, so a batch of 50 creates is exactly one round trip.
   *
   * The arrangement guard (issue 1232) sits here, at the single point every leg passes
   * through, for the same reason its sibling sits in the settings adapter's `_write`: a
   * mutation method added later inherits it rather than having to remember it.
   *
   * @param {{creates: object[], updates: object[], deletes: string[]}} legs
   * @returns {Promise<void>}
   * @private
   */
  async _writeLegs({ creates, updates, deletes }) {
    if (creates.length === 0 && updates.length === 0 && deletes.length === 0) return;
    this._assertWritable();
    if (creates.length > 0) await this._createDocuments(creates);
    if (updates.length > 0) await this._updateDocuments(updates);
    if (deletes.length > 0) await this._deleteDocuments(deletes);
  }

  /**
   * @returns {any} the `Setting` document class.
   * @private
   */
  _requireDocumentClass() {
    const documentClass = this._documentClass();
    if (typeof documentClass?.createDocuments !== 'function') {
      throw new TypeError(
        'Fabricate | the Setting document class is unavailable; per-record definition storage cannot write'
      );
    }
    return documentClass;
  }

  /**
   * @param {object[]} data
   * @private
   */
  async _createDocuments(data) {
    for (const entry of data) {
      if (!FOUNDRY_DOCUMENT_ID_PATTERN.test(entry._id)) {
        throw new Error(`Fabricate | derived document id "${entry._id}" is not a valid Foundry id`);
      }
    }
    const created =
      (await this._requireDocumentClass().createDocuments(data, { keepId: true })) ?? [];
    for (const document of created) this._indexDocument(document);
    this._verifyReturned('create', data.length, created.length);
  }

  /**
   * @param {object[]} data
   * @private
   */
  async _updateDocuments(data) {
    const updated = (await this._requireDocumentClass().updateDocuments(data)) ?? [];
    for (const document of updated) this._indexDocument(document);
    this._verifyReturned('update', data.length, updated.length);
  }

  /**
   * Delete documents and prune the index by what was ASKED FOR, not by what came back.
   *
   * Foundry silently drops an `_id` it does not have, so a delete of a document another
   * client already removed resolves SHORT. Pruning only the returned keys would leave that
   * stale entry indexed forever: the next `putAll` recomputes exactly the same delete,
   * returns short again, and throws again — non-convergent, and unreachable by any retry.
   * An id the server does not have is already in the desired state, so dropping it here is
   * what makes the retry converge.
   *
   * The same reasoning covers a `preDeleteSetting` veto, where the document DOES survive:
   * the entry leaves this client's index, {@link _verifyReturned} still raises, and the
   * next {@link refreshIndex} picks the surviving document back up. A stale index entry
   * that can never be cleared has no such recovery.
   *
   * @param {string[]} ids
   * @private
   */
  async _deleteDocuments(ids) {
    const index = this._ensureIndex();
    // Captured BEFORE the await: these ids were derived from this index, and the await is
    // exactly the window in which a replicated change could rewrite it.
    const keyByDocumentId = new Map();
    for (const [key, setting] of index) keyByDocumentId.set(_documentId(setting), key);
    const deleted = (await this._requireDocumentClass().deleteDocuments(ids)) ?? [];
    for (const id of ids) {
      const key = keyByDocumentId.get(String(id));
      if (key !== undefined) index.delete(key);
    }
    this._verifyReturned('delete', ids.length, deleted.length);
  }

  /**
   * @param {any} document
   * @private
   */
  _indexDocument(document) {
    if (typeof document?.key === 'string' && document.key.startsWith(this.qualifiedPrefix)) {
      this._ensureIndex().set(document.key, document);
    }
  }

  /**
   * Fail on a short return rather than accepting silent data loss.
   *
   * A `preCreateSetting` hook returning `false` drops that one document and lets the rest
   * commit, so the call resolves successfully having written less than it was asked to.
   * The index has already absorbed whatever DID land, so a retry converges.
   *
   * @param {string} leg
   * @param {number} requested
   * @param {number} returned
   * @private
   */
  _verifyReturned(leg, requested, returned) {
    if (returned === requested) return;
    throw new Error(
      `Fabricate | per-record definition ${leg} returned ${returned} of ${requested} documents; a hook or the server dropped ${requested - returned}`
    );
  }

  /**
   * @inheritdoc
   *
   * Supported, because a `world`-scoped `Setting` document IS replicated to every client.
   * It costs one full pass over the shared collection, so it is the FALLBACK path:
   * {@link PerRecordCraftingDefinitionRepository#readReplicatedRecord} answers a single
   * replicated record at O(1) and is what a per-record-aware bridge should call.
   */
  readReplicatedSnapshot() {
    const index = this.refreshIndex();
    return [...index.keys()]
      .sort((left, right) => (this.idFromKey(left) < this.idFromKey(right) ? -1 : 1))
      .map((key) => this._hydrateSetting(index.get(key)));
  }

  /** @inheritdoc */
  supportsPerRecordReplication() {
    return true;
  }

  /**
   * @inheritdoc
   *
   * One `world` setting document per record, so a whole-corpus read returns exactly the
   * records that have been written — which is precisely the partial state the Valid Id
   * Basis gate exists to refuse to prune against.
   */
  storesRecordsGranularly() {
    return true;
  }

  /**
   * @inheritdoc
   *
   * The index is updated as a side effect, so a remote create/update/delete leaves this
   * client's map consistent without a rescan.
   */
  readReplicatedRecord(change) {
    const key = String(change?.key ?? change?.document?.key ?? '');
    if (!key.startsWith(this.qualifiedPrefix)) return null;
    const id = this.idFromKey(key);
    const index = this._ensureIndex();
    if (change?.operation === 'delete') {
      index.delete(key);
      return { id, record: null };
    }
    const document = change?.document ?? index.get(key) ?? null;
    if (!document) return { id, record: null };
    index.set(key, document);
    return { id, record: this._hydrateSetting(document) };
  }
}
