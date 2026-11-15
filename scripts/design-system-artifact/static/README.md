Fabricate is a crafting, gathering and downtime module for Foundry VTT.
Its product UI is a dark, flat, warm-ink interface that lives inside windows Foundry owns, used by two audiences: the **GM**, who authors crafting systems in the Manager, and the **player**, who browses, gathers and crafts in the player app.
This system is the shared language every Fabricate prototype is built in, so a prototype can be lifted into the module without being restyled.

## Using this system in a prototype

1. Load `tokens.css` (colours, space, radii, ladders, type classes, the two self-hosted faces) and then `components/bundle.css` (the component kit).
Nothing else.
2. Wrap every Fabricate surface in an element with class `fab-root`.
It sets the page ground `--fab-bg-0`, ink `--fab-text`, the UI face and body type (13px / 1.6), the 2px accent focus ring and the reduced-motion rule.
3. Pick a theme with `data-theme="<id>"` on `<html>` or on the root: `fabricate` (default), `mythwright`, `ironblood-forge`, `hearth-herb`, `starglass-arcana`, `foundry-native`, `sovereign`.
Every theme is dark.
In the shipped module the same palettes are set by `data-fabricate-theme` and the setting `fabricate.theme`; the token names are identical, so a prototype's CSS moves across unchanged.
4. Build screens from the **Screen recipes** cards (Browse, Editor, Player, Validation), then fill them with the component cards.
Copy a card's markup and keep its `k-*` classes.
Route every new case through **Which one do I use?** before drawing anything new.
5. Read every value by name: `var(--fab-bg-2)`, `var(--fab-space-3)`, `var(--fab-radius-control)`.
A literal colour, spacing or shadow in a prototype is a bug — the product's colour gate fails a raw `rgba()`, hex or named colour outside the theme blocks.

Token names are the product's own `--fab-*` names wherever the product declares one.
The ladder tokens `--fab-radius-*`, `--fab-control-*`, `--fab-art-*`, `--fab-portrait-*` and `--fab-target-min` exist for prototypes: the module writes those values as literals, so when code moves into `src/`, replace each with its literal value.

## The five rules

1. **One component per job.** Where two surfaces do the same thing they use the same component.
About to draw a second version? The answer is a variant of the first.
2. **Geometry comes from the ladder.** Six control heights, five radii, one 4px spacing scale.
A value off the ladder is a bug, not a decision.
3. **Colour is data, not decoration.** A tint identifies an entity; a semantic family reports state.
Never a literal.
4. **Every control declares its states.** Rest, hover, focus-visible, disabled — and where they apply, readonly, invalid, busy, empty.
An icon-only control always has an accessible name.
5. **Foundry owns the window.** Container queries, not viewport.
Portalled popovers, not CSS offsets.
No URL, no router, no toast.

## Content fundamentals

- **Who is speaking.** The interface speaks plainly to the person at the table: "you" for the reader, the GM and the player named by role, never "the user".
Copy states the world, not the software: "This character isn't carrying any crafting components yet."
- **British English.** Colour, catalogue, licence, armour.
Sentence case for everything — buttons, titles, tabs ("Save recipe", "Add ingredient set", "New template").
- **Verbs on buttons.** A button names its verb: Save, Claim, Review, Apply to all, Confirm the stage.
The verb's role decides its paint, not its importance.
- **Empty states say what the emptiness means**, never "no items": "No owned components contribute this essence." / "Not required as a tool by any known recipe." Give the next step when there is one: "Promote a region above, or drag one from the Interactable browser."
- **Hints are one sentence under the control** they explain: "A template name must be unique." / "Shift-click (or Shift+Enter) to pick several items, then break them down together.
Escape clears the selection."
- **Busy changes the label**, not just the glyph: "Salvaging…".
A spinner alone is invisible to a reduced-motion reader.
- **Kickers** are the only uppercase text: short category labels over a field or section (`INGREDIENTS`, `CRAFTING`).
- **Numbers are mono**, words are not.
A control whose text is words stays in the UI face even in a numeric slot.
- **No emoji, no exclamation marks, no toasts.** Transient feedback belongs to Foundry's `ui.notifications`.
- **Domain words are exact**: recipe, component, essence, ingredient set, result set, check, tier, run, stage, gathering task, environment, biome, tool, crafting system.

## Colour

All seven themes declare the identical token set; switching themes re-tints everything.
Each theme's character lives in its ground and its accent: `fabricate` is ink-blue with warm parchment text and a tan accent; `mythwright` deep teal with a green accent; `ironblood-forge` charred plum with copper; `hearth-herb` moss with brass; `starglass-arcana` night blue with lavender ink and an ice-blue accent; `foundry-native` near-black with gold, after Foundry's own look; `sovereign` navy with royal gold.

**Depth: four background levels carry all depth.** `fab-bg-0` is the page ground; `fab-bg-1` is rails, rows and wells; `fab-bg-2` is cards and panels; `fab-bg-3` is icon chips.
Backgrounds nest downward — a card on the page is `bg-2`, a well inside that card is `bg-1`.
A well on a modal body (itself `bg-1`) takes `bg-2`.

**Interaction is a translucent ladder** that reads on any level: `fab-surface-soft` at rest, `fab-surface-raised` on hover, `fab-surface-active` pressed or selected.
Borders are `fab-border` (hairline) and `fab-border-strong` (hover, dividers, dashed adders).

**Ink is a four-rank ladder routed by meaning**: `fab-text` for names and values; `fab-text-secondary` for the rule the GM is reading; `fab-text-muted` for a fact merely present (small text, hints, descriptions — clears 4.5:1 on `bg-1`, `bg-2` and `surface-soft` over `bg-2` in all seven themes, lowest 4.60:1 in `foundry-native`); `fab-text-subtle` for a quiet, non-actionable state (captions, counts, idle icons — under 4.5:1 on several grounds, so never running small text); `fab-text-disabled` for unavailable.
Disabling changes ink only, never the background.

**Semantic families report state** and each ships base, `-text`, `-soft` and `-border`: `accent` (action, active nav, selection, focus), `success` (save, valid, enabled — the primary button is success, everywhere), `info` (DC values, neutral facts), `warning` (unsaved, attention), `danger` (destructive, invalid).
A tinted surface takes fill, border and ink from ONE family: `fab-warning-soft` + `fab-warning-border` + `fab-warning-text`.
On small marks ink with the `-text` token, not the base.
On `fab-danger-soft` running text inks `fab-text-secondary`, never `fab-text-muted`.
Solid fills take an `on-` ink: `fab-on-accent`, `fab-on-success`, `fab-on-info`, `fab-on-danger`.

**Entity tints** (`fab-tag-*`) identify a thing — an essence, a tag, a biome.
Ten are offered to a GM in the tint picker (sage, mist, lavender, rose, peach, butter, aqua, mauve, verdant, azure); `bone` and `slate` are withheld neutrals and `ember` is bound to the Downtime companion.
A tint colours a glyph, a badge ink or a bar fill — never a chip background, which would double-code kind against state.
Store a tint by token NAME, never as a hex.

**The drop-rate ramp** (`fab-drop-rate-*`: guaranteed, common, uncommon, rare, very rare, legendary, none) is seven fixed hues, identical in every theme.
A reading is banded — a value range maps to one hue and the whole fill takes it.
Nothing is interpolated.

**Overlays** (`fab-overlay-dark-*`, `fab-overlay-light-*`) are theme-tinted alphas for scrims and washes; a contrast claim about a translucent fill always names the ground it composites over.

Flat, always: no gradients on surfaces, headers, buttons, overlays or selected states, and no blur or glass.
The one exception is a full-track semantic scale where the gradient IS the meaning (a green-to-red risk slider).

## Type

Three faces, three jobs. **Spectral** (serif, 600 and 700 only) names things: an entity's name wherever it is named, section and card titles, inputs that author a name. **JetBrains Mono** (400 and 500 only — never 600 or 700, which would synthesise faux-bold) carries every number a GM compares or tunes: quantities, DCs, counts, step indices, durations, expressions; always with `font-variant-numeric: tabular-nums`.
The **UI face** is Foundry's own (`var(--font-body)`, Signika by default) and carries interface text; the product does not tokenize it, and the prototypes use Signika.

Set text with the type classes: `page-title` 22, `section-heading` 19, `stat-value` 17/700, `card-title` 15, `row-name` 13 in serif; `body` 13/1.6, `control-label` 12.5/600, `button-label` 11.52/700, `field-text` 11.5/500, `helper` 10.5/1.5, `kicker` 8.5/700 uppercase .11em in the UI face; `headline-figure` 18, `emphasised-value` 13, `stepper-value` 11.5 (all 500), `expression` 10.5, `log-line` 9.5 (400) in mono.
Emphasis in mono comes from size and ink, never weight.
Prose holds one reading measure, 66ch.

## Space and geometry

**Spacing** — padding, margin and gap only — comes from the 4px scale: `fab-space-2xs` 2, `fab-space-1` 4, `fab-space-chip` 6 (icon+label and chip gaps), `fab-space-2` 8, `fab-space-3` 12 (default row and well padding), `fab-space-4` 16 (card padding), `fab-space-5` 20, `fab-space-6` 24 (between page regions).
Arithmetic over the scale must land on the scale.
Exempt literals: 1px hairlines and one-off 34–42px clearances for a fixed element.
Radius, width, height, borders, font sizes, grid tracks and breakpoints are never spacing tokens.

**Radius tracks the size of the thing**: `fab-radius-chip` 6 (≤24px), `fab-radius-control-sm` 7 (26–32px), `fab-radius-control` 9 (34–38px, rows, wells), `fab-radius-card` 11 (44px control, cards, panels, callouts), `fab-radius-pill` 999 (text-only pills and tracks).
A pill that contains a square element takes its height's control rung instead.

**Control heights are a closed ladder**: `fab-control-26` dense in-row, `-28` stepper and row action, `-30` inline field, `-34` form field and body button, `-38` page action and the search field, `-44` touch-reachable only. 32, 36 and 40 are retired.
Every pointer target is at least `fab-target-min` (24px); the hit area may exceed the paint.

**Art and portraits have their own ladders.** A record's tile (IconChip) is one of `fab-art-22` … `fab-art-44`, default 26, with corner 6 / 7 / 9 / 11 by band and the glyph at about 0.4 of its edge.
A person's portrait (Avatar) is 32 single, 26 stacked, 28 or 30 leading a row; square portraits take radius 9, and round is reserved for a person.

**Elevation is for things that float**: `fab-shadow-md` for an anchored menu, `fab-shadow-lg` for a popover, picker or modal.
Cards, wells and rows use a border, never a shadow.

## States, motion and accessibility

- Every interactive part draws rest (`surface-soft`), hover (`surface-raised`), active (`surface-active`), focus-visible (a solid 2px `fab-accent` ring at 2px offset — never on `:focus`, so a mouse click does not ring) and disabled (`fab-text-disabled`, no fill change).
- Where they apply: **readonly** takes focus and refuses edit (a dashed edge on no fill); **invalid** is a `fab-danger-border` edge and `fab-danger-soft` fill plus an error line the control points at; **busy** is an action in flight (`aria-busy`, opacity .7, no hover, changed label); **loading** is a data source not yet settled; **empty** says what the emptiness means.
- Unchecked radios, checkboxes and a switch's off track outline in `fab-control-outline` (3:1 on every ground).
- **One motion**: `--fab-motion-control` (140ms ease) for a control's state change.
Nothing else animates, no keyframes, and reduced motion removes every transition.
- A change with no visible focus consequence is announced ("Moved Iron ingot to position 2 of 5").
Move focus first, then announce.
- Forced colours repaint controls in system colours; never rely on a fill alone to carry selection.

## The Foundry contract

Prototypes model the real host so nothing has to be redesigned on the way in.

- **The window is Foundry's.** Every breakpoint is an `@container` query on the window, never a viewport media query; declare the narrow case after the wide one.
- **Floating surfaces portal** to the application root (`.fabricate-manager` or `.fabricate-app`), never `document.body`, then measure, flip and clamp.
- **Listboxes keep focus in their search input** and drive selection with `aria-activedescendant`; option rows never take focus.
A focusable non-input that handles arrows carries `data-keyboard-focus="true"`, or the keypress pans the canvas.
- **Core CSS collides.** Every button sets its own `height` and `min-height`, every input its own width; radios and checkboxes remove their pseudo-elements; a serif heading names its element.
- **No toast** (use `ui.notifications`), **no URL and no router** (state lives in an app store), and **destructive confirmation is a dialog** by default — arm-then-confirm (`ArmedDangerButton`) only for high-frequency row actions and bulk actions that state their impact.

## Iconography

The product draws icons from **Font Awesome Free**, as bundled by Foundry: a glyph is offered only if Foundry can render it AND Font Awesome's free release publishes its name; Pro-only names are never referenced in code.
Icons are classes (`fa-solid fa-hammer`) at the art ladder's glyph size, inked by the surrounding text token (`fab-text-secondary` in an icon chip, `fab-text-subtle` idle, `fab-accent` active).
The icon picker's curation admits any glyph that belongs in some fiction — fantasy, science fiction or general — and leaves out software affordances, real-world signage, currency signs and redundant variants.
The card previews use a small stroked SVG sprite as a stand-in for those glyphs; in a prototype either use Font Awesome Free class names or the sprite's `<use href="#i-…">` symbols, at 1em, never emoji.

## Imagery and brand marks

The Fabricate mark (`Logos/fabricate-logo.jpg`) is four elemental roundels around a crossed axis over the wordmark, drawn in warm parchment ink on the dark ink-blue ground; use it only on `fab-bg-0`-like grounds and never recolour or redraw it.
Premium crafting-icon art (`Relics/`) is small painted relic artwork used only in the GM Manager's premium advert; no premium signal ever appears in the player window.
Product imagery is otherwise the GM's own: record art and portraits drawn through IconChip and Avatar at ladder sizes.

## Screens and structure

Four archetypes cover the app; build from the recipe down, not from parts up.

- **Browse** — a list of records you filter, sort, page, select and open: title bar, nav rail, page header with one primary verb, FilterBar, ListRows, Pagination.
- **Editor** — one record opened: breadcrumb back to its list, a full-width tab bar across its facets (never tabs in a side rail), cards down the body, an inspector rail answering "what does this affect?".
A settings screen is an editor without the breadcrumb or back-and-save pair.
- **Player** — the other side of everything the GM authored: icon rail, browse column, and a detail pane that resolves what the craft will actually take.
- **Validation** — a verdict, the counts, then issues grouped by the part of the record they belong to.

Two container levels only: a **Card** (`bg-2`, radius 11, 16px padding) sits on the page; a **Well** (`bg-1`, radius 9, 12px padding) nests inside a card.
A layout rule places a primitive and never restyles it — no font, border, radius or background from the caller.

## Keeping prototypes in step

The normative source is the Fabricate build reference (`openspec/specs/design-system/library.html`) and its spec; the component cards here are static renditions of its specimens at canonical geometry.
Each component README records its library status — **shipped** (the module's component matches the specimen), **target** (the specimen is what to build towards), **divergent** (a recorded decision keeps the shipped component different) or **prose** (a pattern, not a part) — and the Svelte file that ships it.
In the repository, `npm run lab` opens the Primitive Lab, which stands each real component beside its specimen, and the View Lab captures every screen and fails a frame whose computed corners, heights or mono weights leave the ladders.
A prototype that holds to this system passes the same checks.
