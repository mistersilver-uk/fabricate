/**
 * How often `styles/fabricate.css` writes one selector into more than one rule (issue 1501).
 * ── WHAT THE KEY IS ─────────────────────────────────────────────────────────────────────
 * `<at-context chain> | <normalised selector>`, with `(top level)` for a rule under no at-rule at
 * all, and the chain joined by ` >> ` when a rule is nested. The at-context is part of the key
 * because two rules under different conditions are never the same rule: the same selector inside
 * a `@container` and at the top level is two different pieces of authoring, and merging them is
 * not a thing that can be done. Keyed on the selector ALONE the sheet holds 207 repeated selectors
 * rather than these 113, and both figures are published so a reader can tell which produced a pin.
 * ── WHY THE TABLE IS FILTERED TO count >= 2 ─────────────────────────────────────────────
 * Unfiltered, the sheet holds 3,053 `(at-context, selector)` keys, of which 2,940 appear exactly
 * once. `assertRatchet` compares the observed tally against the baseline key by key, so an
 * unfiltered table would report every singleton as new debt the first time anybody added a rule,
 * and the gate's output would be unreadable on the day it mattered. The filter is applied on BOTH
 * sides — the gate tallies only repeated selectors too — so a selector falling to one appearance
 * is a VANISHED row rather than a silent pass.
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────────────────
 * MEASURED after #1648's history batch replaces the dismiss override with an owning 24px
 * variant and adds ListRow name/detail truncation, by `the sheet's cross-list selector repetition
 * does not move` in `design-system-debt-ratchets.test.js`, over
 * `scripts/lib/stylesheetSelectorCensus.js`, which is the same implementation the census report is
 * printed from. The sheet holds 2,569 rules at that head, 113 repeated keys and 231 appearances
 * between them; five keys appear three times and none appears four or more.
 * ISSUE 1510 PHASE 2 MOVES THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, and its
 * second commit is the first of the change to move them UPWARD. Converting the component studio's
 * five selects replaces three element-and-class skin rules with five: a class rule on a select
 * becomes a descendant rule on a picker trigger, and two of the three also need a slot stated on
 * the picker ROOT that the one rule used to carry on the element itself. So three rules leave and
 * five arrive, every one of them a singleton in both keyings, and the rule count rises by two
 * while the key and singleton counts each rise by two. `pinnedTotal` STAYS 231 across 113 rows:
 * `.fabricate-manager .manager-salvage-dc-card` keeps both of its appearances, because the rule
 * this commit rewrote was `… .manager-salvage-dc-card .manager-input`, a different key. Re-derived
 * by running the census, not subtracted.
 * ISSUE 1515 PHASE 9 MOVES THE THREE CONTEXTUAL FIGURES AND RE-KEYS ONE REPEATED ROW, and the two
 * halves are unrelated to one another. RE-KEYED: the rail's premium chip stops riding the
 * record-count vehicle, so `.fabricate-manager .manager-nav-button .manager-nav-count.manager-nav-premium`
 * becomes `.fabricate-manager .manager-nav-premium`. Both of its appearances re-key in the same
 * commit — the rule that owns the chip's scale, and the gold pair it shares with the title-bar
 * badge — so the row keeps its count of 2 and `pinnedTotal` stays 229 across 112 rows. MOVED: one
 * rule ARRIVES, `.manager-nav-planned`, the vehicle the planned-view "Soon" word takes now that it
 * is off the count class, and the collapsed-rail hide gains TWO selectors so that it names that
 * word and the chip itself rather than reaching them through the class they used to borrow. All
 * three are new singletons in both keyings, so the rule count rises by one to 2,571 while the key
 * and singleton counts each rise by three, to 3,052 and 2,940. That is the two shapes recorded
 * below arriving together: a whole block, and selectors joining an existing group. Re-derived by
 * running the census twice, not subtracted.
 * ISSUE 1511 MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, and it is the
 * first change to move them by deleting an APPLICATION ROOT'S element theme rather than a
 * primitive's or an area's copy of one. The player app's last native select converted, so
 * `.fabricate-app select:focus-visible`, `.fabricate-app select` and `.fabricate-app select
 * option` had no carrier left and were deleted outright: three rules, three selectors, every one
 * of them a singleton in both keyings, because no other rule shares a list with any of them. The
 * rule count falls by three and the key and singleton counts each fall by three, while
 * `pinnedTotal` STAYS 229 across 112 rows. The change adds no sheet rule at all — the two width
 * treatments the conversion needs live in the callers' own scoped blocks — so there is nothing on
 * the other side of the ledger to net against. Re-derived by running the census, not predicted.
 * ISSUE 1520 PHASE 5 MOVED THE THREE CONTEXTUAL FIGURES AGAIN AND STILL NONE OF THE REPEATED
 * ONES, and this time by the largest single deletion of the change. The Manage Interactables
 * panel's whole `fab-im-*` element family — 28 rules, 29 selectors — left `styles/fabricate.css`
 * for the root's own scoped block, because those rules were the only thing keeping the window's
 * appearance rooted at an application class. Every one is a singleton in both keyings, measured:
 * ISSUE 1509 PHASE 4 IS THE FIRST OF THIS CHANGE'S PHASES TO RE-KEY A ROW, AND IT RE-KEYS EXACTLY
 * ONE. Rooting `ToggleCard` at `fabricate-toggle-card` rewrites the leading compound of ten
 * selectors and rooting `ItemDropZone` at `fabricate-link-field` rewrites fifteen more, and of
 * those twenty-five exactly one is a repeated key: `.manager-item-drop-zone-copy small`, which the
 * sheet writes once as a list member beside its `strong` sibling and once as a sole selector to
 * give it a colour, a size and a leading. Both appearances re-root together, in the same commit,
 * so the row keeps its count of 2 and `pinnedTotal` stays 243 across 119 rows. Nothing is added,
 * split or deleted: the rule count stands at 2,619, the keyed and singleton figures at 3,123 and
 * 3,004, and the phase writes no new rule at all — both families declare NO focus pair and NO font
 * floor, and both refusals are asserted rather than merely absent.
 * ISSUE 1505 MOVED THE THREE CONTEXTUAL FIGURES AND NONE OF THE REPEATED ONES, by deleting
 * three rule blocks the shared `Callout` made redundant: the Checks studio's
 * `[data-failure-salvage-note]` override and its glyph rule, whose whole content the primitive
 * converged onto, and `.manager-recipe-info-strip`, whose two call sites became callouts. All
 * three were singleton keys, so the rule count falls by three, the key count and the singleton
 * count fall with it, and the repeated table is untouched — a deletion of unique authoring
 * rather than a repetition being paid down.
 * Those 124 / 253 in turn came from the 126 keys / 257 appearances issue 1501's own base held, by
 * two rows and four appearances: `.fabricate-app select:focus-visible`, whose list membership went
 * when the app and manager focus pair collapsed onto `.fabricate`, and
 * `.fabricate-manager .manager-tool-on-break`, one of whose two rules was deleted when its
 * declarations were adopted by `.fab-stack`. Everything else separating those figures from an
 * earlier reading of this table is the base's: issue 1371's catalogue, entry and system-rules
 * screens added seven repeated keys and rebuilt two rules out of existence, all of it beneath
 * both branches and neither one's conversion.
 */
import { readFileSync } from 'node:fs';

/** The table, read once at module load. */
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
 * `assertRatchet` asserts exactly that and throws before any comparison if the two disagree, so
 * this is the one figure a reviewer can check against the issue without reading the table. At the
 * measured commit it is 231 across 113 rows.
 */
export const SELECTOR_REPETITION_TOTAL = TABLE.pinnedTotal;
