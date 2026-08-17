/**
 * Issue 1080 (-b) — the per-record crafting-definition adapter.
 *
 * Every double in this file mirrors Foundry's real `Setting` semantics rather than a
 * convenient subset, because the defects this adapter exists to prevent are only
 * observable against the real ones:
 *
 * - `Setting` has **no key uniqueness**, so {@link SettingHost}'s `createDocuments` will
 *   happily mint a second document carrying an existing key. A double that refused would
 *   make the derived-`_id` mechanism untestable and would pass an implementation that
 *   leaks envelopes in a live world.
 * - `keepId: true` on a primary document **silently overwrites** — the `_id`-exists guard
 *   is embedded-documents-only — so the double's `keepId` path is an unconditional put.
 *   That is what makes a replayed create an idempotent upsert.
 * - `createDocuments` **can resolve with fewer documents than requested**, because a
 *   `preCreateSetting` hook returning `false` drops one and lets the rest commit. The
 *   double models the veto.
 * - `_id` is validated against `/^[a-zA-Z0-9]{16}$/` and `key` against "at least two
 *   dot-separated parts", so the double rejects both exactly as `DocumentIdField` and the
 *   `key` `StringField` validator do.
 *
 * **Authority is asserted as a call site, not as a refusal** (§ C6 of the plan). This
 * change moves every write OFF `game.settings.set`, which is the seam
 * `tests/helpers/foundryEnv.js` enforces refusal at — so asserting refusal against a
 * hand-written double would only prove that the author wrote a refusal. What is asserted
 * here instead is that writes route through `Setting.implementation.createDocuments` /
 * `updateDocuments` / `deleteDocuments`, resolved through the PRODUCTION default accessor
 * with nothing injected. The refusal itself belongs to the live Foundry harness.
 */

import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
  WORLD_SCOPED_SETTING_KEYS,
  registerFabricateSettings,
} from '../src/config/settings.js';
import {
  FOUNDRY_DOCUMENT_ID_PATTERN,
  PerRecordCraftingDefinitionRepository,
  RECIPE_RECORD_KEY_PREFIX,
  deriveSettingDocumentId,
} from '../src/systems/PerRecordCraftingDefinitionRepository.js';

import {
  CANONICAL_FORM_VERSION,
  canonicalDefinitionCorpusJson,
  canonicalizeDefinitionCorpus,
} from './helpers/canonicalizeDefinitionCorpus.js';

const RECIPE_KEY_PREFIX = `${FABRICATE_SETTINGS_NAMESPACE}.${RECIPE_RECORD_KEY_PREFIX}`;

/** Mirrors `DocumentIdField._validateType` -> `foundry.data.validators.isValidId`. */
const CORE_ID_PATTERN = /^[a-zA-Z0-9]{16}$/;
const ID_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let mintedIdSequence = 0;

/** Codepoint order, matching the adapter's own ordering. */
function byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Mirrors `Document.createNewId()` — a fresh 16-character alphanumeric id. */
function mintDocumentId() {
  mintedIdSequence += 1;
  const suffix = String(mintedIdSequence).padStart(6, '0');
  return `${ID_CHARACTERS.slice(0, 10)}${suffix}`.slice(0, 16);
}

/**
 * One `Setting` document. `value` is a `JSONField`: stringified on cast, parsed on
 * initialize.
 */
class SettingDouble {
  constructor({ _id, key, value }) {
    this._id = _id;
    this.key = key;
    this._raw = typeof value === 'string' ? value : JSON.stringify(value);
  }

  get id() {
    return this._id;
  }

  get value() {
    return JSON.parse(this._raw);
  }

  applyChanges(changes) {
    if ('value' in changes) {
      this._raw =
        typeof changes.value === 'string' ? changes.value : JSON.stringify(changes.value);
    }
  }
}

/**
 * The world `Setting` collection.
 *
 * `scans` counts full passes, and `getSettingCalls` counts uses of the linear
 * `WorldSettings#getSetting` find the adapter must never reach for. Both are acceptance
 * criteria, not diagnostics.
 */
class WorldSettingsDouble {
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

/** A `Setting` document class plus the collection it writes into. */
class SettingHost {
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
    this.calls.push({ leg: 'create', count: data.length, options });
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
        this.collection.documents.set(id, new SettingDouble({ _id: id, key: entry.key, value: entry.value }));
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
    this.calls.push({ leg: 'update', count: data.length });
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
    this.calls.push({ leg: 'delete', count: ids.length });
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

/**
 * @param {SettingHost} host
 * @param {object} [options]
 * @returns {PerRecordCraftingDefinitionRepository}
 */
function makeRepository(host, options = {}) {
  return new PerRecordCraftingDefinitionRepository({
    keyPrefix: RECIPE_RECORD_KEY_PREFIX,
    scopeOf: (record) => record?.craftingSystemId ?? null,
    documentClass: () => host.documentClass,
    collection: () => host.collection,
    ...options,
  });
}

/** @param {SettingHost} host @param {object[]} records */
function seed(host, records) {
  for (const record of records) {
    const key = `${RECIPE_KEY_PREFIX}${record.id}`;
    const id = deriveSettingDocumentId(key);
    host.collection.documents.set(id, new SettingDouble({ _id: id, key, value: record }));
  }
}

function recipe(id, overrides = {}) {
  return { id, name: `Recipe ${id}`, craftingSystemId: 'sys-1', ...overrides };
}

describe('the per-record adapter addresses one document per record', () => {
  it('refuses a key prefix that would also match the two layout keys', () => {
    // `recipe` without the separator prefix-matches `recipeStorageLayout` and
    // `recipeStorageTarget` as well as the legacy `recipes`. Naming all three matters: a
    // later reader who deletes the legacy key must not conclude the dot became optional.
    assert.throws(() => makeRepository(new SettingHost(), { keyPrefix: 'recipe' }), /separator/);
    // NARRATIVE, not a guard. These two compare a literal to a literal and cannot fail for
    // any change in this module; they are here so the reader can see WHICH live keys the
    // separator-less prefix would swallow, immediately above the two assertions that do
    // depend on the shipped prefix.
    assert.ok(`${FABRICATE_SETTINGS_NAMESPACE}.recipes`.startsWith('fabricate.recipe'));
    assert.ok(`${FABRICATE_SETTINGS_NAMESPACE}.recipeStorageLayout`.startsWith('fabricate.recipe'));
    assert.ok(!`${FABRICATE_SETTINGS_NAMESPACE}.recipes`.startsWith(RECIPE_KEY_PREFIX));
    assert.ok(!`${FABRICATE_SETTINGS_NAMESPACE}.recipeStorageTarget`.startsWith(RECIPE_KEY_PREFIX));
  });

  it('creates exactly one document, keyed and id-derived, for a new record', async () => {
    const host = new SettingHost();
    const repository = makeRepository(host);

    await repository.put(recipe('r1'));

    assert.deepEqual(host.legs, ['create']);
    assert.equal(host.calls[0].count, 1);
    assert.equal(host.calls[0].options.keepId, true, 'keepId is what makes the create an upsert');
    const [document] = [...host.collection.documents.values()];
    assert.equal(document.key, `${RECIPE_KEY_PREFIX}r1`);
    assert.equal(document.id, deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}r1`));
    assert.deepEqual(document.value, recipe('r1'));
  });

  it('updates the existing document instead of creating a second one', async () => {
    const host = new SettingHost();
    seed(host, [recipe('r1')]);
    const repository = makeRepository(host);

    await repository.put(recipe('r1', { name: 'Renamed' }));

    assert.deepEqual(host.legs, ['update'], 'an indexed record is never re-created');
    assert.equal(host.collection.documents.size, 1);
    assert.equal(host.collection.documents.values().next().value.value.name, 'Renamed');
  });

  it('deletes the DOCUMENT rather than nulling its value', async () => {
    const host = new SettingHost();
    seed(host, [recipe('r1'), recipe('r2')]);
    const repository = makeRepository(host);

    await repository.delete('r1');

    assert.deepEqual(host.legs, ['delete']);
    assert.deepEqual(host.collection.keys(), [`${RECIPE_KEY_PREFIX}r2`]);
    assert.equal(
      host.collection.countFor(`${RECIPE_KEY_PREFIX}r1`),
      0,
      'ClientSettings has no delete and set(key, null) would leave the envelope forever'
    );
  });

  it('treats deleting an absent record as a no-op rather than an error', async () => {
    const host = new SettingHost();
    const repository = makeRepository(host);
    await repository.delete('nope');
    assert.deepEqual(host.legs, []);
  });

  it('loads id-ordered regardless of the order documents arrived in', async () => {
    const host = new SettingHost();
    seed(host, [recipe('r3'), recipe('r1'), recipe('r2')]);
    const repository = makeRepository(host);

    assert.deepEqual(
      (await repository.loadAll()).map((record) => record.id),
      ['r1', 'r2', 'r3'],
      'corpus order is not semantic under per-record storage, so loadAll imposes one'
    );
  });

  it('answers get and scoped listSummaries from the index', async () => {
    const host = new SettingHost();
    seed(host, [recipe('a'), recipe('b', { craftingSystemId: 'sys-2' })]);
    const repository = makeRepository(host);

    assert.equal((await repository.get('a'))?.name, 'Recipe a');
    assert.equal(await repository.get('missing'), null);
    assert.deepEqual(await repository.listSummaries({ systemId: 'sys-2' }), [
      { id: 'b', name: 'Recipe b', systemId: 'sys-2' },
    ]);
    assert.deepEqual(
      (await repository.listSummaries({ ids: ['a'] })).map((summary) => summary.id),
      ['a']
    );
    assert.equal((await repository.listSummaries()).length, 2);
  });
});

describe('call counts are the acceptance criterion, not an optimisation', () => {
  it('writes 50 new records in ONE document operation', async () => {
    const host = new SettingHost();
    const repository = makeRepository(host);

    await repository.putAll(Array.from({ length: 50 }, (_unused, index) => recipe(`r${index}`)));

    assert.deepEqual(host.legs, ['create'], 'a 50-record putAll costs at most three calls');
    assert.equal(host.calls[0].count, 50, 'one call carrying fifty documents, not fifty calls');
    assert.equal(host.collection.documents.size, 50);
  });

  it('issues creates, then updates, then deletes LAST', async () => {
    const host = new SettingHost();
    seed(host, [recipe('keep'), recipe('change'), recipe('drop')]);
    const repository = makeRepository(host);

    await repository.putAll([recipe('keep'), recipe('change', { name: 'Changed' }), recipe('new')]);

    assert.deepEqual(
      host.legs,
      ['create', 'update', 'delete'],
      'a tear AFTER a delete leg would destroy referents whose referrers were never updated'
    );
    assert.deepEqual(
      host.calls.map((call) => call.count),
      [1, 1, 1],
      'unchanged records are not rewritten'
    );
    assert.deepEqual(host.collection.keys().sort(byCodePoint), [
      `${RECIPE_KEY_PREFIX}change`,
      `${RECIPE_KEY_PREFIX}keep`,
      `${RECIPE_KEY_PREFIX}new`,
    ]);
  });

  it('coalesces a batch into the same three ordered legs', async () => {
    const host = new SettingHost();
    seed(host, [recipe('existing'), recipe('doomed')]);
    const repository = makeRepository(host);

    await repository.runBatch(async () => {
      await repository.put(recipe('fresh'));
      await repository.put(recipe('existing', { name: 'Edited' }));
      await repository.delete('doomed');
    });

    assert.deepEqual(host.legs, ['create', 'update', 'delete']);
    assert.equal(host.collection.countFor(`${RECIPE_KEY_PREFIX}doomed`), 0);
  });

  // ---- The SAME id twice inside one batch ----------------------------------------------
  //
  // The batch above uses three distinct ids, so it never reaches the interaction that
  // matters. Within one batch the last instruction for an id has to CANCEL the pending
  // opposite one, and the consequence of losing that is not a redundant call — it is
  // destruction. Deletes are issued LAST by requirement, so a pending delete that a later
  // `put` failed to cancel runs AFTER the write it was supposed to supersede and the record
  // ends up gone, with every leg reporting success.

  it('a put later in the batch cancels the pending delete, so the record SURVIVES', async () => {
    const host = new SettingHost();
    seed(host, [recipe('r1'), recipe('untouched')]);
    const repository = makeRepository(host);

    await repository.runBatch(async () => {
      await repository.delete('r1');
      await repository.put(recipe('r1', { name: 'Reinstated' }));
    });

    assert.deepEqual(
      host.legs,
      ['update'],
      'an uncancelled delete would be issued after the update and annihilate the record'
    );
    assert.deepEqual(host.collection.keys().sort(byCodePoint), [
      `${RECIPE_KEY_PREFIX}r1`,
      `${RECIPE_KEY_PREFIX}untouched`,
    ]);
    assert.equal((await repository.get('r1'))?.name, 'Reinstated');
  });

  // No sibling case for a delete-then-put of an id that is NOT indexed: there, the record
  // survives whether or not the put cancels the pending delete, because the differential
  // drops a removal whose key it cannot find. Such a test could not be made to fail for any
  // single change to the cancellation, so it is deliberately absent rather than present and
  // vacuous. The unknown-removal filter itself is pinned by "treats deleting an absent
  // record as a no-op" above.

  it('a delete later in the batch cancels the pending put, so nothing is rewritten first', async () => {
    // Seeded EMPTY on purpose, and the id is UNINDEXED. With `r1` already stored, the
    // surviving-keys assertion below reads `[]` whether or not the delete cancels the put, so
    // only the leg assertion would discriminate. Starting empty makes both halves
    // load-bearing: without the cancellation this batch CREATES `r1` and leaves it in
    // storage — a batch that ended by saying "delete r1" having brought it into existence.
    const host = new SettingHost();
    const repository = makeRepository(host);

    await repository.runBatch(async () => {
      await repository.put(recipe('r1', { name: 'Edited' }));
      await repository.delete('r1');
    });

    assert.deepEqual(
      host.legs,
      [],
      'an uncancelled put would write a record the same batch already said to remove'
    );
    assert.deepEqual(
      host.collection.keys(),
      [],
      'and nothing was brought into existence by a batch that ended by removing it'
    );
  });

  it('serves every read from the index, with no further collection scan and no linear find', async () => {
    const host = new SettingHost();
    seed(
      host,
      Array.from({ length: 25 }, (_unused, index) => recipe(`r${index}`))
    );
    const repository = makeRepository(host);

    await repository.loadAll();
    const scansAfterIndexing = host.collection.scans;
    // The ABSOLUTE cost, not a delta from whatever indexing happened to spend. Pinning only
    // the delta leaves a build that scanned once per record green, and removing that O(N^2)
    // path is the entire justification for this backend.
    assert.equal(scansAfterIndexing, 1, 'building the index costs exactly ONE pass');

    for (let index = 0; index < 25; index += 1) {
      assert.ok(await repository.get(`r${index}`));
      assert.equal((await repository.listSummaries({ ids: [`r${index}`] })).length, 1);
    }

    assert.equal(host.collection.scans, scansAfterIndexing, '50 reads must cost zero extra scans');
    assert.equal(
      host.collection.getSettingCalls,
      0,
      'WorldSettings#getSetting is a linear find; reaching for it restores the O(N^2) path'
    );
  });

  it('never touches ClientSettings for a per-record key', async () => {
    const host = new SettingHost();
    const clientSettingsCalls = [];
    const previousGame = globalThis.game;
    globalThis.game = {
      settings: {
        register: (...args) => {
          clientSettingsCalls.push(['register', ...args]);
        },
        get: (...args) => {
          clientSettingsCalls.push(['get', ...args]);
        },
        set: (...args) => {
          clientSettingsCalls.push(['set', ...args]);
        },
        storage: new Map(),
      },
    };
    try {
      const repository = makeRepository(host);
      await repository.put(recipe('r1'));
      await repository.get('r1');
      await repository.loadAll();
      await repository.delete('r1');
    } finally {
      globalThis.game = previousGame;
    }

    assert.deepEqual(
      clientSettingsCalls,
      [],
      'no per-record registration, no per-record onChange, no ClientSettings read or write'
    );
  });
});

describe('the index is maintained, not merely built', () => {
  // The O(1) index is this adapter's whole reason to exist, and every read is served from
  // it. Proving it is built and read from proves nothing about it STAYING correct, and each
  // way it can rot is silent: a pruned-nothing delete leaves a GHOST record readable after
  // it is gone, and an unmaintained replication path makes a remote create invisible and a
  // remote delete invisible. Reads never rescan, so nothing self-heals within a session.

  it('drops a deleted record from the index, so it stops being readable', async () => {
    const host = new SettingHost();
    seed(host, [recipe('r1'), recipe('r2')]);
    const repository = makeRepository(host);
    await repository.loadAll();

    await repository.delete('r1');

    assert.equal(await repository.get('r1'), null, 'a deleted record must not read as a ghost');
    assert.deepEqual(
      (await repository.listSummaries()).map((summary) => summary.id),
      ['r2']
    );
  });

  it('leaves the next putAll with nothing left to delete for a record already removed', async () => {
    // A stale index entry is not merely a stale read: `putAll` recomputes the removal from
    // the index, so the entry would be re-deleted on every subsequent whole-corpus write,
    // return short, and throw — forever.
    const host = new SettingHost();
    seed(host, [recipe('r1'), recipe('r2')]);
    const repository = makeRepository(host);
    await repository.loadAll();
    await repository.delete('r1');
    host.calls.length = 0;

    await repository.putAll([recipe('r2')]);

    assert.deepEqual(host.legs, [], 'nothing to create, nothing changed, nothing left to delete');
  });

  it('converges when a delete returns SHORT because the document was already gone', async () => {
    // Reachable whenever a remote delete was not delivered through `readReplicatedRecord`:
    // Foundry silently drops an `_id` it does not hold, so the call resolves with fewer
    // documents than asked for. Pruning only what came back would leave the stale entry
    // indexed, and every later `putAll` would recompute the same delete and throw again.
    const host = new SettingHost();
    seed(host, [recipe('r1'), recipe('r2')]);
    const repository = makeRepository(host);
    await repository.loadAll();
    // Another client's delete, which this client never saw.
    for (const [documentId, document] of host.collection.documents) {
      if (document.key === `${RECIPE_KEY_PREFIX}r1`) host.collection.documents.delete(documentId);
    }

    await assert.rejects(
      repository.putAll([recipe('r2')]),
      /per-record definition delete returned 0 of 1 documents/
    );

    host.calls.length = 0;
    await repository.putAll([recipe('r2')]);
    assert.deepEqual(host.legs, [], 'the retry has nothing to do, rather than throwing forever');
    assert.equal(await repository.get('r1'), null);
  });

  it('indexes a replicated record this client never held, making it readable at once', async () => {
    // The wire shape of a remote CREATE. The bridge reports it as `'update'` — a delivering
    // leg — because the seam's question is whether a record arrived, not which hook carried
    // it, and this is the case where the answer is "one that was not in the index".
    const host = new SettingHost();
    seed(host, [recipe('r1')]);
    const repository = makeRepository(host);
    await repository.loadAll();
    const scansAfterIndexing = host.collection.scans;

    const created = new SettingDouble({
      _id: deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}r9`),
      key: `${RECIPE_KEY_PREFIX}r9`,
      value: recipe('r9'),
    });
    repository.readReplicatedRecord({
      key: created.key,
      operation: 'update',
      document: created,
    });

    assert.equal((await repository.get('r9'))?.name, 'Recipe r9', 'a record delivered by replication must be visible');
    assert.equal(host.collection.scans, scansAfterIndexing, 'and visible without a rescan');
  });

  it('removes a replicated delete from the index, so the record stops being readable', async () => {
    const host = new SettingHost();
    seed(host, [recipe('r1'), recipe('r2')]);
    const repository = makeRepository(host);
    await repository.loadAll();

    repository.readReplicatedRecord({ key: `${RECIPE_KEY_PREFIX}r1`, operation: 'delete' });

    assert.equal(await repository.get('r1'), null, 'a remote delete must not leave a ghost');
    assert.deepEqual(
      (await repository.listSummaries()).map((summary) => summary.id),
      ['r2']
    );
  });

  it('refuses to index a returned document whose key belongs to another prefix', async () => {
    // Defence in depth: nothing in the adapter asks for a foreign key back. It matters
    // because the index is keyed by the FULL setting key and read through `keyFor`, so a
    // `fabricate.component.c1` entry admitted here would be invisible to every read and
    // would be recomputed as a removal by the next `putAll` — a delete of another store's
    // document.
    const host = new SettingHost();
    const repository = makeRepository(host);
    repository.refreshIndex();

    repository._indexDocument(
      new SettingDouble({
        _id: 'cccccccccccccccc',
        key: `${FABRICATE_SETTINGS_NAMESPACE}.component.c1`,
        value: { id: 'c1' },
      })
    );

    assert.deepEqual([...repository._ensureIndex().keys()], []);
  });

  it('skips a USER-scoped document, mirroring getSetting rather than only the key', async () => {
    // `ClientSettings` aliases USER scope onto the SAME `WorldSettings` instance as world
    // scope, so a user-scoped `Setting` document really does live in the indexed collection
    // and really would prefix-match. `getSetting` selects on `user` as well as `key`.
    const host = new SettingHost();
    seed(host, [recipe('r1')]);
    const mine = new SettingDouble({
      _id: 'dddddddddddddddd',
      key: `${RECIPE_KEY_PREFIX}r2`,
      value: recipe('r2'),
    });
    mine.user = 'user-1';
    host.collection.documents.set(mine.id, mine);

    const repository = makeRepository(host);

    assert.deepEqual(
      (await repository.loadAll()).map((record) => record.id),
      ['r1'],
      'a user-scoped document is not a world record of this store'
    );
    assert.equal(await repository.get('r2'), null);
  });
});

describe('the derived document id makes a duplicate key unrepresentable', () => {
  it('produces a valid, stable Foundry id', () => {
    const id = deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}r1`);
    assert.match(id, FOUNDRY_DOCUMENT_ID_PATTERN);
    // The PATTERNS are compared, not two matches of the same id. A derived id matches both
    // patterns for any loosening of the exported one, so matching twice proves nothing about
    // the exported pattern still being core's — and it is what `_createDocuments` refuses on.
    assert.equal(
      FOUNDRY_DOCUMENT_ID_PATTERN.source,
      CORE_ID_PATTERN.source,
      'the exported pattern must be core’s, not a looser one'
    );
    assert.equal(FOUNDRY_DOCUMENT_ID_PATTERN.flags, CORE_ID_PATTERN.flags);
    assert.equal(id, deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}r1`));
    assert.notEqual(id, deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}r2`));
    assert.notEqual(
      deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}abcdefghijklmnopqrstuvwxyz`),
      deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}abcdefghijklmnopqrstuvwxyzz`),
      'a truncating derivation would collide here, which is why the key is hashed'
    );
  });

  it('collides for no pair across a 10,000-record fixture corpus and its component keys', () => {
    // A collision between two different keys silently DESTROYS a record, because the
    // mechanism is overwrite. That makes this a correctness test, not a quality-of-hash one.
    const keys = [];
    for (let index = 0; index < 10_000; index += 1) {
      keys.push(
        `${RECIPE_KEY_PREFIX}${ID_CHARACTERS.slice(0, 6)}${index}`,
        `${FABRICATE_SETTINGS_NAMESPACE}.component.sys-${index % 40}.c${index}`
      );
    }
    const ids = new Map();
    for (const key of keys) {
      const id = deriveSettingDocumentId(key);
      assert.ok(!ids.has(id), `derived id ${id} collides: ${ids.get(id)} and ${key}`);
      ids.set(id, key);
    }
    assert.equal(ids.size, keys.length);
  });

  it('makes a replayed create an idempotent upsert rather than a second document', async () => {
    const host = new SettingHost();
    const repository = makeRepository(host);

    await repository.put(recipe('r1'));
    // A resumed boot with a fresh index: the differential sees the record already present.
    await makeRepository(host).putAll([recipe('r1')]);
    // And a create replayed against a stale index, which the differential cannot prevent.
    await makeRepository(host).refreshIndex();
    await host.documentClass.createDocuments(
      [
        {
          _id: deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}r1`),
          key: `${RECIPE_KEY_PREFIX}r1`,
          value: recipe('r1'),
        },
      ],
      { keepId: true }
    );

    assert.equal(host.collection.countFor(`${RECIPE_KEY_PREFIX}r1`), 1);
    assert.equal(host.collection.documents.size, 1);
  });

  it('survives a create buffered by a hang landing after a rebuilt index', async () => {
    const host = new SettingHost();
    const repository = makeRepository(host);

    // A hang, not a rejection, is the realistic failure: under 5s the socket flushes and
    // the call resolves LATE.
    host.holdCreates = true;
    const buffered = repository.put(recipe('r1'));

    // The resumed boot rebuilds its index, sees nothing, and creates.
    host.holdCreates = false;
    const resumed = makeRepository(host);
    await resumed.putAll([recipe('r1')]);
    assert.equal(host.collection.documents.size, 1);

    // Now the buffered create lands, after the index it would have been checked against.
    host.release();
    await buffered;

    assert.equal(
      host.collection.countFor(`${RECIPE_KEY_PREFIX}r1`),
      1,
      'the differential is check-then-act with no atomicity; the derived _id is what closes it'
    );
    assert.equal(host.collection.documents.size, 1);
  });

  it('keeps the first document for a duplicated key and reaps nothing', async () => {
    const host = new SettingHost();
    const key = `${RECIPE_KEY_PREFIX}r1`;
    // Two documents sharing a key, as a pre-derived-id world could already contain.
    for (const [documentId, name] of [
      ['aaaaaaaaaaaaaaaa', 'First'],
      ['bbbbbbbbbbbbbbbb', 'Second'],
    ]) {
      host.collection.documents.set(
        documentId,
        new SettingDouble({ _id: documentId, key, value: recipe('r1', { name }) })
      );
    }
    const repository = makeRepository(host);

    assert.equal((await repository.get('r1'))?.name, 'First', 'mirrors getSetting: first wins');
    assert.deepEqual(
      host.legs,
      [],
      'reaping is unsafe: two clients nominate different keepers and can delete BOTH'
    );
    assert.equal(host.collection.documents.size, 2);

    await repository.put(recipe('r1', { name: 'Edited' }));
    assert.deepEqual(host.legs, ['update'], 'the live document is updated; the leak is left alone');
    assert.equal(host.collection.documents.size, 2);
  });
});

describe('every call verifies what came back', () => {
  it('fails on a short create and leaves the landed documents indexed so a retry converges', async () => {
    const host = new SettingHost();
    host.vetoedKeys.add(`${RECIPE_KEY_PREFIX}r2`);
    const repository = makeRepository(host);

    await assert.rejects(
      repository.putAll([recipe('r1'), recipe('r2'), recipe('r3')]),
      /per-record definition create returned 2 of 3 documents/
    );
    assert.equal(host.collection.documents.size, 2, 'the veto dropped one and the rest committed');

    host.vetoedKeys.clear();
    await repository.putAll([recipe('r1'), recipe('r2'), recipe('r3')]);

    assert.equal(host.collection.documents.size, 3);
    assert.equal(host.collection.countFor(`${RECIPE_KEY_PREFIX}r1`), 1, 'no duplicate on retry');
    assert.deepEqual(
      host.calls.filter((call) => call.leg === 'create').map((call) => call.count),
      [3, 1],
      'the retry creates only what is missing'
    );
  });

  it('fails on a short update and on a short delete', async () => {
    const host = new SettingHost();
    seed(host, [recipe('r1')]);
    const repository = makeRepository(host);
    await repository.loadAll();
    // The document disappears underneath us (another client deleted it).
    host.collection.documents.clear();

    await assert.rejects(
      repository.put(recipe('r1', { name: 'Edited' })),
      /per-record definition update returned 0 of 1 documents/
    );
    await assert.rejects(
      repository.delete('r1'),
      /per-record definition delete returned 0 of 1 documents/
    );
  });

  it('refuses to write when the Setting document class is unavailable', async () => {
    const host = new SettingHost();
    const repository = makeRepository(host, { documentClass: () => null });
    await assert.rejects(repository.put(recipe('r1')), TypeError);
  });

  it('still flushes when the batch body throws, so storage is not left behind memory', async () => {
    // The convention the settings adapter is held to (`tests/crafting-definition-repository
    // .test.js`, "memory already moved, so storage must not be left behind"). The manager
    // mutates its map as it goes, so a batch that abandons its pending writes on a throw
    // leaves the in-memory corpus ahead of the world with no signal.
    const host = new SettingHost();
    seed(host, [recipe('doomed')]);
    const repository = makeRepository(host);

    await assert.rejects(
      repository.runBatch(async () => {
        await repository.put(recipe('r1'));
        await repository.delete('doomed');
        throw new Error('boom');
      }),
      /boom/
    );

    assert.deepEqual(host.legs, ['create', 'delete'], 'the pending legs were still issued');
    assert.deepEqual(host.collection.keys(), [`${RECIPE_KEY_PREFIX}r1`]);
  });

  it('lets the batch body’s error win when the mandated flush fails as well', async () => {
    // Both fail. Left to chance the flush rejects out of the `finally` and REPLACES the
    // original, so the caller is told the write failed and the reason its work aborted is
    // gone. The flush failure is reported on its own channel instead of masking it.
    const host = new SettingHost();
    host.vetoedKeys.add(`${RECIPE_KEY_PREFIX}r1`);
    const repository = makeRepository(host);
    const reported = [];
    const previousError = console.error;
    console.error = (...args) => reported.push(args);
    try {
      await assert.rejects(
        repository.runBatch(async () => {
          await repository.put(recipe('r1'));
          throw new Error('boom');
        }),
        /boom/
      );
    } finally {
      console.error = previousError;
    }

    assert.deepEqual(host.legs, ['create'], 'the flush was still attempted');
    assert.equal(reported.length, 1, 'and its failure was reported rather than swallowed');
    assert.match(String(reported[0][0]), /batch flush failed/);
    assert.match(String(reported[0][1]?.message ?? ''), /create returned 0 of 1 documents/);
  });

  it('propagates a FALSY thrown value from the body, identity preserved', async () => {
    // Gating on the error VALUE rather than on whether one was thrown makes `throw null`
    // resolve successfully — a failed batch reported as a success. That defect shipped in
    // this PR once and was caught by review rather than by this suite, which is exactly why
    // it needs a test: the reverted form leaves every other assertion here green.
    const host = new SettingHost();
    const repository = makeRepository(host);

    for (const thrown of [null, undefined, 0, '', false, Number.NaN]) {
      await assert.rejects(
        repository.runBatch(async () => {
          await repository.put(recipe('r1'));
          throw thrown;
        }),
        (error) => Object.is(error, thrown),
        `a body throwing ${String(thrown)} must reject with that exact value`
      );
    }
  });

  it('propagates a FALSY flush failure when the body succeeded', async () => {
    // The other leg. `if (flushError) throw flushError` swallows a falsy rejection and the
    // batch resolves with storage behind memory — the same failure the success-path test
    // above guards, wearing a value that reads as false.
    const host = new SettingHost();
    const repository = makeRepository(host, {
      documentClass: () => ({
        ...host.documentClass,
        // eslint-disable-next-line no-throw-literal -- the point of the test is a falsy throw
        createDocuments: async () => {
          throw null;
        },
      }),
    });

    await assert.rejects(
      repository.runBatch(async () => {
        await repository.put(recipe('r1'));
        return 'the body succeeded';
      }),
      (error) => Object.is(error, null),
      'a falsy flush rejection must still reject the batch'
    );
  });

  it('rejects when the body SUCCEEDS and only the mandated flush fails', async () => {
    // The other half of the pair above, and the one that had no test. While the flush lived
    // inside a `finally`, its rejection propagated as a language guarantee. Moving it out —
    // required, because a `throw` in a `finally` is `no-unsafe-finally` and abandons any
    // in-flight completion — turned that guarantee into an ordinary statement that can be
    // deleted. Without this, removing the rethrow leaves the whole suite green while a batch
    // whose write failed resolves as success, and the manager's in-memory corpus sits ahead
    // of storage with nothing raised and nothing logged: the `console.error` channel only
    // fires on the body-threw path.
    const host = new SettingHost();
    host.vetoedKeys.add(`${RECIPE_KEY_PREFIX}r1`);
    const repository = makeRepository(host);

    await assert.rejects(
      repository.runBatch(async () => {
        await repository.put(recipe('r1'));
        return 'the body succeeded';
      }),
      /create returned 0 of 1 documents/
    );

    assert.deepEqual(host.legs, ['create'], 'the flush was attempted');
    assert.deepEqual(host.collection.keys(), [], 'and nothing landed, so storage is behind memory');
  });
});

describe('writes route through the Setting document API', () => {
  const previousSetting = globalThis.Setting;
  const previousConfig = globalThis.CONFIG;

  afterEach(() => {
    globalThis.Setting = previousSetting;
    globalThis.CONFIG = previousConfig;
  });

  it('resolves Setting.implementation with nothing injected', async () => {
    const host = new SettingHost();
    globalThis.Setting = { implementation: host.documentClass };
    globalThis.CONFIG = undefined;

    // No `documentClass` option: this exercises the production default accessor, which is
    // the only form of this assertion that a hand-written double cannot fake.
    const repository = new PerRecordCraftingDefinitionRepository({
      keyPrefix: RECIPE_RECORD_KEY_PREFIX,
      collection: () => host.collection,
    });

    await repository.put(recipe('r1'));
    await repository.put(recipe('r1', { name: 'Edited' }));
    await repository.delete('r1');

    assert.deepEqual(host.legs, ['create', 'update', 'delete']);
  });

  it('falls back to CONFIG.Setting.documentClass', async () => {
    const host = new SettingHost();
    globalThis.Setting = undefined;
    globalThis.CONFIG = { Setting: { documentClass: host.documentClass } };

    const repository = new PerRecordCraftingDefinitionRepository({
      keyPrefix: RECIPE_RECORD_KEY_PREFIX,
      collection: () => host.collection,
    });
    await repository.put(recipe('r1'));

    assert.deepEqual(host.legs, ['create']);
  });
});

describe('the per-record replication capability', () => {
  it('is declared, and applies one replicated record at a time', () => {
    const host = new SettingHost();
    seed(host, [recipe('r1')]);
    const repository = makeRepository(host);

    assert.equal(repository.supportsPerRecordReplication(), true);
    assert.deepEqual(repository.readReplicatedRecord({ key: 'fabricate.recipes', operation: 'update' }), null);
    assert.deepEqual(
      repository.readReplicatedRecord({ key: `${RECIPE_KEY_PREFIX}r1`, operation: 'update' }),
      { id: 'r1', record: recipe('r1') }
    );

    const created = new SettingDouble({
      _id: deriveSettingDocumentId(`${RECIPE_KEY_PREFIX}r9`),
      key: `${RECIPE_KEY_PREFIX}r9`,
      value: recipe('r9'),
    });
    assert.deepEqual(
      repository.readReplicatedRecord({ key: created.key, operation: 'update', document: created }),
      { id: 'r9', record: recipe('r9') }
    );
    assert.deepEqual(
      repository.readReplicatedRecord({ key: `${RECIPE_KEY_PREFIX}r1`, operation: 'delete' }),
      { id: 'r1', record: null }
    );
  });

  it('still answers a whole-corpus snapshot for a caller that has no per-record path', () => {
    const host = new SettingHost();
    seed(host, [recipe('r2'), recipe('r1')]);
    assert.deepEqual(
      makeRepository(host)
        .readReplicatedSnapshot()
        .map((record) => record.id),
      ['r1', 'r2']
    );
  });
});

describe('the two O(1) storage keys', () => {
  it('are registered world-scoped and default to today’s layout', () => {
    assert.equal(SETTING_KEYS.RECIPE_STORAGE_LAYOUT, 'recipeStorageLayout');
    assert.equal(SETTING_KEYS.RECIPE_STORAGE_TARGET, 'recipeStorageTarget');
    assert.ok(WORLD_SCOPED_SETTING_KEYS.has('recipeStorageLayout'));
    assert.ok(WORLD_SCOPED_SETTING_KEYS.has('recipeStorageTarget'));
    assert.equal(DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY, 'singleArray');
    assert.equal(DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY, 'singleArray');
    assert.deepEqual(Object.values(DEFINITION_STORAGE_LAYOUTS), [
      'singleArray',
      'unsettled',
      'perRecord',
    ]);
    assert.deepEqual(
      Object.values(DEFINITION_STORAGE_TARGETS),
      ['singleArray', 'perRecord'],
      'unsettled is something storage can BE, never something an operator can ask for'
    );
  });

  it('registers exactly two new keys, and nothing per record', () => {
    // `ClientSettings.register` calls the linear `WorldSettings#getSetting`, so registering
    // one key per record is O(N^2) before a recipe is read. The per-record backend
    // registers nothing per record; these two are the whole registration cost.
    const registered = [];
    const previousGame = globalThis.game;
    globalThis.game = {
      settings: {
        register: (namespace, key, definition) => {
          registered.push({ namespace, key, definition });
        },
      },
    };
    try {
      registerFabricateSettings();
    } finally {
      globalThis.game = previousGame;
    }

    const storageKeys = registered.filter((entry) => entry.key.startsWith('recipeStorage'));
    assert.deepEqual(
      storageKeys.map((entry) => entry.key),
      ['recipeStorageLayout', 'recipeStorageTarget']
    );
    for (const entry of storageKeys) {
      assert.equal(entry.namespace, FABRICATE_SETTINGS_NAMESPACE);
      assert.equal(entry.definition.scope, 'world');
      assert.equal(entry.definition.type, String);
      assert.equal(entry.definition.default, 'singleArray', '-b is behaviour-neutral');
      assert.equal(entry.definition.config, false, 'no GM-flippable row until -c honours it');
    }
    assert.deepEqual(
      registered.filter((entry) => entry.key.startsWith(RECIPE_RECORD_KEY_PREFIX)),
      [],
      'a per-record key must never be registered'
    );
  });
});

describe('the pinned canonical form', () => {
  it('is versioned, so two sides cannot be compared under different rules', () => {
    assert.equal(CANONICAL_FORM_VERSION, 1);
    assert.equal(canonicalizeDefinitionCorpus([]).version, CANONICAL_FORM_VERSION);
  });

  it('sorts the corpus by id and every object’s keys, and drops undefined', () => {
    const left = canonicalDefinitionCorpusJson([
      { name: 'B', id: 'b', craftingSystemId: 'sys-1' },
      { id: 'a', craftingSystemId: 'sys-1', name: 'A', notes: undefined },
    ]);
    const right = canonicalDefinitionCorpusJson([
      { craftingSystemId: 'sys-1', id: 'a', name: 'A' },
      { craftingSystemId: 'sys-1', id: 'b', name: 'B' },
    ]);
    assert.equal(left, right);
    assert.match(left, /"records":\[\{"craftingSystemId":"sys-1","id":"a"/);
  });

  it('preserves authored nested order rather than sorting it away', () => {
    const stages = { id: 'r1', resultGroups: [{ id: 'z' }, { id: 'a' }] };
    const canonical = canonicalizeDefinitionCorpus([stages]);
    assert.deepEqual(
      canonical.records[0].resultGroups.map((group) => group.id),
      ['z', 'a'],
      'sorting nested collections would hide a real reordering regression and prove nothing'
    );
  });

  it('renumbers machine-minted ids positionally while preserving references', () => {
    const build = (first, second) => [
      {
        id: 'r1',
        ingredientSets: [{ id: 'set-1', ingredientGroups: [{ id: first, name: '' }] }],
        preferredGroupId: first,
      },
      { id: 'r2', ingredientSets: [{ id: 'set-2', ingredientGroups: [{ id: second, name: '' }] }] },
    ];
    const runOne = build('1f0d2e6c-6a1d-4a0a-8f1e-2c2d3e4f5a6b', 'aa11bb22-cc33-4d44-9e55-ff6677889900');
    const runTwo = build('0badc0de-dead-4bee-8fed-0123456789ab', 'feedface-cafe-4bad-bead-fedcba987654');

    assert.equal(canonicalDefinitionCorpusJson(runOne), canonicalDefinitionCorpusJson(runTwo));
    const canonical = canonicalizeDefinitionCorpus(runOne);
    assert.equal(canonical.records[0].ingredientSets[0].ingredientGroups[0].id, 'minted-0001');
    assert.equal(
      canonical.records[0].preferredGroupId,
      'minted-0001',
      'a reference to a minted id must still resolve to its target'
    );
    assert.equal(canonical.records[1].ingredientSets[0].ingredientGroups[0].id, 'minted-0002');
  });

  it('does not renumber an authored id that merely looks random', () => {
    const canonical = canonicalizeDefinitionCorpus([{ id: 'aBcDeF0123456789', name: 'Authored' }]);
    assert.equal(canonical.records[0].id, 'aBcDeF0123456789');
  });

  it('keeps null distinct from absent unless the caller asks otherwise', () => {
    const withNull = canonicalDefinitionCorpusJson([{ id: 'a', craftingSystemId: null }]);
    const without = canonicalDefinitionCorpusJson([{ id: 'a' }]);
    assert.notEqual(withNull, without, 'null-versus-absent is a defect class, not noise');
    assert.equal(
      canonicalDefinitionCorpusJson([{ id: 'a', craftingSystemId: null }], { treatNullAsAbsent: true }),
      without
    );
  });
});
