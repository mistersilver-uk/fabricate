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
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
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
    // The world-scope model this editor renders since issue 1372. `essenceScoped.js` imports
    // nothing; `scopedStudio.js` is `InheritRow`'s and `MembershipActions`' row-set source and
    // reaches the projection and the three scope modules underneath it.
    'src/ui/svelte/apps/manager/scoped/essenceScoped.js',
    'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
    'src/ui/svelte/stores/worldScopeProjection.js',
    // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
    // per-entry references now, so its own static closure reaches the vocabulary core and the
    // shipped counter. The harness validates this closure and names the miss, unlike the
    // hand-rolled trees elsewhere.
    'src/systems/worldVocabulary.js',
    'src/utils/vocabularyUsage.js',
    'src/utils/componentCategories.js',
    'src/utils/recipeCategories.js',
    'src/systems/componentScope.js',
    'src/systems/essenceScope.js',
    'src/systems/toolScope.js',
    'src/systems/scopedDefinitions.js',
    'src/systems/scopedDefinitionStore.js',
    'src/migration/worldScopeEntityGrouping.js',
    'src/utils/definitionIndex.js',
    'src/utils/sourceReferenceUnion.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    // The rules screen's opening and closing cards (issue 1372). Both are STATIC imports of
    // `EssenceEditView`, so an omission HANGS this suite (`# cancelled`) rather than failing it.
    'src/ui/svelte/apps/manager/scoped/CopyRulesCard.svelte',
    'src/ui/svelte/apps/manager/scoped/SharedDefinitionCallout.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/ToggleCard.svelte',
    'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    'src/ui/svelte/components/Field.svelte',
    // THE manager's labelled push-button (issue 1118). `ExplainerCard`'s docs link and
    // `EditorValidationSurface`'s View action both render through the primitive, so it is a
    // STATIC import of this tree; omitting it HANGS this suite as `# cancelled`.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/ManagerColorPopover.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    // THE shared picker both of the two above now render (issue 1503). `IconPicker` and
    // `EssenceSourceSelector` are `SearchablePopover` call sites, so the primitive is a STATIC
    // import of this tree; omitting it throws in `before()` and reports `# cancelled`.
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/EssenceSourceSelector.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceEditorTabs.svelte',
    'src/ui/svelte/apps/manager/EditorTabs.svelte',
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
    const sourceSublines = [...card.querySelectorAll('.manager-item-drop-zone-copy small')].map(
      (line) => line.textContent.trim()
    );
    assert.equal(
      sourceSublines.some((line) => line.includes('Item.ruby')),
      false,
      'so the uuid is not the sub-line'
    );
    // ...and it is on the ADDRESS line the reference draws under the name (issue 1372). The two
    // assertions are a pair: the uuid must be reachable without a click AND must not be occupying
    // the slot that tells the GM what the card is for.
    assert.equal(
      card.querySelector('[data-item-drop-zone-uuid]').textContent.trim(),
      'Item.ruby',
      'the address has its own mono line'
    );

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
  // ── THE WORLD-SCOPE LOCK (issue 1372, criterion 10) ─────────────────────────────────────────
  //
  // BOTH DIRECTIONS ARE EXERCISED IN ONE TEST, and that pairing is the whole point. The lock is
  // observable ONLY as an absence, and an absence assertion against a hook nothing renders passes
  // on a tree where the lock was never built — so the same mount asserts the OVERRIDDEN section's
  // unlink control EXISTS. One inherited and one overridden in one render also makes the failure
  // "locked both" distinguishable from "locked neither", which a single-section fixture cannot do.

  /**
   * A world essence scope projection with one membership record whose two sections differ.
   *
   * @param {{effectSource: boolean, macro: boolean}} inherited per-section inherit switches.
   * @param {boolean} [member]
   * @returns {object}
   */
  function scopeWith(inherited, member = true) {
    return {
      entityType: 'essence',
      sections: ['effectSource', 'macro'],
      enableable: true,
      taggable: false,
      sourceLinked: false,
      hasColorToken: true,
      available: true,
      seeded: { entities: true, defaults: true, membership: true },
      entities: [{ id: 'aether', name: 'Aether' }],
      entries: [
        {
          id: 'aether',
          entity: { id: 'aether', name: 'Aether' },
          defaults: { id: 'aether', effectSource: 'Item.world-ruby', macro: 'Macro.world-bind' },
          membershipCount: 2,
          inheritCounts: { effectSource: 1, macro: 1 },
          hasSourceLink: false,
          systems: [
            { systemId: 'sys-a', systemName: 'Mythwright Forge', member, enabled: true, inherited },
            {
              systemId: 'sys-b',
              systemName: 'Ironblood',
              member: true,
              enabled: true,
              inherited: {},
            },
          ],
        },
      ],
    };
  }

  const SCOPE_PROPS = {
    actions: {},
    systems: [
      { id: 'sys-a', name: 'Mythwright Forge' },
      { id: 'sys-b', name: 'Ironblood' },
    ],
    systemId: 'sys-a',
  };

  it("locks an INHERITED section's value card read-only while the overridden one stays editable", async () => {
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(
      props({ ...SCOPE_PROPS, scope: scopeWith({ effectSource: true, macro: false }) })
    );
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();
    // The rules screen's first tab IS the rules tab, so this is a no-op re-selection rather than
    // a navigation — asserted through `openTab` all the same, because a strip that stopped
    // rendering the tab would fail here rather than silently photographing another panel.
    openTab(root, 'rules');

    // THE NEGATIVE HALF: the inherited section presents no edit affordance at all.
    assert.equal(
      root.querySelector('[data-scoped-source-unlink]'),
      null,
      'an inherited section is not this system to change, so its unlink must be absent'
    );
    assert.ok(
      root.querySelector('[data-scoped-source-locked="effectSource"]'),
      'and it renders a read-only card in its place rather than nothing at all'
    );

    // THE POSITIVE HALF, IN THE SAME RENDER: the OVERRIDDEN section is fully editable, which is
    // what makes the absence above a measurement rather than a selector that matches nothing.
    assert.ok(
      root.querySelector('[data-scoped-macro-unlink]'),
      'the overridden macro section keeps its unlink'
    );
    assert.equal(root.querySelector('[data-scoped-macro-locked]'), null);
    harness.remount();
  });

  it('unlocks the section once its inherit switch goes off, so the lock is not a permanent state', async () => {
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(
      props({ ...SCOPE_PROPS, scope: scopeWith({ effectSource: false, macro: true }) })
    );
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();
    openTab(root, 'rules');

    // The mirror image of the test above, on the same component and the same fixture shape. A
    // lock that never lifted would satisfy the negative half of that test forever.
    assert.ok(root.querySelector('[data-scoped-source-unlink]'));
    assert.equal(root.querySelector('[data-scoped-source-locked]'), null);
    assert.equal(root.querySelector('[data-scoped-macro-unlink]'), null);
    assert.ok(root.querySelector('[data-scoped-macro-locked="macro"]'));
    harness.remount();
  });

  it('states the BLOCK when this system holds no membership record, and offers the one fix', async () => {
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(
      props({ ...SCOPE_PROPS, scope: scopeWith({}, false) })
    );
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();

    assert.ok(
      root.querySelector('[data-essence-scope-state="no-membership"]'),
      'no record in this system means nothing here reads any of these values, and it says so'
    );
    assert.ok(
      root.querySelector('[data-scoped-membership-add]'),
      'and the one action that changes that is on screen'
    );
    // NON-VACUITY: the inherit switches are NOT drawn for a non-member, because there is no
    // record for them to write to — a switch that wrote to nothing would report a state it
    // could not hold.
    assert.equal(root.querySelector('[data-scoped-inherit-toggle="effectSource"]'), null);
    harness.remount();
  });

  it('renders none of the world-scope chrome when the corpus cannot answer for this essence', async () => {
    // THE DEFAULT PATH, pinned. An essence the world catalogue does not hold is an ordinary
    // state while `## CraftingSystem` requirement 36 holds, and the editor must render exactly as
    // it did before issue 1372 — no banner, no switches, no lock.
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(props());
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();
    openTab(root, 'oncraft');

    assert.equal(root.querySelector('[data-essence-scope-banner]'), null);
    assert.equal(root.querySelector('[data-scoped-inherit-toggle]'), null);
    assert.equal(root.querySelector('[data-scoped-source-locked]'), null);
    assert.ok(
      root.querySelector('[data-scoped-source-unlink]'),
      'and the source card is editable, which is what the shipped editor always did'
    );
    harness.remount();
  });
});

describe('1372 EssenceEditView — the system Essence Rules screen', () => {
  /**
   * The same projection shape the lock tests above use, restated here so this block can vary the
   * membership roster it needs without perturbing theirs.
   *
   * @param {{effectSource?: boolean, macro?: boolean}} [inherited]
   * @param {boolean} [member]
   * @returns {object}
   */
  function worldScope(inherited = { effectSource: false, macro: false }, member = true) {
    return {
      entityType: 'essence',
      sections: ['effectSource', 'macro'],
      enableable: true,
      taggable: false,
      sourceLinked: false,
      hasColorToken: true,
      available: true,
      seeded: { entities: true, defaults: true, membership: true },
      entities: [{ id: 'aether', name: 'Aether' }],
      entries: [
        {
          id: 'aether',
          entity: { id: 'aether', name: 'Aether', icon: 'fas fa-atom', colorToken: 'lavender' },
          defaults: { id: 'aether', effectSource: 'Item.world-ruby', macro: 'Macro.world-bind' },
          membershipCount: 3,
          inheritCounts: { effectSource: 1, macro: 1 },
          hasSourceLink: false,
          systems: [
            {
              systemId: 'sys-a',
              systemName: 'Karrun Forgecraft',
              member,
              enabled: true,
              inherited,
            },
            {
              systemId: 'sys-b',
              systemName: 'Ironblood',
              member: true,
              enabled: true,
              inherited: {},
            },
            {
              systemId: 'sys-c',
              systemName: 'Saltmarsh',
              member: true,
              enabled: true,
              inherited: {},
            },
          ],
        },
      ],
    };
  }

  const ROSTER = [
    { id: 'sys-a', name: 'Karrun Forgecraft' },
    { id: 'sys-b', name: 'Ironblood' },
    { id: 'sys-c', name: 'Saltmarsh' },
  ];

  /**
   * Mount the rules screen for a world-known essence.
   *
   * @param {object} [extra] props merged over the defaults.
   * @returns {Promise<object>} the mounted root.
   */
  async function mountRules(extra = {}) {
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(
      props({ scope: worldScope(), systems: ROSTER, systemId: 'sys-a', actions: {}, ...extra })
    );
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();
    return root;
  }

  // ── IDENTITY MUST BE IMPOSSIBLE TO EDIT FROM A SYSTEM ───────────────────────────────────────
  //
  // This is a MODEL rule, not a layout preference: a world record holds identity and every system
  // holding the essence resolves the same one, so a name field here renames it in every other
  // system from a screen titled with one of them.
  //
  // THE ABSENCES ARE PAIRED WITH A POSITIVE, because an absence assertion against a hook nothing
  // renders passes on a tree where the control was never built at all — and the create-draft test
  // below is that pair's second half: every selector asserted absent here resolves there, on the
  // same component.
  it('renders no identity control at all, and a two-tab strip with no Identity tab', async () => {
    const root = await mountRules();

    assert.ok(!root.querySelector('#manager-essence-edit-name'), 'no name field');
    assert.ok(!root.querySelector('#manager-essence-edit-description'), 'no description field');
    assert.ok(!root.querySelector('.essence-icon-picker-trigger'), 'no icon picker');
    assert.ok(!root.querySelector('[data-manager-essence-colour]'), 'no colour palette');
    assert.ok(
      !root.querySelector('[data-essence-tab="identity"]'),
      'and no Identity tab to reach one by'
    );

    assert.deepEqual(
      [...root.querySelectorAll('[data-essence-tab]')].map((tab) => tab.dataset.essenceTab),
      ['rules', 'validation'],
      'the strip is `Essence rules` and `Validation`'
    );
    harness.remount();
  });

  it('KEEPS the identity form for a CREATE draft, which has no shared definition', async () => {
    // THE NON-VACUITY HALF of the test above.
    globalThis.fromUuid = async () => null;
    const root = await harness.mount(props({ essence: makeEssenceRow({ id: '' }) }));
    flushSync();

    assert.ok(root.querySelector('[data-essence-tab="identity"]'), 'the Identity tab is there');
    assert.ok(root.querySelector('#manager-essence-edit-name'), 'and the name field with it');
    assert.ok(
      !root.querySelector('[data-scoped-shared-definition]'),
      'and no shared-definition callout, because there is no shared definition yet'
    );
    harness.remount();
  });

  it('opens with the shared-definition callout, and its exit routes to the world entry', async () => {
    const opened = [];
    const root = await mountRules({ onOpenSharedDefinition: (id) => opened.push(id) });

    const callout = root.querySelector('[data-scoped-shared-definition]');
    assert.ok(callout, 'the callout is the first thing the rules tab says');
    assert.ok(
      callout.textContent.includes('Aether'),
      'it names the essence rather than "the shared definition"'
    );
    assert.ok(callout.textContent.includes('World definition'), 'and marks which layer that is');
    assert.match(
      callout.querySelector('[data-scoped-shared-definition-note]').textContent,
      /shared with 2 other systems/,
      'the sentence counts the OTHER systems, so three members reads as two others'
    );

    callout.querySelector('[data-scoped-shared-definition-open]').click();
    flushSync();
    assert.deepEqual(opened, ['aether'], 'the exit routes to the world entry on THIS essence');
    harness.remount();
  });

  it('gives the per-system enable switch its own titled card, and it drives the draft', async () => {
    const dirty = [];
    const root = await mountRules({ onDirtyChange: (next) => dirty.push(next) });

    const card = root.querySelector('[data-recipe-section="enabled"]');
    assert.ok(card, 'the enable switch is a card of its own');
    assert.ok(
      card.textContent.includes('Enabled in Karrun Forgecraft'),
      'titled with the system it is true of, not a bare `Off`'
    );
    assert.ok(
      card.textContent.includes(
        'Components in this system can carry it, and recipes can require it.'
      ),
      'and stating what being enabled means'
    );

    // `CONFIGURED` is DISABLED, so the switch reports off and flipping it makes the draft dirty.
    const toggle = card.querySelector('[data-recipe-field="essence-enabled"]');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    toggle.click();
    flushSync();
    assert.equal(toggle.getAttribute('aria-pressed'), 'true', 'the DOM follows the write');
    assert.ok(dirty.includes(true), 'and the edit is buffered rather than persisted on change');
    harness.remount();
  });

  it('puts each section switch INSIDE the card it governs, with its own state sentence', async () => {
    const toggled = [];
    const root = await mountRules({
      actions: {
        setSectionInherited: (entityId, systemId, section, next) =>
          toggled.push([entityId, systemId, section, next]),
      },
    });

    const sourceCard = root.querySelector('[data-essence-section="effect-source"]');
    const macroCard = root.querySelector('[data-essence-section="macro"]');
    assert.ok(
      sourceCard.querySelector('[data-scoped-inherit-toggle="effectSource"]'),
      'the effect-source switch is in the effect-source card'
    );
    assert.ok(
      macroCard.querySelector('[data-scoped-inherit-toggle="macro"]'),
      'and the macro switch is in the macro card'
    );
    // THE CROSS-CHECK, which is what stops both cards rendering the whole row set: neither card
    // may carry the other's switch.
    assert.ok(!sourceCard.querySelector('[data-scoped-inherit-toggle="macro"]'));
    assert.ok(!macroCard.querySelector('[data-scoped-inherit-toggle="effectSource"]'));

    assert.match(
      sourceCard.querySelector('[data-scoped-inherit-row="effectSource"]').textContent,
      /Overridden for Karrun Forgecraft/,
      'the row head states which way it is set and names the system'
    );
    assert.match(
      sourceCard.querySelector('[data-scoped-inherit-note="effectSource"]').textContent,
      /uses its own effect source/,
      'and the note says what this system resolves the section to today'
    );
    assert.match(
      sourceCard.querySelector('[data-scoped-inherit-note="effectSource"]').textContent,
      /Turn off to fall back to/,
      'and what the switch beside it would change that to'
    );

    sourceCard.querySelector('[data-scoped-inherit-toggle="effectSource"]').click();
    flushSync();
    assert.deepEqual(
      toggled,
      [['aether', 'sys-a', 'effectSource', true]],
      'the switch writes the MEMBERSHIP record immediately, not the buffered draft'
    );
    harness.remount();
  });

  it('closes with the reuse card, whose chooser copies into the systems the GM ticks', async () => {
    const copied = [];
    const root = await mountRules({
      actions: {
        copyMembership: (entityId, fromSystemId, targets) => {
          copied.push([entityId, fromSystemId, targets]);
          return true;
        },
      },
    });

    const card = root.querySelector('[data-scoped-copy-rules]');
    assert.ok(card, 'the reuse card is on the screen');
    assert.match(
      card.textContent,
      /One-time shortcut, not a live link/,
      'and says it is not a live link'
    );

    card.querySelector('[data-scoped-copy-rules-open]').click();
    flushSync();
    const picker = root.querySelector('[data-scoped-copy-rules-picker]');
    assert.ok(picker, 'the chooser opens in the card');
    assert.ok(
      !picker.querySelector('[data-scoped-copy-rules-target="sys-a"]'),
      'and never offers the SOURCE system as a destination'
    );

    // Nothing is copied until a destination is ticked, because `copyMembership` refuses an empty
    // target list and reports nothing — a button that silently did nothing on every press.
    assert.equal(root.querySelector('[data-scoped-copy-rules-confirm]').disabled, true);

    // The hook lands on the `<input>` itself: `SelectionCheckbox` spreads its rest props onto
    // the control, not onto the label wrapping it.
    picker.querySelector('input[data-scoped-copy-rules-target="sys-c"]').click();
    flushSync();
    root.querySelector('[data-scoped-copy-rules-confirm]').click();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();
    assert.deepEqual(
      copied,
      [['aether', 'sys-a', ['sys-c']]],
      'the source is the system whose rules are on screen, which is why the chooser is here'
    );
    harness.remount();
  });

  it('states the block and offers only the Add when this system holds no record', async () => {
    const root = await mountRules({ scope: worldScope({}, false) });

    assert.ok(root.querySelector('[data-essence-scope-state="no-membership"]'));
    assert.ok(root.querySelector('[data-scoped-membership-add]'));
    // The callout still renders — the essence HAS a shared definition, this system merely has no
    // rules for it — and nothing that would write a record it does not have does.
    assert.ok(root.querySelector('[data-scoped-shared-definition]'));
    assert.ok(
      !root.querySelector('[data-recipe-section="enabled"]'),
      'no enable switch without a record to enable'
    );
    assert.ok(!root.querySelector('[data-scoped-inherit-toggle]'), 'and no inherit switch either');
    assert.ok(!root.querySelector('[data-scoped-copy-rules]'), 'and nothing to copy out');
    harness.remount();
  });
});
