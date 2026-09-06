/**
 * How often `styles/fabricate.css` writes one selector into more than one rule (issue 1501).
 *
 * THIS IS A DESCRIPTION OF DELIBERATE AUTHORING, NOT A DEFECT COUNT, and that is the whole reason
 * it lives here rather than in `design-system-known-debt.json`. Every row in that table is
 * something `openspec/specs/design-system/spec.md` already prohibits. Nothing in this one is: the
 * sheet's repetition is almost entirely a selector appearing in one comma-separated LIST and again
 * in a DIFFERENT list — shared-list authoring, three instances of it carrying a comment saying so —
 * and `stylelint`'s `no-duplicate-selectors` is enabled on the sheet and green, because its default
 * `disallowInList: false` is exactly what makes those two facts compatible. Issue 1501 measured the
 * population of repeated full selector LISTS, the only population a merge could act on, and found
 * it EMPTY. So this table exists to say what the shape of the sheet is, and to make a change to
 * that shape an edit somebody signed rather than a drift nobody saw.
 *
 * ── AN EXACT PIN, NOT A CEILING ─────────────────────────────────────────────────────────
 * `assertRatchet` reds on a SHRINK and on a VANISHED key just as loudly as on growth, and that is
 * the behaviour wanted here rather than a side effect tolerated. A row leaving this table means a
 * shared selector list was split or a rule deleted, which moves declarations through the cascade;
 * a row arriving means a list was widened or a rule copied. Both are edits a reviewer should see,
 * and neither is wrong on its face. The remedy for either is the same: re-derive the table and say
 * in the pull request which rule moved and why.
 *
 * ── WHAT THE KEY IS ─────────────────────────────────────────────────────────────────────
 * `<at-context chain> | <normalised selector>`, with `(top level)` for a rule under no at-rule at
 * all, and the chain joined by ` >> ` when a rule is nested. The at-context is part of the key
 * because two rules under different conditions are never the same rule: the same selector inside
 * a `@container` and at the top level is two different pieces of authoring, and merging them is
 * not a thing that can be done. Keyed on the selector ALONE the sheet holds 213 repeated selectors
 * rather than these 119, and both figures are published so a reader can tell which produced a pin.
 *
 * ── WHY THE TABLE IS FILTERED TO count >= 2 ─────────────────────────────────────────────
 * Unfiltered, the sheet holds 3,120 `(at-context, selector)` keys, of which 3,001 appear exactly
 * once. `assertRatchet` compares the observed tally against the baseline key by key, so an
 * unfiltered table would report every singleton as new debt the first time anybody added a rule,
 * and the gate's output would be unreadable on the day it mattered. The filter is applied on BOTH
 * sides — the gate tallies only repeated selectors too — so a selector falling to one appearance
 * is a VANISHED row rather than a silent pass.
 *
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────────────────
 * MEASURED over this branch's own head, rebased onto the merged main at 75dd8bf9 (which carries
 * issue 1371's fix adding one rule to the sheet), by `the sheet's cross-list selector repetition
 * does not move` in `design-system-debt-ratchets.test.js`, over
 * `scripts/lib/stylesheetSelectorCensus.js`, which is the same implementation the census report is
 * printed from. The sheet holds 2,610 rules at that head, 119 repeated keys and 243 appearances
 * between them; five keys appear three times and none appears four or more.
 *
 * ISSUE 1508 RE-KEYED THREE ROWS AND MOVED THE THREE CONTEXTUAL FIGURES, and it did the two
 * things separately. RE-KEYED: rooting `Field` at the class it emits rewrites the leading compound
 * of its whole family, so the three rows whose members re-root together —
 * `.fabricate-manager .manager-field input:not(…)`, `… select` and `… textarea` — become
 * `.fabricate-field.manager-field …`. Each row keeps its count of 2, because both members of each
 * pair re-rooted in the same commit, so `pinnedTotal` does not move and stays 243 across 119 rows.
 * MOVED: the same change ADDS six rules carrying fourteen selectors — the two-member font floor,
 * `Field`'s seven-leg element-typed chrome rule, and the strip and repaint halves of both new
 * families' focus pairs — every one of them a new singleton in both keyings, so the key count and
 * the singleton count each rise by fourteen and the rule count by six, while the repeated table is
 * untouched.
 *
 * ISSUE 1508 PHASE 2 RE-KEYED TWO MORE ROWS AND MOVED NOTHING ELSE, which is the shape a pure
 * re-root takes. Rooting `ManagerToolbar` and `InspectorCard` at the classes they emit rewrites
 * the leading compound of both families, so `.fabricate-manager .manager-inspector-card` becomes
 * `.fabricate-card.manager-inspector-card` and `.fabricate-manager .manager-toolbar` becomes
 * `.fabricate-filter-bar.manager-toolbar`. Each row keeps its count of 2 because both members of
 * each pair re-rooted in the same commit, and unlike phase 1 this phase ADDS no rule at all —
 * neither family owns a control, so neither declares a font floor or a focus pair — so the rule,
 * key and singleton counts are all unchanged and `pinnedTotal` stays 243 across 119 rows.
 *
 * ISSUE 1508 PHASE 3 RE-KEYED NO ROW AND MOVED THE THREE CONTEXTUAL FIGURES, which is the third
 * shape this change takes. Rooting `StatusToggle` and `ChanceSlider` rewrites the leading compound
 * of forty selectors, and NOT ONE of them is a repeated key — measured, and the reason is that
 * neither family shares a selector list with another family — so the repeated table is untouched
 * and `pinnedTotal` stays 243 across 119 rows. What moves is the four rules the phase ADDS:
 * `StatusToggle`'s (0,1,0) font floor at its own root, the strip half of its checkbox host's pair
 * (`.fabricate-toggle .manager-tool-setting-toggle-input:focus`, whose repaint is the `:has()`
 * ring that already existed), and `ChanceSlider`'s own strip and repaint. Each is a new singleton
 * in both keyings, and the slider's font floor is a fifth new SELECTOR joining the existing
 * two-member floor group rather than a rule of its own — so the rule count rises by four while the
 * key and singleton counts each rise by five.
 *
 * ISSUE 1506 MOVED THE THREE CONTEXTUAL FIGURES A THIRD TIME, by adding one rule:
 * `.fabricate-manager .manager-recipe-name-row .manager-chip` gives the row's status pills
 * `flex: 0 0 auto`, so `truncate`'s `overflow: hidden` cannot zero their automatic minimum
 * size and squeeze them for room the name should give up first. The selector is a new
 * singleton in both keyings, so the rule, key and singleton counts each rise by one and the
 * repeated table is untouched.
 *
 * ISSUE 1506 MOVED TWO OF THE THREE CONTEXTUAL FIGURES A SECOND TIME, AND NOT THE RULE COUNT, by
 * deleting one SELECTOR out of a five-selector group: `.fabricate-manager .manager-recipe-thumb`,
 * whose two raw `<img>` call sites became the shared art tile. The rule and its four other
 * selectors — all owned by other geometry sweeps — stay, so the RULE count is unchanged at 2,599
 * while the key count and the singleton count each fall by one. That is the shape a selector
 * leaving a group takes, as against a whole block leaving, and the two are recorded separately
 * because only one of them moves the rule count. The gate cannot see this one on its own:
 * `deadRuleBlocks` treats a block as dead only when EVERY selector in the group is dead, so the
 * check with teeth is `git grep -n 'manager-recipe-thumb'` returning nothing across `styles/` and
 * `src/`, which the pull request quotes.
 *
 * ISSUE 1506 ALSO MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, by deleting one
 * rule block: the Tool player preview's `[data-tool-player-preview] .fab-status-pill.is-subtle`,
 * which selected the status pill this change retires into the shared chip. It was a singleton
 * key, so the rule count falls by one and the key and singleton counts fall with it, and the
 * repeated table is untouched — the same shape as the deletion issue 1505 recorded above. The
 * rule had never rendered, for the reason its own comment recorded: the sheet is imported at
 * `layer(modules)` and the primitive's scoped block is unlayered, so it lost at every
 * specificity.
 *
 * ISSUE 1505 MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, by deleting
 * three rule blocks the shared `Callout` made redundant: the Checks studio's
 * `[data-failure-salvage-note]` override and its glyph rule, whose whole content the primitive
 * converged onto, and `.manager-recipe-info-strip`, whose two call sites became callouts. All
 * three were singleton keys, so the rule count falls by three, the key count and the singleton
 * count fall with it, and the repeated table is untouched — a deletion of unique authoring
 * rather than a repetition being paid down.
 *
 * ISSUE 1504 MOVED FOUR OF THESE SIX FIGURES, through three edits that partly cancel. The
 * `.fabricate-select*` family arrived — 32 new rules writing 33 new keys, every one a
 * singleton, so it moved the contextual figures and left the repeated ones alone. Then the two
 * scoped-catalogue toolbar select rules were NARROWED onto the one route that still renders a
 * native select there, which SPLIT the type rule's two-member list: its `input` leg merges into
 * a rule that already existed, and its `select` leg merges with the geometry rule under the
 * narrowed selector. Two rows therefore VANISH and the appearance total drops by four, while the
 * key total is unchanged and the singleton count rises by two: a list being split rather than a
 * defect being counted. That narrowing removed one rule and issue 1371's own `is-size-38` rung
 * was SPLIT in the same pass — its scoped-catalogue member had to name the converted trigger
 * rather than a `select` element — which adds one back, so the rule total is where the family
 * lift left it. Issue 1371's separately merged fix (9cca54f6) added one more rule and one more
 * singleton key beneath all three of these edits.
 *
 * A COMMIT SHA IS NOT THE ANCHOR, deliberately. An earlier draft of this docblock cited the
 * coordinator head it was first measured at; a rebase then added a rule to the sheet, the three
 * contextual figures went stale, and no gate could see it because none of them is pinned. The
 * figures a reader can check are the ones this branch's own tree produces.
 *
 * Issue 1503 moved it by exactly three rows and six appearances, from the 124 keys / 253
 * appearances issue 1501's Phase A left:
 * `.fabricate-icon-picker-popover .essence-icon-picker-option`,
 * `.fabricate-source-picker-popover .essence-source-picker-grid` and
 * `.fabricate-source-picker-popover .essence-source-picker-option` each fell to ONE appearance
 * when the callers' panel, list and row blocks were deleted in favour of the shared primitive's.
 * Those 124 / 253 in turn came from the 126 keys / 257 appearances issue 1501's own base held, by
 * two rows and four appearances: `.fabricate-app select:focus-visible`, whose list membership went
 * when the app and manager focus pair collapsed onto `.fabricate`, and
 * `.fabricate-manager .manager-tool-on-break`, one of whose two rules was deleted when its
 * declarations were adopted by `.fab-stack`. Everything else separating those figures from an
 * earlier reading of this table is the base's: issue 1371's catalogue, entry and system-rules
 * screens added seven repeated keys and rebuilt two rules out of existence, all of it beneath
 * both branches and neither one's conversion.
 *
 * ── WHY THE ROWS ARE JSON AND NOT ARRAYS IN THIS MODULE ─────────────────────────────────
 * The reason `design-system-known-debt.js` records for its own table: SonarCloud's copy-paste
 * detector normalises string literals, so a long run of quoted-string lines matches any other such
 * run by SHAPE whatever the strings say. `.json` is not indexed by the JavaScript analyser at all.
 * The rows are OBJECTS rather than the `'<key> | <count>'` strings that table uses, which is the
 * one place the two files deliberately differ: a row that is already `{key, count}` needs no
 * parser, so there is no second copy of `knownDebt`'s split-from-the-right to drift from the
 * first.
 */
import { readFileSync } from 'node:fs';

/**
 * The table, read once at module load.
 *
 * The file is data with no imports and no cycles, so there is nothing to defer: a parse failure
 * here is a broken checkout rather than a test outcome.
 */
const TABLE = JSON.parse(
  readFileSync(new URL('selector-repetition-baseline.json', import.meta.url), 'utf8')
);

/** Reject a row `assertRatchet` would misread — a missing key, or a count below two. */
function checkedRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      'selector-repetition-baseline.json holds no `rows` array. A gate reading a missing table ' +
        'ratchets against an empty baseline, which reports every live repetition as new debt.'
    );
  }
  return Object.freeze(
    rows.map((row) => {
      if (typeof row?.key !== 'string' || !Number.isInteger(row?.count) || row.count < 2) {
        throw new Error(
          `selector-repetition-baseline.json row ${JSON.stringify(row)} is malformed. Every row ` +
            'is a `{ "key": string, "count": integer >= 2 }` object; a count of one is a selector ' +
            'that is not repeated at all and does not belong in a repetition table.'
        );
      }
      return Object.freeze({ key: row.key, count: row.count });
    })
  );
}

/**
 * Every repeated `(at-context, selector)` of `styles/fabricate.css`, with how often it appears.
 *
 * @see the file docblock for the keying, the filter and the measurement.
 */
export const SELECTOR_REPETITION_BASELINE = checkedRows(TABLE.rows);

/**
 * The SUM of the counts, not the number of rows.
 *
 * `assertRatchet` asserts exactly that and throws before any comparison if the two disagree, so
 * this is the one figure a reviewer can check against the issue without reading the table. At the
 * measured commit it is 243 across 119 rows.
 */
export const SELECTOR_REPETITION_TOTAL = TABLE.pinnedTotal;
