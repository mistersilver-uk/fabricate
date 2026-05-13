# Design

## Recipe CRUD Notification Control

`RecipeManager.createRecipe`, `updateRecipe`, and `deleteRecipe` gain an optional second or third options object with `notify !== false` defaulting to true. Existing callers remain compatible.

Batch callers pass `{ notify: false }` and retain all validation, persistence, flag cleanup, and return behavior.

## System Delete Summary

`CraftingSystemManager.deleteSystem` snapshots the system before deletion and counts child records that are deleted because the system is removed:

- recipes owned by the system
- components
- essence definitions
- recipe item definitions

It deletes child recipes with suppressed recipe notifications, removes the system, emits the existing systems-changed hook, and then sends one info notification naming the deleted crafting system and total related entity count.

## Import Summary

`RecipeManager.importRecipes` keeps direct map insertion and returns `{ imported, skipped, total }` after sending its existing aggregate summary.

`CompendiumImporter` passes `{ notify: false }` when creating or updating recipes, leaving the importing UI as the single place that emits the final system-pack import notification.

Bundled starter pack import also creates recipes with `{ notify: false }` and emits one starter-pack import summary after the system and recipes are created.
