# Design: Issue #176 Recipe Learning Hooks And Manual Item Learn

## Decisions

1. Register recipe-item auto-learning from `src/main.js` via a dedicated runtime hook module, mirroring the existing fragment-discovery registration pattern instead of burying hook setup inside UI stores.
2. Prefer `createItem` for automatic learning so the flow runs against the created actor-owned item instance and can keep consume-on-learn behavior deterministic.
3. Keep recipe matching, learn preconditions, learned-flag writes, and consume-on-learn behavior centralized in `RecipeVisibilityService`; the new hook and header control should orchestrate service calls, not duplicate domain logic.
4. Add a new owned-item learn operation, separate from the existing single-recipe `learnRecipe()` contract, that can learn multiple recipes from one exact owned item and return enough structured result data for notifications, partial-success handling, and manual confirmation UX.
5. Gate the manual item-sheet header control strictly by the canonical rules:
   - `listMode === "knowledge"`
   - `knowledge.mode` supports learning
   - `learn.dragDropEnabled === false`
   - the current user can mutate the actor-owned item or owning actor through Foundry document permission APIs
   - at least one matching recipe is currently learnable for that owned item
6. Use the existing Foundry dialog bridge for confirmation so the manual flow stays consistent with other V13 application dialogs.
7. Preserve `RecipeVisibilityService.learnRecipe()` as a backward-compatible single-recipe API returning `{ success, message, messageData }` for current crafting UI callers.

## Boundaries

- Runtime hook registration belongs in a new system-level module, likely alongside `FragmentDiscoveryHook`.
- Actor-owned item-sheet header integration belongs in a small UI edge module rather than in Svelte stores, because the affordance is attached to Foundry item sheets rather than the crafting app shell.
- `RecipeVisibilityService` remains the single source of truth for matching, learnability, learned-flag writes, and consume-on-learn behavior.
- The owned-item learn operation must be item-centric: it learns from the exact item passed by the hook or sheet control, not from a deterministic search across the actor inventory or component source actors.

## Implementation Shape

### Owned-Item Learn Operation

Add a new service method with a contract similar to:

```js
learnRecipesFromOwnedItem({
  ownedItem,
  actor,
  viewer,
  mode // "auto" or "manual"
})
```

The operation must:

- require `ownedItem` to be an actor-owned item for the resolved `actor`
- match only that exact item against recipe item definitions
- use canonical `recipeItemId` and `RecipeItemDefinition.sourceItemUuid` first
- retain `linkedRecipeItemUuid` only as legacy compatibility
- use `getSourceUuid(ownedItem)` for `_stats.compendiumSource` then `flags.core.sourceId` source matching
- never call inventory-wide helpers such as `evaluateKnowledgeAccess()` in a way that can select or consume a different matching item

Operation order is fixed:

1. Resolve eligible candidate recipes for the exact item and requested mode.
2. Skip already-learned recipes.
3. Write all new flat learned entries:

```js
Actor.flags.fabricate.learnedRecipes[recipe.id] = {
  learnedAt: Date.now(),
  sourceItemUuid: ownedItem.uuid
}
```

4. Delete `ownedItem` once at the end if any newly learned recipe has `consumeOnLearn === true`.
5. Return one structured result for notification branching.

The structured result should expose at least:

- matched recipes
- newly learned recipes
- already-learned recipes
- whether the item was consumed
- whether callers should notify
- a notification kind such as `success`, `partial`, `alreadyKnown`, or `silent`
- notification data including actor name, recipe names, recipe count, and consume warning state

### Auto-Learn Path

- Register a `createItem` hook during module initialization for actor-owned item create/drop learning.
- Ignore events that do not resolve to exactly one actor-owned item for the triggering user.
- Require mutation permission through Foundry document APIs before attempting learning.
- Filter candidate recipes to enabled recipes in systems where:
  - `recipeVisibility.listMode === "knowledge"`
  - `knowledge.mode` is `learned` or `itemOrLearned`
  - `learn.dragDropEnabled !== false`
- Match the created owned item against recipe item definitions using the existing UUID and source-UUID rules.
- Learn all eligible matched recipes in one operation.
- Remove the exact created owned item by the end of the operation when any newly learned recipe requires `consumeOnLearn === true`.
- Emit at most one success, partial-success, or already-known notification per operation.
- Remain silent on wrong triggering user, missing actor parent, insufficient permission, zero-match, non-knowledge systems, item-only knowledge mode, or `dragDropEnabled === false`.

### Manual Item-Sheet Path

- Register an actor-owned item-sheet header action.
- Compute whether the exact current sheet item can teach one or more recipes for the owning actor.
- Hide the action unless at least one manually eligible recipe is learnable from that exact item.
- Manual eligibility is limited to enabled recipes in systems where:
  - `recipeVisibility.listMode === "knowledge"`
  - `knowledge.mode` is `learned` or `itemOrLearned`
  - `learn.dragDropEnabled === false`
- Confirm before executing the manual learn flow.
- Reuse the same owned-item learn operation used by auto-learn so matching, learned-flag writes, and consume-on-learn semantics stay identical.
- Use a native Foundry header control with a `fa-book-open` icon, localized tooltip/aria label, no custom styling, and an in-flight guard to prevent duplicate submissions.
- After confirmation completes, rerender or refresh the item sheet/control so the learn action disappears when the item is no longer learnable or has been deleted.

### Header Integration Strategy

Before implementation, verify the exact Foundry V13 ApplicationV2 header-control integration against installed Foundry types/runtime. V13 support is acceptance-critical.

Expected integration split:

- ApplicationV2 item sheets: add a dedicated V13 adapter using the V13 header controls surface.
- Legacy V1 item sheets: add a `getItemSheetHeaderButtons` fallback if practical.

The implementation must avoid relying only on V1 hooks or only on ownership heuristics such as `isOwner`; permission checks should use `item.canUserModify(game.user, "update")` or an equivalent actor update mutation check.

### Mixed-System Semantics

One owned item may match recipes across systems with different `dragDropEnabled` settings.

- Auto-learn evaluates and learns only auto-enabled scope (`dragDropEnabled !== false`).
- Manual item-sheet learning evaluates and learns only manual scope (`dragDropEnabled === false`).
- This split belongs in the service operation through the requested mode/scope so UI and hook callers cannot accidentally learn from the wrong system group.

### Localization And Notifications

Add localized copy for:

- manual learn action label and tooltip
- manual confirmation title and body
- consume-on-learn warning text
- plural success
- partial success
- nothing-new-learned / already-known outcome

Manual confirmation content should include the actor name, recipe count, a capped recipe-name list, and a consume warning when at least one newly learnable matched recipe would delete the item.

## Candidate Files

- `src/main.js`
- `src/systems/RecipeVisibilityService.js`
- `src/systems/FragmentDiscoveryHook.js` as the registration pattern reference
- new `src/systems/RecipeItemLearningHook.js` runtime hook module for owned-item auto-learning
- new `src/ui/ItemSheetRecipeLearnControl.js` UI hook module for actor-owned item-sheet header controls
- `src/ui/foundryCompat.js` or `src/ui/svelte/util/foundryBridge.js` for confirmation integration
- `lang/en.json` for any missing learn-flow notification or confirmation copy
- focused tests under `tests/` for service, hook wiring, and item-sheet integration

## Risks And Tradeoffs

- Multi-recipe learning introduces a new API in `RecipeVisibilityService`; the return shape should stay explicit so existing single-recipe callers do not become ambiguous.
- `createItem` runs after normal item creation, so the hook must avoid user-visible warning noise on ineligible drops and must not fight the fragment-discovery hook already using the same event.
- Item-sheet header hooks differ across Foundry sheet implementations; verify the V13 header surface first, then add V1 fallback only after the V13 path is known.
- Back-to-back `createItem` and `deleteItem` events may refresh crafting stores; regression coverage should prove hook-driven consumption does not double-notify or destabilize existing inventory refresh behavior.

## Verification Plan

- unit coverage for exact item anchoring, including two matching copies where only the passed item is learned from or deleted
- unit coverage for recipe-scope filtering, multi-recipe matching, mixed already-learned/new matches, mixed consume-on-learn behavior, and all-already-known behavior
- unit coverage for canonical `recipeItemId` / recipe item definition matching plus one legacy `linkedRecipeItemUuid` compatibility case
- integration coverage for `createItem` auto-learning when enabled
- integration coverage for `dragDropEnabled === false`, proving drops do not auto-learn and the manual header path is exposed instead
- integration coverage for mixed-system behavior where auto and manual paths learn different matched recipes from the same item based on `dragDropEnabled`
- integration coverage for permission gating and explicit silent-ignore behavior
- header-control coverage for owned/unowned items, permission gating, no learnable recipes, confirmation cancel/accept, duplicate-submit prevention, and post-action rerender/refresh
- regression coverage for current `learnRecipe()` UI localization and crafting-store refresh behavior through create/delete item events
- `npm test`
- `npm run build`

## Acceptance Alignment

This design is complete only when the implementation can demonstrate all of the following from issue `#176`:

- a spec-compliant actor-item learning hook path is registered
- `dragDropEnabled` is honored exactly
- the manual item-sheet header learn affordance and confirmation flow exist
- consume-on-learn stays deterministic across single- and multi-recipe matches
- automated coverage exists for both auto-learn and manual-learn paths
