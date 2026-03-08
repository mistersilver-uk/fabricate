import test from 'node:test';
import assert from 'node:assert/strict';
import { createSvelteApplicationMixin } from '../src/ui/svelte/SvelteApplicationMixinCore.js';

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

function makeDeps() {
  const mountCalls = [];
  const unmountCalls = [];
  let mountCounter = 0;

  const mountFn = (Component, options) => {
    const instance = { _id: ++mountCounter, Component, ...options };
    mountCalls.push({ Component, options, instance });
    return instance;
  };

  const unmountFn = (instance) => {
    unmountCalls.push(instance);
  };

  const createReactiveProps = (initial) => ({ ...initial });

  return { mountFn, unmountFn, createReactiveProps, mountCalls, unmountCalls };
}

class MockBase {
  async _prepareContext() {
    return {};
  }
  async close() {}
  _onClose() {}
  _onRender() {}
  _onPosition() {}
}

function makeWindowContent() {
  return { nodeType: 1, tagName: 'DIV', className: 'window-content' };
}

function buildApp(deps, overrides = {}) {
  const MixedClass = createSvelteApplicationMixin(MockBase, deps);

  class TestApp extends MixedClass {
    static SVELTE_COMPONENT = overrides.component !== undefined
      ? overrides.component
      : function FakeComponent() {};

    _prepareSvelteProps(context) {
      if (overrides.prepareSvelteProps) {
        return overrides.prepareSvelteProps(context);
      }
      return super._prepareSvelteProps(context);
    }
  }

  return new TestApp();
}

// ---------------------------------------------------------------------------
// Test 1: Throws if SVELTE_COMPONENT is not set
// ---------------------------------------------------------------------------
test('throws if SVELTE_COMPONENT is not set on subclass', async () => {
  const deps = makeDeps();
  const Mixed = createSvelteApplicationMixin(MockBase, deps);

  class NoComponentApp extends Mixed {}
  // SVELTE_COMPONENT inherited as null from the mixin

  const app = new NoComponentApp();
  const props = await app._renderHTML({}, {});
  const target = makeWindowContent();

  assert.throws(
    () => app._replaceHTML(props, target, {}),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes('must define static SVELTE_COMPONENT'),
        `unexpected message: ${err.message}`
      );
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// Test 2: _renderHTML returns the context object (wrapped as reactive props)
// ---------------------------------------------------------------------------
test('_renderHTML returns the props object', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const context = { foo: 1, bar: 'hello' };

  const result = await app._renderHTML(context, {});

  assert.ok(result !== null && typeof result === 'object');
  assert.equal(result.foo, 1);
  assert.equal(result.bar, 'hello');
});

// ---------------------------------------------------------------------------
// Test 3: First _replaceHTML calls mountFn with component, target, and props
// ---------------------------------------------------------------------------
test('first _replaceHTML calls mountFn with component, target, and props', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const context = { value: 42 };
  const target = makeWindowContent();

  const result = await app._renderHTML(context, {});
  app._replaceHTML(result, target, {});

  assert.equal(deps.mountCalls.length, 1);
  const call = deps.mountCalls[0];
  assert.equal(call.Component, app.constructor.SVELTE_COMPONENT);
  assert.equal(call.options.target, target);
  assert.equal(call.options.props.value, 42);
});

// ---------------------------------------------------------------------------
// Test 4: mountFn receives props from _prepareSvelteProps if overridden
// ---------------------------------------------------------------------------
test('mountFn receives props from _prepareSvelteProps if overridden', async () => {
  const deps = makeDeps();
  const app = buildApp(deps, {
    prepareSvelteProps: (ctx) => ({ bar: ctx.foo * 2 })
  });
  const target = makeWindowContent();

  const result = await app._renderHTML({ foo: 5 }, {});
  app._replaceHTML(result, target, {});

  assert.equal(deps.mountCalls.length, 1);
  assert.equal(deps.mountCalls[0].options.props.bar, 10);
  assert.equal(deps.mountCalls[0].options.props.foo, undefined);
});

// ---------------------------------------------------------------------------
// Test 5: Second _replaceHTML does NOT call mountFn again
// ---------------------------------------------------------------------------
test('second _replaceHTML does not call mountFn again', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const target = makeWindowContent();

  const result1 = await app._renderHTML({ x: 1 }, {});
  app._replaceHTML(result1, target, {});

  const result2 = await app._renderHTML({ x: 2 }, {});
  app._replaceHTML(result2, target, {});

  assert.equal(deps.mountCalls.length, 1);
});

// ---------------------------------------------------------------------------
// Test 6: Second _replaceHTML calls Object.assign on existing props
// ---------------------------------------------------------------------------
test('second _replaceHTML merges into existing props via Object.assign', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const target = makeWindowContent();

  const result1 = await app._renderHTML({ x: 1, y: 'original' }, {});
  app._replaceHTML(result1, target, {});

  const result2 = await app._renderHTML({ x: 99 }, {});
  app._replaceHTML(result2, target, {});

  // After second render, x should be updated and y should remain
  assert.equal(app._svelteProps.x, 99);
  assert.equal(app._svelteProps.y, 'original');
});

// ---------------------------------------------------------------------------
// Test 7: updateProps merges into reactive props
// ---------------------------------------------------------------------------
test('updateProps merges into reactive props', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const target = makeWindowContent();

  const result = await app._renderHTML({ a: 1 }, {});
  app._replaceHTML(result, target, {});

  app.updateProps({ newKey: 'val', a: 99 });

  assert.equal(app._svelteProps.newKey, 'val');
  assert.equal(app._svelteProps.a, 99);
});

// ---------------------------------------------------------------------------
// Test 8: updateProps before mount is a no-op (no throw)
// ---------------------------------------------------------------------------
test('updateProps before mount does not throw', () => {
  const deps = makeDeps();
  const app = buildApp(deps);

  assert.doesNotThrow(() => {
    app.updateProps({ key: 'value' });
  });
});

// ---------------------------------------------------------------------------
// Test 9: close() calls unmountFn with the mounted component
// ---------------------------------------------------------------------------
test('close calls unmountFn with the mounted component instance', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const target = makeWindowContent();

  const result = await app._renderHTML({}, {});
  app._replaceHTML(result, target, {});

  const mountedInstance = deps.mountCalls[0].instance;
  await app.close();

  assert.equal(deps.unmountCalls.length, 1);
  assert.equal(deps.unmountCalls[0], mountedInstance);
});

// ---------------------------------------------------------------------------
// Test 10: close() calls super.close()
// ---------------------------------------------------------------------------
test('close calls super.close', async () => {
  const deps = makeDeps();
  let superCloseCalled = false;

  class SpyBase extends MockBase {
    async close(options) {
      superCloseCalled = true;
    }
  }

  const Mixed = createSvelteApplicationMixin(SpyBase, deps);
  class App extends Mixed {
    static SVELTE_COMPONENT = function FakeComponent() {};
  }

  const app = new App();
  const result = await app._renderHTML({}, {});
  app._replaceHTML(result, makeWindowContent(), {});
  await app.close();

  assert.ok(superCloseCalled);
});

// ---------------------------------------------------------------------------
// Test 11: close() before mount does not call unmountFn
// ---------------------------------------------------------------------------
test('close before mount does not call unmountFn', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);

  await app.close();

  assert.equal(deps.unmountCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Test 12: _onPosition calls onResize prop if set
// ---------------------------------------------------------------------------
test('_onPosition calls onResize prop callback with width and height', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const target = makeWindowContent();

  let resizeArgs = null;
  const onResize = (args) => { resizeArgs = args; };

  const result = await app._renderHTML({ onResize }, {});
  app._replaceHTML(result, target, {});

  app._onPosition({ width: 800, height: 600, left: 0, top: 0 });

  assert.ok(resizeArgs !== null);
  assert.equal(resizeArgs.width, 800);
  assert.equal(resizeArgs.height, 600);
});

// ---------------------------------------------------------------------------
// Test 13: _onPosition does not throw if no onResize prop
// ---------------------------------------------------------------------------
test('_onPosition does not throw if no onResize prop is set', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const target = makeWindowContent();

  const result = await app._renderHTML({ value: 1 }, {});
  app._replaceHTML(result, target, {});

  assert.doesNotThrow(() => {
    app._onPosition({ width: 400, height: 300 });
  });
});

// ---------------------------------------------------------------------------
// Test 14: Multiple instances do not share state
// ---------------------------------------------------------------------------
test('multiple instances do not share state', async () => {
  const deps = makeDeps();

  const Mixed = createSvelteApplicationMixin(MockBase, deps);
  class AppClass extends Mixed {
    static SVELTE_COMPONENT = function FakeComponent() {};
  }

  const app1 = new AppClass();
  const app2 = new AppClass();

  const r1 = await app1._renderHTML({ instance: 1 }, {});
  app1._replaceHTML(r1, makeWindowContent(), {});

  const r2 = await app2._renderHTML({ instance: 2 }, {});
  app2._replaceHTML(r2, makeWindowContent(), {});

  assert.equal(app1._svelteProps.instance, 1);
  assert.equal(app2._svelteProps.instance, 2);
  assert.notEqual(app1._svelteComponent, app2._svelteComponent);
  assert.equal(deps.mountCalls.length, 2);

  // Closing one should not affect the other
  await app1.close();
  assert.equal(app1._svelteMounted, false);
  assert.equal(app2._svelteMounted, true);
});

// ---------------------------------------------------------------------------
// Test 15: _onClose unmounts the component when called directly (not via close())
// ---------------------------------------------------------------------------
test('_onClose unmounts the component when called directly', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const target = makeWindowContent();

  const result = await app._renderHTML({}, {});
  app._replaceHTML(result, target, {});

  const mountedInstance = deps.mountCalls[0].instance;

  // Call _onClose directly, bypassing close()
  app._onClose({});

  assert.equal(deps.unmountCalls.length, 1);
  assert.equal(deps.unmountCalls[0], mountedInstance);
  assert.equal(app._svelteMounted, false);
  assert.equal(app._svelteComponent, null);
});

// ---------------------------------------------------------------------------
// Test 16: _onClose does not throw when no component is mounted
// ---------------------------------------------------------------------------
test('_onClose does not throw when no component is mounted', () => {
  const deps = makeDeps();
  const app = buildApp(deps);

  assert.doesNotThrow(() => {
    app._onClose({});
  });
  assert.equal(deps.unmountCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Test 17: close() then _onClose() does not double-unmount
// ---------------------------------------------------------------------------
test('close followed by _onClose does not double-unmount', async () => {
  const deps = makeDeps();
  const app = buildApp(deps);
  const target = makeWindowContent();

  const result = await app._renderHTML({}, {});
  app._replaceHTML(result, target, {});

  await app.close();
  app._onClose({});  // should be a no-op — component already unmounted

  assert.equal(deps.unmountCalls.length, 1);
});

// ---------------------------------------------------------------------------
// Test 18: _onRender forwards to super._onRender
// ---------------------------------------------------------------------------
test('_onRender forwards to super._onRender', async () => {
  const deps = makeDeps();
  let superOnRenderArgs = null;

  class SpyBase extends MockBase {
    _onRender(context, options) {
      superOnRenderArgs = { context, options };
    }
  }

  const Mixed = createSvelteApplicationMixin(SpyBase, deps);
  class App extends Mixed {
    static SVELTE_COMPONENT = function FakeComponent() {};
  }

  const app = new App();
  const ctx = { foo: 1 };
  const opts = { force: true };
  app._onRender(ctx, opts);

  assert.ok(superOnRenderArgs !== null);
  assert.equal(superOnRenderArgs.context, ctx);
  assert.equal(superOnRenderArgs.options, opts);
});
