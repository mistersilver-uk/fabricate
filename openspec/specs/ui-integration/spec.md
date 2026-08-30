# UI Integration

## Purpose

Define Foundry UI integration points and user workflows for Fabricate.
This file is UI-only.
Domain behaviour is defined in:

- `resolution-modes/spec.md`
- `recipes-and-steps/spec.md`
- `recipe-visibility/spec.md`
- `destructive-changes-and-migrations/spec.md`
- `gathering-and-harvesting/spec.md`
- `companion-api/spec.md`

Global rule: if a system feature is disabled, controls for that feature are hidden.

## Product UI Visual Style

Fabricate's Foundry-facing product UI must use a clean flat visual style.

- Product UI surfaces, headers, buttons, overlays, and selected states must not use `linear-gradient`, `radial-gradient`, or `conic-gradient`.
- Full-track semantic value scales may use `linear-gradient` only when the gradient directly communicates the numeric meaning of the control, such as a green-to-red risk slider.
- Use solid colors or RGBA fills for shells, cards, headers, overlays, and controls.
- Visual hierarchy should come from spacing, typography, borders, and restrained shadows rather than decorative gradients or blur-based glass effects.
- Shared tokens in `styles/fabricate.css` and app-local editor tokens should be the source of truth for reusable surface treatments.
- Fabricate exposes a global module setting, `fabricate.theme`, for choosing the active product UI colour theme.
- Fabricate exposes a global module setting, `fabricate.experimentalFeatures`, gating experimental surfaces still in development (currently the recipe-graph placeholder and the GM Manager's world `Downtime` surface).
  It defaults to disabled.
- Fabricate exposes a per-client module setting, `fabricate.interactionPromptPosition`, for the on-screen anchor of the region-entry interaction prompt toast.
  It offers the four screen corners and four edge-centers and defaults to `bottom-center` (the prompt's historical position).
  The setting is client-scoped so each user can move the prompt away from their own conflicting on-screen widgets; an unset or unrecognized value resolves to `bottom-center`.
- `Fabricate` is the default theme.
- `Mythwright` preserves the previous dark green product palette.
- The supported preset catalog also includes `Ironblood Forge`, `Hearth & Herb`, `Starglass Arcana`, and `Foundry Native`.
- `Foundry Native` is a fixed Fabricate-owned palette inspired by Foundry's default visual language; it does not dynamically track Foundry runtime CSS, the active Foundry theme, or third-party Foundry skins.
- Product UI colours outside the theme token declaration layer must reference theme variables or reusable semantic variables/classes rather than raw colour literals.
- Changing the theme setting applies a stable theme attribute to `document.documentElement` and open Fabricate app roots so already-open Fabricate UI surfaces that consume `--fab-*` tokens update without requiring a reload or reopen cycle.
- Generated documentation output and third-party/vendor theme assets are out of scope for this rule unless they are explicitly restyled as Fabricate product UI.

### Semantic slider geometry

Shared semantic sliders MUST define one canonical geometry in which the custom visible track is inset by the rendered thumb radius and the range input spans the full control width.
At the minimum and maximum values, the thumb centre MUST coincide with the corresponding visible track endpoint.
Native and Foundry-host track rendering MUST be suppressed for the range input, including transparent WebKit runnable-track rendering and transparent Firefox track and progress rendering, so only the custom track communicates the scale.
The thumb MUST resolve its colour or semantic tier from the same normalized value scale as the visible track treatment.

A value-width fill MUST set its width from the normalized current percentage and use the current semantic colour.
A full-track semantic scale MUST render its semantic gradient across the complete inset track and MUST keep the custom fill at full width rather than clipping the gradient at the current value.
Controls MUST distinguish those meanings explicitly: a full-track scale describes the semantics available across the range, while a value-width fill describes progress to the current value.

### Typographic contract

Product UI type must come from a shared, self-hosted three-family contract declared in the `:root` block of `styles/fabricate.css`, alongside the theme tokens and the spacing scale.

- Two font tokens are declared once in `:root` — never inside a theme block, because every theme block must declare an identical token set: `--fab-font-serif` (Spectral, with a serif stack fallback) and `--fab-font-mono` (JetBrains Mono, with a monospace stack fallback).
  The UI face remains Foundry's `--font-primary` and is not tokenized here.
- Fonts are **self-hosted** under `assets/fonts/` and loaded through `@font-face` with `font-display: swap`.
  No CDN or remote font URL: `styles/fabricate.css` is loaded globally into the Foundry document, a failed remote fetch is a console error in every world, and Foundry worlds are routinely run offline.
  Ship only the weights the product uses (Spectral 400/500/600/700, JetBrains Mono 400/500, latin subset), and ship each family's licence file beside it.
- `--fab-font-serif` sets **names and headings**: an entity's name wherever it is named (browser rows, inspector titles, the rail's selected-system card), section and card titles, and the inputs that author a name.
- `--fab-font-mono` sets **every numeric**: quantities, DC values, counts and count badges, step and order indices, and durations.
  A mono numeric surface must also set `font-variant-numeric: tabular-nums`, so a value changing width (9 → 10) cannot shift the control beside it.
- A control whose text is words rather than a number stays in the UI face even when it sits in a numeric slot — the mono face marks a number, it does not decorate a pill.

### Spacing scale

Product UI padding, margin, and gap spacing must derive from a shared 4px-based spacing scale declared in the `:root` block of `styles/fabricate.css` rather than from raw pixel literals.

- Semantic aliases name the primary 4px steps: `--fab-space-xs` (4px), `--fab-space-sm` (8px), `--fab-space-md` (12px), `--fab-space-lg` (16px), and `--fab-space-xl` (24px).
  The named scale deliberately skips 20px.
- The numeric tokens `--fab-space-1` (4px) through `--fab-space-6` (24px) are retained, including `--fab-space-5` (20px), which has no semantic alias.
  The sweep and new declarations prefer the numeric tokens for uniformity with existing call sites.
- Two fine tokens cover dense optical spacing with zero visual shift: `--fab-space-2xs` (2px) for hairline spacing and `--fab-space-chip` (6px) for chip and icon+label gaps.
- Documented literal exemptions that must NOT be tokenized: `1px` hairlines (borders, dividers, and `-1px` overlap bleeds) and one-off fixed dimensions in the 34–42px range (search-input icon clearances and grid-alignment offsets) where the value reserves space for a fixed element rather than expressing spacing rhythm.
- Positioning offsets (`left`/`right`/`top`/`bottom`), `width`/`height`, `border-*` widths, `border-radius`, `grid-template-columns` track sizes, `@container`/media breakpoints, and font sizes are not spacing-scale members and remain literal.

### Shared product UI primitives

The `design-system` capability is the canonical record of WHICH primitives that set contains, their canonical geometry, their Svelte APIs, the rules that route a near-neighbour case to the right one, and the recipes that compose them into the browse, editor and player screen archetypes.
Its visual companion at `openspec/specs/design-system/library.html` renders every primitive at the geometry that capability states, and is the artifact to open when a written geometry needs to be seen rather than read.
This section states the RULE that a repeated thing is one primitive; `design-system` states what the set IS, and a change that adds or alters a shared primitive updates that capability and its library in the same change.

Wherever two or more product UI surfaces perform the same function, represent the same knowledge, or implement the same layout, that thing MUST be a single shared primitive Svelte component every site imports.
The subject is every product surface — the GM manager and the player crafting, alchemy, gathering, inventory, and Journal surfaces alike — because two surfaces rendering the same meaning are duplicates whichever audience they face.
A shared CSS class that each site hand-rolls markup against does not satisfy this, and neither does a copy.
Adding flexibility to the primitive that already owns the meaning takes precedence over introducing a second component that owns half of it.
A primitive that coexists with unconverted duplicates has added a variant rather than removed one.

A primitive's CSS MUST live in its own scoped `<style>` block rather than in `styles/fabricate.css`.
Required-screenshot detection maps changed file paths to affected views, so global-sheet styling makes every tweak look like a global change and demands a wide core frame set, while co-located styling scopes the evidence to the views that actually render the component.
Only two kinds of rule for a primitive stay in the global sheet: what must beat Foundry's host CSS (button geometry, focus rings) and LAYOUT-CONTEXT rules whose subject is reached through an ancestor the component does not render, such as how a specific container places, stretches, or spans the panel.
A layout-context rule places the primitive and MUST NOT restyle it: no `font-size`, `font-family`, `font-weight`, `border`, `border-radius`, or `background`.
The player crafting app's requirement rail, requirement tile, essence pool, consumption-plan panel, and essence-contribution chip are held to that CSS rule as player-side primitives, which is why they added no rules to `styles/fabricate.css`.

Three live non-conformances are recorded here rather than left to be discovered, because a rule whose exceptions are unwritten is a rule nobody can rely on.

- `FillBar` now EXISTS at `src/ui/svelte/components/FillBar.svelte`, and `src/ui/svelte/apps/gathering/ChanceBar.svelte` is REBUILT on it rather than widened: `ChanceBar` is a percentage instrument and does not own the have/need meaning, so widening it in place would have made it the second component owning half a meaning rather than the primitive that owns one.
  `FillBar` is a LEAF — it renders the track and the value-width fill and declares no `role` or `aria-*`, because the accessible semantics differ per site (`ChanceBar` is a `meter` with its own `aria-valuenow`; an odds row's bar is decorative).
  A caller whose colour is authored DATA, or whose scale is its own domain meaning rather than one of the semantic tones, passes it inline through `color`; `ChanceBar`'s reversed four-step event scale travels that way as ONE inherited custom property, so the tier colours stay in the stylesheet that owns them.
  FOUR unconverted sites remain and are a debt with a named owner rather than an accepted state: `GatheringTaskDrops.svelte`, `RunCard.svelte`, `ActorSelectTopBar.svelte`, and `EssencePoolPanel.svelte`.
  Conversion of those four stays deferred because it would drag their screenshot-label sets into a single evidence run.
- `CollapsibleGroupHeader` is explicitly NOT the primitive for a collapsed ROW disclosure; it is a GROUP header, owning a heading, a count and the header band above a set of rows.
  A single purpose-built row disclosure exists instead at `src/ui/svelte/components/RowDisclosure.svelte`, with `aria-expanded`, `aria-controls` and an accessible name, and it is the ONE implementation every such site uses — two "labelled regions that expand" landing in one change must share an implementation or name the behavioural mismatch that forbids it.
  It has TWO shipped consumers: the Checks Studio right rail, whose simulator and odds panels each collapse to it at the existing 1320 breakpoint, and the COLLAPSED TRIGGER CARD, whose summary row states the trigger's condition as a sentence, its effects as a sentence and a chip, and carries this disclosure.
  A collapsed trigger card keeps its editing body IN THE DOM and hides it with `display: none` rather than removing it: that takes its controls out of the tab order, so a keyboard user cannot land inside a closed card, and it keeps ONE markup tree rather than a second rendering path to keep in step.
  A trigger a GM has just ADDED opens, because the collapsed summary is the resting state of a card that already says something.
  It renders a real `<button>`, so a caller nests it beside a row's content and never converts a `role="button"` wrapper around it into a `<button>`, which would nest buttons and land invalid DOM.
- THE manager's labelled push-button exists at `src/ui/svelte/components/ManagerButton.svelte`, taking a `role` from a CLOSED set of six: `neutral`, `primary`, `ghost`, `danger`, `dashed` and `warning`.
  It replaces a CSS CONVENTION — `manager-button` plus a remembered `is-*` modifier — which is exactly the "shared CSS class each site hand-rolls markup against" this section forbids, and which had already drifted: the system Modifiers card painted `Delete modifier` as a neutral verb while the Tool Studio painted the identical verb as danger.
  It is the one primitive here that deliberately has NO scoped `<style>`, and it claims the section’s own button-geometry exception to say so.
  Emitting exactly the classes `styles/fabricate.css` already styles is what makes converting a CORRECT call site provably a no-op on screen, which is the property that lets the sweep proceed one screen at a time; a scoped block would instead be a second source of truth for the same control and would begin to disagree with the global sheet.
  The Tool Studio’s `.manager-tool-edit-actions` cluster is the AUTHORITY for what a manager button looks like, and `tests/components/manager-layout.test.js` compares a converted card button against it in a real browser on `font-size`, `font-weight`, `padding`, `height` and `border-radius`, so drift fails a gate rather than shipping.
  Each role names a VERB and not a colour, because a colour is something a call site can pick by eye and a verb is not.
  `neutral` is the SECONDARY verb, and it is the EMPTY MODIFIER rather than a missing one: a bare `.manager-button` is a real and correct treatment, which is why `neutral` is the default and why an unrecognised `role` renders as neutral instead of emitting an unstyled `is-*`.
  `primary` is the CREATE-OR-COMMIT verb of the chrome cluster it sits in, and a cluster carries at most one.
  `ghost` is the quiet NAVIGATIONAL verb — Back, Open, View — which moves the GM and changes no record.
  `dashed` is the APPEND verb at the foot of the list it adds to, because a dashed outline reads as an empty slot waiting to be filled and a solid button does not.
  `danger` is the DESTRUCTIVE verb: the action removes or unlinks a record, and it is the role `ArmedDangerButton` fixes as an invariant.
  `warning` is the OVERRIDE verb: the action proceeds against a rule the system has already flagged, and destroys nothing.
  A control that both destroys and overrides is `danger`.
  That `warning` is NOT the `warning` of the Right-inspector-actions primitive below, which is "amber, for a verb that BREAKS A LINK" — same word, deliberately different meanings, two different primitives, and neither vocabulary may be read across into the other.
  The two are stated together here because the words are close enough to be picked by feel, and a call site that reasons "unlink is a warning" from the wrong primitive's requirement paints a destructive verb amber.
  The set is CLOSED, and a per-site visual tweak travels as a PASS-THROUGH class through the appending `class` prop rather than as a new role.
  `is-subtle` is the worked example of a legitimate tint: six sites, four of them arriving through a popover's `triggerClass`, carrying three unrelated verbs and differing by a single property, which is a tint and not a meaning.
  `is-warning` is the worked FAILURE: `environment/CompositionList.svelte` renders ONE verb from two places under the same handler, the same `data-action` and the same localization key, and one of those places spelled the modifier `is-warning`, which the sheet declares nowhere — so that site shipped with no treatment at all while the sheet's `.manager-button.is-warning-action` shipped with no call site.
  `warning` therefore emits `is-warning-action`, and the role-to-class relation is a NAMED MAPPING in the component rather than an `is-${role}` template, because the roles are a vocabulary while the class each one emits is an implementation detail of the sheet.
  **The role acquired a rendering consumer in issue 1315, and had none before it**: the labelled Force add in that component's standalone Non-matching section — the inline action on an event row, with a row-menu twin on task rows — which is automatic mode's list of the records its own biome/danger filter rejected, and therefore the one place where proceeding against a rule the system has already flagged is literally what the control does.
  It was unreachable in every earlier version, which is how the class misspelling survived review and shipping: that section is gated on `mode !== 'manual'` while all four of its Force-add branches demanded `mode === 'manual'`, two mutually exclusive conditions, and 1315 settled where a force add belongs so those branches now test composition state alone and take their mode from the enclosing section.
  The amber treatment's only previous rendering consumer, manual mode's Available-to-add icon Force add, is deleted by the same change — manual composition applies no match filter and so has nothing for a force to override — so `.manager-icon-button.is-warning-action` is retired with it and the sheet now declares the amber rule for `.manager-button.is-warning-action` alone.
  The element is POLYMORPHIC through a `tag` prop, spelled the way `Chip.svelte` already spells it rather than as `as`, since one meaning takes one name across the manager primitives.
  `tag` is `button` or `a`, defaults to `button`, and renders a `<button>` for any unrecognised value.
  `<button type="button">` remains the default, and `type` is emitted ONLY on a button: an anchor carrying `type="button"` is invalid markup, so the attribute set is built per element rather than let through the rest spread.
  `tag="a"` with an empty `href` renders a `<button>`, because an anchor without an `href` is not focusable, has no implicit link role and does not activate on Enter — and several anchor sites take their `href` from caller data, so the empty case is reachable in the product rather than merely a typo.
  `disabled` is not a valid attribute on an anchor, so it is IGNORED there and warns.
  `rel` defaults to `noreferrer` when `target` is `_blank`, because a primitive that owns the anchor shape owns its safety default too, or the conversion preserves the per-site inconsistency it exists to end.
  A `fullWidth` prop emits `is-full-width` and is deliberately NOT a role: `dashed` used to pin `width: 100%` itself, which is a statement about the CONTAINER rather than about the verb, and it stacked a four-across wrapping row into four rows.
  `ArmedDangerButton` is a CONSUMER of the same CSS contract and NOT of this component: it owns a two-state arm/confirm machine whose danger role is an invariant rather than a caller’s choice, so composing them would push a `class:is-armed`, a second label slot and a keydown/blur contract into a primitive no other site wants.
  No `.svelte` under `src/` renders a raw `class="manager-button"` any longer, with two stated exceptions: `ArmedDangerButton.svelte`'s single site, and `ManagerButton.svelte`'s own two occurrences, which are DOCBLOCK PROSE rather than markup and are named so the source-contract test that pins this does not red on the primitive that satisfies it.
  Three debts remain, each with a named owner and a stated reason rather than an accepted state.
  The first is SEVENTEEN `SearchablePopover` `triggerClass` sites, which hand a class STRING to a popover instead of rendering a control, so converting them changes the popover's own trigger contract rather than a call site — a different subject, and one that also decides which global rules may be re-chained above the primitive, since a `triggerClass` trigger never gains `fab-manager-button`.
  They are `recipe/RecipeIngredientOption.svelte` (four), `recipe/RecipeIngredientSetCard.svelte` (two), `recipe/RecipeToolsSection.svelte`, `recipe/RecipeResultGroupCard.svelte`, `recipe/RecipeResultItemRow.svelte` (composed as a template literal), `recipe/RecipeRoutingAssignment.svelte`, `recipes/RecipeBulkEditPanel.svelte`, `checks/ChecksRightMenu.svelte`, `tools/ToolBreakageTab.svelte`, `MapRegionLinkPicker.svelte`, `RealmOverridePicker.svelte`, `ComponentEditView.svelte`, and `component/ComponentComplicationsSection.svelte`'s "Browse macros" trigger, which issue #1286 landed after this requirement was first written and which this sweep could not have named for the same reason it could not convert it: the file did not exist yet.
  The second is ONE accent-primary treatment written as THREE declarations reaching FOUR sites: `styles/fabricate.css`'s `.manager-recipe-browser-inspector-edit, .manager-component-browser-inspector-edit` pair covering the two browser inspectors, the same treatment again on `.manager-header-actions .manager-downtime-unlock`, and a third copy in `BulkEditPanelShell.svelte`'s scoped `.fab-bulk-edit-apply`.
  It stays deferred because "the loudest control on this panel, in the accent" either IS `primary` or is a seventh role, and the set is closed — so it is a vocabulary ruling rather than a conversion, and making it silently by re-pointing three declarations would settle the vocabulary in the stylesheet.
  The third is TWO treatments of one meaning in the Checks Studio, "go to the canonical authoring screen", both carrying the same `fa-arrow-up-right-from-square` glyph and both role-less: `checks/CraftingModifierCatalogueCard.svelte` renders it as a borderless, padding-free accent TEXT LINK through a pass-through class, and `checks/ChecksView.svelte` renders it as a boxed NEUTRAL button at standard control geometry.
  It stays deferred for the same reason as the second: a `link` treatment would be a seventh role, so the pair cannot be reconciled by conversion, and it is a card-head-to-card-body pair rather than two cards, which is why an earlier sweep looked for it among sibling cards and did not find it.

#### Threshold band strip

A shared primitive rendering N ordered, named bands over a value track with draggable boundaries, at `src/ui/svelte/components/ThresholdBandStrip.svelte`.
The numeric steppers in the tier rows remain AUTHORITATIVE; the strip is a visualisation bound to the same state.

It uses NO gradient.
Each band is a solid fill from that band's own runtime colour applied inline via `style=` (authored data, never a source literal), and it claims NO §Product UI Visual Style exemption — the exemption's own rule (a gradient across the complete track, fill kept full-width) conflicts with per-band identity, which is the whole point of the control.
Per-band identity is therefore a real requirement on the CALLER, not just on the primitive: a caller deriving the colour from a two-valued flag renders two bands of a five-band set identically and has not got it.
The routed check editor walks a FIVE-TONE ramp — danger, warning, success, info, accent — by each band's POSITION IN VALUE ORDER across the whole tier list, not by its success flag; a single band takes the middle tone.
Position order is what makes the strip read left-to-right as escalating: ranking inside each semantic family instead gave a three-tier check its darkest band in the MIDDLE, because the lone failure tier was a family of one and took that family's strongest tone.
The success/failure split is not re-stated by the ramp because each tier row already carries a Success/Failure pill and each boundary handle names both tiers.
Each tier row repeats its band's tone as a SWATCH — a 12x12 round dot in the UNDILUTED tone, because it carries no text and so is not bounded by contrast — so the ramp on the track has a key.
Every band carries its tier's NAME and its own INK, and the ink travels with the fill from the same caller, because the name is drawn on the fill and only the party choosing the fill can know what stays readable on it.
The ramp is therefore bounded by that name's contrast: each band's painted fill reaches at least 4.5:1 against the ink drawn on it, in every shipped theme and at every band count.
A per-tone ink is what buys that headroom — one shared ink for the whole strip holds every band under a single luminance ceiling — so each tone inks its band with the `-text` token its own family already ships for its soft fill, and `--fab-accent` ships one too rather than inking its band with itself.
The ramp is mixed into an OPAQUE base rather than a translucent surface — mixing into a translucent one makes the mix percentage double as an opacity, so the fill lightens as the ramp climbs and the painted colour depends on whatever the strip is stacked on, which no requirement about it could then be measured against.
Per-band identity is measured from the PAINTED colours per palette, not inferred from the tone tokens having different names: two differently-named tokens holding the same value paint one band where the GM was promised two.

Every boundary renders a VISIBLE handle with a hit area of at least 24x24 CSS pixels, satisfying WCAG 2.5.8; a ~2px band seam is not a target, so the visible grip is deliberately narrower than the box around it.
Every handle is keyboard-operable: `role="slider"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and an `aria-label` naming the boundary, driven by Arrow, Home, End, PageUp and PageDown.

N bands yield N-1 handles, so the band-to-boundary mapping is stated rather than inferred.
In `relative` mode handle _i_ writes `outcomes[i+1].dc`; in `fixed` mode handle _i_ writes the coupled pair `outcomes[i].end` and `outcomes[i+1].start` as ONE update; in the two-band `simple` binding the single handle writes `simple.dc`.
The outermost authored values carry no handle and are edited by `Stepper` only — the first band's lower bound and the last band's upper bound.
Bands are DRAWN in value order and WRITTEN through each band's authored index, because a routed tier list authored high-to-low is valid data and sorting the authored array instead would reorder a GM's rows from a drag.
`aria-valuemin` and `aria-valuemax` are ONE STEP INSIDE the neighbouring boundaries, and at the outermost handles one step inside the TRACK: the authored range extended one TIER interval past the outermost tier in `relative`, the authored `[min(start), max(end) + 1]` span in `fixed`, and the DC field's own stepper range in `simple`.
The step of clearance means NO DRAG CAN COLLAPSE A BAND to zero width, including the first and last, whose outer edges carry no handle to be pushed back by; a collapsed band's focus ring is clipped by the track's `overflow: hidden`, so the GM could neither see nor re-aim at the tier they had erased.
A tier interval narrower than `step` is authored data the strip must still describe, and it reports the handle's own value as both bounds rather than an inverted range no assistive technology can read.
A `fixed` band's range is INCLUSIVE, so the last band is drawn to `max(end) + 1` — the same rule every interior seam obeys, since band _i_ ends where band _i+1_ starts, which is `end + 1`.
A handle dragged or keyed past a neighbour CLAMPS rather than swapping or reordering.

In `relative` mode the strip renders and announces ABSOLUTE values against the PREVIEWED RECORD's DC — `aria-valuenow` carries the absolute number, not the offset — and converts back to offsets on write, because the tier rows' steppers show offsets over the same state.
Since that absolute number is a function of the previewed record and changes with no data change when the GM switches records, `aria-valuetext` carries BOTH readings ("17 — DC +5 against Uncommon Craft") and the previewed record is named in the strip's group label.
The previewed record is ONE selection shared with the right rail's "Preview as" card and with the simulator that rolls against it, held above both, because two controls each holding their own copy is how two surfaces come to disagree about which record is being previewed.

A gapped, overlapping or inverted authored set is reachable and a contiguous strip cannot render it, so the strip falls back to the tier rows alone with a stated note.
An ABSENT upper edge is distinguished from an authored zero: `Number(null)` is `0` and finite, so a bare coercion reads every omitted edge as an authored `0` and reports a perfectly contiguous set as gapped.

Click handlers on bare non-interactive elements are forbidden, and a `role="button"` wrapper is never converted into a `<button>`.

#### Right-inspector actions

Every GM studio's right-hand inspector ends in a stack of verbs for the selected entity — Duplicate, Edit, Delete, Copy source UUID, Unlink.
That is one meaning, so those controls render through one shared primitive, and it is the POINT OF ARRIVAL: a new studio's inspector MUST import it rather than declaring a fourth treatment.

The primitive takes the Tool Studio's editor-header buttons as its base, because that is the refined treatment: a label a notch below body text, the compact control height, a 6px radius, and an icon before the label.
It is not a variant of the manager's general-purpose button class, since that class's tone modifiers are declared in the global sheet at a specificity a scoped primitive block cannot beat, which would leave the primitive's own tones losing to it.
It therefore carries the Foundry `<button>` reset itself and states its appearance in its own scoped block.

Tone is a fixed vocabulary and each member has a meaning:

- `primary` is the ACCENT, never the success family, and there is at most one per rail — it is the rail's loudest control.
  A studio that paints its primary in success has coloured "edit" as "confirm".
- `danger` is danger text on the panel surface: destructive, and never louder than the primary.
- `warning` is amber, for a verb that BREAKS A LINK rather than destroying a record — unlinking a source is not deleting one.
- the default is the quiet panel-surface treatment.

Recorded non-conformance: the recipe, component, Tool Studio, and Tags & Categories inspectors still render their own treatments and are the declared conversion backlog.
The essence inspector is converted; a primitive that coexists with unconverted duplicates has added a variant rather than removed one, so the remainder is a debt with an owner rather than an accepted state.

#### No-state messages

Every manager "nothing here" message renders through one shared no-state primitive, in one of three treatments.

- The central panel is a dashed, unfilled, rounded panel holding an optional rounded icon tile, an optional serif title, an optional capped body sentence, and optional trailing content.
- The `compact` treatment is the same vocabulary at a smaller scale for a sidebar, a dropdown popover, or an inline panel; it changes size, never the vocabulary.
- The `filtered` treatment is the filtered-to-nothing case, which is not an absence of content: it deliberately omits the icon and title apparatus and states the miss in one sentence beside its way out.

Trailing content inside the panel — a Clear-filters control, a primary CTA, or a docs link — is part of the primitive, because a no-state message that offers no way out is a dead end.
An inline value slot is NOT a no-state message: text standing where a value would be inside a control row (an unassigned travel actor beside its clear button and picker) stays an inline hint, since a dashed panel inside a control row is a layout defect rather than reuse.
A single per-screen size override of the shared panel is a second empty-state design and is forbidden; every no-state message shares one tile and type scale.

#### Modal dialogs

Every centred manager modal renders through one shared modal-chrome primitive.
The chrome is the dialog surface itself, portaled into the manager area with Escape and outside-click dismissal, and it owns exactly four things: the panel, a compact heading of a title over an optional muted subtitle, a round close control aligned with the title, and a right-aligned footer rail for the dialog's actions.
Everything between the heading and the footer belongs to the feature and carries that feature's own scoped styling.

A manager modal MUST NOT be assembled from a raw HTML string handed to a Foundry dialog.
Such a dialog inherits Foundry's page-title headings, unstyled list markup, and full-width footer button, which is a second modal design standing beside the shared one; it also cannot use any shared primitive, since a string is not a component.
The post-import reference report and the bulk-import folder-categorization step are both import-flow modals and MUST therefore be visually indistinguishable in chrome.

#### Yes/no confirmations

A destructive or irreversible action confirms through the shared confirm seam, which is Foundry's own two-button confirm rather than the manager's modal chrome.

That confirmation states two things, and neither is left to a platform default.
It renders a TITLE naming what is at stake, and its affirmative button names the ACTION — Delete, Reset, Move, Change mode — never the generic _Yes_.
Both are localized keys at every call site but one — the gathering library record delete confirm still builds its title and body from hardcoded English, a deliberately deferred gap rather than the shipped norm.
An untitled confirm, or one whose affirmative reads _Yes_, is not an acceptable rendering of a destructive action however accurate its body text, because the two controls a GM actually reads before committing say nothing about what is about to happen.

The seam maps a caller's title onto the window title and accepts a callback-only button, so no call site can silently lose either.
It cannot supply the affirmative label, which is why that stays a per-action string owned by the caller.

#### Standing statements

A permanent explanation of how a surface behaves and a conditional hazard warning are the same layout and render through one shared callout primitive: a leading semantic glyph plus one sentence in a tinted, rounded strip.
The callout has exactly ONE shape.
Tone is purely a colour concern and changes the edge, the fill, and the glyph, never the padding or the type scale.

Tone carries meaning and is chosen deliberately.
`info` states how the surface works and is permanent; `warning` marks a conditional hazard the GM can still avoid.
A surface that paints its permanent hint in `warning` alongside a conditional `warning` has spent the colour that was supposed to make the hazard stand out, so a permanent hint takes `info` unless something is genuinely at risk.

#### Selection controls

Every multi-select affordance in the manager renders through one shared selection-control primitive: a square custom control with a checked, unchecked and indeterminate state, at the sizes its host row needs.
A host-supplied `<input type="checkbox">` rendered with Foundry's default control chrome is a second selection design and is not an acceptable rendering.
A multi-select surface's SELECTION TOOLBAR — the tri-state control over the rendered rows, the selected-count readout, the select-all-results action and Clear — likewise renders through one shared toolbar primitive that every browser imports.
Its test and screenshot hook names, its host row class and its labels are parameters of that primitive, not a reason to fork it.

#### Bulk edit panels

A bulk edit panel's CHROME renders through one shared panel-chrome primitive set that every browser imports: the panel container, its header eyebrow and Clear, the selected-count hero, the section headings with their inline-hint and standing sub-hint scales, the staged single-valued select, and the Apply action.
The noun-bearing strings (the hero's count sentence, the Apply label), the axes a studio stages, and the test and screenshot hook names are parameters of those primitives — what a studio STAGES is its own, the chrome around it is not.
A studio that hand-rolls its own header, hero, section scale or Apply is a second bulk-edit panel design and is not an acceptable rendering, however closely it copies the first.

A bulk-delete card renders through one shared primitive alongside that chrome, and the accessibility contract is a property of the PRIMITIVE rather than of each studio.
The subject row — the count of what is being deleted — always renders, while a consequence row whose count is zero is omitted rather than stated as zero.
The accessible name of each face contains its visible label, so a speech-input user can activate the control by saying what they can read; the impact statement is programmatically associated with the armed control rather than merely adjacent to it; arming is announced through a live region that exists in the document before it has any text, and disarming without confirming is announced through that same region rather than the region simply falling silent, because clearing a live region announces nothing and the control's accessible name changes under focus at the exact moment the GM stops hearing about it; and the control shows a distinct in-progress face for the duration of the write, driven by the caller's own in-flight state and never derived from the armed state.
A studio that hand-rolls a fourth delete card is a second design for the same affordance and is not an acceptable rendering.

#### Emptying a bulk selection

Every action that empties a bulk selection unmounts the panel it was performed from and, with it, the control that was pressed.
That is true of Clear — reachable both from the selection toolbar and from the panel header, one action by two routes — of a successful set delete, and of a successful Apply, on every studio that offers a bulk selection.
So each of them REPORTS the outcome and RE-HOMES the keyboard, and neither obligation is discharged by a notification: a toast is not a live region, and it moves focus nowhere.
Emptying the selection by unticking rows is not one of them: unticking the last selected row, and unticking the page control when the whole selection is on the page, both unmount the panel too, but the control that was pressed survives and keeps the keyboard, so neither reports nor re-homes anything.

The report is made through ONE polite live region owned by the manager rather than by any panel or card.
A card's own region can only close the half where the card survives — a refused or no-op write — because on the success path the region is destroyed by the very transition it would have to announce.
The manager's region exists in the document before it has any text, for the reason every live region in this specification does, and each announcement REPLACES the region's content node rather than rewriting its text, because re-inserting identical text announces nothing and clearing a selection twice running is an ordinary gesture.
A delete or an apply announces the same sentence it reports as a completion message, so the two audiences are told the same thing; a bare Clear announces a noun-free sentence stating that the selection was cleared.

Focus moves to the studio's TOOLBAR — the labelled landmark holding the filter rows and, as its last row, the selection register — which survives the transition the panel, the delete card and the toolbar's own Clear do not.
The target is INERT and made focusable solely to receive this hop, never an actionable control: landing the keyboard on a control means the GM's next keypress operates it, and the page-selection checkbox in particular would answer a press of the space bar by selecting every rendered row.
So the destination is a named region that says where the GM now is, leaves the space bar scrolling the page, and leaves the selection register a tab away.
Focus is moved only when the re-render actually dropped it — when it rests on the document body, or on a node the re-render has detached.
A GM who moved focus elsewhere while an awaited write was in flight keeps their place, and the same rule governs the delete card's own restore after a refused write.

The keyboard is moved FIRST and the sentence is announced BEHIND it, never the other way round and never in the same task.
A polite announcement is queued speech and a focus change cancels queued speech, so a sentence written into the region before the hop is a sentence the GM may never hear — which is the original silence, with a working focus hop concealing it.
When no focus move happens the sentence is announced immediately, since there is then nothing for it to queue behind.
This ordering governs every live region paired with a focus move in this specification, including the delete card's own outcome.

A bulk edit panel may render a sibling card after the shell.
Apply's dock then clamps to the panel's own box rather than to the rail's bottom edge, and that is accepted.
What is required is that Apply's border box stays wholly within the scrollport at every scroll offset; the guarantee holds while the sibling is shorter than the scrollport, and a sibling taller than it is a reachability failure rather than an accepted configuration.

#### Segmented controls

Every mutually-exclusive inline choice in the manager renders through one shared segmented-control primitive: real radios in a `role="radiogroup"`, visually hidden but focusable, with `<label>` segments as the visible surface.
A hand-rolled `aria-pressed` button group is a second design for the same affordance and is not an acceptable rendering.

The primitive takes two optional PER-OPTION fields alongside the existing icon (issue 975).
`variant` (`success` / `danger` / `neutral`) tints the ACTIVE segment only, defaulting to the plain active tile so a consumer that sets none renders unchanged, and an inactive segment keeps the muted track colour whatever it would become when chosen.
`neutral` IS that plain active tile and declares no tint of its own; it exists so a three-way good/neutral/bad control can name every segment rather than leaving the middle one's intent implicit.
`disabled` is carried onto the segment's radio INPUT rather than only onto a class, because the control's change handler guards only "the chosen value differs" and a dimmed-but-live segment would still emit a change; a disabled segment also suppresses the hover recolour, or it still reads as choosable.
Each rendered control takes a radio group name unique per CONTROL, since a host that renders two of them in one card would otherwise have the browser treat both radio sets as one group.

The primitive also takes an OPT-IN per-control icon-only variant (issue 1036) for an axis whose options are self-evident as glyphs, such as a list/grid presentation toggle.
It renders the same DOM as the labelled variant and differs only in CSS: the segment becomes a compact square tile and its label is CLIPPED out of view, never dropped and never removed from the accessibility tree, because the `<label>` IS the radio's accessible name and an icon-only track whose segments are anonymous to a screen reader is not an acceptable rendering.
The variant additionally titles each tile with that same label, which is the pointer equivalent of the name the clipped text already gives assistive technology; the labelled variant adds no such tooltip, since it would only repeat words already on screen.
Because the markup is unchanged, a per-option test or capture hook still resolves to the enclosing `<label>` in both variants — the click target a screenshot step depends on.

#### Icon vocabulary

THE VOCABULARY IS GOVERNED BY TWO GATES, NOT ONE, AND A GLYPH IS OFFERED ONLY WHEN IT CLEARS BOTH.
Foundry's bundled Font Awesome decides what a client can draw; Font Awesome's free release decides what Fabricate may NAME IN CODE.
`candle-holder` is the worked example of the second gate, run in reverse: Foundry renders it, a companion module's own Pro-bundled Foundry could draw it, and Fabricate does not offer it, because Font Awesome's free release does not publish that name.
Foundry ships Font Awesome Pro under Foundry Gaming LLC's own commercial licence, and that licence forbids a third-party package developer from using, re-packaging, or referencing a Pro-only icon IN CODE without their own Pro licence — a committed catalogue of names is exactly such a reference.
So the catalogue Fabricate offers from is the INTERSECTION of the glyphs Foundry's bundle can draw with the names Font Awesome's free release publishes, and the committed file records which free release it was narrowed against, so the guard that enforces the intersection can name the release it is checking.
Measured against Foundry's own bundle: 3768 of its classic glyphs are drawable at all, and 1420 of those also carry a free name and make up the catalogue.

The catalogue is a committed artifact because CI has no Foundry install to read, and a checked-in generator regenerates it from a given install so the derivation is reproducible rather than archaeological.
Both halves of the intersection move it, and separately: a Foundry upgrade means rerunning the generator against the new bundle, because names are added between releases and Font Awesome does retire and re-alias names between majors; a Font Awesome Free upgrade means rerunning it too, because Font Awesome promotes icons out of Pro and into the free release, and each promotion is a glyph Fabricate may now offer and does not until the generator runs again.

The first gate — what a client can draw — is measured from the stylesheet the RUNNING client actually loaded, never assumed from one fixed Foundry release.
Foundry serves its bundled Font Awesome as a layered `@import` inside an inline `<style>` rather than as a `<link>`, so the measurement descends `CSSImportRule.styleSheet.cssRules` as well as a sheet's own `cssRules`, and it skips a sheet it may not read — served cross-origin, behind a reverse proxy or a CDN, both supported deployments — rather than treating that sheet as empty.
That measurement FAILS OPEN, NEVER CLOSED: an empty or unreadable measurement answers with the committed catalogue rather than an empty picker, because a name this client's font cannot draw is a cosmetic defect in one row, while zero rows is an icon field a GM cannot use at all.
An empty measurement is never memoised, either, because it is reachable before the imported stylesheet has finished parsing rather than only from a client too old to have the glyph — a call made too early is retried on its next call instead of being frozen in for the rest of the session.

Every Fabricate icon picker offers ONE curated subset of that catalogue — 750 of its 1420 names today — and the test for membership is this.
IF A GLYPH SUITS ANY FICTION — fantasy, science fiction or general fiction — AND FOUNDRY CAN RENDER IT, IT IS AVAILABLE.
The question to ask of a new icon is never "would a dungeon have one", nor even "would a fictional setting have one", but "is there a story this picture belongs in".
A syringe is a med-bay; a stopwatch times a training montage; a dumbbell IS the training montage; a checkered flag ends a race, and has ended chariot races for far longer than it has ended motor ones; a blighted ear of wheat is the oldest fantasy plot there is.

The curation is therefore stated as what it leaves OUT rather than as a genre it is for.
Single characters and emoji reactions stay out, and four narrower things with them.
Glyphs whose meaning is a software affordance rather than a depicted object, such as editor controls, transport controls, file formats, chart types and the arrows that mean navigate.
Glyphs whose SUBJECT is a real-world institution, currency or cause — the currency SIGN glyphs, the pictograms of a present-day relief operation, party-political emblems, the symbols of an access provision — as against a gesture or a symbol a fiction is free to reuse, which stays in.
Present-day SIGNAGE: the pictograms that label a building rather than depict a thing inside it, such as a restroom sign, a no-entry sign or a parking P, while the bath, the toilet and the ambulance those signs point at stay in.
And redundant variants of a glyph the set already carries: a fill level, a needle position, a rotation, a status badge or a change of scenery adds a picker row without adding an idea.
What stays is ONE member per idea — the clearest glyph for it, plus any member of the same family that means something DIFFERENT rather than more or less of the same thing — and the steps between go.
So a thermometer keeps hot and cold beside the plain instrument while the seven that only redraw the same reading go, a battery keeps empty and full because a dead cell and a charged one are two conditions rather than two degrees, and a family of dials separated only by needle position contributes a single dial whether or not that dial is the bare code.
A crossed-out glyph is NOT such a variant: "no water" is a different statement from "water", not less of it.

That third exclusion is narrow deliberately, and it used to be much wider.
A clinical, pandemic, consumer-electronics, civilian-transport, fast-food and modern-sports exclusion once held out a syringe, a pair of lungs, a blender, a detergent jug, a plug, a stopwatch and a dumbbell as "present-day furniture no fiction is reaching for".
General fiction reaches for every one of them and science fiction reaches for the med-bay twice, so those exclusions do not survive the rule above and are gone rather than trimmed.

Membership follows what a glyph DEPICTS, never which Font Awesome release shipped it, because the release is not a fact a GM can see and the drawing is.
That admits the pre-modern commerce the curation once miscategorised as modern — coins, a merchant's shop, a warehouse — where a coin is admitted and a currency SIGN glyph is not, because the sign names a real currency and the coin names none.
It equally admits the ordinary objects Font Awesome happened to ship alongside the relief pictograms, such as a packed crate, the porters carrying one, a cooking burner and a borehole.
Weapons are admitted for the same reason, though what is left to admit under that rule has narrowed.
Font Awesome Free publishes no `sword`, `axe`, `dagger`, `mace`, `bow`, `castle`, `chest`, `crystal` or singular `coin` glyph, so it is the free-release licence intersection that removed those names from the catalogue, not a curation choice — the depiction rule still admits weapons, there is simply nothing left for it to admit under those spellings.
What Free still names and the weapons rule still admits: a gun, a bomb and a land mine.

A depiction cannot be dodged by SPELLING either.
Several names routinely share one glyph, so an exclusion applies to a glyph when ANY of its names matches: `automobile` is the same drawing as `car`, and a rule that caught only the name it happened to list would offer the picture it had just excluded.
Brands leave by the same principle and by measurement rather than by a list of company names: a logo is exactly a glyph that only Font Awesome's brands face draws.

AN EXCLUSION PATTERN OUTLIVES ITS MEMBERS.
A pattern is retained even when the free-release intersection leaves it matching no name currently in the catalogue, because Font Awesome promotes icons out of Pro and into the free release between versions, and a pattern deleted today would silently stop excluding the moment its members are promoted and the catalogue regenerated.
Nothing else would report that lapse: the exclusion that used to catch a promoted name is the very thing that would have vanished.

The vocabulary offers ONE ROW PER GLYPH, not one per name, and one weight.
Two names for one drawing is two picker rows for one picture, and Foundry's classic solid and regular faces carry an identical set of codepoints, so a regular row per icon would say the same things again at a lighter weight.
Neither choice refuses a name: every other name a glyph has is recorded on its entry, searchable, and resolves to that entry, so a GM who types `cog` finds the gear and a system that persisted `fas fa-cog` still selects the gear's row.
Which name is OFFERED is a presentation choice and not a claim about Font Awesome's canonical spelling, because the bundle cannot answer that — its multi-name selector lists are sorted alphabetically and carry no ordering information.

That curated set is the one vocabulary EVERY icon field in Fabricate draws from, with no per-surface exception, and it is constructed at exactly one site: the catalogue filtered by the exclusions.
A surface that hand-curates a second list has created a second vocabulary that drifts from this one, which is the defect this rule exists to prevent.
A name added BESIDE that filter rather than to the catalogue is worse still: the exclusions consult no catalogue, so such a name passes them and is then either absent from the set or present in it and absent from Foundry.
Its reach is wider than the manager's own screens: an environment's biome icons are chosen from this vocabulary and then rendered to PLAYERS on the gathering environment cards, so the set is part of what a player sees rather than GM-only chrome.
The full catalogue remains a separate module export, and no picker renders it.

Fabricate publishes that curated vocabulary on its module API as `game.fabricate.listCuratedIcons()`, so a companion module offering an icon field of its own draws from it instead of hand-curating the second list the rule above exists to prevent.
It is the same set, read from the one place it is constructed, so the vocabulary a companion reads and the vocabulary a picker offers are one set rather than two that have to be kept in step.
THE PUBLISHED VOCABULARY IS THE OFFERED VOCABULARY: the accessor answers from the same generation-aware set this client's own pickers offer — the committed catalogue on Foundry 14, a measurement of this client's own loaded stylesheet on every other generation, falling back the same way when that measurement is empty — never from a fixed catalogue that ignores what this client can actually draw.
A companion binding to the API and a GM opening a picker on the same client therefore see one vocabulary, not two that merely happen to usually agree.
Publication is one way — there is no setter — and the call answers with plain records carrying the name the vocabulary offers, its display name, and the other names that name's glyph answers to.
Each call builds those records afresh, down to the list of other names, so a caller may keep, sort or mutate what it receives without reaching anything a picker renders from.
The call throws before Fabricate is ready rather than answering with an empty list, because an empty vocabulary and a vocabulary that lost its contents are the same value and a caller cannot tell them apart.

Publishing those other names is a consequence of offering one row per glyph rather than one per name.
A record carrying only the offered name would be a lossy view of a deduplicated set, and what is lost is precisely what reads a value a GM already saved: a saved `fas fa-cog` names the row offered as `gear`, and a caller comparing offered names alone would report it unknown.
So `game.fabricate.findCuratedIcon(name)` is published beside the list and resolves a name — offered or aliased — to that row, answering `null` when the vocabulary does not offer it.
It does not distinguish a typo from a name Foundry cannot draw from a real icon the curation leaves out, because a caller can do nothing different about them.

Those two are the whole seam.
The full catalogue is not published: no picker renders it, so publishing it would invite a companion to offer icons Fabricate's own screens will not.
Neither is the exclusion predicate, and for the reason it is not the membership test — it consults no catalogue, so it reports a name Foundry cannot render as merely unexcluded.
Both published calls answer from the catalogue and cannot make that mistake.

#### Numeric entry

Every editable numeric field in the manager and in the interactable and component editors renders through one shared stepper primitive — a typeable `type="number"` input with `−`/`+` adjuncts, a clamp, and no native spinner — EXCEPT the documented non-conformances recorded below.
The exception clause is not optional decoration: two such fields exist today, so a rule stated absolutely would be falsified the moment it was written.
The Recipe Studio duration-unit requirement is an INSTANCE of this rule rather than a local exception of its own.
A bare `type="number"` with no adjuncts is a second numeric-entry design and is not an acceptable rendering: it inherits Foundry's host chrome, offers the browser's drawn arrows as its only pointer affordance, and shares neither the clamp nor the commit path.

The primitive is the point of arrival, so a hand-rolled `−`/`+` pair around a bare input does not satisfy this either, however closely it copies the shape.
A caller passes hooks and attributes through the primitive's attribute spread and behaviour through its change callback; a `disabled` state is the primitive's own top-level concern, because the adjuncts read it and a spread-only disable would leave them live on a control the caller believes is off.

**Unset numeric values.**
A numeric field whose domain admits "unset" — a DC override that inherits the system value, an unbounded modifier bound, an absent task node count, an absent max override — renders BLANK rather than zero, persists absence rather than `0`, and still offers its `−`/`+` adjuncts, which step from the field's lower bound.
Neither adjunct is disabled while the field is unset, because nothing is at a bound when there is no value.
A field whose blank rendering is merely cosmetic for zero is NOT such a field: `0` is its real persisted value, so it shows `0`.
The distinction is a domain fact and is decided per field from what the model stores, never from how the old control happened to look.

**Native spinner suppression.**
A numeric field's native spinner is suppressed IF AND ONLY IF the field carries another pointer-driven stepping affordance — the stepper's `−`/`+` adjuncts, or a sibling range track in the same control bound to the same value.
A field with neither keeps its spinner, because the arrows are then the ONLY pointer path to its value and hiding them would leave the field keyboard-only.
Suppression is therefore never expressed as a blanket `input[type="number"]` rule: every suppression names the specific control it applies to.

Two live non-conformances are recorded here rather than left to be discovered, because a rule whose exceptions are unwritten is a rule nobody can rely on.

- `src/ui/svelte/components/ChanceSlider.svelte` keeps a bare number input paired with its range track, and is a non-conformance to the FIRST rule only.
  Its range track is already a pointer-driven stepping affordance for the same value, so adding adjuncts would make three pointer paths to one number, and its `%` affix is absolutely positioned exactly where the `+` adjunct would land.
  It therefore keeps its own keydown handler, which is what preserves keyboard stepping there, and its spinner IS suppressed by a rule scoped to that control — the `iff` above reached through the range track rather than through adjuncts.
- `src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte`'s currency sub-unit amount keeps a bare number input AND its native spinner.
  It sits inside a bordered, filled currency chip with its own minimum height, and a bordered filled stepper inside a bordered filled chip widens every wrapping chip; a chip is not a form row.
  Keeping its spinner is the correct `iff` outcome rather than a lapse, since it has no other pointer affordance at all.

One known limitation is recorded with them.
An interactable's own node-pool `max` cannot express absence today, because `src/systems/gatheringNodeConfig.js` normalizes it to `0` on every write.
That field therefore renders `0` rather than blank and is treated as cosmetic-zero; making it genuinely nullable is a behaviour change to the node config, not a control substitution, and is out of scope for a control-substitution refactor.

## Responsive Product UI

Foundry ApplicationV2 windows can be resized independently of the browser viewport.
Responsive layout rules for application bodies must therefore be keyed to the app or shell container width, not only to viewport media queries.

- Use CSS container queries for application-specific narrow-window layout changes.
- The unified player application supports a 1024px minimum window width.
  At that floor, Inventory, Gathering, Crafting, Alchemy, and Journal use their named layout containers to enter one-column narrow mode when the container content-box inline size is 960px or less.
  Narrow mode retains automatic rows, normal vertical scrolling, and each view's existing 220px or 240px minimum column height.
- The GM `Environments` editor responds to the admin main container width: list/editor panes stack, nested task/result/catalyst layouts collapse, independently scrollable regions remain usable, and save actions stay reachable.
- The player `Gathering` app responds to its own app container width: active/history regions collapse to one column, task rows reserve icon width, and row metadata stacks without horizontal overflow.
- The player `Gathering` view's three columns (environments list, centre detail, right inspector) all carry the same non-zero minimum width so the centre column cannot collapse to nothing ahead of the side columns; the three columns scale down together proportionally as the window narrows.
  Below the combined three-column minimum the columns reflow into a single vertical stack so the view stays usable instead of clipping or overflowing.
- The player `Crafting` view's requirement rail responds to its own app container width: slot tiles wrap onto further rows rather than shrinking below their minimum tile size, and the essence pool's carrier and requirement bars reflow rather than crushing when a set carries three or more essence requirements.
- The unified Fabricate window enforces a 1024x640 minimum window size, derived from the gathering view's column minimums plus the navigation rail and chrome, so a resize can never shrink the window below the size where the columns would be clipped.
  §Player Navigation Extension states its no-horizontal-overflow guarantee at that floor.
- These responsive rules are presentation-only.
  They must not change crafting, gathering, inventory, alchemy, journal, validation, task visibility, attemptability, or persistence behaviour.

### Scenario: Minimum-width player app reaches every narrow layout

- **WHEN** the player application opens at its 1024px minimum width on Inventory, Gathering, Crafting, Alchemy, or Journal
- **THEN** the named layout container has a content-box inline size at most 960px and the rendered grid resolves to one column with its existing narrow-mode behaviour

### Scenario: View Lab capture detects a responsive regression

- **WHEN** a 1024px narrow View Lab case is captured locally or in CI
- **THEN** the capture runner verifies the declared content-box width and one-column computed layout before writing or publishing the screenshot

## Integration Points

### Items Directory

Add header actions:

- `Crafting` for all users.
- `Gathering` for all users, but only when at least one crafting system has `features.gathering === true`.
- `Manage Crafting Systems` for GMs only.

`Gathering` opens a dedicated gathering app.
It must not reuse the crafting app shell or route.

The `Gathering` button is hidden when no crafting system exposes gathering.

### Compendium Directory

Provide GM action to import all items from a compendium into a crafting system.
The action is a GM-only entry in the Foundry Compendium Directory context menu, offered on an Item compendium pack (the right-clicked pack is the compendium to import from) and hidden for non-GMs and for non-Item packs.
Choosing it opens a target-system picker where the GM confirms which crafting system receives the items, so the import is a deliberate commit rather than a single-click action.
The action reuses the existing bulk-import primitive and its de-duplication and update/skip reporting rather than reimplementing them.
Items with the same UUID or registeredItemUuid are de-duplicated on import.
If an imported Item's recorded canonical source UUID no longer resolves,
Fabricate falls back to the live dropped Item UUID.
Single item and replace-source
operations warn with the affected item and UUIDs; folder and compendium pack
imports emit one summary warning with the affected count.

## GM Crafting Admin

### Manager Shell

Manager is the GM crafting-system management shell.
It reuses existing admin data, persistence, validation, import/export, and destructive-confirmation behavior unless a later spec explicitly changes that boundary.

Header hierarchy:

- The top bar shows breadcrumbs, the current page title, optional concise subtitle, and page actions.
- The top bar must not render redundant eyebrow/kicker labels that merely repeat the current view name, such as `Systems View` above `Crafting Systems`.
- Section headers inside the page may use short contextual labels when they add information, such as selected object state, but they must not duplicate adjacent title text.
- A screen renders **one** page header.
  A view must not stack a second header of its own beneath the shell's, restating the system name the breadcrumb and the rail's crafting-system selector already carry.
- The page title is the manager's display type and carries the weight that buys; the page's single primary action (`Create …`) is taller than a row button.
- The page header holds exactly two blocks — the breadcrumb/title/subtitle heading and the trailing page actions — on every route.
  No route leads its header with a route glyph or identity tile of its own.

Selected-system rail:

- `GM management` is the first visible label in the expanded rail.
- The rail's crafting-system card is a **selector**, not a caption: an uppercase micro-label, a real `<select>` listing every crafting system, and an `All crafting systems` link back to the system library.
  The GM can switch system from the rail without a round trip through the system library.
- A compact collapse control sits at the top-right of that card, aligned with the `Crafting system` micro-label.
  The Tool library and Tool editor use this same shared rail branch; they never suppress the selector or collapse control.
- The selected system's name is set in the display face wherever it is named, including as the select's own value.
- The rail does not repeat the product name or a "workspace" caption; the rail's own `GM management` section label already says what the rail is.
- Rail count badges are **bare mono numerals**, right-aligned in the nav row — not bordered pills.
  They carry tabular figures so a count changing width (9 → 10) cannot move the row beside it.
- The 56px collapsed rail hides the crafting-system card's label, selector, return link and card chrome, plus the section label and count numerals.
  Its collapse control remains as the icon-strip expand control, so the rail is never trapped closed.

Narrow (stacked) layout:

- At or below the manager's stacked container width, the rail, main and inspector regions each keep **their own content height** and the body scrolls.
  They must not share the body's height between them: every region carries `min-height: 0` and clips its overflow, so an `auto` grid track would size each to a fraction of the body and silently render a browser's rows at full height inside a collapsed, invisible scroll box.
- The stacked rail is bounded and scrolls its own navigation, rather than becoming a full-height wall of nav above the content it navigates to.

Selected-system navigation:

- Manager must distinguish unready/loading Fabricate services from a true empty systems library.
  While Fabricate is still initializing or the recipe/crafting system managers have not finished loading persisted data, Manager shows a loading state and must not render `No crafting systems yet`.
- When at least one crafting system exists, manager v2 always has a selected crafting system.
  An empty or stale persisted selection resolves to the first available crafting system.
- When no crafting systems exist, selected-system feature tabs are hidden and the systems browser is the active management surface.
- When a crafting system is selected, `System Overview` is the first left-nav item and stays in that position regardless of feature gates.
- Feature-scoped left-nav items are visible only when their feature is enabled or otherwise available for the selected system.
- Feature-scoped routes that have been implemented must be enabled navigation controls, not disabled placeholders.
  If a route is still planned only, it may remain in the placeholder/deferred-view set.
- The Manager V2 selected-system `Crafting` nav group (recipes, crafting settings, access, books & scrolls, recipe item editor) is **unconditional**: it renders whenever a crafting system is selected, regardless of `fabricate.experimentalFeatures` (issue 745, the v1.3 headline).
  The only experimental-gated selected-system rail item is `Graph`: it renders as a disabled planned rail item with the `Soon` treatment **only** while `fabricate.experimentalFeatures` is enabled, and cannot become the active route until its v2 route content is implemented (#442).
  There is no `Recipes` placeholder rail item and no `Rules` rail item; the deferred-placeholder set is `graph` alone, shown only under the experimental toggle.
  The top-level `Checks` rail item — an expandable nav GROUP whose Crafting / Salvage / Gathering / Validation entries are rail CHILDREN owning the routes `CHECKS_VIEWS` declares, not tabs inside one view — and the `Tags & Categories` rail item are fully implemented and **not** experimental-gated.
  The one other experimental-gated rail entry is the world `Downtime` group, which is not a selected-system entry at all; see §Downtime Preview and Premium Extension, Experimental gate.
  "Sub-tab" names the five SECTIONS inside an activity route and must not be reused for these children.
  When `Recipes` is the active route, its `recipe-edit` subroute is treated as part of the Recipes route for navigation, breadcrumb (`Crafting` then `Recipes` then `Edit recipe`), and left-nav active-state purposes — the same sibling-subroute relationship the Essences route has with `essence-edit`.
- Every collapsible rail group — `Crafting`, `Checks`, `Gathering`, world `Travel`, and world `Downtime` — obeys ONE disclosure rule, and no group's disclosure depends on any other group's state.
  World Travel and World Parties own SEPARATE tab state, and neither can move the other's selection.
  One variable served both while Travel was a selected-system route, which is why opening Parties used to reach into the Gathering route's own active tab.
  The rule governs a group that renders; whether the world `Downtime` group renders at all is the separate experimental gate below.
  A group is expanded when the GM expanded it OR when the current view belongs to that group, and a group owning the current view is LOCKED open, because collapsing it would hide the screen the GM is standing on.
  That lock is the only exception to "any group collapses in any state", and it is stated on the control rather than enforced silently: a locked disclosure renders genuinely `disabled`, carries `aria-disabled`, and carries a tooltip saying the section stays open while the GM is on one of its pages.
  A control that accepts the click and does nothing is forbidden — that behaviour is indistinguishable from a broken chevron.
  Membership is taken over the group's route CATEGORY, so an EDITOR DETAIL ROUTE belongs to the group whose sub-item opened it and locks that group exactly as a rendered rail entry does: `recipe-edit` and `recipe-item-edit` lock `Crafting`, and `environment-edit`, `gathering-task-edit` and `gathering-event-edit` lock `Gathering`.
  A detail route is a sub-tab of its section, and the rule is uniform across all five groups — no group may release its disclosure the moment one of its own editors opens.
  The Tool Studio is the one context that does NOT lock: `Tools` is a top-level rail entry rather than a `Crafting` child, so its editor is not a `Crafting` sub-tab.
  Entering a sub-item both takes the lock and records the GM's intent, so navigating AWAY leaves a group exactly as the GM left it — expanded stays expanded, collapsed stays collapsed — and no route change may force a group closed.
  Entering the Tool Studio opens the `Crafting` group it presents under (its breadcrumb reads `<system>` then `Crafting` then `Tools`) as intent rather than as a lock, so that disclosure stays usable there.
  The rule reads no tab or route id belonging to one owner: the world `Downtime` group's children are the active provider's tabs, and a companion's tab set gets the same behaviour as Core's.
- The selected-system `Crafting` rail item is an expandable nav group modelled on the Gathering group, shown whenever a crafting system is selected.
  The parent row shows an expand/collapse control and the recipe count as its badge.
  Activating the parent item opens the Recipes browser by default and expands the submenu only when the active route is outside Crafting; when a Crafting child route is already active, activating the parent item must not navigate away from the current Crafting page.
  Its disclosure follows the shared rail-group rule above: locked open while any Crafting route is current, its editor detail routes included, and otherwise collapsible and left as the GM leaves it, including after the route leaves Crafting.
  The expanded submenu (built by `buildCraftingNavItems`) always contains `Recipes` and `Settings`, plus a **mode-conditional** entry derived from the system's `visibilityMode` (via `craftingEffect`): `Access` appears only in `restricted` mode (`showAccess`), and `Books & Scrolls` appears only in `item` and `knowledge` modes (`showBooksScrolls`); `global` mode shows neither.
  The submenu also contains a `Knowledge` entry whose gate is deliberately wider than the others': it is shown when `craftingEffect` grants `Books & Scrolls` OR the system's `resolutionMode` is `alchemy`, because `learnRecipeOnCraft` writes learned recipes under every visibility mode and under `global` alchemy they are the sole reveal source.
  A system can offer more than one mode-conditional entry at once: a `restricted` system whose `resolutionMode` is `alchemy` shows `Recipes`, `Access`, `Knowledge` and `Settings`.
  When the active Crafting route's owning entry is not in that submenu for the selected system, the manager redirects to the first mode-conditional entry the system does offer — `Access`, then `Books & Scrolls`, then `Knowledge`, in rail order — and to `Recipes` when it offers none.
  Because the `Knowledge` entry's gate is wider than the `Books & Scrolls` one, a `global` system whose `resolutionMode` is `alchemy` redirects to `Knowledge` rather than to `Recipes`.
  The target is resolved from `buildCraftingNavItems` with the same arguments the rail renders from, so the rail and the router cannot disagree about what is available.
  The availability test is taken over the entry that OWNS the active route rather than over the route id, so `Recipes`, `recipe-edit` and `Settings` are never redirected and `recipe-item-edit` follows its `Books & Scrolls` parent.
  This reconciliation is what makes both a crafting-system scope change and a `visibilityMode` edit safe: neither may leave the GM rendering a mode-conditional entry the selected system no longer offers, with no rail entry to return to it.
  The submenu sits inside the same soft grouped container the Gathering group uses, and it carries Gathering-parity accessibility: `aria-expanded`/`aria-controls`/`aria-current`, distinct expand and collapse labels, and unique `manager-nav-crafting` / `manager-crafting-submenu` / `manager-crafting-nav-<id>` ids.
  Route exit from any Crafting child route runs through the Manager confirm-discard route-exit guard.
  The reconciliation above is a read-time normalization rather than a navigation, so it does not itself invoke that guard; it does not weaken it either, because every in-app navigation path reaching the reconciliation has already passed the guard — a scope change maps an editor route to its browser and prompts before the switch, and a `visibilityMode` edit is reachable only from the unconditional `Settings` entry.
  The stated exception is a cross-client republish of the selected system: another connected GM's `visibilityMode` edit replicates to this client and re-projects the selected system, so the reconciliation can redirect away from the dirty `recipe-item-edit` editor — the only Crafting editor whose owning entry (`Books & Scrolls`) is mode-conditional; `Recipes`, `recipe-edit` and `Settings` are unconditional and are never caught — and discard its unsaved draft with no prompt.
  The redirect still wins over that draft, because withholding it for a dirty `recipe-item-edit` would leave the GM on exactly the entry-less route this reconciliation exists to prevent.
- The `Crafting` group's `Settings` sub-route (`crafting-settings`, component `CraftingSettingsView`) is a real system-settings page, not a placeholder.
  It hosts the system-level crafting rules that used to live on the System Overview page: the recipe **resolution mode** card, the salvage **resolution mode** card (only when `features.salvage`), and the **Recipe Visibility** card — a single radio-card selector for the flat `visibilityMode` enum (`global` / `restricted` / `item` / `knowledge`) written through `setVisibilityMode`, paired with a `CraftingEffectPanel` that summarizes what the chosen mode enables.
  The Recipe Visibility control no longer lives on the System Overview page, and it authors the flat `visibilityMode` rather than the legacy `listMode` + `knowledge.mode` pair.
  Because the `Crafting` nav group is unconditional (issue 745), these controls are reachable for every selected system, independent of `fabricate.experimentalFeatures`.
  Per-recipe-item use and learn caps are NOT on this page — each recipe item's caps are authored in its `recipe-item-edit` tabbed editor (or the quick-limit toggle in the `ItemPageInspector` aside).
- The selected-system Gathering rail item shows an expand/collapse control instead of an environment count.
  Activating the parent item opens the Environments browser by default and expands the submenu **only when the active route is outside Gathering**; when a Gathering child page or Gathering edit subroute is already active, activating the parent item must not navigate away from the current Gathering page.
  Activating only the expand/collapse control toggles the submenu without navigation.
  While a Gathering child page or Gathering edit subroute is active, the expand/collapse control is locked open under the shared rail-group rule above: it renders disabled and names the reason, instead of accepting the click and leaving the submenu expanded.
  The expanded submenu contains Environments, Tasks, Events, and Settings inside a soft grouped container that does not shift the parent Gathering row, icon, label, or expand/collapse control.
  The Gathering parent row remains visually neutral, and only the selected subsection uses the selected menu-item treatment.
  Gathering section navigation must not be duplicated as an in-page horizontal tab strip.
- The selected-system `Tools` rail item is a top-level entry rendered between `Essences` and `Gathering`.
  It is always visible when a crafting system is selected and is not gated by the gathering or essences feature flags, because tools are a cross-cutting crafting concept that will be referenced by recipes, salvage, and gathering tasks alike.
- After every selected-system navigation entry, including placeholders such as Graph, the rail
  always exposes a localized `WORLD` / `every system` presentation group containing a direct
  `Parties` destination with the total world-party count, and directly beneath it a direct
  `Currency` destination with the configured world currency-unit count.
  Both are UNGATED: neither is hidden by a feature flag, by the experimental gate, or by any
  crafting system's own toggles, and `Currency` in particular stays reachable when every system
  has currency switched off, because a GM authors the world's coins before a system opts in.
  World remains available with no system
  selected and across selected-system capability changes; the heading changes no aggregate ownership.
- `Travel` is a WORLD group, not a selected-system one (issue 1282).
  It sits inside the World navigation section beside `Parties` and `Currency`, and like them it is
  UNGATED: it is not hidden by any crafting system's toggles and stays reachable with no system
  selected, because a GM authors the world's geography before a system opts in.
  Its children are `Realms` and `Map Region Links`, and it starts collapsed.
  Activating Travel from outside a child expands it and opens Realms; activating it from either child
  preserves that child.
  Only the concrete destination carries `aria-current="page"`.
  Stable ids are `manager-world-heading`, `manager-world-scope`, `manager-world-nav-parties`,
  `manager-world-nav-currency`, `manager-world-nav-travel`, `manager-travel-toggle`, `manager-travel-submenu`,
  `manager-travel-nav-realms`, and `manager-travel-nav-map`, paired with `data-world-nav-section`
  and `data-world-nav-item` (`travel`).
  Both Travel controls reference `manager-travel-submenu`.
  Native buttons keep Enter/Space activation and normal tab order; closed children leave the tab
  order.
  In the 56px rail Parties and Travel keep localized accessible names, an active child is
  represented by the Travel parent icon, and a GM reaches children by expanding the persistent rail.
- Fresh Manager state leaves Crafting, Checks, Gathering, and World Travel disclosures collapsed.
  The Travel toggle changes disclosure only; its native Enter and Space activation exposes the child buttons without consuming a dirty-route guard.
  Activating Realms or Map Region Links is the guarded navigation.
  Activating the Travel parent from outside Travel is equivalent to choosing Realms, while activating it from an active Realms or Map route preserves that child and restores the expanded disclosure.
- World Travel transitions use the complete Manager route-exit contract.
  Cancel, a save callback returning `false`, and a rejected save keep the current dirty Gathering task/event and its selected system.
  A successful save or explicit discard permits the requested Realms or Map destination.
  A current World Travel route survives every capability, card and selection transition, INCLUDING
  disabling Travel & Realms on the selected system and clearing the selection entirely.
  That is the substantive change the move makes: the per-system toggle no longer evicts a GM from
  the authoring surface, because it no longer governs it.
  Switching between systems re-projects the environment realm controls and the Party override
  evidence, but never the realm library or the map links, which are world-global and identical
  under every selection.
  A current World Parties or World Currency route survives the same transitions, as before.
- World Parties has dedicated `WORLD / every system`, title, hint, and action-region names rather than inheriting Gathering Environments presentation.
  It remains fully operable without a selected system.
  Realms and Map Region Links likewise expose destination-specific visible titles, hints, action-region names, and inspector names; Party copy is not reused for either child.
- The World-derived navigation appearance is a shared Manager contract rather than a World-only exception.
  Every selected-system direct leaf, expandable parent, and submenu child receives the corresponding type scale, icon/count geometry, row sizing, neutral/hover/focus-visible/active/disabled treatment.
  World Travel uses one child level with the same full-width row geometry and content inset as Gathering; its expanded group uses Gathering's border, background, radius, and gap.
  The shared styling changes no route, disclosure, or ARIA semantics.
- **The trail has two roots, and neither is nested under the other.**
  A World route — Parties, Rules & Resources, Travel, Downtime — is rooted at `World`; every other route is rooted at `Crafting Systems`.
  World routes are `every system`, as the rail's own micro-label says, and Parties, Currency and Travel are each reachable before any crafting system has opted into anything, so a trail reading `Crafting Systems > World > …` states something false about the shape of the app.
- **Every trail is rooted, and every trail describes the path that was walked.**
  A trail SHALL begin at its root on every route, including a route whose header is drawn by a view of its own rather than by the shared one.
  A trail SHALL name each level between the root and the screen, so that a group with sub-screens names the sub-screen too — a trail that stops at the group reads identically on every screen the group contains, and a trail that skips the group describes a path the GM cannot walk.
- **A crumb that names a subject SHALL name that subject, not the kind of screen it opens.**
  Where a screen edits a named thing, its leaf is that thing's name, falling back to the type name only while the thing has no name yet.
  The title says what kind of screen it is, which the GM can already see; the trail is the only place that says WHICH one is open, so a leaf reading `Edit <type>` withholds the one fact only it can carry and renders every subject of that type identically.
  This governs the BREADCRUMB alone and does not disturb any ruling about what a page title or subtitle may carry.
- **A crumb is a control exactly when pressing it goes somewhere the GM is not.**
  An intermediate crumb that names a reachable screen navigates to it; the leaf does not, and neither does a crumb naming the screen already displayed.
  A crumb rendered as a control that cannot move the GM is worse than a label, because it invites a press that does nothing.
- The root `Crafting Systems` breadcrumb returns to the systems browser.
  The selected-system breadcrumb opens that system's in-manager System Overview route on its Settings tab.
  The `World` crumb opens the World route wherever it is not the trail's last crumb, and is inert on the World route itself.
- The selected-system rail scope uses the shared selector card described above.
  Activating `All crafting systems` returns to the systems browser without clearing the real selected-system store state.

Rail and count layout:

- The manager left rail can be collapsed to an icon-only strip to reclaim horizontal width for the middle content column; section navigation (System Overview, Recipes, Components, Essences, Tools, Gathering, World Travel, World Parties, etc.) remains reachable when collapsed via its section icons, and a localized, keyboard-reachable toggle control switches between expanded and collapsed.
  The per-client preference persists in `fabricate.managerRailCollapsed` (default expanded).
- The selected-system rail scope has stable geometry.
  Long system names are visually prominent but are capped or truncated before they can overflow the rail or move nav buttons below it.
- Systems library row status is an interactive on/off toggle button bound to the crafting system's `enabled` state.
  It is color-coded, keyboard reachable, and must not trigger row selection when toggled.
- Wherever a crafting system is shown in a picker or list (the systems library rail, the Interactable browser source picker, the interactable config source picker, and the Manage Interactables promote picker), two or more systems that share a display name must be visually distinguishable.
  A short, stable disambiguator (a leading crafting-system-id fragment) is appended to the display label of colliding names only; a system whose display name is unique is shown without a disambiguator.
  The disambiguation decision and the auto-defaulting picker's source-aware default selection are computed once in a single shared helper so every picker stays consistent.
- Count facts in the right inspector use a grid.
  Enabled facts render as an inline phrase that keeps the value and first label word together when wrapping, for example `3 Gathering` on the first line and `environments` on the next.
- Disabled feature counts are label-first with the disabled value emphasized, for example `Gathering environments Off`, not `Off Gathering environments`.
- Count fact labels wrap at word boundaries and are not clipped or ellipsized except where a fixed navigation/control region explicitly requires truncation.

Component browser display data:

- Component descriptions are display-safe plain text.
  Foundry-style description objects must be normalized from their textual fields, and unknown object-shaped descriptions must render as empty text rather than object coercion strings.
  A description ingested or repaired under this behaviour contains no unresolved directive text on any surface — the component browser (inspector and rows) and the player inventory listing alike.
  A world upgraded from an earlier version displays its stored text as captured until the GM runs the item-data repair; when unresolved directives are detected at startup the GM is told, once, where that action lives.
  A directive belonging to a game system that registers no enricher for it is left verbatim, except that an authored label is rendered in its place when one is present.
  Description surfaces that read a stored value perform no resolution of their own.
  When a description resolves to no text at all, the surface shows its existing "no description" fallback rather than a blank gap.

Environment browser layout:

- Environment browse rows use a wide scene-proportional thumbnail in the identity cell and do not include a separate linked-scene column.
- The task column renders the numeric task count only.
  Result and catalyst evidence belongs in the selected-environment inspector, not the browse row.
- Environment browse status uses the same compact on/off toggle pattern as systems rows.
- Environment browse row actions place edit, duplicate, and delete in a compact grid left of move-up and move-down buttons stacked at the top-right and bottom-right of the actions column.

Tabs:

- Systems
- Items
- Essences (only when enabled)
- Recipes
- Tags & Categories
- Checks (an expandable group whose children are the Crafting / Salvage / Gathering / Validation routes)
- Environments (only when the selected system has `features.gathering === true`)

### Systems Tab

Display list + detail editor for crafting systems.

#### Base Fields

- Name
- Description
- Recipe resolution mode (`simple`, `routedByIngredients`, `routedByCheck`, `progressive`, `alchemy`)
- Salvage resolution mode

Recipe resolution mode and salvage resolution mode remain system fields, but their editor cards moved to the Crafting group's Settings page (`crafting-settings`).
They are no longer edited on the System Overview page.
Changing recipe resolution mode is destructive and must follow `destructive-changes-and-migrations/spec.md` confirmation/cleanup rules.

#### Salvage Resolution Mode Card

The Salvage resolution mode card renders after the Recipe Visibility card (which itself sits below the recipe resolution-mode card) on the Crafting group's Settings page, and only when `features.salvage === true`.
The card offers `simple` (the default), `progressive`, and `routed` (display name "Routed by check").
Salvage has exactly one ingredient, so ingredient-set routing is meaningless and `alchemy` does not apply: neither is offered.
`simple` returns one result group with an optional pass/fail salvage check.

The card SHALL render with the system's persisted `salvageResolutionMode` selected, defaulting to `simple` when the value is `simple` or absent.
Persistence happens only on an explicit GM selection through `setSalvageResolutionMode`.

Changing salvage resolution mode is non-destructive for recipes and runs (it deletes none), but switching into `simple` mode drops surplus result groups on incompatible components via the normalizer's success-first retain-one clamp (see `data-models/spec.md` Component Requirement 5) and reversibly disables salvage on components that still cannot satisfy the new mode.
A switch into `simple` that drops a component's surplus success groups SHALL emit a `ui.notifications.warn` naming the affected component(s).
The confirmation/warn copy is salvage-accurate — it discloses the group deletion and is not the recipe-deletion warning.

In `simple` salvage mode the component salvage editor is capped at one success result group: the Add group affordance is removed and a required visible hint ("Simple mode uses a single result group") is shown, matching the recipe editor's `data-recipe-result-simple` single-group treatment.
The cap counts success groups (`role !== 'failure'`) and does not filter, blank, or destroy a legacy reserved failure group's stored data.
Routed keeps its multi-group list and Add group; progressive is unchanged.

#### Feature Toggles

- Gathering: persists `features.gathering` and makes the selected system's gated `Environments` tab reachable when enabled.
- Salvage (`features.salvage`): GM toggle, default on — an absent key defaults true, a present key must be exactly true; gates the salvage subsystem (the `checks-salvage` route, resolution-mode card, component editor, validation, runtime, and player salvage panel).
- Chat output (`features.chatOutput`): GM toggle, default on; hint "Posts a summary chat card after crafting and gathering attempts." — gates the crafting, salvage, and gathering result chat cards.

#### Feature Controls

- Category list editor for custom categories only; reserved `General` is always present and not removable
- The Tags & Categories screen is a tabbed screen over the three independent vocabularies — recipe categories, component categories, and item tags — with one vocabulary per tab and a per-tab count badge.
  Each tab has its own search plus a shown-count chip, a live-validated add form (tone-graded info / success / danger hints as the GM types: lowercase-normalization preview for tags, `General` reserved, duplicate detection, ready-to-add), and a redesigned row carrying a per-category icon, `#`-prefixed tag names, a "Built-in fallback" subtitle on the locked General row, an `N references` / `Unused` / `Locked` badge, and an inline delete-confirm strip for the destructive cascade.
  A recipe or component category may carry a persisted per-category icon, edited inline from its row.
- The screen has a right inspector rail: a "Vocabulary at a glance" tile set (recipe categories, component categories, item tags, total references), contextual "How it works" help, and a "Reference-safe by default" reassurance card.
  The total-references tile sums all three vocabularies, and a tag's reference count includes the recipe tag-placeholder ingredients that name it, not only the components carrying it.
  **Known defect, recorded rather than implied correct (issue 1191):** every reference count on this screen is taken over the recipe and component cohorts as the two library searches currently filter them, not over the system's roster.
  A recipe or component that an active library search excludes therefore contributes nothing, so a vocabulary entry can read `Unused` while the system still references it — and an `Unused` row deletes in **one click**, because the confirm strip's copy reassigns references and is skipped for a zero-reference row.
  The intended contract is that `Unused` means unused _in this system_; issue 1081 preserved the existing cohort deliberately rather than change a rendered number under a performance heading.
- Item tag list editor
- Essences toggle (`features.essences`)
- Property macros toggle (`features.propertyMacros`)
- Effect transfer toggle (`features.effectTransfer`)
- Time requirements toggle (`requirements.time.enabled`): GM toggle, default on — an absent key defaults true, a present key must be exactly `false` to disable.
  It renders as a tile in the System Settings Optional features section (beside the currency toggle) and gates the recipe Duration surfaces (the single-step Duration card and the per-step duration editor) and the application of recipe/step durations at craft time.
- Currency requirements toggle (`requirements.currency.enabled`) — the system's ONLY currency control; the unit profile is world scope and is authored under World > Currency
- Multi-step recipes toggle (`features.multiStepRecipes`)
- Gathering toggle (`features.gathering`)
- Salvage toggle (`features.salvage`, default on)
- Chat output toggle (`features.chatOutput`, default on)

#### GM Checks Studio

`Checks` is an EXPANDABLE left-rail group whose children are Crafting / Salvage / Gathering / Validation; salvage and gathering appear only under their feature flags.
Each activity child carries an issue-count badge derived from `evaluateCheckReadiness`; the parent badge sums the three ACTIVITY children only, and Validation's badge is that same total restated and is never added to it.
The rail's badge column carries THREE distinguishable things and they must not be confusable: a record-count numeral (`Gathering 69`), an issue badge in a distinct pill treatment with an accessible name naming the unit ("1 issue"), and a per-activity DIRTY marker distinguished from the issue badge by shape and accessible name, not by colour alone.
The shipped Essences rail item and the `.manager-rail-toggle` collapse control both survive; a collapsed rail renders the group's parent icon with its issue badge and expands on activation.
`checks` is retained as a redirect to the first available child so existing deep links and every View Lab `expectView` assertion have a defined answer.
`CHECKS_VIEWS` values ARE the `data-manager-view` strings the root renders, not nav-item ids.

Each activity route renders FIVE sections — The roll / Outcomes / Triggers / Modifiers / On failure — each with a count badge and a warning dot fed from the same readiness evaluation that feeds the rail badge and the Validation route, so the three can never disagree.
The warning dot carries a text accessible name, and a section carrying both a count and an issue renders both; a count of zero renders unbadged, because five sections each wearing a `0` is chrome rather than information.
The dot is EXPLAINED IN THE PANEL: the open section renders the shared `Callout` for each of its own issues, carrying the same sentence the Validation route renders for that issue id from one exported copy map, toned `warning` for an issue that blocks enabling and `info` for one that does not.
A dot whose only explanation is on another route is a signal with no legend, and two surfaces describing one issue from two copies of the sentence is how they come to describe it differently.
The section strip is a real ARIA tablist driven by Arrow, Home and End, and only the SELECTED tab carries `aria-controls`, because only the selected section's panel is in the document.
Outcomes renders in EVERY mode and hosts that mode's own outcome model: the two-outcome pass/fail statement on `simple`, the `awardMode` selector on `progressive`, the band strip plus the tier rows on `routed`.
Its count badge is emitted only where there is a tier list to count, so `simple` and `progressive` render it unbadged.
Modifiers renders in every mode too, INCLUDING the two that roll nothing — gathering `d100` and alchemy `none` — because the modifier card is the one owned path for reporting that a selection reaches no roll, and hiding the section it lives in would take that report away from the two states that need it.
Any section that cannot apply renders the shared `EmptyState` naming the mode, preserving the shipped d100 explanation rather than blanking the route.

A check that is switched off — the route has a LIVE Active toggle and it is not on — collapses the strip to a single section and renders the shared `EmptyState` with a "Turn this check on" action; its right rail keeps the documentation/quickstart pair, the activation card and an `OFF` digest.
"Switched off" is not `optional && !enabled`: `optional` does not mean the same thing per activity (on gathering it is `mode === 'd100'`, the one mode with no toggle at all), so the predicate is stated per activity and gathering `d100` is INERT rather than off.
Alchemy `checkMode: "none"` is the opposite case and is OFF, not inert: it is what the Active switch writes when the GM turns an alchemy check off, so it takes this same collapsed panel and its "Turn this check on" action.

The right rail is an INDEPENDENTLY SCROLLABLE container in the SIDE-COLUMN STATE ONLY, never a pinned column that clips.
On an activity route it carries, in order: the documentation/quickstart pair, the activation control, a "Preview as" panel, an outcome-preview simulator, a per-outcome odds histogram, and a "This check" digest whose status chip reads `OK` / `OFF` / a count pill.
Where the resolution mode denies the GM the choice, the activation control renders a LOCKED READING of the switch — the same track and knob, a padlock and the hint — not the hint alone: removing the control removed the state with it, and "this mode requires the check" does not say which way the switch is set.
The locked reading is always ON, because every mode that hides the switch rolls its check.

**Every Active switch STAGES.** Flipping one marks its activity dirty, enables the shared `Save checks`, is guarded by the route-exit prompt, and is restored by Discard; nothing is written on the click itself.
This holds for all four activities, so one affordance does not mean two different things depending on the route in view.
Crafting (non-alchemy), salvage and gathering stage their check's `enabled` flag; an ALCHEMY crafting check stages `alchemy.checkMode` instead (`simple` on, `none` off), because that is the value its engine path dispatches on and `craftingCheck.enabled` is ignored for alchemy.
Each activity's save writes its Active flag before its slot draft and ANDs both answers, and each slot write is guarded on that slot's own dirty flag so a switch-only save does not rewrite an untouched formula block.
The reading is derived from the MODE rather than from the persisted `enabled` flag, since a mandatory check runs whatever that flag says; it reads on for every locked mode except alchemy `none`, which rolls nothing.
The Preview-as panel carries an ACTOR selector and a RECORD selector, and both are real controls with a simulator behind them.
"Preview as" offers UNFILTERED `game.actors` — the Studio is GM-only and a GM's `Document#isOwner` is true for every actor, so the player-side "assigned character OR owner" union would hide actors a GM can legitimately preview against — plus an explicit "No actor" option, under which every `@` key resolves to `0` and the panel renders the unresolved warning rather than a total.
The RECORD is the same selection the Outcomes section's band strip is drawn against: a check's own default DC first, then every authored recipe tier.
In PROGRESSIVE mode the record selector is replaced by the progressive preview sandbox's ordered-difficulty field, because a record's whole contribution is a DC and a progressive check has none.

##### Outcome-preview simulator

The simulator DRIVES THE SAME RUNNERS the engines drive and reimplements no resolution: tier matching, forced outcomes and tier stepping have exactly one implementation, which is `src/systems/checkRoll.js`.
A preview that disagreed with the engine about which tier a roll lands on would be worse than no preview at all.
It rolls with a NULL interactive-roll bag, so it posts no chat message, shows no prompt and mutates nothing: all three runners spread `rollOptions` and `{...null}` is `{}`, the chat post is gated on `options?.interactive`, and `allowInteractive: false` bypasses Foundry's manual-fulfilment resolver.

**It NEVER executes a DC macro.**
For `dcMode: 'dynamic'` it resolves the STATIC fallback DC and renders a stated "resolved by macro at craft time, not previewed" note.
The engine reaches a dynamic DC by calling `MacroExecutor.run`, which compiles `macro.command` into an `AsyncFunction` and executes it with the current user's authority, guarded only by `typeof command === 'string'` — which is NOT a script-type check, because Foundry declares `type` with `initial: CONST.MACRO_TYPES.CHAT` and `command` as `required: true, blank: true` on both types, and the shipped `ItemDropZone documentType="Macro"` accepts any Macro.
A DC macro that creates a `ChatMessage`, updates an Actor or writes a flag must not be able to do so from a preview button.

It renders only values present on the returned result, never a parallel model: the rolled die face on a `Medallion`, the TERSE breakdown line (`d20 9 +10 · Sera Vane` — the full resolved formula is the `THIS CHECK` digest's row), the total against the DC with its margin, the matched band card with its disposition, and a "What happens" list of icon fact rows including tier-step and minimum-tier evidence.
It surfaces `resolved === false` — the signal `resolveCheckFormulaDisplay` already produces by re-resolving with `missing: 'NaN'` — as a stated "does not reduce to a number for this actor" warning, because `Roll.parse`'s own `missing: "0"` silently turns an unresolved `@` key into a plausible WRONG total, and "renders only values present on the result" does not catch that, since the wrong number IS on the result.
It treats `Actor#getRollData()`'s live `system` object as read-only and clones before any local augmentation.
A rolled readout describes ONE (formula, actor, record) tuple and is DROPPED when any of the three changes, because a total no current configuration produces must not stay on screen.

##### Per-outcome odds histogram

The histogram ENUMERATES the faces of the formula's single die group and buckets each one through the SAME classifier `runFormulaRouted` uses, extracted as `classifyCheckTotal` so resolution and preview cannot drift; a pass/fail check buckets through the same forced-outcome resolution plus the comparison, and a progressive check through the same `resolveProgressiveAward` loop the engines award through.
There is no sampling and no `Math.random`.
The per-face dice bag is produced by the EXISTING `rolledDiceGroups` code path, not hand-shaped, because `resolveForcedOutcome` and `applyTierStepTriggers` both read `data.diceGroups` and a bag missing `results` makes every natural-20 trigger invisible to the histogram while still matching a hand-computed distribution for a trigger-free check.

**Its predicate is a POSITIVE WHITELIST over `Roll.parse`, not a string scan:** exactly one die term with `modifiers.length === 0`, `number === 1`, an integer `faces >= 1` and a NUMERIC denomination, with every remaining term deterministic and no `StringTerm` present.
A string scan admits formulas face enumeration cannot describe — `2d6` is one die group with a triangular distribution, `1d6x` has unbounded support, `1d20r1` reweights, `1d20min2` clamps, `cs`/`cf`/`ms` change what `total` means, `1d(1d4)` leaves `number`/`faces` undefined, and `1df`/`1dc` are non-numeric denominations.

**Three properties of `Roll.parse` are load-bearing and are stated rather than assumed.**
(1) **It throws.** The compiled peggy grammar raises a `SyntaxError` and `Roll.parse` does not `try`, so every intermediate keystroke of a mid-edit formula (`1d20 +`, `1d20 + (`, `max(1d20,`) throws out of any predicate built on it; the call is WRAPPED and a thrown parse is a not-enumerable OUTCOME, never an escaped exception.
(2) **`missing: "0"` blinds it.** `Roll.parse` runs `replaceFormulaData(formula, data, { missing: "0" })` first, so an unresolved `@` key becomes the literal `0` and parses cleanly — the unresolved-roll-data refusal is therefore read from `resolveCheckFormulaDisplay`'s `resolved === false`, not from the parse.
(3) **Determinism must recurse, and a `StringTerm` lies.** `RollParser.flattenTree` only recurses into `node.class === "Node"`, so a parenthetical, function or pool term is pushed whole and `Roll.parse('1d20 + (2d6)')` yields exactly one top-level die term with hidden randomness inside; a top-level class scan would call it enumerable and draw a histogram that lies.
Determinism is therefore judged by Foundry's own recursive `term.isDeterministic` — but `StringTerm#isDeterministic` returns `true` for an unresolvable string that then throws at evaluate, so a `StringTerm` is refused explicitly, and it is told apart from a `ParentheticalTerm` (which also carries a string `term`) by the fields only a parenthetical has.

**Every refusal carries a discriminated reason code** — `parse-threw`, `no-dice`, `multiple-die-groups`, `die-modifiers`, `non-unit-count`, `non-integer-faces`, `non-numeric-denomination`, `non-deterministic-remainder`, `string-term`, `unresolved-roll-data` — so a refuse-everything predicate is distinguishable from a correct one and the panel can say WHY rather than only that it abstained.
`non-numeric-denomination` is stated separately from `non-integer-faces` because a `FateDie` reports `faces: 3` and a `Coin` reports `faces: 2`: both are integers, and calling either "not an integer" would be a false statement in the panel.
A formula whose only die sits inside a parenthetical, function or pool term refuses as `non-deterministic-remainder` rather than `no-dice`, which is reserved for a formula that really is all arithmetic.
Anything outside the shape renders a stated note rather than an approximation: a histogram that lies is worse than one that abstains.
The caption is COMPUTED from the enumerated space, never hard-coded — a `1d12` check reads "all 12 faces".

**The histogram, the `avg` annotation and the simulator MUST describe ONE formula, and it is the formula the RUNNER rolls.**
The preview arg-builder hands the runner an AUTHORED formula plus a check-modifier context, and the runner appends the resolved scalar itself — so a derivation that describes the roll without that context describes a formula nothing rolls.
The append therefore has ONE implementation and ONE composition (`resolveRolledFormula`: the retired-placeholder shim, then the modifier append), which the runner, the display resolver and the enumerator all ASK FOR rather than rebuild.
A second composition is free to drift, and drift here is a histogram spanning `1..20` beside a readout rolling `5..24`, for the same check, at the same moment.
It is applied exactly ONCE: the appended formula is then resolved for display with the context omitted, exactly as the runner does, so the scalar cannot land twice.

The TOOL bonus is appended ABOVE the runner — by the engine on a real craft and by the preview arg-builder on a preview — and the runner appends none of its own, so the preview matches the engine's shape and the enumerator layers only the modifier on top.
The SITUATIONAL bonus is unreachable from a preview at all: it lives behind `interactive === true`, and a null roll-options bag spreads to `{}`.
Because a system with an empty catalogue resolves a ZERO scalar and makes the append a no-op, this rule MUST be exercised with a non-empty catalogue and a non-zero resolved scalar or it is graded vacuously.
Progressive checks bucket by AWARD COUNT and OMIT a count no face can reach, while an award of nothing is listed wherever it is reachable.

###### The progressive preview sandbox

A progressive check awards by spending its rolled value down an ORDERED list of result difficulties, so its histogram cannot be drawn without one — and that order is SANDBOX STATE ON THE CHECK, at `progressive.preview.difficulties`, typed by the GM for one experiment.
It is NOT derived from a recipe's `resultGroups[].results[].componentId` → `system.components[].difficulty` chain, and it is not a player's stored order or a GM's configured values.
The Studio's subject is the CHECK: the simulator previews what a check DOES, not what some recipe will do with it, which is also why a Preview-as record supplies a DC rather than an outcome and why the record selector is replaced by this field in progressive mode — a record has nothing to offer a check with no DC.
It does not have to be plausible; it has to show the correct behaviour, which it does because the enumerator spends it through the same `resolveProgressiveAward` loop crafting, salvage and gathering all award through.

Five properties are load-bearing.
It is PERSISTED on the check block, so a GM's experiment survives a reload, which means every allowlist rebuild the block passes through MUST emit it or the next save drops it silently.
NO ENGINE PATH READS IT: deleting the key changes no runtime behaviour, because it is scratch and not configuration.
READINESS NEVER VALIDATES IT: it raises no readiness issue, badges no section dot and blocks no enable, and a nonsensical or negative order is the GM's business rather than a validation target.
EXPORT STRIPS IT, for the reason `import-export` states.
And it is ABSENCE-PRESERVING and ORDER-PRESERVING: an absent list means no experiment has been run and is not the same as an authored empty one, the order IS the datum and nothing sorts it, and an entry that does not reduce to a finite number is not STORED — a persisted `NaN` round-trips through JSON as `null` and reads back as a perfectly finite `0`, which would silently make the experiment mean something else after a reload.
The field itself keeps the GM's raw text while they type rather than echoing the stored numbers back, so a separator or a half-typed word is never rewritten under the cursor.

An empty sandbox renders its own stated sentence NAMING THE FIELD that fills it, and that sentence is not one of the enumerability refusal codes: those all say the formula cannot be charted, and this one says the opposite — the formula is fine and the experiment has not been typed yet.
Bars render through `FillBar`, flat.

The View Lab's `Roll` double carries a `parse` static whose term shape is derived from RECORDED real-Foundry output, because the lab's `Roll` otherwise exposes only `replaceFormulaData` and `validate` and every render of the histogram panel would throw — and one bad case fails the capture job whole, publishing nothing.
A capture job that fails whole now surfaces as a FAILED evidence gate rather than as silent stale evidence: the gate reds instead of passing on the previous head's frames, so the bad case is visible as the failure it is.
The panel additionally guards a missing or throwing `Roll.parse` as a not-enumerable result rather than a throw.

An `avg N` annotation on the formula field renders the expected value of the PREVIEW formula for the previewed actor and is OMITTED whenever that formula does not reduce to a number.
It is deliberately LOOSER than the histogram's predicate — it answers for multi-group and modified formulas the histogram abstains from — because it is an annotation on a field the GM is typing in rather than a claim about a distribution.
Its responsive behaviour reuses the SHIPPED `fabricate-manager` container ladder and introduces no new breakpoint: `styles/fabricate.css` already declares that container with blocks at 1320 / 1120 / 960 / 900 / 831 / 680, and `.fabricate-manager .manager-inspector` already carries `overflow-y: auto; max-height: 100%`.
At the existing 1320 breakpoint and below, the odds histogram and the simulator readout become collapsed disclosures, headers and counts retained.
At the existing 1120 breakpoint and below, the shipped rule already restacks `.manager-body` to one column with `grid-auto-rows: max-content` and hands scrolling to the body; the rail's own `overflow-y` / `max-height` is LEFT ALONE there, because that block unsets neither and a `max-content` track cannot be squeezed.
The constraint is instead that `grid-auto-rows: max-content` MUST NOT be defeated and no `.manager-body` child may carry a definite height — that is the measured regression recorded above that block (issue 643: rail 225px, main 200px, inspector 179px, `.manager-table-scroll` squeezed to 24px), caused by zero-min-content children under implicit `auto` rows.
At the 1024x640 declared floor the layout is therefore STACKED, not a side rail, and every panel is reachable by scrolling `.manager-body`.
That requires the studio's own workspace to restack there too, and a container query adds NO specificity — so an override inside one that ties with a base rule declared later in the sheet loses on source order and is dead.
The workspace's column track is therefore set through a custom property the base rule reads and never declares, which cannot tie whichever order the two are read in; a source-text assertion cannot tell a dead rule from a live one, so this is pinned by measuring the rendered grid at the floor.

The Validation route renders the documentation pair and the "All checks" summary ONLY — no activation toggle, no Preview-as, no simulator, no histogram, no This-check digest — and renders no section strip.
Validation renders through the shared `EditorValidationSurface`, selecting an issue deep-links to the owning activity AND section, and the issue-id to section map is proven exhaustive against the frozen `CHECK_READINESS_ISSUE_IDS` registry `evaluateCheckReadiness` pushes from — never a hand-copied list.
A deep link is an EVENT with its own identity, not a standing instruction: the route carries a request nonce the section strip latches on, so the same section requested twice is two requests and the second still lands.
Latching on the section VALUE strands the repeat — leave the requested section, ask for it again, and the request equals the latch and is swallowed — and not latching at all drags the strip back to the standing request the instant the GM clicks anything else.

The draft model lives ABOVE the route: one dirty set across the four activities, one plural `Save checks` that persists every dirty activity, one system-wide `Unsaved` chip plus the per-activity rail markers, drafts preserved across Checks child routes, and a discard confirmation on leaving a dirty Checks route for a non-Checks route.
That confirmation is `confirmDiscardDirtyChecksDraft`, built on the shared `_confirmDiscardDirtyDraft(contentKey, contentFallback, replacements)` helper seven of the nine existing draft prompts use, which returns `'save' | 'discard' | 'cancel'` by construction; it takes the three-way "save and continue / discard / cancel" shape the system-details variant uses, and it NAMES which activities are dirty.
The rail badges, the section dots and the Validation counters read the LIVE draft and are a draft PREVIEW; the ENABLE gate reads COMMITTED state, and the Validation hero renders the unsaved condition explicitly rather than claiming "Ready to enable" for state that is not persisted.

The readiness mode an activity is evaluated under is derived from the SLOT `checkModifierResolver` resolves — the sub-config the engine actually rolls — and never from a second mapping over the authored resolution mode.
The evaluator branches on `'routed'`, which no subsystem's authored mode ever is, so passing the raw mode through skipped every outcome-tier rule for the one mode that has them; and a second mapping beside the resolver's disagreed with it for alchemy at `checkMode: 'tiered'`, so the rail badge evaluated the unused SIMPLE draft under ROUTED rules.
The slot also chooses which draft is edited, marked dirty and saved, so the check being evaluated and the rules it is evaluated under are one decision.
A slot of `null` — a mode that rolls NO check, which is alchemy `none` and gathering `d100` — is its own readiness mode, evaluating only whether an authored check-modifier selection reaches a roll; it must never report a missing roll formula, because the route renders no formula field with which to clear it.
The evaluator REFUSES a mode outside its own vocabulary rather than defaulting to `simple`, since a default is what made the mismatch silent.

A Validation group with no ticks and no issues states "No issues detected." rather than rendering a heading over nothing; the group is never dropped, because absence reads as "this subsystem was not evaluated".

A `Save checks` that does not land BLOCKS the route exit it was raised for, matching the shipped essence and system-details guards: every dirty activity is still attempted, the answer is the conjunction, and a failed activity keeps its draft dirty.

A check is usable iff its mode carries an authored `rollFormula`; the legacy check-source/macro layer (`macroUuid` / `successMacroUuid` / `failureMacroUuid` / `checkSource` / `builtIn`) was removed by migration 1.8.0 and is not authored.

- Enable checks (the on/off toggle for the optional simple-mode check)
- Roll formula, DC, and tier controls per mode (`simple` / `routed` / `progressive`)
- The simple-mode dynamic-DC macro (`craftingCheck.simple.macroUuid`) — the one surviving check-adjacent macro (it only computes the DC)
- Failure consumption policy — two live-persisting toggles on the **On failure** section of the non-alchemy `checks-crafting` route, editing `craftingCheck.consumption.consumeIngredientsOnFail` (default `true`; whether a recipe's ingredients are consumed on a failed crafting check) and `craftingCheck.consumption.breakToolsOnFail` (default `false`; whether required tools break on a failed check — the 1.7.0 rename of `consumeCatalystsOnFail`).
  The engine applies this policy on every failed crafting check; it is NOT shown in alchemy mode, where consumption is governed by the distinct `alchemy.consumeOnFail` flag.
  Salvage failure consumption is a separate, independently-defaulted policy read from `salvageCraftingCheck.consumption` (`consumeComponentOnFail`, default `true`; `breakToolsOnFail`, default `false`) that this crafting control does not change.
- Optional routed outcomes reference list (for GM guidance only; not a routing map)
- Progressive settings (`awardMode`) (progressive only)

For a `routedByCheck` system whose routed check `type` is `fixed`, the tier `CraftingCheckEditor` hides the DC field and the meet/exceed comparison, because fixed tiers match by explicit value range rather than against a DC.
The DC-hiding note applies to `routedByCheck + fixed` in the `CraftingCheckEditor` only; the DC and comparison stay shown for relative-type `routedByCheck` and for the salvage/gathering check editors.
`routedByIngredients` no longer renders the tier `CraftingCheckEditor` at all — it authors its optional pass/fail check via the shared `SimpleCraftingCheckEditor` (bound to `craftingCheck.simple`), which shows the DC, the meet/exceed comparison, the static/dynamic DC source, and the recipe DC tiers.

Mode semantics are defined in `resolution-modes/spec.md`.
There is no check-wide tier-stepping toggle: stepping is authored per trigger in the `CheckTriggers` editor below, and the retired routed `natStepping` card has been removed from the crafting and salvage editors.

##### Check Trigger Controls

All three check editors (simple, routed, and progressive) ALWAYS render a single unified `CheckTriggers` editor (issue 419 recombine) — one trigger list per check, replacing the former separate per-die crit table and tool-breakage trigger card.
Each trigger pairs an expressive dice-matching condition with three effects (issue 975): an outcome segmented control, a routed tier-step row, and (under `checkDriven` authority) a break-tools pill.

- The outcome control forces the check to Automatic success / Automatic failure / No effect (relabelled Award all / Award none / No effect on a progressive editor, reusing the existing award keys), and is disabled + pinned to No effect for an `outcomeTier` condition.
  It is a three-segment button group, not a `<select>` — it is rendered through the shared `SegmentedControl` primitive with a per-option `variant` tinting the active segment success/neutral/danger.
  The `outcomeTier` pin is carried on the segment's radio INPUT (`disabled`), not merely as a dimmed class, so the pinned segments are genuinely non-interactive.
  Outcome forcing applies under BOTH authorities.
- The per-trigger break-tools pill (and the routed per-tier `outcome.breakTools` column) renders ONLY under `checkDriven` authority (`showBreakTools={checkDriven}`); under `toolSpecific` it is hidden and a check never breaks tools.
- There is no free-text trigger label, no per-block enable toggle, and no natural-1 auto-seed; an empty trigger list is inert and the GM adds triggers explicitly.
  Condition types are `rollTotal`, `progressiveValue` (progressive editors only), `diceGroup` aggregate, and `outcomeTier` (routed editors only); dice groups are labelled from the formula, with duplicate `NdS` groups disambiguated (`#1` / `#2`).
- This authority gate applies per subsystem: crafting honours the system authority; salvage is gated on `features.salvage` identically to gathering — its checks tab hides when the feature is off and `salvageBreakageAuthority` falls back to `toolSpecific` (consistent with the gate acknowledged at lines 163 and 960); gathering exposes the per-trigger break-tools control only when `features.gathering === true`, otherwise it stays `toolSpecific`.
- **The tier-step effect gets its OWN row inside the trigger card**, below the outcome/break row rather than as a third field in it: at the pinned 1280x820 manager geometry the outcome control and the break pill already spend most of the trigger card's width, and a four-segment control plus an operand does not fit what is left.
  The row renders on **routed** check editors only (there are no tiers to step on a simple or progressive check) and is explicitly **not** gated on tool-breakage authority the way the break pill is — stepping is not a breakage concept.
  This is a control that routed **gathering** checks and **fixed**-type routed checks have never had: the retired toggle was relative crafting/salvage only, so those screens gain an effect they previously could not author at all.
- The row carries a four-segment `SegmentedControl` (No step / Step up / Step down / Target tier) and a **stable operand slot** at one pinned width whose contents swap by mode — a shared stepper clamped at a minimum of 1 for `up`/`down`, a tier `<select>` for `target`, and an inert disabled placeholder for `none` — so changing mode never moves the control out from under the GM's pointer in a wrapping row.
  The stepper FILLS the pinned slot rather than sizing to its own content, and that direction is the requirement: the 160px pin and the no-movement guarantee are unchanged, so the primitive is made to fill the existing slot rather than the slot being re-measured to the primitive.
  The guarantee that holds across a mode swap is POSITION and BOX SIZE: each mode renders one box of the same width and height in the same place, so nothing under the GM's pointer moves and no row rewraps.
  It is deliberately not a claim about the operand's whole appearance — the stepper keeps its own 8px radius and soft surface fill where the `<select>` and the inert placeholder render at 6px on the manager's field background, because a layout-context rule may take a SIZE from its slot but must not restyle the primitive's border, radius or fill (see line 88).
  A stepper sized to its content would break the size half outright, standing as a narrower and shorter island beside a `<select>` and a placeholder that both still render at the pinned width.
  Every rendered `SegmentedControl` takes a radio `name` unique per CONTROL, not per trigger: a trigger card renders two of them, and a shared group name would make choosing a tier-step mode uncheck the outcome radio.
- **The `target` select never displays a tier it has not persisted.**
  `tierId` defaults to `null` and a `<select>` whose value matches no option renders its FIRST option as selected, so the select carries a disabled placeholder option ("Choose a tier…") selected while `tierId` is `null`, and renders a dangling id as an appended disabled "Missing tier" option plus an invalid-field treatment on the operand slot.
  A dangling target is reachable by ordinary authoring, not only by import: the relative↔fixed type switch swaps the whole tier list and dangles every authored `tierId` at once.
- When the check has no named outcome tiers, the `target` branch shows its own muted guidance cue rather than hiding the control — a GM authoring top-down configures triggers before tiers, and hiding it would make an authored target invisible.
  It carries a hook and a lang key distinct from the `outcomeTier` condition's no-tiers cue, because a trigger that is both `outcomeTier`-conditioned and `target`-stepping on a tier-less check would otherwise render two identically-hooked nodes in one card.
- Two readiness rules back the control, both `warning` severity and both reported only once at least one trigger sets `target`: `danglingTierStepTarget` (the target names no tier on the active list, including "no tier chosen at all") and `multipleTierStepTargets` (two or more triggers set a target; if more than one matches, the lowest-ranked wins).
  The second is guidance rather than breakage — it is a static authoring count that cannot know which conditions will match or whether a roll will be forced.
  Both are satisfied by a single paired check entry (`tierStepTargetsResolve`), because to a GM they assert one thing: the targets on this check name exactly one existing tier.

#### Requirements Controls

- Time toggle in the Optional features section, bound to `requirements.time.enabled` (default on).
  It renders always (like the currency toggle).
  When time requirements are enabled the recipe Duration card (single-step) and the per-step duration editor are authorable and their durations apply at craft time; when disabled, both editors are hidden and a step's `timeRequirement` no longer arms a timed run (the craft resolves immediately).
  Existing authored durations are preserved while the toggle is off (they render as read-only chips where a step summary is shown) and re-apply when it is turned back on.
- Currency toggle in the Optional features section, bound to `requirements.currency.enabled`, rendered as a `manager-feature-tile` with `data-feature-key="currency"` and the stable hook `data-system-currency-toggle`.
  It renders always (independent of which optional feature flags exist on the system), so the section is never empty.
- **The toggle is the ONLY currency control on System Settings.**
  The units card and every strategy, provider, macro, unit and sub-unit control moved to the World > Currency route, because the coin ladder is world scope (`data-models/spec.md` -> CurrencyConfig): a world runs exactly one Foundry game system, so two crafting systems cannot meaningfully disagree about how to read the same actor's purse.
  The System Settings tab therefore renders no currency configuration at all, whether the toggle is on or off, and the `data-system-currency-*` hooks that backed those controls were renamed `data-world-currency-*` and now live on the World route.
  `data-system-currency-toggle` is the one hook that stayed.
- What the toggle governs is unchanged: it gates the recipe currency-cost authoring affordances, the player display of a currency option, and engine consideration of currency for THAT system.
  It does not gate the World > Currency route, and it authors nothing about the ladder.

If `features.gathering === false`:

- the `Environments` tab is hidden
- the player-facing `Gathering` directory button is hidden when no other system enables gathering
- gathering environments for that system are not shown in runtime player flows

#### Recipe Visibility Controls

The selected system's recipe visibility is authored on the Crafting group's **Settings** page (`crafting-settings`), in a **Recipe Visibility** section rendered below the resolution-mode card.
It is no longer on the System Overview page, and it authors the flat `visibilityMode` enum rather than the legacy `listMode` + `knowledge.mode` pair.

- A single radio-card selector (the shared `ResolutionModeCard` primitive) offers exactly four mutually-exclusive options: `global`, `restricted`, `item`, and `knowledge`.
  Each option carries a label and description; exactly one mode is active for the whole system.
- **Alchemy relabel (reveal-not-gate).** When `resolutionMode === "alchemy"` the card keys a `$derived` option set that renders the `restricted` option as "Manual (GM-granted access)" and rewords the item/knowledge/global descriptions from _gating_ to _reveal_ language (per `recipe-visibility`), because brewing is never gated by visibility.
  A non-alchemy system renders "Restricted" with gating language.
  The STORED enum value is unchanged in both (`restricted` stays `restricted` — no new enum value and no migration), so the Access tab (shown for `visibilityMode === "restricted"`) stays reachable to author the per-recipe grant.
- Selecting an option live-applies it through `setVisibilityMode(mode)`, which persists `visibilityMode` and refreshes; the change is non-destructive (migrates no recipes) and there is no separate save action.
- A `CraftingEffectPanel` beside the selector summarizes the active mode's effect (from the projected `craftingEffect(visibilityMode)` matrix): whether the Access tab, Books & Scrolls, limited-use, and learning-limits surfaces are shown.
- Per-recipe-item use and learn caps are NOT authored here — each recipe item's caps live on its own Books & Scrolls item page (see Books & Scrolls Surface).
- Legacy note: the standalone `SystemRecipeVisibilityCard` that authored `listMode` / `knowledge.mode` / `dragDropEnabled` through `saveVisibilityConfig` is retired from the rendered UI; those legacy fields are now derived and read-only fallbacks (the runtime still honours `knowledge.learn.dragDropEnabled` where present).

#### Recipe Item Definition Controls

The GM admin must expose a recipe-item management surface for the selected crafting system.

Capabilities:

- Add recipe item definitions from world or compendium Items by drag/drop only
- Remove recipe item definitions
- Show source-linked name and image preview
- Warn when a recipe item definition's source item no longer resolves

Tool creation, Tool source replacement, and Recipe Item source replacement use the same drag-only Item drop-zone primitive.
It resolves the UUID from Foundry V13 Document drag data through awaited `fromUuid` before mutating state, accepts only a resolved `Item` document, and rejects missing, malformed, Folder, Actor, and compendium-index-only results without changing the current source or draft.
The drop zone has no click-to-browse action, picker, shortcut list, select control, button role, or keyboard-operability claim.
Existing Component identity replacement surfaces are not Item-source drop zones and retain their Component-specific interaction contract.

Recipe item definitions are distinct from components:

- adding a recipe item definition must not add or require a component entry
- selecting a recipe item for knowledge gating must not require importing that item into the component library

When `visibilityMode === "global"` (or a legacy `listMode === "global"`), no per-recipe player allow-list controls are shown.
Visibility and learning semantics are defined in `recipe-visibility/spec.md`.

### System Overview

The manager exposes a GM-only **System Overview** page as the first navigation-rail item,
immediately before `Components`.
It is an always-available implemented route for any selected system —
not an experimental-gated feature and not a disabled placeholder.
The whole crafting-manager admin is GM-scoped, so the page and its banner are GM-only by construction.

The System Overview page is a full-width tabbed shell mirroring the environment editor's full-width tab pattern.
A full-width tab bar (`role="tablist"`, with `role="tab"` buttons and badge support) sits above a bounded, scrollable workspace.
The page has two tabs: **Settings** (the system settings form, the default-selected tab) and **Validation** (the kind-grouped validation issue list).
The shared right inspector is skipped for this full-width page, exactly as it is for the environment editor.
Selecting a different system, or opening the page from the rail, resets the active tab to Settings.

The renamed rail item uses the validation clipboard icon (`fas fa-clipboard-check`).
There is no separate standalone Overview rail item; the validation list lives on the Validation tab.
The rail item SHALL surface a count badge with the number of open critical-plus-warning issues when greater than zero.

#### Settings Tab

The default-selected Settings tab renders the system settings form (identity, optional features, and character modifiers) unchanged.
The currency configuration is no longer part of it: only the Currency participation toggle remains, in the Optional features section, and the ladder is authored under World > Currency.
It writes through the existing admin-store persistence and confirmation flows.
Recipe resolution mode, salvage resolution mode, and the Recipe Visibility card moved to the Crafting group's Settings page (`crafting-settings`); the System Overview Settings tab no longer renders them.

The identity card's **Save details** control SHALL be preceded (in DOM order) by an `Unsaved` chip (`.manager-chip.is-warning`, `FABRICATE.Admin.Manager.SystemEdit.Dirty`) shown whenever the Name or Description input differs from the persisted `selectedSystem.name` / `selectedSystem.description`, and cleared when the values match — naturally, after Save persists and the projection re-publishes.
The Name / Description inputs SHALL seed from the persisted system on system-identity change only, so a two-phase or otherwise unrelated `viewState` re-publish of the same system does not overwrite un-saved edits.
As a consequence, a concurrent external edit to the same open system is not merged into the open form and is overwritten on Save (last-writer-wins), matching the manager's staged-draft model for recipes, components, and essences.
The identity sub-form (Name + Description only) SHALL participate in the Manager confirm-discard route-exit chain as a `system-details` kind, evaluated after the tools tail of the cascade: navigating away from, or switching systems on, a dirty details form prompts the standard three-way Save / Discard / Keep-editing dialog — Save persists the pending name and description before navigating, Discard reverts the inputs and proceeds, Keep-editing stays.
A navigation that re-enters the System Overview page on the same system (the validation-blocker link, or re-selecting the already-selected system) SHALL NOT prompt, because the form stays mounted and its pending edit survives.
The optional-features toggles (the Currency participation toggle included) and the character-modifier / prerequisite cards on the same tab live-apply through the store and stage no draft, so they do not participate in this guard.

The Settings tab additionally renders a **Character prerequisites** card (`CharacterPrerequisitesCard`, issue 544) — the WORLD library of reusable pass/fail conditions the GM attaches to a book/scroll to gate who may learn its recipes and to a Tool to gate who may wield it (behaviour in `recipe-visibility` and `data-models` -> Tool).
Since issue 1308 it edits a world record on a page framed as settings for the SELECTED crafting system, which is the one place in the Manager where those two scopes meet.
That is a deliberate interim state, and it is made honest in place rather than left implicit: the card header SHALL carry a neutral scope chip reading "every system" — the World rail's own wording, so the two surfaces say one thing — the hint SHALL state that the library is shared by every crafting system, and delete SHALL confirm, naming the cross-system reach, because an unconfirmed one-click delete whose blast radius is every system is not a recoverable mistake.
The **Modifiers** card on the same tab SHALL carry the identical treatment, for the identical reason.
Both chips go away when the follow-up change relocates the two editors to their own World route.
It is an accordion list (one entry expanded at a time): each collapsed row shows the entry name and a live `@path op value` preview, and the expanded body edits the name, then the property `path` (rendered with a leading `@` affordance), an operator dropdown (the nine `CharacterPrerequisite.op` tokens), and a `value` field that is hidden for the valueless operators (`is true` / `is false` / `exists`).
Add, delete, and an opt-in **Seed presets** action (enabled only for `dnd5e` / `pf2e` worlds, disabled with an explanatory tooltip otherwise) mirror the gathering character-modifier card's affordances.
Each control live-applies through the admin store (`addCharacterPrerequisite` / `updateCharacterPrerequisite` / `deleteCharacterPrerequisite` / `seedCharacterPrerequisitePresetsForSystem`), staging no dirty draft.
Since issue 1308 none of those actions takes a crafting-system id and none may early-return on an unselected system: the library they write is world scope, so a system-scoped guard would silently drop the edit.

#### Settings-List Ergonomics

Three Manager library lists — **Character modifiers** and **Character prerequisites** on System Settings, and **Currency units** on the World > Currency route — share a set of ergonomic affordances (issue 768).
The Currency-units list moved out of System Settings with the rest of the currency editor (issue 1278), and the shared contract follows it: the ergonomics are a property of the list, not of the page it sits on.
All three now edit WORLD records (issue 1308 moved the other two's data, though not yet their editors), so the shared contract additionally covers SCOPE DISCLOSURE: a list editing a world record from a system-framed page SHALL say so on its header and in its delete confirmation, and one editing it from a World route needs neither, because the route already said it.

The Character-modifiers list SHALL render as a compact summary-row accordion mirroring the Character-prerequisites card: each collapsed row is one line — a chevron, the modifier's icon, its label, and its expression shown inline with the leading `@` sigil stripped for a cleaner read — with the row actions (copy, delete) to the right; activating the summary expands the row to the editor (Icon, Label, Expression).
The Character-modifier editor SHALL edit its `icon` with the shared pop-over `IconPicker` (the same control the Currency-unit and Character-prerequisite editors use), not a raw icon-class text input; a modifier with no explicit icon falls back to `fa-solid fa-user`.
The editor's Expression field keeps the raw stored value (including any leading `@`); only the collapsed summary strips the sigil for display.

Each of the two SYSTEM SETTINGS list cards SHALL render a whole-section collapse toggle in its header: a `<button aria-expanded aria-controls>` with a chevron affordance that hides or reveals the section body (the list and its controls) while leaving the card header visible.
The collapse state is session-local (in-memory) — preserved across store refreshes and never persisted — and is one collapse Set for the page, reset when a different system is selected.
The World Currency card SHALL NOT render one.
A collapse toggle earns its place by yielding space to the siblings below it; as a whole route the currency card has no siblings, so the same control would only hide the page and leave a bare header row.
It is distinct from the Character-prerequisites card's per-item accordion (which opens one entry at a time); a section may be collapsed independently of which entry, if any, is open.

Each Character-modifier row SHALL offer a row-level **Copy to prerequisites** action, and — only when `features.gathering` is enabled — each Character-prerequisite row SHALL offer a **Copy to modifiers** action.
A copy adds a fresh entry into the destination store via that store's normalizing add op (never a shared mutation, and never carrying the source `id`), mapping `label`↔`name` and `icon`↔`icon` cleanly and transforming the roll `expression`↔`path` by stripping or re-adding a single leading `@` (faithful for a bare `@path`; a compound roll formula yields a path the GM must correct).
The pass/fail `op`/`value` and the roll math have no counterpart on the other side and are dropped; the copy defaults a new prerequisite to the `gte` operator with a null value.
On copy the destination card SHALL open the new entry in edit mode and a polite `aria-live` region SHALL announce that the name and icon were copied and the condition still needs setting, so the dropped logic is a visible gap rather than a silent loss.

Each row of all three lists SHALL offer keyboard-accessible **Move up** / **Move down** chevron `<button>`s, disabled at the ends, that reorder the list by one position through a single index-based store op (`reorderGatheringCharacterModifier` / `reorderCharacterPrerequisite` / `reorderCurrencyUnit`), with the new position announced through a polite `aria-live` region.
No new persisted field backs the order: array order IS the persisted order, so each op rewrites the list array in place and saves through that list's existing whole-payload path (the gathering config for modifiers, `updateSystem` for prerequisites, and the world `currencyConfig` setting through `CurrencyConfigStore` for currency units), and the order-preserving normalizers round-trip it.
`reorderCurrencyUnit(fromIndex, toIndex)` takes NO `systemId`: there is exactly one world ladder to reorder, so the parameter the per-system era carried has been removed rather than defaulted.
The provider-managed (read-only) currency-unit list carries no reorder controls, because the selected provider owns its denomination order.

#### Validation Tab

The Validation tab renders the derived system-validation report
(`evaluateSystemValidation`, defined in `data-models`) for the selected system.
The report is a computed view assembled by the admin store from the system's recipes, environments, and components;
nothing is persisted on the `CraftingSystem`.
The tab header keeps the "Review every validation issue…" copy and the `critical / warning / notes` summary badges.
The tab also carries danger and warning badges in the tab bar reflecting the open critical and warning counts.

Issues are grouped by their `kind` —
`system` (system blockers), `recipe`, `environment`, `task`, `event`, and `salvage` —
with the `system` blockers surfaced first.
Each issue renders one row carrying a severity chip
(`.manager-chip.is-danger` for `critical`, `.manager-chip.is-warning` for `warning`, `.manager-chip.is-neutral` for `info`),
the offending entity's name, and the issue message.

Every non-`system` row deep-links to the editor that owns the entity,
reusing the manager's existing selection helpers
(recipe issues open the recipe editor, environment/task/event issues open the environment editor,
and salvage issues open the component editor).
The `system` kind is the overview itself and carries no deep-link button.
When there are no issues, the Validation tab shows an empty "ready to use" state.

When the report's `blocksSystem` is true,
the Validation tab renders a full-width `role="note"` callout explaining that players cannot see or use any of the system's recipes until the blocker is resolved.

#### System-Blocker Banner

When the selected system's report has `blocksSystem === true`,
the System Overview page's Settings tab SHALL render a full-width `role="note"` callout
(reusing the `manager-environment-comp-callout` treatment) above the identity card.
The banner is GM-only, explains that the system is blocked from player visibility, and links to the Validation tab.
Activating the banner link switches the page to the Validation tab in place.
It is not shown when `blocksSystem` is false.

### Item Sheets

Fabricate no longer adds an item-sheet header learn control.
The former control (`ItemSheetRecipeLearnControl.js`) was removed (issue #511); manual recipe learning is wired exclusively through the player **Inventory** surface — the book detail's learn affordances call `game.fabricate.learnRecipeFromInventory`, gated by `InventoryListingBuilder` (see §Books & Scrolls learning and `recipe-visibility/spec.md`).
The learning flow itself (confirmation prompt, `consumeOnLearn` / `destroyWhenSpent` item removal, per-actor `learnedRecipes` write) is unchanged; only its invocation surface moved.

### Items Tab

Capabilities:

- Add managed items from world or compendium.
- Bulk-add managed items by dropping a Folder or a whole compendium onto the import zone.
  Folder
  drops are accepted from both the world Items directory and a compendium directory, and expand to
  every contained Item including nested subfolders; a compendium folder's items are resolved from
  the pack index entries.
- Folder-aware categorization on bulk import: a folder drop, an in-pack-folder drop, or a
  whole-compendium drop that contains at least one item-bearing folder opens a mapping step before
  the import commits.
  The step lists each detected folder (the dropped folder plus every nested subfolder) with its item
  count, and lets the GM assign a category and/or tags per folder, inline-create a category (reusing
  the shared vocabulary model), or skip a folder.
  Tags are assigned from the existing vocabulary only; a new tag is created in the Tags & Categories
  screen, not inline at import.
  Category assignment is single-valued and OVERWRITES the imported default; tag assignment is additive
  (union).
  A "match-by-name" toggle, ON by default, pre-fills each folder's row when the folder name matches an
  existing category (case-insensitive) and/or tag (lowercased), applying each axis independently.
  The primary action imports the non-skipped folders' items and applies each folder's mapping to that
  freshly imported component set; the item count updates live as folders are skipped, and a skipped
  folder's items are not imported.
  A single-item drop is unchanged, a folderless drop falls back to the one-shot import, and a
  compendium-directory folder that groups packs (not items) is skipped with a notice.
- Remove managed items.
- Edit managed item tags (if enabled).
- Edit managed item essences (if enabled).
- Edit managed item difficulty: the component editor's body exposes an editable
  progressive-difficulty stepper, titled "This component's Progressive DC".
  It is shown when the system is progressive on any axis that reads component difficulty — crafting resolution mode, salvage resolution mode, or the system's gathering economy resolution mode.
  The read-only badge on the components-browser row and the browser's bulk-edit progressive-DC section obey the same condition, so all three appear together.
  It accepts an integer from 0 to 35; zero clears the value.
  The stepper is staged into the component editor's draft and persisted with the rest of the edit on Save (not written on change), contributing to the editor's dirty state and unsaved-changes guard.
- Replace associated source item by drag/drop.

Component import warnings:

- When a single component import or replace-source operation falls back because the dropped Item's recorded canonical source UUID no longer resolves, the GM manager UI warns that the original source link is broken and that Fabricate used the live dropped Item UUID instead, naming the affected item and UUIDs.
- When a folder or compendium pack import falls back for one or more Items, the GM manager UI emits one summary warning with the number of affected Items, rather than one warning per Item.

### Essences Tab

Only shown when essences are enabled.

Capabilities:

- Browse, create, edit, duplicate when supported, and delete essence definitions.
- Set a FontAwesome icon for an essence (or fall-back to the default, `fas fa-mortar-pestle`)
- Set an optional colour for an essence, chosen from the shared token palette with custom hex entry disabled.
  The palette is the whole vocabulary because a free hex cannot be guaranteed legible across all seven themes; leaving the colour unset is a first-class state that renders the essence in the theme accent.
  The editor renders that palette INLINE and offers an explicit No-colour cell, so unset is reachable from the palette itself rather than only through a separate Clear control.
  Colour names are localized under the shared `FABRICATE.Admin.Manager.Colour.Token.*` namespace, because the same palette also serves the environments biome picker and the character-modifier picker.
- Set optional source component identity by picker/drag-drop only when effect transfer is enabled.
  The source component may in turn expose a source item UUID.
- Set an optional essence property macro by dropping a Macro, only when `features.propertyMacros === true`.
  The drop is refused when the macro's own type is not `script`, and the refusal is reported on the editing surface.
- In Manager, the Essences left-nav item is a real route, not a disabled placeholder, whenever the selected system has `features.essences === true`.
- Manager shows component usage evidence for essence definitions and shows source-link state only when `features.effectTransfer === true`.
- Manager states component usage and recipe usage as two SEPARATE counts, because they answer different questions: components CARRY an essence and recipes REQUIRE it, and deleting the essence strips it from every carrier and rewrites every referencing recipe.
- Manager does not allow inline editing on the browse essences page, with one exception.
  The row's enable/disable toggle is a distinct localized named hit target, mirroring the Tools Tab's row switch; activating it neither selects the row nor opens the editor.
  Every other row edit still opens the dedicated edit essence view.
- An essence's colour is carried by its tinted medallion and by every chip that spells the essence's own name, and is NOT restated as a colour-token display name anywhere it stands beside such a tile.
  A maintained display name per theme colour is upkeep with no reader on a row, a grid card, an inspector hero, or a live-preview identity block.
  The editor's palette caption is the one exception and keeps its name: there the name labels the swatch the GM is choosing, and the No-colour cell has no tile to speak for it.
- The essence library offers a list and a grid presentation of the same rows.
  The grid card carries the same state vocabulary as the list row — the Disabled marker, the capability markers and the usage counts — because a presentation toggle must not silently remove state.
  In the grid card the capability markers sit in a header row beside the medallion rather than beside the usage counts, so the icon and what it can do read together; in the list row they stay in the trailing cluster and are NOT moved.
  Row actions are list-only; grid selection routes through the inspector.
- The grid card lays out as a FIXED vertical stack — a header pairing the medallion with the capability markers, then the name, then the description, then the usage counts — and every growable part states its own ceiling so the same element lands at the same vertical offset in every card and every card in a row is the same height.
  The name truncates to one line with an ellipsis and keeps its full text as a title; the description keeps a fixed line clamp AND reserves that height even when it is shorter, so the usage counts beneath it are always at the same offset; and neither the name row nor the capability run wraps.
  That equality is also structural rather than incidental: the grid stretches its cards, and the card carries NO margin, because Foundry core gives every `<li>` a bottom margin and exempts the last child, and a stretched grid sizes an item's margin box to its row — so the last card in the list would otherwise silently take its siblings' margin as extra height.
  Equal height within a row does not cover a name that wraps, because every card in that row grows with it, which is why the name and description are bounded above.
- An essence's linked active-effect source and linked property macro are presented exactly as the Tool Studio presents a linked Item: ONE card, carrying the linked document's image, its name, an instructional sub-line, and its actions as a grouped icon pair.
  The card is itself the drop target, so no second drop prompt renders beneath it — a card and a zone side by side state the same affordance twice.
  A sub-line states what the GM can do with the card; it never restates the card's own title or the raw uuid, which is what a copy-uuid action is for.
  The essence source's UNLINKED state keeps the drop-or-pick control, because an essence source is an in-system managed component and the pick half is the only route to that list.
  The presentation toggle renders through the shared segmented control's icon-only variant, because a list glyph and a grid glyph ARE the two layouts, while the status filter beside it keeps its words.
- A browser row that leads with the 40px medallion states selection as the accent ring alone and drops the inset left bar, which would otherwise bite into the medallion; the essence row is one of them, and on its grid card a left bar is not even the correct axis.
- A browser that supports bulk selection states the ticked-row treatment through the one shared rule every such browser joins, so the state looks identical in every studio.
  A studio that writes the ticked class without joining that rule renders a ticked row indistinguishable from an unticked one, which is a defect rather than an omission.
- The essence library's search, filters, sort, presentation and page position survive a round trip through the essence editor.
- Manager essence icon editing uses a pop-over icon picker instead of requiring raw icon class entry.
  The editor's icon control is one column: the preview tile fills that column's width and the picker and its reset sit inside the same edge, so no control overhangs the tile it belongs to.
  The tile's glyph is sized for the tile rather than inheriting the shared row-medallion glyph size, which reads as a speck at editor scale.
- Manager hides source columns, source filters, source inspector sections, source warnings, and source edit controls unless `features.effectTransfer === true`.
  The essence editor's On-craft tab gates its Active effect source section on `features.effectTransfer` and its property macro section on `features.propertyMacros`.
  With BOTH off the tab renders an explanatory empty state naming the two settings, never an empty tab.
- A disabled essence's On-craft sections and behaviour list render the SUPPRESSION rather than omitting the behaviour.
  Each configured section keeps its linked card and states that nothing it carries reaches a crafted result, because suppression is a state on the section rather than a removal.
- Manager allows essence deletion regardless of component usage: deletion is WARNED, not BLOCKED, because the cascade strips the essence from every carrying component and rewrites every referencing recipe.
  No delete is refused, and no set member is skipped, on account of the components carrying the essence, and the browser row shows the component count plainly with no delete-blocked marker.
  Both delete forms state their impact before the GM commits.
  The single delete's confirmation states how many components the essence is removed from and how many recipes are rewritten, worded in the FUTURE because the essence still exists as the GM reads it.
  Each consequence figure is gated on its own count, so the commonest single delete of all — carried by no component and required by no recipe — states neither nought.
- A set delete states its impact before it is armed, and recomputes it when the selection changes.
  The statement reports how many essence definitions will be deleted, how many components carry one or more of the SELECTED essences, and how many recipes will be rewritten.
  The component number is counted over the whole selection as a DISTINCT-carrier union: a component carrying two selected essences counts once, because the cascade strips it in one pass, so the copy says "one or more of the selected essences" rather than a per-essence sum.
  The two carrier numbers are counts of DISTINCT carriers, so neither exceeds what the cascade will touch.
  A carrier number of zero is omitted rather than stated as zero; the essence count always renders, because the impact statement is what the armed confirmation is paired with and a card stating nothing has lost that pairing.
- The set delete uses the two-step armed confirmation rather than a modal dialog.
  This is a deliberate exception to the reserved-for-bulk-actions dialog rule, taken on an explicit maintainer decision, and it is paired with the impact statement above.
- Manager source-state language is `linked`, `missing`, `stale`, and `none`; stale source evidence must remain readable until the GM clears or repairs it.
- A disabled essence is withheld from every ADD-NEW offer list and from nothing else.
  Wherever it is already referenced — a component quantity, a recipe ingredient option — it stays rendered, marked, and clearable, because the surface that authored a value must remain the surface that can remove it.
  Residual, recorded: the component bulk-edit panel's essences axis is a whole-map replacement, so applying that axis over a selection still rewrites every carrier's map from the staged grid.

### Tools Tab

The selected-system `Tools` rail item is a top-level entry rendered between `Essences` and `Gathering` (see Manager Shell).
It manages the system's single canonical Tool library (`system.tools`).

The Tools surface is a Tool Studio with a top-level library route and a focused `tool-edit` route.
There is no Tool Kind field, filter, selector, pill, icon taxonomy, or persisted Kind value on either route.

The library uses the Manager three-column shell at `210px | 1fr | 340px`.
It owns the sole system-breakage-authority card above search, with self-describing `toolSpecific` and `checkDriven` options; changing authority persists live and never erases the inactive per-Tool settings.
The center library accepts an Item drop to create a Tool, rejects non-Items, snapshots source name/image/description, and uses durable Tool identity rather than name matching.
Each Tool row shows its linked image, display name, enabled state, breakage summary, and validation state.
The right inspector presents the selected Tool's identity and description followed by four headed card sections for breakage mode, on-break action, character prerequisites, and check bonus.
The row and inspector derive `Ready` or `Needs attention` from the canonical `Tool.validate()` result rather than from enabled state or a UI-only approximation; the inspector also exposes the validation issue count.
Both surfaces pair localized text and an icon with their status colour, so the state is neither colour-only nor an internal validation token.
When Tools exist and the current selection is absent or stale, the library selects the first Tool exactly once; a valid current selection is preserved and an empty library emits no selection.
The result list scrolls independently above a persistent, full-width pagination footer that remains outside the scrolling region for both one-page and multi-page result sets.

Each row exposes selection through a keyboard-focusable identity target with explicit selected semantics and Enter/Space activation.
Selection, Edit, and enabled toggle are distinct localized named hit targets.
Activating Edit or the toggle does not select or open through the row handler.
The enabled toggle persists live through the same immediate path as Recipe enabling, updating both the focused draft and its baseline without marking an otherwise-clean editor dirty; a newly-created, not-yet-persisted Tool cannot be enabled through this path.

The editor uses `210px | 1fr | 320px` and exposes exactly four tabs: Overview, Breakage, Requirements, and Validation.
The header alone owns Back, Delete, Save, and the dirty-state affordance; there is no footer save bar.
The body includes a live behavior preview, while the inspector summarizes identity, linkage, usage, and validation context.

Overview uses the Recipe Studio tab, field, and enabled-card primitives.
Source name and description are read-only snapshots, while the display label alone is editable.
A linked source exposes Copy source UUID immediately before Unlink, never renders the raw UUID or a replacement picker, and accepts replacement only through a persistent drag-only drop-zone card with visible instructions and no button role, tabindex, or keyboard-operability claim.
The persistent behavior inspector explains source Items, recipe requirements, salvage use, character prerequisites, check bonuses, and breakage on every editor tab, followed by a localized link to the published Tools documentation.
Disabled preview rules are titled `No prerequisites to use` and `No check bonus`.
Breakage authors the retained `limitedUses`, `breakageChance`, or `diceExpression` tool-specific configuration, the separate check-driven Breakable/Immune state (`checkBreakable`), and the `destroy`, `flagBroken`, or `replaceWith` action.
Percentage authoring uses the shared synchronized number-and-range slider primitive also used by Gathering drop chances; Tool breakage supplies its own accessible labels and continuously interpolates across a green, yellow, amber, then red risk scale as the chance increases.
Changing authority or check-driven immunity does not clear the inactive tool-specific configuration or on-break values.
When `checkBreakable` is false under check-driven authority, on-break controls are actually disabled and removed from interaction while their retained values and the explanation remain readable; opacity or `pointer-events` alone is insufficient.

`flagBroken` authors zero or more Recipe-compatible repair `IngredientGroup`s with the shared AND-groups/OR-options interaction model and Component, Tag, Essence, and Currency match types.
`replaceWith` authors exactly one managed Component target through a full-width shared searchable popover card.
The Tool Studio does not create or edit direct Item targets; legacy direct Item discriminators remain readable and executable at runtime until the GM deliberately replaces them with a managed Component target.
Requirements selects ids from the WORLD character-prerequisite library (issue 1308), the `bonus | usability` gate mode, and the enabled numeric bonus expression without embedding prerequisite definitions in the Tool.
Its empty state SHALL say the library is empty for the WORLD rather than for this system, and a Tool save SHALL preserve the selected ids: `upsertTool` derives the same Valid Id Basis `_normalizeSystem` does, so a save on a world whose library cannot be vouched for prunes nothing rather than silently clearing the gate.
The bonus expression input visually supplies a leading `@` for roll-data paths, stores that sigil exactly once, provides explanatory hint text, and does not offer game-system-specific preset values.
Validation uses the Recipe editor's grouped summary-and-checklist surface, lists every failing model check under stable Source, Breakage, and Requirements headings, exposes the first failure for focus, and reports an all-clear state that is not color-only.

Leaving a dirty `tool-edit` route through Back, rail or breadcrumb navigation, a system-scope change, another Tool selection, or application close invokes the standard DialogV2 Save / Discard / Keep editing guard.
Save proceeds only after successful validation and persistence.
Invalid or failed Save keeps the same Tool mounted, opens Validation, and focuses or exposes the first failing check.
The Validation tab projects domain failures onto stable localized categories and never renders raw field paths, exception messages, adapter details, or other internal error text.
Save, delete, and enabled-toggle failures likewise emit only their localized operation-specific message; raw caught errors may remain internal state for control flow but never become notification copy.
Discard restores the baseline before navigation, while Keep editing preserves the draft and focus.
Re-entering the same Tool does not prompt.
Delete uses a separate destructive DialogV2 confirmation; cancellation preserves the draft, and successful deletion returns to the library without a second dirty prompt.

Tabs expose `tablist`, `tab`, and `tabpanel` relationships with selected/error state that is not color-only.
Item creation/drop targets and every icon-only unlink, remove, and menu control have button semantics and localized accessible names.
The Tool editor's sole identity/action header spans the complete Tool shell above the rail, editor, and preview.
Tool routes suppress the generic system status ribbon, generic edit heading, rail scope card, and rail-collapse control so they do not precede the Tool content.
At product-root widths of `832px` and wider, the library preserves `210px | minmax(0, 1fr) | 340px` and the editor preserves `210px | minmax(0, 1fr) | 320px`; center workspace and inspector own vertical scrolling with `min-width: 0` and `min-height: 0`.
Only below `832px` do rail, main, and inspector stack in reading order with max-content rows, the body becoming the single vertical scroller while the bounded rail remains independently scrollable and main/inspector overflow becomes visible.
At `680px` and below, header actions and tab/action clusters wrap without overlap, and Back, Delete, Save, validation state, replacement controls, and repair-row actions remain visible and reachable.

### Recipes Tab

The recipe **library** for the selected crafting system: a filter bar, collapsible category groups, rich card rows, and a persistent inspector in the shared manager inspector column.

The library renders **one** page header, and the shell owns it (breadcrumb, screen title, subtitle, Create).
The library does not render a page header of its own.

Rows are **cards, not table columns**.
A card row has no columns, so the list is a real list (`ul` / `li`, `role="list"`), not a table/row/cell structure with column headers.
Each row shows the recipe's image medallion (the recipe's own image, resolved through `resolveRecipeImage`, falling back to `DEFAULT_RECIPE_IMAGE` — never a containing book's artwork), its name, its authoring-state pills, a one-line description, an I/O readout, a check pill, a lock toggle, a keyboard-reachable on/off toggle, an `Edit` pencil, and a bulk-selection control.

The row's on/off toggle carries **no On/Off text**.
The track colour is the state, its `aria-label` names the state for assistive tech, and the `Disabled` pill states it in words — a third copy on every row only crowds the description out.
The label is retained on every other `manager-status-toggle` in the manager, where the switch has no pill beside it.

The row's `Edit` pencil is a **borderless ghost icon** that takes a background on hover.
Delete and Duplicate are preserved capabilities, but they are inspector-only rather than row actions: three bordered buttons beside a bordered lock, a switch and a pill make the row read as a toolbar rather than as a recipe.

Row authoring-state pills — at most one authoring state applies to a row:

- `Disabled` — the GM has switched the recipe off.
- `Locked` — the recipe stays visible to players, but only a GM can craft it.
- `Can't enable` — the activation check would refuse to enable this recipe **and** it is currently off.
  The activation check is the full completeness contract plus the alchemy signature scan, so an incomplete shell, a structurally broken recipe, a dangling essence or tag reference, an unmet resolution-mode requirement and an alchemy signature conflict all qualify.
  The pill, the bulk panel's pre-flight count and the write read that ONE predicate, so no two surfaces can disagree about whether a given recipe is currently enableable.
- `Incomplete` — the same activation blocker on a recipe that is already ON: unfinished or conflicting work a GM should still resolve, but nothing is being refused, because the activation check runs only on a transition into the enabled state.
  `Can't enable` and `Incomplete` read ONE predicate and differ only in whether the recipe is currently off.

The **I/O readout** always shows the ingredient count (`N in`).
It shows an output item count (`N out`) **only** in the `simple` and `progressive` resolution modes.
In `routedByIngredients`, `routedByCheck` and `alchemy` the results are tier- or set-keyed, so a single "outputs" number does not exist; those modes show the **result-group count** with a routing glyph instead, labelled as groups.
The readout is a phrase, not a numeric, and stays in the UI face — the mono face marks a number, it does not decorate a readout.

The **check pill** resolves the recipe's `checkTierId` against the system check's tiers and shows that tier's DC, falling back to the check's static default DC.
It shows a dynamic-DC pill when the check resolves its DC through a macro and a progressive pill for a progressive system.
A check is **usable** only when an authored `rollFormula` exists, which is not the same as "checks enabled", and the two check-less states are distinct and must not be conflated:

- **`By ingredients`** (neutral) — a `routedByIngredients` system with no usable check.
  Results route off the ingredient set that was used, so the recipe resolves with no roll; this is a working configuration.
- **`No check`** (warning) — every other mode with no usable check.
  The system cannot roll for this recipe, and a GM must be able to **scan** a library for that, which is why it is a warning that names the condition rather than an em dash.

The **filter bar** has three rows.
Row one carries every filter — a name/description search, a status filter (all / on / off), a lock filter (all / unlocked / locked) and a category filter (bare, named by its `aria-label`).
Row two carries the two view controls, separated by a rule: the group-by-category switch and the sort key (name, needs attention, check DC, ingredients, results) plus its direction.
Each view control is titled by an uppercase micro-label that **precedes** it and does not wrap.
Row three carries the active-filter chips and the count.

Every non-default filter surfaces a clearable active-filter chip.
The **count** is quiet right-aligned metadata — not a chip — and reports the page **window** (`1–5 of 12`), because a bare shown/total never tells the GM which page they are on.

Category group headers are `aria-expanded` / `aria-controls` buttons and default to **expanded**, the status and lock filters default to **all**, and the pager's default page size exceeds a typical system's recipe count.
These defaults are load-bearing: a default that hid rows would leave the GM staring at an empty library.
A group header is a tight left cluster — chevron, folder, name, count — not a full-width bar with the count flung to the far edge, which reads as a table header.

The library's view-state — current page, category / status / lock filters, sort key and direction, group-by-category toggle, page size, and per-category collapse state — is **preserved across an editor round-trip**: opening a recipe editor and returning to the library restores the exact page, filters, sort, grouping, and collapsed groups the GM left, rather than resetting them to defaults.
The name/description search term is likewise preserved across the round-trip.
A genuine **crafting-system switch** (selecting a different system) resets the vocabulary-scoped filters (category) and the page and collapse position, because a category names a vocabulary the next system does not share, while keeping sort, group-by-category, page size, and the status / lock filters as cross-system preferences; the search term is cleared on a system switch.
When the restored page no longer exists because rows were added or removed while editing, the page index is **clamped** to the last valid page; a restored filter that now matches nothing shows the filtered-empty state with its Clear-filters control rather than being silently dropped.

When "Group by category" is **on**, both GM libraries order the list **category-major before pagination**, so each category occupies a contiguous run of rows across page boundaries — a category larger than the page fills consecutive pages before the next begins, rather than showing an interleaved alphabetical slice on every page.
Category order is the browser's existing group order — components pin the reserved catch-all (`general`) **last**, recipes order it **plain-alphabetically** — with each browser sharing **one** comparator between its group order and its category-major sort, so "page order == rendered group order" is structural.
That category order is **independent of the active sort direction**; only rows **within** a category honour the active sort key and direction.
The non-grouped view is unchanged.

Both GM libraries group the **page**, not the filtered list, so a group header reports **two** numbers whenever they differ: what the group renders, and the category's total across the **filtered** rows (`25 of 282 recipes`).
This holds when a category spans a page boundary — its header reads `N of M` on each page it appears on, `N` being the rows it renders on that page.
Either number alone is a false statement — a count of the page says a 282-strong category holds 25, and a count of the filtered list puts `12 recipes` above the three rows page 2 renders.
A group shown **whole** reports one number (`25 recipes`), never `25 of 25`.
The total counts the filtered rows, so an active search / status / lock / category / essence filter is always respected; a total over the raw roster would be a third wrong number.
Both singulars are localized — `1 recipe` and `1 of 282 recipes`, never `1 recipes`.
The Component Studio's library follows the identical rule.

The category **filter's** own option counts are the one number on this screen deliberately taken over the **unfiltered roster** rather than the filtered rows, and that is a different question rather than a fourth wrong answer.
The filter offers what the GM could switch to, so an option whose count fell to zero as they typed in the search box would withdraw the escape route from an empty result.
Sharing one derivation between it and the group totals is a correctness regression, not a cleanup — the two cohorts must stay distinct even when they are served from one fetch.

Because both libraries page, **expensive per-entity work is scoped to what is on screen**: the rendered page plus the selected entity.
A recipe's execution structure, requirements preview, completeness verdict and authoring body, and a component's linked source document — its resolved description fallback and its `Missing` badge — are prepared for the page's rows and the selected row, never for every definition the filter matched.
What is prepared for the **whole filtered cohort** is everything a GM can act on without the row being on screen: the filter fields, the category totals above, every sort key, and the bulk selection.
The two lists must not be confused in either direction, and each direction fails differently.
A sort key demoted to the page tier renders **name order under the label of the key the GM chose**, silently and with no empty state to notice — so `enableBlocked`, the check DC, the ingredient and result counts and a component's salvage result-group count are all cohort-scoped facts.
A count taken over the page instead of the cohort states that a 282-strong category holds 25, which the `N of M` rule above exists to prevent.
Bulk actions operate on selected ids and cohorts, so `select all N results` selects the whole filtered cohort and an Apply reaches rows the GM has never scrolled to.
Enabling a recipe still refuses exactly the recipes the row pills mark, because the refusal predicate is cohort-scoped like the pills that read it.

Scoping is a matter of WHEN the work happens and never of what the surface reports: a paged library's counts, order, chips, selection and every rendered value are identical to those an unpaged one would show.
The selected entity's inspector stays fully detailed and current, and a GM who never leaves page 1 pays for page 1.
Where the page-scoped work is asynchronous — a component's linked source document is a real document fetch — the row and the inspector first render the stored reading and then **correct in place** as each resolution lands: a component's description settles to its source document's prose, and its source pill settles from the accent origin label it derives from the uuid's shape alone (`Compendium` or `Items Directory`) to the amber `Missing` for a document that has been deleted.
The correction must actually reach every surface reading that entity, and rows keep their identity across it, so nothing remounts and scroll position, focus, the bulk selection and an open inspector or editor all survive.

The **blocked-enable flash**: enabling a recipe is gated — an incomplete recipe, or one whose signature conflicts, is refused.
The refusal renders as an in-window, dismissible `role="alert"` flash inside the library, and the store **suppresses** its Foundry notification whenever the library claims that message, so the same error is never reported twice (once in-window and once in a toast behind a maximised manager window).
The flash **floats** over the list rather than sitting in flow above it: an in-flow banner shoves every row down the page as it appears, moving the row the GM just clicked out from under the cursor.

The **lock toggle** gives `recipe.locked` a real write path from the row.
Unlike enable, locking is **never gated**, in either direction: a GM locks a recipe precisely while it is unfinished, so refusing the write on incompleteness would make the control useless exactly when it is wanted.

The **inspector** is one column on the panel background, not a stack of bordered cards.
Section headings are uppercase micro-labels sitting directly on the panel — `Selected recipe`, `Requires`, `Produces` — not `<h3>` titles inside nested `manager-inspector-card` boxes, and there is no invented "Recipe details" heading over the stat grid.
Only the things that are objects keep a box: the 2×2 stat grid (Ingredients / Results / Steps / Crafting check) and the Requires / Produces flow rows.

The hero chip row carries exactly two chips on one line: the category and a status pill (a dot plus `On`/`Off`, naming the state exactly as the row's switch does).
There is no chip for the _absence_ of a state — the retired `Unlocked` chip named a non-state and forced the row to wrap; `Locked`, `Incomplete` and `Can't enable` are shown only when true.
The flavour text is shown whole, in the one surface with room for it.

The **Produces** list shows every produced group, **toned by role**.
The result-group pill carries the GM-authored group name (Fabricate's outcome tiers are authored, so the name is the recipe's — never a crit/success/fail vocabulary the model does not have); its tone is the role the group plays, success-soft or danger-soft.
The reserved `role: 'failure'` group — the failure output for plain `simple` resolution mode and alchemy-Simple checkMode alike — is **rendered** (danger-bordered), not filtered out, so a simple or alchemy recipe's failure output is visible.
**The routed clause is CONDITIONAL, not absolute (issue 1098).**
In a routed mode the list renders a failure-toned row for a result group assigned to a failure-marked outcome tier **when the system's `craftingCheck.failureResultPolicy` permits results on failure**, and renders none when it does not — matching what the engine will actually do.
The successful-craft-makes-nothing warning still keys on the SUCCESS rows only: a recipe whose only group is a failure output still makes nothing when the craft succeeds, and says so.

### The On-failure section

Each activity route's fifth section renders the `failureResultPolicy` `RadioCardGroup`, whose `perRecord` card copy is **per activity** — "Decided per recipe" / "Decided per salvageable item" / "Decided per gathering task", from the same record-noun vocabulary the Difficulty card reads.
Crafting adds `consumeIngredientsOnFail` and `breakToolsOnFail`; the alchemy branch renders the policy beside its own behaviour flags, because alchemy `simple` is one of the two crafting modes where the reserved failure group is a live award.
Salvage renders `consumeComponentOnFail` and `breakToolsOnFail`, persisted since 1.7.0 and reachable from no editor before this; **gathering renders NEITHER**, because it has no consumption block, renders the **dormancy notice naming issue 683**, and cross-references `task.failureOutcome` read-only.
Where the policy is inert — `routedByIngredients`, `progressive`, gathering `d100` — the section renders a **stated inert note naming the reason** rather than a control that does nothing, and the control itself stays selectable, because the policy is persisted per ACTIVITY rather than per mode and switching modes must not reset it.
The prototype's sentence "Applies to every resolution mode" is therefore **recorded as NON-ADOPTED** and is not rendered: the requirement above makes the policy inert on three of the modes.

### Routed result-group authoring is policy-conditional

The recipe result-authoring control's outcome-tier options are drawn from the system's routed tier list **filtered to `success === true` when the failure-result policy forbids failure results, and unfiltered when it permits them** — a swap between two functions the codebase already has, not a new derivation.
`recipeReadiness`'s routed-check validation reads the SAME set, so the picker and the readiness warnings can never disagree about which tiers are assignable.
The companion "are any tiers defined at all" signal keeps its meaning and gains a third empty hint for "tiers exist, some are failure tiers, but the policy does not permit failure results", which names allowing failure results as a remedy alongside marking a tier as a Success.
The per-component salvage `outcomeRouting` select is policy-conditional on the same terms — it was unfiltered and therefore offered dead options.
**`minSuccessOutcomeId` is unaffected**: it names a minimum SUCCESS tier and its picker keeps reading the success-filtered set under every policy value.
**An authored `ResultGroup.checkOutcomeIds` entry naming a failure-marked tier is NEVER stripped on a policy change or a tier `success` flip** — the strip keys on tier-id existence, so the assignment persists on disk, stops being offered and stops routing, and routes again when the policy permits.
The successful-craft-makes-nothing warning still keys on the success rows: a recipe whose only group is the failure group still makes nothing when the craft succeeds, and says so.

The inspector's primary action is **`Edit recipe`** — the accent-filled, full-width, loudest control on the panel, and the point of the inspector.
`Duplicate recipe` is its secondary above it; `Delete recipe` is demoted to a ghost danger link below it, so the panel's loudest action is never destroying the recipe.
The inspector column stays at the shell's shared 300px; it is not widened per view.

Actions:

- Create
- Edit
- Duplicate
- Delete

In Manager, the recipes browser header offers a single primary `Create recipe` action (no crafting-system import/export on the recipes header); creating a recipe follows a create-then-edit model — `store.createRecipe` persists a new identity-only _incomplete shell_ in the selected system via `RecipeManager.createRecipe({ craftingSystemId }, { allowIncomplete: true })` (it saves because persistence gates on structural validity only, not completeness) and the manager immediately opens the recipe-edit view on it.
The new shell carries the default recipe name and image until edited, and the browse row surfaces a derived authoring-state pill — `Incomplete` while the shell is on, `Can't enable` while it is off — until the activation check would accept it (see the row authoring-state pills above; missing ingredient sets and result groups are the commonest, not the only, reason it would not).
The recipe browse row `Edit` action opens that same dedicated recipe-edit view rather than editing inline, and that Edit action is available regardless of the recipe's `locked` state.
The recipe-edit view is the **five-tab editor** specified in `## Recipe Editor` below — Overview, Ingredients, Results, Tools and Validation — over a controlled local draft in the central `manager-main`, with the GM manager's right-hand context inspector panel (the global `manager-inspector` aside) carrying that editor's context rail.
Ingredients, essences, tools, steps and results are all authored there; none of them is deferred, and there is no _Catalyst_ concept in the editor (Tools replaced it).
Identity edits track a dirty state surfaced by a header dirty chip, persist via `store.updateRecipe` → `RecipeManager.updateRecipe(recipeId, updates, { allowIncomplete: true })` (so an identity-only save is not blocked by the shell's still-empty ingredients/results), and a dirty draft prompts a discard confirmation on route exit.
The recipe-edit header follows the standard editor convention shared with the gathering-task, gathering-event, and environment editors: an `Unsaved` chip (when dirty), `Back to recipes`, `Delete recipe` (danger, enabled whenever a recipe is selected), and `Save`.
The context rail is **always present** on `recipe-edit`, and what its top section carries is decided by the system's canonical `visibilityMode` through `craftingEffect` (see `### Context rail`): the read-only access roster in `restricted`, the read-only Books & Scrolls "Appears in" summary in `item` / `knowledge`, and no top section at all in `global`.
It is **not** gated on the superseded `knowledge.mode`.
The layout collapses to a single column at the Manager container's narrow breakpoint (`@container fabricate-manager (max-width: 960px)`), mirroring the environment editor.
The recipe editor carries **no** per-recipe visibility editor: the legacy `recipe.visibility { restricted, allowedUserIds }` card is retired (see `### Visibility Form`), and the canonical `recipe.access` grant is authored on the Access tab.
The `recipe == null` form of this view shows a `Select a recipe` empty state.

Recipe browse row quick-actions render in a single non-wrapping action group, consistent with the environment and gathering-task browse rows.
That group is the `Edit` pencil alone: `Duplicate` and `Delete` are inspector-only, because three ghost icons on every row read as a toolbar and truncated the description.

**Recipe Studio — bulk selection.**

The GM recipe browser supports multi-select bulk editing.
Each row carries a selection control at its TRAILING edge, as the LAST cell of the row's action cluster after the `Edit` pencil, rendered through the shared selection-control primitive.
It is appended to that cluster rather than prepended: the cluster's column track list gains the selection track at its END, and the column header's explicit `grid-column` placements survive an append while a prepend would shift every one of them by a track.
A selection toolbar sits directly above the list carrying a tri-state control over the CURRENTLY RENDERED rows, a selected-count readout, a `Select all {N} results` action over ALL filtered rows, and a Clear action, rendered through the shared bulk-selection toolbar primitive.
The rendered-rows control and the results action are distinct operations and are never conflated; a collapsed category's rows are not rendered and are never selected by the former.
The selection is scoped to the selected crafting system, survives an editor round-trip exactly as the browser's other view state does, is cleared by a crafting-system switch, and never retains an id that no longer resolves to a recipe.

**Recipe Studio — bulk edit.**

While the selection is non-empty, the recipe browser's inspector rail renders the bulk edit panel IN PLACE OF the single-recipe inspector.
The panel stages changes without writing: category (single-valued, overwriting, with an explicit leave-unchanged option), status (leave unchanged / enable / disable), lock (leave unchanged / lock / unlock), check tier, and recipe-book membership.
The recipe-book axis is a search-and-pick control over the system's AUTHORED recipe items — never a vocabulary derived from the items the selected recipes already belong to, which would make an item holding no recipes unreachable as an add target.
Picking one shows how many of the selected recipes it holds and offers add and remove, each labelled with the number of recipes it would actually affect and each unavailable when that number is zero.
The held count is resolved on the same basis every other membership reader uses (see `### Books & Scrolls Surface`), so a system on the legacy basis reports its real membership rather than reporting none and making removal unavailable.
Staging accumulates across recipe items rather than being limited to the one on screen: each staged item appears in a list stating its operation, the number of recipes it affects, and its own control to leave that item unchanged.
This axis deliberately differs from the Component Studio's tag axis, which is a run of tri-state controls; the divergence is in the staged axis only, and both panels render the same shared bulk-edit chrome.
The check tier axis carries THREE distinct instructions and never collapses two of them: leave the recipe's tier alone, clear it to the system's default DC, and set a named tier.
Where the system's crafting check carries no recipe-level tier — a progressive system, a dynamically resolved DC, a fixed-type routed check whose per-recipe difficulty is its minimum success tier instead, a resolution mode that rolls no crafting check at all, or a check with no tiers authored — the panel states which of those it is in place of the control rather than hiding it.
A well-formed system whose mode rolls no check is told exactly that, and is never told its resolution mode is unrecognised.
That is not the same fact as the system having no usable check at all, which the row's own check pill already reports, and the two are never conflated.
When Enable is staged, the panel states before applying how many selected recipes cannot currently be enabled and will stay off, read from the SAME activation predicate as the row's `Can't enable` pill, so the pilled rows and the counted rows are one set by construction.
The write applies that same predicate but evaluates it per recipe in batch order, and alchemy signature uniqueness is order-dependent: two selected recipes that collide only with each other both read as enableable, and the write enables the first and refuses the second.
The pre-flight count is therefore a LOWER BOUND on what a batch may refuse and is worded as one; the post-apply report is the authority.
One action applies every staged axis to every selected recipe; it names the number of recipes it will affect and is inert until at least one axis is staged, including a removal-only book draft.
Applying persists through a single set-apply write — at most one `recipes` world write and at most one `craftingSystems` world write, and none for an axis that changed nothing — applies every ungated axis to a recipe whose enable is refused, reports the number of recipes changed, the number of enables refused, and the recipe-item memberships added and removed, then clears the selection and the staged changes, returning the rail to the single-recipe inspector.
The membership figures count MEMBERSHIP EDGES — one per recipe added to or removed from an item — not the number of items whose membership changed, and they exclude the basis-carry-across the first membership write performs.
Every part of that report composes; none replaces another, so a batch that moved membership still reports any enables the activation gate refused.
The set delete specified below is the panel's other exit and ends the same way, so the panel has exactly two terminal actions and both return the rail to the single-recipe inspector.

**Recipe Studio — set delete.**

The recipe browser's bulk edit panel offers a set DELETE, rendered below the panel shell rather than inside it, so a destructive action never reads as a second way of applying the staged edit.
The set delete exists because the panel swap above otherwise removes the only delete affordance at exactly the moment the GM has selected the rows they want removed; Edit and Duplicate stay inspector-only, because neither is destructive and neither has an impact worth stating.

The delete states its impact BEFORE it is armed and recomputes it when the selection changes: how many recipes will be deleted, how many recipe items will no longer contain them, and how many characters will lose the learned knowledge.
The recipe figure is the number of selected ids that RESOLVE to a recipe, not the size of the selection, because a stale id must not inflate the stated count above what the write performs.
The recipe-item figure counts DISTINCT RECIPE ITEMS — two selected recipes in one recipe item is one recipe item — expressly unlike the bulk-edit membership figures above, which count MEMBERSHIP EDGES.
It is basis-aware and may therefore exceed the number of definitions the write actually rewrites: on a system resolving membership through the legacy per-recipe scalar the item genuinely stops containing the recipe, and nothing is rewritten because nothing dangles.
The character figure is a DISTINCT union of the actors the deleting client may write, resolved through the same scope the deletion cascade uses, so the two sides count the same set by construction.
Its FRESHNESS is bounded rather than instantaneous: the count is read from a cached learned-knowledge index, rebuilt whenever the studio's data is re-read and whenever an actor write has marked it stale, not re-derived on every render.
A character who learns one of the selected recipes at the instant the card is on screen and untouched is therefore not necessarily counted until the card next recomputes, and the number the write performs is recomputed at write time regardless.
The cascade may also clear learned entries the figure did not count, because the clean-up it runs removes every entry naming a recipe that no longer exists — so a world carrying pre-existing orphans has them swept too, and the figure is the number this delete makes forgotten rather than the total number of entries the pass touches.
A consequence figure of zero is omitted rather than stated as zero; the recipe count always renders, because the impact statement is what the armed confirmation is paired with and a card stating nothing has lost that pairing.
Each consequence figure is gated on ITS OWN count, on the card and in the single-recipe confirmation alike, so the commonest single delete of all — in one recipe item, learned by nobody — states neither nought.
Both consequence statements are worded in the FUTURE and carry no pronoun standing for the recipes, because the recipe count, the recipe-item count and the character count vary independently and a statement agreeing with a count it does not branch on reads wrong on ordinary selections.
One countable noun names the recipe-item figure across the card, the confirmation, the completion message and the control's accessible name; `recipe item` remains the canonical noun of this specification, and the surface may use the `Books & Scrolls` display name provided it uses it everywhere in the interaction.
The card additionally carries a standing, always-rendered sentence that deleting is permanent and a recreated recipe is a new recipe, and qualifies the character figure with the fact that a character does not get their learn slot back — a property rather than a count, which no numbered row can carry and which a GM reading "will forget" would otherwise reasonably read as re-teachable.

Deletion is WARNED, not BLOCKED: no recipe is refused and no set member is skipped on account of the recipe items containing it or the characters who have learned it.
The set delete uses the two-step armed confirmation rather than a modal dialog, paired with the impact statement above; the armed token is dropped whenever the selection changes at all, because an arm is a statement about a specific set, while a staged bulk edit survives a selection change that leaves the selection non-empty.
The set write persists through AT MOST one recipes write and AT MOST one crafting-system write regardless of set size, in that order, followed by one actor-flag clean-up for the whole set rather than one per recipe.
The crafting-system write and the crafting-systems change signal are both skipped when the prune rewrote no definition, which on a legacy-basis system is every time; the recipes change signal is emitted for the delete itself.
The actor-flag clean-up is one clean-up, not one write pass: it clears the run store and the learned-recipe store, each over the actors the deleting client may write.
On success it clears the selection and returns the rail to the single-recipe inspector; because that exit unmounts the panel, the completion message is the surviving feedback and reports every non-zero outcome — recipes deleted, recipe items that no longer contain them, and characters who forgot them.
The keyboard is returned to the studio's toolbar and that same sentence is then announced through the manager's live region, per Emptying a bulk selection above.
The recipe-item figure it reports is the one the impact statement promised, not the number of definitions the write rewrote, so a legacy-basis delete does not report having done less than it stated.
A write that deleted nothing reports no success, leaves the selection intact and returns the control to its idle face rather than leaving it in progress, and tells the GM that nothing was deleted — whether the write failed or simply reached nothing, which a concurrent client deleting the same recipes between the statement and the click produces without any failure at all.
Focus is returned to the re-enabled control — because confirming disables the control and so moves focus to the document body — and that outcome is then announced through the card's own live region, in that order; disarming without confirming is announced through the same region, since it changes the control's accessible name while it holds focus.
The single-recipe delete states the same arithmetic in its confirmation, from the same computation, so the two forms cannot report different numbers for the same recipe.

### Books & Scrolls Surface

`Books & Scrolls` is the `Crafting` group's recipe-item management surface, available whenever a crafting system is selected (the `Crafting` group is unconditional as of issue 745).
It is a display name only: the surface manages every recipe item in the selected system regardless of the item's Foundry item type (book, scroll, ring, wand, gem, note), and `recipe item` remains the canonical noun.

The surface lists every recipe item in the selected system (from `selectedSystem.recipeItemDefinitions`), and for each item shows its identity (image and name), the recipes it contains (its canonical `recipeIds[]` membership) as a count plus the linked recipe names, and that item's OWN use/learn caps (read from `item.caps`) as read-only chips: a use-cap chip (craft charges) and a learn-cap chip.

Which basis resolves membership is recorded on the system, not inferred per read.
A system carries a monotonic `membershipResolvesByRecipeIds` marker: it is set by the first write to any definition's `recipeIds` and is never cleared, and on load it is set for any system that does not already carry it and has at least one definition with a non-empty `recipeIds`, so an existing marker is preserved rather than recomputed.
The write that first sets it seeds every definition in the system from the legacy scalars in the same write, so switching basis carries existing membership across rather than discarding it.
While the marker is unset, membership resolves through the recipe's legacy reverse ref — `recipe.recipeItemId` against a definition id, or, only when that scalar is ABSENT, `recipe.linkedRecipeItemUuid` against a definition `originItemUuid`; once set, only `recipeIds` resolves it, so an empty `recipeIds` array means "this book has no members" rather than "this system has not migrated".
Every GM surface resolves membership through the same implementation as the player-facing runtime and the delete impact statement, so the recipe browser's book column, the Books & Scrolls contents, and "n books & scrolls will lose them" cannot name different books for one recipe.
Re-deriving the basis per read — "any definition has a non-empty `recipeIds`" — is forbidden: it flips in both directions, so the first membership write to a legacy system would orphan every scalar-only member, and emptying the last array would revert the whole system and resurrect phantom memberships on player-facing reads.

Membership is authored on the item's **Contents** tab (writing the definition's `recipeIds`) or, for a multi-row selection, on the recipe browser's bulk edit panel — never on the recipe editor.
The caps are per recipe item, not a shared system-wide rule, so two recipe items in one system may show different chips (a one-recipe scroll beside a three-recipe tome).
When the selected system has no recipe items, the surface shows an empty state.

Selecting a row opens the `ItemPageInspector` aside; its quick-limit toggle is the sole remaining live-apply caller of `store.updateRecipeItemCaps` (the patch merges and normalizes onto the recipe item definition), and that toggle stages no dirty draft.
Editing a recipe item opens the full-window `recipe-item-edit` route — a tabbed editor (`RecipeItemEditorTabs`: Overview / Contents / Limits / Validation) over a root-held staged draft plus its last-persisted baseline.
That draft **is** part of the Manager confirm-discard route-exit chain (`confirmRecipeItemRouteExit`), so navigating away with unsaved edits prompts to discard.
The one exception is recorded under Manager Shell's Crafting route-exit guard rule: the read-time reconciliation there invokes no guard, so a cross-client `visibilityMode` edit that removes `Books & Scrolls` while this draft is open can redirect away from it with no prompt.
The learn cap authors `caps.learn.limitRecipes` / `maxRecipes` / `destroyWhenSpent` and `caps.learn.consumeOnLearn`; `consumeOnLearn` is hidden while the learn cap is enabled (the learn cap's `destroyWhenSpent` supersedes it).
The surface reads configuration only (recipe-item definitions plus the recipes referencing each item) and never reads per-item-instance runtime flags, so the admin store stays Foundry-free.

The item's Limits authoring surface (`RecipeItemLimitsTab`), in knowledge mode inside the `limitLearning` detail block, renders (issue 544) a **Limit applies** control and **Recipes allowed** stepper on one line, then a two-column line of searchable typeahead pickers: **Required Knowledge** (left, authoring `caps.learn.prerequisiteIds` — recipes the reader must already know) and **Learning prerequisites** (right, authoring `caps.learn.characterPrerequisiteIds`).
Each column is an uppercase label, a hint, a search input (typeahead) that filters the candidate options by name, and a wrap row of removable pills below it for the selected entries; the Learning prerequisites pill carries the option's `@path op value` preview as its title.
Both pickers sit **inside** the `limitLearning` block, so they hide when Limited learning is off — matching the runtime rule that neither gate is enforced when the toggle is off.
When there are no options (no candidate recipes / no `characterPrerequisites` library yet), the column shows an inline muted empty note in place of the search input (Learning prerequisites steers the GM to add them in System Settings first) rather than a detached paragraph.

The recipe-item editor's right rail's **"How players see it"** section renders the ACTUAL player book detail component (`InventoryDetail`) fed a synthetic row built by the pure, import-free `buildRecipeItemPreviewRow` helper (issue 544) — rather than a bespoke re-implementation — so the preview can never drift from what players see (mirroring the shared-`recipeItemAccessBadge` no-drift precedent).
The synthetic row mirrors the exact shape `InventoryListingBuilder._buildRecipeItemRows` emits (mode → `learnable`/`craftable`, applicability-suppressed caps, `requirements` kept only when learnable + Limited learning, `blocked`/`reason` folded onto each recipe), so the embedded detail renders the real access badge, description, "Needs: &lt;name&gt;" requirement chips (with met/unmet state), and per-recipe Learn/Craft affordances.
Because the GM preview has no actor, the **"Effective rules"** list's "Needs: &lt;name&gt;" rows (one per requirement, only when Limited learning is on; the character-prerequisite row's sub is the `@path op value` preview) each carry a GM-only **"Satisfied?"** toggle (`manager-status-toggle`, defaulting to satisfied so the preview opens unlocked).
Flipping a requirement's toggle drives that requirement's synthetic `met` state, which flows to the embedded `InventoryDetail` live — its requirement chip flips met/unmet and its Learn buttons enable/disable — letting the GM preview exactly what a player in any qualification state would see.
The toggle is an authoring experiment control only; it is never persisted.
In the player app, the **book detail** renders the "Needs: &lt;name&gt;" chip row full-width below the header from the row's `requirements` array (surfaced by `InventoryListingBuilder`), reflecting the acting actor's met/unmet state per requirement (success ramp + check glyph when met, danger ramp + lock glyph when unmet); a blocked recipe's Learn button is disabled (the enumeration is not repeated per recipe).

`InventoryDetail` is a thin **router** over three states (empty | book | component) and remains the entry point the preview renders; the book branch routes to `InventoryBookDetail`.
The no-drift guarantee is unchanged by that split — the preview still renders the real player component rather than a re-implementation.
The component branch owns the salvage surface, and the preview never **renders** it, because a book is never salvageable.
(Note this is a rendering property, not a module-graph one: the router imports both branches statically.)

### Access Surface

`Access` is the `Crafting` group's per-recipe grant surface for the `restricted` visibility mode (`AccessTabView` / `GrantAccessInspector`).
It is a Crafting nav sub-item that appears **only** while `visibilityMode === "restricted"` (`craftingEffect.showAccess`); the other modes do not list it.
It authors the canonical `Recipe.access = { characterIds, playerIds }` grant, replacing the legacy `visibility.allowedUserIds` player list.

The list (`AccessTabView`) shows the selected system's recipes with a search box, a Category filter, and an Access filter (`all` / granted / no-access); each row shows the recipe's **own** icon — resolved through the shared `resolveRecipeImage` helper, per `data-models/spec.md` `## Recipe` requirement 16, never a containing book's artwork — plus its name, category, and a grant chip (`N char · N player`, or a danger `No access` chip when no character or player is granted).
Selecting a row opens the `GrantAccessInspector` for that recipe, whose header thumbnail resolves the same way.

The inspector authors the grant through **two independent rosters** — Characters and Players — each with its own search box and pager:

- The **Characters** roster is the player-character actor roster (`adminStore.getPcRoster` → `services.getPlayerCharacterActors`); toggling a character grants or revokes its actor id in `access.characterIds`.
  A granted character makes the recipe visible to any viewer who **controls** that actor (assigned character or Foundry `OWNER` permission — see `recipe-visibility/spec.md`), not to a fixed user.
- The **Players** roster reuses the world-users projection; toggling a player grants or revokes its user id in `access.playerIds`, making the recipe visible to that user directly.
- Each toggle persists the **full** `{ characterIds, playerIds }` snapshot via `adminStore.saveRecipeAccess` (live-apply, no dirty draft), so searching or paging never loses a grant.

Grant state is read from `recipe.access`, and the surface stages no dirty draft, so it is not part of the Manager confirm-discard route-exit chain.

### Knowledge Surface

`Knowledge` is the `Crafting` group's per-character **runtime** knowledge audit: which owned copies of the selected system's recipe items each character carries, and which recipes each character has learned.
It is the play-state counterpart to the Books & Scrolls Surface (which authors recipe items) and the Access Surface (which grants visibility), and it operates on per-character **owned copies**, never on definitions.
It audits **world actors only**; the knowledge state of an unlinked-token synthetic actor is out of scope.
"Surface" rather than "Tab" is deliberate: `Tab` in this spec names top-level manager tabs, which Knowledge is not.

**Membership gate.** The rail entry is shown when `craftingEffect(visibilityMode).showBooksScrolls` is true **OR** the selected system's `resolutionMode === "alchemy"`, and is absent otherwise.
That gate is deliberately wider than Books & Scrolls': `learnRecipeOnCraft` writes `learnedRecipes` under **every** visibility mode, and under `global` + alchemy those entries are the sole reveal source, so a `showBooksScrolls`-only gate would leave the GM no lever at all in that documented discovery-only configuration.
Two consequences follow and are stated rather than discovered: under `global` + alchemy the Recipe items tab is legitimately empty and the Learned recipes tab carries everything; under `restricted` + alchemy the rail shows Access **and** Knowledge but **not** Books & Scrolls.
The entry carries **no count badge** — the count would require the tab-gated projection, which is a no-op precisely while the rail is rendered, and the sibling Access entry is count-less for the same reason.

**Layout and roster.** Three panes: rail, searchable character roster, detail pane.
The roster is **player characters only** — the same player-character predicate the Access Surface roster applies — with no show-NPCs toggle; an NPC's knowledge state stays reachable through the GM Knowledge Reset API.
The two rosters share the predicate, not the accessor: Access projects each actor into a display record, while this surface enumerates the LIVE actor documents, because the projection reads each actor's owned items and flags.
Each roster row carries the actor's portrait, name and an "N item(s) · M learned" meta line, with a dimmed "Nothing tracked" row for a character carrying neither.

**Default tab.** The surface opens on Recipe items, except when the selected system has **zero recipe item definitions**, in which case it opens on Learned recipes.
The rule keys on the definition count, never on the selected character's row counts, so the tab does not shift as the GM moves down the roster; and it is resolved **once on surface entry**, never as a live derivation over that count — a GM authoring the system's first recipe item elsewhere would otherwise flip the count and yank the open tab.

**Projected owned-copy row fields.** Identity (image, name, quantity), the Book / Scroll / Incomplete type derived from the recipe count, the contained-recipe count, `timesUsed` and `maxUses`, the derived remaining charges, `spent`, `inert`, `canExpend`, the resolved `learnScope`, and `matchTier` — the GM diagnostic tier from recipe-item matching.
`matchTier` is a **provenance** label, not an ambiguity report: its `duplicate` value names the weakest link (the copy reached its definition only through `_stats.duplicateSource`, the tier the bulk auto-learn gate refuses) and is reachable from a single definition, so the surface MUST NOT present it as a duplicate, conflicting, or ambiguous match.

**Rendering rules.**

- The uses chip has exactly three states: unlimited (info tone, "Unlimited"), remaining, and spent.
`remaining === null` means UNLIMITED and MUST render as "Unlimited", never "0 left".
`timesUsed` is shown before `maxUses` so a post-hoc cap change stays legible.
- `inert` renders as a **second, independent** chip whenever the flag is set, and is never folded into the uses chip.
That yields five renderable combinations, including **inert-but-not-spent** — the visible form of the "nothing ever clears `inert`" gap.
- Expend is **disabled** for a spent copy and for an uncapped copy (which would write nothing), and is **not** gated on `inert`: an inert-but-not-spent copy still has charges the runtime will spend, so disabling it there would apply a gate the engine does not.
**Known gap, recorded not fixed** (the sibling of "nothing ever clears `inert`"): "uncapped" is read from `limitUses` alone here, while the Unlimited chip is read from the derived remaining charges, and cap resolution passes `maxUses` through unnormalized.
A copy with `limitUses: true` and a `maxUses` that is not a finite number greater than zero therefore renders the **Unlimited** chip — correctly, by the fail-open convention — while Expend stays **enabled** and the engine core still increments a `timesUsed` that can never reach exhaustion.
That state is unreachable through the Books & Scrolls authoring UI and arises only from imported or hand-edited data, which is why it is recorded rather than gated: adding a `maxUses` test to the affordance alone would diverge the surface from `_applyRecipeItemUse`, and the real fix is to decide whether cap resolution normalizes `maxUses` or the engine treats that shape as uncapped on both axes.
A follow-up owns that decision.
- Delete deletes the **whole document** even for a stacked copy, behind a `services.confirmDialog` naming the quantity when `quantity > 1`.
- A spent row is muted by **colour on its name only**, never by a group `opacity`.
The chips are the row's only status signal, and compositing them through a group dim drops them below the 4.5:1 floor their 10px text needs; the disabled action button already carries its own reduced opacity, so the mute MUST NOT reach the action cluster either.
- `matchTier` earns a chip only for the actionable `duplicate` tier, which additionally carries a title naming the consequence (bulk auto-learn refuses that link).
The other tiers are diagnostic rather than actionable and are carried in the row's title, so the narrowest pane is not given a bare fourth chip on every row.
- Expend does **not** move focus: the row survives, so its own button keeps focus and a keyboard GM can walk a multi-use copy without re-tabbing.
Only the destructive actions, whose row unmounts, move focus to the owning tab panel.
- A learned row states its source on ONE line, resolved by a ladder over the entry: a still-owned source copy's name, else the member recipe-item DEFINITION name, else the trailing segment of the dangling uuid, and — for an entry with **no** `sourceItemUuid` — a GM grant or "Learned by crafting".
The grant rungs are consulted **only** inside the no-uuid branch: an entry that carries a uuid has real book provenance, and that provenance wins over any grant field beside it.
Inside that branch the discriminant is `granted === true`, **not** the presence of a label, so a grant with no usable label is still rendered as a grant.
The two grant states carry **distinct** kind values — a labelled `granted` and a label-less one — rather than one kind with an empty name, because the kind is the row's addressable test and capture hook, and collapsing them would leave the label-less state, which is the common one, unaddressable.
Each of the resulting kinds MUST have its own render arm: with the grant kinds falling through to the book rung's "Learned from {source}", a labelled grant would name a book that does not exist and a label-less one would render a dangling "Learned from " — the first a worse falsehood than the "Learned by crafting" it replaced.
- The row's leading meta icon is derived from that same kind.
A grant MUST NOT be decorated with the book glyph the book rungs carry: the line's whole content is that no book was involved, and the glyph would otherwise leave one muted word as the only difference between a grant and a craft.
The grant glyph MUST NOT be an award, medal or trophy, which would re-narrow a general GM grant to one caller's reward use case.
- **`granted` and `grantedBy` are UNTRUSTED at display.** The flag they live on is public, so a module that never passed Fabricate's write-side validation can set them to anything.
The surface MUST test `granted === true` strictly rather than for truth, MUST test `typeof grantedBy === 'string'` strictly rather than coercing (`String({})` renders "[object Object]", and an array survives the entry-boundary reader's nested-record test), and MUST clamp the label to the contract's maximum label length with a visible ellipsis, measured and cut in **code points** — a UTF-16 cut can split a surrogate pair and render the remnant as tofu.
The bound is **inclusive** of the ellipsis, so the rendered label never exceeds the length the write path refuses past; a contract-legal label renders verbatim.
This is a clamp, not a re-clamp: the write path _refuses_ an over-length label rather than truncating one, so nothing has clamped this value before.
Both tests and the clamp belong in the **projection's ladder**, not in the component, so no unclamped foreign text is ever published onto a row.
- The label MUST be rendered through text interpolation only — never `{@html}`, never into an `href`, and never into a `title` — and it MUST NOT be substituted into its translated sentence through any mechanism that interprets `$` patterns in the replacement.
Both `String.prototype.replace` and Foundry's `Localization#format` do: a label of `` $` ``, `$&`, `$'` or `$1` then rewrites the GM's audit line instead of appearing in it, while passing every type test, every length clamp and the framework's own escaping.
That is not a scripting hole — it is foreign text deciding what an audit line says, which is precisely what these rules exist to prevent.
Splitting the translated sentence on its placeholder and rendering the label as its own text node between the fragments satisfies this; so does a replacer function with the replacement's `$` escaped.
The requirement is on the property, not the mechanism.
- These display rules are scoped to **the entries the surface's own enumeration reaches**.
**Recorded gap, not fixed here:** that enumeration reads the learned-recipe flag map's top level rather than the shared entry-boundary reader, so a recipe id containing a `.` surfaces its first segment, resolves to no recipe, and is counted into `orphanCount` — presenting a real, non-orphaned entry as a phantom orphan and pointing the GM at the all-systems reset grain, which this section names as the orphan roll-up's only lever.
The gap is **pre-existing and independent of granting**: the same flag is written by the book-learn path and read by the same raw enumeration, so a dotted id already surfaces this way for a book-learned entry, and a dotted id cannot be newly minted because recipe-id intake refuses one.
Routing the enumeration through the shared reader changes the orphan and other-system roll-ups for every world already carrying such an id, so it is owned by a follow-up rather than made contingent on any one writer.
- A learned row whose erase will free no budget states WHY as a single icon-led clause appended to its source line, rather than a banner promise the erase cannot keep.
It MUST NOT be a second sub-label: the previous pairing stated one fact twice, because a source line reading "(copy no longer owned)" was itself the cause of a separate "Frees no slot".
The clause is cause-SPECIFIC and MUST NOT collapse to one string, because the condition is the full four-condition rule in Knowledge Reset / Erase: a still-owned source copy whose definition carries no learn cap frees nothing, so a clause claiming there is no owned copy would be false for that row.

**Confirmation affordance.** The two high-frequency row actions (Delete a copy, Erase a memory) use an inline two-step arm rather than a modal: the first click arms the control, the second executes.
It is a real focusable `button`, its icon swaps as well as its label so the state survives greyscale, its `aria-label` carries the full consequence sentence, and `data-armed` is the test hook.
The armed token is keyed on the **target document id**, never a row index, because the projection re-publishes asynchronously from actor and item hooks.
Exactly one armed token exists at a time, and it is dropped on: character selection change, tab switch, roster search-query change, any executed action (including Expend, which clears the token but deliberately leaves focus alone), `Escape`, `blur`, arming a different row, and any projection publish that no longer contains the armed id.
There is no auto-disarm timer.
`services.confirmDialog` is retained for the heavyweight cases: a stacked delete and both reset grains.
For the stacked delete the dialog is **additional to** the arm, never a substitute for it: the Delete control is the same armed button on every row regardless of quantity, and the dialog is raised by the store action the armed second click invokes, so the sequence is arm, confirm, dialog.
Branching the control itself on quantity is forbidden — it would make an armed row's affordance depend on a projected field that a re-publish can change underneath the GM.
Any consumer describing this to a GM MUST describe three steps, not a dialog replacing the arm.

**Per-character reset.** The detail header offers **both** grains — "this system" and "all systems" — routed through the GM Knowledge Reset API with and without a `systemId`, each behind a `confirmDialog`.
Both are required: reset-one-system deliberately leaves orphan learned keys in place, so only the all-systems grain can clear them and give the surfaced orphan roll-up a reachable lever.
The dialog body is where the erase-versus-reset discovery-progress asymmetry is disclosed.

**Disclosure placement — one idea per strip, never a banner stack.**
The Recipe items tab carries one persistent info banner naming what its two row actions do — expending a use spends one charge as if the character read the item, and deleting removes the copy from their pack entirely.
It is not a restatement of the page subtitle two rows above it.
The party-pool ordering hazard renders as a **conditional** warning band, raised only when the selected character owns a `learnScope: "total"` copy that is the source of a still-learned entry; a permanent band for a conditional hazard is noise.
The Learned recipes tab's band states the general rule without promising slot recovery, and the per-row no-refund clause carries the per-row truth.

**Refresh and reference contract.** The projection MUST NOT join the shared admin-store `refresh()`, which ~40 mutation paths invoke and which has no cheap invalidation signature for a whole-world actors-by-items scan.
It is computed by a separate refresh gated on a `knowledgeActive` flag, so it is a total no-op while the surface is closed, and while the surface is open the externally-driven actor/item hooks coalesce into one refresh through the existing microtask scheduler.
Each store action awaits its seam call and then re-runs the knowledge refresh, never the shared `refresh()`.
The result is published as a top-level `viewState.knowledge` and is **always a new object**; it MUST NOT hang off `selectedSystem`, which would force a `selectedSystem` reference rebuild on every knowledge publish and let a late second-phase publish clobber freshly projected rows.

### Recipe Dependency Graph

The graph route itself is still planned (#442) — the rail item remains a disabled `Soon` placeholder behind `fabricate.experimentalFeatures`, per the Manager Shell navigation contract above.
What is specified here is the DATA contract the store already publishes and any implementation of that route MUST honour, because the bound below is a product decision about what a GM is shown, not an implementation detail of whichever view eventually renders it.

**The graph is bounded by default.** The default bound is **500 nodes and 2,000 edges**.
The recipe dependency relation is producer x consumer through shared components, so one component produced by P recipes and consumed by C recipes contributes P x C edges; an unscoped graph over a system with thousands of recipes is therefore quadratic in recipes and cannot be laid out or drawn on the main thread.
The bound is enforced during construction, not by discarding a completed graph: node selection precedes edge derivation and edge derivation stops at the budget, so the bound bounds work rather than only output.

**Supported query scopes.**

- `all` — the whole system, complete when the system fits inside the bound.
- `recipe` — a selected recipe plus a hop radius over the dependency relation (default 2 hops).
- `component` — a selected component's producers and consumers, interleaved so that a neighbourhood truncated at the node bound still shows dependencies rather than one side of them.
- `cohort` — an explicit recipe id set, which is how a search or category filter is applied, resolved BEFORE the bound is spent so the bound never discards the recipes the GM searched for.

**An unscoped system over the bound returns no graph and says so.**
It MUST NOT return an arbitrary 500-recipe slice.
There is no comprehensible 500-recipe subset of an unscoped 10,000-recipe corpus, and a rendered slice would be read as the system.
The query instead reports that a scope is required, together with the true recipe count, so the GM can scope the question or ask for the full graph explicitly.

**Disclosure is mandatory and is carried in the data.**
Every graph result carries a bound descriptor stating the scope, the budgets in force, the system's total recipe count, the candidate node count where it is exactly knowable, whether the result is complete, and which budget stopped it.
A view rendering a result whose bound is not complete MUST state plainly that it is showing a bounded neighbourhood rather than the whole system.
Filtering or laying out a graph carries the descriptor through unchanged: neither operation can make an incomplete graph complete.

**The full graph stays available on explicit request only.**
An explicit unbounded request lifts both budgets; it is never the default, and it does not make the result complete by assertion — the descriptor still reports what was produced.

**Indexes are retained, not rebuilt per interaction.**
The producer/consumer relation is indexed once per recipe revision, keyed on the revision token `RecipeManager` mints for the selected system, and re-queried for every filter or search interaction.
A definition change advances the token and rebuilds; nothing else does.
The index stores the relation THROUGH components and expands neighbours on demand rather than materialising recipe-to-recipe adjacency, because that materialisation is the same producer x consumer product the bound exists to prevent.

### Environments Tab

Only shown when `features.gathering === true` for the selected crafting system.

Current GM editor behavior:

- The tab is hidden when the selected system does not enable gathering.
- The admin shell falls back to a visible tab when system or feature changes make `Environments` unavailable.
- The tab loads the selected system's environment list from the gathering environment store.
- Environment list and draft records are cloned before exposure to the Svelte view.
- The selected draft can edit environment name, description, enabled state, `selectionMode`, and optional `sceneUuid`.
- The selected draft can edit a player-facing environment image independent of any linked scene.
- The selected draft can edit gathering composition tags: multiple `biomes` and multiple `dangerTags`.
  Geography is no longer a composition tag and the legacy single-`region` selector has been removed; geography is authored as realm membership (see the realm multi-select below).
- When `gatheringRealmSettings.enabled` is `true`, the environment editor surfaces a multi-select **realm** chip control (`includedRealmIds`) mirroring the biome selector, sourced from the system's `GatheringRealm` records.
  When the toggle is off the realm control is hidden entirely.
  When the toggle is on but the world has no realms yet, the control shows a muted empty line pointing the GM to create realms under World > Travel first, and says they are shared by every crafting system.
- The selected draft can edit risk display/evidence and risk-to-danger matching evidence where supported.
- The selected system's Gathering Settings tab configures d100 reward selection, event selection, limits, and event outcome through `gatheringConfig.systems[systemId].rules`.
- The selected system's Gathering Settings tab configures per-system `Times of day` and `Weather conditions` matching settings with enable toggles, current value selectors, add controls, label/icon-editable value pills, and selected-system cleanup on deletion.
- The Environments editor shows current global weather and time of day as context, not as environment browse filters.
- Settings is the only primary GM UI surface for current global weather and current global time of day.
  Environment authoring may expose inherited condition evidence and future provider override evidence, but must not be the primary condition mutation surface.
- The Environments editor exposes Gathering Task and event library rows for the selected crafting system, including per-environment automatic/manual composition controls.
- In automatic composition, task and event tabs show Included, Excluded, and Non-matching record sections; excluding a record writes the matching `disabled*Ids` list and Restore clears it.
  Non-matching rows offer **Force add**, which writes the matching `forced*Ids` list and composes the record against the filter; it is the `warning`-role control above, and automatic composition is the only mode that offers it.
- In manual composition, task and event tabs show only Included in this environment and Available to add.
  Removing an included manual task or event clears `enabled*Ids`, ignores stale `disabled*Ids` and `forced*Ids`, and returns the record to Available to add according to its candidate, non-matching, or library-disabled state.
- Manual Available to add rows present Add for matching AND for enabled non-matching records — manual composition has no match filter, so it has no force add — and a disabled library note for library-disabled records.
- When the Manager Gathering `Environments` browser has no environments, its empty state keeps `Environments` selected, keeps `Create environment` available, and guides GMs to prepare Gathering Tasks plus encounter/event options before composing environments.
- Gathering Task and event row overrides stay inside expandable rows so the default environment workspace remains scannable.
  Collapsed rows show default-vs-override chips, enabled state, matching evidence, dirty/validation markers, and an explicit expand/collapse control.
- Expanded override panels contain per-environment override fields only; Gathering Task fields remain edited in their library surface.
- Expanded override rows are keyboard reachable, preserve focus on save/error where practical, and stack without horizontal clipping in narrow Manager widths.
- Gathering Task authoring includes identity, image, description, enabled state, task-level time/weather availability gates, search/pagination for ordered d100 drop rows, unresolved drop-zone rows, inline chance/quantity controls, modifier summaries, selected-drop inspector editing, and final chance preview.
  D100 row selection is controlled by selected-system Gathering Rules, not Gathering Task authoring.
- Gathering Task authoring may also include node count, depletion timing, respawn policy, stamina cost, attempt limits, risk overrides, encounter hooks, natural expression providers, and macro providers where the selected economy/features use them.
- Reusable event authoring includes name, image, description, enabled state, danger/match tags, d100 drop rate, and modifier provider evidence.
- The selected-system inspector exposes the WORLD character modifier library for gathering (issue 1308; per-system until then), with add/edit/delete controls, opt-in preset seeding when supported by the active Foundry system, and stale-reference evidence for rows that still point at deleted modifiers.
  The inspector projection is an explicit allowlist, so neither library may be projected off the crafting system any more: a field omitted there is invisible to the UI, and one projected from the system would show a stale copy the corpus no longer carries.
- D100 drop row and event editors expose character modifier references with modifier selection, `+`/`-` operator, optional min/max bounds, per-row override fields, and clear GM-facing evidence without leaking expression or macro internals to non-GM blind history.
- The settings/tag area can edit gathering vocabularies for biomes and danger.
  The legacy `regions` vocabulary dimension has been removed (geography is not a composition tag); geography is authored as `GatheringRealm` records under World > Travel > Realms.
  Weather and time-of-day vocabulary editing lives in the Gathering Settings tab condition panels.
- The editor keeps core environment identity separate from task/node authoring.
- The editor allows environments to exist without a linked scene.
  Scene link controls are optional access/evidence controls, not the identity of the environment.
- The editor should group rich gathering authoring into Overview, Location, Conditions, Tasks / Nodes, Results, Risk / Encounters, Economy, Visibility, and Advanced sections or equivalent groupings.
- Conditions authoring shows which task availability, yield, risk, stamina, or difficulty modifiers are active.
- Tasks / Nodes authoring exposes task identity, enabled state, current node count, max node count, depletion timing, respawn policy, next respawn evidence, and manual restock controls when node economy is enabled.
- Manual restock controls are GM-only and show whether they affect current count, max count, or both.
- Economy authoring shows the selected gathering economy mode and exposes only relevant controls as primary: time requirement for `time`, node controls for `nodes`, stamina cost/regeneration for `stamina`, and combined controls for `hybrid`.
- Economy authoring exposes a Gathering resolution mode card above the Limitation mode card.
  It offers `d100` (the only currently implemented gathering resolution; selectable and the default),
  `progressive`, and `routed` (display name "Routed by check").
  `progressive` and `routed` are modelled but unimplemented and SHALL render disabled with a "Coming soon" affordance;
  clicking a disabled option persists nothing.
  The selection persists on the system gathering economy block as `economy.resolutionMode`.
- Stamina authoring exposes system-level stamina configuration, including max/current provider strategy, regeneration mode, regeneration rule, manual adjustment permissions, and task stamina costs.
- GM controls allow authorized GMs to manually set an actor's current gathering stamina and, when Fabricate owns the maximum, maximum gathering stamina.
- Risk / Encounters authoring exposes environment risk, task risk overrides, encounter table links, trigger hooks, and player-facing risk copy.
- Encounter controls are optional and must not require every gathering task to have an encounter table.
- Attempt limit authoring exposes limit scope, max attempts, time window, recharge policy, probabilistic recharge settings, manual recharge controls, and current counter/recharge evidence.
- Blind environment authoring allows multiple tasks, hide-by-default behavior, blind task-selection strategy, progressive reveal toggle, reveal scope, reveal triggers, manual reveal, and reset/revoke reveal controls.
- Developer/API configuration should expose hook enablement notes, chat message settings, provider diagnostics, and integration-safe identifiers for environments, tasks, nodes, stamina, attempt limits, encounters, and reveal states.
- Chat message controls should allow GMs to choose which gathering lifecycle events produce chat messages and whether GM diagnostics are whispered/restricted.
- The editor evidence column should preview the player-facing environment card, task availability, modified yields/costs, risk, encounter hooks, stamina cost, and validation.
- The selected draft can add, select, duplicate, delete, and reorder tasks.
- The selected task can edit `name`, `description`, `img`, `enabled`, and `resolutionMode`.
- The selected task can add, rename, delete, and reorder result groups.
- The selected task can add, edit, delete, and reorder component-based results within a result group.
- Editable result fields are `componentId` and `quantity`.
- The selected task can add, edit, and delete catalysts.
- Editable catalyst fields are `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and nullable `maxUses`.
- Catalyst `maxUses` is validation- and runtime-relevant only when `degradesOnUse === true`; when degradation is disabled, `maxUses` is ignored.
- The selected task can enable, edit, and clear a visibility gate.
- Visibility-gate authoring is formula-only: it uses a `formula` and a `threshold` field, with no provider select and no macro UUID field.
- Incomplete visibility input is local UI state only and must not be sent to the environment store until both fields are present.
  Clearing visibility calls the store only when a committed visibility gate exists.
- The selected routed task can edit `resultSelection.provider` as `macroOutcome` or `rollTableOutcome`.
- Routed `macroOutcome` authoring uses available script macro options for `macroUuid`.
- Routed `rollTableOutcome` authoring uses a UUID text input for `rollTableUuid`.
- The selected progressive task can edit `progressive.awardMode` as `equal`, `partial`, or `exceed`.
- Progressive check authoring is formula-only: it uses a `formula` and an optional `threshold` field, with no provider select and no macro UUID field.
- Progressive difficulty is displayed from the selected managed component difficulty; result-level inline difficulty is not persisted.
- Managed item options are prepared by the admin store/root and passed into the environments tab; the tab does not perform Foundry lookups.
- Task, result-group, result, catalyst, visibility, result-selection, progressive, check, time-requirement, and failure-outcome mutations preserve other nested task configuration.
- Dirty state is tracked for the selected draft, and save/cancel affordances are visible.
- Creating a new environment persists a disabled draft shell with one disabled placeholder task for validation compatibility.
  New draft placeholder result groups receive immediate IDs so they can be edited before save/reload.
  This shell is not a configured player-visible gathering path until configured and enabled by the GM.
- Duplicate, delete, and reorder actions use gathering environment store methods.
- Delete requires confirmation and cleans referenced active and historical gathering runs through the store.
- Store-owned task/result/catalyst/visibility/result-selection/progressive/check/time-requirement/failure-outcome callbacks are delegated through the admin store and remain inside the environment draft save/cancel flow.
- The selected-task time-requirement editor supports clearing `timeRequirement` for immediate resolution and editing minutes, hours, days, months, and years for timed tasks.
- The selected-task failure-outcome editor supports clearing to default failure feedback plus text and macro custom outcomes, with failure-outcome `mode` switching (`text`/`macro`) clearing stale fields from the prior selection.
- Save-blocking validation exposes a localized summary, inline field-addressable errors, `aria-invalid`, `aria-describedby`, keyboard focus to the first invalid field after failed save, and persistent stale-reference warnings.
- Validation identifies invalid node counts, invalid respawn policies, invalid stamina formulas/providers, invalid condition modifiers, invalid encounter table links, invalid attempt-limit settings, and risk values outside supported vocabulary.
- Narrow-window layout behavior is implemented with app/container-width rules so list/editor panes and advanced controls remain reachable in resized Foundry windows.

Validation rules from `gathering-and-harvesting/spec.md` must be enforced before save.

The environments editor must block save when:

- `selectionMode === "blind"` and multiple tasks can be selected without valid blind-selection/redaction configuration
- `selectionMode === "targeted"` and the environment has zero tasks
- a task is missing required routed or progressive fields
- a task's result groups violate reserved failure keyword rules

### GM World Rules & Resources Route

World always exposes `Rules & Resources` beside `Parties` and `Travel`, including with no selected system.
It is the ONE place the three world-scoped libraries are authored: the coin ladder, spend strategy, provider and GM macro set (`data-models/spec.md` -> CurrencyConfig), the character prerequisite library, and the modifier library (`data-models/spec.md` -> CharacterLibraries).
A crafting system's Settings tab keeps only the currency participation toggle; it carries neither library and offers no authoring surface for one.

- **Every route in the group is UNGATED**, like Parties and Travel and unlike experimental-gated Downtime.
  Each is reachable with no crafting system selected, with every system's currency toggle off, and with `fabricate.experimentalFeatures` disabled, because a GM must be able to author these libraries BEFORE any system references them — gating an authoring surface on a participation flag would make it unauthorable from a standing start.
- The group is a rail GROUP, not a leaf, following the shipped Travel and Downtime groups: a parent row, a disclosure toggle and a submenu.
  The parent carries the stable id `manager-world-nav-rules` and the hook `data-world-nav-item="rules"`, uses the `fa-scale-balanced` icon and a localized accessible name, and surfaces the total entry count across all three libraries on `.manager-nav-count`.
  Activating the parent navigates to Currency rather than opening an empty group.
- The group has THREE DESTINATIONS, each a route token of its own — `world-currency`, `world-prerequisites`, `world-modifiers` — with sub-item ids `manager-rules-nav-currency`, `manager-rules-nav-prerequisites` and `manager-rules-nav-modifiers` and the hook `data-world-rules-item`.
  Three sibling tokens rather than one token plus a sub-tab variable, which is what Travel and Downtime use: the Checks group is the precedent for a group whose children are real routes, and preserving `world-currency` avoids renaming a token the View Lab cases, the route-scoped CSS and the documentation all name.
  The active destination is stamped on the shell as `data-world-rules-tab`.
  Each survives selected-system capability, card, and selection transitions exactly as the World Parties route does, and each participates in the Manager confirm-discard route-exit chain, carrying its destination as the route-exit subject id so a guard can tell a real move from re-entering the page the GM is already on.
- Each page renders its own `<main class="manager-main">` (the Downtime world tab's structure, not the Parties one, which reuses `EnvironmentsBrowserView` for historical reasons) and carries a page hook: `data-world-currency-page`, `data-world-prerequisites-page`, `data-world-modifiers-page`.
- **Full width is TWO edits, and neither is correct alone.**
  The route MUST be excluded from the shell's shared `.manager-inspector` aside in the component, AND its `.manager-body` grid column MUST be released in the stylesheet, in both the normal and the `.is-rail-collapsed` rule.
  Suppress the aside without releasing the column and the page renders against a permanent ~300px dead strip; release the column without suppressing the aside and the empty aside wraps to an implicit grid row beneath the editor.
  This has been got wrong twice: once on the Checks route, and once on `world-currency`, which was suppressed in the component from the day it shipped and never released in the stylesheet.
  A route appended to the END of an existing grouped selector list is invisible to the parity gate, which inspects only the selector that closes a group, so a newly released route belongs in its own rule pair.
  The aside's fall-through renders a generic "Select a system" panel, so a route omitted from the exclusion list gains a permanent 300px column of unrelated content beside an editor that has no selected system at all.
  The route also carries a `grid-template-rows: minmax(0, 1fr)` layout override, as the Downtime route does and for the same reason: the tab renders a single child straight into `.manager-main`, so on the shared three-row shell it would land in an auto-sized row and a tall ladder would grow the Manager instead of scrolling inside its own panel.
- **The page header offers NO actions.** The route's own two actions — Add currency unit and Seed presets — live on the card header, where the provider read-only condition that hides them is computed.
  The exclusion is required rather than incidental: the header-actions block falls through to Import / Export / Create for any route without a branch of its own, and those act on CRAFTING SYSTEMS — so on a route that deliberately has no selected system, "Create" would create a crafting system and "Export" would sit permanently disabled against an id the route does not have.
  This is where World Currency departs from World Parties, which lifts its single New party action into the page header instead.
- **Each editor moved wholesale rather than being redesigned.** Every control is the one that stood in its System Settings card, with its test hook renamed `data-system-currency-*` -> `data-world-currency-*` and `data-system-modifier*` / `data-system-character-prerequisite*` -> `data-world-modifier*` / `data-world-character-prerequisite*`; no new primitive is introduced.
  The whole-section collapse does NOT move with them: these are pages, not accordions, so the body always renders and the per-ROW summary collapse is the only collapse that survives.
- **The cross-copy between the prerequisite and modifier libraries becomes a NAVIGATION.**
  A page component cannot perform one, so each page hands the source entry to a callback and does nothing else; the route owns the mapping, the write to the destination library, the route change, the open request and the aria-live confirmation.
  The confirmation MUST be rendered by the destination rather than the source: rendered on the source page it is torn down by the navigation before an assistive technology reaches it.
  The destination opens the new entry and reveals it, because a copy is appended to the end of a library and an entry that is open but off-screen is indistinguishable from one that was never created.

Shipped controls:

- A whole-section collapse toggle in the card header (`<button aria-expanded aria-controls>` with a chevron), matching the Settings-list ergonomics contract; the state is in-memory and never persisted.
- A config-level block above the unit list with a spend-strategy `<select>` offering the three peer strategies (`actorProperty` / `actorInventory` / `macro`; both dnd5e and pf2e), each with `<small>` hint text reflecting the selected strategy.
  When `actorInventory`, a provider `<select>` populated from the provider registry (or an empty-provider callout steering the GM to the macro strategy when the active Foundry system has none).
  When `macro`, four macro drag-and-drop zones (`canAfford`/`increment`/`decrement`/`balance`) that accept only `type === 'Macro'` drops, resolve the linked macro name/icon, support unlink (button + right-click), and show a missing state for unresolved UUIDs.
  The `increment` hint names every occasion the macro is actually invoked on — the player-cancel refund (the `refundOnPlayerCancel` policy), a companion's currency credit, and giving back a pooled cost a take could not complete — and says what its absence costs, because a hint that describes a macro as reserved or single-purpose sends a GM past the field that a pooled currency take is refused for want of.
  The `balance` zone is the fourth key (issue 1342) and the only one that ASKS rather than acts: it is what lets a `macro` world answer a pooled holdings read at all, it is OPTIONAL on the `increment` precedent, and its hint states the return contract — a number of the ladder's smallest coin, anything else reading as unknown.
  There is no nested inventory-mode `<select>` — macro is its own peer strategy.
- Add currency unit and seed preset actions
- Under `actorProperty` and `macro`, selectable expandable currency unit editors for label, abbreviation, icon, with a per-unit detail field that adapts to the strategy — actor data path (`actorProperty`), or no path/denomination field with a "macros match by abbreviation" note (`macro`)
- Under `actorInventory` (with a provider) the GM-editable unit editors are replaced by a separate read-only, provider-managed denomination list (a "provider-managed denominations" callout plus per-unit label/abbreviation/coin-denomination shown as static values); the selected provider owns the denomination ladder, so the units are not GM-editable.
  The add-currency-unit, seed-preset, add-sub-unit, and sub-unit controls below are hidden while the provider branch is active.
- Add-sub-unit dropdown with plus action
- Sub-unit pills with editable amount and remove action

Every control live-applies through the admin store and stages no draft.
Each store action addresses the ONE world configuration and takes no `systemId`; persistence goes through `CurrencyConfigStore`, which normalizes and always saves (`data-models/spec.md` -> CurrencyConfig requirement 4), rather than through `updateSystem`.
The projection reads the world config straight from its store on every publish, so another GM's edit to the ladder is picked up without a per-system cache to invalidate.

### GM World Scoped Entity Routes

World exposes the component, essence and tool CATALOGUES and their entry editors, each reachable with no crafting system selected.
They render the `## Scoped Entity Definitions` model (`data-models/spec.md`): a world record's identity, its world defaults, and a row per crafting system that has a System Membership Record for it.

The World Vocabulary is deliberately NOT part of this requirement — see `### GM World Vocabulary Route`.
It holds the category and tag vocabularies these entities draw FROM, and folding the two together would be the first place in this corpus to lose the boundary `data-models` draws in terms.

1. **FOUR world rail leaves, ABOVE `Parties`, in the prototype's authored order:** `Component catalogue`, `Tags & Categories`, `Essence Catalogue`, `Tools Catalogue`.
   Each is UNGATED and reachable with no crafting system selected, like `Parties`, `Travel` and `Rules & Resources` and unlike experimental-gated `Downtime`, because the world catalogue must be authorable before any system opts into anything.
   **The labels are exactly as authored, and three of them read as typos while none is:** `Component catalogue` carries a lowercase `c`, `Tools Catalogue` is PLURAL where its siblings are singular, and `Tags & Categories` is character-for-character identical to the system-scope entry higher in the same rail.
   The prototype is the authority for rail labels and order, and the parity oracle asserts landmark ORDER, so "correcting" any of the three reds that gate.
   Each leaf carries a stable id — `manager-world-nav-component-catalogue`, `manager-world-nav-vocabulary`, `manager-world-nav-essence-catalogue`, `manager-world-nav-tool-catalogue` — and the hook `data-world-nav-item`, and ALL FOUR surface a world corpus count on `.manager-nav-count`.
   The three entity leaves count their own corpus; the vocabulary leaf's count is defined by `### GM World Vocabulary Route`, which owns that badge because the World Vocabulary is not a scoped-entity corpus.
   The badge is hidden at the 56px collapsed rail width, where every leaf is reduced to its glyph, so the count is not the collapsed rail's accessible name — see requirement 8.
2. **SEVEN route tokens** — `world-components`, `world-component-entry`, `world-essences`, `world-essence-entry`, `world-tools`, `world-tool-entry`, and the vocabulary token that requirement's own section names.
   Each passes `normalizedActiveView` through the world pass-through and ABOVE its `if (!system) return 'systems'` fallthrough, because a world screen's normal state is that no crafting system is selected and that fallthrough would otherwise bounce every one of them.
   Each is absent from `setView`'s `!selectedSystem` refusal and from `SCOPE_BROWSER_BY_VIEW`: a world route has no per-system record to be stranded on when the rail's scope select changes.
   Each participates in the Manager confirm-discard route-exit chain.
3. Each route renders its own `<main class="manager-main">` carrying a per-page hook, `data-scoped-page="<token>"`.
   **A CATALOGUE'S TRAIL IS TWO CRUMBS AND AN ENTRY'S IS THREE.**
   A catalogue is `World > <screen>`, because it IS a world screen rather than a destination inside a group.
   An entry is `World > <catalogue> > <entity>`, with the MIDDLE crumb a button back to its catalogue: an entry editor is released to full width by requirement 4 and therefore renders no inspector, so that crumb is the only affordance out of it, and the same "a button wherever it is not the leaf" rule the `World` crumb follows applies to it.
   The leaf names the ENTITY when the published corpus can supply a name and falls back to the screen's own title otherwise, because an entry route with no subject chosen and one whose subject the corpus no longer holds are the same thing to a breadcrumb: there is nothing to name, and an empty crumb is not an answer.
   The shell owns the trail, so the subject a later lane chooses reaches it through props the pages already have: a catalogue page takes `onOpenEntry(entityId)` and an entry page takes `entityId` and `onBackToCatalogue()`.
   That seam is what keeps requirement 7 true for an entry editor, which cannot render its own crumb.
4. **Full width is ONE mechanically checked decision over a THREE-state classification.**
   Suppressing the shell's shared `.manager-inspector` aside in the component and releasing the `.manager-body` grid column in the stylesheet — in BOTH the normal and the `.is-rail-collapsed` rule — are one decision expressed twice, and each half alone is wrong in its own way; this has shipped half-done twice already (the Checks family, and `world-currency`).
   The decision is recorded ONCE, as a set of `{id, predicate, selector, layoutClass}` entries, and the aside chain is BUILT from that set rather than restating any clause.
   `predicate` rather than a route token, because three of the shipped exclusions are not tokens: `checks` is a FAMILY matched by a prefix selector, World > Parties is a route+SUBSTATE matched by a compound attribute selector, and the world-rules clause spans three tokens.
   `layoutClass` because the stylesheet holds THREE layout states and not two: `tool-edit` and `knowledge` suppress the aside AND keep three tracks, repurposing the third column, so a gate asserting "aside excluded equals column released" is unsatisfiable and every loosening of it is vacuous.
   The classes are `shared-3-track`, `full-width-2-track` and `self-owned-3-track`; the aside chain reads the UNION of the last two, and the Tool Studio library is the route-scoped member of the first — it re-widths its third column and KEEPS its inspector.
   The gate asserts SELECTOR-STRING equality between the set and the stylesheet's own classification, parses AT-RULE-AWARE (`.manager-body` is re-declared inside an `@container` block, which a flat scan reads as "every route released"), and asserts both parsed sets NON-EMPTY and carrying three named baseline members BEFORE the equality — because the house helper for reading a rule out of that stylesheet answers `''` on no match, so the cheapest green available to a broken parse is two empty sets comparing equal.
   The rows override sits on `.manager-main`; `.manager-body` declares no `grid-template-rows` at all, so writing one there would invent a row model for every route sharing the base rule.
5. **The three SYSTEM-scope entries render the authored screen titles `Component Rules`, `Essence Rules` and `Tool Rules`.**
   These are SCREEN TITLES AND NOT DOMAIN NOUNS: the relation each edits is a System Membership Record, and no route token, setting key, code identifier or persisted field takes the spelling `rules` for it.
   The route tokens are PRESERVED unrenamed, so every deep link, every capture-case `expectView` and every stored `activeView` keeps resolving.
   The relabel IS the screen's name everywhere it names the SCREEN — the rail entry, the page title, the breadcrumb crumb and the browser's `<main>` accessible name — because a page titled `Component Rules` whose accessible name said `Components` is the WCAG 2.5.3 Label in Name hazard.
   Where the same lang key named the DOMAIN NOUN rather than the screen, it is left alone; the system inspector's essence count is the one such use.
6. **NEITHER HARNESS MAY MATCH A RAIL ENTRY BY VISIBLE TEXT.**
   Both scopes now carry a `Component`-prefixed entry, `Tools` is a live substring of `Tools Catalogue`, and `Tags & Categories` is an exact duplicate across the two scopes — a substring collision is recoverable by DOM order, and an exact duplicate is not.
   Every rail button therefore carries a stable `id`, both harnesses target the id, and the id is a COMPLETE LITERAL rather than a stem-built template, because an interpolated id is invisible to the source gate that checks it is rendered at all.
   A `node --test` gate asserts, on every commit, that no `:has-text(` locator reaches a manager rail button anywhere in the Foundry harness, that every rail id the harness targets is rendered by a component that renders the rail, and that every label in its membership loop is authored beside its own id.
   The Foundry smoke is the CONFIRMING run and is never the only evidence the label and id sets agree.
7. **The gateway files carry every seam a later scoped-entity or vocabulary change needs, and are closed to those changes.**
   `CraftingSystemManagerRoot.svelte`, `adminStore.js`, `styles/fabricate.css` and the Foundry smoke harness carry every route token, rail entry, aside clause, store action, published key and rail locator those changes need, so each of them changes only its own screens.
   The obligation is evaluated on THOSE changes, as `git diff --name-only origin/main...HEAD` containing none of the four paths.
   **It binds the PRODUCER side of a published key as well as the consumer side**, which is where it was first got wrong: a rail badge wired to read `worldScope.vocabulary.total` is closed, but a projection that could only ever be handed the three entity stores is not — so the admin store reads an OPTIONAL fourth `vocabulary` store leg on the WRITE path as well as the read path, through the same optional-accessor idiom as its siblings.
   The read leg answers `null` and the projection answers `{available: false, total: 0}` until a vocabulary store is registered; the write leg is inert until the world-scope action module declares a vocabulary family, and the store, its service accessor, its projection and that family all live outside the four paths.
   **AND IT BINDS THE DATA SEAM ON THE SAME MECHANISM AS THE ROUTING SEAM.**
   This corpus registers no component context and exports no store singleton, and no manager component imports a store module, so every value reaches a child as a DECLARED PROP and there is no other route to one.
   The shell therefore hands each world scoped-entity page and each system-scope entity view the published world corpus for its entity type, that type's world-scope write path, the crafting-system roster the membership rows were built against, and the selected system's id — exactly as requirement 3 hands a catalogue `onOpenEntry` and an entry `entityId` and `onBackToCatalogue`.
   The World Vocabulary route is NOT a scoped entity and takes its own published state rather than that bundle, for the reason its own requirement gives.
   The write path arrives PER ENTITY TYPE and never as the whole family, because the family's KEY SET is part of its contract: `setEnabled` is ABSENT on the component path rather than present and refusing, and a screen tests for it there.
   **The store action set includes CLEARING a per-system tool-breakage authority override**, not only writing one of its two tokens.
   Normalization is absence-preserving, so "no per-system override" is expressible on disk and the resolver answers the world value for it; an action that coerced every other argument to the system-specific token would make inheritance a one-way door for a change that may not reopen the store.
   **A RESOLVED published value is not sufficient on its own when a screen must AUTHOR the layer it was resolved from.**
   A control that offers "inherit" beside the concrete choices needs to know which of them is current, and a resolved token cannot answer that.
   So the projection that publishes the resolved authority ALSO publishes which scope authored it, one value per branch of the resolver, and the shell carries that value to the control on its own prop.
   Both halves are the gateway's, and neither is deferrable to the change that draws the control: the producer is open to that change, but the carrier line is inside a closed file, so publishing the value without carrying it would leave it unreachable.
   **The CAPTURE REGISTRY is NOT one of the closed files, and the reason is structural rather than a concession.**
   A capture case asserts that a route is REACHABLE and drives it by clicking a rendered control, so a route whose only entrance is a screen that has not shipped cannot be reached: the capture driver throws by name on a selector that matches nothing, and — because capture coverage is keyed on the route a case asserts — an unreachable case becomes its own surface and is selected by every later change to a capture input.
   A case registered ahead of its screen therefore fails the capture run whole, thereafter, for every change that touches a capture input.
   A screen and its capture case ship TOGETHER: the change that ships a screen registers its case, adjusts the source claims on the components that screen renders, and removes any standing coverage exemption it makes stale.
   **A gateway closure is a claim that an enumeration is COMPLETE, and it is void for a seam the enumeration does not name.**
   Reopening a gateway file to supply a NAMED missing seam is a correction that extends this requirement; reopening one to build a screen is a violation of it.
   The distinction is not decidable from a diff's file names, so a correction claim is EVIDENCED on the reopening change's own diff — by an unchanged-render or import-surface assertion — rather than asserted in its description.
8. **At the collapsed 56px rail width no leaf renders its count badge.**
   `.manager-nav-count` is suppressed under `.is-rail-collapsed`, where every entry is reduced to its glyph, so the count cannot be part of a collapsed button's accessible name and the collapsed rail's evidence shows contained glyphs and the active leaf rather than a badge.
   Each world leaf therefore carries an explicit `aria-label` naming its screen, at both rail widths.

### GM World Vocabulary Route

World exposes `Tags & Categories` as a world rail leaf, matching the shipped `### GM Travel Route` shape: one route token, ungated, reachable with no crafting system selected.
It is the authoring surface for the World Vocabulary — component categories, component tags and recipe categories — each with a usage count and a deletion warning naming how many inheriting rule sets are affected.

It is deliberately NOT part of `### GM World Scoped Entity Routes`, and the separation is a decision rather than an accident of drafting: a spec heading is a corpus noun rather than a screen title, there is no authored label covering all four world leaves, and the World Vocabulary is NOT a scoped-entity layer — it holds the vocabularies those entities draw from, which is the boundary `data-models/spec.md` draws in terms.

1. The route token is `world-vocabulary`, and the rail leaf carries the id `manager-world-nav-vocabulary` and the hook `data-world-nav-item="vocabulary"`.
2. Its label is character-for-character identical to the system-scope `Tags & Categories` entry, which is why no harness may reach either by text; see `### GM World Scoped Entity Routes` requirement 6.
3. It renders its own `<main class="manager-main">` with the page hook `data-scoped-page="world-vocabulary"`, is released to full width by the one mechanically checked decision of that requirement 4, and participates in the confirm-discard route-exit chain.
4. **The leaf carries a count badge, and it counts the WHOLE vocabulary** — component categories plus component tags plus recipe categories, summed rather than deduplicated across the three, because a category and a tag that share a label are two entries in the world's vocabulary.
   It is the fourth of the four badges `### GM World Scoped Entity Routes` requirement 1 names, and it is the only one that is not a corpus of scoped entities.
   **The published field is `worldScope.vocabulary.total`**, and the name is a contract rather than an implementation detail: the shell reads it and requirement 7 of that section bars the vocabulary lane from the shell, so a producer publishing `count` or `entries.length` instead would leave the badge reading 0 forever with every test still green.
   It reads 0 until a world vocabulary store exists, which is truthful — a world with no vocabulary store has no world vocabulary — rather than a placeholder.

### Scoped entity editor patterns

The six scoped-entity editors — a catalogue and an entry editor for each of components, essences and tools — share one set of patterns, built once.
Each is stated here because the shape of each is decided by the `## Scoped Entity Definitions` MODEL rather than by any one screen, so a screen that reinvented one would be writing a value the normalizer discards.

1. **The inherit row set is read from the SCOPE DESCRIPTOR, never listed per screen.**
   A component draws exactly ONE row (`category`), an essence two and a tool two.
   A component's essence quantities, salvage, complications and difficulty are NOT sections and NOT membership fields; they stay on the in-system record, and `normalizeMembership` is an allowlist rebuild that silently DISCARDS any other key on the next `load()` — so a screen that offered a switch for one would write a value that survives the session and vanishes at reload.
2. **A SEEDED section renders no inherit row.**
   A tool's `repairRequirements` is copied once and then diverges, so there is no live parent to fall back to and a switch over it would be a claim the resolver does not honour.
3. **A ONE-SECTION entity renders exactly one row and NO GROUP CHROME** — no header, no divider, no empty state around a single control, because that chrome costs more vertical space than the control it frames and says nothing the row does not.
4. **The re-inherit copy is "fall back", never "discard", and there is no confirmation**, because re-inheriting RETAINS the dormant local override: the switch flips, the local block stays on disk, and re-overriding restores it rather than re-seeding from the world.
   Turning a switch OFF seeds the local block from the current world value as a STRUCTURAL COPY, so neither scope can reach into the other through a shared reference.
5. **`tags` is not a section and renders no inherit row.**
   It is additive with per-tag muting, so it has its own two write paths and no single switch, which per-tag muting cannot be expressed by.
6. **The membership action cluster reads `enableable` from the descriptor**, so the COMPONENT path structurally cannot render an enabled switch: a component membership record carries no such field, and the write path does not offer the action at all rather than offering one that refuses.
   Adding an entity to a system creates a record that inherits every section, and the copy says so; removing deletes only that record and its overrides, and arms through the shared `ArmedDangerButton` keyed on the DOCUMENT ID pair rather than a row index.
7. **A WORLD-DEFAULTS EDITOR MAY OFFER ONLY WORLD-ADDRESSABLE REFERENTS.**
   `data-models/spec.md` `### Essence scope` requirement 5 binds a world essence default's `effectSource` to a world-addressable referent and never a system-local component id.
   The store writes section values OPAQUELY and the normalizer coerces shape rather than addressability, so neither can enforce it: the PICKER is the enforcement point.
8. **The validation tab and the player preview are shared shells**, and the six editors are callers rather than authors of them.
   The validation shell renders the shipped editor-validation surface and owns the count and pass/warn status labels both existing sites already agreed on; only the BLOCK label differs, because an essence always saves while a Tool refuses to.
9. **Requirement rows introduce NO new component:** the shipped tool repair-requirement editor is the recipe-free ingredient editor, already rendered chromeless.
10. **The check bonus picks from the world modifier library and never a free-text expression**, through the shared subject picker; the tool subject is a third member of that picker's subject vocabulary rather than a second picker.
11. **The editor tab strip is ONE primitive**, and it carries each site's DOM CONTRACT as props — the hook attribute name, the button `id` and `aria-controls` stem, and the strip's own accessible-name key — because the shipped sites share no common stem and their PANEL ids are rendered by files outside the strip.
    A promotion that changed a rendered id, `aria-controls`, `data-*` attribute name or badge class at a converted site is a defect, not a cleanup.

### GM Travel Route

World always exposes `Parties` for global party management and `Travel` for the world's realm
library and map region links, both including with no selected system.
`Travel` exposes children `Realms` and `Map Region Links`.
Neither must be duplicated in a separate detached settings UI.

Travel AUTHORING is world scope and ungated; what is opt-in per system is PARTICIPATION:

- A `Travel & Realms` toggle (default off) lives in System Settings as a feature tile beside
  Currency, matching the Currency precedent.
  Enabling it writes `gatheringRealmSettings.enabled = true`.
  The tile's hint names World > Travel as where realms are authored, and says what the toggle
  actually does — gate this system's environments on where the party is, and give them realm
  controls — rather than promising to reveal a navigation destination, which it no longer does.
- When the toggle is off, World Travel and World Parties both remain fully available and no route
  is evicted, because the toggle governs consumption rather than authoring.
  What the toggle hides is the environment editor's realm selector, and what it changes at runtime
  is that every environment in that system is treated as ungated.
- The realm library is world-global and identical under every selection, so it neither re-projects
  on a system switch nor disappears when the selection is cleared.
  Losing Gathering or clearing the selected system leaves a current World Travel route intact,
  exactly as it leaves World Parties and World Currency intact.

Shipped capabilities:

- World Parties and all unrelated Party CRUD are always reachable and **world-global**.
  Only current-realm override evidence and writes are per selected system and require Gathering plus Travel & Realms; unavailable states explain the missing prerequisite and do not write.
  The view states this explicitly.
- The `Parties` World entry shows the total party count, unchanged as selected systems change.
  Realms and Map Region Links likewise do NOT re-project on a system switch: the library is world
  data, and active-scene Region inventory is world/scene data, so a link authored under one
  selection is the same link under every other.
  Only the party current-realm override evidence and writes remain gated on the selected system,
  and that is an authoring gate on the Manager surface rather than a statement about the data.
- Create, rename, enable/disable, and delete Fabricate parties.
- Assign actor members to a party and assign exactly one **travel actor** (the actor that represents the party on a campaign map).
  Assigning a travel actor already used by another enabled party, or an actor already associated with another enabled party, is rejected with an inline error associated with the relevant control (the duplicate-travel-actor error routes to the travel-actor control).
- The enable toggle is never gated on the travel actor: a party with no travel actor can be enabled, and the card's meta line states "travel actor: none" so the consequence is visible without the configuration being refused.
  Newly created parties visibly show their disabled state.
- When the world has no actors, the member and travel-actor pickers show an explicit empty state directing the GM to create an Actor first.
- The Parties pane exposes a search field only when the world holds more than one party.
  It matches a party's name, any member's name, or its travel actor's name, and states how many of the total parties are showing.
  A search matching nothing renders the shared filtered no-state treatment quoting the query; the World rail's party count is the world total and is unaffected by the filter.
- The Parties pane pages its card list and offers a per-page control of 3, 6 or 9 cards, defaulting to 3.
  The pagination controls render only once the matched set reaches the smallest offered size, because below it there is one page by construction and the bar could state nothing the GM cannot already see.
  They render as a squared-off, full-bleed sibling footer under the independently scrolling card content, so they stay reachable without overlaying a card and read as the pane's own bottom edge rather than as another item in the scrolled list.
  Changing page or page size closes any open travel-actor picker and any open move drawer, so no popover outlives the card that anchored it.
  Closing a travel-actor picker through either paging path also clears its search query, so reopening a surviving card's picker starts from the unfiltered actor list.
- Each party card carries its own enable control bound to that party's `enabled` state, so enabling and disabling never require selecting the party first.
  Enabling is not gated on the travel actor, so a card whose travel actor is unassigned still toggles; its meta line reports "travel actor: none" rather than a card-scoped gate hint.
- Each party card carries its own delete control, which routes through the shared confirm seam naming the party, because deleting a party drops its membership, its travel actor and its current-realm override.
- A party card's travel-actor panel names the linked actor or states that none is linked, and offers link, change and a persistent accessible unlink button in that one place.
  Its picker offers the actors whose type is one the GM configured under Player Character Actor Types, the same membership the member picker uses, and states that setting by name when the world holds actors but none are eligible; dropping an actor onto the panel stays unfiltered, so a one-off outside the configured types remains assignable.
  A travel actor that is currently linked is always offered, eligible or not, so the picker marks and counts the value it is being opened to change rather than hiding it.
  Its picker reuses the shared searchable-popover primitive, anchors to the panel, flips above its trigger when the pane is short of room below, marks the currently linked actor, and presents full-width compact actor rows.
  The primitive may add the optional `Actors` title at top-left and its live matched-of-total count at top-right; unlink is not duplicated as a picker row or footer.
  On the GM Travel World > Parties card, the unassigned travel actor occupies its own panel above its picker rather than an inline value slot, so that state renders through the shared `EmptyState` compact treatment.
  Right-clicking the panel unlinks a linked travel actor and opens the picker when none is linked, and the panel keeps accepting an actor dropped onto it.
- Adding a member who already belongs to another party is the move path: the GM confirms a move naming both parties, and the actor ends in exactly one party.
  The shipped store moves out of the source party whether or not that party is enabled, which is stricter than the invariant motivating it — an actor may be associated with at most one _enabled_ party — and that stricter behaviour is deliberate, because a membership silently split across a disabled and an enabled party is the state a GM cannot see.
- A store validation failure renders on the card that caused it: the duplicate-travel-actor error beneath that card's travel-actor panel and the duplicate-member error beneath that card's member list, each associated with its control by `aria-describedby`; an error carrying no control context renders once above the card list.
  A party can still be rejected on enable by the composite-uniqueness invariant, which no travel-actor state predicts, so the enable control is never the only feedback surface.
  Cancelling a confirm-backed action on another card does not reattribute an existing inline validation error; attribution changes only when the later action crosses confirmation and attempts its store mutation.
- The pane's user-facing term for `travelActorUuid` is "travel actor", matching the canonical current-realm evidence source label; "travel marker" is retired from Manager copy.
- Layout split: World Parties intentionally has no right inspector; its party-card editor occupies the full available content width.
  Every party on the current page renders its editing controls unconditionally, so rename, enable/disable, delete, member add/remove/move and travel-actor link/unlink are reachable without first selecting a party.
  Override editing exists in exactly one place (the party card).
  At manager-container widths of 720px or less, each party card's body reflows through the named `fabricate-manager` container into one column, independent of the outer browser viewport; the card has no horizontal overflow and every editing control remains reachable.
- The current-realm evidence component renders all three source states using the canonical labels `GM override`, `Travel actor`, and `No current realm`.
  The GM evidence panel renders the live `Travel actor` source label when a party's realm resolves from shipped token-derived sensing.
- The World Travel group presents **Map Region Links** as a rail destination (`GatheringMapLinksTab.svelte`) that lists the Scene Regions on the active scene with a per-region realm picker (`MapRegionLinkPicker.svelte`) linking each scene region to at most one realm (single-valued per scene region, written by `adminStore.setMapRegionLink`).
  Because a region maps to at most one realm, re-pointing it must both detach and attach, and the store performs that as a SINGLE write (`setSceneRegionLink`) rather than one update per realm — against a setting-backed store a read-modify-write loop loses every iteration but the last.
- Each stale member / travel-actor / override-realm reference gets a remove/clear action; "repair" means removing the stale reference and re-assigning through the normal pickers.
- The route embeds the canonical **realm authoring surface** using a realm list + detail layout: the list creates/selects/deletes realms; the detail pane edits the selected realm's name, description, image, enabled, secret, and biomes (chosen from the system biome vocabulary).
  Edits merge-patch over the existing record so unedited fields (sort, sceneMappings, modifiers) round-trip untouched.
  Delete is destructive and routes through the confirm dialog with referenced-by evidence (a deliberate change from the prior immediate-delete quick list).
- This realm authoring is the source of the realms an environment can be assigned to via its `includedRealmIds` multi-select; the multi-realm data is authored here, not in the environments browser.
  The legacy environments-browser "Region" filter has been removed.
- Validation lives in the party store; the view surfaces store validation errors inline next to the relevant control, associated with that control by `aria-describedby` and announced through `role="alert"`.
  `aria-invalid` rides along only where the associated control is a form field whose role supports it; a party card anchors its errors on a member list, an add-member group and the travel-actor button, none of which is a form field, so the alert role carries the announcement there.
  Actor pickers follow the accessible semantics established by `ActorSelectTopBar`.
- The retained Parties, Realms, and Map Region Links content renders as labelled regions connected
  to the corresponding World Parties or World Travel destination.
  The former `GatheringTravelTabs` horizontal strip and
  every `tabpanel` / `travel-tab-*` relationship are absent.
  `GatheringTravelView.svelte` and `GatheringTravelTabs.svelte` are deleted outright rather than
  left unimported.

Not yet shipped (later-phase follow-ups, kept out of canonical capability claims): realm discovery controls, and the player-facing travel/current-realm view.
(Realm authoring — name/description/img/secret/biomes — ships under World > Travel > Realms and the environment realm-membership control under the environment editor; `sceneMappings` authoring ships via World > Travel > Map Region Links; only the legacy realm ordering and Phase 4 `modifiers` authoring remain reserved.)

### Gathering Event Library

When `features.gathering === true`, Manager must expose reusable event library authoring as a dedicated route or as a nested reusable library surface inside gathering tasks or gathering settings.

Event library authoring must support:

- create, edit, duplicate, delete, enable/disable, search/filter, and usage evidence
- deletion confirmation when events are used by environments or tasks
- rows showing name, image, description summary, enabled state, danger tags, biome/weather/time matching tags, drop rate, and modifier provider evidence (geography is no longer a matching tag — the region picker, filter, and per-row region chips were removed from the task and event editors and browsers)
- validation for drop rate, tag vocabulary values, provider configuration, and unsafe deletion
- composition surfaces that attach or toggle matched reusable events without editing reusable event definitions inline

Player-facing event copy is framed as a neutral encounter (a travelling merchant as readily as an eruption) rather than danger-first, while the danger axis itself is retained:

- Timing and locality copy reads as a neutral encounter (for example "When & where it happens" rather than danger/hazard framing).
- An environment's player-facing event presence reads neutrally (for example "This area has events in store." and "The events here are hidden until you gather.").
- Event-outcome copy uses event terminology (for example "If an event occurs, your gather still succeeds." / "…the gather fails.") rather than risk/hazard terminology.
- Copy that legitimately describes the danger axis (for example "Danger tags let environments opt in…") is retained.
  The d100 result-group validation copy still reserves the failure aliases (including the former miss/`hazard` terms) as forbidden result-group names — this is the failure-keyword concept, not the Gathering Event concept.

## Canvas Interactables — Manage Interactables Panel (GM)

A **GM-only scene-level Manage Interactables panel**, launched from the Fabricate scene-control group, **lists every `fabricate.interactable` on the current scene** (name, type, source label, state: enabled/locked/consumed, marker status: Tile/Drawing/Token/region-only/missing) with per-row **open rich config**, **jump to region**, and **delete** (delete routed through `services.confirmDialog`).
Delete is **provenance-aware** (issue 533): it removes the whole Region only when Fabricate CREATED it (and it carries no foreign behaviours), and otherwise — a **promoted** user region, or one carrying other behaviours — removes only Fabricate's behaviour, preserving the user's Region and every foreign behaviour; the confirm copy states which will happen (see `data-models` → Canvas Interactables → Region-level ownership).
Both delete sites (this panel and the rich config panel) route through the same pure `decideInteractableDeletion`/`executeInteractableDeletion` decision.
The panel also offers **Promote region to interactable**: a GM selects an existing drawn region of **any shape** and a Tool or Gathering Task source; the behaviour `system` is built via `buildInteractableBehaviorSystem()` and attached to that region (optional marker creation via the existing recreate-tile/drawing seams; gathering-task promotion runs the drop-time environment-resolution precedence).
The promote **source picker enumerates Tools and Gathering Tasks through the same shared source enumeration the Interactable browser uses** (one source of truth — system-owned `getSystem(id).tools` for Tools, the persisted gathering config for Tasks), so a system that has a Tool always offers it as a promote source.
When an auto-defaulting crafting-system picker must pre-select a system (the promote picker and the Interactable browser), it must prefer a system that actually has selectable sources of the relevant type over an empty first entry, so the `No sources in this system.` state is never reached purely because a same-named, source-bearing sibling was left unselected.
The panel is the supported authoring path for arbitrary-shaped interactables (the browser drag remains the 1-grid-square fast path).
It is GM-only; players never see it.

## Recipe Editor

Scoped to a single crafting system.

The Manager recipe-edit view is a **five-tab editor** — Overview, Ingredients, Results, Tools, Validation — over a controlled local draft.
Every edit stages into that draft and commits in one `updateRecipe` call on Save (through the `allowIncomplete` authoring path, which gates on structural validity only); the `enabled` toggle is the single immediate exception, because enabling validates against the persisted recipe.
The shared header carries an `Unsaved` chip, `Back to recipes`, `Delete recipe` and `Save`, and every route exit runs the Manager confirm-discard guard.
A recipe whose ingredients or results are still empty is a persistable _incomplete shell_: it stays non-craftable (the engine gates on completeness) and the browse row shows the derived authoring-state pill for a recipe the activation check would refuse — `Incomplete` while it is on, `Can't enable` while it is off.

### Resolution-mode banner

Every tab is headed by a **resolution-mode banner** naming the crafting system's `resolutionMode`, describing what it means, and offering a chip that routes to Crafting Settings.
Resolution mode is a property of the **system**, never of a recipe: the banner reports it and offers no per-recipe control, because the mode dictates the editor's whole shape (one ingredient set or many, tier routing, the alchemy result slots) from outside the recipe.
Its copy and icons come from the canonical `resolutionModeOptions` list that System Settings and Crafting Settings already render, so no second, drifting table exists.

### Context rail

The editor's right-hand column is the shell's existing `manager-inspector` aside (not a second nested grid), and it is **always present** on `recipe-edit`.

Its top section is **mode-conditional**, driven by the system's canonical `visibilityMode` through the `craftingEffect(mode)` matrix — the same single source of truth the crafting nav and Crafting Settings consume:

| `visibilityMode`    | `craftingEffect`   | Rail top section                                                                                                              |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `restricted`        | `showAccess`       | **Who can craft this** — the players and characters granted this recipe, plus a **Manage access** deep-link to the Access tab |
| `item`, `knowledge` | `showBooksScrolls` | **Appears in** — the books/scrolls that teach this recipe, plus an **Open Books & Scrolls** deep-link                         |
| `global`            | neither            | No section: a globally-visible system grants no per-recipe access and uses no books                                           |

The rail is **read-only in every mode**.
Authoring lives on the owning screen: the Access tab owns `recipe.access`, and Books & Scrolls owns book membership.

Below the mode-conditional section, in every mode, the rail carries the recipe's **Category** selector, the **Recipe mode** (Simple / Complex) segmented control when the system's resolution mode permits multiple ingredient sets, the **Step mode** (Single / Multi-step) segmented control, and a **Validation** mini-list showing either an _All clear_ pill or the failing readiness checks with a deep-link into the Validation tab.

### Access rosters (restricted mode)

The rail's access rows are **resolved in the admin store** and handed to the rail as display rows; the rail never resolves an id itself.
Three rules govern that resolution, and each exists because the naive alternative silently misreports who can craft a recipe:

- **A character's controlling players are a SET, not one user.**
  The runtime predicate grants access to any viewer whose **assigned character** is that actor **OR** who holds Foundry `OWNER` on it — a union, not a fallback chain.
  Each resolved character therefore carries `controlledBy: Array<{ id, name, avatar, assigned }>` (assigned-first, then name-sorted), never a singular "played by" field.
- **`ownership.default >= OWNER` reaches the whole table.**
  When it does, the character carries `sharedWithAllPlayers: true` and the rail renders **"Shared with all players"** — a distinct string, never "Played by ⟨one name⟩", which would tell the GM that one player got the recipe when in fact everyone did.
  With no controllers at all, the rail renders **no** sub-line rather than inventing an attribution.
- **GMs are filtered before ownership is tested.**
  `Document#testUserPermission` short-circuits every GM (Assistant GMs included) to `OWNER`, so the roster is derived from Foundry's non-GM `game.users.players` roster first.
  The same roster now backs the Access tab's grantable **Players** list, which previously offered GMs as targets even though granting one had no effect.

Granted **character** ids resolve over **every world actor**, not the player-character roster: the runtime predicate applies no type filter, so a grant naming a non-player-character actor is still honoured by the engine and must still be displayed.
An id that no longer resolves (a deleted actor or user) is **dropped from display and never persisted away** — rendering the rail must not mutate the grant.
The rosters re-project on user CRUD and on actor CRUD, with `updateActor` key-filtered to `ownership` / `name` / `img` changes so an ordinary HP update does not re-project.

### Base Form

- Name (implemented in Manager)
- Description (implemented in Manager)
- Category (always includes reserved `General`) — implemented, in the context rail
- Locked toggle — see `### Locked`

In Manager, the recipe-edit identity card additionally edits a player-facing image (via the FilePicker) and an `enabled` on/off toggle alongside Name and Description.
The editor header shows the recipe's image, its name, and a `⟨category⟩ · ⟨resolution mode⟩` sub-line.

The Overview tab additionally offers an optional **Minimum success tier** dropdown, shown only when the selected system runs a `routedByCheck` check whose routed `type` is `fixed`.
Its options are that fixed check's success outcome tiers ranked ascending by `start`, preceded by a default `No override (use final tier)` entry, and it authors the recipe's `minSuccessOutcomeId`.
Selecting a tier makes a craft that rolls below it fail outright (see `resolution-modes/spec.md`); the control is hidden for relative-type checks and for non-`routedByCheck` systems.
Note: alchemy `checkMode: tiered` dispatches through the same routed-check runner but the engine forces `minOutcomeId: null` on that path, so a `minSuccessOutcomeId` carried on an alchemy tiered brew is inert at runtime — matching this control's hiding for alchemy (a value the GM cannot edit or clear here is also one the runtime ignores; see `resolution-modes/spec.md`).

### Visibility Form

Per-recipe visibility is authored on the **Access tab** (`recipe.access = { characterIds, playerIds }`), gated by the system's `visibilityMode: 'restricted'`.
The recipe editor itself carries **no** per-recipe visibility editor: the legacy `recipe.visibility { restricted, allowedUserIds }` card (gated on the superseded `recipeVisibility.listMode`) is retired, and `access` is read-forward-seeded from `visibility.allowedUserIds` for legacy systems.
The recipe editor's context rail shows a **read-only** summary of the grant plus a deep-link to the Access tab.

If the system's visibility mode consumes an item or teaches by knowledge (`item` / `knowledge`):

- The recipe's context rail lists **every** book/scroll that teaches it, because recipe↔book membership is **many-to-many** (`RecipeItemDefinition.recipeIds`, projected onto the recipe row as `recipe.recipeItemIds`).
  There is no book/scroll `kind` — `RecipeItemDefinition` manages every recipe item regardless of Foundry item type.
- Each row previews that book's name/image/source status (falling back to the legacy scalar `recipe.recipeItemId` only while the system's membership-basis marker is unset), offers Open item, and offers a per-book **remove**, which removes the recipe from **that** book's membership only and does **not** delete the shared definition.
  A multi-row selection can remove membership the same way from the recipe browser's bulk edit panel.
  A row whose definition's `originItemUuid` no longer resolves shows a missing/stale state and retains the link.
- **Adding** a recipe to a book is authored from the book's side (Books & Scrolls → the recipe-item editor stages `recipeIds` and persists on Save), or, for a multi-row selection, from the recipe browser's bulk edit panel.
  The recipe EDITOR still carries no drop zone and no "link another" affordance: a second SINGLE-recipe authoring path for the same many-to-many is duplication, not a capability.
  The bulk panel is admitted because it expresses an operation neither surface can — one membership change applied across a whole selection — rather than a second way to do what the Contents tab already does.
- Membership changes apply immediately (through `setRecipeBookMembership`), independently of the recipe draft's Save.

Owned copies match by UUID or resolved source UUID of the linked recipe item definition.
If the required linkage is missing, show a validation warning.

### Locked

`recipe.locked` is persisted and engine-honoured (`guardCraftStart` refuses a locked craft), and the Overview tab is where it is written.

A locked recipe stays **visible** to players but only a GM can craft it, a distinct concept that carries its own copy and its own hooks.

The lock write path is **never gated**, in either direction, in explicit contrast with the enable toggle: a GM locks a recipe precisely while it is unfinished, so an enable-blocking validation issue must not also block locking it.
The change persists immediately (like `enabled`), outside the recipe draft's Save.

### Recipe crafting-check modifier control (issue 1055)

The Overview tab's per-recipe crafting-check modifier control (`RecipeOverviewTab.svelte`) is shown **only** under the system's `bySubject` combination rule — rendered "By recipe" on this activity — and only when the WORLD modifier library resolves non-empty for that system (issue 1308).
`bySubject` is the one rule that defers the selection to the recipe author, so it is the only rule under which this tab has anything to say about check modifiers.
Under `addAll`, `highest` and `playerPicks` the tab is **silent** — no control and no banner: a control the engine will ignore is worse than no control, and a banner explaining its absence would appear on every recipe of every system that never chose `bySubject`.

Under `bySubject` with a catalogue, exactly one of two mutually exclusive dispositions renders, in this priority order:

1. **Inert banner** — shown when the system's active check applies no check modifiers, for one of TWO causes: `noCheck` (this resolution mode rolls no crafting check at all) or `noFormula` (a check slot exists but has no authored roll formula).
The third cause, `noPlaceholder`, is REMOVED together with the roll-formula placeholder it named: the resolved scalar is appended to whatever the GM authored, so "a formula is authored but never references it" is not a reachable state.
`noCheck` and `noFormula` remain, and their copy states the real remaining cause **without naming any placeholder**, because a GM told to reference one would be told to do something that does nothing.
The control gains no new state.
   The control is replaced entirely — nothing authored here could change a roll — and the banner names which cause applies from the recipe's point of view (distinct copy from the Checks card's equivalent notice).
   The banner wins the priority order precisely BECAUSE the rule delegates here: the system asked this recipe to pick, and its picks would reach no roll.
2. **Controls** — the grid renders a picker cell for the eligible-id subset.
   There is **no combination-rule select**: a recipe chooses WHICH modifiers apply, never HOW they combine.

The per-recipe select-row grid's worst case is **three** cells — Category, the picker cell, and _at most one_ of Check tier / Minimum success tier — because the picker cell hosts its own tri-state select (**Inherit system default** / **Custom set** / **No modifiers**) rather than adding a further grid cell.
Check tier and Minimum success tier are mutually exclusive by construction and never render together: `resolveRecipeFixedOutcomeTierOptions` offers a minimum tier only for `routedByCheck` + `fixed`, while `resolveRecipeCheckTierOptions` under that same mode offers tiers only when the routed type is **not** `fixed`.
Selecting **Custom set** seeds the pill row from the recipe's own eligible ids (falling back to the system default set, so "customize" starts from what the recipe was inheriting), TRUNCATED to `craftingCheck.maxModifierPicks` so the seed never shows picks the engine would not roll; selecting **No modifiers** writes an authored empty `modifierIds` array (nothing is appended to that recipe's check roll); selecting **Inherit system default** drops the `modifierIds` key.
Clearing the LAST selected pill under **Custom set** posts an authored empty array (`{ modifierIds: [] }`), never `null` — posting `null` would silently become _Inherit_, which is the pre-1055 defect this control replaces (a GM could not express "this recipe gets no check modifiers" at all).
Under **Inherit system default** the pill row is replaced by a read-only line naming the inherited set through the active language's list formatting (or stating that the system default set is empty, so no check modifier applies to this recipe).

**Pick cap disclosure.** When the system's cap is bounded, the picker states it in words beneath the pills ("This system lets a recipe pick one check modifier." at a cap of 1, otherwise "…up to N check modifiers."), and adds an at-cap clause once the recipe has picked that many.
An unbounded (absent) cap renders no sentence at all, because there is nothing to disclose.
The add-menu button is disabled at the cap and an add is refused a second time in the toggle handler, which is what holds when the cap is lowered on the Checks studio while this editor is open — but neither is the invariant: `resolveEligibleModifierIds` truncates on read, so a cap lowered below what a recipe already picked is honoured whatever is on disk, and the recipe's stored picks survive intact.

A legacy `craftingModifier.policy` left on disk by a pre-1055 world is CARRIED FORWARD untouched by every writer on this tab.
This surface no longer authors a rule and must not silently delete one either — dropping a key while editing a neighbouring one is data loss disguised as a set edit — and the key is inert regardless, because the resolver never reads it.

The inert banner reuses the resolution-mode banner's chrome (`RecipeModeBanner`, prop-ified with a `tone` and a `dataAttr` name so it can render alongside its sibling on one tab without colliding) rather than inventing a second visual language for "this is set elsewhere".
It renders full-bleed below the grid, replacing the control the grid would otherwise hold, rather than squeezing into a single grid cell.

**Five-mode active-check-formula table.** WHICH `craftingCheck` sub-config the active resolution mode actually rolls — the precondition for every disposition above — is resolved by `resolveActiveCraftingCheckFormula(system)` (`checkModifierResolver.js`, which replaced the crafting-only `craftingModifierResolver.js` in issue 1095), which maps `resolutionMode` (and, for `alchemy`, the system's `alchemy.checkMode`) to that sub-config:

| Resolution mode       | Check config                 | Notes                                                        |
|------------------------|-------------------------------|---------------------------------------------------------------|
| `simple`               | `craftingCheck.simple`        | optional                                                       |
| `routedByIngredients`  | `craftingCheck.simple`        | optional; shares the simple slot                               |
| `routedByCheck`        | `craftingCheck.routed`        | required                                                       |
| `progressive`          | `craftingCheck.progressive`   | required                                                       |
| `alchemy`              | per `alchemy.checkMode`       | `none` → no check, `simple` → `simple`, `tiered` → `routed`   |

A library selection can be inert for THREE DISTINCT reasons this selector distinguishes rather than collapsing into one boolean: the mode rolls no check slot at all (`noCheck`), a slot exists but carries no authored roll formula (`noFormula`), or the mode rolls a check that cannot take modifiers yet (`noModifierSupport`, reachable only on gathering `d100`) — each renders its own remedy-specific copy, both on this tab and on the Checks card.
The third cause is REMOVED with the placeholder, together with the remedy-specific copy it drove on both surfaces.
The selector reports `rollFormula` and `checkUsable` POST-shim, so a stored formula whose only content was the retired placeholder reports `noFormula` rather than reporting usable.
**Checks studio — Validation, the retired-placeholder readiness split.** `checksReadiness.js` derives `hasRollFormula` from the POST-shim formula, not the raw field, so the Validation route cannot tick "Has a roll formula" green for a check `checkUsable` reports as unusable — the invariant `resolution-modes/spec.md` states, on the one surface a GM consults to find out whether a check works.
A typed retired placeholder raises one of TWO mutually exclusive issues, and the split is on the STRIP OUTCOME `planRetiredPlaceholderStrip` reports — the same decider `checkUsable` and the `1.21.0` migration reduce — never on the placement classifier alone, because the two disagree and the tab and the migration would then give the GM opposite instructions about one formula:

- `retiredPlaceholderInFormula` (**warning**) when the shim STRIPS the placement.
The removal is lossless, so whatever the GM authored around the placeholder still rolls and the modifiers still apply; only what they believe about WHY is wrong, and the copy says the placeholder is ignored and removed before the roll and to delete it.
- `retiredPlaceholderBreaksFormula` (**critical**) when the shim REFUSES the placement — every non-additive placement, AND every additive one whose residue would be structurally incomplete (`1d20 * -@craftingmod`, `1d20 - @craftingmod -`, `@craftingmod +`, all of which the placement classifier calls additive).
The WHOLE formula is discarded and the check does not roll at all, so the copy says it must be rewritten by hand — echoing the migration notice's untouched-count sentence, which is what this GM already read.
Telling them to "delete the placeholder" would be actively wrong: deleting it out of `1d20 * @craftingmod` leaves a dangling `1d20 *`, and out of `max(@craftingmod, 2)` leaves `max(, 2)`.

A placeholder-ONLY formula (`@craftingmod`) is the one place the warning copy's "the check still rolls" is not literally true: it is STRIPPED — losslessly, to nothing — so it takes the warning, and the separate `hasRollFormula` tick is what reports that there is now no formula to roll.
The two issues are about the placeholder; the tick is about the formula, and they are not merged, because "delete the placeholder" and "author a formula" are different instructions.
The critical case is asserted over the shared refusal corpus rather than a sampled list, because a hand-picked list of non-additive shapes is exactly what let a classifier-driven split ship.

Both predicates also inspect the legacy `routed.rollExpression` alias, and that branch is DEFENSIVE, not load-bearing — it is described that way because describing it as load-bearing was wrong.
`rollExpression` is a READ alias that both `CraftingSystemManager._normalizeRoutedCraftingCheck` and the manager root's `cloneRoutedCheck` fold into `rollFormula`, and neither emits the key, so no draft this tab is ever handed carries a live one; the `1.21.0` migration sweeps the alias because it reads the raw SETTING, which is a different input.
It is kept here because `evaluateCheckReadiness` is a pure evaluator over a plain check object with no normalizer of its own, and a placeholder reaching it through the alias must not be the one thing the tab stays silent about.
Both strings NAME `@craftingmod` explicitly rather than saying "a retired placeholder", which is unidentifiable in a formula carrying several `@` tokens.
That is not in tension with the inert-cause copy: those two strings must not name a placeholder because they would be telling a GM to ADD one, and there is none to add.

The catalogue card renders in **every** crafting activity route, including alchemy: it is no longer gated on a single "check usable" boolean, because that gate made two of the three inert causes AS THEY STOOD AT ISSUE 1055 (`noCheck` / `noFormula` / `noPlaceholder`) unreachable on the surfaces it hid the card from entirely.
That historical triple is not the live one: `noPlaceholder` retired with the placeholder at issue 1094 and `noModifierSupport` was added at issue 1096, so the live set is again THREE and is stated below.

**Checks studio — combination rule and pick cap.** `CraftingModifierCatalogueCard.svelte` authors everything the SYSTEM owns here, and the system owns all of it: there is no authority axis and no per-recipe rule override.
It renders the **Combination rule** as one `RadioCardGroup` of four options in `MODIFIER_POLICIES` order — **Add all**, **Highest**, **By recipe / By component / By gathering task** (`bySubject`, labelled from the activity), **Player picks** — so the two selecting rules sit adjacent and the 2x2 grid reads them as a pair.
`MODIFIER_POLICIES` remains the source of that list and its order, and `normalizeModifierPolicy` validates the selection; neither is re-declared as a local literal, and the latter is what makes a world still carrying the pre-1095 `byRecipe` select the right card.
The 2x2 grid MUST reflow to 1x4 under the container query rather than overflow the real ~700–760px pane: the card declares itself a container (`container-type: inline-size`), so the shipped `@container (max-width: 620px)` rule for `.is-config-cards` measures the CARD rather than the whole manager shell.

**NO ACTIVITY AUTHORS AN ENTRY (issue 1117).** The card renders each entry READ-ONLY on all three — identity, expression, a signed bounds chip (`-1 to +6`) and a `Rolls dice` chip on a roll-shaped one — with ONE deep link to the surface that does author it, World › Rules & Resources › Modifiers (issue 1311; it was System settings › Modifiers until the library moved to world scope).
Crafting used to carry an entry editor here, which made the Checks screen a second editor for a system-level library and made salvage and gathering second-class states of that asymmetry; two editors for one array is how two screens come to disagree about which wrote last.
**Read-only applies to the ENTRIES alone**: the per-entry eligibility control and the combination-rule grid stay fully editable on all three activities, because deciding which entries apply and how they combine is exactly what each activity owns.
The Checks saver carries no library half at all, so the removal is structural rather than a hidden control.

**The eligibility control carries SIX labels over four rules, not one word and not eight**: three selected words — `Applied` (`addAll`), `Considered` (`highest`), `Selectable` (BOTH `playerPicks` AND `bySubject`) — and one NOT-selected word to answer each (`Not applied`, `Not considered`, `Not selectable`).
A single off word is the negation of ONE on word and of no other, so a row reading "Selectable" when on and "Not applied" when off states the two ends of two different sentences.
**`bySubject` SHARES `playerPicks`'s pair rather than owning a fourth**, and that is a requirement rather than an economy: the shipped `By recipe` rule description reads "from the modifiers you mark **selectable**", so a row wearing any other word makes the sentence beside it untrue about its own control.
One word per KIND of rule is the rule — unconditional, entered into a maximum, or offered to whoever the rule defers to — and the two deferring rules differ in WHO is offered the entry, never in whether it is offered.
The GLYPH and the TONE stay constant across every off reading, deliberately: the not-selected state has to read as one state at a glance, and it is the WORD that completes the sentence the rule started.
**The accessible CONTROL is the `SelectionCheckbox`, and it carries the WHOLE accessible name — the entry's label and the state word — in its own `aria-label`.
The `StatusPill` beside it is presentational and `aria-hidden`**: leaving both in the accessibility tree read the state twice, and a pill that merely supplied `aria-labelledby` would still be a second copy of the same words.
One of the two, never both.
The checkbox is `aria-describedby` the ACTIVE RULE's eligibility sentence, which is what makes "Applied" mean something to a reader who never sees the rule grid.
The two are adjacent and are NEVER nested — an interactive control inside an interactive pill lands invalid DOM.
The not-selected state differs by more than colour: the checkbox is unchecked and the pill's word AND glyph both change, so the distinction survives a monochrome render.

**Issue 1096 REVERSED this section's name, and the reversal is the requirement.** It was labelled "Check modifiers" on all three activities as a recorded deviation from the prototype; the studio's five-section strip now names the section **"Modifiers"**, and the two cards inside it are **"Named modifiers"** (the read-only library with the eligibility control) and **"How they combine"** (the rule grid and the pick cap).
The disambiguation that name was carrying is not lost, because it moved to where the two concepts can actually be confused: a drop row and an event still head their references "Character modifiers", the one authoring surface is still plain "Modifiers", and the surviving "Check modifiers" heading names a SUBJECT's pick — its one consumer is the gathering task editor, where a task's check-modifier pick sits on the same screen as its drop rows' character modifiers.
A Checks route needs no such qualifier: the route is already named for the activity whose check it authors.
The **gathering section additionally renders the dormancy notice** naming issue 683.

Beneath it, a **Maximum picks** stepper authors `maxModifierPicks`.
It renders **only** under a rule `policyDefersSelection` admits (`bySubject`, `playerPicks`), asked of the resolver live against the radio group the GM is clicking rather than re-derived from a local membership test or projected from the last persisted rule.
Its **empty field is a real value — unlimited — not a blank to be defaulted**: the value shown is `resolveMaxModifierPicks`'s answer rendered back (`Infinity` → empty), so a stored `0`, `-2` or `"three"` displays as unlimited exactly as the engine treats it, and clearing the field persists `maxModifierPicks: null` VERBATIM rather than omitting the key, because omitting it would leave the old bound in place.
An accompanying hint states "empty means no limit" and is the input's accessible description, since a blank number field cannot state it; the hint is keyed by rule AND by activity, because the cap bounds the SUBJECT AUTHOR at authoring time under `bySubject` and the PLAYER at roll time under `playerPicks`, and one sentence covering both would say nothing specific about either.

The **eligibility intro** copy is keyed by rule for the same reason, in SIX readings: one each for `addAll`, `highest` and `playerPicks`, and one per ACTIVITY for `bySubject`, because the record doing the picking is a recipe, a component or a gathering task and a sentence covering all three could name none of them.
There is no longer a **"Default modifiers"** sub-heading and no standing intro string above the rows: issue 1095 replaced the separate default-modifier pill row with a per-row eligibility control, so the rows ARE the default set and a heading naming a control that no longer exists was pointing at nothing.
The intro sits **ABOVE the rows it governs**, not below the rule grid.
It states what switching an entry on MEANS under the rule the GM just chose, so it belongs where that switching happens; below the grid it landed far under the controls it explains and read as a footnote about the pick cap.
The rule grid re-renders it the moment the rule changes, so its position cannot leave it describing a rule the GM is about to change.
The **empty-library state is ONE sentence on all three activities** (issue 1117): it names World › Rules & Resources › Modifiers, because no activity here has an add button and "Add one" would be an instruction this screen cannot carry out.

### The system Modifiers library — the ONE authoring surface (issue 1117)

`SystemEditView.svelte`'s settings-list section, internally keyed `'modifiers'` and hooked `data-system-modifiers`, is renamed **Modifiers** and is the ONLY surface that adds, edits, reorders, seeds or deletes a modifier.

**It is NOT gated on the gathering feature.** The old gate was correct while the library only fed d100 drop rows; the same library now carries every CHECK modifier, so gating the only authoring surface on an unrelated feature flag would make a crafting or salvage check modifier unauthorable.
The Character Prerequisites card's **Copy to Modifiers** action loses the same gate for the same reason.

It keeps every convention the settings-list cards already have and the Checks card never had — add, update, delete, whole-section collapse, accessible **Move up / Move down** reorder, opt-in preset seeding, and the row-level **Copy to prerequisites** cross-list copy — and it ABSORBS the check-only fields the Checks card used to own:

- a paired absence-preserving `min` / `max` `Stepper` set with an `Unbounded` placeholder, on its OWN row after the expression input so the row reflows to two lines at a narrow pane rather than compressing the expression field, plus a hint stating that empty is not zero;
- a PLAIN `RollDataExpressionInput` (`sigil={false}`), adopted from the retired Checks editor because this is now the one surface that authors an expression.
  It renders no `@` affix, strips nothing for display and re-prepends nothing on write: the stored expression is shown and written byte for byte.
  The affix was correct while an expression was always a roll-data path, and dice retired that premise — a cap that prepends `@` to whatever is typed turns `1d4` into `@1d4`, and an adaptive cap that appears only for a bare path restructures the field as the GM types.
  The leading `@` is therefore the GM's to write, and the surface teaches it: the placeholder reads `@abilities.med.mod` and a hint states that a number or dice expression takes no sigil.
  No stored value changes — the affix only ever supplied the sigil on write, so a persisted path already carries it.
  The summary row reads the stored expression back verbatim for the same reason;
- the two BLOCKING bounds faults, reported on the COLLAPSED row and named by cause (`inverted` / `unsafe`), because an entry that contributes nothing is a fault a GM scanning the list must be able to see;
- a **roll-shaped expression** note on the open editor, stating that EVERY activity may use it: a gathering drop row applies its rolled result, and a check appends the dice to its roll formula so the roll is made once and shows on the card, and that where modifiers compete — `highest`, or `playerPicks` — such an entry is ranked by its average.
  It is a NOTE, not a warning, and it raises no readiness issue: the blocking `modifierRollExpression` is RETIRED, because there is nothing left to report about an entry that rolls.

The summary row keeps its `@`-stripped inline expression and its `Roll` chip, and gains the signed bounds chip.
The Checks screens' read-only modifier cards deep-link here, expanding the section and scrolling it into view; the link goes through the same route-exit guard every other manager navigation does, so leaving a dirty Checks draft still prompts.

### Subject check-modifier picker — salvage and gathering (issue 1095)

`SubjectModifierPicker.svelte` is the ONE authoring surface for the two NEW `bySubject` subjects, `Component.salvage.checkModifierIds` and `GatheringTask.checkModifierIds`.
It is one component with two hosts — `ComponentEditView` (the component's Salvage tab) and `GatheringTaskEditView` (the task card) — rather than two copies, because the pick's semantics are subtle in exactly the way a copy gets wrong, and because the two hosts disagreeing about them is a defect no screen shows.
The recipe's equivalent control (`RecipeOverviewTab`) is deliberately NOT converted onto it; the mismatch is named in the component's own header and is a behaviour decision about the recipe surface, not a refactor.

- **It renders under the activity's `bySubject` rule and a NON-EMPTY system catalogue, and nothing else gates it.**
Each host asks its OWN activity's rule (salvage's from `salvageCraftingCheck`, gathering's from `gatheringCraftingCheck`), never another activity's, because the catalogue is shared and the SELECTION is not.
The salvage host's gate is its own rather than nested inside the DC-override's `simple || routed` one: `progressive` salvage honours the pick at roll time, so nesting made the control unreachable in a mode whose roll reads it.
An empty catalogue draws NOTHING at all — a control whose menu could only ever be empty.
- **Three states, and the two absent-vs-empty ones are different rolls.** An ABSENT pick INHERITS the activity's `defaultModifierIds`; an AUTHORED EMPTY array is a real pick of zero and appends no term; an authored non-empty array is the pick.
The authoredness toggle is the only place a GM moves between the first two: switching it ON emits `[]` and switching it OFF emits `null` (gathering's host patches `undefined`, which is what makes its normalizer drop the key).
Turning it ON deliberately does NOT seed from the activity's default set — a record turning the switch on has stated that it picks its own, and seeding would author picks the GM never made.
This is the one axis on which it differs from `RecipeOverviewTab`'s `changeModifierSetMode`, which does seed.
- **Under inheritance the inherited entries are NAMED, not merely announced.**
The pill row has nothing to author, so it is hidden and the note lists the activity's default set, resolved against the catalogue and dropping unknown ids exactly as the resolver drops them — so the line cannot promise a modifier the roll would not apply.
The names are joined by `formatList` (the active language's list conventions) and interpolated into a **`{list}` placeholder** on the sentence; a hand-joined `', '` tail is wrong in English before it is wrong in any other language, and a runtime value concatenated onto a localized string takes the list's position in the sentence away from the translator.
- **An EMPTY inherited set is its own reading, not a blank.** It states that the activity's default set is empty and that no check modifier applies to this record.
That distinction is domain-level rather than cosmetic: "inheriting these two" and "inheriting nothing" are two different rolls, and a picker that rendered a bare label for both would tell the GM the same thing about each.
- **It NAMES THE SUBJECT.** Every sentence is keyed by which record is being edited — a COMPONENT (its salvage check) or a gathering TASK — from the same shape of vocabulary map `CraftingModifierCatalogueCard`'s `SUBJECT_COPY` uses, so the two surfaces name one subject one way.
The internal noun for the abstraction the two share never reaches a screen.
The inherit sentences name the ACTIVITY's check rather than "the system", because the default set is per-activity and a GM reading "the system default set" on the Salvage tab would look for it on the wrong screen.
- **The cap is stated STANDING**, not only once the add button has already gone dead, with an at-cap clause appended when it is reached.
It is read through `resolveMaxModifierPicks`, so a stored `0`, `-2` or `"three"` shows no cap at all — the picker bounds exactly what the engine bounds.
A cap of exactly **1 takes its own singular sentence**, never "up to 1 check modifiers", the same pair `RecipeOverviewTab` uses; every other bounded cap interpolates the number into a `{count}` placeholder whose fallback substitutes the count itself, so an unlocalized build reads a number rather than a raw brace.
- **The accessible control is the `SelectionCheckbox` and it carries the whole accessible name; the visible sentence beside it is `aria-hidden`.** One of the two, never both — the same rule the eligibility pill above follows, for the same reason.

### Tools tab

The recipe editor's Tools tab authors Tool references only.
Recipe-wide Tools are available in every resolution mode, and explicit multi-step recipes may author additional Tool references per step.
Named ingredient sets receive their own Tool card only when the Crafting System uses `routedByIngredients`; unnamed sets and every other resolution mode expose no per-set Tool authoring.
The per-set card reuses the Results tab's result-set outer card, header, and static-label hierarchy.
A row and the add-a-tool picker both resolve the Tool's name and image through the single precedence in `data-models/spec.md` `## Tool` requirement 13, so an item-sourced Tool renders its own snapshot rather than a placeholder.
Rows contain Tool identity and removal only: Recipe data exposes no breakage, consumption, prerequisite, or bonus policy control because those behaviors belong to Tool Studio and Crafting System check settings.

### Ingredients tab

A requirement's alternatives (`IngredientGroup.options`, satisfied by ANY one of them) are added through a single **"or…" popover** per requirement, replacing the loose per-row and footer add-buttons.
It is a single flat **"Accept instead"** list of the four real ingredient match types — Component, Tag, Currency, and Essence — each appended to that requirement as a new OR alternative for the row's own picker to fill in.
Essence is a first-class ingredient match type, so "component OR essence" is a genuine alternative; the old two-heading Accept-instead / Require-as-well split is retired.

Currency and Essence appear only when the system can honour them, so the menu never offers a choice the system cannot satisfy.
Currency-cost affordances — the set-level "Add cost" button, the requirement-level "Add cost" button, and the "or…" popover's Currency choice — render only when the system's currency feature is **enabled** (`requirements.currency.enabled === true`) AND the world configures units, not merely when units exist.
Unit presence alone is not authorisation, and since issue 1278 it is emphatically not: the ladder is WORLD scope, so a world with a fully authored ladder still has systems that do not charge for anything, and the participation toggle is the only thing that says which do.
Essence appears when the system enables essences.
An essence alternative may repeat across groups, so it is gated on the system HAVING essences (not on system-minus-already-required).
A currency requirement persisted while currency was enabled remains **visible** when the feature is later disabled, but renders read-only (its unit and amount as static text, flagged inactive) rather than being silently hidden.
The per-option `tagMatch` (any / all) control is retained on every tag alternative, and renders through the shared segmented-control primitive rather than a hand-rolled toggle-button pair.
The set-level **"Add essence requirement"** control is retained and now appends a single-option essence GROUP (an AND-required requirement), the only way to author a fresh essence-only requirement.

Multi-set authoring is gated by **`Recipe.complex`** plus the mode's structural constraints (`simple` and `progressive` are one set to one group; alchemy forces a single set) — never by `resolutionMode` alone.

### Duration

Duration unit controls are steppers whose **primary control is a real, typeable number input**, with the −/+ buttons as adjuncts and a clamp at zero.
A click-only stepper is a keyboard regression.

### Step Structure UI

Step mode (Single / Multi-step) is authored from the context rail's segmented control, and is offered when the system enables multi-step recipes — or whenever the recipe already has steps, so a multi-step recipe can always be reverted.

If multistep is enabled:

- Step list with add/remove/reorder (drag and drop), on the Overview tab
- One-step editor per step

If multistep is disabled:

- Show implicit single-step editors at the recipe level

## Component Studio

The GM component surfaces: the component browser and the component editor.

### Requirements

1. The GM component browser groups and filters by `Component.category`.
   Tags are edited in the component editor and, for a multi-row selection, in the browser's bulk edit panel; they must not be rendered as row chips, and rows show a single-line description, mirroring the Recipe Studio.
2. The GM component editor is a single scrolling column with no right rail.
   Back sits beside Save in the header.
   Source actions (replace by drop, unlink, open item sheet, copy UUID) are reachable from the identity strip; the component's progressive difficulty is authored in the body.
3. Source actions commit immediately and are never staged into the editor draft.
   Replacing or unlinking a component's source item restamps durable component identity and saves; carrying source fields through the draft's update path would skip that restamping.
4. The component salvage panel derives its presentation from `salvageResolutionMode` plus salvage-check enablement, gated by `features.salvage` and `component.salvage.enabled`.
   The persisted `routed` token is displayed as "Routed by check".
5. The result-group editor remains reachable when salvage is disabled.
   Disabling salvage collapses the mode, DC, routing, and reorder chrome only.
   The per-component enable control is disabled, with a visible explanation, until at least one result group exists; since the add-group control lives in the result-group editor, collapsing that editor would make enabling unreachable.
   The disabled-state copy distinguishes "no result groups authored yet" from "authored but disabled".
6. The salvage check DC control offers the system's authored check tiers, a system-default option storing `null`, and a `Custom…` option exposing an arbitrary integer.
   A persisted override matching no tier selects `Custom…` and is displayed and round-tripped unchanged.
   A "Manage presets" link routes to the system's Checks screen.
7. The component browser's category group headers obey the shared GM-library group-header rule specified under Recipe Studio: the header pairs what the group renders with the category's total across the filtered rows (`25 of 282 components`) whenever the two differ, reports one number for a wholly-shown group, and localizes both singulars.
8. The component browser preserves the identical view-state across an editor round-trip specified under Recipe Studio, including its **essence** filter alongside category, page, sort, group-by-category, page size, and per-category collapse state; opening a component editor and returning restores exactly what the GM left.
   A genuine crafting-system switch resets category + essence + page + collapse, while keeping sort, group-by-category, and page size as cross-system preferences.
9. The GM component browser supports multi-select bulk editing.
   Each row carries a selection control at its TRAILING edge, after the essence chips and the Edit action, rendered through the shared selection-control primitive.
   A selection toolbar sits directly above the list carrying a tri-state control over the CURRENTLY RENDERED rows, a selected-count readout, a "Select all {N} results" action over ALL filtered rows, and a Clear action.
   The rendered-rows control and the results action are distinct operations and must not be conflated; a collapsed category's rows are not rendered and are never selected by the former.
   The selection is scoped to the selected crafting system, survives an editor round-trip exactly as the browser's other view-state does, is cleared by a crafting-system switch, and never retains an id that no longer resolves to a component.
10. While the selection is non-empty, the component browser's right inspector rail renders the bulk edit panel IN PLACE OF the single-component inspector, from the first selected row.
    The panel stages changes without writing: category (single-valued, overwriting, with an explicit "leave unchanged" option), tags (a flat run of tri-state controls over the system's tag vocabulary cycling leave -> add -> remove -> leave), essences (one quantity control per system essence, shown only when the system enables essences, with OVERWRITE semantics), and the component progressive DC (shown under the same condition as the single-component control and the row badge).
    An axis whose staged value cannot be distinguished from its unstaged value — an all-zero essence map, a zero DC — carries a visible staged indicator that also unstages it, so a destructive edit is never indistinguishable from no edit.
    The panel states permanently that applying essences overwrites the values on every selected component, and additionally warns when the staged overwrite would in fact change or remove authored essence values on at least one selected component.
    One action applies every staged axis to every selected component; it names the number of components it will affect and is inert until at least one axis is staged.
    Applying persists through a single set-apply write, then clears the selection and the staged changes, returning the rail to the single-component inspector.
    The set delete specified at requirement 11 is the panel's other exit and ends the same way, so the panel has exactly two terminal actions and both return the rail to the single-component inspector.
11. The component browser's bulk edit panel offers a set DELETE, rendered below the panel shell rather than inside it, so a destructive action never reads as a second way of applying the staged edit.
    The set delete exists because the panel swap at requirement 10 otherwise removes the only delete affordance at exactly the moment the GM has selected the rows they want removed; unlink and copy-source-UUID stay inspector-only, because neither is destructive.
    The delete states its impact BEFORE it is armed and recomputes it when the selection changes: how many components will be deleted, how many recipes will be rewritten, and how many of those recipes will be left with no ingredient sets or no results and clamped to disabled.
    The two recipe numbers are counts of DISTINCT recipes, so neither exceeds what the cascade will touch: a recipe naming two selected components is rewritten once, never counted once per component.
    The disabled number counts only recipes going from enabled to disabled, because it warns about craftability the GM is about to lose rather than restating what was already off, and it is worded as that transition rather than as the resulting state, so its exclusion of already-disabled recipes cannot read as an undercount.
    A recipe number of zero is omitted rather than stated as zero; the component count always renders, because the impact statement is what the armed confirmation is paired with and a card stating nothing has lost that pairing.
    The impact statement is programmatically associated with the armed control rather than merely adjacent to it, and arming — which changes the control's label and accessible name while it holds focus — is announced.
    Deletion is WARNED, not BLOCKED: no component is refused and no set member is skipped on account of the recipes referencing it, matching the essence rule under Essences Tab.
    The set delete uses the two-step armed confirmation rather than a modal dialog, paired with the impact statement above; the armed token is dropped whenever the selection changes at all, because an arm is a statement about a specific set.
    The set write persists through a single crafting-system write and a single recipes write regardless of set size, then clears the selection and returns the rail to the single-component inspector.
    Because that exit unmounts the panel, the completion message is the surviving on-screen feedback and reports what happened — components deleted, recipes rewritten, and, when non-zero, recipes disabled — while a write that deleted nothing reports no success and leaves the selection intact.
    The keyboard is returned to the studio's toolbar and that same sentence is then announced through the manager's live region, per Emptying a bulk selection above.
    The single-component delete states the same arithmetic in its confirmation, from the same computation, so the two forms cannot report different numbers for the same component, worded in the FUTURE and gated on its own count so the commonest single delete of all — referenced by no recipe — states neither nought.
12. The component editor carries a **Complications** authoring section (`data-models/spec.md` § Component requirements 19-25), authoring the component's `complications` list.
    Each complication authors its name, severity, audience, description, the activities it applies to, how its conditions combine, the condition set, and the two optional effects — a dice expression rolled to chat, and a script macro.
    Editing one marks the component draft dirty and survives Save and reload, on the component draft's OWN signature rather than on the salvage draft's, because `complications` is a top-level field and a component with salvage disabled must still be able to author one.
    The macro picker's options are the system's already-filtered script-macro list rather than a new projection, and a dropped macro that is not a script macro is REJECTED at the drop with a stated reason rather than stored to fail later.
    The section mints client-side complication ids through an INJECTED mint with a Foundry `randomID` fallback, and never through `Math.random()`.
13. **The Complications section has its own visibility gate: it renders only when the SYSTEM resolves at least one activity progressively.**
    A complication has no moment to fire in a system with no progressive resolution anywhere, and offering a GM a consequence that can never happen is worse than offering none.
    The gate is ONE predicate owned by the section, not a prop a host could forget to compute.
    Within the section an activity the system does not resolve progressively is still AUTHORABLE and is annotated as such: the complication is stored and will not fire, and saying so at authoring time is the point of the annotation.
    A check-trigger option is labelled by its OWNING activity, because a trigger id names a trigger in exactly one activity's id space (`data-models/spec.md` § Component requirement 24) and two identically-named triggers would otherwise be indistinguishable.
14. **The trigger sentence is one localization unit.**
    The one-line summary of when a complication fires and what it does — _"When the award is missed or 1d20 = 1 · rolls 2d6, runs Shrapnel Burst"_ — is generated by a SINGLE shared builder and rendered in three places: the authoring row, the Component Studio's read-only salvage strip, and the Recipe Studio's stage strip.
    Three call sites joining clauses by hand is three chances to disagree about the conjunction, the operator glyph and the no-trigger case.
    Every clause, the `and` / `or` conjunction, the effect tail and the never-fires sentence are their own localized strings, and the comparator glyph comes from the shared operator table rather than a restated map.
    The row clips the sentence rather than wrapping it, so it MUST carry the full sentence as a title, or a longer localized form is invisible past roughly sixty characters.
15. **The section states what a complication fires ON, and discloses what it does not cover.**
    Its copy says a complication fires when the component is PRODUCED as a stage of a progressive result — a progressive craft, salvage or gathering — and that it does NOT fire when the component is itself salvaged or spent.
    That second case is real and is deferred to issue 1287, so the copy discloses it rather than letting a GM author a complication for a moment this build never reaches.
    The copy says nothing about a player's ability to read world data: `visibility: 'gmOnly'` is a DISCLOSURE guarantee rather than a confidentiality one (`data-models/spec.md` § Component requirement 23), and the place to state that limit is the specification and the field documentation, not a line of editor chrome that would read as a warning about this component.
16. **Both GM read-only complication strips read the UNREDACTED authored list.**
    The Component Studio's progressive salvage rows and the Recipe Studio's progressive stage cards each render a read-only complication strip for the component the ROW REFERENCES — never the component being edited — fed by the same component projection the row's read-only difficulty badge reads.
    They MUST NOT be fed from the PLAYER forecast projection: that projection filters to `visibility: 'visible'` and the authored default is `gmOnly`, so a GM strip fed from it would list nothing for exactly the complications a GM authors by default.
    Each strip is filtered to the ACTIVITY its surface represents, because a complication enabled only for crafting says nothing about a salvage stage and listing it there would tell the GM a yield carries a consequence it does not.
    **Neither strip may relax the joined stage-row rule the two studios share**, because that join is deliberate and a change there re-shapes every progressive stage row in BOTH.
    The Component Studio's salvage strip is therefore a SIBLING of the row — a tucked, indented, left-ruled band that is simply the stage list's next child, marked as presentational so a screen reader does not count one more stage than the award loop spends down.
    The Recipe Studio's strip sits INSIDE the stage card, and does so through a wrapper that participates in layout ONLY when the strip has something to draw, plus an additive alignment rule scoped to rows that actually draw one.
    Both routes satisfy the same requirement: a stage row in a system that authors no complication renders exactly as it did before this feature.

## Step Editor

Per step controls:

- Step name and description
- Time requirement — the inline per-step duration editor renders only when the system's time requirements are enabled (`requirements.time.enabled`, default on); when disabled the step shows a read-only duration chip instead of the editor
- Currency requirement (when enabled)
- Ingredient set editor

Ingredient set editor supports:

- Add/remove ingredient sets
- Ingredient group editor per set:
  - Add/remove groups
  - Add/remove OR options within a group
  - Item placeholder options that match one or more configured system tags
- Essence options authored as OR alternatives within a group (when the system enables essences); the set-level add appends a single-option essence group

Required tools are **not** authored in the Ingredients tab.
_Catalyst_ is a retired concept — Tools replaced it, and Tool references are authored on the editor's **Tools** tab at recipe and step scope.
When the system uses `routedByIngredients`, each named ingredient set also receives a Tool card on that tab.
Persisted per-set `IngredientSet.toolIds` round-trip unchanged but remain inert and hidden for unnamed sets and every other resolution mode.

Result editor changes by mode.
The UI must expose required data fields from `resolution-modes/spec.md`, but mode logic itself is defined in `resolution-modes/spec.md`.

### Simple UI

- One ingredient set
- Ingredient-group editor within that set (including OR options)
- One result group editor

### Routed UI

The routing basis is the system **mode**, not a per-recipe provider: the recipe inspector carries NO result-selection provider selector (it was removed in the routed split — the basis is derived from `routedByIngredients` / `routedByCheck`).

- `routedByIngredients` UI:
  - Ingredient sets map to result groups via `resultGroupId`.
  - Validation enforces deterministic mapping for all satisfiable sets.
  - The crafting check is optional (no provider toggle, no check requirement surfaced here) and is authored via the shared simple pass/fail editor (`SimpleCraftingCheckEditor`, bound to `craftingCheck.simple`).
  - `routedByIngredients` recipes offer the per-recipe "Check tier" (DC-tier) dropdown sourced from `craftingCheck.simple.tiers` when the simple check uses static `dcMode`; they do NOT get the `minSuccessOutcomeId` minimum-success-tier control (which is `routedByCheck + fixed` only).
- `routedByCheck` UI:
  - Routes by the system crafting-check outcome (the system requires an authored `craftingCheck.routed.rollFormula`).
  - Result groups carry the routed-check outcome tier assignment (`checkOutcomeIds`); the outcome also routes by normalized match to `ResultGroup.name`.
    The `checkOutcomeIds` assignment picker offers **success tiers only** (`success === true`), matching the success-only routing rule (a failure tier never routes and awards nothing).
  - A step with exactly one result group needs no outcome/tier mapping (the single-group exemption): it is produced on any non-failure outcome.
- Validation and helper copy must reserve failure keywords, including compatibility aliases such as former miss/event terms, and forbid them as result-group names.

### Alchemy check-mode selector (issue 554)

- At the **top of the `checks-crafting` route's The roll section**, shown only when `resolutionMode === "alchemy"`: a native check-editor radio group (`manager-checks-type-options`) for `alchemy.checkMode`, rendered ABOVE the per-mode editor.
  It offers `simple` and `tiered` ONLY.
  `none` remains a persisted value — it is what the rail's Active switch writes when the GM turns the check off — but it is not a mode the selector offers, because the on/off decision belongs to the Active switch and the selector answers only what SHAPE the check is.
- Selecting a mode STAGES it on the studio's draft rather than persisting on click: it swaps the editor below immediately, marks Crafting dirty, and is applied by the shared `Save checks` (through `store.setAlchemyCheckMode`, which spreads the nested `alchemy` block so `learnOnCraft`/`consumeOnFail`/`showAttemptHistoryToPlayers` are preserved).
  Discarding the studio's drafts restores it.
  The staged mode and the check formula staged beside it are saved together, so turning the check on and authoring its formula in one visit persists both.
- The selector is NOT rendered on the Crafting Settings page; that page keeps only the Recipe resolution, Recipe visibility, and (when salvage is on) Salvage resolution cards.
- The three behaviour flags the selector preserves (`learnOnCraft`, `consumeOnFail`, `showAttemptHistoryToPlayers`) are themselves authored by the **Alchemy behaviour-flag controls**, which since issue 1096 live on a DIFFERENT SECTION of the same route (**On failure**) and are never on screen with the selector; see that requirement for the sanctioned authoring path.

### Alchemy behaviour-flag controls (issue 713)

- On the **On failure** section of the `checks-crafting` route (shown only when `resolutionMode === "alchemy"`, regardless of `checkMode`): three live-persisting toggle cards editing the system-level alchemy behaviour flags — `learnOnCraft` (default `false`), `consumeOnFail` (default `true`), and `showAttemptHistoryToPlayers` (default `true`).
- Each toggle reflects the stored value (including a stored non-default value) and persists through `store.saveAlchemyConfig`, which spreads the nested `alchemy` block so `checkMode` and the other two flags are preserved.
  Because `saveAlchemyConfig` rewrites all three flags from its argument, the caller sends the current projected values with only the toggled field overridden.
- The controls' semantics are defined by `resolution-modes/spec.md` (consume-on-fail) and `recipe-visibility/spec.md` (learn-on-craft, attempt history); this requirement covers only the authoring surface.
  The failure-consumption toggles of §Crafting Check Controls are the distinct, non-alchemy `craftingCheck.consumption` policy and are NOT shown in alchemy mode.

### Checks studio per-mode behaviour (issue 554)

Which of the five sections renders in each mode.
Crafting: `simple` and `routedByIngredients` render all five with Outcomes as the two-outcome statement; `routedByCheck` renders all five with the band strip and the tier rows; `progressive` renders all five with Outcomes as the `awardMode` selector; `alchemy` follows its `checkMode`, and `none` takes the shared switched-off panel.
Salvage follows the same three-mode pattern.
Gathering: `progressive` and `routed` render all five; `d100` renders Modifiers with the `noModifierSupport` inert notice, the check-modifier and character-modifier disambiguation copy and the dormancy notice, and renders the remaining inapplicable sections as `EmptyState`s naming the mode.

- alchemy + `simple` → the simple pass/fail editor rendered below the selector, with a LIVE Active switch: simple is OPTIONAL, and turning it off stages `checkMode: "none"`.
- alchemy + `tiered` → the routed editor below the selector, with the LOCKED always-on reading of the switch and the requiredHint (ungated by `checksEnabled`).
  Tiered cannot be disabled because it routes result groups by outcome tier and so cannot resolve without a roll.
- alchemy + `none` → the shared switched-off panel with its "Turn this check on" action, and a live Active switch reading off.
  Turning it back on stages `checkMode: "simple"`.
- The Crafting checks help copy describes simple/tiered and the off state.

### Alchemy Recipe UI (GM Editor)

- Removes the `resultSelection.provider` selector and the Complex/multi-set toggle (retired, issue 554).
  Ingredient-set vs result-group rendering is derived from `alchemy.checkMode`, not the single `complex` flag; the ingredient set is ALWAYS single.
  - **None** → single ingredient set + single result set.
  - **Simple** → a labeled "On success" result set + a reserved, static-labeled ("On a failed check", warning/danger accent), undeletable, empty-by-default failure result set (synthesized in the derived view, persisted on first edit; `Recipe.validate` tolerates its absence).
    No "add result set" beyond the two.
  - **Tiered** → result groups with routed outcome-tier assignment (reusing the `routedByCheck` UI; `routingProvider === "check"`).
- Shows alchemy-only signature collision diagnostics spanning all recipes in the system.
- Save remains blocked until all collisions are resolved.

### Progressive UI

- Ordered results editor
- Read-only difficulty badge per result item.
  The badge deep-links to the component editor's Difficulty card, and never edits in place: `component.difficulty` is a **Component** property consumed by progressive recipes, progressive salvage, progressive gathering and the system-validation blocker, so an inline editor here would write across an aggregate boundary (or make "Save recipe" silently persist a Component change).
  A component with no authored difficulty reads as unset, not as `0`.
- Drag reorder controls
- **Keyboard reorder controls** alongside them: per-row Move up / Move down buttons, disabled at the ends, whose accessible name names the result they move, with the new position announced through an `aria-live="polite"` region.
  Result order is load-bearing in progressive mode (the award loop spends the check budget down the list), so a drag-only reorder is an accessibility gap, not a convenience one.
- A **reorder-permission toggle card** at the END of the progressive block, after the result sets — never directly beneath the roll-budget info strip.
  The card is info-toned, defaults **on**, and writes `Recipe.allowPlayerResultReorder`.
  Placement is a requirement, not a preference: the strip and the card are both info-toned, so adjacency renders them as one undifferentiated block, and the resulting reading order (strip = how this list is spent, list = the thing, card = who may reorder it) states the policy after the thing it governs.
  The strip's copy is NOT folded into the card's sub-line, because the strip states an invariant true of every progressive recipe while the card states a conditional the GM can switch off.
- The **salvage editor** renders the same toggle card, gated on `salvageResolutionMode === 'progressive'`, writing `Component.salvage.allowPlayerResultReorder`.
- The progressive **salvage** result list shows **ordinals** and a **read-only difficulty badge** per row.
  These are required alongside the salvage toggle card and not severable from it: progressive salvage spends the roll down the list, so without them the card would govern an order the GM cannot see, and a card reading "players may reorder the stages" above a list of bare selects asserts a model the surface contradicts.
  The badge is read-only because the difficulty belongs to the **result** component, whose own editor owns its save lifecycle.
- A progressive result row — recipe or salvage — renders **no quantity control**, because `resolution-modes` normalizes every awarded progressive entry to a single item; the GM expresses "more of X" by listing X again and ordering the list.
  The `simple` and `routed` salvage rows KEEP their quantity, which those modes award as authored.
- A salvage result row picks its component through a **searchable popover whose trigger carries the component's image and its name**, not a native `<select>`.
  The image is required: a `<select>` can only present a text list, on a surface where every other component is shown with its art.
  The trigger is ONE control over both facts, and an art-less component falls back to a glyph rather than emitting an image element with no source.
  The popover is portaled to the manager host so it escapes the editor panel's `overflow: hidden`.

## Crafting App (Player)

### Shared-store refresh routing

The unified window holds five shared read-model stores — `crafting`, `inventory`, `alchemy`, `journal` and `gathering` — and a crafting-data change refreshes them SELECTIVELY.

- Each store subscribes to the set of **invalidation domains** (`data-models/spec.md` § Invalidation Domains) it consumes, and refreshes only when a change names one of them.
  A subscription set is DERIVED from the one authored domain-to-consumer mapping; a surface MUST NOT restate it inline, because a second copy is exactly the drift the derivation exists to remove.
- The five stores' consumers are: `crafting`, `inventory` and `alchemy` consume all seven domains; `journal` consumes six and NOT `narrative`; `gathering` consumes five, excluding only `narrative` and `held-inventory`.
- `gathering`'s set is closed over the SYSTEM-VALIDITY GATE, and that is why it consumes two domains whose facts it renders nowhere.
  The gathering listing drops every environment of a system the validity gate reports blocked, for non-GM viewers only, and those blockers are produced from check configuration (`resolution-config`) and alchemy signature collisions (`materials-and-yield`).
  Omitting them leaves a GM authoring the missing formula while every player's tab keeps hiding the system — with a well-formed, correctly attributed change, so no fail-safe can catch it.
  `held-inventory` stays out because the gathering view owns an item subscription scoped to the selected actor, which is narrower.
- A change that names no domain refreshes every store.
- A change to an actor's held items belongs to the `held-inventory` domain and refreshes exactly that domain's consumers, filtered to actors this window reads from.
- The shell reloads the inventory listing through the store's bulk-run guard and MUST NOT call the store's direct load seam, on any of these paths.
- The selectable component-source ACTOR list is refreshed alongside the `crafting` store.
  It holds actors rather than a definition-derived read model, so it has no fact class of its own and is not a taxonomy store.

Which store a given change reaches is a claim about rendered behaviour, so it MUST be proved by MOUNTING the shell and driving one single-domain change per domain, with the expectation computed from the shipped domain-to-consumer mapping rather than restated as a second table.
A source-text guard cannot see it: the subscription sites sit within a few hundred characters of one another, so a windowed text match is satisfied by any of them.

### Actor and Sources

- A persistent app header appears above the tab content and replaces separate
  `Craft With` and `Using Components From` form controls.
- The left side of the header shows the currently selected crafting actor's
  image/avatar and name.
  The default and last-selection resolution order is the
  same as the crafting store selection behavior.
- Clicking the selected crafting actor image or name opens a searchable,
  scrollable dropdown of available crafting actors.
  Each row shows actor image
  and name.
- The right side of the header shows `Component Sources` and a row of selected
  component source actor images/avatars.
- Component source names are hidden by default and revealed on hover over each
  selected source avatar.
- Right-clicking a selected component source avatar removes that source.
- The selected crafting actor is always included as a component source and
  cannot be removed from component sources.
- Changing the selected crafting actor moves this required component source
  from the previous crafting actor to the newly selected crafting actor.
- An edit control beside the source avatars opens a searchable, scrollable
  dropdown of owned actors for selecting or deselecting component sources.
  Each
  row shows actor image and name.
- Persist last selections in client settings
- Actor/source selection is shared across both tabs (rendered above tab content)
- The Component Sources header is **owner-scoped** for a non-GM viewer: a non-GM
  can only craft from and into actors they own, because `CraftingEngine.craft`
  mutates Items directly with no GM relay.
- A GM sees all actors; a non-GM sees only owned actors in both the crafting-actor
  picker and the component-source picker.
- The selected crafting actor is force-included as a non-removable component
  source only when the viewer owns it; a non-owned acting actor forces nothing.
- Accessibility: each source avatar is a focusable button with an always-present
  `aria-label` (the actor name, with an "always included" suffix on the required
  actor); the name reveals on hover and focus; removal is available by a
  keyboard-reachable, visible control as well as right-click; the add/remove
  picker is an in-place popover.
- Persist the selected crafting actor in the `LAST_CRAFTING_ACTOR` client setting
  and the component-source ids in `fabricate.lastComponentSources`.

### Browse And Detail Phases

The player crafting read is TWO phases, because browsing and inspecting have different costs
and the browse half is the one that scales with the corpus.

- **The listing seam returns cheap summary rows.**
  `listCraftingForActor` answers `{ summaries, total, counts }`, where each summary is the
  canonical recipe summary (`data-models/spec.md` § Summary Projections) for the viewer's
  audience.
  Search, the favourite / craftable / system / category filters, the A–Z sort and pagination
  all run against those rows, so the page window is chosen before any expensive work.
- **Building the rows performs no exact craftability evaluation, at any corpus size.**
  A row's material verdict is the indexed availability projection over one per-pass inventory
  snapshot, and it is an UPPER BOUND: a positive answer means "looks makeable", never "you
  can make this".
  This MUST be asserted by an operation count rather than by review, and the count MUST be
  shown to be non-vacuous.
- **The detail seam hydrates ONE recipe.**
  `hydrateCraftingRecipe({ recipeId, actorId, componentSourceActorIds })` returns the exact
  rich model — per-set craftability, ingredient choices, the essence pool, checks, outcome
  tiers, duration, steps and progressive stages — or `null` when no such recipe exists or the
  viewer may not see it (`recipe-visibility/spec.md` § Per-Recipe Detail Hydration).
- **Only the selection is hydrated.**
  The player app hydrates the selected recipe, falling back to the first visible row when the
  player has selected nothing.
  A first page's exact-evaluation count is therefore bounded by the page size and MUST be
  independent of corpus size.
- **A hydrated model does not outlive its read pass.**
  It carries exact craftability derived from live actor inventory, so it MUST be discarded
  whenever the listing is refetched — which the app does on mount, on an actor change, after
  a craft, on a scene change, on a world-time tick and on a relevant inventory mutation.
- **Changing search, a filter or the page never re-hydrates an explicit selection.**
  Those are pure reads over the summary rows, and hydration is memoised per recipe for the
  life of the read pass, so a filter cannot re-hydrate a recipe already hydrated in it.
  The one exception is the no-selection fallback: with nothing explicitly selected the app
  shows the first visible row, and a filter that moves which row that is hydrates the new
  one — once, and only when the fallback row actually changes.
  That is bounded by the number of distinct rows a player's typing lands on, not by the
  corpus, and it is the cost of showing the top result rather than an empty inspector.
- **The row and the inspector may disagree about materials, and only in one direction.**
  The row's optimistic verdict can read "available" where exact evaluation refuses, because
  contended requirements are counted for every set that draws on them.
  It can never read unavailable for a recipe exact evaluation would allow.
  Exact validation immediately before consumption remains authoritative and is unchanged.

### Craft Execution

- The Crafting tab crafts through the existing `game.fabricate.craft` engine path
  (via the `craftRecipe` facade seam); the engine returns `{ success, cancelled?, results, message }`
  and does NOT throw, so a failed craft surfaces its message rather than an error.
  A dismissed interactive prompt returns `{ success: false, cancelled: true, results: null }`
  with zero mutation, and any phantom run created by that call is discarded — the same
  interactive/cancelled contract as salvage (see the path-agnostic §Interactive Roll Prompt).
- A non-GM crafts directly against owned actors; there is no GM relay for player
  crafting.
- Time-based countdowns are driven by world time only: a new `subscribeWorldTime`
  bridge refreshes calendar-aware durations and re-fetches the listing quietly when
  the GM advances the clock.

### Salvage Execution

The engine seam behind the player salvage surface (§Player Salvage Surface).
Stated as its own section, a sibling of §Craft Execution, because the outcome semantics are the engine's, not the presentation's.

- Salvage runs through the `salvageComponent` facade seam, which takes an **`actorId`** and never an actor uuid.
  The engine's `salvage` performs **no ownership check of its own** — it resolves the uuid and mutates that actor's Items directly — so the facade's actor resolution is the only ownership gate on this path.
  A uuid accepted from a UI would bypass it, and a stale or foreign one reaches the server and **throws** rather than returning a message.
- The seam **returns** rather than throwing for every ordinary failure (actor / system / component not found, feature disabled, salvage disabled, validation failure), so a failed salvage surfaces its message.
- **`cancelled` is distinct from `success: false`.**
  A dismissed roll prompt returns `{ success: false, cancelled: true, results: null }` with **guaranteed zero mutation** — no component consumed, no tool breakage — and discards a run created by that call.
  It is a user's choice, not a failure, and MUST NOT be reported as an error.
- There is a **third** outcome: a component with a time requirement returns `success` with **null results** and an explicit **`waiting: true`** flag.
  The run has STARTED and awarded nothing.
  Treating `success` as "done" would show a success state for a run that gave the player nothing, and the flag exists so no caller has to re-derive that from `results == null` — which is also what a no-result success looks like.
  The flag is additive and `success` is unchanged, and it is present only when a salvage run manager is available to arm the time gate: a runless salvage carrying a `timeRequirement` never returns `waiting`.
- A misconfigured required check (routed or progressive with no authored roll formula) returns `{ success: false, misconfigured: true }` with zero mutation and a GM-config message.
  Like a dismissed roll prompt, it **discards a run created by that call**, so a misconfigured abort never leaves a persisted `inProgress` salvage run; a reused pre-existing run is left untouched.
  The **salvage-configuration validation abort carries the same `misconfigured: true` discriminator**, and it is the branch that actually fires in a wired world: validation runs before the check does, so a GM-side config error (an unsupported salvage mode, a routed success tier routing nowhere, a `simple` mode with two success groups) never reaches the check's own misconfigured return.
  Without the flag there, a caller reads a broken config as a rolled failure and tells the player "nothing recovered" about a config only their GM can fix.
- The UI passes `interactive: true`; the default `false` keeps macros and automation silent (see the path-agnostic §Interactive Roll Prompt for the shared contract).

### Bulk Salvage Execution

One player gesture, N salvage attempts, one aggregated card.
The engine seam behind the Inventory tab's bulk panel, stated beside §Salvage Execution for the same reason that section is stated at all: the outcome semantics are the engine's, not the presentation's.

- Bulk salvage runs through the `salvageComponents` facade seam, which takes an **`actorId` per target** and never an actor uuid at any nesting level.
  The facade derives the uuid the service receives.
  `BulkSalvageService` performs no ownership check and `CraftingEngine.salvage` performs none either, so the facade's per-target actor resolution is the **only** ownership gate on this path.
  There is deliberately **no persisted-selection fallback**: a bulk run may span actors, so falling back to the last-selected actor would silently retarget a row whose own actor did not resolve, salvaging the wrong character's items with no error anywhere.
  A row naming no resolvable actor is refused as `notPermitted`, never redirected, and one refused row costs the player none of the others.
- Execution is **strictly sequential**, never concurrent.
  Tool breakage at item _k_ must be visible at item _k+1_; stack depletion is shared between rows resolving to the same owned documents; and each salvage run record is a read-modify-write actor `setFlag` with no compare-and-set anywhere in the run store.
  Safety against double-consumption comes from that sequencing plus each `salvage()` call's own availability check, which re-derives the owned documents at call time — **not** from the caller handing over a disjoint document set.
  A duplicate target is therefore reported rather than silently executed twice.
- The outcome vocabulary is `succeeded | failed | waiting | misconfigured | skipped | notPermitted | cancelled | error`, where `notPermitted` is the facade's own outcome and the rest are the service's.
  One item's failure never aborts the run: a thrown call becomes an `error` row and the run continues.
- Targets are classified **before** the engine is called, with a first-match `skipReason` of `bulkLimit`, `unknownSystem`, `featureDisabled`, `unknownComponent`, `salvageDisabled`, `duplicate`.
  That pre-flight is advisory only and the engine stays authoritative, so a target that passes it can still fail for a reason only the engine can see (not enough units, an unavailable tool, a time gate).
- The roll prompt is opened **once** for the whole run, and only when at least one runnable target has a usable check.
  A dismissed prompt returns `{ cancelled: true, items: [] }` **before the first `salvage()` call**, so zero mutation on cancel is structural rather than a rollback.
- A selection is bounded at **25 targets**, enforced at **selection** time so bulk salvage and bulk destroy inherit one bound.
  A cap applied to the salvage service alone would let a 40-row selection salvage 25 and destroy all 40, which puts the unbounded behaviour on the destructive path.
  The service keeps its own `bulkLimit` refusal as a defensive backstop that the selection bound makes unreachable through the UI.
- A run may push older entries out of the 50-entry salvage history; the history is a convenience log, not an audit record.
- **Component complications are collected onto the aggregate card and relayed in BATCH, never per row.**
  Each row is its own resolution and fires its own complications, but the run posts one aggregate card and **zero** per-row complication messages, while still running every row's macro.
  The batch is keyed on the addressed `(craftingSystemId, actorUuid)` pair, which is the relay's unit because both are GM-side authorization inputs (`recipes-and-steps/spec.md` § Complication Macros).
  An ordinary run addresses one pair and relays **one** message; a run that spans actors or systems relays one per distinct pair, bounded above by the 25-target selection cap stated above.
  A per-row relay is what is forbidden: it would silently lose the tail of a long run to the GM-side rate limit, on a path the player never sees.
  Batching also fixes the relay ordering and reduces the de-duplication to one key per pair rather than one per row.
  The collection rides the BULK CARD model rather than a run record, because a bulk salvage is not one run: each row has its own.
- The aggregate card's complication block is a **flat fired-complications section on the posted chat card**, rendered by the one renderer all four card builders share and carrying every row's FIRED complications in run order, each attributed by component name because a bulk card lists many components.
  It is **not** a forecast and has no hidden state: the card is written after the run has committed, from the already-redacted player-visible set (`publicComplications`), so a `gmOnly` complication cannot reach it even when a GM is the acting user.
  The entries are deliberately **not** de-duplicated across rows: each row is its own resolution, and collapsing two rows that fired the same complication would under-report what happened.
  The pre-run **forecast** group card is a different surface on a different screen — see § Player Salvage Surface, _Bulk complication forecast_ — and the two must not be conflated: the forecast is drawn before the commit and hidden by it, while this section is written after the run has committed, so a chat card could not be "hidden after the run commits" in any case.
- A bulk row acts on the **selected** participation when its card is the inspected one, and on the primary otherwise — the same acting-participation rule §Player Salvage Surface states for a single salvage.
- The listing is **not** reloaded from document hooks while a run is in flight.
  Each item's own item CRUD would otherwise reload the listing under the open panel roughly once per item, since the change subscription's trailing debounce coalesces nothing across items that each take a roll, a message create and up to three flag writes.
  Suppression is a **drop**, not a defer, and is implemented by reading the flag at fire time inside the handler — never by unsubscribing and re-subscribing, since the subscription is registered once for the app's lifetime.
  That makes the terminal reload load-bearing, so clearing the flag, running **one** terminal full reload and removing the progress notification are a **single exit-path obligation** discharged on every path including a throw; a flag left set would make the inventory permanently deaf for that session with no error.

_Stated residual:_ three config-shaped engine branches — `CraftingSystem.features.salvage` off, `Component.salvage.enabled` off, and an unknown system — return a bare `success: false` and therefore classify as `failed` rather than `skipped`.
The service's pre-flight classifies exactly these three as `skipped` before the engine is reached, and the blocked-reason vocabulary puts `salvageDisabled` ahead of the misconfigured reasons, so in the designed flow those branches are unreachable and the player correctly reads "Skipped".
They are reachable only when a GM toggles the feature between the listing snapshot and the call, which yields the wrong word for a correct non-outcome, with zero mutation, self-correcting on the reload the run already performs.
Stretching `misconfigured` to cover them would put "tell your GM" on a deliberate GM decision.

### Bulk Destroy

Permanently deleting the selected components, as a peer of bulk salvage rather than an outcome of it.

- Bulk destroy runs through the `destroyComponents` facade seam under the same gate as §Bulk Salvage Execution — an `actorId` per target, never a uuid, no persisted-selection fallback, and an unresolvable actor refused as `notPermitted` rather than retargeted.
- It deletes **whole stacks** on the **target actor** only.
  That is what destroying a thing means; the gesture carries no quantity control; and salvage's one-unit-at-a-time rule comes from the GM-authored `salvage.ingredientQuantity`, for which destroy has no analogue and which destroy never reads.
  A listing row's sources may span actors while the document matcher takes one actor, so the count the panel shows and the count the confirmation names are the **target actor's** units (see `data-models` requirement 17).
- It is **not** gated on `CraftingSystem.features.salvage` or a component's `salvage.enabled`, and it posts **no chat card**.
  A player can already delete their own owned Items from the Foundry sheet, so this adds ergonomics rather than capability, and a blocked-for-salvage row is often exactly the row a player wants gone; a result card reports what an activity produced, and this produces nothing.
- It reports the units **actually deleted**, derived from the documents the delete returned rather than from the ids requested.
  A `preDeleteItem` hook returning false drops individual ids silently while the rest of the batch deletes, so a vetoed row is **reported to the player rather than counted as destroyed**.
  A stale id — one whose document went away between the panel snapshot and the confirm — is a distinct story from a veto and is reported as such: it was never submitted, so no hook refused it.
- The confirmation names **both** the row count and the unit count, so the whole-stack rule is legible before the fact.
  The target set is resolved **once, before the dialog opens**, and the facade executes against that snapshot without re-prompting; the listing reloads on world-time, scene and source changes, any of which can fire while the modal stands.
- An active run referencing destroyed documents is **not** cleaned up — run maintenance prunes deleted _content_, not deleted _documents_ — so such a run fails when it resumes.

### Interactive Roll Prompt (path-agnostic)

A check-bearing execution accepts a per-call `interactive` flag (default `false`, keeping macros/API silent).
When `true`, the shared system-agnostic dialog (`src/ui/svelte/apps/crafting/rollPrompt.js`, `promptCheckRoll`/`buildInteractiveRollOptions`) prompts the player to roll; a dismissed prompt yields `{ success: false, cancelled: true, results: null }` with guaranteed zero mutation, distinct from `success: false`.
This is the PR #497 per-call-flag decision, consumed uniformly by the crafting store, salvage (inventory) store, alchemy store, gathering view, and the Journal Trigger Next Step path; `CraftingEngine.craft` discards any phantom run created by a cancelled interactive call.

- **The companion path opens the SAME dialog, on the EXECUTING GM's client.**
A Standalone Check Roll published to a companion (`companion-api/spec.md`) opens this dialog and no other — never the subject player's client, and never a relayed one.
Its chat flavor and its dialog titles are built from the caller's own `label`, defaulted to a **localized activity noun** so that no flavor can render `undefined` and none can render a doubled "check check".
Its bulk prompt's item count is the caller's **whole batch**, not the usable subset, so a batch in which some formulas cannot roll still reads as the number of things the player queued.
A dismissal is reported to the caller as `cancelled` with **zero mutation**, which is the property that capability exists to preserve.
- **Crafting-only "Check modifier" group.**
When — and only when — the caller supplies `rollOptions.modifierChoice`, the dialog renders one extra control between the formula block and the situational-bonus input: a fieldset legended "Check modifier" holding one input per eligible modifier, each showing that modifier's icon, its label, and a signed value chip (`+3` / `0` / `-2`).
The **input type follows the descriptor's `maxPicks`**, which is clamped into `[1, options.length]`: at 1 it is the pick-one **radio** group it has always been, and above 1 it is a **checkbox** group whose legend states the bound in words ("Pick up to 3").
The two are not interchangeable — a radio group that permitted several picks and a checkbox group that permitted one would each lie about the control — so the type is chosen from the bound rather than fixed.
The best legal selection is pre-checked, and the confirmed choice returns the checked ids as `chosenModifierIds` (falling back to the descriptor's `defaultSelectedIds` when the field is absent, as on the headless no-`DialogV2` path; a legacy single `chosenModifierId` is still honoured).
Above 1, the dialog disables the unchecked inputs once `maxPicks` are ticked and releases them again when one is cleared.
That is a UI affordance only: `evaluateCheckRoll` re-imposes the same cap on the returned selection, since a UI control's constraint is never the invariant.
A descriptor carrying no usable `maxPicks` renders — and is reduced as — a single pick, so a descriptor built before the field existed cannot silently widen.
This group is only the presentation of the crafting-check `playerPicks` combination rule: which modifiers are eligible, when the group is offered at all, the pre-selection and its tie-break, and how the picks SUM into the appended modifier term are normative in `resolution-modes/spec.md` §Check Source, not here.
**CRAFTING and SALVAGE supply a `modifierChoice`** under `playerPicks` (issue 1095), and their dialogs render the modifier fieldset on the same terms; the pre-1095 claim that salvage never passes one retired with the crafting-only catalogue.
**GATHERING supplies none**: it threads the modifier context and resolves a `playerPicks` selection deterministically, and its roll-time prompt is deferred to issue 683 with the rest of the seam (`resolution-modes/spec.md` §Check Source is normative).
A roll under any other combination rule passes none — including `bySubject`, whose selection was already made at authoring time — so no `modifierChoice`, no fieldset.
The dialog's formula line ends in a trailing `+ (modifier)[Modifiers]` slot while the choice is unanswered.
- **Pre-resolved roll decisions.**
A caller MAY supply a `rollDecision` (`{ bonus, rollMode, advantage }` — the prompt's own return shape minus `confirmed`).
The evaluator then treats it as an already-answered choice and **never opens the modal**, running the identical downstream code: the check-modifier append, the advantage transform, the situational-bonus append, the formula-validity net and the effective roll mode.
With no decision supplied every existing path builds a byte-identical options bag, so single-item salvage, crafting, alchemy and gathering are unchanged.
A decision carries **no `confirmed` key** and MUST NOT be read as a cancellation; only an explicit `confirmed === false` is one.
A decision supplied without a prompt function must still apply, or the base formula rolls and the player's answer is silently discarded.
Only the salvage runners attach a decision today — one gate (`CraftingEngine._salvageRollOptions`) serving all three salvage check paths, so a fourth salvage runner cannot ship without it — because putting the attachment in the shared prompt module would advertise pre-resolved-roll support the crafting and gathering paths do not wire.
- **The bulk prompt.**
A bulk run answers **one** prompt whose answer applies to every roll in the batch, and the dialog's own note says so.
It shows **no formula and no DC** — a batch has no single subject — and instead shows a subject strip of thumbnails with an overflow count, the situational-bonus input and the roll-mode picker.
Advantage is offered only when **every** usable-check subject's **authored** formula carries a plain `1d20`, computed from the crafting system rather than from the listing projection, which carries no formula at all.
It is all-or-nothing across those subjects: offering advantage only some rolls could honour would be a lie about the rest of the batch.
The prompt is not shown at all when no selected item has a usable check, and dismissal returns the same not-confirmed shape the single-item prompt returns.

### Result Chat Cards

- Crafting and salvage share one card format (built by `buildResultCard`): the subject, recovered/produced results, consumed/forfeited items, broken tools, and failure reason.
- The card appends the **rolled check total** as its own row, mirroring the salvage summary's "with a roll of N" rule: rendered only for a finite value and omitted for a no-check guaranteed craft/salvage (`rollValue` null).
  The total is the RAW roll (`checkResult.data.total`), not the progressive awarding value, so a forced crit shows the natural roll rather than the `MAX_SAFE_INTEGER`/`0` award sentinel.
- The card is posted only on resolved success or rolled failure — never on cancelled, misconfigured, or time-gated outcomes.
- Posting is gated by `features.chatOutput` (default on); `ChatMessage.create` failures are non-fatal (logged only), so a chat error never aborts the craft/salvage.
- Gathering posts its own result card under the same `features.chatOutput` toggle.
- **A bulk salvage run posts ONE aggregate card**, and the per-item cards are suppressed.
  Suppression is a `salvage()` option gating **both** poster call sites — the rolled-failure path and the success path — because a missed thread would post the aggregate card plus one stray per-item card for every failed row.
  The card carries N subjects, each with its own roll value, tier step, outcome and message, plus recovered / consumed / broken-tool lists aggregated by name, and it reuses the shared card markup atoms rather than a second copy of them.
  A subject appears iff **its own** system's `features.chatOutput` is true, and nothing is posted at all when no subject qualifies — not an empty card.
  Per-roll dice posts are deliberately **not** suppressed, since they are the Dice So Nice trigger, so N items produce N dice messages plus one aggregate card.
  A subject's roll total, tier step and broken-tool evidence reach the card only through the salvage **run record**, so a runless call correctly contributes no tool section and no tier step; the raw roll total is preferred over the top-level value for the same reason the single card prefers it, and because the top-level value is threaded only on the success return.
- **Message visibility is applied to the message data BEFORE creation.**
  A message's legacy roll-mode CREATE OPTION is honoured only for a message carrying rolls, and the aggregate card carries none — so passing the option to `create` maps nothing and posts a blind run's whole result table publicly.
  **One capability probe selects the applier AND the token vocabulary together**, because the two Foundry generations have disjoint vocabularies and crossing them fails in both directions: a legacy token handed to the newer applier throws, and a newer token handed to the older applier silently posts public.
  The translation reuses core's own legacy map so the card cannot drift from the dice messages beside it, and a token with **no** entry in that map is passed through **unchanged** rather than defaulted — defaulting to public would silently downgrade a client default outside the legacy vocabulary, which is the exact leak this edge exists to close.
  The **speaker is set before** visibility is applied, because the in-character branch reads it unguarded.
  It is the single target's actor for a one-actor run and an explicit alias naming the acting user for a multi-actor run, never inferred — an inferred speaker falls through to the controlled tokens on the canvas, so a GM with an unrelated NPC selected would have the card attributed to that NPC.
  A blind run's card is whispered **and** blind, so its own author sees hidden content; that is correct, the in-panel report is their feedback channel, and the blind flag must not be dropped to "fix" it.
  The card is created with **`author`**, not the legacy `user` key the single-salvage poster still passes.

#### The GM-only complication card

Posted to the elected GM alone when a resolution's fired complications reach them over the
complication relay (`recipes-and-steps/spec.md` § Complication Macros).
It is built by `buildGmComplicationCardContent`, not by the shared complications renderer the
four player-facing cards draw: that renderer's row is three player-safe strings on one line,
and this one additionally says why the complication fired, marks the acting client's
unverifiable claim as a claim while doing so, reports the GM-side effect roll, and reports a
macro that was skipped or threw — none of which may ever reach a player surface.

- **A row is a VERTICAL STACK of labelled sections, never a run of columns.**
  In source order: a head line carrying the complication's name with its severity eyebrow at
  the right; a muted context line naming the component that carried it and, for a `visible`
  complication, that the player saw it too; the GM's authored description; then **Why it
  fired**; then **What happens**; then **Needs your attention**.
  A section with nothing to say is OMITTED rather than drawn empty — an empty "What happens"
  heading reads as a consequence that failed to render, and a complication that only narrates
  legitimately has none.
  The stack is what the row is FOR: its content is several independent statements about one
  complication, and the previous single-line treatment hung them off the `<li>` as flex
  siblings, which rendered a five-letter severity down three lines inside a 140px grid track.
- **Every rule the GM row adds is reached through the card's `--gm` block modifier**, which no
  player-facing card emits, so the player complication row and its two shipped rules cannot
  move.
  The structural half is asserted in `tests/component-complications-fire.test.js` and the
  RENDERED half — that the runs stack, that each heading sits above its own facts, and that
  the severity stays on one line flush right at chat width — in the engine-backed gate in
  `tests/crafting-chat-card.test.js`, against a negative control with the modifier stripped.
- **"Why it fired" is re-derived on the GM client, never relayed.**
  The clause set, the `match` mode and the roll-condition toggle come from the GM's own copy of
  the `craftingSystems` world setting, exactly like every other disclosure decision this card
  takes; the acting client contributes only the claimed bucket, which is asked no more than
  which of the GM's own stage clauses it satisfies.
  Relaying the acting client's `matchedConditions` is refused: it would be a fourth
  client-supplied claim on a payload specified as addressing-only, which
  `resolution-modes/spec.md` § Progressive Awarding turns down by name.
- **The reason is SOUND, not complete, and never guessed.**
  Every reason named genuinely contributed to that firing.
  A clause that may also have contributed but cannot be confirmed from the GM side is omitted
  rather than asserted, and a firing whose deciding clause cannot be named at all says so in
  one sentence rather than offering the most likely candidate.
  Three cases reach that admission and all are real: a `checkTrigger` this side cannot
  evaluate, a `rollCondition` whose dice this side never saw, and a claimed bucket no enabled
  stage clause reads.
- **A claimed outcome is worded as a REPORT; an authored condition is stated flat.**
  The stage bucket is the acting client's unverifiable claim, so each of its four sentences
  attributes it — "their game reports the roll falling short here" — rather than asserting it.
  The attribution lives in the sentence's own grammar rather than behind a separate label,
  because a "Reported by the acting client" prefix is a phrase a GM has to translate and
  discharges the same obligation less readably.
  A condition the GM authored is re-read from their own record and is therefore stated flat.
- **The consequence roll leads with its TOTAL, under the name the GM gave it.**
  `Acid damage: 10 (2d6)`, from `effectRoll.label` with the field's own name as the fallback.
  It is a consequence with no target and nothing to miss, so a `formula = total` form read as
  though it were the check the complication fired on.
  A `gmOnly` complication's roll happens on the GM client and states the formula it rolled; a
  `visible` one's happened on the acting client and reaches this card as a claimed number, so
  it states its provenance where the formula would otherwise sit.
- **The card carries NO stage position and no "needed N, rolled M" line**, though both would
  read well.
  `resolution-modes/spec.md` § Progressive Awarding rules the position off this surface: its
  referent is the acting client's ordered list, which this card does not draw and the GM has no
  view of.
  The threshold and the check total fail the same test and one more — neither is re-derivable
  GM-side, because a progressive threshold is a function of the ordered list, that order is the
  PLAYER's per-user preference and is never exported, and a threshold computed from the GM's
  authored order would be wrong exactly when the player reordered.
  Carrying them would make them the fourth and fifth client-supplied claims on an
  addressing-only payload.
  "Why it fired" therefore states the outcome in words rather than in numbers.

### Deferred (this iteration)

- No learn affordance renders on the Crafting tab; recipe learning is wired only through the Inventory surface (see §Books & Scrolls learning and the Inventory learn path, `game.fabricate.learnRecipeFromInventory`).
- The Alchemy tab and the Journal cross-link remain out of scope for the player
  Crafting tab.

### Top-Level Tabs

The player app is a single shared window with a full-height left navigation rail.

- The player app carries five **Core** tabs, in this order: Crafting (always present), Alchemy (conditional — shown when at least one crafting system uses the alchemy resolution mode, `resolutionMode === "alchemy"`), Gathering, Journal, Inventory.
- Alchemy is the only conditional Core entry.
- Any tabs contributed by registered **player navigation providers** are appended after the Core tabs, grouped by surface in registration order and within a surface in the provider's own array order (see §Player Navigation Extension).
- A provider tab is rendered through the same rail control as a Core tab and is addressed by a namespaced route key, so a provider tab id can never collide with a Core tab id and Core never enumerates the ids it accepts.

- The one-tab rule governs the **Crafting / Alchemy pair only**, not the rail as a whole: if only one of those two tab types exists, show that one without a tab bar for the pair.
- If both exist, show the tab bar and default to last-used or Crafting.

### Crafting Tab

#### Player Crafting Projection

- The Crafting tab reads a redaction-safe `RecipeListingModel` listing built by
  the `CraftingListingBuilder` (the crafting analogue of the gathering listing
  builder).
- The builder is a one-directional, read-only collaborator over the existing
  crafting backend (`RecipeManager`, `RecipeVisibilityService`,
  `ResolutionModeService`, `CraftingSystemManager`); it never mutates state and
  never imports Foundry globals.
- GM and player viewers resolve through the one code path, so a GM bypass is
  honoured everywhere the visibility service honours it.
- Only recipes the visibility service marks `access.visible === true` are
  projected; everything else is filtered out upstream.
- Each `RecipeListingModel` carries `modeToken` plus a localized `modeLabel`
  (resolved through the resolution-mode label keys — the raw `simple` token is
  never surfaced to the UI), `browseStatus`, per-set `ingredientSets[].craftability`,
  an optional `check` descriptor, `outcomeTiers`, a presentation-only `duration`,
  and `result`.
  `result` reflects the recipe's terminal execution step in `simple` mode, and a
  `simple` multi-step model additionally carries a `steps[]` per-step requirement
  projection (empty for single-step recipes and outside `simple` mode).
  `duration` is separate from the terminal `result` projection and never changes
  persisted recipe or run data.
- The `check` descriptor's `dc` is resolved per-recipe, not per-system: the
  recipe's selected difficulty tier (`recipe.checkTierId` → the matching
  `craftingCheck.*` slot's `tiers[].dc`) wins, falling back to the slot's static
  `dc`; both the tier DC and a finite static DC are truncated to an integer.
  For the tier and integer-static cases this matches
  `CraftingEngine._resolveSimpleCheckDc` (the rolled DC) and the GM manager's
  `_buildRecipeCheckSummary`, so the player card, the roll prompt, and the GM
  recipe row report one number.
- A slot with a `rollFormula` but no finite static `dc` reports `dc: null` (no DC
  chip) rather than the `15` the engine and GM row fall back to.
  This is a deliberate display-only divergence: the listing must not surface a DC
  chip where none is authored.
- A routed **fixed** check (routedByCheck fixed / alchemy tiered fixed) has no
  meaningful DC and reports `dc: null` (it matches by value range; per-recipe
  difficulty there is `minSuccessOutcomeId`, not a DC tier).
- A **dynamic** (macro-resolved) DC reports `dc: null` at browse time: it is
  resolved at craft time and the read-only listing builder never executes the
  macro.
  The DC chip is suppressed rather than showing a static number the macro would
  override.
- Each `RecipeListingModel` also carries `category` (the normalized category token;
  `general` for the reserved/default bucket) and a `categoryLabel` display string.
- The label rule is exact: the reserved `general` token is localized to
  `FABRICATE.Common.General` and is never shown as a bare token, while a custom
  category token is surfaced verbatim as its own label (GM free-text; no prettify
  or title-casing).
- `category`/`categoryLabel` ride on the shared `base` projection, so they are
  present on Discovery-Mode teaser models too (category is GM-authored grouping
  metadata, not a redacted spoiler field).
- The listing exposes `counts.available` / `counts.total` for header summaries.

##### Multi-Step Recipe Presentation

- The player recipe listing projects a recipe's ingredient sets, per-set craftability, and Craft-button craftability from the recipe's **first execution step** (`Recipe.getExecutionSteps()[0]`), not the raw top-level `ingredientSets`.
  Because an explicit multi-step recipe holds its sets on `steps[]` and leaves the top-level arrays empty, a stepped recipe therefore surfaces its first step's required materials and evaluates craftability against them (over the **union** of recipe-level and step-level tool ids), rather than degrading to an empty `missingMaterials` banner.
  A single-step recipe is unaffected: its implicit step shares the top-level arrays.
- When a recipe resolves to more than one execution step in `simple` mode, the `RecipeListingModel` carries a `steps[]` array.
  Each entry surfaces the step's label (author name or 1-based position, never its id), its required materials with per-step craftability (Have / Need / Missing), and the components that step produces.
  Each entry also carries its effective authored `duration` when the step is timed.
  The `simple`-mode detail body renders these as an ordered list of per-step requirement blocks — a static preview of the whole recipe, not a live run-progress tracker.
  Each block renders inputs only; intermediate step yields are not shown.
  A single-step recipe, and any recipe outside `simple` mode, carries `steps: []` and renders unchanged.
  A Discovery-Mode teaser surfaces no step data (`steps: []`), redacted exactly as `result` and `outcomeTiers` are.
- Only the **active** execution step's requirement block is interactive; every other step stays a read-only preview, consistent with the static-preview contract above.
  The active step is derived the way the engine derives it — the recipe's active run's `currentStepIndex` (`0` when there is no active run) indexed into `Recipe.getExecutionSteps()` — and is baked onto the projected model as `activeStepId` / `activeStepIndex`, so the rendered rail and the executing engine resolve the same step from the same reads.
  Without this, a player whose run is parked at a later step edits a step-0 rail that drives a later step's craft: group ids are randomly generated and so survive a step mismatch by luck, but item references are not step-scoped and would actively steer the wrong step's consumption.
  A projection that renders no step list at all (a single-step recipe, or any non-`simple` mode) is covered by the same rule, because its displayed step is read-only whenever it is not the active step.
- A step's requirement block is also read-only while its **time gate is armed** — an in-progress timed step whose availability time has not been reached.
  That step's consumption is already committed, so offering a selection would misrepresent what the craft will spend.
- The projection is presentation-only and is never the enforcement point: the engine remains authoritative and drops any player allocation whose step does not match the step it actually resolved, because the displayed index can move between render and click (a time gate maturing on a world-time tick, or another owner advancing the run).
- A fully revealed timed implicit recipe projects its positive authored
  `timeRequirement` as `RecipeListingModel.duration`.
  For a fully revealed `simple` recipe with more than one execution step, each
  `steps[]` entry projects that step's positive authored requirement as `duration`,
  and `RecipeListingModel.duration` is the field-wise sum of the five authored
  fields (`minutes`, `hours`, `days`, `months`, and `years`).
  The projection preserves authored units and does not perform calendar-dependent
  conversion.
  Missing, non-positive, and instant durations project as `null`.
- When `requirements.time.enabled === false`, recipe and step durations project as
  `null`, because crafting resolves immediately even when preserved authoring still
  contains time requirements.
  A Discovery-Mode teaser always exposes `duration: null` and `steps: []`, so timing
  cannot leak through either the aggregate or a step.
- In `simple` mode the listing's top-level expected output (`result`) is resolved from the recipe's **terminal** execution step's result groups (against that step's own set), so a multi-step recipe's PRODUCES is its final product rather than the first step's intermediate output.
  Single-step recipes are unaffected (their only step is both first and terminal).
  `routedByCheck` continues to emit an empty top-level `result` (its output is per outcome tier); `routedByIngredients` and `progressive` multi-step PRODUCES is unchanged and must not be mis-routed.
- The crafting-check descriptor is not surfaced (the projection yields `null`) when the mode's check is optional, has no authored roll formula, and checks are not enabled (`craftingCheck.enabled !== true` and `features.craftingChecks !== true`).
  A mandatory-by-mode check, an authored formula, or an enabled-but-unformulated check still surface (the last keeps the "no roll formula configured" GM misconfiguration note).

##### Progressive Stage List

This section governs **every ordered-stage surface**, not crafting alone: the progressive recipe body and the progressive **salvage** body in the Inventory tab's salvage panel (§Player Salvage Surface) render the same component under the same invariants.
Where a requirement says "recipe", read it as "the progressive subject" — a recipe or a salvageable component.
The salvage deltas are stated at the end of this section; everything else applies identically to both.

- A progressive recipe's detail body renders an **ordered stage list**, replacing the generic input/output table: a progressive output is not a flat set, because one roll is spent down the list and the order decides what the player receives.
- The stage list is built from the **authored** result group and deliberately bypasses the award loop.
  Browsing has no roll, so routing it through the award loop yields a zero budget, awards nothing, and renders an empty output list.
- Each row carries: its **ordinal** (the row's position, not the stage's identity), the component **name** and **image**, a **read-only difficulty**, and the **cumulative threshold** at which the stage is reached.
- The cumulative threshold is the player's decision input: per-stage difficulty alone forces the player to do the arithmetic and redo it after every move.
- The threshold is **derived from the award mode**, not a running sum of difficulties.
  A running sum is correct only for `equal`; `exceed` gates on a strict comparison and sits one above each cumulative sum, and `partial` awards a tail result whenever any budget remains, making its final stage reachable _below_ its cumulative sum.
- A stage the award loop skips (an invalid or absent difficulty) is reached at **no** budget, so its threshold is **omitted** rather than shown as zero or as a running total.
  Such a stage must not advance the cumulative total for later stages.
- The displayed threshold and the awarded result MUST agree with the award loop for every award mode and every budget.
- Stages are shown in the **player's** order (see `resolution-modes` §Player Reorder), reconciled against the authored list.
- When the permission is true the rows are reorderable by **drag** and by **keyboard**: per-row Move up / Move down buttons, disabled at the ends, whose accessible name names the stage they move, with the new position announced through an `aria-live="polite"` region.
  Drag is a mouse-only enhancement — HTML5 drag does not fire on touch, so the move buttons are the only touch path and must meet the touch-target size.
- The announcement names the stage that MOVED, read before the move is applied, and is a single localized string carrying name, position and total (never assembled from fragments).
- Reorder writes are **debounced** and committed on settle, not per intermediate move, because each write is a replicated document write.
- If a write **fails**, the rows revert to the last persisted order and the revert is announced through the **same** `aria-live` region.
  A notification alone is insufficient: the writes are optimistic, so the row has already moved and already announced, and a keyboard user reordering by chevron may never see a toast — leaving the player believing an order that was never stored.
- When the permission is `false` the rows keep their ordinal and difficulty but **drop the grip glyph** (the grip is the affordance signal), use a default cursor, attach **no** drag handlers, and show one muted line explaining that the GM set the order.
  No live region is rendered in this state, because nothing can change.
  Identical rows minus working affordances are not acceptable: a player must not be able to grab a row and have nothing happen.
- A Discovery-Mode teaser MUST NOT surface any stage data (see §Browse Status): the stage list is redacted exactly as `result` and `outcomeTiers` are.

**Optional per-caller extensions.**
The extension set is exactly four, all **opt-in and default-off**: an optional per-stage **state chip**, an optional **fixed-state note** overriding the explanation shown when reordering is unavailable, an optional **stacked row layout**, and an optional per-stage **complication strip**.
**All four ship.**
The strip's opt-in is a **tense token** — `off` by default, else `forecast` or `resolved` — and never a caller-supplied snippet, and that spelling is normative rather than incidental: a snippet is defined in the CALLER, so two bodies passing "the same" strip would be two copies of its markup, which is exactly the duplication this shared section exists to prevent.
A token is sufficient because nothing about the strip varies per caller except the tense, and the tense is the one thing the row data cannot say for itself: an un-fired complication looks identical before a roll and after one that spared it.
(The per-stage **quantity** opt-in was deleted, not defaulted off: no stage renders a quantity on either surface, consistent with the "result entries carry no quantity" rule.)
A caller that passes none MUST get the crafting rendering unchanged; the presence of the DATA is never the switch, only the caller's opt-in.
This exists so a second consumer can add rendering without re-skinning the first.
The fixed-state note is overridable because `canReorder: false` has **two** causes the component cannot distinguish: the GM pinned the order (the permission is off), or the player's order has already been **spent** by a resolved roll.
Defaulting to the GM reason keeps the crafting rendering unchanged, since there it is the only cause; a caller with a second cause MUST supply the note, or the surface asserts something untrue about the roll that just happened.
The GM reason takes precedence where both apply — it stays true whether or not a roll has since been spent.
The set is enumerated deliberately: a future extension is added to this list, so "not listed" means "not supported", not "not yet noticed".

The **stacked row layout** exists because the default inline row lays every part on one line and lets only the name flex, so the name absorbs every other part's width.
In a narrow column (the player inspector's 300px) that measures a **zero-width name** and overflows the trailing controls out of the panel — the row does not degrade gracefully, it fails.
Stacked, the reorder controls **lead** the row and the stage's identity is a flexible **column** (the name in one wrapping text flow, its number beneath), so the name wraps instead of being crushed.
Every progressive surface, stacked rows included, shows **both** the component's progressive DC ("DC N") and the cumulative threshold ("Reach ≥N"), per the issue #675 ruling and matching `resolution-modes` §Progressive Mode Semantics.
The "DC N" value is `component.difficulty`, which the GM authors via the stepper titled "This component's Progressive DC"; the **check-level** DC remains nonexistent (the projection resolves it to null, and a component's `dcOverride` does not shift these thresholds).

**The per-stage complication strip.**

`ProgressiveStageList.svelte` takes it as `complications`, the tense token named above, and BOTH shipped bodies pass it: the crafting body passes `forecast` always, and the salvage body passes `resolved` once its run has resolved and `forecast` before that.
Crafting can pass nothing else, because the fired record lives on the salvage run record and the immediate crafting path writes none.
It is stated here, in the same section that owns the extension contract, because the projection the strip reads (`forecastComplications`) is shared with the GM authoring surface that fills it, and a strip specified anywhere else would be specified away from the enumeration rule it has to obey.

The strip renders a component's complications inside its own stage row, and it is a DEFAULT-OFF extension of this shared section rather than a second body: a surface that passes nothing renders exactly as it did before the strip existed, and both bodies pass it so neither gets a private copy of the treatment.

**The data is published on the stage row, and the strip MUST NOT re-derive any of it.**
Both progressive read-models attach the player projection to the stage rows they already publish — `InventoryListingBuilder._buildSalvage` for salvage and `CraftingListingBuilder._buildProgressiveStages` for crafting — through the one shared `attachStageComplications` helper, so the audience filter, the activity gate and the could-never-fire exclusion are all decided builder-side against the same records the engine fires from.
A component that authors no player-visible complication for that activity leaves the stage row carrying no such key at all, and the row is byte-identical to the one published before this feature existed; the presence of the DATA is still never the switch, only the caller's opt-in.
The projection is attached TO the row rather than published beside it because the player's reorder is applied downstream of the builder, and a parallel list keyed by result id would desynchronise at exactly that point.
Marking the fired tense onto an already-attached list is the paired `markFiredStageComplications`, which only ever MARKS what the forecast already published and can therefore never surface a record the forecast withheld.

- The strip has **two tenses**, and one filter cannot serve both.
  Before any roll it is a **forecast** — the `visibility: 'visible'` complications this component COULD fire in this activity, read from the player forecast projection, with no roll and no run.
  After a resolution it additionally marks which of them **fired**.
- The forecast EXCLUDES a complication that provably cannot fire — one with no enabled clause, and one whose only enabled clause names a check trigger the projected activity's check block does not own — so a count of what could go wrong is not a lie.
- The fired state is read from the resolution's recorded fired list and is **never re-derived from a stage's missed state**: `match` and the condition roll mean a short stage need not have fired anything, so deriving "fired" from "missed" asserts something untrue about the roll.
- Under the runless invariant — no run record — **no strip claims fired**, matching the surrounding rule that a body with no run must not invent one and claim every stage fell short.
- The fired badge lands on the OCCURRENCE the fired record names, and on none of that component's other occurrences, because the record is keyed per stage result id while a row's state chip reconciles per component id.
- Neither projection may carry `when`, `rollCondition`, `effectRoll` or `macroUuid`: a player must not be shown the trigger, and the macro is not theirs to know about.
- A stage with several applicable complications renders the FIRST in fire order plus a "+N more" affordance.
  The inspector column is 300px wide — the documented reason the stacked layout exists — and an unbounded list turns one row into several prose paragraphs.
- A stage that is both awarded AND fired renders its success state chip **and** the fired band together, the band reading as a consequence of the award rather than a contradiction of it.
- The strip is a full-bleed band INSIDE the row, so the row becomes a column with today's line wrapped.
  **That row-structure flip is gated on the strip rendering CONTENT for that stage, not on the extension being passed.**
  Both bodies pass it, so a presence gate would re-skin every progressive stage row in every world — including the overwhelming majority that author no complications at all — which is precisely the failure this section's opt-in rule exists to prevent.
- The band is explicitly NOT draggable.
  Pre-roll, which is the forecast state the strip exists for, the salvage list is reorderable and the row is a drag source, so a mousedown-drag inside the prose would start a drag rather than a text selection.
- The strip's placement is deliberately ASYMMETRIC between the player and GM surfaces and MUST NOT be "unified": it is a band inside the row on the player side, while on the GM side the Component Studio's salvage strip is a tucked sibling OUTSIDE the row and the Recipe Studio's sits inside the stage card (§Component Studio requirement 16).
- **The tense is carried by the row's BADGE and the band's TONE, and never by the severity tile.**
  Severity is one vocabulary across all six complication call sites, and a tile recoloured by tense would make one control say two things — a `severe` complication that has not fired and a `minor` one that has would be indistinguishable at a glance, which is the opposite of what a severity ramp is for.
  The band's own fill and top rule change with the tense; the tile does not.
- **The badge's copy is tensed, and a resolved stage does not still forecast.**
  Before a resolution the badge reads in the future tense ("this can go wrong"); after one, a complication that did NOT fire reads a past-tense negative.
  A row that still says "this can go wrong" beneath a spent roll asserts something that is no longer true, and the player has no way to tell it from a row that is genuinely still pending.
  The design prototype does say it — its `fired` flag is derived from a stage being short, so a recovered stage keeps its forecast copy — and this rule deliberately overrides it.
- **The player row renders the authored DESCRIPTION, and it WRAPS.**
  The GM strips clip their generated trigger sentence to one line so the row height cannot move under a long authored condition, and that is right for a GM reading a list of things they wrote.
  It is wrong here: the description is the whole of what this surface discloses, and an ellipsis at roughly sixty characters in a 300px column removes the disclosure the strip exists to make.
  It wraps, clamped to a bounded number of lines so the row height stays predictable, with the full string still reachable.
- **The band is not a drag source and carries no destructive or navigational control.**
  Pre-roll the salvage list is reorderable and the row IS a drag source, so a mousedown inside the prose would start a drag rather than a text selection.
  It also carries no per-complication link: a complication belongs to the component the row already names, and a player has nowhere to be sent.
- **The progressive CRAFTING surface is forecast-only.** The fired record is defined on the salvage run record, and crafting has no run record on the immediate path; inventing a second carrier for it is out of scope here.

**Progressive salvage deltas.**

- The award mode is **salvage's own** (`system.salvageCraftingCheck.progressive.awardMode`), authored independently of the recipe's.
  Deriving salvage thresholds from the crafting award mode violates the agreement requirement above invisibly, because both blocks normally exist and are normally authored.
- The permission is `Component.salvage.allowPlayerResultReorder` (default true; only an explicit `false` pins the authored order), not the recipe's.
- The player's order is stored under the `salvage:<componentId>` key (see `resolution-modes` §Which user's order is read).
- A pending debounced write MUST be **flushed before a salvage run starts**, and a **rejected** write MUST abort the run: an unflushed write is captured stale onto the run record, and a rejected one leaves the player looking at an order that was reverted.
- Salvage renders **no exclude affordance**: reorder is the whole of the feature.
  That holds for the complication surfaces too: no player progressive surface offers a per-stage exclude toggle, an excluded-results list or a hidden-result note.
  Exclusion would contradict the reconciliation guarantee that a result is never dropped, so the vocabulary is not built rather than built and disabled.
- The panel MUST state the mode and the flow **rule** as two separate statements: naming the mode ("progressive, ordered") does not tell a player that the roll **stops** at the first result it cannot reach, and stopping is the entire reason the order is worth arranging.
  Neither is a duplicate of the other, and collapsing them loses the mechanic rather than a repetition.
- Where reordering is permitted, the surface MUST offer a **reset** to the GM's authored order.
  An order the player can rearrange is one they can get lost in, and the authored order is the only one they cannot reconstruct from what is on screen.
  Reset persists **no preference** (an empty order), never the currently-authored ids: an empty order follows a later GM re-author, whereas pinning today's ids would silently outlive the GM changing them.
  It is offered only when the rendered order actually **differs** from the authored one — a stored order can name the authored sequence exactly, so a reset offered on the mere presence of stored state does nothing when pressed.

##### Browse Status

- Each projected recipe carries exactly one `browseStatus` from the vocabulary:
  `available`, `locked`, `unknown`, `exhausted`, `missingMaterials`, `discovery`.
- `discovery` is the Discovery-Mode redacted state for an undiscovered recipe (a
  player-facing "Undiscovered" badge).
- `incomplete` is intentionally NOT a player badge: a recipe is either visible
  (and projected) or filtered out, so a player never sees an "incomplete"
  authoring state.
- Status precedence (highest first): Discovery-Mode teaser → `discovery`, locked →
  `locked`, unlearned knowledge → `unknown`, recipe-item uses exhausted →
  `exhausted`, materials missing → `missingMaterials`, otherwise `available`.

##### Discovery-Mode Redaction

- When `listMode === 'teaser'` and an undiscovered recipe is shown to a non-GM
  viewer (`access.reason === 'teaser'`), the builder redacts every field named in
  `teaserState.hiddenFields` (default `['ingredients', 'results', 'description']`).
- A redacted recipe surfaces only a generic name/image and the `discovery` status;
  no ingredient, result, or check detail is computed or leaked.
- A GM bypasses redaction and sees the full recipe.
- The "exhausted" status uses the read-only
  `RecipeVisibilityService.isKnowledgeItemExhausted` probe, which agrees with what
  the engine would refuse to consume (item-limited knowledge owned but every
  matching item at its `maxUses` cap); owning no matching item is `unknown`, not
  `exhausted`.

##### Per-Set Craftability

- Each ingredient set carries its own `craftability`, evaluated against just that
  set rather than the recipe-wide satisfiable set.
- A set's craftability folds in its essence requirements, its **per-set** Tool
  requirements (Tools are per-set, not recipe-global), and the actor-bound
  currency probe, reusing the recipe manager's `evaluateCraftability` per-set pass.
- A set's craftability also carries an `essencePool` describing the shared essence
  funding for that set: `requirements` (per essence group — `groupId`, `essenceId`,
  name, icon, `colorToken`, `need`, `delivered`, `owned`, `satisfied`), `carriers`
  (per held item — `itemKey`, `componentId`, name, image, `ownedUnits`,
  `allocatedUnits`, `perUnit`), the resolved `allocation`, its `totals`, and the
  `suggested` allocation.
- `carriers[].ownedUnits` is the units remaining AFTER the set's non-essence
  consumption plan has claimed, derived from the resolver's own ledger.
  No UI or helper re-reads the item's stack count at the configured
  stack-quantity path to compute it: that field is game-system-specific and can
  be absent or `NaN`, and a raw stack count would offer the player units the
  craft cannot spend.
- `requirements[].delivered` and `requirements[].owned` are named apart
  deliberately.
  `delivered` is the essence amount the resolved allocation supplies to that
  requirement — the tile's numerator — while `owned` is the essence amount held
  across every matching carrier.
  In this projection and the rail it feeds, neither is reported as the
  component/tag `have`, which is not net of plan and would read off a different
  denominator in a rail whose invariant is that the tiles show what the craft
  consumes.
  The session shopping aggregation is the one deliberate exception, for a reason
  that does not apply here (see §Shopping List Panel).
  An essence requirement's own ingredient state carries `delivered` for the same
  reason and by the same rule.
  The key is renamed rather than aliased: leaving it named `have` while changing
  what it means would re-create the ambiguity inside a single array, where a
  component/tag entry's `have` and an essence entry's would answer different
  questions under one name.
- `essencePool` is `null` when the crafting system has essences disabled, matching
  the existing per-set essence-state projection.

##### Check Descriptor

- The `check` descriptor is optional for `simple` and `routedByIngredients` modes
  and mandatory for `routedByCheck` and `progressive` modes.
- It is `null` when the system configures no check block for the recipe's mode.
- `usable` is derived from an authored, non-empty `rollFormula` — NOT the legacy
  `enabled` flag.

##### Outcome Tiers

- `outcomeTiers` is populated ONLY for `routedByCheck` mode and is `null` for
  every other mode.
- Each tier carries its `awardedResults`, resolved through the resolution-mode
  service so success-only routing, the single-result-group exemption, and the
  `checkOutcomeIds → name-match → unrouted` precedence are honoured identically to
  a real attempt.
- A failure tier (`success === false`) never routes and awards nothing (empty
  `awardedResults`).

#### Recipe List

- A search box plus the favourites-only, craftable-only, crafting-system, and
  category filter controls narrow the list.
- Each row shows a neutral category badge for non-`general` categories, in both the
  normal and the uncraftable row layouts.
- The badge is suppressed for `general` recipes so the default bucket is not tagged
  with a redundant "General" chip; its text is the localized/verbatim `categoryLabel`,
  never the raw token.
- A single-level category filter dropdown sits above the crafting-system filter.
- The category dropdown is client-local browse state with an "All categories"
  default; its options are the distinct categories present in the player's visible
  recipes, sorted non-`general` A→Z with "General" pinned last.
- Category grouping headers and nested/expandable category folders are explicitly
  deferred follow-ups; this first cut ships the badge and filter only.
- Row status badges from `recipe-visibility/spec.md` evaluation, drawn from the `browseStatus`
  vocabulary:
  - Available
  - Locked
  - Unknown or missing knowledge
  - Exhausted recipe item uses
  - Missing materials
  - Undiscovered (Discovery-Mode teaser-redacted recipe)

#### Recipe Detail

- The detail body is keyed on the recipe's `modeToken` (simple,
  routedByIngredients, routedByCheck, progressive), so each resolution mode renders
  its own body (ingredient sets, routed-by-check outcome-tier table, progressive
  body, etc.).
- Show the `modeLabel` rather than the raw mode token.
- Before crafting begins, the detail header visibly shows a fully revealed timed
  implicit recipe as localized `Duration: <value>`.
  A fully revealed `simple` multi-step recipe instead shows the aggregate once as
  localized `Total duration: <value>`, while every timed ordered step shows its
  compact duration in a non-shrinking clock chip at the end of the label row.
  Instant recipes and steps, time-feature-disabled systems, and Discovery-Mode
  teasers show no duration value.
- Show an ingredient-set selector when the recipe has more than one set; the
  detail reflects the chosen set's per-set craftability.
- Show the `check` descriptor (DC / skill / roll formula) when present, marking it
  optional or mandatory per mode and unusable when no roll formula is authored.
- Show the outcome-tier table for `routedByCheck` recipes, with each tier's
  awarded results (success tiers only).
- Show blocking reasons when not craftable (derived from `browseStatus`).
- Essence requirements use the GM-authored `EssenceDefinition.icon` after canonical icon normalization for legacy set-level requirements, first-class essence ingredient tiles, and essence choices within mixed alternatives.
  Missing or unusable icons use `DEFAULT_ESSENCE_ICON`.
  An essence's authored `EssenceDefinition.colorToken` additionally tints its glyph and its pool bar through the shared `--fab-tag-*` palette, and a `null` or unrecognized token falls back to the theme accent — which is what every essence renders as today, so an unauthored system is unchanged.
  The tint is scoped to the glyph and the bar; label text keeps the standard body/muted text colours, so an authored colour can never reduce label contrast.
  Non-essence images and the existing accessible labels and selection semantics remain unchanged.
- A component or tag requirement tile treats Foundry's generic `icons/svg/item-bag.svg` sentinel as "no image" and renders the tile's fallback glyph, never the bag itself.
  The sentinel reaches a tile two ways — a tag requirement with nothing matching in inventory has no item to read an image from, and a matched item may carry the bag literal as its own `img` — and both resolve to the glyph.
  It never falls back to `DEFAULT_RECIPE_IMAGE`: the blueprint is the _recipe's_ fallback (see `data-models` §Recipe requirement 16) and is not a material's fallback.
  The recipe-image chokepoints and the tool-state image path keep their existing fallbacks unchanged.
- (No learn action on the Crafting tab: recipe learning is wired through the Inventory surface only — see §Books & Scrolls learning.)

##### Requirement Rail

- A set's fixed, choice and essence requirements render in ONE rail of uniform slot tiles, replacing the separate image grid, the stacked alternatives picker, and the essence list.
  Three disconnected surfaces cannot tell a player which requirement still needs attention, which is the whole job of this area.
- Every slot carries one of three states — **met**, **partial**, **short** — because a two-state surface renders an untouched choice and a genuinely unaffordable one identically, and marks a half-filled essence as an error.
  A fixed requirement is met at or above its need and short below it; an unchosen choice slot is **partial** (a to-do, never an error); a chosen choice slot is met or short on its own numbers; an essence requirement is short at zero delivered, partial while partly delivered, and met when fully delivered.
- At most ONE chooser is open at a time; the open slot is the rail's single point of interaction.
- Focus auto-advances to the first unsatisfied slot until the player opens a slot themselves, after which the player's choice sticks.
  The remembered slot is re-validated on every read against the live slot list, falling back to the first unsatisfied slot and then to the first slot, so changing set, step or recipe can never leave a stale or absent chooser open.
  Clicking the open slot's tile again closes the chooser instead of reopening it, and the closed choice is remembered the same scoped way: it stays closed until the player opens a slot again (including re-clicking the same tile), while changing set, step or recipe re-derives the default open slot as before.
- Auto-advance never steals focus, and it announces through its **own** live region rather than the progressive stage list's reorder region, because a progressive recipe renders both surfaces at once.
- The rail is a **disclosure**, not a tablist: fixed slots are not selectable, so tab semantics would promise a selection the surface does not offer.
  A choice or essence slot is a `<button>` carrying `aria-expanded` and `aria-controls` over the whole tile column, and the panel it opens is labelled back at its tile.
  That panel is itself an exposed named `role="region"`, because `aria-labelledby` on a roleless element exposes nothing to assistive technology.
  A fixed slot is `role="img"` with a label, because an `aria-label` on a non-focusable span exposes nothing.
- Open state is drawn as an accent-soft fill plus a caption line, never as an accent ring: the app already paints an accent ring for `:focus-visible`, so a ring would make "focused" and "open" indistinguishable to a keyboard user.
  Open state and satisfaction are independent, so the open treatment sits on top of the status border rather than replacing it.
- "Pick for me" fills the set's unmade choices and suggests an essence allocation.
  It lives in the rail header, scoped to the rail, rather than in the app footer: the rail renders inside step and routed bodies while Craft sits in a fixed footer outside the scrolling body.
  On an infeasible inventory it returns the best partial suggestion and an honest shortfall rather than throwing or looping.
- Every rail control is keyboard-operable and named for assistive technology, and bar transitions honour `prefers-reduced-motion`.

##### Essence Pool and Consumption Plan

- A set's essence requirements are funded from one shared, player-editable **essence pool**, scoped to a single ingredient set on a single step, because that is the granularity at which the engine consumes.
- Each carrier row offers a keyboard-operable stepper allocating units of one held item to the pool, and the allocation the player sees is exactly what the craft consumes.
- A carrier's allocatable maximum is its `ownedUnits` — the units left AFTER the set's non-essence plan has claimed — never the raw stack quantity, so the stepper cannot allocate the player into an infeasible state.
- A requirement's ratio reports `delivered / need` as essence amounts, so a satisfied requirement reads exactly `need / need` rather than the whole matching inventory.
  Unit-granular overshoot is visible in the per-carrier allocation, never in a requirement's ratio.
- The **consumption-plan panel** states what the craft will spend before it is spent: one row per planned item with the quantity that item contributes, plus a pending line naming the requirements still to choose.
  That "still to choose" list is joined with the platform list formatter rather than an authored separator key, so the join is correct in every locale.
- Legacy set-level essence requirements (`IngredientSet.essences`) are threshold-only and never consumed, so they cannot enter the pool.
  They keep their existing requirement-row presentation.

#### Shopping List Panel

- Session-scoped aggregation of materials needed for queued recipes.
- Shown only on the Crafting tab.
- Essence shortages from first-class ingredient states and legacy set-level essence states retain the first nonblank GM-authored icon across aggregation.
  Later blank values do not erase it.
  Render-time canonical normalization uses `DEFAULT_ESSENCE_ICON` when the retained value is missing or unusable, without changing need/have totals.
- The aggregation shops an essence requirement against the amount **held**, not the amount the plan delivers: `RecipeManager.evaluateShoppingRequirement` deliberately restates an essence state's `owned` as the `have` it aggregates on.
  This is the one place `owned` is reported as `have` (see §Per-Set Craftability), because `delivered` is capped at `need` and a shortage shopped against it would always read satisfied.

#### Right Rail (Run Summary or Shopping List)

- The right rail is a single keyed body that shows exactly one of two panels for
  the current selection.
- It shows the **Run Summary** when the selection has an active or just-completed
  crafting run — in this iteration, a craft outcome recorded for the selection in
  session state and not yet dismissed; otherwise it shows the **Shopping List**.
- The Run Summary is **self-contained**: it surfaces the latest outcome and hosts
  the multi-step **advance** action for the same recipe (advancing the active step
  of a progressive run, time-gated), plus a keyboard- and pointer-accessible Back
  affordance that returns the rail to the Shopping List without losing the recorded
  outcome.
- Advancing re-invokes the craft seam for the same recipe and ingredient set (it
  carries no separate run id; the engine advances the active step).
- The unified player-facing Journal screen (see _Journal App_) is the cross-activity
  home for monitoring and advancing these runs; a direct cross-link from the Run
  Summary into the Journal is a deferred follow-up.

### Alchemy Tab

The player Alchemy tab is an IMPLEMENTED route (it replaced the earlier `{:else}` "Coming soon" placeholder in `FabricateAppRoot.svelte`).
Its content mounts inside `.fabricate-app-content` — the shell's 84px nav rail is NOT part of this grid — so the content is a **three-column** layout `known . workbench . inventory` mirroring the Crafting/Gathering views.
The sides are compressible (`minmax(230px,280px)` each) with a floored, growable centre (`minmax(340px,1fr)`) so the 340px workbench floor coexists with the 1024px minimum window; its named container stacks at the shared `@container fabricate-alchemy (max-width: 960px)` breakpoint with the **workbench leading** the stacked order.
It uses `--fab-*` design tokens only (no hex — see the theme-colour contract).

The additional component-sources bar (`ComponentSourcesBar`) renders in the shared top bar on the alchemy tab (`ActorSelectTopBar` `showSourcesBar` includes `activeTab === "alchemy"`), so a player can pull components from other actors; the discipline block (system name + Switch) sits ABOVE the "Known recipes" heading, stacked (name on its own line, Switch below).

The a11y contract: the status pill is `aria-live="polite"`; the bench chip body is a focusable `role="button"` (Enter/Space add one; Shift+Enter removes one), the chip `−` (remove-one) and `×` (remove-all) are real focusable `<button>`s that `stopPropagation` so they never also add, and the palette `+` add is a real focusable `<button>` (drag is mouse-only, so the keyboard add is the required parity affordance); unavailable inventory rows carry the `disabled` attribute; the drop zone has an accessible name/role plus a non-color dragover cue (a thicker dashed border); chooser cards and "Switch discipline" are real buttons; on Switch, focus moves to the chooser heading; the ready-state `brewpulse` animation honors `prefers-reduced-motion`.

#### Alchemy System Selector

- Shown only when multiple alchemy-mode systems exist; a chooser card per system carries `N known . M total` and an Enter action, and a "Switch discipline" button (shown only with more than one system) returns to the chooser and resets the per-selection workbench state.
- `N known` counts REVEALED recipes (per `recipe-visibility`), threading `componentSourceActors` into the summary so it matches the panel for item/Manual modes, not learned-only.
- Auto-enters if exactly one alchemy system is available.
- Persisted in the `fabricate.lastAlchemySystem` client setting.

#### Component Palette

- Grid of all components in selected alchemy system owned by component source actor(s).
- A name-search input filters the list, with a distinct filtered-empty "no matches" state separate from the onboarding "no components owned" state.
- Shows: image, name, available quantity (inventory minus workbench count), and — when the system has essences enabled and the component carries essences — the component's essence icons + per-unit counts.
- A visible per-row `fa-grip-*` drag handle (`aria-hidden`, inside the row button) signals draggability; drag stays mouse-only while the row's `+` add stays keyboard-reachable.
- Zero-quantity components remain visible but visually distinguished.
- Left-click: add one to workbench.
- Drag-drop from external sources remains supported.

#### The Workbench

- Session-scoped working set displayed as compact grid with quantity badges (e.g., "Iron Ore x3"); a placed component's essence icons + counts show on its chip.
- Each unique component appears once; adding increments the badge count.
- Chip interactions: the chip body adds one (left-click / Enter / Space); a right-click, Shift+Enter, or the focus/hover `−` control removes one; the `×` control removes all (delete the key).
  The `−` and `×` `stopPropagation` so they never also add.
- Supports: add from palette, add/remove/remove-all on a chip, clear all, submit.
- Submit triggers signature matching per existing Signature Resolution rules in `resolution-modes/spec.md`.
- The Produces preview surfaces the result component's essence icons + counts when essences are enabled.
- Drives the **five-mode status model** (`empty` / `assembling` / `ready` / `untried` / `no-reaction`, per `resolution-modes`) governing the status pill, Produces panel, and Brew button; client mode is advisory and fails safe to `untried` for any non-concrete signature (the engine is authoritative on brew).
- A brew-in-flight busy/disabled guard on Brew prevents double-submit (mirrors CraftingView's `busy` guard).

#### Discovered Recipes Panel

- Always visible on the left, with an onboarding zero-revealed empty state when nothing has been revealed and a distinct filtered "no matches" state when a search hides every revealed recipe.
- Shows recipes the viewer has **REVEALED** (per `recipe-visibility` — learned-by-brew ∪ the mode's reveal source), not learned-only (GM sees all, consistent with GM-sees-all).
- Searchable by recipe name.
- Selecting a revealed recipe **auto-loads** its signature onto the bench (a selection side effect, not a per-recipe button), scoped to recipes reducible to a concrete plain-component multiset.
- The "Craftable only" filter is DEFERRED this iteration.
- The non-revealed-recipe **count** (`valid − revealed`, never names/results/signatures) is shown in a footer.
- Visibility and learning semantics defined in `recipe-visibility/spec.md`.

#### Active Runs and History (cross-reference reconciliation)

- The alchemy tab does NOT host runs or history.
  Run monitoring remains a Journal concern (see _Journal App_); the tab's internal fizzle dead-end memory is not run history.
- The unified Journal screen surfaces alchemy runs alongside crafting, gathering, and salvage runs; an alchemy run is redacted there for a viewer who has not discovered its recipe.
- Forward-compat: the active station-tool chip stays in `ActorSelectTopBar` this iteration (the alchemy tab has no header/context bar yet); it migrates to an alchemy header bar if/when one is added.

#### Excluded from Alchemy Tab

- Shopping list
- Recipe browse list
- Favourites

### Alchemy Attempt Feedback

- Must not leak hidden recipe metadata on invalid combinations or failed attempts.
- An untried bench and a remembered-fizzle bench are distinguished ONLY by the per-character dead-end memory: an untried set reads `untried` (no confirmation that a reaction exists), and only a remembered fizzle reads `no-reaction`.
  A fizzle brew runs no check and shows no roll animation.
- No-signature attempts are shown as failed attempts with specific feedback and ingredient consumption per `alchemy.consumeOnFail`.
- If a matched attempt cannot route to a valid result group, show a misconfiguration error state (GM fix required) rather than a normal player-failure outcome.

### Learn Flow

- Confirmation dialogue when learn consumes item.
- Success/failure notifications with actionable reasons.
- Refresh list/detail state after completion.
- The learning flow is invoked from the Inventory surface (the book detail's learn affordances → `game.fabricate.learnRecipeFromInventory`); the former item-sheet header learn control was removed (issue #511, `ItemSheetRecipeLearnControl.js` deleted).

### Inventory Tab

The player's owned crafting materials: what they carry, where it came from, and what it is for.
It shares the selected character and the component-source actors with the Crafting tab, so both agree on what the player owns.

- **Layout.**
  Two responsive columns — filters + item grid on the left, an item inspector on the right — reflowing to **stacked** below the container breakpoint.
  The window is resizable, so a fixed column count is not the contract: the grid is responsive and its column count is an expression of the available width.
- **Filter chips.**
  A chip row in this fixed order: **All · Components · Essences · Tools · Books & Scrolls**.
  Each chip carries an icon and a live count computed over the search-filtered set, so a chip's badge reflects what selecting it would show.
  **Components** lists component cards only: a card present **solely** because it is a registered Tool appears under **Tools** and NOT under **Components**, while a component that is also a tool appears under **both**.
- **Sort.**
  Name / Quantity / **Type**.
- **Card contract.**
  Each item card is a **square thumbnail** carrying every at-a-glance signal, with the item name beneath.
  Every overlay sits **inside** the thumbnail's bounds and above it — not hanging off the card frame:
  - a **quantity pip**;
  - **corner badges**: a **recycle** badge when the item is salvageable, and a **wrench** badge when it is a registered tool.
    These two flags are **orthogonal** — a component can be both, and a broken salvageable tool is a common case — so they MUST NOT share one slot.
  - **essence pips**: one chip per essence the component carries, rendering the essence's **own authored icon**.
    Essences are GM-authored per system with their own icon; a fixed icon set, or a hue keyed on an essence's name, silently mis-renders any essence the GM named differently.
    The chip exists so the glyph reads against arbitrary artwork.
- **Row kinds, and what "owned" means.**
  The listing projects component rows, essence rows, Books & Scrolls rows, **and tool rows**.
  A **tool row** is emitted for an owned document that resolves to a first-class library Tool of a system and to **no component of that same system**.
  Tool identity resolves through the shared WIDE tool presence matcher defined in `data-models/spec.md` `## Tool` requirement 12 — durable `roles[systemId].toolId`, then the Tool's own source references, then its snapshot-name fallback — and **never** through `tool.componentId`.
  It MUST be the wide presence matcher rather than the narrow durable-identity gate, so the inventory and the crafting tool gate can never disagree about what the player is carrying.
  A component-only projection lists nothing at all for an owned item-sourced Tool, which carries `componentId: null` by construction; that was the shipped 1.8.0 behaviour, and it made every Tool authored in the Tool Studio invisible to its owner (issue 1119).
  A system with Tools and **zero** Components still lists its owned tools.
  A tool row's name, image and description resolve by the single precedence in `data-models/spec.md` `## Tool` requirement 13, with the generic `icons/svg/item-bag.svg` sentinel projected as **no image** so an unarted tool inherits the same default artwork an unarted component shows.
  A tool is never consumed, produced, salvaged or essence-bearing **in its tool role**, so a tool-only row carries no salvage surface, no essences, no used-by and no produced-by.
- **One card per unified physical stack.**
  The listing renders **one card per unified physical stack**, not one per crafting system.
  A physical document that backs a component in **N crafting systems** appears **once**, with its quantity counted **once** — a per-system card duplicated the same stack and let the player read N× the true count, and salvaging one card silently consumed the sibling's documents.
  The projection **aggregates then collapses**: each system contributes today's within-system aggregate of a component across every owned document and source actor (a **participation**), then participations whose **contributing-document identity sets intersect** collapse into one card, and `totalQuantity` / `sources` are computed over the **union** of the card's contributing documents **deduped by identity** (a document participating in two systems counts its stack quantity once) and summed per source actor.
  Document identity for this dedup and join is **`item.uuid` alone** — never a compendium/duplicate-source union: `_stats.compendiumSource` and the transitive `_stats.duplicateSource` are shared across **distinct** documents (Foundry stamps a fresh `duplicateSource` on every drag-to-actor), so keying on them would merge two genuinely-owned stacks and undercount real holdings (`getItemIdentityReferences` is the codebase's precedent for excluding `duplicateSource` from identity; see `data-models/spec.md` for the `roles`-map component identity these participations resolve through).
  This **adds** cross-system unification and does **not** disturb today's same-component aggregation: distinct documents (across stacks or source actors) that resolve to the **same** component still aggregate into one summed card, and distinct documents that resolve to **different** components — even when they share a compendium/duplicate-source template — stay **distinct** cards.
  The card's at-a-glance signals (salvageable, tool, essence pips) are the **union** across participations, essence pips **deduped by essence id**.
  `broken` is a **singular** physical property of the document(s), never per system.
  Essence rows (synthetic per-system aggregates keyed `essence:<systemId>:<essenceId>`) and Books & Scrolls rows are legitimately distinct per system and are **NOT** collapsed by this behaviour.
  A Tool contributes a **participation** on the same terms as a component, so a document that is **both** a managed component and a registered Tool (a whetstone) yields exactly **one** card — its component card, badged as a tool — and exactly **one** `systems[]` entry for that system, never two.
  Within one system a tool match on a document already backed by a component participation **folds into** that participation rather than emitting its own; across systems the ordinary contributing-document intersection applies.
  This is the common case rather than an edge one, because `_normalizeSystem` derives source references onto component-linked tools on every load, so both kinds resolve here.
  The primary participation is biased **component before tool**, so a mixed card keeps its component identity, key, salvage surface, essences and produced-by.
  A tool-only card is keyed `tool:<systemId>:<toolId>`; keying it by `componentId` would collide across every item-sourced tool in one system at `null`.
- **Broken treatment.**
  `broken` is a **read-only** verdict, and no engine path un-breaks a tool.
  It has **two** sources, and reading only the second reports almost every broken tool a player can actually see as intact:

  - the persisted **`flags.fabricate.toolBroken`** past fact — the authoritative presence-gate disqualifier, written by the `flagBroken` on-break action for **every** breakage mode and requiring no roll to know.
    This is the source that matters most: `flagBroken` is the only on-break mode that leaves a broken item in the player's inventory at all (`destroy` and `replaceWith` remove it), and a chance- or formula-broken tool carries this flag with **no usage counter** whatsoever.
  - a **projection** of usage exhaustion, which only `limitedUses` supports (the other modes decide at attempt time by a roll).
    Exhaustion is evaluated against **the Tool the owned document resolves to**, never a Tool found by `componentId`, which is unreachable for an item-sourced Tool and merely lucky for a component-linked one (two Tools may name one component).
    It MUST NOT be applied under the `checkDriven` tool-breakage authority: usage still accrues there, but the active check decides breakage and per-tool modes are ignored, so projecting exhaustion would report a perfectly usable tool broken permanently.

A broken item dims its artwork, takes a danger wash and a danger card border, and its **"Broken" pip REPLACES the quantity pip** — they are one slot, not two.
There is **no repair affordance** anywhere; the treatment states why the tool is unusable and offers no action.
Brokenness is about **usability, not salvageability**, and MUST NOT gate the salvage surface.

- **Inspector system selector.**
  When a card participates in **more than one** crafting system, the inspector presents a **system selector** as the **first** element of the detail header, above the `Info | Salvage` control, scoping the **whole body** (name, image, description, tags, tier, essences, used-by, required-for, produced-by, and the salvage surface) to the **selected participation** — the reported case is an essence in one system and an elemental tag in the other.
  The selector is a native **`<select>` drop-down** — a labeled VALUE choice ("pick which system's data this body shows"), **not** content-tab navigation and **not** a segmented toggle.
  A drop-down is what scales: a physical item can be registered in more than two or three systems, and a segmented control would grow too wide and wrap; a native select is a11y-clean by construction (a labeled listbox), so it needs no bespoke radiogroup/roving-tabindex ARIA.
  The label is associated with the control (`<label for>`), each option reads as the system **name** first with a plain-text affordance suffix (`<name> — Salvageable, Tool`) — deliberately **not** `<option label>`, whose present value REPLACES the visible option text — and the initially-selected option is the salvageable-biased primary.
  Display name and image are the **primary** (default-selected) participation's component name/image, biased to a **salvageable** participation first so clicking the union recycle badge never opens a primary with no Salvage tab.
  With exactly one participation the selector is **absent** and the surface is byte-identical to a single-system card — no selector node, no chrome, no layout shift.
- **Inspector Info order.**
  Broken banner → description → essences → **Sources** (hidden for books) → **Contributing** (essence rows only, gated `isEssence`) → Used by → **Required for** (tool rows only, gated `isTool`, spanning recipe / salvage / gathering kinds) → Produced by (gated `!isEssence`).
  Sources and Contributing are physical facts of the stack and stay card-scoped; every other Info leaf scopes to the selected participation.
  For a **tool-only** card the type chip reads **Tool**, and **Used by** and **Produced by** are OMITTED rather than rendered empty: a tool is neither consumed nor produced in that role, and "Not used by any known recipe" beneath a hammer several recipes require reads as a defect rather than as an empty state.
  A **Required for** entry is indexed against BOTH the Tool's own id and, when present, its linked component id, so the disclosure survives `componentId: null` on an item-sourced Tool (issue 1119).
- **Used-by reverse index composition.**
  The inspector's **Used by** list MUST include every component reachable through an ingredient's matcher, not only components a recipe names directly.
  Each ingredient option's `match` is expanded through the match-handler registry (`getMatchHandler(match).expandToComponentIds` against that option's own system components), so a direct component reference expands to its own id and a tag matcher expands to every component carrying the tags.
  Entries are deduplicated per component and per source, so a component consumed both directly and via a tag lists the recipe once.
  Essence-type options continue to feed the separate essence contributor channel and add no component used-by entries.

#### Player Salvage Surface

The player's route to salvage.

- Salvage lives **inline in the inspector**; it is never a modal.
- **The acting participation is the selected one, never the primary default.**
  On a card that participates in more than one system the salvage action resolves the acting `(systemId, componentId, targetActorId)` from the **selected** participation (the system selector's current choice) across the view handler, the store, the success-ribbon gate, and the panel — none falls back to the primary.
  Each participation salvages against **its own** contributing documents, so the depleted / "None remaining" / disabled-action basis is the selected participation's **own** owned quantity, not the card's cross-system union (a system-B salvage on a divergent-roles card cannot consume documents system B does not back).
  The panel **names the acting system** when the card spans more than one.
  The progressive stage-order preference is keyed per **`(systemId, componentId)`** (`salvage:<systemId>:<componentId>`): component ids are not globally unique (copy-import preserves them), so a component-id-only key collided across systems the moment the collapse surfaced two participations of one card, and the store's write key must match the engine's capture key exactly or the captured order silently reads empty.
  That key is captured when a reorder is **scheduled**, not re-derived when the debounced write flushes.
  A selection change between the gesture and the commit would otherwise write the reordered stages under a key naming a **different** participation, silently — the player reorders one card's stages and another card's preference moves.
- An **`Info | Salvage`** control appears when the item is salvageable — **including when it is broken**, since brokenness does not gate salvageability.
  When the item is not salvageable, **no tab bar renders at all**: a hidden tab reads as "this isn't salvageable", which is wrong and unfixable by the player.
- The body dispatches on the pair **`(mode, checkUsable)`** against **`system.salvageCraftingCheck`** — salvage's own check block, NOT `system.craftingCheck`, which is the recipe block.
  Both normally exist and are normally authored, so reading the wrong one renders plausibly while showing the player a formula and a DC the engine will never use.
- A check is **usable** iff its mode's roll formula is authored and **non-blank**; that is the only gate the engine applies, and the panel and the engine now derive it from one shared resolver rather than each testing the formula their own way (see `resolution-modes/spec.md` §Check Source).
  "No check" and "pass/fail" are therefore **one `simple` mode at two usability states**, not two modes.
- A routed or progressive salvage with **no authored formula** renders a GM-config state, not its authored tiers or stages: the engine aborts such an attempt with zero mutation, so showing the contract would put it under an action that always fails.
- **Simple multi-group misconfigured state.** A stored-but-not-yet-re-normalized `simple`-mode component with more than one success result group is misconfigured (the engine only ever awards the first group).
  The builder projects it with `misconfigured: true` and a `misconfiguredReason` discriminator (`'simpleMultiGroup' | 'routedNoFormula' | 'progressiveNoFormula'`); the misconfigured body dispatches on that discriminator — not a binary mode dispatch — so the Simple case renders Simple-specific copy ("more than one salvage result group; Simple mode uses a single group — fix it in the component editor"), and the mode banner is suppressed when misconfigured so a green recycle banner never sits above a "this is broken" body.
  The GM-facing inventory renders this cue; the non-GM visibility gate retains the hard-hide for a still-invalid stored config (justified: the config self-heals on the next system normalize, and the GM gets the cue in two surfaces — the manager overview critical and this body).
  Both surfaces show the working salvage panel once the config re-normalizes to a single success group.
- **`dcOverride` shifts the simple DC and routed RELATIVE thresholds only.**
  A relative outcome carries a DC **delta**, so its effective threshold is `baseDc + delta` and an override moves it.
  A **fixed** outcome carries an absolute, non-overlapping `[start, end]` segment of the roll range, matches on `start <= total <= end`, and never reads a DC at all — so a **routed + fixed** salvage renders its authored ranges **verbatim** and shows **no DC**.
- The action is **one-shot for every mode**: it rolls AND commits in a single gesture.
  The roll prompt IS the roll step; there is no separate confirm, no reroll, and no pre-roll dice box.
  The label names the gesture — with no usable check it is a plain salvage, with one it is a roll.
- The roll summary is **read-only** and renders only **after** resolution.
  It never renders a hardcoded formula: the formula is system-authored, and the prompt has already displayed the resolved one.
- A **cancelled** prompt returns to the pre-roll state with zero mutation and **no notification**.
- A **time-gated** salvage (`success` with null results) shows a **waiting** state carrying the engine's message, **not** a success state.
- The success ribbon stays **pinned to the salvaged row** until dismissed or another item is selected — **including when its last copy was consumed and the row leaves the listing**.
  Otherwise the selection falls through to another item and the ribbon renders against the wrong component; with single-copy components this is the common case.
- **Result-driven tab routing.** A newly-arrived salvage result actively opens or reopens the Salvage tab in one ordered effect keyed on a NEW result reference — so it survives roll-dialog remounts, a manual Info click is not yanked back, a changed item key resets to Info, and the result branch wins when both fire.
- **Required-tool disclosure before the attempt.** When the component's `salvage.toolIds` resolve to any library Tools, the panel renders a **Required tools** section (after the banner, before the roll summary) listing each tool's display name and image with an **available / unavailable** `StatusPill` treatment (success/danger tones, an icon plus a localized label — two signals, never colour alone) mirroring the crafting recipe detail's tools group.
  The tool availability is computed builder-side against the **target salvage actor** (`salvage.targetActorId`, the first owned source) — the same single actor the engine validates and the store salvages — **not** the party aggregate the crafting recipe surface uses, so a tool held only by a non-target party member reads unavailable exactly as the engine will enforce it.
  Disclosure is independent of resolution mode **and** of the misconfigured state: a prerequisite is worth disclosing in every state.
  A present-but-broken tool reads unavailable; the panel renders availability only, with no distinct repair cue.
- **Tool-blocked action.** The pre-roll action is **disabled when any required tool is unavailable**, so the one-shot roll is never spent on an attempt the engine will reject for a missing tool.
  In that state the footer note **supersedes** the one-shot cost note and instead explains why the button is off; the disabled action may reference the note via `aria-describedby`.
  The engine's `_validateTools` remains the server-side authority — this disable is a UX affordance mirroring crafting's `canCraft`.
- **Depleted-stack honesty.** After the last copy is consumed the store reconciles the held row to `totalQuantity` 0, the header reads "None remaining", the ribbon's "Salvage again" is replaced by a nothing-left note, and the pre-roll action disables on depletion or an unavailable required tool (`disabled = busy || misconfigured || waiting || depleted || !toolsAvailable`).
  The "Salvage again" inline reset is the dismissal gesture the "until dismissed" rule alludes to.
- **Rolled-total summary.** The read-only post-roll summary appends the rolled total in mono ("with a roll of N"), omitted when `rollValue` is null for a no-check salvage.
- **Post-roll reconciliation.** The routed body marks the matched tier with a "Your roll" pill from `salvageRun.checkResult.data.outcomeId`, and the store threads `awardedComponentIds` from `salvageRun.createdResults` for per-stage recovered state; both are null/empty on a runless (no-check) salvage.
- **Complication disclosure.**
  The panel's progressive body renders the per-stage complication strip defined in §Progressive Stage List, in its forecast tense before a roll and with the fired marks after one.
  The projection it reads is attached per stage to `salvage.stages[]` and filtered against salvage's OWN progressive check block, so the ids the forecast filters on are the ids the firing will match against.
  The fired marks arrive on the store's own `salvageResult`, scoped to the acting `(systemId, componentId)`: that result outlives a selection change, and an unscoped read would badge a DIFFERENT component's stages the moment the salvaged row was released while the result stood.
  The projection is published only for a progressive salvage, because every other mode resolves without an ordered stage list and so can fire nothing.
  The audience rules in the rest of this bullet are normative for every projection a player surface may read and for the strip that renders it.
  A `gmOnly` complication appears in NO player surface, in no engine return this panel reads and in no salvage run record, **including when a GM is the acting user** — the projection is keyed on the AUDIENCE, never on the acting user's role (`data-models/spec.md` § Component requirement 23).
  A complication whose condition roll did not pass, on a stage that fell short, renders as NOT fired; a runless progressive salvage renders every strip in the not-fired treatment.
  Each occurrence is marked on its own: a component staged twice whose complication fired on both entries renders BOTH strips fired, and one that fired on neither renders neither, because the resolution produces one fired record per firing and the marks follow the records one for one.
  A component whose only complication is `gmOnly` therefore renders in both GM read-only strips and in neither player surface.
- **Bulk selection unit.**
  The bulk gesture's unit is the **acting participation**, one unit per row, with no per-row quantity control; a run may span crafting systems and source actors (see §Bulk Salvage Execution).
  Brokenness does **not** block a row from a bulk queue — brokenness is about usability, not salvageability (see §Inventory Tab), and the prototype's "repair before salvaging" would block something Fabricate permits while naming a remedy Fabricate has no action for.
  A broken but salvageable row therefore stays in the **queue**, carrying its own danger treatment beside its **certainty** chip (Guaranteed / Possible).
  Certainty, not resolution mode: `simple` / `routed` / `progressive` is authoring vocabulary a player surface never uses, and the queue row already derives certainty from the row's own yield preview.
  The blocked-reason set and its first-match precedence are `essence`, `recipeItem`, `salvageDisabled`, the three `misconfiguredReason` values (`simpleMultiGroup` / `routedNoFormula` / `progressiveNoFormula`), `toolsUnavailable`, `depleted`.
  These are the already-normative ids rather than a second vocabulary, and a `toolsUnavailable` row names the missing tools.
- **Bulk complication forecast.**
  The bulk panel renders a pre-run **"What could go wrong"** block above the queue, titled by a count of what could fire and drawn from the player **forecast** projection.
  It is drawn in the panel's PRE-COMMIT state only: the forecast is what a player weighs before spending the one gesture that rolls the whole batch, so it is read before the commit control rather than found under it.
  The block reads that projection **off the queued entry the inventory store publishes** — the same `attachStageComplications` output the single-item panel's stage rows carry, flattened per entry into ordered rows — and re-derives no part of it.
  The rule that decides what a player may be shown has one owner, and a panel computing any of it a second time is how a `gmOnly` consequence eventually reaches a player; reading the same projection as the stage bands is also what keeps the two screens from disagreeing.
  `BulkSalvageService.forecast(targets)` is a second, service-side projection of the same rule, published for a caller with no store to read; it is **not** what this block reads.
  Being a second projection of the SAME rule is binding: it is one entry per stage occurrence too, with no dedupe of its own, and its `count` counts the same things this block's count counts.
  Only RUNNABLE rows carry a forecast — a blocked row never enters the run, so it can promise neither a yield nor a complication — which is what makes the block inherit the selection cap and every blocked reason by construction rather than through a second filter.
  A stage no budget can reach contributes nothing, on the yield preview's own rule: a null threshold marks a stage the award loop skips at every budget, and a forecast that listed it would promise a consequence the run cannot deliver.
  Within a group there is one row per STAGE OCCURRENCE that carries the complication, not one per distinct complication: a component staged twice is two rows at two positions, because a complication is both evaluated AND fired per result entry.
  Each of those two rows is a consequence the run can actually deliver, independently of the other, so the rows are the forecast's real unit rather than a repetition of one warning.
  The headline count is a count of the rows the block actually DRAWS, deliberately rather than a de-duplicated tally.
  That count therefore equals the number of firings this queued entry could produce — it is the same unit the firing rule uses (`resolution-modes/spec.md` § Once per result entry, never once per component), not an approximation of it — and a number in a section eyebrow that disagreed with the rows beneath it would be worse than no number at all.
  It is a **group card** rather than a flat bulk row because each complication's text is multi-line prose and a bulk row's note does not wrap.
  It is **hidden once the run commits**, because the fired record is then reported on the aggregate chat card instead (§ Bulk Salvage Execution) and a stale forecast beside a committed outcome reads as a second, contradicting report.
  The forecast excludes a complication that provably cannot fire, on the same rule § Progressive Stage List states, so the count is not a lie; and it never shows a `gmOnly` complication, on the same audience rule every other player surface obeys.
  There is **one group card per QUEUED ENTRY** — the component being salvaged — and not one per complication-bearing result component: the queue is what the player selected and what the run acts on, so a block grouped any other way could not be read against the queue directly above it.
  The rows inside a group are that entry's stages' player-visible complications, in the **player's stored order**, and each row's position badge is its position in that ORDER rather than its index among the rows — a stage that authors no complication leaves a gap, which is what makes the number readable against the ordered list on the single-item panel.
  Each row states its position, the result it hangs off and that result's DC in **one localized string** in the row's own metadata slot, never as a separate ordinal tile beside the severity tile: an ordinal tile plus a severity tile plus a wrapping name is three leading boxes in the 300px column the stacked stage layout exists to protect.
  **Every** group card states whose order its positions are numbered against, in **three** states, and it is a per-card statement rather than a heading over the block: a bulk selection can hold one row whose order the GM pinned beside another the player has rearranged, and one heading cannot be true for both.
  The states are the **player's own** (the rendered order came from their stored preference and differs from the authored one), **arrangeable** (the GM's authored order, which this player may replace), and the **GM's** (the authored order, pinned by `allowPlayerResultReorder: false`).
  The player's state MUST say the order is **remembered** — it persists and is re-read on every later salvage of that component, and that persistence is the whole reason arranging it is worth a gesture.
  The arrangeable state MUST name the GM as the order's author AND name the affordance that replaces it: naming only the GM would assert a fixity this player does not have, and naming only the player would be a false claim about their own arrangement.
  The GM's state states authorship and nothing more — it is neither an error nor a refusal being announced.
  All three MUST come from the projection rather than be inferred in the panel from the reorder permission and the player-order flag together, which would be the block re-deriving the projection it exists to render.
  A row with no ordered stage list at all (a `simple` or `routed` row) has **no** provenance — no order exists for anyone to own — and publishes no forecast either, so no card renders that case.
  The block renders the **same shared complication row** as the per-stage strip, in the same player variant: they are one meaning on two screens, and the six-call-site scaffold exists so the second one costs props rather than a component.
  It renders **no excluded-results note**, on the § Progressive Salvage Deltas rule that no player progressive surface builds any part of the exclusion vocabulary.
- **Bulk yield preview.**
  The preview is a **best case of one unit per row**, computed from each entry's **own** salvage projection and never from the inspected card's stage order, which is scoped to one participation.
  A no-check `simple` row's results are **guaranteed**; a checked `simple` row's same results are **possible**.
  A `routed` row's quantity is the maximum over **success** outcomes only.
  A routed **failure** outcome awards nothing at all: `salvage()` returns at its rolled-failure branch — consuming per the failure policy and posting the failure card — _before_ result groups are resolved, and result-group resolution is that branch's only call site.
  The per-outcome result list the panel reads is a **display projection, not an award**, so a `success: false` tier contributes 0 and so does a success tier with no `outcomeRouting` entry.
  The guaranteed floor is therefore **0** whenever any authored tier is a failure tier — routed salvage clamps a below-lowest total to the lowest tier, making a failing lowest tier reachable — and **0 in general for `routed + fixed`**, where a total outside every authored range matches nothing.
  "Always something, more on a success" is authored as **two success tiers**, which this rule handles.
  A `progressive` row contributes one per stage, always **possible** and never guaranteed, omitting entirely any stage whose threshold is unreachable at every budget; a component all of whose stages are unreachable is still salvageable and simply contributes no preview rows.
  Aggregate quantities and guaranteed floors are summed **independently per component name**, because two rows can yield the same component at different certainties and the "up to" affix is only correct under independent sums.

### Run Guardrails

Before start/resume and before each step action, UI must invoke guard checks defined in `recipe-visibility/spec.md`.

## Gathering App (Player)

This is a dedicated app distinct from the Crafting App.

It is opened from the `Gathering` header action in the Items directory and must not be combined into the crafting browse-to-craft workflow.

### App Availability

- The gathering listing refreshes on a crafting-data change only when that change names one of the five invalidation domains it consumes, per _Shared-store refresh routing_ above.
  Two of the five — `resolution-config` and `materials-and-yield` — are consumed for the system-validity gate rather than for anything the listing renders.
  The set is read from the derived transpose, never restated here.
- The app is available only when at least one crafting system has `features.gathering === true`.
- If no crafting system exposes gathering, the Items directory must not show the `Gathering` action.

### Actor Selection

- The unified window selects the gathering actor through a shared **Actor selection top bar** rendered above all tabs (see _Unified Window Actor Selection Top Bar_), rather than only a per-tab header control.
- The bar's selectable list is restricted to **player characters** — the actor type(s) a system designates as player characters, owned for non-GM users, all for GMs.
  The predicate is `isPlayerCharacterActor`, and the type set is GM-configurable: `'character'` always counts, and a GM may add further actor types the active game system declares through a settings-menu picker (`resolvePlayerCharacterTypes()`).
  This restriction is a selection-list concern only and does not change which actors are authorized to make a gathering attempt.
- The top header/bar shows the selected actor and, when enabled, gathering stamina current/max values plus regeneration or adjustment affordances where permitted.
- Persist the last selected actor in `fabricate.lastGatheringActor`.
  The shared store seeds from this setting, persists the selection on change, and re-persists a fallback selection when the stored id is empty or stale.
- Only actors the user owns are selectable for non-GM users.
- Gathering attempt authorization remains permission-based, not actor-type-based; an owned `npc`, `group`, or other non-player-character actor remains attempt-authorized even though it does not appear in the player-character selection list.
  Startup preference cleanup likewise stays ownership-based, so a persisted owned non-player-character id is not cleared at startup; the shared store converges it to a player character.
- The app should provide primary tabs or segmented navigation for `Environments` and `Gathering Log`.

### Unified Window Actor Selection Top Bar

The unified Fabricate window presents a shared, content-width **Actor selection top bar** above all primary tabs.

- The bar spans the content width and renders above ALL tabs (`Gathering`, `Crafting`, `Journal`, `Inventory`), not inside any single tab body.
  It lives in a vertical flex column wrapper (`.fabricate-app-main`) where the bar is `flex: 0 0 auto` and the content region is `flex: 1 1 auto; min-height: 0`, so a tab body using `height: 100%` keeps a bounded parent and does not collapse or double-scroll.
- The bar's left side is a character-portrait + dropdown-caret trigger that opens a searchable popover listing the user's selectable **player characters** (owned for non-GM, all for GM), narrowing the ownership-selectable set by the player-character concept.
  The popover provides a case-insensitive name search and a `role="listbox"` of portrait + name options; selecting an option updates the shared selection and persists it.
- The bar's right side carries tab-specific context.
  For the `Gathering` tab only, it shows the current weather, the current time-of-day, and the current realm (each icon + value).
  For other tabs the right-side context is empty.
  The condition icons MUST be the fixed icons used by the GM gathering-settings UI — `fas fa-cloud-sun` for weather, `fas fa-clock` for time of day, and `fas fa-map-location-dot` for realm — rather than per-value or text labels; the value text shows the current weather/time/realm. "Current realm" is sourced from the gathering listing's party/system **realm context** — resolved by the engine for the single active realm-enabled gathering system and the selected actor — not from any one selected environment.
  The realm chip is shown whenever that subsystem is enabled, independent of whether an environment is selected, so the all-environments-locked / no-current-realm state still surfaces the realm context.
  A selected environment refines the chip (an identical value in the single-system case).
  When the party has no resolved current realm, a "No current realm" placeholder is shown and no realm name is fabricated.
  When more than one realm-enabled gathering system is present in the listing, a single chip cannot honestly represent two systems' realm contexts (per-system overrides and reveal modes can differ), so the listing-level chip is omitted and the chip falls back to the selection-driven value; its absence in that ambiguous case is intended.
  The chip carries an accessible name ("Realm: <value>") and announces its appearance and value changes through a polite live region.
- The bar uses the player-app theming scope and base design tokens only; it must render correctly in both themes and must not depend on Manager-scoped tokens.
  Selecting an actor in the bar re-filters and persists the gathering listing; the bar renders independently of the tab bodies, so bar rendering MUST NOT depend on any tab body's implementation state.
- The popover keyboard/accessibility model follows the IconPicker interaction pattern: a `role="dialog"` popover with an `aria-label`; the trigger exposes `aria-haspopup` and `aria-expanded`; options are `role="option"` rows inside a `role="listbox"`; the popover supports Tab-through option buttons, Escape / outside-click dismissal, and focus-on-open of the search input.
  It does not provide listbox arrow-key roving focus or `aria-activedescendant`.
  The popover renders in-place below the trigger (left-aligned, dropping downward) as a descendant of the bar root, so an outside-click dismisses it.
- An actor whose portrait `img` is null/empty MUST render a neutral fallback icon (not an empty `<img>`); the portrait is decorative (`aria-hidden`) and the actor name is the accessible label / alt text.
  Long actor names MUST truncate with ellipsis (and expose the full name via `title`) in both the trigger and the option rows.
  The trigger and each option row lay portrait + name out flush-left (not centered) and size tall enough to contain the portrait without clipping, overriding the host application's default `button` styling.
- When there are zero selectable actors, the trigger is disabled with a placeholder portrait/label and the popover shows a neutral empty state.
- The right-side gathering context renders gracefully when `conditions.timeOfDay` is absent (the fixed clock icon + an "unknown time-of-day" label), when `conditions.weather` is absent (the fixed cloud-sun icon + an "unknown weather" label), and when the listing's realm context resolves no current realm (a neutral "No current realm" placeholder).
  When the window is resized narrow, the weather/time-of-day/realm cluster truncates or wraps, the actor trigger stays usable, and the bar produces no horizontal overflow.

### Shared Actor Selection State

Bidirectional shell↔tab actor/realm state flows through a single shared selection store provided on the app services, not through per-tab prop drilling.

- A single shared selection store is created once when services are built and exposed on the services bag so both the shell and the gathering tab read and write the same reactive state.
  The shell writes the selected actor id and the selectable-actor list; the gathering tab reads the selected actor id and writes the current realm; the bar reads realm and conditions for its right-side context.
- The store seeds the selected actor from the persisted last-gathering-actor selection.
  When that id is empty or **not present in the bar's player-character `selectableActors`** (stale, including a legacy owned non-player-character id), it falls back to the first selectable actor and re-persists that fallback so a fresh client converges on a valid, sticky player-character selection.
  When the selectable list is **empty**, the store sets no selection, persists nothing, and must not throw (it must not index the first element of an empty list).
- The store factory must not access Foundry globals directly; all environment access goes through the injected services bag, preserving the presentational-component boundary.
- The re-persist fallback runs at most once per load: a re-entrant load after a deliberate selection must not clobber or re-seed the user's choice (guarded by an initialized flag).
- The shared store is the single source of truth for the selected gathering actor **after convergence**.
  Because the gathering listing resolves a remembered actor against its ownership list (not the player-character list), a legacy persisted owned non-player-character id may be honored by the listing on the first fetch; the store converges by falling back to the first player character and re-persisting, after which the store and the persisted setting agree.

### Environment List

- Show only environments whose owning crafting system has `features.gathering === true`.
- Disabled environments surface to all viewers (players and GMs alike) as non-interactive **locked teasers** (identity-only, unselectable), never as selectable environments; their tasks, weights, and composition internals are redacted.
- The Environments column provides a **player-side, client-persisted "hide unavailable" toggle** rendered as Fabricate's pill switch (a `<button>` with a track/knob and an On/Off state label, matching the GM apps' `manager-status-toggle`) on its own row beneath the search field, with a preceding descriptive label that is the switch's accessible name.
  When enabled it hides exactly the **locked** listings (engine `locked === true`): disabled environments and location-gated environments the party is not in (out-of-realm or scene-gated).
  It **does not** hide in-realm, selectable environments whose individual tasks are merely blocked (e.g. stamina- or tool-blocked) — those remain visible with their blocked reasons.
  The toggle defaults **off** (show all), changes only the viewing client's presentation (never saved data, the engine listing, or GM configuration), and persists **per client/device** via a client-scoped (`localStorage`) setting.
  It is independent of selection mode: a merely masked (blind) environment that is otherwise reachable stays visible, while a blind environment that is also locked is hidden with the rest.
  The visible label is the control's accessible name and surfaces the hidden count.
  When the toggle hides every remaining environment (but a search filter did not), the column shows a distinct "all unavailable environments hidden" empty state with an in-place control to show them again, kept distinct from the search "no matches" empty state.
- Support search plus biome, risk/status, and availability filters where data exists.
  Geography is not a player browse filter (the inert legacy `environment.region` free-text string is not echoed to the player listing).
- If an environment is scene-gated, show whether the selected actor currently meets the scene/token requirements.
- Display environment image, name, description, biome, danger/risk, current global weather/time evidence, selection-mode summary, visibility/condition summary, scene/access state, and availability summary where safe to reveal.
  The player-facing geography pip was removed; player geography surfaces, when built, read resolved current realms rather than the inert `environment.region`.
- Do not expose weather or time of day as player environment browse filters.
- Environment rows should be image-led and include environment name, biome, risk/status chip, and availability summary where safe to reveal.
- Selecting an environment populates a task list and environment detail/evidence panel.

### Player Current Realm

When location-aware gathering is enabled, the player Gathering app shows current location context for the selected actor.

- The header current-realm context derives from the listing-level party/system realm context — resolved per the single active realm-enabled gathering system for the selected actor — not from a selected environment.
  So the all-environments-locked / no-current-realm state still surfaces the realm context to the player, using the canonical "No current realm" label.
  When more than one realm-enabled gathering system is present, the listing-level header chip is omitted (selection-driven fallback); its absence in that ambiguous case is intended.
- Show the selected actor's party when the actor belongs to a Fabricate gathering party.
- Show the current realm name(s) when the selected actor is allowed to know them.
  Show "Undiscovered realm" style placeholders for secret current realms the selected actor has not discovered.
- Show the current-realm evidence source using the canonical labels `GM override`, `Travel actor`, and `No current realm`.
  A player's current realm may resolve through shipped live travel-actor sensing (`source: 'travelActor'`) as well as from a manual override.
- If the actor is not in a party, show a concise no-party location state that still does not block non-location-gated environments.
- Current-realm display must fit narrow Foundry ApplicationV2 layouts without overlapping actor/stamina controls, and current-realm chips must wrap within the app container without forcing horizontal scrolling.

### Player Environment Availability and Travel Guidance

The player Gathering app makes location-gated availability understandable.

- Available environments sort before locked (disabled or out-of-realm/scene-gated) environments.
  Locked environments remain visible by default (when safe, with clear blocked reasons); the player may opt to hide all currently-locked (out-of-reach) environments via the client-persisted "hide unavailable" Environments-column toggle described under Environment List.
  This toggle targets only `locked === true` listings and never hides in-realm, task-blocked environments.
- Known destination guidance may list realm names; secret or undiscovered destination guidance must use undiscovered placeholders and counts.
- Guidance must distinguish the location blocker from weather, time, tool, stamina, node, scene, permission, duplicate-run, and visibility blockers where practical.
- Environment cards/details must not leak hidden blind task names, hidden results, hidden events, provider diagnostics, GM-only notes, or secret undiscovered realm names.
  Secret undiscovered realm names and ids must not appear in visible text, `title`, `aria-label`, filter labels, or DOM `data-*` attributes.
- Non-GM destination filters may expose known destination names and aggregate buckets such as `Undiscovered realms`; they must not expose secret undiscovered realm names or ids.

### Player Realm Modifier Visibility

The player UI respects the realm modifier visibility setting.

- Modifier visibility defaults to visible.
  Visible modifiers show concise source evidence, such as the realm name and the affected value.
- GM-only modifiers must not reveal secret realm identity or hidden modifier values to non-GM users; hidden modifier effects avoid misleading player copy (generic "local conditions may affect this attempt" copy is acceptable when needed).

### Task Selection

If the environment is `targeted`:

- show one row/card per visible enabled task
- each task shows:
  - image
  - name
  - description
  - time requirement summary if present
  - catalyst summary
  - stamina cost if stamina is enabled
  - node availability state if nodes are enabled
  - risk modifier where safe to reveal
  - availability state
  - start/select action
- potential result previews may be shown for targeted visible tasks and GM-visible tasks, but must not reveal hidden blind-task results to non-GM users

If the environment is `blind`:

- show one generic gather action or equivalent environment-level action for unrevealed hidden tasks
- do not expose alternate unrevealed per-task choices to the player
- if progressive reveal is enabled, revealed blind tasks may appear as named task rows for the relevant actor/user/party/global scope while unrevealed tasks remain hidden
- still show task-derived time requirement, stamina cost, node availability, and requirement summaries where useful and safe to reveal
- GM users may inspect full task, node, condition, risk, encounter, and diagnostic detail

### Start Gathering Flow

Before creating a run, the UI must check:

- game is not paused
- the actor does not already have an active gathering run for the same `taskId`
- selected environment and task are enabled
- scene/token access rules pass when `sceneUuid` is configured
- task visibility gate passes for the selected actor
- required catalysts are available
- required stamina is available when stamina is enabled
- node availability passes when nodes are enabled
- attempt limits have remaining attempts or recharge state allows the attempt

When the game is paused, the app must keep environment browsing readable, show a paused-game blocker, disable start actions, and avoid implying that stamina, nodes, catalysts, rolls, chat, history, or item awards were consumed.

Start actions must surface blocking reasons for missing stamina, depleted nodes, scene/token access, duplicate active runs, hidden tasks, missing catalysts/tools, attempt limits, provider diagnostics, and paused game.

If `task.timeRequirement` is absent:

- show the terminal `startAttempt` result in the same interaction flow
- present success with created result summary when details are visible
- present failure without implying any gathered result items were created
- refresh task and run state

If `task.timeRequirement` is present:

- create the run
- show it immediately in the app's active-runs area with `waitingTime` status
- show the expected completion time derived from the world-time target
- notify the user that gathering has started rather than completed
- do not show terminal feedback until the timed-completion slice resolves the run

### Active Runs

The Gathering App must include a dedicated active-runs section.
These runs also appear in the unified player Journal (see _Journal App_), which monitors gathering, crafting, and salvage runs together; the Gathering App remains the place to START a gather.

Each active run entry shows:

- environment name
- task name for `targeted` environments, or a localized generic label for `blind` environments
- actor name
- status (`inProgress` or `waitingTime`)
- started time
- remaining or completion time when `timeGate` exists
- stamina/node evidence where safe
- cancel/details actions where supported

The app must not allow starting a second active run for the same actor and `taskId`.
Instead it should show the existing run and an actionable blocking reason.
For `blind` environments, duplicate-run blockers, notifications, and terminal feedback must also use localized generic labels instead of the real task name.

### Completion and Refresh

When a timed gathering run completes after world-time advancement:

- remove it from the active-runs section
- prepend it to gathering history
- surface the terminal result to the user when possible through notification, refreshed app state, or both

If the completion result is:

- `succeeded`: show created results
- `failed`: show failure feedback and any special-outcome text or macro result summary
- `cancelled`: show that the run became invalid due to missing references or destructive change

### History

The Gathering App should expose recent gathering history for the selected actor.

Each history row shows:

- environment
- task for `targeted` environments, or a localized generic label for `blind` environments
- terminal status
- completion time
- summary of results, failure outcome, encounter outcome, stamina spend/regeneration, and node depletion/restock evidence where visible

In `blind` environments, real task names remain GM-only in player-facing active runs, history rows, duplicate-run blockers, notifications, and terminal feedback.

### Gathering Stamina Presentation

When stamina economy is enabled:

- Stamina summary shows current and maximum stamina when known.
- Stamina summary should show regeneration hint or next regeneration time when known.
- Task start buttons communicate stamina cost before the attempt starts.
- If a task is blocked by stamina, the UI shows the missing amount and any known recovery path.
- Manual GM stamina adjustment controls are visible only to users with permission.
- Stamina UI is hidden or demoted when the selected gathering system does not use stamina.
- If stamina is manual-only, the UI must not imply automatic regeneration or next regeneration time.
- If stamina regenerates over time, the UI should show the configured interval, next regeneration time, or regeneration rate when known.
- GM manual stamina adjustment UI provides set-current and add/subtract flows where permissions allow.

### Rich Gathering Disclosure

- Non-GM users must not see hidden task names, hidden result groups, provider diagnostics, encounter table internals, or GM-only notes.
- Blind environments use generic task labels and redaction-safe active/history text for non-GM users.
- Depleted-node and respawn hints may be generic for blind or hidden tasks.
- Risk and condition summaries may be shown at the environment level when they are not task-revealing.
- Encounter feedback is visible when an encounter hook produces player-facing output, but hidden diagnostics and GM-only encounter metadata remain redacted.
- Chat messages generated by gathering attempts should be reflected in the log or linked attempt detail where practical.
- Narrow layouts keep actor/stamina header, environment filters, selected environment, task list, and start action reachable without horizontal overflow.

### Rich Gathering Developer and Chat UI

- GM configuration should include an advanced Developer / Automation section for hook/API notes, stable ids, macro entry points, and provider diagnostics.
- Developer-facing UI distinguishes read-only hook evidence from mutable provider controls.
- Chat message settings should be grouped with automation or feedback settings and should expose event-level toggles.
- Chat preview should show player-safe output and GM-only diagnostic output separately when possible.
- Provider diagnostics from expressions, macros, hooks, APIs, and chat generation must be visible to GMs in validation/evidence panels.

## Journal App (Player)

The **Journal** is the unified player-facing home for monitoring runs.
It is a tab in the unified Fabricate window (`Crafting`, `Alchemy`, `Gathering`, `Journal`, `Inventory`), rendered beneath the shared Actor selection top bar, and reads the selected player-character's existing crafting, gathering, and salvage runs through one UI-safe projection (the `RunModel` / `StepModel` shapes defined in `data-models/spec.md` _Run Journal Projection_).

Scope:

- The Journal does NOT consume the `narrative` invalidation domain: it reads no authored description anywhere, and its flavour fields are empty by construction.
  An edit that changes only prose therefore MUST NOT rebuild it — see _Shared-store refresh routing_ above and `data-models/spec.md` § Invalidation Domains.
- The Journal **monitors** active and historical runs and, for crafting only, **advances** them.
- It never CREATES runs; run creation stays in the Crafting, Alchemy, and Gathering flows.
- It is the unified player home for the per-activity run views described elsewhere in this spec — the Crafting tab _Run Summary_, the Alchemy tab _Active Runs and History_, and the Gathering App _Active Runs_ / _History_.
  Those per-activity sections remain authoritative for their own tab, and the Journal cross-references rather than replaces them.

### Navigation and Active-Run Count Badge

- The `Journal` nav tab uses the `fa-book-open` icon and the `FABRICATE.App.Nav.Journal` label.
- The nav entry carries a live **active-run count badge** showing the number of active (non-terminal) runs for the selected actor (`JournalListing.counts.active`).
- The badge is hidden when the count is zero.
- The badge stays fresh even while the Journal tab is closed: the shell re-fetches the listing on world-time advance and scene change, so another open tab still shows an accurate count.
- The badge count and the Journal listing MUST reflect the currently-persisted runs for the selected actor regardless of which client created or advanced them.
  A run started or advanced by another user — including via the primary-GM world-time timed resume — MUST become visible to a GM viewing that actor after the actor document syncs, without a full app reload.
  Per-client run-manager caches MUST NOT serve stale runs: they are invalidated when the selected actor's run-container flags change on any client, so this cross-client freshness holds and the "badge stays fresh on world-time advance" guarantee above continues to hold across clients.

### Run Monitoring

- The view resolves the selected actor through the shared Actor selection top bar and shows a no-actor empty state when none is selected.
- Active runs and history are shown across all three run types (crafting, gathering, salvage) in one unified surface; each row presents the run's title, run type, status pill, crafting progress, and a time-remaining/countdown where a `timeGate` exists.
- Each run's status pill reflects the projection's `derivedStatus` (`waiting` | `ready` | `inProgress` | `succeeded` | `failed` | `cancelled`), which is derived from the active step/run time gate against world time, not the persisted status (see `data-models/spec.md`).
- Selecting a run opens a centre detail panel (steps, requirements, and — for a succeeded run — its crafted items, titled `FABRICATE.App.Journal.Results.Title` so it does not collide with the right column's "Recent results" card) plus a right column ordered "about this run" → "what to expect" → "recent results" → "tips".
- All countdowns and timestamps are world-time based.
- **Single-step recipes suppress redundant step chrome.**
  A run whose projection reports `multiStep: false` (see `data-models/spec.md`) hides the "Step X of Y" step-label chip on both the left run card and the centre identity row (its `stepLabel` is `""`) and omits the centre step timeline; the "Single-Step Recipe" structure chip is retained.
  A single-step run's requirements card uses the single-step title (`FABRICATE.App.Journal.StepDetails.TitleSingleStep`, "Craft requirements") while a multi-step run's card keeps "Step requirements" (`FABRICATE.App.Journal.StepDetails.Title`), and the run-card progress bar carries a run-neutral "Crafting progress" (`FABRICATE.App.Journal.Progress.Label`) aria-label for every run.
  A single-step crafting run's "what to expect" card uses the single-step explainer (`FABRICATE.App.Journal.WhatToExpect.CraftingSingleStep`) instead of the multi-step crafting copy.

### Run-Type-Aware Actions Panel

The run detail's actions area is keyed on the projection's `manualAdvance` flag:

- **Crafting (`manualAdvance: true`)** shows a primary advance button.
  On a non-final step it reads **"Trigger Next Step"** with the `FABRICATE.App.Journal.Actions.TriggerHint` ready hint and the `FABRICATE.App.Journal.TimeRemaining.WhenPassed` gate hint; on the **final step** (`isFinalStep: true` — a single-step recipe, or the last step of a multi-step recipe, where there is no next step to trigger) it reads **"Finish Crafting"** with the `FinishHint` ready hint and the `WhenPassedFinal` gate hint, and the left run card's matured countdown reads "Ready to finish" (`Countdown.ReadyToFinish`) rather than "Ready to continue".
  It is DISABLED until the active step's time gate has matured — readiness is derived from `timeGate.availableAt <= worldTime` (race-free), NOT from the run's persisted status — and while an advance is in flight.
  Triggering invokes the crafting advance contract in `recipes-and-steps/spec.md` (_Run Progression — Player-Initiated Advance_); the final-step variant is copy-only and re-enters the same advance flow.
- **Gathering / salvage (`manualAdvance: false`)** show an explanatory "resolves automatically when world time advances" line plus the time-remaining box, and offer no trigger button, because matured gathering and salvage runs auto-resolve on world time.

### World-Time Disclosure

The Journal discloses that all displayed times use the game world's world time — so a static countdown is not misread as a frozen real-time wall clock — through the right column's Tips card (`FABRICATE.App.Journal.Tips.WorldTime`) rather than a dedicated footer.

### Crafting / Alchemy Viewer Redaction

Runs of recipes the viewer cannot see are redacted, mirroring the gathering blind-run redaction (_Rich Gathering Disclosure_):

- A crafting or alchemy run whose recipe is undiscovered or knowledge-gated for the viewer, or whose recipe no longer resolves, is shown with a generic localized title (`FABRICATE.App.Journal.Redacted.Title`), a default image, and no recipe id, steps, results, or failure detail.
- GM viewers and globally-visible recipes are never redacted.
- The redaction is enforced in the projection (`data-models/spec.md` _Run Journal Projection_), so no hidden crafting/alchemy recipe identity reaches a non-GM viewer through the Journal.
- **Redaction hides IDENTITY ONLY and is never an authorization gate** (issue 966).
A redacted run still projects `manualAdvance: true` and, for an owner, `canCancel: true`, so its owner can finish it and abandon it exactly as they could a visible one.
Nothing resolves a crafting run automatically — `CraftingRunManager.processWorldTime` only flips a matured `waitingTime` step to `inProgress` — so suppressing the affordance stranded every timed craft of a recipe the crafter cannot see, with its inputs already consumed at START.
Alchemy makes that the DEFAULT case: brewing is never gated by visibility, and discovery lands at FINISH, so an undiscovered timed brew could never reach the FINISH that would have revealed it.
- Because a redacted model carries no `recipeId`, `Fabricate#advanceCraftingRun` resolves the recipe from the PERSISTED RUN rather than from its caller.
The client-supplied `recipeId` is ignored; trusting it also allowed advancing one run while naming another run's recipe.

## Downtime Preview and Premium Extension

This section is GM Manager scope throughout.
Every premium signal it requires — the title-bar badge, the rail chip, the padlocks and the Patreon call to action — belongs to the Manager window and to no other; §Player Navigation Extension forbids all of them in the player window.

- The GM Manager's permanent World navigation contains `Parties` and `Currency` always, and `Downtime` only while `fabricate.experimentalFeatures` is enabled (see Experimental gate below).
- `Parties` retains its identifiers, count, availability, route-exit behavior, CRUD, membership, travel-actor validation, realm resolution, `GatheringParty` aggregate, and `fabricate.gatheringParties` persistence unchanged, and is not gated in any way.
- Core's Downtime fallback is a read-only four-tab preview whose ids are `tracking`, `activities`, `factions`, and `settings`.
That list is Core's own preview CONTENT, not part of the extension contract, and no part of the registry reads it.
- Core's preview and extension registry create, read, and write no downtime record, setting, flag, actor data, reward, world-time state, party role, assignment, mirror, or reference.
- Fabricate publishes **two** page-session API-v1 provider registries, each surviving the `init` and `ready` API rebinding: `game.fabricate.api.managerExtensions.registerWorldNavProvider(provider)` for GM Manager surfaces, and `game.fabricate.api.playerExtensions.registerPlayerNavProvider(provider)` for player-window surfaces (see §Player Navigation Extension).
- The two registries hold separate surface-id namespaces, so one companion may claim the same surface id in both windows.
- **The Manager registry** holds at most one provider **per surface id** and rejects only a second provider for the same surface.
It validates that `id` is a non-empty string and never enumerates the ids it accepts, so a companion may claim a Manager surface Core does not itself render.
Core's Downtime route reads the surface id `downtime`.
- A provider is `{ apiVersion: 1, id, tabs, actions?, mount }`.
The provider declares its own tabs: any ids, at least one of them, rendered in array order.
Core validates tab SHAPE — a non-empty id, unique within the set, plus a localized label, accessible name, keyboard-visible tooltip, and Font Awesome icon — and never tab membership, count, or order.
A tab may also carry an optional `badge`.
The tab contract is a **closed key set**: Core refuses a key it does not name, with a deterministic message, exactly as a runtime chrome update does.
- A tab may carry its own **registered** route chrome: `title`, `subtitle`, `breadcrumb`, and `actionsLabel`, each an optional non-empty localized string.
Core renders the active tab's chrome as the page title, page subtitle, **tab** breadcrumb crumb, and header-action group name, and falls back to its own string for any field the tab omits.
- A tab may carry `actions`, falling back to the provider's own `actions`; each action is `{ id, label, icon?, tooltip?, tone?, primary?, disabled? }` plus exactly one of an `onSelect` function or an absolute `http(s)` `href`.
Core renders an `href` action as an external anchor with `target="_blank"` and `rel="noopener noreferrer"`, invokes `onSelect` with the mount context plus `actionId`, and contains a throwing handler.
- **`tone` selects one of Core's own Manager header button treatments** — `primary`, `ghost`, `danger`, or `neutral` — so a companion's Back, Delete and Save render through the same classes as the recipe editor's rather than as a companion-only lookalike.
`primary: true` is the shipped spelling of `tone: 'primary'` and keeps working; a descriptor declaring both is refused rather than silently resolved.
`primary` and `disabled` are validated as booleans, so no provider field on this seam reaches the renderer unvalidated.
- Core's own `Unlock with Premium` header action belongs to Core's preview and is never rendered over a registered provider's screens.
- A conflicting provider on the same surface, an unsupported version, an empty or duplicated tab set, malformed chrome or action, or an asynchronous mount fails with a deterministic error.
- `mount({ target, tabId, context })` is synchronous and returns a cleanup function or nothing.
`tabId` is always one of the provider's own tab ids.
- `context` is frozen and carries `{ schemaVersion, surface, surfaceId, route, tabId, craftingSystemId, isGM, revision, requestRemount, setRouteChrome, onRouteReselect, onBeforeNavigate, navigateToTab }` and no Core store, document, or component.
`craftingSystemId` is `null` when no crafting system is selected, and the route stays reachable in that state.
`requestRemount()` asks Core to run the current cleanup, clear the target, and call `mount` again with a fresh context whose `revision` has advanced.
**The four runtime channels below are functions on that frozen context and never mutable fields**, because the context's identity is what a remount is keyed on: a chrome update must move the header without moving the context.
- **A companion drives Core's own route chrome at runtime, and this REPLACES the earlier requirement that a drill-down render its identity inside the panel.**
That requirement was ruled on the grounds that route chrome was fixed at registration and that re-registering per drill-down would flash Core's preview and remount the companion.
Both remain true of re-registration; the ruling is reversed by widening the seam instead, so a companion that opens an editor no longer has to render a back/delete/save header of its own inside the panel — a visible departure from every other Manager screen — and Core's header is what changes.
- **`setRouteChrome(chrome)` restates the live mount's chrome and never remounts it.**
`chrome` accepts every field a tab may register — `title`, `subtitle`, `breadcrumb`, `actionsLabel`, `actions` — plus `icon` or `image` for header artwork and `status` for a state indicator, so a companion learns one chrome vocabulary rather than two.
Every field is optional.
- **A chrome update REPLACES, never merges.**
Each call states the whole runtime chrome, a field is unset by omitting it, and the whole runtime layer is unset with `null` or `{}`, which mean the same thing.
- **Unsetting falls back rather than clearing.**
Core resolves each field through the live mount's runtime chrome, then the active tab's registered chrome, then Core's own string, so a companion that never calls `setRouteChrome` renders exactly as it did before the channel existed and one that unsets lands back on its registered chrome.
- **`breadcrumb` is the one field where the runtime layer EXTENDS the registered layer rather than shadowing it**, and Core SHALL render both as two crumbs.
A trail is a PATH, so a drill-down belongs BELOW the tab it was reached through rather than in place of it: resolving this field runtime-first left a GM inside a companion's detail reading `World > Downtime > <detail>`, with the tab absent from its own trail and nothing between the route and the leaf.
The runtime crumb SHALL be suppressed when it equals the tab crumb, so a screen that restates its registered chrome draws one crumb rather than the same word twice.
Every other field shadows as stated above, and `title` and `subtitle` deliberately so — a detail screen owns what the header calls it.
- **The tab crumb SHALL return the GM to that tab's own root**, through the same re-activation the rail offers for a click on the sub-item of the tab already on screen, and for the same reason: Core neither knows the level nor could restore it, because the drill-down is inside the companion's own target.
Core SHALL render that crumb as inert rather than as a control that does nothing when the live mount registered no re-activation handler, or when there is no runtime crumb beneath it — in the second case the tab crumb names the screen the GM is already on.
An **empty** `actions` array is a statement that this screen has no actions and does not fall back.
- **Runtime chrome is scoped to one mount and never survives it.**
A tab **badge** is deliberately the exception on this seam: it is scoped to the REGISTRATION, not to a mount, because its job is to be true while the companion is not mounted.
It is cleared when the mount ends on every path — a tab change, a route exit, a provider change, a contained fault, or window teardown — so a screen never inherits the chrome describing state a remount has already discarded, and Core's own preview never wears companion copy.
A call from a context whose mount has ended is refused and changes nothing.
- **A malformed chrome update is refused with a deterministic message and changes nothing**, exactly as a malformed provider is at registration.
Validation precedes any state change, so no update is half-applied, and the refusal does not fault the surface or take the Manager down.
Both a provider tab and a chrome update **refuse a key they do not name** rather than ignoring it, so a mistyped field fails at the call site rather than leaving the previous value on screen with nothing to explain it.
- **Core renders runtime chrome through its own primitives, not a second set.**
`status` renders as the Manager's one `Chip` in the same tone Core's own editors use for staged changes, defaulting to the warning tone so a one-field `{ label }` reproduces the "Unsaved" chip exactly.
`icon` or `image` — mutually exclusive — renders the same medallion identity block the recipe and component editors render, at the same size and through the same classes.
Header artwork is runtime-only and off by default, which preserves this route's plain header while letting a drill-down look like one.
Localization stays the companion's: Core renders the strings it is given, as it already does for `title` and `subtitle`.
- **Activating the rail sub-item of the tab already on screen is a re-activation, not a navigation, and it reaches the companion.**
Core has nothing to navigate to and cannot act on it — the drill-down lives inside the companion's target and Core knows neither the level nor how to restore it — so it invokes the handler the live mount registered through `onRouteReselect(handler)`, which returns an idempotent unsubscribe and dies with its mount.
It is distinguishable from a first mount because it is a different callback and no mount occurs, which is what lets a companion pop one level rather than re-initialise.
Core's behaviour is unchanged when no handler is registered, a throwing handler is contained, and the click is deliberately not routed through the unsaved-draft route-exit confirmation, because no route is being exited and any prompt about the companion's own unsaved work belongs inside its handler.
- **A mounted companion may refuse the navigations that would end its mount, through `onBeforeNavigate(handler)`.**
Core consults the live mount's registered handler before moving to another of that provider's tabs, before leaving the Downtime route, and before closing the Manager window, and proceeds only when the handler does not refuse.
The handler may be synchronous or asynchronous, and Core awaits a returned promise, because the answer is expected to come from a dialog.
Only an explicit `false`, or a promise resolving to `false`, vetoes: any other return, including none at all, allows, so a handler written to OBSERVE a navigation cannot trap the GM by omitting a return.
`onBeforeNavigate` returns an idempotent unsubscribe, Core drops the handler when the mount ends, and a call from a context whose mount has ended registers nothing — the same lifecycle `onRouteReselect` already has.
- **Core tells the guard why, and nothing else.**
The handler receives a frozen event whose `reason` is `'tab'`, `'route'`, or `'close'`.
The destination is deliberately withheld: Core normalizes a route after the guard has answered, so a companion deciding from a destination would be deciding from a value Core may still change, and its own tab id is already on the context it closed over.
`reason` is the one thing it cannot derive, and the distinction is real — a draft kept for the session survives a tab or route change and does not survive the window closing.
- **The companion is asked before Core's own route-exit and window-close guards.**
Every Core guard is scoped to its own route, so on the Downtime route the Core cascade already answers affirmatively without prompting and the order changes nothing there.
On the window close it decides an outcome: Core's environment and tool guards can PERSIST world data, and a companion veto must not leave a save landed for a window that then stayed open.
- **A companion that registers no guard behaves exactly as it did before this channel existed.**
No prompt is raised, no asynchrony is introduced on a path that was synchronous, and the route-exit result Core already returns keeps its identity rather than being wrapped — which is what keeps every existing discard path one microtask earlier than a wrapped one would be.
- **A guard that throws, or whose promise rejects, is reported and ALLOWS the navigation.**
This is the one containment ruling that cannot go the other way: a companion defect read as a veto would leave the GM on a route they cannot leave, in a window they cannot close, recoverable only by reloading Foundry, and it would do so for the module least likely to be watching its own console.
Allowing degrades to the behaviour that shipped before this channel existed, in which a screen exit neither wrote nor discarded a companion's own draft.
- **A second navigation arriving while an answer is pending shares that answer rather than asking again.**
Re-asking would stack a second dialog on the first, and refusing the second navigation outright would hand the GM a click with nothing to explain it; instead the GM's one decision resolves both navigations and each caller then runs its own continuation.
This is the de-duplication Core already applies to its own concurrent discard prompt.
- **A forced window close never consults the guard**, exactly as it already skips Core's own dirty-draft guards.
Foundry's lifecycle teardown and this repository's smoke harness both close with `force`, in contexts where no confirmation dialog can be serviced, and a guard that ran there would hang the window on a question nothing can answer.
- **What the guard does not cover is stated rather than implied.**
It does not reach a browser reload, a Foundry logout, or any teardown outside the Manager's own close path.
It is not consulted on a REMOUNT, whether the companion asked for one through `requestRemount()` or a context value such as the selected crafting system changed, because a remount is not the GM leaving the companion's screen and the companion either asked for it or observes it as a fresh `mount`.
It is not consulted on re-entering the route or the tab already on screen, which navigate nowhere — re-activating the tab on screen remains `onRouteReselect`'s, and any prompt about the companion's own unsaved work belongs inside that handler.
For everything this channel does not govern, a companion's own session-scoped handling of its unsaved work remains the only thing standing, unchanged.
- **A mounted companion may take the GM to another of ITS OWN tabs, through `navigateToTab(tabId)`.**
A companion could already draw a control naming another of its screens and had no way to reach it, so the control was either absent or dead.
Core performs exactly the navigation the rail sub-item's own click performs, rather than a second one: asking for the tab already on screen re-activates it through `onRouteReselect` instead of remounting, any other tab is offered to that mount's own `onBeforeNavigate` guard with reason `'tab'` and may still be vetoed, and an allowed move expands the rail group and activates the view.
It answers `true` when the request was honoured, which includes the re-activation, `false` when it was refused, and a promise of either whenever the guard answers asynchronously.
- **It reaches this provider's own registered tabs and nothing else.**
Another provider's surface, a Core route, and an id this provider never declared are all refused, which is the mirror of the rule that the destination is Core's business: a companion may ask for the screens it owns, and Core's routing is not a public control surface.
Membership is resolved from the REGISTERED provider rather than from whatever Core is currently rendering, so the answer never depends on render state and Core's own fallback tab ids are unreachable through it.
A call from a context whose mount has ended returns `false` and moves nobody, the same lifecycle rule `setRouteChrome` already has, and for a stronger reason: repainting a header the GM has left is cosmetic, and dragging them off the screen they chose is not.
- **A navigation asked for while the companion's own guard answer is outstanding is refused.**
`navigateToTab` called from inside an `onBeforeNavigate` handler's own body, or while a promise that handler returned is still pending, answers `false` and moves nobody.
It is deliberately NOT folded into the pending-answer sharing above: that rule de-duplicates two navigations CORE raised concurrently, where one GM decision answers both, and here the companion is both the party being asked and the party asking, about a different destination.
Nesting the inner navigation would re-enter the same guard without bound when a companion always redirects, and would commit the inner route ahead of a veto that is still pending when it redirects conditionally.
A companion that wants to redirect asks after it has answered, because a redirect is a consequence of the decision rather than part of making it.
- **A well-formed tab id this provider does not declare answers `false` rather than throwing, and malformed input throws.**
Membership is a runtime fact that moves under a companion — a provider may re-register with a different tab set, and a conditional tab may not exist yet — so an unknown id is a question a companion may legitimately ask rather than a coding error, and throwing would make Core's own re-registration raise from a companion's correct code.
A non-string or empty id can never be a runtime question, so it is refused with a deterministic `TypeError` and changes nothing, exactly as a malformed chrome update is.
- Core calls cleanup exactly once while the target is connected and before a tab, provider, route, or window removes it.
- Mount and cleanup faults are reported and contained; partial content is cleared, the Core preview becomes the fallback for the whole surface including its rail entries, and a later registration may mount without navigating away.
- When a provider registers, unregisters, or re-registers with a different tab set, an active tab id the new set no longer declares falls back to that set's first tab rather than leaving an empty panel.
- The Manager rail's Downtime children render the active tab set — the provider's tabs, or Core's fallback tabs when no provider holds the surface — from one list.
**Core's panel tab strip belongs to Core's preview and is rendered in core-fallback mode only**, so in provider mode a tab set is rendered exactly once, as rail sub-items.
Core's premium padlocks and rail note advertise Core's preview and are not rendered when a provider holds the surface.
- The Manager title bar carries a gold `PREMIUM` badge when, and only when, at least one provider is registered on any surface id, **in either registry**.
- The signal is a claim about the companion module rather than about Core's Downtime route, so a provider claiming a surface Core does not render lights it too, and **a companion that registers only a player-window surface lights it as well**.
The free module renders nothing in that slot, and the title bar names no crafting system: the rail's crafting-system selector already does.
- The rail's Downtime `PREMIUM` chip is prominent while Core's preview holds the surface and MUTED, not removed, while a provider holds it — except while a nonzero Downtime rollup shows, which takes the parent row's single trailing track for as long as it shows — so the loud signal is stated once and the rail still names the premium route.
The exception is bounded to that one row and that one state, and it costs the GM no information: a rollup requires a provider registered on a Manager surface, and the title bar's badge above is rendered whenever at least one provider is registered in either registry, so the installed fact is stated in the window throughout.
The Downtime rail entry's tooltip states the installed condition rather than an unlock offer whenever a provider holds the surface.
- Fabricate publishes observational hooks — `fabricate.manager.navProviderRegistered`, `fabricate.manager.navProviderUnregistered`, `fabricate.manager.surfaceMounted`, `fabricate.manager.surfaceUnmounted`, and `fabricate.manager.surfaceTabChanged` — exposed on `game.fabricate.api.HOOKS.manager`.
A listener's return value is ignored and nothing a listener does changes what the Manager renders.
- Core owns the Manager shell, GM gate, World rail/route/focus state, target, and teardown.
- The companion owns its content, localization, authorization, domain data, persistence, and created resources, and mounts only into the supplied target.
- A companion does not patch Manager DOM or use Foundry render hooks.
- **Core's preview tablist**, which exists in core-fallback mode only, is labelled and uses native buttons, roving tabindex, stable tab/panel IDREFs, localized accessible names, keyboard-visible tooltips, and Left/Right/Home/End focus-and-activation.
- **The rail's Downtime children are not a tablist in either mode.**
They stay native `button` elements carrying `aria-current`, and they do not take `role="tab"`, `aria-selected` or `aria-controls`: the group stays rendered after the GM navigates away, so those attributes would dangle and would announce a route-changing control as an unselected tab; activation routes through the unsaved-draft route-exit confirmation whenever it navigates — re-activating the tab already on screen exits no route and is covered by the re-activation requirement above — which an automatic-activation tablist would fire on every arrow keypress; a horizontal strip's key model cannot be preserved on a vertical rail in any case; and Downtime's children are visually and structurally identical to those of the other rail groups, which are plain buttons.
- **In provider mode the companion panel is a `region`**, and carries `tabindex="-1"` rather than `tabindex="0"`: the focus stop existed to scroll the panel, and a companion that owns its layout owns that scrolling, so what remains is programmatic focusability.
**The region takes the active tab's visible `label` as its name**, by pointing `aria-labelledby` at the label element inside the rail sub-item rather than at the sub-item itself, because a landmark inherits the whole accessible name of what it points at and the sub-item's name is an action rather than a screen.
That label element exists only while the Downtime rail group is expanded, so the panel's accessible name depends on the rail lock below staying in force; removing the lock without also repointing this labelling breaks the region's name, not merely its keyboard reach.
- **A provider's `label`, `accessibleName` and `tooltip` all land on the rail sub-item**, which in provider mode is the only control naming the active screen: `label` is its visible text, `accessibleName` is its `aria-label` and therefore replaces that text as its accessible name, and `tooltip` is its native tooltip, pointer-visible rather than keyboard-visible.
A badge's `accessibleName` follows the same rule as `label`: it is final display text, rendered verbatim, and is never treated as a lang key.
This is newly stated for the Manager registry, which has not previously carried the verbatim rule in canonical text for any field.
`accessibleName` and `tooltip` remain required, because Core's preview strip consumes the same two fields as an accessible name and a keyboard-visible tooltip.
- **A provider tab may declare a badge**, `{ count, accessibleName }`, where `count` is a non-negative safe integer and `accessibleName` is a non-empty localized string.
Both are required when a badge is present, and no other key is accepted.
- **Core renders a badge on the Manager rail sub-item through its own record-count marker**, a bare mono numeral in the row's trailing track, in provider mode only.
`count: 0` renders `0`: a stated zero is a positive statement about a tab, distinguishable from a tab that stated no count at all.
- **A badge is announced as a DESCRIPTION, never as a name.**
The badge element carries `role="img"` and the badge's `accessibleName`, and the sub-item points `aria-describedby` at it; the sub-item's own accessible name remains the tab's `accessibleName`.
No `aria-describedby` is present when no badge is rendered, and the badge element is never a descendant of the element that names the companion's panel region.
- **`game.fabricate.api.managerExtensions.setWorldNavTabBadge(surfaceId, tabId, badge)` changes a badge at runtime, with no mount and no remount.**
It returns `true` when the surface is held by a provider that declares that tab and `false` otherwise, storing nothing.
A malformed badge throws a `TypeError` and changes nothing, and validation precedes the liveness check, so the refusal is identical whoever sent it.
- **A badge resolves through three layers, in one order**: the runtime badge, then the tab's registered badge, then none.
`null` clears the runtime layer and restores the registered badge; an explicit `{ count: 0, accessibleName }` is a positive zero and does not fall back.
- **A runtime badge is scoped to the registration and dropped with it.**
It survives mount, unmount, tab change, route change and window state, and it does not survive its provider leaving the registry, so a re-registered provider starts from its own registered badges.
- **The Downtime rail parent carries a rollup while its children are hidden.**
Core sums the **resolved** badge count once per tab the rail renders — never the registered and runtime layers added together — suppresses the mark entirely at zero, and renders it as the rail's issue-summary pill with `role="img"` and a Core-owned name that states the total generically, because Core cannot compose a companion's localized noun across tabs.
It renders in provider mode only, and only while the group is collapsed **or** the rail is collapsed; the collapsed rail is the state in which it is the group's only remaining signal, so neither condition alone is sufficient.
While it shows it takes the parent's single trailing track, and the rail's muted `PREMIUM` chip is not rendered — the carve-out recorded against the chip rule above.
- **The parent row's own accessible name states the rollup while the rollup shows**, because that row's `aria-label` replaces its subtree and would otherwise silence the mark, and it reverts to the plain route name in every other state.
The composed name is one localized string taking the row's label and the total as tokens, so no locale is forced into English word order and the row's noun has exactly one source.
- **The player navigation seam is unchanged by all of the above.**
It gains no badge, its tab contract stays permissive, and §Player Navigation Extension's "no premium signal in any state" ruling is untouched.
- **Entering the route in provider mode scrolls the active Downtime sub-item into view**, so the route's first visible state shows the current screen's rail item rather than none of the group; it scrolls by the smallest amount that reveals it, and repeats only when the active tab changes.
- **Focus recovery on a provider change is mode-aware.**
When a registration, deregistration or contained fault removes the node that held focus, and focus was inside the route's panel, Core focuses whichever element names the active tab in the mode now live: the panel region in provider mode, and Core's own tab button in core-fallback.
It is not a tab-switch behaviour and does not fire on one.
- **The rail is locked expanded on the Downtime route in provider mode, and the lock is display-only.**
The predicate is the route AND provider mode together, never the route alone: core-fallback keeps its tab strip, is never stranded, and keeps its collapsible rail.
The lock exists because the 56px rail hides the navigation submenu outright, which with no tab strip leaves zero reachable tab switchers and removes them from the accessibility tree as well as from the pointer.
It flips live when a provider registers or deregisters mid-session.
**It never writes the GM's stored `managerRailCollapsed` client preference**; Core derives the displayed collapse state instead and restores the stored state on leaving the route.
Under the lock both rail-collapse controls render `disabled` and `aria-disabled` with an explanatory title of their own — a sidebar-wide string, not the section-scoped one the rail groups use — and every one of their state attributes reads the displayed value rather than the stored one.
- **The companion panel is a bare box in provider mode**, and this is the Manager counterpart of the player seam's panel contract.
It is full height, with no padding, background, scroller or containment of its own; the companion supplies its own inset, and Core's preview inset is not applied over a provider's screens.
Core states the height at every link between the route's definite-height host and the mount target, so `height: 100%` on a companion's own root resolves against a real height rather than silently becoming content height.
The height is reachable, not forced: a companion that states no height renders at content height with Core's panel scroller behind it.
- Core's panel scroller keeps working for any companion whose content overflows its root **visibly** — including one that takes the full height.
It stops rescuing a companion the moment that companion absorbs its own content: by giving its root a non-`visible` overflow, or by letting a definite-height flex or grid root shrink its children, which squashes them rather than scrolling them.
Height alone does not remove the fallback.
A companion that intends to own its layout should own its scroller explicitly rather than infer one from its height.
- **The panel's block size is definite at every Manager width; its inline size is not guaranteed.**
The World Downtime route is exempt from the shared narrow-width `.manager-body` stack, and that exemption is what keeps the host a definite-height grid rather than a content-sized one, so a later responsive change must preserve it.
Core enforces no minimum Manager window size and makes no no-horizontal-overflow promise for this panel — explicitly unlike the player seam, whose equivalent guarantee is stated at the player window's enforced 1024x640 floor.
Responsive behaviour inside the target is the companion's, and a companion wanting container queries declares its own container on its own root.
- **The Manager root is a containing block and a stacking context, and both reach into the panel.**
`container-type: inline-size` on the Manager root means a `position: fixed` descendant of the target positions against the Manager rather than the viewport, and `isolation: isolate` means an element inside the target at the maximum z-index still loses to a `body`-level element above the Manager.
Content that must paint above anything outside the Manager is portalled outside the Manager element.
- **Theme tokens reach the panel by inheritance rather than by a stamped attribute**, because the Manager mounts lazily and carries no theme attribute of its own, so a companion reading the custom properties live re-skins with no remount and one snapshotting them into JavaScript at mount does not; content a companion renders outside the Manager subtree inherits the document's tokens instead.
- **The `--fab-tag-*` tint family is available to a companion, and it is wider than the set Core offers a GM.**
Every theme defines the whole family, so a companion tinting its own content references a token rather than a hex and re-skins with the theme under the inheritance rule above.
Core's colour pickers offer only the keys enumerated in `src/ui/svelte/util/managerColorTokens.js`; the remainder are decorative tints Core uses at fixed sites and never presents as a choice.
Adding a tint to the stylesheet therefore does not add it to any picker, and a token's presence in the family is not a claim that a GM can select it.
- **Once a companion owns the scrolling, any scroll container it creates is its own keyboard responsibility**, because the panel is no longer the nearest scrollable ancestor and its focus stop no longer scrolls anything.
- The Patreon CTA is `https://www.patreon.com/c/mistersilver`, opens `_blank`, carries `rel="noopener noreferrer"`, uses Font Awesome-only imagery, and remains usable at narrow widths and with the Manager rail collapsed.
- A companion declares Fabricate in `relationships.requires`, which governs dependency availability and activation rather than ordinary-module script priority.
- A companion attempts registration during its own `init`, uses one idempotent `Hooks.once('ready', tryRegister)` fallback only when the API is absent, retains exactly one unregister handle, and treats `tryRegister` as a no-op after success.

### Experimental gate

**This gate is TEMPORARY and is tied to the feature being unreleased, not to a design decision.**
The route exists to host the premium Downtime Studio; both seams the Studio needs are implemented but the Studio itself is in no published release, so until it ships the surface is shown only to a GM who has opted in.
Every requirement in this subsection is removed when the Studio releases; nothing here states a permanent rule about premium surfaces or about extension seams.

- **The whole world `Downtime` rail group renders only while `fabricate.experimentalFeatures` is enabled**: the parent row, its disclosure toggle, its submenu, and therefore every premium signal that rides them — the parent row's `PREMIUM` badge, each sub-item's padlock, and the submenu's `PREMIUM PREVIEW` callout.
  Nothing outside that group names Downtime, so nothing outside it is gated.
- **The Manager title bar's premium badge is NOT gated**, because it is not a Downtime signal: it states that a companion module is registered at all, reads the union of both registries' claimed surface ids, and stays correct for a companion whose only surface is a player-window one.
  A companion that has registered while the gate is shut still lights it.
- **The route is unreachable, not merely unlinked.**
  Both route entries refuse while the gate is shut, so no control anywhere in the Manager reaches the route and nothing can put the GM on it.
  Reachability is enforced at the entries rather than at route normalization, deliberately: normalization is evaluated on every render, so enforcing it there would also govern the case below, where governing it is wrong.
- **Turning the setting off while a GM is on the route hides the rail entry and LEAVES THE OPEN PANEL IN PLACE.**
  The GM keeps the screen they are on, a mounted companion keeps its mount and its unsaved work, no cleanup runs, and nothing prompts — the setting change is not a navigation and is not treated as one.
- **The GM leaves that panel by an ordinary guarded exit, and cannot return.**
  Any other rail entry navigates away exactly as it always did: a mounted companion's `onBeforeNavigate` guard is consulted with reason `route`, a refusal keeps the GM and the draft, and an allowed exit disposes the host once with its target still connected.
  Once they leave, the gate is shut behind them, because the rail entry is gone and both route entries refuse.
- **This is preferred over evicting the GM, and the reason is the companion's unsaved work.**
  Resolving the route away the moment the setting moved would unmount the extension host and run a mounted companion's cleanup without consulting the guard every other exit from this route honours, destroying an in-progress edit with nothing asked.
  A GM's unsaved work is not Fabricate's to discard because a world setting changed, and a stale panel that the next click clears costs nothing by comparison.
- **Registration is never gated and never blamed.**
  A companion registers at `ready` and cannot know a per-world setting, so the registries validate and store exactly as they do with the gate open, `fabricate.manager.navProviderRegistered` still fires, the provider keeps its unregister handle, and Fabricate raises no error, warning or notification about it.
- **What a gated companion observes is an ABSENCE.**
  `mount` is never called, so no cleanup runs and none of `fabricate.manager.surfaceMounted`, `fabricate.manager.surfaceUnmounted` or `fabricate.manager.surfaceTabChanged` fire.
  `requestRemount()` called from a context retained across the gate closing cannot restore the surface, because there is no host to re-render.
- **The gate reaches the player window too, and its player half is stated in §Player Navigation Extension, Experimental gate.**
  The setting is world-scoped, so one GM opt-in governs both windows: while it is off, neither a GM's `World > Downtime` route nor a player's companion `downtime` tabs are shown, and a world that opts in gets both.
  The two halves are enforced independently and their mechanics differ — the player window has no route of its own to make unreachable, no premium signal to withhold, and no route-exit guard to honour — so neither section's requirements may be read onto the other.

## Player Navigation Extension

- The seam is general and keyed by surface id.
It is not a downtime feature; Downtime is its first consumer.
- One page-session API-v1 registry is published as `game.fabricate.api.playerExtensions.registerPlayerNavProvider(provider)` and survives the `init` and `ready` API rebinding.
- The registry holds at most one provider per surface id, rejects only a second provider for the same surface, and never enumerates the ids it ACCEPTS.
Core renders every registered surface, with the single temporary exception of the `downtime` surface while the experimental gate below is shut.
That exception is one named id Core WITHHOLDS and is not an allowlist: every other surface id is rendered on registration alone, and no id is privileged into being rendered.
- **A surface snapshot is the frozen `{ surfaceId, provider }` set Core derives from the registry**, in the registry's own registration order, re-derived on every registration, unregistration and re-registration.
The snapshot rather than the registry is what the player window renders, and it is the unit the fallback and fault rules below are written against.
- **A player surface id is the registering provider's own `id`.**
The registry keys on it, Core has no player route of its own to name a surface independently, and the two are therefore always equal — including in the hook payloads, which carry both `surfaceId` and `providerId` so the payload shape matches the Manager seam's.
- A provider is `{ apiVersion: 1, id, tabs, mount }`.
It declares its own tabs: any ids, at least one of them, rendered in array order.
- Core validates tab shape only — a non-empty id unique within the set, a `label`, a Font Awesome `icon`, and optional non-empty `accessibleName` and `tooltip` — and never tab membership, count or order.
- **Core addresses a provider tab by a composed route key `ext:<surfaceId>:<tabId>`** rather than by its bare tab id, which is what makes a collision with a Core tab id structurally impossible without Core learning a single provider id.
The route key is what the active-tab state, the rail button's selection attribute and the window's tab query all carry.
The provider id and every tab id match a lowercase alphanumeric-and-hyphen charset bounded in length, because that composed key is rendered into an HTML `id`, an IDREF token list, a `data-` attribute value and a query parameter.
This constrains the shape of an id, not the set of ids Core accepts.
- **`label` is final display text.**
Core renders a provider's `label` verbatim and localizes only its own tab labels, exactly as the Manager seam does.
**`icon` is a full Font Awesome class list**, rendered verbatim, and Core prefixes the family only for its own tabs.
- **Core reads only the documented tab fields.**
Any other field on a provider tab is ignored, so a field Core does not validate can never reach the rendered rail.
- A player provider **adds** tabs and never replaces Core content.
It carries no route chrome and no header actions, because the player window has no route header, breadcrumb trail or header-action group.
- A conflicting provider on the same surface, an unsupported version, an empty or duplicated tab set, a malformed tab, an id outside the permitted shape, or an asynchronous mount fails with a deterministic error.
- `mount({ target, tabId, context })` is synchronous and returns a cleanup function or nothing.
`tabId` is always the provider's own bare tab id, never the route key.
- `context` is frozen, replaced rather than mutated, and carries `{ schemaVersion, surface: 'player', surfaceId, tabId, actorId, isGM, revision, requestRemount }` and no Core store, document or component.
`actorId` is the shared Actor selection top bar's current selection or `null`; `isGM` is presentation and never an authorization gate, **and it is true for assistant GMs as well as GMs**; `requestRemount()` asks Core to run the current cleanup, clear the target, and call `mount` again with a fresh context whose `revision` has advanced.
**A new context identity is produced when and only when one of those values changes**, so a republication that leaves a surface's values unchanged — opening the window, or any other companion registering, unregistering or re-registering — does not remount a live companion.
- **Core applies no PER-USER visibility or permission gate to a provider tab.**
Unlike the Manager seam the player window has no GM gate, so every user who can open the window sees the same tabs as every other user: two players never see different rails.
Any GM-only, owner-only or entitlement-scoped presentation happens inside the companion's own mount, and Core renders no per-user gating hook in v1.
The temporary experimental gate below is not an exception to this: it is world-scoped, so it withholds its surface from every user of that world at once, or from none.
- **The player window carries no premium signal in any state.**
No badge, no padlocked entry, no teaser tab, no upgrade offer and no subscription call to action, whether or not a companion is installed.
A companion tab exists only while its provider is registered; Core renders no placeholder for an absent companion, so a user without the companion installed sees no indication that the surface exists.
A Core error state for a faulted surface is diagnostic, not promotional, and names no product.
- Core calls cleanup exactly once while the target is still connected and before a tab switch, provider change, or window close removes it.
That holds on **every** path that ends a mount — a tab change within the same surface, a tab change away to a Core tab, a tab change to a different surface, the active provider unregistering under its own live tab, and window close — including a programmatic selection Core makes on the user's behalf.
Core reaches the disposal from outside the mounted subtree, before the state change that removes it, and the disposal is idempotent, so a second caller reaching it does not change the exactly-once count.
A teardown that runs as part of the subtree's own destruction is a leak net and never a connected-target path, because the subtree's DOM is removed before its teardowns run; on window close the player application therefore disposes before the Svelte root is unmounted and `ApplicationV2` removes the window element.
- Mount and cleanup faults are reported and contained.
Partial content is cleared, **the faulted surface's tabs remain in the rail**, the active tab does not move, and Core renders its own error state in the panel naming the provider.
The provider keeps its registration so a later snapshot may mount without the companion re-registering.
Focus is recovered onto the surface's rail button rather than being lost to the document body.
- **A fault is recorded against the whole surface, not against the tab that threw.**
Core keys it on the `(surfaceId, provider)` pair, so after one tab's mount fails every other tab of that same provider also renders the Core error state and Core attempts no further mount for it.
Containment is deliberately at the provider's granularity: Core cannot tell a tab-specific failure apart from a broken provider, and retrying the sibling tabs of a provider that has already thrown would simply repeat the fault.
- **A recorded fault clears on exactly two paths, and re-registering the identical provider object is neither of them.**
A new snapshot carrying a **different provider object** for the surface clears it, which is what "a later snapshot may mount" means, so a companion recovering from a fault registers a fresh provider object rather than the one that threw.
**Closing and reopening the player window clears it too**: the record lives on the window's shell, closing discards the shell, and the next open therefore mounts the same provider object with nothing recorded against it.
That second path is the recovery Core's own error state promises the user in words, so it is a requirement rather than an artefact of where the record happens to sit.
Bringing an already-open window to the front is not a reopen — the shell and its record both survive it — and clears nothing.
- When a provider registers, unregisters, or re-registers with a different tab set, an active route key the new set no longer offers falls back to the default Core tab rather than leaving an empty panel.
- **The rail button is a native button with a tab role inside a vertically-oriented tablist.**
Its accessible name is its visible label; a supplied `accessibleName` replaces that name and must therefore contain the visible label text, and a supplied `tooltip` is exposed through `aria-describedby`.
Rail buttons carry stable per-tab identity, `aria-controls` referencing the content panel, roving `tabindex`, and Up/Down/Home/End focus-and-activation; the content panel is labelled by the active rail button.
The visible rail label truncates with an ellipsis rather than overflowing its button, and the untruncated text is what `accessibleName` and `tooltip` are for.
- **Core guarantees the rail and the extension panel's geometry, and that neither the rail nor the panel overflows horizontally at the player window's enforced 1024x640 minimum size** (§Responsive Product UI).
The rail-label truncation above is what makes that hold for a provider label of any length.
The extension panel is full-height with no padding, background, scroller or containment of its own: `.fabricate-app-content` owns the scroll, and Core establishes no CSS container so a companion's fixed-position content positions against the viewport.
Responsive behaviour of content _inside_ the target is the companion's, and a companion that wants container queries declares its own container on its own root, whose inline size is the panel's.
- Core owns the player window shell, nav rail, active-tab state, target and teardown, and exactly one **subscriber** per window reads each registry.
- The companion owns its content, localization, authorization, domain data, persistence and created resources, and mounts only into the supplied target.
It does not patch player-window DOM or use Foundry render hooks.
- Fabricate publishes observational hooks — `fabricate.player.navProviderRegistered`, `fabricate.player.navProviderUnregistered`, `fabricate.player.surfaceMounted`, `fabricate.player.surfaceUnmounted`, and `fabricate.player.surfaceTabChanged` — exposed on `game.fabricate.api.HOOKS.player`.
A listener's return value is ignored and nothing a listener does changes what the player window renders.
- A companion declares Fabricate in `relationships.requires`, attempts registration during its own `init`, uses one idempotent ready fallback **armed from inside `init` rather than at ESM top level**, retains exactly one unregister handle, and treats its registration attempt as a no-op after success.
- **A provider tab is not a system feature and is not crafting-system-scoped**, so the rule that Core hides controls for disabled features does not read onto this seam.
- The seam creates, reads and writes no record, setting, flag, actor data or world state of its own.
It READS one — `fabricate.experimentalFeatures`, for the temporary gate below — and writes none.
It adds no entry to the Data Storage lists below.

### Experimental gate

**This gate is TEMPORARY and is tied to the feature being unreleased, not to a design decision.**
The `downtime` surface exists to host the premium Downtime Studio, the Studio is in no published release, and the Manager's own `World > Downtime` route is already withheld from a GM who has not opted in.
A player window that kept rendering the companion's tabs would advertise the very feature that Manager gate exists to withhold, so one world setting governs both windows.
Every requirement in this subsection is removed when the Studio releases; nothing here states a permanent rule about premium surfaces, about extension seams, or about privileging a surface id.

- **The `downtime` player surface is rendered only while `fabricate.experimentalFeatures` is enabled**, and it is the only id the gate names.
  Every other registered surface renders on registration alone, gate open or shut.
- **A withheld surface leaves the derived surface snapshot entirely**, which is what withholds its tabs: the snapshot is what both the rail and the panel are built from.
- **Nothing is rendered in its place.**
  The player window carries no premium signal in any state, so a withheld surface and an absent companion are indistinguishable from the rail, and no placeholder, teaser or upgrade offer marks the difference.
- **Its tabs are unreachable, not merely unlinked.**
  A route key addressing a withheld surface is refused wherever Core accepts one — the window's initial tab, its programmatic tab selection, and the tab a caller opens the window on — so no path puts a player on a route the rail does not offer.
- **The gate takes effect on the next surface snapshot: the next window open, or the next registry publication.**
  It is not pushed into an open window, and a player standing on a companion tab when the setting changes keeps the screen they are on until then.
  This is deliberate and has the same reason the Manager's gate leaves its open panel in place: resolving the route away the moment the setting moved would run a mounted companion's cleanup and discard its unsaved work because a world setting changed.
  Until that snapshot the rail may still render the withheld tab it has already been given, and selecting it is refused all the same: the route tests read the gate LIVE, so a stale rail entry cannot put a player back onto a withheld surface, and the player who was already on it is the only one who sees it.
- **Registration is never gated and never blamed.**
  A companion registers at `ready` and cannot know a per-world setting, so the registry validates and stores exactly as it does with the gate open, `fabricate.player.navProviderRegistered` still fires, the provider keeps its unregister handle, and Fabricate raises no error, warning or notification about it.
  The same registration renders the moment the world opts in, with no re-registration.
- **What a gated companion observes is an ABSENCE.**
  `mount` is never called, so no cleanup runs and none of `fabricate.player.surfaceMounted`, `fabricate.player.surfaceUnmounted` or `fabricate.player.surfaceTabChanged` fire.

## Data Storage (UI-relevant)

All keys below use the literal `fabricate.*` namespace.

World settings:

- `fabricate.craftingSystems`
- `fabricate.recipes`
- `fabricate.gatheringEnvironments`
- `fabricate.gatheringConfig`
- `fabricate.gatheringParties`
- `fabricate.currencyConfig`
- `fabricate.migrationVersion`
- `fabricate.theme`
- `fabricate.experimentalFeatures`

Client settings:

- `fabricate.interactionPromptPosition`
- `fabricate.lastCraftingActor`
- `fabricate.lastGatheringActor`
- `fabricate.lastComponentSources`
- `fabricate.lastManagedCraftingSystem`
- `fabricate.managerRailCollapsed`
- `fabricate.lastAlchemySystem`
- `fabricate.favouriteRecipes`
- `fabricate.gatheringHideUnavailableEnvironments`

User settings (per user, per world):

- `fabricate.progressiveResultOrder` (scope `user`; an awaited, replicated document write, not a fire-and-forget local preference — issue #651)

Actor flags:

- `flags.fabricate.learnedRecipes`
- `flags.fabricate.craftingRuns`
- `flags.fabricate.salvageRuns` (`{ active, history }`, defined canonically in `recipes-and-steps`)
- `flags.fabricate.gatheringRuns`
- `flags.fabricate.discoveredGatheringRealms`

Item flags:

- `flags.fabricate.toolBroken` (the authoritative presence-gate disqualifier for a broken tool)
- `flags.fabricate.componentId`
- `flags.fabricate.roles`

Note: the crafting and salvage run containers are physically stored at the doubly-nested path `flags.fabricate.fabricate.<key>` while gathering is single-scoped; the uniform logical notation above is the contract.

## Compatibility

- Must remain system-agnostic.
- Currency adapters are optional.
- Visibility uses Foundry user IDs, ownership, and Fabricate flags/UUID identity rules.
