# PLAN: Compendium & Item Drop-Import Defects

## Source Spec

`TASK-SPEC-DROP-DEFECTS.md` -- two defects to fix.

## Defect 1 -- Source-ID-aware overwrite on compendium item drop

### Problem Summary

`addItemFromUuid` checks only for an exact `sourceUuid` match. It does not detect
when the dropped compendium UUID is the *source* of an existing world-item component.
Example: existing component has `sourceUuid = "Compendium.world.pack.Item.234"`;
dropping that same compendium UUID again should overwrite name/img, retain the
component `id`, and push the old `sourceUuid` into `fallbackItemIds`.

## Defect 2 -- Reject non-Item entity types on drop

### Problem Summary

`onDropItem` and `resolveDropUuid` accept any drag data without checking entity
type. Actors, JournalEntries, Scenes, etc. are silently accepted. Folder drops
should expand to contained Items.

---

## Implementation Steps

### Step 1: Add i18n keys (lang/en.json)

Add the following keys under `FABRICATE.Admin.Items`:

| Key | Value |
|-----|-------|
| `ItemUpdated` | `"Updated existing item: {name}."` |
| `BulkImportUpdated` | `"Imported {added} new, updated {updated}, skipped {skipped} of {total} items."` |
| `DropNotAnItem` | `"Only Item documents can be added as crafting components. Dropped: {type}."` |
| `FolderImportSummary` | `"Imported {added} items from folder \"{name}\"."` |
| `FolderEmpty` | `"Folder \"{name}\" contains no Item documents."` |

Note: The existing `BulkImportSummary` key is kept for backward compatibility
but the new `BulkImportUpdated` key replaces it in the bulk-import path (which
now tracks `updated` separately).

**File:** `/home/matthew/WebstormProjects/fabricate-v2/lang/en.json`

---

### Step 2: Update `resolveDropUuid` to return type info (dropUtils.js)

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/util/dropUtils.js`

Add a new export `resolveDropData(data)` alongside the existing `resolveDropUuid`.
Keep `resolveDropUuid` unchanged for backward compatibility.

```
resolveDropData(data) -> { uuid: string|null, type: string|null }
```

- `type` is taken from `data.type` (Foundry populates this as `"Item"`, `"Actor"`,
  `"Folder"`, `"Compendium"`, etc.).
- `uuid` is resolved the same way as `resolveDropUuid`.
- For `data.type === 'Folder'`, uuid is null (folders have no UUID in Foundry);
  return `{ uuid: null, type: 'Folder', folderId: data.id, folderDocumentType: data.documentType }`.

---

### Step 3: Update `addItemFromUuid` with source-ID-aware overwrite (CraftingSystemManager.js)

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingSystemManager.js`

Change `addItemFromUuid(systemId, itemUuid)` to return
`{ item, action: 'added'|'updated'|'skipped' }`:

1. **Exact match** (current logic): `system.items.find(i => i.sourceUuid === itemUuid || i.sourceItemUuid === itemUuid)`.
   - If found, return `{ item: existing, action: 'skipped' }`.

2. **Source-ID match** (new logic): check if any existing item's `sourceUuid`
   equals the dropped UUID OR if the dropped UUID appears in any item's
   `fallbackItemIds`. This catches the case where a world item was created
   from this compendium entry.
   - If found:
     a. Resolve the dropped UUID via `fromUuid` to get fresh name/img.
     b. Overwrite `name` and `img` on the existing item.
     c. If the existing item's `sourceUuid` differs from `itemUuid`, push the
        old `sourceUuid` into `fallbackItemIds` (deduplicated).
     d. Update `sourceUuid` and `sourceItemUuid` to `itemUuid`.
     e. Save and return `{ item: updated, action: 'updated' }`.

3. **No match** (current new-item logic): resolve, create, save, return
   `{ item: newItem, action: 'added' }`.

4. **Document type guard**: after `fromUuid`, if `source.documentName` exists
   and is not `'Item'`, throw an error
   `"Cannot add non-Item document (${source.documentName}) as a crafting component"`.

Also add a private helper `_findExistingBySourceChain(system, uuid)` that
encapsulates the matching logic for both exact and source-ID match. Returns
`{ item, matchType: 'exact'|'source' }` or `null`.

---

### Step 4: Update `addItemsFromPack` to track `updated` count (CraftingSystemManager.js)

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingSystemManager.js`

Change return type to `{ added, updated, skipped, total }`:

- Delegate to `addItemFromUuid` for each item (it now returns `{ item, action }`).
- Increment `added`, `updated`, or `skipped` based on `action`.
- Remove the inline deduplication check (it is now inside `addItemFromUuid`).

---

### Step 5: Update callers of `addItemFromUuid` that use the return value

Three callers access the return value of `addItemFromUuid`:

#### 5a: `SvelteRecipeManagerApp.svelte.js` (line 137)

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/SvelteRecipeManagerApp.svelte.js`

Current code does not use the return value (just awaits). No change needed for
the return value, but add entity type guard and folder expansion (see Step 5c).

#### 5b: `RecipeEditorApp.js` (line 842)

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/RecipeEditorApp.js`

Current code:
```js
const systemItem = await game.fabricate.getCraftingSystemManager().addItemFromUuid(...);
return systemItem?.id || null;
```

Must change to:
```js
const result = await game.fabricate.getCraftingSystemManager().addItemFromUuid(...);
return result?.item?.id || null;
```

#### 5c: `RecipeManagerApp.js` (line 305)

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/RecipeManagerApp.js`

Current code does not use the return value (just awaits). No change needed.

#### 5d: `onDropItem` in SvelteRecipeManagerApp -- entity type guard and folder expansion

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/SvelteRecipeManagerApp.svelte.js`

1. **Import** `resolveDropData` from dropUtils.js (keep existing `resolveDropUuid` import
   if still used elsewhere, or replace).

2. **Add entity type guard** at the top of `onDropItem`:
   - Use `resolveDropData(data)` to get `{ uuid, type }`.
   - If `type === 'Folder'`: handle folder expansion (see below).
   - If `type === 'Compendium'` and no uuid: existing bulk import path (no change).
   - If `type` is not `'Item'` and not null/undefined: show warning notification
     using `FABRICATE.Admin.Items.DropNotAnItem` with `{ type }` and return early.
   - Otherwise: proceed with single-item import as before.

3. **Folder expansion branch**:
   - Get the folder via `game.folders.get(data.id)` (Foundry API).
   - Filter `folder.contents` to Item documents only (check `documentName === 'Item'`
     or check `folder.type === 'Item'` which is the Foundry v13 convention).
   - If no Items, show info notification using `FABRICATE.Admin.Items.FolderEmpty`.
   - Otherwise, iterate and call `systemManager.addItemFromUuid(systemId, item.uuid)`
     for each.
   - Show summary notification using `FABRICATE.Admin.Items.FolderImportSummary`.

4. **Updated notification for single-item overwrite**:
   - `addItemFromUuid` now returns `{ item, action }`.
   - If `action === 'updated'`, show info notification using
     `FABRICATE.Admin.Items.ItemUpdated`.

5. **Updated notification for bulk pack import**:
   - Use new `BulkImportUpdated` i18n key with `{ added, updated, skipped, total }`.

---

### Step 6: Write tests (tests/compendium-drop.test.js)

**File:** `/home/matthew/WebstormProjects/fabricate-v2/tests/compendium-drop.test.js`

Add the following new test cases (append to existing file):

#### Defect 1 tests (source-ID-aware overwrite):

1. `addItemFromUuid -- exact duplicate returns { item, action: 'skipped' }`
   - System has item with `sourceUuid: "Compendium.world.pack.item-a"`.
   - Drop same UUID.
   - Assert: result.action is `'skipped'`, result.item is the existing item, no duplicates.

2. `addItemFromUuid -- new item returns { item, action: 'added' }`
   - System is empty.
   - Drop a UUID with mock `fromUuid` returning name/img.
   - Assert: result.action is `'added'`, result.item has correct name/img/sourceUuid.

3. `addItemFromUuid -- overwrites when dropped UUID matches existing sourceUuid (source-chain match)`
   - System has item with `sourceUuid: "Compendium.world.pack.item-a"`, id: `"comp-1"`.
   - Mock `fromUuid` for same UUID returns updated name/img.
   - Note: this is the exact-match path so it should skip, not overwrite. Test verifies
     the exact-match takes priority.

4. `addItemFromUuid -- overwrites when existing item's sourceUuid references dropped UUID via fallbackItemIds`
   - System has item with `sourceUuid: "Item.world-123"`, `fallbackItemIds: ["Compendium.world.pack.item-a"]`.
   - Drop `"Compendium.world.pack.item-a"`.
   - Mock `fromUuid` returns updated name/img.
   - Assert: same component id retained, name/img updated, old sourceUuid pushed to
     fallbackItemIds, result.action is `'updated'`.

5. `addItemFromUuid -- fallbackItemIds accumulates without duplicates`
   - Start with item having fallbackItemIds `["old-uuid-1"]`.
   - Trigger source-chain overwrite that pushes `sourceUuid` to fallbackItemIds.
   - Assert: fallbackItemIds contains both old and new entries, no duplicates.

6. `addItemsFromPack -- returns { added, updated, skipped, total }`
   - System has one item matching a pack entry by exact sourceUuid.
   - Pack has 3 items.
   - Assert: result has all four fields, `updated` field exists.

7. `addItemFromUuid -- rejects non-Item document type`
   - Mock `fromUuid` returns `{ documentName: 'Actor', name: 'Bob' }`.
   - Assert: throws error containing "non-Item" or "Actor".

#### Defect 2 tests (entity type handling):

8. `resolveDropData -- Item type returns uuid and type`
   - Input: `{ type: 'Item', uuid: 'Item.abc123' }`.
   - Assert: `{ uuid: 'Item.abc123', type: 'Item' }`.

9. `resolveDropData -- Actor type returns uuid and type`
   - Input: `{ type: 'Actor', uuid: 'Actor.123' }`.
   - Assert: `{ uuid: 'Actor.123', type: 'Actor' }`.

10. `resolveDropData -- Folder type returns folderId and folderDocumentType`
    - Input: `{ type: 'Folder', id: 'folder1', documentType: 'Item' }`.
    - Assert: includes `folderId: 'folder1'`, `type: 'Folder'`.

11. `resolveDropData -- null input returns nulls`
    - Assert: `{ uuid: null, type: null }`.

12. `onDropItem integration -- Actor drop shows warning and does not call addItemFromUuid`
    - Build mock onDropItem with type checking.
    - Pass `{ type: 'Actor', uuid: 'Actor.123' }`.
    - Assert: warn called with DropNotAnItem key, addItemFromUuid not called.

13. `onDropItem integration -- Folder with Items imports each`
    - Mock `game.folders.get` returning folder with 2 Item contents.
    - Assert: addItemFromUuid called twice, info notification shown.

14. `onDropItem integration -- Folder with no Items shows info notification`
    - Mock empty folder.
    - Assert: info notification shown, addItemFromUuid not called.

#### Update existing tests:

15. Update existing `addItemsFromPack` tests to account for new return shape
    (add `updated: 0` to expected results where applicable).

---

## Risk Mitigation

- `resolveDropUuid` is kept unchanged; new `resolveDropData` is additive. No
  existing code breaks.

- `addItemFromUuid` return type changes from bare item to `{ item, action }`.
  This is a breaking internal API change. All call sites have been audited:
  - `SvelteRecipeManagerApp.svelte.js:137` -- does not use return value (safe)
  - `RecipeManagerApp.js:305` -- does not use return value (safe)
  - `RecipeEditorApp.js:842` -- uses `systemItem?.id`, must change to `result?.item?.id`
  - `addItemsFromPack` internal call -- updated in Step 4
  - `tests/recipe-editor-accordion.test.js:92` -- mock returns `null`, callers
    use `?.id` so `null?.item?.id` is still safe via optional chaining

- `addItemsFromPack` return type gains `updated` field. Existing callers
  destructure `{ added, skipped, total }` -- adding `updated` is additive.

- Existing tests for `addItemsFromPack` assert on `result.added`, `result.skipped`,
  `result.total`. These values should not change for existing test scenarios since
  exact-match items are still `'skipped'`. But tests must be verified.

## Files Modified (Summary)

| File | Change |
|------|--------|
| `lang/en.json` | 5 new i18n keys |
| `src/ui/svelte/util/dropUtils.js` | Add `resolveDropData` export |
| `src/systems/CraftingSystemManager.js` | `addItemFromUuid` overwrite + type guard; `addItemsFromPack` updated return; `_findExistingBySourceChain` helper |
| `src/ui/SvelteRecipeManagerApp.svelte.js` | Entity type guard, folder expansion, updated notifications |
| `src/ui/RecipeEditorApp.js` | Update `addItemFromUuid` return value access (line 842-843) |
| `tests/compendium-drop.test.js` | 14 new test cases + updates to existing tests |

## Execution Order

1. i18n keys in `lang/en.json` (no risk, no dependencies)
2. `resolveDropData` in `dropUtils.js` (additive, no breakage)
3. `_findExistingBySourceChain` helper in `CraftingSystemManager.js`
4. `addItemFromUuid` rewrite with overwrite logic + type guard + new return shape
5. `addItemsFromPack` updated to use new return shape
6. `RecipeEditorApp.js` line 842 -- update return value access
7. `SvelteRecipeManagerApp.svelte.js` -- entity type guard, folder expansion, notifications
8. Tests -- write all new test cases, update existing ones
9. `npm test` -- verify all pass
10. `npm run build` -- verify clean build

## Verification

- `npm test` -- all existing + new tests pass (target: 0 failures)
- `npm run build` -- clean build, no errors
- Manual smoke test (if Foundry available): drop Actor, drop Folder, drop
  compendium item that already exists as world item, drop JournalEntry
