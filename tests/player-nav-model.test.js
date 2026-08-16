import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTENSION_ROUTE_PREFIX,
  buildPlayerNavTabs,
  buildRouteKey,
  deriveExtensionSurfaces,
  isCoreTabId,
  parseRouteKey,
  resolveActiveTab,
} from '../src/ui/playerNavModel.js';
import { createPlayerExtensionsRegistry } from '../src/ui/playerExtensions.js';

// The shell's own tab table, reproduced here as INPUT rather than as an expectation: these
// functions take the Core table as a parameter precisely so nothing downstream has to hold
// a second copy of it.
const CORE_TABS = [
  { id: 'crafting', icon: 'fa-hammer', label: 'FABRICATE.App.Nav.Crafting' },
  { id: 'alchemy', icon: 'fa-flask', label: 'FABRICATE.App.Nav.Alchemy', requires: 'alchemy' },
  { id: 'gathering', icon: 'fa-leaf', label: 'FABRICATE.App.Nav.Gathering' },
  { id: 'journal', icon: 'fa-book-open', label: 'FABRICATE.App.Nav.Journal' },
  { id: 'inventory', icon: 'fa-boxes-stacked', label: 'FABRICATE.App.Nav.Inventory' },
];

const localize = (key) => `localized(${key})`;

function surface(surfaceId, tabs) {
  return { surfaceId, provider: { apiVersion: 1, id: surfaceId, tabs, mount: () => undefined } };
}

function build(options = {}) {
  return buildPlayerNavTabs({ coreTabs: CORE_TABS, localize, ...options });
}

test('a route key round-trips, and only a well-formed one parses', () => {
  assert.equal(buildRouteKey('downtime', 'board'), 'ext:downtime:board');
  assert.equal(EXTENSION_ROUTE_PREFIX, 'ext');
  assert.deepEqual(parseRouteKey(buildRouteKey('crew-quarters', 'roster')), {
    surfaceId: 'crew-quarters',
    tabId: 'roster',
  });
  assert.ok(Object.isFrozen(parseRouteKey('ext:downtime:board')), 'parsed parts are frozen');

  const notRouteKeys = [
    'crafting',
    '',
    'ext:downtime',
    'ext:downtime:board:extra',
    'ext::board',
    'ext:downtime:',
    'other:downtime:board',
    null,
    undefined,
    42,
    ['ext', 'downtime', 'board'],
  ];
  for (const candidate of notRouteKeys) {
    assert.equal(parseRouteKey(candidate), null, `${JSON.stringify(candidate)} is not a route key`);
  }
});

test('isCoreTabId separates a Core tab id from a provider route key without enumerating ids', () => {
  for (const tab of CORE_TABS) assert.ok(isCoreTabId(tab.id), `${tab.id} is a Core id`);
  assert.equal(isCoreTabId('ext:downtime:board'), false);
  assert.equal(isCoreTabId(''), false);
  assert.equal(isCoreTabId(null), false);
  assert.equal(isCoreTabId(undefined), false);
  assert.equal(isCoreTabId(7), false);
  assert.ok(
    isCoreTabId('ext:downtime'),
    'a malformed key is not a route key, so it is not treated as one'
  );
});

test('deriveExtensionSurfaces snapshots the registry in its own registration order', () => {
  const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
  assert.deepEqual(deriveExtensionSurfaces(registry), []);
  assert.deepEqual(deriveExtensionSurfaces(null), [], 'a missing registry derives nothing');

  const first = surface('downtime', [{ id: 'board', label: 'B', icon: 'fas fa-b' }]).provider;
  const second = surface('crew-quarters', [
    { id: 'roster', label: 'R', icon: 'fas fa-r' },
  ]).provider;
  registry.publicApi.registerPlayerNavProvider(first);
  const releaseSecond = registry.publicApi.registerPlayerNavProvider(second);

  const surfaces = deriveExtensionSurfaces(registry);
  assert.deepEqual(
    surfaces.map((entry) => entry.surfaceId),
    ['downtime', 'crew-quarters']
  );
  assert.equal(surfaces[0].provider, first);
  assert.ok(Object.isFrozen(surfaces), 'the snapshot array is frozen');
  assert.ok(Object.isFrozen(surfaces[0]), 'each surface entry is frozen');

  releaseSecond();
  assert.deepEqual(
    deriveExtensionSurfaces(registry).map((entry) => entry.surfaceId),
    ['downtime'],
    'the snapshot is re-derived, never mutated in place'
  );
});

test('Core labels are localized and Core icons gain the family; provider text is verbatim', () => {
  const tabs = build({
    showAlchemy: true,
    extensionSurfaces: [
      surface('downtime', [
        { id: 'board', label: 'FABRICATE.App.Nav.Crafting', icon: 'fab fa-patreon' },
      ]),
    ],
  });

  const crafting = tabs.find((tab) => tab.routeKey === 'crafting');
  assert.equal(crafting.text, 'localized(FABRICATE.App.Nav.Crafting)');
  assert.equal(crafting.iconClass, 'fas fa-hammer', 'Core supplies a bare glyph and Core prefixes');

  // The label is a lang key that WOULD have localized, which is the whole point: a
  // provider's label is final display text and must never be fed to the localizer.
  const board = tabs.find((tab) => tab.routeKey === 'ext:downtime:board');
  assert.equal(board.text, 'FABRICATE.App.Nav.Crafting');
  assert.equal(board.iconClass, 'fab fa-patreon', 'a provider supplies the whole class list');
});

test('provider tabs are appended after the Core tabs, grouped by surface in provider order', () => {
  const tabs = build({
    extensionSurfaces: [
      surface('downtime', [
        { id: 'board', label: 'Board', icon: 'fas fa-b' },
        { id: 'ledger', label: 'Ledger', icon: 'fas fa-l' },
      ]),
      surface('crew-quarters', [{ id: 'roster', label: 'Roster', icon: 'fas fa-r' }]),
    ],
  });

  assert.deepEqual(
    tabs.map((tab) => tab.routeKey),
    [
      'crafting',
      'gathering',
      'journal',
      'inventory',
      'ext:downtime:board',
      'ext:downtime:ledger',
      'ext:crew-quarters:roster',
    ],
    'Alchemy is gated off, and provider entries follow Core in registration then array order'
  );
  assert.ok(Object.isFrozen(tabs), 'the rail model is frozen');
  assert.ok(tabs.every((tab) => Object.isFrozen(tab)));

  const withAlchemy = build({ showAlchemy: true });
  assert.deepEqual(
    withAlchemy.map((tab) => tab.routeKey),
    ['crafting', 'alchemy', 'gathering', 'journal', 'inventory']
  );
});

// D3's projection rule. The rail renders a count badge for ANY entry with a positive
// `count`, so a spread would hand a provider an unvalidated, unbounded badge — the exact
// feature this seam places out of scope — with its route key in the badge's data attribute.
test('a provider tab is projected through an allowlist, so an undeclared field cannot reach the rail', () => {
  const tabs = build({
    journalNavCount: 4,
    extensionSurfaces: [
      surface('downtime', [
        {
          id: 'board',
          label: 'Board',
          icon: 'fas fa-b',
          accessibleName: 'Board — downtime projects',
          tooltip: 'Ongoing projects',
          count: 12,
          requires: 'alchemy',
          title: 'Company Board',
          subtitle: 'Six crew',
          breadcrumb: 'Board',
          actionsLabel: 'Board actions',
          actions: [{ id: 'new', label: 'New', onSelect: () => {} }],
          isExtension: false,
          routeKey: 'crafting',
          text: 'hijacked',
          iconClass: 'fas fa-skull',
        },
      ]),
    ],
  });

  const board = tabs.at(-1);
  assert.deepEqual(Object.keys(board).sort(), [
    'accessibleName',
    'count',
    'iconClass',
    'isExtension',
    'routeKey',
    'surfaceId',
    'tabId',
    'text',
    'tooltip',
  ]);
  assert.deepEqual(board, {
    accessibleName: 'Board — downtime projects',
    count: 0,
    iconClass: 'fas fa-b',
    isExtension: true,
    routeKey: 'ext:downtime:board',
    surfaceId: 'downtime',
    tabId: 'board',
    text: 'Board',
    tooltip: 'Ongoing projects',
  });
  assert.equal(board.count, 0, 'a provider-declared count renders no badge');
});

test('the live count reaches the Journal entry only, and a nonsense count is normalised away', () => {
  const withCount = build({ journalNavCount: 3 });
  assert.deepEqual(
    withCount.map((tab) => [tab.routeKey, tab.count]),
    [
      ['crafting', 0],
      ['gathering', 0],
      ['journal', 3],
      ['inventory', 0],
    ]
  );
  for (const value of [0, -1, NaN, undefined, null, 'many']) {
    const journal = build({ journalNavCount: value }).find((tab) => tab.routeKey === 'journal');
    assert.equal(journal.count, 0, `${String(value)} renders no badge`);
  }
});

test('a provider tab omitting the optional fields projects them as null, never as undefined', () => {
  const board = build({
    extensionSurfaces: [surface('downtime', [{ id: 'board', label: 'Board', icon: 'fas fa-b' }])],
  }).at(-1);
  assert.equal(board.accessibleName, null);
  assert.equal(board.tooltip, null);

  const core = build().at(0);
  assert.equal(core.accessibleName, null, 'a Core tab never carries a provider-only field');
  assert.equal(core.tooltip, null);
  assert.equal(core.surfaceId, null);
  assert.equal(core.isExtension, false);
});

test('buildPlayerNavTabs refuses to run without a localizer rather than rendering lang keys', () => {
  assert.throws(() => buildPlayerNavTabs({ coreTabs: CORE_TABS }), /requires a localize function/);
  assert.throws(
    () => buildPlayerNavTabs({ coreTabs: CORE_TABS, localize: 'nope' }),
    /requires a localize function/
  );
  assert.deepEqual(buildPlayerNavTabs({ localize }), [], 'no Core table derives no Core tabs');
});

test('resolveActiveTab keeps an offered tab and falls back through every other branch', () => {
  const registered = build({
    extensionSurfaces: [
      surface('downtime', [
        { id: 'board', label: 'Board', icon: 'fas fa-b' },
        { id: 'ledger', label: 'Ledger', icon: 'fas fa-l' },
      ]),
    ],
  });

  // Still offered — Core and provider alike.
  assert.equal(resolveActiveTab('crafting', registered, 'crafting'), 'crafting');
  assert.equal(
    resolveActiveTab('ext:downtime:board', registered, 'crafting'),
    'ext:downtime:board'
  );

  // Unregistration: the surface is gone entirely.
  const unregistered = build();
  assert.equal(resolveActiveTab('ext:downtime:board', unregistered, 'crafting'), 'crafting');

  // Re-registration with a narrower set: the surface survives, the active tab does not.
  const narrowed = build({
    extensionSurfaces: [surface('downtime', [{ id: 'ledger', label: 'Ledger', icon: 'fas fa-l' }])],
  });
  assert.equal(resolveActiveTab('ext:downtime:board', narrowed, 'crafting'), 'crafting');
  assert.equal(
    resolveActiveTab('ext:downtime:ledger', narrowed, 'crafting'),
    'ext:downtime:ledger'
  );

  // A route key that never existed, and a Core id that is gated off.
  assert.equal(resolveActiveTab('ext:nowhere:board', registered, 'crafting'), 'crafting');
  assert.equal(resolveActiveTab('alchemy', registered, 'crafting'), 'crafting');

  // Nothing usable to resolve at all.
  for (const value of [null, undefined, '', 42, {}]) {
    assert.equal(resolveActiveTab(value, registered, 'crafting'), 'crafting');
  }
  assert.equal(resolveActiveTab('crafting', null, 'crafting'), 'crafting');
  assert.equal(resolveActiveTab('crafting', [], 'crafting'), 'crafting');
});
