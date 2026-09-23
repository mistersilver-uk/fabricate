# UI Visual Style

## Purpose

Define the visual style and responsive sizing rules every Fabricate product UI surface follows.
Sibling UI surfaces and the cross-cutting UI rules are indexed by the Surface Map in `ui-integration/spec.md`.

## Product UI Visual Style

Fabricate's Foundry-facing product UI must use a clean flat visual style.

- Product UI surfaces, headers, buttons, overlays, and selected states must not use `linear-gradient`, `radial-gradient`, or `conic-gradient`.
- Full-track semantic value scales may use `linear-gradient` only when the gradient directly communicates the numeric meaning of the control, such as a green-to-red risk slider.
- Use solid colors or RGBA fills for shells, cards, headers, overlays, and controls.
- Visual hierarchy should come from spacing, typography, borders, and restrained shadows rather than decorative gradients or blur-based glass effects.
- Shared `--fab-*` tokens in `styles/fabricate.css` are the source of truth for reusable surface treatments, and they are ONE generation: a token name carries no version or generation marker, and no app-local layer of colour aliases forwards a shared token.
  See `The token namespace is one generation and names its purpose` in `openspec/specs/design-system/spec.md`.
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
  Ship only the weights the product uses (Spectral 600/700, JetBrains Mono 400/500, latin subset), and ship each family's licence file beside it.
  "Uses" is what a computed-style probe of the rendered app resolves, not what a rule mentions: Spectral shipped 400 and 500 faces that nothing ever resolved to, and grep could not tell, because the sheet carries `font-weight: 500` declarations on elements that are not serif (issue 1499).
- `--fab-font-serif` sets **names and headings**: an entity's name wherever it is named (browser rows, inspector titles, the rail's selected-system card), section and card titles, and the inputs that author a name.
- `--fab-font-mono` sets **every numeric**: quantities, DC values, counts and count badges, step and order indices, and durations.
  A mono numeric surface must also set `font-variant-numeric: tabular-nums`, so a value changing width (9 → 10) cannot shift the control beside it.
- A control whose text is words rather than a number stays in the UI face even when it sits in a numeric slot — the mono face marks a number, it does not decorate a pill.

### Spacing scale

Product UI padding, margin, and gap spacing must derive from a shared 4px-based spacing scale declared in the `:root` block of `styles/fabricate.css` rather than from raw pixel literals.

- The numeric tokens `--fab-space-1` (4px) through `--fab-space-6` (24px), `--fab-space-5` (20px) among them, are the whole published scale.
  Five semantic aliases (`--fab-space-xs`, `-sm`, `-md`, `-lg`, `-xl`) were published beside them and are deleted (issue 1499).
  Nothing under `styles/` or `src/` ever read one, and a second ladder over the same values invites a second convention while naming nothing the numeric token does not.
- Two fine tokens cover dense optical spacing with zero visual shift: `--fab-space-2xs` (2px) for hairline spacing and `--fab-space-chip` (6px) for chip and icon+label gaps.
- Documented literal exemptions that must NOT be tokenized: `1px` hairlines (borders, dividers, and `-1px` overlap bleeds) and one-off fixed dimensions in the 34–42px range (search-input icon clearances and grid-alignment offsets) where the value reserves space for a fixed element rather than expressing spacing rhythm.
- Positioning offsets (`left`/`right`/`top`/`bottom`), `width`/`height`, `border-*` widths, `border-radius`, `grid-template-columns` track sizes, `@container`/media breakpoints, and font sizes are not spacing-scale members and MUST NOT be derived from `--fab-space-*`.
  They are written as literals by default; `Geometry comes from the published ladders` in `openspec/specs/design-system/spec.md` states the narrow case in which one of them is tokenized instead, and what such a token must record.

### Shared product UI primitives

The `design-system` capability is the canonical record of the RULES that set obeys: its canonical geometry ladders, its Svelte APIs, the rules that route a near-neighbour case to the right primitive, and the recipes that compose them into the browse, editor and player screen archetypes.
The set ITSELF is enumerated in `openspec/specs/design-system/library.html`, one primitive per `div.spec-head > h4` heading, each rendered at its canonical geometry; that file is part of the capability rather than a companion to it, and it is the artifact to open when a written geometry needs to be seen rather than read.
This section states the RULE that a repeated thing is one primitive; `design-system` states what the set IS, and a change that adds or alters a shared primitive adds its specimen to that library and, once the primitive ships, its row to `scripts/lib/designSystemPrimitives.json`, in the same change.

Wherever two or more product UI surfaces perform the same function, represent the same knowledge, or implement the same layout, that thing MUST be a single shared primitive Svelte component every site imports.
The subject is every product surface — the GM manager and the player crafting, alchemy, gathering, inventory, and Journal surfaces alike — because two surfaces rendering the same meaning are duplicates whichever audience they face.
A shared CSS class that each site hand-rolls markup against does not satisfy this, and neither does a copy.
Adding flexibility to the primitive that already owns the meaning takes precedence over introducing a second component that owns half of it.
A primitive that coexists with unconverted duplicates has added a variant rather than removed one.

A primitive's CSS MUST live in its own scoped `<style>` block rather than in `styles/fabricate.css`.
Required-screenshot detection maps changed file paths to affected views, so global-sheet styling makes every tweak look like a global change and demands a wide core frame set, while co-located styling scopes the evidence to the views that actually render the component.
Only two kinds of rule for a primitive stay in the global sheet: what must beat Foundry's host CSS (button geometry, focus rings) and LAYOUT-CONTEXT rules whose subject is reached through an ancestor the component does not render, such as how a specific container places, stretches, or spans the panel.
A SHARED primitive's own class family is the third kind, and it is governed by `design-system`'s rooting requirement rather than by this one: a family written in a scoped block compiles unlayered against a sheet imported at `layer(modules)`, out-ranks every global rule at any specificity, and is invisible to the gate that proves the family is not rooted at a single application.
`ManagerButton`, `Select` and `SortableList` all take that route; `Select` and `SortableList` write no scoped block at all.
A layout-context rule places the primitive and MUST NOT restyle it: no `font-size`, `font-family`, `font-weight`, `border`, `border-radius`, or `background`.
The player crafting app's requirement rail, requirement tile, essence pool, consumption-plan panel, and essence-contribution chip are held to that CSS rule as player-side primitives, which is why they added no rules to `styles/fabricate.css`.

Seven live non-conformances are recorded here rather than left to be discovered, because a rule whose exceptions are unwritten is a rule nobody can rely on.
Eight bullets follow: the `CollapsibleGroupHeader` one states which primitive owns which shape and records no non-conformance of its own.

- `FillBar` now EXISTS at `src/ui/svelte/components/FillBar.svelte`, and `src/ui/svelte/apps/gathering/ChanceBar.svelte` is REBUILT on it rather than widened: `ChanceBar` is a percentage instrument and does not own the have/need meaning, so widening it in place would have made it the second component owning half a meaning rather than the primitive that owns one.
  `FillBar` is a LEAF — it renders the track and the value-width fill and declares no `role` or `aria-*`, because the accessible semantics differ per site (`ChanceBar` is a `meter` with its own `aria-valuenow`; an odds row's bar is decorative).
  A caller whose colour is authored DATA, or whose scale is its own domain meaning rather than one of the semantic tones, passes it inline through `color`; `ChanceBar`'s reversed four-step event scale travels that way as ONE inherited custom property, so the tier colours stay in the stylesheet that owns them.
  FOUR unconverted sites remain and are a debt with a named owner rather than an accepted state: `GatheringTaskDrops.svelte`, `RunCard.svelte`, `ActorSelectTopBar.svelte`, and `EssencePoolPanel.svelte`.
  Conversion of those four stays deferred because it would drag their screenshot-label sets into a single evidence run.
- `CollapsibleGroupHeader` is explicitly NOT the primitive for a collapsed ROW disclosure; it is a GROUP header, owning a heading, a count and the header band above a set of rows.
  A single purpose-built row disclosure exists instead at `src/ui/svelte/components/RowDisclosure.svelte`, with `aria-expanded`, `aria-controls` and an accessible name, and it is the ONE implementation of the shape it owns — two "labelled regions that expand" landing in one change must share an implementation or name the behavioural mismatch that forbids it.
  There are TWO such shapes, and `design-system`'s "An ordered row opens in place to its editing body" rules both: where the opener is a chevron BESIDE the row's content this component is that control, and where the opener is the WHOLE HEADER the header is itself the button and cannot nest this one, because a button may not contain a button.
  A whole-header row is therefore not an unconverted duplicate of this primitive; it is the other ruled shape, and it takes its accessible name from its own content plus a visually hidden phrase rather than from this component's `label`.
  Measured at issue 1512 it had exactly ONE importer, `apps/manager/ComplicationSummaryRow.svelte`, which is what had kept it out of the shared set: the earlier claim of two shipped consumers counted two Checks Studio surfaces, neither of which imports this component — the collapsed trigger card hand-rolls its own header button, and the right rail's simulator and odds panels never rendered it either.
  Its two consumers are `ComplicationSummaryRow.svelte` and `components/SortableList.svelte`, which renders it as the sole opener of every ordered row, and that second independent importer is what promoted it.
  The rule that a collapsed body stays IN THE DOM under `display: none` rather than being removed is owned by `design-system`'s ordered-row requirement, and it is scoped there to the rows the shared ordered list renders: retention keeps ONE markup tree rather than a second rendering path, holds the uncommitted field state that unmounting discards, and takes the body's controls out of the tab order so a keyboard user cannot land inside a closed row.
  The Checks Studio's collapsed trigger card does NOT satisfy it — measured, `checks/CheckTriggers.svelte` renders its body behind an `{#if}` and unmounts it — so it is an unpaid instance recorded in the bullet below rather than the worked example this sentence used to claim it was.
  A trigger a GM has just ADDED opens, because the collapsed summary is the resting state of a card that already says something.
  It renders a real `<button>`, so a caller nests it beside a row's content and never converts a `role="button"` wrapper around it into a `<button>`, which would nest buttons and land invalid DOM.
- `RowDisclosure` joined the shared set at issue 1512 and carries ONE non-conformance in two halves: it writes its class family in a scoped `<style>` block rather than in the global sheet, and that family is prefixed `fab-row-disclosure` rather than rooted at a `fabricate-` class, which is the form `design-system`'s rooting requirement reads.
  A scoped block compiles unlayered against a sheet imported at `layer(modules)`, so it out-ranks every global rule at any specificity and is invisible to the gate that proves a family is not rooted at one application.
  It is not a manager-only debt: it already paints in the PLAYER window, because its app-side importer `ComplicationSummaryRow.svelte` is itself imported by `apps/crafting/detail/ProgressiveStageList.svelte` and `apps/inventory/bulk/InventoryBulkComplicationGroup.svelte`.
  The successor is the re-root, deliberately outside issue 1512's scope.
  This bullet carries the retention debt named above as well: `checks/CheckTriggers.svelte`'s trigger card and the three whole-header rows issue 1512 repaired all unmount their bodies, and the ordered-row requirement binds retention only for the rows the shared list renders.
  That same card also emits its `aria-controls` while the body is unmounted, which the requirement now forbids a whole-header row — the three repaired rows emit it only while the body is mounted.
  Its phrase also states the disclosure without naming the record, so the card owes three halves rather than two; all three are the card's own and none is discharged here.
- THE manager's labelled push-button exists at `src/ui/svelte/components/ManagerButton.svelte`, taking a `role` from a CLOSED set of six: `neutral`, `primary`, `ghost`, `danger`, `dashed` and `warning`.
  It replaces a CSS CONVENTION — `manager-button` plus a remembered `is-*` modifier — which is exactly the "shared CSS class each site hand-rolls markup against" this section forbids, and which had already drifted: the system Modifiers card painted `Delete modifier` as a neutral verb while the Tool Studio painted the identical verb as danger.
  It was the first primitive here whose own class family lives in the global sheet, issue 1504's `Select` is the second and issue 1512's `SortableList` is the third; all three claim the paragraph above rather than the button-geometry exception the four bullets below claim.
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
  It publishes its rendered DOM node as a bindable `element`, spelled as `Chip.svelte` spells it because it is the same capability: `bind:this` on a component yields the INSTANCE, so a caller that must measure or focus the control has no other way to reach it, and `SearchablePopover` — which anchors its portaled panel on the trigger's bounding box — is the caller that needs it.
  `ArmedDangerButton` is a CONSUMER of the same CSS contract and NOT of this component: it owns a two-state arm/confirm machine whose danger role is an invariant rather than a caller’s choice, so composing them would push a `class:is-armed`, a second label slot and a keydown/blur contract into a primitive no other site wants.
  No `.svelte` under `src/` renders a raw `class="manager-button"` any longer, with two stated exceptions: `ArmedDangerButton.svelte`'s single site, and `ManagerButton.svelte`'s own two occurrences, which are DOCBLOCK PROSE rather than markup and are named so the source-contract test that pins this does not red on the primitive that satisfies it.
  Three debts remain, each with a named owner and a stated reason rather than an accepted state.
  The first is TWELVE `SearchablePopover` `triggerClass` sites, which hand a class STRING to a popover instead of rendering a control.
  THE TRIGGER CONTRACT NOW HAS A CONVERSION PATH, which is the change issue 1371 made to this debt: `SearchablePopover` takes an opt-in `triggerButton={{ role, size, fullWidth }}` and renders the real `ManagerButton` as its trigger, absent by default so every consumer that does not ask for it renders the bare `<button>` it always rendered.
  The form exists because the imitation could not be completed rather than because thirteen call sites were untidy: the control-height rungs are published against `.manager-button.fab-manager-button.is-size-38`, and `fab-manager-button` is written by the primitive alone, so a `triggerClass` string can never reach one — which is why the world Component catalogue's `+ Register item` restated a height and a corner in `styles/fabricate.css` until it converted, and why those two rules could not be re-chained above the primitive while it did.
  `scoped/WorldComponentCataloguePage.svelte`'s `+ Register item` was the first and only consumer until maintainer ruling M13 (issue 1371, revision 13) removed that action outright — its popover did not list unregistered Foundry Items, and a search by name is not the intended registration flow — so the form now ships with NO consumer.
  It is kept because it is the primitive's contract rather than a site's, and the cascade inventory's converted-site proof is re-pointed or retired rather than left counting a deleted control; population B stays at twelve.
  The remaining twelve stay deferred, and the reason is now a per-site one rather than a contract one: each carries its own sheet rule restating a height or a corner, so converting one re-arbitrates that site's cascade and is a repaint to be measured, not a mechanical edit.
  They are `tools/ToolReplacementTarget.svelte` (two — the empty drop face and the filled tile), `recipe/RecipeToolsSection.svelte`, `recipe/RecipeResultGroupCard.svelte`, `recipe/RecipeResultItemRow.svelte` (composed as a template literal), `recipe/RecipeRoutingAssignment.svelte`, `recipes/RecipeBulkEditPanel.svelte`, `checks/ChecksRightMenu.svelte`, `MapRegionLinkPicker.svelte`, `RealmOverridePicker.svelte`, `ComponentEditView.svelte`, and `component/ComponentComplicationsSection.svelte`'s "Browse macros" trigger.
  `tests/components/manager-button-cascade-inventory.test.js` pins the count and re-derives the converted site from the tree, so a number that moves needs a stated cause rather than a quiet edit.
  The second is ONE accent-primary treatment written as THREE declarations reaching FOUR sites: `styles/fabricate.css`'s `.manager-recipe-browser-inspector-edit, .manager-component-browser-inspector-edit` pair covering the two browser inspectors, the same treatment again on `.manager-header-actions .manager-downtime-unlock`, and a third copy in `BulkEditPanelShell.svelte`'s scoped `.fab-bulk-edit-apply`.
  It stays deferred because "the loudest control on this panel, in the accent" either IS `primary` or is a seventh role, and the set is closed — so it is a vocabulary ruling rather than a conversion, and making it silently by re-pointing three declarations would settle the vocabulary in the stylesheet.
  The third is TWO treatments of one meaning in the Checks Studio, "go to the canonical authoring screen", both carrying the same `fa-arrow-up-right-from-square` glyph and both role-less: `checks/CraftingModifierCatalogueCard.svelte` renders it as a borderless, padding-free accent TEXT LINK through a pass-through class, and `checks/ChecksView.svelte` renders it as a boxed NEUTRAL button at standard control geometry.
  It stays deferred for the same reason as the second: a `link` treatment would be a seventh role, so the pair cannot be reconciled by conversion, and it is a card-head-to-card-body pair rather than two cards, which is why an earlier sweep looked for it among sibling cards and did not find it.
- THE manager's icon-only push-button exists at `src/ui/svelte/components/IconButton.svelte`.
  It replaces the same kind of CSS CONVENTION its labelled sibling replaced — `manager-icon-button`, plus a remembered `type="button"`, plus a remembered `aria-label` — written out by hand at 82 sites across 37 components.
  It takes the accessible name as a REQUIRED-SHAPED `ariaLabel` prop, which is the `design-system` capability's rule for an icon-only control rather than a choice made here, and it is a sharper obligation than any modifier class: a forgotten `is-danger` renders the wrong colour and is eventually seen, while a forgotten `aria-label` renders IDENTICALLY and leaves the control announcing itself as "button" and nothing else, which no frame can photograph.
  Every site's element host was measured by walking each component's Svelte AST, and all 82 were `<button type="button">` — so the host set is ONE and the component takes no `as` prop, unlike `StatusToggle`, whose census found three.
  It carries NO `role` prop, and that is a stated scope line rather than an omission: the icon button's modifiers mix ROLES (`is-danger`, `is-ghost`, `is-primary`) with STATES (`is-locked`, `is-roll-needed`), one shipped site legitimately compounds two of them as the sheet's own declared `.manager-icon-button.is-ghost.is-danger` treatment, and a vocabulary spanning both kinds is a design ruling rather than a mechanical extraction.
  Settling it inside an 82-site sweep whose entire acceptance bar is that no frame moves would land a judgement call where nobody can review it, so every modifier travels as a PASS-THROUGH class exactly as written today and the ruling is left open.
  Like `ManagerButton` it deliberately has NO scoped `<style>` and claims the section's button-geometry exception, for the same reason: emitting exactly the classes `styles/fabricate.css` already styles is what makes converting a correct call site provably a no-op on screen.
  It WAS consequently a MANAGER primitive; issue 1502 rooted its family at `fabricate-icon-button`, the class the component emits, so the sheet paints it wherever it renders and `components/Pagination.svelte` carries it into the player apps.
  The six player-app components that re-theme it through their own `:global(.manager-icon-button)` rules are still CORRECT and are not debt — those rules are injected unlayered and still win at any specificity — and issues 1503 and 1504 are where removing them in favour of the primitive's paint is decided.
  No `.svelte` under `src/` renders a raw `class="manager-icon-button"` any longer, with two stated exceptions.
  `IconButton.svelte`'s own one occurrence is the emission itself.
  `environment/GatheringModifierEditor.svelte`'s three are deferred with a named reason — they are the shared modifier panel's own attach control and its two delete controls, so converting them is one decision about one shared unit rather than the tail of an 82-site sweep — and are pinned by count so a later partial pass fails rather than silently halving a deferral.
  The root's six became three because issue 1707 wrote the panel once and the root now writes the class nowhere; the other three were de-duplicated rather than converted, and no sweep may count them as progress.
- THE manager's card shell exists at `src/ui/svelte/components/InspectorCard.svelte`.
  It replaces the same kind of CSS CONVENTION its two button siblings replaced — `class="manager-inspector-card"` on a `<section>`, and the padding, hairline border, 8px radius, surface fill and stacked gap `styles/fabricate.css` gives it — written out by hand at 80 sites across 20 components.
  Every site's element host was measured by walking each component's Svelte AST, and all 80 were `<section>`, so the host set is ONE and the component takes no `as` prop, unlike `StatusToggle`, whose census found three.
  Nothing about a hand-rolled card renders WRONG, which is the honest difference between this conversion and the icon button's: a card written as a bare `<section>` is visibly not a card, so the convention was self-policing where an accessible name is not.
  What it was not self-policing about is ENUMERATION — a shell nobody can list the callers of is a shell no change to it can be reasoned about — and that is the obligation `tests/inspector-card-source-contract.test.js` now carries.
  Like `ManagerButton` and `IconButton` it deliberately has NO scoped `<style>` and claims this section's exception, for the same reason: emitting exactly the class `styles/fabricate.css` already paints is what makes converting a correct call site provably a no-op on screen.
  It is consequently a MANAGER primitive, and unlike the icon button that consequence is NOT reached in the product: no player-app component renders the shell, directly or through a shared child.
  It carries NO variant prop, and that is a stated scope line rather than an omission.
  The sheet paints three further treatments and anchors them three different ways — on the card's own modifier class (`.manager-checks-card`), on an ANCESTOR (`.manager-checks-rail`, which reaches cards carrying no modifier at all) and on a positioning state (`.is-sticky`, which no component under `src/` writes at all, so the sheet declares it and nothing renders it) — so a closed variant set spanning all three is a design ruling rather than a mechanical extraction, and every modifier travels as a pass-through `class` exactly as written today.
  Its extraction killed a scoped `<style>` rule in THREE components, and only ONE of the three raised `css_unused_selector`.
  Measured against Svelte 5.56.3 with a probe whose only call site is `<Child class="target" />`: a class living only on a component tag is normally pruned and warned about, but the presence anywhere in the same component of a REGULAR ELEMENT carrying either a spread attribute or a `class` whose value is any expression — a template literal included — makes every class selector in that block possibly-matching, so the rule is emitted with the scope hash attached, matches nothing, and `lint:svelte:warnings` stays green.
  The same attribute on a COMPONENT tag does not do it, and neither does a `class:` directive nor a static `class`, so the silencing condition is a property of the elements a component WRITES rather than of the ones it renders.
  An expression-valued `class` on a regular element is ordinary in this codebase, so the silent mode is the DEFAULT rather than the exception, and `tests/components/manager-button-scoped-class-reach.test.js` rather than `lint:svelte:warnings` is what finds it.
  All six dead rules are repaired as `:global(...)` chained so their specificity is unchanged, and `tests/components/manager-button-scoped-class-reach.test.js` covers this primitive as the mechanical guard.
  No `.svelte` under `src/` renders a raw `class="manager-inspector-card"` any longer, with eight stated exceptions.
  `InspectorCard.svelte`'s own two occurrences are the emission itself and one line of prose on the `class` prop.
  `CraftingSystemManagerRoot.svelte`'s four — the systems feature panels — and the gathering inspector rail's twenty-five are deferred with a named reason: issue 1707 relocated them without converting one, so where the root alone was 40% of the 80-site census these twenty-nine are 36%, the two the de-duplication removed being gone rather than converted and the tags at-a-glance card having left with the inspector rail issue 1915 retired.
  The twenty-five are `environment/GatheringTaskInspector.svelte`'s seven, `world/TravelInspector.svelte`'s eight, `environment/GatheringInspectorRail.svelte`'s four, `environment/GatheringEventInspector.svelte`'s three, `environment/GatheringModifierEditor.svelte`'s two and `environment/GatheringRulesInspector.svelte`'s one, and each file is now small enough that a conversion lane can take one screen at a time.
  They stay pinned by count so a later partial pass fails rather than silently reducing a deferral nobody is tracking.
- THE manager's labelled form field exists at `src/ui/svelte/components/Field.svelte`, taking its HOST element from a CLOSED `as` set of three: `label`, `div` and `fieldset`.
  It replaces the same kind of CSS CONVENTION `ManagerButton` replaced — write `manager-field`, then remember which element the field is supposed to be — and it was on 88 elements across 24 components, which is the largest single convention in the manager after the button.
  The host is not a styling variant and that is the whole reason the set is a prop rather than a remembered element: those 88 sites used 56 `<label>`, 31 `<div>` and one `<fieldset>`, and a `<label>` field WRAPS its control and gives it its accessible name while a `<div>` field does not.
  Thirty-one sites depend on not doing it, because they hold two controls, or none, or one that is already named by something else — `environment/CharacterModifierBoundsRow.svelte` and `checks/CraftingModifierCatalogueCard.svelte` both state that reason in their own markup — so flattening a `<div>` field into a `<label>` renders identically and changes what a screen reader announces.
  `as` therefore has NO default: a missing or unrecognised value renders the inert `<div>` and warns, because `label` and `fieldset` both carry behaviour that must never be reached by omission, and `tests/components/field-source-contract.test.js` requires a LITERAL `as` at every call site so the fallback is unreachable from the product.
  The `fieldset` member has ONE caller, `RadioCardGroup.svelte`, and it is a member rather than an allowlisted exception because that site is a genuine grouped control on three counts a `<div>` drops silently: it renders a `<legend>`, it holds a radio group sharing one `name`, and it forwards `disabled`, which on a fieldset disables every descendant control.
  Like `ManagerButton` it deliberately has NO scoped `<style>` and claims the section's layout-context exception to say so: `styles/fabricate.css` owns `.manager-field` and roughly thirty rules that reach through it to the controls inside, and a scoped block here would be a second source of truth for the same box.
  `class` is APPENDED to `manager-field` and never replaces it, and every other attribute — `data-*`, `id`, `for`, `aria-*`, `disabled` — passes through, so a call site keeps its own selectors.
  A VALUELESS attribute must be written `data-x=""` at a call site rather than as a bare `data-x`: a raw element renders the bare form as `data-x=""` while the same token on a component arrives through the rest spread as boolean `true` and renders `data-x="true"`, and that divergence is invisible in a source diff.
  81 of the 88 sites converted, across 23 components; the remaining seven were `CraftingSystemManagerRoot.svelte`'s, and issue 1707 relocated four of them — two into `environment/GatheringModifierEditor.svelte` and two into `environment/GatheringTaskInspector.svelte` — while the de-duplication removed two that were never converted, leaving one in the root, so the deferral is now five sites across three files rather than seven in one.
  It stays deferred per file with a new reason — each file's fields are one screen's form, and a screen-at-a-time conversion is separately reviewable — and pinned by exact count in that source-contract test so the debt cannot sit still and cannot grow; the 11,777-line root every manager lane touches keeps its one.
  Six scoped rules across three components — `GatheringTaskEditView.svelte`, `ImportFolderMappingModal.svelte` and `checks/CraftingModifierCatalogueCard.svelte` — were disconnected by the conversion and repaired as `:global(.manager-field.the-other-class …)`, chained with `.manager-field` so each keeps the specificity its scoped form had rather than dropping a compound.
  Not one of them was pruned, so the compiler warned about none of them and every converted file's emitted CSS was byte-identical to its pre-change output; `tests/components/manager-button-scoped-class-reach.test.js` is the guard that reports the class rather than the gate that missed it, and `<Field>` is a row on that guard’s primitive registry rather than a second copy of its scan.
- THE manager's FILTER BAR exists at `src/ui/svelte/components/ManagerToolbar.svelte` and its SEARCH FIELD at `src/ui/svelte/components/ManagerSearchField.svelte`, and they are TWO components where `design-system/library.html:1370` specifies one.
  The reconciliation is stated rather than resolved silently, because it is a fact about the tree and not a preference: 11 hand-written `class="manager-toolbar"` sections and 23 hand-written `class="manager-search"` labels, and THIRTEEN of the 23 fields sit inside no bar at all — the gathering task editor's four, the access and knowledge rosters, both realm-environment columns, the Tool Studio's library card, the vocabulary panel, the world scope's system-rules roster and the manager root's two.
  One bar (`BooksScrollsView.svelte`) has no field, and one (`GatheringRealmsTab.svelte`) has nothing else.
  A single component owning both, as the library's `query`/`onQueryChange` API implies, would have forced a bar around thirteen fields that have none.
  Every host was measured by walking each component's Svelte AST: all 11 bars are `<section>` and all 23 fields are `<label>`, so neither takes a polymorphism prop, unlike `StatusToggle` and `Field` whose censuses found three element shapes each.
  A raw grep reports TWELVE bars and is wrong — `GatheringTaskEditView.svelte:1784` is a `.manager-toolbar-pills` chip row on a `<div>`, and `\b` matches before a hyphen, so a class-token pattern must terminate `(?![\w-])`.
  The bar owns its CHROME and takes its controls as children, which is the library's second divergence: the filter control is three different things in the shipped corpus — `<label class="manager-filter">` wrapping a `<select>` at 16 sites when the bar was extracted, all converted onto `Select` by issue 1510, a bare `<select>` carrying its own accessible name at 2, and `<SegmentedControl>` at 2 — and no bar is in a position to choose between them.
  The bar does NOT render the row `<div>` either, and that is a correctness line rather than a scope line: `BulkSelectionToolbar.svelte` renders `<div class="{rowClass} is-selection">` in its OWN template, which is how "the selection bar replaces the filter bar in place" is built, and `EssenceBrowserView.svelte` records that contract breaking once already.
  Both take their ACCESSIBLE NAME as a required-shaped `ariaLabel` prop rather than through the rest spread, and `tests/components/manager-filter-bar-source-contract.test.js` gates it at every call site: a `<section>` with no accessible name is not a `region` landmark at all and disappears from the landmark list while rendering identically, and the field's `<label>` wraps an icon and an input and no text, so a field without one is announced as "search" and nothing else.
  Like `ManagerButton`, `IconButton`, `InspectorCard` and `Field`, both deliberately have NO scoped `<style>` and claim this section's exception: `styles/fabricate.css` owns `.manager-toolbar` and `.manager-search`, and emitting exactly the class the sheet already paints is what makes converting a correct call site provably a no-op on screen.
  Neither takes a variant prop.
  The sheet declares four further bar treatments anchored four different ways, and one of them — `.manager-toolbar:not(:has(.manager-toolbar-primary))` — is a branch ALWAYS taken, because no component under `src/` writes `.manager-toolbar-primary` at all, so the grid form it guards is declared and never rendered.
  20 of the 23 fields converted; the remaining THREE are ADJUDICATED OPT-OUTS rather than deferred work, and the distinction matters because a deferral implies the sites are the same and these are not.
  Each renders a `.manager-tag-suggestions` typeahead list as a sibling of the input inside the label, which makes it a combobox belonging to `SearchablePopover.svelte`, and the manager root's two additionally take `bind:this` on the label for popover positioning — which on a COMPONENT tag binds the component instance rather than its host element, so converting either needs an element-ref seam the primitive does not have.
  The root's two are near-identical duplicates of one another, so a later root de-duplication that merged them would legitimately take that pin from 2 to 1 rather than reading as a regression.
  FOUR scoped rules were disconnected by the conversion, and three of the four are the SILENT kind: `scoped/EntityListInspectorFrame.svelte`'s `flex: 0 0 auto` pair, its `.manager-scoped-list-toolbar select` sizing and its `:global(.manager-scoped-list-filter-row.is-selection)` flattening were all emitted with the hash attached, raised no `css_unused_selector`, and left that file's compiled `css.code` BYTE-IDENTICAL — because that component also writes `<div class={TOOLBAR_ROW_CLASS}>`, a regular element with an expression-valued `class`, which makes every class selector in its block possibly-matching.
  The fourth, `scoped/SystemRulesRoster.svelte`'s `.manager-scoped-roster-search`, was PRUNED instead and would have been named by `lint:svelte:warnings`; that file writes no such element, which is the measured difference between the two modes.
  Each is repaired as a `:global(...)` chained onto the class the primitive emits, and each keeps the specificity its scoped form compiled to — (0,2,0), (0,2,1), (0,4,0) and (0,2,0) respectively.
  The `select` rule is the one that shows why the SHAPE of the wrap matters: `:global(ancestor) select` leaves `select` as the only scoped compound, so Svelte stops writing the hash as a zero-weight `:where(...)` and writes a bare class instead, taking the rule from (0,2,1) to (0,3,1) — a cascade change smuggled in as a repair — so the whole descendant selector is wrapped rather than just its ancestor.
  Both primitives are rows on `tests/components/manager-button-scoped-class-reach.test.js` rather than a second copy of its scan, and that guard rather than the css diff or the warning gate is what found three of the four.
  The library entry `<FilterBar>` is recorded as SHIPPED against the bar; `<Search>` is NOT recorded against the field, and that is a judgement rather than an omission — `library.html:649` specifies it as one of three modes sharing ONE shell with a kicker label at height 38 / radius 9, and the shipped pill is 34 / radius 6 with no kicker and no label prop, so the correspondence is not established and belongs to whichever change unifies the three modes.

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

Recorded non-conformance: the recipe, component and Tool Studio inspectors still render their own treatments and are the declared conversion backlog; the Tags & Categories inspector left that backlog by being retired rather than converted (issue 1915), so the count is three.
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
Its test and screenshot hook names, its host row class, its labels and its standing hint are parameters of that primitive, not a reason to fork it.
Where a surface gates that toolbar on an active selection, the toolbar carries the WHOLE register — the tri-state control included — so no part of it is left standing in the filter row it was lifted out of.
The hint is the sentence that keeps the band and the bulk edit panel from competing: the band states the count and names where the bulk actions are, and the panel holds them.
A surface whose bulk body does not render in an inspector states nothing there rather than pointing at a rail it has not got.

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

A bulk edit panel may render a sibling card after the shell.
Apply's dock then clamps to the panel's own box rather than to the rail's bottom edge, and that is accepted.
What is required is that Apply's border box stays wholly within the scrollport at every scroll offset; the guarantee holds while the sibling is shorter than the scrollport, and a sibling taller than it is a reachability failure rather than an accepted configuration.

#### Announcing after a focus move

The keyboard is moved FIRST and the sentence is announced BEHIND it, never the other way round and never in the same task.
A polite announcement is queued speech and a focus change cancels queued speech, so a sentence written into the region before the hop is a sentence the GM may never hear — which is the original silence, with a working focus hop concealing it.
When no focus move happens the sentence is announced immediately, since there is then nothing for it to queue behind.
This ordering governs every live region paired with a focus move in this specification, including the delete card's own outcome.
The validation surface's row action is a caller of this ordering too, and it has two destinations rather than one: the control the issue names, or — where the row named no control, or the one it named could not take the keyboard — the panel the route brought into view.
The sentence names whichever it reached, and is announced behind that move like every other.

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

THE SECOND GATE BINDS FABRICATE'S OWN SOURCE AND NOT ONLY THE CATALOGUE.
A component that hardcodes a Pro-only class is the same reference in code as a catalogue entry naming one, and it is the harder of the two to see, because Foundry's Pro bundle draws it perfectly on every machine the project can test — no rendering check, screenshot or smoke run can find it, and none did.
Every Font Awesome class token in shipped source therefore resolves against the same pinned free release the catalogue was narrowed against, and a name that release does not publish fails the build.
The rule covers the family and style token as well as the name, because a free name worn at a Pro weight is still a Pro reference, and it REFUSES a name assembled from fragments at runtime rather than passing silently over one it cannot read — a guard that skipped what it could not resolve would report the tree as protected while having read less of it than it claims.
Its oracle is Font Awesome's own free release and never the stylesheet a Foundry install serves: that bundle is the Pro build, so a guard reading it would resolve every Pro name, certify it, and give the violation a green tick.
Naming a Pro glyph in prose WITHOUT its class prefix is outside the rule by construction, so documentation can still say which glyph was declined and why.

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
  `ui-extension-points/spec.md` §Player Navigation Extension states its no-horizontal-overflow guarantee at that floor.
- These responsive rules are presentation-only.
  They must not change crafting, gathering, inventory, alchemy, journal, validation, task visibility, attemptability, or persistence behaviour.

### Scenario: Minimum-width player app reaches every narrow layout

- **WHEN** the player application opens at its 1024px minimum width on Inventory, Gathering, Crafting, Alchemy, or Journal
- **THEN** the named layout container has a content-box inline size at most 960px and the rendered grid resolves to one column with its existing narrow-mode behaviour

### Scenario: View Lab capture detects a responsive regression

- **WHEN** a 1024px narrow View Lab case is captured locally or in CI
- **THEN** the capture runner verifies the declared content-box width and one-column computed layout before writing or publishing the screenshot
