---
layout: default
title: Import & Export
nav_order: 9.5
---

# Import & Export

Fabricate can export a complete crafting system to a JSON file and import it into another world.
An export round-trips the whole GM-authored model of a system, so you can back up a system or move it between worlds without rebuilding newer features by hand.

{: .gm }
> Only GMs can import a crafting system.
> Import writes world-scoped settings and fails immediately for a non-GM before any change is made.

## What is included

A system export carries every supported GM-authored record type for that system:

- The crafting system itself: metadata, feature flags, components (with categories, tags, difficulty, and source-item references), essences, recipe-item definitions, tools, item tags, and realms.
- Its recipes: identity, steps, ingredients (including grouped and alternative options), outputs, checks, tools, and outcomes.
- Its gathering environments: identity, enabled state, selection and composition mode, scene gate, realm membership, biomes, danger, manual include/exclude/force lists, and local adjustments.
- Its per-system gathering configuration: gathering rules, the biome, danger, weather, and time-of-day options you have configured, reusable Gathering Tasks, reusable events, gathering tools, per-drop modifiers, and your stamina and resource-node settings.

Every export records a version marker so future format changes stay backward compatible.
Older exports still import.
Fabricate upcasts them automatically before validating.

## What is excluded

Export includes authoring data and leaves out runtime and world state.
Each export is marked as authoring-only.
Excluded state includes:

- The current weather and time of day (reset to defaults, while your authored weather and time-of-day options are kept).
- Per-environment resource-node depletion and respawn timers.
- Gathering parties, per-character stamina pools, per-character blind-task discovery, and recent gathering history.
- Active timed gathering runs and any actor, token, or scene state.

## How unresolved references are handled

Some references point at world documents that may not exist in the target world: component source items, scene gates, scene regions, the items a drop row grants, and macros.
Fabricate never silently drops these.
It preserves each reference exactly as authored and, after import, shows a GM-readable report grouped by kind.
The report separates references that need your attention from those it resolved automatically.
Internal links inside the system (for example, an environment that points at a Gathering Task) are matched up within the imported data.
A link that resolves to nothing is kept and reported as a data-integrity warning.

## Import modes

When you import a system you choose how to handle an existing system with the same identity:

- **Skip** leaves the existing system untouched.
- **Overwrite** replaces the existing system and its recipes, and replaces only that system's gathering environments.
- **Copy** imports the data as a new system with fresh identifiers, so it never collides with the original.

Copy mode regenerates the system, realm, and environment identifiers while preserving Gathering Task, event, and modifier identifiers, so the environment-to-library links keep working in the copy.

{: .note }
> A crafting system's identifier may only contain letters, digits, hyphens, and underscores.
> Fabricate generates a valid identifier for every system you create, so any system you authored in Fabricate and exported imports cleanly.
> If you hand-edit an export file and give a system an identifier that contains a dot or a space, importing it in Skip or Overwrite mode fails with an error that names the offending identifier, because those modes keep the original identifier.
> Either fix the identifier in the file, or import it in Copy mode, which assigns a fresh valid identifier.
