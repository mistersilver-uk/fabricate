#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// The refusal diagnostic lives beside `evaluateSmokeOutcome` in the lib, NOT here (issue
// #1019). Two reasons, both structural: the producer and this consumer then share one
// `formatFailedStep`, so the gate quotes a failing step exactly as the harness's own throw
// does; and this file is in `KNOWN_UNGATED_SCRIPTS`, outside both the `lint` and the
// `format:check` globs, while `scripts/lib/foundrySmokeSignal.js` is inside both.
import { explainSmokeSummaryRefusal } from './lib/foundrySmokeSignal.js';
// The `check` gate's composed decision — await the capture run for this head, then match what it
// published — lives in the lib for the same two reasons, plus a third: it is a LEAF that imports
// nothing from this file. The evaluation it needs (the four predicates below) is injected as the
// `evaluate` collaborator bundle, because importing them there would make a `lib -> script -> lib`
// cycle and `VIEW_RECIPES` above is a top-level `Object.freeze([...])` a cyclic partial-evaluation
// order can observe as `undefined`.
import { decideScreenshotGate } from './lib/screenshotEvidenceMatching.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

// Default human-only label that exempts a UI PR from the screenshot requirement.
const DEFAULT_EXEMPT_LABEL = 'screenshots-exempt';

// Stable delimiters for the managed screenshot block in the PR body. `publish`
// replaces everything between these markers so re-runs update in place instead
// of appending duplicate blocks.
const SCREENSHOTS_BLOCK_START = '<!-- fabricate:screenshots:start -->';
const SCREENSHOTS_BLOCK_END = '<!-- fabricate:screenshots:end -->';

// The recipe editor's frames (overview/ingredients/validation/multi-step/tools/access/
// results) share the same trigger files, so any recipe editor / tab / sub-component
// change republishes all of them. Every editor tab lives under `recipe/` and is covered
// by the glob below; the BROWSER inspector deliberately does not (see the
// manager-recipes recipe).
const RECIPE_EDIT_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/recipe\/(?!RecipeTools(?:Tab|Section)\.svelte$).*\.svelte$/,
  // The Overview tab's eligible-modifier override renders the shared pill multi-select
  // (issue 770); a change to it republishes the recipe-editor frames it appears in.
  /^src\/ui\/svelte\/components\/ModifierPillSelect\.svelte$/,
];

// Every recipe-editor frame maps one same-named smoke label to the shared
// RECIPE_EDIT_MATCHES glob. The factory collapses the twelve otherwise-identical view
// literals into one call each so the block does not read as a large duplicated span —
// Sonar's Automatic Analysis counts repeated object literals (`cpd.exclusions` is ignored)
// and a fresh sibling entry would otherwise trip the new-code duplication gate.
const recipeEditFrame = (id, label) => ({ id, label, smokeLabels: [id], matches: RECIPE_EDIT_MATCHES });
const toolStudioFrame = (id, label, smokeLabel, matches) => ({
  id,
  label,
  smokeLabels: [smokeLabel],
  matches,
});
// The GM Knowledge surface (issue 785). Shared by the two Knowledge view ids below
// (the surface itself and its armed-Delete frame) so the pair is one trigger set
// expressed once. `ArmedDangerButton` is included because it renders inside every
// owned-copy and learned row; `styles/` is deliberately NOT, so a broad stylesheet
// change keeps routing to the existing theme-or-global-ui fallback.
const KNOWLEDGE_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/(?:KnowledgeView|ArmedDangerButton)\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/knowledge\/.+\.svelte$/,
  // Every plain-JS module in the surface's own folder: the pure projection
  // (`knowledgeStudio.js`) and the mutation collaborator (`knowledgeMutations.js`)
  // both change what the captured frames show.
  /^src\/ui\/svelte\/apps\/manager\/knowledge\/.+\.js$/,
];
// ONLY Tool Studio's own files. It deliberately excludes two shared surfaces it used
// to match:
//
// - `styles/fabricate.css`. A global stylesheet edit pulled in all 12 Tool Studio
//   parity and stress frames regardless of relevance, which is most of why a
//   single-screen change could demand 28 published views. A global change now routes
//   to `theme-or-global-ui`, whose set samples every app-area shell instead of
//   over-sampling one screen.
// - `CraftingSystemManagerRoot.svelte`. The manager router hosts every manager view,
//   so a change there is a global manager change, not a Tool Studio one; it now routes
//   to `theme-or-global-ui` as well.
const TOOL_STUDIO_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/(?:ToolsBrowserView|ToolEditView)\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/tools\/.+\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/tools\/toolStudio\.js$/,
  // The shared side-panel primitives the Tool Studio's preview and library inspector
  // render (issue 881). Their CSS is co-located in their own scoped blocks precisely so a
  // change to them maps HERE rather than to the broad `theme-or-global-ui` recipe — which
  // only works if the recipes that render them name them.
  /^src\/ui\/svelte\/apps\/manager\/(?:ExplainerCard|IconFactRow)\.svelte$/,
];

// The Component Studio BROWSER's own files (issue 676): the view and every component in
// `components/`, which is the browser's directory (`component/` is the EDITOR's, mirroring
// the Recipe Studio's `recipes/` vs `recipe/` split). Shared by every browser frame below.
const COMPONENTS_BROWSER_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/components\/.+\.svelte$/,
  // The shared bulk-edit primitives (issue 1010) and the shared bulk-DELETE card (issue
  // 1132). They sit directly under `apps/manager/`, beside `Chip` and `Callout`, so they fall
  // through BOTH the `components/` glob above and the `recipes/` one — a change to any of them
  // would otherwise map to no view at all and fall to the broad `theme-or-global-ui` recipe,
  // publishing frames that cannot show the change. Enumerated by name rather than widened to a
  // directory glob, because `apps/manager/*.svelte` is the whole manager and would conscript
  // these frames as the evidence for every screen in it.
  //
  // `BulkDeleteCard` is named in the ESSENCES recipe too. That is not over-claiming: unlike the
  // four chrome primitives, the delete card renders in all three studios, and
  // `scripts/lib/viewLabCases.js` claims it on all three studios' delete frames. The two
  // registries must not disagree about what evidence a change to one file requires.
  /^src\/ui\/svelte\/apps\/manager\/(?:BulkSelectionToolbar|BulkEditPanelShell|BulkEditSection|BulkEditSelect|BulkDeleteCard)\.svelte$/,
];

// A single-frame components-browser view: one same-named smoke label over the shared
// browser match list, plus whatever extra file that STATE additionally depends on. Same
// argument as `recipeEditFrame` above — Sonar's Automatic Analysis counts repeated object
// literals and ignores `cpd.exclusions`, so a fresh sibling literal near-identical to its
// neighbour trips the new-code duplication gate.
const componentsBrowserFrame = (id, label, extraMatches = []) => ({
  id,
  label,
  smokeLabels: [id],
  matches: [...COMPONENTS_BROWSER_MATCHES, ...extraMatches],
});

// The two pure models the bulk panel stages against. `bulkSelectionModel.js` is the shared
// leaf the four selection helpers moved to (issue 1010) — without it named here a change to
// the selection model would map to NO view at all, since `componentBulkEditModel.js` merely
// re-exports it and is not itself touched. Hoisted rather than written out at each of the
// three bulk frames: Sonar's Automatic Analysis counts repeated literals in `scripts/**`
// and ignores `cpd.exclusions`.
const BULK_EDIT_MODEL_MATCHES = [
  /^src\/utils\/componentBulkEditModel\.js$/,
  /^src\/utils\/bulkSelectionModel\.js$/,
];

// The Recipe Studio BROWSER's own files (issue 1010), mirroring COMPONENTS_BROWSER_MATCHES.
// `recipes/` is the browser's directory and `recipe/` is the EDITOR's (RECIPE_EDIT_MATCHES),
// so a browser-side component placed in the latter would republish the editor frames and never
// this one — the split is load-bearing and stated on `manager-recipes` below too.
//
// The four shared bulk-edit primitives are enumerated here for the same reason they are
// enumerated in the components list: they sit directly under `apps/manager/`, so they fall
// through BOTH studios' directory globs and a change to one of them would otherwise map to no
// recipe view at all. Widening to `apps/manager/*.svelte` instead would conscript these frames
// as the evidence for every screen in the manager.
const RECIPES_BROWSER_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/RecipesBrowserView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/recipes\/.*\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/(?:BulkSelectionToolbar|BulkEditPanelShell|BulkEditSection|BulkEditSelect|BulkDeleteCard)\.svelte$/,
];

// A single-frame recipes-browser view: one same-named smoke label over the shared browser match
// list, plus whatever extra file that STATE additionally depends on. Same argument as
// `componentsBrowserFrame` above — Sonar's Automatic Analysis counts repeated object literals,
// ignores `cpd.exclusions`, and analyses `scripts/**`, so three fresh sibling literals differing
// only in two strings is exactly the span that trips the new-code duplication gate.
const recipesBrowserFrame = (id, label, extraMatches = []) => ({
  id,
  label,
  smokeLabels: [id],
  matches: [...RECIPES_BROWSER_MATCHES, ...extraMatches],
});

// The two pure models the recipe bulk panel stages against — the recipe half of
// `BULK_EDIT_MODEL_MATCHES` above, and hoisted for the same reason. `bulkSelectionModel.js` is
// named on BOTH because both studios' selection helpers now live there; `recipeBulkEditModel.js`
// merely re-exports them, so a change to the shared leaf touches neither studio's own model file
// and would map to no view without this.
const RECIPE_BULK_EDIT_MODEL_MATCHES = [
  /^src\/utils\/recipeBulkEditModel\.js$/,
  /^src\/utils\/bulkSelectionModel\.js$/,
];

// The player Crafting tab's requirement surface (issue 917): the slot rail, the single
// open chooser, the shared essence pool and the consumption-plan panel. Scoped to the
// crafting DETAIL sources — the `player-crafting-roll-result` precedent — so a detail
// change maps here as well as to the broad `player-crafting` glob, plus the rail's own
// pure projection and the store that holds which chooser is open and what the player has
// allocated. Neither of those two modules has any other view recipe, so naming them here
// routes a change to them at real evidence instead of the generic global fallback.
//
// `components/Stepper.svelte` is deliberately NOT named, matching the argument recorded
// on `manager-components-bulk-edit-progressive`: it is a global primitive rendered by
// several unrelated surfaces, and conscripting these six frames as its evidence would
// mis-route every future change to it.
const REQUIREMENT_RAIL_MATCHES = [
  /^src\/ui\/svelte\/apps\/crafting\/detail\//,
  /^src\/ui\/svelte\/util\/requirementSlots\.js$/,
  /^src\/ui\/svelte\/stores\/craftingStore\.svelte\.js$/,
];

// One rail frame: a single same-named smoke label over the shared rail trigger list.
// Same argument as `recipeEditFrame` / `componentsBrowserFrame` above — six sibling
// object literals differing only in two strings is exactly the span Sonar's Automatic
// Analysis counts as new duplicated lines (`cpd.exclusions` is ignored for it), and
// `scripts/**` is analysed.
const requirementRailFrame = (id, label) => ({
  id,
  label,
  smokeLabels: [id],
  matches: REQUIREMENT_RAIL_MATCHES,
});

const WORLD_NAVIGATION_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/Gathering(Parties|Realms|MapLinks)Tab\.svelte$/,
];

// All live-smoke states are independently publishable. A multi-label recipe would collect only its
// first filename-sorted candidate and silently discard the disclosure/child/width evidence.
const worldNavigationFrame = (id, label) => ({
  id,
  label,
  smokeLabels: [id],
  matches: WORLD_NAVIGATION_MATCHES,
});

export const VIEW_RECIPES = Object.freeze([
  {
    id: 'manager-systems',
    label: 'Manager systems browser',
    smokeLabels: ['manager-default-selection', 'manager-selected-normal', 'manager-selected-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  {
    id: 'manager-rail-expanded',
    label: 'Manager rail expanded (default)',
    smokeLabels: ['manager-rail-expanded'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/, /^styles\/fabricate\.css$/],
  },
  {
    id: 'manager-rail-collapsed',
    label: 'Manager rail collapsed (icon strip)',
    smokeLabels: ['manager-rail-collapsed'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/, /^styles\/fabricate\.css$/],
  },
  {
    id: 'manager-system-edit',
    label: 'Manager system settings',
    smokeLabels: ['manager-system-edit-normal', 'manager-system-edit-narrow'],
    // Issue 768: the settings-list child cards (CharacterPrerequisitesCard and any
    // future `system/` card) render inside this frame, so a change to one maps to a
    // system-edit screenshot rather than the generic fallback.
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\/.+\.svelte$/,
    ],
  },
  {
    // Issue 767: the unsaved-changes chip + dirty-draft guard for the identity
    // form. This needs its OWN view id (not an appended smokeLabel on
    // `manager-system-edit`): `collect` publishes only `candidates[0]` from a
    // filename-sorted list, so appending the dirty label there would publish the
    // clean `-narrow` frame forever and the changed state would never reach the PR.
    id: 'manager-system-edit-dirty',
    label: 'Manager system settings — unsaved-changes chip',
    smokeLabels: ['manager-system-edit-dirty'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
    ],
  },
  {
    // Issue 768: the settings-list ergonomics proof frame — Character Modifiers,
    // Character Prerequisites and Currency Units seeded with ≥2 entries, with the
    // shared IconPicker open on a modifier, the Currency section collapsed, and the
    // row-level copy buttons visible. Its OWN view id + single smokeLabel because
    // `collect` publishes only candidates[0]; appending this label to
    // `manager-system-edit` would keep publishing the clean settled frame instead.
    id: 'manager-system-edit-lists',
    label: 'Manager system settings — settings-list ergonomics (icon picker, collapse, copy)',
    smokeLabels: ['manager-system-edit-lists'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\/.+\.svelte$/,
      /^src\/systems\/characterModifierPrerequisiteCopy\.js$/,
    ],
  },
  {
    id: 'manager-currency',
    label: 'Manager currency configuration (spend strategy, units, macros)',
    smokeLabels: ['currency-actor-property', 'currency-macro', 'currency-actor-inventory'],
    matches: [
      /^src\/systems\/currencyProfile\.js$/,
      /^src\/systems\/CoinSpenders\.js$/,
      /^src\/config\/currency(?:Presets|Providers)\.js$/,
    ],
  },
  // The Component Studio (issue 676). See COMPONENTS_BROWSER_MATCHES for the two
  // deliberately-distinct directories.
  {
    id: 'manager-components',
    label: 'Manager components browser',
    // The only components-browser view with TWO frames, so it is the one entry here that
    // cannot come from `componentsBrowserFrame` (which keys its single label off the id).
    smokeLabels: ['manager-components-normal', 'manager-components-stacked'],
    matches: [...COMPONENTS_BROWSER_MATCHES, /^src\/utils\/componentBrowserModel\.js$/],
  },
  componentsBrowserFrame(
    'manager-components-progressive',
    'Manager components browser — progressive difficulty badge (value + None)',
  ),
  // Issue 772: the bulk-edit state — rows multi-selected, the selection toolbar, and the
  // rail's staged bulk panel. A DEDICATED view id, not extra labels on `manager-components`:
  // `collect` publishes only `candidates[0]` from a path-sorted list, so appending the label
  // there would publish an arbitrary components frame and the staged state — the whole point
  // of the evidence — would never reach the PR. The two extra triggers are the shared
  // selection primitive (which renders on every row AND in the toolbar) and the pure
  // selection/staging model behind the panel.
  componentsBrowserFrame(
    'manager-components-bulk-edit',
    'Manager components browser — bulk edit (multi-select, selection toolbar, staged rail panel)',
    [/^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/, ...BULK_EDIT_MODEL_MATCHES],
  ),
  // The bulk panel's other two states, each its OWN view for the same `candidates[0]`
  // reason as the staged frame above — and each a separate FRAME because no one
  // photograph can hold them. An axis chip cannot read "leave unchanged" and "will
  // overwrite" at once, and the staged frame is the one the prototype parity table
  // compares, so the unstaged face — the sole route to "clear essences on every selected
  // component" — needs a frame of its own or it ships unevidenced.
  componentsBrowserFrame(
    'manager-components-bulk-edit-unstaged',
    'Manager components browser — bulk edit, pristine draft (every axis unstaged, Apply inert)',
    [/^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/, ...BULK_EDIT_MODEL_MATCHES],
  ),
  // The Progressive DC section is gated on `componentDifficultyAxisProgressive`, so it
  // renders on the progressive smoke system and on no other — which is also the only
  // system in this world that can evidence the panel's empty item-tag copy, since it
  // authors no tags. Its extra trigger is the staging model alone, deliberately: the
  // section is built from `Chip` and `Stepper`, but neither is named here because both are
  // global primitives with no other `VIEW_RECIPES` entry, and conscripting this one frame
  // as their evidence would mis-route every future change to them.
  componentsBrowserFrame(
    'manager-components-bulk-edit-progressive',
    'Manager components browser — bulk edit, progressive DC section + empty item-tag copy',
    [...BULK_EDIT_MODEL_MATCHES],
  ),
  // Issue 801: the grouped-category CONTINUATION frame — a category split across a page
  // boundary, its continuation slice ("N of M") at the head of the next page. Its OWN view
  // id (one file per published frame; `collect` emits only `candidates[0]`) so the
  // continuation state itself reaches the PR rather than an unrelated components frame.
  {
    id: 'manager-components-grouped-continuation',
    label: 'Manager components browser — grouped category continued across a page boundary',
    smokeLabels: ['manager-components-grouped-continuation'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/,
      /^src\/utils\/componentBrowserModel\.js$/,
    ],
  },
  // Issue 800: write-time RESOLUTION of source descriptions. Three DEDICATED view ids,
  // not extra smokeLabels on `manager-components`: `collect` publishes only
  // `candidates[0]` from a filename-sorted list, so appending them there would publish
  // one arbitrary frame and the BEFORE/AFTER pair — the whole point of the evidence —
  // would never reach the PR.
  {
    id: 'manager-components-description-before',
    label: 'Component description — BEFORE (un-repaired world, raw directive text)',
    smokeLabels: ['manager-components-description-before'],
    matches: [
      /^src\/utils\/plainTextDescription\.js$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/util\/foundryBridge\.js$/,
    ],
  },
  {
    id: 'manager-components-description-repaired',
    label: 'Component description — AFTER Repair Item Data (locked-pack source resolved)',
    smokeLabels: ['manager-components-description-repaired'],
    matches: [
      /^src\/utils\/plainTextDescription\.js$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/util\/foundryBridge\.js$/,
      /^src\/systems\/CraftingSystemManager\.js$/,
      /^src\/config\/repairItemData\.js$/,
    ],
  },
  {
    id: 'manager-components-description-ingested',
    label: 'Component description — AFTER ingestion (resolved on the write path)',
    smokeLabels: ['manager-components-description-ingested'],
    matches: [
      /^src\/utils\/plainTextDescription\.js$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/util\/foundryBridge\.js$/,
      /^src\/systems\/CraftingSystemManager\.js$/,
    ],
  },
  {
    id: 'manager-component-edit',
    label: 'Manager component editor (single column: identity strip + category, no rail)',
    smokeLabels: ['manager-component-edit-normal'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/component\/.+\.svelte$/,
      // The essence quantity card (issue 772) lives under `components/` — the BROWSER's
      // directory, because the browser's bulk panel renders it too — but the EDITOR renders
      // it as well, four-up. Named here explicitly: without this a change to the card would
      // route evidence to the browser frames and NEVER to this one, which is the silent
      // drift the comment on `manager-component-edit-difficulty` below was written after.
      /^src\/ui\/svelte\/apps\/manager\/components\/EssenceQuantityCard\.svelte$/,
    ],
  },
  {
    id: 'manager-component-edit-difficulty',
    label: 'Manager component editor — staged progressive difficulty control',
    smokeLabels: ['manager-component-edit-difficulty'],
    // The difficulty control rehomed from the deleted ComponentDifficultyInspector
    // into ComponentEditView's body. This entry used to name ONLY that inspector — so
    // after its deletion it would have matched nothing forever, silently, all green.
    // That is the exact drift `every matches entry resolves to a real path` now pins.
    matches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-component-edit-salvage',
    label: 'Manager component editor — salvage authoring (enable toggle, result groups, routing, DC presets)',
    // `-off` photographs the collapsed/OFF salvage body: the state decision 6
    // guarantees every existing world shows, and the one Ruling A governs.
    smokeLabels: ['manager-component-edit-salvage', 'manager-component-edit-salvage-off'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/component\/salvageDcPresets\.js$/,
    ],
  },
  {
    // Issue 764: the Simple-mode salvage editor at its one-success-group cap — the Add
    // group control HIDDEN and the required hint shown. Its own recipe (one file per id,
    // per the issue-752 demonstration pattern) so `collect` publishes it as its own frame
    // rather than collapsing it into the routed authoring frame above.
    id: 'manager-component-edit-salvage-simple',
    label: 'Manager component editor — Simple-mode salvage single-group cap (no Add group, required hint)',
    smokeLabels: ['manager-component-edit-salvage-simple'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/],
  },
  {
    id: 'manager-checks-gathering',
    label: 'Manager Checks tab — gathering check editor (routed)',
    smokeLabels: ['manager-checks-gathering'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksRightMenu\.svelte$/,
      // The rail's standing help card renders through the shared explainer primitive
      // (issue 883), whose CSS is co-located in its own scoped block; this is the frame
      // that shows it on this screen.
      /^src\/ui\/svelte\/apps\/manager\/ExplainerCard\.svelte$/,
    ],
  },
  {
    id: 'manager-checks-validation',
    label: 'Manager Checks tab — per-check Validation tab (readiness + issues)',
    smokeLabels: ['manager-checks-validation'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksValidationTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/checksReadiness\.js$/,
    ],
  },
  // Issue 752: the Checks → Crafting tab scrolled to the failure-consumption
  // controls (evidence for #736's #712 half). The routed crafting check editor
  // (CraftingCheckEditor) renders those controls, so a change to it or the Checks
  // shell republishes this frame.
  {
    id: 'manager-checks-crafting-consumption',
    label: 'Manager Checks tab — crafting failure-consumption controls',
    smokeLabels: ['manager-checks-crafting-consumption'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CraftingCheckEditor\.svelte$/,
      // Issue 1036: the simple-mode editor and the shared drop primitive it was converted
      // onto. The smoke walk never switches the DC source, so its frame shows this editor's
      // STATIC branch — the dynamic branch's macro card is photographed by the View Lab case
      // `manager-checks-crafting-dynamic-dc`, which is the criterion-14 before/after subject.
      // Naming them here is what makes a change to either republish the frame that DOES
      // exist, rather than publishing nothing at all for this screen.
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ItemDropZone\.svelte$/,
    ],
  },
  {
    // Issue 770: the check-modifier catalogue card — its OWN frame (the crafting tab
    // scrolls to the failure-consumption card for the frame above, so the modifier card
    // needs a dedicated capture to show its IconPicker + label + `@`-expression rows and
    // the default-modifier pill multi-select un-cropped). One published frame; the card
    // and the shared pill control both republish it.
    id: 'manager-checks-crafting-modifiers',
    label: 'Manager Checks tab — crafting check-modifier catalogue',
    smokeLabels: ['manager-checks-crafting-modifiers'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CraftingModifierCatalogueCard\.svelte$/,
      /^src\/ui\/svelte\/components\/ModifierPillSelect\.svelte$/,
    ],
  },
  {
    id: 'manager-tags-categories',
    label: 'Manager tags and categories',
    smokeLabels: ['manager-tags-categories-normal', 'manager-tags-categories-stacked'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategoriesView\.svelte$/,
      // The inspector rail's contextual help and reference-safety card render through the
      // shared explainer primitive (issue 881), whose CSS is co-located in its own scoped
      // block; these frames are the ones that show it on this screen.
      /^src\/ui\/svelte\/apps\/manager\/ExplainerCard\.svelte$/,
    ],
  },
  // Issue 752: the Item tags vocabulary rows (evidence for #735's row rendering).
  // Its OWN recipe, not a preferred label on manager-tags-categories: `collect`
  // emits one file per recipe id, so a shared entry would publish only the
  // alphabetically-first frame. The item-tags panel lives in VocabularyPanel, so a
  // change to either the screen or the shared panel republishes this frame.
  {
    id: 'manager-tags-categories-tags-tab',
    label: 'Manager tags and categories — Item tags rows',
    smokeLabels: ['manager-tags-categories-tags-tab'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategoriesView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/VocabularyPanel\.svelte$/,
    ],
  },
  {
    // The GM Essence Studio (issue 1036). Its eight components live under `essences/` — the
    // BROWSER's directory — and its pure models under `src/utils/`, and NONE of them was
    // reachable by the shipped pattern: `/apps\/manager\/Essence/` is case-SENSITIVE, so a
    // redesign confined to the new lowercase directory would have published no essence frame
    // at all while `check-screenshots` still armed on the `src/ui/**` change.
    //
    // The frame set is deliberately wide. The library's list and its 1000px wrap, the
    // disabled-and-in-use inspector, the grid presentation, the active bulk selection and the
    // editor's three tabs are seven genuinely different screens, and the delta requires each
    // of them to have evidence rather than to be represented by the two the smoke walk
    // happens to reach.
    id: 'manager-essences',
    label: 'Manager essences',
    //
    // Only the THREE labels the smoke harness actually emits appear here; this list is the
    // scoped SMOKE capture's target set, and every entry is checked against
    // `scripts/foundry-test-run.mjs`. The five further essence screens the redesign needs
    // evidence for — the disabled-and-in-use inspector, the grid, the active bulk selection
    // and the editor's On-craft and Validation tabs — are View Lab cases, which the `capture`
    // CI job publishes from its own registry on every push.
    smokeLabels: [
      'manager-essences-normal',
      'manager-essences-stacked',
      'manager-essence-edit-first-state',
    ],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // `essencePreviewRow` builds the two synthetic tiles the editor's "How players see it"
      // rail mounts, so a change to it is only visible in `manager-essence-edit-first-state`
      // (issue 1124). Absent here it fell through to the broad fallback set and would have
      // published frames that cannot show the change.
      /^src\/ui\/svelte\/util\/(?:essenceIcons|essencePreviewRow|managerColorTokens)\.js$/,
      /^src\/utils\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
      // The shared bulk-delete card (issue 1132). It sits directly under `apps/manager/`, so it
      // falls through the `essences/` glob above exactly as the bulk-edit chrome falls through
      // the two browser globs, and the Essence Studio's own bulk-selection frame is where a
      // change to it is visible here.
      /^src\/ui\/svelte\/apps\/manager\/BulkDeleteCard\.svelte$/,
    ],
  },
  {
    id: 'manager-environments',
    label: 'Manager gathering environments',
    smokeLabels: ['manager-environments-browse-normal', 'manager-environments-browse-stacked', 'manager-environment-edit-placeholder'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/environment\//],
  },
  {
    id: 'manager-gathering-tasks',
    label: 'Manager gathering tasks',
    smokeLabels: ['manager-gathering-task-editor-normal', 'manager-gathering-task-editor-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/GatheringTasksBrowserView\.svelte$/],
  },
  {
    id: 'manager-gathering-events',
    label: 'Manager gathering events',
    smokeLabels: ['manager-gathering-events-normal', 'manager-gathering-event-editor-normal'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringEventEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/GatheringEventsBrowserView\.svelte$/],
  },
  toolStudioFrame('01-library-1280x720', 'Tool Studio — library parity', 'manager-tool-parity-01-library-1280x720', TOOL_STUDIO_MATCHES),
  toolStudioFrame('zero-state-empty-library-1280x720', 'Tool Studio — empty library zero state', 'manager-tool-zero-state-empty-library-1280x720', TOOL_STUDIO_MATCHES),
  toolStudioFrame('02-overview-1280x720', 'Tool Studio — Overview parity', 'manager-tool-parity-02-overview-1280x720', TOOL_STUDIO_MATCHES),
  toolStudioFrame('03-breakage-1280x720', 'Tool Studio — Breakage parity', 'manager-tool-parity-03-breakage-1280x720', TOOL_STUDIO_MATCHES),
  toolStudioFrame('04-requirements-1280x720', 'Tool Studio — Requirements parity', 'manager-tool-parity-04-requirements-1280x720', TOOL_STUDIO_MATCHES),
  toolStudioFrame('05-validation-1280x720', 'Tool Studio — all-pass Validation parity', 'manager-tool-parity-05-validation-1280x720', TOOL_STUDIO_MATCHES),
  toolStudioFrame('06-breakage-900x700', 'Tool Studio — 900px Breakage parity', 'manager-tool-parity-06-breakage-900x700', TOOL_STUDIO_MATCHES),
  toolStudioFrame('stress-long-name', 'Tool Studio stress — long display name', 'manager-tool-stress-long-name', TOOL_STUDIO_MATCHES),
  toolStudioFrame('stress-repair', 'Tool Studio stress — populated repair', 'manager-tool-stress-repair', TOOL_STUDIO_MATCHES),
  toolStudioFrame('stress-replacement', 'Tool Studio stress — replacement target', 'manager-tool-stress-replacement', TOOL_STUDIO_MATCHES),
  toolStudioFrame('stress-immune', 'Tool Studio stress — check-driven Immune', 'manager-tool-stress-immune', TOOL_STUDIO_MATCHES),
  toolStudioFrame('stress-invalid-validation', 'Tool Studio stress — failing Validation', 'manager-tool-stress-invalid-validation', TOOL_STUDIO_MATCHES),
  toolStudioFrame('stress-wrapping-680', 'Tool Studio stress — 680px wrapping', 'manager-tool-stress-wrapping-680', TOOL_STUDIO_MATCHES),
  worldNavigationFrame(
    'manager-system-travel-default-collapsed',
    'Manager Travel — default collapsed'
  ),
  worldNavigationFrame(
    'manager-system-travel-expanded-neutral',
    'Manager Travel — expanded neutral'
  ),
  worldNavigationFrame('manager-world-parties-normal', 'Manager World — Parties'),
  worldNavigationFrame('manager-system-travel-card-off', 'Manager Travel — card off'),
  worldNavigationFrame(
    'manager-system-travel-with-gathering-expanded',
    'Manager Travel — Gathering and Travel expanded'
  ),
  worldNavigationFrame('manager-system-travel-realms-normal', 'Manager Travel — Realms'),
  worldNavigationFrame(
    'manager-system-travel-realms-stacked',
    'Manager Travel — Realms stacked'
  ),
  worldNavigationFrame('manager-system-travel-map-normal', 'Manager Travel — Map'),
  worldNavigationFrame('manager-system-travel-map-stacked', 'Manager Travel — Map stacked'),
  worldNavigationFrame(
    'manager-system-travel-map-collapsed-rail',
    'Manager Travel — Map collapsed rail'
  ),
  {
    id: 'manager-recipes',
    label: 'Manager recipes',
    // `manager-recipes-no-check` photographs the row's "No check" WARNING pill. That is a
    // SYSTEM-level state (no authored `rollFormula`), so it is unreachable in the
    // routed-check smoke system however a recipe is authored — the harness switches system
    // through the rail's select to capture it.
    smokeLabels: ['manager-recipes-normal', 'manager-recipes-narrow', 'manager-recipes-no-check'],
    // The library inspector deliberately lives under `apps/manager/recipes/` and NOT
    // `apps/manager/recipe/` (issue 643): the latter is RECIPE_EDIT_MATCHES, so a
    // browser-side component placed there would republish the five recipe-EDITOR
    // frames and never the browser frame. See RECIPES_BROWSER_MATCHES, which this shares
    // with the three bulk-edit frames below; the only recipes-browser view with more than
    // one smoke label, so it cannot come from `recipesBrowserFrame`.
    matches: RECIPES_BROWSER_MATCHES,
  },
  // Issue 1010: the Recipe Studio's bulk-edit states — rows multi-selected, the shared selection
  // toolbar, and the rail's staged bulk panel in place of the single-recipe inspector. THREE
  // dedicated view ids, not extra labels on `manager-recipes`: `collect` publishes only
  // `candidates[0]` from a path-sorted list, so appending them there would publish
  // `manager-recipes-normal` forever and none of these states would ever reach a PR.
  //
  // The extra trigger on all three is the shared selection primitive, which renders on every row
  // AND inside the toolbar, plus the pure staging models behind the panel.
  recipesBrowserFrame(
    'manager-recipes-bulk-edit',
    'Manager recipes browser — bulk edit (multi-select, selection toolbar, every axis staged)',
    [/^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/, ...RECIPE_BULK_EDIT_MODEL_MATCHES],
  ),
  // The pristine draft is its own FRAME as well as its own view, because no one photograph holds
  // both faces of an axis: a segmented control cannot read `Unchanged` and `Enable` at once, and
  // the two check-tier sentinels (`— Leave unchanged —` and `Default DC`, which mean opposite
  // things) are only both visible while neither has been chosen.
  recipesBrowserFrame(
    'manager-recipes-bulk-edit-unstaged',
    'Manager recipes browser — bulk edit, pristine draft (three Unchanged segments, both check-tier sentinels, Apply inert)',
    [/^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/, ...RECIPE_BULK_EDIT_MODEL_MATCHES],
  ),
  // Acceptance criterion 6's frame: the pre-flight warning Callout over the rows the browser has
  // itself pilled `Can't enable`. It additionally names the projection and the predicate the
  // count is read from, because those are the files a regression would land in — the row pill and
  // the panel's count read ONE predicate, and this is the only frame that can show them agreeing.
  recipesBrowserFrame(
    'manager-recipes-bulk-edit-blocked',
    'Manager recipes browser — bulk edit, blocked-enable warning over the pilled rows it counts',
    [
      /^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/,
      ...RECIPE_BULK_EDIT_MODEL_MATCHES,
      /^src\/utils\/recipeBrowserModel\.js$/,
    ],
  ),
  // Issue 801: the grouped-category CONTINUATION frame for the recipe library. Phase 1 is
  // MODEL-ONLY — RecipesBrowserView.svelte is untouched — so `recipeBrowserModel.js` is the
  // SOLE changed file that maps a frame to this browser; its `matches` MUST name it or the
  // frame is silently stranded. Its own view id (one published frame per view id).
  {
    id: 'manager-recipes-grouped-continuation',
    label: 'Manager recipes browser — grouped category continued across a page boundary',
    smokeLabels: ['manager-recipes-grouped-continuation'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipesBrowserView\.svelte$/,
      /^src\/utils\/recipeBrowserModel\.js$/,
    ],
  },
  // Issue 806: the editor round-trip preservation frame. The fix persists the reset
  // sentinel (a `systemId` field) on the lifted browser state, so both the view file and
  // the state factory in `recipeBrowserModel.js` are load-bearing changed files that must
  // map a frame to this browser or it is silently stranded. Its own view id (one frame).
  {
    id: 'manager-recipes-editor-roundtrip',
    label: 'Manager recipes browser — category filter + collapsed group preserved across an editor round-trip (#806)',
    smokeLabels: ['manager-recipes-editor-roundtrip'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipesBrowserView\.svelte$/,
      /^src\/utils\/recipeBrowserModel\.js$/,
    ],
  },
  // Issue 877 turned the report from a raw-HTML DialogV2 into a Svelte modal, so the
  // rendering file is now `ImportReportModal.svelte` rather than the app shell's HTML
  // builder — and `ManagerModal.svelte`, the chrome BOTH import-flow modals render
  // through, changes this frame's appearance too. All four are load-bearing.
  {
    id: 'manager-import-report',
    label: 'Manager import — post-import unresolved-reference report (#492, #877)',
    smokeLabels: ['manager-import-report'],
    matches: [
      /^src\/ui\/SvelteCraftingSystemManagerApp\.svelte\.js$/,
      /^src\/systems\/importReportContent\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/ImportReportModal\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerModal\.svelte$/,
    ],
  },
  // Issue 771: folder-aware categorization mapping modal, shown before a folder /
  // whole-pack component drop commits. Its own single-frame view (collect publishes only
  // candidates[0] per id). Mapped to the mapping component AND the drop-path service file
  // that opens it, so a change to either republishes the frame — plus the shared modal
  // chrome it renders through since issue 877.
  {
    id: 'manager-import-folder-mapping',
    label: 'Manager import — folder-aware categorization mapping step (#771)',
    smokeLabels: ['manager-import-folder-mapping'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ImportFolderMappingModal\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerModal\.svelte$/,
      /^src\/ui\/SvelteCraftingSystemManagerApp\.svelte\.js$/,
    ],
  },
  // The gated Crafting nav group (issue 511) publishes three distinct frames — the
  // expanded group rail, the Books & Scrolls surface, and the Settings placeholder.
  // `collect` emits one file per recipe id, so each frame is its own recipe.
  {
    id: 'manager-crafting-group',
    label: 'Manager Crafting nav group (expanded: Settings + Recipes + Books & Scrolls)',
    smokeLabels: ['manager-crafting-group-expanded'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  {
    id: 'manager-books-scrolls',
    label: 'Manager Books & Scrolls recipe-item surface',
    smokeLabels: ['manager-books-scrolls-normal'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/],
  },
  // Issue 797: the recipe-item editor's Validation tab, brought to parity with the
  // recipe editor's Validation tab (summary card + count tiles + grouped bordered rows
  // with status pills). TWO dedicated view ids — one all-clear, one mixed-failing — each
  // its own single-frame view: `collect` publishes only `candidates[0]` from a
  // filename-sorted list, so appending both labels to one view would drop one of the
  // evidence frames. Both match the validation tab file AND the editor shell that hosts
  // it, so a change to either republishes the pair.
  {
    id: 'manager-recipe-item-validation',
    label: 'Manager recipe-item editor — Validation tab (all clear)',
    smokeLabels: ['manager-recipe-item-validation'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\/RecipeItemValidationTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RecipeItemEditor\.svelte$/,
    ],
  },
  {
    id: 'manager-recipe-item-validation-blocked',
    label: 'Manager recipe-item editor — Validation tab (mixed pass/block, cannot be used)',
    smokeLabels: ['manager-recipe-item-validation-blocked'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/recipe-item\/RecipeItemValidationTab\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/RecipeItemEditor\.svelte$/,
    ],
  },
  // Issue 785: the GM Knowledge surface. TWO view ids sharing one `matches` list —
  // `collect` publishes only `candidates[0]` from a filename-sorted list, so the armed
  // Delete frame cannot be an extra `smokeLabels` entry on the main view (the un-armed
  // owned-copies frame has the lower capture counter and would win forever). The shared
  // `KNOWLEDGE_MATCHES` const is what keeps the pair from reading as two near-identical
  // literals to SonarCloud's duplication gate.
  {
    id: 'manager-knowledge',
    label: 'Manager Knowledge surface (roster, owned copies, learned recipes, narrow)',
    smokeLabels: [
      'manager-knowledge-owned-copies',
      'manager-knowledge-empty-tab',
      'manager-knowledge-learned-lost-copy',
      'manager-knowledge-party-pool-warning',
      'manager-knowledge-narrow',
    ],
    matches: KNOWLEDGE_MATCHES,
  },
  {
    id: 'manager-knowledge-delete-armed',
    label: 'Manager Knowledge surface — Delete armed to "Confirm?" beside un-armed rows',
    smokeLabels: ['manager-knowledge-delete-armed'],
    matches: KNOWLEDGE_MATCHES,
  },
  {
    id: 'manager-crafting-settings',
    label: 'Manager Crafting → Settings placeholder',
    smokeLabels: ['manager-crafting-settings'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  // Issue 752: the Crafting → Settings surface of an ALCHEMY-mode system (evidence
  // for #736's #713 half). The surface is CraftingSettingsView, whose alchemy
  // relabel is the load-bearing content, so a change to it republishes this frame.
  {
    id: 'manager-alchemy-settings',
    label: 'Manager Crafting → Settings for an alchemy-mode system',
    smokeLabels: ['manager-alchemy-settings'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSettingsView\.svelte$/],
  },
  // Issue 752: the selected-system rail with experimental features DISABLED
  // (evidence for #746 — crafting group unconditional, graph absent). The rail is
  // owned by CraftingSystemManagerRoot, so a change to it republishes this frame.
  {
    id: 'manager-experimental-off',
    label: 'Manager rail — experimental features disabled',
    smokeLabels: ['manager-experimental-off'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  // The recipe editor publishes twelve distinct frames (overview/identity, ingredients,
  // validation tab, multi-step durations, the four Results-tab modes — routed-by-check,
  // multi-step, progressive, alchemy — tools, the restricted-visibility Access tab, and
  // the Books & Scrolls tab body). `collect` emits ONE file per recipe id (it takes the
  // first matching smoke label), so each frame needs its own recipe — a single recipe
  // with twelve smoke labels would only ever publish the first (overview) frame and
  // silently drop the rest. All twelve share the same `matches`, so any change to a recipe
  // editor/inspector or recipe sub-component republishes them together.
  recipeEditFrame('manager-recipe-edit-normal', 'Manager recipe editor — overview / identity'),
  recipeEditFrame('manager-recipe-edit-ingredients', 'Manager recipe editor — ingredients (components, OR groups, tags)'),
  // Issue 684: the essence + currency-cost rows sit below the fold of the ingredients
  // frame above, so they get their OWN scrolled frame (the harness scrolls the last
  // currency-cost row into view before capturing). Its own recipe-edit view id so
  // `collect` publishes it as a distinct frame; the caption owns ONLY the two rows the
  // frame actually shows.
  recipeEditFrame('manager-recipe-edit-ingredients-cost', 'Manager recipe editor — ingredients scrolled to essence + currency-cost rows (with steppers)'),
  recipeEditFrame('manager-recipe-edit-validation', 'Manager recipe editor — validation tab'),
  recipeEditFrame('manager-recipe-edit-multistep', 'Manager recipe editor — multi-step durations'),
  recipeEditFrame('manager-recipe-edit-results', 'Manager recipe editor — results (routed-by-check outcome sets)'),
  recipeEditFrame('manager-recipe-edit-results-multistep', 'Manager recipe editor — results (per-step content, multi-step)'),
  // Multi-step visibility gating (issue 710). The disable-confirm frame is the system
  // settings view whose multi-step feature tile opens the confirm dialog (SystemEditView
  // renders the tile; the adminStore toggle/confirm gate drives it — but adminStore is
  // deliberately logic-only in this map, covered by the generic fallback, so the render
  // file is the trigger). The collapsed-editor frame is the RecipeOverviewTab/
  // RecipeEditView collapse presentation, covered by the recipe-edit glob.
  {
    id: 'manager-multistep-disable-confirm',
    label: 'Manager system settings — disable multi-step recipes confirm',
    smokeLabels: ['manager-multistep-disable-confirm'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/],
  },
  recipeEditFrame('manager-recipe-edit-collapsed', 'Manager recipe editor — collapsed multi-step (feature off)'),
  recipeEditFrame('manager-recipe-edit-results-progressive', 'Manager recipe editor — results (progressive ordered stages)'),
  recipeEditFrame('manager-recipe-edit-results-alchemy', 'Manager recipe editor — results (alchemy two-slot success/reserved-failure)'),
  toolStudioFrame('manager-recipe-edit-tools', 'Manager recipe editor — tools and bonus modes', 'manager-recipe-edit-tools', [
    /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
    /^src\/ui\/svelte\/apps\/manager\/recipe\/RecipeTools(?:Tab|Section)\.svelte$/,
  ]),
  // The Access tab is MODE-CONDITIONAL (issue 676 rehomed it from the deleted context
  // rail). Every other recipe frame is captured against a system whose visibility mode
  // drives the Books & Scrolls branch, so without this frame the restricted (access)
  // branch would ship with no screenshot evidence at all. The frame ID keeps its
  // `-access-rail` suffix: it is a stable identifier the published S3 keys and the
  // smoke labels share, and renaming it would orphan existing evidence for no gain.
  recipeEditFrame('manager-recipe-edit-access-rail', 'Manager recipe editor — restricted-visibility Access tab (players and characters with access)'),
  // The Books & Scrolls tab body (issue 796). Its own dedicated frame because `collect`
  // publishes only `candidates[0]` per view id, so without a view mapped to this smoke
  // label the linked-book grid fix would never reach a PR — the sibling recipe-edit frames
  // capture other tabs. This frame proves the tab body tiles into an auto-fill grid filling
  // the panel rather than the old ~half-width capped column.
  recipeEditFrame('manager-recipe-edit-books-scrolls', 'Manager recipe editor — Books & Scrolls tab (linked-book grid fills the panel)'),
  {
    id: 'player-gathering',
    label: 'Player gathering tab',
    smokeLabels: [
      'player-gathering-environments',
      'player-gathering-events',
      'player-gathering-task-ready',
      'player-gathering-after-success',
      'player-gathering-tool-blocked',
      'player-gathering-timed-ready',
      'player-gathering-timed-active',
      'player-gathering-blind',
    ],
    matches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-realm-locked',
    label: 'Player gathering — realm-locked environment',
    smokeLabels: ['player-gathering-realm-locked'],
    matches: [/^src\/ui\/svelte\/apps\/gathering\//],
  },
  {
    id: 'player-gathering-stacked',
    label: 'Player gathering — narrow window stacked columns (#330)',
    smokeLabels: ['player-gathering-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/gathering\//, /^src\/ui\/SvelteFabricateApp\.svelte\.js$/],
  },
  {
    id: 'player-crafting',
    label: 'Player crafting tab',
    // `player-crafting-alternatives` (issue 552, the IngredientOptionSelector
    // "Alternatives" radiogroup) is listed first and also sorts alphabetically
    // ahead of the other frames, so `collect` (which copies the first candidate
    // after an alphabetical sort) prefers it — surfacing the per-slot option
    // selector as the primary evidence for a change under crafting/.
    smokeLabels: [
      'player-crafting-alternatives',
      'player-crafting-simple',
      'player-crafting-ingredient-routed',
      'player-crafting-routed-by-check',
      'player-crafting-run-summary',
    ],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
  {
    id: 'player-crafting-roll-prompt',
    label: 'Player crafting — interactive check roll prompt',
    // Issue 855: `rollPrompt.js` renders the whole dialog, so a change to it is only
    // evidenced by the dialog frame itself. The broader `player-crafting` recipe above
    // also matches this path, but its labels all show the crafting tab BEHIND the
    // prompt — publishing one of those would be a frame that does not show the change.
    smokeLabels: ['player-crafting-roll-prompt'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\/rollPrompt\.js$/],
  },
  {
    id: 'player-crafting-essence-legacy',
    label: 'Player crafting — legacy set-level essence authored icon',
    smokeLabels: ['player-crafting-essence-legacy'],
    matches: [
      /^src\/ui\/svelte\/apps\/crafting\/CraftingEssenceThumb\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/detail\/IoTable\.svelte$/,
    ],
  },
  {
    id: 'player-crafting-essence-ingredient',
    label: 'Player crafting — first-class essence ingredient authored icon',
    smokeLabels: ['player-crafting-essence-ingredient'],
    matches: [
      /^src\/ui\/svelte\/apps\/crafting\/CraftingEssenceThumb\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/detail\/IoTable\.svelte$/,
    ],
  },
  {
    id: 'player-crafting-essence-alternative',
    label: 'Player crafting — essence OR-alternative authored icon',
    smokeLabels: ['player-crafting-essence-alternative'],
    matches: [
      /^src\/ui\/svelte\/apps\/crafting\/CraftingEssenceThumb\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/detail\/IngredientOptionSelector\.svelte$/,
    ],
  },
  {
    id: 'player-crafting-essence-shopping',
    label: 'Player crafting — Shopping List essence shortage authored icon',
    smokeLabels: ['player-crafting-essence-shopping'],
    matches: [
      /^src\/ui\/svelte\/apps\/crafting\/CraftingEssenceThumb\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/ShoppingList\.svelte$/,
    ],
  },
  {
    id: 'player-crafting-stacked',
    label: 'Player crafting — narrow window stacked columns',
    smokeLabels: ['player-crafting-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//, /^src\/ui\/SvelteFabricateApp\.svelte\.js$/],
  },
  // Issue 752: the roll-result box (awarded pills + outcome) after a craft
  // (evidence for #727's pill fix). Scoped to the crafting DETAIL sources
  // (RollResultBox lives there) so it does not collide with the broad
  // player-crafting glob's ordinary states — a detail change maps to BOTH.
  {
    id: 'player-crafting-roll-result',
    label: 'Player crafting — roll-result box (awarded pills + outcome)',
    smokeLabels: ['player-crafting-roll-result'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\/detail\//],
  },
  // The progressive player stage list (issue 651). `collect` emits ONE file per view id
  // (see below), so each state is its own view — a single `player-crafting` entry would
  // publish only one frame and the other states would never reach the PR.
  {
    id: 'player-crafting-progressive',
    label: 'Player crafting — progressive stage list, reorder allowed (default)',
    smokeLabels: ['player-crafting-progressive'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
  {
    // Its OWN view, not a preferred label on the resting one. `collect` picks
    // `candidates[0]` from an array sorted by FILENAME — it does NOT honour smokeLabels
    // order — so listing this first alongside `player-crafting-progressive` silently
    // published the resting frame instead (its screenshot index sorts lower). Verified by
    // hash against the collected file.
    //
    // This is the frame the checks actually need. At rest the stored order is empty, so
    // `applyPlayerResultOrder` returns by identity, the store short-circuits, and the
    // authored thresholds ascend BY CONSTRUCTION — they would ascend with the
    // carried-threshold defect fully reverted. `orderAnnouncement` is likewise `''`, so
    // the live region is invisible whatever the CSS says. Only after a move do the
    // thresholds have to have been recomputed and the region have text to hide.
    id: 'player-crafting-progressive-reordered',
    label: 'Player crafting — progressive stage list after a keyboard reorder (thresholds recomputed)',
    smokeLabels: ['player-crafting-progressive-reordered'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
  {
    id: 'player-crafting-progressive-fixed',
    label: 'Player crafting — progressive stage list, order fixed by the GM',
    smokeLabels: ['player-crafting-progressive-fixed'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
  {
    id: 'player-crafting-progressive-stacked',
    label: 'Player crafting — progressive stage list, narrow window',
    smokeLabels: ['player-crafting-progressive-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//, /^src\/ui\/SvelteFabricateApp\.svelte\.js$/],
  },
  // The explicit multi-step simple recipe detail (issue 765): per-step material blocks,
  // the multi-step hint strip, one terminal PRODUCES row, and no check card. Its OWN
  // view — `collect` emits one file per view id, so this reaches the PR as a distinct
  // frame proving the step-aware projection rather than folding into the resting simple
  // frame (which shows a single-step recipe).
  {
    id: 'player-crafting-multistep',
    label: 'Player crafting — explicit multi-step simple recipe detail',
    smokeLabels: ['player-crafting-multistep'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
  // The requirement-rail redesign (issue 917). SIX dedicated view ids, not extra labels
  // on `player-crafting`: `collect` emits one file per view id and picks `candidates[0]`
  // from a FILENAME sort, so appending them to the broad entry would publish one
  // arbitrary frame forever and every state below — which is the whole change — would
  // never reach the PR. Each names a distinct rendered state no other frame can hold.
  requirementRailFrame(
    'player-crafting-slot-rail',
    'Player crafting — requirement rail: met fixed slot, unchosen choice slot (accent), short essence slot',
  ),
  requirementRailFrame(
    'player-crafting-tag-unmatched',
    'Player crafting — tag requirement with nothing matching: fallback glyph, never the item bag',
  ),
  requirementRailFrame(
    'player-crafting-essence-pool',
    'Player crafting — essence pool: one requirement, player-allocated partial funding, selection recap',
  ),
  requirementRailFrame(
    'player-crafting-pick-for-me',
    'Player crafting — after "Pick for me": the resolver’s suggested allocation applied',
  ),
  requirementRailFrame(
    'player-crafting-essence-pool-shared',
    'Player crafting — shared essence pool: two requirements funded jointly from one dual carrier',
  ),
  requirementRailFrame(
    'player-crafting-consumption-plan',
    'Player crafting — consumption plan: fixed row, essence-carrier row, and the still-to-choose line',
  ),
  // The player Alchemy workbench (issue 543) publishes three distinct frames — the
  // discipline chooser, the three-column workbench, and the narrow stacked layout.
  // `collect` emits one file per view id (first matching smoke label wins), so each
  // frame is its own view. (The `player-alchemy-theme-*` frames are extra evidence
  // and are intentionally NOT mapped here, like the `manager-theme-*` frames.)
  {
    id: 'player-alchemy',
    label: 'Player alchemy workbench',
    smokeLabels: ['player-alchemy-workbench'],
    matches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  },
  {
    id: 'player-alchemy-chooser',
    label: 'Player alchemy — discipline chooser',
    smokeLabels: ['player-alchemy-chooser'],
    matches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  },
  {
    id: 'player-alchemy-stacked',
    label: 'Player alchemy — narrow window stacked columns',
    smokeLabels: ['player-alchemy-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/alchemy\//, /^src\/ui\/SvelteFabricateApp\.svelte\.js$/],
  },
  {
    id: 'fabricate-journal',
    label: 'Player Journal tab',
    smokeLabels: ['fabricate-journal'],
    matches: [/^src\/ui\/svelte\/apps\/journal\//],
  },
  // Issue 752: the Journal with a CRAFTING history run selected so the run-detail
  // requirements card (RunDetail + StepDetails) is visible (evidence for #748, and
  // future #738). Its OWN recipe — `collect` emits one file per recipe id, so a
  // shared label on fabricate-journal would publish only one frame. Any journal
  // detail change republishes both frames.
  {
    id: 'fabricate-journal-craft-detail',
    label: 'Player Journal — crafting run detail (requirements card)',
    smokeLabels: ['fabricate-journal-craft-detail'],
    matches: [/^src\/ui\/svelte\/apps\/journal\//],
  },
  {
    id: 'player-inventory',
    label: 'Player Inventory tab',
    smokeLabels: ['player-inventory'],
    matches: [/^src\/ui\/svelte\/apps\/inventory\//],
  },
  // The player salvage surface (issue 675). Deliberately NARROW — the salvage tree and
  // its panel only, NOT `apps/inventory/**`. A broad glob would return two ids for an
  // ordinary inventory file, breaking the exact-equality mapping test above, and would
  // force a salvage frame onto every future unrelated inventory touch. A salvage file
  // legitimately maps to BOTH recipes: it is an inventory change and a salvage change.
  {
    id: 'player-salvage',
    label: 'Player salvage panel',
    // TWO frames, because neither can stand in for the other: the PROGRESSIVE body (the
    // reorderable stage list — the headline feature) and the NO-CHECK body (Smoke
    // Relic's real shape, and the shape most real worlds have).
    smokeLabels: ['player-salvage', 'player-salvage-no-check'],
    matches: [
      /^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\//,
      /^src\/ui\/svelte\/apps\/inventory\/detail\/InventorySalvagePanel\.svelte$/,
    ],
  },
  {
    // Issue 764: the GM-facing Simple-mode MISCONFIGURED salvage cue — the
    // `SalvageMisconfiguredBody` with Simple-specific copy and the mode banner suppressed,
    // for a stored multi-success-group Simple config. Narrowly matched to the misconfigured
    // body ONLY, so the two `player-salvage` deep-equality assertions (which test
    // `SalvageSimpleBody`/`InventorySalvagePanel`) are unaffected.
    id: 'player-salvage-misconfigured',
    label: 'Player salvage panel — Simple misconfigured cue (GM inventory)',
    smokeLabels: ['player-salvage-misconfigured'],
    matches: [/^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/SalvageMisconfiguredBody\.svelte$/],
  },
  {
    // Issue 777: the pre-roll required-tools disclosure — the `SalvageToolRequirements`
    // section with one AVAILABLE (green) and one UNAVAILABLE (red) StatusPill row, the
    // state the existing player-salvage capture walk cannot reach. Its OWN view (one file
    // per view id) so `collect` publishes the dedicated frame; appending its label to the
    // existing `player-salvage` view would never publish it. Narrowly matched to the tool
    // requirements section ONLY, so the two `player-salvage` deep-equality assertions are
    // unaffected.
    id: 'player-salvage-tools',
    label: 'Player salvage panel — required-tools disclosure',
    smokeLabels: ['player-salvage-tools'],
    matches: [/^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/SalvageToolRequirements\.svelte$/],
  },
  {
    // Issue 766: the one-card-per-unified-physical-stack collapse — a single card for a
    // stack registered in two crafting systems, carrying the role=radiogroup System
    // selector that re-scopes the whole detail body. Its OWN view (one file per view id)
    // so `collect` publishes the dedicated frame; the frame the existing player-inventory
    // capture walk (a single-system selection) cannot reach. Narrowly matched to the new
    // selector component ONLY, so the `player-inventory` deep-equality assertions above are
    // unaffected (it still ALSO maps to player-inventory via the broad inventory glob).
    id: 'player-inventory-multi-system',
    label: 'Player Inventory tab — multi-system collapsed card + system selector',
    smokeLabels: ['player-inventory-multi-system'],
    matches: [/^src\/ui\/svelte\/apps\/inventory\/detail\/InventorySystemSelector\.svelte$/],
  },
  {
    id: 'fabricate-app-shell',
    label: 'Shared Fabricate app shell',
    smokeLabels: ['fabricate-app-shell'],
    matches: [/^src\/ui\/SvelteFabricateApp\.svelte\.js$/, /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/],
  },
  // Issue 752: the crafting result card posted to chat after a craft (evidence for
  // #727's roll-total fix). The card markup is built in CraftingChatCard.js and
  // shared with SalvageChatCard.js — both live under src/systems (not a UI render
  // path), so this frame is collected for a PR touching them even though the
  // screenshot gate itself only trips on src/ui/styles/svelte/css changes.
  {
    id: 'chat-craft-card',
    label: 'Chat — crafting result card',
    smokeLabels: ['chat-craft-card'],
    matches: [
      /^src\/systems\/CraftingChatCard\.js$/,
      /^src\/systems\/SalvageChatCard\.js$/,
    ],
  },
  {
    id: 'interactable-config',
    label: 'Canvas interactable config',
    smokeLabels: ['interactable-config-linked', 'interactable-config-unlinked'],
    matches: [
      /^src\/ui\/svelte\/apps\/InteractableConfigRoot\.svelte$/,
      /^src\/ui\/InteractableConfigApp\.svelte\.js$/,
    ],
  },
  // The source/identity section (issue 342) publishes TWO distinct frames (the
  // unconfigured "Needs configuration" state + the configured re-target picker).
  // `collect` emits ONE file per recipe id, so each frame needs its own recipe.
  {
    id: 'interactable-config-needs-configuration',
    label: 'Canvas interactable config — unconfigured "Needs configuration" state (#342)',
    smokeLabels: ['interactable-config-needs-configuration'],
    matches: [
      /^src\/ui\/svelte\/apps\/InteractableConfigRoot\.svelte$/,
      /^src\/ui\/InteractableConfigApp\.svelte\.js$/,
      /^src\/ui\/interactableSourceLibrary\.js$/,
    ],
  },
  {
    id: 'interactable-config-source-configured',
    label: 'Canvas interactable config — configured source/identity section (#342)',
    smokeLabels: ['interactable-config-source-configured'],
    matches: [
      /^src\/ui\/svelte\/apps\/InteractableConfigRoot\.svelte$/,
      /^src\/ui\/InteractableConfigApp\.svelte\.js$/,
      /^src\/ui\/interactableSourceLibrary\.js$/,
    ],
  },
  // The Manage Interactables panel publishes THREE distinct frames (populated
  // list, expanded promote form, dedicated empty state). `collect` emits ONE
  // file per recipe id (it takes the first matching smoke label), so each frame
  // needs its own recipe — a single recipe with three smoke labels would only
  // ever publish the first (list) frame and silently drop promote + empty. The
  // three share the same `matches` so any change to the panel surface republishes
  // all three together.
  {
    id: 'interactables-manager-list',
    label: 'Canvas Manage Interactables panel — populated list',
    smokeLabels: ['interactables-manager-list'],
    matches: [
      /^src\/ui\/svelte\/apps\/interactables\/InteractablesManagerRoot\.svelte$/,
      /^src\/ui\/InteractablesManagerApp\.svelte\.js$/,
      /^src\/ui\/interactableSourceLibrary\.js$/,
    ],
  },
  {
    id: 'interactables-manager-promote',
    label: 'Canvas Manage Interactables panel — promote region flow',
    smokeLabels: ['interactables-manager-promote'],
    matches: [
      /^src\/ui\/svelte\/apps\/interactables\/InteractablesManagerRoot\.svelte$/,
      /^src\/ui\/InteractablesManagerApp\.svelte\.js$/,
      /^src\/ui\/interactableSourceLibrary\.js$/,
    ],
  },
  {
    id: 'interactables-manager-empty',
    label: 'Canvas Manage Interactables panel — empty state',
    smokeLabels: ['interactables-manager-empty'],
    matches: [
      /^src\/ui\/svelte\/apps\/interactables\/InteractablesManagerRoot\.svelte$/,
      /^src\/ui\/InteractablesManagerApp\.svelte\.js$/,
      /^src\/ui\/interactableSourceLibrary\.js$/,
    ],
  },
  {
    // The minimal core-window set for a change that can regress ANY surface: the global
    // stylesheet, a theme block, or the manager router that hosts every manager view.
    //
    // Chosen to sample every app-AREA shell rather than to enumerate screens, because
    // `styles/fabricate.css` is namespaced per area and its Foundry-override blocks
    // (button height/alignment, focus rings) are written per area class — so a
    // regression in one area is invisible in another. Rule counts in that file, which
    // are a fair proxy for blast radius: `.fabricate-manager` ~2694,
    // `.fabricate-interactables-manager` ~41, `.fabricate-app` ~18.
    //
    // 1 `manager-default-selection`   — `.fabricate-manager` shell: window chrome, rail,
    //                                   and the crafting-system library rows.
    // 2 `manager-components-normal`   — the densest row/chip/grid library; a bare
    //                                   generic selector leaking out of a `.fabricate*`
    //                                   root shows up here first (it is what broke the
    //                                   dnd5e Armor Class badge).
    // 3 `manager-gathering-task-editor-normal`
    //                                 — the EDITOR archetype (fields, tabs, validation),
    //                                   structurally unlike a browser, so it catches
    //                                   button/field/focus-ring regressions a library
    //                                   frame cannot.
    // 4 `player-crafting-simple`      — `.fabricate-app`, the player-facing crafting
    //                                   window. The previous set was manager-only, so a
    //                                   global change got NO player-app verification.
    // 5 `player-inventory`            — the second `.fabricate-app` archetype
    //                                   (list/detail + scroll), cheap once phase E runs.
    // 6 `interactables-manager-list`  — `.fabricate-interactables-manager`, its own
    //                                   window and the second-largest rule block.
    //
    // Deliberately NOT included: the chat-card and roll-prompt surfaces
    // (`.fabricate-craft-chat`, `.fabricate-gather-chat`, `.fabricate-roll-prompt`) are
    // small, simple and low-rule-count; and the rail frames, which already have their
    // own `styles/` recipes and would duplicate. Adding a screen here costs every
    // global change, so additions want the same blast-radius argument.
    //
    // 4 and 5 are phase-E labels, so a scoped global run now needs phase E as well as
    // D0. That is a deliberate cost: the old D0-only set was cheaper precisely because
    // it never looked at the player app.
    id: 'theme-or-global-ui',
    label: 'Global UI styling or theme',
    smokeLabels: [
      'manager-default-selection',
      'manager-components-normal',
      'manager-gathering-task-editor-normal',
      'player-crafting-simple',
      'player-inventory',
      'interactables-manager-list',
    ],
    matches: [
      /^styles\//,
      /\.css$/,
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
    ],
  },
]);

export function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isUiFile(filePath) {
  const normalized = normalizePath(filePath);
  // `lang/` is deliberately excluded: a localization file is not itself a UI
  // render target. No view recipe matches a `lang/` path, so a lang change only
  // ever contributed UI status via the generic `theme-or-global-ui` fallback.
  // By dropping `lang/` here we get co-occurrence semantics for free: a lang-only
  // PR is not UI, while a lang change shipped alongside a render file
  // (`src/ui/`, `styles/`, `*.svelte`, `*.css`) is still UI because that render
  // file independently trips the gate and drives the recipe mapping.
  return normalized.startsWith('src/ui/')
    || normalized.startsWith('styles/')
    || normalized.endsWith('.svelte')
    || normalized.endsWith('.css');
}

export function hasUiChanges(files = []) {
  return files.some(isUiFile);
}

export function mapChangedFilesToViews(files = []) {
  const normalizedFiles = files.map(normalizePath).filter(Boolean);
  const matched = [];
  for (const recipe of VIEW_RECIPES) {
    if (normalizedFiles.some(file => recipe.matches.some(pattern => pattern.test(file)))) {
      matched.push(recipe);
    }
  }
  if (matched.length === 0 && normalizedFiles.some(isUiFile)) {
    matched.push(VIEW_RECIPES.find(recipe => recipe.id === 'theme-or-global-ui'));
  }
  return matched.filter(Boolean);
}

// The flat, de-duplicated list of smoke labels the views a PR's changed files affect
// map to — the EXACT target set the scoped `screenshots` capture profile
// (`scripts/foundry-test-run.mjs`, issue #826) should capture. This is the same
// `mapChangedFilesToViews` lookup `collect`/`publish` consume, so the captured set and
// the collected set stay in lockstep.
export function smokeLabelsForChangedFiles(files = []) {
  const labels = [];
  for (const view of mapChangedFilesToViews(files)) {
    for (const label of view.smokeLabels) {
      if (!labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}

// A UI PR satisfies the screenshot check when its body has a "Screenshots"
// heading (any ATX level — typically `##`) whose section contains at least one
// image. Images may be markdown (`![alt](url)`) or HTML (`<img ... src=...>`);
// GitHub drag-and-drop attachment URLs carry no file extension, so the image
// syntax itself — not the URL shape — is the signal. The section runs from the
// heading to the next heading of the same or higher level (or end of body).
export function hasScreenshotEvidence(body = '') {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (!heading || !/^screenshots?\b/i.test(heading[2].trim())) continue;
    const level = heading[1].length;
    let section = '';
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].match(/^(#{1,6})\s/);
      if (next && next[1].length <= level) break;
      section += `${lines[j]}\n`;
    }
    if (containsImage(section)) return true;
  }
  return false;
}

function containsImage(text) {
  return /!\[[^\]]*\]\([^)]+\)/.test(text) || /<img\b[^>]*\bsrc\s*=/i.test(text);
}

export function validateChangedFilesForCheck(changedFiles = [], { required = false } = {}) {
  if (required && changedFiles.length === 0) {
    return 'Changed-files input is empty; cannot determine whether this PR changes UI files.';
  }
  return '';
}

export function explainScreenshotEvidenceFailure(files = [], body = '', options = {}) {
  if (!hasUiChanges(files)) return null;
  if (hasScreenshotEvidence(body)) return null;
  const exemptLabel = options.exemptLabel || DEFAULT_EXEMPT_LABEL;
  const views = mapChangedFilesToViews(files).map(recipe => recipe.label).join(', ') || 'changed UI views';
  return `This PR changes UI files (${views}) but its description has no Screenshots section with an image. Add a "## Screenshots" heading to the PR body and embed at least one screenshot of the affected view(s) beneath it — drag-and-drop an image into the GitHub editor, or paste markdown (![alt](url)) or <img> markup. If a screenshot is genuinely impossible, a maintainer must add the '${exemptLabel}' label (it cannot be self-applied by an agent).`;
}

export function collectScreenshotEvidence({
  changedFiles = [],
  prNumber,
  sourceDir = 'test-results',
  outputDir,
  allowMissing = false,
  headSha,
  root = ROOT,
} = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'collect');
  const views = mapChangedFilesToViews(changedFiles);
  const sourceRoot = resolve(root, sourceDir);
  const destinationRoot = resolve(root, outputDir || `tmp/pr-screenshots/${normalizedPrNumber}`);
  const copied = [];
  const missing = [];
  const allImages = existsSync(sourceRoot) ? listImages(sourceRoot).sort((a, b) => a.localeCompare(b)) : [];
  const runEvidence = views.length > 0
    ? validateScreenshotRunEvidence({ sourceRoot, views, headSha })
    : null;

  mkdirSync(destinationRoot, { recursive: true });
  for (const view of views) {
    const candidates = allImages.filter(file => view.smokeLabels.some(label => matchesSmokeLabel(file, label)));
    if (candidates.length === 0) {
      missing.push(view);
      continue;
    }
    if (isToolStudioView(view) && candidates.length !== 1) {
      throw new Error(`Duplicate Tool Studio screenshot evidence for ${view.id}: ${candidates.length} candidates`);
    }
    const source = candidates[0];
    validateScreenshotCapture(view, source, runEvidence);
    const destination = join(destinationRoot, `${view.id}${extensionOf(source)}`);
    copyFileSync(source, destination);
    copied.push({ view, source, destination });
  }

  if (missing.length && !allowMissing) {
    const labels = missing.map(view => `${view.id} (${view.smokeLabels.join(', ') || 'no smoke labels configured'})`).join(', ');
    throw new Error(`Missing smoke screenshots for ${labels} in ${relative(root, sourceRoot)}`);
  }

  return { views, copied, missing, destinationRoot };
}

function isToolStudioView(view) {
  return view.matches === TOOL_STUDIO_MATCHES;
}

const TOOL_PARITY_DIMENSIONS = new Map([
  ['01-library-1280x720', [1212, 682]],
  ['zero-state-empty-library-1280x720', [1212, 682]],
  ['02-overview-1280x720', [1212, 682]],
  ['03-breakage-1280x720', [1212, 682]],
  ['04-requirements-1280x720', [1212, 682]],
  ['05-validation-1280x720', [1212, 682]],
  ['06-breakage-900x700', [832, 662]],
]);
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

function readJsonEvidence(path, label) {
  if (!existsSync(path)) throw new Error(`Missing ${label}: ${relative(ROOT, path)}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error.message}`);
  }
}

function validateScreenshotRunEvidence({ sourceRoot, views, headSha }) {
  const summary = readJsonEvidence(join(sourceRoot, 'summary.json'), 'smoke summary');
  const manifest = readJsonEvidence(
    join(sourceRoot, 'screenshot-manifest.json'),
    'screenshot manifest'
  );
  // The five evidence conditions. `!==` and not `> 0`/truthiness on purpose: a summary
  // MISSING `stepFailures` entirely (a stale or truncated artifact) must refuse, and `>
  // 0` would accept it and open the gate. `explainSmokeSummaryRefusal` re-derives which
  // of the five tripped, using these same comparisons, and its own suite asserts the
  // named set equals the tripped set over all 31 combinations.
  if (
    summary.passed !== true ||
    summary.stepFailures !== 0 ||
    summary.consoleErrorCount !== 0 ||
    summary.degraded !== false ||
    summary.rendererCrashed !== false
  ) {
    throw new Error(explainSmokeSummaryRefusal(summary));
  }
  const summaryRun = summary.screenshotRun || {};
  if (!summaryRun.runId || summaryRun.runId !== manifest.runId) {
    throw new Error('Screenshot summary and manifest do not share one run identity');
  }
  const expectedHead = normalizeHeadShaSegment(headSha);
  if (!expectedHead || summaryRun.headSha !== expectedHead || manifest.headSha !== expectedHead) {
    throw new Error('Screenshot evidence is stale for the requested PR head SHA');
  }
  // DEDUPED, because the run records a SET of target labels while a label may belong
  // to more than one view recipe (`manager-default-selection` is in both the systems
  // view and the theme-or-global-ui fallback). Comparing a raw flatMap against the
  // run's deduped set made this check fail for every change whose file set matched
  // two views sharing a label — i.e. the documented
  // `test:foundry:screenshots --target-labels=$(screenshots:ui:targets)` -> `collect`
  // workflow was unrunnable there, since `targets` dedupes and this side did not.
  const expectedLabels = [...new Set(views.flatMap((view) => view.smokeLabels))].sort((a, b) =>
    a.localeCompare(b)
  );
  const summaryLabels = [...(summaryRun.targetLabels || [])].sort((a, b) => a.localeCompare(b));
  const manifestLabels = [...(manifest.targetLabels || [])].sort((a, b) => a.localeCompare(b));
  if (
    JSON.stringify(summaryLabels) !== JSON.stringify(expectedLabels) ||
    JSON.stringify(manifestLabels) !== JSON.stringify(expectedLabels)
  ) {
    throw new Error('Screenshot evidence belongs to another target-label set');
  }
  return { manifest, capturesByFile: new Map((manifest.captures || []).map((entry) => [entry.file, entry])) };
}

function validateScreenshotCapture(view, source, evidence) {
  const file = basename(source);
  const capture = evidence.capturesByFile.get(file);
  if (isToolStudioView(view) && TOOL_PARITY_DIMENSIONS.has(view.id) && capture?.label?.includes('stress')) {
    throw new Error(`Stress evidence cannot substitute for Tool Studio parity frame ${view.id}`);
  }
  if (!capture || !view.smokeLabels.includes(capture.label)) {
    throw new Error(`Screenshot manifest does not bind ${file} to ${view.id}`);
  }
  const actual = readPngDimensions(view, source);
  if (isToolStudioView(view)) validateToolStudioCaptureRules(view, capture, actual);
  // The manifest records geometry ONLY for a clipped capture: `screenshot()` writes
  // `options.clip?.width ?? null`, so an unclipped full-page frame declares null. This
  // cross-check exists to catch a frame that disagrees with the clip it claims, so it
  // is meaningless — and was unconditionally fatal — when nothing was declared. Reading
  // real pixels and comparing them to null failed every non-clipped view, which is most
  // of them. `readPngDimensions` still runs above, so a corrupt or zero-sized PNG is
  // rejected for every view regardless.
  const declaresGeometry = capture.width != null && capture.height != null;
  if (declaresGeometry && (actual.width !== capture.width || actual.height !== capture.height)) {
    throw new Error(
      `PNG dimensions do not match its manifest for ${view.id}: ` +
      `${actual.width}x${actual.height} actual; ${capture.width}x${capture.height} declared`
    );
  }
}

function validateToolStudioCaptureRules(view, capture, actual) {
  if (TOOL_PARITY_DIMENSIONS.has(view.id)) {
    const [width, height] = TOOL_PARITY_DIMENSIONS.get(view.id);
    if (capture.width !== width || capture.height !== height) {
      throw new Error(
        `Wrong Tool Studio dimensions for ${view.id}: ${capture.width}x${capture.height}; expected ${width}x${height}`
      );
    }
    if (actual.width !== width || actual.height !== height) {
      throw new Error(
        `Wrong Tool Studio PNG dimensions for ${view.id}: ${actual.width}x${actual.height}; expected ${width}x${height}`
      );
    }
  }
}

function readPngDimensions(view, source) {
  const kind = isToolStudioView(view) ? 'Tool Studio PNG' : 'PNG';
  if (extensionOf(source) !== '.png') {
    throw new Error(`Invalid ${kind} for ${view.id}: ${basename(source)} is not a .png file`);
  }
  const bytes = readFileSync(source);
  const hasPngHeader =
    bytes.length >= 33 &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.toString('ascii', 12, 16) === 'IHDR';
  if (!hasPngHeader) {
    throw new Error(`Invalid ${kind} for ${view.id}: ${basename(source)} has no valid PNG header`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`Invalid ${kind} for ${view.id}: ${basename(source)} has zero dimensions`);
  }
  return { width, height };
}

export function cleanPrScreenshotEvidence({ prNumber, root = ROOT } = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'clean');
  const destinationRoot = resolve(root, `tmp/pr-screenshots/${normalizedPrNumber}`);
  rmSync(destinationRoot, { recursive: true, force: true });
  return destinationRoot;
}

export function readLabelList(path) {
  if (!path || !existsSync(path)) return [];
  return readLines(path);
}

export function isExemptByLabel(labels = [], exemptLabel = DEFAULT_EXEMPT_LABEL) {
  if (!exemptLabel) return false;
  const target = String(exemptLabel).trim().toLowerCase();
  return labels.some(label => String(label).trim().toLowerCase() === target);
}

// CONSERVATIVE label sanitization (salvaged from #823, Design H hardening #1). A view
// label flows unescaped into `![label](url)` alt-text + the managed PR-body block, an
// injection/block-breakout vector. Reject/escape ONLY what actually breaks the
// `![...](...)` structure or the managed block: control chars, newlines, the block
// sentinels, and the `[`/`]` that terminate alt-text. Parens are LEGAL in markdown
// alt-text and appear in real labels (e.g. "Manager currency configuration (spend
// strategy, units, macros)"), so they are deliberately preserved — do NOT over-escape.
export function sanitizeLabel(label = '') {
  return (
    String(label)
      // Strip control characters (incl. newlines/DEL) that could break the block/line.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F]+/g, ' ')
      // Neutralize the managed-block sentinels so a label can't forge/break the block.
      .replace(/<!--\s*fabricate:screenshots:(?:start|end)\s*-->/gi, '')
      // Escape the alt-text terminators; parens are intentionally left intact.
      .replace(/([[\]])/g, '\\$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function buildScreenshotMarkdown(prNumber, uploaded = []) {
  const normalizedPrNumber = normalizeOptionalPrNumber(prNumber);
  const prefix = normalizedPrNumber ? `pr-${normalizedPrNumber} ` : '';
  return uploaded.map(({ label, url }) => `![${prefix}${sanitizeLabel(label)}](${url})`).join('\n\n');
}

export function upsertScreenshotsBlock(body = '', blockMarkdown = '') {
  const text = String(body || '');
  // Include a `## Screenshots` heading so an auto-published body satisfies the
  // same check humans do (an image beneath a Screenshots heading).
  const inner = `${SCREENSHOTS_BLOCK_START}\n## Screenshots\n\n${blockMarkdown}\n${SCREENSHOTS_BLOCK_END}`;
  const startIndex = text.indexOf(SCREENSHOTS_BLOCK_START);
  const endIndex = text.indexOf(SCREENSHOTS_BLOCK_END);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = text.slice(0, startIndex);
    const after = text.slice(endIndex + SCREENSHOTS_BLOCK_END.length);
    return `${before}${inner}${after}`;
  }
  const trimmed = text.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${inner}\n` : `${inner}\n`;
}

export function screenshotPrefix() {
  return (process.env.S3_SCREENSHOT_PREFIX || 'pr-screenshots').replace(/^\/+|\/+$/g, '');
}

export function loadS3Config(root = ROOT) {
  const configPath = resolve(root, 'release.s3.config.json');
  let cfg = {};
  if (existsSync(configPath)) {
    try { cfg = JSON.parse(readFileSync(configPath, 'utf8')); } catch { cfg = {}; }
  }
  return {
    bucket: process.env.S3_RELEASE_BUCKET || cfg.bucket || '',
    baseUrl: (process.env.RELEASE_BASE_URL || cfg.baseUrl || '').replace(/\/+$/, ''),
    region: process.env.AWS_REGION || undefined,
    prefix: screenshotPrefix(),
  };
}

function contentTypeFor(file) {
  return ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  })[extensionOf(file)] || 'application/octet-stream';
}

async function defaultS3PutFactory(region) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(region ? { region } : {});
  return async ({ bucket, key, body, contentType }) => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  };
}

async function defaultS3ListAndDelete(region) {
  const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client(region ? { region } : {});
  return async ({ bucket, prefix }) => {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    const keys = (listed.Contents || []).map(item => ({ Key: item.Key }));
    if (keys.length === 0) return { deleted: 0 };
    await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
    return { deleted: keys.length };
  };
}

// A normalized, filesystem-safe S3 key path segment: reject `..`, path separators,
// and anything but a revision-shaped token so a supplied headSha cannot escape the
// PR-scoped prefix (parity with the PR-number validation). Salvaged from #823.
function normalizeHeadShaSegment(headSha) {
  if (headSha === undefined || headSha === null || headSha === '') return '';
  const value = String(headSha).trim();
  if (!/^[0-9a-zA-Z._-]+$/.test(value) || value.includes('..')) {
    throw new Error(`Invalid head SHA segment: ${headSha}`);
  }
  return value;
}

// Upload collected screenshots to S3. Publish adopts REVISION-ADDRESSED keys
// `<prefix>/<pr>/<head-sha>/<view>.png` when a headSha is supplied (cache-busting so a
// re-pushed revision does not serve a stale cached frame; the existing prefix-delete
// cleanup still works with nested keys), else the legacy `<prefix>/<pr>/<view>.png`.
// Headless, no GitHub Releases/branches; the public-read object URL is embedded in the
// PR body. `putObject` is injectable so tests never touch AWS. `labelForId` lets a
// caller supply labels from its own registry; otherwise labels resolve from
// `VIEW_RECIPES` and fall back to the id (the id is DERIVED from the filename here, so
// the pairing is unambiguous by construction).
export async function uploadScreenshotObjects({ prNumber, files = [], root = ROOT, config, putObject, headSha, labelForId } = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'publish');
  const shaSegment = normalizeHeadShaSegment(headSha);
  const cfg = config || loadS3Config(root);
  if (!cfg.bucket || !cfg.baseUrl) {
    throw new Error('S3 is not configured. Set bucket/baseUrl in release.s3.config.json (or S3_RELEASE_BUCKET/RELEASE_BASE_URL).');
  }
  const put = putObject || await defaultS3PutFactory(cfg.region);
  const uploaded = [];
  for (const file of files) {
    const name = basename(file);
    const viewId = name.slice(0, name.length - extensionOf(file).length);
    const prScope = shaSegment
      ? `${cfg.prefix}/${normalizedPrNumber}/${shaSegment}`
      : `${cfg.prefix}/${normalizedPrNumber}`;
    const key = `${prScope}/${name}`;
    await put({ bucket: cfg.bucket, key, body: readFileSync(file), contentType: contentTypeFor(file) });
    const recipe = VIEW_RECIPES.find(item => item.id === viewId);
    const label = (labelForId && labelForId(viewId)) || (recipe ? recipe.label : viewId);
    uploaded.push({ viewId, label, url: `${cfg.baseUrl}/${key}`, key, file });
  }
  return uploaded;
}

export async function deletePrScreenshotsFromS3({ prNumber, root = ROOT, config, listAndDelete } = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'clean');
  const cfg = config || loadS3Config(root);
  if (!cfg.bucket) return { deleted: 0, skipped: true };
  const prefix = `${cfg.prefix}/${normalizedPrNumber}/`;
  const impl = listAndDelete || await defaultS3ListAndDelete(cfg.region);
  return impl({ bucket: cfg.bucket, prefix });
}

function defaultGhRunner(args, { input } = {}) {
  const result = spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', input });
  if (result.error) {
    const code = result.error.code === 'ENOENT' ? 127 : (result.status ?? 1);
    const stderr = result.error.code === 'ENOENT' ? 'gh CLI not found on PATH' : result.error.message;
    return { status: code, stdout: result.stdout ?? '', stderr };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export async function publishScreenshotEvidence({
  prNumber,
  repo,
  dir,
  root = ROOT,
  runGh = defaultGhRunner,
  putObject,
  config,
  headSha,
  labelForId,
} = {}) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'publish');
  const destinationRoot = resolve(root, dir || `tmp/pr-screenshots/${normalizedPrNumber}`);

  const auth = runGh(['auth', 'status']);
  if (auth.status !== 0) {
    throw new Error(`gh is not authenticated. Run \`gh auth login\` first.\n${auth.stderr || ''}`.trim());
  }

  const files = existsSync(destinationRoot)
    ? listImages(destinationRoot).sort((a, b) => a.localeCompare(b))
    : [];
  if (files.length === 0) {
    return {
      skipped: true,
      reason: `No screenshots to publish in ${relative(root, destinationRoot).replaceAll(sep, '/')}`,
      uploaded: [],
    };
  }

  const uploaded = await uploadScreenshotObjects({ prNumber: normalizedPrNumber, files, root, config, putObject, headSha, labelForId });

  const repoArgs = repo ? ['--repo', repo] : [];
  const view = runGh(['pr', 'view', String(normalizedPrNumber), ...repoArgs, '--json', 'body', '--jq', '.body']);
  if (view.status !== 0) {
    throw new Error(`Failed to read PR #${normalizedPrNumber} body: ${view.stderr || 'unknown error'}`);
  }
  const currentBody = String(view.stdout || '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const newBody = upsertScreenshotsBlock(currentBody, buildScreenshotMarkdown(normalizedPrNumber, uploaded));

  const bodyFile = join(destinationRoot, '.pr-body.md');
  writeFileSync(bodyFile, newBody);
  const edit = runGh(['pr', 'edit', String(normalizedPrNumber), ...repoArgs, '--body-file', bodyFile]);
  if (edit.status !== 0) {
    throw new Error(`Failed to update PR #${normalizedPrNumber} body: ${edit.stderr || 'unknown error'}`);
  }

  return { skipped: false, uploaded, destinationRoot, bodyFile };
}

function listImages(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...listImages(absolute));
    } else if (IMAGE_EXTENSIONS.has(extensionOf(absolute))) {
      files.push(absolute);
    }
  }
  return files;
}

function matchesSmokeLabel(filePath, label) {
  const name = basename(filePath).toLowerCase();
  const escaped = escapeRegExp(label.toLowerCase());
  return new RegExp(`(?:^|-)${escaped}\\.(?:png|jpg|jpeg|webp|gif)$`).test(name);
}

function normalizeOptionalPrNumber(prNumber) {
  if (prNumber === undefined || prNumber === null || prNumber === '') return '';
  const normalized = String(prNumber).trim();
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error(`Invalid PR number: ${prNumber}`);
  }
  return normalized;
}

function requirePrNumber(prNumber, command) {
  const normalized = normalizeOptionalPrNumber(prNumber);
  if (!normalized) throw new Error(`${command} requires prNumber`);
  return normalized;
}

function extensionOf(filePath) {
  const name = basename(filePath).toLowerCase();
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readLines(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

// Ordered default-base candidates. The first ref git can verify wins when neither
// --base nor --changed-files is supplied. Named in the failure diagnostic so a
// contributor knows exactly what was tried.
const DEFAULT_BASE_CANDIDATES = Object.freeze(['origin/main', 'origin/HEAD', 'main']);

// Single spawn path for every git call so `readChangedFilesFromGit` and
// `resolveDefaultBase` share one implementation. `scripts/**` is NOT excluded from
// SonarCloud's new-code duplication under Automatic Analysis, so two near-identical
// inline `spawnSync('git', …)` blocks would risk the duplication gate.
// `git` is resolved from PATH by design: this is a local maintainer/CI dev tool that
// assumes git on PATH (like the sibling `gh`/`git` spawns in this file), the command
// name is a fixed literal, args are an array with no shell, so there is no injection
// vector. S4036 (PATH must be fixed/unwriteable) is not applicable here.
function runGit(args, { root = ROOT } = {}) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' }); // NOSONAR S4036 — git-from-PATH is the intended dev-tool contract (see note above)
}

// Resolve the exact source revision shared by the screenshot producer and collector.
// Explicit command/environment inputs win for reproducible automation, then GitHub's
// checked-out SHA, while the documented local flow derives the current repository HEAD.
// A missing or invalid revision is fatal: provenance validation must never weaken merely
// because the caller omitted an override.
export function resolveScreenshotHeadSha({
  explicitHeadSha,
  ciHeadSha = process.env.GITHUB_SHA,
  root = ROOT,
  runGit: gitRunner = runGit,
} = {}) {
  const explicitHead = normalizeHeadShaSegment(explicitHeadSha);
  if (explicitHead) return explicitHead;
  const ciHead = normalizeHeadShaSegment(ciHeadSha);
  if (ciHead) return ciHead;
  const result = gitRunner(['rev-parse', '--verify', 'HEAD'], { root });
  if (!result || result.status !== 0) {
    throw new Error(result?.stderr?.trim() || 'Could not resolve screenshot provenance from git HEAD');
  }
  const gitHead = normalizeHeadShaSegment(result.stdout);
  if (!gitHead) throw new Error('Git returned an empty HEAD for screenshot provenance');
  return gitHead;
}

function readChangedFilesFromGit(base, { root = ROOT } = {}) {
  // Three-dot `<base>...HEAD` is merge-base semantics: "what did THIS branch change
  // since it forked from <base>", applied to BOTH the resolved-default and explicit
  // --base paths so bare `plan` never disagrees with `plan --base <ref>`. On the
  // integration path the driver rebases onto origin/main first, so the merge base is
  // origin/main's tip and three-dot collapses to two-dot.
  const result = runGit(['diff', '--name-only', `${base}...HEAD`], { root });
  if (result.status !== 0) throw new Error(result.stderr || `git diff failed with status ${result.status}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

// Resolve a default base ref when the caller supplies neither --base nor
// --changed-files. Returns the first candidate git can verify, or null when none
// resolve (e.g. a checkout with no `origin` remote and no local `main`). The git
// runner and candidate list are injectable so tests never touch a real repository.
export function resolveDefaultBase({ root = ROOT, runGit: gitRunner = runGit, candidates = DEFAULT_BASE_CANDIDATES } = {}) {
  for (const ref of candidates) {
    const result = gitRunner(['rev-parse', '--verify', '--quiet', ref], { root });
    if (result && result.status === 0) return ref;
  }
  return null;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    const key = toCamelCase(rawKey);
    if (key === 'allowMissing' || key === 's3' || key === 'awaitCapture') {
      args[key] = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    // AN EMPTY STRING IS A VALUE, not a missing one. This read `!next`, which conflated the two —
    // and CI hands this script empty values on a path nobody chooses: when a contributor deletes
    // their fork while the PR is open, `github.event.pull_request.head.repo` is null, so
    // `--head-repository "$PR_HEAD_REPO"` renders as `--head-repository ''`. Parsing threw before
    // step 1 of the gate ran, so the required `check-screenshots` job died with a bare message and
    // no `::error::<code>` — and, because the throw preceded the exempt-label check, not even a
    // maintainer-applied `screenshots-exempt` label could clear it. An unskippable red for a
    // reason outside the author's control is the exact failure class this gate exists to remove.
    // `undefined` (the flag is last) and a following `--flag` are still missing values.
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Missing value for --${rawKey}`);
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

// Resolve the changed-file set from, in precedence order: --changed-files (read
// line-by-line), --base (diff against that ref), else a resolved default base. On a
// resolved default it prints a one-line stderr note (stdout stays a clean artifact
// listing) and diffs; when no base ref can be resolved it throws a clear, actionable
// error rather than returning [] — so a bare invocation never reports a confident
// "no UI changes" from an empty input set. The seams default to the real
// implementations so `main()`'s existing call site is unchanged.
export function loadChangedFiles(args, { resolveBase = resolveDefaultBase, readChangedFiles = readChangedFilesFromGit } = {}) {
  if (args.changedFiles) return readLines(args.changedFiles);
  if (args.base) return readChangedFiles(args.base);
  const base = resolveBase();
  if (!base) {
    throw new Error(
      `Could not resolve a default base ref (tried ${DEFAULT_BASE_CANDIDATES.join(', ')}). `
      + 'Pass --base <ref> (e.g. --base origin/main) or --changed-files <file>.',
    );
  }
  console.error(`Using default base ${base} (no --base given).`);
  return readChangedFiles(base);
}

// The `--capture-eligible` flag carries a GitHub expression's result, and a GitHub expression
// renders as the literal STRING `true` / `false`. `Boolean('false')` is `true`, and that bug would
// silently push every fork PR into the wait loop — so this parses the two literals and refuses
// anything else rather than coercing.
function parseCaptureEligible(value) {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`--capture-eligible must be the literal 'true' or 'false', not '${value}'`);
}

// `--capture-timeout-minutes` pins the gate's capture deadline to `capture`'s real `timeout-minutes`
// in `pr-screenshots.yml`. Undefined leaves the module's own exported default in force; the adapter
// restates no bound of its own.
function parseCaptureTimeoutMs(value) {
  if (value === undefined || value === '') return undefined;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`--capture-timeout-minutes must be a positive number of minutes, not '${value}'`);
  }
  return minutes * 60_000;
}

// The JSONL `{filename, patch}` stream `gh api …/pulls/{n}/files --jq '… | @json'` emits, read into
// the patch map `mapChangedFilesToCases` narrows its case selection with. One paginated call feeds
// both this and the filename list, so the two can never snapshot different heads.
function readPatchMap(path) {
  const map = {};
  for (const line of readLines(path)) {
    try {
      const entry = JSON.parse(line);
      if (entry?.filename) map[entry.filename] = entry.patch ?? '';
    } catch {
      // A malformed line costs frames, never evidence: an unattributable patch widens the
      // producer's selection rather than narrowing it, so dropping it here is the safe direction.
    }
  }
  return map;
}

function defaultSleep(ms) {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

// Apply the module's verdict. No pass/fail decision lives here — only its application, which is
// what makes "drop the exit-code application" (a mutation that would make the gate a total no-op in
// production) visible to a test that drives `main`.
function reportScreenshotGateDecision(decision) {
  const prefix = decision.code ? `${decision.code}: ` : '';
  if (decision.exitCode !== 0) {
    console.error(`::error::${prefix}${decision.message}`);
    process.exitCode = decision.exitCode;
    return;
  }
  console.log(decision.code ? `::notice::${prefix}${decision.message}` : decision.message);
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const command = args._[0] || 'plan';
  const {
    resolveBase,
    resolveHeadSha = resolveScreenshotHeadSha,
    readChangedFiles,
    runGh,
    sleep,
    now,
    putObject,
    config,
  } = deps;
  // Base resolution is scoped to the commands that CONSUME the changed-file set.
  // `publish` derives its files from tmp/pr-screenshots/<pr>/ and `clean` just removes
  // a local dir — neither must spawn git, print the default-base note, or throw when no
  // base ref resolves (that would turn `clean` into a spurious exit 1).
  const loadChanged = () => loadChangedFiles(args, { resolveBase, readChangedFiles });

  if (command === 'plan') {
    const changedFiles = loadChanged();
    if (!hasUiChanges(changedFiles)) {
      console.log('No UI changes detected.');
      return;
    }
    console.log('UI smoke screenshot artifacts required:');
    for (const recipe of mapChangedFilesToViews(changedFiles)) {
      console.log(`- ${recipe.id}: ${recipe.label} (${recipe.smokeLabels.join(', ')})`);
    }
    return;
  }

  if (command === 'targets') {
    // Print the scoped `screenshots`-profile target label set (CSV) for the changed
    // files, for `FOUNDRY_SCREENSHOT_TARGET_LABELS` / `--target-labels`. Empty output
    // (no UI change) tells the caller to skip the capture run entirely.
    const changedFiles = loadChanged();
    console.log(smokeLabelsForChangedFiles(changedFiles).join(','));
    return;
  }

  if (command === 'check') {
    // A THIN ADAPTER, deliberately. No ordering, no re-read, no pass/fail decision and no restated
    // bound literal may live here: all of that is `decideScreenshotGate`, where a test can see it.
    // This supplies the collaborators from this module's own scope, maps the CLI flags onto the
    // call, and applies the returned exit code.
    const decision = await decideScreenshotGate({
      runGh: runGh || defaultGhRunner,
      sleep: sleep || defaultSleep,
      now: now || Date.now,
      // The cycle-avoidance seam: the REAL predicates, passed by reference.
      evaluate: {
        isExempt: isExemptByLabel,
        validateChangedFiles: validateChangedFilesForCheck,
        isArmed: hasUiChanges,
        explainMissingEvidence: explainScreenshotEvidenceFailure,
      },
      changedFiles: loadChanged(),
      changedFilesRequired: Boolean(args.changedFiles),
      patches: args.patchesFile ? readPatchMap(args.patchesFile) : undefined,
      body: args.bodyFile ? readFileSync(args.bodyFile, 'utf8') : '',
      headSha: args.headSha,
      prNumber: args.pr,
      repo: args.repo,
      headBranch: args.headBranch,
      headRepository: args.headRepository,
      // `|| undefined` so an EMPTY flag means "absent" and the module's own exported default
      // applies, rather than `''` reaching the runs query as `workflows//runs`. Now that an empty
      // string parses as a value (see `parseArgs`), every string flag has to say which of the two
      // it means; the head-* three below mean "cannot narrow on this" and degrade in the module.
      captureWorkflow: args.captureWorkflow || undefined,
      awaitCapture: args.awaitCapture === true,
      captureEligible: parseCaptureEligible(args.captureEligible),
      captureTimeoutMs: parseCaptureTimeoutMs(args.captureTimeoutMinutes),
      exemptLabel: args.exemptLabel || DEFAULT_EXEMPT_LABEL,
      labels: readLabelList(args.labels),
    });
    reportScreenshotGateDecision(decision);
    return;
  }

  if (command === 'collect') {
    const changedFiles = loadChanged();
    const result = collectScreenshotEvidence({
      changedFiles,
      prNumber: args.pr,
      sourceDir: args.sourceDir || 'test-results',
      outputDir: args.outputDir,
      allowMissing: args.allowMissing === true,
      headSha: resolveHeadSha({ explicitHeadSha: args.headSha }),
    });
    for (const item of result.copied) {
      console.log(`${relative(ROOT, item.destination).replaceAll(sep, '/')} <= ${relative(ROOT, item.source).replaceAll(sep, '/')}`);
    }
    for (const view of result.missing) {
      console.log(`MISSING: ${view.label} (${view.id}) needs a smoke screenshot artifact from test-results/.`);
    }
    return;
  }

  if (command === 'clean') {
    // Local tmp only by default. S3 objects must stay live while the PR is open
    // (they back the embedded image URLs); only remove them on PR close via
    // `--s3` (or let the bucket lifecycle rule expire them).
    const destinationRoot = cleanPrScreenshotEvidence({ prNumber: args.pr });
    console.log(`Removed ${relative(ROOT, destinationRoot).replaceAll(sep, '/')}`);
    if (args.s3) {
      try {
        const deletion = await deletePrScreenshotsFromS3({ prNumber: args.pr });
        if (deletion && deletion.deleted) {
          console.log(`Deleted ${deletion.deleted} S3 object(s) under ${screenshotPrefix()}/${normalizeOptionalPrNumber(args.pr)}/`);
        } else {
          console.log('No S3 screenshots to delete.');
        }
      } catch (error) {
        console.warn(`::warning::Could not delete S3 screenshots (continuing): ${error.message}`);
      }
    }
    return;
  }

  if (command === 'publish') {
    const result = await publishScreenshotEvidence({
      prNumber: args.pr,
      repo: args.repo,
      dir: args.outputDir,
      runGh,
      putObject,
      config,
      // Revision-addressed keys (`<prefix>/<pr>/<head-sha>/<view>.png`) when the head
      // SHA is supplied; without it the keys fall back to the legacy PR-scoped path.
      headSha: args.headSha,
    });
    if (result.skipped) {
      console.log(result.reason);
      return;
    }
    for (const item of result.uploaded) {
      console.log(`${item.viewId} <= ${item.url}`);
    }
    console.log(`Updated PR #${normalizeOptionalPrNumber(args.pr)} body with ${result.uploaded.length} screenshot${result.uploaded.length === 1 ? '' : 's'}.`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
