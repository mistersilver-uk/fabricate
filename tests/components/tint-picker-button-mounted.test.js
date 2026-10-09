/** `TintPickerButton` mounted (issue 1521): the trigger paints the caller's token, not the default. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  createMountedComponentHarness,
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
  compiledModules: ['src/ui/svelte/components/TintPicker.svelte', BUTTON_PATH],
  componentPath: BUTTON_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const triggerStyle = (root) =>
  root.querySelector('.manager-color-picker-trigger')?.getAttribute('style') ?? '';

describe('TintPickerButton swatch', () => {
  it('paints the colour token it was given', async () => {
    const root = await harness.mount({ colorToken: 'rose' });
    assert.match(triggerStyle(root), /--fab-tag-rose\b/);
  });

  it('paints a valid custom hex over the token', async () => {
    const root = await harness.mount({ colorToken: 'rose', customColor: '#a1b2c3' });
    assert.match(triggerStyle(root), /--manager-color-swatch: #A1B2C3/);
  });

  it('opens a palette named in the default label when the caller passes none (issue 2257)', async () => {
    const root = await harness.mount({ colorToken: 'rose' });
    root.querySelector('.manager-color-picker-trigger').click();
    await harness.setProps({});
    const group = globalThis.document.querySelector(
      '[data-manager-color-picker-popover] [role="group"]'
    );
    assert.ok(Boolean(group), 'the trigger opened the palette');
    assert.equal(group.getAttribute('aria-label'), 'Colour presets');
  });
});
