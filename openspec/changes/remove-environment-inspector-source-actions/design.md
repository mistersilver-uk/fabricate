# Design: Remove Environment Inspector Source Actions

## Inspector UI

`RecordInspector.svelte` remains the selected task/hazard detail surface for the right inspector. Its hero card keeps image, selected-record label, name, composition state, and runtime state.

Remove only the inspector-local action strip and Source card:

- no `Open source task/hazard` button under the selected name
- no Include/Restore/Remove call-to-action buttons under the selected name
- no Source card explaining the reusable library record

## Routing

`EnvironmentTasksTab.svelte` and `EnvironmentHazardsTab.svelte` continue to receive source-opening callbacks for row overflow menus. `EnvironmentRightInspector.svelte` no longer needs source or composition action callbacks because the selected-record inspector is read-only apart from environment override controls.
