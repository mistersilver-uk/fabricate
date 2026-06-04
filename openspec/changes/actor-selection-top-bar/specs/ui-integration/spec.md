# UI Integration Spec Delta

## Added Requirements

### Unified Window Actor Selection Top Bar

The unified Fabricate window MUST present a shared, content-width **Actor selection top bar** above
all primary tabs.

Requirements:

1. The bar spans the content width and renders above ALL tabs (`Gathering`, `Crafting`, `Journal`,
   `Inventory`), not inside any single tab body. The bar lives in a vertical flex column wrapper
   (`.fabricate-app-main`) where the bar is `flex: 0 0 auto` and the content region is
   `flex: 1 1 auto; min-height: 0`, so a tab body using `height: 100%` keeps a bounded parent and
   does not collapse or double-scroll.
2. The bar's left side is a character-portrait + dropdown-caret trigger that opens a searchable
   popover listing the user's selectable **player characters**.
3. A **player character** is a CONCEPT: an actor of the type(s) a system designates as player
   characters. A selectable player character is such an actor that the user owns (non-GM), or any such
   actor (GM). The **current dnd5e/pf2e implementation** of the concept is `actor.type === 'character'`
   (the predicate `isPlayerCharacterActor`); `'character'` MUST NOT be phrased as universal truth.
   Systems whose player-character type differs are a **known limitation** and the PC-type predicate is
   the intended seam for future extension/configuration. This selection vocabulary is distinct from
   gathering attempt authorization, which remains ownership-based and MUST NOT be narrowed by the
   player-character concept.
4. The popover provides a case-insensitive name search and a `role="listbox"` of portrait + name
   options; selecting an option updates the shared selection and persists it. The bar list MUST narrow
   the ownership-selectable set by the player-character concept.
5. The bar's right side carries tab-specific context. For the `Gathering` tab only, it shows the
   current weather (icon + label), the current time-of-day (icon + label), and the current region.
   For other tabs the right-side context is empty. The weather and time-of-day icons MUST be the
   fixed category icons used by the GM gathering-settings UI (`fas fa-cloud-sun` for weather,
   `fas fa-clock` for time of day) rather than per-value icons; the label shows the current value.
6. "Current region" on the gathering tab is the `region` string of the gathering tab's currently
   selected environment; when no environment is selected, a neutral placeholder is shown and no
   region name is fabricated.
7. The bar uses the player-app theming scope and base design tokens only; it MUST render correctly in
   both themes and MUST NOT depend on Manager-scoped tokens.
8. Selecting an actor in the bar re-filters and persists the gathering listing; the `Crafting`,
   `Journal`, and `Inventory` tab bodies MAY remain placeholders while still rendering the bar.
9. The popover keyboard/accessibility model follows the IconPicker interaction pattern: a
   `role="dialog"` popover with an `aria-label`; the trigger exposes `aria-haspopup` and
   `aria-expanded`; options are `role="option"` rows inside a `role="listbox"`; the popover supports
   **Tab-through** option buttons, **Escape / outside-click** dismissal, and **focus-on-open** of the
   search input. It does NOT provide listbox arrow-key roving focus or `aria-activedescendant`. The
   popover renders in-place below the trigger (left-aligned, dropping downward) as a descendant of the
   bar root, so an outside-click MUST dismiss it.
10. An actor whose portrait `img` is null/empty MUST render a neutral fallback icon (not an empty
    `<img>`); the portrait is decorative (`aria-hidden`) and the actor name is the accessible label /
    alt text.
11. Long actor names MUST truncate with ellipsis (and expose the full name via `title`) in both the
    trigger and the option rows. When there are zero selectable actors, the trigger is disabled with a
    placeholder portrait/label and the popover shows a neutral empty state. The trigger and each
    option row MUST lay the portrait + name out **flush-left** (not centered) and MUST size tall
    enough to contain the portrait without clipping — both overriding the host application's default
    `button` styling (which centers content and pins a fixed height).
12. The right-side gathering context MUST render gracefully when `conditions.timeOfDay` is absent
    (the fixed clock category icon + an "unknown time-of-day" label), when `conditions.weather` is
    absent (the fixed cloud-sun category icon + an "unknown weather" label), and when `region === ''`
    (a neutral "no region" placeholder). When the window is resized narrow, the
    weather/time-of-day/region cluster truncates or wraps, the actor trigger stays usable, and the bar
    produces no horizontal
    overflow.

### Shared Actor Selection State

Bidirectional shell↔tab actor/region state MUST flow through a single shared selection store provided
on the app services, not through per-tab prop drilling.

Requirements:

1. A single shared selection store is created once when services are built and exposed on the services
   bag so both the shell and the gathering tab read and write the same reactive state.
2. The shell writes the selected actor id and the selectable-actor list; the gathering tab reads the
   selected actor id and writes the current region; the bar reads region and conditions for its
   right-side context.
3. The store seeds the selected actor from the persisted last-gathering-actor selection; when that id
   is empty or **not present in the bar's player-character `selectableActors`** (stale, including a
   legacy owned non-player-character id), it MUST fall back to the first selectable actor and
   re-persist that fallback so a fresh client converges on a valid, sticky player-character selection.
   When the selectable list is **empty**, the store sets no selection, persists nothing, and MUST NOT
   throw (it MUST NOT index the first element of an empty list).
4. The store factory MUST NOT access Foundry globals directly; all environment access goes through the
   injected services bag, preserving the presentational-component boundary.
5. The re-persist fallback MUST run at most once per load: a re-entrant load after a deliberate
   selection MUST NOT clobber or re-seed the user's choice (guarded by an initialized flag).
6. The shared store is the single source of truth for the selected gathering actor **after
   convergence**. Because the gathering listing resolves a remembered actor against its ownership list
   (not the player-character list), a legacy persisted owned non-player-character id MAY be honored by
   the listing on the first fetch; the store converges by falling back to the first player character
   and re-persisting, after which the store and the persisted setting agree.

## Modified Requirements

### Actor Selection

- The unified window selects the gathering actor through the shared **Actor selection top bar** above
  all tabs, rather than only a per-tab header control.
- The bar's selectable list is restricted to **player characters** — the actor types a system
  designates as player characters, owned for non-GM users, all for GMs. The current dnd5e/pf2e
  implementation of that concept is `actor.type === 'character'`; other player-character types are a
  known limitation. This restriction is a selection-list concern only and does not change which actors
  are authorized to make a gathering attempt.
- The top header/bar shows the selected actor and, when enabled, gathering stamina current/max values
  plus regeneration or adjustment affordances where permitted.
- Persist the last selected actor in `fabricate.lastGatheringActor`. The shared store seeds from this
  setting, persists the selection on change, and re-persists a fallback selection when the stored id
  is empty or stale.
- Only actors the user owns are selectable for non-GM users.
- Gathering attempt authorization remains permission-based, not actor-type-based; an owned `npc`,
  `group`, or other non-player-character actor remains attempt-authorized even though it does not
  appear in the player-character selection list. Startup preference cleanup likewise stays
  ownership-based, so a persisted owned non-player-character id is not cleared at startup; the shared
  store converges it to a player character.
- The app should provide primary tabs or segmented navigation for `Environments` and `Gathering Log`.

## Testing Requirements

- Component tests for the top bar: portrait + caret trigger, popover name search filtering, listbox
  selection persisting the choice, and right-side region/time-of-day shown only on the gathering tab.
- Component tests asserting the bar renders above non-gathering tabs without the gathering-only
  region/time-of-day context.
- Component tests for render states: a null/empty `img` renders the neutral fallback (no broken
  `<img src="">`); long names truncate with `title`; zero selectable actors disable the trigger and
  show the empty state; a missing `conditions.timeOfDay` falls back to the clock icon + unknown label;
  `region === ''` shows the neutral no-region placeholder.
- Popover focus tests MUST account for the IconPicker `queueMicrotask` focus deferral (drain a
  microtask before asserting focus, or assert popover-open + search-input presence when focus is
  unreliable under happy-dom).
- Store tests for: seed-from-setting; fallback-to-first-with-re-persist for BOTH (a) an empty
  persisted id and (b) a STALE persisted id (present but not in the player-character list); empty
  selectable list → no selection, no persist, no throw; select-and-persist; the re-entry guard (a
  second load after a deliberate selection does not re-seed); region reporting; conditions refresh.
- A regression test asserting an existing gathering view mounted with a `services` bag that has NO
  shared selection store still mounts and fetches unmodified (optional-chaining guards).
- A first-load test asserting the view adopts the listing's resolved actor exactly once on an empty
  seed AND only when that actor is in the bar's selectable list, with no re-adoption (no ping-pong) on
  subsequent fetches, and a fetch call-count assertion confirming no spurious mount-time double fetch.
- Tests asserting the selectable-actor list excludes non-player-character actors while attempt
  authorization for an owned non-player-character actor is unchanged.
