# Specification 010: Module Settings

## Purpose

This spec defines the Module Configuration bounded context for Fabricate.
It establishes which settings live at the module level, their scope, defaults, and the pattern for adding new ones.

## Bounded Context Boundary

A **Module Setting** is a Foundry module-level configuration value registered via `game.settings.register` under the
`fabricate.*` namespace.

Module Settings are **not**:

- Part of any `CraftingSystem`'s data model or feature flags.
- Persisted to world documents (actors, items, scenes, journals).
- Scoped to a single crafting system.

Module Settings **are**:

- Registered once at module init in `src/config/settings.js`.
- Readable at runtime via `getSetting(key)` and writable via `setSetting(key, value)`.
- Either world-scoped (GM-controlled, shared) or client-scoped (per-user, not synced).

## Canonical Module Settings

### World-scoped Settings

World settings are readable by all clients but writable only by the GM.
They are used to persist data that applies to the whole world.

| Key | `config` | Type | Default | Purpose |
|-----|:---:|------|---------|---------|
| `craftingSystems` | `false` | `Array` | `[]` | All crafting system definitions |
| `recipes` | `false` | `Array` | `[]` | All recipe definitions |
| `enabled` | `true` | `Boolean` | `true` | Master on/off switch for the module |
| `migrationVersion` | `false` | `String` | `"0.0.0"` | Last completed migration checkpoint |
| `gatheringEnvironments` | `false` | `Array` | `[]` | All gathering environment definitions (specced; runtime pending) |

### Client-scoped Settings

Client settings are stored per-user and are not shared between clients.
They capture per-user preferences and transient session state.

| Key | `config` | Type | Default | Purpose |
|-----|:---:|------|---------|---------|
| `chatOutput` | `true` | `Boolean` | `true` | Post crafting/salvage results to the Foundry chat log |
| `showSimpleRecipesOnly` | `true` | `Boolean` | `false` | Hide multi-step and check-gated recipes in the crafting app |
| `autoCraft` | `true` | `Boolean` | `false` | Skip the confirmation step before executing a craft |
| `lastCraftingActor` | `false` | `String` | `""` | UUID of the most recently selected crafting actor |
| `lastComponentSources` | `false` | `Array` | `[]` | UUIDs of the most recently selected component source actors |
| `lastManagedCraftingSystem` | `false` | `String` | `""` | ID of the most recently opened crafting system in the admin UI |
| `progressiveResultOrder` | `false` | `Object` | `{}` | Per-system progressive result ordering preferences (keyed by system ID) |
| `favouriteRecipes` | `false` | `Array` | `[]` | UUIDs of recipes pinned by the user |
| `recentlyCrafted` | `false` | `Array` | `[]` | UUIDs of recently crafted recipes |
| `lastGatheringActor` | `false` | `String` | `""` | UUID of the most recently selected gathering actor (specced; runtime pending) |

## `chatOutput` Detail

`chatOutput` is the canonical example of a setting promoted from a per-crafting-system feature flag to a module-level
setting (OQ-3 decision, 2026-03-10).

- **Key:** `fabricate.chatOutput`
- **Scope:** `client`
- **Type:** `Boolean`
- **Default:** `true`
- **Visible in Foundry settings UI:** yes (`config: true`)
- **Meaning:** when `true`, successful and failed crafting/salvage attempts post a result summary to the Foundry chat log.

At the time of writing, `chatOutput` is also still present as `CraftingSystem.features.chatOutput` in the runtime for
backwards compatibility. That feature flag is a **transitional alias** only — new code must read from
`getSetting(SETTING_KEYS.CHAT_OUTPUT)`, not from the system features object.

## Pattern for Adding New Module Settings

1. Add a constant to `SETTING_KEYS` in `src/config/settings.js`:

   ```js
   MY_NEW_SETTING: 'myNewSetting',
   ```

2. Add a definition to `BASE_DEFINITIONS` in the same file:

   ```js
   [SETTING_KEYS.MY_NEW_SETTING]: {
     name: 'FABRICATE.Settings.MyNewSetting.Name',   // i18n key
     hint: 'FABRICATE.Settings.MyNewSetting.Hint',   // i18n key (optional but recommended for config:true)
     scope: 'client',   // or 'world'
     config: true,      // true = visible in Foundry settings menu; false = internal only
     type: Boolean,     // String | Number | Boolean | Array | Object
     default: false,
   },
   ```

3. Add the corresponding i18n keys to `lang/en.json` under `FABRICATE.Settings.MyNewSetting`.

4. Read via `getSetting(SETTING_KEYS.MY_NEW_SETTING)`, write via `setSetting(SETTING_KEYS.MY_NEW_SETTING, value)`.

5. Update this spec with the new setting in the appropriate table above.

6. If the setting originates from a crafting-system feature flag, mark the old flag as a transitional alias in the
   runtime and open a follow-up issue to remove it.

## What Must Not Live Here

- Per-crafting-system configuration (resolution mode, features, check config) → belongs in `CraftingSystem`.
- Per-actor state (crafting runs, learned recipes, discovery progress) → belongs in `Actor.flags.fabricate`.
- Per-recipe configuration → belongs in `Recipe`.
