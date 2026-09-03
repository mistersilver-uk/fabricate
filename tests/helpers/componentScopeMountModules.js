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

/**
 * The world-scope model closure every component-scope tree reads.
 *
 * The projection is the entry point; underneath it are the three scope descriptors, the shared
 * resolution machinery and the migration module holding the ONE lifted-identity field list.
 *
 * @type {readonly string[]}
 */
export const WORLD_COMPONENT_SCOPE_RAW_MODULES = Object.freeze([
  'src/ui/svelte/stores/worldScopeProjection.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/migration/worldScopeEntityGrouping.js',
  'src/utils/sourceReferenceUnion.js',
  'src/ui/svelte/util/foundryBridge.js',
  // The two pure leaves this lane added: the component presentation model and the entry's
  // validation check set, plus the category vocabulary the offered-set builder refuses through.
  'src/ui/svelte/apps/manager/scoped/componentScoped.js',
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
  // The frame's lifted view-state factory, and the shared answer to "what is this entity type
  // called" every scoped screen reads rather than testing `entityType` at a call site.
  'src/utils/managerBrowserViewState.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
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
