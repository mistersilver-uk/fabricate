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
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/managerColorTokens.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/utils/macroReference.js',
    'src/utils/essenceValidation.js',
    'src/ui/svelte/apps/manager/essences/essenceStudio.js',
    // The behaviour preview's "How players see it" card mounts the REAL player InventoryItemCard
    // (issue 1036, round 3), fed synthetic rows by the pure essencePreviewRow helper — both
    // import only craftingImageDefaults, so these three entries suffice.
    'src/ui/svelte/util/essencePreviewRow.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    // The essence colour fold, shared by the player card tile, its pips and the inspector.
    'src/ui/svelte/util/essenceTint.js',
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
    // THE manager's labelled push-button (issue 1118). `ExplainerCard`'s docs link and
    // `EditorValidationSurface`'s View action both render through the primitive, so it is a
    // STATIC import of this tree; omitting it HANGS this suite as `# cancelled`.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerColorPopover.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/components/EssenceSourceSelector.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceEditorTabs.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceIdentityTab.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceOnCraftTab.svelte',
    // The shared scoped validation shell (issue 1362).
    'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceValidationTab.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte',
    // The REAL player essence/component tile the behaviour preview now mounts (issue 1036,
    // round 3). A `.svelte` in the declared closure but absent HANGS the suite (# cancelled).
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
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

  // The maintainer's round-2 ruling: "the linked item active effect source needs to appear
  // the same way a linked item in the tool studio editor view does". Four defects were named
  // off `manager-essence-edit-on-craft.png`, and each has an assertion here, because every
  // one of them is invisible in source unless you already know to look.
  it('renders a linked source exactly as the Tool Studio renders a linked Item', async () => {
    const copied = [];
    const root = await harness.mount(props({ onCopySourceUuid: (uuid) => copied.push(uuid) }));
    openTab(root, 'oncraft');

    const card = root.querySelector('[data-item-drop-zone="essence-source"]');
    assert.ok(card, 'the linked source is the SHARED drop-zone card, not a hand-rolled summary');
    assert.ok(card.textContent.includes('Flawless Ruby'), 'named in bold, as the Tool Studio is');

    // 1. the sub-line was the raw uuid where the Tool Studio gives an instruction.
    assert.ok(
      card.textContent.includes('Drop another Item here to replace the linked source.'),
      'the sub-line instructs rather than restating the uuid'
    );
    assert.equal(card.textContent.includes('Item.ruby'), false, 'so the uuid is not the sub-line');

    // 2. one square clear button became the Tool Studio's grouped pair.
    const actions = card.querySelectorAll('.manager-item-drop-zone-actions .manager-icon-button');
    assert.equal(actions.length, 2, 'copy source uuid and unlink, grouped and right-aligned');
    actions[0].click();
    flushSync();
    assert.deepEqual(copied, ['Item.ruby'], 'and copy reaches the clipboard seam with the uuid');

    // 3. the duplicated `Drop or pick` zone under the linked card is gone. The card IS the
    //    drop target, which is exactly what `ToolOverviewTab` does with the same primitive.
    assert.equal(
      root.querySelector('[data-essence-section="effect-source"] .manager-essence-source-drop-zone'),
      null,
      'no second drop zone says the same thing twice under the linked card'
    );

    // ...and the picker returns the moment the link is gone, because an essence source is an
    // in-system COMPONENT and the pick half is the only route to that list.
    actions[1].click();
    flushSync();
    assert.equal(
      root.querySelector('[data-item-drop-zone="essence-source"]'),
      null,
      'unlinking removes the card'
    );
    assert.ok(
      root.querySelector(
        '[data-essence-section="effect-source"] .manager-essence-source-drop-zone .essence-source-trigger'
      ),
      'and restores the drop-or-pick target in its place'
    );
    harness.remount();
  });

  // 4. the property macro card had the SAME defect in a worse form: `macroName` falls back to
  //    the uuid when the macro does not resolve, and `hint` was the uuid too, so the card
  //    printed `Macro.lab-aether-binding` as its title AND again as its sub-line.
  it('gives the property macro card an instruction rather than repeating its own uuid', async () => {
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(props());
    openTab(root, 'oncraft');
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();

    const card = root.querySelector('[data-essence-section="macro"] [data-manager-item-drop-zone]');
    const title = card.querySelector('.manager-item-drop-zone-copy strong').textContent.trim();
    const sublines = [...card.querySelectorAll('.manager-item-drop-zone-copy small')].map(
      (line) => line.textContent.trim()
    );

    assert.equal(title, 'Macro.binding', 'an unresolved macro is named by the uuid — its only name');
    assert.equal(
      sublines.includes(title),
      false,
      'and no sub-line repeats it back: the card said the same string twice'
    );
    assert.ok(
      sublines.includes('Drop another Macro here to replace the linked script.'),
      'the first sub-line instructs, as the Tool Studio does'
    );
    assert.ok(
      sublines.some((line) => line.includes('no longer resolves')),
      'and the missing-link warning survives beside it'
    );
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
