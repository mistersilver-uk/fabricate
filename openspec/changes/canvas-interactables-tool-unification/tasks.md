# Tasks

Phased checklist. Each phase ends with a validation gate (`npm test` + `npm run build`).
Phases are separately shippable; ship in order (the 0.6.0 migration in Phase 1 must land
before catalyst deletion in Phase 2).

## Phase 0 — Recipe-level Tool support (additive; catalysts still work)

- [ ] Add `toolIds: string[]` to `src/models/Recipe.js` (recipe-level and step-level) and
      `src/models/IngredientSet.js` (ingredient-set granularity), with normalization to `[]`.
- [ ] Add `RecipeManager.getToolsForSet` to `src/systems/RecipeManager.js` resolving the
      union of recipe/step/ingredient-set `toolIds` against the per-system library.
- [ ] Extend `RecipeManager.evaluateCraftability` to return `toolStates` and
      `missing.tools`, reusing the matcher from `src/gatheringToolRuntime.js`.
- [ ] Add `CraftingEngine._validateTools` and tool breakage/usage + `usedTools` evidence to
      `src/systems/CraftingEngine.js`.
- [ ] Extract the shared breakage plan/apply out of `src/main.js`
      `createGatheringToolBreakage` into new `src/toolBreakageRuntime.js`; have both crafting
      and gathering consume it.
- [ ] Keep a `toolMatchesItem` alias of the existing matcher during the transition.
- [ ] Add/extend tests: recipe `toolIds` normalization, `getToolsForSet`,
      `evaluateCraftability` `toolStates`/`missing.tools`, `CraftingEngine._validateTools`
      and tool breakage/usage, `toolBreakageRuntime` plan/apply parity with the prior
      gathering path. Register any new test directory in the `test` script and confirm the
      total count rises under `npm test`.
- [ ] Gate: `npm test` && `npm run build`.

## Phase 1 — Catalyst → Tool migration (versioned, automatic)

- [ ] Add `src/migration/migrateCatalystsToTools.js` converting **recipe** / step /
      ingredient-set / salvage catalysts into deduped per-system library Tools + `toolIds`,
      using the mapping in `design.md`
      (`degradesOnUse:false` → **presence-only** `breakageChance, breakageChance:0` +
      `flagBroken` (writes NO item flag);
      `degradesOnUse + maxUses:N + destroyWhenExhausted:true` → `limitedUses N` + `destroy`;
      `destroyWhenExhausted:false` → `limitedUses N` + `flagBroken`). The gathering
      `task.catalysts` field is dead/vestigial (never authored, only read, always empty) —
      do **not** walk it; there is no gathering-task migration.
- [ ] The migration mutates only the `recipes` world setting and the `craftingSystems`
      systems setting (`systems[id].tools`); it does **not** touch `gatheringConfig`. The
      `migrate(data)` return spreads partial results, so returning `{ recipes, systems }` is
      correct.
- [ ] Skip (do not throw) recipes whose crafting system is missing; log and continue.
- [ ] Register `0.6.0` in `src/migration/MigrationRunner.js`.
- [ ] Add item-flag fallback so tool usage reads `flags.fabricate.catalystItemUsage` when
      `flags.fabricate.toolUsage` is absent. This fallback applies **only** to migrated
      `limitedUses` tools; it is meaningless for presence-only (`breakageChance:0`) tools.
      First post-migration `applyUsage` writes `toolUsage` (authoritative);
      `catalystItemUsage` is never back-filled or cleared.
- [ ] Add a one-time GM-facing migration notice via Foundry `ui.notifications` after the
      0.6.0 pass: state that catalysts moved to the Tools library, with a count of migrated
      entries and a pointer to the Tools tab. Add `lang/en.json` key(s).
- [ ] Add tests: full mapping matrix (including the presence-only `breakageChance:0` row
      writing NO item flag), dedup keying, the **dedup NEGATIVE case** (catalysts that are
      semantically different on componentId + breakage + onBreak are NOT merged into one
      library Tool), idempotent re-run, missing-system skip, salvage
      catalysts, the `catalystItemUsage` → `toolUsage` fallback (both branches:
      `toolUsage` present wins / absent falls back), and the **migration version-gate**
      (0.6.0 is NOT re-applied when `migrationVersion >= 0.6.0`).
- [ ] Gate: `npm test` && `npm run build`.

## Phase 2 — Catalyst retirement (delete + cutover)

- [ ] Delete `src/models/Catalyst.js`.
- [ ] Delete `tests/catalyst-model.test.js`. This is an **explicit, justified exception** to
      the AGENTS.md "must not delete test files" rule: its subject `src/models/Catalyst.js`
      is being removed in this same phase. Before deleting, **port its behavioral
      assertions** into the tool tests (`tests/crafting-engine-tools` /
      `tests/toolBreakageRuntime` / the fallback test): the degradation matrix (increment,
      exhaust-at-`maxUses`, `destroyWhenExhausted` true/false, `maxUses:null` unlimited),
      `catalystItemUsage` read/write, the legacy `catalystUses` bare-number migration, and
      the "new format takes precedence when both flags present" case.
- [ ] Remove catalyst code from `src/main.js`: `createGatheringCatalystAvailability` /
      `createGatheringCatalystUsage`, `matchGatheringCatalysts`, the `Catalyst` import and
      api export, and engine wiring. (These are part of the dead gathering catalyst runtime
      — they drop no live data, since `task.catalysts` was never authored.)
- [ ] Remove catalyst code from `src/systems/GatheringEngine.js`: `_checkCatalysts`,
      `_planTerminalCatalysts` / `_applyTerminalCatalysts`, the `CATALYST_BLOCKED` reason
      path (collapses into the already-existing `TOOL_BLOCKED`), `usedCatalysts` →
      `usedTools`.
- [ ] Remove catalyst code from `src/systems/CraftingEngine.js`: `_validateCatalysts` /
      `_degradeCatalysts` / `consumeCatalystsOnFail` → their tool equivalents.
- [ ] Remove catalyst code from `src/systems/RecipeManager.js`: `getCatalystsForSet`,
      `catalystMatchesItem` → `getToolsForSet` / `toolMatchesItem`; `catalystStates` /
      `missing.catalysts` removed.
- [ ] Remove `_normalizeSalvageCatalyst` + cleanup from `src/systems/CraftingSystemManager.js`.
- [ ] Remove `catalysts` fields from `src/models/Recipe.js` and `src/models/IngredientSet.js`.
- [ ] **Rename ALL evidence keys to tool equivalents in lockstep** (six keys + reason + lang
      key): `usedCatalysts`→`usedTools` (run-record persistence), `consumedCatalysts`→
      `consumedTools` (failure/success macro callback payload), `catalysts`→`tools`
      (chat-card UI param), `missing.catalysts`→`missing.tools` (diagnostic),
      `catalystStates`→`toolStates` (craftability), `CATALYST_BLOCKED`→`TOOL_BLOCKED`
      (gathering reason — `TOOL_BLOCKED` already exists), and the lang key
      `FABRICATE.Gathering.Blocked.CatalystBlocked` → the existing tool-blocked key.
- [ ] UI cutover — recipe Tool picker, with explicit granularity:
      - Recipe-level multi-select Tool picker on the **recipe tab** (replacing the recipe
        catalyst tab).
      - Step-level Tool picker inside the existing step editor.
      - Ingredient-set-level Tool picker inside the existing ingredient-set editor.
      (So migrated step/set `toolIds` remain editable.) The selection control **references
      existing library Tool ids** via a chip/checkbox list — this is distinct from the
      component-drop pattern.
- [ ] UI cutover (stores): remove catalyst normalizers from
      `src/ui/svelte/stores/adminStore.js`; update `shoppingListAggregator` to aggregate
      tools.
- [ ] `lang/en.json`: remove the ~48 catalyst keys; add recipe-tool keys.
- [ ] Finalize the `gatheringToolRuntime` matcher rename atomically (drop the
      `toolMatchesItem` alias / catalyst matcher name).
- [ ] **Migrate the gated catalyst regression tests to tool equivalents in lockstep** (rename
      shape/field/store-call assertions), then run the **full** `npm test` suite. Named
      tests that assert catalyst shape/fields/store-calls:
      - `tests/shopping-list-aggregator.test.js`
      - `tests/stores/adminStore.test.js`
      - `tests/stores/admin-store-environments.test.js`
      - `tests/components/manager-mounted.test.js`
      - `tests/components/manager-contract.test.js`
      - the 7 `usedCatalysts` gathering tests: `gathering-chat-output`,
        `gathering-engine-immediate-resolution`, `gathering-engine-listing`,
        `gathering-engine-start-attempt`, `gathering-engine-timed-completion`,
        `gathering-run-manager`, `gathering-tool-runtime`.
      - the 10 `consumeCatalystsOnFail` crafting/salvage tests: `built-in-check`,
        `craft-chat-output`, `crafting-integration`, `e2e-crafting-flow`,
        `failure-consumption-policy`, the salvage suite, `success-failure-macro`,
        `adminStore`.
- [ ] Update component-shape string assertions under `tests/components/` in lockstep with
      removed i18n keys / renamed markup.
- [ ] Gate: full `npm test` && `npm run build`.

## Phase 3 — Canvas foundation

- [ ] Add `src/canvas/InteractableManager.js`: `Hooks.on('dropCanvasData')` intercepts a
      Fabricate Tool / Gathering Task uuid, suppresses the default drop, and spawns a
      flagged token; `canvasReady` wires PIXI `clickLeft2` → `_onDoubleClick`.
- [ ] Add `src/canvas/interactableActor.js`: `ensureInteractableActor()` provisions one
      generic world actor; tokens are unlinked.
- [ ] Add `src/canvas/interactableTokenFlags.js`: build/read
      `{ isInteractable, interactableType, sourceUuid, environmentId, node? }`.
- [ ] Register canvas wiring in `src/main.js` `ready`; spawning is GM-only.
- [ ] **Canvas test-dir glob hazard (decide once, here):** place all new canvas tests under
      a new `tests/canvas/` directory and **add `tests/canvas/*.test.js` to the package.json
      `test` script glob** (currently flat: `tests/*.test.js tests/stores/*.test.js
      tests/components/*.test.js tests/actions/*.test.js tests/util/*.test.js` — a new dir is
      otherwise silently NOT run). Confirm the gated test count rises under `npm test`.
- [ ] Add tests under `tests/canvas/` for token-flag build/read and drop-intercept payload
      shaping (pure units).
- [ ] Gate: `npm test` && `npm run build`. Canvas runtime validated via
      `npm run test:foundry`.

## Phase 4 — Session-scoped Tool tokens

- [ ] Change `src/ui/SvelteFabricateApp.svelte.js` `show(tab)` (single-arg today:
      `static async show(tab = DEFAULT_TAB)`) to `show(tab, options = {})`; accept
      `options.activeCanvasTool`, expose it via `_buildServices` `getActiveCanvasTool`, set
      it in `show(tab, { activeCanvasTool })`, and clear it on close. Existing single-arg
      callers must remain valid.
- [ ] Crafting (`RecipeManager.evaluateCraftability`, `CraftingEngine._validateTools`) and
      gathering (`matchGatheringTools` / `createGatheringToolAvailability` + shared breakage
      runtime) accept a virtual-present flag keyed by `componentId`
      (`presentTools` / `presentToolComponentIds`): satisfied without an owned item and
      excluded from breakage/usage.
- [ ] `InteractableManager` tool double-click → `SvelteFabricateApp.show('crafting',
      { activeCanvasTool })`.
- [ ] Add tests: virtual-present satisfies the gate without an owned item and is excluded
      from breakage/usage in both crafting and gathering paths.
- [ ] Gate: `npm test` && `npm run build`.

## Phase 5 — Gathering Task tokens + per-token node state + GM-routed writes

- [ ] Add `src/canvas/tokenNodeStateAdapter.js`: reads/writes `flags.fabricate.node`,
      reusing `normalizeNodeConfig` / `normalizeRespawn` and calendar respawn from
      `GatheringRichStateService` / `foundryCalendar`; writes via the GM socket.
- [ ] Add `src/canvas/interactableSocket.js`: `module.fabricate` action
      `interactableNodeUpdate`; only `game.users.activeGM` applies `token.update` (GM applies
      locally); mirror the `hazardSceneCoordinator` authority pattern.
- [ ] `GatheringEngine.startAttempt` takes optional `nodeStateOverride` threaded into
      `_commitTerminalSideEffects` / `_commitRichAttempt`.
- [ ] `GatheringRichStateService` node helpers prefer the injected adapter over
      `environment.nodeRuntime[taskId]`.
- [ ] `src/main.js`: register the socket action; `startGatheringAttempt` forwards
      `nodeStateOverride`; add a per-token respawn pass in the `updateWorldTime` handler,
      active-GM only.
- [ ] At drop time the token **snapshots the task's node CONFIG** into `flags.fabricate.node`
      (config + runtime), normalized via `normalizeNodeConfig` / `normalizeRespawn`. Tool
      requirements are NOT snapshotted — they resolve from `task.toolIds` against the
      per-system library at attempt time. Depletion trigger is `node.current <= 0` (one
      shared definition).
- [ ] Task double-click → `show('gathering', { environmentId, taskId, nodeStateOverride })`.
- [ ] **Player-facing UX:** when a player double-clicks a gathering-task token and **no
      active GM is connected**, show a graceful "A GM must be online to gather here" message
      (all node-state writes route through `activeGM`); do not silently fail. Add
      `lang/en.json` key.
- [ ] **Player-facing UX:** surface depleted + respawn-ETA state in the gathering app for a
      token-scoped node (so a player sees "depleted, respawns in …" rather than an empty
      list). Add `lang/en.json` key(s).
- [ ] **Player-facing UX:** double-click discoverability — the token nameplate shows the
      source (task) name, and there is a hover affordance signalling the token is
      interactable.
- [ ] Add tests under `tests/canvas/` (confirm the gated count rises under `npm test`):
      - adapter read/write/normalize;
      - engine prefers `nodeStateOverride` over env node runtime (both branches: override
        present vs. absent);
      - respawn anchoring against per-token state;
      - **respawn no-ops against a deleted token** (terminal `deleteToken`);
      - socket applies only on the active GM, and the **GM-applies-locally** branch applies
        its own write without a socket round-trip (mirror
        `tests/hazard-scene-coordinator.test.js`);
      - `toolUsage` vs `catalystItemUsage` precedence (both branches: `toolUsage` present
        wins / absent falls back) — colocated here or in the Phase 1 fallback test, whichever
        owns the runtime read.
- [ ] Gate: `npm test` && `npm run build`. Socket/respawn runtime validated via
      `npm run test:foundry`.

## Phase 6 — Depleted-behavior config + env-resolution precedence

- [ ] Add `depletedBehavior { swapImage?, postfixName?, deleteToken? }` to the
      gathering node config + normalization. `deleteToken` is **mutually exclusive** with
      `swapImage` / `postfixName` (when delete is on, swap+postfix are dead config and are
      dropped by the normalizer). `depletedBehavior` is orthogonal to `depletionTiming`
      (`onStart` / `onSuccess`); depletion trigger is `node.current <= 0`.
- [ ] Author `depletedBehavior` in `src/ui/svelte/stores/adminStore.js` +
      `CraftingSystemManagerRoot.svelte` task editor:
      - When `deleteToken` is enabled, **disable/grey** the swap-image and postfix-name
        controls (enforce mutual exclusivity in the UI).
      - Add an inline irreversible-delete **warning chip** reusing the
        `manager-chip is-danger role="alert"` pattern (`ToolsBrowserView.svelte:571`) +
        `lang/en.json` key.
      - Use the Foundry **FilePicker** for `swapImage` selection.
- [ ] Author the new optional `defaultEnvironmentId` field on the gathering library task in
      the task editor (an optional environment `<select>`); normalize it in `adminStore`
      `_normalizeGatheringTask` and preserve it in `GatheringEnvironmentStore`.
- [ ] Add `applyDepletedBehavior` / `revertDepletedBehavior` on the token via the GM socket
      using `flags.fabricate.nodeOriginal` (`deleteToken` is terminal — no revert).
- [ ] Author the on-drop env-resolution **dialog**: an environment `<select>`; **cancel =
      abort the spawn** (no token created). Add `lang/en.json` keys.
- [ ] `_onDrop` env precedence: region (`flags.fabricate.environmentId`) → task
      `defaultEnvironmentId` → GM dialog. Define and document a **modifier-key override**
      (hold **Alt** during drop forces the dialog), including discoverability (hint text in
      the browser app + the gathering-environment data-model doc). When region auto-detect
      fires, emit `ui.notifications.info` naming the resolved environment.
- [ ] Add tests: `depletedBehavior` normalization (including delete-token mutual-exclusion
      dropping swap/postfix); apply/revert round-trip captures and restores `nodeOriginal`;
      `deleteToken` terminal; env precedence resolution order (region → default → dialog);
      Alt-override forces the dialog; `defaultEnvironmentId` normalization + preservation.
- [ ] Gate: `npm test` && `npm run build`. UI authoring + depleted visuals validated via
      `npm run test:foundry` (UI smoke screenshots for the task editor **and** a depleted
      token on canvas — see Screenshots acceptance below).

## Phase 7 — GM tooling

- [ ] Add `src/ui/InteractableBrowserApp.svelte.js` + `InteractableBrowserRoot.svelte`:
      draggable Tools & Gathering Tasks emitting `dropCanvasData`-compatible payloads;
      register via `registerFabricateApp`.
- [ ] **Drag-SOURCE mechanism:** implement native `dragstart` + `dataTransfer.setData(...)`
      emitting a `dropCanvasData`-compatible payload on the browser entries. Note
      `src/ui/svelte/actions/dragDrop.js` is **drop-only** today (no drag source), so this is
      net-new; do not assume an existing drag-source action.
- [ ] **Non-drag a11y fallback:** add a click-to-place control ("Place on current scene" / at
      view center) so the feature is usable without a drag gesture. Add `lang/en.json` key.
- [ ] `src/main.js` `Hooks.on('getSceneControlButtons')`: GM-only control group launching
      `InteractableBrowserApp.show()`. Pin the **Foundry V13 `getSceneControlButtons`
      payload shape**: V13 passes an **object-of-tools** (keyed map), **not an array**.
      Document the chosen icon and the tool/group id used.
- [ ] Add tests: browser app drag payload shape; click-to-place fallback payload; GM-only
      scene-control registration against the V13 object-of-tools shape. Place under
      `tests/canvas/`.
- [ ] Gate: `npm test` && `npm run build`. Scene-control + browser UI validated via
      `npm run test:foundry` (UI smoke screenshots — see Screenshots acceptance below).

## Cross-cutting

- [ ] Provide change-scoped spec deltas under
      `openspec/changes/canvas-interactables-tool-unification/specs/` for `data-models`,
      `recipes-and-steps`, `gathering-and-harvesting`, and
      `destructive-changes-and-migrations`. Canonical `openspec/specs/*/spec.md` are merged
      by the docs loop, not in the planning stage.
- [ ] UI-touching phases (2, 6, 7) require real smoke-run screenshot evidence per
      `AGENTS.md`: `npm run screenshots:ui:plan -- --base origin/main`, `npm run test:foundry`,
      `npm run screenshots:ui -- --base origin/main --pr <number>`,
      `npm run screenshots:ui:publish -- --pr <number>`, embedded in the PR description.
- [ ] **Screenshots acceptance — on-canvas evidence (not just window UI):**
      - Phase 7 must include: the GM scene-control button in the controls bar, the component
        browser first-render, **and** a spawned Interactable token on the canvas with its
        nameplate visible.
      - Phase 6 must include: the depleted token visual on canvas (swapImage applied + the
        "(depleted)" postfix), **not only** the task editor.
- [ ] **Docs loop — update `DOMAIN.md`:** remove the Catalyst entry; redefine **Tool** as the
      shared required-reusable-breakable prerequisite primitive spanning crafting +
      gathering.
- [ ] **Docs loop — update `docs/agents/gathering-environment-data-model.md`:** correct stale
      catalyst references (including any mention of the dead `task.catalysts` field), add the
      new `defaultEnvironmentId` task field and the env-resolution precedence + Alt override,
      and the per-token `flags.fabricate.node` snapshot model.
- [ ] When changing manager UI surfaces (task editor, recipe tool tab), grep the smoke
      harness Phase D0 selectors and `tests/components/*` string assertions before declaring
      done.
- [ ] **CSS namespacing invariant (UI phases 2, 6, 7):** all new app/canvas CSS — the
      recipe Tool picker tab, depleted-behavior warning chip + FilePicker controls, the
      on-drop env-resolution dialog, the player-facing depleted/respawn-ETA UI, and
      `InteractableBrowserRoot.svelte` — must be namespaced under a `.fabricate*` root class;
      no unscoped or `:global(...)` selectors in `styles/fabricate.css`, so
      `tests/styles-namespacing.test.js` stays green (scoped Svelte `<style>` blocks are
      exempt — they compile to hashed classes). See recent commits `22ec8dd`, `733d7fe`.
