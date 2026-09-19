/** The measured, frozen debt behind the design-system rules that had no gate (issue 1497). */
import { readFileSync } from 'node:fs';

/** The whole table, keyed by gate. */
const TABLE = JSON.parse(
  readFileSync(new URL('./design-system-known-debt.json', import.meta.url), 'utf8')
);

/**
 * One gate's rows, as `assertRatchet` wants them.
 *
 * @param {string} gate The top-level key in `design-system-known-debt.json`.
 * @returns {ReadonlyArray<{key: string, count: number}>} Frozen, in file order.
 */
export function knownDebt(gate) {
  const rows = TABLE[gate];
  if (!Array.isArray(rows)) {
    throw new Error(
      `design-system-known-debt.json has no array under "${gate}". A gate reading a missing key ` +
        'would otherwise ratchet against an empty baseline, which reports every live offence as ' +
        'new debt — or, if the gate is an absence check, passes over nothing at all.'
    );
  }
  return Object.freeze(
    rows.map((row) => {
      const fields = String(row).split(' | ');
      const count = Number(fields.pop());
      const key = fields.join(' | ');
      if (!Number.isInteger(count) || count < 1 || key.length === 0) {
        throw new Error(
          `design-system-known-debt.json row ${JSON.stringify(row)} under "${gate}" is malformed. ` +
            'Every row ends with a positive integer count and carries at least one key field ' +
            'before it.'
        );
      }
      return Object.freeze({ key, count });
    })
  );
}

/**
 * A selector matching `:focus` that is not `:focus-visible` or `:focus-within`.
 * MEASURED at `6a2c3b46b` by `no bare :focus selector survives outside a Foundry-core reset` in
 * `tests/components/design-system-debt-ratchets.test.js`. The corpus holds 53 such selectors;
 * 29 of them are the six Foundry-core reset blocks the gate allow-lists by shape, leaving these.
 */
export const KNOWN_BARE_FOCUS_SELECTORS = knownDebt('bareFocusSelectors');

/** @see KNOWN_BARE_FOCUS_SELECTORS */
export const KNOWN_BARE_FOCUS_TOTAL = 22;

/** An `@media` query that is not a user preference, keyed `file | query`. */
export const KNOWN_VIEWPORT_MEDIA_QUERIES = knownDebt('viewportMediaQueries');

/** @see KNOWN_VIEWPORT_MEDIA_QUERIES */
export const KNOWN_VIEWPORT_MEDIA_TOTAL = 5;

/** A `font-weight` outside {400, 500, 600, 700}, keyed `file | selector | value`. */
export const KNOWN_OFF_SCALE_FONT_WEIGHTS = knownDebt('offScaleFontWeights');

/** @see KNOWN_OFF_SCALE_FONT_WEIGHTS */
export const KNOWN_OFF_SCALE_FONT_WEIGHT_TOTAL = 7;

/** A rule setting the mono face and a weight above 500, keyed `file | selector | value`. */
export const KNOWN_HEAVY_MONO_WEIGHTS = knownDebt('heavyMonoWeights');

/** @see KNOWN_HEAVY_MONO_WEIGHTS */
export const KNOWN_HEAVY_MONO_WEIGHT_TOTAL = 33;

/** A `box-shadow` that is neither an elevation token, `none`, nor an inset ring. */
export const KNOWN_OFF_TOKEN_SHADOWS = knownDebt('offTokenShadows');

/**
 * 26 → 25 with issue 1503. The picker panels' hand-written `0 16px 36px var(--fab-overlay-dark-34)`
 * left with the block that carried it: both pickers render through `SearchablePopover` now and
 * take the shared panel's `var(--fab-shadow-lg)`, so the caller's own panel rule is deleted
 * rather than out-specified. Paid down by adoption, not by a sweep.
 *
 * @see KNOWN_OFF_TOKEN_SHADOWS
 */
export const KNOWN_OFF_TOKEN_SHADOW_TOTAL = 26;

/** A native `<select>` rendered by a Svelte template, keyed `file`. */
export const KNOWN_NATIVE_SELECT_ELEMENTS = knownDebt('nativeSelectElements');

/** @see KNOWN_NATIVE_SELECT_ELEMENTS */
export const KNOWN_NATIVE_SELECT_TOTAL = 61;

/** A native `<select>` written into a JavaScript template string, keyed `file`. */
export const KNOWN_NATIVE_SELECTS_IN_JS = knownDebt('nativeSelectsInDialogBodies');

/** @see KNOWN_NATIVE_SELECTS_IN_JS */
export const KNOWN_NATIVE_SELECTS_IN_JS_TOTAL = 4;

/** A corner radius off the published ladder, keyed `file | property | value`. */
export const KNOWN_OFF_LADDER_RADII = knownDebt('offLadderRadii');

/**
 * RE-MEASURED at 318 → 314 in 140 → 139 rows by issue 1371, all four paid down rather than moved:
 * 314 → 313 with issue 1503, and the row that moved is `styles/fabricate.css | border-radius |
 * 8px`, 72 → 71: the deleted picker-panel block above carried an 8px corner, and the shared panel
 * it now takes is 10px. It is a SECOND 8px occurrence, independent of the one issue 1371 deleted,
 * so the two payments compound rather than describe the same corner.
 * `apps/alchemy/Workbench.svelte | border-radius | 10px` falls 5 → 4: the last-brew banner's
 * corner went with its scoped block, and the `<Notice>` it became takes the specimen's r11. The
 * wrapper the caller keeps carries only its `margin-bottom`, so nothing brings the radius back.
 * 310 → 308 with the same issue's `Callout` convergence, and both movers are the snap this
 * number exists to reward. `components/Callout.svelte | border-radius | 8px | 1` is DELETED —
 * the primitive's own corner takes the specimen's r11 — and `styles/fabricate.css |
 * border-radius | 10px` falls 13 → 12, because the deleted `[data-failure-salvage-note]`
 * override carried one of those thirteen. The key count falls 138 → 137 with the first.
 * `crafting/RecipeBrowser.svelte | 8px` 3 → 2 as the two browse filters' own select rule goes and
 * the trigger takes the `inline` rung's 7px, the row SURVIVING on the filter toggles' 8px; and
 * `inventory/InventoryFilters.svelte | 8px` 1 → 0, DELETED, that file's only off-ladder corner
 * having been the sort select's. The two other converted files moved a corner without moving a
 * row: `InventoryBookDetail`'s page-size select and the journal sort both drew 6px, a published
 * rung, and both are 7px now.
 *
 * @see KNOWN_OFF_LADDER_RADII
 */
export const KNOWN_OFF_LADDER_RADIUS_TOTAL = 276;

/** A Svelte SCOPED STYLE reading an area-scoped `--fab-*` property, keyed `file | property`. */
export const KNOWN_AREA_SCOPED_STYLE_READS = knownDebt('areaScopedStyleReads');

/** @see KNOWN_AREA_SCOPED_STYLE_READS */
export const KNOWN_AREA_SCOPED_STYLE_READ_TOTAL = 6;

/**
 * An area-scoped `--fab-*` property spelled into a template or module string.
 * MEASURED at `6a2c3b46b`, over the part of each file the CSS scans do NOT read, and RE-MEASURED
 * after issue 1508's re-root. TWO sites remain, and they are one mistake: `WorldToolEntryPage` and
 * `ToolBreakageTab` READ `--fab-tool-breakage-chance-track-gradient` through a component prop.
 */
export const KNOWN_AREA_SCOPED_STRING_USES = knownDebt('areaScopedStringUses');

/** @see KNOWN_AREA_SCOPED_STRING_USES */
export const KNOWN_AREA_SCOPED_STRING_USE_TOTAL = 2;

/** A name-bearing prop defaulting to untranslated English, keyed `file | prop | default`. */
export const KNOWN_UNTRANSLATED_NAME_DEFAULTS = knownDebt('untranslatedNameDefaults');

/** @see KNOWN_UNTRANSLATED_NAME_DEFAULTS */
export const KNOWN_UNTRANSLATED_NAME_DEFAULT_TOTAL = 9;

/** An `aria-label` bound to a prop that defaults to the empty string, keyed `file | expression`. */
export const KNOWN_EMPTY_NAME_BINDINGS = knownDebt('unguardedEmptyNameBindings');

/** @see KNOWN_EMPTY_NAME_BINDINGS */
export const KNOWN_EMPTY_NAME_BINDING_TOTAL = 2;

/**
 * A non-form element with `tabindex="0"` and an interactive role, keyed `file`.
 * Every one can hold focus, and Foundry's `KeyboardManager#hasFocus` returns false for all of
 * them — so Space pauses the game and the arrows pan the canvas behind the open application.
 */
export const KNOWN_ROLE_FOCUS_TARGETS = knownDebt('roleFocusTargets');

/** @see KNOWN_ROLE_FOCUS_TARGETS */
export const KNOWN_ROLE_FOCUS_TARGET_TOTAL = 17;

/**
 * A `<button>` outside any `<form>` that does not declare `data-keyboard-focus`, keyed `file`.
 * The banking is the point rather than the bookkeeping — an unbanked shrink leaves the slot open
 * for the next author to fill for free. That lane's three NEW inline-link buttons are absent from
 * this table because they declare `data-keyboard-focus="true"`, which is what the gate asks for;
 * they were never banked as debt.
 */
export const KNOWN_FORMLESS_BUTTONS = knownDebt('formlessButtons');

/**
 * 277 → 274 with issue 1503, across three rows.
 * 253 -> 243 with the same change's FIFTH phase, and both remaining interactables rows leave
 * whole: `apps/InteractableBrowserRoot.svelte | 4` and
 * `apps/interactables/InteractablesManagerRoot.svelte | 6`. The browser's four are its per-row
 * placement pair, now `<IconButton>`; the manager's six are its promote toggle, its confirm and
 * cancel, and its three per-row actions, now `<ManagerButton>` and `<IconButton>`.
 * 242 → 241 with issue 1513, one occurrence on one row: `crafting/ComponentSourcesBar.svelte`
 * 4 → 3. The picker's option row was a raw `<button>` this file wrote; it is
 * `SearchablePopover`'s row now, and the primitive writes a literal `data-keyboard-focus="true"`
 * on it — the same payment issue 1503 recorded three times over when the icon and source
 * pickers' rows moved into that same element. The row SURVIVES on the three raw buttons the
 * file still writes: the source portrait, its remove overlay and the picker TRIGGER, which is
 * this caller's own button through the `trigger` snippet and takes its attribute through a
 * spread this source-level scanner cannot see. Nothing is being banked that the scanner did not
 * measure — that trigger is deliberately still counted, exactly as the primitive's own is.
 * `apps/manager/BooksScrollsView.svelte` declared exactly one, the library row's identity
 * `<button>`, and it carries `data-keyboard-focus="true"` now. That is the whole of that file's
 * raw-button population, so the slot is closed rather than left open for the next author to fill.
 * 239 -> 231 with issue 1515's seventh phase, across four files, three SHRINKING and one
 * VANISHING. The availability pill family's hand-written remove crosses were eight raw
 * `<button>` elements written four ways, and every one of them is the shared chip's own declared
 * control now: `GatheringTaskEditView` 10 -> 7, `GatheringEventEditView` 5 -> 3,
 * `environment/EnvironmentOverviewTab` 4 -> 2, and `world/WorldCurrencyTab` vanishes, its single
 * raw button having been the currency sub-unit's remove cross. The debt is PAID by conversion
 * rather than by an attribute, which is why three of the four slots close by that much and the
 * fourth closes outright. The danger-tag row's cross is the one that does NOT convert - its six
 * colour levels are a ramp no chip tone states - so it declares the attribute in place and is
 * absent from these rows for that reason rather than for the other one.
 *
 * @see KNOWN_FORMLESS_BUTTONS
 */
// #1648: ActionsPanel delegates its four former raw controls to RunActionBar (230 - 4).
export const KNOWN_FORMLESS_BUTTON_TOTAL = 225;

/** A shared component outside `components/` with no manifest row, keyed `path`. */
/** An ART TILE render site whose `size` is off the published art ladder, keyed `path | size`. */
export const KNOWN_OFF_LADDER_ART_SIZES = knownDebt('offLadderArtSizes');

/**
 * @see KNOWN_OFF_LADDER_ART_SIZES
 *  - THE FIVE ALCHEMY TILES — `AlchemyDisciplineChooser | 44`, `ComponentInventoryColumn | 34`,
 *    `KnownRecipesColumn | 36`, `Workbench | 40` and `Workbench | 46`. Every one of the five sets
 *    the height of the row or card it leads: the chooser card's head measured 44px, the inventory
 *    row 60px around a 34px tile, the bench chip 107.55px around a 40px one. 38 is the only rung
 *    at or below any of them and it is BELOW all five, so snapping would shrink five different
 *    containers at once — a layout move in a commit whose rule is that a conversion preserves the
 *    rendered size.
 */
// Issue 1648 removes six former Journal render sites and adds SlotTile's single 56px site.
export const KNOWN_OFF_LADDER_ART_SIZE_TOTAL = 69;

export const KNOWN_UNREGISTERED_SHARED_COMPONENTS = knownDebt('unregisteredSharedComponents');

/** @see KNOWN_UNREGISTERED_SHARED_COMPONENTS */
// 49 -> 48 (issue 1371 r16-list).
// 50 -> 49 (issue 1506): the journal's `RunStatusPill` LEFT by being DELETED. Its four
// callers render the shared `<Chip>` directly now, so the file this row named is gone and the
// register's own rule — a name departing unrecorded is a failure — is satisfied by removing it in
// the same commit. Re-measured rather than subtracted: 75 components outside `components/` clear
// the two-caller bar, 26 of them are registered, and 49 are not, which is what the docblock above
// already states.
export const KNOWN_UNREGISTERED_SHARED_COMPONENT_TOTAL = 47;
