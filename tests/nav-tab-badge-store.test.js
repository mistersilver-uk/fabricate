import test from 'node:test';
import assert from 'node:assert/strict';

import { createNavTabBadgeStore, resolveNavTabBadge } from '../src/ui/navTabBadgeStore.js';

// This file exists for the reason `tests/extension-registry.test.js` does for its sibling:
// `tests/manager-extensions.test.js` — the regression proof for issue 1302, which must stay
// untouched — never constructs `createNavTabBadgeStore` directly, only ever reaching it
// through `createManagerExtensionsRegistry`. The module's own header claims its whole
// lifetime — validation ordering, liveness, per-tab keying, the surface drop and
// fault-contained publication — is unit-testable without mounting a component tree, "exactly
// as `routeChromeChannel.js` and `extensionRegistry.js` are". Those two have their own edges
// pinned in their own files; this one gets the same treatment here.

// A minimal but real `normalizeBadge`: it mints a FRESH frozen object per call, which is what
// the store's own `sameBadge` dedupe exists to see through — a stub returning the same
// reference every time would make that guard untestable.
function normalizeBadge(badge) {
  if (badge === null || badge === undefined) return null;
  if (typeof badge !== 'object' || Array.isArray(badge)) {
    throw new TypeError('badge stub requires an object, or null to clear it');
  }
  return Object.freeze({ ...badge });
}

function providerOf(tabIds) {
  return { tabs: tabIds.map((id) => ({ id })) };
}

function storeUnder({ providers = {}, ...overrides } = {}) {
  const reported = [];
  const store = createNavTabBadgeStore({
    normalizeBadge,
    findProvider: (surfaceId) => providers[surfaceId] ?? null,
    reportError: (...args) => reported.push(args),
    ...overrides,
  });
  return { store, reported };
}

test('the constructor requires both collaborators as functions', () => {
  assert.throws(
    () => createNavTabBadgeStore({ findProvider: () => null }),
    /requires normalizeBadge and findProvider functions/
  );
  assert.throws(
    () => createNavTabBadgeStore({ normalizeBadge: () => null }),
    /requires normalizeBadge and findProvider functions/
  );
  assert.throws(
    () => createNavTabBadgeStore(),
    /requires normalizeBadge and findProvider functions/
  );
});

test('setBadge requires non-empty ids and validates BEFORE asking about liveness', () => {
  const { store } = storeUnder();
  assert.throws(
    () => store.setBadge('', 'ledger', { count: 1, accessibleName: 'one' }),
    /surface id/
  );
  assert.throws(
    () => store.setBadge('downtime', '', { count: 1, accessibleName: 'one' }),
    /tab id/
  );

  // No provider holds "downtime" at all, yet a malformed badge still throws rather than
  // returning `false`: validation is unconditional, and a companion feature-detecting this
  // seam must not get a different answer depending on whether anyone holds the surface yet.
  assert.throws(
    () => store.setBadge('downtime', 'ledger', 7),
    /badge stub requires an object/,
    'a malformed badge throws even on a surface nobody holds'
  );
});

test('a well-formed badge for an unheld surface or an undeclared tab is refused, not parked', () => {
  const { store } = storeUnder({ providers: { downtime: providerOf(['ledger']) } });
  const badge = { count: 3, accessibleName: '3 waiting' };

  assert.equal(store.setBadge('nobody-holds-this', 'ledger', badge), false);
  assert.deepEqual(Object.keys(store.snapshotFor('nobody-holds-this')), []);

  assert.equal(
    store.setBadge('downtime', 'crew', badge),
    false,
    'the holding provider does not declare this tab'
  );
  assert.deepEqual(Object.keys(store.snapshotFor('downtime')), []);
});

test('runtime badges are keyed per tab, and clearing one leaves the other untouched', () => {
  const { store } = storeUnder({ providers: { downtime: providerOf(['ledger', 'crew']) } });
  const ledger = { count: 3, accessibleName: '3 waiting' };
  const crew = { count: 2, accessibleName: '2 idle' };

  assert.equal(store.setBadge('downtime', 'ledger', ledger), true);
  assert.equal(store.setBadge('downtime', 'crew', crew), true);
  assert.deepEqual(store.snapshotFor('downtime').ledger, ledger);
  assert.deepEqual(store.snapshotFor('downtime').crew, crew);

  assert.equal(store.setBadge('downtime', 'ledger', null), true, 'null clears just that tab');
  assert.deepEqual(Object.keys(store.snapshotFor('downtime')), ['crew']);
});

test('a surface holding nothing publishes the one shared empty snapshot', () => {
  const { store } = storeUnder({ providers: { downtime: providerOf(['ledger']) } });
  const badge = { count: 3, accessibleName: '3 waiting' };

  const neverSet = store.snapshotFor('downtime');
  store.setBadge('downtime', 'ledger', badge);
  store.setBadge('downtime', 'ledger', null);
  const setThenCleared = store.snapshotFor('downtime');

  // "Never set" and "set then cleared" are indistinguishable to every reader: the surface is
  // dropped from the internal map rather than left as an empty one.
  assert.equal(neverSet, setThenCleared);
});

test('retainSurfaces drops every surface absent from the kept set, and publishes the drop', () => {
  const { store } = storeUnder({
    providers: { downtime: providerOf(['ledger']), crew: providerOf(['roster']) },
  });
  store.setBadge('downtime', 'ledger', { count: 3, accessibleName: '3 waiting' });
  store.setBadge('crew', 'roster', { count: 1, accessibleName: '1 open' });

  const seenDowntime = [];
  store.subscribe('downtime', (snapshot) => seenDowntime.push(snapshot));

  store.retainSurfaces(['crew']);
  assert.deepEqual(Object.keys(store.snapshotFor('downtime')), []);
  assert.deepEqual(
    Object.keys(store.snapshotFor('crew')),
    ['roster'],
    'a retained surface keeps its badges'
  );
  assert.equal(
    seenDowntime.at(-1),
    store.snapshotFor('downtime'),
    'the drop is published to a subscriber'
  );
});

// ---------------------------------------------------------------------------------------
// The five edges this file exists to close: each is named for the mutation that survived it.
// ---------------------------------------------------------------------------------------

test('subscribe validates its surface id and its listener before storing either', () => {
  const { store } = storeUnder();
  assert.throws(
    () => store.subscribe('', () => {}),
    /subscription requires a non-empty surface id/
  );
  assert.throws(() => store.subscribe('downtime', null), /subscriber must be a function/);
  assert.throws(
    () => store.subscribe('downtime', 'not-a-function'),
    /subscriber must be a function/
  );
});

test('a throwing subscriber cannot break publication, and is reported through the injected sink', () => {
  const { store, reported } = storeUnder({ providers: { downtime: providerOf(['ledger']) } });
  const seen = [];

  // The immediate replay on subscribing goes through the same guard as a later publication.
  store.subscribe('downtime', () => {
    throw new Error('subscriber exploded');
  });
  store.subscribe('downtime', (snapshot) => seen.push(snapshot));
  assert.equal(reported.length, 1, 'the first subscriber threw on its own immediate replay');

  assert.doesNotThrow(() =>
    store.setBadge('downtime', 'ledger', { count: 3, accessibleName: '3 waiting' })
  );
  assert.equal(seen.length, 2, 'the well-behaved subscriber received its replay and the publish');
  assert.equal(seen.at(-1).ledger.count, 3);
  assert.equal(reported.length, 2, 'the throwing subscriber failed a second time, on the publish');
  assert.match(reported[0][0], /Manager nav badge subscriber failed/);
});

test('unsubscribe is idempotent, and a stale handle cannot silence a later resubscription', () => {
  const { store } = storeUnder({ providers: { downtime: providerOf(['ledger']) } });
  const received = [];
  const listener = (snapshot) => received.push(snapshot);

  const firstUnsubscribe = store.subscribe('downtime', listener);
  firstUnsubscribe();
  assert.doesNotThrow(
    () => firstUnsubscribe(),
    'a second call on an already-stopped handle is a no-op'
  );

  // The SAME function re-subscribes. A `Set` keys on reference, so this is one entry again —
  // and the stale handle above must not be able to reach it.
  store.subscribe('downtime', listener);
  received.length = 0;
  firstUnsubscribe();

  store.setBadge('downtime', 'ledger', { count: 4, accessibleName: '4 waiting' });
  assert.equal(received.length, 1, 'the live resubscription still receives the publish');
  assert.equal(received[0].ledger.count, 4);
});

test('restating a value-equal badge is a no-op: no republish, and no reader is woken', () => {
  const { store } = storeUnder({ providers: { downtime: providerOf(['ledger']) } });
  const seen = [];
  store.subscribe('downtime', (snapshot) => seen.push(snapshot));

  assert.equal(
    store.setBadge('downtime', 'ledger', { count: 3, accessibleName: '3 waiting' }),
    true
  );
  assert.equal(seen.length, 2, 'the immediate replay, then the first genuine publish');
  const publishedFirst = seen.at(-1);

  // A DIFFERENT object with the SAME count and accessibleName — the shape a companion's own
  // data listener would restate on every unrelated re-render, since `normalizeBadge` mints a
  // fresh frozen object per call.
  assert.equal(
    store.setBadge('downtime', 'ledger', { count: 3, accessibleName: '3 waiting' }),
    true,
    'restating the same value is still accepted'
  );
  assert.equal(seen.length, 2, 'but it publishes nothing new');
  assert.equal(seen.at(-1), publishedFirst, 'no reader comparing identity is woken for nothing');

  assert.equal(
    store.setBadge('downtime', 'ledger', { count: 4, accessibleName: '4 waiting' }),
    true
  );
  assert.equal(seen.length, 3, 'a genuinely different value still publishes');
});

test('the empty shared snapshot is null-prototype: it answers to nothing, not even an inherited member', () => {
  const { store } = storeUnder();
  const empty = store.snapshotFor('nobody-holds-this');
  assert.equal(Object.getPrototypeOf(empty), null, 'the shared empty snapshot inherits nothing');
  assert.equal(Object.hasOwn(empty, 'toString'), false);
  assert.equal(
    resolveNavTabBadge({ id: 'toString' }, empty),
    null,
    'a tab id colliding with an inherited member still resolves to no badge'
  );
});

test('a populated snapshot is also null-prototype, and a tab id collision resolves to no badge', () => {
  const { store } = storeUnder({ providers: { downtime: providerOf(['toString', 'ledger']) } });
  store.setBadge('downtime', 'ledger', { count: 2, accessibleName: '2 waiting' });

  const snapshot = store.snapshotFor('downtime');
  assert.equal(
    Object.getPrototypeOf(snapshot),
    null,
    'a populated snapshot inherits nothing either'
  );
  assert.equal(
    Object.hasOwn(snapshot, 'toString'),
    false,
    'no badge was ever stored for this tab id'
  );
  assert.equal(
    resolveNavTabBadge({ id: 'toString' }, snapshot),
    null,
    'reading it back rejects the inherited member rather than mistaking it for a badge'
  );
  assert.equal(
    resolveNavTabBadge({ id: 'ledger' }, snapshot).count,
    2,
    'the genuinely badged tab beside it is unaffected'
  );
});
