/** The dependency manifest the mounted WORLD COMPONENT suites compile against (issue 1371). */

import {
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from './svelte-component-harness.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from './foundryBridgeModules.js';

/** THE COMPONENT SCOPE LEAVES, which three separate manifests used to spell out longhand. */
export const COMPONENT_SCOPE_LEAF_MODULES = Object.freeze([
  'src/ui/svelte/apps/manager/scoped/componentScoped.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
  // per-entry references now, so its own static closure reaches the vocabulary core and the shipped
  // counter.
  'src/systems/worldVocabulary.js',
  'src/ui/model/vocabularyUsage.js',
  // `worldVocabulary.js`'s own two leaves: it asks each category vocabulary whether a name is
  // the general bucket, so both travel with it.
  'src/utils/componentCategories.js',
  // #1663: the ONE implementation behind both category shims; imports nothing.
  'src/utils/categoryNormalization.js',
  'src/utils/recipeCategories.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/utils/scalars.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/worldScopeEntityGrouping.js',
  'src/utils/sourceReferenceUnion.js',
]);

/**
 * The world-scope model closure every component-scope tree reads: the leaves above, the Foundry
 * bridge, and the two pieces only a world-scope screen needs — the entry's validation check set and
 * the category vocabulary its offered-set builder refuses through.
 */
export const WORLD_COMPONENT_SCOPE_RAW_MODULES = Object.freeze([
  ...COMPONENT_SCOPE_LEAF_MODULES,
  ...FOUNDRY_BRIDGE_RAW_MODULES,
  // The one tone map the converted status chips read (issue 1506).
  'src/ui/svelte/util/statusChipTone.js',
  'src/ui/model/componentScopeValidation.js',
  'src/utils/componentCategories.js',
]);

/** The shared scoped-list closure: the list model, its pagination and its bulk selection. */
export const SCOPED_LIST_RAW_MODULES = Object.freeze([
  'src/ui/model/scopedEntityListModel.js',
  'src/ui/model/browserPagination.js',
  'src/utils/bulkSelectionModel.js',
  // The frame's lifted view-state factory.
  'src/ui/model/managerBrowserViewState.js',
]);

/** The overlay closure `SearchablePopover` binds (issue 1500). */
export const SEARCHABLE_POPOVER_RAW_MODULES = Object.freeze([
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  'src/ui/svelte/util/listboxNavigation.js',
  'src/ui/svelte/util/overlayBounds.js',
  'src/ui/svelte/util/overlayHost.js',
]);

/** The design-system primitives every component-scope tree renders. */
export const SCOPED_SHARED_COMPILED_MODULES = Object.freeze([
  // Select's own compiled closure (issue 1504), spread rather than copied: `Pagination` draws its
  // page-size list through `Select` now, so every tree that renders a pager also renders `Field`,
  // `SearchablePopover`, the `ManagerButton` it renders its trigger through, and the `Chip`/
  // `EmptyState` pair the popover's list renders.
  ...SELECT_COMPILED_MODULES,
  // issue 1371 r18-colour: the tinted essence chip (M29) is rendered by the system inspector,
  // the rules list row and the world catalogue's rows; an omission here HANGS every suite that
  // mounts one of those trees (`# cancelled`) rather than failing it.
  'src/ui/svelte/apps/manager/components/EssenceChip.svelte',
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  // `Select`, `Field` and `SearchablePopover` are already in this list via the
  // `SELECT_COMPILED_MODULES` spread above — `Pagination` draws its page-size list through them.
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
]);

/**
 * One mounted harness over a world-scope COMPONENT screen, assembled from the tiers above.
 *
 * @param {string} args.componentPath the `.svelte` under test; also compiled automatically.
 * @param {readonly string[]} [args.rawExtras] raw modules only this tree reaches.
 * @param {readonly string[]} [args.compiledExtras] `.svelte` modules only this tree renders.
 * @returns {object} the shared harness handle.
 */
export function createComponentScopeHarness({
  repoRoot,
  tmpPrefix,
  componentPath,
  rawExtras = [],
  compiledExtras = [],
}) {
  return createMountedComponentHarness({
    repoRoot,
    tmpPrefix,
    componentPath,
    rawModules: [
      ...WORLD_COMPONENT_SCOPE_RAW_MODULES,
      ...SCOPED_LIST_RAW_MODULES,
      // Issue 1504: the shared compiled tier renders `Pagination`, which composes `Select` over
      // `SearchablePopover`, so this closure is in every component-scope tree whether or not a
      // test opens a panel.
      ...SEARCHABLE_POPOVER_RAW_MODULES,
      ...rawExtras,
    ],
    compiledModules: [...SCOPED_SHARED_COMPILED_MODULES, componentPath, ...compiledExtras],
  });
}

/**
 * THE WORLD COMPONENT CATALOGUE'S OWN TREE, declared once for the two suites that mount it. The
 * mounted contract suite and the real-browser pointer hit-test suite render the SAME screen and
 * therefore need the same twenty-odd module manifest.
 */
export function createWorldComponentCatalogueHarness({ repoRoot, tmpPrefix }) {
  const componentPath = 'src/ui/svelte/apps/manager/scoped/WorldComponentCataloguePage.svelte';
  const compiledExtras = [
    'src/ui/svelte/apps/manager/scoped/ComponentCatalogueBulkPanel.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    // The bulk panel's shared staging inset (issue 1371 r16-cat, maintainer rulings M24/M25) and
    // the `Stepper` its essence rows render.
    'src/ui/svelte/apps/manager/BulkStagingInset.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/components/Callout.svelte',
    'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
    'src/ui/svelte/components/ItemDropZone.svelte',
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
  ];
  return {
    harness: createComponentScopeHarness({
      repoRoot,
      tmpPrefix,
      componentPath,
      rawExtras: [
        // The drop zone's two leaves: the action it binds and the payload normalizer behind it.
        'src/ui/svelte/actions/dragDrop.js',
        'src/ui/svelte/util/dropUtils.js',
      ],
      compiledExtras,
    }),
    compiledModules: [...SCOPED_SHARED_COMPILED_MODULES, componentPath, ...compiledExtras],
  };
}

/**
 * The world-scope projection over {@link componentCorpus}, which every mounted assertion in both
 * world-component suites is driven from.
 *
 * @param {object} [overrides] passed straight to `componentCorpus`.
 * @returns {object} the projected scope.
 */
export function componentScopeFor(overrides) {
  return projectWorldScopeEntity({
    entityType: 'component',
    corpus: componentCorpus(overrides),
    systems: COMPONENT_SYSTEMS,
  });
}

/** Drain the microtask queue the sequential write loops await through. */
export async function drainMicrotasks() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

/** A world component corpus in the shape the scope store persists. */
export function componentCorpus(overrides = {}) {
  return {
    entities: [
      {
        id: 'ingot',
        name: 'Iron Ingot',
        description: 'A bar of worked iron.',
        img: 'icons/commodities/metal/ingot-worn-iron.webp',
        originItemUuid: 'Item.ingot-source',
        registeredItemUuid: 'Item.ingot-source',
        aliasItemUuids: ['Item.ingot-legacy'],
      },
      { id: 'orphan', name: 'Unbound Salt', description: 'No Item behind it.' },
      {
        id: 'resin',
        name: 'Wildwood Resin',
        description: 'Tapped from an ironwood.',
        originItemUuid: 'Item.resin-source',
      },
      {
        id: 'coal',
        name: 'Coal',
        description: 'Fuel.',
        originItemUuid: 'Item.coal-source',
      },
    ],
    defaults: [
      { id: 'ingot', category: 'Refined' },
      { id: 'coal', category: 'Raw', tags: ['fuel', 'bulk'] },
    ],
    membership: [
      { entityId: 'ingot', systemId: 'sys-forge', inherit: { category: true } },
      { entityId: 'ingot', systemId: 'sys-alchemy', inherit: { category: false } },
      {
        entityId: 'coal',
        systemId: 'sys-forge',
        inherit: { category: false },
        mutedTags: ['bulk'],
      },
      { entityId: 'orphan', systemId: 'sys-forge', inherit: { category: true } },
    ],
    ...overrides,
  };
}

/** The crafting-system roster, narrowed exactly as the projection narrows it. */
export const COMPONENT_SYSTEMS = Object.freeze([
  Object.freeze({ id: 'sys-forge', name: 'Forge' }),
  Object.freeze({ id: 'sys-alchemy', name: 'Alchemy' }),
]);

/**
 * A recording `actions` bag that captures the VERB NAME beside its arguments.
 *
 * @returns {{calls: Array<{verb: string, args: unknown[]}>, actions: Record<string, Function>}}
 */
export function recordingComponentActions() {
  const calls = [];
  const verbs = [
    'addToSystem',
    'removeFromSystem',
    'updateWorldDefaultSection',
    'setWorldTags',
    'setMutedTags',
    'setSectionInherited',
    'updateEntity',
    'deleteEntity',
    'createEntity',
    // The per-system RULES write the world bulk panel's essence group uses (issue 1371 r16-cat,
    // maintainer ruling M25): `bulkEditRules(systemId, componentIds, edit)`.
    'bulkEditRules',
  ];
  const actions = {};
  for (const verb of verbs) {
    actions[verb] = async (...args) => {
      calls.push({ verb, args });
      // A REAL MICROTASK BOUNDARY per call, so a caller that fired them concurrently interleaves
      // here and a caller that awaits each one does not.
      await Promise.resolve();
      return true;
    };
  }
  return { calls, actions };
}

/**
 * THE SYSTEM COMPONENT RULES LIST'S OWN TREE, declared once for the two suites that mount it (issue
 * 1371 r16-list).
 */
export function createComponentsBrowserViewHarness({ repoRoot, tmpPrefix }) {
  const componentPath = 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte';
  const compiledModules = [
    ...SCOPED_SHARED_COMPILED_MODULES,
    // The catalogue ATTRIBUTION BANNER and the shared inherit row (issue 1371), both composed by
    // the two system-scope component screens.
    'src/ui/svelte/apps/manager/scoped/SharedDefinitionCallout.svelte',
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
    'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
    // The cohort filter is the shared segmented track since issue 1371's parity round 4; the
    // `<select>` it replaced needed no entry, and an omission here HANGS this suite.
    'src/ui/svelte/components/SegmentedControl.svelte',
    // The manager's ONE multi-select row (issue 772; extracted to a shared primitive under
    // `apps/manager/` for issue 1010, so this path moved out of the browser's own directory).
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/apps/manager/components/ComponentRow.svelte',
    componentPath,
  ];
  return {
    harness: createMountedComponentHarness({
      repoRoot,
      tmpPrefix,
      // COMPOSED FROM THE SHARED TIERS (issue 1371, round 3), not spelled out again.
      rawModules: [
        ...COMPONENT_SCOPE_LEAF_MODULES,
        // Issue 1504: the pager's own list is a `Select` over `SearchablePopover` now, so this
        // closure rides with `SCOPED_SHARED_COMPILED_MODULES`.
        ...SEARCHABLE_POPOVER_RAW_MODULES,
        ...FOUNDRY_BRIDGE_RAW_MODULES,
        'src/ui/svelte/util/listReorderAnnouncement.js',
        'src/ui/svelte/actions/dragDrop.js',
        'src/utils/componentCategories.js',
        'src/ui/model/componentBrowserModel.js',
        // componentBrowserModel imports the shared category totals; omitting it HANGS the suite
        // (`# cancelled`) rather than failing it.
        'src/ui/model/browserGroupCounts.js',
        // ... and, since issue 1036, the shared page-window model too. Same consequence.
        'src/ui/model/browserPagination.js',
        // The pure bulk selection + staging model (issue 772). The view imports it for the
        // selection helpers and its toolbar reads the description it returns.
        'src/ui/model/componentBulkEditModel.js',
        // Its shared leaf (issue 1010): those selection helpers now live here and
        // `componentBulkEditModel.js` re-exports them, so it is a STATIC import of that module.
        'src/utils/bulkSelectionModel.js',
      ],
      compiledModules,
      componentPath,
    }),
    compiledModules,
  };
}
