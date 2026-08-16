import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createExtensionRegistry,
  providerHookPayload,
  requireNonEmptyString,
} from '../src/ui/extensionRegistry.js';

// This file exists because `tests/manager-extensions.test.js` — the refactor's regression
// proof, which must stay untouched — never calls `bindPublicApi`, so the factory parameter
// most likely to be swapped between the two registries has no behavioural cover anywhere
// else. Everything here is pinned through the returned registry's OBSERVABLE behaviour, not
// through a source regex, and deliberately in a file the rest of this change does not edit.

const HOOKS = Object.freeze({
  registered: 'test.extension.registered',
  unregistered: 'test.extension.unregistered',
});

function fixtureProvider(id = 'downtime', tabIds = ['board']) {
  return {
    apiVersion: 1,
    id,
    tabs: tabIds.map((tabId) => ({ id: tabId })),
    mount: () => undefined,
  };
}

function registryUnder(overrides = {}) {
  const hooks = [];
  const registry = createExtensionRegistry({
    validateProvider: () => {},
    registeredHook: HOOKS.registered,
    unregisteredHook: HOOKS.unregistered,
    apiPropertyName: 'testExtensions',
    registerMethodName: 'registerTestProvider',
    getProviderMethodName: 'getTestProvider',
    listSurfaceIdsMethodName: 'listTestSurfaceIds',
    conflictNoun: 'Test navigation provider',
    errorNoun: 'test extension',
    subscriberFailureMessage: 'Fabricate | Test extension subscriber failed:',
    emitHook: (name, payload) => hooks.push([name, payload]),
    ...overrides,
  });
  return { registry, hooks };
}

test('bindPublicApi injects the public object under the INJECTED property name', () => {
  const { registry } = registryUnder();
  const api = {};

  const returned = registry.bindPublicApi(api);
  assert.equal(returned, api, 'the target is returned so a caller may chain');
  assert.deepEqual(Object.keys(api), ['testExtensions']);

  // Behavioural, not structural: registering THROUGH the injected property must reach this
  // registry. A bind that put the object on the right key but the wrong registry would pass
  // a key-name assertion and fail here.
  const provider = fixtureProvider();
  api.testExtensions.registerTestProvider(provider);
  assert.equal(registry.getTestProvider('downtime'), provider);
  assert.equal(registry.publicApi, api.testExtensions, 'the SAME frozen object is published');
  assert.ok(Object.isFrozen(api.testExtensions));
});

test('two registries bind to two different property names from the same factory', () => {
  // The proof that the property name is a PARAMETER rather than a constant the factory
  // happens to agree with: one shared target, two registries, two disjoint keys, and each
  // key reaching only its own registry.
  const first = registryUnder().registry;
  const second = registryUnder({
    apiPropertyName: 'otherExtensions',
    registerMethodName: 'registerOtherProvider',
    getProviderMethodName: 'getOtherProvider',
    listSurfaceIdsMethodName: 'listOtherSurfaceIds',
  }).registry;

  const api = {};
  first.bindPublicApi(api);
  second.bindPublicApi(api);
  assert.deepEqual(Object.keys(api).sort(), ['otherExtensions', 'testExtensions']);
  assert.deepEqual(Object.keys(api.testExtensions), ['registerTestProvider']);
  assert.deepEqual(Object.keys(api.otherExtensions), ['registerOtherProvider']);

  api.otherExtensions.registerOtherProvider(fixtureProvider('crew-quarters'));
  assert.deepEqual(second.listOtherSurfaceIds(), ['crew-quarters']);
  assert.deepEqual(first.listTestSurfaceIds(), [], 'neither registry can see the other bind');
});

test('bindPublicApi refuses a non-object target with a TypeError naming the registry', () => {
  const { registry } = registryUnder();
  // A function is rejected too. `typeof fn === 'function'`, so the shipped `typeof !==
  // 'object'` guard excludes callables — pinned here because the bind target is
  // `game.fabricate.api`, a plain object literal, and widening the guard later would be a
  // behaviour change rather than a tidy-up.
  for (const target of [null, undefined, '', 'api', 42, false, Symbol('api'), () => {}]) {
    assert.throws(
      () => registry.bindPublicApi(target),
      /^TypeError: Fabricate test extension API target must be an object$/,
      `${String(target)} is not a bindable target`
    );
  }
  // An array is an object and binds, which is what the message promises: the guard is
  // about bindability, not about a specific shape.
  const arrayTarget = [];
  assert.doesNotThrow(() => registry.bindPublicApi(arrayTarget));
  assert.ok(arrayTarget.testExtensions);
});

test('the injected hook edge is passed straight through on the registry', () => {
  const seen = [];
  const emitHook = (name, payload) => seen.push([name, payload]);
  const { registry } = registryUnder({ emitHook });

  assert.equal(registry.emitHook, emitHook, 'hosts share the registry OWN hook edge');
  registry.emitHook('test.extension.surfaceMounted', { surfaceId: 'downtime' });
  assert.deepEqual(seen, [['test.extension.surfaceMounted', { surfaceId: 'downtime' }]]);

  // And the registry's own registration hooks travel through that same edge.
  const release = registry.publicApi.registerTestProvider(fixtureProvider());
  release();
  assert.deepEqual(
    seen.slice(1).map(([name]) => name),
    [HOOKS.registered, HOOKS.unregistered]
  );
});

test('the accessor names, conflict noun and validator are injected rather than assumed', () => {
  const validated = [];
  const { registry } = registryUnder({ validateProvider: (provider) => validated.push(provider) });

  assert.deepEqual(
    Object.keys(registry).sort(),
    [
      'bindPublicApi',
      'emitHook',
      'getTestProvider',
      'listTestSurfaceIds',
      'publicApi',
      'subscribe',
      'subscribeSurfaceIds',
    ],
    'the getter and lister carry their injected names, which the manager suite pins'
  );

  const provider = fixtureProvider();
  registry.publicApi.registerTestProvider(provider);
  assert.deepEqual(validated, [provider], 'every registration goes through the injected validator');
  assert.throws(
    () => registry.publicApi.registerTestProvider(fixtureProvider()),
    /^Error: Test navigation provider "downtime" is already registered$/
  );
});

test('the shared string guard and hook-payload builder behave as both registries need', () => {
  assert.doesNotThrow(() => requireNonEmptyString('downtime', 'nope'));
  for (const value of ['', '   ', null, undefined, 7, {}, ['a']]) {
    assert.throws(() => requireNonEmptyString(value, 'boom'), /^TypeError: boom$/);
  }

  const payload = providerHookPayload(fixtureProvider('downtime', ['board', 'ledger']));
  assert.deepEqual(payload, {
    schemaVersion: 1,
    surfaceId: 'downtime',
    tabIds: ['board', 'ledger'],
  });
  assert.ok(Object.isFrozen(payload) && Object.isFrozen(payload.tabIds));
});
