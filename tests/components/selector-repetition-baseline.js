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
 * not a thing that can be done. Keyed on the selector ALONE the sheet holds 208 repeated selectors
 * rather than these 119, and both figures are published so a reader can tell which produced a pin.
 *
 * ── WHY THE TABLE IS FILTERED TO count >= 2 ─────────────────────────────────────────────
 * Unfiltered, the sheet holds 2,863 `(at-context, selector)` keys, of which 2,744 appear exactly
 * once. `assertRatchet` compares the observed tally against the baseline key by key, so an
 * unfiltered table would report every singleton as new debt the first time anybody added a rule,
 * and the gate's output would be unreadable on the day it mattered. The filter is applied on BOTH
 * sides — the gate tallies only repeated selectors too — so a selector falling to one appearance
 * is a VANISHED row rather than a silent pass.
 *
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────────────────
 * MEASURED over this branch's own head, rebased onto issue 1502's final tree, by `the sheet's
 * cross-list selector repetition does not move` in `design-system-debt-ratchets.test.js`, over
 * `scripts/lib/stylesheetSelectorCensus.js`, which is the same implementation the census report is
 * printed from. The sheet holds 2,365 rules at that head, 119 repeated keys and 244 appearances
 * between them; six keys appear three times and none appears four or more.
 *
 * A COMMIT SHA IS NOT THE ANCHOR, deliberately. An earlier draft of this docblock cited the
 * coordinator head it was first measured at; a rebase then added a rule to the sheet, the three
 * contextual figures went stale, and no gate could see it because none of them is pinned. The
 * figures a reader can check are the ones this branch's own tree produces.
 *
 * Phase A moved it from the 121 keys / 248 appearances measured at `b6ebbecc`, by exactly two
 * rows and four appearances: `.fabricate-app select:focus-visible`, whose list membership went
 * when the app and manager focus pair collapsed onto `.fabricate`, and
 * `.fabricate-manager .manager-tool-on-break`, one of whose two rules was deleted when its
 * declarations were adopted by `.fab-stack`. Phase C changes no selector at all.
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
 * measured commit it is 244 across 119 rows.
 */
export const SELECTOR_REPETITION_TOTAL = TABLE.pinnedTotal;
