/**
 * The measured, frozen debt in retired CONTROL HEIGHTS (issue 1391).
 *
 * `openspec/specs/design-system/spec.md` closes the control-height ladder at 26, 28, 30, 34, 38
 * and 44 and retires 32, 36 and 40. Nothing checked it, and half the corpus could not have been
 * checked: `npm run lint:css` globs `styles/**` only, so the ~440 height declarations inside
 * Svelte scoped `<style>` blocks were unreachable by stylelint entirely.
 *
 * `control-height-ladder.test.js` freezes what is here so nothing new arrives. This file is the
 * baseline it freezes. It is DEBT, not permission: every row is a control that should move onto
 * a rung, and the gate fails just as loudly when a row is paid down without being banked.
 *
 * ── THE KEY IS (file, property, value), NOT file ────────────────────────────────────────
 * A per-file count absorbs a swap INSIDE a file, and `styles/fabricate.css` holds 49 of the 83:
 * turn a 36 into a 40 there, or move a retired value off a card and onto a control, and a
 * per-file count is unchanged and ships green. Three files hold more than one distinct
 * (property, value) pair and carry 56 of the 83 between them, so the finer key is not
 * theoretical. `tests/manager-button-source-contract.test.js` made the same choice, for the
 * reason its own docblock gives: "counted, so that deleting one of two identical probes is not
 * silently absorbed". It costs 38 rows instead of 30.
 *
 * ── THE GLOBAL SHEET IS ALREADY IN THIS CORPUS ─────────────────────────────────────────
 * Recorded because it reads like a gap and is not one (issue 1497). `collectStyleCorpus` walks
 * `['src', 'styles']`, so `styles/fabricate.css` is scanned by this ladder exactly as the Svelte
 * scoped blocks are: SIX of the 37 rows below are sheet rows and they carry 39 of the 73
 * occurrences — more than half the debt in one file. A proposal to "extend the corpus to the
 * sheet" would therefore be extending it to somewhere it already reaches, and would produce no
 * new rows while looking like an enforcement win. What the sheet does still need is a gate for
 * the OTHER geometry ladders, and that is `tests/components/design-system-debt-ratchets.test.js`.
 *
 * ── WHY EACH ROW CARRIES ITS RESOLVED TEXT ──────────────────────────────────────────────
 * The scan resolves `var()` to a fixed point, so it MANUFACTURES literals the source line does
 * not contain. Without the resolved text beside the raw, a future reader opens a row whose cited
 * line carries no pixel value anywhere on it and has no way to adjudicate it. Pinning both texts
 * also closes the ratchet's cheapest escape: moving a baselined literal into a new custom
 * property and reading it back leaves the count identical — with the texts pinned, it reds.
 *
 * The corpus held one row of the first kind — a thumbnail sized through a legacy token — until
 * issue 1399 inlined that token, so every row's raw text now carries its own pixel value except
 * the two annotated below. The CAPABILITY the annotation exists for is unchanged and is proved
 * on a synthetic corpus of real files by `tests/style-block-scan.test.js`.
 *
 * ── THE ROWS ARE STRINGS ────────────────────────────────────────────────────────────────
 * One `'file | property | value | count | raw => resolved [; raw => resolved]'` per line,
 * following `tests/scripts-known-ungated.js`. Thirty-eight uniform object literals would be
 * thirty-eight identical token runs, and SonarCloud's duplication detector reads `tests/**`
 * with `sonar.cpd.exclusions` inert — a change earlier in this programme failed that gate at
 * 23% for exactly this shape. Two tokens a line cannot collide with anything.
 */

/** The rungs the spec publishes. Also asserted to appear, individually, in the spec text. */
export const LADDER_RUNGS = Object.freeze([26, 28, 30, 34, 38, 44]);

/** The heights the spec retires. The gate bans these three and nothing else. */
export const RETIRED_CONTROL_HEIGHTS = Object.freeze([32, 36, 40]);

/**
 * The six properties that can set a control's height.
 *
 * The logical trio contributes ZERO today and is scanned anyway, so a logical-property rewrite
 * cannot walk around the gate. Every pinned figure below depends on this set being exactly
 * these six.
 */
export const SCANNED_HEIGHT_PROPERTIES = Object.freeze([
  'height',
  'min-height',
  'max-height',
  'block-size',
  'min-block-size',
  'max-block-size',
]);

/**
 * The headline. Pinned exactly rather than derived, so a hand edit to one row's count that
 * forgets this number fails rather than quietly re-baselining.
 *
 * It was 86. Issue 1464 deleted the retired combined Travel view's dead CSS, and two of those
 * rules — `.manager-travel-realms-toggle` and `.manager-travel-realm-select` — carried a
 * `min-height: 32px` each. The debt was PAID DOWN by deletion rather than by moving a control
 * onto a rung, so it is banked here and on the `styles/fabricate.css | min-height | 32` row
 * rather than left as a slot the next author could fill for free.
 *
 * It was 84 until issue 1373's Tool Rules parity pass, which moved the system Tool Rules search
 * field off `height: 36px` and onto the ladder's 30 — the rung nearest the design's own 32,
 * which is itself retired. That is the ordinary way this number should fall: a control moved
 * onto a rung, banked here on the `styles/fabricate.css | height | 36` row.
 *
 * It was 82 until the same issue's picker-popover parity pass, which took TWO rows down at
 * once. `proto:2261` stands an option row at 30, so the popover's `min-height: 40px` moved
 * onto that rung; and the popover's search field, declared at `height: 32px`, moved to the
 * 30 the compact search row already stands at. The field's row is worth reading twice: it
 * had never RENDERED at 32 at all, because `.fabricate-manager input[type="text"]` ties it
 * on specificity and sets `min-height: 34px`, so the retired literal this baseline recorded
 * was a value no GM ever saw. A browser measurement in `manager-layout.test.js` is what
 * found that; a text scan cannot, which is the limitation this baseline is honest about.
 *
 * It was 80 until issue 1498 deleted the 367 rule blocks in `styles/fabricate.css` that
 * matched no element, at base `0eff5b36e`: seven of these declarations were inside them. That
 * is not a rung being reached, it is a control that was never rendered going away, which is
 * the other honest way this number falls.
 */
export const KNOWN_RETIRED_HEIGHT_TOTAL = 73;

/**
 * The per-corpus height-declaration counts the floors were CHOSEN AGAINST, at the commit that
 * chose them: 491 under `styles/**` and 440 in Svelte scoped blocks. The first was 530 until
 * issue 1498 deleted the dead rule blocks at base `0eff5b36e`.
 *
 * ILLUSTRATIVE, and named so, because nothing asserts them. They appear only inside a failure
 * message, to tell a reader how far below the expected magnitude a broken scan has fallen —
 * "only 12 found, against roughly 530 and a floor of 470" reads very differently from "only 12
 * found". An earlier spelling called them MEASURED_*, which claims they are this tree's answer
 * today; they are not, and cannot be, because ordinary work moves them by a handful and no test
 * would notice. Both were already stale by four and seven when a rebase grew the corpus.
 *
 * They are NOT pinned like {@link KNOWN_RETIRED_HEIGHT_TOTAL}, and the difference is what each
 * one is. The 83 is DEBT: it must not grow, so every movement is a thing to adjudicate. A
 * declaration count moves whenever anyone adds a screen, so pinning it would red this gate on
 * unrelated work and teach the next author to re-baseline a number without reading it. The
 * enforced figures are the floors, which are the ones with a failure mode worth stopping.
 */
export const FLOOR_REFERENCE_STYLESHEET_DECLARATIONS = 491;

/** The Svelte half of {@link FLOOR_REFERENCE_STYLESHEET_DECLARATIONS}. Illustrative likewise. */
export const FLOOR_REFERENCE_SVELTE_DECLARATIONS = 440;

/** `'file | property | value | count | raw => resolved [; …]'`, in code-point key order. */
const ROWS = Object.freeze([
  'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte | height | 36 | 2 | 36px => 36px',
  'src/ui/svelte/apps/alchemy/Workbench.svelte | height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte | height | 40 | 2 | 40px => 40px',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte | min-height | 40 | 2 | 40px => 40px',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte | min-height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/crafting/ShoppingList.svelte | min-height | 36 | 1 | 36px => 36px',
  'src/ui/svelte/apps/gathering/GatheringEventsPanel.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/gathering/GatheringTaskDrops.svelte | height | 36 | 1 | 36px => 36px',
  'src/ui/svelte/apps/gathering/GatheringTaskRequirements.svelte | height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/gathering/GatheringTasksPanel.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/inventory/InventoryFilters.svelte | min-height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte | min-height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/inventory/detail/InventoryComponentDetail.svelte | height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/journal/HistoryRow.svelte | height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/manager/BooksScrollsView.svelte | height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte | height | 36 | 1 | 36px => 36px',
  'src/ui/svelte/apps/manager/BulkEditSelect.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/manager/EmptyState.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/manager/GatheringPartiesTab.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/manager/InspectorActionButton.svelte | min-height | 36 | 1 | 36px => 36px',
  'src/ui/svelte/apps/manager/PartyTravelActorPanel.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/manager/RosterRow.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/components/SearchablePopover.svelte | min-height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/manager/downtime/WorldDowntimePreview.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/manager/library/LibraryCard.svelte | min-height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte | min-height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte | min-height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/components/CollapsibleGroupHeader.svelte | min-height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/components/Stepper.svelte | height | 36 | 1 | var(--fab-stepper-fill-height, 36px) => 36px',
  'styles/fabricate.css | height | 32 | 4 | 32px => 32px',
  'styles/fabricate.css | height | 36 | 11 | 36px => 36px',
  'styles/fabricate.css | height | 40 | 7 | 40px => 40px',
  'styles/fabricate.css | min-height | 32 | 6 | 32px => 32px',
  'styles/fabricate.css | min-height | 36 | 7 | 36px => 36px',
  'styles/fabricate.css | min-height | 40 | 4 | 40px => 40px ; calc(40px + (2 * var(--fab-space-3)) + 2px) => calc(40px + (2 * 12px) + 2px)',
]);

/**
 * The two rows whose raw text differs from its resolved text, each with the reason a reader
 * needs before deciding how to pay it down. One carries no DECLARED height on the cited line —
 * a token fallback the corpus never satisfies; the other writes its 40 there and differs only
 * because another token in the same `calc()` resolves elsewhere, which is why the gate's
 * predicate is the textual one and says so.
 *
 * There were three. `BooksScrollsView.svelte height 40` reached its value only through a legacy
 * token, and issue 1399 inlined that token, so the row's raw text is now `40px` and it needs no
 * note. Its ENTRY IS DELETED rather than reworded: `control-height-ladder.test.js` asserts this
 * object's keys are exactly the rows carrying an indirect text, so a rewritten note would keep
 * the key and red that `deepEqual`. The thumbnail EXEMPTION it also recorded — art and portraits
 * are outside the control ladder — survives in the ratchet guidance and in the docblock above
 * `no new retired control height has been introduced`, which is where it belongs now that the
 * row is an ordinary literal.
 *
 * Keyed on the row key, and the gate asserts this object holds exactly the rows carrying an
 * indirect text — so an annotation cannot rot into a permission for a row that has become
 * direct, and a new indirect row cannot arrive without one.
 */
export const INDIRECT_HEIGHT_NOTES = Object.freeze({
  'src/ui/svelte/components/Stepper.svelte height 36':
    'A TOKEN FALLBACK, not a declared height: line 355 is ' +
    '`height: var(--fab-stepper-fill-height, 36px)`, and the retired value is reachable only ' +
    'when no ancestor sets the token. The token is defined four times in this corpus and NONE ' +
    'of them is 36px — twice at 28px and twice at 34px — while the docblock above it, at ' +
    'line 332 documents 36px as the live default wherever nothing sets it. Substituting a ' +
    'definition would DELETE this row, which is why the scan unions the raw text with the ' +
    'resolved text rather than replacing one by the other. Paying it down means choosing a rung ' +
    'for the unparented case, not deleting the fallback.',
  'styles/fabricate.css min-height 40':
    'One of these four is not a 40px control. Line 19235 is ' +
    '`min-height: calc(40px + (2 * var(--fab-space-3)) + 2px)`, where the 40px is a CONTENT ' +
    'contribution inside a padded well and the resulting control is nowhere near 40px tall. It ' +
    'is baselined because a value scanner cannot tell a contribution from a height, and it is ' +
    'called out here so nobody "fixes" it by snapping the 40 to 38 and shrinking the content ' +
    'box. The other three in this row are plain `40px`. There were four until issue 1373 took ' +
    'the picker popover option row onto the ladder rung 30, which `proto:2261` states.',
});

/**
 * The baseline as parsed rows.
 *
 * @returns {ReadonlyArray<{key: string, file: string, property: string, value: number,
 *   count: number, texts: string[]}>}
 */
export const KNOWN_RETIRED_HEIGHTS = Object.freeze(
  ROWS.map((row) => {
    const [file, property, value, count, texts] = row.split(' | ');
    return Object.freeze({
      key: `${file} ${property} ${value}`,
      file,
      property,
      value: Number(value),
      count: Number(count),
      texts: Object.freeze(texts.split(' ; ')),
    });
  })
);
