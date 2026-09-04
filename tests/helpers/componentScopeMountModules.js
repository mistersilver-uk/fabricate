/**
 * The dependency manifest the mounted WORLD COMPONENT suites compile against (issue 1371).
 *
 * WHY THIS EXISTS. `createMountedComponentHarness` copies a declared set of raw `.js` modules and
 * compiles a declared set of `.svelte` modules into a temp tree. A component that reaches for
 * something absent from those lists does not FAIL the suite — it HANGS, and the run reports
 * `# cancelled` rather than `# fail`. Two component-scope suites mount trees rooted in the same
 * shared list-and-inspector closure, so without this file each of them would restate it: a
 * manifest a new dependency has to be added to in two places, where the suite that misses the
 * edit goes silently unrunnable.
 *
 * It is also what the SonarCloud duplication gate reads — `tests/**` is counted exactly like
 * `src/**` — so two near-identical manifests of thirty string literals are duplicated lines even
 * though every one of them is a legitimate dependency. Same reasoning and same shape as
 * `toolMountModules.js`.
 *
 * `tests/helpers/**` is outside the `npm test` glob, so this file adds no test count.
 *
 * COMPOSE, DO NOT PRUNE. Each suite spreads the tiers it needs and names its OWN extras inline.
 * A tier therefore holds only modules EVERY one of its consumers declares: the harness's closure
 * validator throws for a module the tree imports and the manifest omits, but says NOTHING about a
 * declared module the tree does not import — so an over-broad tier is invisible rather than
 * self-reporting.
 */

import { createMountedComponentHarness } from './svelte-component-harness.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

/**
 * THE COMPONENT SCOPE LEAVES, which three separate manifests used to spell out longhand.
 *
 * Both system-scope component screens read the world projection — the rules list for its ghost
 * cohort and its inherit summary, the rules editor for the category inherit switch and the
 * read-only world tag card — and so do both world-scope screens. Every one of these is in the
 * STATIC graph, so an omission does not fail one test: it HANGS the suite and is reported as
 * `# cancelled` rather than `# fail`.
 *
 * It is a tier of its own rather than part of the one below because a THIRD manifest reads it:
 * `componentEditViewModules.js`, whose tree needs the leaves and not the world-scope screens'
 * validation or category vocabulary. Three byte-identical copies of a ten-line list is exactly
 * the shape SonarCloud's copy-paste detector counts against the gate, and it counts `tests/**`
 * like `src/**`.
 *
 * @type {readonly string[]}
 */
export const COMPONENT_SCOPE_LEAF_MODULES = Object.freeze([
  'src/ui/svelte/apps/manager/scoped/componentScoped.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/migration/worldScopeEntityGrouping.js',
  'src/utils/sourceReferenceUnion.js',
]);

/**
 * The world-scope model closure every component-scope tree reads: the leaves above, the Foundry
 * bridge, and the two pieces only a world-scope screen needs — the entry's validation check set
 * and the category vocabulary its offered-set builder refuses through.
 *
 * @type {readonly string[]}
 */
export const WORLD_COMPONENT_SCOPE_RAW_MODULES = Object.freeze([
  ...COMPONENT_SCOPE_LEAF_MODULES,
  'src/ui/svelte/util/foundryBridge.js',
  'src/utils/componentScopeValidation.js',
  'src/utils/componentCategories.js',
]);

/**
 * The shared scoped-list closure: the list model, its pagination and its bulk selection.
 *
 * @type {readonly string[]}
 */
export const SCOPED_LIST_RAW_MODULES = Object.freeze([
  'src/utils/scopedEntityListModel.js',
  'src/utils/browserPagination.js',
  'src/utils/bulkSelectionModel.js',
  // The frame's lifted view-state factory. `scopedStudio.js` — the shared answer to "what is this
  // entity type called", which every scoped screen reads rather than testing `entityType` at a
  // call site — moved into `COMPONENT_SCOPE_LEAF_MODULES` above, because the two trees that read
  // it without this tier need it too.
  'src/utils/managerBrowserViewState.js',
]);

/**
 * The overlay closure `SearchablePopover` binds.
 *
 * Both pickers in the catalogue's bulk panel are that primitive, so its two actions and its two
 * positioning leaves are in the tree whether or not a test opens one.
 *
 * @type {readonly string[]}
 */
export const SEARCHABLE_POPOVER_RAW_MODULES = Object.freeze([
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  'src/ui/svelte/util/overlayHost.js',
]);

/**
 * The design-system primitives every component-scope tree renders.
 *
 * @type {readonly string[]}
 */
export const SCOPED_SHARED_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
]);

/**
 * One mounted harness over a world-scope COMPONENT screen, assembled from the tiers above.
 *
 * WHY A FACTORY AND NOT TWO DECLARATIONS. The catalogue suite and the entry suite each opened
 * with the same thirty-line arrangement — the same `createMountedComponentHarness` call spreading
 * the same three tiers, then the same `scopeFor` projection wrapper, then the same microtask
 * drain. SonarCloud's copy-paste detector matches by token SHAPE rather than by literal, so two
 * manifests listing DIFFERENT `.svelte` paths in the same arrangement are still duplicated lines
 * against the quality gate — and, gate aside, an arrangement restated per suite is one a new suite
 * copies again.
 *
 * WHAT STAYS PER SUITE is the only thing that differs: the component under test and the modules
 * ITS tree reaches that the tiers do not carry. Those are passed as extras and named inline, which
 * is the same "compose, do not prune" rule the tiers themselves follow — the harness validator
 * throws for a module the tree imports and the manifest omits, but says NOTHING about a declared
 * module the tree does not import, so an over-broad tier is invisible rather than self-reporting.
 *
 * @param {object} args
 * @param {string} args.repoRoot
 * @param {string} args.tmpPrefix
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
      ...rawExtras,
    ],
    compiledModules: [...SCOPED_SHARED_COMPILED_MODULES, componentPath, ...compiledExtras],
  });
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

/**
 * Drain the microtask queue the sequential write loops await through.
 *
 * Forty turns rather than a `tick()`: the catalogue's apply loop awaits one promise per write per
 * selected component, and a fake that resolved synchronously would let a `Promise.all`
 * implementation pass an ordering assertion.
 *
 * @returns {Promise<void>}
 */
export async function drainMicrotasks() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

/**
 * A world component corpus in the shape the scope store persists.
 *
 * FOUR RECORDS, and each earns its place in a state a criterion names: one LINKED and adopted by
 * two systems, one UNLINKED, one adopted by NO system, and one carrying world tags with a member
 * that mutes one. A fixture with fewer cannot state both halves of any of those pairs.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
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

/**
 * The crafting-system roster, narrowed exactly as the projection narrows it.
 *
 * @type {ReadonlyArray<{id: string, name: string}>}
 */
export const COMPONENT_SYSTEMS = Object.freeze([
  Object.freeze({ id: 'sys-forge', name: 'Forge' }),
  Object.freeze({ id: 'sys-alchemy', name: 'Alchemy' }),
]);

/**
 * A recording `actions` bag that captures the VERB NAME beside its arguments.
 *
 * THE NAME MATTERS AS MUCH AS THE ARGUMENTS. `Add to` and `Remove from` are one keystroke apart
 * and destructive in one direction, so a fake that recorded only the argument list would be
 * satisfied by a panel wired to the opposite verb.
 *
 * Every verb answers a resolved promise, because the write path is awaited SEQUENTIALLY and a
 * synchronous fake would let a `Promise.all` implementation pass an ordering assertion.
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
  ];
  const actions = {};
  for (const verb of verbs) {
    actions[verb] = async (...args) => {
      calls.push({ verb, args });
      // A REAL MICROTASK BOUNDARY per call, so a caller that fired them concurrently interleaves
      // here and a caller that awaits each one does not. Without it every implementation records
      // the same ordered list and the concurrency assertion is vacuous.
      await Promise.resolve();
      return true;
    };
  }
  return { calls, actions };
}
