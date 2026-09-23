# UI Integration

## Purpose

Define Foundry UI integration points and user workflows for Fabricate.
This file is UI-only.
Domain behaviour is defined in:

- `resolution-modes/spec.md`
- `recipes-and-steps/spec.md`
- `recipe-visibility/spec.md`
- `destructive-changes-and-migrations/spec.md`
- `gathering-and-harvesting/spec.md`
- `companion-api/spec.md`

Global rule: if a system feature is disabled, controls for that feature are hidden.

## Integration Points

### Items Directory

Add header actions:

- `Crafting` for all users.
- `Gathering` for all users, but only when at least one crafting system has `features.gathering === true`.
- `Manage Crafting Systems` for GMs only.

`Gathering` opens a dedicated gathering app.
It must not reuse the crafting app shell or route.

The `Gathering` button is hidden when no crafting system exposes gathering.

### Compendium Directory

Provide GM action to import all items from a compendium into a crafting system.
The action is a GM-only entry in the Foundry Compendium Directory context menu, offered on an Item compendium pack (the right-clicked pack is the compendium to import from) and hidden for non-GMs and for non-Item packs.
Choosing it opens a target-system picker where the GM confirms which crafting system receives the items, so the import is a deliberate commit rather than a single-click action.
The action reuses the existing bulk-import primitive and its de-duplication and update/skip reporting rather than reimplementing them.
Items with the same UUID or registeredItemUuid are de-duplicated on import.
If an imported Item's recorded canonical source UUID no longer resolves,
Fabricate falls back to the live dropped Item UUID.
Single item and replace-source
operations warn with the affected item and UUIDs; folder and compendium pack
imports emit one summary warning with the affected count.

## Surface Map

This table is navigational, never normative.
Each row names a sibling spec and the sections that spec holds; the requirements themselves live in those files.

| Surface spec | Sections |
| --- | --- |
| `ui-visual-style/spec.md` | `Product UI Visual Style`, `Responsive Product UI` |
| `ui-manager-shell/spec.md` | `Manager Shell`, `Manager browse view-state` |
| `ui-system-studio/spec.md` | `Systems Tab`, `System Overview`, `Item Sheets`, `Items Tab`, `Essences Tab`, `Tools Tab`, `Recipes Tab`, `The On-failure section`, `Routed result-group authoring is policy-conditional`, `Books & Scrolls Surface`, `Access Surface`, `Knowledge Surface`, `Recipe Dependency Graph`, `Environments Tab`, `Gathering Event Library` |
| `ui-world-scope/spec.md` | `GM World Rules & Resources Route`, `GM World Scoped Entity Routes`, `GM World Vocabulary Route`, `GM World Component Screens`, `GM World Essence Screens`, `GM World Tool Screens`, `Scoped entity editor patterns`, `Scoped entity list shells`, `GM Travel Route`, `Canvas Interactables — Manage Interactables Panel (GM)` |
| `ui-entity-editors/spec.md` | `Recipe Editor`, `Component Studio`, `Step Editor` |
| `ui-crafting-app/spec.md` | `Crafting App (Player)` |
| `ui-gathering-app/spec.md` | `Gathering App (Player)` |
| `ui-journal-app/spec.md` | `Journal App (Player)` |
| `ui-extension-points/spec.md` | `Downtime Preview and Premium Extension`, `Player Navigation Extension` |

## Data Storage (UI-relevant)

All keys below use the literal `fabricate.*` namespace.

World settings:

- `fabricate.craftingSystems`
- `fabricate.recipes`
- `fabricate.gatheringEnvironments`
- `fabricate.gatheringConfig`
- `fabricate.gatheringParties`
- `fabricate.currencyConfig`
- `fabricate.migrationVersion`
- `fabricate.theme`
- `fabricate.experimentalFeatures`

Client settings:

- `fabricate.interactionPromptPosition`
- `fabricate.lastCraftingActor`
- `fabricate.lastGatheringActor`
- `fabricate.lastComponentSources`
- `fabricate.lastManagedCraftingSystem`
- `fabricate.managerRailCollapsed`
- `fabricate.lastAlchemySystem`
- `fabricate.favouriteRecipes`
- `fabricate.gatheringHideUnavailableEnvironments`

User settings (per user, per world):

- `fabricate.progressiveResultOrder` (scope `user`; an awaited, replicated document write, not a fire-and-forget local preference — issue #651)

Actor flags:

- `flags.fabricate.learnedRecipes`
- `flags.fabricate.craftingRuns`
- `flags.fabricate.salvageRuns` (`{ active, history }`, defined canonically in `recipes-and-steps`)
- `flags.fabricate.gatheringRuns`
- `flags.fabricate.discoveredGatheringRealms`

Item flags:

- `flags.fabricate.toolBroken` (the authoritative presence-gate disqualifier for a broken tool)
- `flags.fabricate.componentId`
- `flags.fabricate.roles`

Note: the crafting and salvage run containers are physically stored at the doubly-nested path `flags.fabricate.fabricate.<key>` while gathering is single-scoped; the uniform logical notation above is the contract.

## Compatibility

- Must remain system-agnostic.
- Currency adapters are optional.
- Visibility uses Foundry user IDs, ownership, and Fabricate flags/UUID identity rules.
