/**
 * How often `styles/fabricate.css` writes one selector into more than one rule (issue 1501).
 * ── WHAT THE KEY IS ─────────────────────────────────────────────────────────────────────
 * `<at-context chain> | <normalised selector>`, with `(top level)` for a rule under no at-rule at
 * all, and the chain joined by ` >> ` when a rule is nested. The at-context is part of the key
 * because two rules under different conditions are never the same rule: the same selector inside
 * a `@container` and at the top level is two different pieces of authoring, and merging them is
 * not a thing that can be done. Keyed on the selector ALONE the sheet holds 203 repeated selectors
 * rather than these 110, and both figures are published so a reader can tell which produced a pin.
 * ── WHY THE TABLE IS FILTERED TO count >= 2 ─────────────────────────────────────────────
 * Unfiltered, the sheet holds 3,043 `(at-context, selector)` keys, of which 2,933 appear exactly
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
 * printed from. The sheet holds 2,568 rules at that head, 110 repeated keys and 225 appearances
 * between them; five keys appear three times and none appears four or more.
 * ISSUE 1510 PHASE 2 moves both the contextual figures and one repeated row. The component
 * studio conversion is already in main; the checks conversion adds two net rules and one net
 * keyed selector, adds two singleton keys, removes the repeated trigger-body native-select row,
 * and therefore moves 2,561 -> 2,563 rules, 3,039 -> 3,040 keyed selectors, 2,928 -> 2,930
 * singletons, 111 -> 110 repeated rows, 227 -> 225 appearances, and 205 -> 204 selectors keyed
 * alone. Re-derived from the combined sheet rather than treating either branch's figures as final.
 * ISSUE 1512 DELETES TWO REPEATED ROWS AND ADDS NONE. The progressive recipe stage row renders
 * through `SortableList`, so `.fabricate-manager .manager-recipe-result-row.is-reorderable` and
 * its `.manager-recipe-option-controls` descendant have no carrier left: the shared list's row
 * draws the box the first stated and the second is written once, against the row class the
 * conversion emits, rather than twice. `pinnedTotal` goes 231 -> 227 across 111 rows, and the
 * three contextual figures fall with the retired stage-row, steps-row, grip, rocker and
 * composition-pip families: 2,567 -> 2,555 rules, 3,051 -> 3,032 keys, 2,938 -> 2,921 singletons,
 * and 207 -> 205 selectors keyed alone. Its review round then adds four rules and one selector list
 * of two — the Included row's `.is-selected` and `.is-unavailable` state paint, the rocker's bare
 * icon-button override and the always-open body gate — so 2,555 -> 2,559 rules, 3,032 -> 3,037 keys
 * and 2,921 -> 2,926 singletons; the Checks studio's remove rule keeps both its selectors, because
 * `CraftingCheckEditor.svelte`'s unconverted outcome list still draws `.manager-checks-tier-remove`.
 * None of the five is a repeated selector, so the 111 rows, the 227 appearances and the 205
 * selectors keyed alone are unmoved. Re-derived by running the census twice, not subtracted.
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
 * Issue 1510 phase 2's fourth commit moves the three contextual figures and none of the repeated
 * ones. Converting the gathering task editor's seven selects strips the `select` token from two
 * `.manager-gathering-task-edit-view` legs and adds two trigger-width rules — one for the four
 * stacked fields, and one the review round added for the stamina row's two grid cells — so two
 * rules arrive and are singletons in both keyings while the two narrowed selectors re-key in place:
 * the rule, key and singleton counts each rise by two, to 2,573, 3,056 and 2,944, and `pinnedTotal`
 * stays 229 across 112 rows. Re-derived by running the census twice, not subtracted.
 * Issue 1510 phase 2's fifth commit moves the three contextual figures and none of the repeated
 * ones. Converting the environment overview's three selects and the Tool rails' actor picker adds
 * one rule — the context column's shared trigger width — while the actor picker's own skin rule
 * re-keys in place onto its trigger rather than leaving: the rule, key and singleton counts each
 * rise by one, to 2,574, 3,057 and 2,945, and `pinnedTotal` stays 229 across 112 rows. Re-derived
 * by running the census twice, not subtracted.
 * Issue 1510 phase 2's fifth commit also restores one rule issue 1512 deleted by mistake: the
 * outcome tier row's own box, `.manager-checks-tier-list > .manager-checks-tier-row`, which the
 * SortableList conversion took out with the recipe tier list while `CraftingCheckEditor.svelte`'s
 * outcome list still drew the rows itself. A new singleton in both keyings, so the rule, key and
 * singleton counts each rise by one over the rebased tree, to 2,567, 3,044 and 2,934, and
 * `pinnedTotal` is unmoved. Re-derived by running the census twice, not subtracted.
 * Issue 1510 phase 3's first commit moves the three contextual figures and none of the repeated
 * ones, and it is the first of the change to move them by ADDING ONLY. Converting the systems,
 * recipe-access and recipe-item browse filters narrows no rule at all — the native
 * `.manager-filter select` skin still has carriers in three unconverted toolbars and stays — and
 * adds two: the shared trigger floor those six converted controls take, and the `min-width: 0` the
 * picker root needs as the bar's flex item. Both are new singletons in both keyings, so the rule,
 * key and singleton counts each rise by two, to 2,568, 3,044 and 2,934, and `pinnedTotal` stays
 * 225 across 110 rows. Re-derived by running the census twice, not subtracted.
 * Its second commit moves the rule count alone. The conditions card's shared 36px rule loses its
 * `.manager-condition-current select` leg and keeps the add row's input, and the trigger's full
 * width arrives as a rule of its own, so the sheet holds one more rule, 2,569, while one key leaves
 * and one arrives: 3,044 keys and 2,934 singletons, both unmoved, and `pinnedTotal` stays 225
 * across 110 rows. Re-derived by running the census twice, not subtracted.
 * Its third commit deletes the `.manager-filter select` skin, whose last carriers were the
 * gathering task and event toolbars' six filters. It was a singleton in both keyings, so the rule,
 * key and singleton counts each fall by one, to 2,568, 3,043 and 2,933, and `pinnedTotal` stays
 * 225 across 110 rows. Re-derived by running the census twice, not subtracted.
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
 * ISSUE 1915 MOVED THE THREE CONTEXTUAL FIGURES AND ONE OF THE KEYED-ALONE ONES, and it is the
 * first change here to move the keyed-alone figure without touching the keyed table. Converging
 * both Tags & Categories screens on one shell deletes three rule blocks:
 * `.manager-tags-categories-workspace` at the top level AND its member of the 1120px
 * `@container` collapse list, and `.manager-vocabulary-tabs`, whose tab strip is retired. The
 * workspace class is the reason the keyed-alone figure moves: its two rules sit in two DIFFERENT
 * at-contexts, so it is two singletons under this file's keying and one repeated selector under
 * the other, and deleting both takes 204 -> 203 there while the keyed table is untouched.
 * `.manager-environment-details-grid` leaves with it, a fourth singleton key: it was the
 * workspace's only companion in that `@container` list and `styles-dead-classes` reports the
 * block as matching nothing the moment the workspace selector goes, which is that gate finding a
 * dead selector that had been hiding inside a live rule. The `tags` `.manager-main` rule is
 * REWRITTEN rather than added, and the narrowed toolbar-select skin is RE-KEYED onto
 * `.manager-vocabulary-shell-panel` — a singleton before and after in both keyings — so neither
 * moves a figure. 2,565 -> 2,562 rules, 3,042 -> 3,038 keys, 2,932 -> 2,928 singletons, 204 ->
 * 203 keyed alone; 110 repeated keys and 225 appearances are unmoved. Re-derived by running
 * `node scripts/stylesheet-selector-census.mjs`, not subtracted.
 * ITS PHASE 3 MOVES THE THREE CONTEXTUAL FIGURES AGAIN AND NOTHING ELSE. Retiring the system
 * screen's inspector rail releases its grid column, which is a `.manager-body` pair — the 2-track
 * rule and its `.is-rail-collapsed` twin at equal specificity — written as its own rules rather
 * than appended to either released-route list, so that the seven world-route lists stay
 * byte-identical. Both are ARRIVALS and both are singletons in both keyings, so the repeated
 * table is untouched a second time: 2,562 -> 2,564 rules, 3,038 -> 3,040 keys, 2,928 -> 2,930
 * singletons, 203 keyed alone unmoved, 110 repeated keys and 225 appearances unmoved. Re-derived
 * by running `node scripts/stylesheet-selector-census.mjs`, not subtracted.
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
 * measured commit it is 225 across 110 rows.
 */
export const SELECTOR_REPETITION_TOTAL = TABLE.pinnedTotal;
