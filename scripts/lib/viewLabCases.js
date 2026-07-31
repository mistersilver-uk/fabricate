/**
 * The canonical View Lab case registry.
 *
 * One entry per captured PNG. A case names a WINDOW and the state to drive it to — not a component
 * — because the evidence a UI PR needs is "here is the screen you changed", and a screen is an
 * application window with its rail, its chrome, and its neighbours in frame.
 *
 * `sourceMatches` is what turns a diff into a capture list. Patterns are directory-anchored rather
 * than file-anchored: a window case is affected by anything under the view it renders. That creates
 * a fan-out hazard — an edit to a shared component or to `styles/` would otherwise select all
 * fourteen cases — so those broad signals deliberately map to a small representative set instead.
 * See {@link mapChangedFilesToCases}.
 */

const PLAYER = 'fabricate-app';
const MANAGER = 'fabricate-crafting-system-manager';

/**
 * Files that can change what a window looks like. Mirrors the rule in `AGENTS.md`: a `lang/` change
 * needs evidence only when the same PR also touches a render file, which callers enforce by testing
 * `hasUiChanges` over the whole changed set.
 */
const UI_PATH_PATTERN = /^(src\/ui\/|styles\/)|\.(svelte|css)$/;
const LANG_PATH_PATTERN = /^lang\//;

/**
 * Signals too broad to attribute to one window. A shared primitive or a global stylesheet can
 * affect every screen, so selecting every case would make the evidence set useless noise. These map
 * to the representative set below plus the fallback.
 */
const BROAD_SIGNAL_PATTERN = /^(styles\/|src\/ui\/svelte\/components\/|src\/ui\/theme\.js$)/;

/** One player screen and one manager screen: enough to show a shared-primitive change in context. */
const REPRESENTATIVE_CASE_IDS = Object.freeze(['player-crafting', 'manager-components']);

export const FALLBACK_CASE_ID = 'player-crafting';

export const VIEW_LAB_CASES = Object.freeze([
  {
    id: 'player-crafting',
    label: 'Player app — Crafting',
    app: PLAYER,
    query: { tab: 'crafting' },
    steps: [],
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'crafting'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\//,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/,
    ],
  },
  {
    id: 'player-gathering',
    label: 'Player app — Gathering',
    app: PLAYER,
    query: { tab: 'gathering' },
    steps: [],
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-alchemy',
    label: 'Player app — Alchemy',
    app: PLAYER,
    query: { tab: 'alchemy' },
    steps: [],
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'alchemy'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/alchemy\//,
      /^src\/ui\/svelte\/util\/alchemyTabAvailability\.js$/,
    ],
  },
  {
    id: 'player-journal',
    label: 'Player app — Journal',
    app: PLAYER,
    query: { tab: 'journal' },
    steps: [],
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'journal'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/journal\//, /^src\/ui\/svelte\/stores\/journalStore/],
  },
  {
    id: 'player-inventory',
    label: 'Player app — Inventory',
    app: PLAYER,
    query: { tab: 'inventory' },
    steps: [],
    readySelector: '.fabricate-app-shell',
    publish: true,
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventoryStore/,
    ],
  },
  {
    id: 'manager-systems',
    label: 'Manager — System library',
    app: MANAGER,
    query: {},
    steps: [],
    expectView: 'systems',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
    ],
  },
  {
    id: 'manager-system-overview',
    label: 'Manager — System overview',
    app: MANAGER,
    query: {},
    steps: ['System Overview'],
    expectView: 'system-edit',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  {
    id: 'manager-components',
    label: 'Manager — Components',
    app: MANAGER,
    query: {},
    steps: ['Components'],
    expectView: 'components',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'components'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/Component/],
  },
  {
    id: 'manager-recipes',
    label: 'Manager — Crafting / Recipes',
    app: MANAGER,
    query: {},
    steps: ['Crafting'],
    expectView: 'recipes',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Recipe/,
      /^src\/ui\/svelte\/apps\/manager\/Crafting/,
    ],
  },
  {
    id: 'manager-books-scrolls',
    label: 'Manager — Books & Scrolls',
    app: MANAGER,
    // The Crafting rail entry expands into its sections; the sub-tab is a second click. Books &
    // Scrolls exists only for a knowledge/item-gated system, so the case seeds which system the
    // manager opens on rather than trying to click its way to a rail entry that is not rendered.
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-books-scrolls' }],
    expectView: 'books-scrolls',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'recipes'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RecipeItem/,
    ],
  },
  {
    id: 'manager-knowledge',
    label: 'Manager — Knowledge',
    app: MANAGER,
    query: { system: 'lab-herbalism' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-knowledge' }],
    expectView: 'knowledge',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'knowledge'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/],
  },
  {
    id: 'manager-crafting-settings',
    label: 'Manager — Crafting settings',
    app: MANAGER,
    query: {},
    steps: ['Crafting', { selector: '#manager-crafting-nav-settings' }],
    expectView: 'crafting-settings',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'settings'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSettingsView\.svelte$/],
  },
  {
    id: 'manager-access',
    label: 'Manager — Access',
    app: MANAGER,
    // Access exists only for a restricted-visibility system.
    query: { system: 'lab-alchemy' },
    steps: ['Crafting', { selector: '#manager-crafting-nav-access' }],
    expectView: 'access',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'access'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/AccessTabView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/GrantAccessInspector\.svelte$/,
    ],
  },
  {
    id: 'manager-essences',
    label: 'Manager — Essences',
    app: MANAGER,
    query: {},
    steps: ['Essences'],
    expectView: 'essences',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'essences'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/Essence/],
  },
  {
    id: 'manager-tags',
    label: 'Manager — Tags & categories',
    app: MANAGER,
    query: {},
    steps: ['Tags & Categories'],
    expectView: 'tags',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tags'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/TagsCategories/],
  },
  {
    id: 'manager-tools',
    label: 'Manager — Tools',
    app: MANAGER,
    query: {},
    steps: ['Tools'],
    expectView: 'tools',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'tools'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/Tool/],
  },
  {
    id: 'manager-checks',
    label: 'Manager — Checks',
    app: MANAGER,
    query: {},
    steps: ['Checks'],
    expectView: 'checks',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'checks'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/manager\/.*Check/],
  },
  {
    id: 'manager-gathering',
    label: 'Manager — Gathering',
    app: MANAGER,
    query: {},
    steps: ['Gathering'],
    expectView: 'environments',
    readySelector: '.fabricate-manager',
    publish: true,
    kinds: ['manager', 'gathering'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/manager\/Environment/,
      /^src\/ui\/svelte\/apps\/manager\/Gathering/,
    ],
  },
]);

/**
 * Normalize a changed-file path to repository-relative POSIX form.
 *
 * @param {string} filePath Path from a diff.
 * @returns {string} Normalized path.
 */
export function normalizePath(filePath) {
  return String(filePath ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

/**
 * Whether one path can change what a window looks like.
 *
 * @param {string} filePath Repository-relative path.
 * @returns {boolean} True for render-affecting paths.
 */
export function isUiFile(filePath) {
  return UI_PATH_PATTERN.test(normalizePath(filePath));
}

/**
 * Whether a changed set requires screenshot evidence at all. A `lang/`-only change does not — but a
 * `lang/` change alongside a render file does, which is why this tests the whole set.
 *
 * @param {string[]} files Changed paths.
 * @returns {boolean} True when evidence is required.
 */
export function hasUiChanges(files = []) {
  const normalized = files.map((file) => normalizePath(file));
  if (normalized.some((file) => isUiFile(file))) return true;
  return false;
}

export const caseIds = Object.freeze(VIEW_LAB_CASES.map((viewCase) => viewCase.id));

/**
 * @param {string} id Case id.
 * @returns {object|null} The case, or null.
 */
export function getCaseById(id) {
  return VIEW_LAB_CASES.find((viewCase) => viewCase.id === id) ?? null;
}

/**
 * Resolve a case's human-facing label. Wired into the S3 publish path so the PR body's alt text
 * comes from this registry rather than from the legacy `VIEW_RECIPES` table.
 *
 * @param {string} id Case id.
 * @returns {string|null} Label, or null when the id is unknown.
 */
export function labelForCaseId(id) {
  return getCaseById(id)?.label ?? null;
}

export function fallbackCase() {
  return getCaseById(FALLBACK_CASE_ID);
}

/**
 * Map a changed-file set onto the cases that should be captured.
 *
 * @param {string[]} files Changed paths.
 * @returns {object[]} Cases to capture, in registry order.
 */
export function mapChangedFilesToCases(files = []) {
  const normalized = files.map((file) => normalizePath(file)).filter(Boolean);
  const renderFiles = normalized.filter((file) => isUiFile(file));
  if (renderFiles.length === 0) {
    // A lang-only change still needs a frame when it ships alongside render files; on its own it
    // needs none, and the caller decides. Returning the fallback keeps `--changed-files` honest for
    // the mixed case without inventing evidence for the lang-only one.
    return normalized.some((file) => LANG_PATH_PATTERN.test(file)) ? [] : [];
  }

  const selected = new Set();
  let sawBroadSignal = false;
  for (const file of renderFiles) {
    if (BROAD_SIGNAL_PATTERN.test(file)) {
      sawBroadSignal = true;
      continue;
    }
    for (const viewCase of VIEW_LAB_CASES) {
      if (viewCase.sourceMatches.some((pattern) => pattern.test(file))) selected.add(viewCase.id);
    }
  }

  if (sawBroadSignal) for (const id of REPRESENTATIVE_CASE_IDS) selected.add(id);
  if (selected.size === 0) selected.add(FALLBACK_CASE_ID);

  return VIEW_LAB_CASES.filter((viewCase) => selected.has(viewCase.id) && viewCase.publish);
}

/**
 * Every case that publishes, for a full capture run.
 *
 * @returns {object[]} Publishable cases.
 */
export function publishableCases() {
  return VIEW_LAB_CASES.filter((viewCase) => viewCase.publish);
}
