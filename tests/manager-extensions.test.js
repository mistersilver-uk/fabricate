import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MANAGER_HOOKS } from '../src/config/hooks.js';
import {
  ACTION_TONES,
  ROUTE_CHROME_STATUS_TONES,
  WORLD_DOWNTIME_SURFACE_ID,
  createManagerExtensionsRegistry,
  managerHeaderActionClass,
  normalizeRouteChrome,
} from '../src/ui/managerExtensions.js';

const repoRoot = resolve(import.meta.dirname, '..');

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

// A companion's header must be INDISTINGUISHABLE from a Core one, which means it needs the
// treatments Core's own editors use — a ghost Back, a danger Delete, a primary Save — not just
// `primary`. The class strings are the contract: these are the very classes
// `CraftingSystemManagerRoot` writes for its own recipe-editor controls.
test('an action tone renders the Manager button class Core uses for its own controls', () => {
  assert.equal(managerHeaderActionClass({ tone: 'primary' }), 'manager-button is-primary');
  assert.equal(managerHeaderActionClass({ tone: 'ghost' }), 'manager-button is-ghost');
  assert.equal(managerHeaderActionClass({ tone: 'danger' }), 'manager-button is-danger');
  assert.equal(managerHeaderActionClass({ tone: 'neutral' }), 'manager-button');
  assert.equal(
    managerHeaderActionClass({ primary: true }),
    'manager-button is-primary',
    'the shipped `primary` spelling keeps its shipped rendering'
  );
  assert.equal(managerHeaderActionClass({}), 'manager-button');
  assert.equal(managerHeaderActionClass(undefined), 'manager-button');

  // The teeth: EVERY declared tone must map to something. A tone added to the list without a
  // class would otherwise render as a bare button and read as a stylesheet oversight.
  for (const tone of ACTION_TONES) {
    const rendered = managerHeaderActionClass({ tone });
    assert.ok(
      rendered.startsWith('manager-button'),
      `${tone} must render through the Manager's own button`
    );
    assert.ok(
      tone === 'neutral' || rendered !== 'manager-button',
      `${tone} declares a treatment, so it must add a modifier class`
    );
  }
});

test('a header action treatment is validated like every other provider field', () => {
  const cases = [
    [{ tone: 'destructive' }, /tone must be one of primary, ghost, danger, neutral/],
    [{ tone: '' }, /tone must be one of/],
    [{ tone: 'primary', primary: true }, /must not declare both primary and tone/],
    [{ tone: 'ghost', primary: false }, /must not declare both primary and tone/],
    [{ primary: 'yes' }, /primary must be a boolean/],
    [{ disabled: 1 }, /disabled must be a boolean/],
  ];
  for (const [overrides, expected] of cases) {
    const candidate = provider({ ids: ['board'] });
    candidate.tabs[0].actions = [
      { id: 'save', label: 'Save', onSelect: () => {}, ...overrides },
    ];
    assert.throws(
      () =>
        createManagerExtensionsRegistry({ emitHook: () => {} }).publicApi.registerWorldNavProvider(
          candidate
        ),
      expected,
      `expected ${expected}`
    );
  }

  const accepted = provider({ ids: ['board'] });
  accepted.tabs[0].actions = [
    { id: 'back', label: 'Back', tone: 'ghost', icon: 'fas fa-arrow-left', onSelect: () => {} },
    { id: 'delete', label: 'Delete', tone: 'danger', disabled: true, onSelect: () => {} },
    { id: 'save', label: 'Save', tone: 'primary', onSelect: () => {} },
  ];
  assert.doesNotThrow(() =>
    createManagerExtensionsRegistry({ emitHook: () => {} }).publicApi.registerWorldNavProvider(
      accepted
    )
  );
});

// The runtime channel's shape contract. It is validated by the same module that validates a
// provider, and to the same standard: a malformed update is refused with a message rather than
// rendering broken chrome.
test('a runtime chrome update normalizes to exactly what a companion stated', () => {
  assert.equal(normalizeRouteChrome(null), null);
  assert.equal(normalizeRouteChrome(undefined), null);
  assert.equal(
    normalizeRouteChrome({}),
    null,
    'an empty update means the same as no update: fall back to the tab’s own chrome'
  );

  const onSelect = () => {};
  const chrome = normalizeRouteChrome({
    title: 'Crew of the Wandering Star',
    subtitle: 'Downtime project · 3 of 8 progress',
    breadcrumb: 'Crew',
    actionsLabel: 'Crew editor actions',
    image: 'icons/commodities/treasure/token-gold-gem.webp',
    status: { label: 'Unsaved' },
    actions: [{ id: 'save', label: 'Save', tone: 'primary', onSelect }],
  });
  assert.ok(Object.isFrozen(chrome), 'Core renders from a frozen value');
  assert.equal(chrome.title, 'Crew of the Wandering Star');
  assert.equal(chrome.breadcrumb, 'Crew');
  assert.equal(chrome.image, 'icons/commodities/treasure/token-gold-gem.webp');
  assert.equal(chrome.icon, undefined, 'an omitted field is genuinely absent, not empty-string');
  assert.deepEqual(
    chrome.status,
    { label: 'Unsaved', tone: 'warning', tooltip: undefined },
    'an omitted tone resolves to the warning tone every Core editor already uses'
  );
  assert.ok(Object.isFrozen(chrome.status));
  assert.equal(chrome.actions[0].onSelect, onSelect, 'the descriptor stays the companion’s');
  assert.ok(Object.isFrozen(chrome.actions), 'the list Core renders is not one a companion may splice');

  const empty = normalizeRouteChrome({ actions: [] });
  assert.deepEqual(empty.actions, [], 'an EMPTY action list is a statement, not an omission');
});

test('a malformed runtime chrome update is refused with a message naming the fault', () => {
  const cases = [
    [7, /must be an object, or null to restore the tab's chrome/],
    [[], /must be an object, or null to restore the tab's chrome/],
    [{ title: '   ' }, /requires a non-empty title/],
    [{ subtitle: 4 }, /requires a non-empty subtitle/],
    [{ breadcrumb: '' }, /requires a non-empty breadcrumb/],
    [{ actionsLabel: null }, /requires a non-empty actionsLabel/],
    [{ icon: '' }, /requires a non-empty icon/],
    [{ image: 12 }, /requires a non-empty image/],
    [
      { icon: 'fas fa-scroll', image: 'icons/svg/book.svg' },
      /declares both icon and image, which are exclusive/,
    ],
    // A typo has to be LOUD here. A chrome update happens on a drill-down click, where a
    // silently ignored key leaves the previous header on screen with nothing to say why.
    [{ titel: 'Crew' }, /does not accept "titel"/],
    [{ tabId: 'crew' }, /does not accept "tabId"/],
    [{ status: 'Unsaved' }, /status must be an object/],
    [{ status: {} }, /status requires a non-empty label/],
    [{ status: { label: 'Unsaved', tone: 'urgent' } }, /status tone must be one of/],
    [{ status: { label: 'Unsaved', tooltip: '' } }, /status requires a non-empty tooltip/],
    [{ status: { label: 'Unsaved', text: 'x' } }, /status does not accept "text"/],
    [{ actions: 'save' }, /actions must be an array/],
    [{ actions: [{ id: 'save', label: 'Save' }] }, /must declare exactly one of href, onSelect/],
    [
      { actions: [{ id: 'guide', label: 'Guide', href: 'javascript:alert(1)' }] },
      /href must be an absolute http\(s\) URL/,
    ],
  ];
  for (const [candidate, expected] of cases) {
    assert.throws(() => normalizeRouteChrome(candidate), expected, `expected ${expected}`);
  }
});

// A hand-maintained mirror across a component boundary, with a guard so it cannot rot: the
// seam names the tones it offers, and `Chip.svelte` is what paints them. A tone offered here
// that the primitive drops would render as the default chip and look like a CSS bug.
test('every status tone the seam offers is a tone the Chip primitive actually paints', () => {
  const chipSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/Chip.svelte'),
    'utf8'
  );
  const declared = chipSource.slice(
    chipSource.indexOf('const TONES = new Set(['),
    chipSource.indexOf('const classes = $derived(')
  );
  assert.ok(declared.includes("'active'"), 'the Chip tone set was found, so this guard has teeth');
  for (const tone of ROUTE_CHROME_STATUS_TONES) {
    assert.ok(
      declared.includes(`'${tone}'`),
      `Chip must paint "${tone}", or the seam is offering a tone that renders as the default`
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
