/**
 * The canonical View Lab case registry: one entry per captured PNG, naming a window and the state
 * to drive it to rather than a component. The cases live one file per surface under
 * `view-lab-cases/`; this module holds their manifest, the selection and the diff attribution.
 *
 * `sourceMatches` turns a diff into a capture list, directory-anchored rather than file-anchored.
 * Signals too broad to attribute to one window map to a small representative set instead of the
 * whole corpus, and a change to one of the lab's own inputs selects one frame per surface
 * ({@link LAB_SURFACE_CASES}). See {@link mapChangedFilesToCases} and {@link labSurfaceKey}.
 *
 * The attribution walk carries a `{keys, unattributable}` pair at every level and merges both
 * halves of its children's pairs, so no level can return a value meaning "forget what you found".
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BROAD_SIGNAL_CASE_OVERRIDES,
  BROAD_SIGNAL_PATTERN,
  REPRESENTATIVE_CASE_IDS,
} from './view-lab-cases/broadSignals.js';
import { CASES as canvasInteractablesCases } from './view-lab-cases/canvasInteractables.js';
import { CANVAS_APPS, DEFAULT_POSITION, MANAGER, PLAYER } from './view-lab-cases/caseConstants.js';
import { CASES as coverageMatrixCases } from './view-lab-cases/coverageMatrix.js';
import { CASES as managerChecksCases } from './view-lab-cases/managerChecks.js';
import { CASES as managerComponentsCases } from './view-lab-cases/managerComponents.js';
import { CASES as managerEssencesCases } from './view-lab-cases/managerEssences.js';
import { CASES as managerGatheringCases } from './view-lab-cases/managerGathering.js';
import { CASES as managerKnowledgeCases } from './view-lab-cases/managerKnowledge.js';
import { CASES as managerRecipeEditorCases } from './view-lab-cases/managerRecipeEditor.js';
import { CASES as managerRecipesCases } from './view-lab-cases/managerRecipes.js';
import { CASES as managerSystemsCases } from './view-lab-cases/managerSystems.js';
import { CASES as managerSystemToolsCases } from './view-lab-cases/managerSystemTools.js';
import { CASES as managerWorldPartiesAndDowntimeCases } from './view-lab-cases/managerWorldPartiesAndDowntime.js';
import { CASES as managerWorldTravelCases } from './view-lab-cases/managerWorldTravel.js';
import { CASES as playerGatheringAndCraftingCases } from './view-lab-cases/playerGatheringAndCrafting.js';
import { CASES as playerInventoryCases } from './view-lab-cases/playerInventory.js';
import { CASES as playerJournalCases } from './view-lab-cases/playerJournal.js';
import { CASES as worldCataloguesCases } from './view-lab-cases/worldCatalogues.js';
import { CASES as worldToolCatalogueCases } from './view-lab-cases/worldToolCatalogue.js';
import { CASES as worldToolEntryCases } from './view-lab-cases/worldToolEntry.js';
import { CASES as worldToolPreviewsCases } from './view-lab-cases/worldToolPreviews.js';

export {
  ACCESS_ROSTER_SEARCH_MISS_TERM,
  WORLD_PARTIES_SEARCH_TERM,
  WORLD_TOOL_SEARCH_MISS_TERM,
  WORLD_TOOL_SEARCH_TERM,
} from './view-lab-cases/caseConstants.js';

/** Files that can change what a window looks like. */
const UI_PATH_PATTERN = /^(src\/ui\/|styles\/)|\.(svelte|css)$/;

/**
 * The harness's own inputs: the fixture world every frame renders from, the page that mounts it,
 * the Foundry shim it renders against, its capture and layout-assertion helpers, this index and
 * the case files it reads.
 */
const LAB_INFRASTRUCTURE_PATTERN =
  /^(tests\/view-lab\/|scripts\/lib\/view-lab-cases\/|scripts\/lib\/viewLab(?:Cases|LayoutAssertion)\.js$|scripts\/lib\/foundryChromeSpec\.js$|scripts\/view-lab-screenshots\.mjs$)/;

/** The helper that enforces the opt-in responsive layout contract. */
const LAYOUT_ASSERTION_PATH = 'scripts/lib/viewLabLayoutAssertion.js';

/** The lab's actor fixture, as a diff names it. Attributed by fixture table — see below. */
const LAB_ACTORS_PATH = 'tests/view-lab/world/labActors.js';

/** The page that mounts every frame, as a diff names it. Attributed by marked region — see below. */
const LAB_MOUNT_PATH = 'tests/view-lab/mount.js';

/** The lab's interactables fixture, as a diff names it. Attributed whole-file — see below. */
const LAB_INTERACTABLES_PATH = 'tests/view-lab/world/labInteractables.js';

export const FALLBACK_CASE_ID = 'fabricate-app-shell';

/** The Foundry application theme every case renders under unless it says otherwise. */
const DEFAULT_COLOR_SCHEME = 'dark';

/** Where the case data files live, as a diff names them. */
const CASE_FILE_DIRECTORY = 'scripts/lib/view-lab-cases/';

/** One manifest entry: the path a diff names a case file by, and the cases it declares. */
const caseFile = (name, cases) =>
  Object.freeze({ path: `${CASE_FILE_DIRECTORY}${name}.js`, cases });

/**
 * Every case file, in registry order. It is read twice — flattened into {@link VIEW_LAB_CASES}, and
 * keyed by path for diff attribution — so an imported-but-unattributed file cannot exist.
 */
export const VIEW_LAB_CASE_FILES = Object.freeze([
  caseFile('managerSystems', managerSystemsCases),
  caseFile('worldCatalogues', worldCataloguesCases),
  caseFile('worldToolCatalogue', worldToolCatalogueCases),
  caseFile('worldToolEntry', worldToolEntryCases),
  caseFile('worldToolPreviews', worldToolPreviewsCases),
  caseFile('managerRecipes', managerRecipesCases),
  caseFile('managerRecipeEditor', managerRecipeEditorCases),
  caseFile('managerComponents', managerComponentsCases),
  caseFile('managerChecks', managerChecksCases),
  caseFile('managerEssences', managerEssencesCases),
  caseFile('managerGathering', managerGatheringCases),
  caseFile('managerWorldPartiesAndDowntime', managerWorldPartiesAndDowntimeCases),
  caseFile('managerWorldTravel', managerWorldTravelCases),
  caseFile('managerSystemTools', managerSystemToolsCases),
  caseFile('managerKnowledge', managerKnowledgeCases),
  caseFile('playerInventory', playerInventoryCases),
  caseFile('playerGatheringAndCrafting', playerGatheringAndCraftingCases),
  caseFile('playerJournal', playerJournalCases),
  caseFile('coverageMatrix', coverageMatrixCases),
  caseFile('canvasInteractables', canvasInteractablesCases),
]);

export const VIEW_LAB_CASES = Object.freeze(VIEW_LAB_CASE_FILES.flatMap(({ cases }) => cases));

/** Normalize a changed-file path to repository-relative POSIX form. */
export function normalizePath(filePath) {
  return String(filePath ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

/** Whether one path can change what a window looks like. */
export function isUiFile(filePath) {
  return UI_PATH_PATTERN.test(normalizePath(filePath));
}

/**
 * Whether a changed set requires screenshot evidence at all. A `lang/`-only change does not — but a
 * `lang/` change alongside a render file does, which is why this tests the whole set.
 */
export function hasUiChanges(files = []) {
  const normalized = files.map((file) => normalizePath(file));
  if (normalized.some((file) => isUiFile(file) || file === LAYOUT_ASSERTION_PATH)) {
    return true;
  }
  return false;
}

/**
 * Split a render's console errors into the ones a case declared it would produce and the ones it
 * did not.
 */
export function partitionConsoleErrors(messages = [], allowed = []) {
  const patterns = [...allowed].map((pattern) => ({
    label: String(pattern),
    matcher: pattern.global
      ? new RegExp(pattern.source, pattern.flags.replaceAll('g', ''))
      : pattern,
  }));
  const matchedPatterns = new Set();
  const unmatched = [];
  for (const message of messages) {
    const text = String(message);
    const index = patterns.findIndex(({ matcher }) => matcher.test(text));
    if (index === -1) unmatched.push(text);
    else matchedPatterns.add(index);
  }
  return {
    unmatched,
    unusedAllowances: patterns
      .filter((_, index) => !matchedPatterns.has(index))
      .map(({ label }) => label),
  };
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
 */
export function labelForCaseId(id) {
  return getCaseById(id)?.label ?? null;
}

/**
 * The sentence a published frame carries beneath it, or the empty string for a frame that needs
 * none.
 */
export function evidenceNoteForCaseId(id) {
  const query = getCaseById(id)?.query ?? {};
  const standIn = query.downtimeProvider === '1' || query.playerProvider === '1';
  return standIn ? STAND_IN_COMPANION_NOTE : '';
}

/** What that note says, verbatim. */
export const STAND_IN_COMPANION_NOTE =
  'The companion tabs in this frame come from a stand-in registered by `tests/view-lab/mount.js` so that Core can photograph its own companion seam. They are not a shipped Fabricate surface and appear in neither the free module nor Fabricate Premium.';

export function fallbackCase() {
  return getCaseById(FALLBACK_CASE_ID);
}

// Surface coverage — what a change the registry cannot attribute captures.

/**
 * The surface a case photographs — the screen you can navigate to, as distinct from the state you
 * can drive that screen into.
 */
export function labSurfaceKey(viewCase) {
  const surface = canvasSurfaceOf(viewCase);
  const theme = viewCase.query?.colorScheme ?? DEFAULT_COLOR_SCHEME;
  return `${viewCase.app}|${surface || viewCase.id}|${theme}`;
}

/** The route-or-tab half of the surface key, per window family. */
function canvasSurfaceOf(viewCase) {
  if (viewCase.app === MANAGER) return viewCase.expectView;
  if (rendersInCanvasWindow(viewCase)) return SINGLE_SCREEN_SURFACE;
  return viewCase.query?.tab;
}

/** The surface term for a window that has exactly one screen. */
const SINGLE_SCREEN_SURFACE = 'window';

/**
 * Which of two cases is the better photograph of its surface, rather than of a state that surface
 * can be driven into. Lower sorts first.
 */
function compareSurfaceRepresentative(a, b) {
  const offDefault = (viewCase) => {
    const position = DEFAULT_POSITION[viewCase.app];
    return position &&
      viewCase.position?.width === position.width &&
      viewCase.position?.height === position.height
      ? 0
      : 1;
  };
  const dialogOpen = (viewCase) => (viewCase.query?.dialog ? 1 : 0);
  return (
    offDefault(a) - offDefault(b) ||
    dialogOpen(a) - dialogOpen(b) ||
    (a.steps?.length ?? 0) - (b.steps?.length ?? 0)
  );
}

/** One publishable case per surface, in registry order. */
function chooseSurfaceRepresentatives() {
  const order = new Map(VIEW_LAB_CASES.map((viewCase, index) => [viewCase.id, index]));
  const bySurface = new Map();
  for (const viewCase of publishableCases()) {
    const key = labSurfaceKey(viewCase);
    const held = bySurface.get(key);
    if (!held || compareSurfaceRepresentative(viewCase, held) < 0) bySurface.set(key, viewCase);
  }
  return [...bySurface.values()].sort((a, b) => order.get(a.id) - order.get(b.id));
}

/**
 * One frame of every surface the lab renders: the capture a change whose reach cannot be attributed
 * selects.
 */
export const LAB_SURFACE_CASES = Object.freeze(chooseSurfaceRepresentatives());

/** @type {readonly string[]} */
export const LAB_SURFACE_CASE_IDS = Object.freeze(LAB_SURFACE_CASES.map((viewCase) => viewCase.id));

/** The cases a set of render files selects, by the `sourceMatches` patterns each case declares. */
function selectRenderFileCases(renderFiles) {
  const selected = new Set();
  let sawBroadSignal = false;
  for (const file of renderFiles) {
    if (BROAD_SIGNAL_PATTERN.test(file)) {
      sawBroadSignal = true;
      for (const id of BROAD_SIGNAL_CASE_OVERRIDES[file] ?? []) selected.add(id);
      continue;
    }
    for (const viewCase of VIEW_LAB_CASES) {
      if (viewCase.sourceMatches.some((pattern) => pattern.test(file))) selected.add(viewCase.id);
    }
  }

  if (sawBroadSignal) for (const id of REPRESENTATIVE_CASE_IDS) selected.add(id);
  return selected;
}

// Diff-aware selection, for the lab inputs whose diff can be attributed.

/** `  managerCase({` / `  playerCase({` — an element of the array, at Prettier's two-space indent. */
const CASE_OPEN_PATTERN = /^ {2}[A-Za-z]\w*\(\{$/;
/** The line that closes such an element. */
const CASE_CLOSE_LINE = '  }),';
/** A case's own id line, four spaces in. */
const CASE_ID_PATTERN = /^ {4}id: '([^']+)',$/;
const ARRAY_OPEN_PREFIX = 'export const CASES = Object.freeze([';
const ARRAY_CLOSE_LINE = ']);';
/** `@@ -old,count +new,count @@`, matched for its shape alone. */
const HUNK_HEADER_PATTERN = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;
/** A line that cannot change a rendered frame: blank, a `//` comment, or inside a block comment. */
const INERT_LINE_PATTERN = /^\s*(\/\/|\/?\*)/;

/** Memoize a zero-argument function, including a null result. */
function memoized(compute) {
  let cell = null;
  return () => {
    cell ??= { value: compute() };
    return cell.value;
  };
}

/** One file's source, by line. */
function readSourceLines(fileUrl) {
  try {
    return readFileSync(fileURLToPath(fileUrl), 'utf8').split('\n');
  } catch {
    return [];
  }
}

const labActorSourceLines = memoized(() =>
  readSourceLines(new URL(`../../${LAB_ACTORS_PATH}`, import.meta.url))
);
const mountSourceLines = memoized(() =>
  readSourceLines(new URL(`../../${LAB_MOUNT_PATH}`, import.meta.url))
);

/** One case file's `CASES` array body, with the file line number its first line has. */
function caseArrayBody(sourceLines) {
  const start = sourceLines.findIndex((line) => line.startsWith(ARRAY_OPEN_PREFIX));
  if (start === -1) return null;
  const end = sourceLines.indexOf(ARRAY_CLOSE_LINE, start);
  if (end === -1) return null;
  return { firstLineNumber: start + 2, lines: sourceLines.slice(start + 1, end) };
}

/** The 1-based, inclusive line span of every case literal in the array, keyed by case id. */
function parseCaseLineRegions(sourceLines) {
  const body = caseArrayBody(sourceLines);
  if (!body) return null;

  const regions = [];
  let open = null;
  for (const [offset, line] of body.lines.entries()) {
    const lineNumber = body.firstLineNumber + offset;
    if (open === null) {
      if (CASE_OPEN_PATTERN.test(line)) open = { key: null, start: lineNumber };
      continue;
    }
    open.key ??= line.match(CASE_ID_PATTERN)?.[1] ?? null;
    if (line !== CASE_CLOSE_LINE) continue;
    regions.push({ key: open.key, start: open.start, end: lineNumber });
    open = null;
  }

  if (open || regions.length === 0) return null;
  if (regions.some((region) => !caseIds.includes(region.key))) return null;
  return regions;
}

/**
 * One attribution entry per case file: its own source, parsed into its own case regions, so a
 * patch is answered against the file it actually names.
 */
const CASE_FILE_INPUTS = Object.freeze(
  VIEW_LAB_CASE_FILES.map(({ path }) => {
    const sourceLines = memoized(() => readSourceLines(new URL(`../../${path}`, import.meta.url)));
    return Object.freeze({
      path,
      sourceLines,
      regions: memoized(() => parseCaseLineRegions(sourceLines())),
      attributesByCase: true,
    });
  })
);

/**
 * @param {object} viewCase A case.
 * @returns {boolean} True when it can render a component stack an actor holds.
 */
function rendersOwnedComponents(viewCase) {
  return viewCase.app === PLAYER;
}

/**
 * @param {object} viewCase A case.
 * @returns {boolean} True when it photographs the player window rather than the Manager.
 */
function rendersInPlayerWindow(viewCase) {
  return viewCase.app === PLAYER;
}

/**
 * @param {object} viewCase A case.
 * @returns {boolean} True when it photographs one of the three GM canvas windows (issue 1520).
 */
function rendersInCanvasWindow(viewCase) {
  return CANVAS_APPS.includes(viewCase.app);
}

/** The render files that read an actor's owned recipe-item copies or learned recipes. */
export const ACTOR_KNOWLEDGE_RENDER_FILES = Object.freeze([
  'src/ui/svelte/apps/manager/KnowledgeView.svelte',
  'src/ui/svelte/apps/manager/BooksScrollsView.svelte',
  'src/ui/svelte/apps/manager/ItemPageInspector.svelte',
  'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte',
]);

/**
 * @param {object} viewCase A case.
 * @returns {boolean} True when it can render an owned book, scroll or learned recipe.
 */
function rendersOwnedKnowledge(viewCase) {
  if (viewCase.app === PLAYER) return true;
  return viewCase.sourceMatches.some((pattern) =>
    ACTOR_KNOWLEDGE_RENDER_FILES.some((file) => pattern.test(file))
  );
}

/**
 * The four per-actor fixture tables in `labActors.js`, each with the predicate deciding which
 * frames can render what it feeds.
 */
const LAB_ACTOR_FIXTURE_TABLES = Object.freeze({
  INVENTORIES: rendersOwnedComponents,
  BROKEN_STACKS: rendersOwnedComponents,
  RECIPE_ITEM_COPIES: rendersOwnedKnowledge,
  LEARNED_RECIPES: rendersOwnedKnowledge,
});

/**
 * The line OPENING a top-level fixture table. A legitimate opener ends in `{` — `const NAME = {` or
 * `const NAME = Object.freeze({` — because the table's entries are on the lines that follow it.
 */
const TABLE_OPEN_PATTERN = /\{$/;

/** The line closing a top-level fixture table: `};`, or `});` for an `Object.freeze` wrapper. */
const TABLE_CLOSE_PATTERN = /^\}\)?;$/;

/** The 1-based, inclusive span of each fixture table in `labActors.js`. */
export function parseLabActorTableRegions(sourceLines) {
  const regions = [];
  for (const key of Object.keys(LAB_ACTOR_FIXTURE_TABLES)) {
    const start = sourceLines.findIndex((line) => line.startsWith(`const ${key} = `));
    if (start === -1) return null;
    if (!TABLE_OPEN_PATTERN.test(sourceLines[start])) return null;
    const end = sourceLines.findIndex(
      (line, index) => index > start && TABLE_CLOSE_PATTERN.test(line)
    );
    if (end === -1) return null;
    regions.push({ key, start: start + 1, end: end + 1 });
  }

  // Sorted rather than assumed to be in file order: the loop above walks `LAB_ACTOR_FIXTURE_TABLES`
  // in key order, which states which frames read each table and says nothing about where the
  // fixture happens to declare them.
  const ordered = [...regions].sort((left, right) => left.start - right.start);
  if (ordered.some((region, index) => index > 0 && region.start <= ordered[index - 1].end)) {
    return null;
  }
  return regions;
}

const labActorLineRegions = memoized(() => parseLabActorTableRegions(labActorSourceLines()));

/**
 * The regions of `tests/view-lab/mount.js` whose readership is narrower than the whole corpus, each
 * with the predicate deciding which frames read what that region produces.
 */
const MOUNT_REGIONS = Object.freeze({
  'player-extension-params': rendersInPlayerWindow,
  'lab-player-provider': rendersInPlayerWindow,
  'player-settle-stores': rendersInPlayerWindow,
  'mount-player-app': rendersInPlayerWindow,
  'canvas-mount-params': rendersInCanvasWindow,
  'mount-canvas-app': rendersInCanvasWindow,
});

/** The line opening a marked region: `// view-lab-region:<key>`, at any indent. */
const MOUNT_REGION_OPEN_PREFIX = '// view-lab-region:';

/** The line closing one: `// view-lab-region:end`. */
const MOUNT_REGION_CLOSE = `${MOUNT_REGION_OPEN_PREFIX}end`;

/** The 1-based, inclusive span of each marked region in `tests/view-lab/mount.js`. */
export function parseMountRegions(sourceLines) {
  const regions = [];
  let open = null;
  for (const [offset, line] of sourceLines.entries()) {
    const text = line.trim();
    if (!text.startsWith(MOUNT_REGION_OPEN_PREFIX)) continue;
    if (text === MOUNT_REGION_CLOSE) {
      if (!open) return null;
      regions.push({ ...open, end: offset + 1 });
      open = null;
      continue;
    }
    // A nested opener, or a key nothing in the table knows how to answer for.
    if (open) return null;
    const key = text.slice(MOUNT_REGION_OPEN_PREFIX.length);
    if (!Object.hasOwn(MOUNT_REGIONS, key)) return null;
    open = { key, start: offset + 1 };
  }

  if (open) return null;
  const keys = regions.map((region) => region.key);
  if (keys.length !== new Set(keys).size) return null;
  if (Object.keys(MOUNT_REGIONS).some((key) => !keys.includes(key))) return null;
  return regions;
}

const mountLineRegions = memoized(() => parseMountRegions(mountSourceLines()));

/**
 * @param {string} text A source line.
 * @returns {boolean} True when changing it cannot change a rendered frame.
 */
function isInertSourceLine(text) {
  return text.trim() === '' || INERT_LINE_PATTERN.test(text);
}

/**
 * @param {string} patch A unified diff.
 * @returns {string[]} Its lines, without the trailing blank a final newline produces.
 */
function patchLines(patch) {
  const lines = patch.split('\n');
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** Split a unified diff into hunks, each reduced to its body. */
function parseHunks(patch) {
  const hunks = [];
  let body = null;
  for (const raw of patchLines(patch)) {
    if (raw.startsWith('@@')) {
      if (!HUNK_HEADER_PATTERN.test(raw)) return null;
      body = [];
      hunks.push(body);
      continue;
    }
    // Anything before the first hunk header is either a `diff --git` / `index` / `---` / `+++`
    // preamble or not a diff at all.
    if (!body) return null;
    if (raw.startsWith('\\')) continue; // `\ No newline at end of file`
    // A blank context line is emitted as a bare space, but tools that strip trailing whitespace
    // turn it into an empty string; both mean "an unchanged empty line".
    const marker = raw === '' ? ' ' : raw[0];
    if (marker !== ' ' && marker !== '+' && marker !== '-') return null;
    body.push({ marker, text: raw.slice(1) });
  }
  return hunks.length > 0 ? hunks : null;
}

/** Every 0-based offset at which a sequence of lines occurs, in file order. */
function anchorOffsets(sourceLines, sequence) {
  const offsets = [];
  for (let offset = 0; offset + sequence.length <= sourceLines.length; offset += 1) {
    if (sequence.every((text, index) => sourceLines[offset + index] === text)) offsets.push(offset);
  }
  return offsets;
}

/** The regions one hunk touches, read from one candidate anchor. */
function regionsTouchedAt(hunk, offset, regions) {
  const keys = new Set();
  let unattributable = false;
  let cursor = offset + 1;
  for (const { marker, text } of hunk) {
    if (marker !== ' ' && !isInertSourceLine(text)) {
      const region = regions.find((entry) => cursor >= entry.start && cursor <= entry.end);
      if (region) keys.add(region.key);
      else unattributable = true;
    }
    if (marker !== '-') cursor += 1;
  }
  return { keys, unattributable };
}

/** The regions one hunk touches, located by content. */
function regionsTouchedByHunk(hunk, sourceLines, regions) {
  const sequence = hunk.filter(({ marker }) => marker !== '-').map(({ text }) => text);
  if (sequence.length === 0) return { keys: new Set(), unattributable: true };

  const keys = new Set();
  let unattributable = false;
  let anchored = false;
  for (const offset of anchorOffsets(sourceLines, sequence)) {
    anchored = true;
    const touched = regionsTouchedAt(hunk, offset, regions);
    // A candidate that lands outside every region — a shared factory, a section banner, the
    // selection machinery itself — can move any frame, and the true edit may be that candidate, so
    // it has to widen.
    unattributable ||= touched.unattributable;
    for (const key of touched.keys) keys.add(key);
  }
  // No candidate at all: the patch describes content this checkout does not have.
  return { keys, unattributable: unattributable || !anchored };
}

/** The regions of one file a patch is confined to. */
function touchedRegionKeys(patch, readSource, readRegions) {
  const nothingLocated = { keys: new Set(), unattributable: true };
  if (typeof patch !== 'string' || patch.trim() === '') return nothingLocated;

  const hunks = parseHunks(patch);
  if (!hunks) return nothingLocated;
  const regions = readRegions();
  if (!regions) return nothingLocated;

  const sourceLines = readSource();
  const keys = new Set();
  let unattributable = false;
  for (const hunk of hunks) {
    const touched = regionsTouchedByHunk(hunk, sourceLines, regions);
    unattributable ||= touched.unattributable;
    for (const key of touched.keys) keys.add(key);
  }
  return { keys, unattributable };
}

/**
 * Widen a located selection by surface coverage when part of the change could not be attributed.
 */
function widenedByCoverage(ids, unattributable) {
  if (!unattributable) return ids;
  for (const id of LAB_SURFACE_CASE_IDS) ids.add(id);
  return ids;
}

/**
 * Lab inputs whose blast radius is narrower than surface coverage, with the predicate — over a
 * case's own declared fields — that decides which frames can render them.
 */
const ATTRIBUTED_LAB_INPUTS = Object.freeze([
  ...CASE_FILE_INPUTS,
  Object.freeze({
    path: LAYOUT_ASSERTION_PATH,
    selects: (viewCase) => Boolean(viewCase.expectLayout),
  }),
  Object.freeze({
    path: 'tests/view-lab/world/labRunStates.js',
    selects: (viewCase) => viewCase.app === PLAYER,
  }),
  Object.freeze({
    path: LAB_ACTORS_PATH,
    sourceLines: labActorSourceLines,
    regions: labActorLineRegions,
    selectsRegion: (table) => LAB_ACTOR_FIXTURE_TABLES[table],
  }),
  Object.freeze({
    path: LAB_MOUNT_PATH,
    sourceLines: mountSourceLines,
    regions: mountLineRegions,
    selectsRegion: (region) => MOUNT_REGIONS[region],
  }),
  Object.freeze({
    path: LAB_INTERACTABLES_PATH,
    selects: rendersInCanvasWindow,
  }),
]);

/**
 * @param {Function} selects A predicate over one case.
 * @returns {Set<string>} The publishable case ids it accepts.
 */
function casesSelecting(selects) {
  return new Set(
    publishableCases()
      .filter((viewCase) => selects(viewCase))
      .map((viewCase) => viewCase.id)
  );
}

/** The cases a change to one case file selects, given the PR's patch for it. */
function casesFromCaseFilePatch(patch, attribution) {
  const { keys, unattributable } = touchedRegionKeys(
    patch,
    attribution.sourceLines,
    attribution.regions
  );
  return widenedByCoverage(keys, unattributable);
}

/** The cases a REGION-attributed lab input selects: the union of what each touched region feeds. */
function casesFromRegionPatch(patch, attribution) {
  const { keys, unattributable } = touchedRegionKeys(
    patch,
    attribution.sourceLines,
    attribution.regions
  );

  const ids = new Set();
  for (const key of keys) {
    for (const id of casesSelecting(attribution.selectsRegion(key))) ids.add(id);
  }
  return widenedByCoverage(ids, unattributable);
}

/** The cases one lab input selects. */
function selectLabInputCases(file, patchByPath) {
  const attribution = ATTRIBUTED_LAB_INPUTS.find((entry) => entry.path === file);
  // The default, and the fail-safe: an input nobody has attributed — a new file under
  // `tests/view-lab/`, the fixture assembler, the Foundry shim, this index, a shared seam under
  // `view-lab-cases/` — reaches further than this registry can say, and resolves to surface
  // coverage.
  if (!attribution) return new Set(LAB_SURFACE_CASE_IDS);
  if (attribution.attributesByCase) {
    return casesFromCaseFilePatch(patchByPath.get(file), attribution);
  }
  if (attribution.regions) return casesFromRegionPatch(patchByPath.get(file), attribution);
  return casesSelecting(attribution.selects);
}

/** The union of what every lab input in a changed set selects. */
function selectAllLabInputCases(labInputs, patchByPath) {
  const selected = new Set();
  for (const file of labInputs) {
    for (const id of selectLabInputCases(file, patchByPath)) selected.add(id);
  }
  return selected;
}

/**
 * @param {object|undefined} patches Patches keyed by path, as the caller supplied them.
 * @returns {Map<string, string>} The same, keyed by normalized path.
 */
function normalizePatches(patches) {
  const byPath = new Map();
  for (const [path, patch] of Object.entries(patches ?? {})) byPath.set(normalizePath(path), patch);
  return byPath;
}

/** Map a changed-file set onto the cases that should be captured. */
export function mapChangedFilesToCases(files = [], { patches } = {}) {
  const normalized = files.map((file) => normalizePath(file)).filter(Boolean);
  const labInputs = normalized.filter((file) => LAB_INFRASTRUCTURE_PATTERN.test(file));
  // Disjoint from `labInputs` so each path is attributed exactly once: `tests/view-lab/cascade.css`
  // is both a lab input and a `.css` file, and it is the lab input rule that governs it.
  const renderFiles = normalized.filter(
    (file) => isUiFile(file) && !LAB_INFRASTRUCTURE_PATTERN.test(file)
  );

  if (labInputs.length === 0 && renderFiles.length === 0) {
    // Nothing here renders, so there is no frame to select — a lang-only change included.
    return [];
  }

  // A union at every level, never a replacement. Five levels carry it — one candidate anchor, a
  // hunk's candidates, a patch's hunks, an input's patch, and a change's inputs — and this is the
  // last of them.
  const selected = selectRenderFileCases(renderFiles);
  for (const id of selectAllLabInputCases(labInputs, normalizePatches(patches))) selected.add(id);
  if (selected.size === 0) selected.add(FALLBACK_CASE_ID);

  return VIEW_LAB_CASES.filter((viewCase) => selected.has(viewCase.id) && viewCase.publish);
}

/** Every case that publishes, for a full capture run. */
export function publishableCases() {
  return VIEW_LAB_CASES.filter((viewCase) => viewCase.publish);
}

export {
  BROAD_SIGNAL_CASE_OVERRIDES,
  BROAD_SIGNAL_PATTERN,
} from './view-lab-cases/broadSignals.js';
