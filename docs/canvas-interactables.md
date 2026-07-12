---
layout: default
title: Canvas Interactables
nav_order: 8.2
---

# Canvas Interactables

Canvas Interactables bring Fabricate onto the Foundry scene.
Instead of opening the Items directory and knowing which recipe or environment to launch, the GM places crafting/gathering interaction points directly on the map and players **walk a token into them** to interact.

There are two kinds of interactable:

- **Tool station** is a placed [Tool]({% link tools.md %}).
  Activating it opens the Fabricate **Crafting** tab with that station's Tool **present as a virtual tool**, so a player can use the Tool without owning a copy of the item (think of the forge belonging to the smithy, not the smith).
- **Gathering-task shortcut** is a placed [Gathering Task]({% link gathering-environments.md %}).
  Activating it opens the gathering UI scoped to, and auto-selecting, a specific environment and task.
  It is a pure shortcut.
  It reads and draws down that **environment's own gathering supply**, exactly as if the player had opened gathering and picked that environment and task by hand.
  A placed shortcut has **no supply of its own**.
  Two shortcuts pointing at the same environment and task draw down the same shared supply.

{: .note }
> **A canvas interactable is a region you draw on the map**, not a token or an actor.
> An optional marker (a tile by default) gives the interactable something to see on the map.
> The marker mirrors the interactable: it is hidden when the interactable is hidden or disabled, and its image can change when a gathering supply runs out.
> Deleting the marker never destroys the interactable.

---

## The region-first model

Every canvas interactable is:

1. **A region on the map**, a small rectangle (one grid square by default) placed on the scene and snapped to the grid.
2. **The interactable settings attached to that region.**
   An interactable remembers what it points at (a tool station or a gathering-task shortcut), whether it is enabled or locked, how many uses or cooldown it has, the prompt text shown to players, and how its marker behaves.
   A gathering-task interactable only remembers which environment and task it is a shortcut for.
   When a gathering supply runs out or comes back, that happens on the environment, never on the interactable.
3. **An optional marker**, a **tile** (default), a **drawing**, or an existing **GM-owned token**.
   Deleting the marker never destroys the interactable.
   The marker mirrors the interactable: a tile is hidden from players when the interactable is disabled or hidden, and its image can change when the gathering supply runs out (see [Marker variants](#marker-variants)).

Because the region itself is what matters, a **region-only** interactable (no marker at all) works perfectly.
Players still walk into the region and get the prompt.

---

## Placing interactables (GM)

Placing interactables is **GM-only**.
There are three ways to place one:

1. **Interactable browser.** A GM-only **Fabricate** button in the scene controls (its own mortar-and-pestle control group) opens the **Interactable browser**.
   It lists the active crafting system's tools and gathering tasks that can be dragged out.
   Each row offers:
   - **Drag onto the canvas** drops a region (plus a tile marker) at the drop point.
   - **Place on current scene** is a no-pointer fallback that drops at the current view centre.
     It places exactly as a drag does, including resolving the gathering-task environment described below.
   - **Region only** places the interactable as a region with no marker (a hidden, presence-only interactable).
2. **Item drag.** Dragging an item that is linked to a tool (from the world, a compendium, or the Items directory) onto the canvas also places a tool station, by matching the dropped item against each crafting system's tools.
3. **Manage Interactables panel, Promote region.** A browser drag always places a one-grid-square rectangle, so an interactable that needs an arbitrary or odd shape has no path through the browser.
   The **Manage Interactables** panel (below) closes that gap.
   Draw a region of any shape with Foundry's own region tools, then **promote** it into a working interactable bound to a chosen tool or gathering task.

A dropped interactable snaps to the scene grid.
When it has a marker, the tile takes its image from the tool's icon (or the task's image), falling back to a generic bag icon.
The region is offset so the marker sits over the drop point, so a player walking onto the visible marker is reliably inside the region.
Placement is all-or-nothing: if the marker cannot be created after the region exists, the leftover region is cleaned up, and the other way round.

If a non-GM attempts to drop an interactable, the drop is rejected with a notification.
Only a GM can place them.

### Marker variants

A marker is only the visible face of the interactable.
The interactable keeps working even with no marker at all.
What a marker does is mirror the interactable: it is hidden when the interactable is locked or disabled, and a tile marker's image can change when the shared gathering supply runs out (see below).

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Variant | What it is | Notes |
|:--------|:-----------|:------|
| **Tile marker** (default) | A Foundry tile placed on the map | Created and centred on the drop point. Takes its image from the tool or task icon. Hidden from players when the interactable is disabled or hidden. Image can change when the gathering supply runs out (gathering tasks). |
| **Drawing marker** | A Foundry drawing | A labelled translucent rectangle "zone" marker. |
| **Token marker** | An *existing* GM-owned token you relink | **Never changed or deleted**. It is the GM's own token (e.g. a merchant NPC). |
| **Region only** | No marker at all | The region itself is the interactable, hidden, presence-only. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

#### Depleted-marker image swap (gathering tasks)

A tile marker on a **gathering-task** interactable reflects whether its environment's supply is exhausted.
When the environment's supply for that task runs out **and** the task is set up to change image when depleted, every tile marker for that environment and task swaps to the depleted image.
When the supply comes back, the markers flip back to their original image.

This is driven by the **shared** environment supply, not a per-marker pool.
Two markers pointing at the same environment and task deplete and recharge together.
Markers with no configured depleted image, non-tile markers, and tool stations are left untouched.

#### Lock vs Disable (marker visibility + prompt)

Lock and Disable are **distinct**.
They are not synonyms:

- **Disabled**, or **"Hidden from players"**, conceals the interactable.
  The marker tile is hidden from players (the GM still sees it) and no prompt fires when a token enters.
- **Locked** keeps the interactable **visible**.
  The marker is shown and the prompt fires, but pressing **Interact** is denied with "This is locked."

Eligibility still gates activation on its own.
A locked, used-up, uses-exhausted, or cooling-down interactable that is *visible* still shows the prompt, then the activation is denied with the specific reason.
A disabled or hidden interactable loads already concealed for players.

If the marker is **missing** (for example the GM deleted the tile), the interactable keeps working region-only until the GM recreates or relinks a marker from the config panel.

### Manage Interactables panel (GM)

The **Manage Interactables** panel is a GM-only, scene-level window launched from a second button in the same **Fabricate** scene-control group (alongside *Place interactables*).
It is the single place to see and manage every interactable on the current scene, and the supported way to author **arbitrary-shaped** interactables.

**List.** The panel lists every interactable on the current scene with its **name**, **type** (tool or gathering task), **source**, **state** (enabled, locked, or used up), and **marker status** (tile, drawing, token, region-only, or missing).
Each row offers:

- **Open configuration** opens the config panel for that interactable.
- **Jump to region** pans the canvas to the interactable's region.
- **Delete** removes the interactable region after a confirmation dialog.
  The marker, if any, is left on the scene.

**Promote region to interactable.** Pick an existing drawn region of **any shape** and a tool or gathering task from the active crafting system, then promote it.
A promoted interactable behaves identically to a dragged one, and it is attached to the region you already drew, so promotion **never re-shapes it**.
You can promote with a visible **tile or drawing marker** over the region centre, or as **region-only** (no marker).
Promoting a **gathering task** resolves its environment exactly the way a canvas drop does (auto-detect from the region, then the task default, then a GM dialog).
A browser drag remains the one-grid-square fast path.
The panel is the path for everything that needs a custom shape.

The panel is **GM-only**.
Players never see it.

---

## Using interactables (players)

Players activate an interactable by **walking a controlled token into its region**:

1. When the token enters a region the interactable does not **conceal** (it is not disabled and not "Hidden from players"), a small **non-blocking prompt** appears on the controlling player's client (bottom-centre), showing the interactable's name and an optional prompt line.
   A **locked** interactable still prompts here.
   The denial happens at Interact time (see step 2), not by suppressing the prompt.
2. Clicking **Interact** sends the request to the GM, who checks it (the player controls the actor, the source still exists, the environment still exists, the token is still inside) and, on success, opens the Fabricate UI on the player's screen:
   - **Tool station** opens the **Crafting** tab with the station's tool available to use (and the active station-tool chip in the header).
   - **Gathering-task shortcut** opens the gathering UI scoped to, and auto-selecting, the interactable's environment and task.
     It reads and draws down that **environment's** supply.
     There is no per-interactable supply.
3. Leaving the region dismisses the prompt.

{: .note }
> Only the controlling player sees the prompt, so a single token entering a region never fires a prompt for everyone at the table.

### Tokens already inside on load

Foundry does not raise the region-enter event for a token that is already standing in a region when the scene loads.
Fabricate covers this two ways:

- **Control re-trigger** means taking control of a token that is already inside a region the interactable does not conceal re-raises the prompt (a locked interactable still re-prompts, and the lock is still enforced at Interact time).
- **Keybinding** means the client keybinding *Fabricate: interact here* (default **E**) re-raises the prompt for the controlled token's current region.

### A GM must be online

Activation needs a GM to be connected.
If a player tries to activate while **no GM is online**, the attempt is blocked cleanly with a message rather than hanging.
A GM activating their own interactable always passes.

### Virtual-present (station) tools

The tool a player gets from a tool-station activation is borrowed from the station.
It satisfies the requirement to have that tool present without the actor owning a copy, and it is **never worn down or used up** (it belongs to the station, not the actor).
This only works within the station's own crafting system.
A station tool from one system never satisfies the same tool required by a different system.

When the Crafting tab ships, a tool-station activation will surface its crafting actions there directly.

---

## Gathering-task shortcuts

A placed gathering-task interactable is a **pure shortcut** to one environment and task.
It does **not** carry a supply of its own and it does **not** take a snapshot of the task at placement time.
Activating it opens the gathering UI scoped to, and auto-selecting, that environment and task, then reads and draws down the **environment's** own supply, exactly as if the player had opened gathering and selected that environment and task manually.

Because there is a single source of truth, this follows:

- Two interactables that point at the **same** environment and task draw down the **same** shared supply.
  They do not deplete independently.
- Gathering through an interactable is an ordinary gather.
  It does not change the environment's supply beyond what a normal gather of that task would.
- Editing the task, its required tools, or its supply in the library reaches every placed shortcut automatically, because nothing is copied onto the interactable.

### Depletion and respawn

Running out of supply, and having it come back as time advances, are owned **entirely by the environment**.
See [Gathering Environments]({% link gathering-environments.md %}).
The interactable carries no supply of its own.

The marker, however, reflects that shared supply.
When the supply runs out and the task is set up to change image when depleted, every **tile** marker for that environment and task swaps to the depleted image.
When the supply comes back the markers flip back (see [Depleted-marker image swap](#depleted-marker-image-swap-gathering-tasks)).
Because the swap reads the shared supply rather than a per-marker pool, all markers for the same environment and task change together.
Drawing and token markers are not image-swapped.

### Environment resolution on placement

A tool station carries no environment, so it is placed immediately.
A **gathering-task** shortcut must work out which environment it belongs to.
Placement tries these in order:

1. **Auto-detect from the region.** If the drop point falls inside a single environment region on the scene, that environment wins and a notification names it.
   Two or more matching regions are ambiguous and fall through to the dialog.
2. **Task default.** Otherwise, the task's optional default environment is used.
3. **GM dialog.** If neither resolves, the GM is prompted to pick an environment.
   **Cancelling the dialog aborts the placement**, so nothing is created.

**Alt override.** Holding **Alt** during the drop always forces the GM dialog, skipping the first two steps.
This is useful when auto-detect or the task default would pick the wrong environment.

The chosen environment is recorded on the interactable when it is placed, so a later activation uses it directly.

---

## The config panel (GM)

Each interactable has a GM **config panel**.
It can be opened from the Manage Interactables panel, or from a button on a linked tile or token marker.
From it a GM can:

- **Test as Player** activates the interactable as if a player had walked in.
- **Jump** pans the camera to the interactable's region.
- **Relink** points the interactable at a different existing marker (tile, drawing, or token).
- **Create / Recreate marker** makes a fresh tile or drawing marker (for example after the original was deleted, or to add a marker to a region-only interactable).
- **Remove** drops the marker but keeps the interactable working region-only.
- **Enable / Lock** toggles the interactable's enabled and locked state.
  These are **distinct**.
  **Disabling** (or setting "Hidden from players") conceals the interactable, so the marker is hidden from players and no prompt fires, while **locking** keeps the marker visible and the prompt firing, but denies Interact with "This is locked."
  A summary line shows the first reason that would block activation, in order: disabled, then locked, then used up, then uses exhausted, then cooling down.
- **Delete** removes the interactable region.
- **Missing-marker recovery** means that when the marker is gone, a status banner offers to recreate or relink it.

The panel has **no supply or restock controls**.
A gathering-task shortcut has no supply of its own, so supply is managed on the **environment** (in the Crafting System Manager), not on the interactable.

---

## Uninstalling Fabricate cleanly

Canvas interactables are stored as a **custom region behaviour** that only Fabricate knows how to read.
This is standard for a Foundry module, but it has one consequence you should know about before you remove Fabricate.

### The caveat

A canvas interactable lives on the map as a `fabricate.interactable` region behaviour.
That behaviour type is defined by Fabricate, so when Fabricate is **disabled or uninstalled** Foundry no longer knows how to load it.

Foundry does **not** remove a module's custom region behaviours when that module is disabled.
It leaves them on your scenes as an unrecognised type.

The effect depends on your Foundry version.

- On **Foundry 14.360 and later** the unrecognised behaviour is quarantined: your scene and region data are kept intact, and Foundry only logs a console message.
  Re-enabling Fabricate restores the interactable exactly as it was.
- On **Foundry versions before 14.360** (all of v13 and the earliest v14 builds) the unrecognised behaviour can invalidate its parent region and the whole scene until Fabricate is re-enabled.

This is core Foundry behaviour for module-defined sub-types, not a Fabricate bug.
Fabricate cannot change how Foundry handles another module's leftover documents, but it gives you a clean way to remove its own before you uninstall.

{: .note }
> If you are on a Foundry version before 14.360, update to 14.360 or later before removing Fabricate.
> On the fixed versions your scene data is always recoverable by re-enabling Fabricate, running the cleanup below, and only then uninstalling.

### Running the cleanup

Fabricate exposes a GM-only cleanup you run **before** you disable or uninstall it.
It removes only what Fabricate owns and asks you to confirm first.

Run it from a GM macro (or the browser console) while Fabricate is still enabled:

```js
game.fabricate.cleanupInteractables();
```

It scans every scene in your world and, after a confirmation dialog, removes:

- every `fabricate.interactable` region behaviour, so no unrecognised behaviour is left to error on load;
- Fabricate's own **tile** and **drawing** markers;
- Fabricate's ownership flags on regions, and its reverse flags on relinked tokens.

It keeps your regions, your tokens, and every non-Fabricate region behaviour.

- Your **regions** are kept, even the ones Fabricate created.
  An empty leftover region is harmless, and you can delete it by hand.
- Any **other region behaviour** on a region (lighting, a third-party module, and so on) is kept.
- A **token marker** is your own token (for example a merchant NPC), so it is never deleted — only its Fabricate link flag is cleared.

{: .warning }
> **One exception: relinked tile or drawing markers.**
> Cleanup deletes the tile and drawing markers that carry Fabricate's link, and that includes a **tile or drawing you drew yourself and then relinked** as an interactable's marker.
> Tokens are treated differently (they are only unlinked, never deleted) because a token is clearly your own actor, but a hand-drawn tile or drawing is removed along with Fabricate's own markers.
> If you drew a tile or drawing that carries independent meaning on the map (say a map annotation) and relinked it to an interactable, **unlink it from the interactable first** — use **Remove** on the interactable's config panel — before you run cleanup or uninstall.
> After you unlink it, it is your own plain tile or drawing again and cleanup leaves it alone.

When it finishes it tells you how many interactables and markers were removed.
At that point you can disable or uninstall Fabricate with no leftover errors.

### If you already uninstalled

If Fabricate is already gone and a scene is logging `"fabricate.interactable" is not a valid type`, re-enable Fabricate.
On Foundry 14.360 and later your interactables reconstruct from the preserved data.
Run `game.fabricate.cleanupInteractables()` to strip them, then uninstall.

---

## See Also

- [Tools]({% link tools.md %}) is the system-owned Tool model that backs Tool stations.
- [Gathering Environments]({% link gathering-environments.md %}) is where you author the tasks and environments that gathering-task shortcuts reference, and where node availability, depletion, and respawn actually live.
- [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}) is a worked example of a tool that wears out.
