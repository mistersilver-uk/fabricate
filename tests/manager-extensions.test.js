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
import { navTabBadgeTotal, resolveNavTabBadge } from '../src/ui/navTabBadgeStore.js';
import { createPlayerExtensionsRegistry } from '../src/ui/playerExtensions.js';

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
    candidate.tabs[0].actions = [{ id: 'save', label: 'Save', onSelect: () => {}, ...overrides }];
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
  assert.ok(
    Object.isFrozen(chrome.actions),
    'the list Core renders is not one a companion may splice'
  );

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

// ---------------------------------------------------------------------------------------
// Issue 1302 — a tab may carry a BADGE, the tab contract becomes a closed key set, and the
// runtime channel that restates a badge is scoped to the REGISTRATION rather than to a mount.
// ---------------------------------------------------------------------------------------

// Badges are attached to the shared `provider()` fixture here rather than inside it, so every
// test above keeps registering the same badge-free tabs it always did.
function badgedProvider({ badges = {}, ...options } = {}) {
  const extension = provider(options);
  for (const tab of extension.tabs) {
    if (badges[tab.id] !== undefined) tab.badge = badges[tab.id];
  }
  return extension;
}

// ONE table, TWO callers. The same function validates a badge at registration and on the
// runtime channel, so a refusal that differed between them would be a defect a companion
// could only find by trying both — and each fragment names the field the author must fix.
const REFUSED_BADGES = Object.freeze([
  [{ count: 3, accessibleName: 'three', tone: 'warning' }, 'does not accept "tone"'],
  [{ count: 3, accessibleName: 'three', label: 'Claims' }, 'does not accept "label"'],
  [{ count: 3 }, 'requires a non-empty accessibleName'],
  [{ count: 3, accessibleName: '' }, 'requires a non-empty accessibleName'],
  [{ count: 3, accessibleName: '   ' }, 'requires a non-empty accessibleName'],
  [{ count: 3, accessibleName: 7 }, 'requires a non-empty accessibleName'],
  [{ accessibleName: 'three' }, 'requires a non-negative integer count'],
  [{ count: -1, accessibleName: 'three' }, 'requires a non-negative integer count'],
  [{ count: 1.5, accessibleName: 'three' }, 'requires a non-negative integer count'],
  [{ count: '3', accessibleName: 'three' }, 'requires a non-negative integer count'],
  [{ count: Number.NaN, accessibleName: 'three' }, 'requires a non-negative integer count'],
  [
    { count: Number.POSITIVE_INFINITY, accessibleName: 'three' },
    'requires a non-negative integer count',
  ],
  [
    { count: Number.MAX_SAFE_INTEGER + 1, accessibleName: 'three' },
    'requires a non-negative integer count',
  ],
  [7, 'must be an object, or null to clear it'],
  [[{ count: 3, accessibleName: 'three' }], 'must be an object, or null to clear it'],
]);

const ACCEPTED_BADGES = Object.freeze([
  { count: 0, accessibleName: 'Nothing waiting' },
  { count: 1200, accessibleName: '1200 claims waiting' },
]);

function refusal(fragment) {
  return (error) =>
    error instanceof TypeError &&
    error.message.includes(fragment) &&
    error.message.startsWith('Fabricate World navigation');
}

// A registry read the way CORE reads it: `subscribeNavTabBadges` replays immediately and
// republishes on every change, so `snapshot()` is always the record the rail would render
// from at that instant. Reading through the subscription rather than through the store's own
// accessor also means a channel that stored correctly and published nothing fails here.
function badgeHarness() {
  const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
  let latest = null;
  registry.subscribeNavTabBadges(WORLD_DOWNTIME_SURFACE_ID, (badges) => {
    latest = badges;
  });
  return {
    registry,
    register: (extension) => registry.publicApi.registerWorldNavProvider(extension),
    setBadge: (...args) => registry.publicApi.setWorldNavTabBadge(...args),
    tab: (tabId) =>
      registry
        .getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID)
        .tabs.find((candidate) => candidate.id === tabId),
    snapshot: () => latest,
  };
}

test('AC-1 — a tab may declare a badge, and Core renders it back frozen and unchanged', () => {
  const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
  const extension = badgedProvider({
    ids: ['ledger'],
    badges: { ledger: { count: 3, accessibleName: '3 claims waiting' } },
  });

  registry.publicApi.registerWorldNavProvider(extension);
  const [tab] = registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID).tabs;
  assert.deepEqual(tab.badge, { count: 3, accessibleName: '3 claims waiting' });

  // Frozen IN PLACE, not replaced by a normalized copy: the registry stores the companion's
  // own object by reference and Core renders straight from it, so an unfrozen badge could be
  // rewritten after registration and the rail would show a value nothing validated.
  assert.ok(Object.isFrozen(tab.badge), 'the badge Core renders is frozen');
  assert.throws(() => {
    tab.badge.count = 9;
  }, TypeError);
  assert.equal(tab.badge.count, 3, 'the count survives an attempt to rewrite it');
});

test('AC-2 — a malformed badge is refused at registration and the registry is unchanged', () => {
  for (const [badge, fragment] of REFUSED_BADGES) {
    const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
    assert.throws(
      () =>
        registry.publicApi.registerWorldNavProvider(
          badgedProvider({ ids: ['ledger'], badges: { ledger: badge } })
        ),
      refusal(fragment),
      `expected ${fragment} for ${JSON.stringify(badge)}`
    );
    assert.ok(
      !registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID),
      'a refused registration leaves the registry holding nothing'
    );
    // The message has to name the TAB as well as the field, because a provider may declare
    // seven tabs and "requires a non-negative integer count" alone names none of them.
    assert.throws(
      () =>
        registry.publicApi.registerWorldNavProvider(
          badgedProvider({ ids: ['ledger'], badges: { ledger: badge } })
        ),
      /tab "ledger" badge /,
      'the refusal names the offending tab'
    );
  }

  for (const badge of ACCEPTED_BADGES) {
    const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
    registry.publicApi.registerWorldNavProvider(
      badgedProvider({ ids: ['ledger'], badges: { ledger: { ...badge } } })
    );
    assert.deepEqual(
      registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID).tabs[0].badge,
      badge,
      `${badge.count} is a count a companion may state`
    );
  }
});

test('AC-3 — the tab key set is closed, and every key it names still registers', () => {
  const registry = createManagerExtensionsRegistry({ emitHook: () => {} });
  const mistyped = provider({ ids: ['ledger'] });
  mistyped.tabs[0].badgeCount = 3;
  assert.throws(
    () => registry.publicApi.registerWorldNavProvider(mistyped),
    (error) =>
      error instanceof TypeError &&
      error.message ===
        'Fabricate World navigation provider tab "ledger" does not accept "badgeCount"',
    'a key Core does not name is refused deterministically, not accepted and dropped'
  );
  assert.ok(
    !registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID),
    'a refused registration leaves the registry holding nothing'
  );

  // The other half, and the one that would catch a key set that closed too far: the five
  // required fields alone still register, the shipped optional-field case above still
  // registers, and a tab stating EVERY named key at once registers.
  assert.doesNotThrow(() => badgeHarness().register(provider({ ids: ['ledger'] })));

  const everyKey = provider({ ids: ['ledger'] });
  Object.assign(everyKey.tabs[0], {
    title: 'Company Ledger',
    subtitle: 'Six crew · two projects',
    breadcrumb: 'Ledger',
    actionsLabel: 'Ledger actions',
    actions: [{ id: 'save', label: 'Save', onSelect: () => {} }],
    badge: { count: 3, accessibleName: '3 claims waiting' },
  });
  const full = badgeHarness();
  assert.doesNotThrow(() => full.register(everyKey));
  assert.equal(full.tab('ledger').badge.count, 3);
});

test('AC-4 — setWorldNavTabBadge states a badge at runtime on a surface a provider holds', () => {
  const harness = badgeHarness();
  harness.register(badgedProvider({ ids: ['ledger'] }));

  const badge = { count: 1200, accessibleName: '1200 claims waiting' };
  assert.equal(harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', badge), true);
  assert.deepEqual(
    resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()),
    badge,
    'the rail resolves the runtime value, with no mount and no remount'
  );
});

test('AC-5 — an unheld surface and an undeclared tab are refused, and store nothing', () => {
  const harness = badgeHarness();
  const otherSurface = [];
  harness.registry.subscribeNavTabBadges('crew-quarters', (badges) => otherSurface.push(badges));
  harness.register(badgedProvider({ ids: ['ledger'] }));
  const badge = { count: 3, accessibleName: '3 claims waiting' };

  assert.equal(
    harness.setBadge('crew-quarters', 'roster', badge),
    false,
    'a surface no provider holds is refused'
  );
  assert.equal(
    otherSurface.length,
    1,
    'only the subscription replay published: nothing was stored for that surface'
  );
  assert.deepEqual(Object.keys(otherSurface[0]), []);

  assert.equal(
    harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'crew', badge),
    false,
    'a tab the holding provider does not declare is refused'
  );
  assert.deepEqual(
    Object.keys(harness.snapshot()),
    [],
    'a badge for a tab that may never exist is refused rather than parked'
  );
});

test('AC-6 — validation precedes the liveness check, and a refused call changes nothing', () => {
  const harness = badgeHarness();

  // The refusal is IDENTICAL whoever sent it. A companion feature-detecting this seam must
  // not get `false` from one Core and a `TypeError` from another because a second module
  // happened to register first.
  for (const [badge, fragment] of REFUSED_BADGES) {
    assert.throws(
      () => harness.setBadge('nobody-holds-this', 'ledger', badge),
      refusal(fragment),
      `an unheld surface still throws for ${JSON.stringify(badge)}`
    );
  }

  harness.register(badgedProvider({ ids: ['ledger'] }));
  const stated = { count: 3, accessibleName: '3 claims waiting' };
  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', stated);
  for (const [badge, fragment] of REFUSED_BADGES) {
    assert.throws(
      () => harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', badge),
      refusal(fragment),
      `a held surface refuses ${JSON.stringify(badge)} the same way`
    );
  }
  assert.deepEqual(
    resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()),
    stated,
    'a refused call leaves the rail showing what it showed already'
  );
});

test('AC-7 — a badge resolves through three layers, in one order', () => {
  const harness = badgeHarness();
  const registered = { count: 3, accessibleName: '3 claims waiting' };
  harness.register(
    badgedProvider({ ids: ['ledger', 'writs'], badges: { ledger: { ...registered } } })
  );

  assert.deepEqual(
    resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()),
    registered,
    'layer two: the tab renders its registered badge with nothing on the runtime channel'
  );

  const runtime = { count: 9, accessibleName: '9 claims waiting' };
  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', runtime);
  assert.deepEqual(
    resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()),
    runtime,
    'layer one: the runtime badge overrides the registered one'
  );

  assert.equal(harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', null), true);
  assert.deepEqual(
    resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()),
    registered,
    'null CLEARS the runtime layer rather than storing an empty one'
  );

  assert.ok(
    !resolveNavTabBadge(harness.tab('writs'), harness.snapshot()),
    'layer three: a tab with no registered badge and no runtime one has no badge'
  );
  assert.equal(harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'writs', null), true);
  assert.ok(
    !resolveNavTabBadge(harness.tab('writs'), harness.snapshot()),
    'clearing a layer that was never set leaves the tab with no badge, not an empty one'
  );

  // A POSITIVE ZERO. `{ count: 0 }` is the companion stating that the tab holds nothing,
  // which is a different claim from stating no count at all — the direct analogue of an
  // empty `actions` array, and it must not fall back to the registered 3.
  const zero = { count: 0, accessibleName: 'Nothing waiting' };
  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', zero);
  assert.deepEqual(resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()), zero);
});

test('AC-8 — runtime badges are keyed per tab, and clearing one leaves the other', () => {
  const harness = badgeHarness();
  harness.register(badgedProvider({ ids: ['ledger', 'crew'] }));
  const ledger = { count: 3, accessibleName: '3 claims waiting' };
  const crew = { count: 2, accessibleName: '2 crew idle' };

  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', ledger);
  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'crew', crew);
  assert.deepEqual(resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()), ledger);
  assert.deepEqual(resolveNavTabBadge(harness.tab('crew'), harness.snapshot()), crew);

  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', null);
  assert.ok(!resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()));
  assert.deepEqual(
    resolveNavTabBadge(harness.tab('crew'), harness.snapshot()),
    crew,
    'clearing one tab is not clearing the surface'
  );
});

test('AC-9 — a runtime badge is scoped to the registration and dropped with it', () => {
  const harness = badgeHarness();
  const registered = { count: 3, accessibleName: '3 claims waiting' };
  const unregister = harness.register(
    badgedProvider({ ids: ['ledger'], badges: { ledger: { ...registered } } })
  );
  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', {
    count: 9,
    accessibleName: '9 claims waiting',
  });

  unregister();
  assert.deepEqual(
    Object.keys(harness.snapshot()),
    [],
    'a surface leaving the registry takes its runtime badges with it'
  );

  harness.register(badgedProvider({ ids: ['ledger'], badges: { ledger: { ...registered } } }));
  assert.deepEqual(
    resolveNavTabBadge(harness.tab('ledger'), harness.snapshot()),
    registered,
    'a re-registered provider starts from its OWN registered badge, not the last one set'
  );
});

test('AC-10 — the two registries publish exactly the methods each of them owns', () => {
  assert.deepEqual(
    Object.keys(createManagerExtensionsRegistry({ emitHook: () => {} }).publicApi),
    ['registerWorldNavProvider', 'setWorldNavTabBadge'],
    'the Manager seam gains the badge setter, and gains nothing else'
  );
  // The negative alone never proved the option works, and the positive alone never proved it
  // stayed on one side of the seam. Both, or neither is evidence.
  assert.deepEqual(
    Object.keys(createPlayerExtensionsRegistry({ emitHook: () => {} }).publicApi),
    ['registerPlayerNavProvider'],
    'the player seam is untouched by a Manager-only feature'
  );
});

test('AC-22 — navTabBadgeTotal sums the RESOLVED badge once per tab, never registered plus runtime', () => {
  const tabs = [
    { id: 'ledger', badge: { count: 3, accessibleName: '3 claims waiting' } },
    { id: 'crew', badge: { count: 2, accessibleName: '2 crew idle' } },
    { id: 'writs' },
  ];

  assert.equal(navTabBadgeTotal(tabs, null), 5, 'the registered layer alone totals 5');
  assert.equal(
    navTabBadgeTotal(tabs, { ledger: { count: 5, accessibleName: '5 claims waiting' } }),
    7,
    'the runtime layer OVERRIDES the registered one: 7, and never the additive 10'
  );
  // Clearing a runtime badge is an ABSENT key, not a key holding `null`: the store deletes
  // the entry rather than storing an empty one, which is what makes "never set" and "set then
  // cleared" indistinguishable to every reader. The real clear is driven below.
  assert.equal(
    navTabBadgeTotal(tabs, {}),
    5,
    'clearing the runtime layer returns the total to the registered sum'
  );
  assert.equal(
    navTabBadgeTotal([{ id: 'ledger' }, { id: 'crew' }], null),
    0,
    'an un-badged tab contributes 0 rather than throwing'
  );
  assert.equal(navTabBadgeTotal([], null), 0);
  assert.equal(navTabBadgeTotal(null, null), 0);

  // The same arithmetic over the record the STORE actually publishes, which is a frozen
  // null-prototype object rather than a literal — so a total that reached for an inherited
  // member, or that could not read that shape at all, fails here too. `toString` is deliberately
  // among the tab ids: it is an inherited member of an ordinary object literal, so a plain
  // `{}` snapshot plus a bare (non-`Object.hasOwn`) lookup would resolve it to a function
  // rather than to "no badge" — the other three ids never collide with anything
  // `Object.prototype` carries. The TOTAL alone cannot witness that on its own: `?.count ?? 0`
  // reduces a wrongly-resolved function to 0 exactly as it reduces a correctly-resolved
  // `null`, since neither carries a `count`. So this block also reads `resolveNavTabBadge`
  // directly for the colliding tab, which is the one call that actually sees the function.
  const harness = badgeHarness();
  harness.register(
    badgedProvider({
      ids: ['ledger', 'crew', 'writs', 'toString'],
      // Null-prototype, deliberately: `badgedProvider` itself reads this table with a bare
      // `badges[tab.id]`, and a plain `{}` here would resolve `badges['toString']` to
      // `Object.prototype.toString` and badge the fixture's own tab by accident — the very
      // hazard this addition exists to exercise, just one call frame too early.
      badges: Object.assign(Object.create(null), {
        ledger: { count: 3, accessibleName: '3 claims waiting' },
        crew: { count: 2, accessibleName: '2 crew idle' },
      }),
    })
  );
  const registeredTabs = harness.registry.getWorldNavProvider(WORLD_DOWNTIME_SURFACE_ID).tabs;
  assert.equal(navTabBadgeTotal(registeredTabs, harness.snapshot()), 5);
  assert.equal(
    resolveNavTabBadge(harness.tab('toString'), harness.snapshot()),
    null,
    'an un-badged tab whose id collides with an inherited member still resolves to no badge'
  );
  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', {
    count: 5,
    accessibleName: '5 claims waiting',
  });
  assert.equal(navTabBadgeTotal(registeredTabs, harness.snapshot()), 7);
  harness.setBadge(WORLD_DOWNTIME_SURFACE_ID, 'ledger', null);
  assert.equal(navTabBadgeTotal(registeredTabs, harness.snapshot()), 5);
});

/**
 * The mount context's typedef is the seam's contract for a module this repository cannot see,
 * and it is a hand-maintained mirror of a literal in a Svelte file — so it rots in the silent
 * direction. A member added to the context without a `@property` is a public capability with
 * no contract at all: nothing fails, nothing warns, and a companion author reading the typedef
 * is reading a list that is no longer the list. Issue 1332 added the fourth such member, which
 * is the point at which "remember to document it" stops being a plan.
 *
 * It reads the CONTEXT LITERAL rather than a mounted context on purpose. Mounting is what
 * `tests/components/manager-mounted.test.js` does, and it can only see the members Core
 * happened to build for that mount; the literal is every member there is.
 *
 * @param {string} block The typedef's own comment text.
 * @returns {string[]} Every property name it documents, in order.
 */
function documentedProperties(block) {
  const names = [];
  for (const chunk of block.split('@property ').slice(1)) {
    // Step past the balanced `{type}`, which spans lines and carries its own braces on this
    // typedef — `onBeforeNavigate`'s type is a function returning a function.
    let depth = 0;
    let index = 0;
    for (; index < chunk.length; index += 1) {
      if (chunk[index] === '{') depth += 1;
      else if (chunk[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
    }
    // The name may sit on the next comment line when the type filled the first one.
    const name = chunk.slice(index).replace(/^[\s*]+/, '').match(/^\[?([\w$]+)/);
    if (name) names.push(name[1]);
  }
  return names;
}

test('every member Core puts on the mount context is documented in its typedef', () => {
  const rootSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
    'utf8'
  );
  const literalStart = rootSource.indexOf('const context = Object.freeze({');
  assert.notEqual(literalStart, -1, 'the Manager root still builds one frozen mount context');
  const literal = rootSource.slice(
    literalStart,
    rootSource.indexOf('\n    });', literalStart) + 1
  );
  // `[,:]` because the literal mixes keyed members with shorthand ones (`revision`), and a
  // colon-only pattern would silently drop every shorthand member from the comparison — which
  // would be this very guard failing in the direction it exists to catch.
  const supplied = [...literal.matchAll(/^ {6}(\w+)\s*[,:]/gm)].map((match) => match[1]);

  const extensionsSource = readFileSync(resolve(repoRoot, 'src/ui/managerExtensions.js'), 'utf8');
  const typedefStart = extensionsSource.indexOf(' * @typedef {object} WorldNavMountContext');
  assert.notEqual(typedefStart, -1, 'the typedef is still named WorldNavMountContext');
  const typedef = extensionsSource.slice(
    typedefStart,
    extensionsSource.indexOf('\n */', typedefStart)
  );
  const documented = documentedProperties(typedef);

  // TEETH, both ways round. A slice that silently matched nothing would make every assertion
  // below vacuously true, which is exactly the failure this guard exists to catch elsewhere.
  assert.ok(supplied.includes('schemaVersion'), 'the context literal was found and parsed');
  assert.ok(documented.includes('requestRemount'), 'the typedef was found and parsed');
  assert.deepEqual(
    [...supplied].sort(),
    [...documented].sort(),
    'the typedef documents every context member, and invents none'
  );
  assert.ok(
    supplied.includes('navigateToTab'),
    'the Manager root still publishes the tab-navigation member this contract describes'
  );
});

test('the typedef names what navigateToTab refuses, as its three siblings do', () => {
  // The acceptance this pins is documentary, so it is asserted structurally rather than by
  // matching prose: the member's own paragraph must state the two refusals a companion cannot
  // discover by calling it once — that a retired mount is refused, and that an unknown tab id
  // answers rather than throws while malformed input throws. A `@property` line that merely
  // named the member would pass a "is it documented" check and teach a companion nothing.
  const extensionsSource = readFileSync(resolve(repoRoot, 'src/ui/managerExtensions.js'), 'utf8');
  const start = extensionsSource.indexOf('navigateToTab Take the GM to');
  assert.notEqual(start, -1, 'the navigateToTab property is still documented on the typedef');
  const paragraph = extensionsSource.slice(start, extensionsSource.indexOf('\n */', start));
  for (const claim of [
    'WHAT IT REFUSES',
    'RETIRED',
    '`false`',
    '`TypeError`',
    'registered',
  ]) {
    assert.ok(paragraph.includes(claim), `the member's contract still states ${claim}`);
  }
});
