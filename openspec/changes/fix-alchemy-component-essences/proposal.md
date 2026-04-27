# Fix Alchemy Component Essences

## Summary

Fix alchemy discovery and crafting so workbench items contribute essence values from their matched crafting-system component definitions.

## Root Cause

Essence requirements are canonical data on `Component.essences`, but alchemy matching and craftability currently accumulate essences only from live item flags. Workbench submissions are normal actor inventory items matched to components by source UUID, so they can satisfy component signatures while contributing no essence unless the actor item also has `fabricate.essences` flags.

As a result, a recipe that requires `2` restorative essence does not match when the workbench contains two component items whose component definitions each provide `1` restorative essence.

## Proposed Fix

- Resolve submitted or available item essence values from the matched system component when item flags do not define essences.
- Preserve existing item-flag essence behavior as the first source for backward compatibility.
- Apply the same essence resolution path in alchemy signature matching, recipe craftability/display states, crafting-check/effect-transfer essence context, and discovered-recipe craftability.
- Add regression coverage for pure essence alchemy with two distinct component-backed submitted items, item-flag precedence, workbench quantity semantics, inventory stack quantity semantics, discovered-recipe filtering, and effect-transfer essence context.

## Non-Goals

- Changing recipe/result routing semantics.
- Changing the shape of persisted component or recipe data.
- Adding new dependencies.
