/**
 * IconPicker selection semantics for the one-row-per-glyph vocabulary introduced by PR #1274.
 *
 * Stored values are not guaranteed to be the exact class the picker now offers: Font Awesome
 * aliases such as `cog` resolve to the offered `gear` row, and regular-weight values remain valid
 * even though the picker deliberately offers only one solid row per glyph. In both cases opening
 * the picker must still expose exactly one selected option to sighted and assistive-tech users.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ICON_PICKER = 'src/ui/svelte/components/IconPicker.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-icon-picker-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
  ],
  compiledModules: [ICON_PICKER],
  componentPath: ICON_PICKER,
});

before(async () => {
  await harness.setup();
  // happy-dom's Window is flattened onto `globalThis` by setupDOM() (see
  // tests/helpers/svelte-dom.js), and `globalThis` itself has no `addEventListener`. The
  // popover-positioning effect registers `window` resize/scroll listeners whenever the picker
  // opens; stub them so the effect does not crash when tests open the picker.
  window.addEventListener ??= () => {};
  window.removeEventListener ??= () => {};
});
after(() => harness.teardown());
afterEach(() => harness.remount());

async function openPicker(value) {
  const root = await harness.mount({ value });
  const trigger = root.querySelector('.essence-icon-picker-trigger');
  assert.ok(trigger, 'the picker trigger renders');
  trigger.click();
  flushSync();
  await tick();
  flushSync();

  const selected = [...root.querySelectorAll('.essence-icon-picker-option[aria-selected="true"]')];
  return { root, trigger, selected };
}

function selectedIconClass(selected) {
  assert.equal(selected.length, 1, 'opening the picker exposes exactly one selected row');
  return selected[0].querySelector('.essence-icon-picker-preview i')?.className ?? '';
}

describe('IconPicker canonical row selection', () => {
  it('selects the preferred row when the stored class uses an alias', async () => {
    const { trigger, selected } = await openPicker('fas fa-cog');

    assert.match(
      trigger.querySelector('.essence-icon-picker-preview i')?.className ?? '',
      /\bfa-gear\b/,
      'the trigger resolves the stored alias to the preferred glyph row'
    );
    assert.equal(selectedIconClass(selected), 'fas fa-gear');
  });

  it('selects the solid row for a stored regular class without rewriting its trigger preview', async () => {
    const { trigger, selected } = await openPicker('far fa-bell');

    assert.equal(
      trigger.querySelector('.essence-icon-picker-preview i')?.className,
      'far fa-bell',
      'a persisted regular value remains renderable as the value the GM originally chose'
    );
    assert.equal(
      selectedIconClass(selected),
      'fas fa-bell',
      'the one offered row for that glyph is selected even though its weight differs'
    );
  });
});
