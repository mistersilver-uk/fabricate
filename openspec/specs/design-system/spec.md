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
An independent caller is any other file under `src/` that imports the component by path, which is the reading a gate can decide and the one `scripts/lib/componentImporters.js` implements.
A candidate with fewer is recorded as ruled out WITH ITS CALLERS NAMED — or with the fact that it has none — so the absence is a decision rather than an oversight, and so a later reader can re-test the count rather than re-derive it.
That bar is measured over EVERY `.svelte` under `src/ui/svelte/` and not only over `src/ui/svelte/components/`, because nothing in this requirement turns on which directory a candidate sits in and a component under `apps/` can acquire twenty callers without anyone asking whether it belongs in the vocabulary — one has.
`tests/design-system-primitives.test.js` holds a register of every path outside `components/` that clears the bar and carries no manifest row, and a path leaves that register only by GAINING a row in one of the two manifest tables, so a component crossing the bar is a decision somebody has to record rather than a threshold nothing watches.

Those recorded callers MUST be a structured field on the row rather than a sentence, and `tests/design-system-primitives.test.js` MUST assert the field EQUALS what the import graph measures.
"Re-test the count" is what the clause above asks for and what nothing did: the register's caller claims were prose for as long as it existed, and prose is not resolved by anything.
Measured when the field was introduced, two rows had reached the bar without moving — one of them saying so in its own text for two issues — a third named a real file that does not import it, and a fourth named a file that has never existed in the repository.
Every gate passed on all four.
So the count is asserted against the tree, the named callers are asserted to be the measured ones, a non-member that has reached two callers fails as a promotion it is owed, and a member that has fallen below two fails as a row that has stopped being true.
The prose beside the field MUST NOT state a caller count the field contradicts, and MUST name every caller the field records, because a correct field beside a stale sentence misleads exactly as far as the stale sentence reaches.

Members carry no such field, and the asymmetry is this requirement's: it obliges a candidate BELOW the bar to name its callers and obliges a member to nothing of the kind.
A member is held to the bar itself, measured the same way.
An exact caller list on a primitive with dozens of importers would make an unrelated new usage a manifest edit, and a register that must be edited to add a chip is a register that gets routed around.

#### Scenario: A recorded non-member acquires a second caller

- **WHEN** a component recorded as ruled out is imported by a second file under `src/`
- **THEN** the caller-count gate fails against the recorded row
- **AND** the row moves into the set with its own library adjudication, its own evidence derivation, and the manifest's table sizes recomputed

#### Scenario: A new surface needs a control the set already contains

- **WHEN** a surface needs a control whose meaning a set member already owns
- **THEN** the surface imports that member
- **AND** any behaviour it lacks is added as a prop on that member rather than as a second component

#### Scenario: A candidate decomposes into existing members

- **WHEN** a proposed primitive can be built from members already in the set with no new behaviour
- **THEN** it is recorded in the ruled-out register with the composition that replaces it
- **AND** it does not enter the set

### Requirement: A shared primitive's class family is rooted at the primitive, not at an app

A primitive is shared by being importable, and it is USABLE only where the rules that paint it match.
A class family gated on an application root therefore yields a primitive that renders correctly on one screen and entirely unstyled on every other, and a portalled panel reaches for a host that does not exist outside that root at all.
So no rule on a class a shared primitive WRITES may be rooted at an application root, and a family that still is is NOT adoptable outside that root until it is re-rooted.
This is the same defect the area-scoped property rule below describes, arriving through a selector rather than through a custom property, and it fails the same way: silently, on the caller, with the owning screen still correct.

The root cannot simply be DELETED, and that is the part a reader will otherwise get wrong.
`styles/fabricate.css` is loaded page-wide into the Foundry document, so every selector in it must begin with `.fabricate` or it bleeds into other modules' sheets.
The replacement is therefore a `.fabricate-*` root that the PRIMITIVE ITSELF emits — one class on its own root element, and a second on any panel it portals out of that element, because a portalled node keeps its classes and loses its ancestors.
Choosing an existing app root, or a second ancestor picked for reach, is the same defect under a new name and MUST NOT be used.

Re-rooting this way is specificity-neutral by construction: one class replaces one class at the same position in the sheet, so nothing in the owning screen's cascade moves.
A rule whose ancestor chain names a CALLER's own container is exempt and stays where it is, because it can only ever match inside that caller's app and is reachable there whatever the primitive does.

How many namespace roots a primitive needs is a property of its PORTAL SHAPE rather than a count to copy.
A component that portals a panel out of its own root needs one class on each, because those two nodes end up in different subtrees; a component that portals nothing, or whose root element IS the panel it portals, needs one.
Where two components render one class family between them, the family's roots are the union of theirs, and a class both of them paint is written at both roots.

Every shared picker satisfies this requirement: `SearchablePopover` emits `fabricate-picker` and `fabricate-picker-popover`, `IconPicker` emits `fabricate-icon-picker` and `fabricate-icon-picker-popover`, `EssenceSourceSelector` emits `fabricate-source-picker` and `fabricate-source-picker-popover`, and `ManagerColorPicker` and `ManagerColorPopover` emit `fabricate-color-picker` and `fabricate-color-picker-popover` between them.
`tests/components/searchable-popover-area-scope.test.js` derives each class set from the components' own markup and fails when a rule a primitive owns is rooted at an application, is rooted at nothing, or names a root the component has stopped writing.

A re-rooted family is a CAPABILITY until a caller outside the original application uses it, and a capability nothing exercises is a claim rather than a fact.
`SearchablePopover` has such a caller: the player window's `ActorSelectTopBar` renders its actor picker through the primitive, which makes the player window the second application the family paints in and this requirement satisfied by a shipped surface rather than by a fixture.
The picker is therefore held to the geometry as well as the markup — its panel is portalled onto the player window's application frame and MUST land at its trigger there — because the rendered DOM is identical whether the portal lands or not, so no DOM assertion can tell a placed panel from a misplaced one.

The corollary is that a component OUTSIDE the shared directory may keep an area-scoped family, and doing so is correct rather than debt.
Its markup cannot appear outside that area, so the ancestor is free, and unscoping it would spend specificity and widen the rule's blast radius for no reachable benefit.
`RecipeDurationEditor`, `EnvironmentsBrowserView` and the manager modal keep `.fabricate-manager`-rooted overlay rules on exactly that basis.

The rule governs SELECTOR ROOTING and does not reach a bare-element baseline an area declares for itself.
A shared primitive nonetheless MUST NOT depend on one, for the same reason it must not read an area-scoped property: `.fabricate-manager input:not([type])` themes every free-text control in the manager, and a primitive relying on it renders Foundry's default chrome everywhere else.
Such a primitive declares that chrome on its own rule instead.

#### Scenario: A primitive is adopted by a second application

- **WHEN** a surface outside a primitive's original app imports that primitive
- **THEN** the primitive paints there without the caller restating its rules
- **AND** every rule it owns is rooted at a namespace class the primitive emits
- **AND** a panel it portals is measured landing at its trigger inside that application

#### Scenario: A component that cannot leave its area keeps that area's root

- **WHEN** a component lives under an application's own directory and its markup can only render inside that application
- **THEN** its class family stays rooted at that application root
- **AND** the family is not re-rooted at a namespace class, because nothing outside that root can reach the markup

#### Scenario: A family is still rooted at one app

- **WHEN** a caller outside that root proposes to adopt the primitive
- **THEN** the family is re-rooted first, in its own change
- **AND** the adoption is not landed on top of a family that only paints on one screen

### Requirement: A component's own declaration outranks the module sheet, whatever the specificity

`module.json` registers `styles/fabricate.css` with no explicit `layer`, and Foundry imports an unlayered module stylesheet at `layer(modules)`.
A Svelte component's scoped block is injected as an ordinary UNLAYERED `<style>` at runtime.
An unlayered declaration beats a layered one whatever the specificity, so for any property a component declares in its own scoped block, no rule in `styles/fabricate.css` can override it — not at (0,4,0) against the component's (0,2,0), and not at any specificity that can be written.

The failure is SILENT and no gate reports it.
The selector is emitted, it matches the element, and the declaration is simply never used; Stylelint does not read `.svelte`, Svelte's unused-selector analysis never sees the other file, and a browser measurement that loads both sheets flat reports the global rule winning because in that page it does.
So a change verified only in a harness can pass and do nothing in the product.

The consequence for the primitive set is a rule about WHERE, not about specificity.
A property a shared primitive declares for itself is overridden by EXTENDING that primitive — a prop with a default that preserves the shipped rendering, so its existing callers are byte-identical — and never by a route-scoped or app-scoped rule in the module sheet.
That is the same `reuse, then extend, then add` order this capability already states, reached from the cascade instead of from the vocabulary.
A property the primitive does NOT declare is unaffected and the module sheet remains its home: a host's row metrics, its layout context and its surface are layered against nothing.
Markup is not a cascade question at all, so an element the primitive renders unconditionally can only be removed by a prop.

Two corollaries a reader will otherwise get wrong.
Svelte emits some scope hashes as `:where(.svelte-<hash>)`, which contributes ZERO specificity, so a compound that looks like it gained a class may not have; and changing whether a selector's compounds sit inside `:global()` changes which form Svelte emits, which moves specificity silently while looking like a repair.
Neither is answerable by reading the source, so the method that settles both is to compile the component with `css: 'external'` and read the emitted selector.

#### Scenario: A screen wants one property of a shared primitive to differ

- **WHEN** a surface needs a primitive to drop a border, a margin or a glyph the primitive declares for itself
- **THEN** the primitive takes a prop whose default is the shipped rendering
- **AND** no rule targeting that primitive's own classes is added to `styles/fabricate.css`

#### Scenario: A cascade question is settled

- **WHEN** two rules for one property are believed to be in a specificity relationship
- **THEN** the component is compiled with `css: 'external'` and the emitted selector is read
- **AND** the layer each rule sits in is established before its specificity is compared

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
`tests/components/design-system-debt-ratchets.test.js` reads every `box-shadow` in the global sheet and in every Svelte scoped block and pins the ones that are none of those three, allowing only `none` and an inset ring — a border drawn as a shadow, which has no offset and no blur and so claims no height at all.

#### Scenario: A primitive needs a colour the token set does not name

- **WHEN** a primitive needs a colour no `--fab-*` token provides
- **THEN** the change mints a token in every theme block rather than writing a literal at the call site

### Requirement: The token namespace is one generation and names its purpose

The `--fab-*` namespace holds more than one kind of custom property, and a rule that does not say which kind it binds legislates over an undefined subject.
Three matter here: THEME FOUNDATIONS, declared in every theme block and re-themed on a swap; CALLER-SET PARAMETERS, given a default in the stylesheet and set per instance from markup or script; and AREA-SCOPED PROPERTIES, declared on one or more selectors under a single area's root and undefined outside it.
The generation rule below binds token NAMES across the whole namespace; the area-scoping rule binds the third kind.

A token name MUST NOT carry a version or generation marker.
`--fab-v2-*`, `--fab-mv2-*` and `--fab-editor-*` are retired and MUST NOT be reintroduced, and no name of the shape `--fab-v<N>-` or `--fab-mv<N>-` may be minted.
This bars a marker from a PROPERTY name and decides nothing about the shared primitive vocabulary, whose membership and closure `The primitive set is a closed, versioned vocabulary` governs — nothing in that requirement turns on a token name, and nothing here turns on what the set contains.
`tests/token-generation-gate.test.js` scans the raw text of every `.css`, `.svelte` and `.js` file under `src/` and `styles/` for those three shapes, so a declaration, a read and a bare mention in a comment all fail alike.

Area scoping is spelled out rather than numbered.
An AREA-SCOPED property is one declared only under the root of a single area, and it MUST NOT be declared or read outside that area, because a shared primitive that reads one renders correctly inside the area and unstyled everywhere else — an out-of-scope custom property makes the declaration invalid at computed-value time rather than failing.
Every compound of a rule's selector list is judged separately, since the cascade applies a comma-joined rule to each of them.
`--fab-manager-` is the prefix a NEW area-scoped property under `.fabricate-manager` takes, and carrying the prefix is SUFFICIENT to be governed by this rule but NOT necessary: a set of properties declared exclusively under `.fabricate-manager` selectors predates the convention, carries no prefix, and is bound by the rule all the same — `--fab-recipe-cluster-cols` and `--fab-env-comp-grid` are the same species as the five that do carry it.
The GATED SET is computed from DECLARATION SITES rather than read off the prefix: a `--fab-*` property every one of whose declarations sits inside the area is area-scoped, whatever it is called.
A prefix gate would police a fifth of its own population — measured, five of the twenty-four area-scoped properties carry the prefix — and the nineteen that predate the convention would be bound by this requirement and by nothing else.
Carrying the prefix therefore remains a CLAIM the measurement must agree with: a `--fab-manager-*` property with a declaration outside the area fails `tests/token-generation-gate.test.js`, because such a property has silently dropped out of the computed set and is now gated by nothing.
A Svelte scoped `<style>` MUST NOT reach an area-scoped property at all: a component is placed in a directory, not in a DOM subtree, so its own CSS cannot guarantee where its host renders.
Nor may a `.js` module or a `.svelte` template spell one into a string, which is the channel a CSS-only scan cannot see and the one that has actually occurred; `tests/token-generation-gate.test.js` reads the global sheet and every scoped `<style>` as CSS, and matches a `var()` read or a `name:` declaration in `src/**` `.js` and `.svelte` text.

The forwarding-alias rule below is scoped to COLOUR, and that is narrower than a namespace-wide ban on the single-declaration alias shape.
A colour alias is different in kind because the value it forwards is the one thing a theme swap must be able to change.
No gate decides the colour case on its own; what a gate can decide is that the retired names do not return, which is what `tests/token-generation-gate.test.js` holds.

#### Scenario: A surface wants its own colour vocabulary

- **WHEN** a surface wants to name a colour it already gets from a foundation token
- **THEN** the surface reads the foundation token directly
- **AND** no forwarding alias is minted, because an alias declared once forwards a value without re-theming it and hides the token from every surface outside its selector

### Requirement: Geometry comes from the published ladders

Control height MUST be one of 26, 28, 30, 34, 38, or 44 for a control a spec marks touch-reachable.
The values 32, 36 and 40 are RETIRED as CONTROL heights and MUST NOT be reintroduced as such.
Art and portraits carry their own size ladder and are not controls; the avatar sizes below are not governed by this one.
Radius tracks the size of the thing: 6 for chips at or below 24px, 7 for controls of 26 to 32px, 9 for controls of 34 to 38px and for rows and wells, 11 for a 44px control and for cards and panels, and 999 for pills and tracks.
A fully rounded radius is for a shape whose contents are text alone.
A pill that CONTAINS a square element — an icon chip, a thumbnail — takes the control radius for its height instead, and any button inside it squares off to match, because a circle wrapped around a square reads as two competing shapes.

`tests/components/design-system-debt-ratchets.test.js` holds the RADIUS ladder over both stylesheet corpora, resolving a `var()` token to its definitions first so that moving a banned value into a custom property does not pay the debt down.
`tests/components/control-height-ladder.test.js` holds the control-height ladder the same way.

Padding, margin and gap MUST derive from the spacing scale in `ui-integration`, whose documented literal exemptions are 1px hairlines and one-off fixed dimensions in the 34 to 42px range.
`tests/components/spacing-scale-ratchet.test.js` is what holds that rule, over the same two corpora and with the published scale held opaque, since deriving FROM the scale is what the rule asks for.
Radius, width, height, border widths, font sizes, grid track sizes and breakpoints are NOT spacing-scale members and MUST NOT be derived from `--fab-space-*`.
They are written as literals by default, and a token is minted for one of them only where the value is SHARED across surfaces or DERIVED from another, in which case the token's declaration MUST record which it is.
Two shipped pairs illustrate the two kinds, as examples rather than as a closed list a further token would have to join: `--fab-icon-picker-chip`/`--fab-icon-picker-row`, whose row height is computed from the chip, and `--fab-books-control-radius`/`--fab-books-panel-radius`, which carry two radii off the ladder for the elements they paint, shared by the Books & Scrolls tab and the item-page inspector so that correcting them onto the ladder stays a one-line edit.
A token of this kind is a local convenience and never a ladder: naming one for a control class rather than for its surface asserts a rung, and 5px is not one.

Type follows the ladder in `ui-integration`: the serif face names things, the mono face carries every number a GM compares or tunes, and the interface face stays host-owned and untokenized.
The mono face ships weights 400 and 500 ONLY, so a mono step MUST NOT specify 600 or 700 — those synthesize as faux-bold.
Emphasis in mono comes from size and ink.
`tests/components/design-system-debt-ratchets.test.js` holds both halves of the weight rule: that no `font-weight` anywhere leaves the 400/500/600/700 ramp, and that no rule setting `var(--fab-font-mono)` asks for a weight above 500.
It joins a rule to a same-selector twin elsewhere in the same file, because the corpus repeatedly sets the family in a base rule and the weight in a `@media`-nested copy, and a rule-local reading would exempt every one of those.

#### Scenario: A geometry falls between two rungs

- **WHEN** a proposed control height, radius or spacing value is not on a published ladder
- **THEN** it snaps to the nearest rung
- **AND** a value that genuinely cannot snap mints a scale member rather than shipping a literal

### Requirement: Every interactive primitive declares its full state set

An interactive primitive MUST declare rest, hover, focus-visible and disabled, and MUST declare readonly, invalid, loading and empty wherever they apply.
Any surface rendered from an asynchronous store — a browse list, a table, a rail section — declares LOADING and ERROR, because a store-fed surface reaches both states in ordinary use and a component that renders neither shows an empty list for a failure.
Focus MUST be expressed as `:focus-visible` and never `:focus`, so a pointer activation does not ring.
`tests/components/design-system-debt-ratchets.test.js` holds that rule across both stylesheet corpora, judging each compound of a selector list separately.
Its one exemption is SUPPRESSING Foundry core's own focus ring, which the global sheet does for six application roots, and it is recognised by the SHAPE of those blocks — one root class crossed with a published list of element targets — rather than by naming lines, so appending a seventh selector to an exempt block breaks the shape instead of inheriting the exemption.
Readonly is DISTINCT from disabled: a readonly control takes focus and refuses edit, while a disabled control does not take focus.

A loading control MUST set `aria-busy` and change its label or text.
A spinner alone is insufficient because Foundry's bundled Font Awesome disables `fa-spin` under `prefers-reduced-motion` and every shipped spinner is `aria-hidden`, so a motion-only busy state is conveyed to a reduced-motion user by nothing at all.

Motion is limited to a 140ms ease on a control state change, and nothing else animates.
Under `prefers-reduced-motion: reduce` every transition and animation is removed, and any state that animated MUST remain readable when it does not.
NOTHING GATES THE 140ms FIGURE AND NOTHING SHIPS IT: measured across both stylesheet corpora, the durations written are 120ms seventeen times, 150ms nine times, and four others, and 140ms appears nowhere at all.
So this sentence names a rung the product has never used, which makes it a decision owed rather than a rule enforced — either the ladder becomes 120/150 and a gate holds it, or the corpus moves onto 140 — and it is recorded here as unenforced so that the next reader does not mistake the silence for compliance.

A SELECTED face is a FILL and an EDGE.
A leading inset bar is a single-select affordance and MUST NOT be drawn on a list that admits more than one answer, because several rows carry the selected state at once and a bar on each of them claims a singularity the list does not have.
So a selected row takes `--fab-surface-active` behind `--fab-accent-border`, and the `--fab-accent-soft` fill under a 3px inset accent bar belongs to a radio card group, whose one answer the bar is naming.
Joining a multi-select row to a radio card's selected treatment is the shape this rule exists to prevent, and it is cheap to reach because the two rows are otherwise near-identical.

#### Scenario: A multi-select list marks the rows a GM has chosen

- **WHEN** a list lets more than one row be selected at once
- **THEN** each selected row takes a tinted fill and an accent border
- **AND** it draws no leading inset bar, whatever a single-select list beside it draws

#### Scenario: A control enters a pending state

- **WHEN** a control begins an operation that takes perceptible time
- **THEN** it sets `aria-busy` and changes its label
- **AND** any spinner it renders is decorative and `aria-hidden`

### Requirement: Naming, announcement and hit targets are component obligations

A control whose visible text is a glyph or a bare number MUST take its accessible name as a REQUIRED prop rather than an optional one.
A name composed from a value MUST be derived by a shared helper, because the alternative drifted across 23 call sites before `src/ui/svelte/components/stepperLabels.js` existed.

A name-bearing prop MUST NOT default to untranslated text, because a default written into a `$props()` destructuring never reaches `game.i18n` and no world can change it; a localization KEY default is the shape that can.
An `aria-label` bound to a prop that may be empty MUST be written `aria-label={name || undefined}`, because an EMPTY `aria-label` does not fall back to the element's content — it overrides it, so a button reading Delete announces as an unnamed button and a modal opened without a title announces as an unnamed dialog.
`tests/design-system-required-names.test.js` holds both, over the flat primitive directory and every manifest row under `apps/manager/`.

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
`tests/components/design-system-debt-ratchets.test.js` fails any `@media` whose query is not a user preference — `prefers-reduced-motion`, `prefers-contrast` or `forced-colors` — since those ask about the reader rather than about the window.
A container query adds no specificity, so the narrow case is declared after the wide one.
The APP-LEVEL container breakpoints are a published ladder, and a new surface reuses them rather than inventing a rung: the manager container breaks at 1320, 1120, 960, 900, 831 and 680; the recipes container at 714, 634 and 554; the alchemy and crafting containers at 960.
A component MAY declare its own container and its own rung where the thing that must respond is the component rather than the app — that is not covered by this ladder and does not need to be.
A layout that reserves fixed rail widths MUST also declare a container minimum, because `ApplicationV2#_updatePosition` clamps only to a computed `min-width` that defaults to zero and a `minmax(0, 1fr)` centre column can otherwise collapse.
The shipped manager grid is `220px minmax(0, 1fr) 300px` with fixed outer tracks; giving those tracks a `minmax(0, …)` upper bound is a proposed change recorded in the migrations, not a description of what ships.

A focusable element that is not a form control, contentEditable, or a button with a form MUST carry `data-keyboard-focus="true"`, or the keypress ALSO reaches Foundry's bindings and pans or zooms the canvas.
The condition is HOLDING FOCUS, not handling keys: an element that handles nothing still takes every keystroke the GM aims at it and hands it to the canvas, so `tabindex="-1"` on a non-form element is itself the trigger, since that attribute exists only to make the element a focus target.
The carve-out for a button is FORM-SCOPED and stays that way: `hasFocus` answers `!!focused.form`, so a button outside a form is exactly as unrecognised as a bare div, and a roving-tabindex tab strip — which handles the arrows and calls `preventDefault()` without `stopPropagation()` — runs its own handler AND pans the canvas.
The attribute is an OPT-IN that declares the element focused: `data-keyboard-focus="false"` does the opposite and hands the keypress to the canvas, so the value matters as much as the attribute.
`tests/design-system-keyboard-focus.test.js` holds all three populations this obliges, and for two of them it holds a pinned baseline rather than an absence: the `tabindex="-1"` targets are compliant, while the elements that carry a static `tabindex="0"` and an interactive role, and the buttons with no ancestor form, are counted debt that the shared primitives emitting the attribute will collapse.
A listbox MUST keep DOM focus on ONE element and drive selection with `aria-activedescendant`; roving focus onto option buttons re-arms those bindings and is forbidden.
A MENU is the deliberate exception and not a loophole: its pattern requires focus to MOVE to its items, so each item carries the keyboard-focus attribute above and the bindings are declared away rather than avoided.
Where the list has a search field, that field holds focus.
Where it does not — a plain select — the trigger is a `combobox` that Foundry will recognise as focused: either an input, or an element carrying the keyboard-focus attribute below.

A floating surface MUST be portalled to the NEAREST application root of the element that opens it, resolved by walking UP from that element rather than by naming a root, and positioned by measurement, flip and clamp against that same element's box.
Core clips at `.window-content` and the manager adds further clipping boundaries, so a CSS offset cannot escape them; `document.body` is NOT a valid portal target because it loses window stacking.
The portal target and the coordinate origin MUST be the same element, because the fault is not either choice on its own but the two disagreeing: a surface that names one root resolves nothing outside it, so the portal silently no-ops while the positioning falls back to viewport coordinates written onto a node that never moved, and the panel draws in the wrong place with byte-identical markup.
A document-wide lookup for a root is worse rather than safer, since it finds that application wherever it is and portals the surface into a different window.
The eligible roots are `.fabricate-manager` and `.fabricate-app`, and a root is eligible only while it is a POSITIONED element, because an absolutely positioned panel appended to a static one takes its containing block from somewhere else entirely.
A surface that resolves no application root MUST report it rather than degrade quietly; it falls back to `<body>`, which keeps the panel at its trigger but outside window stacking, and that is a fault to fix rather than a supported host.

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
`tests/components/design-system-debt-ratchets.test.js` counts every native `<select>` twice over, once as a parsed element in the Svelte templates and once as markup in a JavaScript template string, since a DialogV2 body cannot host a component and is therefore the one place the rule may not reach.
A single element is exempted by a `<!-- native select: reason -->` comment on the lines above it, which makes the exception a written decision rather than a silent one.

#### Scenario: A non-input element can hold focus

- **WHEN** an element that is not a form control, contentEditable, or a button inside a form can receive focus — which `tabindex="-1"` alone establishes, whether or not the element handles a key
- **THEN** it carries `data-keyboard-focus="true"`
- **AND** the keypress does not also reach Foundry's canvas bindings
- **AND** a button outside a form is in scope, because `hasFocus` recognises a button only by its `form`

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
The family reaches a TAB STRIP as well as the rail, because a tab's mark states a fact about what is behind that tab exactly as a rail entry's does, and the tab-strip primitive MUST own the drawing of every vehicle it offers so that a call site names which one its mark uses and never how it looks.
A caller that cannot name the vehicle it needs is a MISSING CAPABILITY on that primitive, never a licence to hand-roll a second strip or to draw one vehicle with another: a difference recorded between two strips MUST be a functional or informational one the shared primitive absorbs, because a deliberate STYLE divergence is precisely what a shared primitive exists to remove.
The PREMIUM vehicle stays a rail mark and is not offered on a tab strip, since a vehicle no caller on a surface can reach is configuration that cannot be exercised.
A mark carries a LABEL and a TONE and never a glyph: a PASS mark is the issue vehicle carrying a tick character, not a fourth vehicle and not a caller-supplied icon, because a call site naming a Font Awesome class is a call site choosing a shape and that is the one thing the ownership rule above forbids.

A rule that is always true is a callout, which stays put.
Something that just happened or is wrong right now is a notice, which goes away.
Current values a GM checks are an info strip in mono, and no control ever lives in a strip.
Nothing to show is an empty state, which says what the emptiness means rather than "no items" and distinguishes an unfiltered emptiness from a filtered one.
An empty state INSIDE AN OVERLAY the product has already drawn a boundary around — a picker popover, a suggestion list — is a note rather than a panel: one quiet line at that overlay's own scale, with no border, no fill and no icon tile, because a second bordered box inside a bordered panel reads as a card the GM could act on.

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

### Requirement: A picker announces the panel it opens, and a look-alike is adjudicated rather than converted

A trigger that opens a catalogue picker MUST state what will open, and the shared picker MUST take that value as a declared capability rather than hard-coding one.
`aria-haspopup` is `dialog` when the panel renders a query field and `listbox` when it renders a bare option list, and a caller asking for `listbox` MUST suppress the search field, because a trigger promising a listbox over a panel that contains one inside a dialog promises a control the GM never gets.
The difference between the two is INFORMATIONAL — it tells assistive technology what is about to appear — so it is absorbed as a prop on the shared picker and is never a reason to hand-roll a second one.

The picker MUST name both surfaces it renders.
The portaled panel and the option list inside it take one accessible name from the caller, so a caller that omits it produces a dialog with no name wrapping a list with no name.
Neither is visible in a frame, neither is a compiler error and no lint rule covers it, so the naming obligation is enforced at the source.

A control that resembles the picker MUST be adjudicated against it by its WIDGET rather than by its markup, and the verdict MUST be recorded with the measurement that produced it.
Three families are adjudicated NON-MEMBERS and are recorded in `scripts/lib/designSystemPrimitives.json`:

- A TYPEAHEAD COMBOBOX is not a picker.
It has no trigger, its suggestion list hangs off an input whose expanded state is driven by the query rather than by a control, and it therefore has no closed state to open from.
- An ACTION MENU is not a picker.
`role="menu"` with `role="menuitem"` children announces a list of things to DO, while the picker announces `role="listbox"` with `role="option"` children, a list of things to BE — converting one to the other changes what a screen reader says about the widget, not how it looks.
It is a SET MEMBER in its own right rather than merely a non-member, and the requirement below states what it owns.
- A MULTI-SELECT CHECKLIST is not a picker.
It toggles membership, stays open across choices and marks several options selected at once, while the picker carries a single value and closes on choose.

A picker whose class family is scoped to one application root MUST NOT be adopted by a surface outside that root until the family is unscoped.
`SearchablePopover`'s family has been unscoped onto the primitive's own `fabricate-picker` and `fabricate-picker-popover` roots, so it satisfies this and is adoptable outside the manager.
It has been adopted: the player window's `ActorSelectTopBar` renders its actor picker through the primitive, which is the shipped surface the unscoping and the portal-host resolver are now proved by rather than merely permitted for.
The icon, colour, essence-source and recipe-duration pickers do NOT: their panel rules are still written under `.fabricate-manager`, so a caller outside it would render a panel with no `position: absolute` to be placed by, and unscoping each family belongs to its own change rather than to a conversion before it.

#### Scenario: A converted menu renders no query field

- **WHEN** a caller opens the shared picker with its search field suppressed
- **THEN** the trigger announces `aria-haspopup="listbox"`
- **AND** the panel renders an option list with no query field

#### Scenario: An action menu is proposed as a picker conversion

- **WHEN** a `role="menu"` control is proposed for conversion onto the shared picker
- **THEN** it is recorded as an adjudicated non-member with its role and child roles measured
- **AND** it keeps its menu semantics rather than being announced as a listbox

### Requirement: The overflow action menu is a primitive of its own, and never a mode of the picker

An OVERFLOW ACTION MENU — a trigger that opens a short list of COMMANDS to run against the record beside it — MUST be one shared primitive, and that primitive MUST NOT be the shared picker with a `role` prop.

The two are separated by ANNOUNCED SEMANTICS and by FOCUS MODEL, and only the first is cosmetic enough to look absorbable.
A menu announces `aria-haspopup="menu"` over `role="menu"` and `role="menuitem"`, carries NO `aria-selected`, and MOVES DOM FOCUS to its items; a picker announces a `dialog` or a `listbox` over `role="option"` rows, marks the current value with `aria-selected`, and keeps DOM focus on one element while pointing at its options with `aria-activedescendant`.
Those focus models are mutually exclusive, so a component offering both would have to branch its entire keyboard implementation on a prop — and a caller reading only that prop's name would not learn which of two widgets it had asked for.

That reading is not hypothetical and the register carries both halves of it.
A `role="menu"` control was correctly adjudicated as NOT convertible onto the picker; at the same time a sibling had ALREADY been built the forbidden way, so a component's two source commands were announced as selectable options in a listbox and its destructive verb was announced as something to select rather than to run.
Neither a frame, a computed-style probe nor a `data-*` selector can distinguish the two, which is why the separation is stated here rather than left to review.

The menu's keyboard contract is the W3C ARIA Authoring Practices Guide's MENU BUTTON pattern: Enter, Space and ArrowDown open onto the first item, ArrowUp opens onto the last, the arrows move focus with wrapping, Home and End reach the ends, and Escape closes and RETURNS FOCUS TO THE TRIGGER.
Where the shipped primitive departs from that pattern it MUST say so at the source: a natively `disabled` item is not focusable and is therefore skipped rather than landed on, and Tab returns focus to the trigger rather than continuing the tab sequence, because the panel is portaled out of the trigger's subtree and the element after the PORTAL HOST is not the element after the trigger.

Its items hold focus and are buttons outside a form, so each MUST carry `data-keyboard-focus="true"` — the same obligation the Foundry contract places on any focusable non-form element, and the reason the listbox prohibition above does not reach a menu.
The panel MUST be portaled through the shared overlay-host resolver rather than positioned inside its trigger's own container: an absolutely positioned menu is clipped by any scrolling ancestor, and a clipped panel reports its full box, so the failure is invisible to every geometric assertion and has to be proved by hit test.

#### Scenario: A surface needs a kebab over two or more commands

- **WHEN** a surface needs an overflow menu of commands
- **THEN** it renders the shared action-menu primitive
- **AND** the trigger announces `aria-haspopup="menu"` over a `role="menu"` of `role="menuitem"` rows carrying no `aria-selected`

#### Scenario: A caller asks the picker to announce a menu

- **WHEN** a change proposes a `role` prop on the shared picker so one component can render both widgets
- **THEN** it is refused
- **AND** the action-menu primitive is used instead, because the two differ in focus model and not only in what they announce

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

The arrangement has ONE implementation, `src/ui/svelte/apps/manager/EditorValidationSurface.svelte`, and an editor that draws it MUST render through that component rather than restate its markup.
That is what makes the sentence above enforceable rather than aspirational: while a second copy of the markup exists, "the same arrangement" is a convention each copy is free to drift from, and the two class families the sheet paints it with have more than one writer.
A site whose DOM hooks, root classes, status words or reported counts differ passes them as props, and a site needing something the surface does not draw extends the surface rather than forking it.
The counts are a closed, ordered vocabulary the surface owns — pass, then warning, then blocking — and a site reports the subset it can answer rather than choosing an order or inventing a fourth.

One editor does not use the arrangement yet, and it is recorded here rather than left to be rediscovered: the environment editor's validation tab renders check and issue LISTS inside cards, carries severity on a chip, and has no verdict medallion, no counts rail and no grouped row stack.
It writes none of the arrangement's classes, so it is a REDESIGN of that screen rather than an adoption, and it is outstanding conformance debt against this requirement rather than an exemption from it.
The system overview route is NOT in this requirement's scope and is recorded alongside it so the two are not confused: it collects every issue across a whole crafting system, groups them by the entity that owns each one, and is a route rather than an editor's tab.
Both measurements live in `scripts/lib/designSystemPrimitives.json` so that neither is re-proposed as an unconverted call site of the shared surface.

#### Scenario: A GM opens validation on a different editor

- **WHEN** a GM opens the validation surface of an editor they have not used before
- **THEN** the verdict, counts and grouped issues appear in the same arrangement as every other editor

#### Scenario: An editor's validation tab needs a hook or a label the surface does not emit

- **WHEN** an editor's validation tab needs its own DOM hooks, root classes, status words or a count it does not report
- **THEN** it renders the shared surface and passes them as props
- **AND** it does not restate the surface's markup in its own template

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
The selection bar is a BAND OF ITS OWN directly beneath the filter bar, never a set of controls mixed into it.
The filter bar's composition MUST NOT change with selection state: a surface that adds selection controls to that row when rows are ticked, or narrows one of the row's own controls to make room for them, has made one bar mean two things and reads as a different screen in each.
Whether the band renders at rest is per surface, and a surface that renders it only while a selection is active MUST keep a per-row selection control as the way to open one, because otherwise the mode has no entry point.
The pagination bar sits OUTSIDE the scroll area so it never moves, and wherever it renders it never hides its disabled arrows.
A browse surface MAY suppress the bar entirely while the whole filtered list fits ONE page, and MUST restore it the moment a second page exists; suppression is per surface and opt-in, so a surface that says nothing keeps the bar.
The permission is bounded to the single-page case because that is the only state in which the bar can say nothing the rows do not — `Showing 1-6 of 6 - Page 1 of 1` under six rows is a control with no reachable second state.
Suppressing it also suppresses the per-page selector, so a surface that opts in accepts that a GM who has chosen a size covering the whole list cannot choose a smaller one again from that screen until they leave it.

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
The row MUST name the implementation path and MUST record the caller count that justified the primitive.
It MUST also name the library entry it corresponds to, unless the primitive ships with no specimen at all, in which case it carries `library: null` and the undocumented register in `tests/design-system-coverage.test.js` names it; that register is pinned by exact equality, and shortening it is the only direction the debt is meant to move.
The split is deliberate rather than filing: purpose, geometry and API are what a reader needs rendered, and the path-to-name correspondence is what a gate needs to check.
That obligation binds a primitive the change ADDS or ALTERS.
An entry carried unchanged from an existing component may state its geometry alone and take the shipped props as its API by reference; the library records which entries currently do so, and closing that list is tracked as a debt rather than presented as complete.

A change that adds a component under `src/ui/svelte/components/` without a specimen has added an undocumented primitive; a change that ships a primitive without its manifest row has added a name no diff can be attributed to; and a change that adds a row naming a library entry that does not exist has recorded a correspondence to nothing.
`tests/design-system-coverage.test.js` is the gate those prohibitions are enforced through: it requires every file under `src/ui/svelte/components/` to carry a manifest row, requires no entry recorded as unbuilt to ship as a component, and requires every row's library name to resolve to a specimen that is not a declined candidate.
The row is what the gate compels, so a component that ships with no specimen clears it only by carrying `library: null` and a matching line in the pinned undocumented register — which states the debt on the record rather than failing the change, and is the same treatment the carried-forward entries above receive.
Where a proposal conflicts with a shipped component, the change MUST either adopt the shipped behaviour or state why it is being replaced.

#### Scenario: An implementer needs a primitive the set does not contain

- **WHEN** planned work needs a shared component the set does not contain
- **THEN** the change adds its specimen to the visual library and, once the primitive ships, its row to the manifest
- **AND** the change names the two or more independent callers that justify it

### Requirement: The ruled-out register is part of the specification

Candidates reviewed and declined MUST be recorded with the reasoning that declined them, so that the absence of a primitive is legible as a decision.

The following are recorded as compositions and MUST NOT be reintroduced as components: a member row, which is a list row with a leading slot; an actor picker, which is a trigger plus the search popover; an add button, whose dashed treatment is a role on the button primitive; a rail card, which is a well, a kicker and a button; a feature card, which is option cards rendered non-interactive; a bounds input, which is two steppers; and a currency input, which is a stepper and a select.

A premium panel is recorded as out of scope rather than as a composition: its only original content is marketing copy, which is a product decision, and binding copy to a component makes the offer untranslatable against a codebase where every primitive takes pre-localized strings.
A toast and a bespoke destructive-confirmation panel are recorded as surfaces Foundry already owns.

#### Scenario: A ruled-out candidate is re-proposed

- **WHEN** a proposal names a candidate the register already declined
- **THEN** the proposal must address the recorded reasoning
- **AND** absent new evidence, the composition in the register is used instead
