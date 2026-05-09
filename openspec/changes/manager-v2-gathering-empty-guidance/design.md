# Design: Manager V2 Gathering Empty Guidance

## UI Behavior

`EnvironmentsBrowserView` keeps local `activeGatheringTab` state initialized to `environments`. The empty state for `environmentList.length === 0` remains inside the `Environments` panel, but its copy now describes reusable tasks and hazards as setup prerequisites for useful gathering environments.

The primary action remains `Create environment` and continues to call `onCreateEnvironment`. Two secondary buttons call the existing tab selection helper:

- `Review tasks` selects the `tasks` tab.
- `Review hazards` selects the `encounters` tab, because hazards are currently represented by the Encounters placeholder.

The placeholder panels remain unchanged and continue to communicate that task and encounter/hazard authoring are future slices.

## Setup Card Copy

The Manager V2 inspector setup card shown when no environment is selected and no environments exist uses the same task/hazard-first guidance. This keeps the right-side setup guidance consistent with the main empty state while avoiding new behavior or routes.

## Localization

English strings are updated for:

- empty-state title and hint
- setup card title, hint, and ordered steps
- tab-switching action labels

Fallback strings in Svelte are updated with the same text so mounted tests that use untranslated keys still exercise the intended copy.

## Testing

The mounted Manager V2 test covers that:

- Gathering still opens on `Environments`.
- The tab order stays `Environments`, `Tasks`, `Encounters`, `Settings`.
- Empty copy mentions reusable tasks and hazards.
- `Create environment` still routes into the editor.
- The new `Review tasks` and `Review hazards` actions select the expected placeholder tabs.
