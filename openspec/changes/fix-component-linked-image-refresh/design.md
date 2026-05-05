# Design

## Owner

Canonical behavior belongs in `openspec/specs/data-models/spec.md` under `Component`, because the stored component name, image, and description are part of the component data model and the UI renders those stored fields.

## Approach

Add a small method on `CraftingSystemManager` that accepts an updated Item-like document and update data:

- Return early unless the update payload contains `name`, `img`, or a description path.
- Resolve the item's reference chain with `getItemSourceReferences(item)`, which includes the live UUID and canonical source UUID.
- Iterate all systems and components, using `getComponentSourceReferences(component)` to match against the item references.
- Update only component `name` values that differ from the new item name.
- Update only component `img` values that differ from the new item image.
- Update only component `description` values that differ from the normalized plain-text source item description.
- Save once after all matching components are updated.
- Call `_notifySystemsChanged()` after saving so open UI surfaces and directory integrations can refresh.

Register this method from `src/main.js` on Foundry's `updateItem` hook after Fabricate initialization. Foundry update hooks pass `(document, changes, options, userId)`; only `document` and `changes` are needed.

## Test Seams

Unit coverage should exercise `CraftingSystemManager.refreshComponentMetadataForUpdatedItem(...)` directly so tests do not need Foundry's hook runtime:

- direct `Item.<id>` UUID match updates `name` and saves once
- direct `Item.<id>` UUID match updates `img` and saves once
- canonical source metadata match updates `img`
- direct `Item.<id>` UUID match updates normalized description text
- canonical source metadata match can clear description text
- absent `name`, `img`, or description paths in changes is a no-op
- unchanged metadata is a no-op

Hook registration should stay thin in `main.js`; existing contract tests can validate source presence if needed, but behavior belongs in manager tests.

## Affected Files

- `openspec/specs/data-models/spec.md`
- `src/systems/CraftingSystemManager.js`
- `src/main.js`
- `tests/compendium-drop.test.js` or a focused manager test file
- `docs/crafting-systems.md`

## Verification

- `node --test tests/compendium-drop.test.js`
- `npm test`
- `npm run build`
