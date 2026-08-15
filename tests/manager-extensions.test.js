import test from 'node:test';
import assert from 'node:assert/strict';

import { DOWNTIME_TAB_IDS, createManagerExtensionsRegistry } from '../src/ui/managerExtensions.js';

function provider(overrides = {}) {
  return {
    apiVersion: 1,
    id: 'downtime',
    tabs: DOWNTIME_TAB_IDS.map((id) => ({
      id,
      label: id,
      accessibleName: `Open ${id}`,
      tooltip: `${id} tools`,
      icon: 'fas fa-star',
    })),
    mount: () => undefined,
    ...overrides,
  };
}

test('registerWorldNavProvider publishes a snapshot and unregisters idempotently', () => {
  const registry = createManagerExtensionsRegistry();
  const snapshots = [];
  const stop = registry.subscribe((value) => snapshots.push(value));
  const extension = provider();

  const unregister = registry.publicApi.registerWorldNavProvider(extension);
  assert.equal(registry.getWorldNavProvider(), extension);
  assert.deepEqual(snapshots, [null, extension]);

  unregister();
  unregister();
  assert.equal(registry.getWorldNavProvider(), null);
  assert.deepEqual(snapshots, [null, extension, null]);
  stop();
});

test('registerWorldNavProvider rejects conflicts and malformed/versioned providers deterministically', () => {
  const registry = createManagerExtensionsRegistry();
  registry.publicApi.registerWorldNavProvider(provider());

  assert.throws(
    () => registry.publicApi.registerWorldNavProvider(provider()),
    /World navigation provider "downtime" is already registered/
  );
  assert.throws(
    () =>
      createManagerExtensionsRegistry().publicApi.registerWorldNavProvider(
        provider({ apiVersion: 2 })
      ),
    /Unsupported World navigation provider API version: 2/
  );
  assert.throws(
    () =>
      createManagerExtensionsRegistry().publicApi.registerWorldNavProvider(
        provider({ id: 'other' })
      ),
    /Unsupported World navigation provider id: "other"/
  );
  assert.throws(
    () =>
      createManagerExtensionsRegistry().publicApi.registerWorldNavProvider(provider({ tabs: [] })),
    /exact ordered tab ids: tracking, activities, factions, settings/
  );
  assert.throws(
    () =>
      createManagerExtensionsRegistry().publicApi.registerWorldNavProvider(
        provider({ mount: async () => {} })
      ),
    /mount must be synchronous/
  );
});

test('a stale unregister handle cannot remove a later provider', () => {
  const registry = createManagerExtensionsRegistry();
  const first = registry.publicApi.registerWorldNavProvider(provider());
  first();
  const secondProvider = provider({ mount: () => () => {} });
  registry.publicApi.registerWorldNavProvider(secondProvider);

  first();
  assert.equal(registry.getWorldNavProvider(), secondProvider);
});
