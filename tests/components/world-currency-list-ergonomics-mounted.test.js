import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// The Move up/down chevrons on a Currency Unit's summary row (issue 768). This guard used to
// live beside the modifier and prerequisite lists in `system-edit-list-ergonomics-mounted`,
// because all three lists were rendered by SystemEditView. Issue 1278 moved the currency ladder
// to world scope and out into WorldCurrencyTab, so its half of that shared contract moved here
// rather than mounting a second component from the same file.
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-currency-ergonomics-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js'
  ],
  compiledModules: [
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled)
    // rather than failing it, so every one is named.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    // THE manager's labelled push-button (issue 1118). The currency card header and each expanded unit render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte'
});

function flushRender() {
  return new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

function clickEvent() {
  return new globalThis.window.Event('click', { bubbles: true });
}

const CURRENCY_UNITS = Object.freeze([
  { id: 'cur-gold', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins', contains: [] },
  { id: 'cur-silver', label: 'Silver', abbreviation: 'sp', icon: 'fa-solid fa-coins', contains: [] }
]);

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('world currency list ergonomics (mounted, issue 768)', () => {
  it('reorders a Currency Unit via the Move up/down chevrons on the summary row', async () => {
    const calls = [];
    const root = await harness.mount({
      currencyUnits: CURRENCY_UNITS,
      onReorderCurrencyUnit: async (fromIndex, toIndex) => { calls.push([fromIndex, toIndex]); }
    });

    const firstUp = root.querySelector('[data-move-currency-up="cur-gold"]');
    const lastUp = root.querySelector('[data-move-currency-up="cur-silver"]');
    assert.ok(firstUp && lastUp, 'each currency summary row has a Move up chevron');
    assert.equal(firstUp.disabled, true, 'Move up disabled on the first unit');
    assert.equal(lastUp.disabled, false, 'Move up enabled on the last unit');

    lastUp.dispatchEvent(clickEvent());
    await flushRender();
    assert.deepEqual(calls, [[1, 0]], 'Move up fires the reorder op with (index, index-1)');
  });
});
