/**
 * The picker's own copy is localized by the app root's `APP_LOCALIZER` context, not by the Foundry
 * bridge (issue 2454): under a root that hands it a localizer the no-match line and the key hints
 * read its translations, and in a tree mounted with none, as a published mount is, they read the
 * English fallback and `game.i18n` is never called.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const NO_MATCHES = 'FABRICATE.Common.Picker.NoMatches';
const LIST_HINTS = 'FABRICATE.Common.Picker.KeyHints.List';
const TRANSLATED = Object.freeze({ [NO_MATCHES]: 'Aucun résultat', [LIST_HINTS]: '↑↓ choisir' });

const LOCALIZER = 'src/ui/svelte/util/appLocalizer.js';
const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-picker-localizer-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
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

let APP_LOCALIZER;
let mountWithLocalizer;

before(async () => {
  await harness.setup();
  // The copy the compiled tree imports, so its context key is the one the picker reads.
  ({ APP_LOCALIZER, mountWithLocalizer } = await harness.loadRawModule(LOCALIZER));
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
});
