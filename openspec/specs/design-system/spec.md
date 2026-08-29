# Design System

## Purpose

This capability is the canonical, normative record of Fabricate's shared UI design system: the token foundations every product surface draws from, the set of shared primitives that set is allowed to contain, the rules that route a new case to an existing primitive, and the recipes that compose those primitives into the app's screen archetypes.
It exists because a design system that lives only in prototypes drifts: the audit that produced this capability found 99 distinct button signatures, 79 icon-chip signatures, 75 field signatures, 70 card signatures and 55 kicker variants across the surfaces it swept.
`ui-integration` states the requirement that a repeated thing MUST be one shared primitive; this capability states what that set IS.

The human-readable visual library that renders every primitive in this capability at its canonical geometry lives at `openspec/specs/design-system/library.html`.
It is the same normative content with specimens attached, and it is the artifact to open when a written geometry needs to be seen rather than read.

### Corpus and authority

The design system's corpus is **this repository only** — the GM manager and the player app under `src/ui/`, and the Core prototypes that feed them.
The Economy module and the premium Downtime companion are separate products and are explicitly OUT of corpus, because a signature count weighted by a codebase this repository does not govern cannot justify a primitive in it.
A prototype whose implementation brief names a module other than Core is out of corpus, and a count derived from it MUST be re-derived before it is cited.

Precedence is fixed, highest first: `openspec/specs/` and `DOMAIN.md`; a shipped component's own props and its stated reasons; a CI gate that already fails on the alternative; then this capability.
Where a primitive already ships, its props ARE the specification and a proposal that drops one MUST state why in the same change, or it is an omission rather than a decision.

## Requirements

### Requirement: The primitive set is a closed, versioned vocabulary

The shared primitive set MUST be the set enumerated in this capability, and a surface MUST reach for a member of it before writing a new component.
Adding a prop to the primitive that already owns a meaning takes precedence over introducing a second component that owns half of it.

A candidate that decomposes entirely into existing members is a COMPOSITION and MUST NOT enter the set; it is recorded with the composition that replaces it so it is not re-proposed.
A candidate MUST have two or more independent callers to enter the set, and a single-caller candidate is recorded as ruled out with its caller named, so the absence is a decision rather than an oversight.

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

Elevation is for surfaces that float OVER content and MUST come from `--fab-shadow-sm`, `--fab-shadow-md` or `--fab-shadow-lg`.
A card that merely sits on the page uses a border and no shadow.

#### Scenario: A primitive needs a colour the token set does not name

- **WHEN** a primitive needs a colour no `--fab-*` token provides
- **THEN** the change mints a token in every theme block rather than writing a literal at the call site

### Requirement: Geometry comes from the published ladders

Control height MUST be one of 26, 28, 30, 34, 38, or 44 for a control a spec marks touch-reachable.
The values 32, 36 and 40 are RETIRED and MUST NOT be reintroduced.
Radius tracks the size of the thing: 6 for chips at or below 24px, 7 for controls of 26 to 32px, 9 for controls of 34 to 38px and for rows and wells, 11 for cards and panels, and 999 for pills and tracks.
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

Every pointer target MUST offer at least a 24 by 24 pixel hit area, per WCAG 2.2 section 2.5.8.
The hit area MAY exceed the painted area, so a 2px divider still carries a 24px handle and a chromeless remove action is 24px around a 9px glyph.
A control that cannot meet the minimum in a dense row MUST offer a comfortable density its caller can select.

#### Scenario: A primitive renders an icon-only control

- **WHEN** a primitive renders a control whose only visible content is a glyph
- **THEN** its accessible name is a required prop
- **AND** its hit area is at least 24 by 24 pixels

### Requirement: The Foundry contract binds every primitive

Every primitive renders inside a Foundry ApplicationV2 window, inside Foundry's own CSS and event handling, and MUST satisfy the following.

Breakpoints MUST be `@container` queries and never viewport media queries, because an ApplicationV2 window resizes independently of the viewport.
A container query adds no specificity, so the narrow case is declared after the wide one.
A layout that reserves fixed rail widths MUST also declare a container minimum, because `ApplicationV2#_updatePosition` clamps only to a computed `min-width` that defaults to zero and a `minmax(0, 1fr)` centre column can otherwise collapse.

A focusable element that is not a form control, contentEditable, or a button with a form MUST carry the keyboard-focus opt-out attribute when it handles arrow, Page or Home and End keys, or the keypress ALSO reaches Foundry's bindings and pans or zooms the canvas.
A listbox MUST keep DOM focus in its search input and drive selection with `aria-activedescendant`; roving focus onto option buttons re-arms those bindings and is forbidden.

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

A native `select` renders its option popup through the operating system, where the only styling available is `color-scheme: dark`.
Whenever the options need a selected tick, a group heading, a per-option description, a badge, or a reason for being unavailable, the control MUST render its own option list using the floating-surface geometry instead of a native popup.

#### Scenario: A primitive handles arrow keys on a non-input element

- **WHEN** a focusable element that is not a form control handles arrow, Page, or Home and End keys
- **THEN** it carries the keyboard-focus opt-out attribute
- **AND** the keypress does not also reach Foundry's canvas bindings

### Requirement: Near-neighbour primitives are routed by a stated rule

Where two primitives are visually similar, the choice between them MUST follow the rule stated here rather than being made by eye.

A record's state IN A LIST is a status button, which is legible across a page of rows and can express incomplete and blocked.
The same record's state IN ITS OWN EDITOR is a toggle in a settings row.
The distinction is the surface, not the subject — a recipe is a record in both places.

A choice between two to four named things is a segmented control, or option cards when each choice needs a sentence.
Independent criteria that narrow a list are filter toggles, because any combination is valid.

A record count on a navigation item is a bare mono numeral with no fill and no border.
An issue summary is a filled warning badge carrying the count.
Unsaved edits are a chip beside the title and a 6px dot on the parent navigation item.
These four marks are the Rail Marker Family in `DOMAIN.md` and MUST NOT be substituted for one another.

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

Every product screen MUST be one of three archetypes, and its element order is fixed so that two screens of the same archetype are navigable in the same way.

A BROWSE screen orders the app title bar, the navigation sidebar, a page header carrying at most one primary action, the filter bar, the list, and the pagination bar.
A blocking notice, when present, sits between the page header and the filter bar.
The selection bar replaces the filter bar in place when anything is selected.
The pagination bar sits OUTSIDE the scroll area so it never moves, and it never hides its disabled arrows.

An EDITOR screen orders the breadcrumb, the title block with its lede, the action pair with back before save, the tab bar, and then the body beside the inspector rail.
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

A new shared primitive enters the set only through a change that adds its entry to this capability and its specimen to `openspec/specs/design-system/library.html` in the same change.
The entry MUST state the primitive's purpose, its canonical geometry in published ladder values, its Svelte API including the event contract and the accessible naming it requires, and the caller count that justified it.

A change that adds a component under `src/ui/svelte/components/` without a corresponding entry here has added an undocumented primitive, and a change that adds an entry here without the specimen has added a geometry nobody can see.
Where a proposal conflicts with a shipped component, the change MUST either adopt the shipped behaviour or state why it is being replaced.

#### Scenario: An implementer needs a primitive the set does not contain

- **WHEN** planned work needs a shared component the set does not contain
- **THEN** the change adds its entry to this capability and its specimen to the visual library
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
