/**
 * `EssenceEditView` mounted, in isolation (issue 1036).
 *
 * The editor's two async behaviours are what this suite exists for, because neither is
 * reachable from the manager-root suite's fixtures: the `type !== 'script'` rejection on a
 * dropped macro — which Stage B shipped as a checked leaf but deliberately left unwired —
 * and the resolution of a linked macro's display NAME, including the missing state.
 *
 * It also pins the tab strip's badges, which are the editor's only at-a-glance report of
 * what is configured and what is unfinished.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { makeEssenceRow } from '../helpers/makeEssenceRow.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-edit-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/managerColorTokens.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/utils/macroReference.js',
    'src/utils/essenceValidation.js',
    'src/ui/svelte/apps/manager/essences/essenceStudio.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/ToggleCard.svelte',
    'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerColorPopover.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/components/EssenceSourceSelector.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceEditorTabs.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceIdentityTab.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceOnCraftTab.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceValidationTab.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte',
    'src/ui/svelte/apps/manager/EssenceEditView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/EssenceEditView.svelte',
});

const CONFIGURED = makeEssenceRow({
  id: 'aether',
  name: 'Aether',
  colorToken: 'lavender',
  enabled: false,
  propertyMacroUuid: 'Macro.binding',
  sourceComponentId: 'c1',
  associatedSystemItemId: 'c1',
  sourceName: 'Flawless Ruby',
  sourceState: 'linked',
  hasEffectTransfer: true,
  hasPropertyMacro: true,
});

const MANAGED_ITEMS = [
  { id: 'c1', name: 'Flawless Ruby', img: '', originItemUuid: 'Item.ruby' },
  { id: 'c2', name: 'Whetstone', img: '', originItemUuid: 'Item.whetstone' },
];

function props(extra = {}) {
  return {
    essence: CONFIGURED,
    managedItemOptions: MANAGED_ITEMS,
    showSourceUi: true,
    showPropertyMacroUi: true,
    ...extra,
  };
}

/** Drive a real drop onto the macro card, exactly as a Foundry drag lands it. */
function dropMacro(root, payload) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: () => JSON.stringify(payload) },
  });
  root.querySelector('[data-essence-section="macro"] [data-manager-item-drop-zone]')
    .dispatchEvent(event);
}

const openTab = (root, tab) => {
  root.querySelector(`[data-essence-tab="${tab}"]`).click();
  flushSync();
};

before(async () => {
  await harness.setup();
});

after(() => {
  delete globalThis.fromUuid;
  harness.teardown();
});

beforeEach(() => {
  delete globalThis.fromUuid;
});

describe('1036/7 EssenceEditView — the dropped macro must be a SCRIPT macro', () => {
  it('links a script macro and names it', async () => {
    globalThis.fromUuid = async (uuid) =>
      uuid === 'Macro.script' ? { name: 'Ember Infusion', type: 'script', command: 'x' } : null;

    const root = await harness.mount(props({ essence: makeEssenceRow({ id: 'new' }) }));
    openTab(root, 'oncraft');
    dropMacro(root, { type: 'Macro', uuid: 'Macro.script' });
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();

    assert.ok(
      !root.querySelector('[data-essence-macro-warning]'),
      'a script macro is accepted with no warning'
    );
    assert.match(
      root.querySelector('[data-essence-section="macro"]').textContent,
      /Ember Infusion/,
      'and is named rather than shown as a raw uuid'
    );
    harness.remount();
  });

  it('REFUSES a chat macro and says why', async () => {
    // Foundry defaults a NEW Macro to `type: 'chat'`, and `command` is a required
    // StringField on BOTH types — so a GM who pastes JavaScript into a fresh macro without
    // changing its type produces exactly this payload. `MacroExecutor.run` guards only that
    // `command` is a string, so nothing further down would catch it.
    globalThis.fromUuid = async () => ({ name: 'Pasted Script', type: 'chat', command: 'x' });

    const root = await harness.mount(props({ essence: makeEssenceRow({ id: 'new' }) }));
    openTab(root, 'oncraft');
    dropMacro(root, { type: 'Macro', uuid: 'Macro.chat' });
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();

    const warning = root.querySelector('[data-essence-macro-warning]');
    assert.ok(warning, 'the refusal is reported on the surface, not swallowed');
    assert.match(warning.textContent, /script macro/i, 'and names the reason and the fix');
    assert.ok(
      !root.querySelector('[data-essence-section="macro"] [data-item-drop-state]'),
      'nothing was linked'
    );
    harness.remount();
  });

  it('REFUSES a macro that does not resolve at all', async () => {
    globalThis.fromUuid = async () => null;

    const root = await harness.mount(props({ essence: makeEssenceRow({ id: 'new' }) }));
    openTab(root, 'oncraft');
    dropMacro(root, { type: 'Macro', uuid: 'Macro.gone' });
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();

    assert.match(
      root.querySelector('[data-essence-macro-warning]').textContent,
      /could not be found/i
    );
    harness.remount();
  });
});

describe('1036 EssenceEditView — the On-craft tab', () => {
  it('renders the suppression rather than removing the behaviour, for a DISABLED essence', async () => {
    const root = await harness.mount(props());
    openTab(root, 'oncraft');

    assert.equal(
      root.querySelector('[data-essence-source-pill]').dataset.essenceSourcePill,
      'suppressed'
    );
    assert.equal(
      root.querySelector('[data-essence-macro-pill]').dataset.essenceMacroPill,
      'suppressed'
    );
    assert.ok(
      root.querySelector('[data-essence-section="macro"] [data-manager-item-drop-zone]'),
      'the linked card still renders: suppression is a state ON the section, not a removal'
    );

    // Negative control, driven through the LIVE draft rather than through a new prop: the
    // editor re-seeds only when the essence IDENTITY changes, which is what stops a store
    // refresh discarding the GM's in-progress edits. Flipping the Enabled row is therefore
    // both the honest control and a second fact — the suppression follows the draft, not the
    // persisted definition.
    openTab(root, 'identity');
    root.querySelector('[data-recipe-field="essence-enabled"]').click();
    flushSync();
    openTab(root, 'oncraft');
    assert.equal(
      root.querySelector('[data-essence-source-pill]').dataset.essenceSourcePill,
      'state',
      'the same configuration on an ENABLED essence is not suppressed'
    );
    harness.remount();
  });

  it('explains the both-gates-off state instead of rendering an empty tab', async () => {
    const root = await harness.mount(
      props({ showSourceUi: false, showPropertyMacroUi: false })
    );
    openTab(root, 'oncraft');

    assert.ok(root.querySelector('[data-essence-on-craft-empty]'));
    assert.ok(!root.querySelector('[data-essence-section="effect-source"]'), 'no source card');
    assert.ok(!root.querySelector('[data-essence-section="macro"]'), 'and no macro card');
    harness.remount();
  });

  it('paints an unresolvable linked macro as MISSING', async () => {
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(props());
    openTab(root, 'oncraft');
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();

    assert.equal(
      root
        .querySelector('[data-essence-section="macro"] [data-manager-item-drop-zone]')
        .dataset.itemDropState,
      'missing',
      'a broken link is otherwise indistinguishable from a working one — and at craft time it is skipped SILENTLY'
    );
    harness.remount();
  });
});

describe('1036 EssenceEditView — tab badges', () => {
  it('counts CONFIGURED behaviours on the On-craft badge, not effects', async () => {
    const root = await harness.mount(props());
    assert.equal(
      root.querySelector('[data-essence-tab="oncraft"] .manager-editor-tab-badge').textContent.trim(),
      '2',
      'a linked source and a linked macro'
    );

    await harness.setProps(props({ showPropertyMacroUi: false }));
    assert.equal(
      root.querySelector('[data-essence-tab="oncraft"] .manager-editor-tab-badge').textContent.trim(),
      '1',
      'a gated-off capability cannot be configured from this tab, so it does not count'
    );
    harness.remount();
  });

  it('reports the validation state in words on the tab and in rows on the panel', async () => {
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(props());
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();

    const badge = root.querySelector('[data-essence-tab="validation"] .manager-editor-tab-badge');
    assert.notEqual(badge.textContent.trim(), '✓', 'an unresolvable macro is a real warning');

    openTab(root, 'validation');
    const macroRow = root.querySelector('[data-essence-validation-check="macro"]');
    assert.ok(macroRow, 'the macro check has its own row');
    assert.match(
      macroRow.textContent,
      /does not resolve/i,
      'this tab is the GM ONLY route to the fact — craft time logs and skips it silently'
    );

    // Unset colour is a PASS, not a warning: an unset essence renders in the theme accent
    // by design. The negative control is the macro row above, which does fail.
    const colourRow = root.querySelector('[data-essence-validation-check="colour"]');
    assert.ok(!/WARNING/i.test(colourRow.textContent), 'the colour row never warns');
    harness.remount();
  });
});
