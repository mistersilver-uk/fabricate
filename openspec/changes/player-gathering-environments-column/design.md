# Design — Player Gathering App Environments Column

## Engine: surface locked environments + new listing fields

`src/systems/GatheringEngine.js`

- **`_playerCandidateEnvironments(systems, viewer)` (~L761).** Stop dropping `enabled === false`
  environments for non-GMs. Keep system-membership filtering and `_composeEnvironment` (disabled
  envs are still composed, so `environment.rules` / `tasks` are populated). The `enabled` flag is
  carried forward.
- **`listForActor` (~L486) / `_buildEnvironmentListing` (~L777).** For an environment where
  `enabled === false`, build a **lightweight locked listing** for every viewer (players and GMs
  alike) that does NOT run task-visibility gating (which would otherwise drop it via
  `BLIND_SOLE_TASK_HIDDEN` / `NO_VISIBLE_TARGETED_TASKS`). The locked listing carries identity
  fields only plus `locked: true`, `visible: true`, `attemptable: false`, `tasks: []`, and the
  **existing** `ENVIRONMENT_DISABLED` blocked reason (`GatheringEngine.js:11` →
  `FABRICATE.Gathering.Blocked.EnvironmentDisabled`, already in `lang/en.json:2182`). Do NOT add a
  new `EnvironmentLocked` key — "locked" and "disabled" denote the same `enabled === false` state;
  "Locked" is a UI label only. Disabled environments are surfaced as locked identity-only listings
  to all viewers; enabled environments keep the existing full listing path (`locked: false`).
- **New fields on every player listing** (locked + normal):
  - `locked: boolean`.
  - `revealPolicy: 'never'|'onSuccess'|'onAttempt'` — the **effective system-level** policy from
    `GatheringEngine._resolveRevealPolicy(composedEnvironment)` (`GatheringEngine.js:1962-1968`),
    which reads `composed.rules.revealPolicy` (populated by `composeEnvironment` from system-level
    `libraries.rules`, `GatheringRichStateService.js:188-194,233`). **No** `environment.reveal`
    override is consulted — the store discards it and a test locks that invariant
    (`tests/gathering-rich-library.test.js:420-428`). Listing and runtime agree because both read
    `composed.rules`. Default `'never'`.
  - `composedTaskCount: number` — the environment's total composed task pool
    (`normalizeList(composedEnvironment.tasks).length`). This is the **blind-reveal denominator**
    (`y`), i.e. the size of the pool a player can progressively discover. It is intentionally
    **distinct** from the GM editor's `availableTaskCount`
    (`adminStore.js:2239,2696` — `runtimeState === 'available'` only), so the name avoids
    collision. `0` for locked listings (no pool surfaced) and for composed-empty environments.
  - `discoveredTaskCount: number` — count of distinct revealed task ids for the selected actor at
    the **same effective reveal scope** `_resolveRevealPolicy` returns, via the RichState helper
    below. `0` for locked listings and whenever `revealPolicy === 'never'`.
  - `biomeTags: Array<{ id, label, icon, colorToken, customColor }>` — resolved display metadata
    so player chips render identically to the GM editor.

## Engine: RichState helpers

`src/systems/GatheringRichStateService.js`

- **`countRevealedTasks({ actor, environmentId, scope })`.** Read `readState(actor).reveals`
  (keyed by `revealKey`, `:1592-1596`) and count **distinct task ids** whose key matches the
  scope + environmentId. It MUST reuse the existing `revealKey` prefix builder (not a copy) so it
  stays in lockstep with the writer (`revealTask`, `:677-681`). Note the scope reality:
  `revealKey` branches only on `global` (`global:<env>:<task>`) and `user`
  (`user:<uid>:<env>:<task>`); **`party` and `actor` both fall through to the
  `actor:<uuid>:<env>:<task>` format** (there is no `party` branch today), so a `party`-scoped
  reveal is counted via the actor-key path — matching how it is written. Returns `0` on
  missing/inaccessible state; never throws.
- **`resolveBiomeTags(biomeIds, systemId)`.** Resolve each biome id through the system's biome
  vocabulary, falling back to `DEFAULT_BIOME_METADATA` (`:17`). Reuse the existing
  `normalizeVocabularyOption('biomes', …)` logic (`:1445-1467`) — extract a reusable resolver if
  it is module-private; do not duplicate the fallback table. **Vocab source:** read the system's
  biome vocabulary from the same config the service already uses
  (`this._config().systems?.[systemId]?.vocabularies?.biomes`, with the global
  `config.vocabularies?.biomes` as the next fallback before `DEFAULT_BIOME_METADATA`) — mirror how
  `EnvironmentsBrowserView` sources `selectedGatheringSystemConfig.vocabularies?.biomes ||
  gatheringConfig?.vocabularies?.biomes`. The resolver yields the `{ id, label, icon, colorToken,
  customColor }` shape the GM biome chips consume. The implementer must confirm the exact config
  path on the service before wiring.

`GatheringEngine` already holds `this.richState`, the selected `actor`, and the composed
environment, so it can call both from `_buildEnvironmentListing`.

## API

`game.fabricate.listGatheringForActor` (`src/main.js:816`) returns the engine listing unchanged in
shape — the new per-environment fields flow through automatically. No new public method.

## UI wiring

`src/ui/SvelteFabricateApp.svelte.js`

- `_buildServices()` (L55): add
  `listGatheringForActor: (opts = {}) => game?.fabricate?.listGatheringForActor?.(opts) ?? null`.
- `_prepareSvelteProps()` (L62): pass `services: this._services`.

`src/ui/svelte/apps/FabricateAppRoot.svelte`

- Accept a `services` prop.
- When `activeTab === 'gathering'`, render `<GatheringView {services} />` instead of the generic
  placeholder. Other tabs keep the placeholder.

## New components — `src/ui/svelte/apps/gathering/`

### `GatheringView.svelte` — data + 3-column grid
- Fetch via `services.listGatheringForActor()` (async) on mount; hold `loading` / `error` /
  `listing` in `$state`. Render distinct states (each with scoped styles using base tokens — NOT
  the `.fabricate-manager`-scoped `.manager-empty`):
  - **loading** (`FABRICATE.App.Gathering.Loading`),
  - **error** (`FABRICATE.App.Gathering.Error`),
  - **empty** — listing missing/`visible:false`/no environments
    (`FABRICATE.App.Gathering.Environments.Empty`),
  - and the populated 3-column view. Handle the no-actor case (`listing` null or
    `selectedActorId` absent) as the empty state.
- Grid: `grid-template-columns: minmax(280px, 1fr) minmax(0, 1.5fr) minmax(280px, 1fr)`, full
  height, `gap: var(--fab-space-4)`. (At the 1280px window minus the 84px nav this yields ≈
  320/520/320 — all above the 280px floors.) Left column = `GatheringEnvironmentList`. Center/right
  = inert empty `<section>` placeholders (no misleading roles).
- Owns `selectedId` `$state`; passes `selectedId` + `onSelect` down.

### `GatheringEnvironmentList.svelte` — left column
- A labeled **region**: `<section aria-labelledby="…">` whose heading is the title
  (`FABRICATE.App.Gathering.Environments.Title` → "Environments") with hint text beneath
  (`…Environments.Hint`). This is NOT a tablist.
- The card list is `role="list"`; each card is `role="listitem"`. Render available environments
  first, then locked. Inner scroll container gets `min-width: 0; overflow: hidden` (vertical
  scroll only) so long names/chip rows don't blow out the column.

### `EnvironmentCard.svelte` — one card
Mirrors `.manager-environment-row` / `.manager-environment-identity` / `.manager-environment-thumb`
(`EnvironmentsBrowserView.svelte:722-743`) and the biome chip from
`GatheringHazardsBrowserView.svelte:148-151` (`biomeChipStyle`).

- **Stable test/smoke hooks (required):** `data-environment-id`, `data-locked`,
  `data-selection-mode`, and a selection marker (e.g. `data-selected`). Tests and any smoke
  selector key off these, not cosmetic classes.
- **Layout:** 64px square image (object-fit cover; fallback → contain) + identity block. The
  `<img>` uses `alt=""` (decorative — the adjacent name is the accessible label; do not duplicate
  the name in alt). Name uses ellipsis + `title={name}` (mirror `.manager-system-name`,
  `:728`).
- **Name suffix (blind only):** when `selectionMode === 'blind'` **and**
  `revealPolicy !== 'never'`, append `(${discoveredTaskCount}/${composedTaskCount})` inside a
  `<span>` with an accessible label (`aria-label`/`title`) like "x of y tasks discovered"
  (i18n `…Environments.Discovered` with `{x}`/`{y}` params), not bare glued text.
- **Biome chips row** (read-only — no remove "x" button): one chip per `biomeTags` entry, icon +
  label, re-authored in scoped player `<style>` (the GM rule is `.fabricate-manager`-scoped and
  uses the manager-only `--fab-mv2-surface-2`, so it does NOT apply here). Use base tokens:
  - set `--fab-chip-color` per chip from `colorToken` (`var(--fab-tag-<token>)`) or `customColor`,
    exactly as `biomeChipStyle` does;
  - `background: color-mix(in srgb, var(--fab-chip-color) 16%, var(--fab-surface-raised));`
  - `border-color: color-mix(in srgb, var(--fab-chip-color) 50%, transparent);`
  (Use full `color-mix(in srgb, …)` syntax.)
- **Blind badge:** when blind, a mask icon (`fas fa-mask`) + "Blind gathering" chip
  (`…Environments.BlindChip`) top-right (shown to all viewers, including GM).
- **Locked state** (`locked === true`): rendered as a **non-interactive, non-focusable** element
  (a `<div role="listitem">`, no `tabindex`, removed from tab order — do NOT rely on
  `aria-disabled` on a non-button). Convey locked-ness with a visible `fas fa-lock` icon **and** an
  accessible label/`title` (`…Environments.LockedAria` → "{name} (locked)"). Desaturate the
  **image only** (`filter: saturate(.65) brightness(.85)`); keep card text at full opacity / a
  contrast-safe floor (text opacity ≥ 0.7) so the muted copy stays legible.
- **Available state:** rendered as a `<button>` inside the `listitem`; click → `onSelect(id)`;
  `:focus-visible` outline. When selected (`selectedId === id`), apply the GM selected-row look:
  `background: var(--fab-success-soft); box-shadow: inset 3px 0 0 var(--fab-accent);` (the GM uses
  `--fab-success-soft` + inset accent bar, `styles/fabricate.css:4420-4428`; `--fab-mv2-accent` is
  manager-only so use base `--fab-accent`).

**Card metrics / styling.** Scoped `<style>` per component using global base tokens
(`--fab-text`, `--fab-text-muted`, `--fab-surface`, `--fab-surface-soft`, `--fab-surface-raised`,
`--fab-border`, `--fab-accent`, `--fab-success-soft`, `--fab-tag-*`, `--fab-space-*`). Mirror the GM
row metrics for parity and uniformity: `min-height: 76px` (so available + locked cards stay equal
height), `padding: 9px 10px`, `border: 1px solid var(--fab-border)`, `border-radius: 8px`. Avoid
`--fab-mv2-*` (manager-scoped) and avoid bloating `styles/fabricate.css`.

## i18n — `lang/en.json`

Add under `FABRICATE.App` a `Gathering` subtree (no new blocked-reason key — reuse
`ENVIRONMENT_DISABLED`). Proposed copy:
- `Gathering.Loading`: "Loading gathering environments…"
- `Gathering.Error`: "Couldn't load gathering environments."
- `Gathering.Environments.Title`: "Environments"
- `Gathering.Environments.Hint`: "Choose a place to gather. Locked environments are unavailable
  until your GM enables them."
- `Gathering.Environments.Empty`: "No gathering environments are available for this character yet."
- `Gathering.Environments.BlindChip`: "Blind gathering"
- `Gathering.Environments.LockedAria`: "{name} (locked)" — the lock now renders as an icon-only
  overlay on the thumbnail, so the visible "Locked" text label was dropped; only the accessible
  `LockedAria` label/title remains.
- `Gathering.Environments.Discovered`: "{x} of {y} tasks discovered"

## Risks / edge cases

- **Blind + reveal≠never** with nothing revealed renders `(0/y)` — an acceptable teaser; counts
  are read-only.
- **Reveal scope** must use the SAME effective scope as `_resolveRevealPolicy`; `party` collapses
  onto the actor key (no distinct storage today) — `countRevealedTasks` reuses `revealKey`, so the
  count matches the writer.
- **No GM-internal leakage:** locked listings carry only identity fields — no `tasks`, weights, or
  composition internals (assert in tests).
- **GM vs player perspective:** disabled environments are surfaced as locked identity-only listings
  to all viewers in the player listing (players and GMs alike) — GMs (and the GM-driven smoke run)
  receive the same locked teaser for disabled envs (`locked: true`), not the full listing. Reveal
  stays system-level. Unit + mounted tests cover the locked rendering; smoke evidence captures the
  populated layout (see tasks Phase 3).
- **Smoke determinism:** the existing gathering-tab screenshot fires right after the nav activates;
  `GatheringView`'s async fetch means the harness must `waitFor` a stable card/empty-state hook
  before `screenshot()` or it captures the loading state.

## Docs/spec to update (Phase 3 / docs loop)
- `docs/agents/gathering-environment-data-model.md:16` currently calls the admin
  `environmentTaskCounts[].availableTaskCount` the authoritative player-surfaced count. Update it to
  distinguish the GM admin "available" metric from the new engine player listing fields
  (`composedTaskCount` = blind-reveal denominator), so the two are not conflated.
- No reveal spec change needed (behavior stays system-level, matching
  `openspec/specs/gathering-and-harvesting/spec.md:163,199`). No new blocked-reason spec text
  (reusing `ENVIRONMENT_DISABLED`).
