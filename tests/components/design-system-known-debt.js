/**
 * The measured, frozen debt behind the design-system rules that had no gate (issue 1497).
 *
 * `openspec/specs/design-system/spec.md` states a dozen rules the product is held to and, until
 * this change, three of them were enforced by anything at all: the control-height ladder, the
 * spacing scale and the token generation. The rest were prose. This file is the table the ten
 * gates added by that issue freeze — `:focus` outside a core reset, viewport `@media`, off-scale
 * and heavy-mono font weights, off-token shadows, native `<select>`, the radius ladder, the
 * area-scoped token reads, the required accessible names, the widened keyboard-focus walk and the
 * closed-vocabulary register.
 *
 * It is DEBT, not permission. Every row is something the spec already prohibits, and
 * `assertRatchet` fails just as loudly when a row is paid down without being banked as when a new
 * one arrives — see `tests/helpers/ratchetBaseline.js` for why a shrink has to be a failure too.
 *
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────────────────
 * Every array below records, in its own docblock, the commit it was measured on and the gate that
 * reproduces it. They were RE-MEASURED by the shipped gates on this branch rather than copied from
 * the issue, and the figures differ from the issue's in two independent ways.
 *
 * THE COMMIT EACH DOCBLOCK NAMES IS `6a2c3b46b`, and it is the base this work was measured on: the
 * head of the issue-1499 branch as it stood when the lane opened. That branch was then merged into
 * its parent and the lane restacked, so the figures were re-verified on the INTEGRATED base
 * `007b6a528` — the issue-1531 head after the maintainer's merge, of which this branch is a
 * descendant — and every one of them is unchanged. That is not a coincidence to be re-checked on
 * the next restack: the two commits are byte-identical under `src/` and `styles/`, which are the
 * only roots any gate here reads, so no figure below COULD have moved between them. The whole
 * table is reproduced by
 *
 *     node --conditions=browser --test tests/components/design-system-debt-ratchets.test.js
 *
 * which fails with the observed count beside the pinned one for every row that has drifted, and
 * the two gates that live elsewhere by running `tests/token-generation-gate.test.js`,
 * `tests/design-system-required-names.test.js` and `tests/design-system-keyboard-focus.test.js`
 * the same way.
 *
 * The first is the base. The lane branches on issue 1499, which stacks on 1498, and between them
 * those two deleted 367 dead rule blocks and 29 unread tokens from `styles/fabricate.css`. That
 * took debt with it — two font weights, three shadows — and the docblocks below say which. It was
 * paid by DELETION rather than by anything moving onto a ladder, which is banked here all the same:
 * an unbanked shrink leaves the slot open for the next author to fill for free.
 *
 * The second is the CORPUS EXTRACTOR, and it moves the numbers UPWARD. The issue's audit read
 * Svelte scoped blocks with a regular expression matching a `<style` tag and everything up to the
 * next closing tag. That matches the FIRST such tag ANYWHERE in the file, including the twenty-five
 * components whose own docblock names one in prose. In those files the capture starts in the header
 * comment, swallows the whole template, and the brace structure it hands a CSS parser is nonsense:
 * `EmptyState.svelte` contributed ZERO of its seven corner radii that way. These gates use
 * `collectStyleCorpus`, whose opener must be the WHOLE LINE for exactly this reason, so they see
 * 776 radius declarations where the audit saw 754 and 101 shadows where it saw 100. The larger
 * figure is the correct one.
 *
 * ── WHY THE ROWS ARE JSON AND NOT ARRAYS IN THIS MODULE ─────────────────────────────────
 * The reason `spacing-known-literals.js` records, applied to a bigger table. SonarCloud's
 * copy-paste detector NORMALISES string literals, so a run of quoted-string lines matches another
 * such run by SHAPE whatever the strings say, and its minimum block is roughly 100 tokens — about
 * fifty such lines. These gates carry several hundred rows between them, and
 * `scripts/lib/screenshotCaptureMap.js` already ships a 157-line run of exactly that shape for
 * them to collide with. `.json` is not indexed by the JavaScript analyser at all, so the table
 * lives there: one row per line, diffed the same way, with none of the risk of a duplication
 * failure that says nothing about the change.
 *
 * This module is the PARSER for that table, not a second copy of it. Everything here is generic
 * over the rows — one `key | count` shape, one freeze, one sum — so adding a gate adds a JSON key
 * and a two-line export rather than another table.
 */
import { readFileSync } from 'node:fs';

/**
 * The whole table, keyed by gate.
 *
 * Read once at module load. The file is data with no imports and no cycles, so there is nothing
 * to defer: a parse failure here is a broken checkout, not a test outcome.
 */
const TABLE = JSON.parse(
  readFileSync(new URL('./design-system-known-debt.json', import.meta.url), 'utf8')
);

/**
 * One gate's rows, as `assertRatchet` wants them.
 *
 * The row shape is `'<key fields, ` | `-separated> | <count>'` — the LAST field is the count and
 * everything before it is the key. Uniform across gates whose keys carry a different number of
 * fields, which is why the split is from the right rather than a fixed arity: gate 5 keys on
 * `file`, the `:focus` gate on `file | selector`, and the radius gate on
 * `file | property | value`. A fixed arity would need one parser per gate, and a parser per gate
 * is how a row silently lands in the wrong column.
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
 * A selector matching `:focus` that is not `:focus-visible` or `:focus-within`, keyed
 * `file | selector`.
 *
 * MEASURED at `6a2c3b46b` by `no bare :focus selector survives outside a Foundry-core reset` in
 * `tests/components/design-system-debt-ratchets.test.js`. The corpus holds 53 such selectors;
 * 29 of them are the six Foundry-core reset blocks the gate allow-lists by shape, leaving these.
 * Issue 1501 collapses the `.fabricate-app`/`.fabricate-manager` pair, and issue 1520 deletes the
 * three interactables copies; both will move the allow-list rather than this table.
 */
export const KNOWN_BARE_FOCUS_SELECTORS = knownDebt('bareFocusSelectors');

/** @see KNOWN_BARE_FOCUS_SELECTORS */
export const KNOWN_BARE_FOCUS_TOTAL = 24;

/**
 * An `@media` query that is not a user preference, keyed `file | query`.
 *
 * MEASURED at `6a2c3b46b`: five occurrences across four keys. The corpus holds eight `@media`
 * at-rules, three of them `prefers-reduced-motion`. The five are the three 720px manager
 * breakpoints — written in TWO different spellings, `(width <= 720px)` twice and
 * `(max-width: 720px)` once, which is itself why the gate reads the query rather than matching a
 * pixel figure — and the component editor's two.
 */
export const KNOWN_VIEWPORT_MEDIA_QUERIES = knownDebt('viewportMediaQueries');

/** @see KNOWN_VIEWPORT_MEDIA_QUERIES */
export const KNOWN_VIEWPORT_MEDIA_TOTAL = 5;

/**
 * A `font-weight` outside {400, 500, 600, 700}, keyed `file | selector | value`.
 *
 * MEASURED at `6a2c3b46b`: 7 declarations of 613. The issue predicted 9 — 800 ×4, 650 ×3 and
 * `inherit` ×2 — and issue 1498 deleted two of the 800s with the dead rule blocks that carried
 * them, so 800 stands at 2 here. The debt fell rather than being paid: nothing was moved onto the
 * ramp, the rules simply went.
 */
export const KNOWN_OFF_SCALE_FONT_WEIGHTS = knownDebt('offScaleFontWeights');

/** @see KNOWN_OFF_SCALE_FONT_WEIGHTS */
export const KNOWN_OFF_SCALE_FONT_WEIGHT_TOTAL = 7;

/**
 * A rule setting the mono face and a weight above 500, keyed `file | selector | value`.
 *
 * MEASURED at `6a2c3b46b`: 33 declarations across the 62 rules that name `var(--fab-font-mono)`,
 * 8 in the sheet and 25 in scoped blocks, with 700 in 24 of them. The shipped mono face has two
 * weights only — 400 and 500, per the four `@font-face` blocks at the top of
 * `styles/fabricate.css` — so every one of these renders synthetically emboldened rather than in
 * the weight it asks for.
 */
export const KNOWN_HEAVY_MONO_WEIGHTS = knownDebt('heavyMonoWeights');

/** @see KNOWN_HEAVY_MONO_WEIGHTS */
export const KNOWN_HEAVY_MONO_WEIGHT_TOTAL = 33;

/**
 * A `box-shadow` that is neither an elevation token, `none`, nor an inset ring, keyed
 * `file | selector | value`.
 *
 * MEASURED at `6a2c3b46b`: 26 declarations of 101, 22 in the sheet and 4 in scoped blocks. The
 * issue measured 28 before issue 1498 deleted three with their rules, and this gate finds one more
 * than the issue's audit could see — the header explains which extractor difference accounts for
 * it. The two commonest shapes are the inset hairline `inset 0 1px 0 var(--fab-*)` (9) and the
 * left accent bar `inset 3px 0 0 var(--fab-*)` (5); whether either becomes a token is the sweep
 * child's decision, and until it is made they are debt rather than vocabulary.
 */
export const KNOWN_OFF_TOKEN_SHADOWS = knownDebt('offTokenShadows');

/**
 * 26 → 25 with issue 1503. The picker panels' hand-written `0 16px 36px var(--fab-overlay-dark-34)`
 * left with the block that carried it: both pickers render through `SearchablePopover` now and
 * take the shared panel's `var(--fab-shadow-lg)`, so the caller's own panel rule is deleted
 * rather than out-specified. Paid down by adoption, not by a sweep.
 *
 * @see KNOWN_OFF_TOKEN_SHADOWS
 */
export const KNOWN_OFF_TOKEN_SHADOW_TOTAL = 25;

/**
 * A native `<select>` rendered by a Svelte template, keyed `file`.
 *
 * MEASURED at `6a2c3b46b`: 99 elements in 38 files, counted as `RegularElement` nodes by
 * `svelte/compiler`. A raw text grep over the same corpus says 140 in 48 files, because it counts
 * docblock prose and CSS — the parse is the pin, and the discrepancy is the reason why.
 *
 * No file carries the `<!-- native select: … -->` marker today. `BulkEditSelect.svelte` and
 * `InventorySystemSelector.svelte` each carry a DOCBLOCK reason, which is not the marker and does
 * not exempt them; they are baselined like the rest.
 *
 * ONE ROW WAS ADDED AFTER THAT MEASUREMENT, at issue 1392: the World Vocabulary screen's sort
 * key, `scoped/WorldVocabularyPage.svelte`. It is the FIRST growth this table has taken since it
 * was measured, which is worth saying out loud — a debt table that grows once without anyone
 * noticing grows twice.
 *
 * It is banked rather than exempted, and the marker is not used: that exemption is for a surface
 * which genuinely cannot host a Svelte component, and this one can. Nor is it banked for want of a
 * picker. `apps/manager/SearchablePopover.svelte` is the shipped shared picker and COULD take this
 * control today — `showSearch={false}` with `triggerHasPopup="listbox"` is the bare-list shape, and
 * four call sites already render it that way.
 *
 * It was banked on the maintainer's decision, for CONVERGENCE. The control is the same one as the
 * sort key select in `scoped/EntityListInspectorFrame.svelte` — one of that file's two, the other
 * being a lane filter — which this page's own header records it duplicates deliberately.
 * Converting one of a duplicated pair leaves the manager asking for a sort key two different ways
 * a screen apart. Issue 1504 built `<Select>` and converted that frame; issue 1510 sweeps the
 * manager's remaining call sites onto it, and `WorldVocabularyPage.svelte | 1` leaves there.
 *
 * 100 → 96 with issue 1504, and the rows fell in fours: `components/Pagination.svelte | 1`,
 * `apps/manager/BulkEditSelect.svelte | 1` and `apps/manager/scoped/EntityListInspectorFrame.svelte
 * | 2` are DELETED because all four elements now render `components/Select.svelte`, the app's own
 * option list. The file count falls 39 → 36 with them. Paid down by conversion, not by a marker
 * and not by a sweep: no `<!-- native select: … -->` comment was added, and every remaining row is
 * still owed.
 *
 * Note which row did NOT move. `scoped/WorldVocabularyPage.svelte | 1` STAYS — that page's sort
 * key is a separate element on a separate screen, and it is issue 1510's to convert. The pair the
 * paragraph above calls duplicated is now asked two different ways, deliberately and briefly,
 * which is the cost the convergence argument accepted rather than a defect this table hides.
 */
export const KNOWN_NATIVE_SELECT_ELEMENTS = knownDebt('nativeSelectElements');

/** @see KNOWN_NATIVE_SELECT_ELEMENTS */
export const KNOWN_NATIVE_SELECT_TOTAL = 96;

/**
 * A native `<select>` written into a JavaScript template string, keyed `file`.
 *
 * MEASURED at `6a2c3b46b`: four, all of them DialogV2 bodies, which cannot render a Svelte
 * component and therefore cannot use the app's own option list. Issue 1504 states that exemption
 * permanently; until it does, they are recorded here rather than silently outside the gate.
 *
 * The scan strips JavaScript comments first, and that is load-bearing: nine docblocks under
 * `src/**` name `<select>` in prose to explain what a model binds to, and a text scan that
 * counted them would be answered with a file-level exemption for exactly the modules the gate
 * exists to police.
 */
export const KNOWN_NATIVE_SELECTS_IN_JS = knownDebt('nativeSelectsInDialogBodies');

/** @see KNOWN_NATIVE_SELECTS_IN_JS */
export const KNOWN_NATIVE_SELECTS_IN_JS_TOTAL = 4;

/**
 * A corner radius off the published ladder, keyed `file | property | value`.
 *
 * MEASURED at `6a2c3b46b`: 318 corner values across 140 keys, out of 776 radius declarations. 8px
 * alone is 187 of them — 59% — which is what a ladder looks like when nothing enforces it. The
 * count is per CORNER VALUE rather than per declaration, so `border-radius: 8px 8px 0 0` is two
 * findings and one compliant pair; a per-declaration count would let a shorthand hide three
 * offences behind one row.
 *
 * A `var()` token is RESOLVED through the corpus's own definitions and pinned as
 * `raw => resolved`, so moving a banned literal into a private token does not pay the debt down.
 * One token is live debt on this base: `--fab-books-control-radius` is 5px and is read three
 * times. Two others resolve to compliant values and are correctly absent —
 * `--fab-books-panel-radius` is 6px, which is on the ladder, and
 * `--crafting-essence-thumb-radius` is set from markup so the scan reaches only its 6px fallback.
 * The issue predicted the panel token would be debt; it measured compliant, so it has no row.
 */
export const KNOWN_OFF_LADDER_RADII = knownDebt('offLadderRadii');

/**
 * 318 → 317 with issue 1503, and the row that moved is `styles/fabricate.css | border-radius |
 * 8px`, 73 → 72: the deleted picker-panel block above carried an 8px corner, and the shared panel
 * it now takes is 10px.
 *
 * THE 10px ROW IS UNTOUCHED and stays owed. 10px is not on the ladder either — the shared panel's
 * own corner is one of the fourteen occurrences that row counts — so that change moved one
 * occurrence off an off-ladder value and onto a different off-ladder value's existing row. That
 * is a net −1 rather than a snap, and the snap is still owed against the `10px | 14` row.
 *
 * 317 → 316 with issue 1504, and this one IS a snap. `apps/manager/BulkEditSelect.svelte |
 * border-radius | 8px | 1` is deleted: the component's whole scoped block went with its native
 * `<select>`, and the control it became takes the shared select's `form` rung, whose corner is the
 * ladder's 9. So the row leaves because a control moved onto a rung, which is the one way this
 * number is meant to fall. The key count falls 140 → 139 with it.
 *
 * 316 → 315 with issue 1505, and it is the same kind of snap. `apps/crafting/ShoppingList.svelte
 * | border-radius | 8px` falls 2 → 1: the three summary cards became `<StatBox>`es, whose corner
 * is the specimen's — and the ladder's — 9. The file's other 8px is an unrelated rule and stays,
 * so the KEY count is unchanged at 139. The manager's converted stat tiles move NO row in either
 * direction: they read `var(--fab-books-panel-radius)`, which resolves to a compliant 6px and
 * therefore never had one.
 *
 * @see KNOWN_OFF_LADDER_RADII
 */
export const KNOWN_OFF_LADDER_RADIUS_TOTAL = 315;

/**
 * A Svelte SCOPED STYLE reading an area-scoped `--fab-*` property, keyed `file | property`.
 *
 * MEASURED at `6a2c3b46b` by `tests/token-generation-gate.test.js`. 24 of the 140 distinct
 * `--fab-*` names have every one of their declaration sites inside a `.fabricate-manager`
 * compound, and 19 of those 24 carry no `--fab-manager-` prefix — which is why that gate now
 * computes its population instead of matching the prefix, and why these rows appeared at all.
 *
 * All six read ONE property, `--fab-recipe-control-font`, for their control type. Every one of
 * the three components does render inside the manager today and not one of them can prove it: a
 * component is placed in a DIRECTORY, not in a DOM subtree, so where the host is not under
 * `.fabricate-manager` the property is undefined and the declaration falls back to inheritance
 * without failing.
 */
export const KNOWN_AREA_SCOPED_STYLE_READS = knownDebt('areaScopedStyleReads');

/** @see KNOWN_AREA_SCOPED_STYLE_READS */
export const KNOWN_AREA_SCOPED_STYLE_READ_TOTAL = 6;

/**
 * An area-scoped `--fab-*` property spelled into a template or module string, keyed
 * `file | property`.
 *
 * MEASURED at `6a2c3b46b`, over the part of each file the CSS scans do NOT read. Five sites, and
 * they are two different mistakes. `WorldToolEntryPage` and `ToolBreakageTab` READ
 * `--fab-tool-breakage-chance-track-gradient` through a component prop. `ChanceSlider` DECLARES
 * three area-scoped names into an inline `style` attribute — and that one is invisible to every
 * CSS clause in this repository, because the mask that isolates a `<style>` block blanks exactly
 * the markup those declarations live in. It is also the widest version of the defect: a component
 * under `components/` renders wherever a caller puts it.
 *
 * The issue predicted TWO rows here, because its audit looked only for the `var(` shape. The three
 * `ChanceSlider` declarations are found by the shape that matches a name followed by a colon, and
 * they are real.
 */
export const KNOWN_AREA_SCOPED_STRING_USES = knownDebt('areaScopedStringUses');

/** @see KNOWN_AREA_SCOPED_STRING_USES */
export const KNOWN_AREA_SCOPED_STRING_USE_TOTAL = 5;

/**
 * A name-bearing prop defaulting to untranslated English, keyed `file | prop | default`.
 *
 * MEASURED at `6a2c3b46b` by `tests/design-system-required-names.test.js`, over the 26 flat
 * `src/ui/svelte/components/*.svelte` files and the 31 manifest rows under `apps/manager/`. Each
 * of these ships a hard-coded English string as the accessible name of a control, which no world
 * can translate: `game.i18n` never sees a default written into a `$props()` destructuring.
 *
 * A LOCALIZATION KEY default is not untranslated text and is correctly absent: `DropZone` defaults
 * its label to `'FABRICATE.DropZone.DefaultLabel'`, which resolves through the lang files like any
 * other key.
 *
 * The issue predicted eight rows and the gate measures TEN, on the same defects. The difference is
 * granularity rather than scope: the key is (file, prop, text), so `ManagerColorPicker`'s two
 * defaults and `ManagerColorPopover`'s three are five rows here where the issue's prose collapsed
 * them into one sentence naming three strings. The finer key is what stops a swap inside one file
 * — 'Custom hex' becoming 'Hex value' — from leaving the count unmoved.
 */
export const KNOWN_UNTRANSLATED_NAME_DEFAULTS = knownDebt('untranslatedNameDefaults');

/** @see KNOWN_UNTRANSLATED_NAME_DEFAULTS */
export const KNOWN_UNTRANSLATED_NAME_DEFAULT_TOTAL = 10;

/**
 * An `aria-label` bound to a prop that defaults to the empty string, keyed `file | expression`.
 *
 * MEASURED at `6a2c3b46b`: two, of the 45 `aria-label` bindings in the corpus. Ten of the 45 are
 * already written `aria-label={x || undefined}`, and only these two bind a prop that defaults to
 * `''` — which renders `aria-label=""` and SUPPRESSES the element's accessible name rather than
 * leaving it to the content. Every other unguarded binding defaults to `undefined` or to a
 * non-empty string, neither of which can render an empty attribute, so none of them is a violation
 * of this obligation and none is a row.
 *
 * `RowDisclosure` is the one the issue predicted. `ManagerModal` is the one it did not, and it is
 * the worse of the two: the binding is on a `role="dialog" aria-modal="true"` root, so a modal
 * opened without a title announces as an UNNAMED DIALOG — the case a screen-reader user has no way
 * to recover from, because the surrounding page is inert. The issue's audit missed it because it
 * matched `aria-label` only against props whose NAME looked like a label, and this prop is called
 * `title`.
 *
 * `IconButton` and `SelectionCheckbox` already ship the guarded shape and are the pattern.
 */
export const KNOWN_EMPTY_NAME_BINDINGS = knownDebt('unguardedEmptyNameBindings');

/** @see KNOWN_EMPTY_NAME_BINDINGS */
export const KNOWN_EMPTY_NAME_BINDING_TOTAL = 2;

/**
 * A non-form element with `tabindex="0"` and an interactive role, keyed `file`.
 *
 * MEASURED at `6a2c3b46b`: 21 elements in 17 files, NONE of them declaring `data-keyboard-focus`.
 * Every one can hold focus, and Foundry's `KeyboardManager#hasFocus` returns false for all of
 * them — so Space pauses the game and the arrows pan the canvas behind the open application.
 *
 * The ten roving `tabindex={active ? 0 : -1}` sites in this corpus are outside this population by
 * construction: each either carries no static `role` or is a `<button>`, which the clause below
 * already counts.
 */
export const KNOWN_ROLE_FOCUS_TARGETS = knownDebt('roleFocusTargets');

/** @see KNOWN_ROLE_FOCUS_TARGETS */
export const KNOWN_ROLE_FOCUS_TARGET_TOTAL = 21;

/**
 * A `<button>` outside any `<form>` that does not declare `data-keyboard-focus`, keyed `file`.
 *
 * MEASURED at `6a2c3b46b`: 280 elements in 97 file rows; 279 in 96 since issue 1502, which made
 * `IconButton` emit the attribute and so retired the single row it owned. The corpus holds 290
 * formless buttons across 103 files and eleven of them now declare, so those eleven are compliant
 * and correctly absent. `ActionMenu.svelte` is the case worth naming: it emits the attribute on the trigger it
 * opens with, and a baseline keyed on the POPULATION rather than on the debt would have listed it
 * as owing something it does not.
 *
 * `hasFocus` returns `!!focused.form` for a BUTTON, so a button with no ancestor form is exactly
 * as unrecognised as a bare `div`. This is the largest single row set in this file and it is
 * meant to collapse: once the shared primitives emit the attribute (issues 1502 and 1508) most of
 * it goes at once. Issue 1502 took the first bite, and its SIZE is the point — one row, not the
 * hundreds the runtime change actually reaches. This scanner counts SOURCE elements: a
 * `RegularElement` `<button>` outside a form, never a component call site. So `IconButton`'s own
 * `<button>` left, while `ManagerButton`'s `<svelte:element>` root and the six hand-written
 * `manager-icon-button` carriers in `CraftingSystemManagerRoot.svelte` are invisible to it and
 * stay. Every rendered instance of both primitives outside a form now answers `hasFocus` true;
 * this number does not say so, and must not be read as if it did.
 */
export const KNOWN_FORMLESS_BUTTONS = knownDebt('formlessButtons');

/**
 * 279 → 276 with issue 1503, across three rows: `SearchablePopover.svelte` 3 → 2,
 * `IconPicker.svelte` 2 → 1 and `EssenceSourceSelector.svelte` 3 → 2.
 *
 * ONE `<button>` accounts for all three. The pickers' option rows moved into the primitive, and
 * the primitive's own option row now writes a literal `data-keyboard-focus="true"` — because it
 * gained `tabindex="-1"` to carry an `aria-activedescendant` listbox, and a formless button in
 * the tab order that does not declare itself is exactly what this ledger is for. The two
 * pickers' remaining rows are their triggers (and the source picker's clear button), which are
 * caller-owned markup and stay.
 *
 * The primitive's own TRIGGER is deliberately still counted: its attribute arrives through
 * `{...triggerAttributes}`, which this source-level scanner cannot see, so nothing is being
 * quietly banked that the scanner did not measure.
 *
 * @see KNOWN_FORMLESS_BUTTONS
 */
export const KNOWN_FORMLESS_BUTTON_TOTAL = 276;

/**
 * A shared component outside `components/` with no manifest row, keyed `path`.
 *
 * MEASURED at `6a2c3b46b` by `tests/design-system-primitives.test.js`: 49 files under
 * `src/ui/svelte/` but outside `components/` are imported by two or more independent callers —
 * the bar `openspec/specs/design-system/spec.md` sets for membership of the primitive set — and
 * carry no row in either manifest table. 75 clear the bar in that domain and 26 are registered.
 *
 * This register is the EXCLUSION MECHANISM rather than a list of offenders. A path leaves it only
 * by gaining a manifest row, in either table, and enters it only by being added here, so a name
 * arriving or departing unrecorded is a failure. That is what settles the domain question issue
 * 1481 raises: nested manager directories ARE in domain, and the answer is now a table rather
 * than a reading.
 */
export const KNOWN_UNREGISTERED_SHARED_COMPONENTS = knownDebt('unregisteredSharedComponents');

/** @see KNOWN_UNREGISTERED_SHARED_COMPONENTS */
export const KNOWN_UNREGISTERED_SHARED_COMPONENT_TOTAL = 49;
