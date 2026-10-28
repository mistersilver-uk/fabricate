/** Issue 2664: under an app localizer the icon picker trigger describes the chosen glyph; a published mount does not. */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  APP_LOCALIZER_RAW_MODULES,
  FOUNDRY_BRIDGE_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ICON_PICKER = 'src/ui/svelte/components/IconPicker.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-icon-picker-choice-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/foundryIconCatalogue.json',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    ...APP_LOCALIZER_RAW_MODULES,
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
    ICON_PICKER,
  ],
  componentPath: ICON_PICKER,
});

before(harness.setup);
after(() => harness.teardown());
afterEach(() => harness.remount());

const triggerOf = (root) => root.querySelector('.essence-icon-picker-trigger');

/** The text of every element the trigger's `aria-describedby` names. */
function descriptionOf(root) {
  const trigger = triggerOf(root);
  const ids = (trigger.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
  return ids.map((id) => {
    const node = root.ownerDocument.querySelector(`#${id}`);
    assert.ok(Boolean(node), `aria-describedby id "${id}" resolves to a rendered element`);
    return node.textContent.trim();
  });
}

const props = (extra = {}) => ({
  value: 'fas fa-crown',
  ariaLabel: 'Reagent icon',
  listLabel: 'Icons',
  searchLabel: 'Search icons',
  noMatchesText: 'None',
  onChange: () => {},
  ...extra,
});

/** The app root's localizer context, which is what separates an in-app tree from a published mount. */
async function inApp() {
  const { APP_LOCALIZER } = await harness.loadRawModule('src/ui/svelte/util/appLocalizer.js');
  return { context: new Map([[APP_LOCALIZER, (key) => key]]) };
}

describe('2664 IconPicker — the chosen glyph on the trigger', () => {
  it('describes the chosen glyph by the name the trigger shows', async () => {
    const root = await harness.mount(props(), await inApp());
    const shown = root.querySelector('.essence-icon-picker-trigger-label').textContent.trim();
    assert.ok(shown.length > 0, 'the trigger shows a glyph name');
    assert.deepEqual(descriptionOf(root), [shown]);
    assert.equal(
      triggerOf(root).getAttribute('aria-label'),
      'Reagent icon',
      'the name is unchanged'
    );
  });

  it('describes the choice on an icon-only trigger, which draws no name', async () => {
    const full = await harness.mount(props(), await inApp());
    const [name] = descriptionOf(full);
    harness.remount();
    const root = await harness.mount(props({ iconOnly: true }), await inApp());
    assert.ok(!root.querySelector('.essence-icon-picker-trigger-label'), 'no visible name drawn');
    assert.deepEqual(descriptionOf(root), [name]);
  });

  it('follows the value when the choice changes', async () => {
    const root = await harness.mount(props(), await inApp());
    const [before] = descriptionOf(root);
    await harness.setProps({ value: 'fas fa-bolt' });
    const [after] = descriptionOf(root);
    assert.ok(after.length > 0 && after !== before, 'the description names the new glyph');
  });

  it('describes nothing when no glyph is chosen', async () => {
    for (const value of ['', 'not a glyph']) {
      const root = await harness.mount(props({ value }), await inApp());
      assert.ok(
        !triggerOf(root).hasAttribute('aria-describedby'),
        `value "${value}" is no choice, so nothing is described`
      );
      harness.remount();
    }
  });

  it('keeps the name-only trigger in a mount with no localizer, which is the published mount', async () => {
    const root = await harness.mount(props());
    assert.ok(!triggerOf(root).hasAttribute('aria-describedby'));
    assert.ok(!root.querySelector('[hidden]'), 'and draws no description node');
    assert.equal(triggerOf(root).getAttribute('aria-label'), 'Reagent icon');
  });
});
