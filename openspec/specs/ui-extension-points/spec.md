# UI Extension Points

## Purpose

Define the UI extension points in both directions, and the GM Manager's one Core-owned Premium advert outside the Downtime route.
Inward, a companion contributes navigation and content into Fabricate's windows: the GM Manager's downtime preview and premium extension, and the player window's navigation extension.
Outward, a companion renders Fabricate's published UI components into an element it owns (§Published UI Components).
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
Every header action carries `fabricate-button is-size-38`, and also `fab-manager-button`, a compat token deprecated at issue 2540: no Fabricate rule names it, and it is removed after at least one minor release, announced in the release notes.
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

### Header action compat token

#### Scenario: A header action keeps its deprecated token

- **WHEN** an extension registers a header action
- **THEN** it still carries `fab-manager-button`
- **AND** no Fabricate rule names it

### Experimental gate

**This gate is TEMPORARY and is tied to the feature being unreleased, not to a design decision.**
The route exists to host the premium Downtime Studio; both seams the Studio needs are implemented but the Studio itself is in no published release, so until it ships the surface is shown only to a GM who has opted in.
Every requirement in this subsection is removed when the Studio releases; nothing here states a permanent rule about premium surfaces or about extension seams.

- **The whole world `Downtime` rail group renders only while `fabricate.experimentalFeatures` is enabled**: the parent row, its disclosure toggle, its submenu, and therefore every premium signal that rides them — the parent row's `PREMIUM` badge, each sub-item's padlock, and the submenu's `PREMIUM PREVIEW` callout.
  Nothing outside that group names Downtime except the Premium crafting-icons advert, which carries its own temporary gate (§Premium Crafting Icons Advert); nothing else outside the group is gated.
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

## Premium Crafting Icons Advert

- **The GM Manager shows one Premium advert, the crafting-icons advert, in the page header's action group of exactly two screens: the world Component catalogue (`world-components`) and the system Component Rules list (`components`).**
  It is not rendered on the world Component entry, the Component Rules editor, or any other route.
  On Component Rules it leads the group, before `Add from catalogue`; on the world Component catalogue, whose group is otherwise not rendered, it is the group's only content.
- It shows six Premium crafting icons, a `PREMIUM` badge in the Manager title bar badge's gold treatment, one line of copy, an external `Get Premium` link and a dismiss control.
  The link is §Downtime Preview and Premium Extension's Patreon call to action — the same URL, `_blank`, `rel="noopener noreferrer"` — and, unlike that call to action, the advert carries raster imagery, because the icons are the product it advertises.
- It renders only while all three hold: `fabricate.experimentalFeatures` is enabled; no provider is registered in either extension registry, which is the predicate the Manager title bar's `PREMIUM` badge reads; and the world setting `fabricate.premiumIconsAdDismissed` is not `true`.
  A provider registered while the Manager is open hides it at once.
- **Its experimental gate is TEMPORARY and tied to Fabricate Premium being unreleased**, as §Downtime Preview and Premium Extension, Experimental gate, is, and it is removed with that gate.
- Dismissing it writes `fabricate.premiumIconsAdDismissed` as `true` for the world, so it is hidden for every GM of that world on both screens; a GM whose Manager is already open stops seeing it the next time that GM opens the Manager.
  It is hidden in the dismissing GM's Manager the moment the GM dismisses it, on both screens, until that Manager closes, whether or not the write succeeds; a refused write is logged and raises nothing, so the advert returns the next time the Manager opens.
  Fabricate offers no control that clears the setting, and the setting silences this advert only.
- It is the first thing in the header to give way: it compacts, then disappears, as the Manager narrows, and never wraps the action group or crowds the page title.
  It is full at a Manager width above 1320px, compact — three icons and no line of copy — from 961px to 1320px, and not shown at 960px or less, so the page heading keeps at least 320px.
- Its icons are bundled at 68px, about twice the 30px tile they fill, are referenced only by the module stylesheet, and are never offered as Item, component or essence art.
- The advert is GM Manager only: §Player Navigation Extension's "no premium signal in any state" rule is unchanged.

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

## Published UI Components

This section is the other direction of extension: a companion renders a Fabricate primitive into an element it owns, rather than contributing into a Fabricate window.
Phase 1 (issue #2426) publishes the seam and its first data-only leaf primitive; issue #2448 publishes more data-only leaves; issue #2451 publishes content and fault handling through the seam; issue #2452 publishes callbacks and the first control; issue #2453 publishes bound values; issue #2454 publishes the overlay host and its first overlay entry; issue #2455 publishes `StageBars`, lazy entries and `mountMany`; the standalone style root is the rest of phase 2 (issue #2427).

### The descriptor

- **`game.fabricate.api.ui` is a frozen `{ schemaVersion: 1, components, describe, mount, load, mountMany }`.**
- `components` is a frozen list of the published names in manifest order; a name is appended, never interleaved.
- `describe(name)` returns a frozen `{ version, props, rest, root, overlays }`, where `props` is `{ <key>: { kind: 'data' | 'text' | 'slot' | 'callback' | 'aria' | 'value', required: boolean, requiredWhen?: string } }`, `rest` says whether the component takes data attributes, `root` is its required ancestor root, and `overlays` says whether it opens an overlay; it returns `null` for a name that is not published.
`requiredWhen` is present only where the manifest states it, and `required` is then `false`.
- `mount(name, { target, props = {}, onFault, overlayHost })` renders a published component into `target` and returns a frozen `{ update(props), destroy(), slot(key), value(key) }`.
A companion detects `value` with `typeof handle.value === 'function'`.
Fabricate draws a published component's elements inside `target` and attaches no shadow root of its own, so they share `target`'s root node and an id reference resolves across the mount in either direction.
The one exception is an open overlay's panel, which is drawn in its host while it is open, as Overlays states.
- `load(names)` takes an array of published names, reads a value that is not an array as one name, and returns a Promise; it never throws synchronously and is callable as soon as `api.ui` is readable, before `fabricate.ready`.
It resolves `undefined` once every named entry's code is loaded: an eager entry at once, on the next microtask, and a lazy entry once its code is fetched.
It rejects with the M3 `TypeError` for a name that is not published, before it fetches anything, and with the loader's error when a lazy entry's code cannot be fetched.
It does not wait for `fabricate.ready`, so M2 still applies to `mount`.
- A lazy entry's code is fetched once per page session: concurrent and later calls share the one fetch, and a failed fetch is not retried, so every later `load` naming the entry rejects with the same error and `mount` keeps refusing it with M19.
A fetch the host refuses to serve as a code-split chunk, which is what a browser running a stale copy of Fabricate causes, also logs a console error and raises Fabricate's reload notice, which names no window.
That notice is shared with the Manager's so one shows at a time, and is raised at most once per page session.
A fetch that fails before Foundry has created its notifications holds the notice until `ready`.
Fabricate draws and announces nothing else for a load: a companion draws its own pending state until `load` settles and, on a rejection, its own error state, announced through its own live region.
- A companion calls `load` once, keeps the promise, and mounts only after it has resolved and Fabricate is ready.
- `mountMany(name, items)` mounts one published entry into several targets in one call, where `items` is an array of `{ target, props = {}, onFault, overlayHost }`, each item read as `mount`'s options.
It returns a frozen array of handles in item order, each as `mount` returns it, and a frozen empty array for an empty `items`.
It judges `items` with `Array.isArray` and coerces nothing, so a single item, or any other value that is not an array, is M21.
It judges the name with M1, M2, M3 and M19, then M21, then each item in order with every refusal `mount` makes for the same arguments, before it claims a target or renders anything: it throws the first refusal unchanged and renders nothing.
A hole in `items`, or an item that is not an object, reads as no options, as `mount` reads them, so it is M4.
A target that two items name is M5.
That judgement is pure: it ends no stale claim, and a stale claim is ended only as its own item renders.
A target inside a content slot of another item of the same call cannot be judged before that item renders, so a companion mounts it in a later call.
Once every item is judged, a render fault is that item's own: its handle is inert, only its `onFault` is called, and the other mounts stay live.
Destroying one handle leaves the others live, and there is no call that destroys them all.
A companion detects it with `typeof ui.mountMany === 'function'`.
- `api.ui` is bound at `init` and rebound at `ready` as the same object.
It exists once Fabricate's own `init` listener has run, so a companion reads it in `setup` or later, never in its own `init`, and its `mount` throws until the `fabricate.ready` hook has fired.
- `api.ui` is not a member of either navigation context, and neither context gains a component or a mount function.

### The manifest and versioning

- **The published set is a frozen data manifest**, each entry `{ name, path, version, props: { <key>: { kind: 'data' | 'text' | 'slot' | 'callback' | 'aria' | 'value', required?, requiredWhen?, element?, args?, initial? } }, rest, root, restOn?, overlays?, lazy? }`, and Fabricate's runtime adapter binds each `path` to its component, or a lazy entry's to a loader that fetches it.
`requiredWhen` names another `data` key of the same entry; the key is required while that key is truthy.
Giving an existing key `requiredWhen` is a narrowing.
`restOn` is `'control'` where the component's rest keys land on a control it draws, and is otherwise absent.
It is not part of the described shape: a companion learns that an entry reserves rest names from that entry's group, never from `describe`.
The names `restOn` reserves are fixed for the entry's `version`; reserving another is a narrowing.
`overlays` is `true` where the component opens an overlay, and is otherwise absent; `describe` answers it on every entry as a boolean.
`lazy` is `true` where the entry's code is fetched by `load` rather than with Fabricate's entry script, and is otherwise absent; `describe` does not state it.
- The published set opens with `TierTrack` (issue 2424), whose props and accepted values are stated by the design-system requirement "A position along an ordered set of named tiers renders through TierTrack".
- The published set continues with `Avatar`, `Medallion`, `FillBar`, `Meter`, `BandedBar`, `StatBox` and `InfoStrip` (issue 2448), in that order.
- The published set continues with `Kicker` and `Chip` (issue 2451), in that order.
- The published set continues with `Rail` and `InspectorCard` (issue 2451), in that order.
- The published set continues with `EmptyState` and `Notice` (issue 2451), in that order.
- The published set continues with `Button` (issue 2452).
- The published set continues with `StatusToggle` (issue 2452).
- The published set continues with `Stepper` (issue 2452).
- The published set continues with `SearchField` (issue 2453).
- The published set continues with `Select` (issue 2454).
- The published set continues with `StageBars` (issue 2455).
- A published component's contract is exactly the keys its manifest entry lists and the accepted values stated for each in this capability or in the design-system requirement for that component; `docs/api/index.md` MUST state the same.
- A member or value of a published key that those statements do not name is private, and changing it is not a breaking change.
- A component may declare props it does not publish: `class`, a class under another name (`EmptyState`'s `contextClass`), a deprecated alias, a prop that takes an attribute name and a prop that carries attributes (`Stepper`'s and `SearchField`'s `inputProps`) are never published, and an alternative name source (`Meter`'s `labelId`, `InfoStrip`'s `ariaLabelledBy` and `ariaLabel`, `SearchField`'s `label` and `ariaLabelledBy`, `StageBars`' `ariaLabelledBy`) is not published at version 1; publishing one later is additive.
- A `$bindable` prop is published only as a `value` key; an element-ref bindable (`Chip`'s and `Button`'s `element`) never is.
- A prop that would draw a control (`Chip`'s `removable`, `removeLabel`, `onRemove`, `disabled` and its element-name prop `tag`) is not published at version 1; publishing one later is additive.
- `Notice`'s `blocking` and `evidence`, and `EmptyState`'s `compact`, `inline`, `note`, `field` and `fill`, are not published at version 1; publishing one later is additive.
- `Button`'s `size`, `icon`, `busy`, its anchor form (the props `tag`, `href`, `rel` and the link prop `target`) and its `type` are not published at version 1; publishing one later is additive.
- `StatusToggle`'s `as`, `label`, `disabled`, `trailing` and `onChange`, and so its indicator and checkbox hosts, are not published at version 1; publishing one later is additive.
- `Stepper`'s `disabled`, `allowUnset`, `placeholder`, `fill`, `orientation`, `density`, `stops` and `nullLabel` are not published at version 1; publishing one later is additive.
- `SearchField`'s `density`, `icon` and `onChange` are not published at version 1; publishing one later is additive.
- `Select`'s `label`, `hint`, `error`, `ariaLabelledBy`, `ariaDescribedBy`, `id`, `name`, `showTick`, `minWidth`, `maxWidth`, `triggerProps`, `triggerTitle`, `readonly`, `disabled`, `invalid`, `mono` and `icon` are not published at version 1, and nor is its rest, which lands only on the root of the labelled form those first three draw; publishing one later is additive.
- `Stepper`'s `formatValue` and `parseValue` run while Fabricate renders, so neither is a `callback` key, and so its formatted mode is not published at version 1; publishing it later needs a new prop kind, which is additive.
- An ARIA attribute is published only as an `aria` key an entry's group names.
A state the component shows (`aria-pressed`, `aria-checked`, `aria-selected`, `aria-current`, `aria-disabled`), `aria-hidden`, a live-region attribute (`aria-live`, `aria-atomic`, `aria-relevant`) and a reference that re-parents content (`aria-owns`, `aria-activedescendant`, `aria-flowto`) are never published as one.
A name source (`aria-label`, `aria-labelledby`) and any other `aria-*` name, `aria-controls`, `aria-haspopup` and `aria-busy` among them, are not published at version 1 unless an entry's group names the key (`StatusToggle`'s group names `aria-labelledby`); publishing one later is additive.
- Fabricate drops a stripped member from every item of a published `data` value and never writes it: an `InfoStrip` fact's `props` is not an attribute channel, and the publishable subset states which members are stripped.
- `TierTrack` and issue 2448's seven entries are eager for the life of `schemaVersion: 1`; `Kicker`, `Chip`, `Rail`, `InspectorCard`, `EmptyState` and `Notice` were published with `load` (issue 2451), `Button`, `StatusToggle` and `Stepper` too (issue 2452), `SearchField` too (issue 2453), `Select` too (issue 2454), and `StageBars` too (issue 2455); a companion calls it for each before mounting.
- `Rail` is lazy (issue 2455): only the Manager's own chunk and `load` fetch its code, and `mount` refuses it with M19 until `load` has fetched its code.
A lazy entry mounts, draws and behaves, its focus and keyboard behaviour included, exactly as it would if it were eager.
- Registration refuses a prop `kind` outside the shipped set, `'data'`, `'text'`, `'slot'`, `'callback'`, `'aria'` and `'value'`, with an `Error` ending `<name> "<key>" has an unknown kind "<kind>"`, and a `root` outside `'any'`, `'fabricate'` and `'manager'` with one ending `<name> has an unknown root "<root>"`.
It refuses a `requiredWhen` that is not a string, that names no other `data` key of the entry or a key that is itself `required` or `requiredWhen`, that sits on a `slot`, `aria` or `value` key, or that sits beside `required`, with an `Error` ending `<name> "<key>" has an unknown requiredWhen "<other>"`.
It refuses a `value` key whose `initial` is not a string, number, boolean or `null` with one ending `<name> "<key>" has an initial that is not a string, number, boolean or null`, and an entry that lists a value key's synthesised `on<Key>Change` as a key of its own with one ending `<name> "<on<Key>Change>" collides with the change callback of "<key>"`.
It refuses a `lazy` that is not a boolean with an `Error` ending `<name> has an unknown lazy "<value>"`, a lazy entry its runtime binds to no loader or to a component with one ending `<name> is lazy, so its runtime binds a loader and no component`, and an entry that is not lazy bound to a loader with one ending `<name> is not lazy, so its runtime binds no loader`.
- Before Fabricate's runtime registers, `load` resolves for eager names and rejects a published lazy name with the M1 `Error`, as `mount` throws it there; a name that is not published is still M3.
- Fabricate's runtime adapter registers once; a second registration throws an `Error` ending `already registered`, and the first runtime stays.
- A breaking change to one entry — removing or renaming a prop, narrowing a prop's accepted values, or narrowing its required root — bumps that entry's `version`, keeps the old shape as a deprecated delegate for at least one minor release, and is announced in the release notes.
- `schemaVersion` changes only with the seam's own shape.
- Adding a component, an optional prop, a descriptor member, a handle method, a prop `kind` or a widening of an entry's root is additive.
- A companion treats an unknown name, member, kind or root as absent, and never assumes the list is closed.
`typeof ui.load === 'function'` also says that `mount` honours `onFault`.

### Prop kinds

- A `data` key takes data (M10 to M12) and the component receives a snapshot copy.
- A `text` key takes a string.
Fabricate draws it as plain text inside the component and never reads it as HTML; the element Fabricate wraps it in is private.
- A `text` key that is `undefined`, absent or `''` is omitted, so the component's own fallback applies; a `required` one refuses `''` (M9).
- An `update` changes the text in place and remounts nothing.
- A `slot` key is a content slot, a place where the component draws the companion's own content.
It takes `true` to request the content slot and `false`, `undefined` or absence to omit it; anything else is M15.
A `slot` key is never `required`.
- `handle.slot(key)` returns the content slot's element, the same one for the life of the mount once it has been requested.
It returns `null` for an unknown key, for a content slot never requested, and after `destroy` or a fault.
- The element is a `<div>`, or a `<span>` where the component draws the content slot inside phrasing content; the entry's group says which.
It is created by `target.ownerDocument`, carries `display: contents` and no other attribute, so its children lay out as the component's own would.
The element Fabricate holds it in is private.
- A child of a content slot that draws nothing still takes the host's gap.
- Fabricate attaches the element wherever the component draws that content slot, and detaches it with its contents intact while it does not; a detached element is disconnected, and a companion's components, effects, listeners and bound values inside it keep running.
Each detach and attach is a DOM removal and insertion, so the browser resets what it resets on those: an `<iframe>` reloads, playing media pauses, focus and scroll positions inside the slot element are lost, CSS animations restart, and a custom element receives `disconnectedCallback` and `connectedCallback`.
That happens when the content slot is omitted and requested again, when an `update` makes the component replace the element holding it, and when a Foundry 14 window is detached or re-attached, which also moves the content to another document.
- A companion fills it by mounting its own component into it, or by appending an element it owns.
In a `<span>` content slot what it appends is phrasing content, a `<span>` for a mount target.
It styles and attributes its own elements and never the slot element: a class, role, `tabindex` or ARIA attribute on it is unsupported.
- Focusable content a companion draws in a content slot is the companion's to mark `data-keyboard-focus="true"`.
A `<button>` the companion draws there states `type="button"`: an untyped button submits the `<form>` it is in, and in Foundry that closes a DialogV2 and saves a document sheet.
The companion puts `data-action` on nothing it draws there: the window dispatches a click on any `data-action` inside it, `close`, `tab` and `toggleControls` in every window and each button's name in a DialogV2.
- A snippet the component calls with arguments is never a content slot.
- A `callback` key takes a function, and `undefined` or absence omits it, so the component's own default applies; anything else is M17.
A `required` `callback` key, or a `requiredWhen` one while its guard is truthy, refuses absence and `undefined` (M9) and any value that is not a function, `''` included (M17), and an `update` that omits it is M9.
A function is accepted only as the whole value of a `callback` key: anywhere else, at any depth, it is M10.
- The component receives one forwarder per `callback` key, the same one for the life of the mount, so an `update` that passes another function re-renders nothing and the next call reaches the newest function.
- Fabricate calls the function with the arguments the entry's group states, or, for a synthesised `on<Key>Change`, `(next, previous)`, in that order, and with nothing else.
Each is a copy made with Fabricate's `$state.snapshot`: plain objects and arrays at every depth, a `Map`, `Set` or `Date` one level deep.
At version 1 every stated argument is one of those or a primitive, so no event, DOM node or Fabricate object is passed.
An argument the group does not state is not passed.
- The call is synchronous, inside the user's event, after the component has finished its own state change, and under Fabricate's `untrack`, which covers Fabricate's runtime only.
Every published callback is called from an event handler, never while Fabricate renders or runs an effect.
A companion that is called back inside an effect of its own untracks its own reads.
- The function's return value is ignored.
A throw, or the rejection of a Promise it returns, is reported as `console.error('Fabricate | Published component callback failed:', name, key, error)` and goes no further: the mount stays live, it is not a fault, and `onFault` is not called.
- The function may call `update` or `destroy` on its own handle, or `mount`, before it returns.
An `update` made there is drawn on Fabricate's next flush, except that a value it changes is drawn before the call returns (the value resync), and a refusal it throws is reported as a callback failure unless the function catches it.
- After `destroy`, a fault, or an `update` that omits the key, Fabricate does not call the function again; a `required` key, or a `requiredWhen` one while its guard is truthy, cannot be omitted.
- A companion detects a callback key with `describe(name).props[key]?.kind === 'callback'`, because a Fabricate that predates the key refuses it.
- An `aria` key is an ARIA attribute Fabricate writes, under the key's own name, on the control the entry's group names; the component declares no prop of that name.
It takes a string, a number or a boolean and writes it as the attribute's value, so `false` writes `"false"`; `undefined` or absence writes no attribute; anything else is M13.
An `aria` key is never `required`.
- An `update` that changes the key's value writes it on the same element, and one that omits the key removes the attribute.
Fabricate writes the attribute only when the value differs from the one it last wrote, so it puts back nothing other code removed or replaced.
- Fabricate checks no value against the attribute's own set: the entry's group states the accepted values, and any other is private.
- A companion detects an `aria` key with `describe(name).props[key]?.kind === 'aria'`, because a Fabricate that predates the key refuses it (M13).
- A camel-case key is a prop the component interprets, and a hyphenated `aria-*` key is an attribute Fabricate writes under that name; a control's name is carried by the key its group names, and by the text that an `aria-labelledby` key its group names points at.
- A `value` key is a value the component binds and may change itself; its manifest spec is `{ kind: 'value', initial }`, where `initial` is a string, a number, a boolean or `null`, and states no `required`, `element` or `args`.
A value key's name matches `/^[a-z][A-Za-z0-9]*$/`, and it is never `required`.
- It takes a string, a number, a boolean or `null`; `undefined` or absence is not passed, so a mount starts at `initial`; anything else is M20, and a function is M10.
An object or an array is never a value, because a change made inside one never reaches Fabricate.
- Each value key synthesises an optional callback, `on<Key>Change`: `on`, the key with its first letter upper-cased, then `Change`, so `query` gives `onQueryChange`.
It takes a function as a `callback` key does (M17), and the component declares no prop of that name.
`describe` lists the value key as `{ kind: 'value', required: false }`, without `initial`, and directly after it `on<Key>Change` as `{ kind: 'callback', required: false }`.
- Fabricate calls `on<Key>Change(next, previous)` only for a change the component makes, once per change, and never when `Object.is(next, previous)`.
`mount` and `update` never call `on<Key>Change`.
A component's write of `undefined` records the key's `initial`, so `next` is never `undefined`.
- Inside that call, an `update` that passes the same value is a no-op, and one that passes another value is drawn before the call returns and wins, with no second call.
A rejection, revert or transform made synchronously inside the call is exact; one made later shows on the next flush.
A replaced value moves a text input's caret to the end and ends any IME composition in progress.
- `handle.value(key)` returns a snapshot of a value key's current value, and `undefined` for any other key and after `destroy` or a fault; `null` is a legal value.
- A companion detects a value key with `describe(name).props[key]?.kind === 'value'`, because a Fabricate that predates the key refuses it (M8).
- A published component writes a `value` key only from an event handler.
Fabricate's gate holds this, because the runtime does not refuse the resync's `flushSync` inside an effect.

### The required ancestor root

- Every entry states a `root`: `'any'`, `'fabricate'` or `'manager'`.
- `'any'`: the component styles itself under any ancestor.
- `'fabricate'`: `target` needs a `.fabricate` ancestor.
Fabricate's window frames carry it (the player window, the Manager and the interactable windows), so both extension targets have it; Foundry writes an application's `classes` on the frame element, above `.window-content`.
- `'manager'`: `target` needs a `.fabricate-manager` ancestor, the Manager's root inside its frame.
- `mount` decides it by class, with `target.closest`, and refuses a target outside the root with M16.
It is checked at `mount` only.
A Foundry 14 detached window's target is judged the same way.
- A target inside a slot element that is not attached is judged from the mount that owns that element.
- A companion's own window, a chat message and another module's sheet carry no Fabricate root, so they host `'any'` entries only.
- Moving an entry to `'any'` later is a widening, so it is additive.

### Overlays

- An entry whose `describe(name).overlays` is `true` opens an overlay: a panel portaled out of `target` while it is open, such as a list, a menu or a dialog.
`mount` ignores an option it does not know, so `overlays === true` is a companion's signal that `overlayHost` is honoured.
- **`overlayHost` is optional, and names the element an overlay's panel is drawn in.**
It is an element of `target.ownerDocument` (M18), positioned by the companion, because it is the panel's containing block and coordinate origin; it need not be connected at `mount`.
On an entry whose `overlays` is not `true` it is checked by M18 and otherwise ignored.
- Each time an overlay opens, Fabricate picks its host from `target.ownerDocument` at that moment, and never from Fabricate's own `document`:
  1. `overlayHost`, while it is connected and in `target`'s document;
  2. else the nearest `.fabricate-manager`, `.fabricate-app` or `.fabricate-standalone-overlay` above `target`;
  3. else a `.fabricate.fabricate-standalone-overlay` layer Fabricate keeps on `target.ownerDocument.body`, made when the first overlay in that document opens on it and removed when the last one closes, whose `data-fabricate-theme` is copied, when it is made, from `target` or its nearest ancestor below its document element that carries one, else from Fabricate's own document element, because a Foundry 14 detached window's document element holds a copy made when that window opened.
- The panel is drawn in a `<div>` Fabricate creates with `target.ownerDocument` inside the host and mounts on its own runtime, so the panel's own handlers run in whichever document holds it, a Foundry 14 detached window included.
The `<div>` carries `display: contents` and no other attribute, so the host stays the panel's containing block; it, the panel and the panel's elements and hooks are private.
The standalone layer, its class and its `data-fabricate-theme` copy are private too.
- The panel is not clipped by `target`'s overflow, because it is drawn in its host; place `overlayHost` where it is not clipped.
- An overlay's outside-press, Escape and scroll listeners bind to the document that holds it and its resize listener to that document's window; it reads that window's viewport, computed style and font loading, and tells a node or an element by `nodeType`, never `instanceof`.
An overlay whose document has no window stays closed.
- An overlay opened inside a published mount nested in another's content slot takes the nested mount's chain, and one opened from inside another overlay's panel takes that panel's.
An overlay drawn by Fabricate outside every published mount keeps its own host as before.
- `destroy` and a fault close every overlay the mount holds open: each panel and its `<div>` are removed, Fabricate's runtime releases the `<div>`'s listeners, and a layer no overlay still uses is removed, so nothing of the overlay is left in any document.
- Fabricate does not follow a mount from one window to another: a companion destroys the mount and mounts again in `_onDetach` and `_onAttach`, and that `destroy` closes any open overlay.
Foundry moves an application rendered with `renderChild` into its parent's detached window without calling its `_onDetach`, and an overlay opened after any move is placed and heard in the new window.
- An entry whose import closure reaches `actions/portal.js`, `actions/anchoredPopover.js`, `actions/typeaheadPanel.js` or `actions/dismissOnOutsideClick.js` opens an overlay, so it states `overlays: true`; Fabricate's manifest gate holds this.
The gate also holds that the closure of an `overlays: true` entry imports no `resolveOverlayHost` except through `actions/anchoredPopover.js`, which acquires its host through the chain: `Modal` still portals through `resolveOverlayHost` and ignores the chain, so it is not publishable with `overlays: true` until it acquires and releases its host as `anchoredPopover.js` does.
- `Select` (issue 2454) is the first entry whose `overlays` is `true`: its list is the overlay, and its group states what the list draws.

### Interactive components

- A published component draws a control only where its group says so, and each control is a native element: a `<button type="button">`, an `<input>`, a `<select>` or a `<textarea>`.
- A control never submits a `<form>` it is mounted in, except that a text-like `<input>` submits it on Enter as implicit submission does (through the form's first submit button, or alone where it is the form's only text field) and fires a bubbling `change` that a form with `submitOnChange` submits on; in Foundry a submit closes a DialogV2 and saves an editable document sheet.
- A `<button>` carries `data-keyboard-focus="true"` on itself, so Foundry runs none of its keybindings while it holds focus; an `<input>`, a `<select>` and a `<textarea>` hold them off without it.
Where the entry's rest keys land on the control itself, `data-keyboard-focus` is refused (M13), so the companion cannot replace it.
- A button is pressed by pointer, Enter or Space, as the platform presses a native button, and handles no other key itself: a `keydown` listener of the companion's above `target` still receives every key, and Foundry's keybindings stay held off as the bullet above states.
A pointer press acts on release, as a `click`, never on pointer down, so a pointer that leaves the control before release cancels it.
Enter presses on key down and again on each repeat while held, and Space on release.
In an ApplicationV1 `Dialog` Enter presses no control: that dialog takes Enter anywhere inside it and submits its default button, so a control there is pressed by pointer or Space.
- A control consumes only the keys the platform gives its native element, and its group names any other.
Tab moves focus as the browser does, and Escape still closes a DialogV2 while a control holds focus, because a DialogV2 listens for Escape on its own element.
In any other window Escape closes nothing while a control holds focus, because closing a window on Escape is one of the keybindings held off; an open ApplicationV1 `Dialog` still closes, because it listens for Escape on the document.
- A control draws its own mark for keyboard focus where the entry's `root` is `'any'`; otherwise it shows the Fabricate window's accent ring, 2px wide, at the offset the entry's group states.
Where the entry's rest keys land on the control itself, `data-validation-focused` and `data-essence-sort-direction` are refused (M13): they are names Fabricate's own stylesheet reads off its own buttons, whose effect is private, and the first, under a Fabricate root, draws the keyboard ring on a control that does not hold focus.
- A control's accessible name is text the companion passes through a key its group names, or its own visible text that an `aria` key its group names points at, and Fabricate supplies none.
Where a key carries the name, `aria-label` is refused (M13), and so is `aria-labelledby` unless the entry's group names it as an `aria` key.
A group names `aria-labelledby` only for a control that draws no text of its own and is named through `aria-label` by a required `data` key holding the same text, so the control is never without a name: an id list that names no element leaves the name from that key.
- Fabricate moves no focus.
An `update` or `destroy` that removes a focused control leaves focus on the document body, where Foundry's keybindings apply, so the companion moves focus to an element of its own before it calls either.
The destination is, in order: the control the press leads to; the next control in the companion's own content, then the previous one; and where none exists, the heading or container of the region `target` sits in, which the companion gives `tabindex="-1"`.
Where the destination is drawn by the same change, the companion draws it first, focuses it, and then removes the control.
- To return focus to a published control, after a dialog its press opened has closed, the companion focuses the focusable element inside `target` that the entry's group names; nothing else inside `target` is the companion's to select.
- A press bubbles from the control as a `click`.
A companion element above `target` that listens for `click` receives every press too.
The companion keeps `target` out of any element of its own that carries `data-action`, and passes no `data-action` through rest to a component that draws a control: the window dispatches the nearest `data-action` above the press, and `close` closes it, as a DialogV2 button's own action name submits it.
Where the entry's rest keys land on the control itself, `data-action` is refused (M13): the press would dispatch it, `close` closing the window and, in Foundry 14, `detach` moving it to its own browser window.
The companion keeps `target` out of a `<label>`, an `<a>` and a `<button>` of its own.
- A control is unavailable only through a key its group names.
A natively `disabled` control leaves the tab order and cannot take focus, so the companion never disables the control that holds focus: it ignores the press instead, and where the control must then become unavailable it first moves focus to the destination the "Fabricate moves no focus" bullet orders.
Disabling the control that holds focus drops focus to the document body, where Foundry's keybindings apply, as removing it does.
In a document sheet the user cannot edit, Foundry disables every form control inside the sheet's `<form>` on each render, a published control already mounted there among them, and the control looks as it did, apart from a switch's pointer cursor, which becomes `not-allowed`, so the companion mounts a control there from the sheet's render hook or after `super._onRender`, once that pass has run.
- A control that shows a state (pressed, checked, selected, current) takes it from a `data` key and exposes it in the accessibility tree as well as in colour.
A press reports through the callback, and the control shows the new state when the companion's `update` passes it; its group says where a native control changes itself first.
The attribute that exposes the state is the component's own, so `aria-pressed`, `aria-checked`, `aria-selected` and `aria-current` are refused as keys (M13).
`aria-expanded` is an `aria` key because it reports a region the control does not draw, which the component shows nowhere.
- A control takes an ARIA attribute from the companion only through an `aria` key its group names; every other `aria-*` name is refused (M13).
- An `aria` key that takes an id (`aria-describedby`, `aria-labelledby`) names an element the companion owns, in the same tree as `target`, outside `target` or inside one of its content slots.
The element it names holds text the companion also draws visibly; Fabricate does not check this.
Fabricate resolves and checks nothing: an id that is absent, or that two elements in that tree share, names or describes nothing, and keeping it unique is the companion's.
In a Foundry 14 detached window Foundry moves the window's element whole to the other document, so a described element inside that element goes with it and anything the companion appended to `body` stays behind.
- In Foundry 13 and 14 the tooltip sets `aria-describedby` to `tooltip` on the element it is shown for and removes the attribute when it closes.
A tooltip on an ancestor leaves the control alone, so this reaches a published control only when the companion shows one on it itself, with `game.tooltip.activate` or a Tour step that selects it.
The companion restores the key once the tooltip has closed, which it can see when `game.tooltip.element` is no longer the control or after calling `game.tooltip.deactivate()` itself: an `update` that omits the key, an `await` of anything once that `update` has returned (`await Promise.resolve()` is enough), and an `update` that passes it again.
Without the `await` between them Fabricate may draw the two as the second alone, which writes nothing, and a restore made while the tooltip is still open is removed with it.
- A control shows nothing under the pointer that it does not also show under keyboard focus.
Where the entry's rest keys land on the control itself, `data-cursor` is refused (M13): at the next pointer release anywhere in the document Foundry copies its value into the control's inline `cursor` and deletes the attribute.
- A control's only motion is its own state change: a fade, and on `StatusToggle` the knob's travel along its track.
Under `prefers-reduced-motion: reduce` Fabricate removes that motion inside a Fabricate window; outside one the fade is the host's own.
- A control opens no tooltip of its own at version 1, Fabricate's or Foundry's: no key names one, and the HTML `title` attribute is not a rest key (M13).
A Foundry tooltip attribute the companion passes through rest lands on the component's root: its tooltip stays open while the pointer is over the control and opens on pointer hover only, so it says nothing the control's name does not.
Where the entry's rest keys land on the control itself, `data-tooltip` and every name that starts `data-tooltip-` are refused (M13), so the control shows the pointer nothing it does not show keyboard focus.
A tooltip attribute on `target` itself is the companion's, and is held to the same rule.
A control whose face is a glyph alone is published only with a key for its name that is `required`, or `requiredWhen` the key that draws the control, and its group says whether the pointer is shown that name.

### The issue 2448 components

Each group states the accepted values of every key that entry publishes.

- **`Avatar`.**
  - `art` is an image path; a falsy one draws the initials of `name`.
    A path that fails to load draws the browser's broken image, never the initials.
  - `name` is required and is the only source of the initials.
  - `alt` is read only when `art` is set, and `''` marks the image decorative.
  - `size` is `26` or `32`, the portrait ladder, and defaults to `32`.
  - `shape` is `round` or `square`.
  - `tint` is one of `sage`, `mist`, `lavender`, `rose`, `peach`, `butter`, `aqua`, `mauve`, `ember`, `verdant`, `azure`, `bone` and `slate`.
  - `name` is never announced and the initials are hidden from assistive technology, so a tile without art carries no name: the companion always draws the name as text beside it, and passes `alt: ''` when it sets `art`.
- **`Medallion`.**
  - `art` is an image path; a falsy one draws `icon`, Font Awesome classes whose default is `fas fa-scroll`.
  - `size` is required and is `22`, `26`, `30` or `38`, the art ladder.
  - `glyph` is the ladder's glyph for that rung: `10`, `11`, `12` or `15`.
  - `alt` is as for `Avatar`.
  - `tint` is one of `Avatar`'s tint keys, and it recolours the glyph alone.
  - `variant` is `''` or `glyph-chip`.
  - `tone` and `ink` are each `''`, `success` or `danger`; both outrank `tint`, and `ink` outranks `tone` on the glyph.
  - The glyph is hidden from assistive technology, so a tile without art carries no name: the companion always draws the name as text beside it, and passes `alt: ''` when it sets `art`.
- **`FillBar`.**
  - `value` is 0–100, clamped.
  - `tone` is `success`, `warning`, `danger`, `info`, `accent` or `neutral`, and defaults to `success`.
  - `color` is a `var(--fab-…)` colour token reference, which overrides `tone`.
  - `density` is `default` or `compact`.
  - It is decorative: it has no role and no name and reaches no assistive technology, so the companion states the reading as text beside it.
    A value that must be announced is a `Meter`.
- **`Meter`.**
  - `value` is read against `max`, which defaults to 100; a `max` of zero or less reads full.
  - `segments` is an array holding one `{ tone?, color? }`, each as `FillBar`'s; an empty array draws `success`.
    A second or later entry is reserved and is not drawn.
  - `valueText` is the reading, announced in place of the bare number.
  - The companion passes `valueText` whenever `max` is not 100 or the unit matters, because without it only the bare `value` is announced.
  - `label` is required and is the meter's name, drawn visually hidden.
  - It draws no figure; the visible reading is the companion's.
- **`BandedBar`.**
  - `rows` is required and is `{ id?, name, percent, fill? }[]`.
    `name` is required in every row, and `percent` is a whole number 0–100, printed as `<percent>%`.
  - One row is a meter named by its `name`, which is also its visible caption; several are a histogram; none draws nothing.
  - `fill` is a `FillBar` tone, or a chance-ramp key, from certain to impossible: `guaranteed`, `common`, `uncommon`, `rare`, `very-rare`, `legendary` and `none` (the zero-chance step).
    Absent, the row takes the ramp's hue at its `percent` when `direction` is `ascending`, and the risk scale's when it is `descending`.
  - Every `id` is unique.
  - `direction` is `ascending` or `descending`.
  - `density` is `default` or `compact`; at `compact` a single row draws the histogram's band row.
  - In a histogram the bars are hidden from assistive technology and each row is read as its name and its percentage; the list carries no name, so the companion heads it with its own text.
- **`StatBox`.**
  - `value` is required and is the formatted figure.
  - `label` is required.
  - `icon` is optional Font Awesome classes.
  - `tone` is `default`, `info` or `danger`.
  - The glyph is hidden from assistive technology and the tone is colour alone, so `label` must say what the figure is and what a `danger` or `info` tone means.
- **`InfoStrip`.**
  - `label` is required and is the kicker, which names the group.
  - `facts` is required and is `{ icon?, label?, value }[]`: `icon` is Font Awesome classes for a decorative glyph hidden from assistive technology, `label` and `value` are final display text, and a fact whose meaning rests on its glyph needs a `label`.
  - A fact takes no `props` member: it is a stripped member, dropped and never written (see the publishable subset).
  - `badge` is `{ label, tone }` or `null`, with `tone` one of `positive`, `warning`, `danger`, `info`, `neutral` and `accent`.
- **Tones.**
  Each component's tone set is its own and the sets are not interchangeable: `InfoStrip`'s badge says `positive` where `FillBar` and `Medallion` say `success`.
- **Colour.**
  Colour is never the only carrier of a state: wherever a companion passes a `tone`, `tint`, `ink`, `fill` or `color`, it says the same thing in text beside the component.
- **Private and undocumented:** a fact's `props` member, a stripped member that Fabricate drops from the copy it renders and never writes, so an `InfoStrip` fact takes none; a `size` off its ladder; `Medallion`'s own default size; a `color` that is not a token reference; the `hazard-mid` fill; a `tint` written with its `--fab-tag-` prefix.
- **Wrong-typed collections.**
  A collection of the wrong type (`rows: null`) is a contained fault, reported under the entry's name.
  It is not a refusal.

### The issue 2451 components

Each group states the accepted values of every key that entry publishes.

- **`Kicker`.**
  - It is the component the design system calls a kicker: the small upper-case label that heads a block.
  - `children` is required and is the label, final display text; the component draws it in upper case.
  - `as` is `p`, `span` or `h3`, and defaults to `p`.
    An `update` that changes `as` replaces the kicker's root element; the mount, its handle and its claim on `target` are unchanged.
  - `tone` is `default` or `accent`.
  - Its text is its whole name, announced as written, so the companion passes sentence case and never an upper-case literal.
    `h3` makes it a level-3 heading, so the companion passes it only where the kicker heads the content beneath it.
    It takes no `id`: to name a control or group with it, the companion puts the `id` on `target` and points `aria-labelledby` there.
    `accent` is colour alone and says nothing.
  - It clears the 4.5:1 small-text floor on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not on `--fab-bg-3` or a light fill over `--fab-bg-2`, so the companion draws it on those four grounds.
- **`Chip`.**
  - `children` is required and is the chip's label, final display text.
  - `tone` is `positive`, `warning`, `danger`, `info`, `neutral` or `accent`; absent, the chip is drawn in the default ink.
    This is `InfoStrip`'s badge set.
    `neutral` is the recessive tone and clears 4.5:1 on `--fab-bg-0`, `--fab-bg-1` and `--fab-surface` only.
  - `density` is `default` or `list`; this is the chip's own set, not `FillBar`'s.
    At `list` the label is one line and is never wrapped or clipped, so a label wider than `target` overflows the chip: the companion keeps a `list` label short.
    At `default` a long label wraps inside the chip.
  - It is a statement, never a control: it has no role, takes no focus, and its label is read as inline text.
    `tone` is colour alone, so the label says the state.
    A label changed through `update` is not announced; a live region is the companion's.
- **`Rail`.**
  - It is one section of an inspector column.
  - `label` is optional final display text, drawn as the section's kicker in upper case.
    With it the section is a `group` named by it; without it, an unnamed `<section>`, never a landmark.
    The companion passes sentence case.
  - `children` is a content slot whose element is a `<div>`; the rail draws the content slot's children in a column it spaces, the first a little further below the label.
    A child that draws nothing still takes its gap, so the companion removes or hides an empty one.
    The rail draws no box, fill or padding.
  - The label takes `Kicker`'s ink, size, weight and tracking, so the same four grounds apply; it inherits `target`'s face and line height, which a `Kicker` states for itself.
    It is not a heading.
  - The rail never moves its content slot while it is requested.
- **`InspectorCard`.**
  - It is the bordered card shell, the design system's card.
  - `children` is a content slot whose element is a `<div>`; the card draws the content slot's children in a column it spaces, inside its own padding, so the companion adds neither.
  - Its fill is `--fab-bg-2` and it states no ink or type, so its content is on that ground and inherits from `target`: a `Kicker` and a `Rail` label clear 4.5:1 there, and a `neutral` `Chip` does not.
  - It needs a Fabricate window ancestor and is drawn the same in the Manager, the player window and a Fabricate dialog.
  - It is an unnamed `<section>` with no role and takes no heading of its own; the companion heads its content, for example with a `Kicker`, as `h3` where it heads the whole card.
  - A card is never nested in a card: the design system has two container levels, and the second, the well, is not yet published.
  - The card never moves its content slot while it is requested.
- **`EmptyState`.**
  - It is the design system's empty state (`<Empty>` in the library): a dashed panel that says what is absent and holds the way out.
  - `title` is optional final display text, the short statement of what is absent, drawn as a level-3 heading.
    The companion passes it only where a level-3 heading fits its outline: under a heading for the region the panel sits in, and not inside a card or rail the companion has itself headed at level 3.
    Where no level-3 heading fits, the companion draws its own heading above the panel and passes `hint` alone.
  - `hint` is optional final display text, the sentence beneath the title.
    The companion passes a title, a hint or both; with neither the panel is an empty box.
  - `icon` is optional Font Awesome classes for a glyph tile above the title, hidden from assistive technology; absent, no tile is drawn.
  - `filtered` is `true` or `false`: `true` draws the plain panel, in the muted ink, with no tile or title, for filters that match nothing, which is not an absence of content, and the companion passes `hint` alone with it.
    The hint is plain text, so a search term in it takes no emphasis.
  - `children` is a content slot whose element is a `<div>`; the panel draws the content slot's children under the hint, centred, in the column it spaces.
    It is the way out of the dead end, a control or a link; what is drawn there is the companion's own, and a control drawn there is named by the companion.
    Content there inherits the panel's quiet ink and centred alignment, not `target`'s, so the companion states the ink of any text it draws there.
  - It has no role and no name and is not a live region: when a list empties in answer to an action, the announcement is the companion's.
  - It draws no fill, so it sits on `target`'s ground.
    The title inks `--fab-text`, which clears the 4.5:1 small-text floor on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface`, `--fab-bg-2`, `--fab-surface-soft` over `--fab-bg-2` and `--fab-bg-3` in every palette.
    The hint inks `--fab-text-muted` on every variant, which clears the 4.5:1 small-text floor on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface`, `--fab-bg-2` and `--fab-surface-soft` over `--fab-bg-2` in every palette.
  - The title states its own serif face, and the hint inherits `target`'s.
  - The panel never moves its content slot while it is requested.
- **`Notice`.**
  - It is the design system's notice: what just happened or is wrong right now, which goes away.
    It is not a standing statement: a rule that is always true is not a notice.
    It is not a Foundry notification: the companion draws it in its own element, and `ui.notifications` knows nothing of it.
  - `title` is required and is the sentence that names what happened, final display text.
  - `detail` is optional final display text, a second line that says what to do next.
  - `tone` is `danger`, `warning`, `info` or `success`, and defaults to `danger`.
    It repaints the edge, the fill, the glyph and the title; the glyph is hidden from assistive technology and `danger` and `warning` share one, so the title says the state.
  - `icon` is optional Font Awesome classes for the leading glyph, which is hidden from assistive technology; absent, the tone's own glyph is drawn.
  - `action` is optional and is `{ label }`, drawing one button after the text; `label` is the button's whole accessible name, final display text.
    An `action` with no non-blank string `label`, or with no function to call (`onAction`, or its own `onClick` in a Fabricate caller), draws no button.
    The companion passes no other member: one this line does not state is private, and a function in it is M10.
  - `onAction` is an optional callback, called with no argument each time the action button is pressed.
  - The label is one line, never wrapped or clipped: where the notice is too narrow to hold it beside the text the button drops beneath, and a label wider than `target` overflows the notice, so the companion keeps it short.
  - The button is drawn the same at every tone and takes no tone of its own, so a destructive action says so in `label`.
    `danger` reports what is wrong and stops the reader's work; a notice that offers a retry or a resume passes `warning`.
  - The button has no disabled and no busy state at version 1, and `onAction` is called on every press, a held Enter key included.
    The companion ignores a press it is still handling and, where the wait is perceptible, says so with an `update` to `label`.
  - Where several notices are shown at once, each `label` says what its action acts on, because the label is the button's whole name and nothing describes it.
  - It is a live region, `role="status"` with `aria-live="polite"`: a change to its text is announced, and most screen readers also announce one mounted with its text, though some do not, so a notice the reader must not miss also says it in `title`.
    An `update` that changes none of its text announces nothing.
    The companion mounts it when the thing happens and destroys it when it no longer holds, never as standing text.
    Every mount is a new announcement, so when the companion's content is drawn again with nothing new to report (a navigation provider's `mount` called again, a DialogV2 or Handlebars re-render), it keeps the notice through `update` where its `target` survives and does not mount an unchanged one again.
    It moves no focus, and takes none except on its action button and its dismiss control; where the act that caused it also moves focus, the companion moves focus first and mounts the notice after, because a focus change cancels polite speech.
    Several may be shown at once, stacked; Fabricate arbitrates nothing between them, and a notice that interrupts is not published at version 1.
    Foundry announces nothing of its own, so nothing else speaks for a notice, and one in a minimised window or behind a modal dialog is not announced.
  - Fabricate removes no notice on a timer, and a companion that does gives a notice that carries an action no time limit.
  - The button's label is part of the live region: an `update` that changes it is announced, by some screen readers together with the whole notice, so the companion changes it only to report a change of state.
  - An `update` that keeps `action` and `onAction` keeps the same button, so focus stays on it.
    An `update` that omits `action` or `onAction`, and `destroy`, remove a button that may hold focus, so where it does the companion moves focus first, as `### Interactive components` states.
    The action button is the first `button` inside `target` and the dismiss control the last, so `target.querySelector('button')` reaches the action and the last of `target.querySelectorAll('button')` the dismissal.
    In a host that replaces its content on render (DialogV2, a Handlebars part) the action button is a new element after every render: the companion notes in `_preRender` whether focus was inside `target` and, after mounting again in `_onRender`, focuses the action button.
    The keyboard ring is the accent, 2px outside each button and inside the notice's own padding, and clears 3:1 against the notice's fill on the four grounds the label clears.
  - `dismissable` is optional, `true` or `false`, and draws a dismiss control after the action.
    `dismissLabel` is required while `dismissable` is truthy; it names the control and says what is dismissed, and is never white space alone.
  - `onDismiss` is required while `dismissable` is truthy, and is called with no argument, once, when the control is pressed by pointer, Enter or Space, while it still holds focus.
    Escape dismisses nothing.
  - The control's face is the xmark glyph alone; no tooltip shows its name.
  - Dismissal is final for the mount.
    In `onDismiss` the companion moves focus to the destination "Fabricate moves no focus" orders, starting at the next control, since the press leads nowhere, and then calls `destroy`.
    Removing the focused dismiss button drops focus to `body`, where Foundry's Escape closes every open window; `onDismiss` must move focus to a control before it returns.
    An `update` after dismissal is validated, returns `true` and draws nothing.
    Until `destroy`, `target` still holds the mount, so a `mount` into it throws M5.
    A notice is shown again only by a new `mount`, which is a new announcement.
    An `update` that clears `dismissable` removes a control that may hold focus, so the companion moves focus first.
  - The dismiss glyph clears 3:1 against its tile at every tone, at rest and under the pointer, on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not on `--fab-bg-3`.
    Its least contrast across the seven palettes and four tones is 5.93:1 at rest and 7.08:1 under the pointer on `--fab-bg-0`, 5.44:1 and 6.53:1 on `--fab-bg-1` and `--fab-surface`, 4.53:1 and 5.87:1 on `--fab-bg-2`, and 2.55:1 and 3.39:1 on `--fab-bg-3`.
  - The title clears the 4.5:1 small-text floor at every tone on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not on `--fab-bg-3`.
    The detail is the muted ink over the tone's fill, and clears that floor in every palette only at `danger`, on `--fab-bg-0`, `--fab-bg-1` and `--fab-surface`.
    At `warning`, `info` and `success` the detail falls short of it on `--fab-bg-1`, a Fabricate window's own ground, in up to four of the seven palettes, the default among them; at every tone it falls short on `--fab-bg-2`, so inside an `InspectorCard`, and on `--fab-bg-3`.
    So the companion says in `title` whatever the reader must not miss.
  - The action button's label clears the 4.5:1 small-text floor at every tone, at rest and under the pointer, on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not on `--fab-bg-3` or on a tinted fill over any of them, so the companion never mounts a notice with an action inside a tinted panel.
    Its tile is under 3:1 against the notice's fill in every palette, so the label alone marks it as a control: the companion passes a verb phrase.
  - It inherits `target`'s face, and outside the Manager its button takes Foundry's own button face.
- **Private:** every other `Chip` tone, emphasis and density; the card's padding, gap, corner and border figures; and how Fabricate redraws a card inside its own Checks rail and inspectors; the panel's and the notice's own figures; and `Notice`'s `accent` tone and what it draws for a tone outside its set.

### The issue 2452 components

Each group states the accepted values of every key that entry publishes.

- **`Button`.**
  - It is the design system's button: a labelled native `<button>` that is pressed to do one thing.
  - `children` is required and is the label, final display text, and the button's whole accessible name.
    The button hugs its label on one line while it has the room.
    Where it is narrower than the label, the label wraps at its spaces inside the button, is never clipped or ellipsised, and the button does not grow taller, so a label that wraps onto more lines than the button holds spills past its top and bottom edges: the companion passes a short verb phrase and gives the button the room for one line.
    A label of white space alone draws a button with no name, so the companion never passes one.
    The button draws no glyph: a leading glyph and a glyph-only button are not published at version 1.
  - `onclick` is a required callback, called with no argument each time the button is pressed, each repeat of a held Enter key included.
    The key is spelt `onclick`, all lower case, unlike `Notice`'s `onAction`.
  - `role` is `neutral`, `primary`, `ghost`, `dashed`, `danger` or `warning`, and defaults to `neutral`.
    It is the button's visual role and sets no ARIA role: the button is a native `<button>` whatever `role` says.
    Each value names a verb, never a colour: `neutral` is the secondary verb; `primary` the leading verb of its cluster, at most one in a cluster; `ghost` the quiet verb that changes no record, never its cluster's leading verb; `dashed` the verb that adds to the list it closes; `danger` the destructive verb; and `warning` the caution verb, which proceeds against a flagged rule or breaks a reference that can be re-made exactly, and destroys nothing.
    A verb that both destroys and cautions is `danger`.
    A `dashed` label starts with its verb, as "Add tier", because no plus glyph is drawn.
    A visual role is drawn and never announced: it reaches no assistive technology, so the label says the verb.
    A destructive press is confirmed by the companion, in a dialog of Foundry's, before anything is written; Fabricate's arm-then-confirm state is private.
  - `fullWidth` is `true` or `false`.
    The companion gives `target` `display: flex`, as for an inline mark: the button then hugs its label, and `true` spans `target`.
    In a block `target` a `dashed` button hugs its label too, as every native button does, so only `fullWidth: true` spans `target`.
  - `disabled` is `true` or `false`.
    `true` draws the button as unavailable whatever the visual role, takes the button out of the tab order and stops every press, so `onclick` is not called.
    It is for a verb that cannot apply and whose reason the surrounding text already gives: a keyboard or screen-reader user tabs past a disabled button, and it opens no tooltip, so nothing at the button can say why.
    A verb the user is refused for a reason stays enabled, and its press answers with the reason, in a `Notice` or a notification of the companion's.
    The unavailable label is not held to the contrast floor.
    The companion never passes `true` while the button holds focus, an `update` made inside `onclick` included, so a press that starts work leaves the button enabled.
  - Fabricate coerces neither `fullWidth` nor `disabled` to a boolean, so only `true` and `false` are in the contract: the string `'false'` spans `target` and disables the button.
  - The button has no busy state at version 1.
    While a press is being handled the companion leaves the button enabled, ignores every further press, a held Enter key's repeats among them, and where the wait is perceptible passes `children` that say so.
    A change to a focused button's label is not reliably announced, so the companion announces the outcome itself, with a `Notice` or a live region of its own.
    When the work ends it passes the first label again, or moves focus and then removes the button.
  - It needs a Fabricate window ancestor and is drawn the same in the Manager and the player window.
    It inherits `target`'s face; its size, weight and ink are its own.
    The companion aligns its own content to the button by centring, never by restating its height.
  - A companion's own window or dialog carries no Fabricate root, so the button is refused there (M16), and a dialog the companion opens draws Foundry's own buttons.
  - It is never a form's submit button: a companion that submits a `<form>` of its own from a press calls that form's `requestSubmit()` in `onclick`.
  - Two buttons side by side are two mounts in two targets, which the companion lays out as a wrapping row `--fab-space-2` apart.
    A `target` is never Foundry's `.form-footer`, which resizes a button that is its child.
  - The button is the only element Fabricate draws directly in `target` and the only focusable one, so `target.querySelector('button')` reaches it.
    An `update` keeps the same button, so focus stays on it; `destroy` removes it, so where it holds focus the companion moves focus first.
    In a host that replaces its content on render the button is a new element after every render, as `Notice`'s is.
  - The keyboard ring is the accent, 2px wide and 2px clear of the button, so it reaches 4px beyond the button on every side.
    The companion leaves that much inside any edge of its own that clips, a scrolling container's among them, and insets a `fullWidth` button's `target` by as much.
    The ring clears 3:1 against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not against `--fab-bg-3`.
  - `aria-expanded` is `true` or `false`, and is an `aria` key: Fabricate writes it on the button.
    It is for a button whose press shows and hides a region the companion draws: the companion passes `false` while the region is hidden and `true` while it is shown, in the same `onclick` that shows or hides it, and omits the key on a button that does no such thing.
    A hidden region is hidden from assistive technology too, with `hidden` and not by height alone, because a region hidden by height alone is still read, and the key is `true` only while the region is shown.
    The label is the same in both states, because the attribute says which holds.
    The region follows the button directly in reading order, so a user who hears "expanded" reaches it with the next move.
    Focus stays on the button when the region opens or closes, and a companion that hides a region holding focus moves focus to the button first, because that focus otherwise falls to the page and the next Escape runs Foundry's dismiss keybinding, which asks Foundry's windows to close.
    In Foundry 13 and 14 Foundry reads the attribute nowhere and gives the region no keyboard handling.
    While the button holds focus Escape reaches no Foundry keybinding, though a dialog still closes on it as stated above; in Foundry 13 and 14, with focus in the region on an element Foundry does not count as taking keys (a link, a button outside a form, a `tabindex` container), Escape runs Foundry's dismiss, which, when no drag, menu, context menu or Tour is open, asks every Foundry window to close.
    The button draws no chevron and opens nothing itself.
  - `aria-describedby` is an `aria` key: Fabricate writes it on the button.
    It is the id of one element of the companion's, or several ids separated by spaces, holding a hint that is visible text beside the button and that adds to the label without repeating it.
    Each id exists in the tree that holds `target` while the button is shown, and the element it names, which may be beside `target` and need not be inside it, is not `hidden`, which would still be read to a screen-reader user though a sighted user never sees it; an id that does not exist is skipped and the others are still read.
    The hint is then read to a screen-reader user who tabs to the button, and the button's name is still its label alone.
    The reason a `disabled` button is unavailable does not go in its hint, because a keyboard user never reaches a disabled button: the companion keeps the button enabled and answers the press with the reason, or states the reason in the surrounding text.
  - Rest `data-*` attributes land on the button itself, so `data-keyboard-focus`, `data-action`, `data-cursor`, every `data-tooltip` name, and the two names Fabricate's own stylesheet reads off its own buttons, `data-validation-focused` and `data-essence-sort-direction`, are refused (M13).
    The button therefore opens no tooltip and keeps its own cursor, so a hint goes in the label or in text beside the button, where a keyboard user reads it too.
    A hint in text beside the button is tied to it with `aria-describedby`.
  - The label of an enabled button clears the 4.5:1 small-text floor at rest in every visual role, on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and under the pointer in every visual role but `primary`, which falls short of it there in the `foundry-native` palette.
    `ghost` and `dashed` draw no fill, so their label is the muted ink on `target`'s own ground and clears that floor by the least.
    On `--fab-bg-3` every visual role but `primary` falls short of it in at least one palette, and on a tinted fill over any ground `ghost`, `dashed` and `danger` do, so the companion mounts a button on one of the four grounds and never inside a tinted panel.
  - `neutral`, `ghost`, `dashed` and `danger` draw an edge under 3:1 against the ground in every palette, so the label alone marks the button as a control: the companion passes a verb phrase.
- **`StatusToggle`.**
  - It is the design system's switch (`<Toggle>` in the library), drawn as its button host: a native `<button>` holding a track and a knob, for a setting that is on or off and takes effect when it is pressed.
    It exposes the state with `aria-pressed` and states no `role`, so it is a toggle button to assistive technology, and it draws no text of its own.
    A choice between two named things is not a switch: the companion draws its own control for it.
  - `on` is `true` or `false`, and is required: `true` draws the knob at the far end of an accent track, and `false` at the near end of a quiet one.
    Fabricate coerces nothing, so only `true` and `false` are in the contract.
    The button changes nothing itself: a press reports through `onclick`, and the switch shows the new state when the companion's `update` passes it, which may be after the press returns.
    The switch draws no pending state, so a companion whose change takes time says so in text of its own, and its `onclick` treats a press that arrives before the `update` as another press from the state last passed.
    A companion that refuses the change passes `on` unchanged and says why in text of its own, so the switch never shows a state the companion does not hold.
  - `onclick` is a required callback, called with no argument each time the switch is pressed, each repeat of a held Enter key included.
  - `ariaLabel` is the switch's name and is required whether or not `aria-labelledby` is passed.
    It is final display text, the same in both states, because `aria-pressed` says which holds.
  - `ariaLabel` names the setting so that "pressed" means the setting is in effect: "Group by category", "Hidden tasks".
    It never states a position, so no "on", "off", "show" or "hide" at its start or end, and never a negation such as "Do not group" (which reads "do not group, pressed").
  - The companion draws the setting's name as visible text beside the switch, from one string that it also passes as `ariaLabel`, and passes both again in any `update` that changes the text, so the spoken name always contains the words the user sees; the label does not press the switch unless the companion wires it to `onclick`.
    A name of white space alone leaves the switch with no name, so the companion never passes one.
  - `aria-labelledby` is an `aria` key: Fabricate writes it on the button.
    It is the id of the companion's element that holds the visible name and nothing else, or several such ids separated by spaces, in the tree that holds `target`, which may be beside `target` and need not be inside it.
    When at least one id names an element, that element's text is the switch's name and `ariaLabel` is not read.
    When none does, the switch is named by `ariaLabel`, so a mistyped id never leaves it nameless.
  - `aria-describedby` is an `aria` key: Fabricate writes it on the button.
    It is the id of one element of the companion's, or several ids separated by spaces, holding a sentence that is visible text beside the switch and that says what the setting does without repeating its name.
    Each id exists in the tree that holds `target` while the switch is shown, and the element it names, which may be beside `target` and need not be inside it, is not `hidden`; an id that does not exist is skipped and the others are still read.
  - The switch has no unavailable state at version 1.
    A setting the user cannot change right now keeps its switch enabled.
    Its press answers with the reason, in a `Notice` or a notification of the companion's, and `on` is passed unchanged; a setting that can never change here is not drawn as a switch.
    A setting that is unavailable also says so in the visible text `aria-describedby` points at, so it is heard when the switch takes focus, not only after a press.
  - It needs a Fabricate window ancestor, and its track is drawn the same in the Manager and the player window.
    Foundry gives a button a minimum height of 2em of its own font size, so in a Foundry window the switch's button is 24px tall at an inherited font size of 12px or less and 2em tall above that; where Foundry resizes buttons by container it follows that rule instead (2rem inside a `.standard-form` or a dialog's button row, 2.5rem for a direct child of a form footer), and the 22px track is centred in the button; the companion gives `target` `display: flex` and `align-items: center`, and centres its own label against the switch.
  - The button is the only element Fabricate draws directly in `target` and the only focusable one, so `target.querySelector('button')` reaches it.
    An `update` keeps the same button, so focus stays on it while its state changes; `destroy` removes it, so where it holds focus the companion moves focus first.
  - The keyboard ring is the accent, 2px wide and 2px clear of the button, so it reaches 4px beyond it on every side, and the companion leaves that much inside any edge of its own that clips.
  - The switch states whether it is on to assistive technology with `aria-pressed`; how it looks does not carry the state on its own.
    Under forced colours the switch draws in system colours and keeps its state visible.
  - A switch mounted inside a `.tabs` element carries no `data-group`, because Foundry's `changeTab` writes `aria-pressed` and toggles `active` on every button inside a `.tabs` element of that window whose own `data-group` names the tab group it changes.
  - Rest `data-*` attributes land on the button itself, so `data-keyboard-focus`, `data-action`, `data-cursor`, every `data-tooltip` name, and the two names Fabricate's own stylesheet reads off its own buttons, `data-validation-focused` and `data-essence-sort-direction`, are refused (M13).
    The switch therefore opens no tooltip and keeps its own cursor, so the pointer is shown its name only as the companion's label beside it, and what the setting does goes in text beside it, tied to it with `aria-describedby`.
- **`Stepper`.**
  - It is the design system's stepper: a native `<input type="number">` between a decrement and an increment `<button>`, for a number the user types or steps.
    The input is the control, so the number is always typeable.
  - `value` is required and is the finite number the stepper holds.
    A `value` that is not a finite number is outside the contract, and what is drawn for it is private.
  - `ariaLabel` is required and is the input's name, final display text naming the quantity, as "Days to credit".
    `decrementLabel` and `incrementLabel` are required and name the two buttons from the same words: "Decrease days to credit", "Increase days to credit".
    The buttons' faces are a minus and a plus glyph alone, and no tooltip shows either name.
    The companion draws the quantity's name as visible text beside the stepper, and `ariaLabel` contains those words.
    A name of white space alone leaves the control with no name, so the companion never passes one.
    To return focus to a stepper the companion focuses its input, `target.querySelector('input')`.
  - `min` and `max` are optional finite numbers, the inclusive bounds; an absent one leaves that side open.
    `step` is an optional positive number, `1` when absent, which each button press adds or removes exactly; the Up and Down arrow keys and the wheel over the focused input move the input to the next point of the grid `min + k·step`, counted from the browser's step base when `min` is absent, so a number off that grid is reported as such.
    A `min`, `max` or `step` outside this is outside the contract, and what is drawn for it is private.
  - `onChange` is a required callback, called with one argument, a number, each time an edit leaves the input holding a number that differs from `value`: a button press, an arrow key, a turn of the wheel over the focused input, or a keystroke; and again when the input loses focus holding such a number, so a companion that refused the earlier call is told again.
    Losing focus includes the input leaving the document as its window closes or a Foundry 14 window detaches, so `onChange` can run then; a mount the companion has destroyed reports nothing.
    The argument is the number edited, clamped to `min` and `max` and not rounded to `step`, so a companion that holds whole numbers rounds it and passes its own value back.
    A companion passes an accepted value back in the same `onChange` handler, before any `await`; a later `update` draws after the field has shown the held value.
    An edit that clamps to `value`, leaves the input empty or leaves it holding no number is not reported.
    `onChange` is spelt in camel case, unlike `Button`'s and `StatusToggle`'s `onclick`.
  - The input changes itself first: what the user types or steps shows at once, and a button press shows the new number when the companion's `update` passes it.
    A companion that refuses a number passes `value` unchanged.
    The input shows what was typed until it loses focus, and Fabricate then replaces it with `value`, so the companion says why in a live region of its own.
    Fabricate announces nothing when it restores a refused value; the companion explains a refusal in its own live region.
  - At `min` the decrement button, and at `max` the increment button, is natively disabled and dimmed, which takes it out of the tab order.
    Before an `update` that brings `value` to a bound, if the button toward that bound holds focus, the companion moves focus to the input, `target.querySelector('input')`, in the same handler.
  - The stepper has no unavailable state at version 1 beyond its bounds.
    A quantity the user cannot change right now is not drawn as a stepper: the companion destroys it, moving focus first if one of its parts holds it, and shows the number as text of its own.
    A refused edit is answered in text of the companion's, in a live region.
  - The input takes the keys a number field takes, Up and Down among them; the buttons are pressed by pointer, Enter or Space and never submit.
    The stepper does not catch Escape: the input holds Foundry's keybindings off, so Escape in it closes a window only where Interactive components says so.
    In a `<form>`, Enter in the input submits it as implicit submission does, with or without a submit button where the input is the form's only text field, and each step fires a bubbling `change` that a form with `submitOnChange` submits on, so the companion mounts the stepper in no `<form>`, Foundry's or its own.
  - It takes no rest keys, so a `data-*` key is refused (M8).
  - It needs a Fabricate window ancestor and is drawn the same in the Manager and the player window; the companion gives `target` `display: flex` and aligns its own label to the stepper by centring.
  - The input and the two buttons are the only focusable elements inside `target`.
    An `update` keeps all three, so focus stays where it is; `destroy` removes them, so where one holds focus the companion moves focus first.
  - The keyboard ring is the accent, 2px wide, drawn at the focused input's or button's own edge and inside the stepper's own outer edge, so the companion leaves no room for it, provided nothing of its own clips inside the stepper's box.
- **Private:** what the button draws for a `role` value outside its set; its height, corner, padding, type size and weight; each visual role's colours and edge beyond what this group states, among them the success family that `primary` is drawn in; and how Fabricate redraws a button inside its own toolbars, rows and inspectors; and `StatusToggle`'s track and knob sizes, its button's width, its 78px cap, its colours beyond what its group states, what it draws for an `on` value other than `true` or `false`, and how Fabricate redraws a switch inside its own rows and cards; and `Stepper`'s sizes, glyphs, colours, what it draws for a `value`, `min`, `max` or `step` outside its contract or for `min` above `max`, and how Fabricate redraws a stepper in its own rows and cards; the stepper's box is its own in every container, while core's line-height and transition still reach it.

### The issue 2453 components

Each group states the accepted values of every key that entry publishes.

- **`SearchField`.**
  - It is the design system's search field: a native `<input type="search">` inside a `<label>` root that also draws a decorative glyph, for a query that narrows a list already on screen and commits nothing.
    The input is the only focusable element inside `target`, so to return focus to the field the companion focuses `target.querySelector('input')`.
  - `value` is the query, a string, and is `''` when absent.
    A `value` that is not a string is outside the contract, and what is drawn for it is private.
  - `onValueChange` is called with two strings, `(next, previous)`, each time an edit of the user's changes the query: a keystroke, a paste or a cut, and a clear the browser makes from the field's cancel button or on Escape, which reports `''`.
    Whether the browser draws a cancel button or clears on Escape is the browser's: Chromium, and so Foundry's desktop app, does both.
    It is not called by `mount`, `update`, Enter or the field losing focus.
    A companion that refuses or transforms a query passes the query it keeps back through `update` before the call returns, and the field shows it before the user's `input` event has finished dispatching; the replaced query moves the caret to the end and ends any IME composition in progress.
  - `placeholder` is optional final display text shown while the field is empty, and is not the field's name.
  - `ariaLabel` is required and is the input's name, final display text naming what is searched, as "Search recipes".
    The field draws no caption, so the companion draws the same words as visible text beside it, and a name of white space alone leaves the control with no name.
  - Enter in the input, outside IME composition, cancels the implicit submission of the `<form>` the input is in, so the field never submits a form, and reports nothing.
    The field has no `name`, so it adds nothing to a form's data, and a form with `submitOnChange` still submits on the bubbling `change` the input fires when it loses focus after an edit.
  - It stops the propagation of no key: every key reaches a companion's listener above `target`, the input holds Foundry's keybindings off, and Escape closes a window only where Interactive components says so.
  - In a DialogV2, Escape clears the query and closes the dialog; a companion that must keep the dialog open stops it in its own `keydown`.
  - A DialogV2 companion that wants Enter to confirm handles Enter in its own listener above `target`, because the field cancels the form's implicit submission.
  - Rest `data-*` attributes land on the `<label>` root, never on the input, so the entry reserves no rest name.
  - It needs a Fabricate window ancestor and is drawn the same in the Manager and the player window, as the default 38px shell at radius 9; it fills the width of `target`, which the companion gives `display: flex`.
  - The keyboard mark is the design system's text-field variant for a field whose wrapper draws the box: while the input holds focus the shell's 1px border takes the accent and the input draws no ring of its own, so the companion leaves no room for one.
  - An `update` keeps the input, so focus and the caret stay where they are unless the query is replaced; `destroy` removes it, so where it holds focus the companion moves focus first.
- **Private:** `SearchField`'s sizes beyond its height and corner, its glyph and colours beyond what its group states, what it draws for a `value` that is not a string, and how Fabricate redraws a search field in its own toolbars, rosters and cards.

### The issue 2454 components

Each group states the accepted values of every key that entry publishes.

- **`Select`.**
  - It is the design system's select: a `<button>` trigger with `role="combobox"` that opens a list of options in an overlay, for one choice from a short, known set that commits as it is made.
    The trigger is the only focusable element inside `target`, so to return focus to the select the companion focuses `target.querySelector('button')`.
  - `options` is required and lists the choices in drawn order, each `{ value, label }`: `value` is a string or a number, unique as a string, and `label` is required final display text, the option's whole accessible name and what the trigger shows while it is chosen.
    Two options whose values are the same string, as `1` and `'1'`, cannot be drawn: `mount` and `update` accept them, and the mount faults when the list opens, so the companion passes no such pair.
    A member other than `value` and `label` is private, and an empty `options`, which `mount` and `update` both accept, opens a list that draws nothing and says nothing, so the companion should not offer an empty select.
  - `value` is the chosen option's `value`, matched by `===`, so `25` and `'25'` differ; absent, `null`, or matching no option, the trigger shows `placeholder`, and which row the list marks for a `value` that matches none is private.
    A `value` that is neither a string, a number nor `null` is outside the contract, and what is drawn for it is private.
  - `onChange` is a required callback, called with one argument, the chosen option's `value` exactly as `options` passed it, so a number stays a number, each time the user chooses an option by pointer or by Enter, the option already chosen included.
    It is not called by `mount`, `update`, opening or closing the list, Escape or an outside press.
    The select changes nothing itself: the trigger shows the new choice when the companion's `update` passes it as `value`, and a companion that refuses the choice passes `value` unchanged.
  - `ariaLabel` is required and names the trigger and its list, final display text naming the choice, as "Rows per page".
    The select draws no caption, so the companion draws the same words as visible text beside it, and a name of white space alone leaves the control with no name.
  - `placeholder` is optional final display text the trigger shows while no option is chosen, and is not the select's name.
  - `size` is `form`, `inline` or `toolbar`, and defaults to `form`: the 38px trigger on `--fab-surface-soft`, the 30px trigger on `--fab-bg-2` for a row, and the 34px trigger on `--fab-bg-1` for a toolbar, each with its own list width.
  - A press on the trigger opens the list and a second press closes it; Enter and Space press the trigger as they press any button, except that Enter while an option is active chooses it and Space inside a run of typed characters is typed.
    While the list is closed, ArrowDown and Home open it at its first option, ArrowUp and End at its last, Alt with ArrowDown opens it with no option active, and a printable character opens it at the next option whose label starts with what has been typed.
    While it is open, ArrowUp, ArrowDown, Home, End and a printable character move the active option, which the trigger names with `aria-activedescendant`, and Enter chooses it; focus stays on the trigger throughout, and the chosen option carries a tick and a fill.
    Escape and a press outside the list close it without choosing; a choice closes it and returns focus to the trigger.
  - The trigger stops the propagation of every key pressed while it holds focus, so a companion's listener above `target` receives no key from it, and while the trigger holds focus Foundry's Escape keybinding closes no window, an open ApplicationV1 `Dialog` included, because that dialog listens for Escape on the document, which the key never reaches.
    Tab moves focus as the browser does and leaves the list open until the next press outside it; Escape pressed once focus has left the trigger still closes the list, and it also reaches Foundry, which closes every open window unless the element then focused takes keyboard input (issue 2598).
  - The list is the entry's overlay, so `describe('Select').overlays` is `true`, and it is drawn in the host the `overlayHost` chain picks when it opens, as Overlays states.
    An `overlayHost` the companion passes sits inside the same Fabricate window, because the list's hidden live region is clipped only under a `.fabricate` ancestor.
    The list opens against the trigger, and its placement inside the host is private.
  - It takes no rest keys, so a `data-*` key is refused (M8).
  - It needs a Fabricate window ancestor, and its trigger's height, corner, type size, weight and fill are drawn the same in the Manager and the player window; its typeface and line height are inherited under the Manager and are Foundry's own button face elsewhere, as for every select of Fabricate's own.
  - The keyboard mark is the trigger's own: while it holds focus by keyboard its 1px border takes `--fab-accent-border` and no ring is drawn, so the companion leaves no room for one.
  - An `update` keeps the trigger, so focus stays on it, and an `update` while the list is open redraws the list in place; `destroy` removes the trigger and closes the list, so where the trigger holds focus the companion moves focus first.
  - A select is drawn only in a Fabricate window, which gives the companion no signal when Foundry 14 moves it between windows, and needs none: a list opened after the move is placed and heard in the window that then holds the trigger, as Overlays states.
- **Private:** `Select`'s sizes beyond each rung's height and corner, its tick, chevron and colours beyond what its group states, what it draws for a member of `options` other than `value` and `label` or for a `value` outside its contract, the list's placement and width, and how Fabricate redraws a select in its own toolbars, rows, cards and dialogs.

### The issue 2455 components

Each group states the accepted values of every key that entry publishes.

- **`StageBars`.**
  - It is the design system's stage instrument: one bar per stage, side by side, in a `group`, each bar a `progressbar` with its own value, for how far a staged process has come; it draws no control.
  - `stages` is required and lists the stages in drawn order, each `{ name?, label?, value }`: `value` is the stage's fill, 0–100 and clamped, `name` is final display text drawn as the stage's caption while `numbered`, and `label` is final display text that names the stage's bar.
    A bar is named by its stage's `label`, else its `name`, else, in a list of one stage only, by the group's own name.
    So in a list of two or more stages each stage requires a `label` or a `name`: a stage with neither has no accessible name, which Fabricate does not refuse.
    A member other than `name`, `label` and `value` is private, and an empty `stages` draws the named group with no bar.
  - `currentIndex` is the index of the stage being worked, and defaults to `0`: its bar carries `aria-current="step"` and takes the accent until it fills, a filled bar takes the success tone, and every other bar the neutral one.
  - `numbered` is `true` or `false`, and defaults to `true`: while it is `true` each bar draws a caption beneath it, hidden from assistive technology, holding its position counted from `1` and then its `name`; a stage with no `name` draws its position alone.
    A caption is drawn on one line and cut off with an ellipsis where it is wider than its bar, so the companion keeps each name short.
  - `ariaLabel` is required and names the group, final display text, as "Forging progress".
    It also names the one bar of a one-stage list whose stage has no label or name.
  - Rest `data-*` attributes land on the group root.
  - It needs no Fabricate ancestor, and draws the same under any.
  - It is not a live region: an `update` redraws the bars in place and announces nothing.
- **Private:** `StageBars`' track height and corner, its gaps, its caption's face, size and ink, each tone's colours, a stage's `id`, what it draws for a `currentIndex` outside the list, and how Fabricate draws a stage group in its own run card and run detail.

### The publishable subset

Each term is defined here and used in this sense throughout.
The _design-system manifest_ is `scripts/lib/designSystemPrimitives.json`.
The _published manifest_ is `src/ui/publishedComponentManifest.js`, the frozen entry list that `components` mirrors.
A _candidate_ is a `designSystemPrimitives` row with scope `shared`, or a `notAPrimitive` row whose `library` is not `null` (it has a library specimen).
The _publishable subset_ is the candidates that pass the static rules below.
The _exclusion list_ is `scripts/lib/publishedComponentExclusions.json`, which holds a reasoned row for each publishable candidate that is not yet published.
A _stripped member_ is a per-item member of a published `data` key that `STRIPPED_ITEM_MEMBERS` in `src/ui/publishedComponentProps.js` names.

- **A candidate is publishable when it passes every static rule.**
  - Its import closure reads none of the Foundry globals `game`, `foundry`, `Hooks`, `CONFIG`, `CONST`, `ui`, `canvas`, `fromUuid`, `fromUuidSync` and `getDocumentClass` (a local binding of the name is no read), so it does not reach the Foundry bridge.
  - Every element admission rule 9 judges is marked as that rule asks, and every `svelte:element` in its closure is pinned to the tags it can draw.
  - Every required prop, a `$props()` key with no default, is carried by a shipped kind; a snippet a component calls with arguments is never a slot, and a prop that is drawn as a component is not data.
  - Its closure reaches `resolveOverlayHost` only through `anchoredPopover.js`, and a published entry whose closure reaches an overlay action carries `overlays: true`; being an overlay is not a reason to list a component.
  - The ancestor a component needs is not a static rule: it sets the entry's `root` and never excludes the component.
- **Every publishable candidate is published or listed.**
A component that becomes publishable is published, or listed, in the same change.
- **A row of the exclusion list is `{ path, reason }`.**
A `reason` is, after trimming, `<code>: <text>` with non-empty text, and the code is one of `no-consumer` (no companion consumer asks for it), `domain-coupled` (its props take a Fabricate record shape), `part-of:<path>` (an internal part of the component at that path, which is a design-system row), `event-argument` (a callback it takes needs a DOM event or node), `item-spread` (an unstripped per-item attribute spread) or `pending:#<number>` (an open issue publishes it).
A `pending` row names an open issue and is the first row to leave the list.
- **The list only shrinks.**
Against the merge base, a path in the list and not in the base list fails unless it did not pass the static rules at the base, whether or not it was then a candidate.
The static rules are judged at the base with the `svelte:element` pins the head holds.
Where the list is absent at the base there is no list comparison, which seeds it; where the base holds it and the head does not, the check fails.
A row's reason is the exemption channel, because the list is JSON and carries no `ratchet-exempt` marker.
- **A listed path is stale, and fails, when it is published, is not a candidate or fails a static rule.**
A row whose reason is not `<code>: <text>` with a code from that set, or whose `part-of` path is no design-system row, fails, and a path is listed once.
The list commits human decisions only, so no total or baseline is committed and no assertion pins the number of rows.
- **Limit.**
A change that makes a listed component fail a static rule, or stops it being a candidate (its design-system row's scope or library specimen changes, or the row is removed), drops it from the list without a review of that drop, and a renamed component's new path may be listed as if it were new.
- **A per-item spread is stripped or the check fails, and the check fails closed.**
Every spread attribute in a published closure is traced to the published `data` it comes from.
A spread that comes from no published `data` passes: the file's `$props()` rest, a script-level `const` or `$derived` local, a published key that is not `data`, and a literal.
A spread of a member of published `data` passes only when it is a stripped member.
Every other spread fails: a whole item, an item of a collection the entry does not publish, and an expression no rule traces (a call, a `let`, an imported name, an `{#await}` value).
A row names `<Entry>.<key>`, then each member that holds the items below it, then the member the seam drops.
An `{#each}` item (destructured or not), an `{@const}` alias, a snippet parameter of the entry's own file and a child component's `$props()` key are traced to the data they hold.
A failing spread of a whole item, of an expression no rule traces or of an unpublished collection is reported with a message that no row can name it.
The one stripped member is `InfoStrip.facts.props`.
A row fails when no published closure spreads that member, whether its key is not `data`, its entry is not published or the component stopped spreading it.
A spread inside a snippet declared in a child component's file is not traced.
A snippet the entry declares is traced only through the `{@render}` tags of the entry's own file, so one nothing there renders by name fails closed, whether the render is aliased, made with `.call`, or done by a child component the snippet is passed to.
These shapes are not traced, and are tracked in issue 2607: a `const` or `$derived` alias of published data, a snippet passed to a child component as a prop (the child's own render of it is not followed), a child drawn through `svelte:component` or a `{@const}` component alias, and a quoted attribute such as `item="{item}"`.
- **The seam drops a stripped member from a copy of every item on `mount` and on `update`.**
It does so silently, never from the caller's object, and it tolerates a value that is not an array and an item that is `null` or a primitive.
A function anywhere in the value is still M10, and a value that is not data is still M11.
A dropped `aria-label` is release-noted.

#### Scenario: A publishable candidate that is neither published nor listed

- **WHEN** a change makes a design-system candidate pass every static rule and neither publishes it nor adds it to the exclusion list
- **THEN** the ratchet fails and names the remedy: publish it, or add it to `scripts/lib/publishedComponentExclusions.json` with a reason

#### Scenario: A stale listed path

- **WHEN** the exclusion list names a path that is published, is no candidate or now fails a static rule
- **THEN** the ratchet fails for that row

#### Scenario: The list only shrinks

- **WHEN** a change removes a row and publishes its component, or adds a row for a component that failed a static rule at the base
- **THEN** the ratchet passes and reports a removal as `shrank`
- **AND** a row added for a component that was publishable at the base fails

#### Scenario: A stripped per-item member

- **WHEN** a companion mounts `InfoStrip` with a fact whose `props` is `{ 'data-action': 'close', class: 'x' }`
- **THEN** the fact renders neither attribute and the companion's object is unchanged

### Mounting and its refusals

- **`mount` is synchronous, renders on Fabricate's own Svelte runtime, and returns with the DOM in place.**
Effects and the scoped stylesheet apply on Fabricate's next microtask flush, and the seam calls `flushSync` only as the value resync: before an `on<Key>Change` delivery and once after it when the delivery changed the value, inside the user's event, never inside an effect or flush, and not once the mount has ended.
- `mount` and `mountMany` throw only the fixed validation errors below, each message prefixed with `Fabricate | published components:` and a space, and each a `TypeError` except M1, which is an `Error`.
- `mountMany` throws M1 to M20 where `mount` throws them for the same name and an item, and M21 where its `items` is not an array.

<!-- markdownlint-disable markdownlint-sentences-per-line -->
| | Condition | Message tail |
| --- | --- | --- |
| M1 | No runtime adapter has registered | `not registered` |
| M2 | Fabricate is not yet ready | `mount before ready` |
| M3 | The name is not published | `"<name>" is not published` |
| M4 | `target.nodeType !== 1`, checked by `nodeType` and never `instanceof`, so a V14 detached window's element passes | `target must be an element` |
| M5 | `target` holds a live mount | `target already holds a published component` |
| M6 | `target` is not empty | `target must be empty` |
| M7 | `props` is not plain: its prototype is not `null`, or its prototype's prototype is not `null` | `props must be a plain object` |
| M8 | A key the entry does not publish | `"<key>" is not a prop of <name>` |
| M9 | A `required` prop is absent, or `''` where the key is not a `callback`; or a `requiredWhen` prop is absent, or `''` where it is not a `callback`, while the key it names is truthy; with several, the first key in manifest order | `<name> requires a non-empty "<key>"`, or `<name> requires a non-empty "<key>" when "<other>" is truthy` |
| M10 | A function anywhere but as the whole value of a `callback` key | `"<key>" must not hold a function` |
| M11 | A value at any depth that is not a primitive, plain object or array | `"<key>" must be data` |
| M12 | A cycle | `"<key>" holds a cycle` |
| M13 | A rest key not matching `/^data-[a-z0-9-]+$/`, or not holding a string, number or boolean; or, on an entry whose group says its rest lands on a control, `data-keyboard-focus`, `data-action`, `data-cursor`, `data-tooltip`, a name that starts `data-tooltip-`, or a name Fabricate's own stylesheet reads off its buttons, `data-validation-focused` or `data-essence-sort-direction`; or an `aria` key not holding a string, number or boolean (a function is M10) | `"<key>" is not a data attribute`, `"<key>" is reserved on <name>`, or `"<key>" must be a string, number or boolean` |
| M14 | A `text` key holding a value that is not a string (a function is M10) | `"<key>" must be a string` |
| M15 | A `slot` key holding a value that is not a boolean (a function is M10) | `"<key>" is a slot and takes true or false` |
| M16 | `target` is outside the entry's required ancestor root; checked directly after M4 | `<name> needs a Fabricate window ancestor`, or `<name> needs a Fabricate manager ancestor` |
| M17 | A `callback` key holding a value that is not a function | `"<key>" must be a function` |
| M18 | `overlayHost` is not `undefined`, and is not an element of `target.ownerDocument`, by `nodeType` and never `instanceof`; checked on every entry, directly after M16 | `overlayHost must be an element in the target's document` |
| M19 | The entry is lazy and its code is not loaded: `load` never requested it, its fetch is pending, or its fetch failed; checked directly after M3 | `"<name>" is not loaded` |
| M20 | A `value` key holding a value that is not a string, number, boolean or `null` (a function is M10) | `"<key>" must be a string, number, boolean or null` |
| M21 | `mountMany`'s `items` is not an array, by `Array.isArray`; checked after M3 and M19, and before any item | `items must be an array` |
<!-- markdownlint-enable markdownlint-sentences-per-line -->

- **A target holds a mount only while its handle is live and the target still contains the mount's root.**
Otherwise `mount` destroys the stale entry first, then checks that the target is empty.
- Props are copied at call time and snapshotted with Fabricate's `$state.snapshot`, so a companion's reactive proxies never enter Fabricate's reactive graph.

### Updating and destroying

- **`update(props)` is validated with M7 to M15, M17 and M20 and is atomic**: when it throws, the previous props stay rendered.
- `update` replaces the props and never merges them, except that an omitted or `undefined` `value` key keeps its current value; any other omitted key reads `undefined` and the component's default applies, and nothing remounts.
- `update` returns `true` once accepted, with the DOM reflecting it after the next flush, or at once under the value resync, and `false` after `destroy` or a fault.
- `update` writes the host's props under Fabricate's `untrack`, so a call from inside a `$derived` on Fabricate's own runtime is not an unsafe mutation.
- **`destroy()` is idempotent**: it unmounts what Fabricate rendered, whether or not `target` is still connected, and releases the target.
- `destroy` first destroys every live published mount inside its slot elements, then detaches each slot element with its remaining children untouched, and closes every overlay the mount holds open.
Fabricate never empties a slot element and never calls into a companion's runtime; content a companion drew there with its own runtime is the companion's to tear down, before `destroy`.
- `destroy` never throws: if the runtime's unmount throws, Fabricate reports it as `console.error('Fabricate | Published component render failed:', name, error)` and still releases the target.
A teardown that throws during the unmount is reported the same way, a microtask later.
After such a teardown the target may still hold a node of Fabricate's, so the companion empties it before mounting there again.
- The companion MUST call `destroy` on every path that ends the mount: its own cleanup; an ApplicationV2 close (in `_preClose`, `_onClose`, or before `super.close`); and on any re-render that replaces the target or its ancestors (in `_preRender`, or in `_onRender` before mounting into the new target), because DialogV2 and Handlebars `_replaceHTML` replace their content on render and `destroy` works on a detached target.
A mount whose content slot holds the companion's own content ends in this order on each of those paths: the companion unmounts what it drew there with its own runtime, then calls `destroy` on the outermost handle, which ends every published mount nested in its slot elements.
A navigation provider does both in the cleanup its `mount` returned, which Core calls while the target is still connected and before `requestRemount` clears it.
A host that replaces its content on every render (DialogV2, a Handlebars part) does both on each re-render and mounts again in `_onRender`.
- A mount that is never destroyed leaks: Svelte's module-level listener and root sets hold it for the life of the page.
A mount that is never destroyed keeps its slot elements, their content and every nested mount for the life of the page.

### Faults

- **A fault in render, update or an effect is caught by the host's boundary, and by the next microtask Fabricate reports it, unmounts, releases the target and makes the handle inert.**
A cleanup that throws while Fabricate tears a faulted component down is that mount's fault, reported once with the cleanup's error.
- A published component's cleanup MUST NOT throw: one that throws when an `update` re-runs its effect reaches no boundary and is not contained.
- The report is `console.error('Fabricate | Published component render failed:', name, error)`.
- A fault that arrives before the runtime's `mount` has returned defers its unmount with `queueMicrotask`.
This is defensive: Svelte 5.56 delivers no fault before its `mount` returns.
- A synchronous throw from the runtime's `mount` is reported the same way, releases the target, and `mount` returns an inert handle.
- The target is left empty, and any fallback copy is the companion's.
- `mount` takes an optional `onFault(error)`, called once when the mount faults, in a microtask after Fabricate has torn its own content down, and never inside `mount`, `update` or `destroy`.
- By then the claim is released and `target` is empty, so a companion may mount into it from `onFault`.
It does not mount the same input again unconditionally: a fault that repeats calls `onFault` again in a later microtask of the same task, so the page cannot paint in between.
- A throw from `onFault` is reported as a render failure under the entry's name and goes no further; a Promise it returns is ignored.
- A fault ends nested published mounts, detaches slot elements and closes open overlays as `destroy` does.
A nested mount is destroyed, not faulted, so its own `onFault` is not called.
The companion keeps its own reference to content it drew in a content slot and tears it down from `onFault`, because `handle.slot` answers `null` from then on.
A nested mount's handle answers `false` from `update` from then on, and the companion drops it with the outer handle.
- Without `onFault`, a fault is discovered only when `update` answers `false`.

### Ownership, strings and theme

- **The companion owns the placement of `target`**, sizes it as a block-level container, writes nothing inside it while mounted except inside a slot element, and styles only the target's own box.
- `.fab-*` and `manager-*` classes and `svelte-*` hashes are private: a companion selects none, and writes no `manager-*` class on an element it owns, `target` included.
- A companion writes no `fabricate`, `fabricate-app` or `fabricate-manager` class on an element it owns.
- A `data-*` name Fabricate writes is private as its classes are: a companion passes only rest names that carry its own module id, because Fabricate styles some of its own elements by a `data-*` hook.
- A published component draws only its declared content and, inside a content slot, the companion's own, draws a control only where its group says so, and adds no premium signal.
It opens no portal, popover, tooltip or dialog, writes nothing to `document.body`, settings, flags or hooks, and nothing to `document.head` beyond Svelte's injected stylesheet, moves no focus, and makes no network request except to load an image path the companion passes.
`load` is the one call that fetches code, and only a lazy entry's; `mount` fetches none.
An entry whose `overlays` is `true` opens its overlay and may write the standalone layer to `target.ownerDocument.body`, as Overlays states.
- A published component is not a live region unless its group says it is.
- **Caller strings are final display text**, rendered verbatim and never treated as a localization key; a published component makes no `game.i18n` call and has no default copy or accessible name, so the companion localises them first.
- Tokens resolve from `:root[data-fabricate-theme]`, which Fabricate's theme sets on `documentElement`.
- **A published component whose `root` is `'any'` states everything it needs in its own `<style>`**, and it MUST NOT depend on a `.fabricate`, `.fabricate-manager` or `.fabricate-app` ancestor, the global `.visually-hidden` utility, a `--fab-manager-*` token, `@container` on an app-root container name, or a `--font-primary` read whose fallback does not end in a literal.
- A published component that states the UI face MUST state it as `var(--font-body, var(--font-primary, sans-serif))` or another expression whose last fallback is a literal, so it resolves with no Foundry variable.
- A published component's import closure MUST NOT read `game`, `foundry`, `Hooks`, `CONFIG`, `CONST`, `ui`, `canvas`, `fromUuid`, `fromUuidSync` or `getDocumentClass`.
- A published component's rest keys are `data-*` attributes (M13), so a published `Meter` and `InfoStrip` are each named by their required `label`, and a single-row `BandedBar` by its row's `name`, which its docs section states as required; each bar of a `StageBars` of two or more stages is named by its stage's `label` or `name`, which its docs section states as required too.
- A published component relies on one host baseline, Foundry core's element reset (universal `box-sizing: border-box`), which every document that holds `api.ui` carries; `Avatar` and `Medallion` take their edge length's box model from it.
- A published component inherits from `target` every inherited text property its own rules do not state, so the companion sets none on `target`.
- `Avatar`, `Medallion`, `Chip` and a `Kicker` drawn as `span` are inline marks: the companion gives their `target` `display: flex`, so the mark is a flex item as every Fabricate site draws it and `target` is exactly as tall as the mark.
- Svelte's scoped CSS is unlayered and so beats module sheets, which Foundry loads in `layer(modules)`.
- The companion mounts after `target` is attached to its final document.
In an ApplicationV2, mount in `_onRender`, never in `_renderHTML`.
- Svelte injects a component's scoped stylesheet into the target's own document head, so a mount into an attached target in its final document is styled, a Foundry 14 detached window included.
A later move between windows is not carried to a mount, and a theme change made after a window detached does not reach that window (issue 2432).
A companion that owns the ApplicationV2 re-mounts in `_onDetach` and `_onAttach`; content inside a Fabricate window has no such signal.
- Mount at the composite level, on stable keyed elements, and reuse a mount through `update`.

#### Scenario: A companion draws a published primitive

- **WHEN** a companion calls `mount(name, { target, props })` with a published name and valid props after Fabricate is ready
- **THEN** Fabricate renders it into `target` on its own runtime and returns a frozen `{ update, destroy, slot, value }`
- **AND** `update` replaces the props without remounting, and `destroy` empties `target`

#### Scenario: Text content

- **WHEN** a companion mounts `Kicker` with `children: '<b>Rank</b>'` and then updates it to `children: 'Standing'`
- **THEN** the kicker draws the first string as literal text, and no `<b>` element
- **AND** after the update the kicker reads `Standing` and nothing was remounted

#### Scenario: A content slot

- **WHEN** a companion mounts `Rail` with `children: true` and appends an element to `handle.slot('children')`
- **THEN** the rail draws that element as one of its own children
- **AND** after `update({ children: false })` and `update({ children: true })` the same slot element is attached again with that element inside it

#### Scenario: Nested mounts

- **WHEN** a companion destroys a mount whose content slot holds a second published mount
- **THEN** Fabricate destroys the second mount first, and its `update` answers `false`
- **AND** the slot element is detached with its remaining children untouched, and `handle.slot` answers `null`

#### Scenario: A required ancestor root

- **WHEN** a companion mounts `InspectorCard` into a target with no `.fabricate` ancestor
- **THEN** `mount` throws `InspectorCard needs a Fabricate window ancestor`, and nothing is rendered

#### Scenario: A notice announces

- **WHEN** a companion mounts `Notice` with a `title`
- **THEN** its root carries `role="status"` and `aria-live="polite"`
- **AND** after an `update` that changes `title` the same root carries the new text

#### Scenario: A callback

- **WHEN** a companion mounts `Notice` with `action` and `onAction` and the user presses the action button
- **THEN** Fabricate calls `onAction` once, with no argument
- **AND** when `onAction` throws, Fabricate reports it, the notice stays drawn, and `update` still answers `true`

#### Scenario: A notice dismissal

- **WHEN** a companion mounts `Notice` with `dismissable`, `dismissLabel` and `onDismiss` and the user presses the dismiss control
- **THEN** Fabricate calls `onDismiss` once, with no argument, while the control still holds focus, and the notice then leaves the DOM
- **AND** a mount that passes `dismissable: true` without `dismissLabel` throws M9, naming `dismissable`

#### Scenario: A published button

- **WHEN** a companion mounts `Button` with `children` and `onclick` inside a Fabricate window and the user presses it
- **THEN** Fabricate calls `onclick` once, with no argument
- **AND** after an `update` that passes `disabled: true` a press calls nothing
- **AND** a mount that passes `data-action` through rest throws M13, and nothing is rendered

#### Scenario: An ARIA attribute on a control

- **WHEN** a companion mounts `Button` with `'aria-expanded': false` and then updates it with `'aria-expanded': true`
- **THEN** the button carries `aria-expanded="false"`, and after the update `aria-expanded="true"` on the same element
- **AND** a mount that passes `aria-pressed` throws M13, and nothing is rendered
- **AND** a mount that omits `aria-expanded` draws no such attribute

#### Scenario: A published switch

- **WHEN** a companion mounts `StatusToggle` with `on: false`, `ariaLabel` and `onclick` inside a Fabricate window and the user presses it
- **THEN** Fabricate calls `onclick` once, with no argument, and the button still carries `aria-pressed="false"`
- **AND** after an `update` that passes `on: true` the same button carries `aria-pressed="true"` and keeps focus
- **AND** a mount that omits `ariaLabel` throws M9, and one that passes `aria-pressed` throws M13

#### Scenario: A published stepper

- **WHEN** a companion mounts `Stepper` with `value: 2`, `max: 3`, the three names and `onChange` inside a Fabricate window, and the user presses the increment button
- **THEN** Fabricate calls `onChange` once, with `3`, and the input still shows `2` until the companion's `update` passes `value: 3`
- **AND** after that `update` the increment button is disabled, and a typed value the companion refuses is replaced by `value` when the input loses focus
- **AND** a mount that omits `decrementLabel` throws M9, and one that passes `disabled` throws M8

#### Scenario: A bound value

- **WHEN** a companion mounts a component with a `value` key and its `on<Key>Change`, and the user types into it
- **THEN** Fabricate calls `on<Key>Change(next, previous)` once, and `handle.value(key)` answers `next`
- **AND** an `update` that sets the key draws it without calling back, and an echo made inside the call with the same value does not loop
- **AND** a transform made by an `update` inside the call is drawn before the call returns and wins, and a revert to `previous` holds

#### Scenario: A published search field

- **WHEN** a companion mounts `SearchField` with `ariaLabel` and `onValueChange` inside a Fabricate window, and the user types `iron`
- **THEN** Fabricate calls `onValueChange('iron', '')` once, and `handle.value('value')` answers `'iron'`
- **AND** a clear the browser makes calls `onValueChange('', 'iron')`, and Enter in the field inside a `<form>` submits nothing
- **AND** a mount that omits `ariaLabel` throws M9, and one into a target with no `.fabricate` ancestor throws M16

#### Scenario: A published select

- **WHEN** a companion mounts `Select` with `options`, `ariaLabel` and `onChange` inside a Fabricate window, opens its list and chooses the option whose `value` is `25`
- **THEN** Fabricate calls `onChange` once, with the number `25`, the list closes, and focus is on the trigger
- **AND** the trigger shows the chosen label only once the companion's `update` passes `value: 25`
- **AND** Escape or a press outside the open list closes it without calling `onChange`
- **AND** a mount whose `options` hold `1` and `'1'` faults when its list opens, calling `onFault` once with the target empty
- **AND** a mount that omits `options` throws M9, and one that passes a `data-*` key throws M8

#### Scenario: A published stage group

- **WHEN** a companion mounts `StageBars` with `stages` and `ariaLabel` into a target under no Fabricate ancestor
- **THEN** it draws a group named by `ariaLabel` holding one `progressbar` per stage, each named by its stage's `label`, else its `name`
- **AND** the one bar of a one-stage list whose stage has neither takes the group's name, and an empty `stages` draws the named group with no bar
- **AND** its import closure reads no Foundry global

#### Scenario: An overlay host

- **WHEN** a companion mounts an entry whose `overlays` is `true` with an `overlayHost` element of its own, and the user opens the overlay
- **THEN** the panel is drawn inside `overlayHost`, in a `display: contents` element, and a press inside it reaches the component's own handler
- **AND** with no `overlayHost` and no Fabricate root above `target`, the panel is drawn in the standalone layer on `target.ownerDocument.body`, which is removed when the overlay closes
- **AND** `destroy` while it is open leaves no panel, element, layer or listener of the overlay's

#### Scenario: An overlay host that cannot be used

- **WHEN** a companion mounts an entry whose `overlays` is `true` with an `overlayHost` that is not connected when the overlay opens, inside a Fabricate window
- **THEN** the panel is drawn in the nearest `.fabricate-manager` or `.fabricate-app` above `target`, and `mount` did not throw
- **AND** once `overlayHost` is connected, the next overlay that opens is drawn in it

#### Scenario: An overlay host from another document

- **WHEN** a companion mounts any published entry with an `overlayHost` that is not an element, or is an element of another document
- **THEN** `mount` throws `overlayHost must be an element in the target's document`, and nothing is rendered

#### Scenario: A malformed request

- **WHEN** the name is unpublished, a prop key is unpublished, a required prop is empty, or a function is passed where no callback is published
- **THEN** `mount` throws its fixed `TypeError`, and nothing is rendered

#### Scenario: An occupied target

- **WHEN** a companion mounts into a target that holds a live mount
- **THEN** `mount` throws, and the earlier mount is untouched

#### Scenario: Mounting several at once

- **WHEN** a companion calls `mountMany(name, items)` with a published name and an array of valid items after Fabricate is ready
- **THEN** Fabricate renders each item into its own `target` and returns a frozen array of their handles in item order
- **AND** destroying one handle leaves the other mounts live

#### Scenario: A batch that cannot be mounted

- **WHEN** a companion calls `mountMany` with one invalid item among valid ones
- **THEN** it throws the refusal `mount` throws for that item, and nothing is rendered into any item's `target`
- **AND** two items that name the same `target` throw M5, and an `items` that is not an array, a single item included, throws M21
- **AND** `mountMany('Rail', items)` before `load(['Rail'])` has resolved throws M19

#### Scenario: Destroy is idempotent

- **WHEN** `destroy` is called twice
- **THEN** the second call does nothing, and every later `update` answers `false`

#### Scenario: A render fault

- **WHEN** the primitive throws while rendering
- **THEN** Fabricate reports it, empties `target`, and every later `update` answers `false`

#### Scenario: A fault the companion is told about

- **WHEN** a mount made with `onFault` faults in render, update or an effect
- **THEN** Fabricate reports it, empties `target`, and then calls `onFault` once with the error
- **AND** `update` answers `false`

#### Scenario: A declared prop that is not published

- **WHEN** a companion passes a prop the component declares but the manifest does not list: `src` to `Medallion`, or `class` to `FillBar`
- **THEN** `mount` throws M8 (`"src" is not a prop of Medallion`) for a component without a rest spread, or M13 (`"class" is not a data attribute`) for one with it
- **AND** nothing is rendered

#### Scenario: A bare ancestor

- **WHEN** a published component whose `root` is `'any'` is mounted under an element with no Fabricate ancestor
- **THEN** its tokens, its typeface and its visually hidden text resolve from its own stylesheet and `:root`

#### Scenario: Before ready

- **WHEN** `mount` is called before Fabricate is ready
- **THEN** it throws its fixed `TypeError`

#### Scenario: Loading before mounting

- **WHEN** a companion calls `load(['Kicker', 'Nope'])` in `setup`
- **THEN** the call returns a Promise that rejects with `"Nope" is not published`, and throws nothing

#### Scenario: A lazy entry before its load resolves

- **WHEN** a companion calls `mount('Rail', …)` once Fabricate is ready and before `load(['Rail'])` has resolved
- **THEN** it throws `"Rail" is not loaded` and renders nothing
- **AND** once `load(['Rail'])` has resolved, the same call mounts the rail

#### Scenario: Two loads of a lazy entry

- **WHEN** a companion calls `load(['Rail'])` twice before the first call has settled
- **THEN** Fabricate fetches the rail's code once and both Promises settle together

#### Scenario: A lazy entry whose code cannot be fetched

- **WHEN** the fetch of a lazy entry's code fails
- **THEN** `load(['Rail'])` rejects with the loader's own error, and every later `load` naming the entry rejects with that same error without fetching again
- **AND** `mount('Rail', …)` throws `"Rail" is not loaded`
