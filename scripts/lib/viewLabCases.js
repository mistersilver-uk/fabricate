/**
 * Canonical view-case registry for the Fabricate View Lab (issue 823).
 *
 * ONE pure registry drives changed-file -> view mapping, View Lab scenario
 * selection, artifact validation, PR labels, and stable `<id>.png` filenames.
 * It imports no Node, Foundry, or browser globals at module load, so it is safe
 * to import from the CLI (`scripts/view-lab-screenshots.mjs`), the globbed
 * `node --test` unit suite (`tests/view-lab-cases.test.js`), and the Vite-served
 * browser lab (`tests/view-lab/`) alike.
 *
 * Each case IS its own deterministic capture emitter: it renders DIRECTLY to
 * `<id>.png`. There is therefore no `smokeLabels` layer, no filename-sorted
 * `candidates[0]` selection, and no `foundry-test-run.mjs` source-parse lockstep
 * — one case == one deterministic capture. This structurally removes the "each
 * frame needs a dedicated view id because the publisher takes candidates[0]" tax
 * and the silent cross-file harness-parse drift that the legacy `VIEW_RECIPES`
 * map carried.
 *
 * Case schema (every field pinned by a unit test in the `npm test` glob):
 *  - `id`            unique across cases; `<id>.png` filenames are therefore
 *                    unique. The validator allow-set AND the planner output both
 *                    derive literally from `caseIds()`.
 *  - `label`         human-facing alt-text. SANITIZED before it reaches markdown
 *                    (see `scripts/ui-pr-screenshot-evidence.mjs`).
 *  - `component`     repo-relative `.svelte` the lab mounts; Vite resolves its
 *                    whole import graph, so no harness allowlist applies.
 *  - `fixtureId`     key into the lab fixtures module (props/state for the mount);
 *                    must resolve to a registered fixture.
 *  - `sourceMatches` non-empty array of anchored `RegExp`s over repo-relative
 *                    paths; EVERY pattern must resolve to a real tracked file
 *                    (incl. globs) — the ported anti-stranding invariant.
 *  - `viewport`      explicit `{ width, height }`.
 *  - `readySelector` a stable class/role/data-attribute selector the browser
 *                    suite asserts appears; a missing selector is a loud failure,
 *                    NEVER a hang. It must NEVER key on a `crypto.randomUUID` /
 *                    `foundry.utils.randomID` generated DOM id.
 *  - `publish`       whether `capture` emits + publishes this case's frame.
 *  - `kinds`         classification tags for the coverage/fidelity reports
 *                    (`pilot` | `font-metric` | `state` | `fallback` | surface).
 */

// The single global-UI fallback case id (replaces the legacy `theme-or-global-ui`
// fallback). Exactly one case carries `kinds: ['fallback', ...]` and this id.
export const FALLBACK_CASE_ID = 'global-ui';

// Repo-relative source-glob fragments reused across several cases so a change to
// any player crafting or shared component surface fans out to the cases that
// render it. Anchored `^…$` over forward-slash repo-relative paths.
const CRAFTING_APP = /^src\/ui\/svelte\/apps\/crafting\//;
const APP_SHELL = /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/;

export const VIEW_CASES = Object.freeze([
  // ── Pilot: one player + one manager surface (staged pilot per issue 823). ──
  {
    id: 'player-crafting-status',
    label: 'Player crafting — recipe browse-status badge (available)',
    component: 'src/ui/svelte/apps/crafting/CraftingStatusBadge.svelte',
    fixtureId: 'craftingStatusAvailable',
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/crafting\/CraftingStatusBadge\.svelte$/,
      /^src\/ui\/svelte\/util\/craftingRecipeStatus\.js$/,
    ],
    viewport: { width: 480, height: 200 },
    readySelector: '.crafting-status-badge',
    publish: true,
    kinds: ['pilot', 'player', 'crafting'],
  },
  {
    id: 'manager-status-pill',
    label: 'Manager recipe/inspector status pill (enabled)',
    component: 'src/ui/svelte/components/StatusPill.svelte',
    fixtureId: 'statusPillEnabled',
    sourceMatches: [/^src\/ui\/svelte\/components\/StatusPill\.svelte$/],
    viewport: { width: 480, height: 200 },
    readySelector: '.fab-status-pill',
    publish: true,
    kinds: ['pilot', 'manager'],
  },

  // ── Font-metric-width cases (Design E): load-bearing for the weakest fidelity
  //    axis; MUST render under the real bundled fonts (Signika/Spectral/JetBrains).
  {
    id: 'player-crafting-qty-mono',
    label: 'Player crafting — have/need quantity tag (mono-numeric column)',
    component: 'src/ui/svelte/apps/crafting/QuantityTag.svelte',
    fixtureId: 'quantityTagMonoNumeric',
    sourceMatches: [/^src\/ui\/svelte\/apps\/crafting\/QuantityTag\.svelte$/],
    viewport: { width: 480, height: 200 },
    readySelector: '.crafting-qty-tag',
    publish: true,
    kinds: ['font-metric', 'crafting'],
  },
  {
    id: 'player-crafting-row-long-name',
    label: 'Player crafting — recipe row with a long name (overflow / ellipsis)',
    component: 'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
    fixtureId: 'recipeRowLongName',
    sourceMatches: [CRAFTING_APP],
    viewport: { width: 360, height: 220 },
    readySelector: '.crafting-recipe-row',
    publish: true,
    kinds: ['font-metric', 'crafting'],
  },
  {
    id: 'player-crafting-status-localized',
    label: 'Player crafting — status badge with a long localized label',
    component: 'src/ui/svelte/apps/crafting/CraftingStatusBadge.svelte',
    fixtureId: 'craftingStatusLocalized',
    sourceMatches: [/^src\/ui\/svelte\/apps\/crafting\/CraftingStatusBadge\.svelte$/],
    viewport: { width: 520, height: 200 },
    readySelector: '.crafting-status-badge',
    publish: true,
    kinds: ['font-metric', 'crafting'],
  },
  {
    id: 'player-crafting-row-narrow',
    label: 'Player crafting — recipe row at a narrow stacked width',
    component: 'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
    fixtureId: 'recipeRowNarrowStacked',
    sourceMatches: [CRAFTING_APP, APP_SHELL],
    viewport: { width: 320, height: 260 },
    readySelector: '.crafting-recipe-row',
    publish: true,
    kinds: ['font-metric', 'crafting'],
  },

  // ── State cases (Design A/E): behaviour/state coverage, not font-metric width.
  {
    id: 'manager-pill-blocked',
    label: 'Manager status pill — blocked (cannot be enabled)',
    component: 'src/ui/svelte/components/StatusPill.svelte',
    fixtureId: 'statusPillBlocked',
    sourceMatches: [/^src\/ui\/svelte\/components\/StatusPill\.svelte$/],
    viewport: { width: 480, height: 200 },
    readySelector: '.fab-status-pill.is-danger',
    publish: true,
    kinds: ['state', 'manager'],
  },
  {
    id: 'manager-pill-restricted',
    label: 'Manager status pill — restricted (locked, players may view)',
    component: 'src/ui/svelte/components/StatusPill.svelte',
    fixtureId: 'statusPillRestricted',
    sourceMatches: [/^src\/ui\/svelte\/components\/StatusPill\.svelte$/],
    viewport: { width: 480, height: 200 },
    readySelector: '.fab-status-pill.is-accent',
    publish: true,
    kinds: ['state', 'manager'],
  },

  // ── The single global-UI fallback (replaces `theme-or-global-ui`). Selected for
  //    any UI change that maps to no other case; renders the themed app frame so a
  //    global token/theme edit still shows something.
  {
    id: FALLBACK_CASE_ID,
    label: 'Global UI styling or theme (app frame)',
    component: 'src/ui/svelte/apps/crafting/CraftingStatusBadge.svelte',
    fixtureId: 'globalUiTheme',
    sourceMatches: [/^styles\//, /\.css$/],
    viewport: { width: 640, height: 320 },
    readySelector: '.fabricate',
    publish: true,
    kinds: ['fallback'],
  },
]);

/** Normalize a path to forward slashes and strip a leading `./`. */
export function normalizePath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

/**
 * The same UI-file rule CI uses. `lang/` is deliberately excluded (a lang-only PR
 * is not UI; a lang change shipped alongside a render file is still UI because the
 * render file independently trips the gate).
 */
export function isUiFile(filePath) {
  const normalized = normalizePath(filePath);
  return (
    normalized.startsWith('src/ui/') ||
    normalized.startsWith('styles/') ||
    normalized.endsWith('.svelte') ||
    normalized.endsWith('.css')
  );
}

export function hasUiChanges(files = []) {
  return files.some(isUiFile);
}

/** All case ids, in registry order. The validator/planner derive from this. */
export function caseIds() {
  return VIEW_CASES.map((viewCase) => viewCase.id);
}

export function getCaseById(id) {
  return VIEW_CASES.find((viewCase) => viewCase.id === id) || null;
}

export function fallbackCase() {
  return getCaseById(FALLBACK_CASE_ID);
}

/**
 * Map a changed-file set to the view cases that render those surfaces. Falls back
 * to the single global-UI case when a UI change matches no explicit case.
 */
export function mapChangedFilesToCases(files = []) {
  const normalizedFiles = files.map(normalizePath).filter(Boolean);
  const matched = [];
  for (const viewCase of VIEW_CASES) {
    if (viewCase.id === FALLBACK_CASE_ID) continue;
    if (normalizedFiles.some((file) => viewCase.sourceMatches.some((pattern) => pattern.test(file)))) {
      matched.push(viewCase);
    }
  }
  if (matched.length === 0 && normalizedFiles.some(isUiFile)) {
    const fallback = fallbackCase();
    if (fallback) matched.push(fallback);
  }
  return matched;
}
