/** The two WORLD essence screens, mounted (issue 1372, epic 1357). */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  STATUS_TONE_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const SCOPED_RAW_MODULES = [
  // Issue 1506: the one tone map the converted status pills read at a dynamic site.
  ...STATUS_TONE_RAW_MODULES,
  // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
  ...SEARCHABLE_POPOVER_RAW_MODULES,
  ...FOUNDRY_BRIDGE_RAW_MODULES,
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/apps/manager/scoped/essenceScoped.js',
  'src/ui/svelte/apps/manager/scoped/componentScoped.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
  // per-entry references now, so its own static closure reaches the vocabulary core and the
  // shipped counter. The harness validates this closure and names the miss, unlike the
  // hand-rolled trees elsewhere.
  'src/systems/worldVocabulary.js',
  'src/ui/model/vocabularyUsage.js',
  'src/utils/componentCategories.js',
  // #1663: the ONE implementation behind both category shims; imports nothing.
  'src/utils/categoryNormalization.js',
  'src/utils/recipeCategories.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/utils/scalars.js',
  'src/systems/worldScopeEntityGrouping.js',
  'src/utils/definitionIndex.js',
  'src/utils/sourceReferenceUnion.js',
  'src/ui/model/browserPagination.js',
  'src/utils/bulkSelectionModel.js',
  'src/ui/model/scopedEntityListModel.js',
  // The frame's lifted view-state (issue 1438).
  'src/ui/model/managerBrowserViewState.js',
];

const SHELL_MODULES = [
  'src/ui/svelte/components/Callout.svelte',
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/components/ArmedDangerButton.svelte',
  // The catalogue inspector's pinned foot action (issue 1372). A missing entry here does not
  // FAIL the suite, it HANGS it and reports `# cancelled` — see
  // `mounted-harness-primitive-allowlist.test.js`, which is what caught this one.
  'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
  // THE manager's icon-only push-button (issue 1422). Not mounted directly by anything here:
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  // Select's own compiled closure (issue 1504) is spread beside this list wherever it is used
  // (`...SHELL_MODULES, ...SELECT_COMPILED_MODULES`), not folded in here: `Pagination` and the
  // frame below both render it now, so it and `SearchablePopover` are transitive dependencies of
  // this shell rather than new controls on these screens.
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
  // THE manager's on/off switch (issue 1040). Not mounted directly by anything here.
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
  // THE SHARED FRAME'S MEMBERSHIP FILTER IS A SEGMENTED TRACK SINCE ISSUE 1373.
  'src/ui/svelte/components/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
  // The extracted `SYSTEM RULES n / m` panel (issue 1372). A rendered child missing from this
  // list does not fail — it HANGS, and `node --test` reports the blocked tests as `# cancelled`.
  'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
];

const pageHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-essence-catalogue-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    ...SHELL_MODULES,
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/scoped/WorldEssenceCataloguePage.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldEssenceCataloguePage.svelte',
});

/** The ENTRY editor's own harness (issue 1372, maintainer parity round 4). */
const entryHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-essence-entry-',
  rawModules: [
    ...SCOPED_RAW_MODULES,
    'src/ui/svelte/apps/manager/scoped/scopedEntryDraft.js',
    'src/ui/svelte/apps/manager/essences/essenceStudio.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/essenceTint.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/util/essencePreviewRow.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/foundryIconCatalogue.json',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/managerColorTokens.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/model/essenceValidation.js',
  ],
  compiledModules: [
    ...SHELL_MODULES,
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/EditorTabs.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/components/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceBehaviorPreview.svelte',
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerColorPopover.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedEntrySystemsCard.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldEssenceEntryPage.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldEssenceEntryPage.svelte',
});

const shellHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-essence-control-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [...SHELL_MODULES, ...SELECT_COMPILED_MODULES],
  componentPath: 'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
});

const ROSTER = [
  { id: 'sys-a', name: 'Mythwright Forge' },
  { id: 'sys-b', name: 'Ironblood' },
  { id: 'sys-c', name: 'Emberwatch' },
];

/**
 * An ESSENCE projection with one entity whose three per-system rows are in the three states.
 *
 * @returns {object}
 */
function essenceScope() {
  return projectWorldScopeEntity({
    entityType: 'essence',
    corpus: {
      entities: [
        { id: 'ash', name: 'Ash', icon: 'fas fa-fire', colorToken: 'ember', description: 'Cinders' },
        { id: 'brine', name: 'Brine', icon: 'fas fa-water', colorToken: 'tide', description: 'Salt' },
      ],
      defaults: [{ id: 'ash', effectSource: 'Item.ember' }],
      membership: [
        { entityId: 'ash', systemId: 'sys-a', enabled: true, inherit: {} },
        { entityId: 'ash', systemId: 'sys-b', enabled: false, inherit: {} },
        { entityId: 'brine', systemId: 'sys-a', enabled: true, inherit: {} },
      ],
    },
    systems: ROSTER,
    usage: {
      ash: {
        componentCount: 1,
        previewCarrier: {
          id: 'ash-carrier',
          name: 'Ashen Thread',
          img: 'icons/commodities/materials/thread-plain-grey.webp',
        },
      },
    },
  });
}

/**
 * A COMPONENT projection over the SAME shape, for the positive control.
 *
 * @returns {object}
 */
function componentScope() {
  return projectWorldScopeEntity({
    entityType: 'component',
    corpus: {
      entities: [
        {
          id: 'iron',
          name: 'Iron',
          description: 'Ore',
          img: 'icons/commodities/metal/ingot-iron.webp',
          originItemUuid: 'Item.iron',
        },
      ],
      defaults: [],
      membership: [{ entityId: 'iron', systemId: 'sys-a', inherit: {} }],
    },
    systems: ROSTER,
  });
}

function pageProps(extra = {}) {
  return { scope: essenceScope(), actions: {}, systems: ROSTER, onOpenEntry: () => {}, ...extra };
}

before(async () => {
  await pageHarness.setup();
  await shellHarness.setup();
  await entryHarness.setup();
});

after(() => {
  pageHarness.teardown();
  shellHarness.teardown();
  entryHarness.teardown();
});

describe('the essence catalogue opens with its first shown row inspected', () => {
  function selectedIds(root) {
    return [...root.querySelectorAll('[data-scoped-list-row].is-selected')].map((row) =>
      row.getAttribute('data-scoped-list-row')
    );
  }

  function search(root, value) {
    const input = root.querySelector('[data-scoped-list-search]');
    input.value = value;
    input.dispatchEvent(new root.ownerDocument.defaultView.Event('input', { bubbles: true }));
    flushSync();
  }

  it('inspects the first row without moving the choice when a filter hides it', async () => {
    const root = await pageHarness.mount(pageProps());
    assert.deepEqual(selectedIds(root), ['ash']);
    assert.equal(root.querySelector('[data-scoped-list-inspector-name]').textContent.trim(), 'Ash');

    search(root, 'no matching essence');
    assert.deepEqual(selectedIds(root), [], 'the selected id remains valid while no row is shown');
    assert.ok(root.querySelector('[data-scoped-list-inspector-state="resting"]'));

    search(root, '');
    assert.deepEqual(selectedIds(root), ['ash'], 'clearing the filter restores the same choice');
  });

  it('waits for late data and does not replace an id whose record was deleted', async () => {
    const empty = essenceScope();
    empty.entries = [];
    const root = await pageHarness.mount(pageProps({ scope: empty }));
    assert.deepEqual(selectedIds(root), []);

    await pageHarness.setProps({ scope: essenceScope() });
    assert.deepEqual(selectedIds(root), ['ash'], 'the first late-loaded row is selected');

    const withoutAsh = essenceScope();
    withoutAsh.entries = withoutAsh.entries.filter((entry) => entry.id !== 'ash');
    await pageHarness.setProps({ scope: withoutAsh });
    assert.deepEqual(selectedIds(root), [], 'a stale catalogue id leaves the inspector resting');
    assert.ok(root.querySelector('[data-scoped-list-inspector-state="resting"]'));
  });
});

describe('criterion 4 — the essence catalogue renders NO source-item affordance', () => {
  it('renders the identity as a GLYPH, with no image and no source badge anywhere', async () => {
    const root = await pageHarness.mount(pageProps());

    // THE POSITIVE HALF FIRST, so the two negatives below are known to be measured over a screen
    // that actually rendered rows.
    const glyphs = root.querySelectorAll('[data-scoped-list-row] [data-medallion="glyph"]');
    assert.equal(glyphs.length, 2, 'both world essences render their own identity glyph');
    assert.ok(glyphs[0].querySelector('i'), 'and the glyph is a Font Awesome class, not a path');

    assert.equal(
      root.querySelectorAll('[data-scoped-list-source], [data-scoped-source]').length,
      0,
      'an essence has no source-item link, so no row may carry a source badge'
    );
    assert.equal(
      root.querySelectorAll('img').length,
      0,
      'and no `<img>`: an essence identity is a glyph plus a colour token, never an item image'
    );
    pageHarness.remount();
  });

  it('and the SAME shell renders both for a component scope, so the absence above is measured', async () => {
    // Without this control, "no source badge" and "no rows at all" are the same green.
    const root = await shellHarness.mount({
      scope: componentScope(),
      actions: {},
      systems: ROSTER,
      hookValue: 'world-components',
      title: 'Component catalogue',
    });
    assert.ok(
      root.querySelector('[data-scoped-list-source]'),
      'the shell DOES render a source badge for an entity type that has one'
    );
    assert.ok(root.querySelector('img'), 'and it DOES render the item image');
    shellHarness.remount();
  });
});

describe('criterion 5 — the per-system indicator has three distinct states', () => {
  it('renders exactly {absent, disabled, enabled} across three fixture systems', async () => {
    // ── THE INDICATOR MOVED FROM THE ROW TO THE INSPECTOR (issue 1372) ────────────────────────
    // It used to be a strip of one coloured dot per crafting system in the LIST ROW. The
    // prototype's row draws none (`essences.png`), and the strip was about 90px of a 1280px row
    // spent on six identical circles whose system and state were reachable only by hovering one
    // of them. The three states are now stated on the inspector's system rows, each of which links
    // to that system's own Essence Rules screen, where the controls that change them live.
    const root = await pageHarness.mount(pageProps());
    root.querySelector('[data-scoped-list-inspect="ash"]').click();
    flushSync();
    const inspector = root.querySelector('[data-scoped-list-inspector]');
    assert.ok(inspector, 'the inspected entity has an inspector panel');

    const states = [...inspector.querySelectorAll('[data-scoped-system-state]')].map((node) =>
      node.getAttribute('data-scoped-system-state')
    );
    // A SET EQUALITY, not three existence checks. `enabled: false` keeps the record and its
    // overrides, so collapsing `disabled` into `absent` is the defect this measures — and it
    // leaves three cells rendering two values, which only a set comparison catches.
    assert.deepEqual([...new Set(states)].sort(), ['absent', 'disabled', 'enabled']);
    assert.equal(states.length, 3, 'one cell per crafting system in the roster');

    // Each cell names its system too, so the state is legible without decoding a colour.
    const bySystem = new Map(
      [...inspector.querySelectorAll('[data-scoped-system]')].map((node) => [
        node.getAttribute('data-scoped-system'),
        node.getAttribute('data-scoped-system-state'),
      ])
    );
    assert.equal(bySystem.get('sys-a'), 'enabled');
    assert.equal(bySystem.get('sys-b'), 'disabled');
    assert.equal(bySystem.get('sys-c'), 'absent');

    // NON-VACUITY, and the deletion half: the ROW must no longer carry a pip strip.
    const row = root.querySelector('[data-scoped-list-row="ash"]');
    assert.ok(row, 'the fixture entity still has a row');
    assert.equal(
      row.querySelectorAll('[data-scoped-system-state]').length,
      0,
      'the row draws no per-system strip; the prototype draws none and the inspector says it'
    );
    pageHarness.remount();
  });

  it('draws every system row as a Rules link, member or not, with no Add button', async () => {
    // Maintainer defect report: this inspector drew a full-width `Add to this system` button in
    // each roster row, where the tool and component catalogues draw `[System] [Rules ↗]`. The page
    // now takes `systemRowAction="navigate"`, so a NON-member row links to that system's Essence
    // Rules screen too, which is where adoption happens.
    const opened = [];
    const root = await pageHarness.mount(
      pageProps({ onOpenSystemRules: (entityId, systemId) => opened.push([entityId, systemId]) })
    );
    root.querySelector('[data-scoped-list-inspect="ash"]').click();
    flushSync();
    const inspector = root.querySelector('[data-scoped-list-inspector]');
    const rows = [...inspector.querySelectorAll('[data-scoped-list-system]')];
    assert.equal(rows.length, 3, 'one roster row per crafting system');
    for (const row of rows) {
      const systemId = row.getAttribute('data-scoped-list-system');
      assert.ok(
        row.querySelector(`[data-scoped-list-system-rules="${systemId}"]`),
        `the ${systemId} row carries no Rules link`
      );
    }
    assert.equal(
      inspector.querySelectorAll('[data-scoped-membership-add]').length,
      0,
      'the roster still draws an Add button'
    );
    inspector.querySelector('[data-scoped-list-system-rules="sys-c"]').click();
    assert.deepEqual(opened, [['ash', 'sys-c']], 'the non-member Rules link opens that system');
    pageHarness.remount();
  });

  it('states the membership count beside the cells, so a collapsed rail still says how many', async () => {
    const root = await pageHarness.mount(pageProps());
    const count = root.querySelector('[data-scoped-essence-membership-count="ash"]');
    assert.ok(count, 'the row carries its own membership count');
    assert.match(count.textContent, /2/, 'two systems hold it, and it says so');
    pageHarness.remount();
  });
});

describe('the catalogue owns no create affordance; the page header does', () => {
  it('renders neither the name field nor the create button it used to carry', async () => {
    // ── WHERE CREATE WENT, AND WHY THIS CASE IS AN ABSENCE ────────────────────────────────────
    // The prototype puts one `+ New essence` button in the header band, right-aligned on the
    // title line (`essences.png`). This page shipped a full-width band above the list carrying a
    // `New essence name` label, a text input and the button — about 60px of chrome that read as a
    // form a GM had to fill in before anything else on the screen was available.
    const root = await pageHarness.mount(pageProps({ actions: { createEntity: () => {} } }));
    assert.equal(
      root.querySelectorAll('[data-scoped-essence-new-name]').length,
      0,
      'the create name field is gone from the page'
    );
    assert.equal(
      root.querySelectorAll('[data-scoped-essence-create-action]').length,
      0,
      'and so is the button beside it'
    );
    // NON-VACUITY: the page did mount and did render its list.
    assert.ok(
      root.querySelector('[data-scoped-list-row]'),
      'the page rendered its list, so the absences above are measured against a real screen'
    );
    pageHarness.remount();
  });
});

// ── THE ENTRY EDITOR BUFFERS ITS EDIT (issue 1372, maintainer parity round 4) ────────────────

describe('the world essence entry editor buffers its edit until Save', () => {
  /** A recording world-scope essence action family. */
  function recordingActions() {
    const calls = [];
    return {
      calls,
      updateEntity: (...args) => {
        calls.push(['updateEntity', ...args]);
        return true;
      },
      updateWorldDefaultSection: (...args) => {
        calls.push(['updateWorldDefaultSection', ...args]);
        return true;
      },
    };
  }

  /** Mount the entry editor on `ash`, which carries a world `effectSource` in `essenceScope()`. */
  async function mountEntry() {
    const actions = recordingActions();
    const reported = { handle: null, dirty: [] };
    const root = await entryHarness.mount({
      scope: essenceScope(),
      actions,
      entityId: 'ash',
      onBackToCatalogue: () => {},
      onDraftChange: (handle) => (reported.handle = handle),
      onDirtyChange: (dirty) => reported.dirty.push(dirty),
    });
    assert.ok(
      Boolean(root.querySelector('[data-scoped-entry="world-essence-entry"]')),
      'the editor did not render its panel, so nothing below is measuring the screen'
    );
    assert.ok(reported.handle, 'the editor reported no draft handle, so the shell has no Save');
    return { root, actions, reported };
  }

  const defaultState = (root, section) =>
    root
      .querySelector(`[data-scoped-world-default="${section}"]`)
      ?.getAttribute('data-scoped-world-default-state');

  afterEach(() => entryHarness.remount());

  it('CLEARING a world default writes nothing, and the card still reports the change', async () => {
    const { root, actions, reported } = await mountEntry();
    assert.equal(defaultState(root, 'effectSource'), 'set', 'the fixture opened with no default');
    assert.equal(reported.handle.isDirty(), false, 'a screen nobody has touched is not dirty');

    root.querySelector('[data-scoped-world-default-clear]').click();
    await entryHarness.setProps({});

    assert.deepEqual(
      actions.calls,
      [],
      'the edit reached the world-scope write family before anything asked it to'
    );
    assert.equal(
      defaultState(root, 'effectSource'),
      'unset',
      'the card still reads `set`, so the staged edit reached nothing that renders: an editor ' +
        'that buffers an edit it does not show is worse than one that writes through'
    );
    assert.equal(reported.handle.isDirty(), true);
    assert.equal(reported.dirty.at(-1), true, 'the header button was never told to enable');
  });

  it('pairs the projected carrier name and artwork in the preview', async () => {
    const { root } = await mountEntry();
    const component = root.querySelector('[data-essence-preview-component]');
    assert.equal(component.querySelector('.inventory-card-name').textContent.trim(), 'Ashen Thread');
    assert.equal(
      component.querySelector('.inventory-card-art img').getAttribute('src'),
      'icons/commodities/materials/thread-plain-grey.webp'
    );
  });

  it('SAVE flushes exactly the difference, and nothing else on the record', async () => {
    const { root, actions, reported } = await mountEntry();
    root.querySelector('[data-scoped-world-default-clear]').click();
    await entryHarness.setProps({});

    assert.equal(await reported.handle.save(), true);
    assert.deepEqual(actions.calls, [
      ['updateWorldDefaultSection', 'ash', 'effectSource', null],
    ]);
    assert.equal(
      reported.handle.isDirty(),
      false,
      'the flag is still set after a Save that landed, so the guard would offer to write it again'
    );
  });

  it('DISCARD puts the screen back to the record on disk, and writes nothing', async () => {
    const { root, actions, reported } = await mountEntry();
    root.querySelector('[data-scoped-world-default-clear]').click();
    await entryHarness.setProps({});
    assert.equal(defaultState(root, 'effectSource'), 'unset', 'the edit never landed in the draft');

    reported.handle.discard();
    await entryHarness.setProps({});

    assert.equal(defaultState(root, 'effectSource'), 'set', 'discard left the abandoned edit up');
    assert.equal(reported.handle.isDirty(), false);
    assert.deepEqual(actions.calls, [], 'discarding an edit is not a write');
  });

  it('TYPING a name is buffered too, and the input reverts on discard', async () => {
    const { root, actions, reported } = await mountEntry();
    const name = root.querySelector('[data-scoped-entry-name]');
    assert.equal(name.value, 'Ash');

    name.value = 'Aether';
    name.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await entryHarness.setProps({});
    assert.deepEqual(actions.calls, [], 'a keystroke wrote through to the world record');
    assert.equal(reported.handle.isDirty(), true);

    reported.handle.discard();
    await entryHarness.setProps({});
    // The input is the one control whose value the test set itself, so this is a real read.
    assert.equal(root.querySelector('[data-scoped-entry-name]').value, 'Ash');
    assert.equal(reported.handle.isDirty(), false);
  });

  // ── A FOUNDRY-REFUSED WRITE REJECTS.
  it('a REJECTING section write answers false and names the step that stopped and the one that had landed', async () => {
    const notified = [];
    const previousUi = globalThis.ui;
    Reflect.set(globalThis, 'ui', {
      notifications: {
        error: (message) => {
          notified.push(message);
        },
      },
    });
    try {
      const reported = { handle: null };
      const root = await entryHarness.mount({
        scope: essenceScope(),
        actions: {
          updateEntity: () => true,
          updateWorldDefaultSection: async () => {
            throw new Error('The requested Setting update was refused');
          },
        },
        entityId: 'ash',
        onBackToCatalogue: () => {},
        onDraftChange: (handle) => (reported.handle = handle),
        onDirtyChange: () => {},
      });
      assert.ok(reported.handle, 'the editor reported no draft handle, so nothing below is measured');

      // The IDENTITY patch lands first and the sections after it.
      const name = root.querySelector('[data-scoped-entry-name]');
      name.value = 'Aether';
      name.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
      root.querySelector('[data-scoped-world-default-clear]').click();
      await entryHarness.setProps({});

      assert.equal(
        await reported.handle.save(),
        false,
        'the Save RESOLVES false — the route-exit guard declines the exit rather than rejecting'
      );
      assert.deepEqual(
        notified,
        [
          'Saving the active effect source did not complete; the shared identity fields had already been saved. The requested Setting update was refused',
        ],
        'ONE sentence, naming the step that stopped and the one that had landed durably before it — and the identity fragment is THIS editor’s field set, which carries its colour token'
      );
      assert.equal(reported.handle.isDirty(), true, 'the edit is still in front of the GM');
    } finally {
      Reflect.set(globalThis, 'ui', previousUi);
    }
  });

  it('WITHDRAWS the handle when the editor unmounts, so a stale one cannot answer for it', async () => {
    const { reported } = await mountEntry();
    entryHarness.remount();
    assert.equal(
      reported.handle,
      null,
      'the shell is still holding a handle on an unmounted editor, which would answer the ' +
        'route-exit guard about a screen nobody is looking at'
    );
  });
});

// ── AN ESSENCE ROW MAY NOT BORROW THE COMPONENT'S CASCADE (issue 1371 r10, r9-cat finding 5b) ──

describe('the essence entry row states what an essence removal actually does', () => {
  afterEach(() => entryHarness.remount());

  it('names the overrides and promises NO recipe repair', async () => {
    const root = await entryHarness.mount({
      scope: essenceScope(),
      actions: {},
      entityId: 'ash',
      onBackToCatalogue: () => {},
    });
    // `ash` holds a record in `sys-a`.
    const remove = root
      .querySelector('[data-scoped-entry-system="sys-a"]')
      ?.querySelector('[data-arm-token]');
    assert.ok(Boolean(remove), 'the member row rendered its armed Remove');
    const note = remove.getAttribute('aria-label');
    assert.match(note, /Remove Ash from Mythwright Forge/, 'the sentence names this pair');
    assert.match(note, /Its overrides go with it; the world record and every other system are untouched\./);
    assert.equal(
      /recipe/.test(note),
      false,
      'an essence removal repairs no recipe, so no essence control may say it does'
    );
  });

  it('shares the component table controls while treating disabled rules as membership', async () => {
    const calls = [];
    const root = await entryHarness.mount({
      scope: essenceScope(),
      actions: {
        addToSystem: (...args) => calls.push(['add', ...args]),
        removeFromSystem: (...args) => calls.push(['remove', ...args]),
      },
      entityId: 'ash',
      onBackToCatalogue: () => {},
      onOpenSystemRules: (...args) => calls.push(['rules', ...args]),
    });

    assert.match(root.querySelector('[data-scoped-entry-systems-card]').textContent, /Systems using this essence/);
    root.querySelector('[data-scoped-entry-system-filter="with"] input').click();
    await entryHarness.setProps({});
    assert.deepEqual(
      [...root.querySelectorAll('[data-scoped-entry-system]')].map((row) => row.dataset.scopedEntrySystem),
      ['sys-a', 'sys-b'],
      'disabled rules remain in With rules because membership is independent of enabled state'
    );
    assert.match(root.querySelector('[data-scoped-entry-system="sys-b"]').textContent, /Disabled here/);

    root.querySelector('[data-scoped-entry-system-rules="sys-b"]').click();
    assert.deepEqual(calls, [['rules', 'ash', 'sys-b']]);

    const remove = root.querySelector(
      '[data-scoped-entry-system="sys-a"] [data-arm-token="scoped-membership-remove:ash|sys-a"]'
    );
    remove.click();
    await entryHarness.setProps({});
    root
      .querySelector(
        '[data-scoped-entry-system="sys-a"] [data-arm-token="scoped-membership-remove:ash|sys-a"]'
      )
      .click();
    assert.deepEqual(calls.at(-1), ['remove', 'ash', 'sys-a']);

    root.querySelector('[data-scoped-entry-system-filter="without"] input').click();
    await entryHarness.setProps({});
    const outsider = root.querySelector('[data-scoped-entry-system="sys-c"]');
    assert.ok(Boolean(outsider.querySelector('[data-scoped-membership-add]')));
    outsider.querySelector('[data-scoped-membership-add]').click();
    assert.deepEqual(calls.at(-1), ['add', 'ash', 'sys-c']);
  });
});
