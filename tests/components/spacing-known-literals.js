/**
 * The measured, frozen debt in RAW SPACING LITERALS (issue 1448).
 *
 * `openspec/specs/ui-integration/spec.md` has made the 4px spacing scale normative under its
 * "Spacing scale" section since the design system landed: padding, margin and gap "must derive
 * from a shared 4px-based spacing scale ... rather than from raw pixel literals". Nothing checked
 * it, and half the corpus could not have been checked — `npm run lint:css` globs `styles/**`
 * only, so the 1642 spacing declarations inside Svelte scoped `<style>` blocks were unreachable
 * by stylelint entirely.
 *
 * `spacing-scale-ratchet.test.js` freezes what is here so nothing new arrives. This file is the
 * baseline it freezes, and `spacing-known-literals.json` beside it is the table. It is DEBT, not
 * permission: every row is a literal that should be a token, and the gate fails just as loudly
 * when a row is paid down without being banked.
 *
 * -- WHY THE SANCTIONED SCALE IS HELD OPAQUE, AND WHAT THAT MAKES THE NUMBER --------------
 * `styleBlockScan.js` resolves `var()` because, with a text-only scan, the cheapest way to pay a
 * ratchet down is to move the literal into a token — the pixel does not move and the gate goes
 * green. That reasoning is about a NARROW prohibition. This gate bans every literal, and under
 * full resolution `padding: var(--fab-space-3)` resolves to `12px` and is flagged: the scan would
 * report the exact thing the spec asks for as debt. Measured on this corpus, the two answers are
 * 2989 occurrences against 1005 — the difference is not an edge, it is the whole sanctioned
 * population.
 *
 * So the published scale is the ALLOWED indirection and is held opaque
 * ({@link isSpacingScaleToken} feeds `scanPixelDeclarations`'s `opaqueProperty`), and every other
 * custom property is resolved as usual. That is the reading the spec's own wording gives: a
 * declaration satisfies the requirement by DERIVING from the scale, and a private token holding
 * `7px` derives from nothing. It also keeps resolution load-bearing rather than decorative —
 * rewrite `padding: 8px` as `--inset: 8px; padding: var(--inset)` and the occurrence survives
 * with its raw text changed, which `no raw spacing literal has been laundered into a private
 * token` reds on.
 *
 * -- THE NUMBERS, AND WHY THEY ARE NOT THE 1021 A TEXT SCAN GIVES -------------------------
 * A text-only scan of the same properties over the same corpus finds 1021 pixel literals in 831
 * declarations across 124 files, out of 3379 spacing declarations. This gate reports 1005 before
 * exemptions, and the 16 it does not are not a loss: an occurrence is one (declaration, VALUE)
 * pair, so `padding: 8px 8px` is one occurrence and a text scan counts the literal twice. The
 * two exempt bands then remove 73 — 63 hairlines and 10 clearances — leaving
 * {@link KNOWN_RAW_SPACING_TOTAL}.
 *
 * Resolution adds nothing TODAY, and that is a fact about the tree rather than about the scan:
 * no spacing declaration in this corpus reaches a pixel value through a non-scale custom
 * property, so the opaque walk expands nothing and every occurrence is written on the line it
 * cites. The scan is proved to reach a value written only into a token, end to end over a
 * synthetic corpus of real files, by `tests/style-block-scan.test.js`.
 *
 * -- THE EXEMPTIONS ARE PREDICATES, NOT AN ALLOWLIST --------------------------------------
 * The spec documents two literal exemptions, and this file states them as predicates over the
 * value. An allowlist of a thousand entries would be a second baseline to maintain, and its
 * per-entry reasons rot faster than anyone re-reads them. The cost is that a predicate cannot
 * distinguish a legitimate 36px icon clearance from a careless 36px gap; the mitigation is that
 * the bands are narrow, published, and asserted to still be published — see `the spacing scale
 * this gate enforces is still the spec's` in the gate.
 *
 * -- THE SCAN IS SIGN-BLIND, AND BOTH EXEMPTIONS ARE MAGNITUDES ---------------------------
 * `styleBlockScan.js` says so in terms: its pixel pattern excludes a word character or a dot
 * before a digit and a minus is neither, so `margin: -8px` tallies as `8px`. For a height gate
 * that is unreachable; for a spacing gate it is a real limitation, and it is not worked around
 * here because it does not bite. Both exemptions are stated by the spec as magnitudes — `1px`
 * hairlines expressly include `-1px` overlap bleeds — so the predicates are written on the
 * absolute value and agree with the sign-blind reading exactly. A future exemption that had to
 * tell `-8px` from `8px` would need that pattern changed rather than this file.
 *
 * -- WHY THE ROWS ARE JSON AND NOT AN ARRAY IN THIS MODULE --------------------------------
 * `control-height-known-literals.js` carries its 38 rows as strings in the module, and this file
 * would carry 620. SonarCloud's copy-paste detector normalises string literals, so a run of
 * quoted-string lines matches ANOTHER such run by shape whatever the strings say, and its
 * minimum block is roughly 100 tokens — about 50 such lines. 38 rows sit under that floor; 620
 * do not, and `scripts/lib/screenshotCaptureMap.js` already ships a 157-line run of exactly that
 * shape for them to collide with. `.json` is not indexed by the JavaScript analyser at all, so
 * the table lives there: one row per line, diffed the same way, with none of the risk of a
 * duplication failure that says nothing about the change.
 */
import { readFileSync } from 'node:fs';

/**
 * The properties the spacing scale governs, exactly as `ui-integration/spec.md` names them:
 * padding, margin and gap.
 *
 * THE LOGICAL LONGHANDS CONTRIBUTE ZERO TODAY and are scanned anyway, so a rewrite cannot walk
 * around the gate by switching property spelling. `row-gap` and `column-gap` are zero as well.
 * Every pinned figure below depends on this set being exactly these twenty-five, and the gate
 * asserts each logical spelling is still in it rather than trusting this comment.
 */
export const SCANNED_SPACING_PROPERTIES = Object.freeze([
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-block',
  'padding-block-start',
  'padding-block-end',
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'gap',
  'row-gap',
  'column-gap',
]);

/**
 * The prefix every published spacing token carries — `--fab-space-1` through `--fab-space-6`,
 * `--fab-space-2xs` and `--fab-space-chip`. Five semantic aliases stood beside them and were
 * deleted for having no readers anywhere in `styles/` or `src/` (issue 1499).
 *
 * A prefix rather than a list of eight names, because the spec's rule is about deriving from
 * the SCALE and a scale that gains a step should not need this file edited to keep the gate
 * honest. The narrower reading would be the more dangerous one here: a token the list forgot
 * would resolve, its pixel value would be manufactured, and every call site of it would arrive
 * as new debt on someone else's unrelated change.
 */
export const SPACING_SCALE_PREFIX = '--fab-space';

/**
 * Whether a custom property is a published spacing token, and so an allowed indirection.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSpacingScaleToken(name) {
  return name.startsWith(SPACING_SCALE_PREFIX);
}

/** The magnitude the spec exempts as a hairline — borders, dividers and `-1px` overlap bleeds. */
export const HAIRLINE_MAGNITUDE = 1;

/** The bottom of the band the spec exempts as a one-off fixed dimension. */
export const CLEARANCE_MINIMUM = 34;

/** The top of that band. */
export const CLEARANCE_MAXIMUM = 42;

/**
 * The spec's two documented literal exemptions, as a predicate on the pixel value.
 *
 * @param {number} pixels
 * @returns {boolean}
 */
export function isExemptSpacingPixels(pixels) {
  const magnitude = Math.abs(pixels);
  return (
    magnitude === HAIRLINE_MAGNITUDE ||
    (magnitude >= CLEARANCE_MINIMUM && magnitude <= CLEARANCE_MAXIMUM)
  );
}

/**
 * The headline. Pinned exactly rather than derived, so a hand edit to one row's count that
 * forgets this number fails rather than quietly re-baselining.
 *
 * It was 932, over 620 rows. Issue 1373's Tool Rules parity pass took the toolbar column, the
 * header band, the inspector inset and one authority-segment inset onto the published scale,
 * which paid five occurrences down and emptied one row entirely (`padding: 6px`). The debt was
 * paid by TOKENIZING rather than by deleting, so it is banked here rather than left as a slot
 * the next author could fill for free.
 *
 * It was 917 until issue 1498 deleted the 367 rule blocks in `styles/fabricate.css` that
 * matched no element, at base `0eff5b36e`. That took four occurrences with it and emptied one
 * row (`styles/fabricate.css | padding | 48`). None of them was tokenized: the declarations
 * simply went, along with the rules carrying them, so the debt fell rather than being paid.
 *
 * It was 913 until issue 1505 converted the Shopping list's three summary cards to the shared
 * `<StatBox>`. Two occurrences went with the scoped block: the card's `gap: 2px` between the
 * figure and its label, which the specimen's centred box does not have at all and which the
 * row `…/ShoppingList.svelte | gap | 2` counted alone, so that row is DELETED; and the value
 * line's `gap: 6px`, which the primitive re-states as `var(--fab-space-chip)` — the published
 * 6px token — so `| gap | 6` falls 2 to 1 against the file's other, unconverted occurrence.
 * The first is a deletion and the second is a tokenization, and neither leaves a slot open.
 *
 * It was 911 until the same issue converted the alchemy workbench's last-brew banner and the
 * inventory bulk report's banner to the shared `<Notice>`. Five occurrences went, and they are
 * two kinds. The workbench's banner block took its `gap: 9px` and its `padding: 11px 13px` with
 * it, so three rows each fall 2 to 1 against the file's other, unconverted occurrence of the
 * same literal — the primitive states the specimen's `var(--fab-space-3)` for both, so this is
 * a tokenization. The bulk report's `gap: 2px` (the title/summary separation, which the
 * specimen expresses as the detail's own `margin-top`) and `padding: 10px` were each that
 * file's only occurrence, so both rows are DELETED.
 *
 * `…/Workbench.svelte | margin-bottom | 12` is deliberately UNCHANGED. That declaration is the
 * caller's LAYOUT rather than the notice's geometry — `.alchemy-brew-area` is a plain block, so
 * it is the only separation between the banner and the Brew button — so `.alchemy-banner`
 * survives the conversion stripped to it, and a shrink there would be a defect rather than a
 * re-bank.
 *
 * It was 906 until the same issue widened `Callout` onto its own specimen. Five more occurrences
 * went, from two deletions. The Checks studio's `[data-failure-salvage-note]` override — the
 * caller rule whose content the primitive converged onto — took `gap: 11px` and
 * `padding: 13px 14px` with it, so three `styles/fabricate.css` rows each fall by one against
 * the sheet's other occurrences; and the inventory salvage banner's scoped block took its
 * `padding: 10px` and its title/rule `gap: 2px`, each that file's only occurrence, so both rows
 * are DELETED. Every one of the five is now `var(--fab-space-3)` or the specimen's own
 * `margin-top` inside the primitive, so none of them left a slot open.
 *
 * It fell a further four when the same issue converted the salvage body's two remaining
 * hand-rolled callouts — the progressive flow strip and the reorder note — onto that same
 * widened primitive. Both declared `padding: 8px 10px`, so `SalvageProgressiveBody.svelte`'s
 * `padding | 10 | 2` and `padding | 8 | 2` rows are DELETED rather than lowered: the file has
 * no other occurrence of either. The padding is `var(--fab-space-3)` inside the primitive now,
 * so neither slot is left open.
 */
// 897 -> 895 (issue 1506): the journal's `RunStatusPill` was DELETED, and its two
// occupancies — a 5px gap and an 8px padding — vanished with it. `assertRatchet` fails on a
// VANISHED row as loudly as on a new one, so the rows and this total move in the commit that
// deletes the file. Measured, not subtracted.
// 895 -> 892 (issue 1506): the crafting `CraftingStatusBadge` went the same way, taking
// three — a 5px gap, the 2px inset of its icon-only variant and an 8px padding. Its two callers
// render the shared chip, whose own square face states `padding: 0`.
// 892 -> 890 (issue 1506): the crafting `QuantityTag` was the third and last of the retired
// look-alikes, taking a 5px gap and an 8px padding. Seven occupancies in all, one per rule those
// three files declared; the chip they converged onto declares its own once.
// 890 -> 889 (issue 1506): the crafting `CraftingThumb` was DELETED with the art-tile
// unification, taking the ONE occupancy it declared — the 6px padding its `is-fallback` rule
// insetted a house-fallback image by. That treatment is dropped rather than restated, so the
// slot is not left open anywhere; `CraftingEssenceThumb` went in the same commit and had no
// spacing row at all. Measured on the tree, not subtracted.
// 889 -> 884 (issue 1514): the five player views drew the same centred loading/error/empty fill
// up to a class-name prefix, and each of those five blocks declared `gap: 12px` — the ONE raw
// spacing literal in each of the five files. The blocks are one shared composition now, and the
// composition writes `var(--fab-space-3)`, which is 12px, so nothing on screen moves and no slot
// is left open under a new path. Five rows are DELETED rather than re-banked as one:
// `assertRatchet` fails on a paid-down row as loudly as on a new one, so the rows and this total
// move in the commit that deletes the blocks. Measured on the tree, not subtracted.
// 884 -> 877 (issue 1514, phase 2): `GatheringTaskDetail`'s two node banners moved onto `Notice`,
// which owns its own geometry, so the four rules those banners declared went with them. Three
// rows VANISH — `gap 2` (the depleted banner's two-line copy stack), `gap 8` and `padding 8` (one
// occupancy each per banner) — and `padding 10` SHRINKS 3 -> 1, because two of its three were the
// same banners' `8px 10px`. Deleted rather than re-banked under `Notice`'s path: the primitive
// declares `var(--fab-space-3)` throughout and owns no raw literal, so the seven occupancies are
// paid rather than moved. Measured on the tree, not subtracted.
// 877 -> 863 (issue 1514, phase 3): the alchemy and journal tabs' twelve raw thumbnails, seven
// pane empties and two wells moved onto primitives that own their own geometry, and the rules
// those markup blocks declared went with them. Six rows SHRINK by one occupancy each - the
// `gap`s and `padding`s of `.alchemy-inventory-empty`, `.alchemy-known-empty` and
// `.alchemy-known-footer` - and eight rows at one occupancy VANISH, five of them the whole of
// `TimeRemainingBox` and `JournalListShell`'s and `RunDetail`'s deleted empty-state stacks. The
// two caller-owned WRAPPERS this phase keeps bring nothing back: `.alchemy-known-footer-slot`
// declares `margin-top: 12px` and `.alchemy-produces-slot` declares `margin: 18px 0 10px`, and
// all three of those values were already banked rows on the rules they came from - 12 and 18 and
// 10 are literals either way, so a wrapper carrying a margin verbatim moves no occupancy. What
// the primitives absorb is `var(--fab-space-*)` throughout, so the fourteen occupancies are paid
// rather than relocated. Measured on the tree, not subtracted.
// 863 -> 853 (issue 1514, phase 4): the inventory tab's kind filter, its actor portrait, its two
// remaining banners and its fourteen pane empties moved onto primitives that own their own
// geometry. Eight rows at one occupancy VANISH and one SHRINKS by two. The whole of
// `SalvageMisconfiguredBody`'s scoped block goes with the body it drew (`gap 4`, `gap 6`,
// `padding 10`), as does `.inventory-detail-broken-banner`'s `padding 8`, the portrait well's
// `padding 10`, `InventoryDetail`'s centred stack `gap 12`, and the kind pill's `padding 3` and
// `padding 10`; `InventoryFilters | gap 6` falls 3 -> 1 because two of its three were the pill
// strip's own gap and the gap between a pill's glyph, label and count, both of which
// `SegmentedControl` declares in tokens. The one caller-owned WRAPPER this phase keeps brings
// nothing back — `.inventory-detail-broken-slot` declares `flex-shrink` alone, which is not
// spacing — and the `.inventory-detail-empty` fill wrapper keeps the `var(--fab-space-4)` it
// already had. What the primitives absorb is `var(--fab-space-*)` throughout, so the ten
// occupancies are paid rather than relocated. Measured on the tree, not subtracted.
// 853 -> 844 (issue 1514, phase 5): the crafting tab's two actor portraits, its blocking well, its
// essence-pool track, its five pane empties and the roots' companion-fault strip moved onto
// primitives that own their own geometry, and the rules those markup blocks declared went with
// them. Two rows SHRINK by one occupancy each and seven rows at one occupancy VANISH. The two that
// shrink are `ComponentSourcesBar | padding 8`, whose second occupancy was the picker's own empty
// line, and `RecipeDetailHeader | gap 8`, whose third was the blocking well's. The seven that
// vanish are the whole of `FabricateAppRoot`'s deleted fault strip (`gap 12`, `padding 14`,
// `padding 16`, and the description's `margin 4`), `RecipeDetail`'s deleted centred stack
// (`gap 12`), the blocking list's `padding-left 16` and the shopping planner's `gap 10`.
// THREE CALLER-OWNED WRAPPERS THIS PHASE KEEPS BRING NOTHING BACK, and each is a different reason:
// `.fabricate-app-extension-fault` keeps `max-width` and `margin: 20px`, and its 20 was already a
// banked row on that same rule, so a wrapper carrying a margin verbatim moves no occupancy;
// `.crafting-shopping-empty` keeps the `var(--fab-space-4)` it already had; and
// `.actor-bar-stamina-track` and `.essence-pool-bar` keep a width and a display and no spacing at
// all. What the primitives absorb is `var(--fab-space-*)` throughout, so the nine occupancies are
// paid rather than relocated. Measured on the tree, not subtracted.
export const KNOWN_RAW_SPACING_TOTAL = 844;

/**
 * The per-corpus spacing-declaration counts the floors were CHOSEN AGAINST, at the commit that
 * chose them: 1445 under `styles/**` and 1642 in Svelte scoped blocks. The first was 1737 until
 * issue 1498 deleted the dead rule blocks at base `0eff5b36e`.
 *
 * ILLUSTRATIVE, and named so, because nothing asserts them. They appear only inside a failure
 * message, to tell a reader how far below the expected magnitude a broken scan has fallen —
 * "only 12 found, against roughly 1642 and a floor of 1450" reads very differently from "only 12
 * found". Ordinary work moves them by a handful and no test would notice, which is exactly why
 * they are not pinned: the enforced figures are the floors, which are the ones with a failure
 * mode worth stopping.
 */
export const FLOOR_REFERENCE_STYLESHEET_SPACING_DECLARATIONS = 1445;

/** The Svelte half of the above. Illustrative likewise. */
export const FLOOR_REFERENCE_SVELTE_SPACING_DECLARATIONS = 1642;

/**
 * The table, as `'file | property | value | count'` rows in code-point order.
 *
 * Read from JSON rather than declared here — see the docblock at the top of this file for the
 * duplication-detector reason, which is about the shape of a long run of string literals in an
 * indexed `.js` and not about the data.
 */
const ROWS = JSON.parse(
  readFileSync(new URL('./spacing-known-literals.json', import.meta.url), 'utf8')
);

/**
 * The baseline as parsed rows.
 *
 * The key is (file, property, value), not file: `styles/fabricate.css` holds 176 of the 923, so
 * a per-file count would absorb a swap inside it entirely — turn an 8 into a 9 there and the
 * number does not move. `control-height-known-literals.js` made the same choice for the same
 * reason, and `manager-button-source-contract.test.js` before it.
 *
 * @returns {ReadonlyArray<{key: string, file: string, property: string, value: number,
 *   count: number}>}
 */
export const KNOWN_RAW_SPACING = Object.freeze(
  ROWS.map((row) => {
    const [file, property, value, count] = row.split(' | ');
    return Object.freeze({
      key: `${file} ${property} ${value}`,
      file,
      property,
      value: Number(value),
      count: Number(count),
    });
  })
);
