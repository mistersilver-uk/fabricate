/** `TintPickerButton` mounted (issue 1521): the trigger paints the caller's token, not the default. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const BUTTON_PATH = 'src/ui/svelte/components/TintPickerButton.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-tint-picker-button-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/managerColorTokens.js',
  ],
  compiledModules: [
    ...SEARCHABLE_POPOVER_COMPILED_MODULES,
    'src/ui/svelte/components/TintPicker.svelte',
    BUTTON_PATH,
  ],
  componentPath: BUTTON_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const PANEL = '.fabricate-color-picker-popover.fabricate-picker-popover';

const trigger = (root) => root.querySelector('.manager-color-picker-trigger');
const triggerStyle = (root) => trigger(root)?.getAttribute('style') ?? '';

/** Clicks the swatch open and settles the panel, its query focused on a microtask. */
async function openPalette(props = {}) {
  const root = await harness.mount({ colorToken: 'rose', ariaLabel: 'New biome colour', ...props });
  trigger(root).click();
  await harness.setProps({});
  await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
  return root;
}

/** Lets `close()`'s `tick()`-deferred focus return land. */
async function settle() {
  await harness.setProps({});
  await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
}

describe('TintPickerButton swatch', () => {
  it('paints the colour token it was given', async () => {
    const root = await harness.mount({ colorToken: 'rose' });
    assert.match(triggerStyle(root), /--fab-tag-rose\b/);
  });

  it('paints a valid custom hex over the token', async () => {
    const root = await harness.mount({ colorToken: 'rose', customColor: '#a1b2c3' });
    assert.match(triggerStyle(root), /--manager-color-swatch: #A1B2C3/);
  });

  it('is the picker trigger: named by the caller and announcing the dialog it opens', async () => {
    const root = await harness.mount({ colorToken: 'rose', ariaLabel: 'New biome colour' });
    const button = trigger(root);
    assert.equal(button.getAttribute('aria-label'), 'New biome colour');
    assert.equal(button.getAttribute('title'), 'New biome colour');
    assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('type'), 'button', 'so it never submits the add form');
    assert.ok(
      Boolean(button.closest('.fabricate-color-picker.manager-color-picker')),
      'the swatch stays inside the namespace root its sheet rules hang off'
    );
  });

  it('opens a palette named in the default label when the caller passes none (issue 2257)', async () => {
    const root = await openPalette();
    const list = globalThis.document.querySelector(`${PANEL} [role="listbox"]`);
    assert.ok(Boolean(list), 'the trigger opened the palette');
    assert.equal(list.getAttribute('aria-label'), 'Colour presets');
    assert.equal(trigger(root).getAttribute('aria-expanded'), 'true');
  });

  it('opens a palette with no free-hex field when the caller does not opt in (issue 2352)', async () => {
    await openPalette();
    assert.ok(Boolean(globalThis.document.querySelector(PANEL)), 'the trigger opened the palette');
    assert.ok(
      !globalThis.document.querySelector('[data-manager-custom-color]'),
      'free hex is opt-in, so a trigger mounted without `allowCustom` offers presets only'
    );
  });

  it('returns focus to the swatch on Escape', async () => {
    const root = await openPalette();
    globalThis.document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await settle();
    assert.ok(!globalThis.document.querySelector(PANEL), 'Escape closed the palette');
    assert.ok(globalThis.document.activeElement === trigger(root), 'focus is on the swatch');
  });

  it('closes on a pick and returns focus to the swatch', async () => {
    const picked = [];
    const root = await openPalette({
      onChange: (next) => {
        picked.push(next);
      },
    });
    globalThis.document.querySelector(`${PANEL} [data-manager-color-token="mist"]`).click();
    await settle();
    assert.deepEqual(picked, [{ colorToken: 'mist', customColor: '' }]);
    assert.ok(!globalThis.document.querySelector(PANEL), 'a pick closed the palette');
    assert.ok(globalThis.document.activeElement === trigger(root), 'focus is on the swatch');
  });
});
