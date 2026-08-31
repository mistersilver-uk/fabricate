# Design System

## Purpose

This capability is the canonical, normative record of Fabricate's shared UI design system: the token foundations every product surface draws from, the set of shared primitives that set is allowed to contain, the rules that route a new case to an existing primitive, and the recipes that compose those primitives into the app's screen archetypes.
It exists because a design system that lives only in prototypes drifts: the audit that produced this capability found 99 distinct button signatures, 79 icon-chip signatures, 75 field signatures, 70 card signatures and 55 kicker variants across the surfaces it swept.
`ui-integration` states the requirement that a repeated thing MUST be one shared primitive; this capability states what that set IS.

The set itself is ENUMERATED in `openspec/specs/design-system/library.html`, one primitive per `div.spec-head > h4` heading, each rendered at its canonical geometry.
That file is part of this capability rather than a companion to it: it is the same normative content with specimens attached, and it is the artifact to open when a written geometry needs to be seen rather than read.
The machine-readable half is `scripts/lib/designSystemPrimitives.json`, one row per SHIPPED primitive keyed on the implementation path a diff names.
`tests/design-system-coverage.test.js` reads both and fails when they describe different vocabularies.

### Corpus and authority

The design system's corpus is **this repository only** — the GM manager and the player app under `src/ui/`, and the Core prototypes that feed them.
The Economy module and the premium Downtime companion are separate products and are explicitly OUT of corpus, because a signature count weighted by a codebase this repository does not govern cannot justify a primitive in it.
A prototype whose implementation brief names a module other than Core is out of corpus, and a count derived from it MUST be re-derived before it is cited.

Precedence is fixed, highest first: `openspec/specs/` and `DOMAIN.md`; a shipped component's own props and its stated reasons; a CI gate that already fails on the alternative; then this capability.
Where a primitive already ships, its props ARE the specification and a proposal that drops one MUST state why in the same change, or it is an omission rather than a decision.

## Requirements

### Requirement: The primitive set is a closed, versioned vocabulary

The shared primitive set MUST be the set `openspec/specs/design-system/library.html` enumerates, one member per `div.spec-head > h4` heading, and a surface MUST reach for a member of it before writing a new component.
The library is where the vocabulary lives and this document is where its rules live; a requirement that pointed at an enumeration in neither file would bind a reader to a list nothing contains.
A member that has SHIPPED MUST also carry a row in `scripts/lib/designSystemPrimitives.json` naming its implementation path, which is what lets a diff be attributed to a primitive.
A member that has not shipped carries no row, because the manifest enumerates what ships and a row naming no file is a correspondence to nothing.
`tests/design-system-coverage.test.js` reads both artifacts and fails when a name is in one and not the other, in either direction.
Adding a prop to the primitive that already owns a meaning takes precedence over introducing a second component that owns half of it.

A candidate that decomposes entirely into existing members is a COMPOSITION and MUST NOT enter the set; it is recorded with the composition that replaces it so it is not re-proposed.
A candidate MUST have two or more independent callers to enter the set.
A candidate with fewer is recorded as ruled out WITH ITS CALLERS NAMED — or with the fact that it has none — so the absence is a decision rather than an oversight, and so a later reader can re-test the count rather than re-derive it.

#### Scenario: A new surface needs a control the set already contains

- **WHEN** a surface needs a control whose meaning a set member already owns
- **THEN** the surface imports that member
- **AND** any behaviour it lacks is added as a prop on that member rather than as a second component

#### Scenario: A candidate decomposes into existing members

- **WHEN** a proposed primitive can be built from members already in the set with no new behaviour
- **THEN** it is recorded in the ruled-out register with the composition that replaces it
- **AND** it does not enter the set

### Requirement: Token foundations are the only source of colour, space and elevation

Every colour, spacing value and shadow MUST come from a `--fab-*` token.
A raw `rgba()`, hex literal or named colour under `src/ui` or `styles` outside the approved theme blocks fails `tests/components/theme-colour-contract.test.js`, so a literal is a gate failure rather than a style preference.

Four background levels carry all depth: `--fab-bg-0` is the page ground, `--fab-bg-1` is rails, rows and wells, `--fab-bg-2` is cards and panels, and `--fab-bg-3` is icon chips.
Interaction state is carried by `--fab-surface-soft` at rest, `--fab-surface-raised` on hover, and `--fab-surface-active` when pressed or selected.
Each semantic family — accent, success, info, warning, danger — ships `-text`, `-soft` and `-border` beside its base, and a tinted surface MUST take fill, border and ink from ONE family.

Entity tint is a token NAME and never a hex, so a theme swap re-tints every entity that carries one.
Thirteen `--fab-tag-*` tokens are declared in every theme block and `src/ui/svelte/util/managerColorTokens.js` offers eight of them, so adding a token to the stylesheet does not add it to a picker.
Which tokens are offered MUST follow a stated rule rather than an enumeration: a tint is pickable unless it is a NEUTRAL that would read as body text or as a disabled state, or it is BOUND to a fixed brand site.
By that rule `bone` and `slate` are neutrals and `ember` is bound to the Downtime companion tint, while `verdant` and `azure` qualify and are not currently offered.
Collision with a semantic token does NOT disqualify a tint, because three offered tints already collide exactly — `mist` with `--fab-info`, `lavender` with `--fab-purple` and `butter` with `--fab-warning`.
Widening the picker is a runtime change carrying new localized labels and is recorded as an open decision rather than made here.

A tint token name is a PROMISE to the GM, who picks it by its localized word rather than by its value, so the same token MUST keep its hue across every theme while its saturation and lightness carry that theme’s character.
All thirteen are declared in all seven themes and every one clears 3:1 on its own theme’s `--fab-bg-1`, but five of the eight offered tints break the hue promise: `aqua` and `mist` invert by roughly 175 degrees, `mauve` by 160, `sage` by 88 and `peach` by 81.
In `foundry-native` a component tagged Aqua renders a desaturated rose, and in `ironblood-forge` one tagged Mist renders a warm red-brown — in both cases the picker’s own label is wrong.
The five withheld tints hold their hue within 27 degrees, because the hue-preserving derivation was applied when they were added and never retrofitted to the original eight.
Re-deriving the eight is a palette change across seven theme blocks and is recorded as a planned migration.

Elevation is for surfaces that float OVER content and MUST come from `--fab-shadow-sm`, `--fab-shadow-md` or `--fab-shadow-lg`.
A card that merely sits on the page uses a border and no shadow.

#### Scenario: A primitive needs a colour the token set does not name

- **WHEN** a primitive needs a colour no `--fab-*` token provides
- **THEN** the change mints a token in every theme block rather than writing a literal at the call site

### Requirement: Geometry comes from the published ladders

Control height MUST be one of 26, 28, 30, 34, 38, or 44 for a control a spec marks touch-reachable.
The values 32, 36 and 40 are RETIRED as CONTROL heights and MUST NOT be reintroduced as such.
Art and portraits carry their own size ladder and are not controls; the avatar sizes below are not governed by this one.
Radius tracks the size of the thing: 6 for chips at or below 24px, 7 for controls of 26 to 32px, 9 for controls of 34 to 38px and for rows and wells, 11 for a 44px control and for cards and panels, and 999 for pills and tracks.
A fully rounded radius is for a shape whose contents are text alone.
A pill that CONTAINS a square element — an icon chip, a thumbnail — takes the control radius for its height instead, and any button inside it squares off to match, because a circle wrapped around a square reads as two competing shapes.

Padding, margin and gap MUST derive from the spacing scale in `ui-integration`, whose documented literal exemptions are 1px hairlines and one-off fixed dimensions in the 34 to 42px range.
Radius, width, height, border widths, font sizes, grid track sizes and breakpoints are NOT spacing-scale members and remain literal.

Type follows the ladder in `ui-integration`: the serif face names things, the mono face carries every number a GM compares or tunes, and the interface face stays host-owned and untokenized.
The mono face ships weights 400 and 500 ONLY, so a mono step MUST NOT specify 600 or 700 — those synthesize as faux-bold.
Emphasis in mono comes from size and ink.

#### Scenario: A geometry falls between two rungs

- **WHEN** a proposed control height, radius or spacing value is not on a published ladder
- **THEN** it snaps to the nearest rung
- **AND** a value that genuinely cannot snap mints a scale member rather than shipping a literal

### Requirement: Every interactive primitive declares its full state set

An interactive primitive MUST declare rest, hover, focus-visible and disabled, and MUST declare readonly, invalid, loading and empty wherever they apply.
Any surface rendered from an asynchronous store — a browse list, a table, a rail section — declares LOADING and ERROR, because a store-fed surface reaches both states in ordinary use and a component that renders neither shows an empty list for a failure.
Focus MUST be expressed as `:focus-visible` and never `:focus`, so a pointer activation does not ring.
Readonly is DISTINCT from disabled: a readonly control takes focus and refuses edit, while a disabled control does not take focus.

A loading control MUST set `aria-busy` and change its label or text.
A spinner alone is insufficient because Foundry's bundled Font Awesome disables `fa-spin` under `prefers-reduced-motion` and every shipped spinner is `aria-hidden`, so a motion-only busy state is conveyed to a reduced-motion user by nothing at all.

Motion is limited to a 140ms ease on a control state change, and nothing else animates.
Under `prefers-reduced-motion: reduce` every transition and animation is removed, and any state that animated MUST remain readable when it does not.

#### Scenario: A control enters a pending state

- **WHEN** a control begins an operation that takes perceptible time
- **THEN** it sets `aria-busy` and changes its label
- **AND** any spinner it renders is decorative and `aria-hidden`

### Requirement: Naming, announcement and hit targets are component obligations

A control whose visible text is a glyph or a bare number MUST take its accessible name as a REQUIRED prop rather than an optional one.
A name composed from a value MUST be derived by a shared helper, because the alternative drifted across 23 call sites before `src/ui/svelte/components/stepperLabels.js` existed.

A change with no visible focus consequence MUST be announced through a live region, and focus MUST move BEFORE the announcement is made, because polite speech is cancelled by a focus change.
Reorder announces the moved item, its new position and the total.

Any element with a bounded width MUST state what a value too long for it does.
The default is to wrap to a stated number of lines and then truncate with an ellipsis, never to expand the container: a long document name and a long localized string are the normal case rather than the exception, and a control that grows with its content moves every control beside it.

Every pointer target MUST offer at least a 24 by 24 pixel hit area, per WCAG 2.2 section 2.5.8.
The hit area MAY exceed the painted area, so a 2px divider still carries a 24px handle and a chromeless remove action is 24px around a 9px glyph.
A control that cannot meet the minimum in a dense row MUST offer a comfortable density its caller can select.
A primary navigation destination is not a dense row and MUST be sized generously: the player app rail gives each item a 44 by 44 pixel icon well.
A count pip on such an item sits on the OUTER CORNER of that well with a ground-coloured ring, never over the glyph — a pip that overlaps the icon destroys the one thing the item is recognised by.

#### Scenario: A primitive renders an icon-only control

- **WHEN** a primitive renders a control whose only visible content is a glyph
- **THEN** its accessible name is a required prop
- **AND** its hit area is at least 24 by 24 pixels

### Requirement: The Foundry contract binds every primitive

Every primitive renders inside a Foundry ApplicationV2 window, inside Foundry's own CSS and event handling, and MUST satisfy the following.

Breakpoints MUST be `@container` queries and never viewport media queries, because an ApplicationV2 window resizes independently of the viewport.
A container query adds no specificity, so the narrow case is declared after the wide one.
The APP-LEVEL container breakpoints are a published ladder, and a new surface reuses them rather than inventing a rung: the manager container breaks at 1320, 1120, 960, 900, 831 and 680; the recipes container at 714, 634 and 554; the alchemy and crafting containers at 960.
A component MAY declare its own container and its own rung where the thing that must respond is the component rather than the app — that is not covered by this ladder and does not need to be.
A layout that reserves fixed rail widths MUST also declare a container minimum, because `ApplicationV2#_updatePosition` clamps only to a computed `min-width` that defaults to zero and a `minmax(0, 1fr)` centre column can otherwise collapse.
The shipped manager grid is `220px minmax(0, 1fr) 300px` with fixed outer tracks; giving those tracks a `minmax(0, …)` upper bound is a proposed change recorded in the migrations, not a description of what ships.

A focusable element that is not a form control, contentEditable, or a button with a form MUST carry `data-keyboard-focus="true"` when it handles arrow, Page, or Home and End keys, or the keypress ALSO reaches Foundry's bindings and pans or zooms the canvas.
The attribute is an OPT-IN that declares the element focused: `data-keyboard-focus="false"` does the opposite and hands the keypress to the canvas, so the value matters as much as the attribute.
A listbox MUST keep DOM focus on ONE element and drive selection with `aria-activedescendant`; roving focus onto option buttons re-arms those bindings and is forbidden.
Where the list has a search field, that field holds focus.
Where it does not — a plain select — the trigger is a `combobox` that Foundry will recognise as focused: either an input, or an element carrying the keyboard-focus attribute below.

A floating surface MUST be portalled to the application root and positioned by measurement, flip and clamp.
Core clips at `.window-content` and the manager adds further clipping boundaries, so a CSS offset cannot escape them; `document.body` is NOT a valid portal target because it loses window stacking.

A primitive MUST set its own `height` and `min-height` on any button and its own width on any input, because Foundry's element rules otherwise crop or stretch it.
A radio or checkbox MUST remove core's pseudo-element rendering in addition to setting `appearance: none`.
A serif heading MUST name the element it renders on, because bare headings take core's colour and margins.

Transient feedback is `ui.notifications` and Fabricate ships NO toast primitive.
Destructive confirmation defaults to `confirmDialog`; arm-then-confirm is a carve-out for a high-frequency row action and for a bulk action that states its impact in-panel.

There is no URL and no router, so page state, filter state and navigation MUST live in an app-level store and a primitive MUST NOT expose an in-app `href`.

A control that selects a world asset path MUST render the ASSET and a browse action, never the stored path string.
Foundry owns the picker dialog, the path is an implementation detail, and a long path destroys the row it sits in.

A native `select` renders its option popup through the operating system, which reaches it only through the control’s own computed background and `color-scheme`, and differs by browser and platform even then.
Whenever the options need a selected tick, a group heading, a per-option description, a badge, or a reason for being unavailable, the control MUST render its own option list using the floating-surface geometry instead of a native popup.

#### Scenario: A primitive handles arrow keys on a non-input element

- **WHEN** a focusable element that is not a form control handles arrow, Page, or Home and End keys
- **THEN** it carries `data-keyboard-focus="true"`
- **AND** the keypress does not also reach Foundry's canvas bindings

### Requirement: Near-neighbour primitives are routed by a stated rule

Where two primitives are visually similar, the choice between them MUST follow the rule stated here rather than being made by eye.

A record's state IN A LIST is a status button, which is legible across a page of rows and can express incomplete and blocked.
The same record's state IN ITS OWN EDITOR is a toggle in a settings row.
The distinction is the surface, not the subject — a recipe is a record in both places.

A choice between two to four named things is a segmented control, or option cards when each choice needs a sentence.
Independent criteria that narrow a list are filter toggles, because any combination is valid.
A one-of-N SCOPE the list is always in — rather than a filter that can be cleared — is a segmented control in the same bar; a segmented whose value could be "none" is a toggle in disguise.

The Rail Marker Family in `DOMAIN.md` is four marks and MUST NOT be substituted for one another: a record COUNT is a bare mono numeral with no fill and no border; an ISSUE SUMMARY is a filled warning badge carrying its count; a DIRTY MARKER is a 6px dot; and the PREMIUM chip marks a tier gate, in the manager only.
The unsaved CHIP beside an editor title is a separate mark and is not a member of that family: it names the state of the record being edited rather than the state of something behind a navigation item.

A rule that is always true is a callout, which stays put.
Something that just happened or is wrong right now is a notice, which goes away.
Current values a GM checks are an info strip in mono, and no control ever lives in a strip.
Nothing to show is an empty state, which says what the emptiness means rather than "no items" and distinguishes an unfiltered emptiness from a filtered one.

A number a GM can change is a stepper and never a stat box.
A continuous scale cut into named regions is a range bar whose spans tile; an ordered set of named tiers with a position marker is a tier track.

#### Scenario: A list row and an editor both show the same record state

- **WHEN** the same record's enabled state appears in a browse list and in that record's own editor
- **THEN** the list row renders a status button
- **AND** the editor renders a toggle

### Requirement: An ordered row opens in place to its editing body

Where a record is authored inside the list that orders it — recipe steps, component complications, result tiers, settlement tiers — the row MUST expand in place rather than opening a separate editor.
The list owns three disclosure modes: a single-open accordion, an always-open mode that renders every body and drops the disclosure control, and the plain collapsed list where rows carry no body at all.
The always-open mode is REQUIRED wherever the body is the entire subject of the surface, because a single-expand accordion on such a surface defaults to showing nothing and ships unseen.

The row itself MUST remain a non-interactive element and the disclosure MUST be the only button in it.
A whole-row button nests the row's own delete and menu controls, which is invalid DOM that `createElement` accepts and no mounted test detects.
The disclosure carries `aria-expanded` and an `aria-controls` pointing at the body region, and its accessible name is the record it opens.

Disclosure state and drag state MUST live in the list and be keyed by record id, not lifted into the store the list renders from.
Every persisted edit refreshes that store, and state held there collapses the row the GM is editing.

An adder for the collection MUST render as the list's own footer rather than as a sibling of the list, so it stays in flow with the collection it extends.

#### Scenario: A GM edits a field inside an expanded row

- **WHEN** a GM changes a field in an expanded row and the edit persists
- **THEN** the store refreshes
- **AND** the row stays open, because the disclosure state is keyed by record id in the list

#### Scenario: A surface exists only to show the row bodies

- **WHEN** a tab's entire subject is the content of each row body
- **THEN** the list renders in always-open mode
- **AND** it drops the disclosure control rather than defaulting every row to collapsed

### Requirement: Set membership is edited through a bounded, staged picker

Where a record belongs to a set too large to render inline — its tags, the books it appears in, the recipes a book carries — the control MUST be searchable, MUST bound what it renders in place, and MUST stage its selections rather than writing on click.

The trigger renders a FIXED maximum number of selected tokens and then an overflow count.
It MUST NOT grow with the size of the set: a record in forty books renders a few tokens and a count, because a control that renders every member pushes the editor that contains it off the screen.
The picker panel scrolls internally at a fixed maximum height and states how many entries the query matched against the total, so a GM can tell when to refine the search rather than keep scrolling.

Every selection MUST be reversible before it is committed.
The panel stages changes and applies them on an explicit action, and a Clear action is reachable at all times.

In BULK mode the per-entry control MUST carry three states — add, remove, and leave unchanged — and MUST NOT be a two-state checkbox.
An unchecked two-state box cannot distinguish "remove this from every selected record" from "do not touch this one", so the two-state form silently strips membership from records the GM never intended to change.
The commit action names the number of records it writes to.

#### Scenario: A record belongs to many members of the set

- **WHEN** a record belongs to more members than the trigger renders inline
- **THEN** the trigger shows its bounded token run followed by an overflow count
- **AND** the host editor does not grow with the size of the set

#### Scenario: A GM bulk-edits membership across selected records

- **WHEN** a GM opens the picker over a multi-record selection
- **THEN** each entry offers add, remove and leave unchanged
- **AND** entries left unchanged are not written to any selected record

### Requirement: One requirement row serves both sides of a recipe

The row that authors what a craft CONSUMES and the row that authors what it PRODUCES are one primitive, and the choice group built from them is one component.
There is no "result" kind and no "ingredient" kind: the row does not name which side it is on.
The CONTEXT the row is rendered in decides which kinds its select offers, and that is the only difference between the two sides.

The kind vocabulary is closed.
Two of the six are NOT yet shipped in this repository and are marked as such, because a vocabulary that presents a planned kind as a live one sends an implementer looking for code that does not exist:

- `component` — both sides.
- `currency` — both sides.
- `activity` — a completed activity, both sides.
  NOT SHIPPED here; it exists in the premium companion and enters this repository only with the work that needs it.
- `knowledge` — recipe knowledge, RESULT only.
  NOT SHIPPED here.
- `tag` — INGREDIENT only.
- `essence` — INGREDIENT only.

`tag` and `essence` are ingredient-only because each describes a CLASS of thing to consume rather than a record, and a craft cannot produce a class.
`knowledge` is result-only because knowing a recipe is something a craft grants and never something it consumes.
The shipped ingredient side today offers `component`, `currency`, `essence` and `tag`; the shipped result side offers `component` alone.

Every row leads with a kind-tinted chip, and the tint is what makes a list of eight rows scannable before any label is read.
`tag` MUST take the purple family, because it is the one kind in the set that matches any item carrying a value rather than naming one record, and that abstraction is the distinction the reader most needs at a glance.
A kind that names a record renders its subject in a bordered cell of fixed minimum width so names align down the list.
`tag` renders no subject cell, because a tag row holds SEVERAL tags rather than one record: it carries a run of individually removable chips followed by a dashed adder that opens the tag catalogue.
The catalogue lists each tag with the number of components already carrying it, which is what distinguishes a real tag from a typo of one, and offers creating an absent tag from its own footer rather than by accepting a free value typed into the row — the vocabulary stays a catalogue.
The any-of / all-of control MUST be absent while the row holds one tag and MUST be present once it holds two or more.
Against a single tag both settings select the same items, and a control whose options mean the same thing invites the reader to hunt for a distinction that does not exist.

Every STANDALONE row CARRIES the control that converts it into a choice group, because any requirement can acquire an alternative.
It sits immediately before the remove action, which is always last.
A row already inside a group MUST NOT render that control: the group carries the adder for its own alternatives, and a second one inside a member row would offer to nest a group inside a group.

The purple treatment of `tag` is the whole row and not just its chip: the lead chip, the value chip and the any-of / all-of control all take the purple family, inside a choice group exactly as outside it, because the tint names the KIND and a group does not change what kind a row is.
The group’s own accent border and header pill name the STATE — that this value is one of several the crafter may choose — so the two tints stay readable as two different facts.

The any-of / all-of control is RIGHT-ALIGNED with the row’s quantity rather than trailing its value, so that a column of mixed rows keeps its controls in one place.

A unit renders to the RIGHT of the stepper it qualifies and never beneath the value’s name.
A unit is a property of the amount, not of the thing: `currency` has one, and an `essence` amount is a bare number with no unit at all.

A RESULT amount is either a fixed positive integer or a ROLLED expression, and the row toggles between the two in place.
Authoring has no previewed actor, so the rolled form shows NO resolved value: a number there would be fiction.
The same expression control resolves against an actor wherever a real one is in scope, such as a player-side preview, and the presence of a resolved value is therefore a property of the surface rather than of the control.
The rolled form is the shared expression control: dice plus optional actor data paths.
The toggle selects which control occupies the quantity slot and MUST NOT be modelled as a third kind of quantity, so the amount keeps one meaning and one position in the row.

A row with a kind but no value MUST render the catalogue search IN PLACE OF the subject cell, and that search is the only element in the row permitted to stretch, because it is the one thing the row is waiting for.
The lead chip stays untinted until a value resolves, and the quantity and convert controls remain live so a GM can set an amount before choosing the thing.
When a value is picked the search is replaced by the subject cell at its fixed width, so the row stops moving once it is complete.

The control that converts a standalone row into a choice group and the control that adds an alternative to an existing group MUST open the SAME menu, with the same options in the same order, because both answer the same question: what kind is the next alternative.
That menu lists the offered kinds for the row’s context, each with its kind tint, and choosing one appends an EMPTY ROW OF THAT KIND rather than a blank the GM has to interpret.

#### Scenario: The same authoring surface is used for results

- **WHEN** the row is rendered in a result context
- **THEN** its kind select offers component, currency, activity and knowledge
- **AND** it offers neither tag nor essence

#### Scenario: A tag requirement matches on more than one tag

- **WHEN** a GM adds a second tag to a tag row
- **THEN** the row renders both as removable chips followed by the adder
- **AND** the any-of / all-of control appears, having been absent while one tag was held

#### Scenario: A GM adds a requirement before choosing what it is

- **WHEN** a new requirement row is added
- **THEN** the catalogue search occupies the subject cell and stretches
- **AND** the quantity control is usable before a value is chosen

#### Scenario: A requirement gains an alternative

- **WHEN** a GM uses a standalone row’s convert control
- **THEN** the row becomes the first member of a choice group
- **AND** neither that row nor any sibling member renders the convert control again

#### Scenario: A reader scans a list of mixed requirement kinds

- **WHEN** a step lists requirements of several kinds
- **THEN** each row leads with its kind-tinted chip
- **AND** a tag row is purple, distinguishing the one abstract kind from the concrete ones

### Requirement: Simple and alchemy carry a reserved failure set

`simple` and alchemy-simple do not route: one ingredient set, one success result set, and nothing to assign.
They MAY carry a second result set selected BY ROLE — the results a failed check awards — and it is optional in both directions: absent, or authored and left empty, a failed check produces nothing.

A role-selected set carries NO source list and cannot be assigned to anything, because a role is not a mapping; the surface says what produces it in words rather than offering a control that would imply otherwise.
It is also NOT RENAMEABLE: nothing refers to it by name, so a rename would change nothing, and offering the control would imply a reference that does not exist.
The surface marks which sets those are — rather than shipping a name field that silently does nothing — so a GM can tell a role-selected set from an authored one at a glance.

Validation counts only the non-failure set toward the exactly-one-success-set rule, so carrying a failure set never makes a simple recipe invalid.

An AUTHORED result set name MUST NOT be a reserved failure keyword, because the routed modes match an outcome against those words and a set borrowing one would be selected by the failure path rather than by its tier.
`progressive` has no reserved failure set at all.

#### Scenario: A GM allows results on a failed craft

- **WHEN** a simple or alchemy recipe is set to award results on failure
- **THEN** a second result set appears, marked as filled by role rather than by assignment
- **AND** it offers no source list and no rename, because nothing routes to it and nothing refers to it by name

### Requirement: Sets and groups are the container layer above the row

A SET is the parent container: an INGREDIENT SET holds what a craft consumes and a RESULT SET holds what it produces.

The vocabulary is stated because the model and the interface differ, and the difference has already produced drift.
`DOMAIN.md` names the parent on the ingredient side an **Ingredient Set** and the OR-alternative bundle inside it an **Ingredient Group**, so on that side `group` is the CHILD level.
The result-side parent carries the model identifier `ResultGroup`, which reuses `group` at the PARENT level and is the source of the confusion.
The interface therefore says **result set** for the parent, matching its ingredient-side twin, and reserves **choice group** for the OR-alternative bundle on either side.
User-facing strings already use both terms today; unifying them is recorded as a migration.
The persisted identifier is out of scope for this capability and does not change.
Both hold the SAME TWO ELEMENTS — picker rows and choice groups — and the authoring surface MUST render them as the same shape so the two sides of a recipe read as one model.
There is no separate result row: what differs between the two sets is the ROLE the set carries, which restricts the kinds a row may offer, and nothing else about the row changes.

A set MUST be renameable in the surface that shows it, because every other surface refers to a set by its name — a routing select, a validation message, a tier assignment.
A set addressable only by position is what makes reordering dangerous.

A CHOICE GROUP is this document's name for the OR-alternative bundle `DOMAIN.md` calls an Ingredient Group, widened because the same bundle is valid on the result side where "ingredient" would be wrong.
Where the two documents are read together, they name one thing.
A choice group is valid in BOTH containers and means something different in each, which the surface MUST make legible.
In an ingredient set it is the crafter deciding what to spend.
In a result set it is the player choosing which reward to take.
A design that treats choice as ingredient-only cannot express a recipe that offers a reward the player picks.

The ROUTED modes select exactly one result set per craft attempt, which is what makes the group and not the individual result row their unit of routing.
That is a property of those modes and not of the model: `progressive` awards EVERY result set whose difficulty threshold the roll meets or exceeds, which is the stated distinction between it and the routed modes.
A surface that assumes single selection everywhere renders progressive wrongly.

Under `routedByIngredients` the set the crafter satisfies names exactly one group, and several sets MAY name the same group.
A set MUST NOT name more than one group: the engine would have no basis to choose between them.
Under `routedByCheck` the check outcome tier names the group, several tiers MAY name the same group, and the check is required.
Failure-marked tiers are assignable only where the system policy permits it; otherwise a failed check produces nothing and the tier carries no assignment.

A result set is a CONTAINER in every mode, and the routed modes MUST NOT reduce it to a routing target.
Wherever a group appears it holds the rows and choice groups it produces AND states what routes into it, so a GM authoring what a tier awards does so in one place rather than assigning in one surface and editing in another.
Assignment is possible from EITHER end — the set or tier names its group, or the group takes a source — because a GM arrives at the relation from both directions.

The routing relation MUST be stated in BOTH directions.
The thing that routes names its group, and the GROUP names its sources: the ingredient sets that select it, or the outcome tiers that do.
Without the inbound direction a GM editing a group cannot tell what reaches it, and cannot tell that editing it changes what two sets or two tiers award.
Where several sources share a group, each source says the target is shared and how many sources hold it.
A group with NO inbound route states that in place, with the action that fixes it, rather than waiting for validation to report it.

The routing surface MUST surface two authoring hazards rather than leaving them to be discovered at play.
A value between two fixed tiers that no tier claims is a GAP: the roll matches nothing, the craft is rolled but unrouted, and it fails outright rather than degrading — so it is reported as blocking rather than as a warning.
A group that no set and no tier references is UNREACHABLE: authored, valid, and never producible.

The routing is authored in TWO surfaces, and neither is a copy of the other.

A ROUTING OVERVIEW lists every source with the set it produces, one row each, and belongs on the record’s overview: it answers what the recipe does in one screen and lets a GM re-point routing without opening a set, which is the common edit.
The SET CARD holds the set’s own contents and states what routes into it, which is where the rarer edit happens.
Both write the same field, and assignment therefore works from either end.

An overview row reserves a fixed trailing column for its shared-target marker, so the control naming the set sits at one position down the list and a marker on one row does not move the control on another.
Creating a set or a group is an adder beneath that list, and a newly created group is immediately selectable from every row above it.
Under `routedByCheck` the tier list belongs to the SYSTEM rather than to the recipe, so the surface states that the recipe assigns groups to those tiers and edits the tiers themselves elsewhere.

A mode change that would reduce the permitted cardinality MUST state what it will delete before the switch rather than reporting it afterwards.

#### Scenario: A recipe offers the player a choice of reward

- **WHEN** a GM authors alternatives inside a result set
- **THEN** the group renders the same choice group used on the ingredient side
- **AND** the player picks one of those alternatives when the craft resolves

#### Scenario: A GM opens a result set two tiers share

- **WHEN** a GM opens a result set that two outcome tiers route to
- **THEN** the group names both tiers as its sources
- **AND** each of those tiers states that its target is shared

#### Scenario: A result set has no inbound route

- **WHEN** a result set is named by no ingredient set and no outcome tier
- **THEN** the group states that it is unreachable, in place
- **AND** it offers the action that routes something to it

#### Scenario: Two outcome tiers award the same thing

- **WHEN** two check outcome tiers should produce the same reward
- **THEN** both tiers name the same result set
- **AND** the group is not duplicated to serve them

### Requirement: Every select renders the app’s own option list

A native `select` popup is drawn by the operating system, so it ignores the theme, differs between browsers and platforms, and can carry no tick, group heading, description, badge, or reason for being unavailable.
Every select in the product MUST therefore render the app’s own option list, using the floating-surface geometry, whether or not the options need any of those affordances.
Consistency across machines is the reason, so a surface MUST NOT opt back into the native popup merely because a list is short.

There is ONE exception, and it is structural rather than discretionary: a select inside a Foundry-owned dialog body.
`DialogV2` cleans its content and re-serialises it through `innerHTML`, so no mounted component and no attached listener survives, its callers read their value back through `form.elements`, and its `dialog` element has no application root to portal into.
A select there stays native, and the surrounding stylesheet gives the control a themed background, because `color-scheme` alone does not reach the popup.
A component that ships native for a stated reason of its own outranks this requirement under the precedence order above, and two do so today.

The selected tick is CONFIGURABLE and is a property of the list rather than of an option: it earns its column where options are close cousins and a reader must confirm which is live, and is dropped where the trigger already states the value.

#### Scenario: A select offers three plain options

- **WHEN** a surface needs a one-of-N choice with no descriptions or badges
- **THEN** it still renders the app’s option list rather than a native popup

### Requirement: Art that is an identity is picked as a picture

Where art IS the identity of a record — a component, an essence, a recipe — the control MUST render the picture itself at a size worth looking at and MUST NOT render the stored path.
The filled state MUST carry an explicit edit affordance — a pencil — because a picture with nothing on it does not read as a control, and the empty slot is legible as actionable while the filled one is not.
Empty is a dashed square that reads as a slot; filled is the art carrying an edit affordance revealed on hover and on focus.
The path-bearing variant exists only where the record’s identity is something else and the art is an attribute of it.

### Requirement: A table is used only where columns are compared

A headed, paged table is the right shape only where a reader compares the same field DOWN a column, such as a date, an amount or a name.
A record carrying art, a status and actions is a list row, and forcing it into columns costs those affordances and buys nothing; the test is whether the columns would be worth sorting.

A table states its record count in its heading rather than leaving it to be inferred from the pager, and scrolls horizontally inside its own container so the page never does.
It closes with the standard pagination bar WHEN the record count can exceed a page; a table whose rows are bounded and few — an outcome-tier table, a craft’s inputs and outputs — carries no pager, and adding one to reach a uniform shape would be furniture.
A column header MUST NOT appear sortable unless sorting it is meaningful.
An empty table keeps its heading and count, drops the header row, and says what would put a row in it.

### Requirement: Validation is one screen everywhere

Every editor’s validation surface MUST use one arrangement: a verdict stating in the product’s own words what the blocking issues prevent, then the pass, warning and blocking counts in that order, then the issues grouped by the part of the record they belong to, in the order the editor’s own tabs run.
It is a full-width screen with no inspector rail, because the issues are the content.
The manager's shell selects full width per VIEW rather than per tab, so an editor whose validation is a tab either becomes a full-width view or states why it keeps its third column; two shipped editors repurpose that column rather than reserving it for an inspector.
A passing group still renders, so a GM sees what was checked rather than inferring it from silence, and blocking issues sort above warnings inside a group.
Each issue offers an action that moves focus to the offending control.

The arrangement is fixed because validation is where a GM goes when something is wrong, which is the worst moment to make them learn a second layout.

#### Scenario: A GM opens validation on a different editor

- **WHEN** a GM opens the validation surface of an editor they have not used before
- **THEN** the verdict, counts and grouped issues appear in the same arrangement as every other editor

### Requirement: A player chooses the item, not just the requirement

Where a requirement names a CLASS rather than a record — a tag requirement — the player still chooses which held item satisfies it, so every held item carrying the tag renders as a candidate.
A candidate whose count falls short renders dimmed rather than hidden, because knowing what almost works is what tells a player what to go and find.

An essence requirement has no single source: several components each contribute, so the surface states the TOTAL against the requirement and shows which items make it up and by how much.
An overshoot is stated rather than hidden, because spending more of an essence than the requirement asks is a real cost the player is choosing.

A held-versus-needed count renders on a SOLID ground rather than a soft wash: it is read at a glance against artwork of unknown colour, and a translucent fill cannot be relied on to stay legible over it.

#### Scenario: Several held items carry the required tag

- **WHEN** a player resolves a tag requirement and holds four items carrying it
- **THEN** all four render as candidates
- **AND** the ones that cannot meet the count are dimmed rather than omitted

### Requirement: A multi-step flow inside the manager uses the shared modal

A flow that must finish before anything else continues, and that carries its own state across more than one step, renders in the manager’s shared modal chrome rather than in a bespoke overlay.
The import flow — mapping folders, then reading the reference report — is the shipped case.

This is distinct from a one-shot confirmation, which stays `confirmDialog`, and from a Foundry-owned dialog, whose body is a cleaned HTML string rather than a mounted component.

The modal portals into the application root so it stacks above the window rather than beneath it, and its close control takes an accessible name as a REQUIRED prop, because it renders as an icon alone.
It dismisses on an outside click; a step that would lose work confirms first.

#### Scenario: An import needs two steps

- **WHEN** a flow spans more than one step and must complete before the manager continues
- **THEN** it renders in the shared modal chrome
- **AND** its close control carries an accessible name

### Requirement: One blocking notice, and non-blocking notices stack

A page MUST show at most one BLOCKING notice at a time, and a second blocking notice replaces the first.
Non-blocking notices MUST stack in a region beneath it, because a save can produce independent simultaneous outcomes — an unsaved-changes warning and a validation failure are both true at once, and a rule that forbids stacking cannot render them.
A notice that appears without a focus change MUST be announced through a live region.

Grouped, navigable validation output is NOT a notice: it is the validation surface, which carries passing, warning and blocking counts simultaneously and drives the count on its own tab.

#### Scenario: Two independent problems are true at once

- **WHEN** a page has both a blocking validation failure and a non-blocking unsaved-changes state
- **THEN** the blocking notice owns the position beneath the page header
- **AND** the non-blocking notice renders in the stacking region rather than replacing it

### Requirement: Screens are composed from published recipes

Every product screen MUST be one of four archetypes — browse, editor, player, and validation — and its element order is fixed so that two screens of the same archetype are navigable in the same way.
A settings screen is an EDITOR without a breadcrumb or a back-and-save pair, because it edits a scope rather than a record; that is the one permitted departure from the editor order.

A BROWSE screen orders the app title bar, the navigation sidebar, a page header carrying at most one primary action, the filter bar, the list, and the pagination bar.
A blocking notice, when present, sits between the page header and the filter bar.
The selection bar replaces the filter bar in place when anything is selected.
The pagination bar sits OUTSIDE the scroll area so it never moves, and it never hides its disabled arrows.

An EDITOR screen orders the breadcrumb, the title block with its lede, the action pair with back before save, the tab bar, and then the body.
An inspector rail is OPTIONAL and several shipped editors have none; where one is present it is the third track, and where an editor repurposes that track for something else it says so.
A blocking notice is the only element permitted between the tab bar and the first card.
An info strip precedes the cards it describes and is never nested inside them.
The inspector rail is READ-ONLY by convention: it shows consequences and links out, and never hosts editing controls.

A PLAYER screen orders the app rail, a browse column carrying search and filters, and a detail pane that leads with identity and a single primary action, then progress, then requirements.
The player window carries NO premium signal in any state, and a player-side chooser is a read-only mirror of the GM's authored group.

#### Scenario: A new GM browse surface is built

- **WHEN** a new surface lists records a GM can filter and open
- **THEN** it follows the browse recipe's element order
- **AND** its row state renders as a status button rather than a toggle

### Requirement: The set is extended by an explicit, recorded decision

A new shared primitive enters the set only through a change that records its ENTRY, and an entry is two artifacts rather than one: a SPECIMEN in `openspec/specs/design-system/library.html` and, once the primitive ships, a ROW in `scripts/lib/designSystemPrimitives.json`.
The specimen MUST state the primitive's purpose, its canonical geometry in published ladder values, and its Svelte API including the event contract and the accessible naming it requires.
The row MUST name the implementation path and the library entry it corresponds to, and MUST record the caller count that justified the primitive.
The split is deliberate rather than filing: purpose, geometry and API are what a reader needs rendered, and the path-to-name correspondence is what a gate needs to check.
That obligation binds a primitive the change ADDS or ALTERS.
An entry carried unchanged from an existing component may state its geometry alone and take the shipped props as its API by reference; the library records which entries currently do so, and closing that list is tracked as a debt rather than presented as complete.

A change that adds a component under `src/ui/svelte/components/` without a specimen has added an undocumented primitive; a change that ships a primitive without its manifest row has added a name no diff can be attributed to; and a change that adds a row naming a library entry that does not exist has recorded a correspondence to nothing.
`tests/design-system-coverage.test.js` is the gate that fails on all three: it requires every file under `src/ui/svelte/components/` to carry a manifest row, requires no entry recorded as unbuilt to ship as a component, and requires every row's library name to resolve to a specimen that is not a declined candidate.
Where a proposal conflicts with a shipped component, the change MUST either adopt the shipped behaviour or state why it is being replaced.

#### Scenario: An implementer needs a primitive the set does not contain

- **WHEN** planned work needs a shared component the set does not contain
- **THEN** the change adds its specimen to the visual library and, once the primitive ships, its row to the manifest
- **AND** the entry names the two or more independent callers that justify it

### Requirement: The ruled-out register is part of the specification

Candidates reviewed and declined MUST be recorded with the reasoning that declined them, so that the absence of a primitive is legible as a decision.

The following are recorded as compositions and MUST NOT be reintroduced as components: a member row, which is a list row with a leading slot; an actor picker, which is a trigger plus the search popover; an add button, whose dashed treatment is a role on the button primitive; a rail card, which is a well, a kicker and a button; a feature card, which is option cards rendered non-interactive; a bounds input, which is two steppers; and a currency input, which is a stepper and a select.

A premium panel is recorded as out of scope rather than as a composition: its only original content is marketing copy, which is a product decision, and binding copy to a component makes the offer untranslatable against a codebase where every primitive takes pre-localized strings.
A toast and a bespoke destructive-confirmation panel are recorded as surfaces Foundry already owns.

#### Scenario: A ruled-out candidate is re-proposed

- **WHEN** a proposal names a candidate the register already declined
- **THEN** the proposal must address the recorded reasoning
- **AND** absent new evidence, the composition in the register is used instead
