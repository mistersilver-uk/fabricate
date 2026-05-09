# Proposal: Manager V2 Gathering Empty Guidance

## Problem

The Manager V2 Gathering page currently treats an empty `Environments` tab as an environment-first setup path. Rich gathering authoring is moving toward reusable task and hazard libraries that environments compose from, so the first-run guidance should steer GMs toward those building blocks before they create locations.

## Scope

- Keep the Gathering page default tab and tab order as `Environments`, `Tasks`, `Encounters`, `Settings`.
- Revise the no-environments empty state to explain that reusable tasks and hazards should be prepared before environments.
- Add secondary empty-state actions that switch to the existing `Tasks` and `Encounters` placeholder tabs.
- Keep the existing `Create environment` action available from the empty state.
- Update English localization, mounted behavior tests, and the canonical UI spec.

## Out of Scope

- Implementing full reusable task or hazard authoring.
- Renaming or reordering the current Gathering tabs.
- Changing environment creation, editor routing, or persistence behavior.
