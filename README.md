![](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2Fmisterpotts%2Ffabricate%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
<!--- Downloads @ Latest Badge -->
![Latest Release Download Count](https://img.shields.io/github/downloads/misterpotts/fabricate/latest/total?sort=semver&style=for-the-badge)
![Total Release Download Count](https://img.shields.io/github/downloads/misterpotts/fabricate/total?label=total%20downloads&style=for-the-badge)
<!--- Social badges -->
[![Support me on Patreon](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Fshieldsio-patreon.vercel.app%2Fapi%3Fusername%3Dmisterpotts%26type%3Dpatrons&style=for-the-badge)](https://patreon.com/misterpotts)
[![Discord](https://dcbadge.limes.pink/api/server/APHyMzhPTk)](https://discord.gg/APHyMzhPTk)

<!--- Forge Bazaar Install % Badge -->
<!--- replace <your-module-name> with the `name` in your manifest -->
<!--- ![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Ffabricate&colorB=4aa94a) -->

![](/assets/img/fabricate-repo-preview.png)

# Fabricate - Universal Crafting System

A system-agnostic, flexible crafting module for Foundry Virtual Tabletop that supports any tabletop RPG system and any crafting system you can imagine.

## Features

- **Crafting Systems** — Define independent crafting systems, each with their own managed items, essences, and feature toggles.
- **Recipes** — Simple or multi-step recipes with ingredient sets, catalysts, and result groups.
- **Resolution Modes** — Simple, mapped, tiered, and progressive crafting modes.
- **Visibility and Knowledge** — Control which recipes players can see via player lists or knowledge-based discovery.
- **Essences** — Tag items with abstract essences for flexible ingredient matching.
- **Catalysts** — Non-consumable tools and workstations with optional usage tracking.
- **Active Effect Transfer** — Transfer effects from ingredients to crafted items.
- **Macro Integration** — Hook into success and failure outcomes with custom macros.
- **Time and Currency Requirements** — Optional time or currency costs per crafting system.
- **Salvage** — Break down managed items into components.

## Installation

1. In Foundry VTT, go to **Add-on Modules**
2. Click **Install Module**
3. Search for "Fabricate" or paste the manifest URL
4. Click **Install**
5. Enable the module in your world

## Quick Start

See [docs/quickstart.md](docs/quickstart.md) for a step-by-step guide.

## Documentation

Full API reference and user guides are available in the [docs site](docs/).

## API Reference

The module exposes `game.fabricate` after the `ready` hook. Constructors and data shapes are available via `game.fabricate.api`.

### Crafting Systems

```js
// List all crafting systems
const systems = game.fabricate.getCraftingSystemManager().getSystems();

// Create a crafting system (GM only)
const system = await game.fabricate.getCraftingSystemManager().createSystem({
  name: 'Blacksmithing',
  resolutionMode: 'simple', // 'simple' | 'mapped' | 'tiered' | 'progressive'
  features: {
    essences: false,
    multiStepRecipes: false,
    effectTransfer: false,
    salvage: false
  }
});
```

### Recipes

Recipes reference managed items by `componentId`:

```js
const recipe = new game.fabricate.api.Recipe({
  name: 'Iron Sword',
  craftingSystemId: system.id,
  ingredientSets: [
    {
      ingredients: [
        { componentId: 'iron-ingot-id', quantity: 2 },
        { componentId: 'wood-id', quantity: 1 }
      ],
      catalysts: [
        { componentId: 'anvil-id', degradesOnUse: false }
      ]
    }
  ],
  resultGroups: [
    {
      results: [
        { componentId: 'iron-sword-id', quantity: 1 }
      ]
    }
  ]
});

await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
```

### Crafting

```js
// Craft a recipe for an actor
const result = await game.fabricate.craft(actor, recipeId);

if (result.success) {
  console.log(`Crafting succeeded: ${result.message}`);
} else {
  console.log(`Crafting failed: ${result.message}`);
}

// With component source actors (e.g. a shared party loot actor)
const result = await game.fabricate.craft(actor, recipeId, {
  componentSourceActors: [actor, partyLootActor]
});
```

### Macro Helpers

The following are available as `globalThis.fabricate` for use in macros:

```js
fabricate.listRecipes();                        // List all recipes
fabricate.craft(game.user.character, 'id');     // Craft a recipe
fabricate.openRecipeManager();                  // Open GM recipe manager
fabricate.listCraftingSystems();                // List crafting systems
```

## Data Models

### Ingredient

```js
{ componentId: string, quantity: number }
```

### Catalyst

```js
{ componentId: string, degradesOnUse: boolean, maxUses: number|null, destroyWhenExhausted: boolean }
```

### Result

```js
{ componentId: string, quantity: number }
```

### Crafting System shape

```js
{
  id: string,
  name: string,
  resolutionMode: 'simple' | 'mapped' | 'tiered' | 'progressive',
  features: {
    essences: boolean,
    multiStepRecipes: boolean,
    effectTransfer: boolean,
    salvage: boolean,
    itemTags: boolean,
    recipeCategories: boolean,
    craftingChecks: boolean
  },
  recipeVisibility: {
    listMode: 'global' | 'player' | 'knowledge'
  }
}
```

## Development

```bash
npm install
npm test         # Run test suite
npm run build    # Vite build to /dist
```

### Live Foundry Smoke Test

Fabricate now includes a minimal end-to-end smoke harness against a real Foundry instance.

```bash
# 1) Install browser binary once
npm run test:foundry:install

# 2) Export Foundry credentials in your shell (do not commit credentials)
export FOUNDRY_USERNAME='your-foundry-account'
export FOUNDRY_PASSWORD='your-foundry-password'
# Optional: select a specific purchased license key
# export FOUNDRY_LICENSE_KEY='1'

# 3) Run end-to-end flow (up -> smoke run -> down)
npm run test:foundry
```

Available commands:

```bash
npm run test:foundry:up
npm run test:foundry:run
npm run test:foundry:down
```

`test:foundry:run` writes feedback artifacts to `test-results/`:

- `summary.json` (machine-readable pass/fail + error details)
- `console.log` (captured browser console + page errors)
- `screenshot-*.png` (key checkpoints and failure capture)

Notes:

- The smoke test handles first-run `/license` in-browser by checking "I agree" and clicking `AGREE`.
- In GitHub Actions ephemeral runners, store `FOUNDRY_USERNAME` and `FOUNDRY_PASSWORD` as repository secrets.
- If your Foundry setup requires different Docker env vars or image settings, update `docker-compose.foundry.yml`.

See [AGENTS.md](AGENTS.md) for contributor and agent guidelines.

## Support

- **Issues**: [GitHub Issues](https://github.com/misterpotts/fabricate/issues)

## License

Licensed under the **Fabricate Community License v1.0** (`LicenseRef-Fabricate-Community-1.0`).
Commercial use requires a separate commercial license. See `LICENSE`.

## Credits

Created by MisterPotts.
