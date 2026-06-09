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
  Fabricate **Crafting** tab with that station's Tool **present as a virtual tool**, so a
  player can use the Tool without owning a copy of the item (think: the forge belongs to
  the smithy, not the smith).
- **Gathering-task shortcut** — a placed [Gathering Task]({% link gathering-environments.md %}).
  Activating it opens the gathering UI **scoped to, and auto-selecting, a specific
  (environment, task) pair**. It is a pure shortcut: it reads and decrements the
  **environment's own node state** (`nodeRuntime[taskId]`), exactly as if the player had
  opened gathering and picked that environment and task by hand. A placed shortcut has
  **no node pool of its own** — two shortcuts pointing at the same (environment, task)
  draw down the same shared environment node.

{: .note }
> **A canvas interactable is a Scene Region**, not a Token or an actor. The authoritative
> state lives on a custom **`fabricate.interactable` Region Behaviour** attached to that
> region. An optional **linked visual** (a Tile by default) gives the interactable a marker
> on the map; it owns no authoritative state but **reflects** the behaviour's state (its
> visibility tracks lock/disable, and a Tile's image tracks the environment node's depletion).
> There are **no synthetic actors or tokens** anywhere in this feature.

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
   - `state` — `{ enabled, consumed, locked, uses, cooldown }`
   - `activation` — `{ trigger: regionEnter, audience }`

   There is **no `node` field** on the behaviour. A gathering-task interactable carries
   only the `(environmentId, taskId)` pointer; depletion and respawn live entirely on the
   environment's node runtime, never on the interactable.
3. **An optional linked visual** — a **Tile** (default), a **Drawing**, or an existing
   **GM Token**. It owns no authoritative state and carries reverse flags back to the region/
   behaviour, so deleting it never destroys the interactable — but it does **reflect** that
   state: a Tile is hidden from players when the interactable is disabled/hidden, and its
   image swaps when the environment node depletes (see [Marker variants](#marker-variants)).

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
bag icon. A Tile renders **centred** on its stored point while a Region rectangle renders
from its **top-left**, so the spawn deliberately offsets the region to **overlay** the
marker on the drop point — a player walking onto the visible marker is reliably inside the
region. Spawning is **transaction-like**: if the marker fails to create after the region
exists, the orphan region is cleaned up (and vice-versa).

If a non-GM attempts to drop an interactable, the drop is rejected with a notification —
only a GM can place them.

### Marker variants

A marker **owns no authoritative state** in any variant — the source of truth is always the
region behaviour, and the interactable keeps working even with no marker at all. What a marker
*does* do is **reflect** that state: its visibility tracks the interactable's lock/disable state,
and a Tile marker's image tracks the shared environment node's depletion (see below).

| Variant | What it is | Notes |
|:--------|:-----------|:------|
| **Tile marker** (default) | A Foundry Tile linked to the behaviour | Created and centred on the drop point; takes its image from the Tool/task icon. Hidden from players when the interactable is disabled or hidden; image swaps when the environment node depletes (gathering tasks). |
| **Drawing marker** | A Foundry Drawing linked to the behaviour | A labelled translucent rectangle "zone" marker. |
| **Token marker** | An *existing* GM Token you relink to the behaviour | **Never mutated or deleted** — it is the GM's own document (e.g. a merchant NPC). |
| **Region only** | No marker at all | The region itself is the interactable; `presentation.hidden = true`, `linkedVisual.mode = 'none'`. |

#### Depleted-marker image swap (gathering tasks)

A Tile marker on a **gathering-task** interactable reflects its environment node's depletion.
When the environment's node for that task runs out (`environment.nodeRuntime[taskId].current <= 0`)
**and** the task configures a `depletedBehavior.swapImage`, every linked Tile marker for that
`(environment, task)` swaps to the depleted image; when the node recharges (respawns above 0)
the markers flip back. The available image is **stashed** on the first swap and restored on
recharge, so the restore target is the GM's actual marker texture.

This is driven by the **shared** environment node, not a per-marker pool — two markers pointing
at the same `(environment, task)` deplete and recharge together. The active GM applies the Tile
writes (idempotently, on the `gatheringEnvironments` setting change and on `canvasReady`) and
every client sees them through Foundry document sync. Markers with no configured `swapImage`,
non-Tile markers, and tool stations are left untouched.

#### Lock vs Disable (marker visibility + prompt)

Lock and Disable are **distinct** — they are not synonyms:

- **Disabled** (`state.enabled = false`) or **"Hidden from players"** (`presentation.hidden = true`)
  → the interactable is **concealed**: the linked marker Tile is hidden from players
  (`tile.hidden = true`; the GM still sees it) and no on-enter prompt fires.
- **Locked** (`state.locked = true`) → the interactable stays **visible**: the marker is shown and
  the prompt fires, but pressing **Interact** is denied with "This is locked."

Eligibility still gates activation independently: a locked, consumed, uses-exhausted, or
cooling-down interactable that is *visible* shows the prompt, then the Interact-time validation
denies the activation with the specific reason. The marker-visibility reconcile runs on the
active GM (on the setting change and `canvasReady`), so a disabled/hidden interactable loads
concealed for players.

A **missing** linked visual (e.g. the GM deleted the Tile) is governed by the behaviour's
`linkedVisual.missingPolicy` and is otherwise a clean no-op — the interactable keeps
working region-only until the GM recreates or relinks a marker from the config panel.

---

## Using interactables (players)

Players activate an interactable by **walking a controlled token into its region**:

1. When the token enters a region the interactable does not **conceal** (it is not disabled
   and not "Hidden from players"), a small **non-blocking prompt** appears on the controlling
   player's client (bottom-centre), showing the interactable's name and an optional prompt
   line. A **locked** interactable still prompts here — the denial happens at Interact time
   (see step 2), not by suppressing the prompt.
2. Clicking **Interact** routes an activation request to the **active GM**, who validates it
   (actor control, source still exists, environment exists, token still inside) and, on
   success, grants it — opening the Fabricate UI **on the player's client**:
   - **Tool station** → the **Crafting** tab with the station Tool present as a virtual
     tool (and the active station-tool chip in the header).
   - **Gathering-task shortcut** → the gathering UI scoped to, and auto-selecting, the
     interactable's `(environmentId, taskId)`. It reads and decrements that
     **environment's** node state — there is no per-interactable node override.
3. Leaving the region dismisses the prompt.

{: .note }
> Only the controlling player's client shows the prompt (so a region-enter never fires N
> prompts across the table), and only the **active GM** ever mutates state (so connected
> clients never double-apply).

### Tokens already inside on load

Foundry's region-enter event does **not** fire for a token that is already standing in a
region when the scene loads. Fabricate covers this two ways:

- **Control re-trigger** — taking control of a token that is already inside a region the
  interactable does not conceal re-raises the prompt (a locked interactable still re-prompts;
  Interact-time validation enforces the lock).
- **Keybinding** — a client keybinding *Fabricate: interact here* (default **E**) re-raises
  the prompt for the controlled token's current region.

### A GM must be online

Activation and every other interactable state write are routed through the **active GM**. If
a player tries to activate while **no GM is connected**, the attempt is blocked cleanly with
a message rather than hanging. A GM is their own applier and always passes.

### Virtual-present (station) tools

The station Tool a player gets from a Tool-station activation is **virtual-present**: it
satisfies the Tool's presence requirement without the actor owning the item, and it is
**excluded from breakage and usage** (it is the station's tool, not the actor's). Matching
is scoped to the station's own crafting system — a station Tool from one system never
satisfies a same-id Tool required by a different system.

When the Crafting tab ships, a Tool-station activation will surface its crafting actions
there directly; the injected station Tool is already tab-agnostic.

---

## Gathering-task shortcuts

A placed gathering-task interactable is a **pure (environment, task) shortcut**. It does
**not** carry a node pool of its own and it does **not** snapshot the task's node config at
placement time. Activating it opens the gathering UI scoped to, and auto-selecting, its
`(environmentId, taskId)`, then reads and decrements the **environment's** own node runtime
(`nodeRuntime[taskId]`) — exactly as if the player had opened gathering and selected that
environment and task manually.

The consequences follow directly from there being a single source of truth:

- Two interactables that point at the **same (environment, task)** draw down the **same**
  shared environment node — they do not deplete independently.
- Gathering through an interactable is an ordinary gather: it does not change the
  environment's node availability beyond what a normal gather of that task would.
- Editing the task, its required tools, or its node config in the library propagates to
  every placed shortcut automatically, because nothing is snapshotted onto the
  interactable.

### Depletion and respawn

Node depletion (when the environment node runs out) and respawn (as world time advances) are
owned **entirely by the environment's node runtime** — see
[Gathering Environments]({% link gathering-environments.md %}). The interactable carries no
node pool of its own: there is no per-interactable depletion and no per-behaviour respawn pass.

The marker, however, **reflects** that shared environment node. When the node depletes and the
task configures a `depletedBehavior.swapImage`, every linked **Tile** marker for that
`(environment, task)` swaps to the depleted image; when the node recharges the markers flip
back (see [Depleted-marker image swap](#depleted-marker-image-swap-gathering-tasks)). Because
the swap reads the shared environment node rather than a per-marker pool, all markers for the
same `(environment, task)` change together. Drawing and Token markers are not image-swapped.

### Environment resolution on placement

A Tool station carries no environment, so it spawns immediately. A **gathering-task**
shortcut must resolve which environment it belongs to. Placement uses this precedence:

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
- **Enable / Lock** — toggle the behaviour's `state.enabled` / `state.locked`. These are
  **distinct**: **disabling** (or setting "Hidden from players") conceals the interactable —
  the marker Tile is hidden from players and no prompt fires — while **locking** keeps the
  marker visible and the prompt firing, but denies Interact with "This is locked." The
  activation-gate summary line reflects the first blocking gate (disabled → locked → consumed
  → uses-exhausted → cooldown).
- **Delete** — remove the interactable (region + behaviour).
- **Missing-visual recovery** — when the linked visual is gone, a status banner offers
  recreate / relink.

The panel has **no node or restock controls**: a gathering-task shortcut has no node pool of
its own, so node availability is managed on the **environment** (in the Crafting System
Manager), not on the interactable.

---

## What's next?

- [Tools]({% link tools.md %}) — the system-owned Tool model that backs Tool stations.
- [Gathering Environments]({% link gathering-environments.md %}) — author the tasks and
  environments that gathering-task shortcuts reference, and where node availability,
  depletion, and respawn actually live.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}) — a worked
  example of a tool that wears out.
