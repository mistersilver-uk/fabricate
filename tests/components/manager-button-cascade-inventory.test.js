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
 * - `INTENDED` — at risk, and that is the POINT: the primitive is designed to beat this rule,
 *                so re-chaining it would undo the conversion. This disposition is not in the
 *                assignment's original four; the tool forced it, because the derived set
 *                includes the base control rules and the Foundry `button` reset that the
 *                primitive exists to supersede, and filing those as `EXCLUDE` would confuse
 *                "must not be re-chained because it serves unconverted sites" with "must not
 *                be re-chained because winning is the design".
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

import { managerButtonCascade } from '../helpers/manager-button-cascade.js';

const cascade = managerButtonCascade();

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
 */
const REVIEWED = [
  // ── RECHAIN: scoped component rules ───────────────────────────────────────────────────
  {
    id: scopedRule('BulkEditPanelShell.svelte', '.fab-bulk-edit-apply'),
    disposition: 'RECHAIN',
    why:
      'The bulk-apply button at (0,2,0) loses min-height 38px and font-size 0.78rem outright, ' +
      'against a source comment forbidding exactly that because the control swaps slots with ' +
      'the inspector primary.',
  },
  {
    id: scopedRule('GatheringEconomyView.svelte', '.manager-economy-bulk-save'),
    disposition: 'RECHAIN',
    why:
      'NOT IN THE SEEDED LIST. A second scoped (0,2,0) bespoke rule in the same band as ' +
      '`.fab-bulk-edit-apply`: `padding: 3px 10px` and `font-size: 0.82rem` both lose outright.',
  },
  {
    id: scopedRule(
      'ImportFolderMappingModal.svelte',
      '.manager-import-mapping-row .manager-button'
    ),
    disposition: 'RECHAIN',
    why:
      'NOT IN THE SEEDED LIST. A `:global()` scoped rule pinning a 28px control; it ties the ' +
      'primitive at (0,3,0) and wins only on injection order, and loses its padding outright ' +
      'to the `is-primary` companion.',
  },

  // ── RECHAIN: the ancestor-context band ────────────────────────────────────────────────
  {
    id: globalRule('.fabricate-manager .manager-header-actions .manager-button'),
    disposition: 'RECHAIN',
    why:
      'The largest repaint in the change: 28 confirmed sites in one `<div>` plus 2 in ' +
      '`ComponentEditorHeader`, min-height 38px → 34px on a tie lost to source order.',
  },
  {
    id: globalRule('.fabricate-manager .manager-header-actions .manager-button.is-primary'),
    disposition: 'RECHAIN',
    why:
      "NOT IN THE SEEDED LIST. The header cluster's `is-primary` companion ties the " +
      "primitive's at (0,4,0) and loses on source order; same values today, so it is a latent " +
      'repaint rather than a live one, and the sweep is licensed to reorder the sheet.',
  },
  {
    id: globalRule('.fabricate-manager .manager-header-actions .manager-button.is-ghost'),
    disposition: 'RECHAIN',
    why:
      "Ties the primitive's `is-ghost` at (0,4,0) and wins only on source order. The delta " +
      'rules this pair redundant and retires one; either way it must stop depending on order.',
  },
  {
    id: globalRule(
      '.fabricate-manager .manager-header-actions .manager-button.is-ghost:not(:disabled):hover'
    ),
    disposition: 'RECHAIN',
    why: 'The hover half of the same redundant pair, at (0,6,0), on the same tie.',
  },
  {
    id: globalRule('.fabricate-manager .manager-header-actions .manager-downtime-unlock'),
    disposition: 'RECHAIN',
    why:
      'The premium unlock anchor: min-height, padding and font-size all tie the primitive at ' +
      '(0,3,0) and survive on source order alone.',
  },
  {
    id: globalRule('.fabricate-manager .manager-drop-inspector-stack .manager-button'),
    disposition: 'RECHAIN',
    why:
      'The 28px drop-inspector control. Two confirmed converting sites, not the one the ' +
      'prose found, and both were certified as needing no change.',
  },
  {
    id: globalRule('.fabricate-manager .manager-knowledge-row-actions .manager-button'),
    disposition: 'RECHAIN',
    why:
      'NOT IN THE SEEDED LIST. Same (0,3,0) ancestor band, same values as the primitive, so ' +
      'no repaint today and total dependence on source order tomorrow.',
  },
  {
    id: globalRule('.fabricate-manager .manager-knowledge-reset-actions .manager-button'),
    disposition: 'RECHAIN',
    why:
      'NOT IN THE SEEDED LIST. The sibling of the row-actions rule, declared in the same ' +
      'comma group and reaching two more converting sites.',
  },
  {
    id: globalRule('.fabricate-manager .manager-recipe-ingredient-set-add .manager-button'),
    disposition: 'RECHAIN',
    why:
      'CORRECTION — seeded as EXCLUDE. It does reach converting sites: two `is-dashed` ' +
      'buttons written directly in `RecipeIngredientSetCard`, whose 0.7rem loses outright to ' +
      "the primitive's `is-dashed` 11px. Retiring it, as the delta proposes, is a repaint.",
  },
  {
    id: globalRule('.fabricate-manager .manager-recipe-requirement-adds .manager-button'),
    disposition: 'RECHAIN',
    why:
      'CORRECTION — seeded as EXCLUDE. It reaches the four `is-dashed` alternative-add ' +
      'buttons in `RecipeIngredientGroupCard`, which are population A and do convert.',
  },

  // ── RECHAIN: the bespoke-class band ───────────────────────────────────────────────────
  {
    id: globalRule('.fabricate-manager .manager-clear-filters'),
    disposition: 'RECHAIN',
    why:
      'Six classed clear-filters buttons at (0,2,0): min-height 30px → 34px, font-size ' +
      '0.78rem → 0.72rem, padding space-2 → space-3, all lost outright.',
  },
  {
    id: globalRule('.fabricate-manager .manager-add-button'),
    disposition: 'RECHAIN',
    why:
      'Rows 16/17. At (0,2,0) it loses its width, padding and font-size to the primitive and ' +
      'the `is-primary` companion, inside a 48px grid track.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-recipe-sort-direction'),
    disposition: 'RECHAIN',
    why:
      'Sort-direction toggle, (0,3,0), tied and order-dependent on min-height, padding and ' +
      'font-size.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-component-sort-direction'),
    disposition: 'RECHAIN',
    why:
      'The other half of the sort-direction pair, declared as its own selector in the same ' +
      'comma group.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-recipe-browser-inspector-duplicate'),
    disposition: 'RECHAIN',
    why:
      'Recipe inspector Duplicate: 36px and 0.78rem tied at (0,3,0). Re-chained with the ' +
      'rest of its stacked action column or not at all.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-component-browser-inspector-copy'),
    disposition: 'RECHAIN',
    why: 'Component inspector Copy source UUID, same column, same tie.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-component-browser-inspector-unlink'),
    disposition: 'RECHAIN',
    why: 'Component inspector Unlink, same column, same tie.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-recipe-browser-inspector-edit'),
    disposition: 'RECHAIN',
    why:
      'Recipe inspector Edit: 38px accent primary, tied at (0,3,0) on min-height and ' +
      'font-size.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-component-browser-inspector-edit'),
    disposition: 'RECHAIN',
    why: 'Component inspector Edit, same column, same tie.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-recipe-browser-inspector-delete'),
    disposition: 'RECHAIN',
    why: 'Recipe inspector Delete, same column, same tie.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-component-browser-inspector-delete'),
    disposition: 'RECHAIN',
    why: 'Component inspector Delete, same column, same tie.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.manager-recipe-add-full'),
    disposition: 'RECHAIN',
    why:
      'The third selector of the recipe dashed-add font-size group, at (0,3,0), tied against ' +
      'the primitive and beaten outright by its `is-dashed` companion.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button:disabled'),
    disposition: 'RECHAIN',
    why:
      'NOT IN THE SEEDED LIST, and the sharpest correction here. The base disabled paint sits ' +
      "at (0,3,0); the primitive's `is-ghost` and `is-dashed` companions sit at (0,4,0) and " +
      'declare border-color, colour and background with no `:disabled` requirement, so after ' +
      'conversion a DISABLED ghost or dashed button keeps its enabled paint. Five ghost and ' +
      'ten dashed converting sites are affected. The delta says to preserve these base rules, ' +
      'which is necessary but not sufficient — they must also outrank the role companions in ' +
      'the disabled state.',
  },

  // ── INTENDED: the primitive is designed to beat these ─────────────────────────────────
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
    id: globalRule('.fabricate-manager .manager-button.is-ghost'),
    disposition: 'INTENDED',
    why:
      "The primitive's `is-ghost` keeps a RESTING border where this rule has none. Beating it " +
      'is the documented purpose of the companion rule.',
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
      "Accent → muted on 10 converting sites. The delta rules the primitive's treatment the " +
      'survivor and reconciles the bare selector to match, so the repaint is the decision, not ' +
      'a casualty of it.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-dashed:not(:disabled):hover'),
    disposition: 'INTENDED',
    why: 'The hover half of the same ruling.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button:not(:disabled):hover'),
    disposition: 'INTENDED',
    why:
      'The base hover paint, which the role hover companions at (0,6,0) are meant to beat. It ' +
      'also ties the resting role companions at (0,4,0) and wins on order alone, which the ' +
      'sweep must not disturb.',
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
    id: globalRule('.fabricate-manager .manager-button.is-primary'),
    disposition: 'NO_CONFLICT',
    why:
      "30 converting sites, and it declares only paint while the primitive's `is-primary` " +
      'companion declares only padding and font-weight. No shared property, so no repaint — ' +
      'the same reasoning the delta gives for `is-warning-action`, now measured.',
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-danger'),
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
  {
    id: globalRule('.fabricate-manager .manager-button.is-dashed.manager-recipe-add-full'),
    disposition: 'NO_CONFLICT',
    why:
      "(0,4,0) over the primitive's `is-dashed`, so it survives on specificity rather than on " +
      'order — which is why the delta may move it without repainting its four sites.',
  },
  {
    id: globalRule(
      '.fabricate-manager[data-manager-view="components"] .manager-toolbar .manager-button'
    ),
    disposition: 'NO_CONFLICT',
    why:
      'The root attribute lifts it to (0,4,0), so it beats the primitive outright on its 14 ' +
      'converting sites.',
  },
  {
    id: globalRule('.fabricate-manager .manager-setup-links .manager-button'),
    disposition: 'NO_CONFLICT',
    why:
      'The explainer card`s docs-link container. It declares no property the primitive ' +
      'declares, so its anchor site is untouched.',
  },

  // ── DEAD: real rules, zero call sites ─────────────────────────────────────────────────
  {
    id: globalRule('.fabricate-manager .manager-region-add'),
    disposition: 'DEAD',
    why:
      'Confirmed dead. No element in any component carries the class, so the rows 16/17 fix ' +
      'cannot be applied here — the delta already caught this and the tool agrees.',
  },
  {
    id: globalRule('.fabricate-manager .manager-tool-inspector-actions .manager-button'),
    disposition: 'DEAD',
    why: "Confirmed dead: `.manager-tool-inspector-actions` appears in no component's markup.",
  },
  {
    id: globalRule('.fabricate-manager .manager-tools-row-editor .manager-button'),
    disposition: 'DEAD',
    why: "Confirmed dead: `.manager-tools-row-editor` appears in no component's markup.",
  },
  {
    id: globalRule('.fabricate-manager .manager-tools-create-actions .manager-button'),
    disposition: 'DEAD',
    why: "Confirmed dead: `.manager-tools-create-actions` appears in no component's markup.",
  },
  {
    id: globalRule('.fabricate-manager .manager-button.is-warning-action'),
    disposition: 'DEAD',
    why:
      "NOT IN THE SEEDED LIST, and it corroborates the delta's `warning` repair from the " +
      'other side: the treatment exists and NOTHING renders it, because the one site that ' +
      'means to spells the class `is-warning`, which the sheet declares nowhere.',
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

test('the corpus is not vacuous, so the assertions above cannot pass over nothing', () => {
  // The floors that make the equality above mean something. Each one failed at least once
  // while this instrument was being built: a `<style>` named inside a docblock swallowed one
  // component\'s whole markup, and Svelte's scoping hash made every scoped rule match nothing.
  assert.ok(cascade.rules.length > 4000, `parsed ${cascade.rules.length} rules`);
  assert.equal(cascade.convertingSites.length, 129, 'the conversion is 129 sites');
  assert.equal(
    new Set(cascade.convertingSites.map((site) => site.file)).size,
    42,
    'across 42 components'
  );
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
