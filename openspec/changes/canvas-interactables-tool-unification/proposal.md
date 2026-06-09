# Canvas Interactables + Tool Unification

## Summary

> **Note — region-first pivot.** The canvas half of this proposal originally described
> drag-and-drop **tokens** backed by a synthetic world actor. That model was **abandoned**
> during implementation. What shipped is **region-first**: a Canvas Interactable is a **Scene
> Region** carrying a `fabricate.interactable` **Region Behaviour** (which owns the state) plus
> an optional presentation-only **linked visual** (Tile by default; Drawing or existing Token;
> or region-only). Activation is **token presence** in the region, not a marker double-click.
> No synthetic actor/proxy token is created. The Tool-unification half (Catalyst retirement,
> 0.6.0 migration, `toolIds`, virtual-present tools) shipped as written. The canonical canvas
> spec is `openspec/specs/data-models/spec.md` (Canvas Interactables); `design.md` carries the
> detailed superseding notes. The token/tile wording below is left as the original record.
>
> **Further correction — env-node shortcut (post-pivot fixes).** Two later fixes also
> abandoned the *per-behaviour node* model that the region-first pivot initially kept. The
> shipped gathering-task interactable is a **pure `(environment, task)` shortcut**: it carries
> **no `behavior.system.node`** and uses the environment's `nodeRuntime[taskId]` as the single
> source of truth (no per-interactable pool, no `nodeStateOverride`, no per-behaviour respawn
> pass). A **Tool** interactable opens the **Crafting** tab. Any "per-behaviour/per-token node
> state" wording below is **abandoned**, not intended.
>
> **Two features that DID ship (the canonical specs reflect these as SHIPPED).** (1)
> **Env-node-driven Tile marker swap** — when the SHARED `environment.nodeRuntime[taskId]`
> depletes, every linked Tile marker for that `(environment, task)` swaps to the task's
> `depletedBehavior.swapImage` and flips back on recharge (idempotent active-GM sync in
> `interactableMarkerDepletion.js`; available image stashed at `flags.fabricate.markerAvailableImg`).
> This reflects the SHARED env node, NOT a per-interactable pool. (2) **Concealment vs Lock
> visibility** — DISABLED/HIDDEN interactables are concealed from players (no prompt + hidden
> marker), LOCKED interactables stay visible but deny Interact with
> `FABRICATE.Canvas.Interactable.Denied.Locked`. Earlier wording calling marker swap "abandoned"
> or "a FUTURE option" is itself superseded by these shipped features.

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
the GM scene-control launch button + Interactable browser app. *(Note: the per-token/
per-behaviour Gathering-Task node state and the per-marker depleted-behavior phases below were
later **abandoned** — the shipped gathering-task interactable is a pure env+task shortcut using
the environment node; see the region-first + env-node correction notes above.)*

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
- **Canvas Interactables (region-first).** A `dropCanvasData` interceptor spawns a **Scene
  Region** carrying a `fabricate.interactable` **Region Behaviour** for Fabricate Tools and
  Gathering Tasks, plus an optional presentation-only **linked Tile** marker (Drawing or
  existing Token also supported; region-only allowed). *(Original draft: flagged tokens against
  an auto-provisioned world actor — abandoned.)*
- **Activation by token presence + virtual-present Tool tokens.** A controlled token entering
  the region prompts the controlling player; on Interact a Tool interactable injects a
  virtual-present tool (keyed by `componentId`) into crafting/gathering so the actor need not
  own the item; the virtual tool is excluded from breakage and usage. *(Original draft:
  double-clicking the token — abandoned for region presence.)*
- **Gathering-task interactable = env+task shortcut (SHIPPED).** A gathering-task interactable
  carries **no node pool**; activating it opens the gathering app scoped to its `environmentId`
  + `taskId` (auto-selecting both) and reads/decrements the environment's `nodeRuntime[taskId]`
  like opening gathering directly. *(Superseded drafts: per-token `token.flags.fabricate.node`,
  then per-behaviour `behavior.system.node` with `nodeStateOverride` + a per-behaviour respawn
  pass — both **abandoned**; the env node is the single source of truth.)*
- **Depleted behavior drives a SHARED env-node Tile marker swap (SHIPPED).** `depletedBehavior`
  is authorable on the task node config; its `swapImage` drives the linked **Tile** marker:
  when the SHARED `environment.nodeRuntime[taskId]` depletes (`current <= 0`), every linked Tile
  marker for that `(environment, task)` swaps to `swapImage` and flips back on recharge
  (idempotent active-GM sync). This is the SIMPLE first version — it reflects the SHARED env
  node, NOT a per-interactable pool. The original per-marker Drawing-hide / `deleteToken` /
  Token-hide / `nodeOriginal`-revert form was abandoned. Environment resolution on drop follows
  Scene Region auto-detect → task default (new `defaultEnvironmentId` field) → GM dialog, with
  an Alt-key override that forces the dialog.
- **Distinct Lock vs Disable visibility (SHIPPED).** Visibility is split from eligibility:
  DISABLED (`state.enabled === false`) OR explicitly HIDDEN (`presentation.hidden === true`)
  conceals the interactable from players (no prompt + hidden Tile marker); LOCKED
  (`state.locked === true`) stays visible but denies Interact with
  `FABRICATE.Canvas.Interactable.Denied.Locked`.
- **GM tooling.** A GM-only scene-control browser drags/places interactables; a rich config
  panel (registered as the behaviour sheet, reachable from a Tile/Token HUD entry) offers
  Test-as-Player, Jump, Relink, Create/Recreate marker, Remove visual, Restock, Enable/Lock,
  Delete, and missing-visual recovery.
- **One-time GM migration notice.** After the 0.6.0 migration runs, surface a one-time
  Foundry `ui.notifications` message to the GM stating that recipe catalysts have moved to
  the Tools library, including a **count** of migrated entries and a pointer to the Tools
  tab. This is an explicit Phase 1 deliverable.

## Impact

- **Affected specs:** `data-models` (Catalyst removed; Tool generalized to crafting +
  gathering; recipe/step/IngredientSet `toolIds`; Interactable Region Behaviour `system`
  schema **with no `node` field**; ~~`flags.fabricate.node`, `nodeOriginal`, per-interactable
  node pool~~ **abandoned**; the SHIPPED SHARED env-node-driven `depletedBehavior.swapImage`
  Tile marker swap + `markerAvailableImg` stash; the SHIPPED Lock-vs-Disable visibility split
  (concealed vs visible-but-denied); catalyst→tool migration table),
  `recipes-and-steps` (Tool prerequisite semantics replace catalysts),
  `gathering-and-harvesting` (gathering-task interactable as a pure env+task shortcut using the
  environment node, the env-node-driven Tile marker swap + concealment/lock visibility, env
  precedence, virtual-present tools),
  `destructive-changes-and-migrations` (0.6.0 entry). Change-scoped spec deltas are provided
  under `openspec/changes/canvas-interactables-tool-unification/specs/`.
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
3. **Gathering-task interactables are a pure `(environment, task)` shortcut.** *(ABANDONED
   decision — superseded.)* The original locked decision had them own their own depletion state
   (`behavior.system.node`, draft: `token.flags.fabricate.node`) independent of
   `environment.nodeRuntime[taskId]` with their own respawn. That was **dropped**: the shipped
   interactable carries no node pool and uses the environment's `nodeRuntime[taskId]` as the
   single source of truth, decrementing it through a normal gathering attempt.
4. **Environment resolution on drop follows a precedence chain:** Scene Region auto-detect
   → task default (new optional `defaultEnvironmentId` field on the gathering library task)
   → GM dialog. A modifier-key override (hold Alt during drop) always forces the GM dialog.
5. **In scope:** GM scene-control launch button + component browser app.
   **Deferred:** range-based auto-close — tool context closes on window-close / token
   removal only.
