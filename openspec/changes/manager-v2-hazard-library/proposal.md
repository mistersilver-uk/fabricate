# Manager V2 Hazard Library

## Summary

The rich gathering domain already has a working `Reusable Gathering Hazard Library` runtime: `_normalizeGatheringHazard` in `src/ui/svelte/stores/adminStore.js`, hazard CRUD store actions, environment-level toggle data (`enabledHazardIds` / `disabledHazardIds`), usage-evidence helpers, deletion-confirmation flow, and d100 hazard resolution in `src/systems/GatheringRichStateService.js` are all in place. The Manager V2 surface, however, exposes hazards only as a placeholder tab (`id: 'encounters'`) inside `src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte` that reads "Reusable hazard authoring is planned for a later slice." GMs cannot currently author, browse, edit, duplicate, or delete reusable hazards through the UI.

This change wires the existing store actions into a real Manager V2 authoring surface that mirrors the Gathering Tasks library structurally: a browser tab with search/filter/duplicate/usage-aware delete and an editor view for one hazard. The environment-level attach/toggle UI is **deferred** to a follow-up slice.

## Goals

- Replace the `encounters` placeholder body in `EnvironmentsBrowserView.svelte` with a real hazard library browser.
- Provide a hazard editor that authors `name`, `description`, `img`, `enabled`, `dangerTags`, `regions`, `biomes`, `weather`, `timeOfDay`, `dropRate` (1-100), `hazardModifier` (provider), and `characterModifiers[]` per the spec.
- Wire CRUD, duplicate, and usage-aware delete confirmation to the existing adminStore actions.
- Provide search and filter by status, region, biome, and danger tag.
- Add localization keys, CSS, and component/store tests sufficient to land #188's hazard authoring acceptance criteria.

## Out of Scope

- Environment-level hazard attach/toggle UI (rows showing reusable hazards per environment with override toggles). Deferred to a follow-up slice that mirrors how tasks attach to environments.
- Hazard resolution hooks / integration APIs (tracked by #184).
- Player-facing hazard outcome display in the Player Gathering app.
- Rich attempt evidence persistence changes (tracked by #182).
- Any change to the hazard data model or runtime resolution — both already exist and stay untouched.
