#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// The refusal diagnostic lives beside `evaluateSmokeOutcome` in the lib, not here (issue #1019).
import { explainSmokeSummaryRefusal } from './lib/foundrySmokeSignal.js';
// The `check` gate's composed decision — await the capture run for this head, then match what it
// published — lives in the lib for the same two reasons, plus a third: it is a leaf that imports
// nothing from this file.
import { decideScreenshotGate, locateManagedBlock } from './lib/screenshotEvidenceMatching.js';
import { logicalStylesheetPath } from './lib/stylesheetSource.js';
// The View Lab's own case registry, for the two things a published frame needs and this file cannot
// derive: what to call it, whether it needs a caption, and where the Primitive Lab's boundary lies.
import { evidenceNoteForCaseId, isPrimitiveLabPath, labelForCaseId } from './lib/viewLabCases.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

// Default human-only label that exempts a UI PR from the screenshot requirement.
const DEFAULT_EXEMPT_LABEL = 'screenshots-exempt';

// Stable delimiters for the managed screenshot block in the PR body. `publish` replaces the span
// `locateManagedBlock` finds, the one the gate masks, so re-runs update in place (issue 1174).
const SCREENSHOTS_BLOCK_START = '<!-- fabricate:screenshots:start -->';
const SCREENSHOTS_BLOCK_END = '<!-- fabricate:screenshots:end -->';

// The read-side builder behind every player crafting frame: it resolves the Produces row, the
// per-set products and the per-step projection the detail bodies render.
const CRAFTING_LISTING_BUILDER_PATTERN = /^src\/ui\/presenters\/CraftingListingBuilder\.js$/;

// The recipe editor's frames (overview/ingredients/validation/multi-step/tools/access/ results)
// share the same trigger files, so any recipe editor / tab / sub-component change republishes all
// of them.
const RECIPE_EDIT_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/RecipeEditView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/recipe\/(?!RecipeTools(?:Tab|Section)\.svelte$).*\.svelte$/,
  // The Overview tab's eligible-modifier override renders the shared pill multi-select
  // (issue 770); a change to it republishes the recipe-editor frames it appears in.
  /^src\/ui\/svelte\/components\/ModifierPillSelect\.svelte$/,
  // The requirement row family, moved out of `recipe/` at issue 2510.
  /^src\/ui\/svelte\/components\/(?:PickerRow\w*|ChoiceGroup\w*|KindAdder)\.svelte$/,
];

// Every recipe-editor frame maps one same-named smoke label to the shared RECIPE_EDIT_MATCHES glob.
const recipeEditFrame = (id, label) => ({ id, label, smokeLabels: [id], matches: RECIPE_EDIT_MATCHES });
const toolStudioFrame = (id, label, smokeLabel, matches) => ({
  id,
  label,
  smokeLabels: [smokeLabel],
  matches,
});
// The GM Knowledge surface (issue 785). Shared by the two Knowledge view ids below (the surface
// itself and its armed-Delete frame) so the pair is one trigger set expressed once.
const KNOWLEDGE_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/KnowledgeView\.svelte$/,
  // Issue 1509 moved the armed control into `components/`, so it can no longer ride the
  // manager-directory alternation above and takes a pattern of its own.
  /^src\/ui\/svelte\/components\/ArmedDangerButton\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/knowledge\/.+\.svelte$/,
  // Every plain-JS module in the surface's own folder: the pure projection
  // (`knowledgeStudio.js`) and the mutation collaborator (`knowledgeMutations.js`)
  // both change what the captured frames show.
  /^src\/ui\/svelte\/apps\/manager\/knowledge\/.+\.js$/,
  /^src\/ui\/svelte\/stores\/adminKnowledgeSection\.js$/,
];
// Only Tool Studio's own files. It deliberately excludes two shared surfaces it used to match.
// Render modules that select their own screens rather than the global fallback (issues 1790, 1891,
// 1901): the browsers' lifted-list wiring and bulk selection, and their page and group-total models.
const BROWSER_LIST_STATE_PATTERN = /^src\/ui\/svelte\/apps\/manager\/browserListState\.svelte\.js$/;
const BULK_SELECTION_PATTERN = /^src\/ui\/svelte\/apps\/manager\/bulkSelection\.svelte\.js$/;
const BROWSER_PAGE_MODEL_PATTERN = /^src\/ui\/model\/browser(?:GroupCounts|Pagination)\.js$/;
const ENVIRONMENT_EDITOR_STATE_MATCHES = [
  /^src\/ui\/svelte\/stores\/adminEnvironment(?:DraftSection|WriteActions)\.js$/,
  /^src\/ui\/model\/environment(?:Validation|Composition)\.js$/,
];
const TOOL_STUDIO_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/(?:ToolsBrowserView|ToolEditView)\.svelte$/,
  /^src\/ui\/svelte\/stores\/adminToolDraftSection\.js$/,
  BROWSER_LIST_STATE_PATTERN,
  /^src\/ui\/svelte\/apps\/manager\/tools\/.+\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/tools\/toolStudio\.js$/,
  // The shared side-panel fact row the Tool Studio's preview and library inspector render (issue
  // 881).
  /^src\/ui\/svelte\/apps\/manager\/IconFactRow\.svelte$/,
];

// The shared bulk-edit primitives (issue 1010) and the shared bulk-DELETE card (issue 1132).
const BULK_STUDIO_SURFACE_PATTERN =
  /^src\/ui\/svelte\/apps\/manager\/(?:BulkSelectionToolbar|BulkEditPanelShell|BulkEditSection|BulkDeleteCard|InspectorPanel)\.svelte$/;
const RECIPE_BULK_SELECT_PATTERN = /^src\/ui\/svelte\/apps\/manager\/BulkEditSelect\.svelte$/;

// The Component Studio BROWSER's own files (issue 676): the view and every component in
// `components/`, which is the browser's directory (`component/` is the EDITOR's, mirroring
// the Recipe Studio's `recipes/` vs `recipe/` split). Shared by every browser frame below.
const COMPONENTS_BROWSER_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/components\/.+\.svelte$/,
  BULK_STUDIO_SURFACE_PATTERN,
  // The Component Studio's three staging insets (issue 1371 r16-list, M23) render through this
  // one component, which sits directly under `apps/manager/` and would otherwise map to no view.
  /^src\/ui\/svelte\/apps\/manager\/BulkStagingInset\.svelte$/,
];

// A single-frame components-browser view: one same-named smoke label over the shared browser match
// list, plus whatever extra file that state additionally depends on.
const componentsBrowserFrame = (id, label, extraMatches = []) => ({
  id,
  label,
  smokeLabels: [id],
  matches: [...COMPONENTS_BROWSER_MATCHES, ...extraMatches],
});

// The two pure models the bulk panel stages against.
const BULK_EDIT_MODEL_MATCHES = [
  /^src\/ui\/model\/componentBulkEditModel\.js$/,
  /^src\/utils\/bulkSelectionModel\.js$/,
];

// The Recipe Studio browser's own files (issue 1010), mirroring COMPONENTS_BROWSER_MATCHES.
const RECIPES_BROWSER_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/RecipesBrowserView\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/recipes\/.*\.svelte$/,
  BULK_STUDIO_SURFACE_PATTERN,
  // The Recipe Studio's leave-unchanged select, which is ITS alone since issue 1371 r16-list — see
  // `BULK_STUDIO_SURFACE_PATTERN`.
  RECIPE_BULK_SELECT_PATTERN,
];

// A single-frame recipes-browser view: one same-named smoke label over the shared browser match
// list, plus whatever extra file that state additionally depends on.
const recipesBrowserFrame = (id, label, extraMatches = []) => ({
  id,
  label,
  smokeLabels: [id],
  matches: [...RECIPES_BROWSER_MATCHES, ...extraMatches],
});

// The two pure models the recipe bulk panel stages against — the recipe half of
// `BULK_EDIT_MODEL_MATCHES` above, and hoisted for the same reason.
const RECIPE_BULK_EDIT_MODEL_MATCHES = [
  /^src\/ui\/model\/recipeBulkEditModel\.js$/,
  /^src\/utils\/bulkSelectionModel\.js$/,
];

// The player Crafting tab's requirement surface (issue 917): the slot rail, the single open
// chooser, the shared essence pool and the consumption-plan panel.
const REQUIREMENT_RAIL_MATCHES = [
  /^src\/ui\/svelte\/apps\/crafting\/detail\//,
  /^src\/ui\/svelte\/util\/requirementSlots\.js$/,
  /^src\/ui\/svelte\/stores\/craftingStore\.svelte\.js$/,
];

// One rail frame: a single same-named smoke label over the shared rail trigger list.
const requirementRailFrame = (id, label) => ({
  id,
  label,
  smokeLabels: [id],
  matches: REQUIREMENT_RAIL_MATCHES,
});

// The page header and the model behind it (issue 1720): the trail, the eyebrow, the title and the
// header actions of every manager frame the shell appears in are drawn by these six.
const PAGE_HEADER_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/ManagerPageHeader\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/headerBreadcrumbs\.js$/,
  /^src\/ui\/svelte\/apps\/manager\/ManagerHeaderActions\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/ManagerHeaderCraftingActions\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/ManagerHeaderGatheringActions\.svelte$/,
  /^src\/ui\/svelte\/apps\/manager\/headerModel\.svelte\.js$/,
];

const WORLD_NAVIGATION_MATCHES = [
  /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
  ...PAGE_HEADER_MATCHES,
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
    // The system inspectors' filling root and pinned foot (issue 2498): the four browsers whose
    // record verbs render through it, each at its default selection.
    id: 'manager-inspector-panel',
    label: 'Manager system inspectors — record verbs pinned to the rail foot',
    smokeLabels: [
      'manager-recipes-normal',
      'manager-essences-normal',
      'manager-components-normal',
      'manager-tool-parity-01-library-1280x720',
    ],
    matches: [/^src\/ui\/svelte\/apps\/manager\/InspectorPanel\.svelte$/],
  },
  {
    id: 'manager-systems',
    label: 'Manager systems browser',
    smokeLabels: ['manager-default-selection', 'manager-selected-normal', 'manager-selected-stacked'],
    matches: [...PAGE_HEADER_MATCHES, /^src\/ui\/svelte\/apps\/manager\/SystemsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/SystemBrowserInspector\.svelte$/, BROWSER_LIST_STATE_PATTERN],
  },
  {
    id: 'manager-rail-expanded',
    label: 'Manager rail expanded (default)',
    smokeLabels: ['manager-rail-expanded'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      ...PAGE_HEADER_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/ManagerNavRail\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerSystemNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldDowntimeNavGroup\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/managerNavItems\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/navRailModel\.svelte\.js$/,
      /^styles\/fabricate\.css$/,
    ],
  },
  {
    id: 'manager-rail-collapsed',
    label: 'Manager rail collapsed (icon strip)',
    smokeLabels: ['manager-rail-collapsed'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      ...PAGE_HEADER_MATCHES,
      /^src\/ui\/svelte\/apps\/manager\/ManagerNavRail\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerSystemNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldNav\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/ManagerWorldDowntimeNavGroup\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/managerNavItems\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/navRailModel\.svelte\.js$/,
      /^styles\/fabricate\.css$/,
    ],
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
    // Issue 767: the unsaved-changes chip + dirty-draft guard for the identity form.
    id: 'manager-system-edit-dirty',
    label: 'Manager system settings — unsaved-changes chip',
    smokeLabels: ['manager-system-edit-dirty'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/,
      ...PAGE_HEADER_MATCHES,
    ],
  },
  {
    // Issue 768: the settings-list ergonomics proof frame — Character Modifiers, Character
    // Prerequisites and Currency Units seeded with ≥2 entries, with the shared IconPicker open on a
    // modifier, the Currency section collapsed, and the row-level copy buttons visible.
    id: 'manager-system-edit-lists',
    label: 'Manager system settings — settings-list ergonomics (icon picker, collapse, copy)',
    smokeLabels: ['manager-system-edit-lists'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/SystemEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/system\/.+\.svelte$/,
      /^src\/systems\/characterModifierPrerequisiteCopy\.js$/,
      // The shared IconPicker and the vocabulary it lists (issue 1269).
      /^src\/ui\/svelte\/components\/IconPicker\.svelte$/,
      /^src\/ui\/svelte\/util\/(?:essenceIcons\.js|foundryIconVocabulary\.js|foundryIconCatalogue\.(?:js|json))$/,
    ],
  },
  {
    id: 'manager-currency',
    label: 'World currency configuration (spend strategy, units, macros)',
    smokeLabels: ['currency-actor-property', 'currency-macro', 'currency-actor-inventory'],
    matches: [
      // The editor itself, world scope since issue 1278. It used to be a card inside
      // `SystemEditView`, which is why this recipe once had no view of its own.
      /^src\/ui\/svelte\/apps\/manager\/world\/WorldCurrencyTab\.svelte$/,
      /^src\/systems\/CurrencyConfigStore\.js$/,
      /^src\/systems\/currencyProfile\.js$/,
      /^src\/systems\/CoinSpenders\.js$/,
      /^src\/config\/currency(?:Presets|Providers)\.js$/,
      /^src\/ui\/svelte\/stores\/adminCurrencySection\.js$/,
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
    matches: [...COMPONENTS_BROWSER_MATCHES, /^src\/ui\/model\/componentBrowserModel\.js$/],
  },
  componentsBrowserFrame(
    'manager-components-progressive',
    'Manager components browser — progressive difficulty badge (value + None)',
  ),
  // Issue 772: the bulk-edit state — rows multi-selected, the selection toolbar, and the rail's
  // staged bulk panel.
  componentsBrowserFrame(
    'manager-components-bulk-edit',
    'Manager components browser — bulk edit (multi-select, selection toolbar, staged rail panel)',
    [/^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/, ...BULK_EDIT_MODEL_MATCHES, BULK_SELECTION_PATTERN],
  ),
  // The bulk panel's other two states, each its own view for the same `candidates[0]` reason as the
  // staged frame above — and each a separate frame because no one photograph can hold them.
  componentsBrowserFrame(
    'manager-components-bulk-edit-unstaged',
    'Manager components browser — bulk edit, pristine draft (every axis unstaged, Apply inert)',
    [/^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/, ...BULK_EDIT_MODEL_MATCHES, BULK_SELECTION_PATTERN],
  ),
  // The Progressive DC section is gated on `componentDifficultyAxisProgressive`, so it renders on
  // the progressive smoke system and on no other — which is also the only system in this world that
  // can evidence the panel's empty item-tag copy, since it authors no tags.
  componentsBrowserFrame(
    'manager-components-bulk-edit-progressive',
    'Manager components browser — bulk edit, progressive DC section + empty item-tag copy',
    [...BULK_EDIT_MODEL_MATCHES],
  ),
  // Issue 801: the grouped-category continuation frame — a category split across a page boundary,
  // its continuation slice ("N of M") at the head of the next page.
  {
    id: 'manager-components-grouped-continuation',
    label: 'Manager components browser — grouped category continued across a page boundary',
    smokeLabels: ['manager-components-grouped-continuation'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentsBrowserView\.svelte$/,
      /^src\/ui\/model\/componentBrowserModel\.js$/,
      BROWSER_PAGE_MODEL_PATTERN,
      BROWSER_LIST_STATE_PATTERN,
    ],
  },
  // Issue 800: write-time resolution of source descriptions.
  {
    id: 'manager-components-description-before',
    label: 'Component description — BEFORE (un-repaired world, raw directive text)',
    smokeLabels: ['manager-components-description-before'],
    matches: [
      /^src\/utils\/plainTextDescription\.js$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/util\/(?:foundryBridge|foundryEnrich|foundryDocuments)\.js$/,
    ],
  },
  {
    id: 'manager-components-description-repaired',
    label: 'Component description — AFTER Repair Item Data (locked-pack source resolved)',
    smokeLabels: ['manager-components-description-repaired'],
    matches: [
      /^src\/utils\/plainTextDescription\.js$/,
      /^src\/ui\/svelte\/stores\/adminStore\.js$/,
      /^src\/ui\/svelte\/util\/(?:foundryBridge|foundryEnrich|foundryDocuments)\.js$/,
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
      /^src\/ui\/svelte\/util\/(?:foundryBridge|foundryEnrich|foundryDocuments)\.js$/,
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
      // The essence quantity card (issue 772) lives under `components/` — the browser's directory,
      // because the browser's bulk panel renders it too — but the editor renders it as well,
      // four-up.
      /^src\/ui\/svelte\/apps\/manager\/components\/EssenceQuantityCard\.svelte$/,
      // The complication trigger sentence the complications section draws (issue 1790).
      /^src\/ui\/model\/complicationSummary\.js$/,
    ],
  },
  {
    id: 'manager-component-edit-difficulty',
    label: 'Manager component editor — staged progressive difficulty control',
    smokeLabels: ['manager-component-edit-difficulty'],
    // The staged difficulty control is ComponentDifficultyCard, which ComponentEditView renders.
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentDifficultyCard\.svelte$/,
    ],
  },
  {
    id: 'manager-component-edit-salvage',
    label: 'Manager component editor — salvage authoring (enable toggle, result groups, routing, DC presets)',
    // `-off` photographs the collapsed/OFF salvage body: the state decision 6
    // guarantees every existing world shows, and the one Ruling A governs.
    smokeLabels: ['manager-component-edit-salvage', 'manager-component-edit-salvage-off'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentSalvage(?:Card|Stages)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/component\/salvageDcPresets\.js$/,
    ],
  },
  {
    // Issue 764: the Simple-mode salvage editor at its one-success-group cap — the Add result set
    // control hidden and the required hint shown.
    id: 'manager-component-edit-salvage-simple',
    label: 'Manager component editor — Simple-mode salvage single-group cap (no Add result set, required hint)',
    smokeLabels: ['manager-component-edit-salvage-simple'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ComponentEditView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/component\/ComponentSalvageCard\.svelte$/,
    ],
  },
  {
    id: 'manager-checks-gathering',
    label: 'Manager Checks tab — gathering check editor (routed)',
    smokeLabels: ['manager-checks-gathering'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksRightMenu\.svelte$/,
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
  // Issue 752: the Checks → Crafting tab scrolled to the failure-consumption controls (evidence for
  // #736's #712 half).
  {
    id: 'manager-checks-crafting-consumption',
    label: 'Manager Checks tab — crafting failure-consumption controls',
    smokeLabels: ['manager-checks-crafting-consumption'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CraftingCheckEditor\.svelte$/,
      // Issue 1036: the simple-mode editor and the shared drop primitive it was converted onto.
      /^src\/ui\/svelte\/apps\/manager\/checks\/SimpleCraftingCheckEditor\.svelte$/,
      /^src\/ui\/svelte\/components\/ItemDropZone\.svelte$/,
    ],
  },
  {
    // Issue 770: the check-modifier catalogue card — its own frame (the crafting tab scrolls to the
    // failure-consumption card for the frame above, so the modifier card needs a dedicated capture
    // to show its IconPicker + label + `@`-expression rows and the default-modifier pill
    // multi-select un-cropped).
    id: 'manager-checks-crafting-modifiers',
    label: 'Manager Checks tab — crafting check-modifier catalogue',
    smokeLabels: ['manager-checks-crafting-modifiers'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/checks\/ChecksView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/checks\/CraftingModifierCatalogueCard\.svelte$/,
      // The catalogue's entry row, extracted out of that card at issue 1373's round 4 so the Tool
      // Studio's check-bonus picker draws the same one.
      /^src\/ui\/svelte\/apps\/manager\/ModifierLibraryRow\.svelte$/,
      /^src\/ui\/svelte\/components\/ModifierPillSelect\.svelte$/,
    ],
  },
  {
    id: 'manager-tags-categories',
    label: 'Manager tags and categories',
    smokeLabels: ['manager-tags-categories-normal', 'manager-tags-categories-stacked'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategoriesView\.svelte$/,
      // The shared vocabulary shell and its per-panel card (issue 1915), which replaced both the
      // retired tab strip and the inspector rail's explainer cards on this screen.
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyShell|VocabularyShellPanel)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/(vocabularyShell|systemVocabularyStudio)\.js$/,
      /^src\/ui\/model\/vocabulary(?:Cascade|Usage)\.js$/,
    ],
  },
  // Issue 752: the Item tags vocabulary rows (evidence for #735's row rendering).
  {
    id: 'manager-tags-categories-tags-tab',
    label: 'Manager tags and categories — Item tags rows',
    smokeLabels: ['manager-tags-categories-tags-tab'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/TagsCategoriesView\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/(VocabularyShell|VocabularyShellPanel|VocabularyPanel)\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/(vocabularyShell|systemVocabularyStudio)\.js$/,
      /^src\/ui\/model\/vocabularyUsage\.js$/,
    ],
  },
  {
    // The GM Essence Studio (issue 1036).
    id: 'manager-essences',
    label: 'Manager essences',
    // Only the three labels the smoke harness actually emits appear here; this list is the scoped
    // smoke capture's target set, and every entry is checked against
    // `scripts/foundry-test-run.mjs`.
    smokeLabels: [
      'manager-essences-normal',
      'manager-essences-stacked',
      'manager-essence-edit-first-state',
    ],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/Essence(?:Browser|Edit)View\.svelte$/,
      /^src\/ui\/svelte\/apps\/manager\/essences\//,
      // `essencePreviewRow` builds the two synthetic tiles the editor's "How players see it" rail
      // mounts, so a change to it is only visible in `manager-essence-edit-first-state` (issue
      // 1124).
      /^src\/ui\/svelte\/util\/(?:essenceIcons|essencePreviewRow|managerColorTokens)\.js$/,
      /^src\/ui\/model\/essence(?:BrowserModel|BulkEditModel|Validation)\.js$/,
      // The shared bulk-delete card (issue 1132).
      /^src\/ui\/svelte\/apps\/manager\/BulkDeleteCard\.svelte$/,
      BROWSER_LIST_STATE_PATTERN,
      BULK_SELECTION_PATTERN,
    ],
  },
  {
    id: 'manager-environments',
    label: 'Manager gathering environments',
    smokeLabels: ['manager-environments-browse-normal', 'manager-environments-browse-stacked', 'manager-environment-edit-placeholder'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/EnvironmentEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/EnvironmentsBrowserView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/environment\//, ...ENVIRONMENT_EDITOR_STATE_MATCHES, BROWSER_LIST_STATE_PATTERN],
  },
  {
    id: 'manager-gathering-tasks',
    label: 'Manager gathering tasks',
    smokeLabels: ['manager-gathering-task-editor-normal', 'manager-gathering-task-editor-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringTaskEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/gathering-task\//, /^src\/ui\/svelte\/apps\/manager\/GatheringTasksBrowserView\.svelte$/, BROWSER_LIST_STATE_PATTERN],
  },
  {
    id: 'manager-gathering-events',
    label: 'Manager gathering events',
    smokeLabels: ['manager-gathering-events-normal', 'manager-gathering-event-editor-normal'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/GatheringEventEditView\.svelte$/, /^src\/ui\/svelte\/apps\/manager\/GatheringEventsBrowserView\.svelte$/, BROWSER_LIST_STATE_PATTERN],
  },
  toolStudioFrame('01-library-1280x720', 'Tool Studio — library parity', 'manager-tool-parity-01-library-1280x720', TOOL_STUDIO_MATCHES),
  toolStudioFrame('zero-state-empty-library-1280x720', 'Tool Studio — empty library zero state', 'manager-tool-zero-state-empty-library-1280x720', TOOL_STUDIO_MATCHES),
  toolStudioFrame('02-remove-1280x720', 'Tool Studio — remove from system', 'manager-tool-parity-02-remove-1280x720', TOOL_STUDIO_MATCHES),
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
    'manager-world-travel-default-collapsed',
    'Manager Travel — default collapsed'
  ),
  worldNavigationFrame(
    'manager-world-travel-expanded-neutral',
    'Manager Travel — expanded neutral'
  ),
  worldNavigationFrame('manager-world-parties-normal', 'Manager World — Parties'),
  worldNavigationFrame('manager-world-travel-ungated', 'Manager Travel — non-participating system'),
  worldNavigationFrame(
    'manager-world-travel-with-gathering-expanded',
    'Manager Travel — Gathering and Travel expanded'
  ),
  worldNavigationFrame('manager-world-travel-realms-normal', 'Manager Travel — Realms'),
  worldNavigationFrame(
    'manager-world-travel-realms-stacked',
    'Manager Travel — Realms stacked'
  ),
  worldNavigationFrame('manager-world-travel-map-normal', 'Manager Travel — Map'),
  worldNavigationFrame('manager-world-travel-map-stacked', 'Manager Travel — Map stacked'),
  worldNavigationFrame(
    'manager-world-travel-map-collapsed-rail',
    'Manager Travel — Map collapsed rail'
  ),
  {
    id: 'manager-recipes',
    label: 'Manager recipes',
    // `manager-recipes-no-check` photographs the row's "No check" warning pill.
    smokeLabels: ['manager-recipes-normal', 'manager-recipes-narrow', 'manager-recipes-no-check'],
    // The library inspector deliberately lives under `apps/manager/recipes/` and not
    // `apps/manager/recipe/` (issue 643): the latter is RECIPE_EDIT_MATCHES, so a browser-side
    // component placed there would republish the five recipe-EDITOR frames and never the browser
    // frame.
    matches: RECIPES_BROWSER_MATCHES,
  },
  // Issue 1010: the Recipe Studio's bulk-edit states — rows multi-selected, the shared selection
  // toolbar, and the rail's staged bulk panel in place of the single-recipe inspector.
  recipesBrowserFrame(
    'manager-recipes-bulk-edit',
    'Manager recipes browser — bulk edit (multi-select, selection toolbar, every axis staged)',
    [/^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/, ...RECIPE_BULK_EDIT_MODEL_MATCHES, BULK_SELECTION_PATTERN],
  ),
  // The pristine draft is its own FRAME as well as its own view, because no one photograph holds
  // both faces of an axis: a segmented control cannot read `Unchanged` and `Enable` at once, and
  // the two check-tier sentinels (`— Leave unchanged —` and `Default DC`, which mean opposite
  // things) are only both visible while neither has been chosen.
  recipesBrowserFrame(
    'manager-recipes-bulk-edit-unstaged',
    'Manager recipes browser — bulk edit, pristine draft (three Unchanged segments, both check-tier sentinels, Apply inert)',
    [/^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/, ...RECIPE_BULK_EDIT_MODEL_MATCHES, BULK_SELECTION_PATTERN],
  ),
  // Acceptance criterion 6's frame: the pre-flight warning Callout over the rows the browser has
  // itself pilled `Can't enable`.
  recipesBrowserFrame(
    'manager-recipes-bulk-edit-blocked',
    'Manager recipes browser — bulk edit, blocked-enable warning over the pilled rows it counts',
    [
      /^src\/ui\/svelte\/components\/SelectionCheckbox\.svelte$/,
      ...RECIPE_BULK_EDIT_MODEL_MATCHES,
      /^src\/ui\/model\/recipeBrowserModel\.js$/,
    ],
  ),
  // Issue 801: the grouped-category continuation frame for the recipe library.
  {
    id: 'manager-recipes-grouped-continuation',
    label: 'Manager recipes browser — grouped category continued across a page boundary',
    smokeLabels: ['manager-recipes-grouped-continuation'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipesBrowserView\.svelte$/,
      /^src\/ui\/model\/recipeBrowserModel\.js$/,
      BROWSER_PAGE_MODEL_PATTERN,
      BROWSER_LIST_STATE_PATTERN,
    ],
  },
  // Issue 806: the editor round-trip preservation frame.
  {
    id: 'manager-recipes-editor-roundtrip',
    label: 'Manager recipes browser — category filter + collapsed group preserved across an editor round-trip (#806)',
    smokeLabels: ['manager-recipes-editor-roundtrip'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/RecipesBrowserView\.svelte$/,
      /^src\/ui\/model\/recipeBrowserModel\.js$/,
    ],
  },
  // Issue 877 turned the report from a raw-HTML DialogV2 into a Svelte modal, so the
  // rendering file is now `ImportReportModal.svelte` rather than the app shell's HTML
  // builder — and `Modal.svelte`, the chrome BOTH import-flow modals render
  // through, changes this frame's appearance too. All four are load-bearing.
  {
    id: 'manager-import-report',
    label: 'Manager import — post-import unresolved-reference report (#492, #877)',
    smokeLabels: ['manager-import-report'],
    matches: [
      /^src\/ui\/SvelteCraftingSystemManagerApp\.svelte\.js$/,
      // The two import dialogs and the report assembly moved here (issue 1674).
      /^src\/ui\/managerServices\.js$/,
      /^src\/ui\/presenters\/importReportContent\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/ImportReportModal\.svelte$/,
      /^src\/ui\/svelte\/components\/Modal\.svelte$/,
      // The model that opens both import-flow modals (issue 1721).
      /^src\/ui\/svelte\/apps\/manager\/importFlowModel\.svelte\.js$/,
    ],
  },
  // Issue 771: folder-aware categorization mapping modal, shown before a folder / whole-pack
  // component drop commits. Its own single-frame view (collect publishes only candidates[0] per
  // id).
  {
    id: 'manager-import-folder-mapping',
    label: 'Manager import — folder-aware categorization mapping step (#771)',
    smokeLabels: ['manager-import-folder-mapping'],
    matches: [
      /^src\/ui\/svelte\/apps\/manager\/ImportFolderMappingModal\.svelte$/,
      /^src\/ui\/model\/matchFolderVocabulary\.js$/,
      /^src\/ui\/svelte\/components\/Modal\.svelte$/,
      /^src\/ui\/SvelteCraftingSystemManagerApp\.svelte\.js$/,
      /^src\/ui\/managerServices\.js$/,
      /^src\/ui\/svelte\/apps\/manager\/importFlowModel\.svelte\.js$/,
    ],
  },
  // The gated Crafting nav group (issue 511) publishes three distinct frames — the expanded group
  // rail, the Books & Scrolls surface, and the Settings placeholder.
  {
    id: 'manager-crafting-group',
    label: 'Manager Crafting nav group (expanded: Settings + Recipes + Books & Scrolls)',
    smokeLabels: ['manager-crafting-group-expanded'],
    matches: [...PAGE_HEADER_MATCHES, /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  {
    id: 'manager-books-scrolls',
    label: 'Manager Books & Scrolls recipe-item surface',
    smokeLabels: ['manager-books-scrolls-normal'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/BooksScrollsView\.svelte$/],
  },
  // Issue 797: the recipe-item editor's Validation tab, brought to parity with the recipe editor's
  // Validation tab (summary card + count tiles + grouped bordered rows with status pills).
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
  // Issue 785: the GM Knowledge surface.
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
    matches: [...PAGE_HEADER_MATCHES, /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  // Issue 752: the Crafting → Settings surface of an ALCHEMY-mode system (evidence for #736's #713
  // half).
  {
    id: 'manager-alchemy-settings',
    label: 'Manager Crafting → Settings for an alchemy-mode system',
    smokeLabels: ['manager-alchemy-settings'],
    matches: [/^src\/ui\/svelte\/apps\/manager\/CraftingSettingsView\.svelte$/],
  },
  // Issue 752: the selected-system rail with experimental features disabled (evidence for #746 —
  // crafting group unconditional, graph absent).
  {
    id: 'manager-experimental-off',
    label: 'Manager rail — experimental features disabled',
    smokeLabels: ['manager-experimental-off'],
    matches: [...PAGE_HEADER_MATCHES, /^src\/ui\/svelte\/apps\/manager\/CraftingSystemManagerRoot\.svelte$/],
  },
  // The recipe editor publishes twelve distinct frames (overview/identity, ingredients, validation
  // tab, multi-step durations, the four Results-tab modes — routed-by-check, multi-step,
  // progressive, alchemy — tools, the restricted-visibility Access tab, and the Books & Scrolls tab
  // body).
  recipeEditFrame('manager-recipe-edit-normal', 'Manager recipe editor — overview / identity'),
  recipeEditFrame('manager-recipe-edit-ingredients', 'Manager recipe editor — ingredients (components, OR groups, tags)'),
  // Issue 684: the essence + currency-cost rows sit below the fold of the ingredients frame above,
  // so they get their own scrolled frame (the harness scrolls the last currency-cost row into view
  // before capturing).
  recipeEditFrame('manager-recipe-edit-ingredients-cost', 'Manager recipe editor — ingredients scrolled to essence + currency-cost rows (with steppers)'),
  recipeEditFrame('manager-recipe-edit-validation', 'Manager recipe editor — validation tab'),
  recipeEditFrame('manager-recipe-edit-multistep', 'Manager recipe editor — multi-step durations'),
  recipeEditFrame('manager-recipe-edit-results', 'Manager recipe editor — results (routed-by-check outcome sets)'),
  recipeEditFrame('manager-recipe-edit-results-multistep', 'Manager recipe editor — results (per-step content, multi-step)'),
  // Multi-step visibility gating (issue 710).
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
  // The Access tab is mode-conditional (issue 676 rehomed it from the deleted context rail).
  {
    ...recipeEditFrame('manager-recipe-edit-access-rail', 'Manager recipe editor — restricted-visibility Access tab (players and characters with access)'),
    // The rail's resolved player and character rows (issue 1790).
    matches: [...RECIPE_EDIT_MATCHES, /^src\/ui\/model\/recipeAccessRoster\.js$/],
  },
  // The Books & Scrolls tab body (issue 796).
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
    // `player-crafting-alternatives` (issue 552, the IngredientOptionSelector "Alternatives"
    // radiogroup) is listed first and also sorts alphabetically ahead of the other frames, so
    // `collect` (which copies the first candidate after an alphabetical sort) prefers it —
    // surfacing the per-slot option selector as the primary evidence for a change under crafting/.
    smokeLabels: [
      'player-crafting-alternatives',
      'player-crafting-simple',
      'player-crafting-ingredient-routed',
      'player-crafting-routed-by-check',
      'player-crafting-run-summary',
    ],
    // The presenter builds every row these frames render, including the headline Produces row a
    // multi-step recipe resolves from its terminal step (issue 1907), so a change to it belongs
    // here rather than in the `theme-or-global-ui` fallback.
    matches: [/^src\/ui\/svelte\/apps\/crafting\//, CRAFTING_LISTING_BUILDER_PATTERN],
  },
  {
    id: 'player-crafting-roll-prompt',
    label: 'Player crafting — interactive check roll prompt',
    smokeLabels: ['player-crafting-roll-prompt'],
    matches: [
      /^src\/ui\/svelte\/apps\/crafting\/(?:rollPrompt\.js|rollPromptHost\.js|RollPrompt(?:Footer|AdditionalDice)?\.svelte)$/,
      // Issue 2008: the additional-dice control's presenter.
      /^src\/ui\/presenters\/additionalDicePrompt\.js$/,
    ],
  },
  {
    id: 'player-crafting-essence-legacy',
    label: 'Player crafting — legacy set-level essence authored icon',
    smokeLabels: ['player-crafting-essence-legacy'],
    // Issue 1506 deleted the second matcher, which named the crafting essence thumbnail, rather
    // than re-pointing it: that component was retired into the shared art tile, so the pattern
    // could never match again while this test went on passing — a mirror whose guard cannot see its
    // own staleness.
    matches: [/^src\/ui\/svelte\/apps\/crafting\/detail\/IoTable\.svelte$/],
  },
  {
    id: 'player-crafting-essence-ingredient',
    label: 'Player crafting — first-class essence ingredient authored icon',
    smokeLabels: ['player-crafting-essence-ingredient'],
    // The essence-thumb matcher is deleted here too; see the block above for why, and for why
    // the IO table alone still carries this recipe.
    matches: [/^src\/ui\/svelte\/apps\/crafting\/detail\/IoTable\.svelte$/],
  },
  {
    id: 'player-crafting-essence-alternative',
    label: 'Player crafting — essence OR-alternative authored icon',
    smokeLabels: ['player-crafting-essence-alternative'],
    // Essence-thumb matcher deleted; see above. The option card is this recipe's own surface.
    matches: [/^src\/ui\/svelte\/apps\/crafting\/detail\/IngredientOptionSelector\.svelte$/],
  },
  {
    id: 'player-crafting-essence-shopping',
    label: 'Player crafting — Shopping List essence shortage authored icon',
    smokeLabels: ['player-crafting-essence-shopping'],
    // Essence-thumb matcher deleted; see above. The shopping list is this recipe's own surface.
    matches: [/^src\/ui\/svelte\/apps\/crafting\/ShoppingList\.svelte$/],
  },
  {
    id: 'player-crafting-stacked',
    label: 'Player crafting — narrow window stacked columns',
    smokeLabels: ['player-crafting-stacked'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//, /^src\/ui\/SvelteFabricateApp\.svelte\.js$/],
  },
  // Issue 752: the roll-result box (awarded pills + outcome) after a craft (evidence for #727's
  // pill fix).
  {
    id: 'player-crafting-roll-result',
    label: 'Player crafting — roll-result box (awarded pills + outcome)',
    smokeLabels: ['player-crafting-roll-result'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\/detail\//],
  },
  // The progressive player stage list (issue 651).
  {
    id: 'player-crafting-progressive',
    label: 'Player crafting — progressive stage list, reorder allowed (default)',
    smokeLabels: ['player-crafting-progressive'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//],
  },
  {
    // Its own view, not a preferred label on the resting one.
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
  // The explicit multi-step simple recipe detail (issue 765): per-step material blocks, the
  // multi-step hint strip, one terminal produces row, and no check card.
  {
    id: 'player-crafting-multistep',
    label: 'Player crafting — explicit multi-step simple recipe detail',
    smokeLabels: ['player-crafting-multistep'],
    matches: [/^src\/ui\/svelte\/apps\/crafting\//, CRAFTING_LISTING_BUILDER_PATTERN],
  },
  // The requirement-rail redesign (issue 917).
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
  // The player Alchemy workbench (issue 543) publishes three distinct frames — the discipline
  // chooser, the three-column workbench, and the narrow stacked layout.
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
  // Issue 752: the Journal with a crafting history run selected so the run-detail requirements card
  // (RunDetail + StepDetails) is visible (evidence for #748, and future #738).
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
  // The player salvage surface (issue 675). Deliberately narrow — the salvage tree and its panel
  // only, not `apps/inventory/**`.
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
    // Issue 764: the GM-facing Simple-mode misconfigured salvage cue — the
    // `SalvageMisconfiguredBody` with Simple-specific copy and the mode banner suppressed, for a
    // stored multi-success-group Simple config.
    id: 'player-salvage-misconfigured',
    label: 'Player salvage panel — Simple misconfigured cue (GM inventory)',
    smokeLabels: ['player-salvage-misconfigured'],
    matches: [/^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/SalvageMisconfiguredBody\.svelte$/],
  },
  {
    // Issue 777: the pre-roll required-tools disclosure — the `SalvageToolRequirements` section
    // with one available (green) and one unavailable (red) chip row, the state the existing
    // player-salvage capture walk cannot reach.
    id: 'player-salvage-tools',
    label: 'Player salvage panel — required-tools disclosure',
    smokeLabels: ['player-salvage-tools'],
    matches: [/^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/SalvageToolRequirements\.svelte$/],
  },
  {
    // Issue 766: the one-card-per-unified-physical-stack collapse — a single card for a stack
    // registered in two crafting systems, carrying the role=radiogroup System selector that
    // re-scopes the whole detail body.
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
  // Issue 752: the crafting result card posted to chat after a craft (evidence for #727's
  // roll-total fix).
  {
    id: 'chat-craft-card',
    label: 'Chat — crafting result card',
    smokeLabels: ['chat-craft-card'],
    matches: [
      /^src\/ui\/presenters\/CraftingChatCard\.js$/,
      /^src\/ui\/presenters\/SalvageChatCard\.js$/,
    ],
  },
  // Issue 2006: the success-counting result cards, rolled deterministically in real Foundry.
  {
    id: 'chat-craft-card-count',
    label: 'Chat — success-counting crafting result cards and their summed control',
    smokeLabels: [
      'chat-craft-card-count-pass',
      'chat-craft-card-count-fail',
      'chat-craft-card-count-botch',
      'chat-craft-card-count-zero',
      'chat-craft-card-count-bought',
      'chat-craft-card-over-control',
      // Issue 2007: the same count presenters also render the counting advantage case.
      'chat-craft-card-advantage-count',
    ],
    matches: [
      /^src\/ui\/presenters\/(?:countDiceTiles|countEvidenceRows)\.js$/,
      /^src\/systems\/countDisplayEvidence\.js$/,
    ],
  },
  // Issue 2005: the roll-under result cards and the refusal, against the summed roll-over control.
  {
    id: 'chat-craft-card-under',
    label: 'Chat — roll-under crafting result cards, their refusal and the roll-over control',
    // Issue 2007: the same sum-check presenters also render its keep, bonus-die and off cases.
    smokeLabels: [
      'chat-craft-card-under-pass',
      'chat-craft-card-under-fail',
      'chat-craft-card-under-otherwise',
      'chat-craft-card-under-misconfigured',
      'chat-craft-card-over-control',
      'chat-craft-card-advantage-keep',
      'chat-craft-card-advantage-keep-under',
      'chat-craft-card-advantage-bonus',
      'chat-craft-card-advantage-off',
    ],
    matches: [
      /^src\/ui\/presenters\/(?:checkDiceLine|checkEvidenceRows|checkDisplay|CraftingChatCard)\.js$/,
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
  // The source/identity section (issue 342) publishes two distinct frames (the unconfigured "Needs
  // configuration" state + the configured re-target picker).
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
  // The Manage Interactables panel publishes three distinct frames (populated list, expanded
  // promote form, dedicated empty state).
  {
    id: 'interactables-manager-list',
    label: 'Canvas Manage Interactables panel — populated list',
    smokeLabels: ['interactables-manager-list'],
    matches: [
      /^src\/ui\/svelte\/apps\/interactables\/InteractablesManagerRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/interactables\/InteractableRowChips\.svelte$/,
      /^src\/canvas\/regions\/interactableSceneScan\.js$/,
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
      /^src\/ui\/svelte\/apps\/interactables\/InteractableRowChips\.svelte$/,
      /^src\/canvas\/regions\/interactableSceneScan\.js$/,
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
    // The minimal core-window set for a change that can regress any surface: the global stylesheet,
    // a theme block, or the manager router that hosts every manager view.
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
      ...PAGE_HEADER_MATCHES,
    ],
  },
]);

export function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isUiFile(filePath) {
  const normalized = normalizePath(filePath);
  if (isPrimitiveLabPath(normalized)) return false;
  // `lang/` is deliberately excluded: a localization file is not itself a UI render target.
  return normalized.startsWith('src/ui/')
    || normalized.startsWith('styles/')
    || normalized.endsWith('.svelte')
    || normalized.endsWith('.css');
}

export function hasUiChanges(files = []) {
  return files.some(isUiFile);
}

export function mapChangedFilesToViews(files = []) {
  const normalizedFiles = files
    .map(file => logicalStylesheetPath(normalizePath(file)))
    .filter(file => file && !isPrimitiveLabPath(file));
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

// The flat, de-duplicated list of smoke labels the views a PR's changed files affect map to — the
// exact target set the scoped `screenshots` capture profile (`scripts/foundry-test-run.mjs`, issue
// #826) should capture.
export function smokeLabelsForChangedFiles(files = []) {
  const labels = [];
  for (const view of mapChangedFilesToViews(files)) {
    for (const label of view.smokeLabels) {
      if (!labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}

// A UI PR satisfies the screenshot check when its body has a "Screenshots" heading (any atx level —
// typically `##`) whose section contains at least one image.
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
  // The five evidence conditions.
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
  // Deduped, because the run records a set of target labels while a label may belong to more than
  // one view recipe (`manager-default-selection` is in both the systems view and the
  // theme-or-global-ui fallback).
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
  // The manifest records geometry only for a clipped capture: `screenshot()` writes
  // `options.clip?.width ?? null`, so an unclipped full-page frame declares null.
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

// Conservative label sanitization (salvaged from #823, Design H hardening #1). A view label flows
// unescaped into `![label](url)` alt-text + the managed PR-body block, an injection/block-breakout
// vector.
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

// A frame's caption, when it has one, sits beneath the image as its own paragraph rather than
// inside the alt text.
export function buildScreenshotMarkdown(prNumber, uploaded = []) {
  return uploaded
    .map(({ label, note, url }) => frameMarkdown(prNumber, sanitizeLabel(label), sanitizeLabel(note ?? ''), url))
    .join('\n\n');
}

/** One published frame: its image, then its already-sanitized caption as a quoted paragraph. */
function frameMarkdown(prNumber, alt, caption, url) {
  const normalizedPrNumber = normalizeOptionalPrNumber(prNumber);
  const prefix = normalizedPrNumber ? `pr-${normalizedPrNumber} ` : '';
  const image = `![${prefix}${alt}](${url})`;
  return caption ? `${image}\n\n> ${caption}` : image;
}

export function upsertScreenshotsBlock(body = '', blockMarkdown = '') {
  const text = String(body || '');
  // Include a `## Screenshots` heading so an auto-published body satisfies the
  // same check humans do (an image beneath a Screenshots heading).
  const inner = `${SCREENSHOTS_BLOCK_START}\n## Screenshots\n\n${blockMarkdown}\n${SCREENSHOTS_BLOCK_END}`;
  const block = locateManagedBlock(text);
  if (block) return `${text.slice(0, block.start)}${inner}${text.slice(block.end)}`;
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

// The S3 bucket, writer and PR-scoped key prefix (`<prefix>/<pr>[/<head-sha>]`) uploads go to.
async function s3Destination({ prNumber, headSha, root = ROOT, config, putObject }) {
  const normalizedPrNumber = requirePrNumber(prNumber, 'publish');
  const shaSegment = normalizeHeadShaSegment(headSha);
  const cfg = config || loadS3Config(root);
  if (!cfg.bucket || !cfg.baseUrl) {
    throw new Error('S3 is not configured. Set bucket/baseUrl in release.s3.config.json (or S3_RELEASE_BUCKET/RELEASE_BASE_URL).');
  }
  const put = putObject || await defaultS3PutFactory(cfg.region);
  const prScope = shaSegment
    ? `${cfg.prefix}/${normalizedPrNumber}/${shaSegment}`
    : `${cfg.prefix}/${normalizedPrNumber}`;
  return { cfg, put, prScope };
}

// Upload collected screenshots to S3.
export async function uploadScreenshotObjects({ prNumber, files = [], root = ROOT, config, putObject, headSha, labelForId = labelForCaseId, noteForId = evidenceNoteForCaseId } = {}) {
  const { cfg, put, prScope } = await s3Destination({ prNumber, headSha, root, config, putObject });
  const uploaded = [];
  for (const file of files) {
    const name = basename(file);
    const viewId = name.slice(0, name.length - extensionOf(file).length);
    const key = `${prScope}/${name}`;
    await put({ bucket: cfg.bucket, key, body: readFileSync(file), contentType: contentTypeFor(file) });
    const recipe = VIEW_RECIPES.find(item => item.id === viewId);
    const label = (labelForId && labelForId(viewId)) || (recipe ? recipe.label : viewId);
    const note = (noteForId && noteForId(viewId)) || '';
    uploaded.push({ viewId, label, note, url: `${cfg.baseUrl}/${key}`, key, file });
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

// Design-library frames (issue 2413) are supplementary and best-effort: the capture leaves
// `<frame-id>.png` files and `manifest.json` in the library directory, and every string the
// selection or the manifest carries reaches the PR body only through `libraryText`.
const LIBRARY_FRAME_FILE = /^[a-z0-9-]+\.png$/;
const LIBRARY_FRAME_ID = /^[a-z0-9-]+$/;
const LIBRARY_MANIFEST = 'manifest.json';
const LIBRARY_UNLOCATED_PREFIX = 'unlocated:';
const LIBRARY_ADDRESS_PREFIX = 'addr:';
const LIBRARY_REMOVED_KIND = 'removed';
const LIBRARY_TEXT_MAX = 200;
const LIBRARY_NOT_CAPTURED_MAX = 20;
const LIBRARY_SECTION_MAX = 20_000;
const LIBRARY_OMISSION_RESERVE = 200;

/** The `--library-targets` keys, comma- or newline-separated, deduplicated in order. */
function parseLibraryTargets(value = '') {
  return [...new Set(String(value ?? '').split(/[,\n]/).map(key => key.trim()).filter(Boolean))];
}

/** A manifest- or selection-sourced string made inert for the PR body and cut to 200 characters. */
function libraryText(value) {
  const cut = [...String(value ?? '')].slice(0, LIBRARY_TEXT_MAX).join('');
  return sanitizeLabel(cut.replaceAll('\\', '\\\\')).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** One line of the run log, so a manifest string cannot start a workflow command of its own. */
function libraryLogLine(value) {
  // eslint-disable-next-line no-control-regex
  return String(value).replaceAll(/[\u{0}-\u{1F}\u{7F}]+/gu, ' ');
}

/** The library directory's frame PNGs by id, and its manifest or why there is none. */
function readLibraryArtifact(dir) {
  const empty = { pngs: new Map(), manifest: null, problem: 'missing' };
  if (!dir) return empty;
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    return error.code === 'ENOENT' ? empty : { ...empty, problem: `unreadable (${error.message})` };
  }
  const pngs = new Map(names.filter(name => LIBRARY_FRAME_FILE.test(name))
    .sort((a, b) => (a < b ? -1 : 1))
    .map(name => [name.slice(0, -'.png'.length), join(dir, name)]));
  if (!names.includes(LIBRARY_MANIFEST)) return { ...empty, pngs };
  try {
    const manifest = JSON.parse(readFileSync(join(dir, LIBRARY_MANIFEST), 'utf8'));
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error('it is not a JSON object');
    }
    return { pngs, manifest, problem: null };
  } catch (error) {
    return { pngs, manifest: null, problem: `unreadable (${error.message})` };
  }
}

const listOf = value => (Array.isArray(value) ? value : []);
const entryId = entry => String(typeof entry === 'string' ? entry : entry?.id);
const problemText = problem => (typeof problem === 'string' ? problem : (problem?.message ?? JSON.stringify(problem)));

/** The note an `unlocated:<file>:<count>` selection key stands for. */
function unlocatedNote(key) {
  const rest = key.slice(LIBRARY_UNLOCATED_PREFIX.length);
  const split = rest.lastIndexOf(':');
  const [file, count] = split === -1 ? [rest, 'some'] : [rest.slice(0, split), rest.slice(split + 1)];
  return `could not locate ${count} hunk(s) in ${file}; touched units may be missing`;
}

/** The manifest's frames whose PNG arrived, the selection keys they account for, and the rest. */
function manifestFrames(manifest, pngs) {
  const frames = [];
  const accounted = new Set();
  const notCaptured = [];
  for (const frame of listOf(manifest.frames)) {
    if (typeof frame?.id !== 'string' || !LIBRARY_FRAME_ID.test(frame.id)) {
      notCaptured.push(`${entryId(frame)}: not a library frame id`);
      continue;
    }
    for (const key of listOf(frame.targets)) accounted.add(String(key));
    const label = frame.label || `Library · ${frame.id}`;
    const file = pngs.get(frame.id);
    if (file) frames.push({ id: frame.id, file, label, note: frame.note ?? '' });
    else notCaptured.push(`${label}: image missing from the artifact`);
  }
  return { frames, accounted, notCaptured };
}

/** The `addr:` keys of `removed` notes: deleted rows whose drawing the head library dropped. */
const removedAddresses = manifest => listOf(manifest.notes)
  .filter(note => note?.kind === LIBRARY_REMOVED_KIND && typeof note.key === 'string' && note.key.startsWith(LIBRARY_ADDRESS_PREFIX))
  .map(note => note.key);

/**
 * Reconciles the selected keys against the library artifact: the frames to publish, and a line
 * for every failure, overflow, unrecorded key, lab problem and unlocated hunk, but none for a
 * removed address.
 */
function reconcileLibrary(targets, artifact) {
  const units = targets.filter(key => !key.startsWith(LIBRARY_UNLOCATED_PREFIX));
  const notCaptured = targets.filter(key => key.startsWith(LIBRARY_UNLOCATED_PREFIX)).map(unlocatedNote);
  const { manifest, pngs } = artifact;
  if (!manifest) {
    if (units.length > 0 || pngs.size > 0) {
      notCaptured.push(`the library manifest is ${artifact.problem}, so the ${units.length} selected unit(s) could not be reconciled`);
    }
    const frames = [...pngs].map(([id, file]) => ({ id, file, label: `Library · ${id}`, note: '' }));
    return { frames, notCaptured };
  }
  const found = manifestFrames(manifest, pngs);
  notCaptured.push(...found.notCaptured);
  for (const failure of listOf(manifest.failures)) {
    found.accounted.add(entryId(failure));
    notCaptured.push(`${entryId(failure)}: ${failure?.reason ?? 'failed'}`);
  }
  for (const entry of listOf(manifest.overflow)) {
    found.accounted.add(entryId(entry));
    notCaptured.push(`${entryId(entry)}: over the library unit cap`);
  }
  for (const key of removedAddresses(manifest)) found.accounted.add(key);
  notCaptured.push(
    ...units.filter(unit => !found.accounted.has(unit)).map(key => `${key}: no record in the library manifest`),
    ...listOf(manifest.labProblems).map(problem => `Primitive Lab reported: ${problemText(problem)}`),
  );
  return { frames: found.frames, notCaptured };
}

/** Uploads each library frame on its own, so one failed object costs that frame and no other. */
async function uploadLibraryFrames(frames, { cfg, put, prScope }) {
  const uploaded = [];
  const failed = [];
  for (const frame of frames) {
    const key = `${prScope}/library/${frame.id}.png`;
    try {
      await put({ bucket: cfg.bucket, key, body: readFileSync(frame.file), contentType: contentTypeFor(frame.file) });
      uploaded.push({ ...frame, key, url: `${cfg.baseUrl}/${key}` });
    } catch (error) {
      failed.push(`${frame.label}: upload failed: ${error.message}`);
    }
  }
  return { uploaded, failed };
}

async function publishLibraryFrames(library, destinationOptions) {
  if (library.frames.length === 0) return { uploaded: [], notCaptured: library.notCaptured };
  const { uploaded, failed } = await uploadLibraryFrames(library.frames, await s3Destination(destinationOptions));
  return { uploaded, notCaptured: [...library.notCaptured, ...failed] };
}

function libraryNotCapturedMarkdown(notCaptured) {
  if (notCaptured.length === 0) return '';
  const lines = notCaptured.slice(0, LIBRARY_NOT_CAPTURED_MAX).map(entry => `- ${libraryText(entry)}`);
  const rest = notCaptured.length - lines.length;
  if (rest > 0) lines.push(`- and ${rest} more; see the run log`);
  return `**Not captured**\n\n${lines.join('\n')}`;
}

/** The managed block's `### Library` section, at most 20,000 characters. */
function buildLibrarySection(prNumber, { uploaded = [], notCaptured = [] } = {}) {
  const heading = '### Library';
  const tail = libraryNotCapturedMarkdown(notCaptured);
  let budget = LIBRARY_SECTION_MAX - heading.length - tail.length - LIBRARY_OMISSION_RESERVE;
  const parts = [heading];
  let omitted = 0;
  for (const frame of uploaded) {
    const chunk = frameMarkdown(prNumber, libraryText(frame.label), libraryText(frame.note), frame.url);
    if (omitted === 0 && chunk.length + 2 <= budget) {
      parts.push(chunk);
      budget -= chunk.length + 2;
    } else {
      omitted += 1;
    }
  }
  if (uploaded.length === 0) parts.push('library capture produced no frames; see the run log');
  if (omitted > 0) {
    parts.push(`${omitted} more frame(s) omitted to keep this section under 20,000 characters; see the run log`);
  }
  if (tail) parts.push(tail);
  return parts.join('\n\n');
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
  libraryDir,
  libraryTargets = '',
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
  const targets = parseLibraryTargets(libraryTargets);
  const library = reconcileLibrary(targets, readLibraryArtifact(libraryDir && resolve(root, libraryDir)));
  const hasLibrary = targets.length > 0 || library.frames.length > 0;
  if (files.length === 0 && !hasLibrary) {
    return {
      skipped: true,
      reason: `No screenshots to publish in ${relative(root, destinationRoot).replaceAll(sep, '/')}`,
      uploaded: [],
    };
  }

  const uploaded = files.length > 0
    ? await uploadScreenshotObjects({ prNumber: normalizedPrNumber, files, root, config, putObject, headSha, labelForId })
    : [];
  const libraryResult = await publishLibraryFrames(library, { prNumber: normalizedPrNumber, headSha, root, config, putObject });

  const repoArgs = repo ? ['--repo', repo] : [];
  const view = runGh(['pr', 'view', String(normalizedPrNumber), ...repoArgs, '--json', 'body', '--jq', '.body']);
  if (view.status !== 0) {
    throw new Error(`Failed to read PR #${normalizedPrNumber} body: ${view.stderr || 'unknown error'}`);
  }
  const currentBody = String(view.stdout || '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const blockMarkdown = [
    buildScreenshotMarkdown(normalizedPrNumber, uploaded),
    hasLibrary ? buildLibrarySection(normalizedPrNumber, libraryResult) : '',
  ].filter(Boolean).join('\n\n');
  const newBody = upsertScreenshotsBlock(currentBody, blockMarkdown);

  // Never inside the output directory, which a library-only run does not have.
  const bodyFile = join(mkdtempSync(join(tmpdir(), 'fabricate-pr-body-')), 'pr-body.md');
  writeFileSync(bodyFile, newBody);
  const edit = runGh(['pr', 'edit', String(normalizedPrNumber), ...repoArgs, '--body-file', bodyFile]);
  if (edit.status !== 0) {
    throw new Error(`Failed to update PR #${normalizedPrNumber} body: ${edit.stderr || 'unknown error'}`);
  }

  return { skipped: false, uploaded, library: libraryResult, destinationRoot, bodyFile };
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

// Single spawn path for every git call so `readChangedFilesFromGit` and `resolveDefaultBase` share
// one implementation.
function runGit(args, { root = ROOT } = {}) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' }); // NOSONAR S4036 — git-from-PATH is the intended dev-tool contract (see note above)
}

// Resolve the exact source revision shared by the screenshot producer and collector.
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
  // Three-dot `<base>...HEAD` is merge-base semantics: "what did this branch change since it forked
  // from <base>", applied to both the resolved-default and explicit --base paths so bare `plan`
  // never disagrees with `plan --base <ref>`.
  const result = runGit(['diff', '--name-only', `${base}...HEAD`], { root });
  if (result.status !== 0) throw new Error(result.stderr || `git diff failed with status ${result.status}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

// Resolve a default base ref when the caller supplies neither --base nor --changed-files.
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
    // An empty string is A value, not a missing one.
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

// Resolve the changed-file set from, in precedence order: --changed-files (read line-by-line),
// --base (diff against that ref), else a resolved default base.
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
// renders as the literal string `true` / `false`.
function parseCaptureEligible(value) {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`--capture-eligible must be the literal 'true' or 'false', not '${value}'`);
}

// `--capture-timeout-minutes` pins the gate's capture deadline to the summed stage
// `timeout-minutes` of `pr-screenshots.yml` — select, warm-foundry, the longer of render and
// verify-chrome, then capture.
function parseCaptureTimeoutMs(value) {
  if (value === undefined || value === '') return undefined;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`--capture-timeout-minutes must be a positive number of minutes, not '${value}'`);
  }
  return minutes * 60_000;
}

// The jsonl `{filename, patch}` stream `gh api …/pulls/{n}/files --jq '… | @json'` emits, read into
// the patch map `mapChangedFilesToCases` narrows its case selection with.
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

// The run log of a publish: every uploaded object, and every library unit not captured.
function reportPublished(result, prNumber) {
  if (result.skipped) {
    console.log(result.reason);
    return;
  }
  for (const item of result.uploaded) {
    console.log(`${item.viewId} <= ${item.url}`);
  }
  for (const item of result.library.uploaded) console.log(`library/${item.id} <= ${item.url}`);
  for (const entry of result.library.notCaptured) console.log(`Library not captured: ${libraryLogLine(entry)}`);
  const libraryCount = result.library.uploaded.length;
  const librarySuffix = libraryCount > 0 ? ` and ${libraryCount} library frame${libraryCount === 1 ? '' : 's'}` : '';
  console.log(`Updated PR #${normalizeOptionalPrNumber(prNumber)} body with ${result.uploaded.length} screenshot${result.uploaded.length === 1 ? '' : 's'}${librarySuffix}.`);
}

// Apply the module's verdict.
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
  // Base resolution is scoped to the commands that consume the changed-file set.
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
    // Print the scoped `screenshots`-profile target label set (CSV) for the changed files, for
    // `FOUNDRY_SCREENSHOT_TARGET_LABELS` / `--target-labels`.
    const changedFiles = loadChanged();
    console.log(smokeLabelsForChangedFiles(changedFiles).join(','));
    return;
  }

  if (command === 'check') {
    // A thin adapter, deliberately. No ordering, no re-read, no pass/fail decision and no restated
    // bound literal may live here: all of that is `decideScreenshotGate`, where a test can see it.
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
      // `|| undefined` so an empty flag means "absent" and the module's own exported default
      // applies, rather than `''` reaching the runs query as `workflows//runs`.
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
      libraryDir: args.libraryDir,
      libraryTargets: args.libraryTargets,
    });
    reportPublished(result, args.pr);
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
