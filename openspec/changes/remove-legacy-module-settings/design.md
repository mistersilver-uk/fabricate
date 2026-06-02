# Remove Legacy Module Settings Design

## Settings Boundary

This change only affects settings registered with `config: true`, meaning settings visible in Foundry's module configuration UI.

Hidden settings remain registered because they are Fabricate's persistence layer for recipes, crafting systems, gathering configuration, actor selections, favourites, recents, progressive ordering, and migrations.

## Runtime Behavior

The `enabled` setting is unused and can be removed without behavior changes.

The simple-recipes-only setting currently filters player-visible recipes in the crafting store. Removing it means the crafting app always shows all visible recipes subject to the app's normal search, category, availability, and favourites filters.

The auto-confirm bypass setting currently skips confirmation dialogs for crafting and salvage. Removing it means confirmations are the default user flow. Existing internal flows may continue passing `skipConfirm` where the store already supports it.

## Experimental Setting

Register `fabricate.experimentalFeatures` as a visible world Boolean setting with a default of `false`.
No code should branch on it in this change; it exists for future use only.
