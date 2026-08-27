---
layout: default
title: Gathering
parent: Player App
nav_order: 3
---

# Player Gathering App

The player gathering experience opens from the Items Directory **Gathering** action and is presented as the **Gathering** tab of the unified Fabricate window.

## Actor Selection Bar

A shared **actor-selection bar** sits above all of the window's tabs.
Its left side is a character portrait with a caret that opens a searchable popover listing the characters you can gather as.
Type to filter the list by name, then pick a character to select it.
The bar remembers your choice and reuses it the next time the window opens.

The bar lists your selectable **player characters**: the actors your game system treats as player characters, owned by you for players and all of them for GMs.
This only limits the list you choose from.
If your remembered character is missing from the list, the bar falls back to the first available player character and remembers that instead.

The bar's right side carries gathering context.
On the **Gathering** tab it shows the current **weather** and **time of day** (each an icon and label).
On other tabs the right side is empty.

## Environments Column

The player app's left column lists environments as cards.
**Available** environments (enabled, with at least one visible task) sort first and are selectable.
**Locked** environments sort after them and are shown only as non-interactive teasers.
A locked card is one your party cannot currently reach.
That covers a disabled environment, and an environment in another realm or gated behind a scene the party is not on.
It carries the environment identity (name, image, biome chips) and a visible lock indicator, but no tasks, weights, or composition internals leak through it.

Blind environments show a **blind** chip.
When the system reveals discovered tasks, a blind card also shows a discovered count (how many distinct tasks the selected character has revealed, out of the full pool they could discover).
Locked cards and cards that never reveal show no discovered count.
Biome chips on a card use the same labels, icons, and colours as the GM Environments editor.

Visible environments and tasks remain listed even when they are currently blocked.
Scene-linked entries stay visible when the selected character is not on the linked scene or has no active token there, and the app shows the reason it is blocked.
Active timed runs, last-attempt feedback, and recent history remain visible for the selected character even when browsing is empty or blocked.

### Hide unavailable

Beneath the environment search field is a **Hide unavailable** toggle switch.
Turn it on to tidy the column when locked teasers pile up.
It hides only the environments your party cannot currently reach.
That is the locked teasers: disabled environments, and environments in another realm or gated behind a scene you are not on.
The toggle label shows how many environments are currently unavailable, for example **Hide unavailable (3)**.

It does not hide environments you can still select whose individual tasks happen to be blocked.
An in-realm environment where a task is short on stamina or missing a tool stays visible so you can open it and read why the task is blocked.
It also leaves blind environments visible unless they are themselves locked.

The toggle starts **off**, so you see every environment until you opt in.
It only changes what this device shows.
It never changes saved data or anything the GM configured, and it does not affect what other players see.
Fabricate remembers the choice for this browser or device, so reopening the app here keeps it on.
Opening Fabricate on another device or in another browser starts from off again.

If turning it on hides every environment in the column, Fabricate shows an **all unavailable environments hidden** message with a **Show unavailable** button.
Use that button to bring the hidden environments back.
This is a different message from the **no environments match your search** one you get when a search term matches nothing.

Targeted task rows can show task names, descriptions, active-run timing, status, result counts, required-tool counts, and recent history.
For non-GM users, blind rows and missing-environment history stay redacted: the app uses a generic label and does not expose hidden task names, result details, or tool details.
GMs can see real blind task names through GM-facing surfaces.

## Detail Column

Selecting an environment fills the center **detail** column.
It opens with an environment header (the name, a short description, and info pips for any present biome and danger level) plus a mode hint describing how that environment is gathered.

How the rest of the column reads depends on the selection mode:

- **Targeted environments** show a list of task rows.
  Each row carries the task name, description, a **success-chance bar**, and an **Attempt** button.
  A task that is currently blocked stays visible but greyed, with its blocking reasons (such as required time of day, required weather, or missing tools) shown inline and its Attempt button disabled.
- **Blind environments** show a single **Attempt gathering** button that resolves one hidden task at random.
  When the system reveals discovered tasks, a **Discovered Tasks** section lists the tasks this character has already revealed as their own visible rows (each with its own success-chance bar and Attempt button), with a count of how many have been discovered out of the full pool.
  Before anything has been revealed the section reads as nothing discovered yet.

The success-chance bar shows the chance that at least one item drops.
It is not the chance the whole attempt succeeds, so it can read high while an attempt is still blocked or fails a skill check.
Tasks that have no enabled drop rows carry no bar.
The opaque blind action never shows per-task success chances.

Attempting a routed or progressive task opens an interactive roll dialog before anything is gathered, and the roll posts to chat so a module like Dice So Nice can animate it.
Cancelling the dialog aborts the attempt with no changes.
The immediate d100 mode and timed tasks do not prompt.
See [Rolling a check from the UI]({% link checks/crafting.md %}#rolling-a-check-from-the-ui) for the full behaviour.

{% include screenshot.html case="player-gathering-task-ready" caption="A targeted environment, with one of its task rows selected." %}

{% include screenshot.html case="player-gathering-blind" caption="A blind environment, offering one opaque action and a discovered count instead of task rows." %}

A blocked task stays in the list rather than disappearing from it, and says why.

{% include screenshot.html case="player-gathering-tool-blocked" caption="A task the character cannot attempt because it requires a tool they do not carry." %}

{% include screenshot.html case="player-gathering-timed-active" caption="A timed task the character has already started, blocked until that run finishes." %}

An environment whose events are fully disclosed to players carries a second **Events** tab in the detail column, listing what can happen there beside the environment's own event chance.

{% include screenshot.html case="player-gathering-events" caption="The Events tab of an environment, with one of its events selected." %}
