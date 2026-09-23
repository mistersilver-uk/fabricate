# UI Gathering App

## Purpose

Define the player Gathering App, where a player starts and follows gathering runs.
Sibling UI surfaces and the cross-cutting UI rules are indexed by the Surface Map in `ui-integration/spec.md`.

## Gathering App (Player)

This is a dedicated app distinct from the Crafting App.

It is opened from the `Gathering` header action in the Items directory and must not be combined into the crafting browse-to-craft workflow.

### App Availability

- The gathering listing refreshes on a crafting-data change only when that change names one of the five invalidation domains it consumes, per `ui-crafting-app/spec.md` _Shared-store refresh routing_.
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
These runs also appear in the unified player Journal (see `ui-journal-app/spec.md` _Journal App (Player)_), which monitors gathering, crafting, and salvage runs together; the Gathering App remains the place to START a gather.

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
