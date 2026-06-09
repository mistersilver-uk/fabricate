---
layout: default
title: Canvas Interactables
nav_order: 8.2
---

# Canvas Interactables

Canvas Interactables bring Fabricate onto the Foundry scene. Instead of opening the
Items directory and knowing which recipe or environment to launch, the GM places
crafting/gathering interaction points directly on the map and players walk up and
**double-click** them.

There are two kinds of interactable:

- **Tool station** — a placed [Tool]({% link tools.md %}). Double-clicking it opens the
  Fabricate UI with that station's Tool **injected as present**, so a player can use the
  Tool without owning a copy of the item (think: the forge belongs to the smithy, not the
  smith).
- **Gathering-task node** — a placed [Gathering Task]({% link gathering-environments.md %}).
  Double-clicking it opens the gathering UI scoped to that task, and the node tracks its
  own depletion and respawn independently of the environment.

{: .note }
> Interactables are Foundry **Tiles**, not Tokens. They are not actor-backed and have no
> character sheet. A tile has no nameplate, so its name is shown on **hover**.

---

## Placing interactables (GM)

Spawning interactables is **GM-only**. There are three ways to place one:

1. **Interactable browser.** A GM-only **Fabricate** button in the scene controls (the
   mortar-and-pestle group) opens the **Interactable browser** app. It lists the active
   crafting system's draggable Tools and Gathering Tasks. Drag a row onto the canvas to
   spawn a tile.
2. **Keyboard / no-pointer fallback.** Each browser row also has a *Place on current scene*
   button that drops the tile at the current view centre. It runs the exact same spawn
   pipeline as a drag (including the gathering-task environment resolution below), so it is
   not a divergent path.
3. **Item drag.** Dragging a world/compendium or Items-directory **Item that is linked to a
   Tool component** onto the canvas also spawns a Tool station, by matching the dropped item
   against each crafting system's Tools library.

A dropped interactable snaps to the scene grid and takes its image from the Tool component's
icon (or the task's image), falling back to a generic bag icon.

If a non-GM attempts to drop an interactable, the drop is rejected with a notification —
only a GM can place them.

---

## Using interactables (players)

- **Double-click** a tile to interact. Tool stations open the Fabricate app with the
  station Tool present; gathering-task nodes open the gathering app scoped to that node.
- **Hover** a tile to see its name as a floating canvas label (tiles have no nameplate).
- Both interactions work for non-GM players: Fabricate makes interactable tiles
  pointer-eventful for everyone and permits the player's double-click / hover, even though
  tiles are normally GM-only scenery. No other tile gains player interactivity.

{: .note }
> **Interim Tool routing.** Double-clicking a Tool station currently opens the **gathering**
> tab, because the Svelte crafting tab is still a placeholder. The injected station Tool is
> tab-agnostic, so this will route to (or offer) crafting once that tab ships.

### Virtual-present (station) tools

The station Tool a player gets from a double-click is **virtual-present**: it satisfies the
Tool's presence requirement without the actor owning the item, and it is **excluded from
breakage and usage** (it is the station's tool, not the actor's). Matching is scoped to the
station's own crafting system — a station Tool from one system never satisfies a same-id Tool
required by a different system.

---

## Gathering-task nodes

A placed gathering-task tile owns its **own** depletion/respawn state in
`tile.flags.fabricate.node`, independent of the environment's per-task node runtime. At drop
time the tile **snapshots the task's node config** (and its runtime) into the flag; from then
on that tile uses only its own node state. Two tiles of the same task deplete independently.

{: .note }
> Tool **requirements are not snapshotted** — a node tile still resolves `task.toolIds`
> against the system Tools library at attempt time, so editing a Tool in the library
> propagates to already-placed tiles.

### A GM must be online

All node-state writes (depletion, respawn, depleted-visual changes) are routed through the
**active GM** over the module socket; only the active GM applies the `tile.update`. If a
player double-clicks a node tile while **no GM is connected**, the attempt is blocked cleanly
with a message rather than hanging. GMs are themselves the applier and always pass.

### Depleted behavior

When a node depletes (`node.current <= 0`), the task's `depletedBehavior` config changes the
tile's appearance. For **tiles**, only two effects apply:

| Behavior | Effect |
|:---------|:-------|
| `swapImage` | The tile texture is swapped to the depleted image. The original image is stashed in `flags.fabricate.nodeOriginal` and restored when the node respawns. |
| `deleteToken` | **Terminal.** The tile is removed from the scene. A deleted tile cannot respawn, so the world-time respawn pass skips it. |

{: .note }
> The `postfixName` depleted behavior does **not** apply to tiles — a tile has no nameplate
> to append to. (It is ignored if present on legacy config.) `deleteToken` is mutually
> exclusive with `swapImage`.

### Respawn

As world time advances, each placed node tile respawns on its own calendar-aware interval —
the same respawn arithmetic the per-environment pass uses. This pass runs **active-GM only**
so connected clients never double-apply, and it restores the `swapImage` original when a node
climbs back above zero.

---

## Environment resolution on drop

A Tool station carries no environment, so it spawns immediately. A **gathering-task** tile
must resolve which environment it belongs to. The drop uses this precedence:

1. **Scene Region auto-detect.** If the drop point falls inside a single Scene Region flagged
   `flags.fabricate.environmentId`, that environment wins and a notification names it.
   Multiple matching regions are ambiguous and fall through to the dialog.
2. **Task default.** Otherwise, the task's optional `defaultEnvironmentId` field is used.
3. **GM dialog.** If neither resolves (or the resolved id is stale), the GM is prompted to
   pick an environment. **Cancelling the dialog aborts the spawn** — no tile is created.

**Alt override.** Holding **Alt** during the drop always forces the GM dialog, skipping
tiers 1 and 2 — useful when auto-detect or the task default would pick the wrong environment.

The resolved environment is stamped onto the tile flag at drop time, so a later double-click
uses it directly.

---

## Tile flag schema

All per-interactable data lives under `tile.flags.fabricate`:

```js
flags.fabricate = {
  isInteractable: true,
  interactableType: 'tool' | 'gatheringTask',
  sourceUuid: string,        // the Fabricate Tool / Gathering Task source identity
  name?: string,             // display name for the hover label (tiles have no nameplate)
  environmentId?: string,    // resolved at drop (gatheringTask only)
  node?: object,             // gatheringTask only: per-tile depletion/respawn state
  nodeOriginal?: object,     // captured pre-depleted-behavior tile state (swap-image stash)
}
```

---

## What's next?

- [Tools]({% link tools.md %}) — the system-owned Tool model that backs Tool stations.
- [Gathering Environments]({% link gathering-environments.md %}) — author the tasks and
  environments that gathering-task nodes reference.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}) — a worked
  example of a tool that wears out.
