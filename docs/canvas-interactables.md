---
layout: default
title: Canvas Interactables
nav_order: 8.2
---

# Canvas Interactables

Canvas Interactables bring Fabricate onto the Foundry scene. Instead of opening the
Items directory and knowing which recipe or environment to launch, the GM places
crafting/gathering interaction points directly on the map and players **walk a token
into them** to interact.

There are two kinds of interactable:

- **Tool station** — a placed [Tool]({% link tools.md %}). Activating it opens the
  Fabricate UI with that station's Tool **present as a virtual tool**, so a player can
  use the Tool without owning a copy of the item (think: the forge belongs to the
  smithy, not the smith).
- **Gathering-task node** — a placed [Gathering Task]({% link gathering-environments.md %}).
  Activating it opens the gathering UI scoped to that task, and the node tracks its own
  depletion and respawn independently of the environment.

{: .note }
> **A canvas interactable is a Scene Region**, not a Token or an actor. The authoritative
> state lives on a custom **`fabricate.interactable` Region Behaviour** attached to that
> region. An optional **linked visual** (a Tile by default) is presentation-only — it
> gives the interactable a marker on the map, but it does not *own* anything. There are
> **no synthetic actors or tokens** anywhere in this feature.

{: .note }
> **Tile double-click is retired.** Earlier builds modelled interactables as Tiles you
> double-clicked. That model is gone. Players now activate by **token presence** (walking
> into the region), described under [Using interactables (players)](#using-interactables-players).

---

## The region-first model

Every canvas interactable is:

1. **A Scene Region** — a small rectangle (one grid square by default) placed on the
   scene, snapped to the grid.
2. **A `fabricate.interactable` Region Behaviour** nested in that region. This behaviour
   owns all the authoritative state:
   - `interactableType` (`tool` | `gatheringTask`), `sourceUuid`, `systemId`,
     `toolId` | `taskId`, `environmentId`, `name`
   - `presentation` — `{ promptText, hidden }`
   - `linkedVisual` — `{ uuid, documentName (Tile|Drawing|Token), mode (marker|none), missingPolicy }`
   - `node` — the per-interactable depletion/respawn state (gathering-task only)
   - `state` — `{ enabled, consumed, locked, uses, cooldown }`
   - `activation` — `{ trigger: regionEnter, audience }`
3. **An optional linked visual** — a **Tile** (default), a **Drawing**, or an existing
   **GM Token**. It is presentation-only: it carries reverse flags back to the region/
   behaviour, but deleting it never destroys the interactable.

Because the region behaviour is the source of truth, a **region-only** interactable (no
marker at all) works perfectly — players still walk into the region and get the prompt.

---

## Placing interactables (GM)

Placing interactables is **GM-only**. There are three ways to place one:

1. **Interactable browser.** A GM-only **Fabricate** button in the scene controls (its own
   top-level mortar-and-pestle control group) opens the **Interactable browser** app. It
   lists the active crafting system's draggable Tools and Gathering Tasks. Each row offers:
   - **Drag onto the canvas** — drops a region (plus a linked Tile marker) at the drop
     point.
   - **Place on current scene** — a keyboard/no-pointer fallback that drops at the current
     view centre. It runs the exact same spawn pipeline as a drag (including the
     gathering-task environment resolution below), so it is not a divergent path.
   - **Region only** — places the interactable as a **region with no marker** (a hidden,
     presence-only interactable).
2. **Item drag.** Dragging a world/compendium or Items-directory **Item that is linked to a
   Tool component** onto the canvas also spawns a Tool station, by matching the dropped item
   against each crafting system's Tools library.

A dropped interactable snaps to the scene grid. When it has a marker, the linked Tile takes
its image from the Tool component's icon (or the task's image), falling back to a generic
bag icon. Spawning is **transaction-like**: if the marker fails to create after the region
exists, the orphan region is cleaned up (and vice-versa).

If a non-GM attempts to drop an interactable, the drop is rejected with a notification —
only a GM can place them.

### Marker variants

| Variant | What it is | Notes |
|:--------|:-----------|:------|
| **Tile marker** (default) | A Foundry Tile linked to the behaviour | Depletion can swap its image or delete it. |
| **Drawing marker** | A Foundry Drawing linked to the behaviour | Depletion can hide it (and optionally append a "(depleted)" label). |
| **Token marker** | An *existing* GM Token you relink to the behaviour | **Never mutated or deleted** by depletion — it is the GM's own document (e.g. a merchant NPC). Depletion is a safe no-op. |
| **Region only** | No marker at all | The region itself is the interactable; `presentation.hidden = true`, `linkedVisual.mode = 'none'`. |

A **missing** linked visual (e.g. the GM deleted the Tile) is governed by the behaviour's
`linkedVisual.missingPolicy` and is otherwise a clean no-op — the interactable keeps
working region-only until the GM recreates or relinks a marker from the config panel.

---

## Using interactables (players)

Players activate an interactable by **walking a controlled token into its region**:

1. When the token enters an eligible region, a small **non-blocking prompt** appears on the
   controlling player's client (bottom-centre), showing the interactable's name and an
   optional prompt line.
2. Clicking **Interact** routes an activation request to the **active GM**, who validates it
   (actor control, source still exists, environment exists, token still inside) and, on
   success, grants it — opening the Fabricate UI **on the player's client**:
   - **Tool station** → the Fabricate app with the station Tool present as a virtual tool.
   - **Gathering node** → the gathering UI scoped to that task, using the behaviour's own
     node state.
3. Leaving the region dismisses the prompt.

{: .note }
> Only the controlling player's client shows the prompt (so a region-enter never fires N
> prompts across the table), and only the **active GM** ever mutates state (so connected
> clients never double-apply).

### Tokens already inside on load

Foundry's region-enter event does **not** fire for a token that is already standing in a
region when the scene loads. Fabricate covers this two ways:

- **Control re-trigger** — taking control of a token that is already inside an eligible
  region re-raises the prompt.
- **Keybinding** — a client keybinding *Fabricate: interact here* (default **E**) re-raises
  the prompt for the controlled token's current region.

### A GM must be online

Activation, depletion, respawn, and every other state write are routed through the **active
GM**. If a player tries to activate while **no GM is connected**, the attempt is blocked
cleanly with a message rather than hanging. A GM is their own applier and always passes.

### Virtual-present (station) tools

The station Tool a player gets from a Tool-station activation is **virtual-present**: it
satisfies the Tool's presence requirement without the actor owning the item, and it is
**excluded from breakage and usage** (it is the station's tool, not the actor's). Matching
is scoped to the station's own crafting system — a station Tool from one system never
satisfies a same-id Tool required by a different system.

{: .note }
> **Interim Tool routing.** Activating a Tool station currently opens the **gathering** tab,
> because the Svelte crafting tab is still a placeholder. The injected station Tool is
> tab-agnostic, so this will route to (or offer) crafting once that tab ships.

---

## Gathering-task nodes

A placed gathering-task behaviour owns its **own** depletion/respawn state in
`system.node`, independent of the environment's per-task node runtime. At placement time the
behaviour **snapshots the task's node config** (and its runtime); from then on it uses only
its own node state. Two placements of the same task deplete independently.

{: .note }
> Tool **requirements are not snapshotted** — a node still resolves `task.toolIds` against
> the system Tools library at attempt time, so editing a Tool in the library propagates to
> already-placed interactables.

### Depleted behavior

When a node depletes (`node.current <= 0`), the task's `depletedBehavior` config changes the
**linked visual's** appearance. The field names keep their legacy `*Token` spelling but are
interpreted per linked-visual kind:

| Behavior | Tile marker | Drawing marker | Token marker |
|:---------|:------------|:---------------|:-------------|
| `swapImage` | Texture is swapped to the depleted image; the original is stashed and restored on respawn. | (not used) | safe no-op |
| `postfixName` | (no nameplate — ignored) | Appends a "(depleted)" label, removed on respawn. | safe no-op |
| `deleteToken` | **Terminal.** The Tile is removed; it cannot respawn. | **Terminal.** The Drawing is removed. | **Never** deletes the Token — safe no-op. |

`deleteToken` is mutually exclusive with `swapImage` / `postfixName`. A linked existing
Token is always treated as the GM's own document, so depletion never mutates or deletes it.

### Respawn

As world time advances, each placed node respawns on its own calendar-aware interval — the
same respawn arithmetic the per-environment pass uses. This pass runs **active-GM only** so
connected clients never double-apply, and it reflects the restored state onto the linked
visual (e.g. restoring a Tile's swapped image).

### Environment resolution on placement

A Tool station carries no environment, so it spawns immediately. A **gathering-task** node
must resolve which environment it belongs to. Placement uses this precedence:

1. **Scene Region auto-detect.** If the drop point falls inside a single Scene Region flagged
   `flags.fabricate.environmentId`, that environment wins and a notification names it.
   Multiple matching regions are ambiguous and fall through to the dialog.
2. **Task default.** Otherwise, the task's optional `defaultEnvironmentId` field is used.
3. **GM dialog.** If neither resolves (or the resolved id is stale), the GM is prompted to
   pick an environment. **Cancelling the dialog aborts the placement** — nothing is created.

**Alt override.** Holding **Alt** during the drop always forces the GM dialog, skipping tiers
1 and 2 — useful when auto-detect or the task default would pick the wrong environment.

The resolved environment is stamped onto the behaviour at placement time, so a later
activation uses it directly.

---

## The config panel (GM)

Each interactable has a GM **config panel** — it is the registered sheet for the
`fabricate.interactable` behaviour, and it can also be opened from a **Tile** or **Token**
HUD button on a linked marker. The panel is a thin view over the behaviour; every write
routes through the active-GM socket. From it a GM can:

- **Test as Player** — run the activation pipeline as if a player had walked in.
- **Jump** — pan the camera to the interactable's region.
- **Relink** — point the behaviour at a different existing visual (Tile / Drawing / Token).
- **Create / Recreate marker** — make a fresh linked Tile or Drawing (e.g. after the
  original was deleted, or to add a marker to a region-only interactable).
- **Remove** — drop the linked visual but keep the interactable region-only.
- **Restock** — refill a depleted gathering node.
- **Enable / Lock** — toggle the behaviour's `state.enabled` / `state.locked`.
- **Delete** — remove the interactable (region + behaviour).
- **Missing-visual recovery** — when the linked visual is gone, a status banner offers
  recreate / relink.

---

## What's next?

- [Tools]({% link tools.md %}) — the system-owned Tool model that backs Tool stations.
- [Gathering Environments]({% link gathering-environments.md %}) — author the tasks and
  environments that gathering-task nodes reference.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}) — a worked
  example of a tool that wears out.
