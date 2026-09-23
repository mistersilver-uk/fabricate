# UI Extension Points

## Purpose

Define the UI extension points: the GM Manager's downtime preview and premium extension, and the player window's navigation extension.
Sibling UI surfaces and the cross-cutting UI rules are indexed by the Surface Map in `ui-integration/spec.md`.

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
- **A theme foundation may be declared for a companion alone, and the dead-token sweep names it rather than pruning it.**
`--fab-on-info` is such a foundation: it is declared in every theme block and re-themed on a swap exactly like any other member of that generation, and no `var()` under this repository's own `styles/` or `src/` reads it.
`tests/components/theme-colour-contract.test.js` holds the companion-read set as a frozen exact-name exemption from its unread-token assertion, and asserts absolutely that every member is declared in every theme block, so a member missing from one is a failure rather than a consistent absence.
That absolute check is what the relative ones cannot do: a token removed from all seven blocks at once leaves every block still agreeing with every other, and the unread-token assertion builds its declared set from `:root` and the reference block alone, so neither reports it.
`--fab-on-info` additionally clears 4.5:1 against its own theme's `--fab-info` in `tests/components/theme-rendered-validation.test.js`, because the ink is derived from that theme's solid-fill ink rather than authored, and a derivation that is not measured is a comment.
The exemption carries no reader-site guard, unlike the `--fab-tag-*` family's, because the readers are in the companion repository that this repository's CI does not check out; the reciprocal assertion, that every companion read resolves against this token surface, is owned by the companion's own gate.
The set widens only by naming a new member here and in the frozen test set together, and a companion MUST NOT assume that a `--fab-*` token this list does not name is contract.
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
- **Core guarantees the rail and the extension panel's geometry, and that neither the rail nor the panel overflows horizontally at the player window's enforced 1024x640 minimum size** (`ui-visual-style/spec.md` §Responsive Product UI).
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
