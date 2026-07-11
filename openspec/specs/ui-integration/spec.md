# Specification 003: UI Integration

## Purpose

Define Foundry UI integration points and user workflows for Fabricate.
This file is UI-only.
Domain behaviour is defined in:

- `004-resolution-modes.md`
- `005-recipes-and-steps.md`
- `006-recipe-visibility.md`
- `007-destructive-changes-and-migrations.md`
- `009-gathering-and-harvesting.md`

Global rule: if a system feature is disabled, controls for that feature are hidden.

## Product UI Visual Style

Fabricate's Foundry-facing product UI must use a clean flat visual style.

- Product UI surfaces, headers, buttons, overlays, and selected states must not use `linear-gradient`, `radial-gradient`, or `conic-gradient`.
- Full-track semantic value scales may use `linear-gradient` only when the gradient directly communicates the numeric meaning of the control, such as a green-to-red risk slider.
- Use solid colors or RGBA fills for shells, cards, headers, overlays, and controls.
- Visual hierarchy should come from spacing, typography, borders, and restrained shadows rather than decorative gradients or blur-based glass effects.
- Shared tokens in `styles/fabricate.css` and app-local editor tokens should be the source of truth for reusable surface treatments.
- Fabricate exposes a global module setting, `fabricate.theme`, for choosing the active product UI colour theme.
- Fabricate exposes a global module setting, `fabricate.experimentalFeatures`, for future experimental feature gates.
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
Items with the same UUID or sourceUuid are de-duplicated on import.
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
- Manager V2 selected-system experimental routes are gated by `fabricate.experimentalFeatures`.
When the setting is disabled, `Recipes`, `Rules`, and `Graph` render as disabled planned rail items with the `Soon` treatment and cannot become the active route, and the `Crafting` nav group is not shown.
When the setting is enabled, `Recipes` and `Books & Scrolls` are available as implemented routes for the selected system, nested inside an expandable `Crafting` nav group (see below); `Rules` and `Graph` remain disabled planned rail items until their v2 route content is implemented.
When `Recipes` is the active implemented route, its `recipe-edit` subroute is treated as part of the Recipes route for navigation, redirect-when-unavailable (falling back to `system-edit` exactly as `recipes` does, since Recipes is nested under the experimental system-edit gate), breadcrumb (`Crafting` then `Recipes` then `Edit recipe`), and left-nav active-state purposes — the same sibling-subroute relationship the Essences route has with `essence-edit`.
- When `fabricate.experimentalFeatures` is enabled, the selected-system `Crafting` rail item is an expandable nav group modelled on the Gathering group, and the whole group (parent and every sub-item) is shown only while the setting is enabled.
The parent row shows an expand/collapse control and the recipe count as its badge.
Activating the parent item opens the Recipes browser by default and expands the submenu only when the active route is outside Crafting; when a Crafting child route is already active, activating the parent item must not navigate away from the current Crafting page, and while a Crafting child route is active the expand/collapse control is locked open — activating it keeps the submenu expanded rather than collapsing it.
The group collapses when the active route leaves Crafting, so its submenu does not dangle open over unrelated views.
The expanded submenu (built by `buildCraftingNavItems`) always contains `Recipes` and `Settings`, plus a **mode-conditional** entry derived from the system's `visibilityMode` (via `craftingEffect`): `Access` appears only in `restricted` mode (`showAccess`), and `Books & Scrolls` appears only in `item` and `knowledge` modes (`showBooksScrolls`); `global` mode shows neither.
The submenu sits inside the same soft grouped container the Gathering group uses, and it carries Gathering-parity accessibility: `aria-expanded`/`aria-controls`/`aria-current`, distinct expand and collapse labels, and unique `manager-nav-crafting` / `manager-crafting-submenu` / `manager-crafting-nav-<id>` ids.
Route exit from any Crafting child route runs through the Manager confirm-discard route-exit guard.
- The `Crafting` group's `Settings` sub-route (`crafting-settings`, component `CraftingSettingsView`) is a real system-settings page, not a placeholder.
It hosts the system-level crafting rules that used to live on the System Overview page: the recipe **resolution mode** card, the salvage **resolution mode** card (only when `features.salvage`), and the **Recipe Visibility** card — a single radio-card selector for the flat `visibilityMode` enum (`global` / `restricted` / `item` / `knowledge`) written through `setVisibilityMode`, paired with a `CraftingEffectPanel` that summarizes what the chosen mode enables.
The Recipe Visibility control no longer lives on the System Overview page, and it authors the flat `visibilityMode` rather than the legacy `listMode` + `knowledge.mode` pair.
Because the whole `Crafting` nav group is gated behind `fabricate.experimentalFeatures`, these controls are reachable only while that setting is on.
This is an accepted consequence: with Experimental Features off, recipe resolution mode and recipe visibility are unreachable.
Per-recipe-item use and learn caps are NOT on this page — each recipe item's caps are authored on its own Books & Scrolls item page (`books-scrolls-item`).
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
- Environments (only when the selected system has `features.gathering === true`)

### Systems Tab

Display list + detail editor for crafting systems.

#### Base Fields

- Name
- Description
- Recipe resolution mode (`simple`, `routedByIngredients`, `routedByCheck`, `progressive`, `alchemy`)
- Salvage resolution mode

Recipe resolution mode and salvage resolution mode remain system fields, but their editor cards moved to the Crafting group's Settings page (`crafting-settings`), gated behind `fabricate.experimentalFeatures`.
They are no longer edited on the System Overview page.
Changing recipe resolution mode is destructive and must follow `007` confirmation/cleanup rules.

#### Salvage Resolution Mode Card

The Salvage resolution mode card renders directly beneath the recipe resolution-mode card on the Crafting group's Settings page.
The card offers `simple` (the default), `progressive`, and `routed` (display name "Routed by check").
Salvage has exactly one ingredient, so ingredient-set routing is meaningless and `alchemy` does not apply: neither is offered.
`simple` returns one result group with an optional pass/fail salvage check.

The card SHALL render with the system's persisted `salvageResolutionMode` selected, defaulting to `simple` when the value is `simple` or absent.
Persistence happens only on an explicit GM selection through `setSalvageResolutionMode`.

Changing salvage resolution mode is non-destructive:
it reversibly disables salvage on components incompatible with the new mode and deletes no recipes or runs,
so the confirmation copy is salvage-accurate and not the recipe-deletion warning.

#### Feature Toggles

- Gathering: persists `features.gathering` and makes the selected system's gated `Environments` tab reachable when enabled.

#### Feature Controls

- Category list editor for custom categories only; reserved `General` is always present and not removable
- Item tag list editor
- Essences toggle (`features.essences`)
- Property macros toggle (`features.propertyMacros`)
- Effect transfer toggle (`features.effectTransfer`)
- Time requirements toggle (`requirements.time.enabled`)
- Currency requirements toggle (`requirements.currency.enabled`)
- Currency unit profile editor (`requirements.currency.units[]`)
- Multi-step recipes toggle (`features.multiStepRecipes`)
- Gathering toggle (`features.gathering`)

#### Crafting Check Controls

- Enable checks
- Check macro
- Success macro
- Failure macro
- Failure consumption policy
- Optional routed outcomes reference list (for GM guidance only; not a routing map)
- Progressive settings (`awardMode`, `allowPlayerReorder`) (progressive only)

For a `routedByCheck` system whose routed check `type` is `fixed`, the tier `CraftingCheckEditor` hides the DC field and the meet/exceed comparison, because fixed tiers match by explicit value range rather than against a DC.
The DC-hiding note applies to `routedByCheck + fixed` in the `CraftingCheckEditor` only; the DC and comparison stay shown for relative-type `routedByCheck` and for the salvage/gathering check editors.
`routedByIngredients` no longer renders the tier `CraftingCheckEditor` at all — it authors its optional pass/fail check via the shared `SimpleCraftingCheckEditor` (bound to `craftingCheck.simple`), which shows the DC, the meet/exceed comparison, the static/dynamic DC source, and the recipe DC tiers.

Mode semantics are defined in `004`.

##### Check Tool-Breakage Controls

All three check editors (simple, routed, and progressive) ALWAYS render a single unified `CheckTriggers` editor (issue 419 recombine) — one trigger list per check, replacing the former separate per-die crit table and tool-breakage trigger card.
Each trigger pairs an expressive dice-matching condition with two effects: a themed outcome `<select>` and (under `checkDriven` authority) a break-tools pill.

- The outcome select forces the check to Automatic success / Automatic failure / No effect (relabelled Award all / Award none / No effect on a progressive editor, reusing the existing award keys), and is disabled + pinned to No effect for an `outcomeTier` condition.
Outcome forcing applies under BOTH authorities.
- The per-trigger break-tools pill (and the routed per-tier `outcome.breakTools` column) renders ONLY under `checkDriven` authority (`showBreakTools={checkDriven}`); under `toolSpecific` it is hidden and a check never breaks tools.
- There is no free-text trigger label, no per-block enable toggle, and no natural-1 auto-seed; an empty trigger list is inert and the GM adds triggers explicitly.
Condition types are `rollTotal`, `progressiveValue` (progressive editors only), `diceGroup` aggregate, and `outcomeTier` (routed editors only); dice groups are labelled from the formula, with duplicate `NdS` groups disambiguated (`#1` / `#2`).
- This authority gate applies per subsystem: crafting and salvage (salvage is always on) honour the system authority; gathering exposes the per-trigger break-tools control only when `features.gathering === true`, otherwise it stays `toolSpecific`.

#### Requirements Controls

- Time toggle
- Currency toggle in the Optional features section, bound to `requirements.currency.enabled`.
It renders always (independent of which optional feature flags exist on the system), so the section is never empty.
- Currency units card under character modifiers, rendered only when `requirements.currency.enabled === true`.
When currency is disabled the entire currency-units configuration block (spend strategy, provider, macros, and units) is hidden.
- A config-level block above the unit list with a spend-strategy `<select>` offering the three peer strategies (`actorProperty` / `actorInventory` / `macro`; both dnd5e and pf2e), each with `<small>` hint text reflecting the selected strategy.
When `actorInventory`, a provider `<select>` populated from the provider registry (or an empty-provider callout steering the GM to the macro strategy when the system has none).
When `macro`, three macro drag-and-drop zones (`canAfford`/`increment`/`decrement`) that accept only `type === 'Macro'` drops, resolve the linked macro name/icon, support unlink (button + right-click), and show a missing state for unresolved UUIDs; the increment hint notes it is reserved for a future refund flow.
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
Visibility and learning semantics are defined in `006`.

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

The Settings tab additionally renders a **Character prerequisites** card (`CharacterPrerequisitesCard`, issue 544) — a system-owned library of reusable pass/fail conditions the GM attaches to a book/scroll to gate who may learn its recipes (behaviour in `recipe-visibility`).
It is an accordion list (one entry expanded at a time): each collapsed row shows the entry name and a live `@path op value` preview, and the expanded body edits the name, then the property `path` (rendered with a leading `@` affordance), an operator dropdown (the nine `CharacterPrerequisite.op` tokens), and a `value` field that is hidden for the valueless operators (`is true` / `is false` / `exists`).
Add, delete, and an opt-in **Seed presets** action (enabled only for `dnd5e` / `pf2e` worlds, disabled with an explanatory tooltip otherwise) mirror the gathering character-modifier card's affordances.
Each control live-applies through the admin store (`addCharacterPrerequisite` / `updateCharacterPrerequisite` / `deleteCharacterPrerequisite` / `seedCharacterPrerequisitePresetsForSystem`), staging no dirty draft.

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

For actor-owned items, Fabricate may add item sheet header controls tied to recipe learning.

- When `learn.dragDropEnabled === false` and knowledge mode supports learning, show a header icon/button to manually learn matching recipes from that owned item.
- The manual learn control is shown only when the current user can update the owning actor and at least one matched recipe is learnable.
- When an owned item matches recipes from multiple systems, the header control reflects only the manual-learning subset: matching recipes whose systems have `learn.dragDropEnabled === false`.
- Clicking the control opens a confirmation prompt before learning.
- On confirmation, run the learning flow from `006`, including `consumeOnLearn` behavior and item removal when required.
- If `learn.dragDropEnabled === true`, the manual header learn control is hidden by default.

### Items Tab

Capabilities:

- Add managed items from world or compendium.
- Bulk-add managed items by dropping a Folder or a whole compendium onto the import zone.
Folder
  drops are accepted from both the world Items directory and a compendium directory, and expand to
  every contained Item including nested subfolders; a compendium folder's items are resolved from
  the pack index entries.
- Remove managed items.
- Edit managed item tags (if enabled).
- Edit managed item essences (if enabled).
- Edit managed item difficulty: the component editor's right-hand inspector exposes an editable
  progressive-difficulty input.
It is shown only when the system's crafting resolution mode is `progressive` (parity with the
  read-only components-browser column).
It accepts an integer of 1 or greater, or blank to clear the value.
The input is staged into the component editor's draft and persisted with the rest of the edit on Save (not written on change), contributing to the editor's dirty state and unsaved-changes guard.
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

Tool-breakage authority (issue 419):

- The Tools page carries a system-level **tool-breakage source** control: a card with a header, descriptive hint, and a radio group offering `toolSpecific` (default) and `checkDriven`.
- `toolSpecific` means each Tool's own breakage mode decides whether it breaks and a check never breaks tools; `checkDriven` means the active check's `checkBreakage` triggers decide whether all required tools break and each Tool's own mode is ignored except `immune`.
- Each source option is self-describing (a bold name above a muted description); the `checkDriven` option's description carries the "per-tool breakage modes are not evaluated (except Immune)" guidance, so there is no separate advisory line.

Per-tool breakage editing is governed by the active authority; the two authorities never expose their per-tool breakage surfaces at the same time:

- Under `toolSpecific` authority the per-tool breakage **mechanic** offers the three original modes — `Limited uses`, `Break chance`, `Dice expression` — each with its own field inputs. `Immune` is not offered here; an `Immune` tool coerces to the `Limited uses` display (an unlimited limited-uses tool also never breaks) and persists a concrete mechanic once edited.
- Under `checkDriven` authority the per-tool breakage mechanic is binary: `Breakable` or `Immune`, with no field inputs. `Breakable` means the tool can break (the active check decides); it preserves the tool's existing non-immune mechanic under the hood (defaulting to unlimited limited-uses), so switching the source back to `toolSpecific` restores it.
- An `Immune` tool never breaks under either authority and is still recorded as used; the `onBreak` configuration stays available, and the browse-row breakage chip reads as a never-breaks state (and as `Breakable` for a non-immune tool under `checkDriven`).

### Recipes Tab

List recipes for the selected crafting system.

In Manager, recipe browse status uses the same compact interactive on/off toggle pattern as systems and environment browse rows.
The Status column remains a Status column, and each row exposes a keyboard-reachable toggle with On/Off copy and enabled/disabled color treatment.

Columns:

- Name
- Locked
- Incomplete (a derived warning chip on the recipe identity, shown when the recipe is an incomplete shell — missing ingredient sets and/or result groups — distinct in tone from the Locked chip)
- Visibility summary (player and knowledge list modes only; hidden in global mode)
- Category (if enabled)
- Step count (if multistep enabled)
- Last modified (optional)

Actions:

- Create
- Edit
- Duplicate
- Delete

In Manager, the recipes browser header offers a single primary `Create recipe` action (no crafting-system import/export on the recipes header); creating a recipe follows a create-then-edit model — `store.createRecipe` persists a new identity-only *incomplete shell* in the selected system via `RecipeManager.createRecipe({ craftingSystemId }, { allowIncomplete: true })` (it saves because persistence gates on structural validity only, not completeness) and the manager immediately opens the recipe-edit view on it.
The new shell carries the default recipe name and image until edited, and the browse row surfaces a derived `Incomplete` chip until ingredient sets and result groups are added.
The recipe browse row `Edit` action opens that same dedicated recipe-edit view rather than editing inline, and that Edit action is available regardless of the recipe's `locked` state.
The recipe-edit view holds a recipe identity card (name, description, image, and an `enabled` on/off toggle) editing a local draft in the central `manager-main`, and the GM manager's right-hand context inspector panel (the global `manager-inspector` aside) holds the recipe-item link card.
Identity edits track a dirty state surfaced by a header dirty chip, persist via `store.updateRecipe` → `RecipeManager.updateRecipe(recipeId, updates, { allowIncomplete: true })` (so an identity-only save is not blocked by the shell's still-empty ingredients/results), and a dirty draft prompts a discard confirmation on route exit.
The recipe-edit header follows the standard editor convention shared with the gathering-task, gathering-event, and environment editors: an `Unsaved` chip (when dirty), `Back to recipes`, `Delete recipe` (danger, enabled whenever a recipe is selected), and `Save`.
The recipe-item card is the partial implementation of the `### Visibility Form` recipe-item selector (see below); the Visibility Form's per-recipe restriction editor (restricted toggle + allowed-users allow-list) is implemented for the `player` list mode, and the rest of `## Recipe Editor` (ingredients, catalysts, essences, steps, and results) remain deferred.
The inspector panel that carries the recipe-item card is shown for knowledge modes that consume an item (`item`/`itemOrLearned`) and suppressed (central column full-width) when the selected system's recipe knowledge mode does not consume an item (`knowledge.mode === 'learned'`); the layout collapses to a single column at the Manager container's narrow breakpoint (`@container fabricate-manager (max-width: 960px)`), mirroring the environment editor.
The `recipe == null` form of this view shows a `Select a recipe` empty state.

Recipe browse row quick-actions (`Edit`, `Duplicate`, `Delete`) render in a single non-wrapping action group, consistent with the environment and gathering-task browse rows.

### Books & Scrolls Surface

`Books & Scrolls` is the `Crafting` group's recipe-item management surface, shown only while `fabricate.experimentalFeatures` is enabled.
It is a display name only: the surface manages every recipe item in the selected system regardless of the item's Foundry item type (book, scroll, ring, wand, gem, note), and `recipe item` remains the canonical noun.

The surface lists every recipe item in the selected system (from `selectedSystem.recipeItemDefinitions`), and for each item shows its identity (image and name), the recipes it contains (its canonical `recipeIds[]` membership, with a legacy `recipe.recipeItemId` fallback for un-migrated systems) as a count plus the linked recipe names, and that item's OWN use/learn caps (read from `item.caps`) as read-only chips: a use-cap chip (craft charges) and a learn-cap chip.
Membership is authored on the item's **Contents** tab (writing the definition's `recipeIds`), not on the recipe editor.
The caps are per recipe item, not a shared system-wide rule, so two recipe items in one system may show different chips (a one-recipe scroll beside a three-recipe tome).
When the selected system has no recipe items, the surface shows an empty state.

Opening a row navigates to a per-item caps page (`books-scrolls-item` subroute).
That page's breadcrumb is `Crafting` then `Books & Scrolls` then the item name, and it renders a `RecipeItemCapsCard` that authors that one item's caps: the use cap (`caps.item.limitUses` / `maxUses` / `destroyWhenExhausted`), the learn cap (`caps.learn.limitRecipes` / `maxRecipes` / `destroyWhenSpent`), and `caps.learn.consumeOnLearn`.
`consumeOnLearn` is hidden while the learn cap is enabled (the learn cap's `destroyWhenSpent` supersedes it).
Editing is live-apply: each control passes its caps patch through `updateRecipeItemCaps(itemId, patch)`, which merges and normalizes it onto the recipe item definition, so the page stages no dirty draft and is not part of the Manager confirm-discard route-exit chain.
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
In the player app, the **book detail** (`InventoryDetail`) renders the "Needs: &lt;name&gt;" chip row full-width below the header from the row's `requirements` array (surfaced by `InventoryListingBuilder`), reflecting the acting actor's met/unmet state per requirement (success ramp + check glyph when met, danger ramp + lock glyph when unmet); a blocked recipe's Learn button is disabled (the enumeration is not repeated per recipe).

### Access Surface

`Access` is the `Crafting` group's per-recipe grant surface for the `restricted` visibility mode (`AccessTabView` / `GrantAccessInspector`).
It is a Crafting nav sub-item that appears **only** while `visibilityMode === "restricted"` (`craftingEffect.showAccess`); the other modes do not list it.
It authors the canonical `Recipe.access = { characterIds, playerIds }` grant, replacing the legacy `visibility.allowedUserIds` player list.

The list (`AccessTabView`) shows the selected system's recipes with a search box, a Category filter, and an Access filter (`all` / granted / no-access); each row shows the recipe icon, name, category, and a grant chip (`N char · N player`, or a danger `No access` chip when no character or player is granted).
Selecting a row opens the `GrantAccessInspector` for that recipe.

The inspector authors the grant through **two independent rosters** — Characters and Players — each with its own search box and pager:

- The **Characters** roster is the player-character actor roster (`adminStore.getPcRoster` → `services.getPlayerCharacterActors`); toggling a character grants or revokes its actor id in `access.characterIds`.
A granted character makes the recipe visible to any viewer who **controls** that actor (assigned character or Foundry `OWNER` permission — see `006`), not to a fixed user.
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

Validation rules from `009-gathering-and-harvesting.md` must be enforced before save.

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
The `Travel actor` source is presented as "automation not yet available" rather than hidden, so the model is complete before Phase 3.
- Each stale member / travel-actor / override-realm reference gets a remove/clear action; "repair" means removing the stale reference and re-assigning through the normal pickers.
- The route embeds the canonical **realm authoring surface** using a realm list + detail layout: the list creates/selects/deletes realms; the detail pane edits the selected realm's name, description, image, enabled, secret, and biomes (chosen from the system biome vocabulary).
Edits merge-patch over the existing record so unedited fields (sort, sceneMappings, modifiers) round-trip untouched.
Delete is destructive and routes through the confirm dialog with referenced-by evidence (a deliberate change from the prior immediate-delete quick list).
- This realm authoring is the source of the realms an environment can be assigned to via its `includedRealmIds` multi-select; the multi-realm data is authored here, not in the environments browser.
The legacy environments-browser "Region" filter has been removed.
- Validation lives in the party store; the view surfaces store validation errors inline next to the relevant control using the Manager's `aria-invalid`/`aria-describedby` pattern.
Actor pickers follow the accessible semantics established by `ActorSelectTopBar`.

Not yet shipped (later-phase follow-ups, kept out of canonical capability claims): realm discovery controls, and the player-facing travel/current-realm view. (Realm authoring — name/description/img/secret/biomes — and the environment realm-membership control now ship inside the Travel route and environment editor; the legacy realm ordering/sceneMappings/modifiers authoring remains reserved.)

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
The panel also offers **Promote region to interactable**: a GM selects an existing drawn region of **any shape** and a Tool or Gathering Task source; the behaviour `system` is built via `buildInteractableBehaviorSystem()` and attached to that region (optional marker creation via the existing recreate-tile/drawing seams; gathering-task promotion runs the drop-time environment-resolution precedence).
The promote **source picker enumerates Tools and Gathering Tasks through the same shared source enumeration the Interactable browser uses** (one source of truth — system-owned `getSystem(id).tools` for Tools, the persisted gathering config for Tasks), so a system that has a Tool always offers it as a promote source.
When an auto-defaulting crafting-system picker must pre-select a system (the promote picker and the Interactable browser), it must prefer a system that actually has selectable sources of the relevant type over an empty first entry, so the `No sources in this system.` state is never reached purely because a same-named, source-bearing sibling was left unselected.
The panel is the supported authoring path for arbitrary-shaped interactables (the browser drag remains the 1-grid-square fast path).
It is GM-only; players never see it.

## Recipe Editor

Scoped to a single crafting system.

The Manager recipe-edit view partially implements this editor: the identity surface from `### Base Form` (Name and Description, plus a player-facing image and an `enabled` on/off toggle, edited as a local draft with a standard `Unsaved` chip + `Back to recipes` + `Delete recipe` + `Save` header and a dirty/route-exit guard), the `recipeItemId` selector from `### Visibility Form`, and the `### Visibility Form` player-mode restriction editor (restricted toggle + allowed-users allow-list, shown only while `listMode === "player"`) are implemented.
Because ingredients/steps/results are deferred, the recipe under edit is typically an *incomplete shell*: it is created (via "+ Create recipe") and its identity is saved through the `allowIncomplete` authoring path, which gates on structural validity only.
The shell remains non-craftable (the engine still gates on completeness) and the browse row shows a derived `Incomplete` chip until those deferred sections are filled in.
The Locked toggle, Category, the Step Structure UI, and the Step Editor remain deferred.

### Base Form

- Name (implemented in Manager)
- Description (implemented in Manager)
- Category (if enabled; always includes reserved `General`) — deferred
- Locked toggle — deferred

In Manager, the recipe-edit identity card additionally edits a player-facing image (via the FilePicker) and an `enabled` on/off toggle alongside Name and Description.

The Overview tab additionally offers an optional **Minimum success tier** dropdown, shown only when the selected system runs a `routedByCheck` check whose routed `type` is `fixed`.
Its options are that fixed check's success outcome tiers ranked ascending by `start`, preceded by a default `No override (use rolled tier)` entry, and it authors the recipe's `minSuccessOutcomeId`.
Selecting a tier makes a craft that rolls below it fail outright (see `004`); the control is hidden for relative-type checks and for non-`routedByCheck` systems.

### Visibility Form

If `listMode === "global"`:

- No per-recipe visibility controls shown.
- Restricted visibility toggle and allowed users multiselect are hidden.

If `listMode === "player"`:

- A **restrict to specific users** toggle bound to `recipe.visibility.restricted`, shown on the recipe editor's Overview tab only while the system's `listMode === "player"`.
- When restriction is on, an allow-list of the world's non-GM users bound to `recipe.visibility.allowedUserIds`.
The user options come from a `getWorldUsers` service projected into the admin store as `worldUsers`; the store never reads Foundry globals directly.
- When restriction is on and the allow-list is empty, the editor SHALL surface a warning that the recipe is restricted with no users selected, so no player can see it.
This is a valid configuration and saves without error.
- The toggle and allow-list stage `recipe.visibility = { restricted, allowedUserIds }` into the recipe draft and persist through the normal recipe-draft save flow, not on change.
- When the world has no non-GM users, the allow-list shows an empty-state note instead of user rows.

If knowledge mode includes item matching or learning:

- Recipe item selector / drop zone
- Preview of each linked recipe item definition (name, image, and source status)
- Per-book unlink action
- Helper text: owned copies match by UUID or resolved source UUID of the linked recipe item definition

The recipe item selector is **partially implemented** by a recipe-item link card (`RecipeItemInspector`) rendered in the GM manager's right-hand context inspector panel (the global `manager-inspector` aside), not a view-internal column.
Because recipe↔book membership is **many-to-many** (issue 511: `RecipeItemDefinition.recipeIds`, projected onto the recipe row as `recipe.recipeItemIds`), the card enumerates **every** book/scroll that teaches this recipe as a **list** rather than showing a single scalar link.
Each list row previews that book's name/image/source status and offers Open item, Copy item UUID, and a per-book Unlink (also right-click) — Unlink removes the recipe from **that** book's membership only, leaving the recipe's other books intact.
Below the list a compact drop zone links another book: dropping a Foundry Item links it via `addRecipeItemFromUuid` (which synthesizes or dedups a `RecipeItemDefinition`) and adds the recipe to its membership.
Each row falls back to the legacy scalar `recipe.recipeItemId` only for a fully un-migrated system, and a row whose definition's `sourceItemUuid` no longer resolves shows a missing/stale state and retains the link.
The central `manager-main` holds the recipe identity card; the recipe-item card sits beside it in the shared inspector panel.
Linking or unlinking applies immediately (through `setRecipeBookMembership`) and is independent of the identity Save draft, and unlinking does **not** delete the shared definition.
The inspector panel is shown for knowledge modes that consume an item (`item`/`itemOrLearned`) and suppressed (full-width main) for `learned`.
The player-mode restricted-visibility toggle and allowed-users allow-list are implemented on the Overview tab as described above.

If the required linkage is missing, show a validation warning.

The canonical recipe-editor flow must not require manual UUID entry for recipe items.
The selector should follow the same drag/drop-first interaction pattern used elsewhere for component and essence-source selection.

### Step Structure UI

If multistep is enabled:

- Step list with add/remove/reorder (drag and drop)
- One-step editor per step

If multistep is disabled:

- Show implicit single-step editors at the recipe level

## Step Editor

Per step controls:

- Step name and description
- Time requirement (when enabled)
- Currency requirement (when enabled)
- Ingredient set editor

Ingredient set editor supports:

- Add/remove ingredient sets
- Ingredient group editor per set:
  - Add/remove groups
  - Add/remove OR options within a group
  - Item placeholder options that match one or more configured system tags
- Catalysts grid per set
- Essences per set (when enabled)

Result editor changes by mode.
The UI must expose required data fields from `004`, but mode logic itself is defined in `004`.

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
  - A step with exactly one result group needs no outcome/tier mapping (the single-group exemption): it is produced on any non-failure outcome.
- Validation and helper copy must reserve failure keywords, including compatibility aliases such as former miss/event terms, and forbid them as result-group names.

### Alchemy check-mode selector (issue 554)

- At the **top of the Checks tab's Crafting sub-tab**, shown only when `resolutionMode === "alchemy"`: a native check-editor radio group (`manager-checks-type-options`) for `alchemy.checkMode` (`none` / `simple` / `tiered`), rendered ABOVE the per-mode editor and persisted live via `store.setAlchemyCheckMode` (which spreads the nested `alchemy` block so `learnOnCraft`/`consumeOnFail`/`showAttemptHistoryToPlayers` are preserved).
Selecting a mode swaps the editor below it live.
- The selector is NOT rendered on the Crafting Settings page; that page keeps only the Recipe resolution, Recipe visibility, and (when salvage is on) Salvage resolution cards.

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
- Read-only difficulty badge per result item
- Drag reorder controls
- Reorder indicator if `allowPlayerReorder` is true

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
  (via the `craftRecipe` facade seam); the engine returns `{ success, message }`
  and does NOT throw, so a failed craft surfaces its message rather than an error.
- A non-GM crafts directly against owned actors; there is no GM relay for player
  crafting.
- Time-based countdowns are driven by world time only: a new `subscribeWorldTime`
  bridge refreshes calendar-aware durations and re-fetches the listing quietly when
  the GM advances the clock.

### Deferred (this iteration)

- The learn affordance renders (the control plus its consume-on-learn warning), but
  its execution flow is NOT wired in this iteration.
- The Alchemy tab and the Journal cross-link remain out of scope for the player
  Crafting tab.

### Top-Level Tabs

- **Alchemy tab**: shown when >= 1 crafting system has `resolutionMode === "alchemy"`
- **Crafting tab**: shown when >= 1 crafting system has a non-alchemy resolution mode
- If only one tab type exists, show that tab without a tab bar
- If both exist, show tab bar; default to last-used or Crafting

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
  an optional `check` descriptor, `outcomeTiers`, and `result`.
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
- Row status badges from `006` evaluation, drawn from the `browseStatus`
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
- Show an ingredient-set selector when the recipe has more than one set; the
  detail reflects the chosen set's per-set craftability.
- Show the `check` descriptor (DC / skill / roll formula) when present, marking it
  optional or mandatory per mode and unusable when no roll formula is authored.
- Show the outcome-tier table for `routedByCheck` recipes, with each tier's
  awarded results (success tiers only).
- Show blocking reasons when not craftable (derived from `browseStatus`).
- Show the learn action when applicable.
- Show consume-on-learn warning text when applicable.

#### Shopping List Panel

- Session-scoped aggregation of materials needed for queued recipes.
- Shown only on the Crafting tab.

#### Recents Section

- Recently crafted recipes for quick access.

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
- Submit triggers signature matching per existing Signature Resolution rules in `004`.
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
- Visibility and learning semantics defined in `006`.

#### Active Runs and History (cross-reference reconciliation)

- The alchemy tab does NOT host runs or history.
Run monitoring remains a Journal concern (see *Journal App*); the tab's internal fizzle dead-end memory is not run history.
- The unified Journal screen surfaces alchemy runs alongside crafting, gathering, and salvage runs; an alchemy run is redacted there for a viewer who has not discovered its recipe.
- Forward-compat: the active station-tool chip stays in `ActorSelectTopBar` this iteration (the alchemy tab has no header/context bar yet); it migrates to an alchemy header bar if/when one is added.

#### Excluded from Alchemy Tab

- Shopping list
- Recipe browse list
- Recents
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
- The same learning flow must be invocable from the item sheet header learn control when drag-and-drop learning is disabled.

### Run Guardrails

Before start/resume and before each step action, UI must invoke guard checks defined in `006`.

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
Selecting an actor in the bar re-filters and persists the gathering listing; the `Crafting`, `Journal`, and `Inventory` tab bodies may remain placeholders while still rendering the bar.
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
While Scene Region automation is unimplemented, the `Travel actor` source is presented as "automation not yet available" rather than hidden.
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
It is a tab in the unified Fabricate window (`Crafting`, `Alchemy`, `Gathering`, `Journal`, `Inventory`), rendered beneath the shared Actor selection top bar, and reads the selected player-character's existing crafting, gathering, and salvage runs through one UI-safe projection (the `RunModel` / `StepModel` shapes defined in `002-data-models.md` *Run Journal Projection*).

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

### Run Monitoring

- The view resolves the selected actor through the shared Actor selection top bar and shows a no-actor empty state when none is selected.
- Active runs and history are shown across all three run types (crafting, gathering, salvage) in one unified surface; each row presents the run's title, run type, status pill, step progress (crafting), and a time-remaining/countdown where a `timeGate` exists.
- Each run's status pill reflects the projection's `derivedStatus` (`waiting` | `ready` | `inProgress` | `succeeded` | `failed` | `cancelled`), which is derived from the active step/run time gate against world time, not the persisted status (see `002-data-models.md`).
- Selecting a run opens a centre detail panel (steps, requirements, and — for a succeeded run — its crafted items, titled `FABRICATE.App.Journal.Results.Title` so it does not collide with the right column's "Recent results" card) plus a right column ordered "about this run" → "what to expect" → "recent results" → "tips".
- All countdowns and timestamps are world-time based.
- **Single-step recipes suppress redundant step chrome.**
A run whose projection reports `multiStep: false` (see `002-data-models.md`) hides the "Step X of Y" step-label chip on both the left run card and the centre identity row (its `stepLabel` is `""`) and omits the centre step timeline; the "Single-Step Recipe" structure chip and the "Step requirements" card are retained.
A single-step crafting run's "what to expect" card uses the single-step explainer (`FABRICATE.App.Journal.WhatToExpect.CraftingSingleStep`) instead of the multi-step crafting copy.

### Run-Type-Aware Actions Panel

The run detail's actions area is keyed on the projection's `manualAdvance` flag:

- **Crafting (`manualAdvance: true`)** shows a primary advance button.
On a non-final step it reads **"Trigger Next Step"** with the `FABRICATE.App.Journal.Actions.TriggerHint` ready hint and the `FABRICATE.App.Journal.TimeRemaining.WhenPassed` gate hint; on the **final step** (`isFinalStep: true` — a single-step recipe, or the last step of a multi-step recipe, where there is no next step to trigger) it reads **"Finish Crafting"** with the `FinishHint` ready hint and the `WhenPassedFinal` gate hint, and the left run card's matured countdown reads "Ready to finish" (`Countdown.ReadyToFinish`) rather than "Ready to continue".
It is DISABLED until the active step's time gate has matured — readiness is derived from `timeGate.availableAt <= worldTime` (race-free), NOT from the run's persisted status — and while an advance is in flight.
Triggering invokes the crafting advance contract in `005-recipes-and-steps.md` (*Run Progression — Player-Initiated Advance*); the final-step variant is copy-only and re-enters the same advance flow.
- **Gathering / salvage (`manualAdvance: false`)** show an explanatory "resolves automatically when world time advances" line plus the time-remaining box, and offer no trigger button, because matured gathering and salvage runs auto-resolve on world time.

### World-Time Disclosure

The Journal discloses that all displayed times use the game world's world time — so a static countdown is not misread as a frozen real-time wall clock — through the right column's Tips card (`FABRICATE.App.Journal.Tips.WorldTime`) rather than a dedicated footer.

### Crafting / Alchemy Viewer Redaction

Runs of recipes the viewer cannot see are redacted, mirroring the gathering blind-run redaction (*Rich Gathering Disclosure*):

- A crafting or alchemy run whose recipe is undiscovered or knowledge-gated for the viewer, or whose recipe no longer resolves, is shown with a generic localized title (`FABRICATE.App.Journal.Redacted.Title`), a default image, and no recipe id, steps, results, or failure detail.
- GM viewers and globally-visible recipes are never redacted.
- The redaction is enforced in the projection (`002-data-models.md` *Run Journal Projection*), so no hidden crafting/alchemy recipe identity reaches a non-GM viewer through the Journal.

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
- `fabricate.recentlyCrafted`
- `fabricate.progressiveResultOrder`

Flags:

- `flags.fabricate.learnedRecipes`
- `flags.fabricate.craftingRuns`
- `flags.fabricate.gatheringRuns`
- `flags.fabricate.discoveredGatheringRealms`

## Compatibility

- Must remain system-agnostic.
- Currency adapters are optional.
- Visibility uses Foundry user IDs, ownership, and Fabricate flags/UUID identity rules.
