# Canvas Interactables + Tool Unification

## Summary

Fabricate currently lives entirely in window-based UI; crafting and gathering are
launched from the items directory, never from the Foundry canvas. This change brings
Fabricate onto the Foundry VTT V13 canvas as **Interactables** — drag-and-drop tokens
for crafting/gathering stations (Tools) and gathering resource nodes (Gathering Tasks).

It also **retires the Catalyst concept**, folding it into the existing Tool concept:
anything required-but-not-always-consumed and potentially breakable is a Tool. Tools
become the single shared prerequisite primitive for **both** crafting recipes and
gathering tasks, and are the things represented as canvas station interactables.

> **Scope note — gathering `task.catalysts` is dead/vestigial.** The Catalyst surface
> being retired is the **crafting** (recipe/step/ingredient-set/salvage) catalyst surface.
> The gathering-side `task.catalysts` field is **dead code**: it is never authored (no
> task-editor tab, no add/update/delete store methods, `_normalizeGatheringTask` in
> `adminStore.js` does not emit it, and `GatheringEnvironmentStore` does not preserve it).
> It is only **read** at runtime and is always empty. Therefore the Phase 2 removal of the
> gathering catalyst runtime (`createGatheringCatalystAvailability` / `…Usage`,
> `matchGatheringCatalysts`, `GatheringEngine._checkCatalysts` /
> `_planTerminalCatalysts` / `_applyTerminalCatalysts`, and the `CATALYST_BLOCKED` reason)
> drops **no live data** and requires **no gathering-task data migration**. Only the
> crafting catalyst surface carries authored data and is migrated by 0.6.0.

The work is delivered in eight phases (0..7), each independently shippable and gated by
`npm test` + `npm run build`: additive recipe-level Tool support, an automatic versioned
Catalyst→Tool migration (0.6.0), full Catalyst retirement (delete, no shim), the canvas
Interactable foundation, session-scoped Tool tokens, per-token Gathering Task node state
with GM-routed writes, depleted-behavior config + environment-resolution precedence, and
the GM scene-control launch button + Interactable browser app.

## Why

- Crafting and gathering have two parallel "required-but-reusable item" primitives —
  recipe-side `Catalyst` and gathering-side `Tool` — that already share matching logic
  (`Tool` reuses `catalystMatchesItem`) and breakage semantics. Maintaining both is
  duplicated surface area, duplicated localization (~48 catalyst keys), and a confusing
  dual vocabulary for authors.
- Tools are already a per-crafting-system shared library at
  `config.systems[systemId].tools` with CRUD UI and gathering-task references via
  `task.toolIds`. Catalysts are the only thing blocking a single shared primitive.
- There is no way to place crafting/gathering interaction points on the map. Players must
  open the items directory and know which recipe/environment to launch. Canvas stations
  (Tools) and resource nodes (Gathering Tasks) make the world the entry point.

## What Changes

- **Recipe-level Tools (additive).** `toolIds` on `Recipe`, step, and `IngredientSet`;
  `RecipeManager` resolves and evaluates tool craftability; `CraftingEngine` validates,
  uses, and breaks tools. Shared breakage runtime extracted to `src/toolBreakageRuntime.js`.
- **Automatic migration (0.6.0).** Recipe / step / ingredient-set / salvage catalysts
  migrate into deduped per-system library Tools + `toolIds`, with a defined catalyst→tool
  mapping. Item-flag fallback reads `catalystItemUsage` when `toolUsage` is absent.
- **Catalyst retirement.** `src/models/Catalyst.js` and all catalyst code/UI/localization
  deleted with no deprecation shim; the gathering matcher rename is finalized atomically.
- **Canvas Interactables.** A `dropCanvasData` interceptor spawns flagged tokens for
  Fabricate Tools and Gathering Tasks against one auto-provisioned generic world actor;
  double-click opens the relevant Fabricate app.
- **Session-scoped Tool tokens.** Double-clicking a Tool station injects a virtual-present
  tool (keyed by `componentId`) into crafting/gathering so the actor need not own the item;
  the virtual tool is excluded from breakage and usage.
- **Per-token node state.** Gathering Task tokens own their own depletion/respawn state in
  `flags.fabricate.node`, independent of `environment.nodeRuntime[taskId]`, with calendar-
  aware world-time respawn. All token-flag writes are routed through the active GM via a
  module socket.
- **Depleted behavior + env precedence.** Task-level `depletedBehavior` (swap image /
  postfix name / delete token, where delete is terminal and mutually exclusive with the
  others); environment resolution on drop follows Scene Region auto-detect → task default
  (new `defaultEnvironmentId` field) → GM dialog, with an Alt-key override that forces the
  dialog.
- **GM tooling.** A GM-only scene-control button launches an Interactable browser app
  listing draggable Tools and Gathering Tasks.
- **One-time GM migration notice.** After the 0.6.0 migration runs, surface a one-time
  Foundry `ui.notifications` message to the GM stating that recipe catalysts have moved to
  the Tools library, including a **count** of migrated entries and a pointer to the Tools
  tab. This is an explicit Phase 1 deliverable.

## Impact

- **Affected specs:** `data-models` (Catalyst removed; Tool generalized to crafting +
  gathering; recipe/step/IngredientSet `toolIds`; Interactable token flag schema;
  `flags.fabricate.node`, `nodeOriginal`; `depletedBehavior`; catalyst→tool migration
  table), `recipes-and-steps` (Tool prerequisite semantics replace catalysts),
  `gathering-and-harvesting` (per-token node state, depleted behavior, env precedence,
  virtual-present tools), `destructive-changes-and-migrations` (0.6.0 entry). Change-scoped
  spec deltas are provided under `openspec/changes/canvas-interactables-tool-unification/specs/`.
- **Affected docs:** `DOMAIN.md` (remove the Catalyst entry; redefine **Tool** as the
  shared required-reusable-breakable prerequisite primitive spanning crafting + gathering)
  and `docs/agents/gathering-environment-data-model.md` (update stale catalyst references —
  including any mention of the dead `task.catalysts` field — to the unified Tool model).
  These doc updates are tracked as explicit cross-cutting tasks.
- **Affected code (high level):** `src/models/Recipe.js`, `src/models/IngredientSet.js`,
  `src/models/Catalyst.js` (deleted), `src/systems/RecipeManager.js`,
  `src/systems/CraftingEngine.js`, `src/systems/GatheringEngine.js`,
  `src/systems/GatheringRichStateService.js`, `src/systems/CraftingSystemManager.js`,
  `src/gatheringToolRuntime.js`, `src/toolBreakageRuntime.js` (new),
  `src/migration/migrateCatalystsToTools.js` (new), `src/migration/MigrationRunner.js`,
  `src/canvas/*` (new), `src/ui/svelte/apps/manager/*`, `src/ui/svelte/stores/adminStore.js`,
  `GatheringEnvironmentStore` (preserve the new `defaultEnvironmentId`),
  `src/ui/SvelteFabricateApp.svelte.js` (`show(tab)` → `show(tab, options)`),
  `src/ui/InteractableBrowserApp.svelte.js` (new), `src/main.js`, `lang/en.json`.
- **Data migration:** automatic, versioned (0.6.0), idempotent. Existing **recipe**
  catalysts become library Tools + `toolIds`; item-flag fallback preserves in-flight usage
  counters for migrated `limitedUses` tools. The migration mutates only the `recipes` world
  setting and the `craftingSystems` systems setting (which holds `systems[id].tools`); it
  does **not** touch `gatheringConfig`, because the gathering `task.catalysts` field is dead
  and carries no authored data. No gathering-task migration is performed.
- **Backwards compatibility:** no Catalyst deprecation shim — the migration runs before
  any catalyst code is removed, and recipes whose crafting system is missing are skipped
  (not thrown).

## Decisions Locked With the User

1. **Unify Tools across crafting + gathering; retire Catalyst entirely.** Tools are the
   single shared required-but-reusable, breakable prerequisite primitive.
2. **Auto-migrate existing recipe catalysts into shared library Tools** via a versioned
   `MigrationRunner` step (0.6.0); delete `Catalyst.js` and all catalyst code with **no**
   deprecation shim.
3. **Gathering-task tokens own their own depletion state** in `flags.fabricate.node`
   (independent of `environment.nodeRuntime[taskId]`), with their own world-time respawn.
4. **Environment resolution on drop follows a precedence chain:** Scene Region auto-detect
   → task default (new optional `defaultEnvironmentId` field on the gathering library task)
   → GM dialog. A modifier-key override (hold Alt during drop) always forces the GM dialog.
5. **In scope:** GM scene-control launch button + component browser app.
   **Deferred:** range-based auto-close — tool context closes on window-close / token
   removal only.
