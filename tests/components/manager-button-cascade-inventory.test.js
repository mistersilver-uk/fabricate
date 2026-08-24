/**
 * The cascade guard for the `manager-button` → `ManagerButton` sweep (issue 1118).
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────────────────
 * Converting a hand-written manager button adds a second class, `fab-manager-button`, and
 * `styles/fabricate.css` declares `.fabricate-manager .manager-button.fab-manager-button` at
 * (0,3,0). EVERY rule a converted button matches is therefore re-arbitrated, and a rule that
 * wins today only because it appears later in the sheet loses the moment the sweep is licensed
 * to move declarations around.
 *
 * Three rounds of plan review each enumerated that hazard BY HAND, and each round found a band
 * the previous had missed: bespoke classes at (0,2,0); then ancestor-context rules at (0,3,0)
 * that tie and lose on source order, across 27 sites in one `<div>`; then thirteen more
 * selectors at that level plus one inside a container everybody had certified as safe. The
 * defect is the method, not the diligence — so this file stops enumerating and starts
 * measuring. `tests/helpers/manager-button-cascade.js` derives the set by construction from
 * the real sheet, the real compiled scoped component sheets, and the real markup.
 *
 * ── IT IS A GUARD, AND IT GUARDS A NARROWER THING THAN IT LOOKS ──────────────────────────
 * The shape is `tests/components/mounted-harness-primitive-allowlist.test.js`'s: a reviewed
 * list held next to a mechanically derived one, asserted equal.
 *
 * BE PRECISE ABOUT WHAT ENTERS THE DERIVED SET, because this docblock used to claim more than
 * the file delivers and a reviewer proved it by experiment: append a fresh
 * `.fabricate-manager .manager-header-actions .manager-button.is-ghost { font-size: 3rem }`
 * to the sheet and BOTH guards stay green. A NEW RULE does not red this gate. The instrument
 * finds a call site by the literal `class="manager-button…"`, task 9 removed the last of
 * those, so `convertingSites` is empty and `atRisk` is empty BY CONSTRUCTION — a new rule
 * derives no candidate to be missing from the reviewed list.
 *
 * What the derived ⊆ reviewed half actually catches is a RETURNING RAW SITE: a hand-written
 * `class="manager-button"` re-entering `src/`, which re-populates the site set, makes rules
 * at risk again, and reds on the ones nobody has reviewed. That is a real regression class
 * and worth guarding; it is simply not the same one.
 *
 * WHAT FORWARD COVER THERE IS COMES FROM TWO OTHER PLACES, and neither is here:
 *  - the `convertedReach` re-derivation below, which walks the real tree per reviewed entry,
 *    so a rule whose reach changes reds even with no literal sites left; and
 *  - `manager-layout.test.js`'s disabled-invariant probe, which DERIVES its container list
 *    from the sheet and renders all six roles in every one of them, so an ancestor-context
 *    rule added later is measured in a real browser with no edit there. That probe is what
 *    caught the two container rules beating `.manager-button:disabled` after this instrument
 *    had scored both of them and reported neither.
 *
 * That probe covers ONE invariant — the disabled paint is role- and container-independent —
 * and the 3rem experiment above is deliberately outside it, because container GEOMETRY
 * legitimately varies: the drop inspector's stack states 28px, the Checks Studio's preset row
 * 30px, and a probe asserting one height everywhere would be asserting a rule the design does
 * not hold. Re-run the mutation against that probe and it stays green too. So the honest
 * position is that a new ancestor-context rule stating a NEW GEOMETRY has no automated cover
 * in this repository today; a new one stating resting PAINT does.
 *
 * The honest summary is the one the TERMINAL STATE section below already gives; this heading
 * used to contradict it two paragraphs earlier.
 *
 * ── THE DISPOSITIONS ─────────────────────────────────────────────────────────────────────
 * - `RECHAIN`  — at risk on a converting site. Re-chain it above the primitive or retire it.
 * - `INTENDED` — at risk, and that is the POINT: the primitive is designed to SUPERSEDE this
 *                rule, so re-chaining it would undo the conversion. This disposition is not
 *                in the assignment's original four; the tool forced it, because the derived
 *                set includes the base control rules and the Foundry `button` reset that the
 *                primitive exists to supersede, and filing those as `EXCLUDE` would confuse
 *                "must not be re-chained because it serves unconverted sites" with "must not
 *                be re-chained because winning is the design".
 *
 *                The stylesheet reconciliation widened it, deliberately and once, to cover a
 *                CONTAINER rule that states a value the primitive re-states identically with
 *                no ancestor requirement. `.manager-header-actions .manager-button` and the
 *                two knowledge clusters are that shape: superseding them is the design, the
 *                residual tie is provably zero-pixel, and they are what types a button the
 *                primitive does not render — a hand-written one during the sweep, or an
 *                `ArmedDangerButton`, which is held out of the conversion for good. Each such
 *                entry carries its own proof in `why`; none is a RECHAIN filed quietly.
 * - `EXCLUDE`  — would be at risk, but every site it reaches is a `SearchablePopover`
 *                `triggerClass` site that never gains `fab-manager-button`. Re-chaining it
 *                would repaint a control the sweep is not converting.
 * - `NO_CONFLICT` — reaches converting sites and is derived NOT at risk. Documented because
 *                the delta reasons about these rules; the list is deliberately not exhaustive.
 * - `DEAD`     — a real rule in the sheet with zero call sites in any population.
 *
 * ── THE TERMINAL STATE, AND WHY IT MOVES DISPOSITIONS ────────────────────────────────────
 * This instrument finds a call site by the LITERAL `class="manager-button…"` — which is
 * exactly the thing a conversion removes. Task 9 converted the last of the 128, so the only
 * literal sites left in `src/` are the 16 population-B `SearchablePopover` triggers and
 * `ArmedDangerButton`, and every rule in the sheet is now judged against those 17 alone. Two
 * things follow, and both are re-filings rather than changes of fact:
 *
 *  - A rule that still reaches one of the 17 and would lose to the primitive derives EXCLUDE,
 *    because "every site it reaches is unconverted" is now true of it. Nine entries moved
 *    INTENDED or NO_CONFLICT → EXCLUDE for that reason alone, including the base control
 *    rules and Foundry's `button` reset. Their meaning is unchanged — superseding them on a
 *    CONVERTED button is still the design — and EXCLUDE now carries the operative half:
 *    re-chaining one would repaint the 17 controls the sweep deliberately did not convert.
 *  - A rule that reaches NONE of the 17 derives no candidate at all, and the instrument cannot
 *    tell "alive, but only on converted buttons" from "dead" without being told. Filing those
 *    as DEAD would be a lie that costs the guard its teeth, so each names its `convertedReach`
 *    instead — which components render the buttons it reaches, and how many — and the tests
 *    below re-derive that from the tree. `.manager-setup-links .manager-button` was the first
 *    of these (task 7); task 9 made it the normal case.
 *
 * ── WHAT IT DOES NOT DECIDE ──────────────────────────────────────────────────────────────
 * Nothing about pixels. Specificity here is computed, not measured; `manager-layout.test.js`
 * remains the real-browser gate. This file tells that gate, and the sweep, where to look — and
 * the inventory it prints names its own blind spots rather than hiding them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { managerButtonCascade } from '../helpers/manager-button-cascade.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const cascade = managerButtonCascade();

/**
 * The conversion LEDGER: the batches whose sites no longer appear in the derived corpus.
 *
 * A converted site stops being a call site in this instrument's terms — it no longer writes
 * `class="manager-button…"`, so nothing keys on it — while remaining one of the 128 the sweep
 * is accountable for. Recording each landed batch here is what lets the non-vacuity floor keep
 * asserting the WHOLE population instead of shrinking with it.
 *
 * It is not merely bookkeeping: the floor verifies every entry against the tree, so a batch
 * cannot book sites it did not convert, and cannot book a file it emptied by deleting controls.
 */
const CONVERTED_BATCHES = Object.freeze([
  Object.freeze({
    task: 5,
    files: Object.freeze([
      // 39 sites — 30 `<button>` and 9 `<a href>` — including the five `.manager-header-actions`
      // Backs whose forgotten `ghost` role this batch repairs.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
        sites: 39,
      }),
    ]),
  }),
  Object.freeze({
    task: 6,
    files: Object.freeze([
      // 23 sites across eight browser views. Two carried a forgotten `primary`: the inline
      // `Add` submits in the environment Settings tab.
      //
      // The batch converted a NINTH file, `GatheringRealmQuickList.svelte`, and its 24th site
      // went with it: that component was imported by nothing under `src/` — #1283 moved realm
      // authoring to world scope, replaced the surface with `GatheringRealmsTab.svelte` and
      // left the file behind — so issue 1118 deleted it rather than converting dead code
      // twice. The totals below drop by one site and one component to match; a conversion the
      // sweep is no longer accountable for must leave the conserved quantity, or the floor
      // would be defending a component that does not exist.
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
      // 14 sites across the two library inspectors and the four shared shells — 11
      // `<button>` and 3 `<a href>`. Two carried a forgotten `danger`: the Delete at the foot
      // of each inspector's stacked action column.
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte',
        sites: 6,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/components/ComponentBrowserInspector.svelte',
        sites: 4,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/ItemPageInspector.svelte', sites: 1 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte', sites: 1 }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
        sites: 1,
      }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/ExplainerCard.svelte', sites: 1 }),
    ]),
  }),
  Object.freeze({
    task: 8,
    files: Object.freeze([
      // 14 sites across the recipe editor tree, all `<button>`. Ten already carried
      // `is-dashed` and repaint accent -> muted under task 4's reconciliation, which is the
      // ruled outcome rather than a casualty. One carried a forgotten `dashed`: the "Add a
      // step" at the foot of the Step durations accordion.
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
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte',
        sites: 1,
      }),
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
      // 38 sites across the remaining eighteen components, all `<button>` — the sweep's tail,
      // and the batch that takes the derived population to zero. Eight carried a forgotten
      // role and one carried a MISSPELT one: `CompositionList`'s second Force add wrote
      // `is-warning`, which the sheet declares nowhere, so it shipped with no warning
      // treatment at all while `.manager-button.is-warning-action` sat in the sheet with no
      // call site. It is the defect that put a sixth role in the primitive's vocabulary.
      //
      // One of the 38 is population C — the sweep's single backtick-template `class={…}`
      // attribute, `ImportFolderMappingModal`'s Skip toggle. It converts like the rest; the
      // template survives on the primitive's appending `class` prop.
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
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/environment/EnvironmentValidationTab.svelte',
        sites: 1,
      }),
      Object.freeze({
        file: 'src/ui/svelte/apps/manager/knowledge/KnowledgeOwnedCopyRow.svelte',
        sites: 1,
      }),
    ]),
  }),
]);

// Code point, not `localeCompare`, for the same reason `sourceScan.js` gives: locale-dependent
// ordering would make one corpus compare in two orders on two machines.
const byCodePoint = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

// The nine entries that changed disposition at task 9 all changed it for ONE reason, and it is
// a fact about the corpus rather than about any of them: the conversion emptied the population
// they were judged against. Hoisted so the reason is stated once and cannot drift between the
// entries that share it.
const MOVED_POPULATION =
  'MOVED to EXCLUDE by task 9, on the POPULATION and not on the reasoning: superseding this ' +
  'rule on a converted button is still the design, but the last literal site converted, so ' +
  'every site the tool can still derive it to reach is one of the 17 the sweep holds back. ';

const SHEET = 'styles/fabricate.css';
// The sweep's one population-C site: the only `class={…}` template that ever carried the
// contract. Named here because the vacuity floor asserts it survived the conversion as a
// template rather than being flattened into a literal or deleted.
const POPULATION_C_FILE = 'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte';
const globalRule = (selector) => `${SHEET}#${selector}`;
const scopedRule = (component, selector) => `src/ui/svelte/apps/manager/${component}#${selector}`;

/**
 * The reviewed cascade list.
 *
 * Seeded from what plan review r3 established, then CORRECTED by the tool. Every correction is
 * called out in its `why`, because the corrections are the reason this file exists.
 *
 * It shrank from 34 entries to 16 when the stylesheet was reconciled against it, and the
 * shrinkage is the deliverable: a rule chained above the primitive keys on `fab-manager-button`
 * and therefore leaves the derived candidate set entirely, and a retired one leaves the sheet.
 * The list and the sheet move in ONE commit for that reason — every edit to either changes the
 * derived set, so a stale entry here reds this gate instead of shipping a silent repaint.
 */
const REVIEWED = [
  // ── RECHAIN: the three that live in a component's own <style> block ───────────────────
  //
  // Task 4 reconciled `styles/fabricate.css` and owns nothing else, so these three are the
  // only RECHAIN entries left: each is authored inside the component it styles, and each
  // travels with that component's conversion rather than with the sheet.
  // `BulkEditPanelShell.svelte`'s `.fab-bulk-edit-apply` was the sharpest of these and is
  // DISCHARGED (issue 1118, task 7). At (0,2,0) it lost min-height 38px and font-size 0.78rem
  // outright, against a source comment forbidding exactly that because Apply swaps slots with
  // the inspector's primary. It converted with its component and is now
  // `:global(.fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply)` —
  // (0,4,0), so it beats the primitive on specificity — and its key compound demands
  // `fab-manager-button`, which makes it a PRIMITIVE rule here rather than a candidate.
  //
  // The `:global()` half is the part this instrument could NOT have told anyone, and it is
  // worth recording where the next batch will look: a SCOPED rule cannot reach a converted
  // button at all, whatever its specificity, because Svelte stamps its hash onto the elements
  // a component writes and not onto a child component's internals. That is a reach question
  // rather than a cascade question, so it has its own guard —
  // `tests/components/manager-button-scoped-class-reach.test.js` — which found the same
  // mistake already shipped in `GatheringEconomyView`'s discharge above.
  // `GatheringEconomyView.svelte`'s `.manager-economy-bulk-save` was the third of these and is
  // DISCHARGED (issue 1118, task 6). It converted with its component and its scoped selector was
  // re-chained onto `.manager-button.fab-manager-button.is-primary`, which compiles to (0,5,0)
  // and so beats both the primitive control and its `is-primary` companion on specificity
  // instead of on injection order. Its key compound now demands `fab-manager-button`, so it is
  // a PRIMITIVE rule here rather than a candidate, and leaves the derived set entirely.
  // `ImportFolderMappingModal.svelte`'s `:global(.manager-import-mapping-row .manager-button)`
  // was the LAST RECHAIN entry and is DISCHARGED (issue 1118, task 9), so this list now holds
  // none. It pinned a 28px control for the dense mapping row, tied the primitive at (0,3,0)
  // and kept its geometry only on injection order.
  //
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
    id: globalRule('.fabricate-manager .manager-button.is-ghost:not(:disabled)'),
    disposition: 'INTENDED',
    convertedReach: [
      { file: 'src/ui/svelte/apps/manager/ToolEditView.svelte', role: 'ghost', buttons: 1 },
      {
        file: 'src/ui/svelte/apps/manager/component/ComponentEditorHeader.svelte',
        role: 'ghost',
        buttons: 1,
      },
      {
        file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
        role: 'ghost',
        buttons: 6,
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
    id: globalRule('.fabricate-manager .manager-button.is-ghost:not(:disabled):hover'),
    disposition: 'INTENDED',
    convertedReach: [
      {
        file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
        role: 'ghost',
        buttons: 6,
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
      {
        file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
        container: 'manager-header-actions',
        buttons: 28,
      },
      {
        file: 'src/ui/svelte/apps/manager/ToolEditView.svelte',
        container: 'manager-header-actions',
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
      {
        file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
        container: 'manager-header-actions',
        role: 'primary',
        buttons: 14,
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
    stranding: ['src/ui/svelte/apps/manager/ArmedDangerButton.svelte:147'],
    why:
      MOVED_POPULATION +
      'The move is unusually clean here, because this entry always rested on the site that ' +
      'is left: the knowledge row`s `ArmedDangerButton`. ' +
      'Deliberately NOT re-chained, and the one place where this instrument is wrong about ' +
      'its own corpus. `collectSites` gives every non-population-B site the primitive class, ' +
      'including `ArmedDangerButton`, which is held out of the conversion and renders ' +
      '`class="manager-button is-danger"` from its own markup — so the tool believes a chained ' +
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
  //
  // The three bare `is-dashed` rules below were INTENDED until task 8, and the move is the
  // reconciliation finishing rather than a change of mind. Task 4 copied the primitive's
  // control geometry and paint down onto this selector precisely so that the dashed
  // `SearchablePopover` triggers — rendered from a class STRING, so they never gain
  // `fab-manager-button` — would keep a complete treatment while population B stays deferred.
  // While ten literal dashed buttons were still awaiting conversion the rules also reached
  // them, and losing to the primitive's (0,4,0) companion with identical values was the thing
  // worth recording. Task 8 converted the last of those ten, so every site these rules now
  // reach is a population-B trigger and re-chaining any of them would repaint a control the
  // sweep is not converting. That is the definition of EXCLUDE, and the EXCLUDE assertion
  // re-derives it: it demands each rule still reach a site, and that no site it reaches
  // converts. They are NOT dead — a dead rule is one nothing renders, and four triggers do.
  // ── EXCLUDE, arrived at by task 9 emptying the converted half ─────────────────────────
  //
  // These six are the base control band, and every one of them was INTENDED or NO_CONFLICT
  // until the last literal site converted. Nothing about them changed: the primitive still
  // supersedes them on a converted button, which is still the design. What changed is the only
  // population the tool can derive for them — the 16 population-B triggers and
  // `ArmedDangerButton` — and against THAT population the operative instruction is EXCLUDE's:
  // do not re-chain, because the 17 controls left would be repainted by it.
  {
    id: globalRule('.fabricate-manager button'),
    disposition: 'EXCLUDE',
    why:
      MOVED_POPULATION +
      "Foundry's `font: inherit` reset. It was the font-size winner for 55 converting sites " +
      'plus 11 that declared nothing at all, and the primitive pins 0.72rem over every one of ' +
      'them; the 17 unconverted controls still take their size from it.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button'),
    disposition: 'EXCLUDE',
    why:
      MOVED_POPULATION +
      'Both base control rules share this selector, and they are what a population-B trigger ' +
      'is still made of: the geometry, the radius and the surface. Re-chaining either would ' +
      'leave those triggers with no control treatment at all.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button:disabled'),
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
    id: globalRule('.fabricate-manager .manager-button:not(:disabled):hover'),
    disposition: 'EXCLUDE',
    why:
      MOVED_POPULATION +
      'The base hover paint, which the role hover companions at (0,6,0) are meant to beat. It ' +
      'also ties the resting role companions at (0,4,0) and wins on order alone, which the ' +
      'sweep must not disturb.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-danger:not(:disabled)'),
    disposition: 'EXCLUDE',
    why:
      'MOVED NO_CONFLICT -> EXCLUDE by task 9. It reached 11 converting sites and shared no ' +
      'property with any primitive rule that matched them; the ONE site it still reaches is ' +
      '`ArmedDangerButton`, which is where a manager danger button now comes from when it did ' +
      'not come from a `role="danger"` prop.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-danger:not(:disabled):hover'),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE REVIEWED LIST BEFORE: while `is-danger` sites were literal this rule beat ' +
      'everything that matched them outright, and it entered the derived set only when its ' +
      'population narrowed to `ArmedDangerButton`. The hover half of the entry above.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-subtle'),
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
    id: globalRule('.fabricate-manager .manager-button.is-dashed'),
    disposition: 'EXCLUDE',
    why:
      'The geometry half of the RECONCILED bare dashed treatment, and now population B only. ' +
      "Task 4 copied the primitive's control geometry down onto this selector — minus " +
      '`width`, which moved to `is-full-width` — so the four `SearchablePopover` dashed ' +
      'triggers render the same control as the converted buttons beside them in the same row.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-dashed:not(:disabled)'),
    disposition: 'EXCLUDE',
    why:
      'The paint half of the same reconciliation, split out so the disabled rule can win. ' +
      'Accent → muted was the ruled repaint on the ten literal dashed sites, and the four ' +
      'population-B triggers took it too, deliberately: they sit in the same rows. With the ' +
      'ten converted (task 8) the triggers are all that is left.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-dashed:not(:disabled):hover'),
    disposition: 'EXCLUDE',
    why: 'The hover half of the same ruling, likewise reconciled to the primitive.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-checks-preview-actor-trigger'),
    disposition: 'EXCLUDE',
    why:
      'The Checks preview actor popover trigger. `SearchablePopover` renders it from a class ' +
      'string, so it never gains `fab-manager-button`.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-salvage-component-trigger'),
    disposition: 'EXCLUDE',
    why: 'Salvage component popover trigger, population B.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-recipe-component-trigger'),
    disposition: 'EXCLUDE',
    why:
      "NOT IN THE SEEDED LIST as its own entry: the seed named only the group's first line, " +
      'and this is the second of its three selectors, reaching two more population-B triggers.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-tool-replacement-component-trigger'),
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
    id: globalRule('.fabricate-manager .manager-button.manager-travel-parties-override-trigger'),
    disposition: 'EXCLUDE',
    why: 'Travel parties override popover trigger, population B.',
  },
  {
    id: globalRule('.fabricate-manager .manager-travel-picker-trigger'),
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE SEEDED LIST. The (0,2,0) shared treatment behind four population-B ' +
      'triggers; re-chaining it would repaint controls the sweep is not converting.',
  },
  {
    id: 'src/ui/svelte/apps/manager/BulkDeleteCard.svelte#.fab-bulk-delete-card .manager-button',
    disposition: 'EXCLUDE',
    why:
      'NOT IN THE SEEDED LIST. A `:global()` scoped rule whose only site is ' +
      '`ArmedDangerButton`, which is a primitive in its own right and is explicitly out of the ' +
      "conversion's scope.",
  },

  // ── NO_CONFLICT: derived NOT at risk, and still rendered ──────────────────────────────
  //
  // `.manager-button:disabled`, `.is-danger:not(:disabled)` and `.is-subtle` were filed here
  // and moved to EXCLUDE at task 9, because the only sites they can still be derived to reach
  // are unconverted ones. Their reasoning is preserved at their new entries rather than
  // summarised here.
  {
    id: globalRule('.fabricate-manager .manager-button.is-warning-action:not(:disabled)'),
    disposition: 'NO_CONFLICT',
    // WAS DEAD, and is the sweep's one entry to move in that direction. Its old `why` said the
    // entry 'should go live rather than away', and this is that: the primitive's sixth role
    // emits this class, and the control that always meant to render it now does. Named the same
    // way the other converted-reach entries are, by the role prop rather than by a container,
    // because the role IS the reach.
    //
    // ONE caveat, recorded because it is a second defect on the same control and the reason
    // this entry cannot rest on a mounted assertion: that Force add does not currently render in
    // any state. It sits in `CompositionList`'s standalone Non-matching section, which the
    // markup gates on `mode !== 'manual'`, while its own guard demands `mode === 'manual'`.
    // Reported with the sweep; repairing it is a product decision about where a manual
    // force-add belongs.
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
    id: globalRule('.fabricate-manager .manager-button.is-primary:not(:disabled)'),
    disposition: 'NO_CONFLICT',
    // The primary paint reaches no LITERAL site at all now — no population-B trigger is a
    // primary — so it is named the same way `.manager-setup-links .manager-button` below is,
    // by counting the `role="primary"` props that render it. Three components, chosen because
    // each is a different shape of primary: a browser's create action, a card header's, and a
    // modal footer's commit.
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
  // Task 4 retired all three — the pinned 48px box went with them, and the trailing grid track
  // is `max-content` now — leaving the one declaration that is neither restated nor overturned:
  // the 36px height it shares with the sibling input. Task 6 then converted its only two call
  // sites (rows 16 and 17, `EnvironmentsBrowserView.svelte`), which carry the class through the
  // primitive's appending `class` prop, so the rule still styles exactly what it always did
  // while no longer being derivable from a literal `class="manager-button"` anywhere.
  {
    id: globalRule('.fabricate-manager .manager-setup-links .manager-button'),
    disposition: 'NO_CONFLICT',
    // The sweep has now converted EVERY site this rule reaches, so the instrument can no
    // longer see one: it finds a site by the literal `class="manager-button…"`, which is
    // exactly what a conversion removes. Re-asserting "it reaches a converting site" would
    // have to be deleted or relaxed to nothing — the first loses the guard, the second keeps
    // its name and its shape while proving nothing.
    //
    // So the population is named instead, and VERIFIED against the tree: each entry says
    // which component renders the container and how many primitives sit inside it, and the
    // test below re-derives both from source. A container that is renamed, a card that stops
    // rendering its links, or a count someone adjusted to make a red go away all fail here.
    // Same shape as the conversion ledger's own floor, one rule down.
    convertedReach: [
      {
        file: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
        container: 'manager-setup-links',
        buttons: 8,
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
  //
  // Four entries left this list in task 4, retired rather than recorded:
  // `.manager-region-add`, `.manager-tool-inspector-actions .manager-button` (with its
  // `span` companion), `.manager-tools-row-editor .manager-button` and
  // `.manager-tools-create-actions .manager-button`. The remaining container rules of those
  // last three families are orphaned too — no component carries the classes at all.
  // `.manager-tools-create-actions` was the exception that had to be finished rather than
  // filed: that retirement MERGED the dead `.manager-button` rule's declarations into an
  // equally dead `select` rule on the way past, so the class read as freshly maintained, and
  // its three remaining rules are retired with it. `.manager-tool-inspector-actions` and
  // `.manager-tools-row-editor` keep their orphaned container rules and are named in the
  // handoff as a separate dead-CSS sweep, alongside `.manager-tools-create-prompt`,
  // `.manager-tools-item-shortcuts` and `.manager-tools-library-toolbar`.
  // The list is EMPTY, and that is the change task 9 made to it.
  // `.manager-button.is-warning-action:not(:disabled)` was the one entry: DEAD and deliberately
  // kept, because it corroborated the `warning` repair from the other side — the amber treatment
  // existed and nothing rendered it, since the one control that meant to render it spelt the
  // class `is-warning`, which the sheet declares nowhere. It has a call site now and has moved
  // to NO_CONFLICT above, which is the outcome its own `why` asked for.
];

const idsWith = (...dispositions) =>
  REVIEWED.filter((entry) => dispositions.includes(entry.disposition)).map((entry) => entry.id);

const dispositionById = new Map(REVIEWED.map((entry) => [entry.id, entry.disposition]));

test('the reviewed cascade list has no duplicate entry', () => {
  assert.equal(dispositionById.size, REVIEWED.length, 'every reviewed id appears exactly once');
});

/**
 * Both directions of the at-risk equality, stated separately because task 9 broke their symmetry.
 *
 * While literal sites remained, `derived === reviewed` said everything: a rule that entered the
 * derived set without an entry was a silent repaint, and an entry that left it was stale. With
 * the conversion complete the derived set is EMPTY — the tool finds a site by the literal
 * `class="manager-button…"` and there are none left to be at risk — so a plain equality would
 * pass over nothing in both directions at once and keep reporting itself satisfied forever.
 *
 * So the two halves are asserted against different things:
 *  - derived ⊆ reviewed keeps its teeth unchanged, and is the half that catches a returning
 *    raw SITE — a `class="manager-button"` literal re-entering `src/` — and NOT a new rule,
 *    which derives no candidate at all while the derived set is empty. See the docblock at
 *    the head of this file for what does cover a new rule.
 *  - reviewed ⊆ derived is replaced by the obligation each entry now carries — either it still
 *    derives at risk, or it names a `convertedReach` this file re-derives from the tree.
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
 * These tags carry inline arrow handlers, so a `[^<>]*` bound cannot span one and would end
 * the match half way through the attribute list.
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
 * Every region of `source` enclosed by an element whose class list holds `containerClass`.
 *
 * Bounded to that element, by walking its own tag name to a matching close rather than to the
 * next `</div>`: the containers here nest, and a count that ran past one into the section
 * below it would credit an entry with buttons the rule does not reach.
 *
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
  const marker = new RegExp(String.raw`class="[^"]*\b${containerClass}\b[^"]*"`, 'g');
  for (let hit = marker.exec(source); hit; hit = marker.exec(source)) {
    const open = source.lastIndexOf('<', hit.index);
    const tag = /^<([a-zA-Z][\w-]*)/.exec(source.slice(open))?.[1];
    if (!tag) continue;
    const cursor = endOfOpeningTag(source, hit.index);
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
 * `container` narrows to an ancestor the rule names; `role` narrows to the role prop whose
 * emitted class the rule keys on. A rule can need either, both or neither — the header
 * cluster's `is-primary` companion needs both, a bare role paint needs only the role.
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
 * The rule is not dead — every button it reaches renders through the primitive now — but
 * nothing in the tree says so, and "it reaches a converting site" cannot be re-asserted without
 * either deleting the guard or relaxing it to nothing. So the entry NAMES its population and
 * this re-derives it from source: which components render the buttons, how many, and that none
 * of those components still writes a literal `class="manager-button"`. A container that is
 * renamed, a card that stops rendering its links, a role prop that is dropped, or a count
 * someone adjusted to make a red go away all fail here.
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
      !source.includes('class="manager-button'),
      `${file} is booked as converted but still writes a literal class="manager-button"`
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

    // No literal call site left. That is either "the sweep converted them all", which the
    // entry has to have SAID in advance and which is checked against the tree below, or it is
    // a rule that has quietly gone dead — the case this branch exists to keep separable.
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
  // The instrument used to hand `fab-manager-button` to everything outside population B, which
  // included `ArmedDangerButton` — a component held out of the conversion on purpose, which
  // writes `class="manager-button is-danger"` in its own markup and will never gain the
  // primitive class. The error was invisible in the report: it changed no derived set and no
  // printed line, because losses are only counted on CONVERTING sites. What it changed was the
  // advice. `.manager-knowledge-row-actions .manager-button` derived as a plain RECHAIN, and
  // re-chaining it would have left that row's Delete button at the ambient ~1rem beside the
  // 0.72rem Expend button next to it — the exact regression the rule exists to prevent.
  //
  // So the model is pinned here rather than trusted, because nothing downstream would notice.
  const unconverted = cascade.sites.filter((site) => !site.converting);
  const wrong = unconverted.filter((site) => site.classes.has('fab-manager-button'));
  assert.deepEqual(
    wrong.map((site) => site.id),
    [],
    'a site the sweep does not convert must be scored on its literal classes alone'
  );
  // Non-vacuity in the direction that actually rotted: population B is excluded by an obvious
  // branch, and a held-back FILE is not. If this floor ever reads zero, the corpus has stopped
  // containing the case this assertion was written for.
  const heldBack = unconverted.filter((site) => site.population !== 'B');
  assert.ok(
    heldBack.length > 0,
    'at least one non-population-B site is held back from the conversion, or this proves nothing'
  );
  // The other half used to read "every converting site IS scored with the primitive class".
  // With the sweep complete there are none, so that assertion is vacuously true and says
  // nothing; the fact it was defending is now stated positively instead. Every site the tool
  // can still see is one of the 17 the sweep deliberately does not convert, and it is scored
  // on its literal classes — so `converting` and `carries fab-manager-button` remain the SAME
  // question rather than two that happen to agree on an empty set.
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
  // `tieDivergence` is opt-in, and the loop below skips any entry without it — so an entry set
  // that lost its last `tieDivergence` would leave that test passing over nothing. Task 9 took
  // the count to zero legitimately: a tie is a relation between a rule and a CONVERTED button,
  // and there is no longer a literal one for the tool to derive. The floor is therefore stated
  // as an equality against the reason, not as `> 0`, so re-introducing a tie without an entry
  // still reds.
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

  // The sweep's total is a CONSERVED quantity, not a countdown, and this floor has to say so
  // or it decays into one. The instrument finds a site by its literal `class="manager-button…"`,
  // which is exactly the thing a conversion removes: after task 5 the derived population was 90
  // across 40 of these components, after task 9 it is 0 across 0, and a floor pinned to
  // whatever the last batch left would ratchet down to nothing while reporting itself
  // satisfied.
  //
  // So the floor is stated over BOTH halves — the sites still awaiting conversion plus the
  // sites already converted — and it stays 128 across 41 for the whole sweep. Each batch adds
  // its own line to the ledger and touches neither total, and a batch that DELETED a control
  // instead of converting it fails here rather than looking like progress.
  //
  // The totals were 129 across 42 when the sweep was planned. They are one lower because ONE
  // of the 42 components turned out to be unreachable dead code — `GatheringRealmQuickList`,
  // imported by nothing under `src/` since #1283 moved realm authoring to world scope — and
  // was deleted rather than converted. That is the one licensed way to move these numbers, and
  // it is licensed precisely because the site left the product rather than leaving the
  // instrument's view: the ledger assertions below re-read every booked file from the tree, so
  // a deleted component cannot stay booked, and the paragraph above is the reason a number
  // that moved needs a stated cause rather than a quiet edit.
  const converted = CONVERTED_BATCHES.flatMap((batch) => batch.files);
  assert.equal(
    cascade.convertingSites.length + converted.reduce((total, file) => total + file.sites, 0),
    128,
    'the conversion is 128 sites, whether or not a given one has been converted yet'
  );
  assert.equal(
    new Set(cascade.convertingSites.map((site) => site.file)).size + converted.length,
    41,
    'across 41 components'
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
      !source.includes('class="manager-button'),
      `${file} is booked as converted but still writes a literal class="manager-button"`
    );
    assert.ok(
      !cascade.convertingSites.some((site) => site.file === file),
      `${file} is booked as converted but the instrument still derives call sites in it`
    );
  }
  assert.equal(
    cascade.sites.filter((site) => site.population === 'B').length,
    16,
    'plus the 16 SearchablePopover triggerClass sites named as debt'
  );
  // Population C was the sweep's ONE backtick-template `class={…}` attribute, and task 9
  // converted it, so a bare `=== 0` would be satisfied just as well by the site having been
  // deleted. The pair is asserted instead: nothing writes the contract into a template any
  // more, AND the component that used to now hands that same template to the primitive.
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
  // A repaint is a winner change on an UNCONVERTED literal site, so with the sweep complete
  // there can be none. That makes this the regression detector for the whole change: a new raw
  // `class="manager-button"` landing anywhere under `src/` puts a site back in the corpus and
  // reappears here as a measured repaint.
  assert.deepEqual(
    cascade.repaints.map((change) => change.property),
    [],
    'the conversion is complete, so no literal call site is left whose cascade winner could ' +
      'change — a repaint here means a raw class="manager-button" has come back'
  );
});

test('the manager-button cascade inventory', () => {
  // The report is the deliverable, not a side effect: the sweep's conversion tasks read it
  // instead of re-deriving the cascade in prose, which is what produced three rounds of missed
  // bands. It is deterministic and grouped by mechanism so it diffs cleanly between runs.
  console.log(cascade.renderInventory(dispositionById));
});
