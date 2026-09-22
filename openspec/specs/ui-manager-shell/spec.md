# UI Manager Shell

## Manager Shell

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

## Manager browse view-state

Every manager browse surface renders inside one mutually exclusive route branch, so opening a record unmounts the list the GM was reading and returning mounts a fresh one.
The filter bar's state MUST therefore outlive the surface: search term, filter axes, sort key and direction, page index and page size are **preserved across the trip that unmounts the surface**, and the GM returns to the list exactly as they left it.

The trip differs by surface and each kind counts.
Where an editor route exists the trip is the editor round-trip — the system library, the environment library, the gathering task and encounter libraries, the three studios, and the world scoped-entity catalogues.
Where no editor exists the trip is leaving the route or switching a sub-tab, which unmounts the surface just as completely: the tool library, the six vocabulary panels, the Knowledge roster, the grant-access rosters, World Travel's realm list and a realm row's environment pickers.
For the vocabulary panels that trip is leaving the route alone, because neither vocabulary route has a sub-tab to switch (issue 1915).

The state is owned by the **manager shell**, never by the surface and never by an intermediate component between the two.
An intermediate is unmounted by the same trip, so state held one level up is destroyed by the very transition it would exist to survive.
A surface reached through an intermediate has its state threaded through it; each surface receives its OWN slot and no surface can read another's, so a term typed into one vocabulary panel never appears in its sibling.

The vocabulary surface is SIX panels across two routes, and the two routes answer this rule differently.
The three system panels each hold a lifted slot and preserve their search term, sort key and sort direction across the trip that unmounts them.
The three world panels hold panel-owned state that dies with the route, and that is a stated exception rather than drift: the world route carries no library search for a stale term to be carried into, and its panels are unreachable from any editor round trip.
Because both routes render all three vocabularies at once, sequential focus traverses all three in document order on each.

Where a surface resets its filters on a genuine crafting-system change, the remembered system id MUST live beside the filters it guards.
A sentinel held by the surface re-initialises when the surface remounts, so returning from an editor reads as a system switch and clears the state the lift exists to preserve — a lift whose sentinel stays behind is inert.
The same rule governs a page-to-the-selection guard, which otherwise pages away from the restored page.

This state MUST NOT live in the store the list renders from, for the reason `design-system/spec.md` states for row disclosure state: every persisted edit refreshes that store, and a refresh must never be able to reset the GM's filter bar.

A **search term the store's own data assembly consumes is not view-state and stays in the store.**
The component and recipe browser terms are these: setting one triggers a refresh that threads the term into the managed-item and recipe-list projections, so it selects the cohort that is fetched, hydrated and memoised rather than narrowing rows already published.
Neither mechanism is world-scoped or replicated — both are per-session — so the boundary between them is the term's ROLE and not its persistence.

State that belongs to a single session MUST still reset when its surface unmounts, and MUST NOT be lifted:

- an editor's own pickers, including the gathering task editor's component, tag, drop-rule and tool searches, which name what the GM is attaching to the record in front of them;
- a half-typed vocabulary add-form entry, which is an unfinished record rather than a filter;
- an armed destructive confirmation, because an arm that outlives its surface is a delete nobody re-confirmed;
- a bulk selection, which is an in-progress action over a set rather than a filter over rows;
- the essence catalogue's membership filter, which is `in`-scoped on every mount because a list showing entities the edited system does not hold reads as data loss.

### Scenario: A GM returns from an editor to a filtered list

- **WHEN** a GM narrows a browse surface with a search term or filter, opens one of its records, and returns
- **THEN** the surface renders with that search term and filter still applied
- **AND** the page they were on is restored, clamped to the last valid page when rows were added or removed while they were away

### Scenario: A GM returns to a surface that has no editor

- **WHEN** a GM narrows a surface with no editor route, navigates away or switches sub-tab, and comes back
- **THEN** the surface renders with that search term still applied
- **AND** a sibling surface sharing the same component renders with its own empty term

### Scenario: A GM re-opens a record editor

- **WHEN** a GM types into an editor's own picker search, leaves the editor, and opens a record again
- **THEN** that picker search is empty
