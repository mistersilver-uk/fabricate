import test from 'node:test';
import assert from 'node:assert/strict';

import { PLAYER_HOOKS } from '../src/config/hooks.js';
import { createPlayerExtensionsRegistry } from '../src/ui/playerExtensions.js';

const SURFACE = 'downtime';

// The registry validates SHAPE, never membership, so a fixture must be free to declare any
// ids it likes. `ids` is the whole tab set; nothing here mirrors a Core list. A player tab
// requires only id + label + icon — `accessibleName` and `tooltip` are optional, which is
// the first place this shape diverges from the Manager provider's.
function playerProvider({ id = SURFACE, ids = ['board'], ...overrides } = {}) {
  return {
    apiVersion: 1,
    id,
    tabs: ids.map((tabId) => ({ id: tabId, label: `Board ${tabId}`, icon: 'fas fa-anvil' })),
    mount: () => undefined,
    ...overrides,
  };
}

function quietRegistry(options = {}) {
  return createPlayerExtensionsRegistry({ emitHook: () => {}, ...options });
}

function register(provider, options) {
  return quietRegistry(options).publicApi.registerPlayerNavProvider(provider);
}

test('registerPlayerNavProvider publishes a snapshot per surface and unregisters idempotently', () => {
  const hooks = [];
  const registry = createPlayerExtensionsRegistry({
    emitHook: (name, payload) => hooks.push([name, payload]),
  });
  const snapshots = [];
  const stop = registry.subscribe(SURFACE, (value) => snapshots.push(value));
  const extension = playerProvider({ ids: ['board', 'ledger', 'rumours'] });

  const unregister = registry.publicApi.registerPlayerNavProvider(extension);
  assert.equal(registry.getPlayerNavProvider(SURFACE), extension);
  assert.deepEqual(registry.listPlayerNavSurfaceIds(), [SURFACE]);
  assert.deepEqual(snapshots, [null, extension]);

  unregister();
  unregister();
  assert.equal(registry.getPlayerNavProvider(SURFACE), null);
  assert.deepEqual(registry.listPlayerNavSurfaceIds(), []);
  assert.deepEqual(snapshots, [null, extension, null]);
  stop();

  assert.deepEqual(
    hooks.map(([name]) => name),
    [PLAYER_HOOKS.NAV_PROVIDER_REGISTERED, PLAYER_HOOKS.NAV_PROVIDER_UNREGISTERED]
  );
  for (const [, payload] of hooks) {
    assert.deepEqual(payload, {
      schemaVersion: 1,
      surfaceId: SURFACE,
      tabIds: ['board', 'ledger', 'rumours'],
    });
    assert.ok(Object.isFrozen(payload), 'a published hook payload is frozen');
  }
});

test('a provider declares its own tab set: any ids, any count, its own order', () => {
  const registry = quietRegistry();
  const single = playerProvider({ ids: ['board'] });
  const unregister = registry.publicApi.registerPlayerNavProvider(single);
  assert.deepEqual(
    registry.getPlayerNavProvider(SURFACE).tabs.map((tab) => tab.id),
    ['board']
  );
  unregister();

  // Core's own five tab ids are deliberately included: the registry must not reserve them,
  // because the route key `ext:<surfaceId>:<tabId>` makes a collision impossible without
  // Core learning a single id.
  const many = playerProvider({
    ids: ['zeta', 'crafting', 'journal', 'inventory', 'alchemy', 'gathering', 'ledger'],
  });
  registry.publicApi.registerPlayerNavProvider(many);
  assert.deepEqual(
    registry.getPlayerNavProvider(SURFACE).tabs.map((tab) => tab.id),
    ['zeta', 'crafting', 'journal', 'inventory', 'alchemy', 'gathering', 'ledger'],
    'array order is the render order, and no Core id is a reserved word'
  );
});

test('the registry is keyed by surface id and refuses only a conflict on the same surface', () => {
  const registry = quietRegistry();
  const downtime = playerProvider();
  const other = playerProvider({ id: 'crew-quarters', ids: ['roster'] });
  const snapshots = [];
  registry.subscribe('crew-quarters', (value) => snapshots.push(value));

  registry.publicApi.registerPlayerNavProvider(downtime);
  registry.publicApi.registerPlayerNavProvider(other);
  assert.deepEqual(registry.listPlayerNavSurfaceIds().sort(), ['crew-quarters', 'downtime']);
  assert.deepEqual(snapshots, [null, other], 'a subscriber only hears about its own surface');

  assert.throws(
    () => registry.publicApi.registerPlayerNavProvider(playerProvider({ id: 'crew-quarters' })),
    /Player navigation provider "crew-quarters" is already registered/
  );
});

test('subscribeSurfaceIds reports the whole claimed surface set, whatever the surface is', () => {
  const registry = quietRegistry();
  const seen = [];
  const stop = registry.subscribeSurfaceIds((ids) => seen.push([...ids]));
  assert.deepEqual(seen, [[]], 'a subscriber is replayed the empty set immediately');

  const unregisterDowntime = registry.publicApi.registerPlayerNavProvider(playerProvider());
  const unregisterOther = registry.publicApi.registerPlayerNavProvider(
    playerProvider({ id: 'crew-quarters', ids: ['roster'] })
  );
  assert.deepEqual(seen, [[], ['downtime'], ['downtime', 'crew-quarters']]);
  assert.equal(
    Object.isFrozen(registry.listPlayerNavSurfaceIds()),
    false,
    'the public id list stays a mutable copy callers may sort'
  );

  unregisterOther();
  unregisterDowntime();
  assert.deepEqual(seen.at(-2), ['downtime']);
  assert.deepEqual(seen.at(-1), []);

  stop();
  stop();
  registry.publicApi.registerPlayerNavProvider(playerProvider());
  assert.equal(seen.length, 5, 'unsubscribing is idempotent and really stops the feed');
});

test('a throwing surface-set subscriber cannot take the registering caller down with it', () => {
  const errors = [];
  const registry = quietRegistry({ reportError: (...args) => errors.push(args) });
  registry.subscribeSurfaceIds(() => {
    throw new Error('subscriber exploded');
  });
  assert.equal(errors.length, 1, 'the immediate replay is guarded like any later publication');
  assert.match(errors[0][0], /Player extension subscriber failed/);

  assert.doesNotThrow(() => registry.publicApi.registerPlayerNavProvider(playerProvider()));
  assert.equal(errors.length, 2);
  assert.throws(() => registry.subscribeSurfaceIds('not a function'), /must be a function/);
});

test('registerPlayerNavProvider rejects malformed providers deterministically', () => {
  const cases = [
    [{ apiVersion: 2 }, /Unsupported player navigation provider API version: 2/],
    [{ apiVersion: undefined }, /Unsupported player navigation provider API version: undefined/],
    [{ id: '' }, /requires a non-empty surface id/],
    [{ id: 42 }, /requires a non-empty surface id/],
    [{ tabs: [] }, /must declare at least one tab/],
    [{ tabs: 'board' }, /must declare at least one tab/],
    [{ tabs: [null] }, /tab 0 must be an object/],
    [{ tabs: [{ label: 'x', icon: 'fas fa-x' }] }, /tab 0 requires a non-empty id/],
    [{ tabs: [{ id: 'board', icon: 'fas fa-x' }] }, /tab "board" requires a non-empty label/],
    [{ tabs: [{ id: 'board', label: 'Board' }] }, /tab "board" requires a non-empty icon/],
    [{ ids: ['a', 'a'] }, /duplicate tab id: "a"/],
    [{ mount: async () => {} }, /mount must be synchronous/],
    [{ mount: 'nope' }, /mount must be a function/],
  ];
  for (const [overrides, expected] of cases) {
    assert.throws(
      () => register(playerProvider(overrides)),
      expected,
      `expected ${expected} for ${JSON.stringify(Object.keys(overrides))}`
    );
  }
  assert.throws(() => register(null), /Fabricate player navigation provider must be an object/);
});

// D1: `accessibleName` and `tooltip` are the two optional tab fields, and they are optional
// because Core RENDERS both when supplied — the accessible name replaces the button's name
// and the tooltip is its `aria-describedby` target. So a present-but-empty value would
// produce an unnamed control rather than a defaulted one, and must be rejected.
test('accessibleName and tooltip are accepted when supplied and rejected when present-but-empty', () => {
  const registry = quietRegistry();
  const described = playerProvider({ ids: ['board'] });
  Object.assign(described.tabs[0], {
    accessibleName: 'Board — downtime projects',
    tooltip: 'Track ongoing downtime projects',
  });
  registry.publicApi.registerPlayerNavProvider(described);
  const stored = registry.getPlayerNavProvider(SURFACE).tabs[0];
  assert.equal(stored.accessibleName, 'Board — downtime projects');
  assert.equal(stored.tooltip, 'Track ongoing downtime projects');

  // Omitting both entirely is the documented default and must stay legal.
  assert.doesNotThrow(() => register(playerProvider({ id: 'crew-quarters', ids: ['roster'] })));

  const emptyCases = [
    [{ accessibleName: '' }, /tab "board" requires a non-empty accessibleName/],
    [{ accessibleName: '   ' }, /tab "board" requires a non-empty accessibleName/],
    [{ accessibleName: null }, /tab "board" requires a non-empty accessibleName/],
    [{ accessibleName: 7 }, /tab "board" requires a non-empty accessibleName/],
    [{ tooltip: '' }, /tab "board" requires a non-empty tooltip/],
    [{ tooltip: '  ' }, /tab "board" requires a non-empty tooltip/],
    [{ tooltip: false }, /tab "board" requires a non-empty tooltip/],
  ];
  for (const [tabOverrides, expected] of emptyCases) {
    const candidate = playerProvider({ ids: ['board'] });
    Object.assign(candidate.tabs[0], tabOverrides);
    assert.throws(() => register(candidate), expected, `expected ${expected}`);
  }
});

// D1: charset validation, NOT id enumeration. Core still never says which ids it accepts —
// only what an id may be spelled with, because the composed route key is rendered into an
// HTML id, an IDREF token list (space-separated), a `data-` attribute and a query param.
test('the permitted id charset is enforced on both the surface id and every tab id', () => {
  const permitted = ['downtime', 'a', 'crew-quarters-2', '0', 'a'.repeat(64)];
  for (const id of permitted) {
    assert.doesNotThrow(() => register(playerProvider({ id })), `"${id}" must be permitted`);
    assert.doesNotThrow(
      () => register(playerProvider({ ids: [id] })),
      `tab id "${id}" must be permitted`
    );
  }

  const rejected = [
    'Downtime',
    'down time',
    'down_time',
    'down.time',
    'down:time',
    '-downtime',
    'down/time',
    'a'.repeat(65),
    'down\ntime',
  ];
  for (const id of rejected) {
    assert.throws(
      () => register(playerProvider({ id })),
      /surface id ".*" must be 1-64 characters of lowercase letters, digits and hyphens/s,
      `surface id "${id}" must be rejected`
    );
    assert.throws(
      () => register(playerProvider({ ids: [id] })),
      /tab id ".*" must be 1-64 characters of lowercase letters, digits and hyphens/s,
      `tab id "${id}" must be rejected`
    );
  }
});

// The player window has no route header, breadcrumb trail or header-action group, so Core
// cannot render route chrome or header actions. Validating them would be validation
// theatre. They are NOT RECOGNISED: values the Manager validator rejects outright pass
// through here untouched, and the nav model's allowlist projection (proved in
// tests/player-nav-model.test.js) is what stops them reaching the rail.
test('no route chrome or action fields are recognised on a player provider', () => {
  const registry = quietRegistry();
  const chromed = playerProvider({ ids: ['board'] });
  Object.assign(chromed.tabs[0], {
    title: '   ',
    subtitle: 7,
    breadcrumb: '',
    actionsLabel: null,
    actions: 'not an array',
    count: 12,
  });
  chromed.actions = { id: 'nope' };

  assert.doesNotThrow(() => registry.publicApi.registerPlayerNavProvider(chromed));
  assert.equal(
    registry.getPlayerNavProvider(SURFACE),
    chromed,
    'an unrecognised field is neither validated nor stripped from the provider object'
  );
});

test('a stale unregister handle cannot remove a later provider on the same surface', () => {
  const registry = quietRegistry();
  const first = registry.publicApi.registerPlayerNavProvider(playerProvider());
  first();
  const secondProvider = playerProvider({ ids: ['ledger'], mount: () => () => {} });
  registry.publicApi.registerPlayerNavProvider(secondProvider);

  first();
  assert.equal(registry.getPlayerNavProvider(SURFACE), secondProvider);
});

test('subscribe validates its surface and a throwing subscriber cannot break publication', () => {
  const reported = [];
  const registry = quietRegistry({ reportError: (...args) => reported.push(args) });
  assert.throws(() => registry.subscribe('', () => {}), /surface id must be a non-empty string/);
  assert.throws(() => registry.subscribe(SURFACE, null), /subscriber must be a function/);

  const seen = [];
  registry.subscribe(SURFACE, () => {
    throw new Error('subscriber exploded');
  });
  registry.subscribe(SURFACE, (value) => seen.push(value));
  const extension = playerProvider();
  registry.publicApi.registerPlayerNavProvider(extension);

  assert.deepEqual(seen, [null, extension], 'a later subscriber still receives the snapshot');
  assert.equal(reported.length, 2, 'each failed publication is reported once');
  assert.match(reported[0][0], /Player extension subscriber failed/);
});

test('the registry publishes its hooks through the injected edge and defaults to Foundry', () => {
  const calls = [];
  const originalHooks = globalThis.Hooks;
  globalThis.Hooks = { callAll: (...args) => calls.push(args) };
  try {
    const registry = createPlayerExtensionsRegistry();
    const unregister = registry.publicApi.registerPlayerNavProvider(playerProvider());
    unregister();
    assert.deepEqual(
      calls.map(([name]) => name),
      [PLAYER_HOOKS.NAV_PROVIDER_REGISTERED, PLAYER_HOOKS.NAV_PROVIDER_UNREGISTERED]
    );
  } finally {
    globalThis.Hooks = originalHooks;
  }
});
