/**
 * The picker's own copy is localized by the app root's `APP_LOCALIZER` context, not by the Foundry
 * bridge (issue 2454): under a root that hands it a localizer each line of its own copy reads its
 * translations, and in a tree mounted with none, as a published mount is, they read the English
 * fallback and `game.i18n` is never called. The application mixin and the roll prompt host, the
 * two Fabricate roots, hand their trees the bridge's `localize` by default.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, getContext } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const NO_MATCHES = 'FABRICATE.Common.Picker.NoMatches';
const LIST_HINTS = 'FABRICATE.Common.Picker.KeyHints.List';
const TRANSLATED = Object.freeze({
  [NO_MATCHES]: 'Aucun résultat',
  [LIST_HINTS]: '↑↓ choisir',
  'FABRICATE.Common.Picker.Error': 'La liste n’a pas pu charger',
  'FABRICATE.Common.Picker.Loading': 'Chargement…',
  'FABRICATE.Common.Picker.KeyHints.Grid': '←↑↓→ choisir',
});

const LOCALIZER = 'src/ui/svelte/util/appLocalizer.js';
const BRIDGE = 'src/ui/svelte/util/foundryBridge.js';
const MIXIN = 'src/ui/svelte/SvelteApplicationMixin.svelte.js';
const ROLL_PROMPT_HOST = 'src/ui/svelte/apps/crafting/rollPromptHost.js';
const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-picker-localizer-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/SvelteApplicationMixinCore.js',
    'src/ui/theme.js',
    'src/ui/svelte/util/rollPromptOrigin.js',
    ROLL_PROMPT_HOST,
  ],
  runeModules: [MIXIN],
  compiledModules: SEARCHABLE_POPOVER_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/SearchablePopover.svelte',
});

const PICKER = Object.freeze({
  options: [{ id: 'metal', label: 'Metal' }],
  triggerLabel: 'Tag',
  ariaLabel: 'Add tag',
  panelLabel: 'Add tag',
  keyHints: true,
  onSelect: () => {},
});

/** Opens the picker, types a query that matches nothing, and answers the no-match line and hints. */
function searchForNothing() {
  harness.target.querySelector('button').click();
  flushSync();
  const panel = harness.target.querySelector('.fabricate-picker-popover');
  const field = panel.querySelector(':scope .manager-travel-popover-search input');
  field.value = 'zzz';
  field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  flushSync();
  return {
    empty: panel.querySelector('.manager-empty').textContent.replaceAll(/\s+/g, ' ').trim(),
    hints: panel.querySelector('[data-popover-key-hints]').textContent.trim(),
  };
}

/** Records every key `game.i18n.localize` is asked for while `run` runs. */
async function i18nCalls(run) {
  const asked = [];
  const original = globalThis.game.i18n.localize;
  globalThis.game.i18n.localize = (key) => {
    asked.push(key);
    return original(key);
  };
  try {
    await run();
  } finally {
    globalThis.game.i18n.localize = original;
  }
  return asked;
}

/**
 * The rest of the picker's own copy: each line's name, the props that draw it, and the element
 * that shows it once the picker is open.
 */
const COPY_LINES = Object.freeze([
  [
    'error',
    { source: () => Promise.reject(new Error('offline')) },
    '[data-popover-status="error"]',
  ],
  ['loading', { options: [], loading: true }, '[data-popover-status="loading"]'],
  ['gridHints', { as: 'grid', columns: 3 }, '[data-popover-key-hints]'],
]);

/** Opens the picker and answers the text of `selector` in its panel once a source has settled. */
async function openedText(selector) {
  harness.target.querySelector('button').click();
  flushSync();
  await new Promise((resolve) => setImmediate(resolve));
  flushSync();
  const shown = harness.target.querySelector(`.fabricate-picker-popover ${selector}`);
  return shown?.textContent.replaceAll(/\s+/g, ' ').trim();
}

let APP_LOCALIZER;
let mountWithLocalizer;
let PICKER_COPY;
let bridgeLocalize;

before(async () => {
  await harness.setup();
  // The copy the compiled tree imports, so its context key is the one the picker reads.
  ({ APP_LOCALIZER, mountWithLocalizer } = await harness.loadRawModule(LOCALIZER));
  ({ PICKER_COPY } = await harness.loadRawModule('src/ui/svelte/util/pickerOptionModel.js'));
  ({ localize: bridgeLocalize } = await harness.loadRawModule(BRIDGE));
});
after(() => harness.teardown());

describe('2454 SearchablePopover localizes its own copy through the app root', () => {
  afterEach(() => harness.remount());

  it('reads the translations of the localizer its root hands it', async () => {
    const localize = (key) => TRANSLATED[key] ?? key;
    const context = new Map([[APP_LOCALIZER, localize]]);
    await harness.mount(PICKER, { context });
    const { empty, hints } = searchForNothing();
    assert.equal(empty, 'Aucun résultat');
    assert.equal(hints, '↑↓ choisir');
  });

  it('keeps the fallback for a key its localizer answers with the key itself', async () => {
    const context = new Map([[APP_LOCALIZER, (key) => key]]);
    await harness.mount(PICKER, { context });
    assert.equal(searchForNothing().empty, 'No matches');
  });

  it('draws the English fallback with no localizer, and never calls game.i18n', async () => {
    const asked = await i18nCalls(async () => {
      await harness.mount(PICKER);
      const { empty, hints } = searchForNothing();
      assert.equal(empty, 'No matches');
      assert.equal(hints, '↑↓ move · ↵ pick · esc close');
    });
    assert.deepEqual(asked, [], 'no key reached the Foundry bridge');
  });
});

describe('2454 the rest of the picker’s own copy', () => {
  afterEach(() => harness.remount());

  for (const [name, props, selector] of COPY_LINES) {
    it(`draws ${name} from the root’s localizer, and its English fallback with none`, async () => {
      const [key, fallback] = PICKER_COPY[name];
      const localize = (asked) => TRANSLATED[asked] ?? asked;
      await harness.mount(
        { ...PICKER, ...props },
        { context: new Map([[APP_LOCALIZER, localize]]) }
      );
      assert.equal(await openedText(selector), TRANSLATED[key]);
      harness.remount();
      await harness.mount({ ...PICKER, ...props });
      assert.equal(await openedText(selector), fallback);
    });
  }
});

describe('2454 the Fabricate roots hand their trees the bridge’s localize', () => {
  /** A component stand-in that records the localizer its tree is handed and the props it gets. */
  function probe() {
    const seen = [];
    const Probe = (_anchor, props) => {
      seen.push({ localize: getContext(APP_LOCALIZER), props });
    };
    return { Probe, seen };
  }

  it('in a window the application mixin renders, by its default mount', async () => {
    const { default: SvelteApplicationMixin } = await harness.loadRuneModule(MIXIN);
    const { Probe, seen } = probe();
    class Base {
      async close() {}
    }
    class App extends SvelteApplicationMixin(Base) {
      static SVELTE_COMPONENT = Probe;
    }
    const app = new App();
    const content = document.createElement('div');
    document.body.append(content);
    app._replaceHTML(await app._renderHTML({}, {}), content, {});
    assert.equal(seen.length, 1, 'the window mounted its tree');
    assert.ok(seen[0].localize === bridgeLocalize, 'the tree reads the bridge’s localize');
    await app.close();
    content.remove();
  });

  it('in the roll prompt, by its default mount', async () => {
    const { openRollPromptModal } = await harness.loadRawModule(ROLL_PROMPT_HOST);
    const { Probe, seen } = probe();
    const pending = openRollPromptModal(
      { kind: 'single' },
      { loadComponent: async () => ({ default: Probe }) }
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.length, 1, 'the prompt mounted its tree');
    assert.ok(seen[0].localize === bridgeLocalize, 'the tree reads the bridge’s localize');
    seen[0].props.onDismiss();
    assert.equal(await pending, null);
  });
});

describe('2454 mountWithLocalizer', () => {
  it('hands every tree it mounts the localizer as its context, keeping the other options', () => {
    const calls = [];
    const localize = (key) => key;
    const mount = (component, options) => {
      calls.push({ component, options });
      return 'instance';
    };
    const target = {};
    const props = { a: 1 };
    assert.equal(mountWithLocalizer(mount, localize)('Root', { target, props }), 'instance');
    const [{ component, options }] = calls;
    assert.equal(component, 'Root');
    assert.ok(
      options.target === target && options.props === props,
      'target and props pass through'
    );
    assert.ok(options.context.get(APP_LOCALIZER) === localize, 'the localizer is the context');
  });

  it('keeps every entry of a context the caller passes, beside the localizer', () => {
    const own = Symbol('own');
    let handed;
    const mount = (_component, options) => {
      handed = options.context;
    };
    const context = new Map([[own, 'kept']]);
    mountWithLocalizer(mount, () => '')('Root', { target: {}, context });
    assert.equal(handed.get(own), 'kept', 'the caller’s entry is kept');
    assert.equal(typeof handed.get(APP_LOCALIZER), 'function', 'the localizer is added');
    assert.equal(context.size, 1, 'the caller’s map is not written');
  });
});
