/** `SettingsBackedStore` (issue 1689): each primitive proved directly against a recording seam. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SettingsBackedStore } from '../../src/systems/SettingsBackedStore.js';

const KEY = 'exampleKey';

/** The smallest complete subclass: one named cache field and a `load()` over the guarded read. */
class ExampleStore extends SettingsBackedStore {
  constructor(seams) {
    super({ ...seams, settingKey: KEY });
    this.cache = null;
  }

  _setCache(value) {
    this.cache = value;
  }

  load() {
    this.loads = (this.loads ?? 0) + 1;
    this._publish(this._readSettingGuarded());
    return this.cache;
  }
}

/** A seam that records `(key, payload)` per write and what the subject's cache said at the time. */
function recordingSeam({ value = { id: 'stored' }, read = null } = {}) {
  const writes = [];
  const observed = [];
  return {
    writes,
    observed,
    getSetting: () => value,
    setSetting: async (key, payload) => {
      observed.push(read?.());
      writes.push({ key, payload });
      return 'seam-result';
    },
  };
}

describe('SettingsBackedStore', () => {
  it('assigns the three seams verbatim and starts unloaded', () => {
    const getSetting = () => null;
    const setSetting = async () => {};
    const store = new SettingsBackedStore({ getSetting, setSetting, settingKey: KEY });

    assert.equal(store.getSetting, getSetting);
    assert.equal(store.setSetting, setSetting);
    assert.equal(store.settingKey, KEY);
    assert.equal(store.loaded, false);
  });

  it('reads its own key, and propagates a read failure unguarded', () => {
    const seen = [];
    const store = new SettingsBackedStore({
      getSetting: (key) => {
        seen.push(key);
        return 'raw';
      },
      settingKey: KEY,
    });

    assert.equal(store._readSetting(), 'raw');
    assert.deepEqual(seen, [KEY]);

    store.getSetting = () => {
      throw new Error('setting unreadable');
    };
    assert.throws(() => store._readSetting(), /setting unreadable/);
  });

  it('degrades a failed read to null when guarded', () => {
    const store = new SettingsBackedStore({
      getSetting: () => {
        throw new Error('setting unreadable');
      },
      settingKey: KEY,
    });

    assert.equal(store._readSettingGuarded(), null);
  });

  it('loads once through _ensureLoaded and not again', () => {
    const store = new ExampleStore(recordingSeam());

    store._ensureLoaded();
    store._ensureLoaded();

    assert.equal(store.loads, 1);
    assert.equal(store.loaded, true);
  });

  it('fails loudly when a subclass supplies neither abstract member', () => {
    const bare = new SettingsBackedStore({ getSetting: () => null, settingKey: KEY });

    assert.throws(() => bare._publish({}), TypeError);
    assert.throws(() => bare._ensureLoaded(), TypeError);
  });

  it('replaces the cache wholesale rather than merging into it', () => {
    const store = new ExampleStore(recordingSeam());
    store._publish({ a: 1 });
    const first = store.cache;

    store._publish({ b: 2 });

    assert.notEqual(store.cache, first);
    assert.deepEqual(store.cache, { b: 2 });
    assert.equal(store.loaded, true);
  });

  it('writes its own key with the payload it was given', async () => {
    const seam = recordingSeam();
    const store = new ExampleStore(seam);

    const resolved = await store._writeSetting({ id: 'next' });

    assert.equal(resolved, undefined);
    assert.deepEqual(seam.writes, [{ key: KEY, payload: { id: 'next' } }]);
  });

  it('throws rather than resolving when there is no write seam', async () => {
    const store = new ExampleStore({ getSetting: () => null, setSetting: undefined });

    await assert.rejects(() => store._writeSetting({ id: 'next' }), TypeError);
  });

  it('has already published when _publishThenWrite issues the write', async () => {
    const store = new ExampleStore({});
    const seam = recordingSeam({ read: () => store.cache });
    store.setSetting = seam.setSetting;

    const resolved = await store._publishThenWrite({ id: 'next' }, { id: 'payload' });

    assert.deepEqual(seam.observed, [{ id: 'next' }]);
    assert.deepEqual(seam.writes, [{ key: KEY, payload: { id: 'payload' } }]);
    assert.equal(resolved, undefined);
  });

  it('still holds the previous cache when _writeThenPublish issues the write', async () => {
    const store = new ExampleStore({});
    const seam = recordingSeam({ read: () => store.cache });
    store.setSetting = seam.setSetting;
    store._publish({ id: 'previous' });

    const resolved = await store._writeThenPublish({ id: 'next' }, { id: 'payload' });

    assert.deepEqual(seam.observed, [{ id: 'previous' }]);
    assert.deepEqual(store.cache, { id: 'next' });
    assert.equal(resolved, undefined);
  });

  it('leaves the cache unpublished when the write rejects under _writeThenPublish', async () => {
    const store = new ExampleStore({});
    store.setSetting = async () => {
      throw new Error('refused');
    };
    store._publish({ id: 'previous' });

    await assert.rejects(() => store._writeThenPublish({ id: 'next' }, { id: 'payload' }));

    assert.deepEqual(store.cache, { id: 'previous' });
  });

  it('leaves the cache published when the write rejects under _publishThenWrite', async () => {
    const store = new ExampleStore({});
    store.setSetting = async () => {
      throw new Error('refused');
    };
    store._publish({ id: 'previous' });

    await assert.rejects(() => store._publishThenWrite({ id: 'next' }, { id: 'payload' }));

    assert.deepEqual(store.cache, { id: 'next' });
  });
});
