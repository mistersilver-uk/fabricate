/**
 * Foundry `Setting` DOCUMENT doubles, shared by every suite that exercises per-record
 * definition storage (issues 1080 and 1232).
 *
 * Extracted from `tests/per-record-definition-repository.test.js` when the Storage Layout
 * Conversion suite needed the same host. A second copy would have been ~150 near-identical
 * lines, which the SonarCloud new-code duplication gate counts — and, worse, two hosts drift:
 * the whole value of these doubles is that they mirror Foundry's REAL semantics rather than a
 * convenient subset, and a divergent copy silently stops testing the semantics the adapter
 * was written against.
 *
 * Every deviation from a "helpful" double below is deliberate:
 *
 * - `Setting` has **no key uniqueness**, so `createDocuments` will happily mint a SECOND
 *   document carrying an existing key. A double that refused would make the derived-`_id`
 *   mechanism untestable and would pass an implementation that leaks envelopes in a live
 *   world.
 * - `keepId: true` on a primary document **silently overwrites** — the `_id`-exists guard is
 *   embedded-documents-only — so the `keepId` path is an unconditional put. That is what
 *   makes a replayed create an idempotent upsert.
 * - `createDocuments` **can resolve with fewer documents than requested**, because a
 *   `preCreateSetting` hook returning `false` drops one and lets the rest commit.
 *   {@link SettingHost#vetoedKeys} models the veto.
 * - `_id` is validated against `/^[a-zA-Z0-9]{16}$/` and `key` against "at least two
 *   dot-separated parts", so the host rejects both exactly as `DocumentIdField` and the `key`
 *   `StringField` validator do.
 */

/** Mirrors `DocumentIdField._validateType` -> `foundry.data.validators.isValidId`. */
export const CORE_ID_PATTERN = /^[a-zA-Z0-9]{16}$/;

/** The alphabet a Foundry document id draws from. */
export const ID_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let mintedIdSequence = 0;

/**
 * Mirrors `Document.createNewId()` — a fresh 16-character alphanumeric id.
 *
 * @returns {string}
 */
export function mintDocumentId() {
  mintedIdSequence += 1;
  const suffix = String(mintedIdSequence).padStart(6, '0');
  return `${ID_CHARACTERS.slice(0, 10)}${suffix}`.slice(0, 16);
}

/**
 * One `Setting` document. `value` is a `JSONField`: stringified on cast, parsed on
 * initialize.
 *
 * **`value` is parsed ONCE and then answered from the memo** (issue 1242), because that is
 * what the platform does and the difference is load-bearing rather than cosmetic.
 * `DataModel#_initialize` computes `field.initialize(...)` once and assigns the result as a
 * plain own data property — not a getter — `JSONField#initialize` is `JSON.parse`, and
 * `Setting#_castType`'s primitive branch returns that parsed value unwrapped and uncloned.
 * Verified in source on 13.351 and 14.365. So `game.settings.get` and every other read hand
 * back the SAME object for as long as the document exists.
 *
 * A double that re-parsed on every read would be strictly more forgiving than Foundry, and
 * that forgiveness hides one specific defect completely: a reader hydrating records with an
 * identity `hydrate` hands a caller the document's OWN value, an in-place transformation
 * mutates it, and a differential writeback that compares the serialized record against the
 * stored value then compares the object with itself, finds no change, and issues nothing —
 * while a re-parsing double reports the write correctly. The memo is what makes that
 * representable at all.
 *
 * The memo is invalidated in {@link SettingDouble#applyChanges}, mirroring the re-initialize
 * an update performs.
 */
export class SettingDouble {
  constructor({ _id, key, value }) {
    this._id = _id;
    this.key = key;
    this._raw = typeof value === 'string' ? value : JSON.stringify(value);
    this._initialized = null;
  }

  get id() {
    return this._id;
  }

  get value() {
    this._initialized ??= { parsed: JSON.parse(this._raw) };
    return this._initialized.parsed;
  }

  applyChanges(changes) {
    if ('value' in changes) {
      this._raw =
        typeof changes.value === 'string' ? changes.value : JSON.stringify(changes.value);
      this._initialized = null;
    }
  }
}

/**
 * The world `Setting` collection.
 *
 * `scans` counts full passes, and `getSettingCalls` counts uses of the linear
 * `WorldSettings#getSetting` find the per-record adapter must never reach for. Both are
 * acceptance criteria, not diagnostics.
 */
export class WorldSettingsDouble {
  constructor() {
    this.documents = new Map();
    this.scans = 0;
    this.getSettingCalls = 0;
  }

  [Symbol.iterator]() {
    this.scans += 1;
    return this.documents.values();
  }

  getSetting(key) {
    this.getSettingCalls += 1;
    return [...this.documents.values()].find((setting) => setting.key === key) ?? null;
  }

  keys() {
    return [...this.documents.values()].map((setting) => setting.key);
  }

  countFor(key) {
    return this.keys().filter((candidate) => candidate === key).length;
  }
}

/**
 * Deep-copy what a write leg was ASKED to persist, at call time (issue 1242).
 *
 * A tear assertion that reads the collection afterwards lies: the migrations in this repo
 * transform their input in place, so the fake store's array already carries the migrated
 * field even in a run whose write threw. And a payload held by reference is mutated by
 * whatever the caller does next. Snapshotting here is the only reading of "what was sent"
 * that survives both.
 *
 * @param {object[]} data
 * @returns {object[]}
 */
function snapshotSent(data) {
  return (Array.isArray(data) ? data : []).map((entry) =>
    typeof entry === 'string' ? entry : structuredClone(entry)
  );
}

/** A `Setting` document class plus the collection it writes into. */
export class SettingHost {
  constructor() {
    this.collection = new WorldSettingsDouble();
    /** Every document operation, in order. */
    this.calls = [];
    /** Keys a `preCreateSetting` hook vetoes. */
    this.vetoedKeys = new Set();
    /** When true, creates are buffered on a "socket" and land only on {@link release}. */
    this.holdCreates = false;
    this._held = [];
    const host = this;
    this.documentClass = {
      createDocuments: async (data, options = {}) => host._create(data, options),
      updateDocuments: async (data) => host._update(data),
      deleteDocuments: async (ids) => host._delete(ids),
    };
  }

  /** The ordered leg names, which is what the pinned flush order is asserted against. */
  get legs() {
    return this.calls.map((call) => call.leg);
  }

  release() {
    const held = this._held;
    this._held = [];
    for (const land of held) land();
  }

  _create(data, options) {
    this.calls.push({ leg: 'create', count: data.length, options, sent: snapshotSent(data) });
    for (const entry of data) {
      if (entry._id != null && !CORE_ID_PATTERN.test(entry._id)) {
        throw new Error(`${entry._id} is not a valid Document ID string`);
      }
      if (String(entry.key ?? '').split('.').length < 2) {
        throw new Error('key: must have the format {scope}.{field}');
      }
    }
    const land = () => {
      const created = [];
      for (const entry of data) {
        // A `preCreateSetting` hook returning false drops THIS one and lets the rest commit.
        if (this.vetoedKeys.has(entry.key)) continue;
        const id = options.keepId && entry._id ? entry._id : mintDocumentId();
        // `keepId` bypasses `createNewId()` and the write is an unconditional put: the
        // `_id`-exists guard is `parent?.getEmbeddedCollection(...)`, unreachable on a
        // primary document. There is NO key uniqueness anywhere, so a create with a fresh
        // `_id` and an existing key mints a second document for that key.
        this.collection.documents.set(
          id,
          new SettingDouble({ _id: id, key: entry.key, value: entry.value })
        );
        created.push(this.collection.documents.get(id));
      }
      return created;
    };
    if (!this.holdCreates) return land();
    return new Promise((resolve) => {
      this._held.push(() => resolve(land()));
    });
  }

  _update(data) {
    this.calls.push({ leg: 'update', count: data.length, sent: snapshotSent(data) });
    const updated = [];
    for (const change of data) {
      const document = this.collection.documents.get(change._id);
      if (!document) continue;
      document.applyChanges(change);
      updated.push(document);
    }
    return updated;
  }

  _delete(ids) {
    this.calls.push({ leg: 'delete', count: ids.length, sent: snapshotSent(ids) });
    const deleted = [];
    for (const id of ids) {
      const document = this.collection.documents.get(id);
      if (!document) continue;
      this.collection.documents.delete(id);
      deleted.push(document);
    }
    return deleted;
  }
}
