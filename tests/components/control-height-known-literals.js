/** The measured, frozen debt in retired CONTROL HEIGHTS (issue 1391). */

/** The rungs the spec publishes. Also asserted to appear, individually, in the spec text. */
export const LADDER_RUNGS = Object.freeze([26, 28, 30, 34, 38, 44]);

/** The heights the spec retires. The gate bans these three and nothing else. */
export const RETIRED_CONTROL_HEIGHTS = Object.freeze([32, 36, 40]);

/** The six properties that can set a control's height. */
export const SCANNED_HEIGHT_PROPERTIES = Object.freeze([
  'height',
  'min-height',
  'max-height',
  'block-size',
  'min-block-size',
  'max-block-size',
]);

/** The headline. Pinned exactly rather than derived. */
// #1648 removes the dead Journal primary button's retired 36px minimum (64 - 1).
// #1384 removes the deleted art-path picker button's retired 36px height (63 - 1).
export const KNOWN_RETIRED_HEIGHT_TOTAL = 62;

/** The per-corpus height-declaration counts the floors were CHOSEN AGAINST. */
export const FLOOR_REFERENCE_STYLESHEET_DECLARATIONS = 491;

/** The Svelte half of {@link FLOOR_REFERENCE_STYLESHEET_DECLARATIONS}. Illustrative likewise. */
export const FLOOR_REFERENCE_SVELTE_DECLARATIONS = 440;

/** `'file | property | value | count | raw => resolved [; …]'`, in code-point key order. */
const ROWS = Object.freeze([
  'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte | height | 36 | 1 | 36px => 36px',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte | height | 40 | 2 | 40px => 40px',
  'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte | min-height | 40 | 2 | 40px => 40px',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/crafting/RecipeListRow.svelte | min-height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/crafting/ShoppingList.svelte | min-height | 36 | 1 | 36px => 36px',
  'src/ui/svelte/apps/gathering/GatheringEventsPanel.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/gathering/GatheringTasksPanel.svelte | height | 32 | 1 | 32px => 32px',
  'src/ui/svelte/apps/inventory/InventoryFilters.svelte | min-height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte | min-height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/manager/BooksScrollsView.svelte | height | 40 | 1 | 40px => 40px',
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte | height | 36 | 1 | 36px => 36px',
  'src/ui/svelte/components/EmptyState.svelte | height | 32 | 1 | 32px => 32px',
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
  'styles/fabricate.css | height | 36 | 10 | 36px => 36px',
  'styles/fabricate.css | height | 40 | 7 | 40px => 40px',
  'styles/fabricate.css | min-height | 32 | 6 | 32px => 32px',
  'styles/fabricate.css | min-height | 36 | 6 | 36px => 36px',
  'styles/fabricate.css | min-height | 40 | 4 | 40px => 40px ; calc(40px + (2 * var(--fab-space-3)) + 2px) => calc(40px + (2 * 12px) + 2px)',
]);

/**
 * The two rows whose raw text differs from its resolved text.
 * There were three. `BooksScrollsView.svelte height 40` reached its value only through a legacy
 * token, and issue 1399 inlined that token, so the row's raw text is now `40px` and it needs no
 * note. Its ENTRY IS DELETED rather than reworded: `control-height-ladder.test.js` asserts this
 * object's keys are exactly the rows carrying an indirect text, so a rewritten note would keep
 * the key and red that `deepEqual`. The thumbnail EXEMPTION it also recorded — art and portraits
 * are outside the control ladder — survives in the ratchet guidance and in the docblock above
 * `no new retired control height has been introduced`, which is where it belongs now that the
 * row is an ordinary literal.
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
