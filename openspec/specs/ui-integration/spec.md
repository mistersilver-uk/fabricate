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

Global rule: if a system feature is disabled, controls for that feature are hidden.

## Product UI Visual Style

Fabricate's Foundry-facing product UI must use a clean flat visual style.

- Product UI surfaces, headers, buttons, overlays, and selected states must not use `linear-gradient`, `radial-gradient`, or `conic-gradient`.
- Full-track semantic value scales may use `linear-gradient` only when the gradient directly communicates the numeric meaning of the control, such as a green-to-red risk slider.
- Use solid colors or RGBA fills for shells, cards, headers, overlays, and controls.
- Visual hierarchy should come from spacing, typography, borders, and restrained shadows rather than decorative gradients or blur-based glass effects.
- Shared tokens in `styles/fabricate.css` and app-local editor tokens should be the source of truth for reusable surface treatments.
- Fabricate exposes a global module setting, `fabricate.theme`, for choosing the active product UI colour theme.
- Fabricate exposes a global module setting, `fabricate.experimentalFeatures`, gating experimental surfaces still in development (currently the recipe-graph placeholder).
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

## Responsive Product UI

Foundry ApplicationV2 windows can be resized independently of the browser viewport.
Responsive layout rules for application bodies must therefore be keyed to the app or shell container width, not only to viewport media queries.

- Use CSS container queries for application-specific narrow-window layout changes.
- The GM `Environments` editor responds to the admin main container width: list/editor panes stack, nested task/result/catalyst layouts collapse, independently scrollable regions remain usable, and save actions stay reachable.
- The player `Gathering` app responds to its own app container width: active/history regions collapse to one column, task rows reserve icon width, and row metadata stacks without horizontal overflow.
- The player `Gathering` view's three columns (environments list, centre detail, right inspector) all carry the same non-zero minimum width so the centre column cannot collapse to nothing ahead of the side columns; the three columns scale down together proportionally as the window narrows.
Below the combined three-column minimum the columns reflow into a single vertical stack so the view stays usable instead of clipping or overflowing.
- The unified Fabricate window enforces a minimum window width and height, derived from the gathering view's column minimums plus the navigation rail and chrome, so a resize can never shrink the window below the size where the columns would be clipped.
- These responsive rules are presentation-only.
They must not change gathering runtime semantics, validation behavior, task visibility, attemptability, or persistence.

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
A view must not stack a second header of its own beneath the shell's, restating the system name the breadcrumb and the titlebar's system badge already carry.
- The page title is the manager's display type and carries the weight that buys; the page's single primary action (`Create …`) is taller than a row button.

Selected-system rail:

- The rail's crafting-system card is a **selector**, not a caption: an uppercase micro-label, a real `<select>` listing every crafting system, and an `All crafting systems` link back to the system library.
The GM can switch system from the rail without a round trip through the system library.
- The selected system's name is set in the display face wherever it is named, including as the select's own value.
- The rail does not repeat the product name or a "workspace" caption; the rail's own `GM management` section label already says what the rail is.
- Rail count badges are **bare mono numerals**, right-aligned in the nav row — not bordered pills.
They carry tabular figures so a count changing width (9 → 10) cannot move the row beside it.
- The 56px collapsed rail hides the crafting-system card, the section label and the count numerals, leaving only the icon gutter.

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
The top-level `Checks` rail item (hosting the Crafting / Salvage / Gathering / Validation sub-tabs) and the `Tags & Categories` rail item are fully implemented and **not** experimental-gated.
When `Recipes` is the active route, its `recipe-edit` subroute is treated as part of the Recipes route for navigation, breadcrumb (`Crafting` then `Recipes` then `Edit recipe`), and left-nav active-state purposes — the same sibling-subroute relationship the Essences route has with `essence-edit`.
- The selected-system `Crafting` rail item is an expandable nav group modelled on the Gathering group, shown whenever a crafting system is selected.
The parent row shows an expand/collapse control and the recipe count as its badge.
Activating the parent item opens the Recipes browser by default and expands the submenu only when the active route is outside Crafting; when a Crafting child route is already active, activating the parent item must not navigate away from the current Crafting page, and while a Crafting child route is active the expand/collapse control is locked open — activating it keeps the submenu expanded rather than collapsing it.
The group collapses when the active route leaves Crafting, so its submenu does not dangle open over unrelated views.
The expanded submenu (built by `buildCraftingNavItems`) always contains `Recipes` and `Settings`, plus a **mode-conditional** entry derived from the system's `visibilityMode` (via `craftingEffect`): `Access` appears only in `restricted` mode (`showAccess`), and `Books & Scrolls` appears only in `item` and `knowledge` modes (`showBooksScrolls`); `global` mode shows neither.
The submenu sits inside the same soft grouped container the Gathering group uses, and it carries Gathering-parity accessibility: `aria-expanded`/`aria-controls`/`aria-current`, distinct expand and collapse labels, and unique `manager-nav-crafting` / `manager-crafting-submenu` / `manager-crafting-nav-<id>` ids.
Route exit from any Crafting child route runs through the Manager confirm-discard route-exit guard.
- The `Crafting` group's `Settings` sub-route (`crafting-settings`, component `CraftingSettingsView`) is a real system-settings page, not a placeholder.
It hosts the system-level crafting rules that used to live on the System Overview page: the recipe **resolution mode** card, the salvage **resolution mode** card (only when `features.salvage`), and the **Recipe Visibility** card — a single radio-card selector for the flat `visibilityMode` enum (`global` / `restricted` / `item` / `knowledge`) written through `setVisibilityMode`, paired with a `CraftingEffectPanel` that summarizes what the chosen mode enables.
The Recipe Visibility control no longer lives on the System Overview page, and it authors the flat `visibilityMode` rather than the legacy `listMode` + `knowledge.mode` pair.
Because the `Crafting` nav group is unconditional (issue 745), these controls are reachable for every selected system, independent of `fabricate.experimentalFeatures`.
Per-recipe-item use and learn caps are NOT on this page — each recipe item's caps are authored in its `recipe-item-edit` tabbed editor (or the quick-limit toggle in the `ItemPageInspector` aside).
- The selected-system Gathering rail item shows an expand/collapse control instead of an environment count.
Activating the parent item opens the Environments browser by default and expands the submenu **only when the active route is outside Gathering**; when a Gathering child page or Gathering edit subroute is already active, activating the parent item must not navigate away from the current Gathering page.
Activating only the expand/collapse control toggles the submenu without navigation.
While a Gathering child page or Gathering edit subroute is active, the expand/collapse control is locked: it only toggles (no navigation) and the submenu remains expanded and cannot be collapsed.
The expanded submenu contains Environments, Tasks, Events, Travel, and Settings inside a soft grouped container that does not shift the parent Gathering row, icon, label, or expand/collapse control.
The `Travel` submenu item shows the total party count as its badge.
The Gathering parent row remains visually neutral, and only the selected subsection uses the selected menu-item treatment.
Gathering section navigation must not be duplicated as an in-page horizontal tab strip.
- The selected-system `Tools` rail item is a top-level entry rendered between `Essences` and `Gathering`.
It is always visible when a crafting system is selected and is not gated by the gathering or essences feature flags, because tools are a cross-cutting crafting concept that will be referenced by recipes, salvage, and gathering tasks alike.
- The root `Crafting Systems` breadcrumb returns to the systems browser.
The selected-system breadcrumb opens that system's in-manager System Overview route on its Settings tab.
- The selected-system rail scope shows the selected system name as static text plus a `Return to System Library` icon button.
Activating that button returns to the systems browser without clearing the real selected-system store state.

Rail and count layout:

- The manager left rail can be collapsed to an icon-only strip to reclaim horizontal width for the middle content column; section navigation (System Overview, Recipes, Components, Essences, Tools, the Gathering submenu parent, etc.) remains reachable when collapsed via its section icons, and a localized, keyboard-reachable toggle control switches between expanded and collapsed.
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
- Checks (Crafting / Salvage / Gathering / Validation sub-tabs)
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
- Salvage (`features.salvage`): GM toggle, default on — an absent key defaults true, a present key must be exactly true; gates the salvage subsystem (Checks tab, resolution-mode card, component editor, validation, runtime, and player salvage panel).
- Chat output (`features.chatOutput`): GM toggle, default on; hint "Posts a summary chat card after crafting and gathering attempts." — gates the crafting, salvage, and gathering result chat cards.

#### Feature Controls

- Category list editor for custom categories only; reserved `General` is always present and not removable
- The Tags & Categories screen is a tabbed screen over the three independent vocabularies — recipe categories, component categories, and item tags — with one vocabulary per tab and a per-tab count badge.
Each tab has its own search plus a shown-count chip, a live-validated add form (tone-graded info / success / danger hints as the GM types: lowercase-normalization preview for tags, `General` reserved, duplicate detection, ready-to-add), and a redesigned row carrying a per-category icon, `#`-prefixed tag names, a "Built-in fallback" subtitle on the locked General row, an `N references` / `Unused` / `Locked` badge, and an inline delete-confirm strip for the destructive cascade.
A recipe or component category may carry a persisted per-category icon, edited inline from its row.
- The screen has a right inspector rail: a "Vocabulary at a glance" tile set (recipe categories, component categories, item tags, total references), contextual "How it works" help, and a "Reference-safe by default" reassurance card.
The total-references tile sums all three vocabularies, and a tag's reference count includes the recipe tag-placeholder ingredients that name it, not only the components carrying it.
- Item tag list editor
- Essences toggle (`features.essences`)
- Property macros toggle (`features.propertyMacros`)
- Effect transfer toggle (`features.effectTransfer`)
- Time requirements toggle (`requirements.time.enabled`): GM toggle, default on — an absent key defaults true, a present key must be exactly `false` to disable.
It renders as a tile in the System Settings Optional features section (beside the currency toggle) and gates the recipe Duration surfaces (the single-step Duration card and the per-step duration editor) and the application of recipe/step durations at craft time.
- Currency requirements toggle (`requirements.currency.enabled`)
- Currency unit profile editor (`requirements.currency.units[]`)
- Multi-step recipes toggle (`features.multiStepRecipes`)
- Gathering toggle (`features.gathering`)
- Salvage toggle (`features.salvage`, default on)
- Chat output toggle (`features.chatOutput`, default on)

#### Crafting Check Controls

A check is usable iff its mode carries an authored `rollFormula`; the legacy check-source/macro layer (`macroUuid` / `successMacroUuid` / `failureMacroUuid` / `checkSource` / `builtIn`) was removed by migration 1.8.0 and is not authored.

- Enable checks (the on/off toggle for the optional simple-mode check)
- Roll formula, DC, and tier controls per mode (`simple` / `routed` / `progressive`)
- The simple-mode dynamic-DC macro (`craftingCheck.simple.macroUuid`) — the one surviving check-adjacent macro (it only computes the DC)
- Failure consumption policy — two live-persisting toggles in the non-alchemy crafting sub-tab editing `craftingCheck.consumption.consumeIngredientsOnFail` (default `true`; whether a recipe's ingredients are consumed on a failed crafting check) and `craftingCheck.consumption.breakToolsOnFail` (default `false`; whether required tools break on a failed check — the 1.7.0 rename of `consumeCatalystsOnFail`).
The engine applies this policy on every failed crafting check; it is NOT shown in alchemy mode, where consumption is governed by the distinct `alchemy.consumeOnFail` flag.
Salvage failure consumption is a separate, independently-defaulted policy read from `salvageCraftingCheck.consumption` (`consumeComponentOnFail`, default `true`; `breakToolsOnFail`, default `false`) that this crafting control does not change.
- Optional routed outcomes reference list (for GM guidance only; not a routing map)
- Progressive settings (`awardMode`) (progressive only)

For a `routedByCheck` system whose routed check `type` is `fixed`, the tier `CraftingCheckEditor` hides the DC field and the meet/exceed comparison, because fixed tiers match by explicit value range rather than against a DC.
The DC-hiding note applies to `routedByCheck + fixed` in the `CraftingCheckEditor` only; the DC and comparison stay shown for relative-type `routedByCheck` and for the salvage/gathering check editors.
`routedByIngredients` no longer renders the tier `CraftingCheckEditor` at all — it authors its optional pass/fail check via the shared `SimpleCraftingCheckEditor` (bound to `craftingCheck.simple`), which shows the DC, the meet/exceed comparison, the static/dynamic DC source, and the recipe DC tiers.

Mode semantics are defined in `resolution-modes/spec.md`.
The routed crafting and salvage editors expose a default-off Natural 20/1 tier-stepping toggle only while their routed check type is `relative`.
The control writes `craftingCheck.routed.natStepping` or `salvageCraftingCheck.routed.natStepping`; it is absent for fixed checks and for gathering.

##### Check Tool-Breakage Controls

All three check editors (simple, routed, and progressive) ALWAYS render a single unified `CheckTriggers` editor (issue 419 recombine) — one trigger list per check, replacing the former separate per-die crit table and tool-breakage trigger card.
Each trigger pairs an expressive dice-matching condition with two effects: a themed outcome `<select>` and (under `checkDriven` authority) a break-tools pill.

- The outcome select forces the check to Automatic success / Automatic failure / No effect (relabelled Award all / Award none / No effect on a progressive editor, reusing the existing award keys), and is disabled + pinned to No effect for an `outcomeTier` condition.
Outcome forcing applies under BOTH authorities.
- The per-trigger break-tools pill (and the routed per-tier `outcome.breakTools` column) renders ONLY under `checkDriven` authority (`showBreakTools={checkDriven}`); under `toolSpecific` it is hidden and a check never breaks tools.
- There is no free-text trigger label, no per-block enable toggle, and no natural-1 auto-seed; an empty trigger list is inert and the GM adds triggers explicitly.
Condition types are `rollTotal`, `progressiveValue` (progressive editors only), `diceGroup` aggregate, and `outcomeTier` (routed editors only); dice groups are labelled from the formula, with duplicate `NdS` groups disambiguated (`#1` / `#2`).
- This authority gate applies per subsystem: crafting honours the system authority; salvage is gated on `features.salvage` identically to gathering — its checks tab hides when the feature is off and `salvageBreakageAuthority` falls back to `toolSpecific` (consistent with the gate acknowledged at lines 163 and 960); gathering exposes the per-trigger break-tools control only when `features.gathering === true`, otherwise it stays `toolSpecific`.

#### Requirements Controls

- Time toggle in the Optional features section, bound to `requirements.time.enabled` (default on).
It renders always (like the currency toggle).
When time requirements are enabled the recipe Duration card (single-step) and the per-step duration editor are authorable and their durations apply at craft time; when disabled, both editors are hidden and a step's `timeRequirement` no longer arms a timed run (the craft resolves immediately).
Existing authored durations are preserved while the toggle is off (they render as read-only chips where a step summary is shown) and re-apply when it is turned back on.
- Currency toggle in the Optional features section, bound to `requirements.currency.enabled`.
It renders always (independent of which optional feature flags exist on the system), so the section is never empty.
- Currency units card under character modifiers, rendered only when `requirements.currency.enabled === true`.
When currency is disabled the entire currency-units configuration block (spend strategy, provider, macros, and units) is hidden.
- A config-level block above the unit list with a spend-strategy `<select>` offering the three peer strategies (`actorProperty` / `actorInventory` / `macro`; both dnd5e and pf2e), each with `<small>` hint text reflecting the selected strategy.
When `actorInventory`, a provider `<select>` populated from the provider registry (or an empty-provider callout steering the GM to the macro strategy when the system has none).
When `macro`, three macro drag-and-drop zones (`canAfford`/`increment`/`decrement`) that accept only `type === 'Macro'` drops, resolve the linked macro name/icon, support unlink (button + right-click), and show a missing state for unresolved UUIDs; the increment hint notes it is invoked to refund currency when a player cancels an in-progress craft (the `refundOnPlayerCancel` policy).
There is no nested inventory-mode `<select>` — macro is its own peer strategy.
- Add currency unit and seed preset actions
- Under `actorProperty` and `macro`, selectable expandable currency unit editors for label, abbreviation, icon, with a per-unit detail field that adapts to the strategy — actor data path (`actorProperty`), or no path/denomination field with a "macros match by abbreviation" note (`macro`)
- Under `actorInventory` (with a provider) the GM-editable unit editors are replaced by a separate read-only, provider-managed denomination list (a "provider-managed denominations" callout plus per-unit label/abbreviation/coin-denomination shown as static values); the selected provider owns the denomination ladder, so the units are not GM-editable.
The add-currency-unit, seed-preset, add-sub-unit, and sub-unit controls below are hidden while the provider branch is active.
- Add-sub-unit dropdown with plus action
- Sub-unit pills with editable amount and remove action

If `features.gathering === false`:

- the `Environments` tab is hidden
- the player-facing `Gathering` directory button is hidden when no other system enables gathering
- gathering environments for that system are not shown in runtime player flows

#### Recipe Visibility Controls

The selected system's recipe visibility is authored on the Crafting group's **Settings** page (`crafting-settings`), in a **Recipe Visibility** section rendered below the resolution-mode card.
It is no longer on the System Overview page, and it authors the flat `visibilityMode` enum rather than the legacy `listMode` + `knowledge.mode` pair.

- A single radio-card selector (the shared `ResolutionModeCard` primitive) offers exactly four mutually-exclusive options: `global`, `restricted`, `item`, and `knowledge`.
Each option carries a label and description; exactly one mode is active for the whole system.
- **Alchemy relabel (reveal-not-gate).** When `resolutionMode === "alchemy"` the card keys a `$derived` option set that renders the `restricted` option as "Manual (GM-granted access)" and rewords the item/knowledge/global descriptions from *gating* to *reveal* language (per `recipe-visibility`), because brewing is never gated by visibility.
A non-alchemy system renders "Restricted" with gating language.
The STORED enum value is unchanged in both (`restricted` stays `restricted` — no new enum value and no migration), so the Access tab (shown for `visibilityMode === "restricted"`) stays reachable to author the per-recipe grant.
- Selecting an option live-applies it through `setVisibilityMode(mode)`, which persists `visibilityMode` and refreshes; the change is non-destructive (migrates no recipes) and there is no separate save action.
- A `CraftingEffectPanel` beside the selector summarizes the active mode's effect (from the projected `craftingEffect(visibilityMode)` matrix): whether the Access tab, Books & Scrolls, limited-use, and learning-limits surfaces are shown.
- Per-recipe-item use and learn caps are NOT authored here — each recipe item's caps live on its own Books & Scrolls item page (see Books & Scrolls Surface).
- Legacy note: the standalone `SystemRecipeVisibilityCard` that authored `listMode` / `knowledge.mode` / `dragDropEnabled` through `saveVisibilityConfig` is retired from the rendered UI; those legacy fields are now derived and read-only fallbacks (the runtime still honours `knowledge.learn.dragDropEnabled` where present).

#### Recipe Item Definition Controls

The GM admin must expose a recipe-item management surface for the selected crafting system.

Capabilities:

- Add recipe item definitions from world or compendium items by drag/drop or picker
- Remove recipe item definitions
- Show source-linked name and image preview
- Warn when a recipe item definition's source item no longer resolves

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

The default-selected Settings tab renders the system settings form (identity, optional features, character modifiers, and currency configuration) unchanged.
It writes through the existing admin-store persistence and confirmation flows.
Recipe resolution mode, salvage resolution mode, and the Recipe Visibility card moved to the Crafting group's Settings page (`crafting-settings`); the System Overview Settings tab no longer renders them.

The identity card's **Save details** control SHALL be preceded (in DOM order) by an `Unsaved` chip (`.manager-chip.is-warning`, `FABRICATE.Admin.Manager.SystemEdit.Dirty`) shown whenever the Name or Description input differs from the persisted `selectedSystem.name` / `selectedSystem.description`, and cleared when the values match — naturally, after Save persists and the projection re-publishes.
The Name / Description inputs SHALL seed from the persisted system on system-identity change only, so a two-phase or otherwise unrelated `viewState` re-publish of the same system does not overwrite un-saved edits.
As a consequence, a concurrent external edit to the same open system is not merged into the open form and is overwritten on Save (last-writer-wins), matching the manager's staged-draft model for recipes, components, and essences.
The identity sub-form (Name + Description only) SHALL participate in the Manager confirm-discard route-exit chain as a `system-details` kind, evaluated after the tools tail of the cascade: navigating away from, or switching systems on, a dirty details form prompts the standard three-way Save / Discard / Keep-editing dialog — Save persists the pending name and description before navigating, Discard reverts the inputs and proceeds, Keep-editing stays.
A navigation that re-enters the System Overview page on the same system (the validation-blocker link, or re-selecting the already-selected system) SHALL NOT prompt, because the form stays mounted and its pending edit survives.
The optional-features toggles, character-modifier / prerequisite cards, and currency editor on the same tab live-apply through the store and stage no draft, so they do not participate in this guard.

The Settings tab additionally renders a **Character prerequisites** card (`CharacterPrerequisitesCard`, issue 544) — a system-owned library of reusable pass/fail conditions the GM attaches to a book/scroll to gate who may learn its recipes (behaviour in `recipe-visibility`).
It is an accordion list (one entry expanded at a time): each collapsed row shows the entry name and a live `@path op value` preview, and the expanded body edits the name, then the property `path` (rendered with a leading `@` affordance), an operator dropdown (the nine `CharacterPrerequisite.op` tokens), and a `value` field that is hidden for the valueless operators (`is true` / `is false` / `exists`).
Add, delete, and an opt-in **Seed presets** action (enabled only for `dnd5e` / `pf2e` worlds, disabled with an explanatory tooltip otherwise) mirror the gathering character-modifier card's affordances.
Each control live-applies through the admin store (`addCharacterPrerequisite` / `updateCharacterPrerequisite` / `deleteCharacterPrerequisite` / `seedCharacterPrerequisitePresetsForSystem`), staging no dirty draft.

#### Settings-List Ergonomics

The three System Settings library lists — **Character modifiers**, **Character prerequisites**, and **Currency units** — share a set of ergonomic affordances (issue 768).

The Character-modifiers list SHALL render as a compact summary-row accordion mirroring the Character-prerequisites card: each collapsed row is one line — a chevron, the modifier's icon, its label, and its expression shown inline with the leading `@` sigil stripped for a cleaner read — with the row actions (copy, delete) to the right; activating the summary expands the row to the editor (Icon, Label, Expression).
The Character-modifier editor SHALL edit its `icon` with the shared pop-over `IconPicker` (the same control the Currency-unit and Character-prerequisite editors use), not a raw icon-class text input; a modifier with no explicit icon falls back to `fa-solid fa-user`.
The editor's Expression field keeps the raw stored value (including any leading `@`); only the collapsed summary strips the sigil for display.

Each of the three list cards SHALL render a whole-section collapse toggle in its header: a `<button aria-expanded aria-controls>` with a chevron affordance that hides or reveals the section body (the list and its controls) while leaving the card header visible.
The collapse state is session-local (in-memory, one collapse Set for the page) — preserved across store refreshes, reset when a different system is selected, and never persisted.
It is distinct from the Character-prerequisites card's per-item accordion (which opens one entry at a time); a section may be collapsed independently of which entry, if any, is open.

Each Character-modifier row SHALL offer a row-level **Copy to prerequisites** action, and — only when `features.gathering` is enabled — each Character-prerequisite row SHALL offer a **Copy to modifiers** action.
A copy adds a fresh entry into the destination store via that store's normalizing add op (never a shared mutation, and never carrying the source `id`), mapping `label`↔`name` and `icon`↔`icon` cleanly and transforming the roll `expression`↔`path` by stripping or re-adding a single leading `@` (faithful for a bare `@path`; a compound roll formula yields a path the GM must correct).
The pass/fail `op`/`value` and the roll math have no counterpart on the other side and are dropped; the copy defaults a new prerequisite to the `gte` operator with a null value.
On copy the destination card SHALL open the new entry in edit mode and a polite `aria-live` region SHALL announce that the name and icon were copied and the condition still needs setting, so the dropped logic is a visible gap rather than a silent loss.

Each row of all three lists SHALL offer keyboard-accessible **Move up** / **Move down** chevron `<button>`s, disabled at the ends, that reorder the list by one position through a single index-based store op (`reorderGatheringCharacterModifier` / `reorderCharacterPrerequisite` / `reorderCurrencyUnit`), with the new position announced through a polite `aria-live` region.
No new persisted field backs the order: array order IS the persisted order, so each op rewrites the list array in place and saves through that list's existing whole-payload path (the gathering config for modifiers, `updateSystem` for prerequisites and currency units), and the order-preserving normalizers round-trip it.
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
It is shown only when the system's crafting resolution mode is `progressive` (parity with the
  read-only badge on the components-browser row).
It accepts an integer of 1 or greater; zero clears the value.
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
- Set optional source component identity by picker/drag-drop only when effect transfer is enabled.
The source component may in turn expose a source item UUID.
- In Manager, the Essences left-nav item is a real route, not a disabled placeholder, whenever the selected system has `features.essences === true`.
- Manager shows component usage evidence for essence definitions and shows source-link state only when `features.effectTransfer === true`.
- Manager does not allow inline editing on the browse essences page; the row Edit action opens a dedicated edit essence view.
- Manager essence icon editing uses a pop-over icon picker instead of requiring raw icon class entry.
- Manager hides source columns, source filters, source inspector sections, source warnings, and source edit controls unless `features.effectTransfer === true`.
- Manager prevents essence deletion while one or more managed components reference that essence with a positive quantity.
- Manager source-state language is `linked`, `missing`, `stale`, and `none`; stale source evidence must remain readable until the GM clears or repairs it.

### Tools Tab

The selected-system `Tools` rail item is a top-level entry rendered between `Essences` and `Gathering` (see Manager Shell).
It manages the system's single canonical Tool library (`system.tools`).

The Tools surface is a Tool Studio with a top-level library route and a focused `tool-edit` route.
There is no Tool Kind field, filter, selector, pill, icon taxonomy, or persisted Kind value on either route.

The library uses the Manager three-column shell at `210px | 1fr | 340px`.
It owns the sole system-breakage-authority card above search, with self-describing `toolSpecific` and `checkDriven` options; changing authority persists live and never erases the inactive per-Tool settings.
The center library accepts an Item drop or Item-picker selection to create a Tool, rejects non-Items, snapshots source name/image/description, and uses durable Tool identity rather than name matching.
Each Tool row shows its linked image, display name, enabled state, breakage summary, and validation state, and the right inspector presents selected-Tool detail and Edit.
The row and inspector derive `Ready` or `Needs attention` from the canonical `Tool.validate()` result rather than from enabled state or a UI-only approximation; the inspector also exposes the validation issue count.
Both surfaces pair localized text and an icon with their status colour, so the state is neither colour-only nor an internal validation token.

Each row exposes selection through a keyboard-focusable identity target with explicit selected semantics and Enter/Space activation.
Selection, Edit, and enabled toggle are distinct localized named hit targets.
Activating Edit or the toggle does not select or open through the row handler, and the enabled toggle persists live.

The editor uses `210px | 1fr | 320px` and exposes exactly four tabs: Overview, Breakage, Requirements, and Validation.
The header alone owns Back, Delete, Save, and the dirty-state affordance; there is no footer save bar.
The body includes a live behavior preview, while the inspector summarizes identity, linkage, usage, and validation context.

Overview authors the display label, enabled state, description snapshot/link state, and Item picker/drop/unlink actions.
Breakage authors the retained `limitedUses`, `breakageChance`, or `diceExpression` tool-specific configuration, the separate check-driven Breakable/Immune state (`checkBreakable`), and the `destroy`, `flagBroken`, or `replaceWith` action.
Changing authority or check-driven immunity does not clear the inactive tool-specific configuration or on-break values.
When `checkBreakable` is false under check-driven authority, on-break controls are actually disabled and removed from interaction while their retained values and the explanation remain readable; opacity or `pointer-events` alone is insufficient.

`flagBroken` authors zero or more Recipe-compatible repair `IngredientGroup`s with the shared AND-groups/OR-options interaction model and Component, Tag, Essence, and Currency match types.
`replaceWith` authors exactly one managed Component target or direct Item UUID target, with picker/drop and localized unlink controls.
Requirements selects shared `system.characterPrerequisites` ids, the `bonus | usability` gate mode, and the enabled numeric bonus expression without embedding prerequisite definitions in the Tool.
Validation lists every failing model check, exposes the first failure for focus, and reports an all-clear state that is not color-only.

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
The wide Tool Studio header stays outside the scrolling body; center workspace and inspector own vertical scrolling with `min-width: 0` and `min-height: 0`.
At the existing `1120px` Manager container breakpoint, rail, main, and inspector stack in reading order with max-content rows, the body becomes the single vertical scroller, the bounded rail remains independently scrollable, and main/inspector overflow becomes visible.
At `680px` and below, header actions and tab/action clusters wrap without overlap, and Back, Delete, Save, validation state, replacement controls, and repair-row actions remain visible and reachable.

### Recipes Tab

The recipe **library** for the selected crafting system: a filter bar, collapsible category groups, rich card rows, and a persistent inspector in the shared manager inspector column.

The library renders **one** page header, and the shell owns it (breadcrumb, screen title, subtitle, Create).
The library does not render a page header of its own.

Rows are **cards, not table columns**.
A card row has no columns, so the list is a real list (`ul` / `li`, `role="list"`), not a table/row/cell structure with column headers.
Each row shows the recipe's image medallion (the resolved recipe image, falling back to a glyph), its name, its authoring-state pills, a one-line description, an I/O readout, a check pill, a lock toggle, a keyboard-reachable on/off toggle, and the Edit / Duplicate / Delete action group.

The row's on/off toggle carries **no On/Off text**.
The track colour is the state, its `aria-label` names the state for assistive tech, and the `Disabled` pill states it in words — a third copy on every row only crowds the description out.
The label is retained on every other `manager-status-toggle` in the manager, where the switch has no pill beside it.

The row's three actions are **borderless ghost icons** that take a background on hover.
Delete and Duplicate are preserved capabilities, but three bordered buttons beside a bordered lock, a switch and a pill make the row read as a toolbar rather than as a recipe.

Row authoring-state pills — at most one authoring state applies to a row:

- `Disabled` — the GM has switched the recipe off.
- `Locked` — the recipe stays visible to players, but only a GM can craft it.
- `Can't enable` — the recipe is an incomplete shell (missing ingredient sets and/or result groups) **and** is currently off, so enabling it would be refused.
- `Incomplete` — an incomplete shell that is already on: unfinished, but nothing is being refused.

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

The **blocked-enable flash**: enabling a recipe is gated — an incomplete recipe, or one whose signature conflicts, is refused.
The refusal renders as an in-window, dismissible `role="alert"` flash inside the library, and the store **suppresses** its Foundry notification whenever the library claims that message, so the same error is never reported twice (once in-window and once in a toast behind a maximised manager window).
The flash **floats** over the list rather than sitting in flow above it: an in-flow banner shoves every row down the page as it appears, moving the row the GM just clicked out from under the cursor.

The **lock toggle** gives `recipe.locked` a real write path from the row.
Unlike enable, locking is **never gated**, in either direction: a GM locks a recipe precisely while it is unfinished, so refusing the write on incompleteness would make the control useless exactly when it is wanted.

The **inspector** is one column on the panel background, not a stack of bordered cards.
Section headings are uppercase micro-labels sitting directly on the panel — `Selected recipe`, `Requires`, `Produces` — not `<h3>` titles inside nested `manager-inspector-card` boxes, and there is no invented "Recipe details" heading over the stat grid.
Only the things that are objects keep a box: the 2×2 stat grid (Ingredients / Results / Steps / Crafting check) and the Requires / Produces flow rows.

The hero chip row carries exactly two chips on one line: the category and a status pill (a dot plus `On`/`Off`, naming the state exactly as the row's switch does).
There is no chip for the *absence* of a state — the retired `Unlocked` chip named a non-state and forced the row to wrap; `Locked`, `Incomplete` and `Can't enable` are shown only when true.
The flavour text is shown whole, in the one surface with room for it.

The **Produces** list shows every produced group, **toned by role**.
The result-group pill carries the GM-authored group name (Fabricate's outcome tiers are authored, so the name is the recipe's — never a crit/success/fail vocabulary the model does not have); its tone is the role the group plays, success-soft or danger-soft.
The reserved `role: 'failure'` group — the failure output for plain `simple` resolution mode and alchemy-Simple checkMode alike — is **rendered** (danger-bordered), not filtered out, so a simple or alchemy recipe's failure output is visible; no failure row is invented in a routed mode, where a failed craft produces nothing.
The successful-craft-makes-nothing warning still keys on the success rows: a recipe whose only group is the failure group still makes nothing when the craft succeeds, and says so.

The inspector's primary action is **`Edit recipe`** — the accent-filled, full-width, loudest control on the panel, and the point of the inspector.
`Duplicate recipe` is its secondary above it; `Delete recipe` is demoted to a ghost danger link below it, so the panel's loudest action is never destroying the recipe.
The inspector column stays at the shell's shared 300px; it is not widened per view.

Actions:

- Create
- Edit
- Duplicate
- Delete

In Manager, the recipes browser header offers a single primary `Create recipe` action (no crafting-system import/export on the recipes header); creating a recipe follows a create-then-edit model — `store.createRecipe` persists a new identity-only *incomplete shell* in the selected system via `RecipeManager.createRecipe({ craftingSystemId }, { allowIncomplete: true })` (it saves because persistence gates on structural validity only, not completeness) and the manager immediately opens the recipe-edit view on it.
The new shell carries the default recipe name and image until edited, and the browse row surfaces a derived `Incomplete` chip until ingredient sets and result groups are added.
The recipe browse row `Edit` action opens that same dedicated recipe-edit view rather than editing inline, and that Edit action is available regardless of the recipe's `locked` state.
The recipe-edit view is the **five-tab editor** specified in `## Recipe Editor` below — Overview, Ingredients, Results, Tools and Validation — over a controlled local draft in the central `manager-main`, with the GM manager's right-hand context inspector panel (the global `manager-inspector` aside) carrying that editor's context rail.
Ingredients, essences, tools, steps and results are all authored there; none of them is deferred, and there is no *Catalyst* concept in the editor (Tools replaced it).
Identity edits track a dirty state surfaced by a header dirty chip, persist via `store.updateRecipe` → `RecipeManager.updateRecipe(recipeId, updates, { allowIncomplete: true })` (so an identity-only save is not blocked by the shell's still-empty ingredients/results), and a dirty draft prompts a discard confirmation on route exit.
The recipe-edit header follows the standard editor convention shared with the gathering-task, gathering-event, and environment editors: an `Unsaved` chip (when dirty), `Back to recipes`, `Delete recipe` (danger, enabled whenever a recipe is selected), and `Save`.
The context rail is **always present** on `recipe-edit`, and what its top section carries is decided by the system's canonical `visibilityMode` through `craftingEffect` (see `### Context rail`): the read-only access roster in `restricted`, the read-only Books & Scrolls "Appears in" summary in `item` / `knowledge`, and no top section at all in `global`.
It is **not** gated on the superseded `knowledge.mode`.
The layout collapses to a single column at the Manager container's narrow breakpoint (`@container fabricate-manager (max-width: 960px)`), mirroring the environment editor.
The recipe editor carries **no** per-recipe visibility editor: the legacy `recipe.visibility { restricted, allowedUserIds }` card is retired (see `### Visibility Form`), and the canonical `recipe.access` grant is authored on the Access tab.
The `recipe == null` form of this view shows a `Select a recipe` empty state.

Recipe browse row quick-actions (`Edit`, `Duplicate`, `Delete`) render in a single non-wrapping action group, consistent with the environment and gathering-task browse rows.

### Books & Scrolls Surface

`Books & Scrolls` is the `Crafting` group's recipe-item management surface, available whenever a crafting system is selected (the `Crafting` group is unconditional as of issue 745).
It is a display name only: the surface manages every recipe item in the selected system regardless of the item's Foundry item type (book, scroll, ring, wand, gem, note), and `recipe item` remains the canonical noun.

The surface lists every recipe item in the selected system (from `selectedSystem.recipeItemDefinitions`), and for each item shows its identity (image and name), the recipes it contains (its canonical `recipeIds[]` membership, with a legacy `recipe.recipeItemId` fallback for un-migrated systems) as a count plus the linked recipe names, and that item's OWN use/learn caps (read from `item.caps`) as read-only chips: a use-cap chip (craft charges) and a learn-cap chip.
Membership is authored on the item's **Contents** tab (writing the definition's `recipeIds`), not on the recipe editor.
The caps are per recipe item, not a shared system-wide rule, so two recipe items in one system may show different chips (a one-recipe scroll beside a three-recipe tome).
When the selected system has no recipe items, the surface shows an empty state.

Selecting a row opens the `ItemPageInspector` aside; its quick-limit toggle is the sole remaining live-apply caller of `store.updateRecipeItemCaps` (the patch merges and normalizes onto the recipe item definition), and that toggle stages no dirty draft.
Editing a recipe item opens the full-window `recipe-item-edit` route — a tabbed editor (`RecipeItemEditorTabs`: Overview / Contents / Limits / Validation) over a root-held staged draft plus its last-persisted baseline.
That draft **is** part of the Manager confirm-discard route-exit chain (`confirmRecipeItemRouteExit`), so navigating away with unsaved edits prompts to discard.
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

The list (`AccessTabView`) shows the selected system's recipes with a search box, a Category filter, and an Access filter (`all` / granted / no-access); each row shows the recipe icon, name, category, and a grant chip (`N char · N player`, or a danger `No access` chip when no character or player is granted).
Selecting a row opens the `GrantAccessInspector` for that recipe.

The inspector authors the grant through **two independent rosters** — Characters and Players — each with its own search box and pager:

- The **Characters** roster is the player-character actor roster (`adminStore.getPcRoster` → `services.getPlayerCharacterActors`); toggling a character grants or revokes its actor id in `access.characterIds`.
A granted character makes the recipe visible to any viewer who **controls** that actor (assigned character or Foundry `OWNER` permission — see `recipe-visibility/spec.md`), not to a fixed user.
- The **Players** roster reuses the world-users projection; toggling a player grants or revokes its user id in `access.playerIds`, making the recipe visible to that user directly.
- Each toggle persists the **full** `{ characterIds, playerIds }` snapshot via `adminStore.saveRecipeAccess` (live-apply, no dirty draft), so searching or paging never loses a grant.

Grant state is read from `recipe.access`, and the surface stages no dirty draft, so it is not part of the Manager confirm-discard route-exit chain.

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
When the toggle is on but the system has no realms yet, the control shows a muted empty line pointing the GM to create realms in the Travel tab first.
- The selected draft can edit risk display/evidence and risk-to-danger matching evidence where supported.
- The selected system's Gathering Settings tab configures d100 reward selection, event selection, limits, and event outcome through `gatheringConfig.systems[systemId].rules`.
- The selected system's Gathering Settings tab configures per-system `Times of day` and `Weather conditions` matching settings with enable toggles, current value selectors, add controls, label/icon-editable value pills, and selected-system cleanup on deletion.
- The Environments editor shows current global weather and time of day as context, not as environment browse filters.
- Settings is the only primary GM UI surface for current global weather and current global time of day.
Environment authoring may expose inherited condition evidence and future provider override evidence, but must not be the primary condition mutation surface.
- The Environments editor exposes Gathering Task and event library rows for the selected crafting system, including per-environment automatic/manual composition controls.
- In automatic composition, task and event tabs show Included, Excluded, and Non-matching record sections; excluding a record writes the matching `disabled*Ids` list and Restore clears it.
- In manual composition, task and event tabs show only Included in this environment and Available to add.
Removing an included manual task or event clears `enabled*Ids` and `forced*Ids`, ignores stale `disabled*Ids`, and returns the record to Available to add according to its candidate, non-matching, or library-disabled state.
- Manual Available to add rows present Add for matching records, Force add for enabled non-matching records, and a disabled library note for library-disabled records.
- When the Manager Gathering `Environments` browser has no environments, its empty state keeps `Environments` selected, keeps `Create environment` available, and guides GMs to prepare Gathering Tasks plus encounter/event options before composing environments.
- Gathering Task and event row overrides stay inside expandable rows so the default environment workspace remains scannable.
Collapsed rows show default-vs-override chips, enabled state, matching evidence, dirty/validation markers, and an explicit expand/collapse control.
- Expanded override panels contain per-environment override fields only; Gathering Task fields remain edited in their library surface.
- Expanded override rows are keyboard reachable, preserve focus on save/error where practical, and stack without horizontal clipping in narrow Manager widths.
- Gathering Task authoring includes identity, image, description, enabled state, task-level time/weather availability gates, search/pagination for ordered d100 drop rows, unresolved drop-zone rows, inline chance/quantity controls, modifier summaries, selected-drop inspector editing, and final chance preview.
D100 row selection is controlled by selected-system Gathering Rules, not Gathering Task authoring.
- Gathering Task authoring may also include node count, depletion timing, respawn policy, stamina cost, attempt limits, risk overrides, encounter hooks, natural expression providers, and macro providers where the selected economy/features use them.
- Reusable event authoring includes name, image, description, enabled state, danger/match tags, d100 drop rate, and modifier provider evidence.
- The selected-system inspector exposes a per-system character modifier library for gathering, with add/edit/delete controls, opt-in preset seeding when supported by the active Foundry system, and stale-reference evidence for rows that still point at deleted modifiers.
- D100 drop row and event editors expose character modifier references with modifier selection, `+`/`-` operator, optional min/max bounds, per-row override fields, and clear GM-facing evidence without leaking expression or macro internals to non-GM blind history.
- The settings/tag area can edit gathering vocabularies for biomes and danger.
The legacy `regions` vocabulary dimension has been removed (geography is not a composition tag); geography is authored as `GatheringRealm` records in the Travel tab.
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

### GM Travel Route

When `features.gathering === true` AND the selected system's `gatheringRealmSettings.enabled` is `true`, the selected-system Gathering submenu exposes a `Travel` route for managing Fabricate-managed gathering parties, the selected system's current-realm overrides, and the system's realms.
It must not be duplicated in a separate detached settings UI.

The Travel/Realms subsystem is opt-in per system:

- A `Travel & Realms` toggle (default off) lives in the gathering Settings surface (it is the one surface that stays visible when the subsystem is disabled, since it hosts the toggle).
Enabling it writes `gatheringRealmSettings.enabled = true`.
The toggle card carries hint copy naming where Travel lives (e.g. "Enabling this reveals the Travel tab…") so a GM can connect the toggle to the outcome.
- When the toggle is off, the `Travel` nav item is hidden AND removed from the gathering tab-resolution/fallback lists, so a stale `activeGatheringTab === 'travel'` falls back to `Environments` (filtering the render alone is insufficient).
The environment editor also hides its realm selector while the toggle is off.
Disabling the subsystem treats every environment as ungated at runtime.

Shipped capabilities:

- `Travel` is reachable only while a gathering-enabled crafting system is selected.
Party create/rename/enable/disable, member management, and travel-actor assignment are **world-global** (parties are shared across systems); only the current-realm override block is **per selected system**.
The view states this explicitly.
- The `Travel` submenu badge shows the total party count.
- Create, rename, enable/disable, and delete Fabricate parties.
- Assign actor members to a party and assign exactly one **travel actor** (the actor that represents the party on a campaign map).
Assigning a travel actor already used by another enabled party, or an actor already associated with another enabled party, is rejected with an inline error associated with the relevant control (the duplicate-travel-actor error routes to the travel-actor control).
- The enable toggle is disabled (with an "assign a travel actor to enable" hint) while a party has no travel actor; newly created parties visibly show their disabled state.
- When the world has no actors, the member and travel-actor pickers show an explicit empty state directing the GM to create an Actor first.
- Layout split: the party list and all editing controls (rename, enable, members, travel actor, override Set/Clear) live in the center column; the right inspector is a read-only evidence echo for the selected party (current-realm evidence per source state, member/travel-actor summary, stale references).
Override editing exists in exactly one place (center).
- The current-realm evidence component renders all three source states using the canonical labels `GM override`, `Travel actor`, and `No current realm`.
The GM evidence panel renders the live `Travel actor` source label when a party's realm resolves from token-derived sensing (Phase 3, shipped).
- The Travel route presents a third **Map Region Links** tab (`GatheringTravelTabs.svelte`) that lists the Scene Regions on the active scene (`GatheringMapLinksTab.svelte`) with a per-region realm picker (`MapRegionLinkPicker.svelte`) linking each scene region to at most one realm (single-valued per scene region, written by `adminStore.setMapRegionLink`).
- Each stale member / travel-actor / override-realm reference gets a remove/clear action; "repair" means removing the stale reference and re-assigning through the normal pickers.
- The route embeds the canonical **realm authoring surface** using a realm list + detail layout: the list creates/selects/deletes realms; the detail pane edits the selected realm's name, description, image, enabled, secret, and biomes (chosen from the system biome vocabulary).
Edits merge-patch over the existing record so unedited fields (sort, sceneMappings, modifiers) round-trip untouched.
Delete is destructive and routes through the confirm dialog with referenced-by evidence (a deliberate change from the prior immediate-delete quick list).
- This realm authoring is the source of the realms an environment can be assigned to via its `includedRealmIds` multi-select; the multi-realm data is authored here, not in the environments browser.
The legacy environments-browser "Region" filter has been removed.
- Validation lives in the party store; the view surfaces store validation errors inline next to the relevant control using the Manager's `aria-invalid`/`aria-describedby` pattern.
Actor pickers follow the accessible semantics established by `ActorSelectTopBar`.

Not yet shipped (later-phase follow-ups, kept out of canonical capability claims): realm discovery controls, and the player-facing travel/current-realm view. (Realm authoring — name/description/img/secret/biomes — and the environment realm-membership control now ship inside the Travel route and environment editor; `sceneMappings` authoring now ships via the Map Region Links tab; only the legacy realm ordering and Phase 4 `modifiers` authoring remain reserved.)

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
A recipe whose ingredients or results are still empty is a persistable *incomplete shell*: it stays non-craftable (the engine gates on completeness) and the browse row shows a derived `Incomplete` chip.

### Resolution-mode banner

Every tab is headed by a **resolution-mode banner** naming the crafting system's `resolutionMode`, describing what it means, and offering a chip that routes to Crafting Settings.
Resolution mode is a property of the **system**, never of a recipe: the banner reports it and offers no per-recipe control, because the mode dictates the editor's whole shape (one ingredient set or many, tier routing, the alchemy result slots) from outside the recipe.
Its copy and icons come from the canonical `resolutionModeOptions` list that System Settings and Crafting Settings already render, so no second, drifting table exists.

### Context rail

The editor's right-hand column is the shell's existing `manager-inspector` aside (not a second nested grid), and it is **always present** on `recipe-edit`.

Its top section is **mode-conditional**, driven by the system's canonical `visibilityMode` through the `craftingEffect(mode)` matrix — the same single source of truth the crafting nav and Crafting Settings consume:

| `visibilityMode` | `craftingEffect` | Rail top section |
| --- | --- | --- |
| `restricted` | `showAccess` | **Who can craft this** — the players and characters granted this recipe, plus a **Manage access** deep-link to the Access tab |
| `item`, `knowledge` | `showBooksScrolls` | **Appears in** — the books/scrolls that teach this recipe, plus an **Open Books & Scrolls** deep-link |
| `global` | neither | No section: a globally-visible system grants no per-recipe access and uses no books |

The rail is **read-only in every mode**.
Authoring lives on the owning screen: the Access tab owns `recipe.access`, and Books & Scrolls owns book membership.

Below the mode-conditional section, in every mode, the rail carries the recipe's **Category** selector, the **Recipe mode** (Simple / Complex) segmented control when the system's resolution mode permits multiple ingredient sets, the **Step mode** (Single / Multi-step) segmented control, and a **Validation** mini-list showing either an *All clear* pill or the failing readiness checks with a deep-link into the Validation tab.

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
Its options are that fixed check's success outcome tiers ranked ascending by `start`, preceded by a default `No override (use rolled tier)` entry, and it authors the recipe's `minSuccessOutcomeId`.
Selecting a tier makes a craft that rolls below it fail outright (see `resolution-modes/spec.md`); the control is hidden for relative-type checks and for non-`routedByCheck` systems.
Note: alchemy `checkMode: tiered` dispatches through the same routed-check runner but the engine forces `minOutcomeId: null` on that path, so a `minSuccessOutcomeId` carried on an alchemy tiered brew is inert at runtime — matching this control's hiding for alchemy (a value the GM cannot edit or clear here is also one the runtime ignores; see `resolution-modes/spec.md`).

### Visibility Form

Per-recipe visibility is authored on the **Access tab** (`recipe.access = { characterIds, playerIds }`), gated by the system's `visibilityMode: 'restricted'`.
The recipe editor itself carries **no** per-recipe visibility editor: the legacy `recipe.visibility { restricted, allowedUserIds }` card (gated on the superseded `recipeVisibility.listMode`) is retired, and `access` is read-forward-seeded from `visibility.allowedUserIds` for legacy systems.
The recipe editor's context rail shows a **read-only** summary of the grant plus a deep-link to the Access tab.

If the system's visibility mode consumes an item or teaches by knowledge (`item` / `knowledge`):

- The recipe's context rail lists **every** book/scroll that teaches it, because recipe↔book membership is **many-to-many** (`RecipeItemDefinition.recipeIds`, projected onto the recipe row as `recipe.recipeItemIds`).
There is no book/scroll `kind` — `RecipeItemDefinition` manages every recipe item regardless of Foundry item type.
- Each row previews that book's name/image/source status (falling back to the legacy scalar `recipe.recipeItemId` only for a fully un-migrated system), offers Open item, and offers a per-book **remove**, which removes the recipe from **that** book's membership only and does **not** delete the shared definition.
A row whose definition's `originItemUuid` no longer resolves shows a missing/stale state and retains the link.
- **Adding** a recipe to a book is authored from the book's side (Books & Scrolls → the recipe-item editor stages `recipeIds` and persists on Save).
The recipe editor carries no drop zone and no "link another" affordance: a second authoring path for the same many-to-many is duplication, not a capability.
- Membership changes apply immediately (through `setRecipeBookMembership`), independently of the recipe draft's Save.

Owned copies match by UUID or resolved source UUID of the linked recipe item definition.
If the required linkage is missing, show a validation warning.

### Locked

`recipe.locked` is persisted and engine-honoured (`guardCraftStart` refuses a locked craft), and the Overview tab is where it is written.

A locked recipe stays **visible** to players but only a GM can craft it — a different concept from the Overview's recipe-item *image* lock (which merely means the image comes from a linked recipe item), so it carries its own copy and its own hooks.

The lock write path is **never gated**, in either direction, in explicit contrast with the enable toggle: a GM locks a recipe precisely while it is unfinished, so an enable-blocking validation issue must not also block locking it.
The change persists immediately (like `enabled`), outside the recipe draft's Save.

### Tools tab

The recipe editor's Tools tab authors required Tools at recipe, step, and ingredient-set scope and applies the recipe's one `toolBonusModes` map by Tool id across every applicable scope.
Each applicable Tool carries a localized bonus-mode select that writes `recipe.toolBonusModes[toolId]` as `always`, `highestOnly`, or `never`, with an absent entry displayed and evaluated as `always`.
The control has an associated localized label and remains reachable and wrapping at narrow widths.

### Ingredients tab

A requirement's alternatives (`IngredientGroup.options`, satisfied by ANY one of them) are added through a single **"or…" popover** per requirement, replacing the loose per-row and footer add-buttons.
It is a single flat **"Accept instead"** list of the four real ingredient match types — Component, Tag, Currency, and Essence — each appended to that requirement as a new OR alternative for the row's own picker to fill in.
Essence is a first-class ingredient match type, so "component OR essence" is a genuine alternative; the old two-heading Accept-instead / Require-as-well split is retired.

Currency and Essence appear only when the system can honour them, so the menu never offers a choice the system cannot satisfy.
Currency-cost affordances — the set-level "Add cost" button, the requirement-level "Add cost" button, and the "or…" popover's Currency choice — render only when the system's currency feature is **enabled** (`requirements.currency.enabled === true`) AND configures units, not merely when units exist; the normalizer seeds preset units even for a disabled-currency system, so unit presence alone is not authorisation.
Essence appears when the system enables essences.
An essence alternative may repeat across groups, so it is gated on the system HAVING essences (not on system-minus-already-required).
A currency requirement persisted while currency was enabled remains **visible** when the feature is later disabled, but renders read-only (its unit and amount as static text, flagged inactive) rather than being silently hidden.
The per-option `tagMatch` (any / all) control is retained on every tag alternative.
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
Tags are edited only in the component editor and must not be rendered as row chips; rows show a single-line description, mirroring the Recipe Studio.
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

Required tools are **not** authored here.
*Catalyst* is a retired concept — Tools replaced it, and the recipe's tools are authored on the editor's **Tools** tab at recipe and step scope.
The persisted per-**set** `IngredientSet.toolIds` field has no editor of its own; it round-trips unchanged.

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

- At the **top of the Checks tab's Crafting sub-tab**, shown only when `resolutionMode === "alchemy"`: a native check-editor radio group (`manager-checks-type-options`) for `alchemy.checkMode` (`none` / `simple` / `tiered`), rendered ABOVE the per-mode editor and persisted live via `store.setAlchemyCheckMode` (which spreads the nested `alchemy` block so `learnOnCraft`/`consumeOnFail`/`showAttemptHistoryToPlayers` are preserved).
Selecting a mode swaps the editor below it live.
- The selector is NOT rendered on the Crafting Settings page; that page keeps only the Recipe resolution, Recipe visibility, and (when salvage is on) Salvage resolution cards.
- The three behaviour flags the selector preserves (`learnOnCraft`, `consumeOnFail`, `showAttemptHistoryToPlayers`) are themselves authored by the **Alchemy behaviour-flag controls** below the selector; see that requirement for the sanctioned authoring path.

### Alchemy behaviour-flag controls (issue 713)

- Below the alchemy check-mode selector on the Checks tab's Crafting sub-tab (shown only when `resolutionMode === "alchemy"`, regardless of `checkMode`): three live-persisting toggle cards editing the system-level alchemy behaviour flags — `learnOnCraft` (default `false`), `consumeOnFail` (default `true`), and `showAttemptHistoryToPlayers` (default `true`).
- Each toggle reflects the stored value (including a stored non-default value) and persists through `store.saveAlchemyConfig`, which spreads the nested `alchemy` block so `checkMode` and the other two flags are preserved.
Because `saveAlchemyConfig` rewrites all three flags from its argument, the caller sends the current projected values with only the toggled field overridden.
- The controls' semantics are defined by `resolution-modes/spec.md` (consume-on-fail) and `recipe-visibility/spec.md` (learn-on-craft, attempt history); this requirement covers only the authoring surface.
The failure-consumption toggles of §Crafting Check Controls are the distinct, non-alchemy `craftingCheck.consumption` policy and are NOT shown in alchemy mode.

### Checks tab per-mode behaviour (issue 554)

- alchemy + `simple` → the simple pass/fail editor rendered below the selector; alchemy + `tiered` → the routed editor below the selector; BOTH cannot be disabled (the Active card shows the requiredHint, ungated by `checksEnabled`).
- alchemy + `none` → a read-only "resolves without a check" notice below the selector (no editor, no Active card, a distinct "no check" hint that points back to the selector above — NOT the requiredHint).
- The Crafting checks help copy describes none/simple/tiered.

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
- There is a **third** outcome: a component with a time requirement returns `success` with **null results**.
The run has STARTED and awarded nothing.
Treating `success` as "done" would show a success state for a run that gave the player nothing.
- A misconfigured required check (routed or progressive with no authored roll formula) returns `{ success: false, misconfigured: true }` with zero mutation and a GM-config message.
Like a dismissed roll prompt, it **discards a run created by that call**, so a misconfigured abort never leaves a persisted `inProgress` salvage run; a reused pre-existing run is left untouched.
- The UI passes `interactive: true`; the default `false` keeps macros and automation silent (see the path-agnostic §Interactive Roll Prompt for the shared contract).

### Interactive Roll Prompt (path-agnostic)

A check-bearing execution accepts a per-call `interactive` flag (default `false`, keeping macros/API silent).
When `true`, the shared system-agnostic dialog (`src/ui/svelte/apps/crafting/rollPrompt.js`, `promptCheckRoll`/`buildInteractiveRollOptions`) prompts the player to roll; a dismissed prompt yields `{ success: false, cancelled: true, results: null }` with guaranteed zero mutation, distinct from `success: false`.
This is the PR #497 per-call-flag decision, consumed uniformly by the crafting store, salvage (inventory) store, alchemy store, gathering view, and the Journal Trigger Next Step path; `CraftingEngine.craft` discards any phantom run created by a cancelled interactive call.

### Result Chat Cards

- Crafting and salvage share one card format (built by `buildResultCard`): the subject, recovered/produced results, consumed/forfeited items, broken tools, and failure reason.
- The card appends the **rolled check total** as its own row, mirroring the salvage summary's "with a roll of N" rule: rendered only for a finite value and omitted for a no-check guaranteed craft/salvage (`rollValue` null).
The total is the RAW roll (`checkResult.data.total`), not the progressive awarding value, so a forced crit shows the natural roll rather than the `MAX_SAFE_INTEGER`/`0` award sentinel.
- The card is posted only on resolved success or rolled failure — never on cancelled, misconfigured, or time-gated outcomes.
- Posting is gated by `features.chatOutput` (default on); `ChatMessage.create` failures are non-fatal (logged only), so a chat error never aborts the craft/salvage.
- Gathering posts its own result card under the same `features.chatOutput` toggle.

### Deferred (this iteration)

- No learn affordance renders on the Crafting tab; recipe learning is wired only through the Inventory surface (see §Books & Scrolls learning and the Inventory learn path, `game.fabricate.learnRecipeFromInventory`).
- The Alchemy tab and the Journal cross-link remain out of scope for the player
  Crafting tab.

### Top-Level Tabs

The player app is a single shared window with a full-height left navigation rail.
It carries five tabs, in this order:

- **Crafting tab**: always present
- **Alchemy tab**: conditional — shown when >= 1 crafting system has `resolutionMode === "alchemy"`
- **Gathering tab**
- **Journal tab**
- **Inventory tab**

Alchemy is the only conditional entry; the others are always present.

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
A running sum is correct only for `equal`; `exceed` gates on a strict comparison and sits one above each cumulative sum, and `partial` awards a tail result whenever any budget remains, making its final stage reachable *below* its cumulative sum.
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
The extension set is exactly three, all **opt-in and default-off**: an optional per-stage **state chip**, an optional **fixed-state note** overriding the explanation shown when reordering is unavailable, and an optional **stacked row layout**.
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

**Progressive salvage deltas.**

- The award mode is **salvage's own** (`system.salvageCraftingCheck.progressive.awardMode`), authored independently of the recipe's.
Deriving salvage thresholds from the crafting award mode violates the agreement requirement above invisibly, because both blocks normally exist and are normally authored.
- The permission is `Component.salvage.allowPlayerResultReorder` (default true; only an explicit `false` pins the authored order), not the recipe's.
- The player's order is stored under the `salvage:<componentId>` key (see `resolution-modes` §Which user's order is read).
- A pending debounced write MUST be **flushed before a salvage run starts**, and a **rejected** write MUST abort the run: an unflushed write is captured stale onto the run record, and a rejected one leaves the player looking at an order that was reverted.
- Salvage renders **no exclude affordance**: reorder is the whole of the feature.
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
  Non-essence images and the existing accessible labels and selection semantics remain unchanged.
- (No learn action on the Crafting tab: recipe learning is wired through the Inventory surface only — see §Books & Scrolls learning.)

#### Shopping List Panel

- Session-scoped aggregation of materials needed for queued recipes.
- Shown only on the Crafting tab.
- Essence shortages from first-class ingredient states and legacy set-level essence states retain the first nonblank GM-authored icon across aggregation.
  Later blank values do not erase it.
  Render-time canonical normalization uses `DEFAULT_ESSENCE_ICON` when the retained value is missing or unusable, without changing need/have totals.

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
- The unified player-facing Journal screen (see *Journal App*) is the cross-activity
  home for monitoring and advancing these runs; a direct cross-link from the Run
  Summary into the Journal is a deferred follow-up.

### Alchemy Tab

The player Alchemy tab is an IMPLEMENTED route (it replaced the earlier `{:else}` "Coming soon" placeholder in `FabricateAppRoot.svelte`).
Its content mounts inside `.fabricate-app-content` — the shell's 84px nav rail is NOT part of this grid — so the content is a **three-column** layout `known . workbench . inventory` mirroring the Crafting/Gathering views.
The sides are compressible (`minmax(230px,280px)` each) with a floored, growable centre (`minmax(340px,1fr)`) so the 340px workbench floor coexists with the 1024px minimum window; it stacks at the `@container (max-width:900px)` breakpoint with the **workbench leading** the stacked order.
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
Run monitoring remains a Journal concern (see *Journal App*); the tab's internal fizzle dead-end memory is not run history.
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
- **One card per unified physical stack.**
The listing renders **one card per unified physical stack**, not one per crafting system.
A physical document that backs a component in **N crafting systems** appears **once**, with its quantity counted **once** — a per-system card duplicated the same stack and let the player read N× the true count, and salvaging one card silently consumed the sibling's documents.
The projection **aggregates then collapses**: each system contributes today's within-system aggregate of a component across every owned document and source actor (a **participation**), then participations whose **contributing-document identity sets intersect** collapse into one card, and `totalQuantity` / `sources` are computed over the **union** of the card's contributing documents **deduped by identity** (a document participating in two systems counts its stack quantity once) and summed per source actor.
Document identity for this dedup and join is **`item.uuid` alone** — never a compendium/duplicate-source union: `_stats.compendiumSource` and the transitive `_stats.duplicateSource` are shared across **distinct** documents (Foundry stamps a fresh `duplicateSource` on every drag-to-actor), so keying on them would merge two genuinely-owned stacks and undercount real holdings (`getItemIdentityReferences` is the codebase's precedent for excluding `duplicateSource` from identity; see `data-models/spec.md` for the `roles`-map component identity these participations resolve through).
This **adds** cross-system unification and does **not** disturb today's same-component aggregation: distinct documents (across stacks or source actors) that resolve to the **same** component still aggregate into one summed card, and distinct documents that resolve to **different** components — even when they share a compendium/duplicate-source template — stay **distinct** cards.
The card's at-a-glance signals (salvageable, tool, essence pips) are the **union** across participations, essence pips **deduped by essence id**.
`broken` is a **singular** physical property of the document(s), never per system.
Essence rows (synthetic per-system aggregates keyed `essence:<systemId>:<essenceId>`) and Books & Scrolls rows are legitimately distinct per system and are **NOT** collapsed by this behaviour.
- **Broken treatment.**
`broken` is a **read-only** verdict, and no engine path un-breaks a tool.
It has **two** sources, and reading only the second reports almost every broken tool a player can actually see as intact:

  - the persisted **`flags.fabricate.toolBroken`** past fact — the authoritative presence-gate disqualifier, written by the `flagBroken` on-break action for **every** breakage mode and requiring no roll to know.
    This is the source that matters most: `flagBroken` is the only on-break mode that leaves a broken item in the player's inventory at all (`destroy` and `replaceWith` remove it), and a chance- or formula-broken tool carries this flag with **no usage counter** whatsoever.
  - a **projection** of usage exhaustion, which only `limitedUses` supports (the other modes decide at attempt time by a roll).
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
- An **`Info | Salvage`** control appears when the item is salvageable — **including when it is broken**, since brokenness does not gate salvageability.
When the item is not salvageable, **no tab bar renders at all**: a hidden tab reads as "this isn't salvageable", which is wrong and unfixable by the player.
- The body dispatches on the pair **`(mode, checkUsable)`** against **`system.salvageCraftingCheck`** — salvage's own check block, NOT `system.craftingCheck`, which is the recipe block.
Both normally exist and are normally authored, so reading the wrong one renders plausibly while showing the player a formula and a DC the engine will never use.
- A check is **usable** iff its mode's roll formula is authored; that is the only gate the engine applies.
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

### Run Guardrails

Before start/resume and before each step action, UI must invoke guard checks defined in `recipe-visibility/spec.md`.

## Gathering App (Player)

This is a dedicated app distinct from the Crafting App.

It is opened from the `Gathering` header action in the Items directory and must not be combined into the crafting browse-to-craft workflow.

### App Availability

- The app is available only when at least one crafting system has `features.gathering === true`.
- If no crafting system exposes gathering, the Items directory must not show the `Gathering` action.

### Actor Selection

- The unified window selects the gathering actor through a shared **Actor selection top bar** rendered above all tabs (see *Unified Window Actor Selection Top Bar*), rather than only a per-tab header control.
- The bar's selectable list is restricted to **player characters** — the actor type(s) a system designates as player characters, owned for non-GM users, all for GMs.
The current dnd5e/pf2e implementation of that concept is `actor.type === 'character'` (the predicate `isPlayerCharacterActor`); other player-character types are a known limitation.
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
A player's current realm may resolve live from travel-actor sensing (`source: 'travelActor'`, Phase 3, shipped) as well as from a manual override.
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
These runs also appear in the unified player Journal (see *Journal App*), which monitors gathering, crafting, and salvage runs together; the Gathering App remains the place to START a gather.

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
It is a tab in the unified Fabricate window (`Crafting`, `Alchemy`, `Gathering`, `Journal`, `Inventory`), rendered beneath the shared Actor selection top bar, and reads the selected player-character's existing crafting, gathering, and salvage runs through one UI-safe projection (the `RunModel` / `StepModel` shapes defined in `data-models/spec.md` *Run Journal Projection*).

Scope:

- The Journal **monitors** active and historical runs and, for crafting only, **advances** them.
- It never CREATES runs; run creation stays in the Crafting, Alchemy, and Gathering flows.
- It is the unified player home for the per-activity run views described elsewhere in this spec — the Crafting tab *Run Summary*, the Alchemy tab *Active Runs and History*, and the Gathering App *Active Runs* / *History*.
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
Triggering invokes the crafting advance contract in `recipes-and-steps/spec.md` (*Run Progression — Player-Initiated Advance*); the final-step variant is copy-only and re-enters the same advance flow.
- **Gathering / salvage (`manualAdvance: false`)** show an explanatory "resolves automatically when world time advances" line plus the time-remaining box, and offer no trigger button, because matured gathering and salvage runs auto-resolve on world time.

### World-Time Disclosure

The Journal discloses that all displayed times use the game world's world time — so a static countdown is not misread as a frozen real-time wall clock — through the right column's Tips card (`FABRICATE.App.Journal.Tips.WorldTime`) rather than a dedicated footer.

### Crafting / Alchemy Viewer Redaction

Runs of recipes the viewer cannot see are redacted, mirroring the gathering blind-run redaction (*Rich Gathering Disclosure*):

- A crafting or alchemy run whose recipe is undiscovered or knowledge-gated for the viewer, or whose recipe no longer resolves, is shown with a generic localized title (`FABRICATE.App.Journal.Redacted.Title`), a default image, and no recipe id, steps, results, or failure detail.
- GM viewers and globally-visible recipes are never redacted.
- The redaction is enforced in the projection (`data-models/spec.md` *Run Journal Projection*), so no hidden crafting/alchemy recipe identity reaches a non-GM viewer through the Journal.

## Data Storage (UI-relevant)

All keys below use the literal `fabricate.*` namespace.

World settings:

- `fabricate.craftingSystems`
- `fabricate.recipes`
- `fabricate.gatheringEnvironments`
- `fabricate.gatheringConfig`
- `fabricate.gatheringParties`
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
