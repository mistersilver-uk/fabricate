---
layout: default
title: Alchemy Mode
parent: Recipes
nav_order: 6
---

# Alchemy Mode

Alchemy mode turns recipe crafting into a discovery game. Players cannot see recipe names or ingredient lists up front. Instead, an integration or macro submits selected items to the alchemy engine. If the combination matches a recipe, the craft succeeds. If it does not match, the items may be silently consumed.

Use alchemy mode for systems where recipes are secrets — a witch's grimoire, an experimental alchemist's bench, or any scenario where players are meant to experiment rather than follow a known formula.

---

## Current API Surface

Alchemy systems can be authored today in the GM **Manage Crafting Systems** app. The player-facing Alchemy tab in the unified Fabricate window is a planned UI surface; current play use is through macros or integrations that call the crafting engine.

Use `game.fabricate.getCraftingEngine().craftAlchemy(...)` to submit a discovered combination:

```javascript
Hooks.once('fabricate.ready', async () => {
  const actor = game.user.character;
  const sourceActors = [actor];
  const submittedItems = [
    actor.items.getName('Nightshade'),
    actor.items.getName('Moonwater')
  ].filter(Boolean);

  const result = await game.fabricate.getCraftingEngine().craftAlchemy(
    actor,
    sourceActors,
    submittedItems,
    { craftingSystemId: 'my-alchemy-system-id' }
  );

  if (!result.success) {
    ui.notifications.warn(game.i18n.localize(result.message) || result.message);
  }
});
```

`submittedItems` should be real Foundry Item documents, or item-like objects that at least include a `uuid` and `name`. Fabricate uses those references to match component signatures and consume submitted inventory when configured to do so.

## Planned Alchemy UI

The planned player Alchemy tab will provide:

- a system selector for worlds with more than one alchemy system
- a component palette showing available inventory
- a workbench for staging submitted components
- discovered recipe recall when `learnOnCraft` is enabled
- auto-fill for already-discovered recipes
- attempt feedback and failed-combination handling

Until that UI lands, treat this page as API and authoring documentation rather than player workflow documentation.

---

## How It Works

1. The GM creates a crafting system and sets its **Resolution Mode** to `alchemy`.
2. A macro or integration calls `game.fabricate.getCraftingEngine().craftAlchemy(...)` with the crafting actor, source actors, submitted items, and alchemy system ID.
3. Fabricate matches the submitted components against all enabled recipes in the system.
4. If a matching recipe is found, the normal crafting flow runs (ingredients consumed, results created).
5. If no recipe matches, the attempt ends. Depending on system configuration, the submitted items may or may not be consumed.

---

## Signature Matching

Fabricate identifies a recipe match by comparing the staged components against the **component signatures** of each recipe in the system. A signature is the set of components that satisfy a recipe's ingredient groups.

- Each ingredient group must be satisfied by at least one staged component whose source-reference chain overlaps a component in that group.
- Fabricate checks the staged item's live UUID, canonical source UUID, and the component's `sourceUuid`, `sourceItemUuid`, and `fallbackItemIds`.
- If all groups in an ingredient set are satisfied, the recipe is considered a match and crafting proceeds using that ingredient set.
- Recipes are checked in order; the first match is used.

{: .note }
> Alchemy matching is not limited to a single UUID field. A component can still match when its live `sourceUuid` changed, as long as the staged item overlaps the component's canonical `sourceItemUuid` or any recorded fallback UUID.

---

## Consume on Fail

By default, when no recipe matches, Fabricate removes the submitted items from the component source actors. You can change this by setting `system.alchemy.consumeOnFail` to `false`.

| `consumeOnFail` value | Behaviour on no-match |
|:----------------------|:----------------------|
| `true` (default) | Submitted items are deleted from actor inventory |
| `false` | Submitted items are left intact; no items are consumed |

To configure via the API:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  // Disable consume-on-fail for an alchemy system
  await mgr.updateSystem('my-alchemy-system-id', {
    alchemy: { consumeOnFail: false }
  });
});
```

---

## Learn on Craft

When `system.alchemy.learnOnCraft` is `true`, a player who successfully discovers a recipe has that recipe added to their learned-recipes flag. API consumers can read that learned state through the visibility service; the planned Alchemy UI will use it to show discovered recipes and help players reproduce known combinations.

| `learnOnCraft` value | Behaviour on success |
|:---------------------|:---------------------|
| `false` (default) | Every attempt is anonymous; players never see recipe names |
| `true` | Discovered recipes are written to `actor.flags.fabricate.learnedRecipes`; integrations and the planned UI can surface them in future sessions |

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('my-alchemy-system-id', {
    alchemy: { learnOnCraft: true }
  });
});
```

---

## Setting Up an Alchemy System

### In the GM Admin Panel

1. Open **Manage Crafting Systems** from the Items sidebar.
2. Click **Create System** and give it a name (e.g. "Witch's Alchemy").
3. In the **System Settings** card, set **Resolution Mode** to `alchemy`.
4. Add your managed components (ingredients) in the **Components** tab using drag-and-drop from the Items sidebar.
5. Create recipes in the normal recipe editor. Ingredient sets define the hidden signatures that players must discover by experiment. Result groups define what is produced on a successful match.
6. Enable each recipe. Disabled recipes are never matched.

{: .warning }
> Changing the resolution mode on an existing system that has recipes will delete those recipes, because their configuration may be incompatible with the new mode. You will be asked to confirm.

### Configuring the alchemy sub-object via API

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('my-alchemy-system-id', {
    alchemy: {
      consumeOnFail: true,   // consume items when no recipe matches
      learnOnCraft: true     // write discovered recipes to actor flags
    }
  });
});
```

---

## Visibility Rules

In alchemy mode, recipe visibility follows special rules regardless of the system's `recipeVisibility.listMode`:

| Viewer | Visibility result |
|:-------|:---------------------------------------|
| GM | All recipes visible (for authoring and debugging) |
| Player (`learnOnCraft: false`) | No recipes visible |
| Player (`learnOnCraft: true`, recipe not yet discovered) | Recipe not visible |
| Player (`learnOnCraft: true`, recipe previously discovered) | Recipe visible to API consumers and planned discovered-recipe UI |

---

## Data Persistence

Fabricate registers a client setting for the planned Alchemy tab:

| Setting key | Scope | Description |
|:------------|:------|:------------|
| `fabricate.lastAlchemySystem` | Client | ID of the last alchemy system selected by the planned Alchemy UI |

---

## What's Next?

- [Simple Mode]({% link recipes/simple.md %}) — standard A + B = C crafting without hidden signatures
- [Visibility & Knowledge]({% link visibility.md %}) — the full recipe knowledge system (learn by item, learn by flag)
- [Crafting Systems]({% link crafting-systems.md %}) — all system-level settings and feature toggles
