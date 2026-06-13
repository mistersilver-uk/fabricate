# Changelog

All notable changes to Fabricate are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- **Alchemy Tab redesign** — replaced the legacy drag-drop `AlchemySubmitPanel` with a fully-featured two-panel alchemy workspace:
  - `AlchemySystemSelector` — drop-down to choose between multiple alchemy systems; hidden when only one system exists. The selection persists per client via the new `fabricate.lastAlchemySystem` setting.
  - `ComponentPalette` — responsive grid of every component in the selected system, each showing the item image, name, and a quantity badge (available inventory minus workbench). Left-click to stage a component; right-click to un-stage one.
  - `Workbench` — chip-strip below the palette showing staged ingredients. Includes a **Craft** button, a **Clear** (trash) button, and right-click-to-remove on individual chips. Enforces inventory maximums per component.
  - `DiscoveredRecipesPanel` — right-side panel listing recipes the player has previously discovered (requires `learnOnCraft: true`). Includes a live search bar, a **Craftable only** toggle, per-recipe craftability badges, and an **Auto-fill** button for each craftable recipe.
  - `CraftingTab` — the pre-existing recipe list and shopping list UI extracted into its own component so it can coexist with the new Alchemy tab.
  - `AlchemyTab` — composite component that assembles the system selector, palette, workbench, and discovered recipes panel into the tab layout.
- **Tab bar navigation** — `CraftingAppRoot` now shows an **Alchemy** / **Crafting** tab bar when both alchemy and non-alchemy systems are present. Only the relevant tab is shown when just one type exists.
- **Auto-fill algorithm** (`src/ui/svelte/util/autoFillResolver.js`) — pure, Foundry-free function that selects the best ingredient set for a discovered recipe from the current palette and returns workbench entries. Tries sets in order; falls back to the best partial match if none is fully satisfiable.
- **Filtered run views** — `craftingStore` now exposes `alchemyRuns`, `alchemyRunHistory`, `craftingRuns`, and `craftingRunHistory` stores so each tab's `RunSummary` shows only the runs that belong to its own systems.
- **`lastAlchemySystem` client setting** — persists the selected alchemy system between sessions.
- 18 new localisation keys under `FABRICATE.Alchemy.*`, `FABRICATE.Workbench.*`, and `FABRICATE.Tabs.*` in `lang/en.json`.
- Workbench header CSS block in `styles/fabricate.css`.

### Changed

- **Unified spacing scale** (#78) — tokenized hardcoded padding, margin, and gap pixel values across `styles/fabricate.css` onto the shared 4px spacing scale (`--fab-space-*`), with bounded (≤2px) visual shifts. Added two fine tokens (`--fab-space-2xs: 2px`, `--fab-space-chip: 6px`) and five semantic aliases (`--fab-space-xs`/`sm`/`md`/`lg`/`xl`). `1px` hairlines and 34–42px fixed icon/grid dimensions are documented exemptions left as literals.
- **Gathering environments can be saved before tasks are added** (#298) — a gathering environment may now be saved without any task source so a GM can persist a partially-authored place and return to it later. A task source is only required to **enable** an environment: enabling a task-less environment (via the editor toggle or a save with `enabled: true`) is still rejected. The readiness "no available tasks" issue downgrades to a non-blocking warning for a disabled draft and stays critical for an active environment. Every other validation invariant (system id, realm ids, enum values, drop-rate adjustments, conditions) still blocks save unconditionally.

### Removed

- `AlchemySubmitPanel.svelte` — replaced by the combined `Workbench` + `ComponentPalette` components.
