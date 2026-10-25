/**
 * Issue 2658 — `Modal` mounted on its own: Escape stops inside the dialog in every mode, the host
 * is acquired through the overlay chain, and body and footer are drawn once.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const MODAL_PATH = 'src/ui/svelte/components/Modal.svelte';
const OVERLAY_HOST_PATH = 'src/ui/svelte/util/overlayHost.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-modal-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/appLocalizer.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    OVERLAY_HOST_PATH,
  ],
  compiledModules: [
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled).
    'src/ui/svelte/components/IconButton.svelte',
    MODAL_PATH,
  ],
  componentPath: MODAL_PATH,
});

const body = createRawSnippet(() => ({
  render: () =>
    '<div data-probe-body><button type="button" data-plain>Plain</button>' +
    '<button type="button" data-expanded aria-expanded="true">Open list</button></div>',
}));
const footer = createRawSnippet(() => ({
  render: () => '<button type="button" data-footer-button>Done</button>',
}));

const key = (type, init = {}) =>
  new document.defaultView.KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
const escape = (init = {}) => key('keydown', { key: 'Escape', ...init });

/** Dispatches `event` on `element` with a bubbling `keydown` listener on the window. */
function dispatchWithWindowListener(element, event) {
  const seen = [];
  const onWindowKey = (heard) => {
    seen.push(heard.key);
  };
  document.defaultView.addEventListener('keydown', onWindowKey);
  try {
    element.dispatchEvent(event);
  } finally {
    document.defaultView.removeEventListener('keydown', onWindowKey);
  }
  return seen;
}

const q = (selector) => document.querySelector(selector);

const press = () => new document.defaultView.MouseEvent('mousedown', { bubbles: true });

/** A panel on `<body>` holding an input, as a picker's portaled list does. */
function panelWithField() {
  const panel = document.createElement('div');
  panel.innerHTML = '<input data-panel-field>';
  document.body.append(panel);
  return { panel, field: panel.querySelector('[data-panel-field]') };
}

/** Runs `run(panel, field)` with a panel acquired from `anchor`, released however it ends. */
async function withPanel(anchor, run) {
  const { acquireOverlayHost, releaseOverlayHost } = await harness.loadRawModule(OVERLAY_HOST_PATH);
  const { panel, field } = panelWithField();
  acquireOverlayHost(panel, anchor, { component: 'Probe' });
  try {
    return await run(panel, field);
  } finally {
    releaseOverlayHost(panel);
    panel.remove();
  }
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

for (const closeOnOutsideClick of [true, false]) {
  describe(`Modal with closeOnOutsideClick ${closeOnOutsideClick}`, () => {
    /** Mounts an open Modal and returns the calls its `onClose` received. */
    async function open(props = {}) {
      const calls = [];
      await harness.mount({
        open: true,
        title: 'Probe',
        body,
        footer,
        closeOnOutsideClick,
        onClose: (...args) => {
          calls.push(args);
        },
        ...props,
      });
      return calls;
    }

    describe('Escape in the dialog', () => {
      it('closes once from a body button, claims the key and keeps it from the window', async () => {
        const calls = await open();
        const event = escape();
        const seen = dispatchWithWindowListener(q('[data-plain]'), event);
        assert.equal(calls.length, 1, 'onClose is called once');
        assert.equal(event.defaultPrevented, true);
        assert.deepEqual(seen, [], 'no bubbling keydown listener on the window hears it');
      });

      it('calls onClose again for each repeat of a held Escape', async () => {
        const calls = await open();
        q('[data-plain]').dispatchEvent(escape());
        q('[data-plain]').dispatchEvent(escape({ repeat: true }));
        assert.equal(calls.length, 2);
      });

      it('calls nothing for a composing Escape', async () => {
        const calls = await open();
        q('[data-plain]').dispatchEvent(escape({ isComposing: true }));
        assert.equal(calls.length, 0);
      });

      it('leaves an Escape on an aria-expanded control to that control', async () => {
        const calls = await open();
        const event = escape();
        const seen = dispatchWithWindowListener(q('[data-expanded]'), event);
        assert.equal(calls.length, 0);
        assert.equal(event.defaultPrevented, false);
        assert.deepEqual(seen, ['Escape'], 'and does not stop it');
      });

      /** A control that collapses on Escape from a document capture listener, as a picker does. */
      function collapseOnEscape() {
        const listener = (event) => {
          if (event.key === 'Escape') q('[data-expanded]').setAttribute('aria-expanded', 'false');
        };
        document.addEventListener('keydown', listener, { capture: true });
        return () => document.removeEventListener('keydown', listener, { capture: true });
      }

      for (const [label, registeredBefore] of [
        ['registered before the dialog mounts', true],
        ['registered after the dialog is open', false],
      ]) {
        it(`judges an expanded control as the key goes down, with a collapsing listener ${label}`, async () => {
          let remove = registeredBefore ? collapseOnEscape() : () => {};
          try {
            const calls = await open();
            if (!registeredBefore) remove = collapseOnEscape();
            const event = escape();
            const seen = dispatchWithWindowListener(q('[data-expanded]'), event);
            assert.equal(
              q('[data-expanded]').getAttribute('aria-expanded'),
              'false',
              'the listener collapsed the control before the key reached the dialog'
            );
            assert.equal(calls.length, 0, 'the dialog still reads it as expanded');
            assert.equal(event.defaultPrevented, false);
            assert.deepEqual(seen, ['Escape'], 'and does not stop it');
          } finally {
            remove();
          }
        });
      }

      it('is not stopped by an expanded element above the host, outside the dialog', async () => {
        const calls = await open();
        harness.target.setAttribute('aria-expanded', 'true');
        document.body.setAttribute('aria-expanded', 'true');
        try {
          q('[data-manager-modal-close]').dispatchEvent(escape());
        } finally {
          document.body.removeAttribute('aria-expanded');
        }
        assert.equal(calls.length, 1);
      });

      it('keeps onClose uncalled when a body listener stops Escape', async () => {
        const calls = await open();
        const button = q('[data-plain]');
        button.addEventListener('keydown', (event) => event.stopPropagation());
        button.dispatchEvent(escape());
        assert.equal(calls.length, 0);
      });

      it('leaves an Escape on an expanded control inside an open shadow root to that control', async () => {
        const calls = await open();
        const shadowHost = document.createElement('span');
        q('[data-probe-body]').append(shadowHost);
        const inner = document.createElement('button');
        inner.setAttribute('aria-expanded', 'true');
        shadowHost.attachShadow({ mode: 'open' }).append(inner);
        const collapse = (event) => {
          if (event.key === 'Escape') inner.setAttribute('aria-expanded', 'false');
        };
        document.addEventListener('keydown', collapse, { capture: true });
        try {
          const event = escape();
          inner.dispatchEvent(event);
          assert.equal(inner.getAttribute('aria-expanded'), 'false', 'the control collapsed first');
          assert.equal(calls.length, 0, 'the dialog still reads it as expanded');
          assert.equal(event.defaultPrevented, false);
        } finally {
          document.removeEventListener('keydown', collapse, { capture: true });
        }
      });

      if (closeOnOutsideClick) {
        it('calls nothing for a composing Escape outside the dialog', async () => {
          const calls = await open();
          document.body.dispatchEvent(escape({ isComposing: true }));
          assert.equal(calls.length, 0);
        });
      }

      it(
        closeOnOutsideClick
          ? 'closes once on an Escape outside the dialog and does not stop it'
          : 'ignores an Escape outside the dialog',
        async () => {
          const calls = await open();
          const event = escape();
          const seen = dispatchWithWindowListener(document.body, event);
          assert.equal(calls.length, closeOnOutsideClick ? 1 : 0);
          assert.equal(event.defaultPrevented, false);
          assert.deepEqual(seen, ['Escape']);
        }
      );
    });

    describe('a panel opened from inside the dialog', () => {
      it('calls nothing for a press in it or an Escape on a field in it', async () => {
        const calls = await open();
        await withPanel(q('[data-plain]'), (panel, field) => {
          panel.dispatchEvent(press());
          field.dispatchEvent(escape());
          assert.deepEqual(calls, []);
        });
      });

      for (const [label, registeredBefore] of [
        ['registered before the dialog mounts', true],
        ['registered after the dialog is open', false],
      ]) {
        it(`judges an Escape as it goes down, with a listener ${label} that releases the panel`, async () => {
          const overlayHost = await harness.loadRawModule(OVERLAY_HOST_PATH);
          const { panel, field } = panelWithField();
          const release = (event) => {
            if (event.key === 'Escape') overlayHost.releaseOverlayHost(panel);
          };
          const listen = () => document.addEventListener('keydown', release, { capture: true });
          if (registeredBefore) listen();
          try {
            const calls = await open();
            if (!registeredBefore) listen();
            overlayHost.acquireOverlayHost(panel, q('[data-plain]'), {});
            field.dispatchEvent(escape());
            const dialog = q('[data-manager-modal]');
            assert.equal(
              overlayHost.overlaysOpenedFrom(dialog).length,
              0,
              'the panel was released'
            );
            assert.deepEqual(calls, []);
          } finally {
            document.removeEventListener('keydown', release, { capture: true });
            overlayHost.releaseOverlayHost(panel);
            panel.remove();
          }
        });
      }

      it('judges a later press by its own origin, not by an earlier Escape in a panel', async () => {
        const calls = await open();
        await withPanel(q('[data-plain]'), (panel, field) => {
          field.dispatchEvent(escape());
          assert.deepEqual(calls, [], 'the Escape in the panel dismisses nothing');
        });
        document.body.dispatchEvent(press());
        assert.deepEqual(
          calls,
          closeOnOutsideClick ? [[]] : [],
          'a later press on the page decides alone'
        );
      });

      it('counts a panel opened from a panel the dialog opened', async () => {
        const calls = await open();
        await withPanel(q('[data-plain]'), async (first) => {
          const anchor = document.createElement('button');
          first.append(anchor);
          await withPanel(anchor, (second, field) => {
            second.dispatchEvent(press());
            field.dispatchEvent(escape());
            assert.deepEqual(calls, []);
          });
        });
      });

      if (closeOnOutsideClick) {
        it('still calls onClose once for a press and for an Escape in a panel opened from outside', async () => {
          const outside = document.createElement('div');
          outside.className = 'fabricate-app';
          outside.innerHTML = '<button type="button">Elsewhere</button>';
          document.body.append(outside);
          try {
            const calls = await open();
            await withPanel(outside.firstChild, (panel, field) => {
              panel.dispatchEvent(press());
              assert.deepEqual(calls, [[]], 'the press dismisses');
              field.dispatchEvent(escape());
              assert.deepEqual(calls, [[], []], 'and so does the Escape');
            });
          } finally {
            outside.remove();
          }
        });
      }
    });

    describe('the close control', () => {
      it('calls onClose once with no arguments on a click', async () => {
        const calls = await open();
        q('[data-manager-modal-close]').click();
        assert.deepEqual(calls, [[]]);
      });

      for (const pressed of ['Enter', ' ']) {
        it(`calls nothing on a keydown of ${JSON.stringify(pressed)}, and claims no key`, async () => {
          const calls = await open();
          const event = key('keydown', { key: pressed });
          q('[data-manager-modal-close]').dispatchEvent(event);
          // happy-dom activates no button on a key, so a real activation is a click's job.
          assert.equal(calls.length, 0);
          assert.equal(event.defaultPrevented, false);
        });
      }
    });

    describe('hosting', () => {
      it('draws the dialog in the element resolveOverlayHost returns for it', async () => {
        await open();
        const { resolveOverlayHost } = await harness.loadRawModule(OVERLAY_HOST_PATH);
        const dialog = q('[data-manager-modal]');
        assert.ok(dialog.parentElement.classList.contains('fabricate-manager'));
        assert.equal(dialog.parentElement, resolveOverlayHost(dialog));
        assert.equal(dialog.parentElement, harness.target);
      });

      it('leaves the host other children when destroyed open, and releasing throws nothing', async () => {
        await open();
        const { releaseOverlayHost } = await harness.loadRawModule(OVERLAY_HOST_PATH);
        const dialog = q('[data-manager-modal]');
        const sibling = document.createElement('i');
        const hostElement = harness.target;
        hostElement.append(sibling);
        try {
          harness.remount();
          assert.equal(dialog.isConnected, false, 'the dialog went with the component');
          assert.equal(sibling.parentElement, hostElement, 'the host other children stay');
          assert.doesNotThrow(() => releaseOverlayHost(dialog));
        } finally {
          sibling.remove();
        }
      });

      it('draws exactly one dialog when opened, closed and opened again', async () => {
        await open();
        await harness.setProps({ open: false });
        assert.equal(document.querySelectorAll('[data-manager-modal]').length, 0);
        await harness.setProps({ open: true });
        assert.equal(document.querySelectorAll('[data-manager-modal]').length, 1);
      });
    });

    describe('slots', () => {
      it('draws one body and one footer and no form without onSubmit', async () => {
        await open();
        const dialog = q('[data-manager-modal]');
        assert.equal(dialog.querySelectorAll('.manager-modal-body').length, 1);
        assert.equal(dialog.querySelectorAll('.manager-modal-footer').length, 1);
        assert.equal(dialog.querySelectorAll('[data-probe-body]').length, 1);
        assert.equal(dialog.querySelectorAll('[data-footer-button]').length, 1);
        assert.equal(dialog.querySelector('form'), null);
        assert.equal(dialog.querySelector('.manager-modal-form').tagName, 'DIV');
      });

      it('wraps both in one form with onSubmit', async () => {
        await open({ onSubmit: () => {} });
        const dialog = q('[data-manager-modal]');
        const forms = dialog.querySelectorAll('form');
        assert.equal(forms.length, 1);
        assert.ok(forms[0].querySelector('.manager-modal-body'));
        assert.ok(forms[0].querySelector('.manager-modal-footer'));
        assert.equal(dialog.querySelectorAll('.manager-modal-body').length, 1);
        assert.equal(dialog.querySelectorAll('.manager-modal-footer').length, 1);
      });
    });
  });
}

for (const trapFocus of [false, true]) {
  describe(`the Modal dialog as a focus target with trapFocus ${trapFocus} (issues 2661, 2662)`, () => {
    /** Mounts an open Modal, focuses its dialog element and returns it with the onClose calls. */
    async function focusedDialog(props = {}) {
      const calls = [];
      await harness.mount({
        open: true,
        title: 'Probe',
        body,
        footer,
        trapFocus,
        onClose: (...args) => {
          calls.push(args);
        },
        ...props,
      });
      const dialog = q('[data-manager-modal]');
      dialog.focus();
      return { dialog, calls };
    }

    it('is a tabindex -1 target held off Foundry, and aria-modal only with trapFocus', async () => {
      const { dialog } = await focusedDialog();
      assert.equal(dialog.getAttribute('tabindex'), '-1');
      assert.equal(dialog.getAttribute('data-keyboard-focus'), 'true');
      assert.equal(dialog.getAttribute('role'), 'dialog');
      assert.equal(dialog.getAttribute('aria-label'), 'Probe');
      if (trapFocus) assert.equal(dialog.getAttribute('aria-modal'), 'true');
      else assert.ok(!dialog.hasAttribute('aria-modal'), 'not announced as modal');
      assert.ok(document.activeElement === dialog, 'the dialog takes focus');
    });

    it('closes once on an Escape on the dialog element, claims it and keeps it from the window', async () => {
      const { dialog, calls } = await focusedDialog();
      const event = escape();
      const seen = dispatchWithWindowListener(dialog, event);
      assert.equal(calls.length, 1, 'onClose is called once');
      assert.equal(event.defaultPrevented, true);
      assert.deepEqual(seen, [], 'no bubbling keydown listener on the window hears it');
    });

    for (const [label, shiftKey, hook] of [
      ['Tab focuses the close control', false, '[data-manager-modal-close]'],
      ['Shift+Tab focuses the last control', true, '[data-footer-button]'],
    ]) {
      it(`${label} from the dialog element`, async () => {
        const { dialog } = await focusedDialog();
        const event = key('keydown', { key: 'Tab', shiftKey });
        dialog.dispatchEvent(event);
        assert.equal(event.defaultPrevented, true);
        assert.ok(document.activeElement === q(hook), `focus is on ${hook}`);
      });
    }

    it(
      trapFocus
        ? 'wraps Tab from the last control to the close control'
        : 'leaves Tab from a control inside to the browser',
      async () => {
        await focusedDialog();
        const last = q('[data-footer-button]');
        last.focus();
        const event = key('keydown', { key: 'Tab' });
        last.dispatchEvent(event);
        assert.equal(event.defaultPrevented, trapFocus);
        if (trapFocus) {
          assert.ok(document.activeElement === q('[data-manager-modal-close]'), 'wrapped');
        }
      }
    );
  });
}

describe('the Modal dialog inline style', () => {
  it('states no inline style without width, and the width custom property with it', async () => {
    await harness.mount({ open: true, title: 'Probe', body, onClose: () => {} });
    assert.ok(!q('[data-manager-modal]').getAttribute('style'), 'no inline style by default');
    await harness.setProps({ width: '720px' });
    assert.equal(q('[data-manager-modal]').getAttribute('style'), '--manager-modal-width: 720px;');
  });
});

describe('Modal host and window lifecycle', () => {
  const closeInto = (calls) => () => {
    calls.push([]);
  };

  it('acquires its host through the overlay chain and releases it on close and on destroy', async () => {
    await harness.mount({ open: false, title: 'Probe', body, onClose: closeInto([]) });
    const { registerOverlayChain, unregisterOverlayChain } =
      await harness.loadRawModule(OVERLAY_HOST_PATH);
    const container = document.createElement('div');
    document.body.append(container);
    const acquired = [];
    const released = [];
    const chain = {
      acquire(overlay) {
        acquired.push(overlay);
        return container;
      },
      release(overlay) {
        released.push(overlay);
      },
    };
    const target = harness.target;
    registerOverlayChain(target, chain);
    try {
      await harness.setProps({ open: true });
      const dialog = q('[data-manager-modal]');
      assert.equal(dialog.parentElement, container, 'the chain container hosts the dialog');
      assert.deepEqual(acquired, [dialog]);
      assert.deepEqual(released, []);
      await harness.setProps({ open: false });
      assert.deepEqual(released, [dialog], 'closing gives the host back with the dialog node');
      await harness.setProps({ open: true });
      assert.equal(acquired.length, 2, 'reopening acquires again');
      assert.equal(acquired[1], q('[data-manager-modal]'));
      harness.remount();
      assert.equal(released.length, 2, 'destroying while open gives the host back once more');
      assert.equal(released[1], acquired[1]);
    } finally {
      unregisterOverlayChain(target, chain);
      container.remove();
    }
  });

  it('keeps one capture keydown pair on the window and removes it on destroy', async () => {
    const view = document.defaultView;
    const prototype = Object.getPrototypeOf(view);
    const added = [];
    const removed = [];
    view.addEventListener = (type, listener, options) => {
      if (type === 'keydown' && options === true) added.push(listener);
      return prototype.addEventListener.call(view, type, listener, options);
    };
    view.removeEventListener = (type, listener, options) => {
      if (type === 'keydown' && options === true) removed.push(listener);
      return prototype.removeEventListener.call(view, type, listener, options);
    };
    try {
      await harness.mount({ open: true, title: 'Probe', body, onClose: closeInto([]) });
      assert.equal(added.length, 1, 'one capture keydown listener while open');
      assert.deepEqual(removed, []);
      harness.remount();
      assert.deepEqual(removed, added, 'and the same one is removed on destroy');
    } finally {
      delete view.addEventListener;
      delete view.removeEventListener;
    }
  });

  it('still closes once on Escape in a document with no window', async () => {
    const calls = [];
    const view = document.defaultView;
    Object.defineProperty(document, 'defaultView', { configurable: true, get: () => null });
    try {
      await harness.mount({ open: true, title: 'Probe', body, onClose: closeInto(calls) });
      const event = new view.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      q('[data-plain]').dispatchEvent(event);
      assert.equal(calls.length, 1);
      assert.equal(event.defaultPrevented, true);
    } finally {
      delete document.defaultView;
    }
  });

  it('leaves an Escape in a panel the dialog opened to it in a document with no window', async () => {
    const calls = [];
    const view = document.defaultView;
    Object.defineProperty(document, 'defaultView', { configurable: true, get: () => null });
    try {
      await harness.mount({ open: true, title: 'Probe', body, onClose: closeInto(calls) });
      await withPanel(q('[data-plain]'), (panel, field) => {
        field.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.deepEqual(calls, [], 'judged live, with no record to read');
      });
    } finally {
      delete document.defaultView;
    }
  });

  it('counts a panel inside only the dialog that opened it, with two dialogs open', async () => {
    const [aCalls, bCalls] = [[], []];
    await harness.mount({ open: true, title: 'A', body, onClose: closeInto(aCalls) });
    const { mount, unmount, flushSync } =
      await import('../../node_modules/svelte/src/index-client.js');
    const { default: Modal } = await harness.loadRawModule(`${MODAL_PATH}.js`);
    const second = document.createElement('div');
    second.className = 'fabricate-manager';
    document.body.append(second);
    const b = mount(Modal, {
      target: second,
      props: { open: true, title: 'B', body, onClose: closeInto(bCalls) },
    });
    flushSync();
    try {
      await withPanel(harness.target.querySelector('[data-plain]'), (panel) => {
        panel.dispatchEvent(press());
      });
      assert.deepEqual(aCalls, [], 'the dialog that opened the panel stays');
      assert.deepEqual(bCalls, [[]], 'the other one is dismissed once');
    } finally {
      unmount(b);
      second.remove();
    }
  });

  it('destroys a focus-trapping dialog after its window is gone without throwing', async () => {
    let gone = false;
    const view = document.defaultView;
    Object.defineProperty(document, 'defaultView', {
      configurable: true,
      get: () => (gone ? null : view),
    });
    try {
      await harness.mount({
        open: true,
        title: 'Probe',
        body,
        trapFocus: true,
        onClose: closeInto([]),
      });
      gone = true;
      assert.doesNotThrow(() => harness.remount());
    } finally {
      delete document.defaultView;
    }
  });
});
