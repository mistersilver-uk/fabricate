/**
 * HOW THE MODULE ENTRY LAUNCHES THE DEFERRED GM MANAGER, and what happens when the deferred open
 * fails (issues 150 and 1565), driven through the published builders and a real boot.
 */
import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';

import { bindFabricateGlobal, buildMacroApi } from '../src/bootstrap/publicApi.js';
import {
  DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
  STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE,
} from '../src/utils/deferredEntryNotice.js';
import { handlerOf } from './helpers/bootContractProbes.js';
import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';
import { setupDOM, teardownDOM } from './helpers/svelte-dom.js';

describe('the published openers', () => {
  it('openRecipeManager answers the window, or reports a failed open and REJECTS with it', async () => {
    const reported = [];
    const report = (error) => reported.push(error);
    const opened = buildMacroApi({
      showCraftingSystemManagerApp: async () => 'window',
      reportManagerLoadFailure: report,
    });
    assert.equal(await opened.openRecipeManager(), 'window');
    const failure = new Error('probe: the chunk failed');
    const failing = buildMacroApi({
      showCraftingSystemManagerApp: () => Promise.reject(failure),
      reportManagerLoadFailure: report,
    });
    // A macro author's `await` must still see the failure after the user has been told.
    await assert.rejects(failing.openRecipeManager(), (error) => error === failure);
    assert.deepEqual(reported, [failure]);
  });

  it('the api export is the bare loader, raw and un-notified', () => {
    globalThis.game = { user: { id: 'gm', isGM: true }, settings: { get: () => undefined } };
    const loadCraftingSystemManagerAppClass = () => 'the loader';
    bindFabricateGlobal({}, { loadCraftingSystemManagerAppClass });
    assert.equal(
      globalThis.game.fabricate.api.loadCraftingSystemManagerAppClass,
      loadCraftingSystemManagerAppClass
    );
  });
});

/** `ui.notifications` with private state, as core's is: a detached member call throws on it. */
class PrivateNotifications {
  #live = [];
  #next = 0;
  error(message) {
    const notice = { id: (this.#next += 1), message };
    this.#live.push(notice);
    return notice;
  }
  warn(message, options) {
    this.#live.push({ id: (this.#next += 1), message, options });
  }
  info() {}
  has(notice) {
    return this.#live.includes(notice);
  }
  get live() {
    return [...this.#live];
  }
}

/** The Items Directory sidebar a `renderItemDirectory` hook hands over. */
function itemsDirectory() {
  const element = document.createElement('section');
  element.innerHTML =
    '<header class="directory-header"><div class="header-actions"></div></header>';
  return { element };
}

test(
  'the module entry opens, reports and warns through its own seams',
  { timeout: 300000 },
  async () => {
    await withFabricateLifecycleReplay(async ({ ready, loadModule }) => {
      const { default: facade } = await loadModule('/src/main.js');
      await ready();
      const opened = [];
      const loader = globalThis.game.fabricate.api.loadCraftingSystemManagerAppClass;
      assert.equal(loader(), loader(), 'one memoized load, however often it is asked');
      const AppClass = await loader();
      const { show } = AppClass;
      // A class registered after the load: an opener that bypasses the memoized load reaches it.
      const { registerCraftingSystemManagerApp } = await loadModule('/src/ui/appFactory.js');
      registerCraftingSystemManagerApp({ show: () => opened.push('bypassed the deferred load') });
      const failure = new Error('probe: the window failed to open');
      let failing = false;
      AppClass.show = () => {
        opened.push('show');
        if (failing) throw failure;
        return 'window';
      };
      const notifications = new PrivateNotifications();
      const { notifications: labNotifications } = globalThis.ui;
      const { error, warn } = console;
      const lines = [];
      console.error = (...args) => lines.push(['error', ...args]);
      console.warn = (...args) => lines.push(['warn', ...args]);
      const escaped = [];
      const escape = (reason) => escaped.push(reason);
      process.on('unhandledRejection', escape);
      try {
        // Read at call time: a notifier captured at module evaluation would reach the lab's.
        globalThis.ui.notifications = notifications;
        assert.equal(await globalThis.fabricate.openRecipeManager(), 'window');
        assert.deepEqual(opened, ['show'], 'the opener shows the class the loader resolved');

        failing = true;
        await assert.rejects(
          globalThis.fabricate.openRecipeManager(),
          (reason) => reason === failure
        );
        assert.equal(notifications.live.length, 1, 'the failure is reported on the live notifier');
        assert.deepEqual(lines, [['error', DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE, failure]]);

        setupDOM();
        try {
          const directory = itemsDirectory();
          handlerOf('renderItemDirectory')(directory, directory.element, {}, { force: true });
          directory.element.querySelector('button[data-fabricate-action="manage"]').click();
          await new Promise((settle) => setTimeout(settle, 20));
        } finally {
          teardownDOM();
        }
        assert.equal(opened.length, 3, 'the directory button opens through the same opener');
        assert.equal(lines.length, 2, 'and its failure is reported too');
        assert.deepEqual(escaped, [], 'swallowed: nothing awaits a click handler');
        assert.equal(notifications.live.length, 1, 'no second notice while the first is on screen');

        // The stale-entry check, FIRST in the ready body, behind the build-time define's guard.
        globalThis.__FABRICATE_BUILD_VERSION__ = '9.9.9';
        const order = [];
        facade.initialize = function initialize(...args) {
          order.push('initialize');
          return Object.getPrototypeOf(this).initialize.apply(this, args);
        };
        lines.length = 0;
        console.warn = (...args) => {
          order.push('stale');
          lines.push(['warn', ...args]);
        };
        await ready();
        assert.deepEqual(order.slice(0, 2), ['stale', 'initialize']);
        assert.deepEqual(
          lines.filter(([, message]) => message === STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE),
          [
            [
              'warn',
              STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE,
              { buildVersion: '9.9.9', installedVersion: '0.0.0-viewlab' },
            ],
          ],
          'at console.warn, the level the published build keeps'
        );
        assert.deepEqual(
          notifications.live.at(-1).options,
          { console: false },
          'and a notice core does not mirror to the console'
        );
      } finally {
        delete globalThis.__FABRICATE_BUILD_VERSION__;
        delete facade.initialize;
        AppClass.show = show;
        registerCraftingSystemManagerApp(AppClass);
        globalThis.ui.notifications = labNotifications;
        Object.assign(console, { error, warn });
        process.off('unhandledRejection', escape);
      }
    });
  }
);
