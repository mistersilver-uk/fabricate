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

Importing a large system shows a live progress bar so you can follow a long import as it runs.
Fabricate saves all of a system's recipes together in a single write at the end of the import, which is much faster for systems with many recipes.

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
- Each player's own chosen order for progressive result stages.
Your **Allow player result re-ordering** setting is authoring data, so it is exported with the recipe or the component, but the orders your players picked are theirs and stay behind.

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

Copy mode regenerates the system, realm, environment, and recipe identifiers while preserving Gathering Task, event, and modifier identifiers, so the environment-to-library links keep working in the copy.
Recipe book membership is carried across to the regenerated recipe identifiers, so every book in the copy still lists the same recipes.

{: .note }
> A crafting system's identifier may only contain letters, digits, hyphens, and underscores.
> Fabricate generates a valid identifier for every system you create, so any system you authored in Fabricate and exported imports cleanly.
> If you hand-edit an export file and give a system an identifier that contains a dot or a space, importing it in Skip or Overwrite mode fails with an error that names the offending identifier, because those modes keep the original identifier.
> Either fix the identifier in the file, or import it in Copy mode, which assigns a fresh valid identifier.

## Recipes removed by a reinstall

When you Overwrite an existing system with a newer version of the same pack, Fabricate removes the recipes that the pack used to ship and no longer includes.
It only removes recipes that came from that pack.
A recipe you authored yourself in an imported system is never removed automatically by a reinstall.

If you edited a recipe that came from the pack, that recipe still counts as the pack's recipe, so it is removed when a newer version of the pack no longer ships it.
To keep a customization through a pack update, author a fresh recipe of your own rather than editing the pack's recipe.
Recipes you author are never removed automatically, so a fresh recipe survives every reinstall.

Recipes that were imported before this behavior existed carry no record of the pack they came from, so a reinstall reports them instead of removing them.
The next time you reinstall the pack, those recipes gain that record, and a later reinstall can then remove them if the pack has dropped them.

Fabricate keeps a record of which recipes a reinstall removed and which it kept, but the import report shown in Foundry does not display that list yet.
Showing it in the import dialog is a planned follow-up.
