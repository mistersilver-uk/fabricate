/**
 * The cascade guard for the `manager-button` → `ManagerButton` sweep (issue 1118).
 * BE PRECISE ABOUT WHAT ENTERS THE DERIVED SET, because this docblock used to claim more than
 * the file delivers and a reviewer proved it by experiment: append a fresh
 * `.fabricate-manager .manager-header-actions .manager-button.is-ghost { font-size: 3rem }`
 * to the sheet and BOTH guards stay green. A NEW RULE does not red this gate. The instrument
 * finds a call site by the literal `class="manager-button…"`, task 9 removed the last of
 * those, so `convertingSites` is empty and `atRisk` is empty BY CONSTRUCTION — a new rule
 * derives no candidate to be missing from the reviewed list.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { managerButtonCascade } from '../helpers/manager-button-cascade.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const cascade = managerButtonCascade();

/** The conversion LEDGER: the batches whose sites no longer appear in the derived corpus. */
const CONVERTED_BATCHES = Object.freeze([
  Object.freeze({
    task: 5,
    files: Object.freeze([
      // 39 sites — 30 `<button>` and 9 `<a href>` — less 2 that issue 1707 phase 2 moved into
      // `environment/GatheringTaskInspector.svelte` (the drop Duplicate/Delete pair) and 2 its
      // phase 3 moved into `environment/GatheringInspectorRail.svelte` (the empty-library setup
      // card's docs links), both below. Issue 1720 split the root's remaining 35 across the
      // page header's three action units, 29 of them leaving. The sum over the six rows is 39.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
        sites: 6,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/ManagerHeaderActions.svelte',
        sites: 8,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/ManagerHeaderCraftingActions.svelte',
        sites: 9,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/ManagerHeaderGatheringActions.svelte',
        sites: 12,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/environment/GatheringInspectorRail.svelte',
        sites: 2,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/environment/GatheringTaskInspector.svelte',
        sites: 2,
      }),
    ]),
  }),
  Object.freeze({
    task: 6,
    files: Object.freeze([
      // 23 sites across eight browser views. Two carried a forgotten `primary`.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte',
        sites: 7,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/SystemsBrowserView.svelte', sites: 3 }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte',
        sites: 3,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte',
        sites: 3,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte', sites: 2 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/EssenceBrowserView.svelte', sites: 2 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte', sites: 2 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte', sites: 1 }),
    ]),
  }),
  Object.freeze({
    task: 7,
    files: Object.freeze([
      // 14 sites across the two library inspectors and the four shared shells.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte',
        sites: 6,
      }),
      // 4 -> 0 AT ISSUE 1371's C7.6. The stacked action column of four `.manager-button`s is
      // gone: the reference draws ONE primary plus a kebab, so the inspector now renders a
      // single `InspectorActionButton` — a primitive whose own header records that it is
      // deliberately NOT `.manager-button` — with the other three commands as `ActionMenu`
      // DATA rather than as controls. Licensed by the same rule as every other movement in
      // this ledger: the four SITES left the product, rather than leaving this instrument's
      // view. The entry is kept at 0 rather than dropped, so the two ledger checks below —
      // that the file writes no literal `class="manager-button"` and that the instrument
      // derives no site in it — keep guarding it against a regression.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/components/ComponentBrowserInspector.svelte',
        sites: 0,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/ItemPageInspector.svelte', sites: 1 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte', sites: 1 }),
      Object.freeze({
        file: 'src/ui/svelte/components/EditorValidationSurface.svelte',
        sites: 1,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/ExplainerCard.svelte', sites: 1 }),
    ]),
  }),
  Object.freeze({
    task: 8,
    files: Object.freeze([
      // 14 sites across the recipe editor tree, all `<button>` — 13 booked here now.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte',
        sites: 4,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipe/RecipeResultsSection.svelte',
        sites: 2,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipe/RecipeIngredientsSection.svelte',
        sites: 2,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipe/RecipeIngredientSetCard.svelte',
        sites: 2,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/RecipeStepsCard.svelte', sites: 1 }),
      // REMOVED at issue 1444, and the removal is recorded rather than performed silently.
      // The entry was `recipe/RecipeValidationTab.svelte`, booked for the ONE `<ManagerButton>`
      // its issue rows rendered as the View deep-link. That tab renders through
      // `EditorValidationSurface` now, and the surface already draws that button from its OWN
      // booked site (task 7 above) — so the control did not change file, it MERGED into one
      // the ledger already holds, and the recipe tab renders no button of its own at all.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipe/RecipeBooksScrollsTab.svelte',
        sites: 1,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipe/RecipeAccessTab.svelte',
        sites: 1,
      }),
    ]),
  }),
  Object.freeze({
    task: 9,
    files: Object.freeze([
      // 38 sites across the remaining eighteen components, all `<button>`.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
        sites: 4,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte',
        sites: 4,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte',
        sites: 4,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
        sites: 3,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/AccessTabView.svelte', sites: 2 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/BooksScrollsView.svelte', sites: 2 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/KnowledgeView.svelte', sites: 2 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/SystemEditView.svelte', sites: 2 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/VocabularyPanel.svelte', sites: 2 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/checks/ChecksView.svelte', sites: 2 }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/component/ComponentEditorHeader.svelte',
        sites: 2,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/environment/CompositionList.svelte',
        sites: 2,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte',
        sites: 2,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/ImportReportModal.svelte', sites: 1 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte', sites: 1 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/SystemOverviewView.svelte', sites: 1 }),
      // REBOOKED AT 0 BY ISSUE 1517, not dropped. See the fifth licensed movement below.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/environment/EnvironmentValidationTab.svelte',
        sites: 0,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/knowledge/KnowledgeOwnedCopyRow.svelte',
        sites: 1,
      }),
    ]),
  }),
  Object.freeze({
    // Not one of tasks 1-9: issue #1286 landed a NEW hand-written manager button —
    // `ComponentComplicationsSection.svelte`'s "Add complication" — on `main` while this sweep
    // was still in flight, and this branch's own standing guard (this file) caught it on
    // rebase by naming the file. It converts the same way task 8's "Add a step" and task 9's
    // three `ComponentEditView` "Add result"/"Add group" sites did — `dashed` and `fullWidth`,
    // the append-a-row verb at the foot of the single-column list it appends to — so the
    // conserved totals below moved from 128/41 to 129/42, the SAME numbers the sweep was
    // planned against before `GatheringRealmQuickList` was found to be dead code. They are
    // 128/41 again since issue 1444; see the totals paragraph for why that is a licensed
    // move rather than a countdown.
    task: 'post-plan (issue 1118, catching #1286)',
    files: Object.freeze([
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/component/ComponentComplicationsSection.svelte',
        sites: 1,
      }),
    ]),
  }),
]);

// Code point, not `localeCompare`, for the same reason `sourceScan.js` gives.
const byCodePoint = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

// The nine entries that changed disposition at task 9 all changed it for ONE reason.
const MOVED_POPULATION =
  'MOVED to EXCLUDE by task 9, on the POPULATION and not on the reasoning: superseding this ' +
  'rule on a converted button is still the design, but the last literal site converted, so ' +
  'every site the tool can still derive it to reach is one of the 18 the sweep holds back. ';

const SHEET = 'styles/fabricate.css';
// The sweep's one population-C site.
/**
 * The one population-B site issue 1371 r10 converted onto `SearchablePopover`'s `triggerButton`
 * form, and the site issue 1371 r13 then DELETED under maintainer ruling M13. Named here so the
 * count assertion below can re-derive from the tree that the population shrank for the right
 * reason — by a conversion and then a removal, never by a slide back to a hand-written token.
 */
const POPULATION_B_RETIRED_SITE_FILE =
  'src/ui/svelte/apps/manager/scoped/WorldComponentCataloguePage.svelte';
/** The primitive whose trigger form that site was the first consumer of. It outlives the site. */
const SEARCHABLE_POPOVER_FILE = 'src/ui/svelte/components/SearchablePopover.svelte';

const POPULATION_C_FILE = 'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte';
const globalRule = (selector) => `${SHEET}#${selector}`;

/** The class the conversion REMOVES from a call site, and the tag-free probe for it. */
const CONTRACT_CLASS = 'manager-button';
const writesContractLiteral = (source) =>
  [...source.matchAll(/class="([^"]*)"/g)].some((match) =>
    match[1].split(/\s+/).filter(Boolean).includes(CONTRACT_CLASS)
  );
const scopedRule = (component, selector) => `src/ui/svelte/apps/manager/${component}#${selector}`;

/** The reviewed cascade list. */
const REVIEWED = [
  // ── RECHAIN: the three that live in a component's own <style> block ───────────────────
  // It did NOT re-chain in one piece, and the reason is worth keeping: a third control inside
  // that row is `RecipeRoutingAssignment`'s "Add tag", a `SearchablePopover` trigger rendered
  // from a class STRING. It is population B, it never gains `fab-manager-button`, and a single
  // chained selector would have snapped it back to the default 34px beside the two 28px
  // controls it sits with — the same stranding hazard as `.manager-knowledge-row-actions
  // .manager-button` below, found in a second place. The rule split in three: the two
  // converted buttons by the primitive's class, the trigger by its own, and a (0,5,0) restate
  // for `InlineVocabularyAdd`'s `role="primary"` Add, whose padding the `is-primary` companion
  // would otherwise have taken at a tie. The trigger half is EXCLUDE below; the other two key
  // on `fab-manager-button` and are PRIMITIVE rules here rather than candidates.

  // ── INTENDED: the primitive is designed to supersede these ────────────────────────────
  {
    id: globalRule('.fabricate-button.manager-button.is-ghost:not(:disabled)'),
    disposition: 'INTENDED',
    convertedReach: [
      // TWO since issue 1373: `World Tool` joined `Back to Tool Rules` on the ghost role,
      // because `proto:2601` and `proto:2602` are one style string and the two buttons sit
      // side by side.
      { file: 'src/ui/svelte/apps/manager/ToolEditView.svelte', role: 'ghost', buttons: 2 },
      {
        file: 'src/ui/svelte/apps/manager/component/ComponentEditorHeader.svelte',
        role: 'ghost',
        buttons: 1,
      },
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderActions.svelte',
        role: 'ghost',
        buttons: 1,
      },
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderCraftingActions.svelte',
        role: 'ghost',
        buttons: 2,
      },
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderGatheringActions.svelte',
        role: 'ghost',
        buttons: 3,
      },
    ],
    why:
      "The primitive's `is-ghost` keeps a RESTING border where this rule has none. Beating it " +
      'is the documented purpose of the companion rule. The `:not(:disabled)` qualifier is ' +
      "task 4's disabled repair, not a change of meaning — see `.manager-button:disabled`. " +
      'No LITERAL `is-ghost` site is left for the tool to derive (task 9), so the population ' +
      'is named instead: every ghost in the manager is a `role="ghost"` prop now, and the ' +
      'three components below are counted from the tree rather than asserted in prose.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.is-ghost:not(:disabled):hover'),
    disposition: 'INTENDED',
    convertedReach: [
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderGatheringActions.svelte',
        role: 'ghost',
        buttons: 3,
      },
    ],
    why:
      'The hover half of the same deliberate override. Its population is the resting rule`s, ' +
      'so it names the largest single holder of it rather than restating all three.',
  },
  {
    id: globalRule('.fabricate-manager .manager-header-actions .manager-button'),
    disposition: 'INTENDED',
    convertedReach: [
      // 29 until issue 1720 split the group across three units. The container's class token
      // lives only in `ManagerHeaderActions.svelte`, so the two family units it dispatches
      // into are counted WHOLE-FILE: every button they hold is inside this container by
      // construction, and no synthetic token is added to their roots to make the filter work.
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderActions.svelte',
        container: 'manager-header-actions',
        buttons: 8,
      },
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderCraftingActions.svelte',
        buttons: 9,
      },
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderGatheringActions.svelte',
        buttons: 12,
      },
      {
        file: 'src/ui/svelte/apps/manager/ToolEditView.svelte',
        container: 'manager-header-actions',
        // 3 -> 4 with issue 1373's `World Tool` header action.
        buttons: 3,
      },
    ],
    why:
      'The 38px control this rule declared is RETIRED (task 4): the maintainer ruled 34px, ' +
      'which is what the Tool Studio renders and what the primitive re-declares. What is left ' +
      "is the container's own TYPE scale, 0.72rem, which it states across all three of its " +
      'children — button, chip and save-error. The primitive states the same 0.72rem with no ' +
      'ancestor requirement, so the tie it used to derive was provably zero-pixel. With task ' +
      '9 that tie is no longer derivable at all: every button in this container is a ' +
      '`<ManagerButton>` now, including the two `ComponentEditorHeader` renders into the ' +
      'root`s copy of it, which no static count can attribute to either file. So the ' +
      'container`s OWN population is counted from the tree instead.',
  },
  {
    id: globalRule('.fabricate-manager .manager-header-actions .manager-button.is-primary'),
    disposition: 'INTENDED',
    convertedReach: [
      // 15 until issue 1720 split the group; the two family units are counted whole-file for
      // the reason the row above gives.
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderActions.svelte',
        container: 'manager-header-actions',
        role: 'primary',
        buttons: 4,
      },
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderCraftingActions.svelte',
        role: 'primary',
        buttons: 5,
      },
      {
        file: 'src/ui/svelte/apps/manager/ManagerHeaderGatheringActions.svelte',
        role: 'primary',
        buttons: 6,
      },
      {
        file: 'src/ui/svelte/apps/manager/ToolEditView.svelte',
        container: 'manager-header-actions',
        role: 'primary',
        buttons: 1,
      },
    ],
    why:
      "The same container statement for the header's loudest action: `0 var(--fab-space-4)` " +
      'and weight 700, which are exactly what `.manager-button.fab-manager-button.is-primary` ' +
      'states. Zero-pixel either way, and it is what emphasises a header primary the primitive ' +
      'does not render. Its `is-ghost` sibling was RETIRED instead, because a role’s PAINT ' +
      'belongs to the role — the container keeps only its own scale.',
  },
  {
    id: globalRule('.fabricate-manager .manager-knowledge-row-actions .manager-button'),
    disposition: 'EXCLUDE',
    stranding: ['src/ui/svelte/components/ArmedDangerButton.svelte:115'],
    why:
      MOVED_POPULATION +
      'The move is unusually clean here, because this entry always rested on the site that ' +
      'is left: the knowledge row`s `ArmedDangerButton`. ' +
      'Deliberately NOT re-chained, and the one place where this instrument is wrong about ' +
      'its own corpus. `collectSites` gives every non-population-B site the primitive class, ' +
      'including `ArmedDangerButton`, which is held out of the conversion and renders the ' +
      'tokens `fabricate-button manager-button is-danger` from its own markup (the family root ' +
      'leads it since issue 1502) — so the tool believes a chained ' +
      'selector would still reach it. It would not. Both knowledge rows render an ' +
      '`ArmedDangerButton` inside this container, and chaining would leave that Delete at the ' +
      'ambient ~1rem beside the 0.72rem Expend button next to it, which is the exact ' +
      'regression this rule was written to fix. Its three values are the ones the primitive ' +
      'copied FROM this block, so the tie is zero-pixel.',
  },
  {
    id: globalRule('.fabricate-manager .manager-knowledge-reset-actions .manager-button'),
    disposition: 'INTENDED',
    convertedReach: [
      {
        file: 'src/ui/svelte/apps/manager/KnowledgeView.svelte',
        container: 'manager-knowledge-reset-actions',
        buttons: 2,
      },
    ],
    why:
      'The sibling selector in the same comma group, which also heads `.manager-tool-edit-' +
      'actions .manager-button` — the Tool Studio cluster that IS the authority the primitive ' +
      'copied. Same three values, so the tie was zero-pixel; splitting the group to chain one ' +
      'third of it would restate the authority instead of adopting it. Task 9 converted both ' +
      'of the controls in this container, so the tie is no longer derivable and the container ' +
      'names them instead.',
  },
  {
    id: globalRule(
      '.fabricate-manager[data-manager-view="components"] .manager-toolbar .manager-button'
    ),
    disposition: 'INTENDED',
    convertedReach: [
      {
        file: 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte',
        container: 'manager-toolbar',
        buttons: 1,
      },
    ],
    why:
      'NEWLY at risk at task 4, which put it there: at (0,4,0) it used to beat the ' +
      "primitive's (0,3,0) control outright, and the re-chained bespoke rules are (0,4,0) too, " +
      'so it tied them. Every tie was same-value — this rule and the sort-direction rule ' +
      'both state `var(--fab-recipe-control-font)`, and the primitive states the 0.72rem that ' +
      'token resolves to. The one overlap that was NOT identical is against ' +
      '`.manager-clear-filters` (0.78rem), and no `manager-clear-filters` control renders in ' +
      "the components view — that browser's Clear filters carries no bespoke class. Recorded " +
      'rather than hidden: if one ever lands there, this rule wins by order. The container ' +
      'names what it actually holds, which is ONE control: the sort-direction toggle. That ' +
      "browser's Clear filters converted in task 6 too, but it sits in the filtered empty " +
      'state rather than in the toolbar, and this rule never reached it.',
  },

  // ── EXCLUDE: reaches only population-B triggers ───────────────────────────────────────
  {
    id: globalRule('.fabricate-manager button'),
    disposition: 'EXCLUDE',
    why:
      MOVED_POPULATION +
      "Foundry's `font: inherit` reset. It was the font-size winner for 55 converting sites " +
      'plus 11 that declared nothing at all, and the primitive pins 0.72rem over every one of ' +
      'them; the 18 unconverted controls still take their size from it.',
  },
  {
    id: globalRule('.fabricate-button'),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE REVIEWED LIST BEFORE — the review-r3 fix wrote it, and EXCLUDE here is a ' +
      'STRUCTURAL instruction rather than a population one. This is the family`s bare-element ' +
      'type baseline, `font: inherit`, and it is deliberately rooted at the family root ALONE ' +
      'at (0,1,0) so that it is a FLOOR: high enough to beat the user agent`s button font in a ' +
      'host that declares nothing, and too low to beat a caller`s per-site rule at (0,2,0). ' +
      'Chaining `fab-manager-button` onto it would raise it above exactly those rules and turn ' +
      'the floor back into an override — which is how it deleted `.manager-recipe-lock``s and ' +
      '`.manager-recipe-edit``s 0.68rem and rendered both glyphs 28.7% larger. Never re-chain ' +
      'this one; `re-rooted-controls-host-independence.test.js` pins its specificity.',
  },
  {
    id: globalRule('.fabricate-button.manager-button'),
    disposition: 'EXCLUDE',
    why:
      MOVED_POPULATION +
      'Both base control rules share this selector, and they are what a population-B trigger ' +
      'is still made of: the geometry, the radius and the surface. Re-chaining either would ' +
      'leave those triggers with no control treatment at all.',
  },
  {
    id: globalRule('.fabricate-button.manager-button:disabled'),
    disposition: 'EXCLUDE',
    why:
      'MOVED NO_CONFLICT -> EXCLUDE by task 9, and its NO_CONFLICT filing is worth keeping ' +
      'because it recorded THE REPAIR: this was the sharpest RECHAIN the instrument found — ' +
      "the base disabled paint at (0,3,0), beaten outright by the primitive's `is-ghost` and " +
      '`is-dashed` companions at (0,4,0), so a DISABLED manager button kept its enabled ' +
      "colours in every role, visibly, on `ToolEditView`'s ghost Back for the whole of a save. " +
      'Task 4 qualified every rule that states a resting paint with `:not(:disabled)` rather ' +
      'than chaining this one above them, precisely because this selector also serves ' +
      '`.manager-icon-button` and every hand-written button the sweep does not convert — which ' +
      'is the same reason it is EXCLUDE now rather than merely safe.',
  },
  {
    id: globalRule('.fabricate-button.manager-button:not(:disabled):hover'),
    disposition: 'EXCLUDE',
    why:
      MOVED_POPULATION +
      'The base hover paint, which the role hover companions at (0,6,0) are meant to beat. It ' +
      'also ties the resting role companions at (0,4,0) and wins on order alone, which the ' +
      'sweep must not disturb.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.is-danger:not(:disabled)'),
    disposition: 'EXCLUDE',
    why:
      'MOVED NO_CONFLICT -> EXCLUDE by task 9. It reached 11 converting sites and shared no ' +
      'property with any primitive rule that matched them; the ONE site it still reaches is ' +
      '`ArmedDangerButton`, which is where a manager danger button now comes from when it did ' +
      'not come from a `role="danger"` prop.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.is-danger:not(:disabled):hover'),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE REVIEWED LIST BEFORE: while `is-danger` sites were literal this rule beat ' +
      'everything that matched them outright, and it entered the derived set only when its ' +
      'population narrowed to `ArmedDangerButton`. The hover half of the entry above.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.is-subtle'),
    disposition: 'EXCLUDE',
    why:
      'MOVED NO_CONFLICT -> EXCLUDE by task 9, and it is the delta`s worked example for a ' +
      'PASS-THROUGH class rather than a seventh role. Its two literal sites converted and ' +
      'carry `is-subtle` through the primitive`s appending `class` prop; the four left are ' +
      'population-B triggers, which is what makes it EXCLUDE.',
  },
  {
    id: scopedRule(
      'ImportFolderMappingModal.svelte',
      '.manager-import-mapping-row .manager-button.manager-recipe-routing-add-trigger'
    ),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE REVIEWED LIST BEFORE — task 9 wrote it. It is the half of the discharged ' +
      'mapping-row rule that must NOT key on the primitive: the row`s "Add tag" is a ' +
      '`SearchablePopover` trigger rendered from `RecipeRoutingAssignment``s `triggerClass` ' +
      'string, so naming it by its own trigger class is the only way it keeps the row`s 28px ' +
      'scale beside the two converted controls it sits with.',
  },

  {
    id: scopedRule(
      'scoped/SystemRulesRoster.svelte',
      '.manager-scoped-roster-system .manager-button.is-danger'
    ),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE REVIEWED LIST BEFORE — issue 1372 wrote it, and its round-8 extraction moved ' +
      'it into `SystemRulesRoster`, which both essence rails compose. The panel`s system ' +
      'rows carry `MembershipActions`, whose Remove is an `ArmedDangerButton`: it renders ' +
      '`manager-button is-danger` from its own template and never gains `fab-manager-button`, ' +
      'so this rule cannot be re-chained onto the primitive. What it states is a SIZE taken ' +
      'from the layout context — 26px rather than the page-level 34px — because five of those ' +
      'rows plus three cards, a search field and a pager have to fit one 300px inspector ' +
      'column, which is the arrangement the prototype draws (`essences.png`).',
  },

  {
    id: globalRule(
      '.fabricate-manager .manager-component-entry-row-actions .manager-button.is-danger'
    ),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE REVIEWED LIST BEFORE — issue 1371`s parity round 4 wrote it. The world Component entry`s system rows draw removal as a 26px square EXIT ICON in the row`s own clothing (`proto:944`) rather than as a labelled danger button, and the control is the shared `ArmedDangerButton`: it renders `manager-button is-danger` from its own template and never gains `fab-manager-button`, so this rule cannot be re-chained onto the primitive. What it states is a SIZE and a surface taken from the layout context — the arm/disarm two-step, the Escape and blur disarm and the single-armed-token invariant are all still the primitive`s. The twin of the `SystemRulesRoster` entry above.',
  },

  {
    id: globalRule(
      '.fabricate-manager .manager-component-entry-row-actions .manager-button.is-danger:not(:disabled)'
    ),
    disposition: 'EXCLUDE',
    why:
      'The PAINT half of the entry above. Geometry is unqualified and colour is not, which is the split `.manager-button:disabled` requires: switching the exit icon off must take its colours from the primitive and keep the 26px square it had when enabled.',
  },

  {
    id: globalRule(
      '.fabricate-manager .manager-component-entry-danger-body .manager-button.is-danger'
    ),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE REVIEWED LIST BEFORE — issue 1371`s parity round 4 wrote it. Deletion moved out of the header band and into a `Delete from the world` danger CARD at the foot of the Catalogue entry tab (`proto:928-936`), whose action is an `ArmedDangerButton` and so can never gain `fab-manager-button`. What it states is the card`s own treatment: the 34px rung (32 is retired), radius 9, and a transparent fill on the card`s danger hairline rather than the sheet`s filled danger face, which on a `--fab-danger-soft` card would be a danger block inside a danger block.',
  },

  {
    id: globalRule(
      '.fabricate-manager .manager-component-entry-danger-body .manager-button.is-danger:not(:disabled)'
    ),
    disposition: 'EXCLUDE',
    why:
      'The PAINT half of the entry above, split from its geometry for the same reason.',
  },

  {
    id: scopedRule(
      'tools/ToolReplacementTarget.svelte',
      '.manager-tool-replacement .manager-tool-replacement-tile:where() ' +
        '.manager-tool-replacement-component-trigger'
    ),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE REVIEWED LIST BEFORE - issue 1373`s round-2 parity pass wrote it. The ' +
      'replacement Component control is a `SearchablePopover` trigger rendered from this ' +
      'card`s own `triggerClass` string, so it never gains `fab-manager-button` and this rule ' +
      'cannot be re-chained onto the primitive. What it states is that the FILLED face is the ' +
      'design`s tile (`proto:2205`) rather than a select: the box moves to the row that holds ' +
      'the trigger and the unlink, and the trigger itself is neutralised to a chromeless ' +
      'region inside it.',
  },
  {
    id: scopedRule(
      'tools/ToolReplacementTarget.svelte',
      '.manager-tool-replacement .manager-tool-replacement-drop:where() ' +
        '.manager-tool-replacement-component-trigger'
    ),
    disposition: 'EXCLUDE',
    why:
      'The EMPTY face`s half of the entry above, and the same population: one ' +
      '`SearchablePopover` trigger, from the same `triggerClass` string. It states the 28px ' +
      'inline search pill the design draws inside the drop zone (`proto:2216`) against the ' +
      'sheet`s `width: 100%`, which had made the affordance a second full-width select.',
  },

  {
    id: globalRule('.fabricate-button.manager-button.is-dashed'),
    disposition: 'EXCLUDE',
    why:
      'The geometry half of the RECONCILED bare dashed treatment, and now population B only. ' +
      "Task 4 copied the primitive's control geometry down onto this selector — minus " +
      '`width`, which moved to `is-full-width` — so the four `SearchablePopover` dashed ' +
      'triggers render the same control as the converted buttons beside them in the same row.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.is-dashed:not(:disabled)'),
    disposition: 'EXCLUDE',
    why:
      'The paint half of the same reconciliation, split out so the disabled rule can win. ' +
      'Accent → muted was the ruled repaint on the ten literal dashed sites, and the four ' +
      'population-B triggers took it too, deliberately: they sit in the same rows. With the ' +
      'ten converted (task 8) the triggers are all that is left.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.is-dashed:not(:disabled):hover'),
    disposition: 'EXCLUDE',
    why: 'The hover half of the same ruling, likewise reconciled to the primitive.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.manager-checks-preview-actor-trigger'),
    disposition: 'EXCLUDE',
    why:
      'The Checks preview actor popover trigger. `SearchablePopover` renders it from a class ' +
      'string, so it never gains `fab-manager-button`.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.manager-salvage-component-trigger'),
    disposition: 'EXCLUDE',
    why: 'Salvage component popover trigger, population B.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.manager-recipe-component-trigger'),
    disposition: 'EXCLUDE',
    why:
      "NOT IN THE SEEDED LIST as its own entry: the seed named only the group's first line, " +
      'and this is the second of its three selectors, reaching two more population-B triggers.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.manager-tool-replacement-component-trigger'),
    disposition: 'EXCLUDE',
    why: 'The third selector of that same group, likewise population B only.',
  },
  {
    id: globalRule(
      '.fabricate-manager .manager-tool-replacement-card .manager-tool-replacement-component-trigger'
    ),
    disposition: 'EXCLUDE',
    why: 'NOT IN THE SEEDED LIST. The tool replacement card`s own override of that trigger.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.manager-travel-parties-override-trigger'),
    disposition: 'EXCLUDE',
    why: 'Travel parties override popover trigger, population B.',
  },
  // REMOVED at issue 1371 r10, and the removal is recorded rather than performed silently.
  // The two entries were `.manager-button.manager-world-component-register-action` and its
  // `:not(:disabled):hover`, dispositioned EXCLUDE one revision earlier because the world
  // Component catalogue`s `+ Register item` was a `SearchablePopover` `triggerClass` site —
  // population B, never gaining `fab-manager-button`, so the rule`s 38px height and 9px corner
  // could not be re-chained without repainting a control the sweep was not converting. r10 gave
  // the popover a `triggerButton` form and that site used it, so the two rules kept only the
  // site`s paint and took no disposition here at all: the instrument derived no call site for
  // them, and EXCLUDE — whose whole content is `reaches a site, and no CONVERTING one` — could
  // no longer be asserted of them.
  {
    id: globalRule('.fabricate-picker .manager-travel-picker-trigger'),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE SEEDED LIST. The (0,2,0) shared treatment behind four population-B ' +
      'triggers; re-chaining it would repaint controls the sweep is not converting. Its ' +
      'root is the picker primitive`s own namespace class rather than the manager`s since ' +
      'issue 1464 unscoped the family, which is the same (0,2,0) at the same position.',
  },
  // REMOVED at issue 1427, and the removal is recorded rather than performed silently.
  // The entry was `BulkDeleteCard.svelte#.fab-bulk-delete-card .manager-button`, dispositioned
  // EXCLUDE because its only site is `ArmedDangerButton`, which never gains the primitive class.

  // ── NO_CONFLICT: derived NOT at risk.
  {
    id: globalRule('.fabricate-button.manager-button.is-warning-action:not(:disabled)'),
    disposition: 'NO_CONFLICT',
    // WAS DEAD, and is the sweep's one entry to move in that direction. Its old `why` said the
    // entry 'should go live rather than away', and this is that: the primitive's sixth role
    // emits this class, and the control that always meant to render it now does. Named the same
    // way the other converted-reach entries are, by the role prop rather than by a container,
    // because the role IS the reach.
    convertedReach: [
      {
        file: 'src/ui/svelte/apps/manager/environment/CompositionList.svelte',
        role: 'warning',
        buttons: 1,
      },
    ],
    why:
      'Paint only — `border-color`, `color` and `background` — against a primitive that states ' +
      'geometry and no colour, so the two cannot collide whatever the source order. That is ' +
      "the delta's stated reason for admitting `warning` as a role at all, now measured rather " +
      'than argued. Its `.manager-icon-button` sibling in the same comma group is what the ' +
      'quick-action Force add beside it renders, and the pair agree by construction.',
  },
  {
    id: globalRule('.fabricate-button.manager-button.is-primary:not(:disabled)'),
    disposition: 'NO_CONFLICT',
    // The primary paint reaches no LITERAL site at all now.
    convertedReach: [
      { file: 'src/ui/svelte/apps/manager/SystemsBrowserView.svelte', role: 'primary', buttons: 1 },
      {
        file: 'src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte',
        role: 'primary',
        buttons: 1,
      },
      { file: 'src/ui/svelte/apps/manager/ImportReportModal.svelte', role: 'primary', buttons: 1 },
    ],
    why:
      "30 converting sites, and it declares only paint while the primitive's `is-primary` " +
      'companion declares only padding and font-weight. No shared property, so no repaint — ' +
      'the same reasoning the delta gives for `is-warning-action`, now measured.',
  },
  // `.fabricate-manager .manager-add-button` was NO_CONFLICT here and is DISCHARGED (issue 1118,
  // task 6). It was RECHAIN at r3: at (0,2,0) it lost its width, padding and font-size to the
  // primitive and the `is-primary` companion, inside a 48px grid track that clipped the label.
  {
    id: globalRule('.fabricate-manager .manager-setup-links .manager-button'),
    disposition: 'NO_CONFLICT',
    // The sweep has now converted EVERY site this rule reaches.
    convertedReach: [
      {
        file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
        container: 'manager-setup-links',
        buttons: 6,
      },
      // Two of the root's eight left with the empty-library setup card issue 1707 phase 3 moved
      // into the inspector rail; the sum over the two rows is unchanged.
      {
        file: 'src/ui/svelte/apps/manager/environment/GatheringInspectorRail.svelte',
        container: 'manager-setup-links',
        buttons: 2,
      },
      {
        file: 'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte',
        container: 'manager-setup-links',
        buttons: 3,
      },
      {
        file: 'src/ui/svelte/apps/manager/ExplainerCard.svelte',
        container: 'manager-setup-links',
        buttons: 1,
      },
    ],
    why:
      'The setup card`s docs-link row, and the explainer card`s. It declares `flex`, ' +
      '`justify-content` and `text-decoration`; the primitive declares none of the three — ' +
      'the base control states the same `justify-content: center` at (0,2,0) and loses to ' +
      'this rule anyway — so every site it reaches is untouched by the conversion.',
  },

  // ── DEAD: real rules, zero call sites ─────────────────────────────────────────────────
];

const idsWith = (...dispositions) =>
  REVIEWED.filter((entry) => dispositions.includes(entry.disposition)).map((entry) => entry.id);

const dispositionById = new Map(REVIEWED.map((entry) => [entry.id, entry.disposition]));

test('the reviewed cascade list has no duplicate entry', () => {
  assert.equal(dispositionById.size, REVIEWED.length, 'every reviewed id appears exactly once');
});

/**
 * Both directions of the at-risk equality, stated separately because task 9 broke their symmetry.
 */
test('every mechanically derived at-risk rule is reviewed as RECHAIN or INTENDED', () => {
  const derived = [...new Set(cascade.atRisk.map((entry) => entry.rule.id))].sort(byCodePoint);
  const reviewed = new Set(idsWith('RECHAIN', 'INTENDED'));
  assert.deepEqual(
    derived.filter((id) => !reviewed.has(id)),
    [],
    'a rule that ties with or loses to the primitive AND shares a declared property must be ' +
      'reviewed here — an unreviewed one is a silent repaint waiting to ship'
  );
});

test('every reviewed RECHAIN or INTENDED rule is still at risk, or names what it now reaches', () => {
  const derived = new Set(cascade.atRisk.map((entry) => entry.rule.id));
  for (const entry of REVIEWED) {
    if (!['RECHAIN', 'INTENDED'].includes(entry.disposition)) continue;
    if (derived.has(entry.id)) continue;
    assert.ok(
      Array.isArray(entry.convertedReach) && entry.convertedReach.length > 0,
      `${entry.id} no longer derives at risk and names no converted reach, so it was retired, ` +
        're-chained or has gone dead and this entry is stale'
    );
    assertConvertedReach(entry);
  }
});

test('every reviewed EXCLUDE rule would lose to the primitive but reaches no converting site', () => {
  const derived = [...new Set(cascade.excluded.map((entry) => entry.rule.id))].sort(byCodePoint);
  assert.deepEqual(
    derived,
    [...new Set(idsWith('EXCLUDE'))].sort(byCodePoint),
    'these rules must NOT be re-chained: they serve `SearchablePopover` triggerClass sites, or ' +
      '`ArmedDangerButton`, which never gain `fab-manager-button`. A new entry here means the ' +
      'sweep has a rule it would repaint by re-chaining.'
  );
  for (const entry of cascade.excluded) {
    assert.ok(
      entry.matches.length > 0 && entry.matches.every((match) => !match.site.converting),
      `${entry.rule.id} must reach at least one site and no converting site`
    );
  }
});

/**
 * The end of an opening tag: the first `>` that is not the tail of an `=>`.
 *
 * @param {string} source component source text
 * @param {number} from an offset inside the opening tag
 * @returns {number} the offset of the tag's closing `>`, or -1
 */
function endOfOpeningTag(source, from) {
  let cursor = from;
  do {
    cursor = source.indexOf('>', cursor + 1);
  } while (cursor > 0 && source[cursor - 1] === '=');
  return cursor;
}

/**
 * Container classes a shared primitive emits itself, mapped to the tag that emits them.
 * One entry as this lands. It is a mapping rather than a fallback because the two things it
 * distinguishes must not be conflated: a class WRITTEN in a calling file is found by the marker
 * below, and a class a CHILD COMPONENT emits can only be found by its tag. Nothing derives this
 * automatically, so a second bar-shaped primitive needs a line here —
 * `tests/components/manager-filter-bar-source-contract.test.js` is what makes that visible, by
 * refusing a raw element carrying the class anywhere else.
 */
const CONTAINER_PRIMITIVES = Object.freeze({ 'manager-toolbar': 'ManagerToolbar' });

/**
 * Every region of `source` enclosed by an element whose class list holds `containerClass`.
 * The class attribute is matched by TOKEN rather than as the whole attribute value, because
 * `.manager-header-actions` is written bare in the manager root and composed with
 * `manager-tool-edit-actions` in the Tool Studio — and an exact-string match would silently
 * report the authority screen as rendering none of the buttons the rule types.
 *
 * @param {string} source component source text
 * @param {string} containerClass the container's own class token
 * @returns {Array<string>} the inner text of each occurrence of that container
 */
function regionsInside(source, containerClass) {
  const regions = [];
  const owner = CONTAINER_PRIMITIVES[containerClass];
  // Both boundaries as lookarounds, never `\b`: `\b` matches before a hyphen AND after one.
  const marker = new RegExp(
    owner
      ? String.raw`class="[^"]*(?<![\w-])${containerClass}(?![\w-])[^"]*"|<${owner}[\s/>]`
      : String.raw`class="[^"]*(?<![\w-])${containerClass}(?![\w-])[^"]*"`,
    'g'
  );
  for (let hit = marker.exec(source); hit; hit = marker.exec(source)) {
    const open = hit[0].startsWith('<') ? hit.index : source.lastIndexOf('<', hit.index);
    const tag = /^<([a-zA-Z][\w-]*)/.exec(source.slice(open))?.[1];
    if (!tag) continue;
    const cursor = endOfOpeningTag(source, open);
    if (cursor < 0) continue;
    const boundary = new RegExp(String.raw`<${tag}\b|</${tag}>`, 'g');
    boundary.lastIndex = cursor;
    let depth = 1;
    let end = -1;
    for (let step = boundary.exec(source); step; step = boundary.exec(source)) {
      depth += step[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = step.index;
        break;
      }
    }
    if (end < 0) continue;
    regions.push(source.slice(cursor, end));
  }
  return regions;
}

/**
 * How many `<ManagerButton>`s a component renders that a rule with this shape would reach.
 *
 * @param {string} source component source text
 * @param {{container?: string, role?: string}} shape what the rule demands of the button
 * @returns {number} the count
 */
function primitivesMatching(source, { container, role }) {
  const scopes = container ? regionsInside(source, container) : [source];
  let total = 0;
  for (const scope of scopes) {
    for (const opening of scope.matchAll(/<ManagerButton[\s/>]/g)) {
      const end = endOfOpeningTag(scope, opening.index);
      if (end < 0) continue;
      if (role && !scope.slice(opening.index, end).includes(`role="${role}"`)) continue;
      total += 1;
    }
  }
  return total;
}

/**
 * The obligation an entry takes on when the tool can no longer derive a call site for its rule.
 *
 * @param {{id: string, convertedReach: Array<object>}} entry the reviewed entry
 */
function assertConvertedReach(entry) {
  assert.ok(cascade.ruleFor(entry.id), `${entry.id} should still be declared in the sheet`);
  for (const { file, buttons, container, role } of entry.convertedReach) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8');
    assert.equal(
      primitivesMatching(source, { container, role }),
      buttons,
      `${entry.id} books ${file} as rendering ${buttons} primitives it reaches`
    );
    assert.ok(
      !writesContractLiteral(source),
      `${file} is booked as converted but still writes a literal \`${CONTRACT_CLASS}\` class token`
    );
  }
}

test('every reviewed NO_CONFLICT rule still reaches a manager button and is derived safe', () => {
  for (const entry of REVIEWED) {
    if (entry.disposition !== 'NO_CONFLICT') continue;
    const candidate = cascade.candidateFor(entry.id);

    if (candidate) {
      assert.equal(
        candidate.losses.length,
        0,
        `${entry.id} should still share no property it can lose`
      );
      assert.ok(
        candidate.matches.some((match) => match.site.converting) ||
          Array.isArray(entry.convertedReach),
        `${entry.id} should still reach a converting site, or name the converted ones`
      );
      continue;
    }

    // No literal call site left. That is either "the sweep converted them all".
    assert.ok(
      Array.isArray(entry.convertedReach) && entry.convertedReach.length > 0,
      `${entry.id} reaches no call site the instrument can see and names no converted ones, ` +
        'so it is DEAD rather than NO_CONFLICT'
    );
    assertConvertedReach(entry);
  }
});

test('every reviewed DEAD rule is a real rule in the sheet with no call site at all', () => {
  for (const id of idsWith('DEAD')) {
    assert.ok(cascade.ruleFor(id), `${id} should still be declared — a typo here passes silently`);
    assert.ok(
      !cascade.candidateFor(id),
      `${id} now reaches a call site and is no longer dead; give it a live disposition`
    );
  }
});

test('a site the sweep does not convert is never modelled as carrying the primitive class', () => {
  // The instrument used to hand `fab-manager-button` to everything outside population B.
  const unconverted = cascade.sites.filter((site) => !site.converting);
  const wrong = unconverted.filter((site) => site.classes.has('fab-manager-button'));
  assert.deepEqual(
    wrong.map((site) => site.id),
    [],
    'a site the sweep does not convert must be scored on its literal classes alone'
  );
  // Non-vacuity in the direction that actually rotted.
  const heldBack = unconverted.filter((site) => site.population !== 'B');
  assert.ok(
    heldBack.length > 0,
    'at least one non-population-B site is held back from the conversion, or this proves nothing'
  );
  // The other half used to read "every converting site IS scored with the primitive class".
  assert.equal(
    unconverted.length,
    cascade.sites.length,
    'with the conversion complete every literal call site left is one the sweep holds back'
  );
});

test('every reviewed entry that claims a control would be stranded still reaches it', () => {
  // `stranding` is the machine-checkable half of an INTENDED filing that rests on "chaining
  // this would strand a control the sweep cannot convert". Prose cannot notice the day that
  // control moves out of the container; this can.
  for (const entry of REVIEWED) {
    if (!entry.stranding) continue;
    const candidate = cascade.candidateFor(entry.id);
    assert.ok(candidate, `${entry.id} should still be a rule that matches a call site`);
    const reached = candidate.matches
      .filter((match) => !match.site.converting)
      .map((match) => match.site.id);
    for (const site of entry.stranding) {
      assert.ok(
        reached.includes(site),
        `${entry.id} no longer reaches ${site}, so the reason it was not re-chained has expired`
      );
    }
  }
});

test('the tie assertion is not silently skipping every entry it was written for', () => {
  // `tieDivergence` is opt-in, and the loop below skips any entry without it.
  const declared = REVIEWED.filter((entry) => Array.isArray(entry.tieDivergence)).length;
  const derivedTies = cascade.candidates.filter((candidate) =>
    candidate.losses.some((loss) => loss.verdict.startsWith('ties'))
  );
  assert.equal(
    declared,
    derivedTies.length,
    'every rule that TIES the primitive on a converted button must name the divergences it ' +
      'tolerates, and only those rules may carry a `tieDivergence`'
  );
});

test('every reviewed zero-pixel tie really does declare the same value on both sides', () => {
  // The load-bearing claim behind the container-rule INTENDED filings is not "the primitive
  // wins" — it is "which of the two wins cannot be seen". A TIE is what makes that claim
  // necessary, because a tie is settled by source order and this sweep reorders the sheet; an
  // outright loss is settled by specificity and needs no such defence. So the assertion is
  // scoped to ties, and it names the divergences it tolerates rather than tolerating any.
  for (const entry of REVIEWED) {
    if (!Array.isArray(entry.tieDivergence)) continue;
    const candidate = cascade.candidateFor(entry.id);
    assert.ok(candidate, `${entry.id} should still be a rule that matches a call site`);
    const ties = candidate.losses.filter((loss) => loss.verdict.startsWith('ties'));
    assert.ok(
      ties.length > 0,
      `${entry.id} no longer ties anything, so its zero-pixel claim is stale rather than proven`
    );
    assert.deepEqual(
      [...new Set(ties.flatMap((loss) => loss.divergent))].sort(byCodePoint),
      [...entry.tieDivergence].sort(byCodePoint),
      `${entry.id} ties the primitive on a property whose VALUE differs, so source order is ` +
        'visible after all — either the values were changed apart, or this entry needs a ' +
        'disposition that does something about it rather than recording that it is harmless'
    );
  }
});

test('the corpus is not vacuous, so the assertions above cannot pass over nothing', () => {
  // The floors that make the equality above mean something. Each one failed at least once
  // while this instrument was being built: a `<style>` named inside a docblock swallowed one
  // component\'s whole markup, and Svelte's scoping hash made every scoped rule match nothing.
  assert.ok(cascade.rules.length > 4000, `parsed ${cascade.rules.length} rules`);

  // The sweep's total is a CONSERVED quantity, not a countdown.
  const converted = CONVERTED_BATCHES.flatMap((batch) => batch.files);
  assert.equal(
    cascade.convertingSites.length + converted.reduce((total, file) => total + file.sites, 0),
    123,
    'the conversion is 123 sites, whether or not a given one has been converted yet'
  );
  assert.equal(
    new Set(cascade.convertingSites.map((site) => site.file)).size + converted.length,
    46,
    // 41 -> 42 (issue 1707 phase 2), -> 43 (phase 3): the root's task-5 sites split across the two
    // files they moved into. -> 46 (issue 1720), across the page header's three action units.
    // The 123-site total above is unchanged, because nothing converted.
    'across 46 components'
  );

  // …and the ledger is not allowed to be fiction. A converted file must actually render the
  // primitive at least as many times as it claims, and must carry none of the literal the
  // instrument keys on — otherwise a wrong number here would silently buy back the total the
  // two assertions above are defending.
  for (const { file, sites } of converted) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8');
    const rendered = source.match(/<ManagerButton[\s/>]/g)?.length ?? 0;
    assert.ok(
      rendered >= sites,
      `${file} is booked as ${sites} converted sites but renders ManagerButton ${rendered} times`
    );
    assert.ok(
      !writesContractLiteral(source),
      `${file} is booked as converted but still writes a literal \`${CONTRACT_CLASS}\` class token`
    );
    assert.ok(
      !cascade.convertingSites.some((site) => site.file === file),
      `${file} is booked as converted but the instrument still derives call sites in it`
    );
  }
  // Population B has no converted-ledger half — it is named DEBT.
  // That component is where the system Tool editor's one-line replacement picker went when the
  // design's full card — a drop zone with `Click to search`, or a filled tile with an unlink —
  // shipped at both scopes, and the two faces are two `triggerClass` sites where the block it
  // replaced had one. The count moves by one rather than by two for that reason. Both stay
  // unconverted on the standing argument above.
  // AND SIX LEFT AT ISSUE 1373's MAINTAINER ROUND 5, taking the count to 12. The repair and
  // ingredient row converged on the design's own anatomy (`proto:2248`), which is a kind
  // `<select>` plus a field the GM types into — so the row's three `SearchablePopover` triggers
  // (component, essence, currency unit) are not triggers any more, they are an inline search
  // with its suggestions beneath it, and the two set-level adders that were PICKERS became
  // plain dashed `<ManagerButton>`s that create an empty row. The sixth is `+ Tag`, which the
  // design draws as a dashed tag-tinted PILL (`proto:2256`) and which is a `triggerChip` now,
  // writing no `manager-button` class at all.
  assert.equal(
    cascade.sites.filter((site) => site.population === 'B').length,
    12,
    'plus the 12 SearchablePopover triggerClass sites still named as debt'
  );
  // ...AND THE ONE THAT LEFT LEFT BY CONVERSION AND THEN BY RULING.
  const retiredSite = readFileSync(resolve(repoRoot, POPULATION_B_RETIRED_SITE_FILE), 'utf8');
  assert.ok(
    !/<SearchablePopover\b/.test(retiredSite),
    `${POPULATION_B_RETIRED_SITE_FILE} renders no popover at all since M13 — a trigger here ` +
      'would be a 13th population-B site or a converted one, and either is a change to this count'
  );
  assert.ok(
    !retiredSite.includes('triggerClass="manager-button'),
    `${POPULATION_B_RETIRED_SITE_FILE} must not write the population-B token again`
  );
  assert.match(
    readFileSync(resolve(repoRoot, SEARCHABLE_POPOVER_FILE), 'utf8'),
    /\n\s*triggerButton = null,/,
    `${SEARCHABLE_POPOVER_FILE} should still declare the \`triggerButton\` form: it is the ` +
      'primitive`s, and it outlives the consumer M13 removed'
  );
  // Population C was the sweep's ONE backtick-template `class={…}` attribute.
  assert.equal(
    cascade.sites.filter((site) => site.population === 'C').length,
    0,
    'the one backtick-template call site converted in task 9'
  );
  assert.match(
    readFileSync(resolve(repoRoot, POPULATION_C_FILE), 'utf8'),
    /<ManagerButton\b[^]*?class=\{`is-subtle manager-import-mapping-skip/,
    `${POPULATION_C_FILE} should still build the skip toggle's class from a template, on the ` +
      'primitive — a template that vanished would satisfy the count above by deletion'
  );
  assert.ok(cascade.primitives.length >= 8, `${cascade.primitives.length} primitive rules`);
  // The scoped component sheets must still be reaching the comparison. This used to be stated
  // over the at-risk set, which task 9 emptied; the two scoped rules that survive the sweep are
  // both EXCLUDE now — `BulkDeleteCard`'s, whose only site is `ArmedDangerButton`, and
  // `ImportFolderMappingModal`'s trigger half — so the floor moves one set across rather than
  // being dropped.
  assert.ok(
    cascade.excluded.some((entry) => entry.rule.scopedTo),
    'at least one scoped component rule is in the derived comparison, or the scoped sheets are ' +
      'not being parsed at all'
  );
  // A repaint is a winner change on an UNCONVERTED literal site.
  assert.deepEqual(
    cascade.repaints.map((change) => change.property),
    [],
    'the conversion is complete, so no literal call site is left whose cascade winner could ' +
      'change — a repaint here means a raw `manager-button` class token has come back'
  );
});

test('the manager-button cascade inventory', () => {
  // The report is the deliverable, not a side effect.
  console.log(cascade.renderInventory(dispositionById));
});
