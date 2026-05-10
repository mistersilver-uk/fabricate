# Proposal

## Summary

Replace the Manager V2 Gathering right inspector's selected-environment content with tab-specific placeholder content when GMs switch to Tasks, Encounters, or Settings.

## Motivation

The Gathering browser already exposes top-level tabs for Environments, Tasks, Encounters, and Settings. The center panel changes for placeholder tabs, but the right inspector continues to show the selected environment, which makes the placeholder slices look incomplete and confusing.

## Scope

- Keep the Environments tab's existing environment browser and selected-environment inspector behavior.
- Make the active gathering tab state available to the Manager V2 root.
- Render placeholder inspector content for Tasks, Encounters, and Settings.
- Keep placeholder copy localized through existing Manager V2 gathering tab localization keys.

## Out of Scope

- Implementing reusable task authoring.
- Implementing encounter or hazard authoring.
- Implementing gathering settings persistence.
- Changing player-facing Gathering behavior.
