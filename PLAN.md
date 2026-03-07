# Implementation Plan

## T-087: Fix Recipe Matching on Foundry v12+ (`_stats.compendiumSource` vs `core.sourceId`)

### Problem

On Foundry v12+, items dragged from compendiums populate `_stats.compendiumSource` instead of (or in addition to) `flags.core.sourceId`. Fabricate currently only checks `flags.core.sourceId` when matching actor-owned items to managed components and linked recipe items. This causes:

1. **False "Cannot craft"** -- `RecipeManager.ingredientMatchesItem()` and `_catalystMatchesItem()` fail to match items that only have `_stats.compendiumSource`.
2. **Invisible knowledge recipes** -- `RecipeVisibilityService._isMatchingRecipeItem()` fails to match recipe items, so knowledge-gated recipes appear hidden.
3. **Broken salvage** -- `CraftingEngine._findComponentItems()` also only checks `flags.core.sourceId`.

### Root Cause

Four methods read `flags.core.sourceId` but never read `_stats.compendiumSource`:

| File                                     | Method                    | Line      |
|------------------------------------------|---------------------------|-----------|
| `src/systems/RecipeVisibilityService.js` | `_isMatchingRecipeItem()` | 27        |
| `src/systems/RecipeManager.js`           | `ingredientMatchesItem()` | 595       |
| `src/systems/RecipeManager.js`           | `_catalystMatchesItem()`  | 630       |
| `src/systems/CraftingEngine.js`          | `_findComponentItems()`   | 1596-1601 |

### Solution

#### 1. Create a shared source-UUID resolver

Create a new utility function in `src/utils/sourceUuid.js`:

```js
/**
 * Resolve the compendium source UUID of a Foundry item document.
 *
 * On Foundry v12+, the canonical location is `_stats.compendiumSource`.
 * Older versions (and some migration paths) store it in `flags.core.sourceId`.
 * This helper checks both, preferring the modern field.
 *
 * @param {Item} item - A Foundry item document (or item-like object with flags/_stats)
 * @returns {string|null} The source UUID, or null if neither field is set
 */
export function getSourceUuid(item) {
  if (!item) return null;
  // Foundry v12+ canonical field
  const compendiumSource = item._stats?.compendiumSource
    || item.system?._stats?.compendiumSource
    || null;
  if (compendiumSource) return compendiumSource;
  // Legacy fallback
  if (typeof foundry !== 'undefined' && foundry?.utils?.getProperty) {
    return foundry.utils.getProperty(item, 'flags.core.sourceId') || null;
  }
  return item.flags?.core?.sourceId || null;
}
```

#### 2. Update RecipeVisibilityService._isMatchingRecipeItem()

**File:** `src/systems/RecipeVisibilityService.js`, line 24-29

Replace the `flags.core.sourceId` lookup with `getSourceUuid(item)`:

```js
_isMatchingRecipeItem(recipe, item) {
  const linked = recipe?.linkedRecipeItemUuid;
  if (!linked || !item) return false;
  const sourceId = getSourceUuid(item);
  return item.uuid === linked || sourceId === linked;
}
```

Import `getSourceUuid` at the top of the file.

#### 3. Update RecipeManager.ingredientMatchesItem()

**File:** `src/systems/RecipeManager.js`, line 584-608

Replace line 595:
```js
const sourceId = foundry.utils.getProperty(item, 'flags.core.sourceId');
```
with:
```js
const sourceId = getSourceUuid(item);
```

Import `getSourceUuid` at the top of the file.

#### 4. Update RecipeManager._catalystMatchesItem()

**File:** `src/systems/RecipeManager.js`, line 625-637

Replace line 630:
```js
const sourceId = foundry.utils.getProperty(item, 'flags.core.sourceId');
```
with:
```js
const sourceId = getSourceUuid(item);
```

#### 5. Update CraftingEngine._findComponentItems()

**File:** `src/systems/CraftingEngine.js`, line 1596-1611

Replace line 1601:
```js
(item.flags?.core?.sourceId === component.sourceUuid)
```
with:
```js
(getSourceUuid(item) === component.sourceUuid)
```

Import `getSourceUuid` at the top of the file.

#### 6. Add/update tests

**New file:** `tests/source-uuid-resolver.test.js`

Test cases for `getSourceUuid`:
1. Returns `_stats.compendiumSource` when present
2. Falls back to `flags.core.sourceId` when `_stats.compendiumSource` is absent
3. Returns `null` when neither field is set
4. Prefers `_stats.compendiumSource` over `flags.core.sourceId` when both are set
5. Handles null/undefined item gracefully

**Update:** `tests/recipe-visibility-service.test.js`

Add test:
- `_isMatchingRecipeItem` returns true when `_stats.compendiumSource` matches `linkedRecipeItemUuid`

Update `FakeItem` constructor to accept an optional `compendiumSource` parameter that populates `_stats.compendiumSource`.

**New file:** `tests/source-uuid-matching.test.js`

Integration-style tests covering:
1. `ingredientMatchesItem` matches item with only `_stats.compendiumSource`
2. `ingredientMatchesItem` still matches item with only `flags.core.sourceId` (legacy)
3. `_catalystMatchesItem` matches item with only `_stats.compendiumSource`
4. `_catalystMatchesItem` still matches item with only `flags.core.sourceId` (legacy)
5. "Craftable only" filtering includes recipe when actor has items matched via `_stats.compendiumSource`

### File Change Summary

| File                                      | Action     | Description                                                                          |
|-------------------------------------------|------------|--------------------------------------------------------------------------------------|
| `src/utils/sourceUuid.js`                 | **Create** | Shared `getSourceUuid()` helper                                                      |
| `src/systems/RecipeVisibilityService.js`  | **Edit**   | Import and use `getSourceUuid` in `_isMatchingRecipeItem`                            |
| `src/systems/RecipeManager.js`            | **Edit**   | Import and use `getSourceUuid` in `ingredientMatchesItem` and `_catalystMatchesItem` |
| `src/systems/CraftingEngine.js`           | **Edit**   | Import and use `getSourceUuid` in `_findComponentItems`                              |
| `tests/source-uuid-resolver.test.js`      | **Create** | Unit tests for `getSourceUuid`                                                       |
| `tests/source-uuid-matching.test.js`      | **Create** | Integration tests for matching with `_stats.compendiumSource`                        |
| `tests/recipe-visibility-service.test.js` | **Edit**   | Add `_stats.compendiumSource` matching test                                          |

### Constraints

- Do NOT edit files under `docs/` or `spec/` (docs-writer handles that)
- Use `node:test` and `node:assert/strict` for all new tests
- Maintain backward compatibility with Foundry v10/v11 items that only have `flags.core.sourceId`
- The `getSourceUuid` function must work in test environments where `foundry` global may not exist
- Run `npm test` after implementation to verify all tests pass

### Implementation Order

1. Create `src/utils/sourceUuid.js`
2. Create `tests/source-uuid-resolver.test.js` and verify it passes
3. Update `src/systems/RecipeVisibilityService.js`
4. Update `src/systems/RecipeManager.js`
5. Update `src/systems/CraftingEngine.js`
6. Create `tests/source-uuid-matching.test.js`
7. Update `tests/recipe-visibility-service.test.js`
8. Run `npm test` to verify all tests pass
