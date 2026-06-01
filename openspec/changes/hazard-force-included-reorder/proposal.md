# Hazard Force-Included Reorder

## Summary

Fix gathering environment hazard ranking so force-included hazards can be reordered with matching hazards when the selected system uses highest-ranked hazard drops.

## Motivation

Hazard ranking drives `highestRankedDrop` selection, but the editor currently derives drag/drop indexes from a different set than the visible Included hazards list. A force-included hazard can render as an included row while being omitted from the store's reorder list, which makes dropping onto the last force-added hazard fail or move the wrong record.

## Goals

- Let every included hazard occupy any rank when hazard selection is `highestRankedDrop`.
- Keep hazard rank controls hidden for `allDrops` and `limitedDrops`.
- Preserve deterministic composed hazard order in non-highest-ranked editor modes without exposing drag handles.
- Keep task ordering behavior unchanged.

## Out of Scope

- Adding new hazard selection modes.
- Changing d100 roll or hazard policy semantics.
- Reintroducing task drag/drop ordering controls.
