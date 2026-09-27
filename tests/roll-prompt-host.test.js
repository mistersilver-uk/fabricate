import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { findApplicationHost, openRollPromptModal } from '../src/ui/svelte/apps/crafting/rollPromptHost.js';

let window;
let doc;

function appWindow(rootClass, zIndex) {
  const frame = doc.createElement('div');
  frame.className = rootClass === 'fabricate-app' ? 'application fabricate fabricate-app' : 'application';
  frame.style.zIndex = String(zIndex);
  let root = frame;
  if (rootClass === 'fabricate-manager') {
    root = doc.createElement('div');
    root.className = 'fabricate-manager';
    frame.append(root);
  }
  const button = doc.createElement('button');
  root.append(button);
  doc.body.append(frame);
  return { frame, root, button };
}

/** A component stand-in: `mountComponent` records the props and hands back a handle. */
function fakeComponent() {
  const calls = { mounted: [], unmounted: [] };
  return {
    calls,
    options: {
      doc,
      loadComponent: async () => ({ default: 'RollPrompt' }),
      mountComponent: (component, options) => {
        const handle = { component, ...options };
        calls.mounted.push(handle);
        return handle;
      },
      unmountComponent: (handle) => calls.unmounted.push(handle),
    },
  };
}

describe('roll prompt host', () => {
  before(() => {
    window = new Window();
    doc = window.document;
  });
  after(() => window.happyDOM.abort());

  it('hosts only in the root holding focus, innermost first, and never in a minimized window', () => {
    doc.body.replaceChildren();
    assert.equal(findApplicationHost(doc), null);
    const manager = appWindow('fabricate-manager', 120);
    const player = appWindow('fabricate-app', 110);
    assert.equal(findApplicationHost(doc), null, 'no root holds focus, so the standalone layer hosts');
    player.button.focus();
    assert.equal(findApplicationHost(doc), player.root, 'the focused window wins over the frontmost');
    manager.button.focus();
    assert.equal(findApplicationHost(doc), manager.root, 'the inner manager root wins inside its frame');
    manager.frame.classList.add('minimized');
    assert.equal(findApplicationHost(doc), null, 'a minimized window never hosts');
  });

  it('takes the standalone layer when focus is outside every Fabricate root', async () => {
    doc.body.replaceChildren();
    appWindow('fabricate-app', 130);
    const outside = doc.createElement('button');
    doc.body.append(outside);
    outside.focus();
    const { calls, options } = fakeComponent();
    const pending = openRollPromptModal({ kind: 'single' }, options);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(calls.mounted[0].target.matches('.fabricate-standalone-overlay'));
    calls.mounted[0].props.onDismiss();
    assert.equal(await pending, null);
  });

  it('takes the standalone layer when the focused root is in a minimized window', async () => {
    doc.body.replaceChildren();
    const { frame, button } = appWindow('fabricate-app', 130);
    frame.classList.add('minimized');
    button.focus();
    const { calls, options } = fakeComponent();
    const pending = openRollPromptModal({ kind: 'single' }, options);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(calls.mounted[0].target.matches('.fabricate-standalone-overlay'));
    calls.mounted[0].props.onDismiss();
    assert.equal(await pending, null);
  });

  it("settles null once when the host application emits `close`, and stops listening", async () => {
    doc.body.replaceChildren();
    const { frame, button } = appWindow('fabricate-app', 100);
    button.focus();
    const listeners = new Set();
    const app = {
      addEventListener: (type, listener) => type === 'close' && listeners.add(listener),
      removeEventListener: (type, listener) => type === 'close' && listeners.delete(listener),
    };
    frame.id = 'fabricate-app';
    const previousFoundry = globalThis.foundry;
    globalThis.foundry = { applications: { instances: new Map([[frame.id, app]]) } };
    try {
      const { calls, options } = fakeComponent();
      const pending = openRollPromptModal({ kind: 'single' }, options);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(listeners.size, 1, 'the frame id maps to its application, which is watched');
      frame.remove();
      for (const listener of [...listeners]) listener();
      assert.equal(await pending, null);
      assert.equal(calls.unmounted.length, 1);
      assert.equal(listeners.size, 0, 'settling removes the close listener');
      calls.mounted[0].props.onSubmit({ confirmed: true });
      assert.equal(calls.unmounted.length, 1, 'a late answer after the close does not unmount twice');
    } finally {
      globalThis.foundry = previousFoundry;
    }
  });

  it('settles null when the host leaves the page and no application instance resolves', async () => {
    doc.body.replaceChildren();
    const { frame, button } = appWindow('fabricate-app', 100);
    button.focus();
    const { calls, options } = fakeComponent();
    const pending = openRollPromptModal({ kind: 'single' }, { ...options, resolveApplication: () => null });
    await new Promise((resolve) => setImmediate(resolve));
    frame.remove();
    const outcome = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve('pending'), 500))]);
    assert.equal(outcome, null, 'removing the host window settles the prompt');
    assert.equal(calls.unmounted.length, 1);
  });

  it('mounts into the application root and settles exactly once', async () => {
    doc.body.replaceChildren();
    const { root, button } = appWindow('fabricate-app', 100);
    button.focus();
    const { calls, options } = fakeComponent();
    const pending = openRollPromptModal({ kind: 'single' }, options);
    await new Promise((resolve) => setImmediate(resolve));
    const [handle] = calls.mounted;
    assert.equal(handle.target, root);
    assert.deepEqual(handle.props.data, { kind: 'single' });
    handle.props.onSubmit({ confirmed: true });
    handle.props.onDismiss();
    handle.props.onSubmit({ confirmed: true, bonus: 'late' });
    assert.deepEqual(await pending, { confirmed: true });
    assert.equal(calls.unmounted.length, 1);
    assert.ok(!doc.querySelector('.fabricate-standalone-overlay'), 'no standalone layer beside an app');
  });

  it('hosts a prompt with no Fabricate window open in a themed standalone layer it removes', async () => {
    doc.body.replaceChildren();
    doc.documentElement.setAttribute('data-fabricate-theme', 'mythwright');
    const previousError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    try {
      const { calls, options } = fakeComponent();
      const pending = openRollPromptModal({ kind: 'bulk' }, options);
      await new Promise((resolve) => setImmediate(resolve));
      const layer = calls.mounted[0].target;
      assert.ok(layer.matches('.fabricate.fabricate-standalone-overlay'));
      assert.equal(layer.getAttribute('data-fabricate-theme'), 'mythwright');
      assert.equal(layer.parentElement, doc.body);
      calls.mounted[0].props.onDismiss();
      assert.equal(await pending, null);
      assert.equal(calls.unmounted.length, 1);
      assert.ok(!layer.isConnected, 'the standalone layer is removed on close');
      assert.deepEqual(errors, [], 'the standalone path is not the missing-host fallback');
    } finally {
      console.error = previousError;
      doc.documentElement.removeAttribute('data-fabricate-theme');
    }
  });

  it('answers null and leaves nothing behind when the prompt cannot load or mount', async () => {
    doc.body.replaceChildren();
    const previousError = console.error;
    console.error = () => {};
    try {
      const { options } = fakeComponent();
      const failedLoad = await openRollPromptModal({}, { ...options, loadComponent: async () => { throw new Error('load'); } });
      assert.equal(failedLoad, null);
      const failedMount = await openRollPromptModal({}, { ...options, mountComponent: () => { throw new Error('mount'); } });
      assert.equal(failedMount, null);
      assert.equal(doc.body.children.length, 0, 'the standalone layer went with the failed mount');
    } finally {
      console.error = previousError;
    }
  });
});
