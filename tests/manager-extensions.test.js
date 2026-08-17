import test from 'node:test';
import assert from 'node:assert/strict';

import { MANAGER_HOOKS } from '../src/config/hooks.js';
import {
  WORLD_DOWNTIME_SURFACE_ID,
  createManagerExtensionsRegistry,
} from '../src/ui/managerExtensions.js';

// The registry validates SHAPE, never membership, so a fixture must be free to declare
// any ids it likes. `ids` is the whole tab set; nothing here mirrors a Core list.
function provider({ id = WORLD_DOWNTIME_SURFACE_ID, ids = ['tracking'], ...overrides } = {}) {
  return {
    apiVersion: 1,
    id,
    tabs: ids.map((tabId) => ({
      id: tabId,
      label: tabId,
      accessibleName: `Open ${tabId}`,
      tooltip: `${tabId} tools`,
      icon: 'fas fa-star',
    })),
    mount: () => undefined,
    ...overrides,
  };
}

function recordingRegistry() {
  const hooks = [];
  const registry = createManagerExtensionsRegistry({
    emitHook: (name, payload) => hooks.push([name, payload]),
  });
  return { registry, hooks };
}

test('registerWorldNavProvider publishes a snapshot per surface and unregisters idempotently', () => {
  const { registry, hooks } = recordingRegistry();
  const snapshots = [];
  const stop = registry.subscribe(WORLD_DOWNTIME_SURFACE_ID, (value) => snapshots.push(value));
  const extension = provider({ ids: ['overview', 'ledger', 'rules'] });

  const unregister = registry.publicApi.registerWorldNavProvider(extension);
  assert.equal(registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID), extension);
  assert.deepEqual(registry.listWorldNavSurfaceIds(), [WORLD_DOWNTIME_SURFACE_ID]);
  assert.deepEqual(snapshots, [null, extension]);

  unregister();
  unregister();
  assert.equal(registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID), null);
  assert.deepEqual(registry.listWorldNavSurfaceIds(), []);
  assert.deepEqual(snapshots, [null, extension, null]);
  stop();

  assert.deepEqual(
    hooks.map(([name]) => name),
    [MANAGER_HOOKS.NAV_PROVIDER_REGISTERED, MANAGER_HOOKS.NAV_PROVIDER_UNREGISTERED]
  );
  for (const [, payload] of hooks) {
    assert.deepEqual(payload, {
      schemaVersion: 1,
      surfaceId: WORLD_DOWNTIME_SURFACE_ID,
      tabIds: ['overview', 'ledger', 'rules'],
    });
    assert.ok(Object.isFrozen(payload), 'a published hook payload is frozen');
  }
});

test('a provider declares its own tab set: any ids, any count, its own order', () => {
  const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
  const single = provider({ ids: ['board'] });
  const unregister = registry.publicApi.registerWorldNavProvider(single);
  assert.deepEqual(
    registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID).tabs.map((tab) => tab.id),
    ['board']
  );
  unregister();

  const seven = provider({
    ids: ['zeta', 'alpha', 'projects', 'crew', 'rumours', 'ledger', 'rules'],
  });
  registry.publicApi.registerWorldNavProvider(seven);
  assert.deepEqual(
    registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID).tabs.map((tab) => tab.id),
    ['zeta', 'alpha', 'projects', 'crew', 'rumours', 'ledger', 'rules'],
    'array order is the render order, and no id is a reserved word'
  );
});

test('the registry is keyed by surface id and refuses only a conflict on the same surface', () => {
  const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
  const downtime = provider();
  const other = provider({ id: 'crew-quarters', ids: ['roster'] });
  const snapshots = [];
  registry.subscribe('crew-quarters', (value) => snapshots.push(value));

  registry.publicApi.registerWorldNavProvider(downtime);
  registry.publicApi.registerWorldNavProvider(other);
  assert.deepEqual(registry.listWorldNavSurfaceIds().sort(), ['crew-quarters', 'downtime']);
  assert.deepEqual(snapshots, [null, other], 'a subscriber only hears about its own surface');

  assert.throws(
    () => registry.publicApi.registerWorldNavProvider(provider({ id: 'crew-quarters' })),
    /World navigation provider "crew-quarters" is already registered/
  );
});

// Issue 1185 — the Manager's title bar reports whether a COMPANION MODULE is present, which
// no per-surface subscription can answer: a companion claiming a surface Core has never heard
// of publishes to nobody, so the shell would never learn it exists.
test('subscribeSurfaceIds reports the whole claimed surface set, whatever the surface is', () => {
  const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
  const seen = [];
  const stop = registry.subscribeSurfaceIds((ids) => seen.push([...ids]));
  assert.deepEqual(seen, [[]], 'a subscriber is replayed the empty set immediately');

  const unregisterDowntime = registry.publicApi.registerWorldNavProvider(provider());
  // The surface Core has never heard of is the whole point: it must move this signal.
  const unregisterOther = registry.publicApi.registerWorldNavProvider(
    provider({ id: 'crew-quarters', ids: ['roster'] })
  );
  assert.deepEqual(seen, [[], ['downtime'], ['downtime', 'crew-quarters']]);
  assert.ok(
    Object.isFrozen(registry.listWorldNavSurfaceIds()) === false,
    'the public id list stays a mutable copy callers may sort'
  );

  unregisterOther();
  unregisterDowntime();
  assert.deepEqual(seen.at(-2), ['downtime']);
  assert.deepEqual(seen.at(-1), []);

  stop();
  stop();
  registry.publicApi.registerWorldNavProvider(provider());
  assert.equal(seen.length, 5, 'unsubscribing is idempotent and really stops the feed');
});

test('a throwing surface-set subscriber cannot take the registering caller down with it', () => {
  const errors = [];
  const registry = createManagerExtensionsRegistry({
    emitHook: () => {},
    reportError: (...args) => errors.push(args),
  });
  registry.subscribeSurfaceIds(() => {
    throw new Error('subscriber exploded');
  });
  assert.equal(errors.length, 1, 'the immediate replay is guarded like any later publication');

  assert.doesNotThrow(() => registry.publicApi.registerWorldNavProvider(provider()));
  assert.equal(errors.length, 2);
  assert.throws(() => registry.subscribeSurfaceIds('not a function'), /must be a function/);
});

test('registerWorldNavProvider rejects malformed providers deterministically', () => {
  const cases = [
    [{ apiVersion: 2 }, /Unsupported World navigation provider API version: 2/],
    [{ id: '' }, /requires a non-empty surface id/],
    [{ id: 42 }, /requires a non-empty surface id/],
    [{ tabs: [] }, /must declare at least one tab/],
    [{ tabs: 'tracking' }, /must declare at least one tab/],
    [{ tabs: [{ label: 'x', accessibleName: 'x', tooltip: 'x', icon: 'x' }] }, /non-empty id/],
    [{ ids: ['a', 'a'] }, /duplicate tab id: "a"/],
    [{ mount: async () => {} }, /mount must be synchronous/],
    [{ mount: 'nope' }, /mount must be a function/],
  ];
  for (const [overrides, expected] of cases) {
    assert.throws(
      () =>
        createManagerExtensionsRegistry({ emitHook: () => {} }).publicApi.registerWorldNavProvider(
          provider(overrides)
        ),
      expected,
      `expected ${expected} for ${JSON.stringify(Object.keys(overrides))}`
    );
  }
  assert.throws(
    () =>
      createManagerExtensionsRegistry({ emitHook: () => {} }).publicApi.registerWorldNavProvider(
        null
      ),
    /Fabricate World navigation provider must be an object/
  );
});

// STILL REQUIRED, THOUGH NOW RENDERED DIFFERENTLY PER MODE (issue 1213). Provider mode renders
// no tab strip, and the strip was the only thing that ever rendered `accessibleName` or
// `tooltip`. Rather than drop the requirement, provider mode consumes both on the rail
// sub-item: `accessibleName` as its `aria-label`, `tooltip` as its native tooltip. So the
// fields are required AND consumed in both modes, and this test is what stops a later reader
// "tidying away" a validation whose renderer they cannot find — dropping either is a breaking
// change to a shipped seam and has to fail here first.
test('accessibleName and tooltip stay required on a Manager tab', () => {
  for (const field of ['label', 'accessibleName', 'tooltip', 'icon']) {
    for (const value of ['', '   ', null, undefined, 7]) {
      const broken = provider({ ids: ['board'] });
      broken.tabs[0][field] = value;
      assert.throws(
        () =>
          createManagerExtensionsRegistry({
            emitHook: () => {},
          }).publicApi.registerWorldNavProvider(broken),
        new RegExp(`tab "board" requires a non-empty ${field}`),
        `${field}=${JSON.stringify(value)} should be rejected at registration`
      );
    }
  }
});

test('route chrome and header actions are validated as shape, not as content', () => {
  const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
  const chromed = provider({ ids: ['board'] });
  Object.assign(chromed.tabs[0], {
    title: 'Company Board',
    subtitle: 'Six crew · two projects',
    breadcrumb: 'Board',
    actionsLabel: 'Company board actions',
    actions: [
      { id: 'new-project', label: 'New project', icon: 'fas fa-plus', onSelect: () => {} },
      { id: 'guide', label: 'Guide', href: 'https://example.com/guide' },
    ],
  });
  registry.publicApi.registerWorldNavProvider(chromed);
  const tab = registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID).tabs[0];
  assert.equal(tab.title, 'Company Board');
  assert.equal(tab.actions.length, 2);

  const chromeCases = [
    [{ title: '   ' }, /tab "board" requires a non-empty title/],
    [{ subtitle: 7 }, /tab "board" requires a non-empty subtitle/],
    [{ breadcrumb: '' }, /tab "board" requires a non-empty breadcrumb/],
    [{ actionsLabel: null }, /tab "board" requires a non-empty actionsLabel/],
    [{ actions: {} }, /tab "board" actions must be an array/],
    [{ actions: [{ label: 'x', onSelect: () => {} }] }, /action 0 requires a non-empty id/],
    [{ actions: [{ id: 'a', onSelect: () => {} }] }, /action "a" requires a non-empty label/],
    [{ actions: [{ id: 'a', label: 'A' }] }, /must declare exactly one of href, onSelect/],
    [
      { actions: [{ id: 'a', label: 'A', href: 'https://x.test', onSelect: () => {} }] },
      /must declare exactly one of href, onSelect/,
    ],
    [
      { actions: [{ id: 'a', label: 'A', href: 'javascript:alert(1)' }] },
      /href must be an absolute http\(s\) URL/,
    ],
    [{ actions: [{ id: 'a', label: 'A', onSelect: 'go' }] }, /onSelect must be a function/],
    [
      {
        actions: [
          { id: 'a', label: 'A', href: 'https://x.test' },
          { id: 'a', label: 'B', href: 'https://y.test' },
        ],
      },
      /duplicate action id: "a"/,
    ],
  ];
  for (const [tabOverrides, expected] of chromeCases) {
    const candidate = provider({ ids: ['board'] });
    Object.assign(candidate.tabs[0], tabOverrides);
    assert.throws(
      () =>
        createManagerExtensionsRegistry({ emitHook: () => {} }).publicApi.registerWorldNavProvider(
          candidate
        ),
      expected,
      `expected ${expected}`
    );
  }
});

test('a stale unregister handle cannot remove a later provider on the same surface', () => {
  const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
  const first = registry.publicApi.registerWorldNavProvider(provider());
  first();
  const secondProvider = provider({ ids: ['ledger'], mount: () => () => {} });
  registry.publicApi.registerWorldNavProvider(secondProvider);

  first();
  assert.equal(registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID), secondProvider);
});

test('subscribe validates its surface and a throwing subscriber cannot break publication', () => {
  const reported = [];
  const registry = createManagerExtensionsRegistry({
    reportError: (...args) => reported.push(args),
    emitHook: () => {},
  });
  assert.throws(() => registry.subscribe('', () => {}), /surface id must be a non-empty string/);
  assert.throws(
    () => registry.subscribe(WORLD_DOWNTIME_SURFACE_ID, null),
    /subscriber must be a function/
  );

  const seen = [];
  registry.subscribe(WORLD_DOWNTIME_SURFACE_ID, () => {
    throw new Error('subscriber exploded');
  });
  registry.subscribe(WORLD_DOWNTIME_SURFACE_ID, (value) => seen.push(value));
  const extension = provider();
  registry.publicApi.registerWorldNavProvider(extension);

  assert.deepEqual(seen, [null, extension], 'a later subscriber still receives the snapshot');
  assert.equal(reported.length, 2, 'each failed publication is reported once');
  assert.match(reported[0][0], /Manager extension subscriber failed/);
});

test('the registry publishes its hooks through the injected edge and defaults to Foundry', () => {
  const calls = [];
  const originalHooks = globalThis.Hooks;
  globalThis.Hooks = { callAll: (...args) => calls.push(args) };
  try {
    const registry = createManagerExtensionsRegistry();
    const unregister = registry.publicApi.registerWorldNavProvider(provider());
    unregister();
    assert.deepEqual(
      calls.map(([name]) => name),
      [MANAGER_HOOKS.NAV_PROVIDER_REGISTERED, MANAGER_HOOKS.NAV_PROVIDER_UNREGISTERED]
    );
  } finally {
    globalThis.Hooks = originalHooks;
  }
});
