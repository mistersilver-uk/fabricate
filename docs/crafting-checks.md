---
layout: default
title: Crafting Checks
nav_order: 3.1
---

# Crafting Checks

Crafting checks let you gate recipe outcomes on a player roll. When a crafting system uses routed mode with the `macroOutcome` provider, or progressive resolution mode, a check is required to determine which result the crafter receives. Configure the check at the system level — each attempt runs the check automatically, before any materials are consumed.

---

## Check Source

Fabricate supports two ways to execute a crafting check, controlled by `craftingCheck.checkSource`:

| Value | Description |
|:------|:------------|
| `"macro"` (default) | You write a JavaScript macro that rolls dice and returns a result object. Full control over any game system or custom dice mechanic. |
| `"builtIn"` | Fabricate rolls using the current game system's built-in dice API. No macro required — configure the check using UI fields instead. |

Existing systems that use `macroUuid` are unaffected. `checkSource` defaults to `"macro"` when not specified.

---

## Built-In Check Mode

When `checkSource` is `"builtIn"`, Fabricate uses a game-system adapter to execute the roll automatically. You configure the check through four fields instead of writing a macro.

### Supported Game Systems

| Game System | Adapter |
|:------------|:--------|
| D&D 5th Edition (`dnd5e`) | Built in. Supports ability checks and skill checks. |
| Other systems | Not yet supported. Switch to macro mode or [register a custom adapter](#registering-a-custom-adapter). |

When no adapter is available for the current game system, crafting fails with a clear error message and nothing is consumed.

### Configuration Fields

Configure the built-in check using the `craftingCheck.builtIn` sub-object:

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `ability` | `string` | `""` | The ability score key to roll (e.g. `"int"`, `"wis"`). Required unless `skill` is set. |
| `skill` | `string` | `""` | The skill key to roll (e.g. `"arc"`, `"nat"`). When set, Fabricate calls `actor.rollSkill()` instead of `actor.rollAbilityCheck()`. |
| `dc` | `number` | `15` | The difficulty class. The roll must meet or exceed this value to succeed. Must be a positive integer; invalid values fall back to `15`. |
| `advantage` | `string` | `"normal"` | Roll advantage state. Accepts `"advantage"`, `"disadvantage"`, or `"normal"`. |

When both `ability` and `skill` are set, `skill` takes precedence and Fabricate calls `actor.rollSkill()`.

### D&D 5e Ability Keys

| Key | Ability |
|:----|:--------|
| `str` | Strength |
| `dex` | Dexterity |
| `con` | Constitution |
| `int` | Intelligence |
| `wis` | Wisdom |
| `cha` | Charisma |

### D&D 5e Skill Keys

| Key | Skill |
|:----|:------|
| `acr` | Acrobatics |
| `ani` | Animal Handling |
| `arc` | Arcana |
| `ath` | Athletics |
| `dec` | Deception |
| `his` | History |
| `ins` | Insight |
| `itm` | Intimidation |
| `inv` | Investigation |
| `med` | Medicine |
| `nat` | Nature |
| `prc` | Perception |
| `prf` | Performance |
| `per` | Persuasion |
| `rel` | Religion |
| `slt` | Sleight of Hand |
| `ste` | Stealth |
| `sur` | Survival |

### Example: D&D 5e Arcana Check

This configures an alchemy system using the `macroOutcome` provider that requires an Intelligence (Arcana) check against DC 15 to determine the result:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    craftingCheck: {
      checkSource: 'builtIn',
      builtIn: {
        ability: 'int',
        skill: 'arc',
        dc: 15,
        advantage: 'normal'
      }
    }
  });
});
```

### Example: Strength Check with Advantage

A blacksmithing system that rewards careful setup by awarding advantage on the check:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('blacksmithing-system-id', {
    craftingCheck: {
      checkSource: 'builtIn',
      builtIn: {
        ability: 'str',
        skill: '',
        dc: 12,
        advantage: 'advantage'
      }
    }
  });
});
```

---

## Macro Check Mode

If your system uses routed mode with the `macroOutcome` provider, or progressive mode, and you need custom dice logic — for example a pool roll, a contested check, or a game system Fabricate does not yet have a built-in adapter for — use `checkSource: "macro"` (the default):

| Setting | Description |
|:--------|:------------|
| `enabled` | Whether crafting checks are active |
| `macroUuid` | UUID of the macro that performs the check |
| `successMacroUuid` | Optional macro called after a successful step |
| `failureMacroUuid` | Optional macro called after a failed step |

See [Macros]({% link macros/index.md %}) for the check macro contract.

---

## Consumption on Failure

When a crafting check fails, Fabricate can still consume some or all of the required materials — representing a failed attempt that uses up resources. You configure this per crafting system under `craftingCheck.consumption`.

| Setting | Data path | Default | Description |
|:--------|:----------|:--------|:------------|
| `consumeIngredientsOnFail` | `system.craftingCheck.consumption.consumeIngredientsOnFail` | `true` | Remove ingredients from the actor's inventory even when the check fails |
| `consumeCatalystsOnFail` | `system.craftingCheck.consumption.consumeCatalystsOnFail` | `false` | Increment catalyst usage (and possibly destroy the catalyst) even when the check fails |

**When this applies.** These settings only take effect when a crafting check runs (whether built-in or macro) and that check returns a failure. They do not affect other failure paths such as missing ingredients, missing catalysts, or an invalid recipe configuration — in those cases nothing is ever consumed.

**Example: punishing failure.** An Alchemy system where botched potions destroy materials but spare the alchemist's mortar and pestle:

```javascript
// Both defaults match this scenario — no explicit configuration needed.
// system.craftingCheck.consumption = {
//   consumeIngredientsOnFail: true,   // herbs are used up
//   consumeCatalystsOnFail: false     // mortar and pestle survive
// }
```

**Example: forgiving failure.** A Cooking system where a failed roll is just practice — nothing is lost:

```javascript
// system.craftingCheck.consumption = {
//   consumeIngredientsOnFail: false,
//   consumeCatalystsOnFail: false
// }
```

**Example: high-stakes ritual.** A system where both reagents and the ritual focus are consumed regardless of outcome:

```javascript
// system.craftingCheck.consumption = {
//   consumeIngredientsOnFail: true,
//   consumeCatalystsOnFail: true
// }
```

---

## Registering a Custom Adapter

If you are running a game system other than D&D 5e and want to use built-in check mode, you can register your own adapter. The adapter must extend `CraftingCheckAdapter` and implement `getAbilities()`, `getSkills()`, and `executeCheck()`.

```javascript
Hooks.once('fabricate.ready', () => {
  const { CraftingCheckAdapter, CraftingCheckAdapterRegistry } =
    game.fabricate.getAdapterClasses();

  class Pf2eCraftingCheckAdapter extends CraftingCheckAdapter {
    constructor() { super('pf2e'); }

    getAbilities() {
      return [
        { key: 'str', label: 'Strength' },
        { key: 'dex', label: 'Dexterity' },
        // ... etc.
      ];
    }

    getSkills() {
      return [
        { key: 'cra', label: 'Crafting' },
        // ... etc.
      ];
    }

    async executeCheck(actor, config) {
      const { ability, skill, dc, advantage } = config;
      // Use the PF2e API to roll, then return:
      return {
        success: rollTotal >= dc,
        outcome: rollTotal >= dc ? 'pass' : 'fail',
        value: rollTotal,
        data: { /* raw roll data */ }
      };
    }
  }

  CraftingCheckAdapterRegistry.register('pf2e', Pf2eCraftingCheckAdapter);
});
```

The `executeCheck()` return shape:

| Field | Type | Description |
|:------|:-----|:------------|
| `success` | `boolean` | Whether the check passed |
| `outcome` | `string \| null` | Named outcome label matched case-insensitively to a result group name (routed `macroOutcome` provider) |
| `value` | `number \| null` | Numeric roll total, used by progressive mode to award results by difficulty |
| `data` | `object` | Arbitrary extra data passed through to success/failure macros |

<!-- TODO: verify whether game.fabricate.getAdapterClasses() is the correct access pattern — confirm with MisterPotts -->

---

## What's next?

- [Crafting Systems]({% link crafting-systems.md %}) -- configure resolution mode, feature toggles, and system-level settings.
- [Salvage]({% link salvage.md %}) -- configure salvage checks, which use a separate check pipeline to gate salvage outcomes.
- [Macros]({% link macros/index.md %}) -- write check macros and hook into success and failure callbacks.
- [Recipes]({% link recipes/index.md %}) -- understand routed and progressive resolution modes that require a crafting check.
