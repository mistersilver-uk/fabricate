# Polish Manager V2 Empty Systems

## Summary

Refine the Manager V2 GM admin experience when no crafting systems exist. The central empty state should be lighter and more polished, and the right inspector should stop prompting GMs to select a system when there are no systems to select.

## Motivation

The current "No crafting systems yet" and "Select a system" empty states are visually heavier than the surrounding Manager V2 shell. The inspector copy is also contextually wrong when the system list is empty.

## Scope

- Adjust Manager V2 empty-state typography and icon sizing.
- Replace the no-systems inspector prompt with compact first-run setup guidance and documentation links.
- Preserve the existing central Create system action and selected-system feature-tab hiding behavior.

## Out Of Scope

- Changing crafting-system data contracts or persistence.
- Adding new documentation pages.
- Reworking Manager V2 layout outside the no-systems state.
