---
layout: default
title: Starter Content Pack
nav_order: 2.5
---

# Starter Content Pack

Fabricate ships with a ready-to-use alchemy crafting system called **Alchemist's Supplies**. It gives you 14 forageable ingredients, 17 recipes across three categories, and a built-in Intelligence DC 12 crafting check — everything you need to run alchemy sessions out of the box, with no manual data entry required.

---

## Where the starter content lives

The starter pack is bundled with the module in two places:

- **Compendium pack** — registered in `module.json` as `fabricate.alchemists-supplies`. It contains the ingredient and product items referenced by all recipes.
- **JSON data file** — `modules/fabricate/packs/starter-alchemists-supplies.json`. The import helper reads this file to create the crafting system and recipes in your world.

You do not need to interact with these files directly. The import function handles everything.

---

## How to import the starter pack

Call `game.fabricate.importStarterPack()` from a Foundry **Script Macro** or from the browser console. You only need to do this once per world.

```javascript
// Run inside a Foundry Script Macro, or from the browser console (F12)
// Must be called after the "fabricate.ready" hook has fired.

Hooks.once("fabricate.ready", async () => {
  const result = await game.fabricate.importStarterPack();
  console.log(`Imported "${result.system.name}" with ${result.recipes.length} recipes.`);
});
```

If Fabricate is already ready (for example, you are running the macro interactively), you can call it directly:

```javascript
const result = await game.fabricate.importStarterPack();
console.log(`Imported "${result.system.name}" with ${result.recipes.length} recipes.`);
```

The function shows one summary notification and returns an object with three properties:

| Property | Type | Description |
|:---------|:-----|:------------|
| `system` | `object` | The newly created crafting system |
| `recipes` | `object[]` | Array of the 17 created recipes |
| `macroTemplates` | `object` | Crafting check macro templates (see below) |

After import, open **Manage Crafting Systems** in the Items sidebar to see the Alchemist's Supplies system and all its recipes.

---

## What's included

### Crafting system settings

| Setting | Value |
|:--------|:------|
| Resolution mode | Simple |
| Crafting check | Intelligence ability test, DC 12 |
| Ingredients consumed on failure | Yes |
| Catalysts degraded on failure | No |
| Features | Essences, Recipe Categories, Item Tags, Crafting Checks, Chat Output |

### Essence definitions

Six elemental essences are defined. Each ingredient carries one or two of these essence values, and each recipe requires a specific combination.

| Essence | Description |
|:--------|:------------|
| Earth | Extracted from minerals and hardy plants |
| Water | Extracted from aquatic flora and fungi |
| Air | Extracted from light, wind-carried materials |
| Fire | Extracted from heat-producing organisms |
| Positive | Rare energy essence from radiant sources |
| Negative | Rare energy essence from shadow sources |

### Ingredients

There are 14 forageable ingredients split into common (single essence) and special (double essence or rare essence) tiers.

**Common ingredients** (6 items, each carrying 1 essence point of a single type):

| Ingredient | Essence |
|:-----------|:--------|
| Rockvine | Earth 1 |
| Amanita Cap | Water 1 |
| Fennel Silk | Air 1 |
| Lightningbug Thorax | Fire 1 |
| Frozen Seedlings | Earth 1, Water 1 |
| Blue Toadshade | Water 1, Air 1 |
| Luminous Cap Dust | Air 1, Fire 1 |
| Wrackwort Bulbs | Fire 1, Earth 1 |

**Special ingredients** (6 items, each carrying 2 essence points or a rare essence):

| Ingredient | Essence |
|:-----------|:--------|
| Radiant Synthseed | Positive 1 |
| Voidroot | Negative 1 |
| Ironwood Heart | Earth 2 |
| Hydrathistle | Water 2 |
| Wisp Stalks | Air 2 |
| Drakus Flower | Fire 2 |

### Recipes

All 17 recipes use **essence-based matching**: you combine any ingredients whose essences add up to the required totals — you are not locked in to specific items. Every recipe is enabled and craftable immediately after import.

**Potions** (3 recipes)

| Recipe | Essences Required |
|:-------|:-----------------|
| Gashglue | Water 2, Earth 1 |
| Melt Powder | Earth 1, Fire 2 |
| Zaebelle's Torpor | Water 1, Negative 2 |

**Bombs** (6 recipes)

| Recipe | Essences Required |
|:-------|:-----------------|
| Alchemist's Fire | Fire 2, Earth 1, Water 1, Positive 1 |
| Alchemist's Frost | Water 2, Air 2, Positive 1 |
| Alchemist's Spark | Air 4, Negative 1 |
| Flash Pellet | Fire 2, Positive 1 |
| Noxious Smokestick | Air 2, Fire 2, Negative 1 |
| Night Eyes | Water 1, Fire 1, Negative 1 |

**Tools** (8 recipes)

| Recipe | Essences Required |
|:-------|:-----------------|
| Breath Bottle | Air 3 |
| Dust of Dryness | Earth 3, Negative 2 |
| Firesnuff | Fire 1, Negative 1 |
| Instant Rope | Earth 2, Water 2, Negative 1 |
| Smokestick | Air 2, Fire 1 |
| Snappowder | Earth 2, Positive 1 |
| Tanglefoot Bag | Earth 2, Water 2 |
| Titan Gum | Earth 2, Water 1, Positive 1 |

---

## Crafting check macro templates

The starter pack includes two pre-written macro templates for the Intelligence crafting check. You access them from the object returned by `importStarterPack()`:

```javascript
const result = await game.fabricate.importStarterPack();

// D&D 5e template
console.log(result.macroTemplates.dnd5e);

// Generic (system-agnostic) template
console.log(result.macroTemplates.generic);
```

Copy the printed string and paste it into a new Foundry **Script Macro**, then set your crafting system's check source to **Macro** and point it at that macro.

### D&D 5e template

Rolls an Intelligence ability test using the dnd5e system API. Returns `{ pass, total, dc }` for Fabricate to evaluate.

```javascript
// D&D 5e Alchemist's Supplies Crafting Check
// Paste this into a Foundry script macro.
// Rolls an Intelligence check with Alchemist's Supplies proficiency.
// Returns { pass: boolean, total: number, dc: number } for Fabricate.
const actor = token?.actor ?? game.user.character;
if (!actor) { ui.notifications.warn("Select a token or assign a character."); return { pass: false }; }
const dc = args?.dc ?? 12;
const roll = await actor.rollAbilityTest("int", { chatMessage: true });
return { pass: roll.total >= dc, total: roll.total, dc };
```

### Generic (system-agnostic) template

Uses `new Roll("1d20 + @mod")` and works with any Foundry game system. Swap `"int"` for whichever ability your system uses and set `mod` accordingly.

```javascript
// System-Agnostic Crafting Check (Fallback)
// Paste this into a Foundry script macro.
// Rolls 1d20 + a configurable modifier against a DC.
// Returns { pass: boolean, total: number, dc: number } for Fabricate.
const actor = token?.actor ?? game.user.character;
if (!actor) { ui.notifications.warn("Select a token or assign a character."); return { pass: false }; }
const dc = args?.dc ?? 12;
const mod = args?.mod ?? 0;
const roll = await new Roll("1d20 + @mod", { mod }).evaluate({ async: true });
roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Crafting Check" });
return { pass: roll.total >= dc, total: roll.total, dc };
```

---

## Adapting the templates for your game system

Both templates receive two optional arguments from Fabricate via the `args` object:

| Argument | Default | Description |
|:---------|:--------|:------------|
| `args.dc` | `12` | The difficulty class set on the crafting system |
| `args.mod` | `0` | (Generic template only) Modifier added to the d20 roll |

### Changing the ability

For the dnd5e template, replace `"int"` with any dnd5e ability key:

| Ability | Key |
|:--------|:----|
| Strength | `"str"` |
| Dexterity | `"dex"` |
| Constitution | `"con"` |
| Intelligence | `"int"` |
| Wisdom | `"wis"` |
| Charisma | `"cha"` |

For example, to use a Wisdom check instead:

```javascript
const roll = await actor.rollAbilityTest("wis", { chatMessage: true });
```

### Changing the DC formula

The DC passed via `args.dc` comes from the system configuration. To override it locally inside the macro:

```javascript
const dc = 15; // hardcoded override, ignores system config
```

Or keep `args?.dc ?? 12` to use whatever the GM sets in the crafting system admin panel.

### Using a skill roll (dnd5e)

To require Arcana proficiency rather than a raw ability test, replace `rollAbilityTest` with `rollSkill`:

```javascript
const roll = await actor.rollSkill("arc", { chatMessage: true });
return { pass: roll.total >= dc, total: roll.total, dc };
```

Common dnd5e skill keys: `"arc"` (Arcana), `"nat"` (Nature), `"med"` (Medicine), `"sur"` (Survival).

### Using a custom roll expression (generic)

Replace the roll formula in the generic template to suit any system:

```javascript
// 2d6 + attribute modifier, common in some OSR systems
const roll = await new Roll("2d6 + @mod", { mod }).evaluate({ async: true });
```

Fabricate only reads the returned `{ pass, total, dc }` object — the roll formula itself is entirely up to you.

---

## What's next?

- [Essences]({% link essences.md %}) -- understand how essence-based matching works so you can adjust recipes
- [Crafting Systems]({% link crafting-systems.md %}) -- configure resolution modes, feature flags, and system settings
- [Crafting Checks]({% link crafting-checks.md %}) -- full reference for built-in and macro check modes
- [Macros & Examples]({% link macros/index.md %}) -- more ready-to-use macros for crafting workflows
