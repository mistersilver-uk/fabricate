# Gathering Environment Task Quick Actions

## Summary

Manual task composition rows in the gathering environment editor currently require opening the overflow menu to include, force-add, or exclude tasks. This change adds icon-only quick action buttons beside the existing 3-dot menu for the common manual task actions while keeping the overflow menu actions available.

## Goals

- Add a red Remove quick button to included task rows in manual mode.
- Add a green Add quick button to available matching task rows in manual mode.
- Add an amber Force add quick button to available non-matching task rows in manual mode.
- Keep library-disabled rows non-actionable except through the existing explanatory menu note.
- Keep automatic task mode and hazard rows unchanged.

## Out of Scope

- Changes to composition data, matching rules, or callback behavior beyond the shared callback keeping its existing internal name.
- Replacing or removing the existing overflow menu actions.
- Custom tooltip components; native `title` plus `aria-label` is sufficient for this quick action affordance.
