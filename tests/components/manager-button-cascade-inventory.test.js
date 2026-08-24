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
 * ── IT IS A GUARD, NOT JUST A REPORT ─────────────────────────────────────────────────────
 * The shape is `tests/components/mounted-harness-primitive-allowlist.test.js`'s: a reviewed
 * list held next to a mechanically derived one, asserted equal. A rule added to the sheet
 * later — by this sweep or by anything else — lands in the derived set, misses the reviewed
 * list, and REDS the gate instead of shipping a silent repaint.
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
 * `class="manager-button…"`, so nothing keys on it — while remaining one of the 129 the sweep
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
      // 24 sites across the nine browser views. Three carried a forgotten `primary`: the two
      // inline `Add` submits in the environment Settings tab and the realm quick list's own.
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
      Object.freeze({ file: 'src/ui/svelte/apps/manager/GatheringRealmQuickList.svelte', sites: 1 }),
      Object.freeze({ file: 'src/ui/svelte/apps/manager/GatheringEconomyView.svelte', sites: 1 }),
    ]),
  }),
]);

// Code point, not `localeCompare`, for the same reason `sourceScan.js` gives: locale-dependent
// ordering would make one corpus compare in two orders on two machines.
const byCodePoint = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

const SHEET = 'styles/fabricate.css';
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
  {
    id: scopedRule('BulkEditPanelShell.svelte', '.fab-bulk-edit-apply'),
    disposition: 'RECHAIN',
    why:
      'The bulk-apply button at (0,2,0) loses min-height 38px and font-size 0.78rem outright, ' +
      'against a source comment forbidding exactly that because the control swaps slots with ' +
      'the inspector primary. Scoped to `BulkEditPanelShell.svelte`; converts with it.',
  },
  // `GatheringEconomyView.svelte`'s `.manager-economy-bulk-save` was the third of these and is
  // DISCHARGED (issue 1118, task 6). It converted with its component and its scoped selector was
  // re-chained onto `.manager-button.fab-manager-button.is-primary`, which compiles to (0,5,0)
  // and so beats both the primitive control and its `is-primary` companion on specificity
  // instead of on injection order. Its key compound now demands `fab-manager-button`, so it is
  // a PRIMITIVE rule here rather than a candidate, and leaves the derived set entirely.
  {
    id: scopedRule(
      'ImportFolderMappingModal.svelte',
      '.manager-import-mapping-row .manager-button'
    ),
    disposition: 'RECHAIN',
    why:
      'A `:global()` scoped rule pinning a 28px control; it ties the primitive at (0,3,0) ' +
      'and wins only on injection order, and loses its padding outright to the `is-primary` ' +
      'companion. Scoped to `ImportFolderMappingModal.svelte`; converts with it.',
  },

  // ── INTENDED: the primitive is designed to supersede these ────────────────────────────
  {
    id: globalRule('.fabricate-manager button'),
    disposition: 'INTENDED',
    why:
      "Foundry's `font: inherit` reset. It is the CURRENT font-size winner for 55 converting " +
      'sites plus 11 that declare nothing at all, and the primitive pins 0.72rem over it. That ' +
      "is the delta's third clear-filters mechanism, measured: an inherited size becoming a " +
      'fixed one, with no rule "losing" a declaration.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button'),
    disposition: 'INTENDED',
    why:
      'Both base control rules share this selector. They declare the same geometry the ' +
      'primitive re-declares — the tool confirms padding and min-height as SAME-VALUE winner ' +
      'changes across 74 to 76 sites — plus the border-radius and surface the role companions ' +
      'deliberately override.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-ghost:not(:disabled)'),
    disposition: 'INTENDED',
    why:
      "The primitive's `is-ghost` keeps a RESTING border where this rule has none. Beating it " +
      'is the documented purpose of the companion rule. The `:not(:disabled)` qualifier is ' +
      "task 4's disabled repair, not a change of meaning — see `.manager-button:disabled`.",
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-ghost:not(:disabled):hover'),
    disposition: 'INTENDED',
    why: 'The hover half of the same deliberate override.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-dashed'),
    disposition: 'INTENDED',
    why:
      'The geometry half of the RECONCILED bare dashed treatment. Task 4 copied the ' +
      "primitive's control geometry down onto this selector — minus `width`, which moved to " +
      '`is-full-width` — so the four `SearchablePopover` dashed triggers that never gain ' +
      '`fab-manager-button` render the same control as the converted buttons beside them. It ' +
      "still loses to the primitive's own `is-dashed` at (0,4,0), and now loses to it with " +
      'identical values, which is the point of the reconciliation.\n' +
      'The report prints one divergent TIE for it — 11px against the base primitive rule`s ' +
      '0.72rem — and that one is inert in both directions, which is why it carries no ' +
      '`tieDivergence` claim. A CONVERTED dashed button also matches the (0,4,0) companion, ' +
      'which states 11px and wins outright; an unconverted one matches no primitive rule at ' +
      'all. There is no arrangement of this sheet in which the 0.72rem reaches a dashed ' +
      'control, so the tie cannot be made visible by reordering.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-dashed:not(:disabled)'),
    disposition: 'INTENDED',
    why:
      'The paint half of the same reconciliation, split out so the disabled rule can win. ' +
      'Accent → muted on the ten converting sites is the ruled repaint, and the four ' +
      'population-B triggers take it too, deliberately: they sit in the same rows.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-dashed:not(:disabled):hover'),
    disposition: 'INTENDED',
    why: 'The hover half of the same ruling, likewise reconciled to the primitive.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button:not(:disabled):hover'),
    disposition: 'INTENDED',
    why:
      'The base hover paint, which the role hover companions at (0,6,0) are meant to beat. It ' +
      'also ties the resting role companions at (0,4,0) and wins on order alone, which the ' +
      'sweep must not disturb.',
  },
  {
    id: globalRule('.fabricate-manager .manager-header-actions .manager-button'),
    disposition: 'INTENDED',
    tieDivergence: [],
    why:
      'The 38px control this rule declared is RETIRED (task 4): the maintainer ruled 34px, ' +
      'which is what the Tool Studio renders and what the primitive re-declares. What is left ' +
      "is the container's own TYPE scale, 0.72rem, which it states across all three of its " +
      'children — button, chip and save-error. The primitive states the same 0.72rem with no ' +
      'ancestor requirement, so the remaining tie is provably zero-pixel, and the rule is what ' +
      'types a header button the primitive does not render.',
  },
  {
    id: globalRule('.fabricate-manager .manager-header-actions .manager-button.is-primary'),
    disposition: 'INTENDED',
    tieDivergence: [],
    why:
      "The same container statement for the header's loudest action: `0 var(--fab-space-4)` " +
      'and weight 700, which are exactly what `.manager-button.fab-manager-button.is-primary` ' +
      'states. Zero-pixel either way, and it is what emphasises a header primary the primitive ' +
      'does not render. Its `is-ghost` sibling was RETIRED instead, because a role’s PAINT ' +
      'belongs to the role — the container keeps only its own scale.',
  },
  {
    id: globalRule('.fabricate-manager .manager-knowledge-row-actions .manager-button'),
    disposition: 'INTENDED',
    tieDivergence: [],
    stranding: ['src/ui/svelte/apps/manager/ArmedDangerButton.svelte:147'],
    why:
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
    tieDivergence: [],
    why:
      'The sibling selector in the same comma group, which also heads `.manager-tool-edit-' +
      'actions .manager-button` — the Tool Studio cluster that IS the authority the primitive ' +
      'copied. Same three values, so the tie is zero-pixel; splitting the group to chain one ' +
      'third of it would restate the authority instead of adopting it.',
  },
  {
    id: globalRule(
      '.fabricate-manager[data-manager-view="components"] .manager-toolbar .manager-button'
    ),
    disposition: 'INTENDED',
    tieDivergence: ['font-size'],
    why:
      'NEWLY at risk, and it is task 4 that put it there: at (0,4,0) it used to beat the ' +
      "primitive's (0,3,0) control outright, and the re-chained bespoke rules are (0,4,0) too, " +
      'so it now ties them. Every tie is same-value — this rule and the sort-direction rule ' +
      'both state `var(--fab-recipe-control-font)`, and the primitive states the 0.72rem that ' +
      'token resolves to. The one overlap that is NOT identical is against ' +
      '`.manager-clear-filters` (0.78rem), and no `manager-clear-filters` control renders in ' +
      "the components view — that browser's Clear filters carries no bespoke class. Recorded " +
      'rather than hidden: if one ever lands there, this rule wins by order.',
  },

  // ── EXCLUDE: reaches only population-B triggers ───────────────────────────────────────
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

  // ── NO_CONFLICT: reaches converting sites, derived safe (not exhaustive) ──────────────
  {
    id: globalRule('.fabricate-manager .manager-button:disabled'),
    disposition: 'NO_CONFLICT',
    why:
      'THE REPAIR, RECORDED. This was the sharpest RECHAIN entry the instrument found: the ' +
      "base disabled paint at (0,3,0), beaten outright by the primitive's `is-ghost` and " +
      '`is-dashed` companions at (0,4,0) and on source order by every base role paint, so a ' +
      'DISABLED manager button kept its enabled colours in every role — visibly, on ' +
      "`ToolEditView`'s ghost Back button for the whole of a tool save. Task 4 qualified every " +
      'rule that states a resting paint with `:not(:disabled)` rather than chaining this one ' +
      'above them, because this selector also serves `.manager-icon-button` and every ' +
      'hand-written button the sweep does not convert. That it now derives NO_CONFLICT is the ' +
      'proof: no rule anywhere in the corpus can take the disabled paint off a manager button.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-primary:not(:disabled)'),
    disposition: 'NO_CONFLICT',
    why:
      "30 converting sites, and it declares only paint while the primitive's `is-primary` " +
      'companion declares only padding and font-weight. No shared property, so no repaint — ' +
      'the same reasoning the delta gives for `is-warning-action`, now measured.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-danger:not(:disabled)'),
    disposition: 'NO_CONFLICT',
    why: '11 converting sites, paint only, no overlap with any primitive rule that matches them.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-subtle'),
    disposition: 'NO_CONFLICT',
    why:
      "The delta's worked example for a pass-through class. Two converting sites; it declares " +
      'one property the primitive never touches.',
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
    why:
      'The explainer card`s docs-link container. It declares no property the primitive ' +
      'declares, so its anchor site is untouched.',
  },

  // ── DEAD: real rules, zero call sites ─────────────────────────────────────────────────
  //
  // Four entries left this list in task 4, retired rather than recorded:
  // `.manager-region-add`, `.manager-tool-inspector-actions .manager-button` (with its
  // `span` companion), `.manager-tools-row-editor .manager-button` and
  // `.manager-tools-create-actions .manager-button`. The remaining container rules of those
  // last three families are orphaned too — no component carries the classes at all — but
  // they are outside a manager-button reconciliation and are named in the handoff as a
  // separate dead-CSS sweep rather than half-cleaned here.
  {
    id: globalRule('.fabricate-manager .manager-button.is-warning-action:not(:disabled)'),
    disposition: 'DEAD',
    why:
      "DEAD and deliberately KEPT, which is why this list is not a retirement order. It " +
      "corroborates the delta's `warning` repair from the other side: the treatment exists and " +
      'NOTHING renders it, because the one site that means to spells the class `is-warning`, ' +
      'which the sheet declares nowhere. The primitive gains a `warning` role that emits THIS ' +
      'class, so the entry should go live rather than away.',
  },
];

const idsWith = (...dispositions) =>
  REVIEWED.filter((entry) => dispositions.includes(entry.disposition)).map((entry) => entry.id);

const dispositionById = new Map(REVIEWED.map((entry) => [entry.id, entry.disposition]));

test('the reviewed cascade list has no duplicate entry', () => {
  assert.equal(dispositionById.size, REVIEWED.length, 'every reviewed id appears exactly once');
});

test('the mechanically derived at-risk set is exactly the reviewed RECHAIN + INTENDED list', () => {
  const derived = [...new Set(cascade.atRisk.map((entry) => entry.rule.id))].sort((left, right) =>
    left.localeCompare(right)
  );
  const reviewed = [...new Set(idsWith('RECHAIN', 'INTENDED'))].sort((left, right) =>
    left.localeCompare(right)
  );
  assert.deepEqual(
    derived,
    reviewed,
    'a rule that ties with or loses to the primitive AND shares a declared property must be ' +
      'reviewed here. An unexpected entry is a silent repaint waiting to ship; a missing one ' +
      'means a reviewed rule was retired or re-chained and its entry was not updated.\n' +
      `derived only: ${derived.filter((id) => !reviewed.includes(id)).join(' | ') || 'none'}\n` +
      `reviewed only: ${reviewed.filter((id) => !derived.includes(id)).join(' | ') || 'none'}`
  );
});

test('every reviewed EXCLUDE rule would lose to the primitive but reaches no converting site', () => {
  const derived = [...new Set(cascade.excluded.map((entry) => entry.rule.id))].sort((left, right) =>
    left.localeCompare(right)
  );
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

test('every reviewed NO_CONFLICT rule reaches a converting site and is derived safe', () => {
  for (const id of idsWith('NO_CONFLICT')) {
    const candidate = cascade.candidateFor(id);
    assert.ok(candidate, `${id} should still be a rule that matches a call site`);
    assert.equal(candidate.losses.length, 0, `${id} should still share no property it can lose`);
    assert.ok(
      candidate.matches.some((match) => match.site.converting),
      `${id} should still reach a converting site, or it is DEAD rather than NO_CONFLICT`
    );
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
  assert.ok(
    cascade.convertingSites.every((site) => site.classes.has('fab-manager-button')),
    'and every converting site IS scored with it, or the model has drifted the other way'
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
  // which is exactly the thing a conversion removes: after task 5 the derived population is 90
  // across 41 components, after task 9 it is 0 across 0, and a floor pinned to whatever the
  // last batch left would ratchet down to nothing while reporting itself satisfied.
  //
  // So the floor is stated over BOTH halves — the sites still awaiting conversion plus the
  // sites already converted — and it stays 129 across 42 for the whole sweep. Each batch adds
  // its own line to the ledger and touches neither total, and a batch that DELETED a control
  // instead of converting it fails here rather than looking like progress.
  const converted = CONVERTED_BATCHES.flatMap((batch) => batch.files);
  assert.equal(
    cascade.convertingSites.length + converted.reduce((total, file) => total + file.sites, 0),
    129,
    'the conversion is 129 sites, whether or not a given one has been converted yet'
  );
  assert.equal(
    new Set(cascade.convertingSites.map((site) => site.file)).size + converted.length,
    42,
    'across 42 components'
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
  assert.equal(
    cascade.sites.filter((site) => site.population === 'C').length,
    1,
    'plus the one backtick-template call site'
  );
  assert.ok(cascade.primitives.length >= 8, `${cascade.primitives.length} primitive rules`);
  assert.ok(
    cascade.atRisk.some((entry) => entry.rule.scopedTo),
    'at least one scoped component rule is in the at-risk set, or the scoped sheets are not ' +
      'reaching the comparison at all'
  );
  assert.ok(
    cascade.repaints.some((change) => !change.identical),
    'at least one measured winner change moves a real value'
  );
});

test('the manager-button cascade inventory', () => {
  // The report is the deliverable, not a side effect: the sweep's conversion tasks read it
  // instead of re-deriving the cascade in prose, which is what produced three rounds of missed
  // bands. It is deterministic and grouped by mechanism so it diffs cleanly between runs.
  console.log(cascade.renderInventory(dispositionById));
});
