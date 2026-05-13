# Batch Crafting Operation Notifications

## Summary

Batch crafting operations should emit one terminal notification instead of one notification per affected child entity.

## Motivation

Deleting a crafting system or importing a batch of recipes can touch many recipes and related records. The current per-recipe success notifications create notification spam and obscure the useful summary of what happened.

## Proposed Changes

- Add an internal notification suppression option to recipe create, update, and delete operations.
- Suppress per-recipe notifications when deleting a crafting system and emit one summary including the system name and related entity count.
- Suppress per-recipe notifications during full crafting-system pack imports and emit one final import summary.
- Suppress per-recipe notifications during bundled starter pack imports and emit one final import summary.
- Keep pasted recipe JSON import summary-only by removing duplicate UI-layer success notifications.

## Non-Goals

- Change single recipe create, update, or delete notification behavior.
- Change component folder or pack import behavior, which already reports a single summary.
- Add new dependencies or migrations.
